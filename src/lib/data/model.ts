
import { Currency, Exchange, type Transaction, type ExchangeRates, type Portfolio, isBuy, isSell } from '../types';
import { convertCurrency, toILS, normalizeCurrency } from '../currencyUtils';
import { getTaxRatesForDate } from '../portfolioUtils';

// --- Types ---
import { MultiCurrencyValue } from './multiCurrency';
export { MultiCurrencyValue };

export interface DividendEvent {
    ticker: string;
    exchange: Exchange;
    date: Date;
    amount: number;
    source: string;
}

export function getHistoricalRates(rates: ExchangeRates, period: '1w' | '1m' | '3m' | 'ytd' | '1y' | '5y' | 'all'): Record<string, number> | undefined {
    const rateKeyMap: Record<string, string> = {
        '1w': 'ago1w',
        '1m': 'ago1m',
        '3m': 'ago3m',
        'ytd': 'ytd',
        '1y': 'ago1y',
        '5y': 'ago5y',
        'all': 'agoMax'
    };

    const key = rateKeyMap[period];
    if (key && key in rates) {
        return (rates as any)[key];
    }
    return undefined;
}

import type { SimpleMoney } from '../types';

/**
 * Represents a monetary value with explicit conversions.
 * TODO: Consider converting this interface to a class (e.g., extending MultiCurrencyValue) 
 * in the future to encapsulate conversion logic and arithmetic operations directly.
 */
export interface Money extends SimpleMoney {
    rateToPortfolio: number; // Historical rate at transaction time
    // Historical values in base currencies (computed at txn time to avoid drift)
    valUSD?: number;
    valILS?: number;
}

// Single Lot Structure
export interface Lot {
    id: string; // unique ID
    ticker: string;

    // Origin (Buy) Data
    date: Date; // Purchase Date
    qty: number; // The quantity in this specific lot (active or sold)
    costPerUnit: Money;
    costTotal: Money;
    feesBuy: Money; // Prorated buy fees for this lot
    cpiAtBuy: number;

    // Vesting / Metadata
    vestingDate?: Date; // For RSUs
    isVested: boolean;
    originalTxnId: string;
    notes?: string; // Messages from txn

    // Realization (Sell) Data - Populated only if sold (or partially sold)
    soldDate?: Date;
    soldPricePerUnit?: Money;
    soldFees?: Money; // Prorated sell fees
    realizedGainNet?: number; // Cached calc (Portfolio Currency)
    realizedTax?: number; // Capital Gains Tax (Usually ILS/Domestic)
    realizedTaxPC?: number; // Capital Gains Tax converted to Portfolio Currency
    realizedIncomeTaxPC?: number; // Income Tax on Vest Value (Portfolio Currency)
    totalRealizedTaxPC?: number; // Total Realized Tax (CGT + Income Tax) in Portfolio Currency
    realizedTaxableGainILS?: number; // Specific for tax reporting

    // Unrealized Tax (Active Lots)
    unrealizedTax?: number; // Estimated tax liability in Portfolio Currency
    adjustedCost?: number; // Portfolio Currency (Active Lots only)
    adjustedCostILS?: number; // Always in ILS (Tax Basis - Rule Applied)
    realCostILS?: number; // Always in ILS (Pure Real Cost - No Rules)
    unrealizedTaxableGainILS?: number; // The exact taxable gain calculated by the engine (ILS)
    currentValueILS?: number; // Calculated value in ILS
    adjustmentDetails?: {
        label: string;
        percentage: number;
    };
}

export interface DividendRecord {
    date: Date;
    grossAmount: Money;
    netAmountPC: number; // Portfolio Currency
    taxAmountPC: number;
    feeAmountPC: number;
    isTaxable: boolean;
    // New breakdown fields
    unitsHeld: number;
    pricePerUnit: number; // Gross Dividend per share
    cashedAmount: number; // Net PC
    reinvestedAmount: number; // Net PC
    isReinvested: boolean;
    // Split Tax (PC)
    taxCashedPC?: number;
    taxReinvestedPC?: number;
    feeCashedPC?: number;
    feeReinvestedPC?: number;
}

// --- Helpers ---

// Helper to interpolate CPI
export const getCPI = (date: Date, cpiData: any) => {
    if (!cpiData?.historical || cpiData.historical.length === 0) return 100;
    const timestamp = date.getTime();
    const history = cpiData.historical;

    if (timestamp >= history[0].date.getTime()) return history[0].price;

    for (let i = 0; i < history.length - 1; i++) {
        const h1 = history[i];
        const h2 = history[i + 1];
        if (timestamp <= h1.date.getTime() && timestamp >= h2.date.getTime()) {
            const t1 = h1.date.getTime();
            const t2 = h2.date.getTime();
            const ratio = (t1 === t2) ? 0 : (timestamp - t2) / (t1 - t2);
            return h2.price + (h1.price - h2.price) * ratio;
        }
    }
    return history[history.length - 1].price;
};

// Helper to compute Real Taxable Gain

/**
 * Computes the Real Taxable Gain according to Israeli Tax Law principles.
 * 
 * Logic: "Closer to 0" Rule.
 * 
 * 1. Domestic Assets (ILS):
 *    - Nominal Gain (x) = Proceeds - Cost
 *    - Real Gain (y) = Proceeds - (Cost * (1 + Inflation))
 *    - We subtract Inflation Adjustment from Nominal Gain to get Real Gain.
 *    - Taxable Gain is whichever is closer to 0 (Nominal or Real).
 * 
 * 2. Foreign Assets:
 *    - Nominal Gain (x) = Proceeds(ILS) - Cost(ILS)
 *    - Real Gain (y) = Gain(ForeignCurrency) converted to ILS
 *       (Equivalent to: Proceeds(ILS) - CostInForex * CurrentRate)
 *    - Taxable Gain is whichever is closer to 0 (|x| < |y| ? x : y).
 *    - Exception: Mixed Case (Gain vs Loss) -> 0.
 */
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
    let x = nominalGainPC; // Nominal Gain
    let y = nominalGainPC; // Real Gain

    // DOMESTIC (CPI Adjusted)
    if (portfolioCurrency === Currency.ILS && (stockCurrency === Currency.ILS || stockCurrency === Currency.ILA)) {
        // Calculate Inflation Rate
        const inflationRate = (cpiStart > 0) ? (cpiEnd / cpiStart) - 1 : 0;
        
        // Real Gain (y) = Nominal Gain - Inflation Adjustment
        // Note: If Deflation (Rate < 0), InflationAdj is negative, so we subtract a negative (add) -> y > x.
        const inflationAdj = costBasisPC * inflationRate;
        y = nominalGainPC - inflationAdj;
        
    } else if (portfolioCurrency !== stockCurrency) {
        // FOREIGN (Exchange Rate Adjusted)
        // Real Gain (y) is the Gain in Stock Currency converted to Portfolio Currency (current rates)
        y = convertCurrency(gainSC, stockCurrency, portfolioCurrency, exchangeRates);
    }

    // Unified "Nominal Loss / Min Gain" Logic
    // User Requirement: "Real loses are capped at 0 from below for tax purposes", "Because of that we can only use nominal loses [for losses]"

    // 1. Mixed Case (Gain vs Loss) -> Exempt (0)
    if ((x > 0 && y < 0) || (x < 0 && y > 0)) {
        return 0;
    }

    // 2. Both Positive -> Min(x, y)
    // We use the lower gain between Nominal and Real.
    if (x >= 0 && y >= 0) {
        return Math.min(x, y);
    }
    
    // 3. Both Negative -> Nominal Loss (x)
    // We ignore the Real Loss value (even if it's "closer to 0") and use the full Nominal Loss.
    return x;
}

// --- Holding Class ---

export class Holding {
    public readonly id: string;
    public readonly ticker: string;
    public readonly portfolioId: string;
    public readonly exchange: Exchange;
    public readonly stockCurrency: Currency;
    public readonly portfolioCurrency: Currency;

    // State (Mutable)
    private _lots: Lot[] = [];
    private _transactions: Transaction[] = []; // Raw history
    private _dividends: DividendRecord[] = [];

    // Holding-Level Fees (Accumulators)
    private _accumulatedMgmtFees: number = 0; // Portfolio Currency

    // Tax/Inflation
    public adjustedCost?: number; // Portfolio Currency

    // Unallocated Buy Fees (For average cost distribution if needed, though we try to allocate to lots)
    // We allocate buy fees PRO-RATA to lots on creation.

    // Metadata
    public sector?: string;
    public name?: string; // Effective Name (Legacy support or calculated)
    public customName?: string; // Long Name (from Sheet)
    public marketName?: string; // Short Name (from Live Data)
    public displayName?: string; // Short Name preferred
    public nameHe?: string;
    public type?: any; // InstrumentClassification


    // Market Data (Mutable)
    public currentPrice: number = 0;
    public dayChangePct: number = 0;
    public perf1w?: number;
    public perf1m?: number;
    public perf3m?: number;
    public perfYtd?: number;
    public perf1y?: number;
    public perf3y?: number;
    public perf5y?: number;
    public perfAll?: number;

    // Quantities
    public qtyVested: number;
    public qtyUnvested: number;
    public qtyTotal: number;

    // Metrics (in Stock Currency or Portfolio Currency - now Explicit)
    marketValueVested: SimpleMoney; // Stock Currency
    marketValueUnvested: SimpleMoney; // Stock Currency
    costBasisVested: SimpleMoney; // Portfolio Currency

    // Gains (Portfolio Currency)
    unrealizedGain: SimpleMoney; // Gross
    realizedGainNet: SimpleMoney;

    // Totals (Portfolio Currency)
    proceedsTotal: SimpleMoney;
    dividendsTotal: SimpleMoney;
    feesTotal: SimpleMoney;
    costOfSoldTotal: SimpleMoney;

    // Tax (Portfolio Currency - usually ILS)
    realizedCapitalGainsTax: number;
    realizedIncomeTax: number;
    unrealizedTaxLiabilityILS: number;
    unrealizedTaxableGainILS: number;
    realCostILS: number;

    private recalculateQty() {
        this.qtyVested = this._lots.reduce((acc, l) => acc + (l.isVested && !l.soldDate ? l.qty : 0), 0);
        this.qtyUnvested = this._lots.reduce((acc, l) => acc + (!l.isVested && !l.soldDate ? l.qty : 0), 0);
        this.qtyTotal = this.qtyVested + this.qtyUnvested;
    }

    constructor(
        portfolioId: string,
        ticker: string,
        exchange: Exchange,
        stockCurrency: Currency,
        portfolioCurrency: Currency,
        displayName?: string
    ) {
        this.portfolioId = portfolioId;
        this.ticker = ticker;
        this.exchange = exchange;
        this.stockCurrency = stockCurrency;
        this.portfolioCurrency = portfolioCurrency;
        this.displayName = displayName || ticker;
        this.id = `${portfolioId}_${ticker}`;
        this._lots = [];
        this._dividends = [];

        const zeroPC: SimpleMoney = { amount: 0, currency: portfolioCurrency };
        const zeroSC: SimpleMoney = { amount: 0, currency: stockCurrency };

        this.qtyVested = 0;
        this.qtyUnvested = 0;
        this.qtyTotal = 0;

        this.marketValueVested = { ...zeroSC };
        this.marketValueUnvested = { ...zeroSC };
        this.costBasisVested = { ...zeroPC };

        this.unrealizedGain = { ...zeroPC };
        this.realizedGainNet = { ...zeroPC };

        this.proceedsTotal = { ...zeroPC };
        this.dividendsTotal = { ...zeroPC };
        this.feesTotal = { ...zeroPC };
        this.costOfSoldTotal = { ...zeroPC };

        this.realizedCapitalGainsTax = 0;
        this.realizedIncomeTax = 0;
        this.unrealizedTaxLiabilityILS = 0;
        this.unrealizedTaxableGainILS = 0;
        this.realCostILS = 0;
    }

    // --- Core Logic ---

    public addTransaction(txn: Transaction, rates: ExchangeRates, cpiData: any, portfolio: Portfolio, options?: { costBasisOverride?: number, originalDateOverride?: Date }): { costOfSold?: number, originalDate?: Date } {
        this._transactions.push(txn);

        const date = new Date(txn.date);
        const cpi = getCPI(date, cpiData);

        // Resolve Fees
        let feePC = 0;
        // let feeSC = 0; // Fee in Stock Currency - removed unused val if unused

        if (txn.commission) {
            // Note: Loader logic for ILA commission was sometimes *100.
            const commCurrency = txn.currency ? normalizeCurrency(txn.currency) : this.stockCurrency;

            // Standardize amount
            let commAmount = txn.commission;
            if (commCurrency === Currency.ILA) commAmount = commAmount / 100; // Convert to ILS major

            feePC = convertCurrency(commAmount, commCurrency === Currency.ILA ? Currency.ILS : commCurrency, this.portfolioCurrency, rates);
            // feeSC = convertCurrency(commAmount, commCurrency === Currency.ILA ? Currency.ILS : commCurrency, this.stockCurrency, rates);
        }

        if (isBuy(txn.type)) {
            this.handleBuy(txn, rates, cpi, feePC, options);
        } else if (isSell(txn.type)) {
            return this.handleSell(txn, rates, cpi, feePC, portfolio);
        } else if (txn.type === 'DIVIDEND') {
            // usually handled via addDividend
        } else if (txn.type === 'FEE') {
            this.addMgmtFee(feePC);
            // Also value of the fee transaction itself if it represents a cash deduction
            const val = txn.price ? (txn.price * (txn.qty || 1)) : 0;
            const valPC = convertCurrency(val, txn.currency || this.stockCurrency, this.portfolioCurrency, rates);
            this.addMgmtFee(valPC);
        }
        return {};
    }

    public addDividend(d: DividendRecord) {
        this._dividends.push(d);
    }

    public addMgmtFee(amount: number): void {
        this._accumulatedMgmtFees += amount;
    }

    private handleBuy(txn: Transaction, rates: ExchangeRates, cpi: number, feePC: number, options?: { costBasisOverride?: number, originalDateOverride?: Date }) {
        const qty = txn.qty || 0;
        if (qty <= 0) return;

        // Lookup historical rates for the transaction date
        let effectiveRates = rates ? (rates as any).current : undefined;
        if (rates && txn.date) {
            const d = txn.date;
            const dateKey = (typeof d === 'object' && 'toISOString' in d) ? (d as Date).toISOString().split('T')[0] : String(d).substring(0, 10);
            if ((rates as any)[dateKey]) {
                effectiveRates = (rates as any)[dateKey];
            }
        }

        // Price Resolution
        let pricePerUnitPC = 0;

        if (this.portfolioCurrency === Currency.ILS) {
            const txnCurr = txn.currency ? normalizeCurrency(txn.currency) : null;
            if (txnCurr === Currency.ILS || txnCurr === Currency.ILA) {
                // Trust the transaction currency directly for simple fixed conversions
                pricePerUnitPC = convertCurrency(txn.price || 0, txnCurr, Currency.ILS, effectiveRates);
            } else if (txn.originalPriceILA) {
                // For foreign currencies, prefer the sheet's historical calculation
                pricePerUnitPC = toILS(txn.originalPriceILA, Currency.ILA);
            } else {
                pricePerUnitPC = convertCurrency(txn.price || 0, txn.currency || this.stockCurrency, Currency.ILS, effectiveRates);
            }
        } else {
            const txnCurr = txn.currency ? normalizeCurrency(txn.currency) : null;
            if (txnCurr === Currency.USD) {
                pricePerUnitPC = txn.price || 0;
            } else if (txn.originalPriceUSD) {
                pricePerUnitPC = txn.originalPriceUSD;
            } else {
                pricePerUnitPC = convertCurrency(txn.price || 0, txn.currency || this.stockCurrency, Currency.USD, effectiveRates);
            }
        }

        const rateToPC = pricePerUnitPC / (txn.originalPrice || 1);

        // Fee allocation per unit
        // const feePerUnitPC = feePC / qty;

        // Calculate valUSD and valILS strictly to avoid "Drift" from current rates
        // if we have the original data in that currency.
        let valUSD: number | undefined = txn.originalPriceUSD;
        if (!valUSD) {
            const txnCurr = txn.currency ? normalizeCurrency(txn.currency) : null;
            if (txnCurr === Currency.USD && txn.price) {
                valUSD = txn.price;
            } else if (txn.originalPrice && txnCurr === Currency.USD) {
                valUSD = txn.originalPrice;
            } else {
                valUSD = convertCurrency(pricePerUnitPC, this.portfolioCurrency, Currency.USD, effectiveRates);
            }
        }

        let valILS: number | undefined = undefined;
        if (this.portfolioCurrency === Currency.ILS) {
            valILS = pricePerUnitPC;
        } else if (txn.originalPriceILA) {
            valILS = toILS(txn.originalPriceILA, Currency.ILA);
        } else {
            const txnCurr = txn.currency ? normalizeCurrency(txn.currency) : null;
            if ((txnCurr === Currency.ILS || txnCurr === Currency.ILA) && txn.price) {
                valILS = convertCurrency(pricePerUnitPC, this.portfolioCurrency, Currency.ILS, effectiveRates);
            } else {
                valILS = convertCurrency(pricePerUnitPC, this.portfolioCurrency, Currency.ILS, effectiveRates);
            }
        }

        let costMoney: Money;
        if (options?.costBasisOverride !== undefined) {
            // Override logic for Holding Change (Transfer)
            // We use the provided Cost Basis in Portfolio Currency.
            const forcedCostTotal = options.costBasisOverride;
            const forcedCostPerUnit = qty > 0 ? forcedCostTotal / qty : 0;
            const rateToPC_Override = forcedCostPerUnit / (txn.originalPrice || 1); // Synthetic rate

            costMoney = {
                amount: forcedCostPerUnit,
                currency: this.portfolioCurrency,
                rateToPortfolio: rateToPC_Override,
                valUSD: undefined, // Lost historical context unless we pass it too?
                valILS: undefined  // Lost historical context
            };
        } else {
            costMoney = {
                amount: pricePerUnitPC,
                currency: this.portfolioCurrency,
                rateToPortfolio: rateToPC,
                valUSD: valUSD,
                valILS: valILS
            };
        }

        const totalCostMoney: Money = {
            amount: costMoney.amount * qty,
            currency: this.portfolioCurrency,
            rateToPortfolio: costMoney.rateToPortfolio,
            valUSD: costMoney.valUSD ? costMoney.valUSD * qty : undefined,
            valILS: costMoney.valILS ? costMoney.valILS * qty : undefined
        };

        const feeMoney: Money = {
            amount: feePC,
            currency: this.portfolioCurrency,
            rateToPortfolio: 1,
            valUSD: convertCurrency(feePC, this.portfolioCurrency, Currency.USD, rates),
            valILS: convertCurrency(feePC, this.portfolioCurrency, Currency.ILS, rates)
        };

        const lot: Lot = {
            id: `lot_${txn.numericId || Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            ticker: this.ticker,
            date: new Date(txn.date),
            qty: qty,
            costPerUnit: costMoney,
            costTotal: totalCostMoney,
            feesBuy: feeMoney,
            cpiAtBuy: cpi,
            vestingDate: txn.vestDate ? new Date(txn.vestDate) : undefined,
            isVested: !txn.vestDate || new Date(txn.vestDate) <= new Date(),
            originalTxnId: txn.numericId?.toString() || '',
            notes: txn.comment
        };

        this._lots.push(lot);
        this.recalculateQty();
    }

    private handleSell(txn: Transaction, rates: ExchangeRates, cpi: number, feePC: number, portfolio: Portfolio): { costOfSold?: number, originalDate?: Date } {
        let qtyToSell = txn.qty || 0;
        if (qtyToSell <= 0) return {};

        // Sort active lots by Date (FIFO)
        const activeLots = this.activeLots.sort((a, b) => a.date.getTime() - b.date.getTime());

        // Resolve Sell Price in Portfolio Currency (preferring historical)
        let sellPricePC = 0;
        let totalCostOfSold = 0;

        if (this.portfolioCurrency === Currency.ILS) {
            if (txn.originalPriceILA) {
                sellPricePC = toILS(txn.originalPriceILA, Currency.ILA);
            } else {
                sellPricePC = convertCurrency(txn.price || 0, txn.currency || this.stockCurrency, Currency.ILS, rates);
            }
        } else {
            // USD or Other
            if (this.portfolioCurrency === Currency.USD && txn.originalPriceUSD) {
                sellPricePC = txn.originalPriceUSD;
            } else {
                sellPricePC = convertCurrency(txn.price || 0, txn.currency || this.stockCurrency, this.portfolioCurrency, rates);
            }
        }

        const sellPriceSC = convertCurrency(txn.price || 0, txn.currency || this.stockCurrency, this.stockCurrency, rates);

        const totalSellQty = qtyToSell;

        for (const lot of activeLots) {
            if (qtyToSell <= 0) break;

            const portion = Math.min(lot.qty, qtyToSell);
            let targetLot: Lot;

            if (portion < lot.qty) {
                // Partial Sell - Split
                const remainingQty = lot.qty - portion;

                // Create the sold chunk
                const soldChunk: Lot = {
                    ...lot,
                    id: lot.id + '_sold_' + Date.now(),
                    qty: portion,
                    costTotal: { ...lot.costTotal, amount: lot.costTotal.amount * (portion / lot.qty) },
                    feesBuy: { ...lot.feesBuy, amount: lot.feesBuy.amount * (portion / lot.qty) }
                };

                // Scale nested values
                const scale = portion / lot.qty;
                if (soldChunk.costTotal.valUSD) soldChunk.costTotal.valUSD *= scale;
                if (soldChunk.costTotal.valILS) soldChunk.costTotal.valILS *= scale;
                if (soldChunk.feesBuy.valUSD) soldChunk.feesBuy.valUSD *= scale;
                if (soldChunk.feesBuy.valILS) soldChunk.feesBuy.valILS *= scale;

                // Update Original Lot
                lot.qty = remainingQty;
                lot.costTotal.amount -= soldChunk.costTotal.amount;
                if (lot.costTotal.valUSD) lot.costTotal.valUSD -= soldChunk.costTotal.valUSD!;
                if (lot.costTotal.valILS) lot.costTotal.valILS -= soldChunk.costTotal.valILS!;

                lot.feesBuy.amount -= soldChunk.feesBuy.amount;
                if (lot.feesBuy.valUSD) lot.feesBuy.valUSD -= soldChunk.feesBuy.valUSD!;
                if (lot.feesBuy.valILS) lot.feesBuy.valILS -= soldChunk.feesBuy.valILS!;

                this._lots.push(soldChunk);
                targetLot = soldChunk;
            } else {
                // Full Sell
                targetLot = lot;
            }

            // Mark as Sold
            targetLot.soldDate = new Date(txn.date);

            // Allocate Sell Fees Pro-Rata
            const allocatedSellFeePC = (portion / totalSellQty) * feePC;

            targetLot.soldFees = {
                amount: allocatedSellFeePC,
                currency: this.portfolioCurrency,
                rateToPortfolio: 1
            };

            // Calculate Metrics
            const proceedsPC = portion * sellPricePC;
            const proceedsSC = portion * sellPriceSC;
            const costPC = targetLot.costTotal.amount;
            const buyFeePC = targetLot.feesBuy.amount;

            const netGainPC = proceedsPC - costPC - allocatedSellFeePC - buyFeePC;
            targetLot.realizedGainNet = netGainPC;

            // TAX CALCULATION
            const { cgt } = getTaxRatesForDate(portfolio, txn.date);
            const { taxPolicy } = portfolio;

            let proceedsILS = convertCurrency(proceedsPC, this.portfolioCurrency, Currency.ILS, rates);

            // Override with Historical Data if available (for Tax Purposes)
            if (this.portfolioCurrency === Currency.ILS && txn.originalPriceILA) {
                const histPriceILS = toILS(txn.originalPriceILA, Currency.ILA);
                proceedsILS = portion * histPriceILS;
            } else if (txn.originalPriceILA) {
                const histPriceILS = toILS(txn.originalPriceILA, Currency.ILA);
                proceedsILS = portion * histPriceILS;
            }

            const sellFeeILS = convertCurrency(allocatedSellFeePC, this.portfolioCurrency, Currency.ILS, rates);
            const buyFeeILS = convertCurrency(buyFeePC, this.portfolioCurrency, Currency.ILS, rates);
            const costILS = convertCurrency(costPC, this.portfolioCurrency, Currency.ILS, rates);

            totalCostOfSold += costPC;

            // True Cost ILS (Best Effort)
            const trueCostILS = targetLot.costTotal.valILS || costILS;
            const trueBuyFeeILS = targetLot.feesBuy.valILS || buyFeeILS;

            // Nominal Gain (ILS)
            const nominalGainILS = (proceedsILS - sellFeeILS) - (trueCostILS + trueBuyFeeILS);

            // Real Gain Calculation (Foreign Currency)
            // Gain in Stock Currency (GainSC) = ProceedsSC - CostSC - FeesSC

            // Calculate CostSC
            let costSC = 0;
            if (this.stockCurrency === Currency.USD && targetLot.costTotal.valUSD) {
                costSC = targetLot.costTotal.valUSD;
            } else if (this.stockCurrency === Currency.ILS && targetLot.costTotal.valILS) {
                costSC = targetLot.costTotal.valILS;
            } else {
                costSC = targetLot.costTotal.amount / (targetLot.costTotal.rateToPortfolio || 1);
            }

            const sellFeeSC = convertCurrency(allocatedSellFeePC, this.portfolioCurrency, this.stockCurrency, rates);
            const buyFeeSC = convertCurrency(buyFeePC, this.portfolioCurrency, this.stockCurrency, rates);

            const gainSC = proceedsSC - sellFeeSC - buyFeeSC - costSC;

            let taxableGainILS = 0;

            if (taxPolicy === 'TAX_FREE') {
                taxableGainILS = 0;
            } else if (taxPolicy === 'IL_REAL_GAIN') {
                // Synthesize Historical Rates for Real Gain Calculation
                let calcRates = rates;
                if (proceedsSC > 0 && proceedsILS > 0) {
                    const effectiveRate = proceedsILS / proceedsSC; // e.g. 3.5 ILS / 1 USD

                    // We need to inject this into the rates object correctly.
                    // Assuming 'rates.current' is Key->Value relative to Base (USD=1).
                    // If Stock=USD, Portfolio=ILS, effectiveRate is ILS rate.
                    // If Stock=Other, Portfolio=ILS. 
                    // Logic: update the rate of the Non-Base currency.

                    const newCurrent = { ...rates.current };
                    if (this.stockCurrency === Currency.USD) {
                        // USD is Base (1). Update Portfolio Currency Rate.
                        newCurrent[this.portfolioCurrency] = effectiveRate;
                    } else if (this.portfolioCurrency === Currency.USD) {
                        // Portfolio is Base (1). Update Stock Currency Rate.
                        // Rate = ProceedsUSD / ProceedsStock.
                        // If 100 Stock -> 25 USD. Rate = 0.25 (1 Stock = 0.25 USD).
                        // In rates map: Stock = 1 / 0.25 = 4.0.
                        newCurrent[this.stockCurrency] = 1 / effectiveRate;
                    } else {
                        // Cross Rate. Harder to patch single rate without knowing one side.
                        // Fallback to current rates if not involving USD?
                        // Or assume USD is implicit pivot and just update Portfolio Currency relative to implicit 1?
                        // If we assume Stocks are priced in USD?
                        // If we just want X -> Y conversion to equal Z.
                        // convertCurrency(A, X, Y) = A * (Y_Rate / X_Rate).
                        // We want A * (Y/X) = Effective.
                        // Y/X = Effective/A? No.
                        // We want convertCurrency(gainSC) to use effectiveRate.
                        // gainSC * (RateILs / RateUSD) = gainSC * 3.5.
                        // If Stock=USD (Rate=1), RateILS must be 3.5.
                        if (newCurrent[this.stockCurrency] === 1) {
                            newCurrent[this.portfolioCurrency] = effectiveRate;
                        }
                    }
                    calcRates = { ...rates, current: newCurrent };
                }

                taxableGainILS = computeRealTaxableGain(
                    nominalGainILS,
                    gainSC,
                    trueCostILS + trueBuyFeeILS,
                    this.stockCurrency,
                    Currency.ILS,
                    targetLot.cpiAtBuy,
                    cpi,
                    calcRates
                );
            } else {
                taxableGainILS = nominalGainILS;
            }

            targetLot.realizedTaxableGainILS = taxableGainILS;
            const taxILS = Math.max(0, taxableGainILS) * cgt;
            targetLot.realizedTax = taxILS; // Lot keeps 'realizedTax' for now as per interface
            targetLot.realizedTaxPC = convertCurrency(taxILS, Currency.ILS, this.portfolioCurrency, rates);

            if (txn.type !== 'SELL_TRANSFER') {
                this.realizedCapitalGainsTax += targetLot.realizedTaxPC; // Accumulate in PC
            }

            // INCOME TAX (RSU Vest Value Tax)
            if (portfolio.incTax && portfolio.incTax > 0) {
                // Assuming IncTax applies to the Cost Basis (Grant Value)
                // costPC is the cost of the SOLD portion.
                const incomeTaxPC = costPC * portfolio.incTax;
                targetLot.realizedIncomeTaxPC = incomeTaxPC;
                if (txn.type !== 'SELL_TRANSFER') {
                    this.realizedIncomeTax += incomeTaxPC;
                }
            }

            // Total Tax per Lot
            targetLot.totalRealizedTaxPC = (targetLot.realizedTaxPC || 0) + (targetLot.realizedIncomeTaxPC || 0);

            // Override for SELL_TRANSFER (No Realized Gain/Tax reported)
            // Override for SELL_TRANSFER (No Realized Gain/Tax reported)
            if (txn.type === 'SELL_TRANSFER') {
                targetLot.realizedGainNet = 0;
                targetLot.realizedTax = 0;
                targetLot.realizedTaxPC = 0;
                targetLot.realizedIncomeTaxPC = 0;
                targetLot.totalRealizedTaxPC = 0;
                targetLot.realizedTaxableGainILS = 0;
            }

            qtyToSell -= portion;
        }

        this.recalculateQty();

        return {
            costOfSold: totalCostOfSold,
        };
    }

    // --- Getters (Computed Properties) ---

    get lots(): ReadonlyArray<Lot> { return this._lots; }
    get transactions(): ReadonlyArray<Transaction> { return this._transactions; }
    get dividends(): ReadonlyArray<DividendRecord> { return this._dividends; }

    get activeLots(): Lot[] { return this._lots.filter(l => !l.soldDate && l.qty > 0); }
    get vestedLots(): Lot[] { return this._lots.filter(l => !l.soldDate && l.qty > 0 && l.isVested); }
    get realizedLots(): Lot[] { return this._lots.filter(l => l.soldDate); }
    get combinedLots(): Lot[] { return this._lots; }

    get marketValueTotal(): SimpleMoney {
        return {
            amount: this.marketValueVested.amount + this.marketValueUnvested.amount,
            currency: this.stockCurrency
        };
    }

    get unrealizedGainPct(): number {
        if (this.costBasisVested.amount === 0) return 0;
        return this.unrealizedGain.amount / this.costBasisVested.amount;
    }

    /**
     * Aggregated Realized Tax in Portfolio Currency (PC).
     * Sums:
     * 1. Realized Capital Gains Tax from Sold Lots
     * 2. Realized Income Tax from Sold Lots (e.g. RSU Vest Value tax, paid upon Sale)
     * 3. Tax on Dividends
     */
    get totalTaxPaidPC(): number {
        const salesTax = this.realizedLots.reduce((sum, lot) => sum + (lot.realizedTaxPC || 0), 0);
        const incomeTax = this.realizedLots.reduce((sum, lot) => sum + (lot.realizedIncomeTaxPC || 0), 0);
        const divTax = this._dividends.reduce((sum, d) => sum + (d.taxAmountPC || 0), 0);
        return salesTax + incomeTax + divTax;
    }

    /**
     * Calculates the gain for this holding over a specific period.
     * Uses "Initial Value vs Final Value" logic (Simple Return), not Time-Weighted Return.
     */
    public generateGainForPeriod(
        startDate: Date,
        historyProvider: (ticker: string) => any, // Returns { historical: { date: Date, price: number }[] }
        rates: ExchangeRates,
        initialRates?: Record<string, number>
    ): {
        gain: MultiCurrencyValue,
        initialValue: MultiCurrencyValue,
        finalValue: MultiCurrencyValue,
        gainPct: number
    } {
        let initialVal = MultiCurrencyValue.zero();
        let finalVal = MultiCurrencyValue.zero();

        // Ensure start of day
        const startTime = new Date(startDate).setUTCHours(0, 0, 0, 0);

        // Fetch historical data once if needed
        const historyData = historyProvider(this.ticker);
        const getPriceAtDate = (date: Date): number => {
            if (!historyData?.historical) return 0;
            const t = date.getTime();
            // Assuming sorted ascending
            // Find last point <= t
            let found = historyData.historical[0];
            for (let i = 0; i < historyData.historical.length; i++) {
                if (new Date(historyData.historical[i].date).getTime() > t) break;
                found = historyData.historical[i];
            }
            return found?.price || found?.adjClose || 0;
        };

        // Price at Start Date (for lots held through)
        // Only fetch if we have lots that need it
        let priceAtStart = 0;
        let priceAtStartFetched = false;

        const lots = this._lots; // All lots

        for (const lot of lots) {
            // Exclude Unvested Lots
            if (!lot.isVested) continue;

            // 1. Filter: If sold before start date, it contributes nothing to this period's gain
            if (lot.soldDate && lot.soldDate.getTime() < startTime) continue;

            // 2. Initial Value
            let lotInitial = MultiCurrencyValue.zero();

            if (lot.date.getTime() >= startTime) {
                // Bought during period -> Initial = Cost Basis
                // Use stored USD/ILS values if available
                const usd = lot.costTotal.valUSD || convertCurrency(lot.costTotal.amount, lot.costTotal.currency, Currency.USD, rates);
                const ils = lot.costTotal.valILS || convertCurrency(lot.costTotal.amount, lot.costTotal.currency, Currency.ILS, rates);
                lotInitial = new MultiCurrencyValue(usd, ils);
            } else {
                // Held through start date -> Initial = Market Value at Start Date
                if (!priceAtStartFetched) {
                    priceAtStart = getPriceAtDate(startDate);
                    priceAtStartFetched = true;
                }

                if (priceAtStart <= 0) {
                    continue; // Missing history
                }

                // Val = Qty * PriceAtStart
                const valSC = lot.qty * priceAtStart;

                // Use initialRates if provided, otherwise current rates fallback
                const ratesToUse = initialRates || rates.current;

                // Construct synthetic rates for conversion
                const synthRates: ExchangeRates = { ...rates, current: ratesToUse };

                lotInitial = new MultiCurrencyValue(
                    convertCurrency(valSC, this.stockCurrency, Currency.USD, synthRates),
                    convertCurrency(valSC, this.stockCurrency, Currency.ILS, synthRates)
                );
            }

            initialVal = initialVal.add(lotInitial);

            // 3. Final Value
            let lotFinal = MultiCurrencyValue.zero();

            if (lot.soldDate) {
                // Sold during period -> Final = Proceeds
                const costPC = lot.costTotal.amount;
                const netGainPC = lot.realizedGainNet || 0;
                const buyFeePC = lot.feesBuy.amount;
                const sellFeePC = lot.soldFees?.amount || 0;

                const proceedsPC = costPC + netGainPC + buyFeePC + sellFeePC;

                // Use current rates for realized proceeds
                lotFinal = new MultiCurrencyValue(
                    convertCurrency(proceedsPC, this.portfolioCurrency, Currency.USD, rates),
                    convertCurrency(proceedsPC, this.portfolioCurrency, Currency.ILS, rates)
                );

            } else {
                // Active -> Final = Current Market Value
                const currentPrice = this.currentPrice;
                const valSC = lot.qty * currentPrice;
                lotFinal = new MultiCurrencyValue(
                    convertCurrency(valSC, this.stockCurrency, Currency.USD, rates),
                    convertCurrency(valSC, this.stockCurrency, Currency.ILS, rates)
                );
            }

            finalVal = finalVal.add(lotFinal);
        }

        let gain = finalVal.sub(initialVal);

        // Add Dividends received during period
        for (const div of this._dividends) {
            if (div.date.getTime() >= startTime) {
                const divVal = new MultiCurrencyValue(
                    convertCurrency(div.netAmountPC, this.portfolioCurrency, Currency.USD, rates),
                    convertCurrency(div.netAmountPC, this.portfolioCurrency, Currency.ILS, rates)
                );

                finalVal = finalVal.add(divVal);
                gain = gain.add(divVal);
            }
        }

        return {
            gain,
            initialValue: initialVal,
            finalValue: finalVal,
            gainPct: 0 // Caller will compute
        };
    }
}
