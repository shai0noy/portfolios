
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
    totalTaxPaid: 0,
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
    perfAll: 0, perfAll_incomplete: false,
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
    perfAll: 'perfAll',
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
                        // FIX: Calculate quantity breakdown at Date
                        const { vested, unvested } = this.getQtyBreakdownAtDate(h, d.date);
                        const totalQty = vested + unvested;

                        if (totalQty > 0) {
                            const grossSC = totalQty * d.amount;
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
                            let taxRateCashed = 0;
                            let taxRateReinvested = 0;
                            let taxAmountPC = 0;
                            let taxCashedPC = 0;
                            let taxReinvestedPC = 0;

                            if (p) {
                                const { cgt, incTax, divPolicy, taxPolicy } = p;
                                const isReit = h.type?.type === InstrumentType.STOCK_REIT;
                                let baseTaxRate = (isReit && incTax > 0) ? incTax : cgt;

                                // Policy Overrides
                                if (taxPolicy === 'TAX_FREE') baseTaxRate = 0;

                                // Cashed Portion is usually taxed unless exempt
                                taxRateCashed = baseTaxRate;

                                // Reinvested Portion depends on policy
                                if (divPolicy === 'accumulate_tax_free' || divPolicy === 'hybrid_rsu') {
                                    taxRateReinvested = 0;
                                } else {
                                    taxRateReinvested = baseTaxRate; // 'cash_taxed' usually implies even reinvestment (DRIP) is taxable, unless specifically exempt
                                }

                                const valILS = convertCurrency(grossSC, h.stockCurrency, Currency.ILS, this.exchangeRates);

                                // Proportional Tax Calculation
                                const ratioCashed = totalQty > 0 ? vested / totalQty : 0;
                                const ratioReinvested = totalQty > 0 ? unvested / totalQty : 0;

                                const grossILS = valILS;
                                const taxILSCashed = (grossILS * ratioCashed) * taxRateCashed;
                                const taxILSReinvested = (grossILS * ratioReinvested) * taxRateReinvested;

                                taxCashedPC = convertCurrency(taxILSCashed, Currency.ILS, h.portfolioCurrency, this.exchangeRates);
                                taxReinvestedPC = convertCurrency(taxILSReinvested, Currency.ILS, h.portfolioCurrency, this.exchangeRates);

                                taxAmountPC = taxCashedPC + taxReinvestedPC;
                            }

                            // Proportional Fee Calculation (simple split)
                            const ratioCashed = totalQty > 0 ? vested / totalQty : 0;
                            const feeCashedPC = feePC * ratioCashed;
                            const feeReinvestedPC = feePC - feeCashedPC;

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
                                isTaxable: true,
                                // New breakdown
                                unitsHeld: totalQty,
                                pricePerUnit: d.amount,
                                cashedAmount: totalQty > 0 ? (grossPC * ratioCashed) - feeCashedPC - taxCashedPC : 0,
                                reinvestedAmount: totalQty > 0 ? (grossPC * (unvested / totalQty)) - feeReinvestedPC - taxReinvestedPC : 0,
                                isReinvested: unvested > 0,
                                taxCashedPC,
                                taxReinvestedPC,
                                feeCashedPC,
                                feeReinvestedPC
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

                // Try to use historical rates for the transaction date if available
                // This ensures that synthesized Cost Basis (e.g. USD from ILS) uses the correct historical rate
                let txnRates = this.exchangeRates;
                // t.date is YYYY-MM-DD string
                if (t.date && this.exchangeRates[t.date]) {
                    txnRates = {
                        ...this.exchangeRates,
                        current: this.exchangeRates[t.date] as Record<string, number>
                    };
                }

                h.addTransaction(t, txnRates, this.cpiData, p);
            }
        });

        this.calculateSnapshot();
    }

    priceHistory: Map<string, { date: Date, price: number }[]> = new Map();

    public hydrateLivePrices(priceMap: Map<string, any>) {
        // First pass: Populate Price History
        this.holdings.forEach(h => {
            const key = `${h.exchange}:${h.ticker}`;
            const live = priceMap.get(key);
            if (live?.historical) {
                this.priceHistory.set(h.ticker, live.historical);
            }
        });

        const now = new Date();
        const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);

        // Helper to calc perf
        const calculatePersonalPerf = (h: Holding, period: string, fallbackPct?: number): number => {
            let startDate: Date;
            switch (period) {
                case '1w': startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break;
                case '1m':
                    startDate = new Date(now);
                    startDate.setMonth(startDate.getMonth() - 1);
                    break;
                case '3m':
                    startDate = new Date(now);
                    startDate.setMonth(startDate.getMonth() - 3);
                    break;
                case 'ytd':
                    startDate = new Date(now.getFullYear(), 0, 1);
                    break;
                case '1y':
                    startDate = new Date(now);
                    startDate.setFullYear(startDate.getFullYear() - 1);
                    break;
                case '3y':
                    startDate = new Date(now);
                    startDate.setFullYear(startDate.getFullYear() - 3);
                    break;
                case '5y':
                    startDate = new Date(now);
                    startDate.setFullYear(startDate.getFullYear() - 5);
                    break;
                case 'all':
                    startDate = new Date(0); // Beginning of time
                    break;
                default: return fallbackPct || 0;
            }

            // If start date is in future (e.g. YTD on Jan 1st), return 0 or Day Change?
            if (startDate > now) return fallbackPct || 0;

            try {
                // We use a history provider that looks up this.priceHistory
                // But we also need to handle the case where we don't have history for a specific ticker
                // create a simple provider closure
                const provider = (t: string) => ({ historical: this.priceHistory.get(t) || [] });

                const res = h.generateGainForPeriod(startDate, provider, this.exchangeRates);

                // If initialValue is 0 (e.g. bought today), gainPct is undefined/Infinity
                if (res.initialValue.get(h.portfolioCurrency) === 0) {
                    // If bought *after* startDate, generateGainForPeriod uses Cost Basis as Initial.
                    // If Initial is 0, it means we have NO lots active/sold in this period?
                    // Or maybe we bought today?
                    // If bought today, Initial = Cost.
                    // If Cost is 0 (free shares?), unlikely.
                    return fallbackPct !== undefined ? fallbackPct : 0;
                }

                // If the holding was effectively empty during this period (e.g. sold before start, bought after end?), 
                // generateGainForPeriod should return 0 gain, 0 initial.

                // gainPct calculation:
                // We want: (Final Value - Initial Value + Dividends) / Initial Value
                // generateGainForPeriod returns { gain, initialValue, finalValue }
                // gain = final - initial + dividends

                const initialPC = res.initialValue.get(h.portfolioCurrency);
                const gainPC = res.gain.get(h.portfolioCurrency);

                if (initialPC === 0) return fallbackPct !== undefined ? fallbackPct : 0;

                return gainPC / initialPC;

            } catch (e) {
                console.warn(`Failed to calc personal perf for ${h.ticker} ${period}`, e);
                return fallbackPct !== undefined ? fallbackPct : 0;
            }
        };

        this.holdings.forEach(h => {
            const key = `${h.exchange}:${h.ticker}`;
            const live = priceMap.get(key);
            if (h.exchange === 'TASE' || (h.exchange as string) === 'Tel Aviv') {
                // Console log removed to reduce noise, or keep if debugging needed
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

                // Use Personal Perf with Fallback to Market Perf
                h.perf1w = calculatePersonalPerf(h, '1w', live.changePctRecent ?? live.perf1w);
                h.perf1m = calculatePersonalPerf(h, '1m', live.changePct1m ?? live.perf1m);
                h.perf3m = calculatePersonalPerf(h, '3m', live.changePct3m ?? live.perf3m);
                h.perfYtd = calculatePersonalPerf(h, 'ytd', live.changePctYtd ?? live.perfYtd);
                h.perf1y = calculatePersonalPerf(h, '1y', live.changePct1y ?? live.perf1y);
                h.perf3y = calculatePersonalPerf(h, '3y', live.changePct3y ?? live.perf3y);
                h.perf5y = calculatePersonalPerf(h, '5y', live.changePct5y ?? live.perf5y);
                h.perfAll = calculatePersonalPerf(h, 'all', live.changePctMax ?? live.perfAll);

                if (live.name) {
                    h.marketName = live.name;
                }
                if (live.nameHe) h.nameHe = live.nameHe;
                if (live.type) h.type = live.type;
                if (live.sector) h.sector = live.sector;
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
            const iter = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 1));
            const limit = new Date();
            limit.setUTCHours(23, 59, 59, 999);

            while (iter <= limit) {
                const rates = getFeeRatesForDate(p, iter);
                if (rates.mgmtVal === 0 || rates.mgmtType !== 'percentage') {
                    iter.setUTCMonth(iter.getUTCMonth() + 1);
                    continue;
                }

                let isDue = false;
                const m = iter.getUTCMonth();
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
                iter.setUTCMonth(iter.getUTCMonth() + 1);
            }
        });
    }

    private getQuantityAtDate(h: Holding, date: Date): number {
        const { vested, unvested } = this.getQtyBreakdownAtDate(h, date);
        return vested + unvested;
    }

    private getQtyBreakdownAtDate(h: Holding, date: Date): { vested: number, unvested: number } {
        const time = date.getTime();
        let vested = 0;
        let unvested = 0;

        for (const t of h.transactions) {
            if (new Date(t.date).getTime() > time) continue;

            if (t.type === 'BUY') {
                const qty = t.qty || 0;
                const isVested = !t.vestDate || new Date(t.vestDate).getTime() <= time;
                if (isVested) vested += qty;
                else unvested += qty;
            }
            if (t.type === 'SELL') {
                // assume sells come from vested
                vested -= (t.qty || 0);
            }
        }
        return { vested: Math.max(0, vested), unvested: Math.max(0, unvested) };
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

            h.realizedGainNet = { amount: realizedGainNetVal, currency: h.portfolioCurrency };

            // Adjusted Cost (Inflation or Currency Adjusted) - Portfolio Currency
            // We calculate this ALWAYS for display purposes (Real vs Nominal analysis), 
            // regardless of the actual tax policy used for realized gains.
            // const portfolio = this.portfolios.get(h.portfolioId); // Removed duplicate
            // Adjusted Cost & Real Cost Calculation
            // We calculate two values:
            // 1. realCostILS: Pure inflation/currency adjusted cost (for display).
            // 2. adjustedCostILS: The "Tax Basis" cost after applying tax rules (e.g. Section 9 limits).

            const portfolio = this.portfolios.get(h.portfolioId);
            let adjustedCost: number | undefined; // Portfolio Currency version of tax basis

            {
                const currentCPI = this.cpiData ? getCPI(new Date(), this.cpiData) : 100;
                let totalAdjCostPC = 0;
                let hasAdjustment = false;

                activeLots.forEach(l => {
                    const nominalCostILS = l.costTotal.valILS || convertCurrency(l.costTotal.amount, l.costTotal.currency, Currency.ILS, this.exchangeRates);
                    let pureRealCostILS = nominalCostILS;
                    let taxBasisCostILS = nominalCostILS;

                    let adjustmentLabel = '';
                    let adjustmentPct = 0;

                    if (h.stockCurrency === Currency.ILS || h.stockCurrency === Currency.ILA) {
                        // Domestic: CPI Adjustment
                        // Real Cost = Nominal * (CPI_Now / CPI_Buy)
                        const inflationRate = (l.cpiAtBuy > 0) && currentCPI ? (currentCPI / l.cpiAtBuy) : 1;
                        pureRealCostILS = nominalCostILS * inflationRate;

                        // Tax Basis: Max(Nominal, Real) - usually.
                        // Actually for Domestic, if Inflation > 0, Basis is Real.
                        // If Deflation, Basis is Nominal (Capital Loss not allowed on deflation?).
                        // Let's assume Max(Nominal, Real) for now or just Real if we follow strict Real Gain?
                        // Usually: Adjusted Cost = Cost * Max(1, Change).
                        taxBasisCostILS = nominalCostILS * Math.max(1, inflationRate);

                        adjustmentLabel = 'Change in CPI';
                        adjustmentPct = (currentCPI / l.cpiAtBuy - 1);
                    } else {
                        // Foreign: Currency Adjustment
                        let costSC = 0;
                        if (h.stockCurrency === Currency.USD && l.costTotal.valUSD) {
                            costSC = l.costTotal.valUSD;
                        } else if (h.stockCurrency === Currency.ILS && l.costTotal.valILS) {
                            costSC = l.costTotal.valILS;
                        } else {
                            costSC = l.costTotal.amount / (l.costTotal.rateToPortfolio || 1);
                        }

                        // Pure Real Cost = CostSC * Rate_Now
                        const realCostILS = convertCurrency(costSC, h.stockCurrency, Currency.ILS, this.exchangeRates);
                        pureRealCostILS = realCostILS;

                        // Tax Basis Rules (Section 9)
                        // This logic defines the "Taxable Gain" or "Recognized Loss".
                        // To store it as a "Cost Basis", we derive it: TaxBasis = Value - TaxableGain.

                        const currentPrice = h.currentPrice || 0;
                        const valueSC = l.qty * currentPrice;
                        const valueILS = convertCurrency(valueSC, h.stockCurrency, Currency.ILS, this.exchangeRates);

                        const gainNominal = valueILS - nominalCostILS;
                        const gainReal = valueILS - realCostILS;

                        let allowableGain = 0;
                        let ruleUsed = '';

                        if (gainNominal > 0 && gainReal > 0) {
                            allowableGain = Math.min(gainNominal, gainReal);
                            ruleUsed = gainNominal < gainReal ? 'Lower Nominal Gain' : 'Lower Real Gain';
                        } else if (gainNominal < 0 && gainReal < 0) {
                            allowableGain = Math.max(gainNominal, gainReal); // Max of negatives is closest to zero (Smallest Loss)
                            ruleUsed = gainNominal > gainReal ? 'Lower Nominal Loss' : 'Lower Real Loss';
                        } else {
                            // Mixed case
                            allowableGain = 0;
                            ruleUsed = 'Mixed (Exempt Only)';
                        }

                        // Derived Tax Basis
                        // If Policy is NOT IL_REAL_GAIN, this logic is irrelevant for TaxableGain, 
                        // but we store it in adjustedCostILS as the "Real Scenario" basis.
                        // However, the User wants "Taxable Gain" field to be 0/Nominal/Real depending on policy.
                        // So `adjustedCostILS` should probably match the policy?
                        // User said: "TAX FREE -> 0, NOMINAL -> Nominal, REAL -> Real (with ceilings)".

                        // Let's store the "Section 9 Basis" in a specific variable, 
                        // and let HoldingDetails decide which one to use for "Taxable Gain".
                        // OR we update `l.adjustedCostILS` to be the "Tax Basis according to Policy".

                        // Wait, if I change `l.adjustedCostILS` to depend on policy, then "Real Cost" field in UI needs `l.realCostILS`.
                        // I added `l.realCostILS`.

                        // So:
                        // l.realCostILS = pureRealCostILS (Always calculated).
                        // l.adjustedCostILS = taxBasisCostILS (Calculated based on Section 9 rules).

                        // But wait, if policy is NOMINAL, `l.adjustedCostILS` should probably be `nominalCostILS`?
                        // No, `adjustedCost` usually implies "Inflation Adjusted".
                        // Let's keep `l.adjustedCostILS` as the "Section 9 / Inflation Adjusted Basis" (The 'Real' scenario).
                        // And `HoldingDetails` will pick `nominalCostILS` if policy is Nominal.

                        taxBasisCostILS = valueILS - allowableGain;

                        adjustmentLabel = `Tax Rule: ${ruleUsed}`;
                        if (nominalCostILS !== 0) {
                            adjustmentPct = (taxBasisCostILS / nominalCostILS) - 1;
                        }
                    }

                    const adjCostPC = convertCurrency(taxBasisCostILS, Currency.ILS, h.portfolioCurrency, this.exchangeRates);
                    l.adjustedCost = adjCostPC; // This is used for "Value After Tax" aggregation potentially?
                    l.adjustedCostILS = taxBasisCostILS; // Section 9 / CPI Basis
                    l.realCostILS = pureRealCostILS; // Pure Real Basis

                    l.adjustmentDetails = {
                        label: adjustmentLabel,
                        percentage: adjustmentPct
                    };
                    totalAdjCostPC += adjCostPC;
                    hasAdjustment = true;
                });

                if (hasAdjustment) {
                    adjustedCost = totalAdjCostPC;
                }
            }
            h.adjustedCost = adjustedCost;

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
                    if (!lot.isVested) return; // Exclude unvested from tax liability (Value After Tax should be Vested only)

                    const mvILS = lot.qty * currentPriceILS;
                    const mvSC = lot.qty * currentPriceSC;
                    const costILS = lot.costTotal.valILS || convertCurrency(lot.costTotal.amount, lot.costTotal.currency, Currency.ILS, this.exchangeRates);
                    const feesILS = lot.feesBuy.valILS || convertCurrency(lot.feesBuy.amount, lot.feesBuy.currency, Currency.ILS, this.exchangeRates);
                    const feesSC = convertCurrency(lot.feesBuy.amount, lot.feesBuy.currency, h.stockCurrency, this.exchangeRates);

                    // Determine Cost in Stock Currency (costSC)
                    let costSC = 0;
                    if (h.stockCurrency === Currency.USD && lot.costTotal.valUSD) {
                        costSC = lot.costTotal.valUSD;
                    } else if (h.stockCurrency === Currency.ILS && lot.costTotal.valILS) {
                        costSC = lot.costTotal.valILS;
                    } else {
                        // Fallback using rateToPortfolio
                        costSC = lot.costTotal.amount / (lot.costTotal.rateToPortfolio || 1);
                    }

                    // Gain in Stock Currency (Value - Cost - Fees)
                    const gainSC = mvSC - costSC - feesSC;

                    // Calculate Taxable Base in ILS
                    let taxableILS = 0;
                    const isForeign = h.stockCurrency !== Currency.ILS;

                    if (p.taxOnBase) {
                        // TAX ON BASE PRICE (Wealth Tax / Turnover Tax)
                        // Tax is applied to the full market value, not just the gain.
                        taxableILS = mvILS;
                    } else if (taxPolicy === 'IL_REAL_GAIN') {
                        // REAL GAIN POLICY (Inflation Adjusted)
                        // Domestic: Nominal Gain adjusted for CPI. Includes "Never Lose" protection (if Deflation, Taxable Gain is capped at Nominal).
                        // Foreign: "Never Lose" Rule -> Min(Nominal Gain in ILS, Real Gain in ILS).

                        const nominalGainILS = mvILS - (costILS + feesILS);

                        taxableILS = computeRealTaxableGain(
                            nominalGainILS,
                            gainSC,
                            costILS + feesILS,
                            h.stockCurrency,
                            Currency.ILS,
                            lot.cpiAtBuy,
                            currentCPI,
                            this.exchangeRates
                        );
                    } else if (taxPolicy === 'NOMINAL_GAIN' && isForeign) {
                        // NOMINAL GAIN POLICY (Foreign Assets Exception)
                        // "Flat rate on gain in the ticker currency"
                        // We ignore currency fluctuations on the principal. 
                        // Taxable Gain = Gain in Foreign Currency * Current Exchange Rate (to ILS).

                        const foreignGainConvertedToILS = convertCurrency(gainSC, h.stockCurrency, Currency.ILS, this.exchangeRates);

                        // If GainSC is negative, Taxable is negative (Credit).
                        taxableILS = foreignGainConvertedToILS;
                    } else {
                        // NOMINAL GAIN POLICY (Domestic / Standard)
                        // Simple Nominal Gain in ILS (Proceeds - Cost).
                        taxableILS = mvILS - (costILS + feesILS);
                    }

                    totalTaxableGainILS += taxableILS;
                    totalWealthTaxILS += (costILS + feesILS) * incTax;

                    // Per-Lot Tax Liability (stored in Portfolio Currency)
                    // We allow negative tax liability (tax credit) to offset other gains.
                    // If taxOnBase, 'taxableILS' is the full MV.
                    // We assume 'cgt' is the relevant rate for this taxable amount.
                    const lotTaxLiabilityILS = (taxableILS * cgt) + ((costILS + feesILS) * incTax);
                    lot.unrealizedTax = convertCurrency(lotTaxLiabilityILS, Currency.ILS, h.portfolioCurrency, this.exchangeRates);
                });

                h.unrealizedTaxableGainILS = totalTaxableGainILS;
                // Allow negative total liability for the holding
                h.unrealizedTaxLiabilityILS = (totalTaxableGainILS * cgt) + totalWealthTaxILS;

                // Realized Tax
                const realizedTaxVal = realizedLots.reduce((acc, l) => acc + (l.realizedTax || 0), 0);
                h.realizedCapitalGainsTax = realizedTaxVal;
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
            totalDayChange: 0,
            aumWithDayChangeData: 0,
            holdingsWithDayChange: 0,
            totalUnvestedValue: 0,
            totalUnvestedGain: 0,
            totalUnvestedCost: 0,
            totalFees: 0,
            totalRealizedTax: 0,
            totalUnrealizedTax: 0,
            totalDividendTax: 0
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
            console.error('DEBUG_ADJ: Loop Entry', h.ticker, h.qtyVested);
            if (filterIds && !filterIds.has(h.id)) return;

            // Values in Display Currency
            // Reconstruct Market Value Total (Vested Only)
            const mvTotalSC = h.marketValueVested.amount;
            const marketValue = convertCurrency(mvTotalSC, h.stockCurrency, displayCurrency, this.exchangeRates);

            // Unrealized Gain (stored in PC)
            // Note: stored unrealizedGain is Gross (MV - Cost) in PC.
            // If we want Display Currency, conv PC -> Display
            const unrealizedGain = convertCurrency(h.unrealizedGain.amount, h.unrealizedGain.currency, displayCurrency, this.exchangeRates);

            // Adjusted Cost logic moved to calculateSnapshot


            // Unvested Cost Calculation
            const unvestedCostPC = h.activeLots.reduce((acc, l) => !l.isVested ? acc + l.costTotal.amount : acc, 0);
            const unvestedCost = convertCurrency(unvestedCostPC, h.portfolioCurrency, displayCurrency, this.exchangeRates);
            globalAcc.totalUnvestedCost += unvestedCost;

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
            const divs = (h as any)._dividends || [];
            const divsTaxVal = divs.reduce((acc: number, d: any) => acc + (d.taxAmountPC || 0), 0);
            const divsTaxDisplay = convertCurrency(divsTaxVal, h.portfolioCurrency, displayCurrency, this.exchangeRates);
            globalAcc.totalDividendTax += divsTaxDisplay;

            const dividendsGross = dividends + divsTaxDisplay;

            globalAcc.totalCostOfSold += costOfSold;
            globalAcc.totalDividends += dividendsGross; // Gross
            globalAcc.totalReturn += (totalGain + divsTaxDisplay); // Gross (since totalGain used Net Dividends before)
            globalAcc.totalFees += totalFees;

            // Tax
            // Use totalTaxPaidPC (CGT + Income + Div Tax)
            const realizedTax = convertCurrency(h.totalTaxPaidPC, h.portfolioCurrency, displayCurrency, this.exchangeRates);
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

            // Perf Periods Aggregation
            // We weigh performance by market value (AUM)?
            // Or simple sum of weighted perfs?
            // Standard approach: Portfolio Perf = Sum(HoldingPerf * HoldingWeight)
            // Weight = HoldingMarketValue / TotalAUM
            // Since we don't know TotalAUM until end, we sum (Perf * MV) and divide by AUM at end.

            // Note: perf* fields on Holding are percentages (e.g. 0.05 for 5%).
            // We use `marketValue` (in Display Currency) as weight.

            if (h.perf1w !== undefined) { perfAcc.totalChange_perf1w += h.perf1w * marketValue; perfAcc.aumFor_perf1w += marketValue; perfAcc.holdingsFor_perf1w++; }
            if (h.perf1m !== undefined) { perfAcc.totalChange_perf1m += h.perf1m * marketValue; perfAcc.aumFor_perf1m += marketValue; perfAcc.holdingsFor_perf1m++; }
            if (h.perf3m !== undefined) { perfAcc.totalChange_perf3m += h.perf3m * marketValue; perfAcc.aumFor_perf3m += marketValue; perfAcc.holdingsFor_perf3m++; }
            if (h.perfYtd !== undefined) { perfAcc.totalChange_perfYtd += h.perfYtd * marketValue; perfAcc.aumFor_perfYtd += marketValue; perfAcc.holdingsFor_perfYtd++; }
            if (h.perf1y !== undefined) { perfAcc.totalChange_perf1y += h.perf1y * marketValue; perfAcc.aumFor_perf1y += marketValue; perfAcc.holdingsFor_perf1y++; }
            if (h.perf3y !== undefined) { perfAcc.totalChange_perf3y += h.perf3y * marketValue; perfAcc.aumFor_perf3y += marketValue; perfAcc.holdingsFor_perf3y++; }
            if (h.perf5y !== undefined) { perfAcc.totalChange_perf5y += h.perf5y * marketValue; perfAcc.aumFor_perf5y += marketValue; perfAcc.holdingsFor_perf5y++; }
            if (h.perfAll !== undefined) { perfAcc.totalChange_perfAll += h.perfAll * marketValue; perfAcc.aumFor_perfAll += marketValue; perfAcc.holdingsFor_perfAll++; }

            // Unvested
            const unvestedVal = convertCurrency(h.marketValueUnvested.amount, h.marketValueUnvested.currency, displayCurrency, this.exchangeRates);
            globalAcc.totalUnvestedValue += unvestedVal;

            // Unvested Gain?
            // Unvested Gain = MarketValueUnvested - CostBasisUnvested?
            // Usually Unvested Cost Basis is 0 (RSU/Option grant price 0 or strike).
            // If we track CostBasisUnvested separately.
            // Holding model has `qtyUnvested`.
            // Let's assume for now Unvested Gain ~ Unvested Value (if cost 0) or we need to calculate it.
            // Holding doesn't have `costBasisUnvested` explicitly calculated in `calculateSnapshot`.
            // But we can approximate.
            // For now, let's leave Unvested Gain as 0 or equal to Value if we treat cost as 0.
            // Actually, usually RSUs have 0 cost. Options have strike.
            // Let's rely on `marketValueUnvested` for Value.
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
            realizedGainAfterTax: (globalAcc.totalRealized + globalAcc.totalDividends) - Math.max(0, globalAcc.totalRealizedTax),
            totalTaxPaid: Math.max(0, globalAcc.totalRealizedTax), // Populate the new field
            valueAfterTax: globalAcc.aum - Math.max(0, globalAcc.totalUnrealizedTax),
            totalDayChangePct: globalAcc.aumWithDayChangeData > 0 ? globalAcc.totalDayChange / globalAcc.aumWithDayChangeData : 0,
            totalDayChangeIsIncomplete: globalAcc.holdingsWithDayChange < this.holdings.size, // Approximate


            // Perf
            perf1w: perfAcc.aumFor_perf1w > 0 ? perfAcc.totalChange_perf1w / perfAcc.aumFor_perf1w : 0,
            perf1w_incomplete: perfAcc.aumFor_perf1w < globalAcc.aum * 0.9,
            perf1m: perfAcc.aumFor_perf1m > 0 ? perfAcc.totalChange_perf1m / perfAcc.aumFor_perf1m : 0,
            perf1m_incomplete: perfAcc.aumFor_perf1m < globalAcc.aum * 0.9,
            perf3m: perfAcc.aumFor_perf3m > 0 ? perfAcc.totalChange_perf3m / perfAcc.aumFor_perf3m : 0,
            perf3m_incomplete: perfAcc.aumFor_perf3m < globalAcc.aum * 0.9,
            perfYtd: perfAcc.aumFor_perfYtd > 0 ? perfAcc.totalChange_perfYtd / perfAcc.aumFor_perfYtd : 0,
            perfYtd_incomplete: perfAcc.aumFor_perfYtd < globalAcc.aum * 0.9,
            perf1y: perfAcc.aumFor_perf1y > 0 ? perfAcc.totalChange_perf1y / perfAcc.aumFor_perf1y : 0,
            perf1y_incomplete: perfAcc.aumFor_perf1y < globalAcc.aum * 0.9,
            perf3y: perfAcc.aumFor_perf3y > 0 ? perfAcc.totalChange_perf3y / perfAcc.aumFor_perf3y : 0,
            perf3y_incomplete: perfAcc.aumFor_perf3y < globalAcc.aum * 0.9,
            perf5y: perfAcc.aumFor_perf5y > 0 ? perfAcc.totalChange_perf5y / perfAcc.aumFor_perf5y : 0,
            perf5y_incomplete: perfAcc.aumFor_perf5y < globalAcc.aum * 0.9,
            perfAll: perfAcc.aumFor_perfAll > 0 ? perfAcc.totalChange_perfAll / perfAcc.aumFor_perfAll : 0,
            perfAll_incomplete: perfAcc.aumFor_perfAll < globalAcc.aum * 0.9,

            totalUnvestedValue: globalAcc.totalUnvestedValue,
            totalUnvestedGain: globalAcc.totalUnvestedValue - globalAcc.totalUnvestedCost,
            totalUnvestedGainPct: globalAcc.totalUnvestedCost > 0 ? (globalAcc.totalUnvestedValue - globalAcc.totalUnvestedCost) / globalAcc.totalUnvestedCost : 0
        };
        return summary;
    }
}
