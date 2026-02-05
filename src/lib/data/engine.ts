import { 
    Currency, Exchange, type Transaction, type Portfolio, type ExchangeRates, InstrumentType, type DashboardSummaryData 
} from '../types';
import type { UnifiedHolding, EnrichedTransaction, DividendEvent } from './model';
import { getTaxRatesForDate, getFeeRatesForDate } from '../portfolioUtils';
import { convertCurrency, toILS, normalizeCurrency, calculatePerformanceInDisplayCurrency } from '../currency';
import type { TickerData } from '../fetching/types';

// Helper to interpolate CPI (Ported from dashboard.ts)
export const getCPI = (date: Date, cpiData: TickerData | null) => {
    if (!cpiData?.historical || cpiData.historical.length === 0) return 100;
    const timestamp = date.getTime();
    const history = cpiData.historical; 
    
    if (timestamp >= history[0].date.getTime()) return history[0].price;

    for (let i = 0; i < history.length - 1; i++) {
        const h1 = history[i]; 
        const h2 = history[i+1]; 
        if (timestamp <= h1.date.getTime() && timestamp >= h2.date.getTime()) {
            const t1 = h1.date.getTime();
            const t2 = h2.date.getTime();
            const ratio = (t1 === t2) ? 0 : (timestamp - t2) / (t1 - t2);
            return h2.price + (h1.price - h2.price) * ratio;
        }
    }
    return history[history.length - 1].price;
};

// Helper to compute Real Taxable Gain (Ported from dashboard.ts)
export function computeRealTaxableGain(
    nominalGainPC: number,
    gainSC: number,
    costBasisPC: number,
    stockCurrency: Currency,
    portfolioCurrency: Currency,
    cpiStart: number,
    cpiEnd: number,
    exchangeRates: ExchangeRates
): number {
    let taxableGain = nominalGainPC;

    if (portfolioCurrency === Currency.ILS && stockCurrency === Currency.ILS) {
        const inflationRate = (cpiStart > 0) ? (cpiEnd / cpiStart) - 1 : 0;
        const inflationAdj = Math.max(0, costBasisPC * inflationRate);
        taxableGain -= inflationAdj;
    } else if (portfolioCurrency !== stockCurrency) {
        const realGainPC = convertCurrency(gainSC, stockCurrency, portfolioCurrency, exchangeRates);
        taxableGain = Math.min(taxableGain, realGainPC);
    }
    return taxableGain;
}

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
    | { kind: 'DIV', data: DividendEvent };

export class FinanceEngine {
    holdings: Map<string, UnifiedHolding> = new Map();
    transactions: EnrichedTransaction[] = [];
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

    private getHolding(portfolioId: string, ticker: string, exchange: Exchange, currency: Currency): UnifiedHolding {
        const key = `${portfolioId}_${ticker}`;
        if (!this.holdings.has(key)) {
            const p = this.portfolios.get(portfolioId);
            const holdingOnPortfolio = p?.holdings?.find(h => h.ticker === ticker && h.exchange === exchange);
            this.holdings.set(key, {
                id: key,
                key: key,
                portfolioId,
                ticker,
                exchange,
                stockCurrency: normalizeCurrency(holdingOnPortfolio?.currency || currency),
                portfolioCurrency: normalizeCurrency(p?.currency || 'USD'),
                currentPrice: holdingOnPortfolio?.price || 0,
                dayChangePct: holdingOnPortfolio?.changePct1d || 0,
                displayName: holdingOnPortfolio?.name || ticker,
                sector: holdingOnPortfolio?.sector || '',
                type: holdingOnPortfolio?.type?.type,
                qtyVested: 0,
                qtyUnvested: 0,
                totalQty: 0,
                costBasisPortfolioCurrency: 0,
                costBasisVestedPortfolioCurrency: 0,
                costBasisStockCurrency: 0,
                costBasisILS: 0,
                costBasisUSD: 0,
                proceedsPortfolioCurrency: 0,
                costOfSoldPortfolioCurrency: 0,
                realizedGainPortfolioCurrency: 0,
                realizedTaxableGain: 0,
                dividendsPortfolioCurrency: 0,
                dividendsStockCurrency: 0,
                dividendsILS: 0,
                dividendsUSD: 0,
                totalFeesPortfolioCurrency: 0,
                feesBuyPortfolioCurrency: 0,
                feesSellPortfolioCurrency: 0,
                feesDivPortfolioCurrency: 0,
                feesMgmtPortfolioCurrency: 0,
                totalSharesAcquired: 0,
                unallocatedBuyFeesPC: 0,
                realizedTaxLiabilityILS: 0,
                unrealizedTaxableGainILS: 0,
                unrealizedTaxLiabilityILS: 0,
                weightedAvgCPI: 0,
                marketValueVested: 0,
                marketValueUnvested: 0,
                unrealizedGainVested: 0,
                avgCost: 0,
                returnPct: 0,
                perf1w: holdingOnPortfolio?.changePctRecent || 0,
                perf1m: holdingOnPortfolio?.changePct1m || 0,
                perf3m: holdingOnPortfolio?.changePct3m || 0,
                perfYtd: holdingOnPortfolio?.changePctYtd || 0,
                perf1y: holdingOnPortfolio?.changePct1y || 0,
                perf3y: holdingOnPortfolio?.changePct3y || 0,
                perf5y: holdingOnPortfolio?.changePct5y || 0,
                transactions: [], dividends: [], recurringFees: []
            });
        }
        return this.holdings.get(key)!;
    }

    public processEvents(rawTxns: Transaction[], dividends: DividendEvent[]) {
        this.transactions = [];
        const events: ProcessingEvent[] = [
            ...rawTxns.map(t => ({ kind: 'TXN' as const, data: t })),
            ...dividends.map(d => ({ kind: 'DIV' as const, data: d }))
        ];

        // Sort chronologically
        events.sort((a, b) => new Date(a.data.date).getTime() - new Date(b.data.date).getTime());

        events.forEach(e => {
            if (e.kind === 'DIV') {
                const d = e.data;
                // Apply to ALL holdings matching ticker/exchange
                this.holdings.forEach(h => {
                    if (h.ticker === d.ticker && h.exchange === d.exchange) {
                        const qty = h.qtyVested + h.qtyUnvested;
                        if (qty > 0) {
                            const totalAmountSC = qty * d.amount;
                            
                            // Get Fee Rate (Historical)
                            const p = this.portfolios.get(h.portfolioId);
                            let divFeeRate = 0;
                            if (p) {
                                const { divCommRate } = getFeeRatesForDate(p, d.date);
                                divFeeRate = divCommRate;
                            }

                            const feeSC = totalAmountSC * divFeeRate;
                            const feePC = convertCurrency(feeSC, h.stockCurrency, h.portfolioCurrency, this.exchangeRates);
                            
                            if (feePC > 0) {
                                h.totalFeesPortfolioCurrency += feePC;
                                h.feesDivPortfolioCurrency += feePC;
                            }

                            const amountPC = convertCurrency(totalAmountSC, h.stockCurrency, h.portfolioCurrency, this.exchangeRates);
                            h.dividendsPortfolioCurrency += amountPC;
                            h.dividendsStockCurrency += totalAmountSC;
                            h.dividendsILS += convertCurrency(totalAmountSC, h.stockCurrency, Currency.ILS, this.exchangeRates);
                            h.dividendsUSD += convertCurrency(totalAmountSC, h.stockCurrency, Currency.USD, this.exchangeRates);

                            // Calculate Tax (Estimated) for Enrichment
                            let taxRate = 0;
                            let taxAmountPC = 0;
                            if (p) {
                                const { cgt, incTax } = getTaxRatesForDate(p, d.date);
                                const isReit = h.type === InstrumentType.STOCK_REIT;
                                taxRate = (isReit && incTax > 0) ? incTax : cgt;
                                const thisDivILS = convertCurrency(totalAmountSC, h.stockCurrency, Currency.ILS, this.exchangeRates);
                                const thisDivTaxILS = thisDivILS * taxRate;
                                taxAmountPC = convertCurrency(thisDivTaxILS, Currency.ILS, h.portfolioCurrency, this.exchangeRates);
                            }

                            h.dividends.push({
                                ...d,
                                source: 'MANUAL', // Default or derived
                                grossAmountSC: totalAmountSC,
                                grossAmountPC: amountPC,
                                feeRate: divFeeRate,
                                feeAmountPC: feePC,
                                taxRate,
                                taxAmountPC,
                                netAmountPC: amountPC - feePC - taxAmountPC,
                                currency: h.portfolioCurrency
                            } as any);
                        }
                    }
                });
                return;
            }

            const t = e.data as Transaction;
            const p = this.portfolios.get(t.portfolioId);
            if (!p) {
                console.warn(`Portfolio ${t.portfolioId} not found for txn ${t.date} ${t.ticker}`);
                return;
            }

            const isBuy = t.type === 'BUY';
            const isSell = t.type === 'SELL';
            const isFee = t.type === 'FEE';

            // Resolve Currency
            const exchange = t.exchange || Exchange.TASE; 
            const stockCurrency = normalizeCurrency(t.currency || (exchange === Exchange.TASE ? Currency.ILA : Currency.USD));
            
            const h = this.getHolding(t.portfolioId, t.ticker, exchange, stockCurrency);
            
            const isVested = !t.vestDate || new Date(t.vestDate) <= new Date();
            const tQty = t.qty || 0;
            
            // Prices
            const priceInUSD = t.originalPriceUSD || 0;
            const priceInAgorot = t.originalPriceILA || 0;
            const priceInILS = toILS(priceInAgorot, Currency.ILA);
            
            const originalPricePC = (h.portfolioCurrency === Currency.ILS) ? priceInILS : convertCurrency(priceInUSD, Currency.USD, h.portfolioCurrency, this.exchangeRates);
            const txnValuePC = tQty * originalPricePC;
            
            let effectivePriceSC = t.price || 0;
            if (h.stockCurrency === Currency.ILA) effectivePriceSC = priceInAgorot;
            else if (h.stockCurrency === Currency.ILS) effectivePriceSC = priceInILS;
            else if (h.stockCurrency === Currency.USD) effectivePriceSC = priceInUSD;
            const txnValueSC = tQty * effectivePriceSC;

            const currentCPI = getCPI(new Date(t.date), this.cpiData);

            let feePC = 0;
            let realizedTaxableGainILS = 0;
            let realizedGainILS = 0;
            let realizedGainPC = 0;
            let realizedGainSC = 0;
            let taxLiabilityILS = 0;
            let allocatedBuyFeePC = 0;

            if (isBuy) {
                if (t.commission && t.commission > 0) {
                    const commVal = (h.stockCurrency === Currency.ILA) ? t.commission / 100 : t.commission;
                    feePC = convertCurrency(commVal, h.stockCurrency === Currency.ILA ? Currency.ILS : h.stockCurrency, h.portfolioCurrency, this.exchangeRates);
                    h.totalFeesPortfolioCurrency += feePC;
                    h.feesBuyPortfolioCurrency += feePC;
                    h.unallocatedBuyFeesPC += feePC;
                }

                if (h.weightedAvgCPI === 0) h.weightedAvgCPI = currentCPI;
                else h.weightedAvgCPI = ((h.qtyVested + h.qtyUnvested) * h.weightedAvgCPI + tQty * currentCPI) / (h.qtyVested + h.qtyUnvested + tQty);

                if (isVested) h.qtyVested += tQty; else h.qtyUnvested += tQty;
                h.totalQty = h.qtyVested + h.qtyUnvested;
                h.totalSharesAcquired += tQty;

                h.costBasisPortfolioCurrency += txnValuePC;
                h.costBasisStockCurrency += txnValueSC;
                h.costBasisUSD += tQty * priceInUSD;
                h.costBasisILS += tQty * priceInILS;

            } else if (isSell) {
                const totalQty = h.qtyVested + h.qtyUnvested;
                const avgCostPC = totalQty > 0 ? h.costBasisPortfolioCurrency / totalQty : 0;
                const costOfSoldPC = avgCostPC * tQty;
                const avgCostILS = totalQty > 0 ? h.costBasisILS / totalQty : 0;
                const currentCostOfSoldILS = avgCostILS * tQty;
                
                const avgBuyFee = totalQty > 0 ? h.unallocatedBuyFeesPC / totalQty : 0;
                allocatedBuyFeePC = avgBuyFee * tQty;
                h.unallocatedBuyFeesPC -= allocatedBuyFeePC;
                if (h.unallocatedBuyFeesPC < 0.001) h.unallocatedBuyFeesPC = 0;
                
                const curPriceILS = convertCurrency(t.price || 0, t.currency || h.stockCurrency, Currency.ILS, this.exchangeRates);

                if (t.commission && t.commission > 0) {
                    const commVal = (h.stockCurrency === Currency.ILA) ? t.commission / 100 : t.commission;
                    feePC = convertCurrency(commVal, h.stockCurrency === Currency.ILA ? Currency.ILS : h.stockCurrency, h.portfolioCurrency, this.exchangeRates);
                    h.totalFeesPortfolioCurrency += feePC;
                    h.feesSellPortfolioCurrency += feePC;
                }

                h.costOfSoldPortfolioCurrency += costOfSoldPC;
                h.proceedsPortfolioCurrency += txnValuePC;
                h.costBasisPortfolioCurrency -= costOfSoldPC;

                const baseCPI = h.weightedAvgCPI || currentCPI;
                const avgCostSC = totalQty > 0 ? h.costBasisStockCurrency / totalQty : 0;
                const costOfSoldSC = avgCostSC * tQty;
                
                realizedGainSC = txnValueSC - costOfSoldSC; 

                // Taxable Gain Logic (Net of Fees)
                const sellFeePC = feePC;
                const sellFeeILS = convertCurrency(sellFeePC, h.portfolioCurrency, Currency.ILS, this.exchangeRates);
                const allocatedBuyFeeILS = convertCurrency(allocatedBuyFeePC, h.portfolioCurrency, Currency.ILS, this.exchangeRates);
                
                const sellFeeSC = convertCurrency(sellFeePC, h.portfolioCurrency, h.stockCurrency, this.exchangeRates);
                const allocatedBuyFeeSC = convertCurrency(allocatedBuyFeePC, h.portfolioCurrency, h.stockCurrency, this.exchangeRates);
                const netGainSC = realizedGainSC - sellFeeSC - allocatedBuyFeeSC;

                h.realizedTaxableGain += computeRealTaxableGain(
                    (txnValuePC - sellFeePC) - (costOfSoldPC + allocatedBuyFeePC),
                    netGainSC,
                    costOfSoldPC + allocatedBuyFeePC,
                    h.stockCurrency,
                    h.portfolioCurrency,
                    baseCPI,
                    currentCPI,
                    this.exchangeRates
                );

                realizedTaxableGainILS = computeRealTaxableGain(
                    ((tQty * curPriceILS) - sellFeeILS) - (currentCostOfSoldILS + allocatedBuyFeeILS),
                    netGainSC,
                    currentCostOfSoldILS + allocatedBuyFeeILS,
                    h.stockCurrency,
                    Currency.ILS,
                    baseCPI,
                    currentCPI,
                    this.exchangeRates
                );
                
                realizedGainILS = (tQty * curPriceILS) - currentCostOfSoldILS;
                realizedGainPC = txnValuePC - costOfSoldPC;

                const { cgt: historicalCgt } = getTaxRatesForDate(p, t.date);
                taxLiabilityILS = realizedTaxableGainILS * historicalCgt;
                h.realizedTaxLiabilityILS += taxLiabilityILS;

                h.costBasisStockCurrency -= (totalQty > 0 ? h.costBasisStockCurrency / totalQty : 0) * tQty;
                h.costBasisUSD -= (totalQty > 0 ? h.costBasisUSD / totalQty : 0) * tQty;
                h.costBasisILS -= currentCostOfSoldILS;

                let q = tQty;
                if (isVested) { const canSell = Math.min(q, h.qtyVested); h.qtyVested -= canSell; q -= canSell; }
                if (q > 0) h.qtyUnvested -= q;
                h.totalQty = h.qtyVested + h.qtyUnvested;

                if (h.totalQty < 1e-9) {
                    h.totalQty = 0; h.qtyVested = 0; h.qtyUnvested = 0;
                    if (Math.abs(h.costBasisPortfolioCurrency) < 0.01) h.costBasisPortfolioCurrency = 0;
                    h.unallocatedBuyFeesPC = 0;
                }
            } else if (isFee) {
                feePC = convertCurrency((h.stockCurrency === Currency.ILA ? t.price! / 100 : t.price!) * (t.qty || 1), h.stockCurrency === Currency.ILA ? Currency.ILS : h.stockCurrency, h.portfolioCurrency, this.exchangeRates);
                h.totalFeesPortfolioCurrency += feePC;
                h.feesMgmtPortfolioCurrency += feePC;
            }

            const enriched: EnrichedTransaction = {
                ...t,
                exchange, // Ensure override
                effectivePriceSC,
                txnValuePC,
                txnValueSC,
                feePC,
                feeSC: 0, 
                taxLiabilityILS,
                realizedGainILS,
                realizedGainPC,
                realizedGainSC,
                netGainPC: realizedGainPC - feePC - allocatedBuyFeePC,
                allocatedBuyFeePC,
                realizedTaxableGainILS,
                postTxnQtyVested: h.qtyVested,
                postTxnQtyUnvested: h.qtyUnvested,
                postTxnCostBasisPC: h.costBasisPortfolioCurrency
            };
            this.transactions.push(enriched);
            h.transactions.push(enriched);
        });
    }

    public hydrateLivePrices(priceMap: Map<string, any>) {
        this.holdings.forEach(h => {
            const key = `${h.exchange}:${h.ticker}`;
            const live = priceMap.get(key);
            if (!live) {
                console.warn(`Engine: No live price for ${key}`);
            }
            if (live) {
                h.currentPrice = live.price || h.currentPrice;
                if (live.changePct1d !== undefined) h.dayChangePct = live.changePct1d;
                if (live.name) h.displayName = live.name;
                if (live.type) h.type = live.type;
                if (live.sector) h.sector = live.sector;
                if (live.changePctRecent) h.perf1w = live.changePctRecent;
                if (live.changePct1m) h.perf1m = live.changePct1m;
                if (live.changePct3m) h.perf3m = live.changePct3m;
                if (live.changePctYtd) h.perfYtd = live.changePctYtd;
                if (live.changePct1y) h.perf1y = live.changePct1y;
                if (live.changePct3y) h.perf3y = live.changePct3y;
                if (live.changePct5y) h.perf5y = live.changePct5y;
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

            if (h.transactions.length === 0) return;
            
            const startDate = new Date(h.transactions[0].date);
            const iter = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1);
            const limit = new Date();
            limit.setHours(23, 59, 59, 999);

            while (iter <= limit) {
                const dateKey = iter.toISOString().split('T')[0];
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
                    const qty = this.getQuantityAtDate(h, iter);
                    if (qty > 0) {
                        const price = priceProvider(h.ticker, h.exchange, iter);
                        if (price && price > 0) {
                            let periodFactor = 1;
                            if (rates.mgmtFreq === 'monthly') periodFactor = 12;
                            else if (rates.mgmtFreq === 'quarterly') periodFactor = 4;
                            
                            const valueSC = qty * price;
                            const feeAmountSC = valueSC * (rates.mgmtVal / periodFactor);

                            if (feeAmountSC > 0) {
                                const feePC = convertCurrency(feeAmountSC, h.stockCurrency, h.portfolioCurrency, this.exchangeRates);
                                
                                h.totalFeesPortfolioCurrency += feePC;
                                h.feesMgmtPortfolioCurrency += feePC;
                                h.recurringFees.push({
                                    date: dateKey,
                                    type: 'MANAGEMENT',
                                    amountPC: feePC,
                                    currency: h.portfolioCurrency,
                                    calculationBasePC: convertCurrency(valueSC, h.stockCurrency, h.portfolioCurrency, this.exchangeRates),
                                    rate: rates.mgmtVal
                                });
                            }
                        }
                    }
                }
                
                iter.setMonth(iter.getMonth() + 1);
            }
        });
    }

    private getQuantityAtDate(h: UnifiedHolding, date: Date): number {
        const time = date.getTime();
        for (let i = h.transactions.length - 1; i >= 0; i--) {
            const t = h.transactions[i];
            if (new Date(t.date).getTime() <= time) {
                return t.postTxnQtyVested + t.postTxnQtyUnvested;
            }
        }
        return 0;
    }

    public calculateSnapshot() {
        const currentCPI = getCPI(new Date(), this.cpiData);

        this.holdings.forEach(h => {
            const currentPricePC = convertCurrency(h.currentPrice, h.stockCurrency, h.portfolioCurrency, this.exchangeRates);
            h.marketValueVested = h.qtyVested * currentPricePC;
            h.marketValueUnvested = h.qtyUnvested * currentPricePC;
            
            const avgCost = h.totalQty > 0 ? h.costBasisPortfolioCurrency / h.totalQty : 0;
            h.avgCost = avgCost;
            const costBasisVested = avgCost * h.qtyVested;
            h.costBasisVestedPortfolioCurrency = costBasisVested;
            
            h.unrealizedGainVested = h.marketValueVested - costBasisVested;
            h.realizedGainPortfolioCurrency = h.proceedsPortfolioCurrency - h.costOfSoldPortfolioCurrency;

            // ... Tax calcs ...
            const p = this.portfolios.get(h.portfolioId);
            let cgt = p?.cgt ?? 0.25;
            let incTax = p?.incTax ?? 0;
            if (p?.taxPolicy === 'TAX_FREE') { cgt = 0; incTax = 0; }

            const baseCPI = h.weightedAvgCPI || currentCPI;
            const costBasisSCTotal = h.costBasisStockCurrency;
            const avgCostSC = h.totalQty > 0 ? costBasisSCTotal / h.totalQty : 0;
            const costBasisSCVested = avgCostSC * h.qtyVested;
            const gainInSCVested = (h.qtyVested * h.currentPrice) - costBasisSCVested;

            // Calculate Unrealized Taxable Gain in ILS (For Tax Calc) - VESTED ONLY
            const priceInILS = convertCurrency(h.currentPrice, h.stockCurrency, Currency.ILS, this.exchangeRates);
            const mvILSVested = h.qtyVested * priceInILS;
            const costBasisILSTotal = h.costBasisILS;
            const avgCostILS = h.totalQty > 0 ? costBasisILSTotal / h.totalQty : 0;
            const costBasisILSVested = avgCostILS * h.qtyVested;
            
            const allocatedFeesVestedPC = h.totalQty > 0 ? (h.unallocatedBuyFeesPC / h.totalQty) * h.qtyVested : 0;
            const allocatedFeesVestedILS = convertCurrency(allocatedFeesVestedPC, h.portfolioCurrency, Currency.ILS, this.exchangeRates);
            const allocatedFeesVestedSC = convertCurrency(allocatedFeesVestedPC, h.portfolioCurrency, h.stockCurrency, this.exchangeRates);

            h.unrealizedTaxableGainILS = computeRealTaxableGain(
                mvILSVested - (costBasisILSVested + allocatedFeesVestedILS),
                gainInSCVested - allocatedFeesVestedSC,
                costBasisILSVested + allocatedFeesVestedILS,
                h.stockCurrency,
                Currency.ILS,
                baseCPI,
                currentCPI,
                this.exchangeRates
            );

            // Unrealized Tax Liability
            const unrealizedTaxILS = Math.max(0, h.unrealizedTaxableGainILS) * cgt;
            const wealthTaxILS = costBasisILSVested * incTax;
            h.unrealizedTaxLiabilityILS = unrealizedTaxILS + wealthTaxILS;
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

        const perfAcc: any = {};
        Object.keys(perfPeriods).forEach(p => {
            perfAcc[`totalChange_${p}`] = 0;
            perfAcc[`aumFor_${p}`] = 0;
            perfAcc[`holdingsFor_${p}`] = 0;
        });

        const portfolioAcc: Record<string, { costBasisILS: number, feesILS: number, aum: number, ils: { std: { unrealized: number, realized: number, taxLiability: number }, reit: { realized: number } } }> = {};

        this.holdings.forEach(h => {
            if (filterIds && !filterIds.has(h.id)) return;
            const p = this.portfolios.get(h.portfolioId);
            
            // Convert UnifiedHolding values to displayCurrency
            const marketValue = convertCurrency(h.marketValueVested, h.portfolioCurrency, displayCurrency, this.exchangeRates);
            const unrealizedGain = convertCurrency(h.unrealizedGainVested, h.portfolioCurrency, displayCurrency, this.exchangeRates);
            const realizedGain = convertCurrency(h.realizedGainPortfolioCurrency, h.portfolioCurrency, displayCurrency, this.exchangeRates);
            const dividends = convertCurrency(h.dividendsPortfolioCurrency, h.portfolioCurrency, displayCurrency, this.exchangeRates);
            const costOfSold = convertCurrency(h.costOfSoldPortfolioCurrency, h.portfolioCurrency, displayCurrency, this.exchangeRates);
            const totalFees = convertCurrency(h.totalFeesPortfolioCurrency, h.portfolioCurrency, displayCurrency, this.exchangeRates);
            
            const totalGain = (unrealizedGain + realizedGain + dividends) - totalFees;
            
            const unvestedVal = convertCurrency(h.marketValueUnvested, h.portfolioCurrency, displayCurrency, this.exchangeRates);
            
            const avgCost = h.totalQty > 0 ? h.costBasisPortfolioCurrency / h.totalQty : 0;
            const costBasisUnvested = avgCost * h.qtyUnvested;
            const unvestedGainPC = h.marketValueUnvested - costBasisUnvested;
            const unvestedGain = convertCurrency(unvestedGainPC, h.portfolioCurrency, displayCurrency, this.exchangeRates);

            // Accumulate Global
            globalAcc.aum += marketValue;
            globalAcc.totalUnrealized += unrealizedGain;
            globalAcc.totalRealized += realizedGain;
            globalAcc.totalCostOfSold += costOfSold;
            globalAcc.totalDividends += dividends;
            globalAcc.totalReturn += totalGain;
            globalAcc.totalUnvestedValue += unvestedVal;
            globalAcc.totalUnvestedGain += unvestedGain;
            globalAcc.totalFees += totalFees;

            // Day Change
            if (h.dayChangePct !== 0) {
                const { changeVal } = calculatePerformanceInDisplayCurrency(h.currentPrice, h.stockCurrency, h.dayChangePct, displayCurrency, this.exchangeRates);
                const dayChangeTotal = changeVal * h.qtyVested; 
                globalAcc.totalDayChange += dayChangeTotal;
                globalAcc.aumWithDayChangeData += marketValue;
                globalAcc.holdingsWithDayChange++;
            }

            // Perf Periods
            for (const [key, holdingKey] of Object.entries(perfPeriods)) {
                const perf = (h as any)[holdingKey]; // UnifiedHolding has these fields now
                if (perf && !isNaN(perf)) {
                    const { changeVal } = calculatePerformanceInDisplayCurrency(h.currentPrice, h.stockCurrency, perf, displayCurrency, this.exchangeRates);
                    perfAcc[`totalChange_${key}`] += changeVal * h.qtyVested;
                    perfAcc[`aumFor_${key}`] += marketValue;
                    perfAcc[`holdingsFor_${key}`]++;
                }
            }

            // Portfolio Accumulation (For Tax)
            if (!portfolioAcc[h.portfolioId]) {
                portfolioAcc[h.portfolioId] = { costBasisILS: 0, feesILS: 0, aum: 0, ils: { std: { unrealized: 0, realized: 0, taxLiability: 0 }, reit: { realized: 0 } } };
            }
            const pAcc = portfolioAcc[h.portfolioId];
            pAcc.costBasisILS += h.costBasisILS; 
            pAcc.feesILS += convertCurrency(h.totalFeesPortfolioCurrency, h.portfolioCurrency, Currency.ILS, this.exchangeRates);
            pAcc.aum += marketValue; 

            let taxableUnrealizedILS = 0;
            if (p?.taxPolicy === 'REAL_GAIN') {
                taxableUnrealizedILS = h.unrealizedTaxableGainILS;
            } else {
                // Nominal
                const priceInILS = convertCurrency(h.currentPrice, h.stockCurrency, Currency.ILS, this.exchangeRates);
                const costBasisILSVested = (h.totalQty > 0 ? h.costBasisILS / h.totalQty : 0) * h.qtyVested;
                taxableUnrealizedILS = (h.qtyVested * priceInILS) - costBasisILSVested;
            }

            pAcc.ils.std.unrealized += taxableUnrealizedILS;
            pAcc.ils.std.taxLiability += h.realizedTaxLiabilityILS;

            const isReit = h.type === InstrumentType.STOCK_REIT; 
            const incTax = p?.incTax || 0;
            if (isReit && incTax > 0) {
                pAcc.ils.reit.realized += h.dividendsILS;
            } else {
                pAcc.ils.std.realized += h.dividendsILS;
            }
        });

        // Final Tax Aggregation
        Object.keys(portfolioAcc).forEach(pid => {
            const pData = portfolioAcc[pid];
            const p = this.portfolios.get(pid);
            let cgt = p?.cgt ?? 0.25;
            let incTax = p?.incTax ?? 0;
            if (p?.taxPolicy === 'TAX_FREE') { cgt = 0; incTax = 0; }

            const deductibleFeesILS = (p?.taxPolicy === 'REAL_GAIN') ? pData.feesILS : 0;
            
            const taxCreditFromFees = deductibleFeesILS * cgt;
            const stdRealizedTaxILS = Math.max(0, pData.ils.std.taxLiability - taxCreditFromFees);
            const stdUnrealizedTaxILS = pData.ils.std.unrealized > 0 ? pData.ils.std.unrealized * cgt : 0;
            const reitRealizedTaxILS = pData.ils.reit.realized > 0 ? pData.ils.reit.realized * incTax : 0;
            const incomeTaxOnBaseILS = pData.costBasisILS * incTax; // Total base

            const totalRealizedTaxILS = stdRealizedTaxILS + reitRealizedTaxILS;
            const totalUnrealizedTaxILS = stdUnrealizedTaxILS + incomeTaxOnBaseILS;

            globalAcc.totalRealizedTax += convertCurrency(totalRealizedTaxILS, Currency.ILS, displayCurrency, this.exchangeRates);
            globalAcc.totalUnrealizedTax += convertCurrency(totalUnrealizedTaxILS, Currency.ILS, displayCurrency, this.exchangeRates);
        });

        // Construct Result
        const totalHoldings = this.holdings.size;
        const prevClose = globalAcc.aumWithDayChangeData - globalAcc.totalDayChange;
        
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
            totalDayChangePct: prevClose > 0 ? globalAcc.totalDayChange / prevClose : 0,
            totalDayChangeIsIncomplete: globalAcc.holdingsWithDayChange > 0 && globalAcc.holdingsWithDayChange < totalHoldings,
            realizedGainAfterTax: (globalAcc.totalRealized + globalAcc.totalDividends) - globalAcc.totalRealizedTax,
            valueAfterTax: globalAcc.aum - globalAcc.totalUnrealizedTax,
            
            totalUnvestedValue: globalAcc.totalUnvestedValue,
            totalUnvestedGain: globalAcc.totalUnvestedGain,
            totalUnvestedGainPct: (globalAcc.totalUnvestedValue - globalAcc.totalUnvestedGain) > 0 ? globalAcc.totalUnvestedGain / (globalAcc.totalUnvestedValue - globalAcc.totalUnvestedGain) : 0,
            
            perf1d: prevClose > 0 ? globalAcc.totalDayChange / prevClose : 0
        };

        for (const key of Object.keys(perfPeriods)) {
            const totalChange = perfAcc[`totalChange_${key}`];
            const aumForPeriod = perfAcc[`aumFor_${key}`];
            const prevValue = aumForPeriod - totalChange;
            (summary as any)[key] = prevValue > 0 ? totalChange / prevValue : 0;
            (summary as any)[`${key}_incomplete`] = perfAcc[`holdingsFor_${key}`] > 0 && perfAcc[`holdingsFor_${key}`] < totalHoldings;
        }

        return summary;
    }
}
