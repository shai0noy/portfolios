import { describe, it, expect } from 'vitest';
import { FinanceEngine } from './engine';
import { Currency, Exchange, Portfolio, Transaction } from '../types';

const mockRates = {
    current: { USD: 1, ILS: 4 }, // Today: 1 USD = 4 ILS
    '2023-01-01': { USD: 1, ILS: 3.5 }, // Buy: 1 USD = 3.5 ILS
};

const mockCPI = {
    historical: [
        { date: new Date('2024-01-01'), price: 100 }, // No CPI change for simplicity
        { date: new Date('2023-01-01'), price: 100 },
    ]
};

const portfolio: Portfolio = {
    id: 'p1', name: 'Test', currency: Currency.ILS, // ILS Portfolio
    cgt: 0.25, incTax: 0,
    commRate: 0, commMin: 0, commMax: 0,
    divPolicy: 'cash_taxed', divCommRate: 0,
    taxPolicy: 'IL_REAL_GAIN',
    mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly',
    feeHistory: []
};

describe('FinanceEngine - Phantom Tax Reproduction', () => {
    it('should NOT charge tax on a loss even if currency fluctuation looks like a gain (Never Lose Rule)', () => {
        const engine = new FinanceEngine([portfolio], mockRates as any, mockCPI as any);

        // Buy 100 shares @ $100 when Rate=3.5.
        // Cost USD = $10,000.
        // Cost ILS = 35,000 ILS.
        // We simulate loading from sheet where originalPriceILA is provided (Fixed Cost Basis)
        // BUT originalPriceUSD is missing (calculated).
        const buy: Transaction = {
            date: '2023-01-01', type: 'BUY', portfolioId: 'p1', ticker: 'LOSS', exchange: Exchange.NASDAQ,
            qty: 100, price: 100, originalPrice: 100, originalQty: 100, currency: Currency.USD,
            originalPriceILA: 35000 // 35,000 Agorot per unit at 3.5? No, originalPriceILA is typically Total or Unit?
            // In loader, originalPrice is usually unit price. originalPriceILA is also unit price in Agorot.
            // 100 USD * 3.5 = 350 ILS = 35000 Agorot.
        };

        // Today Rate=4.0.
        // Price drops to $90.
        // True Value USD = $9,000 (Loss of $1,000).
        // True Value ILS = 36,000 ILS.
        
        // Scenario Analysis:
        // True Cost ILS = 35,000.
        // True Cost USD = 10,000.
        
        // IF BUG EXISTS:
        // System derives Cost USD from Cost ILS (35,000) using CURRENT RATE (4.0).
        // Derived Cost USD = 35,000 / 4 = 8,750 USD.
        // Current Value USD = 9,000 USD.
        // System sees Gain: 9,000 - 8,750 = +250 USD.
        // Nominal Gain ILS = 36,000 - 35,000 = +1,000 ILS.
        // Min(1000, 250*4=1000) = 1000 ILS Taxable.
        // Tax = 250 ILS.
        
        // EXPECTED:
        // Cost USD used should be 10,000.
        // Gain USD = 9,000 - 10,000 = -1,000 USD.
        // Taxable = Min(1000, -4000) => -4000 (Loss).
        // Tax = 0.

        engine.processEvents([buy], []);
        
        const h = engine.holdings.get('p1_LOSS');
        expect(h).toBeDefined();
        
        // Manually update current price and re-calculate snapshot
        h!.currentPrice = 90;
        engine.calculateSnapshot();
        
        console.log('Nominal Gain ILS:', h!.unrealizedGain.amount); 
        console.log('Unrealized Tax Liability:', h!.unrealizedTaxLiabilityILS);
        console.log('Active Lot Cost USD:', h!.activeLots[0].costTotal.valUSD);
        
        // Check that Unrealized Tax Liability is <= 0
        expect(h!.unrealizedTaxLiabilityILS).toBeLessThanOrEqual(0);
    });

    it('should ignore currency fluctuation in NOMINAL_GAIN mode (Foreign)', () => {
        // Setup Portfolio with NOMINAL_GAIN
        const nominalPortfolio: Portfolio = { ...portfolio, taxPolicy: 'NOMINAL_GAIN' };
        const engine = new FinanceEngine([nominalPortfolio], mockRates as any, mockCPI as any);

        // Buy 100 shares @ $100 when Rate=3.5. Cost $10,000.
        const buy: Transaction = {
            date: '2023-01-01', type: 'BUY', portfolioId: 'p1', ticker: 'NOMINAL_TEST', exchange: Exchange.NASDAQ,
            qty: 100, price: 100, originalPrice: 100, originalQty: 100, currency: Currency.USD,
            originalPriceILA: 35000 // Fixed Cost Basis ILS
        };
        
        // Today Rate=4.0.
        // Price stays $100.
        // Gain USD = 0.
        // Nominal Gain ILS = (100 * 100 * 4.0) - 35000 = 40000 - 35000 = +5000 ILS.
        
        // Policy: NOMINAL_GAIN (Foreign).
        // "flat rate on gain in ticker currency".
        // Gain USD = 0.
        // Taxable = 0.
        
        engine.processEvents([buy], []);
        const h = engine.holdings.get('p1_NOMINAL_TEST');
        h!.currentPrice = 100;
        engine.calculateSnapshot();
        
        console.log('NOMINAL Mode - Nominal Gain ILS:', h!.unrealizedGain.amount); 
        console.log('NOMINAL Mode - Tax Liability:', h!.unrealizedTaxLiabilityILS);

        expect(h!.unrealizedGain.amount).toBe(5000); // Nominal ILS Gain is real
        expect(h!.unrealizedTaxLiabilityILS).toBe(0); // Taxable should be 0 because Ticker Gain is 0
    });

    it('should apply "Never Lose" to Domestic CPI assets (Deflation)', () => {
        const engine = new FinanceEngine([portfolio], mockRates as any, mockCPI as any);

        // Buy 100 @ 100 ILS. Cost 10,000. CPI = 100.
        // We simulate CPI drop to 90 (Deflation).
        // Real Cost = 9,000.
        // Sell @ 110. Proceeds 11,000.
        // Nominal Gain = 1,000.
        // Real Gain = 2,000.
        // Taxable should be 1,000 (Nominal).
        
        // Mock CPI Drop
        (engine as any).cpi = {
             historical: [
                 { date: new Date('2024-01-01'), price: 90 }, // Current (Deflation)
                 { date: new Date('2023-01-01'), price: 100 }, // Buy
             ]
        };

        const buy: Transaction = {
            date: '2023-01-01', type: 'BUY', portfolioId: 'p1', ticker: 'DEFLATION_TEST', exchange: Exchange.TASE,
            qty: 100, price: 100, originalPrice: 100, originalQty: 100, currency: Currency.ILS,
        };
        
        engine.processEvents([buy], []);
        const h = engine.holdings.get('p1_DEFLATION_TEST');
        h!.currentPrice = 110; 
        engine.calculateSnapshot();
        
        console.log('Deflation - Nominal Gain ILS:', h!.unrealizedGain.amount); 
        console.log('Deflation - Taxable Gain ILS:', h!.activeLots[0].unrealizedTax / 0.25); // Reverse Eng Tax Rate

        expect(h!.unrealizedGain.amount).toBe(1000);
        // Taxable Gain should be 1000. Tax (25%) should be 250.
        // If it was Real Gain (2000), Tax would be 500.
        
        // We check the tax liability directly
        const tax = h!.unrealizedTaxLiabilityILS;
        expect(tax).toBeCloseTo(250);
    });

    it('should handle USD stock bought in ILS without Phantom Tax (requires fixed USD Cost)', () => {
        const engine = new FinanceEngine([portfolio], mockRates as any, mockCPI as any);

        // Buy 100 @ $100. Rate 3.5. Cost 35,000 ILS.
        // Transaction is recorded in ILS (e.g. TASE dual listed or broker conversion).
        // txn.currency = ILS.
        // txn.price = 350 (ILS per unit).
        const buy: Transaction = {
            date: '2023-01-01', type: 'BUY', portfolioId: 'p1', ticker: 'ILS_BUY_TEST', exchange: Exchange.NASDAQ,
            qty: 100, price: 350, originalPrice: 350, originalQty: 100, currency: Currency.ILS,
             // originalPriceUSD is MISSING (simulating lack of data)
        };
        
        // Today Rate 4.0. Price $90.
        // Value = 90 * 4 = 360 ILS / unit.
        // MV ILS = 36,000.
        // Nominal Gain = 36,000 - 35,000 = +1,000 ILS.
        
        // Expected:
        // Real Gain (USD) = 90 - 100 = -10 USD.
        // Taxable = Min(1000, Neg) = Neg.
        
        engine.processEvents([buy], []);
        const h = engine.holdings.get('p1_ILS_BUY_TEST');
        // We need to force stockCurrency to USD (usually derived from Ticker/Exchange service, but we mock it?)
        // In this test environment, how is stockCurrency determined? 
        // Engine defaults to portfolio currency or txn currency if not found?
        // We need to ensure h.stockCurrency is USD.
        // Engine typically sets stockCurrency based on first transaction or fetch.
        // If txn is ILS, Engine might set stockCurrency to ILS!
        // If stockCurrency is ILS, then it is treated as DOMESTIC.
        // If Domestic, Taxable = Nominal - Inflation.
        // Nominal = 1000. Inflation = 0. Taxable = 1000.
        // So User pays tax.
        
        // But if it's NASDAQ, it SHOULD be USD.
        // We can manually force it for the test.
        h!.stockCurrency = Currency.USD;
        h!.currentPrice = 90; // USD
        
        engine.calculateSnapshot();
        
        console.log('ILS Buy - Nominal Gain ILS:', h!.unrealizedGain.amount); 
        console.log('ILS Buy - Taxable:', h!.unrealizedTaxLiabilityILS / 0.25);
        console.log('Active Lot Cost USD:', h!.activeLots[0].costTotal.valUSD); // Expecting drift if bug exists

        // If drift exists: CostUSD = 35000 / 4 = 8750.
        // ValueUSD = 9000.
        // GainUSD = +250.
        // Taxable = Min(1000, 1000) = 1000.
        
        // If we want to fix this, we need a way to know CostUSD was 10,000.
        // Without historical rate 3.5, we can't know 35,000 ILS meant 10,000 USD.
        
        // Checks
        // We Expect FAILURE here if the bug exists.
        // If it passes (Taxable <= 0), then my theory is wrong.
        if (h!.activeLots[0].costTotal.valUSD! < 9000) {
             console.log('Confirmed: CostUSD drifted downwards, causing false gain.');
        }
        
        // Assert
        expect(h!.unrealizedTaxLiabilityILS).toBeLessThanOrEqual(0);
    });
});
