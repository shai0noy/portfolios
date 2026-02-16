
import { FinanceEngine } from './lib/data/engine';
import { Currency, Exchange, type Portfolio, type Transaction } from './lib/types';

// Mock Data
const mockExchangeRates: any = {
    current: {
        'USD': 1,
        'ILS': 3.7,
        'EUR': 0.9,
    },
    'USD': { 'ILS': 3.7, 'USD': 1, 'EUR': 0.9 },
    'ILS': { 'USD': 1 / 3.7, 'ILS': 1, 'EUR': 0.9 / 3.7 },
    '2020-01-01': { 'USD': 1, 'ILS': 3.5, 'EUR': 0.9 }, // Historical: USD=3.5 ILS
    '2021-01-01': { 'USD': 1, 'ILS': 4.0, 'EUR': 0.9 }, // Historical: USD=4.0 ILS
};

const mockCPIData: any = {
    ticker: 'CPI',
    exchange: Exchange.TASE,
    price: 110,
    numericId: null,
    historical: [
        { date: new Date('2020-01-01'), price: 100 },
        { date: new Date('2023-01-01'), price: 110 },
    ]
};

async function run() {
    console.log("Starting Debug Script...");

    const p: Portfolio = {
        id: 'p2', name: 'USD Portfolio', currency: Currency.USD,
        taxPolicy: 'IL_REAL_GAIN',
        cgt: 0.25, incTax: 0, mgmtVal: 0, mgmtType: 'percentage', mgmtFreq: 'yearly', commRate: 0, commMin: 0, commMax: 0, divPolicy: 'cash_taxed', divCommRate: 0
    };

    const txn: Transaction = {
        date: '2020-01-01', // USD=3.5
        portfolioId: 'p2',
        ticker: 'AAPL',
        exchange: Exchange.NASDAQ,
        type: 'BUY',
        qty: 10,
        price: 100, // 100 USD. Total 1000 USD.
        currency: Currency.USD,
        originalQty: 10,
        originalPrice: 100
    };

    console.log("Creating Engine...");
    const engine = new FinanceEngine([p], mockExchangeRates, mockCPIData);

    console.log("Processing Events...");
    engine.processEvents([txn], []);

    console.log("Calculating Snapshot...");
    engine.calculateSnapshot();

    const h = engine.holdings.get('p2_AAPL');
    if (h) {
        console.log("Holding found:", h.ticker);
        console.log("Adjusted Cost:", h.adjustedCost);
        console.log("Active Lots:", h.activeLots.length);
        console.log("QtyVested:", h.qtyVested, "QtyUnvested:", h.qtyUnvested, "QtyTotal:", h.qtyTotal);
        if (h.activeLots.length > 0) {
            console.log("Lot Adjusted Cost:", h.activeLots[0].adjustedCost);
        }
    } else {
        console.log("Holding not found!");
    }
}

run().catch(console.error);
