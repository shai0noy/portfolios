

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
    price: number;
    currency: string;
    originalQty: number;
    remainingQty: number;
    soldQty: number;
    transferredQty?: number; // Tracked separately from soldQty
    originalCost: number; // in SC
    remainingCost: number; // in SC
    fees: number;
    currentValue: number;
    realizedGain: number;
    taxLiability: number;
    realizedTax: number;
    unrealizedTax: number;
    adjustedCost: number;
    adjustedCostILS: number;
    originalCostILS: number; // Base Cost in ILS
    currentValueILS: number;
    realCostILS: number;
    unrealizedTaxableGainILS: number;
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
