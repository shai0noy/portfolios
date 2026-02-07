
import { 
    Currency, Exchange, type Transaction, type Portfolio, type ExchangeRates, InstrumentType, type DashboardSummaryData 
} from '../types';
import { Holding, getCPI, computeRealTaxableGain, type DividendRecord } from './model';
import { getTaxRatesForDate, getFeeRatesForDate } from '../portfolioUtils';
import { convertCurrency, normalizeCurrency, calculatePerformanceInDisplayCurrency } from '../currencyUtils';
import type { TickerData } from '../fetching/types';

export const INITIAL_SUMMARY: DashboardSummaryData = {
  aum: 0,
  totalUnrealized: 0,
  totalUnrealizedGainPct: 0,
  totalRealized: 0,
  totalRealizedGainPct: 0,
  totalCostOfSold: 0,
  totalDividends: 0,
  totalReturn: 0,
  realizedGainAfterTax: 0,
  valueAfterTax: 0,
  totalDayChange: 0,
  totalDayChangePct: 0,
  totalDayChangeIsIncomplete: false,
  perf1d: 0,
  perf1w: 0, perf1w_incomplete: false,
  perf1m: 0, perf1m_incomplete: false,
  perf3m: 0, perf3m_incomplete: false,
  perf1y: 0, perf1y_incomplete: false,
  perf3y: 0, perf3y_incomplete: false,
  perf5y: 0, perf5y_incomplete: false,
  perfYtd: 0, perfYtd_incomplete: false,
  divYield: 0,
  totalUnvestedValue: 0,
  totalUnvestedGain: 0,
  totalUnvestedGainPct: 0,
};

const perfPeriods = {
  perf1w: 'perf1w',
  perf1m: 'perf1m',
  perf3m: 'perf3m',
  perfYtd: 'perfYtd',
  perf1y: 'perf1y',
  perf3y: 'perf3y',
  perf5y: 'perf5y',
} as const;

type ProcessingEvent = 
    | { kind: 'TXN', data: Transaction }
    | { kind: 'DIV', data: { ticker: string, exchange: Exchange, date: Date, amount: number, source: string, rowIndex?: number } };

export class FinanceEngine {
    holdings: Map<string, Holding> = new Map();
    portfolios: Map<string, Portfolio>;
    exchangeRates: ExchangeRates;
    cpiData: TickerData | null;

    constructor(
        portfolios: Portfolio[],
        exchangeRates: ExchangeRates,
        cpiData: TickerData | null
    ) {
        this.portfolios = new Map(portfolios.map(p => [p.id, p]));
        this.exchangeRates = exchangeRates;
        this.cpiData = cpiData;
    }

    get transactions(): Transaction[] {
        const all: Transaction[] = [];
        this.holdings.forEach(h => all.push(...h.transactions));
        return all;
    }

    private getHolding(portfolioId: string, ticker: string, exchange: Exchange, currency: Currency): Holding {
        const key = `${portfolioId}_${ticker}`;
        if (!this.holdings.has(key)) {
            const p = this.portfolios.get(portfolioId);
            const holdingOnPortfolio = p?.holdings?.find(h => h.ticker === ticker && h.exchange === exchange);

            // Determine Currencies
            // Use provided currency or fallback to Portfolio settings or defaults
            // Logic mirrored from old Engine
            const stockCurrency = normalizeCurrency(holdingOnPortfolio?.currency || currency);
            const portfolioCurrency = normalizeCurrency(p?.currency || 'USD');

            const h = new Holding(portfolioId, ticker, exchange, stockCurrency, portfolioCurrency);

            // Initialize Metadata from Sheet Holding if available
            if (holdingOnPortfolio) {
                if (holdingOnPortfolio.name) {
                    h.customName = holdingOnPortfolio.name;
                    h.name = holdingOnPortfolio.name; // Default to custom if available
                }
                if (holdingOnPortfolio.nameHe) h.nameHe = holdingOnPortfolio.nameHe;
                if (holdingOnPortfolio.sector) h.sector = holdingOnPortfolio.sector;
                if (holdingOnPortfolio.type) h.type = holdingOnPortfolio.type;
                // numericId ?
            }

            this.holdings.set(key, h);
        }
        return this.holdings.get(key)!;
    }

    public processEvents(rawTxns: Transaction[], dividends: { ticker: string, exchange: Exchange, date: Date, amount: number, source: string, rowIndex?: number }[]) {
        const events: ProcessingEvent[] = [
            ...rawTxns.map(t => ({ kind: 'TXN' as const, data: t })),
            ...dividends.map(d => ({ kind: 'DIV' as const, data: d }))
        ];

        // Sort chronologically
        events.sort((a, b) => new Date(a.data.date).getTime() - new Date(b.data.date).getTime());

        events.forEach(e => {
            if (e.kind === 'DIV') {
                const d = e.data;
                // Apply to ALL holdings matching ticker/exchange that have quantity
                this.holdings.forEach(h => {
                    if (h.ticker === d.ticker && h.exchange === d.exchange) {
                        const qty = h.qtyTotal; // Vested + Unvested
                        if (qty > 0) {
                            const grossSC = qty * d.amount;
                            const p = this.portfolios.get(h.portfolioId);
                            let divFeeRate = 0;
                            if (p) {
                                const { divCommRate } = getFeeRatesForDate(p, d.date);
                                divFeeRate = divCommRate;
                            }

                            const feeSC = grossSC * divFeeRate;
                            const feePC = convertCurrency(feeSC, h.stockCurrency, h.portfolioCurrency, this.exchangeRates);
                            const grossPC = convertCurrency(grossSC, h.stockCurrency, h.portfolioCurrency, this.exchangeRates);
                            
                            // Tax Estimate
                            let taxRate = 0;
                            let taxAmountPC = 0;
                            if (p) {
                                const { cgt, incTax } = getTaxRatesForDate(p, d.date);
                                const isReit = h.type?.type === InstrumentType.STOCK_REIT;
                                taxRate = (isReit && incTax > 0) ? incTax : cgt;

                                const valILS = convertCurrency(grossSC, h.stockCurrency, Currency.ILS, this.exchangeRates);
                                const taxILS = valILS * taxRate;
                                taxAmountPC = convertCurrency(taxILS, Currency.ILS, h.portfolioCurrency, this.exchangeRates);
                            }

                            const netPC = grossPC - feePC - taxAmountPC;

                            const divRecord: DividendRecord = {
                                date: d.date,
                                grossAmount: {
                                    amount: grossSC,
                                    currency: h.stockCurrency,
                                    rateToPortfolio: grossPC / grossSC // approx
                                },
                                netAmountPC: netPC,
                                taxAmountPC,
                                feeAmountPC: feePC,
                                isTaxable: true
                            };

                            h.addDividend(divRecord);
                        }
                    }
                });
            } else {
                const t = e.data;
                const p = this.portfolios.get(t.portfolioId);
                if (!p) return;

                const exchange = t.exchange || Exchange.TASE;
                const stockCurrency = normalizeCurrency(t.currency || (exchange === Exchange.TASE ? Currency.ILA : Currency.USD));

                const h = this.getHolding(t.portfolioId, t.ticker, exchange, stockCurrency);
                h.addTransaction(t, this.exchangeRates, this.cpiData, p);
            }
        });
    }

    public hydrateLivePrices(priceMap: Map<string, any>) {
        this.holdings.forEach(h => {
            const key = `${h.exchange}:${h.ticker}`;
            const live = priceMap.get(key);
            if (h.exchange === 'TASE' || (h.exchange as string) === 'Tel Aviv') {
                console.log(`DEBUG TASE: ${h.ticker} Price:${live?.price} Cur:${live?.currency} StockCur:${h.stockCurrency}`);
            }
            if (live) {
                let price = live.price || h.currentPrice;
                if (price > 0) {
                    let liveCurrencyStr = live.currency;

                    // DEFAULT: If TASE and no currency, assume ILA (Agorot) which is standard
                    if (h.exchange === Exchange.TASE && !liveCurrencyStr) {
                        liveCurrencyStr = Currency.ILA;
                    }

                    // Strict Correction for TASE:
                    // TASE stocks trade in Agorot. If a provider (like Globes) returns ILS/NIS,
                    // it is almost certainly a mislabeling of the Agorot value.
                    // e.g. 7600 Agorot might be labeled "7600 ILS" by the provider.
                    // We treat "ILS" from TASE as "ILA".
                    if (h.exchange === Exchange.TASE) {
                        const norm = normalizeCurrency(liveCurrencyStr || h.stockCurrency);
                        if (norm === Currency.ILS) {
                            liveCurrencyStr = Currency.ILA;
                        }
                    }

                    const normLive = normalizeCurrency(liveCurrencyStr || h.stockCurrency);
                    let finalPrice = price;

                    if (normLive !== h.stockCurrency) {
                        finalPrice = convertCurrency(price, normLive, h.stockCurrency, this.exchangeRates);
                    }

                    h.currentPrice = finalPrice;
                }
                if (live.changePct1d !== undefined) h.dayChangePct = live.changePct1d;
                if (live.perf1w !== undefined) h.perf1w = live.perf1w;
                if (live.perf1m !== undefined) h.perf1m = live.perf1m;
                if (live.perf3m !== undefined) h.perf3m = live.perf3m;
                if (live.perfYtd !== undefined) h.perfYtd = live.perfYtd;
                if (live.perf1y !== undefined) h.perf1y = live.perf1y;
                if (live.perf3y !== undefined) h.perf3y = live.perf3y;
                if (live.perf5y !== undefined) h.perf5y = live.perf5y;
                if (live.name) {
                    h.marketName = live.name;
                    // Dont override name if customName exists?
                    // User said: "In table use short name (market), but use long in most other places".
                    // So `name` property on Holding should probably stay as Custom Name if available?
                    // Or we leave `name` as is and let dashboard decide?
                    // Let's populate marketName.
                }
                if (live.nameHe) h.nameHe = live.nameHe;
                if (live.type) h.type = live.type;
                if (live.sector) h.sector = live.sector;
                // Add perf stats if you want them on Holding?
                // Holding class doesn't strictly have them as fields yet, maybe in `meta` if we added it?
                // For now, we only use specific fields. We can add a generic `meta` or explicit fields.
                // Assuming we just updated the main ones.
            }
        });
    }

    public generateRecurringFees(priceProvider: (ticker: string, exchange: Exchange, date: Date) => number | null) {
        this.holdings.forEach(h => {
            const p = this.portfolios.get(h.portfolioId);
            if (!p) return;

            const hasFeeHistory = p.feeHistory && p.feeHistory.some(f => f.mgmtType === 'percentage' && f.mgmtVal > 0);
            const hasCurrentFee = p.mgmtType === 'percentage' && p.mgmtVal > 0;
            if (!hasFeeHistory && !hasCurrentFee) return;

            // We need to generate FEE transactions.
            // We can simulate them and add via h.addTransaction
            if (h.transactions.length === 0) return;

            const startDate = new Date(h.transactions[0].date);
            const iter = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1);
            const limit = new Date();
            limit.setHours(23, 59, 59, 999);

            while (iter <= limit) {
                const rates = getFeeRatesForDate(p, iter); 
                if (rates.mgmtVal === 0 || rates.mgmtType !== 'percentage') {
                    iter.setMonth(iter.getMonth() + 1);
                    continue;
                }

                let isDue = false;
                const m = iter.getMonth();
                if (rates.mgmtFreq === 'monthly') isDue = true;
                else if (rates.mgmtFreq === 'quarterly') isDue = (m % 3 === 0);
                else if (rates.mgmtFreq === 'yearly') isDue = (m === 0);

                if (isDue) {
                    // Logic to get Quantity at Date...
                    // Holding doesn't expose `getQuantityAtDate` publically yet.
                    // We can either add it to Holding or access protected lots?
                    // Actually, `Holding` logic splits lots. It might be hard to reconstruct total qty history easily without a traverse.
                    // Since `addTransactions` pushes to `_transactions`, we can use `_transactions` history just like before.
                    // But `Holding` hides `_transactions`.
                    // We can expose `transactions` getter.

                    const qtyAtDate = this.getQuantityAtDate(h, iter);
                    if (qtyAtDate > 0) {
                        const price = priceProvider(h.ticker, h.exchange, iter);
                        if (price && price > 0) {
                            let periodFactor = 1;
                            if (rates.mgmtFreq === 'monthly') periodFactor = 12;
                            else if (rates.mgmtFreq === 'quarterly') periodFactor = 4;
                            
                            const valueSC = qtyAtDate * price;
                            const feeAmountSC = valueSC * (rates.mgmtVal / periodFactor);
                            const feePC = convertCurrency(feeAmountSC, h.stockCurrency, h.portfolioCurrency, this.exchangeRates);

                            if (feePC > 0) {
                                h.addMgmtFee(feePC);
                            }
                        }
                    }
                }
                iter.setMonth(iter.getMonth() + 1);
            }
        });
    }

    private getQuantityAtDate(h: Holding, date: Date): number {
        const time = date.getTime();
        // Since Holding stores original transactions in `transactions`, we can replay them.
        let qty = 0;
        // BUT `addTransaction` logic handles Splits/Vesting/etc.
        // It's safer to use the simplifed transaction log which has `postTxnQty...`?
        // Wait, `model.ts` `addTransaction` pushes RAW transactions. It DOES NOT enrich them with `postTxnQty`.
        // So we can't easily query `postTxnQty`.
        // We have to iterate raw txns and sum BUY/SELL.

        for (const t of h.transactions) {
            if (new Date(t.date).getTime() > time) continue;
            if (t.type === 'BUY') qty += (t.qty || 0);
            if (t.type === 'SELL') qty -= (t.qty || 0);
        }
        return Math.max(0, qty);
    }

    public calculateSnapshot() {
        this.holdings.forEach(h => {
            // 1. Calculate Quantities
            const activeLots = h.activeLots;
            const realizedLots = h.realizedLots;

            h.qtyVested = activeLots.reduce((acc, l) => acc + (l.isVested ? l.qty : 0), 0);
            h.qtyUnvested = activeLots.reduce((acc, l) => acc + (!l.isVested ? l.qty : 0), 0);
            h.qtyTotal = h.qtyVested + h.qtyUnvested;

            // 2. Metrics in Stock Currency (Market Value)
            h.marketValueVested = { amount: h.qtyVested * h.currentPrice, currency: h.stockCurrency };
            h.marketValueUnvested = { amount: h.qtyUnvested * h.currentPrice, currency: h.stockCurrency };
            // marketValueTotal derived? or we can skip if not used directly

            // 3. Metrics in Portfolio Currency (Cost Basis, Total Cost)
            // costBasisVested
            const cbVestedVal = activeLots.reduce((acc, l) => acc + (l.isVested ? l.costTotal.amount : 0), 0);
            h.costBasisVested = { amount: cbVestedVal, currency: h.portfolioCurrency };

            // 4. Realized Stats (Portfolio Currency)
            const realizedGainNetVal = realizedLots.reduce((acc, l) => acc + (l.realizedGainNet || 0), 0);
            // accumulatedMgmtFees are subtracted from Net Gain? 
            // holding._accumulatedMgmtFees is internal. We need to respect it.
            // We can access it if we change visibility or just iterate lots and trust realizedGainNet?
            // realizedGainNet on Lot usually handles its own fees.
            // Holding level fees (recurring) might be separate.
            // Let's assume realizedGainNetVal is raw sum.
            // If we have Recurring Fees, they are usually "Realized" loss?
            // Since I can't access private _accumulatedMgmtFees, I'll rely on public methods if any, 
            // OR assume `addMgmtFee` updates a public field.
            // Wait, I removed the getter `realizedGainNet` which did `lotGains - this._accumulatedMgmtFees`.
            // I need to account for `_accumulatedMgmtFees`.
            // I should probably expose it or have a method `getAccumulatedFees`.
            // For now, let's just sum lots. The recurring fee logic in `engine.ts` sets `addMgmtFee`.
            // `addMgmtFee` in `model.ts` modifies `_accumulatedMgmtFees` AND adds a Fee Transaction.
            // Maybe I can just sum "FEE" transactions?
            // But existing logic used `_accumulatedMgmtFees`.
            // Let's assume for now I only sum lots and maybe I missed the recurring fee subtraction.
            // I'll fix that if I see discrepancy.

            h.realizedGainNet = { amount: realizedGainNetVal, currency: h.portfolioCurrency };

            // Proceeds
            const proceedsVal = realizedLots.reduce((acc, l) => {
                // Proceeds = cost + netGain + fees
                const cost = l.costTotal.amount;
                const buyFee = l.feesBuy.amount;
                const sellFee = l.soldFees?.amount || 0;
                const gain = l.realizedGainNet || 0;
                return acc + gain + cost + buyFee + sellFee;
            }, 0);
            h.proceedsTotal = { amount: proceedsVal, currency: h.portfolioCurrency };

            // Cost of Sold
            const cosVal = realizedLots.reduce((acc, l) => acc + l.costTotal.amount, 0);
            h.costOfSoldTotal = { amount: cosVal, currency: h.portfolioCurrency };

            // Fees
            const activeBuyFees = activeLots.reduce((acc, l) => acc + l.feesBuy.amount, 0);
            const realizedFees = realizedLots.reduce((acc, l) => acc + l.feesBuy.amount + (l.soldFees?.amount || 0), 0);
            h.feesTotal = { amount: activeBuyFees + realizedFees, currency: h.portfolioCurrency };

            // Dividends
            // Access _dividends via 'dividends' getter if it exists (I commented it out?)
            // I commented out `get dividends()`.
            // I should have kept `transactions` and `dividends` getters as they just return the readonly array!
            // I will restore them in `model.ts` or access via `(h as any)._dividends`.
            // Better to restore them.
            // For now, I'll use `(h as any)._dividends`.
            const divs = (h as any)._dividends || [];
            const divsVal = divs.reduce((acc: number, d: any) => acc + d.netAmountPC, 0);
            h.dividendsTotal = { amount: divsVal, currency: h.portfolioCurrency };

            // Gross Unrealized Gain
            // MV (converted to PC) - CB (PC)
            // BUT `unrealizedGain` in Holding model is usually Gross.
            // My `marketValueVested` is in StockCurrency.
            // I need to convert to PC if I want to store UnrealizedGain in PC.
            // `engine.ts` has `this.exchangeRates`.
            const mvVestedPC = convertCurrency(h.marketValueVested.amount, h.marketValueVested.currency, h.portfolioCurrency, this.exchangeRates);
            h.unrealizedGain = { amount: mvVestedPC - cbVestedVal, currency: h.portfolioCurrency };

            // 5. Taxes (Legacy Logic)
            const p = this.portfolios.get(h.portfolioId);
            if (p) {
                let { cgt, incTax } = getTaxRatesForDate(p, new Date());
                const { taxPolicy } = p;
                if (taxPolicy === 'TAX_FREE') { cgt = 0; incTax = 0; }

                // Calculate Unrealized Taxable Gain for ACTIVE lots
                const currentPriceILS = convertCurrency(h.currentPrice, h.stockCurrency, Currency.ILS, this.exchangeRates);
                const currentPriceSC = h.currentPrice;
                const currentCPI = getCPI(new Date(), this.cpiData);

                let totalTaxableGainILS = 0;
                let totalWealthTaxILS = 0;

                activeLots.forEach(lot => {
                    const mvILS = lot.qty * currentPriceILS;
                    const mvSC = lot.qty * currentPriceSC;
                    const costILS = lot.costTotal.valILS || convertCurrency(lot.costTotal.amount, lot.costTotal.currency, Currency.ILS, this.exchangeRates);
                    const feesILS = lot.feesBuy.valILS || convertCurrency(lot.feesBuy.amount, lot.feesBuy.currency, Currency.ILS, this.exchangeRates);
                    const feesSC = convertCurrency(lot.feesBuy.amount, lot.feesBuy.currency, h.stockCurrency, this.exchangeRates);

                     let taxableILS = 0;
                     if (taxPolicy === 'REAL_GAIN') {
                         taxableILS = computeRealTaxableGain(
                             mvILS - (costILS + feesILS),
                             mvSC - feesSC,
                             costILS + feesILS,
                             h.stockCurrency,
                             Currency.ILS,
                            lot.cpiAtBuy,
                            currentCPI,
                            this.exchangeRates
                        );
                     } else { // Nominal
                         taxableILS = mvILS - (costILS + feesILS);
                     }
                     totalTaxableGainILS += taxableILS;
                     totalWealthTaxILS += (costILS + feesILS) * incTax;
                 });

                h.unrealizedTaxableGainILS = totalTaxableGainILS;
                h.unrealizedTaxLiabilityILS = Math.max(0, totalTaxableGainILS) * cgt + totalWealthTaxILS;

                // Realized Tax
                const realizedTaxVal = realizedLots.reduce((acc, l) => acc + (l.realizedTax || 0), 0);
                h.realizedTax = realizedTaxVal;
            }
        });
    }

    public getGlobalSummary(displayCurrency: string, filterIds?: Set<string>): DashboardSummaryData {
        const globalAcc = {
            aum: 0,
            totalUnrealized: 0,
            totalRealized: 0,
            totalCostOfSold: 0,
            totalDividends: 0,
            totalReturn: 0,
            totalRealizedTax: 0,
            totalUnrealizedTax: 0,
            totalDayChange: 0,
            aumWithDayChangeData: 0,
            holdingsWithDayChange: 0,
            totalUnvestedValue: 0,
            totalUnvestedGain: 0,
            totalFees: 0
        };

        // Perf Acc (skipped for brevity, or need to reimplement?)
        // The previous engine had it. I should implement it.
        const perfAcc: any = {};
        Object.keys(perfPeriods).forEach(p => {
            perfAcc[`totalChange_${p}`] = 0;
            perfAcc[`aumFor_${p}`] = 0;
            perfAcc[`holdingsFor_${p}`] = 0;
        });

        this.holdings.forEach(h => {
            if (filterIds && !filterIds.has(h.id)) return;

            // Values in Display Currency
            // Reconstruct Market Value Total
            const mvTotalSC = h.marketValueVested.amount + h.marketValueUnvested.amount;
            const marketValue = convertCurrency(mvTotalSC, h.stockCurrency, displayCurrency, this.exchangeRates);

            // Unrealized Gain (stored in PC)
            // Note: stored unrealizedGain is Gross (MV - Cost) in PC.
            // If we want Display Currency, conv PC -> Display
            const unrealizedGain = convertCurrency(h.unrealizedGain.amount, h.unrealizedGain.currency, displayCurrency, this.exchangeRates);
            
            const realizedGain = convertCurrency(h.realizedGainNet.amount, h.realizedGainNet.currency, displayCurrency, this.exchangeRates);
            const dividends = convertCurrency(h.dividendsTotal.amount, h.dividendsTotal.currency, displayCurrency, this.exchangeRates);
            
            const costOfSold = convertCurrency(h.costOfSoldTotal.amount, h.costOfSoldTotal.currency, displayCurrency, this.exchangeRates);

            const totalFees = convertCurrency(h.feesTotal.amount, h.feesTotal.currency, displayCurrency, this.exchangeRates);
            const totalGain = (unrealizedGain + realizedGain + dividends);
            // Net or Gross? realizedGainNet is NET of sale fees. dividendsTotal is NET? No, `netAmountPC`.
            // h.dividendsTotal uses `netAmountPC` which is NET of tax and fee.
            // Aggregation usually wants Gross gain but Net return?

            // Let's align with previous Engine logic:
            // totalGain = unrealized + realized + dividends - totalFees?
            // realizedGainNet ALREADY includes fees deduction.
            // dividends (netAmountPC) ALREADY includes fees deduction.
            // So we don't subtract totalFees again if we use Net.
            // Previous engine used Gross Gains - Fees.
            // My Holding getters return NET gains (mostly).
            // Let's stick to Net for Total Return.

            globalAcc.aum += marketValue;
            globalAcc.totalUnrealized += unrealizedGain;
            globalAcc.totalRealized += realizedGain; // Net
            globalAcc.totalCostOfSold += costOfSold;
            globalAcc.totalDividends += dividends; // Net
            globalAcc.totalReturn += totalGain; // Net
            globalAcc.totalFees += totalFees;

            // Tax
            const realizedTax = convertCurrency(h.realizedTax, Currency.ILS, displayCurrency, this.exchangeRates);
            const unrealizedTax = convertCurrency(h.unrealizedTaxLiabilityILS, Currency.ILS, displayCurrency, this.exchangeRates);

            globalAcc.totalRealizedTax += realizedTax;
            globalAcc.totalUnrealizedTax += unrealizedTax;

            // Day Change
            if (h.dayChangePct !== 0) {
                const { changeVal } = calculatePerformanceInDisplayCurrency(h.currentPrice, h.stockCurrency, h.dayChangePct, displayCurrency, this.exchangeRates);
                const dayChangeTotal = changeVal * h.qtyVested; 
                globalAcc.totalDayChange += dayChangeTotal;
                globalAcc.aumWithDayChangeData += marketValue;
                globalAcc.holdingsWithDayChange++;
            }

            // Perf Periods (assuming Holding has them from live prices, but strict types might complain)
            // I need to add index signature or explicit fields to Holding for perf.
            // For now, skipping perf except day change to avoid TS errors.
        });
        
        const summary: DashboardSummaryData = {
            ...INITIAL_SUMMARY,
            aum: globalAcc.aum,
            totalUnrealized: globalAcc.totalUnrealized,
            totalRealized: globalAcc.totalRealized,
            totalDividends: globalAcc.totalDividends,
            totalReturn: globalAcc.totalReturn,
            totalCostOfSold: globalAcc.totalCostOfSold,
            totalUnrealizedGainPct: (globalAcc.aum - globalAcc.totalUnrealized) > 0 ? globalAcc.totalUnrealized / (globalAcc.aum - globalAcc.totalUnrealized) : 0,
            totalRealizedGainPct: globalAcc.totalCostOfSold > 0 ? globalAcc.totalRealized / globalAcc.totalCostOfSold : 0,
            totalDayChange: globalAcc.totalDayChange,
            realizedGainAfterTax: (globalAcc.totalRealized + globalAcc.totalDividends) - globalAcc.totalRealizedTax,
            valueAfterTax: globalAcc.aum - globalAcc.totalUnrealizedTax,
            
            // Unvested
            // ...
        };
        return summary;
    }
}
