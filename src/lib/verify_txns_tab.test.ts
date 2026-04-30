import { describe, it, expect } from 'vitest';

function prepareTransactionsData(transactions: any[], dividendRecords: any[], holdings: any[]) {
    const allTxns: any[] = [];

    const getTickerName = (ticker: string) => {
      const h = holdings.find(x => x.ticker === ticker);
      return h ? (h.displayName || h.longName || h.nameHe || ticker) : ticker;
    };

    const grantGroups: Record<string, { date: string, ticker: string, qty: number, value: number, events: any[] }> = {};

    transactions.forEach(txn => {
      const isGrant = !!txn.vestDate;
      
      if (isGrant) {
          const dateStr = new Date(txn.date).toISOString().split('T')[0];
          const key = `${dateStr}_${txn.ticker}`;
          const val = (txn.originalQty ?? txn.qty ?? 0) * (txn.originalPrice ?? txn.price ?? 0);
          
          if (!grantGroups[key]) {
              grantGroups[key] = { date: txn.date, ticker: txn.ticker, qty: 0, value: 0, events: [] };
          }
          grantGroups[key].qty += (txn.originalQty ?? txn.qty ?? 0);
          grantGroups[key].value += val;
          grantGroups[key].events.push(txn);
      } else {
          const val = (txn.originalQty ?? txn.qty ?? 0) * (txn.originalPrice ?? txn.price ?? 0);
          allTxns.push({
              date: txn.date,
              type: txn.type,
              ticker: txn.ticker,
              name: getTickerName(txn.ticker),
              qty: txn.originalQty ?? txn.qty ?? 0,
              value: val,
              original: txn
          });
      }
    });

    for (const key in grantGroups) {
        const g = grantGroups[key];
        allTxns.push({
            date: g.date,
            type: 'GRANT',
            ticker: g.ticker,
            name: getTickerName(g.ticker),
            qty: g.qty,
            value: g.value,
            original: g.events[0]
        });
    }

    (dividendRecords || []).forEach(div => {
        const val = (div.unitsHeld || 0) * (div.pricePerUnit || div.grossAmount.amount || 0);
        allTxns.push({
            date: div.date,
            type: 'DIVIDEND',
            ticker: div.ticker,
            name: getTickerName(div.ticker),
            qty: div.unitsHeld || 0,
            value: val,
            original: div
        });
    });

    return allTxns;
}

describe('prepareTransactionsData', () => {
    it('should group grants by date and ticker', () => {
        const transactions = [
            { date: '2026-01-01', ticker: 'AAPL', qty: 10, price: 100, vestDate: '2026-06-01' },
            { date: '2026-01-01', ticker: 'AAPL', qty: 20, price: 100, vestDate: '2026-12-01' },
            { date: '2026-01-02', ticker: 'GOOG', qty: 5, price: 200 },
        ];
        const holdings = [{ ticker: 'AAPL', displayName: 'Apple' }];

        const result = prepareTransactionsData(transactions, [], holdings);
        expect(result.length).toBe(2);
        
        const grant = result.find(r => r.type === 'GRANT');
        expect(grant).toBeTruthy();
        expect(grant.qty).toBe(30);
        expect(grant.value).toBe(3000);
        expect(grant.name).toBe('Apple');
    });

    it('should combine dividends', () => {
        const dividendRecords = [
            { date: '2026-02-01', ticker: 'AAPL', unitsHeld: 10, pricePerUnit: 1, grossAmount: { amount: 10, currency: 'USD' } }
        ];
        const holdings = [{ ticker: 'AAPL', displayName: 'Apple' }];

        const result = prepareTransactionsData([], dividendRecords, holdings);
        expect(result.length).toBe(1);
        expect(result[0].type).toBe('DIVIDEND');
        expect(result[0].value).toBe(10);
    });
});
