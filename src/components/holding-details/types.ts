

import type { SimpleMoney } from '../../lib/types';

export interface HoldingValues {
    marketValue: SimpleMoney;
    unrealizedGain: SimpleMoney;
    unrealizedGainPct: number;
    realizedGain: SimpleMoney;
    realizedGainGross: SimpleMoney;
    realizedGainNet: SimpleMoney;
    realizedGainPct: number;
    realizedGainAfterTax: SimpleMoney;
    totalGain: SimpleMoney;
    totalGainPct: number;
    valueAfterTax: SimpleMoney;
    dayChangeVal: SimpleMoney;
    dayChangePct: number;
    costBasis: SimpleMoney;
    costOfSold: SimpleMoney;
    proceeds: SimpleMoney;
    dividends: SimpleMoney;
    currentPrice: SimpleMoney;
    avgCost: SimpleMoney;
    weightInPortfolio: number;
    weightInGlobal: number;
    unvestedValue: SimpleMoney;
    realizedTax: SimpleMoney;
    unrealizedTax: SimpleMoney;
    totalQty: number;
    realCost: SimpleMoney; // Inflation/Forex adjusted cost for remaining quantity
}

export interface UnifiedLayer {
    originalTxnId: string;
    date: Date;
    vestingDate?: Date;
    price: SimpleMoney;
    // currency: string; // Removed, redundant if price has currency
    originalQty: number;
    remainingQty: number;
    soldQty: number;
    transferredQty?: number; // Tracked separately from soldQty
    originalCost: SimpleMoney; // in Display Currency (usually)
    remainingCost: SimpleMoney; // in Display Currency
    fees: SimpleMoney;
    currentValue: SimpleMoney;
    realizedGain: SimpleMoney;
    taxLiability: SimpleMoney;
    realizedTax: SimpleMoney;
    unrealizedTax: SimpleMoney;
    adjustedCost: SimpleMoney;
    adjustedCostILS: SimpleMoney;
    originalCostILS: SimpleMoney; // Base Cost in ILS
    currentValueILS: SimpleMoney;
    realCostILS: SimpleMoney;
    unrealizedTaxableGainILS: SimpleMoney;
    adjustmentDetails?: { label: string; percentage: number };
}

export interface PortfolioGroup {
    portfolioId: string;
    portfolioName: string;
    stats: {
        originalQty: number;
        currentQty: number;
        value: SimpleMoney;
        cost: SimpleMoney;
        realCost: SimpleMoney;
        weight: number;
    };
    layers: UnifiedLayer[];
}
