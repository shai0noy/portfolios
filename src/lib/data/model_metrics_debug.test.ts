import { describe, it } from 'vitest';
import { FinanceEngine } from './engine';
import { Currency, Exchange, type Portfolio, type Transaction } from '../types';
import * as fs from 'fs';

describe('Holding Metrics Debug', () => {
    it('debugs realized lots', () => {
        const portfolio = {
            id: 'p1', name: 'Test', currency: Currency.USD,
            cgt: 0, incTax: 0, commRate: 0, commMin: 0, commMax: 0,
            divPolicy: 'cash', divCommRate: 0, taxPolicy: 'IGNORE',
            mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly',
            feeHistory: []
        };
        const engine = new FinanceEngine([portfolio], { current: { USD: 1, ILS: 4 } } as any, { historical: [] } as any);
        const t1 = { id: '1', portfolioId: 'p1', ticker: 'MSFT', exchange: Exchange.NASDAQ, type: 'Buy', date: '2023-01-01T00:00:00Z', qty: 100, price: 100, currency: Currency.USD } as unknown as unknown as Transaction;
        const t2 = { id: '2', portfolioId: 'p1', ticker: 'MSFT', exchange: Exchange.NASDAQ, type: 'Sell', date: '2024-01-01T00:00:00Z', qty: 100, price: 200, currency: Currency.USD } as unknown as unknown as Transaction;
        
        console.log("Transaction 1:", t1);
        engine.processEvents([t1, t2], []);
        
        const holding = engine.holdings.get('p1_MSFT');
        if (holding) {
             fs.writeFileSync('debug_lots.json', JSON.stringify((holding as any)._lots, null, 2));
        }
    });
});
