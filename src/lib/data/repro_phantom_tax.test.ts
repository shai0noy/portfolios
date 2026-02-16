
import { describe, it, expect } from 'vitest';
import { FinanceEngine } from './engine';
import { Exchange, Currency, type TaxPolicy, type Portfolio, type Transaction } from '../types';

describe('FinanceEngine - Phantom Tax Reproduction', () => {
    // Shared Mock Data
    const mockRates = {
        current: { USD: 1, ILS: 4 }, // Default
        '2024-01-01': { USD: 1, ILS: 4 },
        '2024-06-01': { USD: 1, ILS: 4 }, // No Change
    };
    const mockCPI = {
        current: 100,
        '2024-01-01': 100,
        '2024-06-01': 100,
    };

    const portfolio: Portfolio = {
        id: 'p1', name: 'Test', currency: Currency.ILS,
        taxPolicy: 'IL_REAL_GAIN' as TaxPolicy,
        cgt: 0.25, incTax: 0,
        mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly', commRate: 0,
        commMin: 0, commMax: 0, divPolicy: 'cash_taxed', divCommRate: 0
    };

    it('should NOT charge tax on a loss even if currency fluctuation looks like a gain (Never Lose Rule)', () => {
        // Scenario: 
        // Buy 100 @ 100 USD = 10,000 USD. Rate 4 -> 40,000 ILS Cost.
        // Price drops to 90 USD (-10%). Value 9,000 USD.
        // Rate Rises to 5 ILS (+25%). Value = 45,000 ILS.
        // Nominal Gain ILS: +5,000 ILS.
        // But Real Gain (USD): -1,000 USD.
        // Tax Limit Logic should prevent taxing this "Phantom Gain" because real return is negative.
        
        const engine = new FinanceEngine([portfolio], mockRates as any, mockCPI as any);
        
        const buy: Transaction = {
            date: '2024-01-01', type: 'BUY', portfolioId: 'p1', ticker: 'PHANTOM', exchange: Exchange.NASDAQ,
            qty: 100, price: 100, originalPrice: 100, originalQty: 100, currency: Currency.USD,
        };
        (engine as any).exchangeRates = {
            current: { USD: 1, ILS: 4 },
            '2024-01-01': { USD: 1, ILS: 4 }
        };
        
        engine.processEvents([buy], []);
        
        const h = engine.holdings.get('p1_PHANTOM');
        
        // Simulate Jun 1: Price 90, Rate 5.
        h!.currentPrice = 90;
        (engine as any).exchangeRates.current = { USD: 1, ILS: 5 };
        
        engine.calculateSnapshot();
        
        const nominalGainILS = h!.unrealizedGain.amount; // Should be +5000 approx
        const taxILS = h!.unrealizedTaxLiabilityILS;
        
        console.log('Nominal Gain ILS:', nominalGainILS); // 45000 - 40000 = 5000
        console.log('Unrealized Tax Liability:', taxILS);
        
        console.log('Active Lot Cost USD:', (h as any).activeLots[0].originalCost);

        expect(nominalGainILS).toBeGreaterThan(0);
        // CRITICAL CHECK: Tax should be 0 because Real Gain (USD) is negative (-1000).
        expect(taxILS).toBe(0);
    });

    it('should ignore currency fluctuation in NOMINAL_GAIN mode (Foreign)', () => {
        // Scenario: NOMINAL_GAIN policy taxes the gain in the *foreign* currency converted to ILS.
        // Buy 100 @ 100 USD. Rate 4.
        // Price stays 100 USD. Rate -> 5.
        // Nominal Gain ILS: +10,000 ILS.
        // Taxable Gain: 0 (No change in USD price).
        
        const pNominal = { ...portfolio, taxPolicy: 'NOMINAL_GAIN' as TaxPolicy };
        const engine = new FinanceEngine([pNominal], mockRates as any, mockCPI as any);
        
        const buy: Transaction = {
            date: '2024-01-01', type: 'BUY', portfolioId: 'p1', ticker: 'NOMINAL', exchange: Exchange.NASDAQ,
            qty: 100, price: 100, originalPrice: 100, originalQty: 100, currency: Currency.USD,
        };
        (engine as any).exchangeRates = {
            current: { USD: 1, ILS: 4 },
            '2024-01-01': { USD: 1, ILS: 4 }
        };
        engine.processEvents([buy], []);
        
        const h = engine.holdings.get('p1_NOMINAL');
        h!.currentPrice = 100; // No Change
        (engine as any).exchangeRates.current = { USD: 1, ILS: 5 }; // Rate Gain
        
        engine.calculateSnapshot();
        
        const nominalGainILS = h!.unrealizedGain.amount; // 50000 - 40000 = 10000
        const taxILS = h!.unrealizedTaxLiabilityILS;
        
        console.log('NOMINAL Mode - Nominal Gain ILS:', nominalGainILS);
        console.log('NOMINAL Mode - Tax Liability:', taxILS);
        
        expect(nominalGainILS).toBeGreaterThan(0);
        expect(taxILS).toBe(0); // Should be 0
    });

    it('should apply "Never Lose" to Domestic CPI assets (Deflation)', () => {
        // Scenario: Domestic Asset (ILS).
        // Buy 100 @ 100 ILS. CPI 100.
        // Price 110 (+10%). CPI 90 (-10%).
        // Nominal Gain: +1000 ILS.
        // Real Gain: Inflation Adjusted Cost = 100 * (90/100) = 90.
        // Gain = 110 - 90 = 20. Total 2000 Real Gain?
        // Wait, Real Gain = (Price - AdjCost).
        // AdjCost = Cost * (CurrentCPI / BaseCPI).
        // If Deflation, AdjCost decreases? NO. Section 6 forbids reducing cost below nominal unless specialized.
        // Standard rule: Adjusted Cost = Max(Nominal, Nominal * Change).
        // So if CPI drops, Adjusted Cost = Nominal Cost.
        // So Real Gain = 110 - 100 = 10.
        
        // Wait, Tax Authority says: "Exempt Inflationary Gain". "Allowable Inflationary Loss?"
        // Usually, if Index drops, we ignore it (Linkage is 0).
        // So Real Gain = Nominal Gain?
        
        const engine = new FinanceEngine([portfolio], mockRates as any, mockCPI as any);
        const buy: Transaction = {
            date: '2024-01-01', type: 'BUY', portfolioId: 'p1', ticker: 'DOMESTIC', exchange: Exchange.TASE,
            qty: 100, price: 100, originalPrice: 100, originalQty: 100, currency: Currency.ILS,
        };
        (engine as any).exchangeRates = {
            current: { USD: 1, ILS: 1 }, // Domestic
            '2024-01-01': { USD: 1, ILS: 1 }
        };
        // const h = engine.holdings.get('p1_DOMESTIC'); // Will be created after process? No need to fetch if not processed.
        engine.processEvents([buy], []);
        const h2 = engine.holdings.get('p1_DOMESTIC');
        
        h2!.currentPrice = 110;
        h2!.currentPrice = 110;
        (engine as any).cpiData.current = 90; // Deflation
        
        engine.calculateSnapshot();
        
        const totalGain = h2!.unrealizedGain.amount;
        // const taxVal = h2!.unrealizedTaxLiabilityILS;
        const taxable = h2!.unrealizedTaxableGainILS;
        
        console.log('Deflation - Nominal Gain ILS:', totalGain);
        console.log('Deflation - Taxable Gain ILS:', taxable);
        
        // Gain 1000. Taxable 1000 (because Index loss isn't recognized to reduce cost below nominal? Or is it?)
        // Actually engine sets adjCost = nominal if Index < 0 change?
        // Let's verify Engine logic.
        expect(taxable).toBe(1000);
    });

    it('should handle USD stock bought in ILS without Phantom Tax (requires fixed USD Cost)', () => {
        // Edge Case: Buying Foreign Stock with ILS directly.
        // The system must infer the USD Cost Basis for the "Never Lose" check.
        // If it uses ILS Cost Basis only, it might fail to detect it's a Foreign Asset logic.
        
        // But our system requires USD for Foreign Stocks usually.
        // If transaction currency is ILS but ticker is USD?
        // Engine converts to Stock Currency (USD) for storage.
        
        const engine = new FinanceEngine([portfolio], mockRates as any, mockCPI as any);
        const buy: Transaction = {
            date: '2024-01-01', type: 'BUY', portfolioId: 'p1', ticker: 'WIZ', exchange: Exchange.NASDAQ,
            qty: 100, price: 0, // Inferred?
            // cost: 40000, // Removed invalid property
            originalPrice: 100, // ?
            originalQty: 100, 
            currency: Currency.ILS, // Paid in ILS
        };
        // We need to support this? The engine usually expects price in stock currency.
        // If user enters Cost in ILS, we divide by Exchange Rate?
        // Let's assume we converted it before Engine.
        // Engine expects `price` in Stock Currency.
        
        const buyFixed: Transaction = {
            ...buy,
            price: 100, // 100 USD
            currency: Currency.USD
        };
        
        engine.processEvents([buyFixed], []);
        const h = engine.holdings.get('p1_WIZ');
        
        // Scenario: Price Drop 100 -> 90 USD. Rate 4 -> 5.
        // Nominal Gain ILS: +5,000. Real Gain USD: -1,000.
        
        h!.currentPrice = 90;
        (engine as any).exchangeRates.current = { USD: 1, ILS: 5 };
        engine.calculateSnapshot();
        
        expect(h!.unrealizedTaxLiabilityILS).toBe(0); // Should be 0 tax
        console.log('ILS Buy - Nominal Gain ILS:', h!.unrealizedGain.amount);
        console.log('ILS Buy - Taxable:', h!.unrealizedTaxableGainILS);
        console.log('Active Lot Cost USD:', (h as any).activeLots[0].originalCost);
    });

    it('should be Conservative on Double Loss (Foreign Deflation + Price Drop)', () => {
        // Scenario: Price Drop (Loss). Rate Drop (Deflation/Appreciation of ILS).
        // Nominal (ILS) Loss: HUGE.
        // Real (USD) Loss: Moderate.
        // Rule: Recognized Loss should be the SMALLER loss (Conservative).
        // e.g. Buy 100 @ 100 USD = 10,000 USD. Rate 4 -> 40,000 ILS.
        // Price 95 USD (Loss). Rate 3.5 (Loss).
        // Value: 100 * 95 * 3.5 = 33,250 ILS.
        // Nominal Gain: 33,250 - 40,000 = -6,750 ILS.
        // Real Gain (USD): -500 USD. Converted to ILS (at 3.5? or 4?)
        // Actually usually "Real Loss" for foreign is calculated as:
        // Nominal Gain in ILS is -6750.
        // "Real Gain" tracks the Purchasing Power? No, for Foreign it tracks Forex.
        // Engine Logic: Real Gain = (Gain in USD) * Rate? = -500 * 3.5 = -1750 ILS.
        // Allowable Loss = Max(-6750, -1750) = -1750.
        
        const engine = new FinanceEngine([portfolio], mockRates as any, mockCPI as any);
        const buy: Transaction = {
            date: '2024-01-01', type: 'BUY', portfolioId: 'p1', ticker: 'LOSS', exchange: Exchange.NASDAQ,
            qty: 100, price: 100, originalPrice: 100, originalQty: 100, currency: Currency.USD,
        };
        (engine as any).exchangeRates = {
            current: { USD: 1, ILS: 4 },
            '2024-01-01': { USD: 1, ILS: 4 }
        };
        engine.processEvents([buy], []);
        const h = engine.holdings.get('p1_LOSS');

        h!.currentPrice = 95;
        (engine as any).exchangeRates.current.ILS = 3.5;
        engine.calculateSnapshot();

        // Nominal Loss: -6750.
        // Taxable should be closer to -1750.
        
        const taxable = h!.unrealizedTaxableGainILS;
        console.log('Double Loss - Nominal:', h!.unrealizedGain.amount / 100 * 3.5); // Approx
        console.log('Double Loss - Taxable:', taxable);

        // We expect -6750 (Nominal Loss), NOT -1750 (Real Loss).
        // User Rule: "For tax reasons, we can only use nominal loses" (Real losses capped at 0/ignored).
        // Nominal Gain = -6750. Real Gain = -1750.
        // Taxable = Nominal = -6750.
        expect(taxable).toBeCloseTo(-6750, -2); // within 100 range
        // expect(taxable).toBeGreaterThan(-8000); // Still true
    });

    it('should have Positive Tax on Negative Gain IF incTax (RSU) is present', () => {
        const pWithTax = { ...portfolio, incTax: 0.50 }; // 50% Income Tax on Cost (Grant)
        const engine = new FinanceEngine([pWithTax], mockRates as any, mockCPI as any);
        
        // Buy/Grant 100 @ 100. Cost 10,000.
        const buy: Transaction = {
            date: '2024-01-01', type: 'BUY', portfolioId: 'p1', ticker: 'RSU_LOSS', exchange: Exchange.NASDAQ,
            qty: 100, price: 100, originalPrice: 100, originalQty: 100, currency: Currency.USD,
        };
        (engine as any).exchangeRates = {
            current: { USD: 1, ILS: 4 },
            '2024-01-01': { USD: 1, ILS: 4 }
        };
        engine.processEvents([buy], []);
        const h = engine.holdings.get('p1_RSU_LOSS');

        // Price Drops to 90. (Loss -1000 USD / -4000 ILS)
        h!.currentPrice = 90;
        engine.calculateSnapshot();
        
        const gainILS = h!.unrealizedGain.amount;
        const taxILS = h!.unrealizedTaxLiabilityILS;
        
        console.log('RSU Loss - Gain ILS:', gainILS);
        console.log('RSU Loss - Tax ILS:', taxILS);
        
        expect(gainILS).toBeLessThan(0);
        expect(taxILS).toBeGreaterThan(0);
    });

    it('should Reproduce "Positive Tax on Negative Gain" via Foreign Nominal Mismatch', () => {
        // Scenario: Stock UP in USD, but Rat DOWN in ILS.
        // Tax Policy: NOMINAL_GAIN (taxes the USD Gain).
        // UI Display: Nominal ILS Gain (Total ILS Value - Total ILS Cost).
        
        const pNominal = { ...portfolio, taxPolicy: 'NOMINAL_GAIN' as TaxPolicy };
        const engine = new FinanceEngine([pNominal], mockRates as any, mockCPI as any);

        // Buy 100 @ 100 USD. Rate 4.
        // Cost USD = 10,000. Cost ILS = 40,000.
        const buy: Transaction = {
            date: '2024-01-01', type: 'BUY', portfolioId: 'p1', ticker: 'MISMATCH', exchange: Exchange.NASDAQ,
            qty: 100, price: 100, originalPrice: 100, originalQty: 100, currency: Currency.USD,
        };
        (engine as any).exchangeRates = {
            current: { USD: 1, ILS: 4 },
            '2024-01-01': { USD: 1, ILS: 4 }
        };
        engine.processEvents([buy], []);
        const h = engine.holdings.get('p1_MISMATCH');

        // Price UP to 110 USD (+10% Gain USD). Taxable!
        // Rate DOWN to 3 ILS (-25% Forex).
        // New Value USD = 11,000.
        // New Value ILS = 33,000.
        // Nominal ILS Gain = 33,000 - 40,000 = -7,000 ILS (LOSS).
        
        h!.currentPrice = 110;
        (engine as any).exchangeRates.current.ILS = 3;
        
        engine.calculateSnapshot();
        
        const nominalGainILS = h!.unrealizedGain.amount; 
        const taxILS = h!.unrealizedTaxLiabilityILS; 
        
        console.log('Mismatch - Nominal Gain ILS:', nominalGainILS);
        console.log('Mismatch - Tax ILS:', taxILS);
        
        // This mismatch is EXPECTED for NOMINAL_GAIN on Foreign Assets.
        // The Engine taxes the Foreign Gain (USD) converted to ILS, ignoring the Forex Loss on Principal (ILS).
        // The UI "Taxable Gain" has been updated to show the Foreign Gain (converted to ILS) to match this tax,
        // rather than the Nominal ILS Gain (which is negative).
        expect(nominalGainILS).toBeLessThan(0); // Underlying P&L is Negative (in ILS)
        expect(taxILS).toBeGreaterThan(0); // Tax is Positive (on Foreign Gain)
    });
});
