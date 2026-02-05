import { Exchange, Currency, InstrumentType } from '../types';
import type { Transaction } from '../types';

export interface DividendEvent {
    ticker: string;
    exchange: Exchange;
    date: string; // YYYY-MM-DD
    amount: number; // Per share in stock currency
    source: string;
}

export interface EnrichedDividend extends DividendEvent {
    grossAmountSC: number;
    grossAmountPC: number;
    feeRate: number;
    feeAmountPC: number;
    taxRate: number;
    taxAmountPC: number;
    netAmountPC: number;
    currency: Currency;
}

export interface EnrichedTransaction extends Transaction {
    // Enriched Fields
    effectivePriceSC: number;
    txnValuePC: number;
    txnValueSC: number;
    feePC: number;
    feeSC: number;
    taxLiabilityILS: number; // Realized Tax Liability in ILS
    realizedGainILS: number; // Nominal Gain in ILS (Proceeds ILS - Cost ILS)
    realizedGainPC: number; // Realized Gain in Portfolio Currency (currency adjusted)
    realizedGainSC: number; // "Raw Gain" in Stock Currency (Proceeds SC - Cost SC). Pure asset performance.
    netGainPC: number; // Gain net of Sell Fee AND Allocated Buy Fee
    allocatedBuyFeePC: number; // Buy fee portion allocated to this sell
    realizedTaxableGainILS: number; // The tax base calculated according to policy (Real vs Nominal)
    
    postTxnQtyVested: number;
    postTxnQtyUnvested: number;
    postTxnCostBasisPC: number;
}

export interface RecurringFeeEvent {
    date: string;
    type: 'MANAGEMENT' | 'DEPOSIT';
    amountPC: number;
    currency: Currency;
    calculationBasePC?: number;
    rate?: number;
}

export interface UnifiedHolding {
    id: string;
    key: string;
    portfolioId: string;
    ticker: string;
    exchange: Exchange;
    stockCurrency: Currency;
    portfolioCurrency: Currency;
    currentPrice: number;
    dayChangePct: number;
    displayName: string;
    sector: string;
    type?: InstrumentType;

    // Quantity State
    qtyVested: number;
    qtyUnvested: number;
    totalQty: number;

    // Cost Basis (Accumulators)
    costBasisPortfolioCurrency: number; // Total Cost Basis (Vested + Unvested)
    costBasisVestedPortfolioCurrency: number; // Vested Portion Cost Basis
    costBasisStockCurrency: number;
    costBasisILS: number;
    costBasisUSD: number;

    // Realized/Unrealized State
    proceedsPortfolioCurrency: number;
    costOfSoldPortfolioCurrency: number;
    realizedGainPortfolioCurrency: number;
    realizedTaxableGain: number;

    // Income State
    dividendsPortfolioCurrency: number;
    dividendsStockCurrency: number;
    dividendsILS: number;
    dividendsUSD: number;

    // Fee State
    totalFeesPortfolioCurrency: number;
    feesBuyPortfolioCurrency: number;
    feesSellPortfolioCurrency: number;
    feesDivPortfolioCurrency: number;
    feesMgmtPortfolioCurrency: number;
    
    unallocatedBuyFeesPC: number; // State: Remaining buy fees for allocation
    
    totalSharesAcquired: number;

    // Tax State
    realizedTaxLiabilityILS: number;
    unrealizedTaxableGainILS: number;
    unrealizedTaxLiabilityILS: number;

    // Avg CPI
    weightedAvgCPI: number;

    // Performance / Snapshot
    marketValueVested: number;
    marketValueUnvested: number;
    unrealizedGainVested: number;
    avgCost: number;
    returnPct: number;

    // Period Perf
    perf1w?: number;
    perf1m?: number;
    perf3m?: number;
    perfYtd?: number;
    perf1y?: number;
    perf3y?: number;
    perf5y?: number;

    // Lists
    transactions: EnrichedTransaction[];
    dividends: EnrichedDividend[];
    recurringFees: RecurringFeeEvent[];
}
