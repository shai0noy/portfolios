import { Currency } from '../../lib/types';

export interface HoldingValues {
    marketValue: number;
    unrealizedGain: number;
    unrealizedGainPct: number;
    realizedGain: number;
    realizedGainGross: number;
    realizedGainNet: number;
    realizedGainPct: number;
    realizedGainAfterTax: number;
    totalGain: number;
    totalGainPct: number;
    valueAfterTax: number;
    dayChangeVal: number;
    dayChangePct: number;
    costBasis: number;
    costOfSold: number;
    proceeds: number;
    dividends: number;
    currentPrice: number;
    avgCost: number;
    weightInPortfolio: number;
    weightInGlobal: number;
    unvestedValue: number;
    realizedTax: number;
    unrealizedTax: number;
    totalQty: number;
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
        value: number;
        cost: number;
        weight: number;
    };
    layers: UnifiedLayer[];
}
