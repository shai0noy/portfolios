console.log("Starting script...");
import { FinanceEngine } from './lib/data/engine';
import { Portfolio, Currency, Exchange, Transaction, ExchangeRates } from './lib/types';

const mockExchangeRates: ExchangeRates = {
    current: {
        'USD': 1,
        'ILS': 3.7,
        'EUR': 0.9,
    },
    'USD': { 'ILS': 3.7, 'USD': 1, 'EUR': 0.9 },
    'ILS': { 'USD': 1 / 3.7, 'ILS': 1, 'EUR': 0.9 / 3.7 }
};

const mockPortfolioILS: Portfolio = {
    id: 'p1',
    name: 'Test ILS',
    currency: Currency.ILS,
    cgt: 0.25,
    incTax: 0,
    mgmtVal: 0,
    mgmtType: 'percentage',
    mgmtFreq: 'yearly',
    commRate: 0,
    commMin: 0,
    commMax: 0,
    divPolicy: 'cash_taxed',
    divCommRate: 0,
    taxPolicy: 'REAL_GAIN'
};

const txnBuy: Transaction = {
    date: '2023-01-01',
    portfolioId: 'p1',
    ticker: 'TEST',
    exchange: Exchange.NASDAQ,
    type: 'BUY',
    qty: 10,
    price: 100, // USD
    currency: Currency.USD,
    originalQty: 10,
    originalPrice: 100
};

const divEvent = {
    ticker: 'TEST',
    exchange: Exchange.NASDAQ,
    date: new Date('2023-06-01'),
    amount: 0.2, // USD per unit
    source: 'Test'
};

const mockPortfolioTaxFree: Portfolio = {
    ...mockPortfolioILS,
    id: 'p3',
    name: 'Test Tax Free',
    divPolicy: 'accumulate_tax_free'
};

const txnBuyUnvested: Transaction = {
    ...txnBuy,
    portfolioId: 'p3',
    vestDate: '2025-01-01' // Future date relative to div date
};

const mockPortfolioIncomeTax: Portfolio = {
    ...mockPortfolioILS,
    id: 'p4',
    name: 'Test Income Tax',
    currency: Currency.ILS, // Using ILS portfolio to make math easy (or hard depending on conversion)
    incTax: 0.5, // 50% Income Tax on Grant Value
    taxPolicy: 'REAL_GAIN'
};

const txnBuyIT: Transaction = {
    ...txnBuy,
    portfolioId: 'p4',
    // Cost Basis = 100 USD * 10 = 1000 USD.
    // In ILS: 1000 * 3.7 = 3700 ILS.
};

const txnSellIT: Transaction = {
    date: '2023-06-01',
    portfolioId: 'p4',
    ticker: 'TEST',
    exchange: Exchange.NASDAQ,
    type: 'SELL',
    qty: 5, // Sell half
    price: 150, // USD. Profit.
    currency: Currency.USD,
    originalQty: 5,
    originalPrice: 150
};

runTest(mockPortfolioILS, txnBuy, "ILS Portfolio (Standard)");
runTest(mockPortfolioTaxFree, txnBuyUnvested, "Tax Free Portfolio (Unvested)");
// @ts-ignore
runTestSales(mockPortfolioIncomeTax, txnBuyIT, txnSellIT, "Income Tax Portfolio (Sell with 50% IncTax)");

function runTest(p: Portfolio, t: Transaction, label: string) {
    console.log(`\n--- Test Case: ${label} ---`);
    // @ts-ignore
    const engine = new FinanceEngine([p], mockExchangeRates, null);

    // Add Buy
    engine.processEvents([t], []);

    // Add Dividend
    // Dividend needs to be AFTER buy but BEFORE vest for it to be "reinvested" (unvested)
    const div = { ...divEvent, date: new Date('2023-06-01') };
    engine.processEvents([], [div]);

    const holding = engine.holdings.get(`${p.id}_TEST`);
    if (holding) {
        // @ts-ignore
        const divs = holding.dividends;

        const d = divs[0];
        if (d) {
            console.log(`Units Held: ${d.unitsHeld}`);
            console.log(`Cashed Amount: ${d.cashedAmount.toFixed(4)}`);
            console.log(`Reinvested Amount: ${d.reinvestedAmount.toFixed(4)}`);
            console.log(`Cashed Tax: ${d.taxCashedPC?.toFixed(4)}`);
            console.log(`Reinvested Tax: ${d.taxReinvestedPC?.toFixed(4)}`);
            console.log(`Total Dividend Tax (PC): ${d.taxAmountPC.toFixed(4)}`);

            // Validate Aggregation Logic via totalTaxPaidPC getter
            // @ts-ignore
            const totalTaxPaidPC = holding.totalTaxPaidPC;

            // We expect Holding.realizedCapitalGainsTax to be 0 probably (since no sales)
            // But we can check sales tax logic too if we want (by adding a sell).
            // For now, let's just check dividend tax is flowing through.

            // @ts-ignore (Assuming renamed)
            console.log(`Holding.realizedCapitalGainsTax (ILS): ${holding.realizedCapitalGainsTax}`);
            console.log(`Holding.totalTaxPaidPC: ${totalTaxPaidPC?.toFixed(4)}`);

            if (Math.abs((totalTaxPaidPC || 0) - d.taxAmountPC) < 0.0001) {
                console.log("SUCCESS: totalTaxPaidPC matches Dividend Tax (since no sales).");
            } else {
                console.log("FAILURE: totalTaxPaidPC mismatch.");
            }

        } else {
            console.log("No dividends found.");
        }
    } else {
        console.log("Holding not found.");
    }
}

function runTestSales(p: Portfolio, tBuy: Transaction, tSell: Transaction, label: string) {
    console.log(`\n--- Test Case: ${label} ---`);
    // @ts-ignore
    const engine = new FinanceEngine([p], mockExchangeRates, null);

    engine.processEvents([tBuy, tSell], []);

    const holding = engine.holdings.get(`${p.id}_TEST`);
    if (holding) {
        // @ts-ignore
        const totalTaxPaidPC = holding.totalTaxPaidPC;
        // @ts-ignore
        const realizedIncomeTax = holding.realizedIncomeTax;
        // @ts-ignore
        const realizedCGT = holding.realizedCapitalGainsTax;

        console.log(`Realized Income Tax: ${realizedIncomeTax.toFixed(2)}`);
        console.log(`Realized CGT: ${realizedCGT.toFixed(2)}`);
        console.log(`Total Tax Paid: ${totalTaxPaidPC.toFixed(2)}`);

        // Logic check:
        // Cost Basis of sold (5 units @ 100 USD) = 500 USD.
        // Portfolio is ILS.
        // Cost Basis in PC (ILS) = 500 * 3.7 = 1850 ILS.
        // Income Tax = 1850 * 0.5 = 925 ILS.

        // Proceeds = 5 * 150 = 750 USD = 750 * 3.7 = 2775 ILS.
        // Gain = 2775 - 1850 = 925 ILS.
        // CGT (25%) = 925 * 0.25 = 231.25 ILS.

        // Total Tax = 925 + 231.25 = 1156.25 ILS.

        if (Math.abs(realizedIncomeTax - 925) < 1) {
            console.log("SUCCESS: Realized Income Tax correct.");
        } else {
            console.log(`FAILURE: Expected ~925, got ${realizedIncomeTax}`);
        }

        if (Math.abs(realizedCGT - 231.25) < 1) {
            console.log("SUCCESS: Realized CGT correct.");
        } else {
            console.log(`FAILURE: Expected ~231.25, got ${realizedCGT}`);
        }

        if (Math.abs(totalTaxPaidPC - 1156.25) < 1) {
            console.log("SUCCESS: Total Tax Paid correct.");
        } else {
            console.log(`FAILURE: Expected ~1156.25, got ${totalTaxPaidPC}`);
        }

        // LOT Verification
        const soldLot = holding.realizedLots[0];
        if (soldLot) {
            // @ts-ignore
            const lotTotalTax = soldLot.totalRealizedTaxPC;
            console.log(`Lot Total Tax: ${lotTotalTax?.toFixed(2)}`);
            if (Math.abs((lotTotalTax || 0) - 1156.25) < 1) {
                console.log("SUCCESS: Lot totalRealizedTaxPC correct.");
            } else {
                console.log(`FAILURE: Lot totalRealizedTaxPC mismatch.`);
            }
        }

    } else {
        console.log("Holding not found.");
    }
}
