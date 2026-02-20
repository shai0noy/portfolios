
import { describe, it, expect } from 'vitest';
import { aggregateHoldingValues, groupHoldingLayers, calculateHoldingWeights } from './holding_utils';
import { Currency } from '../types';
import type { ExchangeRates, Portfolio } from '../types';
import type { Holding } from './model';

const mockRates: ExchangeRates = {
    current: { USD: 1, ILS: 4 },
    '2023-01-01': { USD: 1, ILS: 3.5 },
    '2024-01-01': { USD: 1, ILS: 4.0 }
} as any;

describe('holding_utils', () => {
    describe('aggregateHoldingValues', () => {
        it('returns default values for empty input', () => {
            const result = aggregateHoldingValues([], mockRates, Currency.USD);
            expect(result.marketValue).toBe(0);
            expect(result.totalGain).toBe(0);
        });

        it('aggregates values from multiple holdings correctly', () => {
            const h1: Partial<Holding> = {
                ticker: 'AAPL',
                marketValueVested: { amount: 100, currency: Currency.USD },
                marketValueUnvested: { amount: 0, currency: Currency.USD },
                costBasisVested: { amount: 80, currency: Currency.USD },
                costOfSoldTotal: { amount: 0, currency: Currency.USD },
                proceedsTotal: { amount: 0, currency: Currency.USD },
                realizedGainNet: { amount: 0, currency: Currency.USD },
                dividendsTotal: { amount: 0, currency: Currency.USD },
                unrealizedGain: { amount: 20, currency: Currency.USD },
                qtyVested: 10,
                qtyTotal: 10
            };

            const h2: Partial<Holding> = {
                ticker: 'AAPL',
                marketValueVested: { amount: 200, currency: Currency.USD },
                marketValueUnvested: { amount: 0, currency: Currency.USD },
                costBasisVested: { amount: 150, currency: Currency.USD },
                costOfSoldTotal: { amount: 0, currency: Currency.USD },
                proceedsTotal: { amount: 0, currency: Currency.USD },
                realizedGainNet: { amount: 0, currency: Currency.USD },
                dividendsTotal: { amount: 0, currency: Currency.USD },
                unrealizedGain: { amount: 50, currency: Currency.USD },
                qtyVested: 20,
                qtyTotal: 20
            };

            const result = aggregateHoldingValues([h1 as Holding, h2 as Holding], mockRates, Currency.USD);

            expect(result.marketValue).toBe(300); // 100 + 200
            expect(result.costBasis).toBe(230); // 80 + 150
            expect(result.unrealizedGain).toBe(70); // 20 + 50
            expect(result.totalQty).toBe(30);
            expect(result.avgCost).toBeCloseTo(230 / 30);
        });

        it('converts currencies correctly', () => {
            // Holding in ILS, Display in USD. Rate ILS->USD = 0.25 (1/4)
            const h1: Partial<Holding> = {
                ticker: 'TA35',
                marketValueVested: { amount: 400, currency: Currency.ILS },
                marketValueUnvested: { amount: 0, currency: Currency.ILS },
                costBasisVested: { amount: 300, currency: Currency.ILS },
                costOfSoldTotal: { amount: 0, currency: Currency.ILS },
                proceedsTotal: { amount: 0, currency: Currency.ILS },
                realizedGainNet: { amount: 0, currency: Currency.ILS },
                dividendsTotal: { amount: 0, currency: Currency.ILS },
                unrealizedGain: { amount: 100, currency: Currency.ILS },
                qtyVested: 10,
                qtyTotal: 10
            };

            const result = aggregateHoldingValues([h1 as Holding], mockRates, Currency.USD);

            expect(result.marketValue).toBe(100); // 400 ILS / 4 = 100 USD
            expect(result.costBasis).toBe(75); // 300 ILS / 4 = 75 USD
            expect(result.unrealizedGain).toBe(25); // 100 ILS / 4 = 25 USD
        });
    });

    describe('calculateHoldingWeights', () => {
        it('calculates weights correctly with patched values', () => {
            // Portfolio 1: Total Value 1000 USD (Raw). Holding Value 100 USD (Real).
            // Portfolio 2: Total Value 2000 USD (Raw). Holding Value 400 USD (Real).

            // p1 removed
            const p2: Partial<Portfolio> = {
                id: 'p2', name: 'P2',
                holdings: [{ totalValue: 400, currency: Currency.USD, ticker: 'AAPL' } as any] // Raw value matches Real
            };

            // Should add up to 200 (other assets) + 0 (holding raw) -> Patched to 200 + 100 = 300?
            // Wait, logic is: pTotalAdjusted = pTotalRaw - hRaw + hReal.
            // P1 Raw Total: let's say 1000. hRaw: 0. hReal: 100. Adjusted: 1000 - 0 + 100 = 1100.
            // P2 Raw Total: 2000. hRaw: 400. hReal: 400. Adjusted: 2000 - 400 + 400 = 2000.

            // Simulating Raw Totals via holdings list:
            // P1 has NO other holdings in this mock, so TotalRaw = 0.
            // hRaw = 0.
            // hReal = 100.
            // Adjusted = 0 - 0 + 100 = 100.
            // Weight = 100 / 100 = 100%.

            // Let's add another holding to P1 to make it realistic.
            const p1_real: Partial<Portfolio> = {
                id: 'p1', name: 'P1',
                holdings: [
                    { totalValue: 0, currency: Currency.USD, ticker: 'AAPL' } as any,
                    { totalValue: 900, currency: Currency.USD, ticker: 'CASH' } as any
                ]
            };
            // P1 Raw Total = 900.
            // Adjusted = 900 - 0 + 100 = 1000.
            // Weight = 100 / 1000 = 10%.

            const groupedLayersBase = [
                { portfolioId: 'p1', stats: { value: 100 }, layers: [] } as any,
                { portfolioId: 'p2', stats: { value: 400 }, layers: [] } as any
            ];

            const result = calculateHoldingWeights(
                [p1_real as Portfolio, p2 as Portfolio],
                { ticker: 'AAPL' } as any,
                mockRates,
                Currency.USD,
                groupedLayersBase
            );

            expect(result).toHaveLength(2);

            const w1 = result.find(r => r.portfolioId === 'p1');
            expect(w1!.value).toBe(100);
            expect(w1!.weightInPortfolio).toBeCloseTo(0.1); // 100 / 1000

            const w2 = result.find(r => r.portfolioId === 'p2');
            expect(w2!.value).toBe(400);
            // P2 Raw Total = 400. hRaw = 400. hReal = 400. Adjusted = 400.
            // Weight = 400 / 400 = 100%. (No other assets)
            expect(w2!.weightInPortfolio).toBeCloseTo(1.0);

            // Global Weight
            // Total AUM = 1000 (P1) + 400 (P2) = 1400.
            // Global W1 = 100 / 1400 = 0.0714
            // Global W2 = 400 / 1400 = 0.2857
            expect(w1!.weightInGlobal).toBeCloseTo(100 / 1400);
            expect(w2!.weightInGlobal).toBeCloseTo(400 / 1400);
        });
        it('groups lots correctly - transferred vs sold', () => {
            const layers = [
                {
                    portfolioId: 'p1',
                    date: new Date('2023-01-01'),
                    qty: 10,
                    costPerUnit: { amount: 10, currency: Currency.USD },
                    costTotal: { amount: 100, currency: Currency.USD },
                    feesBuy: { amount: 0, currency: Currency.USD },
                    unrealizedTax: 0,
                    id: 'l1',
                    originalTxnId: 'l1' // Must match realized layers
                    // costPerUnit: { amount: 10, currency: Currency.USD, rateToPortfolio: 1 } // Removed duplicate
                }
            ];

            const realizedLayers = [
                {
                    portfolioId: 'p1',
                    date: new Date('2023-01-01'), // Same original date
                    soldDate: new Date('2023-06-01'),
                    qty: 5,
                    costPerUnit: { amount: 10, currency: Currency.USD, rateToPortfolio: 1 },
                    costTotal: { amount: 50, currency: Currency.USD },
                    feesBuy: { amount: 0, currency: Currency.USD },
                    realizedGainNet: 20,
                    totalRealizedTaxPC: 5,
                    soldFees: { amount: 0, currency: Currency.USD },
                    id: 'l1_sold',
                    originalTxnId: 'l1' // Links to same layer
                },
                {
                    portfolioId: 'p1',
                    date: new Date('2023-01-01'),
                    soldDate: new Date('2023-07-01'),
                    qty: 3,
                    costPerUnit: { amount: 10, currency: Currency.USD, rateToPortfolio: 1 },
                    costTotal: { amount: 30, currency: Currency.USD },
                    feesBuy: { amount: 0, currency: Currency.USD },
                    realizedGainNet: 0,
                    totalRealizedTaxPC: 0,
                    soldFees: { amount: 0, currency: Currency.USD },
                    id: 'l1_transfer',
                    originalTxnId: 'l1',
                    disposalType: 'TRANSFER' // Test Transfer Logic
                }
            ];

            const result = groupHoldingLayers(layers as any, realizedLayers, mockRates, Currency.USD, {}, {} as any, Currency.USD);

            expect(result.length).toBe(1);
            const p1 = result[0];
            // const keys = Object.keys(p1.layers);
            // expect(keys.length).toBe(1);
            const l = (p1.layers as any)[0];

            expect(l.originalQty).toBe(18); // 10 active + 5 sold + 3 transferred
            expect(l.remainingQty).toBe(10);
            expect(l.soldQty).toBe(5);
            expect(l.transferredQty).toBe(3);
        });
    });
});

describe('Vesting Logic', () => {
    it('aggregates unvested value and quantity correctly', () => {
        const h: Partial<Holding> = {
            ticker: 'GRANT',
            qtyVested: 100,
            qtyTotal: 150, // 50 Unvested
            marketValueVested: { amount: 1000, currency: Currency.USD }, // 100 * 10
            marketValueUnvested: { amount: 500, currency: Currency.USD }, // 50 * 10
            costBasisVested: { amount: 800, currency: Currency.USD },
            unrealizedGain: { amount: 200, currency: Currency.USD },
            // Unvested held as raw value in marketValueUnvested
        };

        const result = aggregateHoldingValues([h as Holding], mockRates, Currency.USD);

        // marketValue is accumulated from marketValueVested
        expect(result.marketValue).toBe(1000);
        expect(result.unvestedValue).toBe(500);
        expect(result.totalQty).toBe(100); // Only Vested

        // Value After Tax = marketValue - unrealizedTax. (Does not include unvested?)
        expect(result.valueAfterTax).toBe(1000);
    });

    it('handles mixed vested and unvested holdings', () => {
        const h1: Partial<Holding> = {
            ticker: 'GRANT',
            qtyVested: 10,
            qtyTotal: 10,
            marketValueVested: { amount: 100, currency: Currency.USD },
            marketValueUnvested: { amount: 0, currency: Currency.USD },
            costBasisVested: { amount: 50, currency: Currency.USD },
            unrealizedGain: { amount: 50, currency: Currency.USD },
        };

        const h2: Partial<Holding> = {
            ticker: 'GRANT',
            qtyVested: 0,
            qtyTotal: 20, // All unvested
            marketValueVested: { amount: 0, currency: Currency.USD },
            marketValueUnvested: { amount: 200, currency: Currency.USD },
            costBasisVested: { amount: 0, currency: Currency.USD },
            unrealizedGain: { amount: 0, currency: Currency.USD },
        };

        const result = aggregateHoldingValues([h1 as Holding, h2 as Holding], mockRates, Currency.USD);

        expect(result.marketValue).toBe(100);
        expect(result.unvestedValue).toBe(200);
        expect(result.totalQty).toBe(10); // Only Vested Qty (h1: 10, h2: 0)
        expect(result.costBasis).toBe(50);
    });
});
