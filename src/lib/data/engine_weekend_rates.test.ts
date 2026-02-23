import { test, expect } from 'vitest';
import { FinanceEngine } from './engine';
import { Currency } from '../types';

test('engine correctly falls back to previous rate for weekend transactions', () => {
  // Setup exchange rates where Friday (20th) exists but Saturday (21st) is missing
  const rates = {
    current: { USD: 1, ILS: 3.5, EUR: 1, ILA: 3.5, GBP: 1 },
    '2026-02-20': { USD: 1, ILS: 3.4, EUR: 1, ILA: 3.4, GBP: 1 }
    // 2026-02-21 is MISSING (Saturday)
  };

  const engine = new FinanceEngine(
    [{ id: "p1", currency: Currency.ILS, name: "p1" } as any],
    rates as any,
    null
  );

  // Buy on Saturday, Feb 21st
  engine.processEvents([
    {
      type: "BUY", date: "2026-02-21T00:00:00Z" as any, ticker: "AAPL", exchange: "NASDAQ" as any,
      qty: 1, price: 100, currency: Currency.USD, portfolioId: "p1", commission: 1
    } as any
  ], []);

  const holding = engine.holdings.get("p1_AAPL");
  console.log("Holdings keys:", [...engine.holdings.keys()]);
  expect(holding).toBeDefined();

  const lot = holding!.activeLots[0];

  // Check that we found the Friday rate (3.4) instead of defaulting to 1:1 or crashing
  // Cost in USD = 100
  // Cost in ILS should be 100 * 3.4 = 340

  // Verify costTotal exists
  expect(lot.costTotal).toBeDefined();

  // Verify valILS is populated
  expect(lot.costTotal.valILS).toBeCloseTo(340);

  // Verify valUSD is populated
  expect(lot.costTotal.valUSD).toBe(100);
});
