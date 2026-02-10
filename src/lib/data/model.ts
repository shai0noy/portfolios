
import { Currency, Exchange, type Transaction, type ExchangeRates, type Portfolio } from '../types';
import { convertCurrency, toILS, normalizeCurrency } from '../currencyUtils';
import { getTaxRatesForDate } from '../portfolioUtils';

// --- Types ---
import { MultiCurrencyValue } from './multiCurrency';

export interface DividendEvent {
    ticker: string;
    exchange: Exchange;
    date: Date;
    amount: number;
    source: string;
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
            const taxILS = Math.max(0, taxableGainILS) * cgt;
            targetLot.realizedTax = taxILS; // Lot keeps 'realizedTax' for now as per interface
            targetLot.realizedTaxPC = convertCurrency(taxILS, Currency.ILS, this.portfolioCurrency, rates);

            this.realizedCapitalGainsTax += targetLot.realizedTaxPC; // Accumulate in PC

            // INCOME TAX (RSU Vest Value Tax)
            if (portfolio.incTax && portfolio.incTax > 0) {
                // Assuming IncTax applies to the Cost Basis (Grant Value)
                // costPC is the cost of the SOLD portion.
                const incomeTaxPC = costPC * portfolio.incTax;
                targetLot.realizedIncomeTaxPC = incomeTaxPC;
                this.realizedIncomeTax += incomeTaxPC;
            }

            // Total Tax per Lot
            targetLot.totalRealizedTaxPC = (targetLot.realizedTaxPC || 0) + (targetLot.realizedIncomeTaxPC || 0);

            qtyToSell -= portion;
        }
    }

    // --- Getters (Computed Properties) ---

    get lots(): ReadonlyArray<Lot> { return this._lots; }
    get transactions(): ReadonlyArray<Transaction> { return this._transactions; }
    get dividends(): ReadonlyArray<DividendRecord> { return this._dividends; }

    get activeLots(): Lot[] { return this._lots.filter(l => !l.soldDate && l.qty > 0); }
    get realizedLots(): Lot[] { return this._lots.filter(l => l.soldDate); }
    get combinedLots(): Lot[] { return this._lots; }

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
        rates: ExchangeRates
    ): {
        gain: MultiCurrencyValue,
        initialValue: MultiCurrencyValue,
        finalValue: MultiCurrencyValue,
        gainPct: number
    } {
        const initialVal = new MultiCurrencyValue(0, 0);
        const finalVal = new MultiCurrencyValue(0, 0);

        // Ensure start of day
        const startTime = new Date(startDate).setUTCHours(0, 0, 0, 0);

        // Fetch historical data once if needed
        const historyData = historyProvider(this.ticker);
        const getPriceAtDate = (date: Date): number => {
            if (!historyData?.historical) return 0;
            // Find closest price on or before date? Or after?
            // Usually "price at start date" means closing price of that day or previous available.
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
            // 1. Filter: If sold before start date, it contributes nothing to this period's gain
            if (lot.soldDate && lot.soldDate.getTime() < startTime) continue;

            // 2. Initial Value
            // If bought AFTER start date: Initial = Cost Basis (Value flowing in)
            // If bought BEFORE start date: Initial = Market Value at Start Date

            let lotInitialUSD = 0;
            let lotInitialILS = 0;

            if (lot.date.getTime() >= startTime) {
                // Bought during period
                lotInitialUSD = lot.costTotal.valUSD || convertCurrency(lot.costTotal.amount, lot.costTotal.currency, Currency.USD, rates);
                lotInitialILS = lot.costTotal.valILS || convertCurrency(lot.costTotal.amount, lot.costTotal.currency, Currency.ILS, rates);
            } else {
                // Held through start date
                if (!priceAtStartFetched) {
                    priceAtStart = getPriceAtDate(startDate);
                    priceAtStartFetched = true;
                }

                if (priceAtStart <= 0) {
                    // Missing history for start date, cannot calculate gain for this lot.
                    // Skipping it ensures we don't have 0 Initial Value with >0 Final Value (infinite gain).
                    continue;
                }

                // Val = Qty * PriceAtStart
                // We need Price in USD and ILS. 
                // Price usually in Stock Currency.
                const valSC = lot.qty * priceAtStart;
                lotInitialUSD = convertCurrency(valSC, this.stockCurrency, Currency.USD, rates);
                lotInitialILS = convertCurrency(valSC, this.stockCurrency, Currency.ILS, rates);
            }

            initialVal.valUSD += lotInitialUSD;
            initialVal.valILS += lotInitialILS;

            // 3. Final Value
            // If sold during period: Final = Proceeds (Realized Value)
            // If active: Final = Current Market Value

            let lotFinalUSD = 0;
            let lotFinalILS = 0;

            if (lot.soldDate) {
                // Sold during period (we already filtered sold-before-start)
                // Proceeds
                // we need proceedsTotal for this Lot?
                // Lot doesn't strictly store 'proceedsTotal' directly, it stores 'soldPricePerUnit' * qty?
                // We computed it in handleSell but stored only Net Gain usually.
                // Reconstruct proceeds:
                // We know soldDate, quantity (lot.qty is sold qty for realized lots).
                // Wait, `lot.qty` is the quantity of the lot. 
                // `handleSell` creates a new lot for sold portion.
                // So reliable: `quantity * soldPrice`.
                // But we don't store `soldPrice` on the lot easily accessible except `soldPricePerUnit`?
                // Actually `handleSell` DOES set `soldPricePerUnit`?
                // Checking `handleSell`... it DOES NOT set `soldPricePerUnit` explicitly on the lot! 
                // It calculates `proceedsPC` and sets `realizedGainNet`.
                // It does NOT store the gross proceeds persistently on the lot object in `handleSell`.

                // PROBLEM: We need Gross Proceeds for "Final Value".
                // We have `realizedGainNet`, `costTotal`, `fees`?
                // Proceeds = Cost + NetGain + Fees + SoldFees?
                // Yes.
                const costPC = lot.costTotal.amount;
                const netGainPC = lot.realizedGainNet || 0;
                const buyFeePC = lot.feesBuy.amount;
                const sellFeePC = lot.soldFees?.amount || 0;

                // PC Amount
                const proceedsPC = costPC + netGainPC + buyFeePC + sellFeePC;

                // Convert PC to USD/ILS
                lotFinalUSD = convertCurrency(proceedsPC, this.portfolioCurrency, Currency.USD, rates);
                lotFinalILS = convertCurrency(proceedsPC, this.portfolioCurrency, Currency.ILS, rates);

            } else {
                // Active
                const currentPrice = this.currentPrice; // Live price
                const valSC = lot.qty * currentPrice;
                lotFinalUSD = convertCurrency(valSC, this.stockCurrency, Currency.USD, rates);
                lotFinalILS = convertCurrency(valSC, this.stockCurrency, Currency.ILS, rates);
            }

            finalVal.valUSD += lotFinalUSD;
            finalVal.valILS += lotFinalILS;
        }

        const gain = finalVal.sub(initialVal);

        // Add Dividends received during period?
        // Logic says: "Value Gain" usually includes dividends.
        // For each dividend: if date >= startDate, add to Final Value (as it's cash flowing out/received).
        // Initial Value of dividend is 0 (it's generated).
        for (const div of this._dividends) {
            if (div.date.getTime() >= startTime) {
                // Add Gross or Net?
                // "Value Gain" -> usually Gross Dividend (before tax) or Net?
                // User said "compute the value gain... simailar logic that HoldingDetails use".
                // HoldingDetails uses Net usually for "Realized Gain".
                // Let's use Net Amount PC for consistency with Realized Gain being Net.
                // Or maybe Gross?
                // If we want "Performance", TWR uses Gross + Reinvest.
                // If we want "My Pocket Gain", Net is better.
                // Let's use Net Amount PC.
                const divUSD = convertCurrency(div.netAmountPC, this.portfolioCurrency, Currency.USD, rates);
                const divILS = convertCurrency(div.netAmountPC, this.portfolioCurrency, Currency.ILS, rates);

                finalVal.valUSD += divUSD;
                finalVal.valILS += divILS;
                gain.valUSD += divUSD;
                gain.valILS += divILS;
            }
        }

    // Pct Gain
    // If initial value is 0 (e.g. started from 0 with no cost basis? or just bought today), handle gracefully.
    // We use USD for Pct calculation standardization, or return separate Pcts?
    // User said: "compute a currency adjusted pct gain in each currency according to its current value. We will display the relevant one."
    // So we need Pct per currency?
    // The return type has single `gainPct`.
    // Let's provide a helper to choose. Or we return MultiCurrencyValue Pct?
    // But simplified: Pct is usually unified if FX neutral, but here FX matters.
    // Let's calculate Pct based on Portfolio Preference?
    // Actually, let's just use USD as default for "Global" or rely on caller to pick.
    // But typically we display in "Display Currency".
    // Let's calculate gainPct as:
    // (Gain in Display / Initial in Display).
    // Since we don't know Display Currency here (we have USD/ILS), we can expose method to get fractional gain.
    // Let's just return the MultiValues. The caller will convert Gain and Initial to Display and divide.

        return {
            gain,
            initialValue: initialVal,
            finalValue: finalVal,
            gainPct: 0 // Caller will compute
        };
    }
}