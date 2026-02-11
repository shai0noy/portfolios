"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Holding = exports.getCPI = exports.MultiCurrencyValue = void 0;
exports.getHistoricalRates = getHistoricalRates;
exports.computeRealTaxableGain = computeRealTaxableGain;
const types_1 = require("../types");
const currencyUtils_1 = require("../currencyUtils");
const portfolioUtils_1 = require("../portfolioUtils");
// --- Types ---
const multiCurrency_1 = require("./multiCurrency");
Object.defineProperty(exports, "MultiCurrencyValue", { enumerable: true, get: function () { return multiCurrency_1.MultiCurrencyValue; } });
function getHistoricalRates(rates, period) {
    const rateKeyMap = {
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
        return rates[key];
    }
    return undefined;
}
// --- Helpers ---
// Helper to interpolate CPI
const getCPI = (date, cpiData) => {
    if (!cpiData?.historical || cpiData.historical.length === 0)
        return 100;
    const timestamp = date.getTime();
    const history = cpiData.historical;
    if (timestamp >= history[0].date.getTime())
        return history[0].price;
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
exports.getCPI = getCPI;
// Helper to compute Real Taxable Gain
function computeRealTaxableGain(nominalGainPC, gainSC, costBasisPC, stockCurrency, portfolioCurrency, cpiStart, cpiEnd, exchangeRates) {
    let taxableGain = nominalGainPC;
    if (portfolioCurrency === types_1.Currency.ILS && (stockCurrency === types_1.Currency.ILS || stockCurrency === types_1.Currency.ILA)) {
        const inflationRate = (cpiStart > 0) ? (cpiEnd / cpiStart) - 1 : 0;
        const inflationAdj = Math.max(0, costBasisPC * inflationRate);
        taxableGain -= inflationAdj;
    }
    else if (portfolioCurrency !== stockCurrency) {
        // Evaluate if gain in Stock Currency is lower (when converted to PC)
        // Foreign Currency Exception approximation
        const realGainPC = (0, currencyUtils_1.convertCurrency)(gainSC, stockCurrency, portfolioCurrency, exchangeRates);
        taxableGain = Math.min(taxableGain, realGainPC);
    }
    return taxableGain;
}
// --- Holding Class ---
class Holding {
    constructor(portfolioId, ticker, exchange, stockCurrency, portfolioCurrency, displayName) {
        // State (Mutable)
        this._lots = [];
        this._transactions = []; // Raw history
        this._dividends = [];
        // Holding-Level Fees (Accumulators)
        this._accumulatedMgmtFees = 0; // Portfolio Currency
        // Market Data (Mutable)
        this.currentPrice = 0;
        this.dayChangePct = 0;
        this.portfolioId = portfolioId;
        this.ticker = ticker;
        this.exchange = exchange;
        this.stockCurrency = stockCurrency;
        this.portfolioCurrency = portfolioCurrency;
        this.displayName = displayName || ticker;
        this.id = `${portfolioId}_${ticker}`;
        this._lots = [];
        this._dividends = [];
        const zeroPC = { amount: 0, currency: portfolioCurrency };
        const zeroSC = { amount: 0, currency: stockCurrency };
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
    addTransaction(txn, rates, cpiData, portfolio) {
        this._transactions.push(txn);
        const date = new Date(txn.date);
        const cpi = (0, exports.getCPI)(date, cpiData);
        // Resolve Fees
        let feePC = 0;
        // let feeSC = 0; // Fee in Stock Currency - removed unused val if unused
        if (txn.commission) {
            // Note: Loader logic for ILA commission was sometimes *100.
            const commCurrency = txn.currency ? (0, currencyUtils_1.normalizeCurrency)(txn.currency) : this.stockCurrency;
            // Standardize amount
            let commAmount = txn.commission;
            if (commCurrency === types_1.Currency.ILA)
                commAmount = commAmount / 100; // Convert to ILS major
            feePC = (0, currencyUtils_1.convertCurrency)(commAmount, commCurrency === types_1.Currency.ILA ? types_1.Currency.ILS : commCurrency, this.portfolioCurrency, rates);
            // feeSC = convertCurrency(commAmount, commCurrency === Currency.ILA ? Currency.ILS : commCurrency, this.stockCurrency, rates);
        }
        if (txn.type === 'BUY') {
            this.handleBuy(txn, rates, cpi, feePC);
        }
        else if (txn.type === 'SELL') {
            this.handleSell(txn, rates, cpi, feePC, portfolio);
        }
        else if (txn.type === 'DIVIDEND') {
            // usually handled via addDividend
        }
        else if (txn.type === 'FEE') {
            this.addMgmtFee(feePC);
            // Also value of the fee transaction itself if it represents a cash deduction
            const val = txn.price ? (txn.price * (txn.qty || 1)) : 0;
            const valPC = (0, currencyUtils_1.convertCurrency)(val, txn.currency || this.stockCurrency, this.portfolioCurrency, rates);
            this.addMgmtFee(valPC);
        }
    }
    addDividend(d) {
        this._dividends.push(d);
    }
    addMgmtFee(amount) {
        this._accumulatedMgmtFees += amount;
    }
    handleBuy(txn, rates, cpi, feePC) {
        const qty = txn.qty || 0;
        if (qty <= 0)
            return;
        // Price Resolution
        let pricePerUnitPC = 0;
        if (this.portfolioCurrency === types_1.Currency.ILS) {
            const txnCurr = txn.currency ? (0, currencyUtils_1.normalizeCurrency)(txn.currency) : null;
            if (txnCurr === types_1.Currency.ILS || txnCurr === types_1.Currency.ILA) {
                // Trust the transaction currency directly for simple fixed conversions
                pricePerUnitPC = (0, currencyUtils_1.convertCurrency)(txn.price || 0, txnCurr, types_1.Currency.ILS, rates);
            }
            else if (txn.originalPriceILA) {
                // For foreign currencies, prefer the sheet's historical calculation
                pricePerUnitPC = (0, currencyUtils_1.toILS)(txn.originalPriceILA, types_1.Currency.ILA);
            }
            else {
                pricePerUnitPC = (0, currencyUtils_1.convertCurrency)(txn.price || 0, txn.currency || this.stockCurrency, types_1.Currency.ILS, rates);
            }
        }
        else {
            const txnCurr = txn.currency ? (0, currencyUtils_1.normalizeCurrency)(txn.currency) : null;
            if (txnCurr === types_1.Currency.USD) {
                pricePerUnitPC = txn.price || 0;
            }
            else if (txn.originalPriceUSD) {
                pricePerUnitPC = txn.originalPriceUSD;
            }
            else {
                pricePerUnitPC = (0, currencyUtils_1.convertCurrency)(txn.price || 0, txn.currency || this.stockCurrency, types_1.Currency.USD, rates);
            }
        }
        const rateToPC = pricePerUnitPC / (txn.originalPrice || 1);
        // Fee allocation per unit
        // const feePerUnitPC = feePC / qty;
        const costMoney = {
            amount: pricePerUnitPC,
            currency: this.portfolioCurrency,
            rateToPortfolio: rateToPC,
            valUSD: txn.originalPriceUSD || (0, currencyUtils_1.convertCurrency)(pricePerUnitPC, this.portfolioCurrency, types_1.Currency.USD, rates),
            valILS: (this.portfolioCurrency === types_1.Currency.ILS) ? pricePerUnitPC : (txn.originalPriceILA ? (0, currencyUtils_1.toILS)(txn.originalPriceILA, types_1.Currency.ILA) : (0, currencyUtils_1.convertCurrency)(pricePerUnitPC, this.portfolioCurrency, types_1.Currency.ILS, rates))
        };
        const totalCostMoney = {
            amount: pricePerUnitPC * qty,
            currency: this.portfolioCurrency,
            rateToPortfolio: rateToPC,
            valUSD: costMoney.valUSD ? costMoney.valUSD * qty : undefined,
            valILS: costMoney.valILS ? costMoney.valILS * qty : undefined
        };
        const feeMoney = {
            amount: feePC,
            currency: this.portfolioCurrency,
            rateToPortfolio: 1,
            valUSD: (0, currencyUtils_1.convertCurrency)(feePC, this.portfolioCurrency, types_1.Currency.USD, rates),
            valILS: (0, currencyUtils_1.convertCurrency)(feePC, this.portfolioCurrency, types_1.Currency.ILS, rates)
        };
        const lot = {
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
    handleSell(txn, rates, cpi, feePC, portfolio) {
        let qtyToSell = txn.qty || 0;
        if (qtyToSell <= 0)
            return;
        // Sort active lots by Date (FIFO)
        const activeLots = this.activeLots.sort((a, b) => a.date.getTime() - b.date.getTime());
        const sellPricePC = (0, currencyUtils_1.convertCurrency)(txn.price || 0, txn.currency || this.stockCurrency, this.portfolioCurrency, rates);
        const sellPriceSC = (0, currencyUtils_1.convertCurrency)(txn.price || 0, txn.currency || this.stockCurrency, this.stockCurrency, rates);
        const totalSellQty = qtyToSell;
        for (const lot of activeLots) {
            if (qtyToSell <= 0)
                break;
            const portion = Math.min(lot.qty, qtyToSell);
            let targetLot;
            if (portion < lot.qty) {
                // Partial Sell - Split
                const remainingQty = lot.qty - portion;
                // Create the sold chunk
                const soldChunk = {
                    ...lot,
                    id: lot.id + '_sold_' + Date.now(),
                    qty: portion,
                    costTotal: { ...lot.costTotal, amount: lot.costTotal.amount * (portion / lot.qty) },
                    feesBuy: { ...lot.feesBuy, amount: lot.feesBuy.amount * (portion / lot.qty) }
                };
                // Scale nested values
                const scale = portion / lot.qty;
                if (soldChunk.costTotal.valUSD)
                    soldChunk.costTotal.valUSD *= scale;
                if (soldChunk.costTotal.valILS)
                    soldChunk.costTotal.valILS *= scale;
                if (soldChunk.feesBuy.valUSD)
                    soldChunk.feesBuy.valUSD *= scale;
                if (soldChunk.feesBuy.valILS)
                    soldChunk.feesBuy.valILS *= scale;
                // Update Original Lot
                lot.qty = remainingQty;
                lot.costTotal.amount -= soldChunk.costTotal.amount;
                if (lot.costTotal.valUSD)
                    lot.costTotal.valUSD -= soldChunk.costTotal.valUSD;
                if (lot.costTotal.valILS)
                    lot.costTotal.valILS -= soldChunk.costTotal.valILS;
                lot.feesBuy.amount -= soldChunk.feesBuy.amount;
                if (lot.feesBuy.valUSD)
                    lot.feesBuy.valUSD -= soldChunk.feesBuy.valUSD;
                if (lot.feesBuy.valILS)
                    lot.feesBuy.valILS -= soldChunk.feesBuy.valILS;
                this._lots.push(soldChunk);
                targetLot = soldChunk;
            }
            else {
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
            const { cgt } = (0, portfolioUtils_1.getTaxRatesForDate)(portfolio, txn.date);
            const { taxPolicy } = portfolio;
            const sellFeeILS = (0, currencyUtils_1.convertCurrency)(allocatedSellFeePC, this.portfolioCurrency, types_1.Currency.ILS, rates);
            const buyFeeILS = (0, currencyUtils_1.convertCurrency)(buyFeePC, this.portfolioCurrency, types_1.Currency.ILS, rates);
            const proceedsILS = (0, currencyUtils_1.convertCurrency)(proceedsPC, this.portfolioCurrency, types_1.Currency.ILS, rates);
            const costILS = (0, currencyUtils_1.convertCurrency)(costPC, this.portfolioCurrency, types_1.Currency.ILS, rates);
            const nominalGainSC = proceedsSC - (0, currencyUtils_1.convertCurrency)(allocatedSellFeePC, this.portfolioCurrency, this.stockCurrency, rates)
                - (0, currencyUtils_1.convertCurrency)(buyFeePC, this.portfolioCurrency, this.stockCurrency, rates);
            let taxableGainILS = 0;
            if (taxPolicy === 'TAX_FREE') {
                taxableGainILS = 0;
            }
            else if (taxPolicy === 'REAL_GAIN') {
                taxableGainILS = computeRealTaxableGain((proceedsILS - sellFeeILS) - (costILS + buyFeeILS), nominalGainSC, costILS + buyFeeILS, this.stockCurrency, types_1.Currency.ILS, targetLot.cpiAtBuy, cpi, rates);
            }
            else {
                taxableGainILS = (proceedsILS - sellFeeILS) - (costILS + buyFeeILS);
            }
            targetLot.realizedTaxableGainILS = taxableGainILS;
            const taxILS = Math.max(0, taxableGainILS) * cgt;
            targetLot.realizedTax = taxILS; // Lot keeps 'realizedTax' for now as per interface
            targetLot.realizedTaxPC = (0, currencyUtils_1.convertCurrency)(taxILS, types_1.Currency.ILS, this.portfolioCurrency, rates);
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
    get lots() { return this._lots; }
    get transactions() { return this._transactions; }
    get dividends() { return this._dividends; }
    get activeLots() { return this._lots.filter(l => !l.soldDate && l.qty > 0); }
    get vestedLots() { return this._lots.filter(l => !l.soldDate && l.qty > 0 && l.isVested); }
    get realizedLots() { return this._lots.filter(l => l.soldDate); }
    get combinedLots() { return this._lots; }
    get marketValueTotal() {
        return {
            amount: this.marketValueVested.amount + this.marketValueUnvested.amount,
            currency: this.stockCurrency
        };
    }
    get unrealizedGainPct() {
        if (this.costBasisVested.amount === 0)
            return 0;
        return this.unrealizedGain.amount / this.costBasisVested.amount;
    }
    /**
     * Aggregated Realized Tax in Portfolio Currency (PC).
     * Sums:
     * 1. Realized Capital Gains Tax from Sold Lots
     * 2. Realized Income Tax from Sold Lots (e.g. RSU Vest Value tax, paid upon Sale)
     * 3. Tax on Dividends
     */
    get totalTaxPaidPC() {
        const salesTax = this.realizedLots.reduce((sum, lot) => sum + (lot.realizedTaxPC || 0), 0);
        const incomeTax = this.realizedLots.reduce((sum, lot) => sum + (lot.realizedIncomeTaxPC || 0), 0);
        const divTax = this._dividends.reduce((sum, d) => sum + (d.taxAmountPC || 0), 0);
        return salesTax + incomeTax + divTax;
    }
    /**
     * Calculates the gain for this holding over a specific period.
     * Uses "Initial Value vs Final Value" logic (Simple Return), not Time-Weighted Return.
     */
    generateGainForPeriod(startDate, historyProvider, // Returns { historical: { date: Date, price: number }[] }
    rates, initialRates) {
        let initialVal = multiCurrency_1.MultiCurrencyValue.zero();
        let finalVal = multiCurrency_1.MultiCurrencyValue.zero();
        // Ensure start of day
        const startTime = new Date(startDate).setUTCHours(0, 0, 0, 0);
        // Fetch historical data once if needed
        const historyData = historyProvider(this.ticker);
        const getPriceAtDate = (date) => {
            if (!historyData?.historical)
                return 0;
            const t = date.getTime();
            // Assuming sorted ascending
            // Find last point <= t
            let found = historyData.historical[0];
            for (let i = 0; i < historyData.historical.length; i++) {
                if (new Date(historyData.historical[i].date).getTime() > t)
                    break;
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
            if (!lot.isVested)
                continue;
            // 1. Filter: If sold before start date, it contributes nothing to this period's gain
            if (lot.soldDate && lot.soldDate.getTime() < startTime)
                continue;
            // 2. Initial Value
            let lotInitial = multiCurrency_1.MultiCurrencyValue.zero();
            if (lot.date.getTime() >= startTime) {
                // Bought during period -> Initial = Cost Basis
                // Use stored USD/ILS values if available
                const usd = lot.costTotal.valUSD || (0, currencyUtils_1.convertCurrency)(lot.costTotal.amount, lot.costTotal.currency, types_1.Currency.USD, rates);
                const ils = lot.costTotal.valILS || (0, currencyUtils_1.convertCurrency)(lot.costTotal.amount, lot.costTotal.currency, types_1.Currency.ILS, rates);
                lotInitial = new multiCurrency_1.MultiCurrencyValue(usd, ils);
            }
            else {
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
                const synthRates = { ...rates, current: ratesToUse };
                lotInitial = new multiCurrency_1.MultiCurrencyValue((0, currencyUtils_1.convertCurrency)(valSC, this.stockCurrency, types_1.Currency.USD, synthRates), (0, currencyUtils_1.convertCurrency)(valSC, this.stockCurrency, types_1.Currency.ILS, synthRates));
            }
            initialVal = initialVal.add(lotInitial);
            // 3. Final Value
            let lotFinal = multiCurrency_1.MultiCurrencyValue.zero();
            if (lot.soldDate) {
                // Sold during period -> Final = Proceeds
                const costPC = lot.costTotal.amount;
                const netGainPC = lot.realizedGainNet || 0;
                const buyFeePC = lot.feesBuy.amount;
                const sellFeePC = lot.soldFees?.amount || 0;
                const proceedsPC = costPC + netGainPC + buyFeePC + sellFeePC;
                // Use current rates for realized proceeds
                lotFinal = new multiCurrency_1.MultiCurrencyValue((0, currencyUtils_1.convertCurrency)(proceedsPC, this.portfolioCurrency, types_1.Currency.USD, rates), (0, currencyUtils_1.convertCurrency)(proceedsPC, this.portfolioCurrency, types_1.Currency.ILS, rates));
            }
            else {
                // Active -> Final = Current Market Value
                const currentPrice = this.currentPrice;
                const valSC = lot.qty * currentPrice;
                lotFinal = new multiCurrency_1.MultiCurrencyValue((0, currencyUtils_1.convertCurrency)(valSC, this.stockCurrency, types_1.Currency.USD, rates), (0, currencyUtils_1.convertCurrency)(valSC, this.stockCurrency, types_1.Currency.ILS, rates));
            }
            finalVal = finalVal.add(lotFinal);
        }
        let gain = finalVal.sub(initialVal);
        // Add Dividends received during period
        for (const div of this._dividends) {
            if (div.date.getTime() >= startTime) {
                const divVal = new multiCurrency_1.MultiCurrencyValue((0, currencyUtils_1.convertCurrency)(div.netAmountPC, this.portfolioCurrency, types_1.Currency.USD, rates), (0, currencyUtils_1.convertCurrency)(div.netAmountPC, this.portfolioCurrency, types_1.Currency.ILS, rates));
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
exports.Holding = Holding;
