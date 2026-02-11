"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aggregateDividends = aggregateDividends;
const currency_1 = require("./currency");
function aggregateDividends(dividendHistory, displayCurrency, exchangeRates) {
    if (!exchangeRates)
        return [];
    const grouped = {};
    dividendHistory.forEach(d => {
        const dateKey = new Date(d.date).toISOString().split('T')[0];
        const pCurrency = d.portfolioCurrency || 'USD';
        // Conversions to Display Currency
        const grossDisplay = (0, currency_1.convertCurrency)(d.grossAmount.amount, d.grossAmount.currency, displayCurrency, exchangeRates);
        const netDisplay = (0, currency_1.convertCurrency)(d.netAmountPC, pCurrency, displayCurrency, exchangeRates);
        const taxDisplay = (0, currency_1.convertCurrency)(d.taxAmountPC, pCurrency, displayCurrency, exchangeRates);
        const feeDisplay = (0, currency_1.convertCurrency)(d.feeAmountPC, pCurrency, displayCurrency, exchangeRates);
        const cashedDisplay = (0, currency_1.convertCurrency)(d.cashedAmount, pCurrency, displayCurrency, exchangeRates);
        const reinvestedDisplay = (0, currency_1.convertCurrency)(d.reinvestedAmount, pCurrency, displayCurrency, exchangeRates);
        // --- Proportional Calculations ---
        // If taxCashedPC/taxReinvestedPC are available from Engine, use them!
        // Otherwise fallback to ratio layout (legacy support).
        let cashedTaxDisplay = 0;
        let reinvestedTaxDisplay = 0;
        let cashedFeeDisplay = 0;
        let reinvestedFeeDisplay = 0;
        let cashedGrossDisplay = 0;
        let reinvestedGrossDisplay = 0;
        const hasSplitData = d.taxCashedPC !== undefined;
        if (hasSplitData) {
            // Use precise engine data
            cashedTaxDisplay = (0, currency_1.convertCurrency)(d.taxCashedPC, pCurrency, displayCurrency, exchangeRates);
            reinvestedTaxDisplay = (0, currency_1.convertCurrency)(d.taxReinvestedPC, pCurrency, displayCurrency, exchangeRates);
            cashedFeeDisplay = (0, currency_1.convertCurrency)(d.feeCashedPC || 0, pCurrency, displayCurrency, exchangeRates);
            reinvestedFeeDisplay = (0, currency_1.convertCurrency)(d.feeReinvestedPC || 0, pCurrency, displayCurrency, exchangeRates);
            // Reconstruct Gross from Net + Tax + Fee
            // or use ratio for Gross if we trust specific fields? 
            // Gross is usually pro-rated by units.
            // Actually, we can back-calculate or use simple ratio for Gross as it is uniform per unit usually.
            // But let's check if we have cashedAmount to deduce ratio?
            // Safer to use ratio for Gross.
            // Wait, cashedAmount is Net. 
            // We want the Gross portion corresponding to Cashed.
            // Logic: CashedGross = CashedNet + CashedTax + CashedFee
            // Let's rely on the sums being correct in Display Currency
            cashedGrossDisplay = cashedDisplay + cashedTaxDisplay + cashedFeeDisplay;
            reinvestedGrossDisplay = reinvestedDisplay + reinvestedTaxDisplay + reinvestedFeeDisplay;
        }
        else {
            // Legacy Fallback (Ratio based)
            const realTotalNet = cashedDisplay + reinvestedDisplay;
            const cashedRatio = realTotalNet > 0 ? cashedDisplay / realTotalNet : (cashedDisplay > 0 ? 1 : 0);
            const reinvestedRatio = realTotalNet > 0 ? reinvestedDisplay / realTotalNet : (reinvestedDisplay > 0 ? 1 : 0);
            cashedGrossDisplay = grossDisplay * cashedRatio;
            cashedTaxDisplay = taxDisplay * cashedRatio;
            cashedFeeDisplay = feeDisplay * cashedRatio;
            reinvestedGrossDisplay = grossDisplay * reinvestedRatio;
            reinvestedTaxDisplay = taxDisplay * reinvestedRatio;
            reinvestedFeeDisplay = feeDisplay * reinvestedRatio;
        }
        if (!grouped[dateKey]) {
            grouped[dateKey] = {
                ...d,
                count: 1,
                portfolioCurrency: pCurrency,
                grossAmountDisplay: grossDisplay,
                netAmountDisplay: netDisplay,
                taxAmountDisplay: taxDisplay,
                feeAmountDisplay: feeDisplay,
                cashedAmountDisplay: cashedDisplay,
                reinvestedAmountDisplay: reinvestedDisplay,
                cashedGrossDisplay: cashedGrossDisplay,
                cashedTaxDisplay: cashedTaxDisplay,
                cashedFeeDisplay: cashedFeeDisplay,
                reinvestedGrossDisplay: reinvestedGrossDisplay,
                reinvestedTaxDisplay: reinvestedTaxDisplay,
                reinvestedFeeDisplay: reinvestedFeeDisplay
            };
        }
        else {
            const g = grouped[dateKey];
            g.unitsHeld = (g.unitsHeld || 0) + (d.unitsHeld || 0);
            g.grossAmount = { ...g.grossAmount, amount: g.grossAmount.amount + d.grossAmount.amount };
            g.grossAmountDisplay += grossDisplay;
            g.netAmountDisplay += netDisplay;
            g.taxAmountDisplay += taxDisplay;
            g.feeAmountDisplay += feeDisplay;
            g.cashedAmountDisplay += cashedDisplay;
            g.reinvestedAmountDisplay += reinvestedDisplay;
            g.cashedGrossDisplay += cashedGrossDisplay;
            g.cashedTaxDisplay += cashedTaxDisplay;
            g.cashedFeeDisplay += cashedFeeDisplay;
            g.reinvestedGrossDisplay += reinvestedGrossDisplay;
            g.reinvestedTaxDisplay += reinvestedTaxDisplay;
            g.reinvestedFeeDisplay += reinvestedFeeDisplay;
            g.count += 1;
        }
    });
    return Object.values(grouped).map(d => ({
        ...d,
        date: new Date(d.date),
    })).sort((a, b) => b.date.getTime() - a.date.getTime());
}
