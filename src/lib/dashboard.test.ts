
import { describe, it, expect } from 'vitest';
import { calculateDashboardSummary, type DashboardSummaryData } from './dashboard';
import { Currency, Exchange, type Portfolio, type ExchangeRates } from './types';
import { FinanceEngine } from './data/engine';
import { Holding } from './data/model';
import type { Lot } from './data/model';

// Extend mock input type to allow passing lots
interface MockHoldingData {
    [key: string]: any;
    vestedLots?: Partial<Lot>[];
    realizedLots?: Partial<Lot>[];
    transactions?: any[];
    dividends?: any[];
}

// --- MOCKS ---

const mockRates: ExchangeRates = {
    current: { USD: 1, ILS: 4, EUR: 0.9, GBP: 0.8 },
    ago1m: { USD: 1, ILS: 4 }
};

const mockPortfolios = new Map<string, Portfolio>();
mockPortfolios.set('p1', {
    id: 'p1', name: 'US Portfolio', currency: Currency.USD,
    taxPolicy: 'IL_REAL_GAIN', cgt: 0.25, incTax: 0.25,
    commRate: 0, commMin: 0, commMax: 0, divCommRate: 0,
    holdings: []
} as unknown as Portfolio);

// --- HELPERS ---

function createMockEngine(holdingsData: MockHoldingData[]) {
    // Better: create a partial object that looks like FinanceEngine
    const engine = {
        holdings: new Map<string, Holding>(),
        getGlobalSummary: () => ({ /* Mocked in test logic if needed */ } as any),
    } as unknown as FinanceEngine;

    // Mock getGlobalSummary to aggregate minimal data for dashboard summary
    (engine as any).getGlobalSummary = (currency: string, keys: Set<string>) => {
        let aum = 0;
        let totalUnrealized = 0;
        let totalRealized = 0;
        let totalDayChange = 0;
        let totalCost = 0;
        let totalUnvestedValue = 0;
        let realizedGainAfterTax = 0;

        const rate = currency === 'ILS' ? 4 : 1; // Simple mock conversion

        engine.holdings.forEach(h => {
            if (!keys.has(h.id)) return;

            // Simple sum (assuming USD source for simplicity in this mock)
            aum += h.marketValueVested.amount * rate;
            totalUnrealized += h.unrealizedGain.amount * rate;
            totalRealized += (h.realizedGainNet.amount + h.dividendsTotal.amount) * rate;

            totalUnvestedValue += h.marketValueUnvested.amount * rate;

            if (h.dayChangePct && h.marketValueVested.amount) {
                const changeVal = h.marketValueVested.amount * h.dayChangePct;
                totalDayChange += changeVal * rate;
            }

            // Tax handling for test
            let tax = 0;
            if ((h as any).realizedTax) {
                tax = (h as any).realizedTax * rate;
            }

            // realizedGainAfterTax = (Realized Gain + Divs) - Tax
            const gain = (h.realizedGainNet.amount + h.dividendsTotal.amount) * rate;
            realizedGainAfterTax += gain - tax;
        });

        return {
            aum,
            totalUnrealized,
            totalRealized,
            totalDayChange,
            totalUnvestedValue,
            realizedGainAfterTax,
            totalUnrealizedGainPct: totalCost > 0 ? totalUnrealized / totalCost : 0,
        } as DashboardSummaryData;
    };

    holdingsData.forEach(h => {
        const fullHolding = {
            id: h.id || `${h.portfolioId}_${h.ticker}`,
            key: h.key || h.id || `${h.portfolioId}_${h.ticker}`,
            portfolioId: h.portfolioId || 'p1',
            ticker: h.ticker || 'MOCK',
            exchange: h.exchange || Exchange.NASDAQ,
            stockCurrency: h.stockCurrency || Currency.USD,
            portfolioCurrency: h.portfolioCurrency || Currency.USD,
            currentPrice: h.currentPrice || 0,
            dayChangePct: h.dayChangePct || 0,
            
            qtyVested: h.qtyVested ?? 0,
            qtyUnvested: h.qtyUnvested ?? 0,
            totalQty: (h.qtyVested ?? 0) + (h.qtyUnvested ?? 0),
            
            marketValueVested: h.marketValueVested || { amount: 0, currency: Currency.USD },
            marketValueUnvested: h.marketValueUnvested || { amount: 0, currency: Currency.USD },
            costBasisVested: h.costBasisVested || { amount: 0, currency: Currency.USD },
            
            unrealizedGain: h.unrealizedGain || { amount: 0, currency: Currency.USD },
            realizedGainNet: h.realizedGainNet || { amount: 0, currency: Currency.USD },
            
            proceedsTotal: h.proceedsTotal || { amount: 0, currency: Currency.USD },
            costOfSoldTotal: h.costOfSoldTotal || { amount: 0, currency: Currency.USD },
            dividendsTotal: h.dividendsTotal || { amount: 0, currency: Currency.USD },
            feesTotal: h.feesTotal || { amount: 0, currency: Currency.USD },
            
            realizedTaxLiabilityILS: h.realizedTaxLiabilityILS || 0,
            unrealizedTaxLiabilityILS: h.unrealizedTaxLiabilityILS || 0,
            unrealizedTaxableGainILS: h.unrealizedTaxableGainILS || 0,
            realizedTax: h.realizedTax || 0,
            
            // New fields required for historical calc
            vestedLots: h.vestedLots || [],
            realizedLots: h.realizedLots || [],
            transactions: h.transactions || [],
            dividends: h.dividends || [],

            addTransaction: () => { },
            addDividend: () => { },
        } as unknown as Holding; 
        
        engine.holdings.set(fullHolding.id, fullHolding);
    });
    return engine;
}

// --- TESTS ---

describe('Dashboard Summary Calculation', () => {

    it('should aggregate basic summary correctly', () => {
        const engine = createMockEngine([{
            portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ,
            stockCurrency: Currency.USD, portfolioCurrency: Currency.USD,
            qtyVested: 10, qtyUnvested: 0,
            currentPrice: 100, 
            marketValueVested: { amount: 1000, currency: Currency.USD },
            unrealizedGain: { amount: 100, currency: Currency.USD },
            costBasisVested: { amount: 900, currency: Currency.USD },
            dayChangePct: 0.01,
        }]);

        const data = [{ key: 'p1_AAPL' }];
        const { summary } = calculateDashboardSummary(data, 'USD', mockRates, mockPortfolios, engine);

        expect(summary.aum).toBeCloseTo(1000, 1);
        expect(summary.totalUnrealized).toBeCloseTo(100, 1);
        expect(summary.totalDayChange).toBeCloseTo(10, 1);
    });

    it('should exclude unvested from AUM', () => {
        const engine = createMockEngine([{
            portfolioId: 'p1', ticker: 'RSU', exchange: Exchange.NASDAQ,
            stockCurrency: Currency.USD, portfolioCurrency: Currency.USD,
            qtyVested: 5, qtyUnvested: 5,
            currentPrice: 100,
            marketValueVested: { amount: 500, currency: Currency.USD },
            marketValueUnvested: { amount: 500, currency: Currency.USD },
            unrealizedGain: { amount: 0, currency: Currency.USD },
            costBasisVested: { amount: 500, currency: Currency.USD },
            dayChangePct: 0,
        }]);

        const data = [{ key: 'p1_RSU' }];
        const { summary, holdings: enriched } = calculateDashboardSummary(data, 'USD', mockRates, mockPortfolios, engine);

        expect(summary.aum).toBeCloseTo(500, 1);
        expect(summary.totalUnvestedValue).toBeCloseTo(500, 1);
        expect(enriched[0].display.marketValue).toBeCloseTo(500, 1);
        // expect(enriched[0].display.unvestedValue).toBeCloseTo(500, 1); // unvestedValue might be undefined if not populated in Enriched?
        // Let's check dashboard.ts again. EnrichedDashboardHolding has display.unvestedValue.
        expect(enriched[0].display.unvestedValue).toBeCloseTo(500, 1);
    });

    it('should handle currency conversion for ILS display', () => {
        const engine = createMockEngine([{
            portfolioId: 'p1', ticker: 'AAPL', exchange: Exchange.NASDAQ,
            stockCurrency: Currency.USD, portfolioCurrency: Currency.USD,
            qtyVested: 10, qtyUnvested: 0,
            currentPrice: 100,
            marketValueVested: { amount: 1000, currency: Currency.USD },
            unrealizedGain: { amount: 100, currency: Currency.USD },
            costBasisVested: { amount: 900, currency: Currency.USD },
            dayChangePct: 0,
        }]);

        const data = [{ key: 'p1_AAPL' }];
        const { summary } = calculateDashboardSummary(data, 'ILS', mockRates, mockPortfolios, engine);

        // 1000 USD * 4 = 4000 ILS
        expect(summary.aum).toBeCloseTo(4000, 1);
        // 100 USD * 4 = 400 ILS
        expect(summary.totalUnrealized).toBeCloseTo(400, 1);
    });

    it('should calculate realized gain tax correctly', () => {
        const engine = createMockEngine([{
            portfolioId: 'p1', ticker: 'SOLD', exchange: Exchange.NASDAQ,
            stockCurrency: Currency.USD, portfolioCurrency: Currency.USD,
            qtyVested: 0, qtyUnvested: 0,
            marketValueVested: { amount: 0, currency: Currency.USD },
            unrealizedGain: { amount: 0, currency: Currency.USD },
            realizedGainNet: { amount: 100, currency: Currency.USD },
            dividendsTotal: { amount: 0, currency: Currency.USD },

            realizedTaxLiabilityILS: 100, // Not used in this mock simple logic
            realizedTax: 25, // 25 USD tax (assuming we set this explicitly for test)
            dayChangePct: 0,
        }]);

        const data = [{ key: 'p1_SOLD' }];
        const { summary } = calculateDashboardSummary(data, 'USD', mockRates, mockPortfolios, engine);

        expect(summary.totalRealized).toBeCloseTo(100, 1);
        // Tax is 25 USD. So 100 - 25 = 75.
        expect(summary.realizedGainAfterTax).toBeCloseTo(75, 1);
    });

    it('should use historical cost from lots for display currency', () => {
        // Scenario: Bought 1 unit at $100 when ILS was 3.5. Cost 350 ILS.
        // Current ILS is 4.0. Value 480 ILS ($120 * 4).
        // Historical Cost Logic: Cost = 350. Unrealized = 130.
        // Current Rate Logic (Bad): Cost = 400. Unrealized = 80.

        const historicalLot = {
            qty: 1,
            costTotal: { amount: 100, currency: Currency.USD, valILS: 350, valUSD: 100 }
        };

        const engine = createMockEngine([{
            portfolioId: 'p1', ticker: 'HIST', exchange: Exchange.NASDAQ,
            stockCurrency: Currency.USD, portfolioCurrency: Currency.USD,
            qtyVested: 1, qtyUnvested: 0,
            currentPrice: 120,
            marketValueVested: { amount: 120, currency: Currency.USD },
            unrealizedGain: { amount: 20, currency: Currency.USD },
            costBasisVested: { amount: 100, currency: Currency.USD },
            dayChangePct: 0,

            vestedLots: [historicalLot as any],
        }]);

        const data = [{ key: 'p1_HIST' }];
        const { holdings } = calculateDashboardSummary(data, 'ILS', mockRates, mockPortfolios, engine);
        const enriched = holdings[0];

        expect(enriched.display.marketValue).toBeCloseTo(480, 1);
        expect(enriched.display.costBasis).toBeCloseTo(350, 1);
        expect(enriched.display.unrealizedGain).toBeCloseTo(130, 1);
    });
});
