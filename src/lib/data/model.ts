
import { Currency, Exchange, type Transaction, type ExchangeRates, type Portfolio } from '../types';
import { convertCurrency, toILS, normalizeCurrency } from '../currencyUtils';
import { getTaxRatesForDate } from '../portfolioUtils';

// --- Types ---

export interface DividendEvent {
    ticker: string;
    exchange: Exchange;
    date: Date;
    amount: number;
    source: string;
}

import type { SimpleMoney } from '../types';

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
    realizedTax?: number; // Cached measure of tax liability
    realizedTaxableGainILS?: number; // Specific for tax reporting

    // Unrealized Tax (Active Lots)
    unrealizedTax?: number; // Estimated tax liability in Portfolio Currency
    inflationAdjustedCost?: number; // Portfolio Currency (Active Lots only)
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

    if (portfolioCurrency === Currency.ILS && (stockCurrency === Currency.ILS || stockCurrency === Currency.ILA)) {
        const inflationRate = (cpiStart > 0) ? (cpiEnd / cpiStart) - 1 : 0;
        const inflationAdj = Math.max(0, costBasisPC * inflationRate);
        taxableGain -= inflationAdj;
    } else if (portfolioCurrency !== stockCurrency) {
        // Evaluate if gain in Stock Currency is lower (when converted to PC)
        // Foreign Currency Exception approximation
        const realGainPC = convertCurrency(gainSC, stockCurrency, portfolioCurrency, exchangeRates);
        taxableGain = Math.min(taxableGain, realGainPC);
    }
    return taxableGain;
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
    public inflationAdjustedCost?: number; // Portfolio Currency

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
    public perf1w: number = 0;
    public perf1m: number = 0;
    public perf3m: number = 0;
    public perfYtd: number = 0;
    public perf1y: number = 0;
    public perf3y: number = 0;
    public perf5y: number = 0;

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
    realizedTax: number;
    unrealizedTaxLiabilityILS: number;
    unrealizedTaxableGainILS: number; 

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

        this.realizedTax = 0;
        this.unrealizedTaxLiabilityILS = 0;
        this.unrealizedTaxableGainILS = 0;
    }

    // --- Core Logic ---

    public addTransaction(txn: Transaction, rates: ExchangeRates, cpiData: any, portfolio: Portfolio): void {
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

        if (txn.type === 'BUY') {
            this.handleBuy(txn, rates, cpi, feePC);
        } else if (txn.type === 'SELL') {
            this.handleSell(txn, rates, cpi, feePC, portfolio);
        } else if (txn.type === 'DIVIDEND') {
            // usually handled via addDividend
        } else if (txn.type === 'FEE') {
            this.addMgmtFee(feePC);
            // Also value of the fee transaction itself if it represents a cash deduction
            const val = txn.price ? (txn.price * (txn.qty || 1)) : 0;
            const valPC = convertCurrency(val, txn.currency || this.stockCurrency, this.portfolioCurrency, rates);
            this.addMgmtFee(valPC);
        }
    }

    public addDividend(d: DividendRecord) {
        this._dividends.push(d);
    }

    public addMgmtFee(amount: number): void {
        this._accumulatedMgmtFees += amount;
    }

    private handleBuy(txn: Transaction, rates: ExchangeRates, cpi: number, feePC: number) {
        const qty = txn.qty || 0;
        if (qty <= 0) return;

        // Price Resolution
        let pricePerUnitPC = 0;

        if (this.portfolioCurrency === Currency.ILS) {
            const txnCurr = txn.currency ? normalizeCurrency(txn.currency) : null;
            if (txnCurr === Currency.ILS || txnCurr === Currency.ILA) {
                // Trust the transaction currency directly for simple fixed conversions
                pricePerUnitPC = convertCurrency(txn.price || 0, txnCurr, Currency.ILS, rates);
            } else if (txn.originalPriceILA) {
                // For foreign currencies, prefer the sheet's historical calculation
                pricePerUnitPC = toILS(txn.originalPriceILA, Currency.ILA);
            } else {
                pricePerUnitPC = convertCurrency(txn.price || 0, txn.currency || this.stockCurrency, Currency.ILS, rates);
            }
        } else {
            const txnCurr = txn.currency ? normalizeCurrency(txn.currency) : null;
            if (txnCurr === Currency.USD) {
                pricePerUnitPC = txn.price || 0;
            } else if (txn.originalPriceUSD) {
                pricePerUnitPC = txn.originalPriceUSD;
            } else {
                pricePerUnitPC = convertCurrency(txn.price || 0, txn.currency || this.stockCurrency, Currency.USD, rates);
            }
        }

        const rateToPC = pricePerUnitPC / (txn.originalPrice || 1);

        // Fee allocation per unit
        // const feePerUnitPC = feePC / qty;

        const costMoney: Money = {
            amount: pricePerUnitPC,
            currency: this.portfolioCurrency,
            rateToPortfolio: rateToPC,
            valUSD: txn.originalPriceUSD || convertCurrency(pricePerUnitPC, this.portfolioCurrency, Currency.USD, rates),
            valILS: (this.portfolioCurrency === Currency.ILS) ? pricePerUnitPC : (txn.originalPriceILA ? toILS(txn.originalPriceILA, Currency.ILA) : convertCurrency(pricePerUnitPC, this.portfolioCurrency, Currency.ILS, rates))
        };

        const totalCostMoney: Money = {
            amount: pricePerUnitPC * qty,
            currency: this.portfolioCurrency,
            rateToPortfolio: rateToPC,
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
    }

    private handleSell(txn: Transaction, rates: ExchangeRates, cpi: number, feePC: number, portfolio: Portfolio) {
        let qtyToSell = txn.qty || 0;
        if (qtyToSell <= 0) return;

        // Sort active lots by Date (FIFO)
        const activeLots = this.activeLots.sort((a, b) => a.date.getTime() - b.date.getTime());

        const sellPricePC = convertCurrency(txn.price || 0, txn.currency || this.stockCurrency, this.portfolioCurrency, rates);
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

            const sellFeeILS = convertCurrency(allocatedSellFeePC, this.portfolioCurrency, Currency.ILS, rates);
            const buyFeeILS = convertCurrency(buyFeePC, this.portfolioCurrency, Currency.ILS, rates);

            const proceedsILS = convertCurrency(proceedsPC, this.portfolioCurrency, Currency.ILS, rates);
            const costILS = convertCurrency(costPC, this.portfolioCurrency, Currency.ILS, rates);

            const nominalGainSC = proceedsSC - convertCurrency(allocatedSellFeePC, this.portfolioCurrency, this.stockCurrency, rates)
                - convertCurrency(buyFeePC, this.portfolioCurrency, this.stockCurrency, rates);

            let taxableGainILS = 0;

            if (taxPolicy === 'TAX_FREE') {
                taxableGainILS = 0;
            } else if (taxPolicy === 'REAL_GAIN') {
                taxableGainILS = computeRealTaxableGain(
                    (proceedsILS - sellFeeILS) - (costILS + buyFeeILS),
                    nominalGainSC,
                    costILS + buyFeeILS,
                    this.stockCurrency,
                    Currency.ILS,
                    targetLot.cpiAtBuy,
                    cpi,
                    rates
                );
            } else {
                taxableGainILS = (proceedsILS - sellFeeILS) - (costILS + buyFeeILS);
            }

            targetLot.realizedTaxableGainILS = taxableGainILS;
            targetLot.realizedTax = Math.max(0, taxableGainILS) * cgt;

            qtyToSell -= portion;
        }
    }

    // --- Getters (Computed Properties) ---

    get lots(): ReadonlyArray<Lot> { return this._lots; }
    get transactions(): ReadonlyArray<Transaction> { return this._transactions; }
    get dividends(): ReadonlyArray<DividendRecord> { return this._dividends; }

    // Getters for specific Lot filters
    get activeLots(): Lot[] { return this._lots.filter(l => !l.soldDate && l.qty > 0); }
    get realizedLots(): Lot[] { return this._lots.filter(l => l.soldDate); }
    get combinedLots(): Lot[] { return this._lots; }

    // Legacy getters removed in favor of explicit properties populated by Engine

}