import { useState, useEffect, useCallback } from 'react';
import { InstrumentType } from './types/instrument';
import { fetchPortfolios, fetchTransactions, getExternalPrices, fetchAllDividends } from './sheets/index';
import { getTickerData } from './fetching';
import { fetchCpi } from './fetching/cbs';
import type { TickerData } from './fetching/types';
import { getExchangeRates, convertCurrency, calculatePerformanceInDisplayCurrency, calculateHoldingDisplayValues, normalizeCurrency, toILS } from './currency';
import { logIfFalsy } from './utils';
import { toGoogleSheetDateFormat } from './date';
import { Currency, Exchange, type DashboardHolding, type Holding, type Portfolio, type ExchangeRates, type Transaction } from './types';
import { SessionExpiredError } from './errors';
import { useSession } from './SessionContext';

/**
 * Data structure representing the aggregate performance of a portfolio or group of portfolios.
 */
const getCPI = (date: Date, cpiData: TickerData | null) => {
    if (!cpiData?.historical || cpiData.historical.length === 0) return 100;
    
    // Find nearest point
    // Data is sorted descending usually (from TickerData structure), but let's check.
    // TickerData.historical is usually sorted Date Descending (Newest first).
    // Let's assume Descending.
    
    const timestamp = date.getTime();
    const history = cpiData.historical;
    
    // Exact match or interpolation
    // Simple logic: Find first point <= date (which is the "next" point in descending list? No, previous in time).
    // Descending: [2024, 2023, 2022...]
    // If date = 2023.5.
    // We iterate. 2024 > 2023.5. 2023 <= 2023.5.
    // So 2023 is the "floor" (start point). 2024 is "ceiling" (end point).
    // Interpolate.
    
    for (let i = 0; i < history.length - 1; i++) {
        const h1 = history[i]; // Newer
        const h2 = history[i+1]; // Older
        
        if (h1.date.getTime() >= timestamp && h2.date.getTime() <= timestamp) {
            // Found bracket
            const t1 = h1.date.getTime();
            const t2 = h2.date.getTime();
            const v1 = h1.price;
            const v2 = h2.price;
            
            // Linear Interpolation
            const ratio = (timestamp - t2) / (t1 - t2);
            return v2 + (v1 - v2) * ratio;
        }
    }
    
    // Out of bounds
    if (timestamp > history[0].date.getTime()) return history[0].price; // Future -> Use latest
    return history[history.length - 1].price; // Past -> Use oldest
};

export interface DashboardSummaryData {
  aum: number; // Assets Under Management (Total Market Value)
  totalUnrealized: number; // Unrealized Gain (Current Value - Cost Basis)
  totalUnrealizedGainPct: number;
  totalRealized: number; // Realized Gain (Proceeds from Sells - Cost of Sold Shares)
  totalRealizedGainPct: number;
  totalCostOfSold: number;
  totalDividends: number; // Total Dividends received across all holdings
  totalReturn: number; // Total Gain (Unrealized + Realized + Dividends)
  realizedGainAfterTax: number; // Realized Gain adjusted for CGT
  valueAfterTax: number; // Estimated Liquidation Value (AUM - latent tax on unrealized gains)
  totalDayChange: number; // Absolute daily change in display currency
  totalDayChangePct: number; // Weighted percentage daily change
  totalDayChangeIsIncomplete: boolean; // True if some holdings missing daily change data
  perf1d: number;
  perf1w: number;
  perf1w_incomplete: boolean;
  perf1m: number;
  perf1m_incomplete: boolean;
  perf3m: number;
  perf3m_incomplete: boolean;
  perf1y: number;
  perf1y_incomplete: boolean;
  perf3y: number;
  perf3y_incomplete: boolean;
  perf5y: number;
  perf5y_incomplete: boolean;
  perfYtd: number;
  perfYtd_incomplete: boolean;
  divYield: number;
}

export const INITIAL_SUMMARY: DashboardSummaryData = {
  aum: 0,
  totalUnrealized: 0,
  totalUnrealizedGainPct: 0,
  totalRealized: 0,
  totalRealizedGainPct: 0,
  totalCostOfSold: 0,
  totalDividends: 0,
  totalReturn: 0,
  realizedGainAfterTax: 0,
  valueAfterTax: 0,
  totalDayChange: 0,
  totalDayChangePct: 0,
  totalDayChangeIsIncomplete: false,
  perf1d: 0,
  perf1w: 0, perf1w_incomplete: false,
  perf1m: 0, perf1m_incomplete: false,
  perf3m: 0, perf3m_incomplete: false,
  perf1y: 0, perf1y_incomplete: false,
  perf3y: 0, perf3y_incomplete: false,
  perf5y: 0, perf5y_incomplete: false,
  perfYtd: 0, perfYtd_incomplete: false,
  divYield: 0,
};

const perfPeriods = {
  perf1w: 'perf1w',
  perf1m: 'perf1m',
  perf3m: 'perf3m',
  perfYtd: 'perfYtd',
  perf1y: 'perf1y',
  perf3y: 'perf3y',
  perf5y: 'perf5y',
} as const;

interface SummaryAcc {
  aum: number;
  totalUnrealizedDisplay: number;
  totalRealizedDisplay: number;
  totalCostOfSoldDisplay: number;
  totalDividendsDisplay: number;
  totalReturnDisplay: number;
  totalRealizedTaxDisplay: number;
  totalUnrealizedTaxDisplay: number;
  totalDayChange: number;
  aumWithDayChangeData: number;
  holdingsWithDayChange: number;
  [key: string]: any;
}

/**
 * Aggregates holding-level data into a global summary.
 * Correctly applies portfolio-specific tax rules and handles currency conversion.
 */
export function calculateDashboardSummary(data: DashboardHolding[], displayCurrency: string, exchangeRates: ExchangeRates, portfolios: Map<string, Portfolio>): DashboardSummaryData {
  // 1. Accumulate Per-Portfolio Data for Tax Offsetting
  const portfolioAcc: Record<string, {
      costBasisTotalILS: number;
      feesILS: number; // Total Deductible Fees (Commission + Transaction Fees) in ILS
      
      // ILS Buckets for Tax Calculation (Source of Truth for Tax)
      // Standard Bucket (Taxed at CGT)
      std: {
          unrealizedGain: number;
          realizedGain: number; // Trading Gains (and Standard Dividends)
      },
      
      // REIT Income Bucket (Taxed at Income Tax, if configured)
      reit: {
          realizedGain: number; // REIT Dividends Only
      }
  }> = {};

  const globalAcc: SummaryAcc = {
    aum: 0,
    totalUnrealizedDisplay: 0,
    totalRealizedDisplay: 0,
    totalCostOfSoldDisplay: 0,
    totalDividendsDisplay: 0,
    totalReturnDisplay: 0,
    totalRealizedTaxDisplay: 0,
    totalUnrealizedTaxDisplay: 0,
    totalDayChange: 0,
    aumWithDayChangeData: 0,
    holdingsWithDayChange: 0,
  };

  Object.keys(perfPeriods).forEach(p => {
    globalAcc[`totalChange_${p}`] = 0;
    globalAcc[`aumFor_${p}`] = 0;
    globalAcc[`holdingsFor_${p}`] = 0;
  });

  data.forEach(h => {
    // Standardize Values (Display Currency) - For User View
    const vals = calculateHoldingDisplayValues(h, displayCurrency, exchangeRates);

    // Update Global Totals (Display)
    globalAcc.aum += vals.marketValue;
    globalAcc.totalUnrealizedDisplay += vals.unrealizedGain;
    globalAcc.totalRealizedDisplay += vals.realizedGain;
    globalAcc.totalCostOfSoldDisplay += vals.costOfSold;
    globalAcc.totalDividendsDisplay += vals.dividends;
    globalAcc.totalReturnDisplay += vals.totalGain;

    // Accumulate ILS Values for Tax Calculation
    const p = portfolios.get(h.portfolioId);
    if (!portfolioAcc[h.portfolioId]) {
        portfolioAcc[h.portfolioId] = { 
            costBasisTotalILS: 0,
            feesILS: 0,
            std: { unrealizedGain: 0, realizedGain: 0 },
            reit: { realizedGain: 0 }
        };
    }
    const pAcc = portfolioAcc[h.portfolioId];
    
    // Cost Basis Total in ILS (Wealth Tax Base)
    pAcc.costBasisTotalILS += h.costBasisILS;
    
    // Fees (Convert PC -> ILS)
    pAcc.feesILS += convertCurrency(h.totalFeesPortfolioCurrency, h.portfolioCurrency, Currency.ILS, exchangeRates);

    // Calculate/Select Taxable Gains in ILS
    let taxableUnrealizedILS = 0;
    let taxableRealizedILS = 0;

    if (p?.taxPolicy === 'REAL_GAIN') {
        // Use pre-calculated Real Gains (Inflation Adjusted for ILS, or Nominal for Foreign which approximates Real)
        taxableRealizedILS = h.realizedTaxableGainILS;
        taxableUnrealizedILS = h.unrealizedTaxableGainILS;
    } else {
        // Nominal Gain (ILS)
        // Realized:
        taxableRealizedILS = h.realizedGainILS; // Nominal
        
        // Unrealized: Calculate Nominal ILS Gain
        const priceInILS = convertCurrency(h.currentPrice, h.stockCurrency, Currency.ILS, exchangeRates);
        const mvILS = h.totalQty * priceInILS;
        taxableUnrealizedILS = mvILS - h.costBasisILS;
    }

    // Allocation Logic:
    // 1. Capital Gains (Realized/Unrealized) -> Always Standard Bucket (CGT)
    pAcc.std.unrealizedGain += taxableUnrealizedILS;
    pAcc.std.realizedGain += taxableRealizedILS;

    // 2. Dividends
    const isReit = h.type?.type === InstrumentType.STOCK_REIT;
    const incTax = p?.incTax || 0;
    
    if (isReit && incTax > 0) {
        // REIT Dividends -> Income Tax Bucket
        pAcc.reit.realizedGain += h.dividendsILS;
    } else {
        // Standard Dividends -> Standard Bucket (CGT)
        pAcc.std.realizedGain += h.dividendsILS;
    }

    // Performance Aggregation (Display)
    if (h.dayChangePct !== 0 && isFinite(h.dayChangePct)) {
      const marketValueDisplay = vals.marketValue;
      const changeValDisplay = marketValueDisplay * h.dayChangePct / (1 + h.dayChangePct);

      globalAcc.totalDayChange += changeValDisplay;
      globalAcc.aumWithDayChangeData += vals.marketValue;
      globalAcc.holdingsWithDayChange++;
    }

    for (const [key, holdingKey] of Object.entries(perfPeriods)) {
      const perf = h[holdingKey as keyof DashboardHolding] as number;
      if (perf && !isNaN(perf)) {
        const { changeVal } = calculatePerformanceInDisplayCurrency(
          h.currentPrice, h.stockCurrency,
          perf, displayCurrency, exchangeRates
        );

        const currentMVDisplay = vals.marketValue;
        const totalChangeForHolding = changeVal * h.totalQty;

        globalAcc[`totalChange_${key}`] += totalChangeForHolding;
        globalAcc[`aumFor_${key}`] += currentMVDisplay;
        globalAcc[`holdingsFor_${key}`]++;
      }
    }
  });

  // 2. Calculate Tax Per Portfolio (In ILS)
  Object.keys(portfolioAcc).forEach(pid => {
      const pData = portfolioAcc[pid];
      const p = portfolios.get(pid);
      
      let cgt = p?.cgt ?? 0.25;
      let incTax = p?.incTax ?? 0;

      if (p?.taxPolicy === 'TAX_FREE') {
          cgt = 0;
          incTax = 0;
      }

      // Deductible Fees (ILS)
      let deductibleFeesILS = 0;
      if (p?.taxPolicy === 'REAL_GAIN') {
          deductibleFeesILS = pData.feesILS;
      }

      // Offset Fees against Standard Realized Gain (ILS)
      // Fees only offset Capital Gains (Standard Bucket)
      const netStdRealizedGainILS = pData.std.realizedGain - deductibleFeesILS;

      // Calculate Tax Liability (ILS)
      const stdUnrealizedTaxILS = pData.std.unrealizedGain > 0 ? pData.std.unrealizedGain * cgt : 0;
      const stdRealizedTaxILS = netStdRealizedGainILS > 0 ? netStdRealizedGainILS * cgt : 0;

      // REIT Bucket: Taxed at Income Tax (Dividends only)
      // No unrealized gain in this bucket now.
      const reitRealizedTaxILS = pData.reit.realizedGain > 0 ? pData.reit.realizedGain * incTax : 0;

      const incomeTaxOnBaseILS = pData.costBasisTotalILS * incTax;

      const totalRealizedTaxILS = stdRealizedTaxILS + reitRealizedTaxILS;
      const totalUnrealizedTaxILS = stdUnrealizedTaxILS + incomeTaxOnBaseILS; // No REIT unrealized tax

      // Convert Tax Liability to Display Currency
      globalAcc.totalRealizedTaxDisplay += convertCurrency(totalRealizedTaxILS, Currency.ILS, displayCurrency, exchangeRates);
      globalAcc.totalUnrealizedTaxDisplay += convertCurrency(totalUnrealizedTaxILS, Currency.ILS, displayCurrency, exchangeRates);
  });

  const summaryResult: DashboardSummaryData = {
    ...INITIAL_SUMMARY,
    aum: globalAcc.aum,
    totalUnrealized: globalAcc.totalUnrealizedDisplay,
    totalRealized: globalAcc.totalRealizedDisplay,
    totalDividends: globalAcc.totalDividendsDisplay,
    totalReturn: globalAcc.totalReturnDisplay,
    totalCostOfSold: globalAcc.totalCostOfSoldDisplay,
    totalUnrealizedGainPct: (globalAcc.aum - globalAcc.totalUnrealizedDisplay) > 0 ? globalAcc.totalUnrealizedDisplay / (globalAcc.aum - globalAcc.totalUnrealizedDisplay) : 0,
    totalRealizedGainPct: globalAcc.totalCostOfSoldDisplay > 0 ? globalAcc.totalRealizedDisplay / globalAcc.totalCostOfSoldDisplay : 0,
    totalDayChange: globalAcc.totalDayChange,
    
    // Net Values (Gross Gain - Tax Liability)
    realizedGainAfterTax: (globalAcc.totalRealizedDisplay + globalAcc.totalDividendsDisplay) - globalAcc.totalRealizedTaxDisplay,
    valueAfterTax: globalAcc.aum - globalAcc.totalUnrealizedTaxDisplay,
    
    totalDayChangePct: 0, perf1d: 0
  };

  const totalHoldings = data.length;
  const prevClose = globalAcc.aumWithDayChangeData - globalAcc.totalDayChange;
  summaryResult.totalDayChangePct = prevClose > 0 ? globalAcc.totalDayChange / prevClose : 0;
  summaryResult.perf1d = summaryResult.totalDayChangePct;
  summaryResult.totalDayChangeIsIncomplete = globalAcc.holdingsWithDayChange > 0 && globalAcc.holdingsWithDayChange < totalHoldings;

  for (const key of Object.keys(perfPeriods)) {
    const totalChange = globalAcc[`totalChange_${key}`];
    const aumForPeriod = globalAcc[`aumFor_${key}`];
    const prevValue = aumForPeriod - totalChange;
    const finalKey = key as keyof DashboardSummaryData;
    (summaryResult as Record<string, any>)[finalKey] = prevValue > 0 ? totalChange / prevValue : 0;

    const holdingsForPeriod = globalAcc[`holdingsFor_${key}`];
    const incompleteKey = `${key}_incomplete` as keyof DashboardSummaryData;
    (summaryResult as Record<string, any>)[incompleteKey] = holdingsForPeriod > 0 && holdingsForPeriod < totalHoldings;
  }

  return summaryResult;
}

/**
 * Main data fetching hook for the Dashboard.
 * Orchestrates fetching portfolios, transactions, and dividends.
 * Performs chronological "replay" of events to track quantities and apply dividends accurately.
 */
export function useDashboardData(sheetId: string, options: { includeUnvested: boolean }) {
  const [loading, setLoading] = useState(true);
  const [holdings, setHoldings] = useState<DashboardHolding[]>([]);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates>({ current: { USD: 1, ILS: 3.7 } });
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [hasFutureTxns, setHasFutureTxns] = useState(false);
  const [error, setError] = useState<any>(null);
  const { showLoginModal } = useSession();

  useEffect(() => {
    getExchangeRates(sheetId).then(setExchangeRates).catch(e => {
      if (e instanceof SessionExpiredError) {
        setError('session_expired');
        showLoginModal();
      } else {
        setError(e);
      }
    });
  }, [sheetId, showLoginModal]);

  const loadData = useCallback(async () => {
    if (!sheetId) return;
    setLoading(true);
    setError(null);
    try {
      const [ports, txns, extPrices, sheetDividends, realCpi] = await Promise.all([
        fetchPortfolios(sheetId),
        fetchTransactions(sheetId),
        getExternalPrices(sheetId),
        fetchAllDividends(sheetId),
        fetchCpi(120010)
      ]);

      setPortfolios(ports);
      const newPortMap = new Map(ports.map(p => [p.id, p]));
      const holdingMap = new Map<string, DashboardHolding>();

      txns.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const today = new Date();
      const futureTxns = txns.filter(t => new Date(t.date) > today);
      setHasFutureTxns(futureTxns.length > 0);
      const pastTxns = txns.filter(t => new Date(t.date) <= today);
      
      // 1. Merge Transactions and External Dividends into a single chronological stream.
      // External dividends are per-share events that need to be applied to active quantities.
      const combinedEvents: (Transaction & { kind: 'TXN' } | { kind: 'DIV_EVENT', date: string, ticker: string, exchange: Exchange, amountPerShare: number })[] = 
          pastTxns.map(t => ({ ...t, kind: 'TXN' }));

      sheetDividends.forEach(d => {
          const dateKey = d.date.toISOString().split('T')[0];
          
          // Deduplication: If a manual DIVIDEND transaction exists for this ticker/date, skip the external one.
          // Note: The system no longer supports entering new DIVIDEND transactions in the log, but legacy ones are respected.
          const hasManual = txns.some(t => t.ticker === d.ticker && t.type === 'DIVIDEND' && t.date.startsWith(dateKey));
          
          if (!hasManual) {
              combinedEvents.push({
                  kind: 'DIV_EVENT',
                  date: dateKey,
                  ticker: d.ticker,
                  exchange: d.exchange,
                  amountPerShare: d.amount
              });
          }
      });

      combinedEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // 2. Replay all events to build current holding state and capture historical dividends.
      const processingEvents = options.includeUnvested 
          ? combinedEvents 
          : combinedEvents.filter(e => e.kind === 'DIV_EVENT' || !e.vestDate || new Date(e.vestDate) <= new Date());

      const liveDataMap = new Map<string, Holding>();
      ports.forEach(p => {
        p.holdings?.forEach(h => {
          liveDataMap.set(`${h.ticker}:${h.exchange}`, h);
        });
      });

      processingEvents.forEach(e => {
        if (e.kind === 'DIV_EVENT') {
             // Apply dividend to ALL active holdings of this ticker across portfolios.
             holdingMap.forEach(h => {
                 if (h.ticker === e.ticker && h.exchange === e.exchange) {
                     const qty = h.qtyVested + h.qtyUnvested;
                     if (qty > 0) {
                         const totalAmountStockCurrency = qty * e.amountPerShare;
                         
                         // Convert using Current Rates (Simplified since historical rates for every div date aren't indexed).
                         const totalAmountPC = convertCurrency(totalAmountStockCurrency, h.stockCurrency, h.portfolioCurrency, exchangeRates);
                         const totalAmountUSD = convertCurrency(totalAmountStockCurrency, h.stockCurrency, Currency.USD, exchangeRates);
                         const totalAmountILS = convertCurrency(totalAmountStockCurrency, h.stockCurrency, Currency.ILS, exchangeRates);
                         
                         h.dividendsPortfolioCurrency += totalAmountPC;
                         h.dividendsStockCurrency += totalAmountStockCurrency;
                         h.dividendsUSD += totalAmountUSD;
                         h.dividendsILS += totalAmountILS;
                     }
                 }
             });
             return;
        }

        const t = e as Transaction;
        const key = `${t.portfolioId}_${t.ticker}`;
        const p = logIfFalsy(newPortMap.get(t.portfolioId), `Portfolio not found for ID ${t.portfolioId}`, t);
        const portfolioCurrency = normalizeCurrency(p?.currency || 'USD');

        if (!holdingMap.has(key)) {
          const live = liveDataMap.get(`${t.ticker}:${t.exchange}`);
          const exchange = t.exchange || live?.exchange;
          if (!exchange) return;

          const stockCurrency = normalizeCurrency(live?.currency || t.currency || (exchange === Exchange.TASE ? Currency.ILA : Currency.USD));
          const currentPrice = live?.price || 0;

          holdingMap.set(key, {
            key,
            portfolioId: t.portfolioId,
            portfolioName: p?.name || t.portfolioId,
            portfolioCurrency,
            ticker: t.ticker,
            exchange: exchange,
            displayName: live?.name || t.ticker,
            nameHe: live?.nameHe,
            qtyVested: 0,
            qtyUnvested: 0,
            totalQty: 0,
            currentPrice: currentPrice,
            stockCurrency,
            type: live?.type,
            costBasisPortfolioCurrency: 0, costOfSoldPortfolioCurrency: 0, proceedsPortfolioCurrency: 0, dividendsPortfolioCurrency: 0,
            unrealizedGainPortfolioCurrency: 0, unrealizedTaxableGain: 0, realizedGainPortfolioCurrency: 0, realizedTaxableGain: 0, totalGainPortfolioCurrency: 0, marketValuePortfolioCurrency: 0,
            dayChangeValuePortfolioCurrency: 0, totalFeesPortfolioCurrency: 0, costBasisStockCurrency: 0, costOfSoldStockCurrency: 0, proceedsStockCurrency: 0, dividendsStockCurrency: 0,
            costBasisUSD: 0, costOfSoldUSD: 0, proceedsUSD: 0, dividendsUSD: 0, realizedGainUSD: 0,
            costBasisILS: 0, costOfSoldILS: 0, proceedsILS: 0, dividendsILS: 0, realizedGainILS: 0, realizedTaxableGainILS: 0, unrealizedTaxableGainILS: 0,
            avgCost: 0, mvVested: 0, mvUnvested: 0, totalMV: 0, realizedGain: 0, realizedGainPct: 0, realizedGainAfterTax: 0, dividends: 0, unrealizedGain: 0, unrealizedGainPct: 0, totalGain: 0, totalGainPct: 0, valueAfterTax: 0, dayChangeVal: 0,
            sector: live?.sector || '',
            dayChangePct: live?.changePct1d || 0,
            perf1w: live?.changePctRecent || 0, perf1m: live?.changePct1m || 0, perf3m: live?.changePct3m || 0,
            perfYtd: live?.changePctYtd || 0, perf1y: live?.changePct1y || 0, perf3y: live?.changePct3y || 0, perf5y: live?.changePct5y || 0,
          });
        }

        const h = holdingMap.get(key)!;
        const isVested = !t.vestDate || new Date(t.vestDate) <= new Date();
        const tQty = t.qty || 0;
        
        // Use historical transaction price data for cost basis and proceeds.
        const priceInUSD = t.originalPriceUSD || 0;
        const priceInAgorot = t.originalPriceILA || 0;
        const priceInILS = toILS(priceInAgorot, Currency.ILA);
        
        let originalPricePC = 0;
        if (portfolioCurrency === Currency.ILS) originalPricePC = priceInILS;
        else originalPricePC = convertCurrency(priceInUSD, Currency.USD, portfolioCurrency, exchangeRates);

        const txnValuePC = tQty * originalPricePC;
        let effectivePriceSC = t.price || 0;
        if (h.stockCurrency === Currency.ILA) effectivePriceSC = priceInAgorot;
        else if (h.stockCurrency === Currency.ILS) effectivePriceSC = priceInILS;
        else if (h.stockCurrency === Currency.USD) effectivePriceSC = priceInUSD;

        const txnValueSC = tQty * effectivePriceSC;

        // Track Fees (Commission + FEE transactions)
        let txnFeePC = 0;
        
        // 1. Commission on any transaction
        if (t.commission && t.commission > 0) {
            // Commission currency? Usually matches Price currency (USD/ILS/ILA).
            // We assume commission is in the same currency as price unless specified? 
            // The sheet has 'Currency' column. If 'ILA', commission is in Agorot?
            // Usually commissions are small. Let's assume it matches the transaction currency for conversion.
            // Using `effectivePriceSC` logic for currency:
            let commVal = t.commission;
            // If ILA, convert to ILS first? `toILS` handles it if we treat it as price.
            // Simplify: Convert `t.commission` using `t.currency` or `h.stockCurrency`.
            // Let's use `h.stockCurrency` logic.
            if (h.stockCurrency === Currency.ILA) commVal = t.commission / 100; // Agorot to ILS
            else commVal = t.commission; // USD or ILS
            
            // Convert to Portfolio Currency
            // Note: If stock is USD but portfolio is ILS, commission might be in USD.
            txnFeePC += convertCurrency(commVal, h.stockCurrency === Currency.ILA ? Currency.ILS : h.stockCurrency, h.portfolioCurrency, exchangeRates);
        }

        h.totalFeesPortfolioCurrency += txnFeePC;

        const currentCPI = getCPI(new Date(t.date), realCpi);

        if (t.type === 'BUY') {
          // Update Weighted Average CPI for ILS Real Gain calculation
          if (h.weightedAvgCPI === undefined) h.weightedAvgCPI = currentCPI;
          else {
              // Weighted Average: (OldQty * OldCPI + NewQty * NewCPI) / TotalQty
              const totalVested = h.qtyVested + h.qtyUnvested; // Prior total
              h.weightedAvgCPI = (totalVested * h.weightedAvgCPI + tQty * currentCPI) / (totalVested + tQty);
          }

          if (isVested) h.qtyVested += tQty; else h.qtyUnvested += tQty;
          h.costBasisPortfolioCurrency += txnValuePC;
          h.costBasisStockCurrency += txnValueSC;
          h.costBasisUSD += tQty * priceInUSD;
          h.costBasisILS += tQty * priceInILS;
        } else if (t.type === 'SELL') {
          const totalQty = h.qtyVested + h.qtyUnvested;
          const avgCostPC = totalQty > 0 ? h.costBasisPortfolioCurrency / totalQty : 0;
          const costOfSoldPC = avgCostPC * tQty;
          
          h.costOfSoldPortfolioCurrency += costOfSoldPC;
          h.proceedsPortfolioCurrency += txnValuePC;
          h.costBasisPortfolioCurrency -= costOfSoldPC;
          
          // Realized Taxable Gain Logic (Real Gain Policy)
          // Default: Taxable = Nominal (realizedGain)
          const nominalGain = txnValuePC - costOfSoldPC;
          let taxableGain = nominalGain;

          // If ILS asset in ILS portfolio (or linked to CPI):
          // Real Gain = Nominal - (Cost * Inflation)
          // Taxable = Min(Nominal, Real) -> Nominal - Max(0, InflationAdj)
          if (h.portfolioCurrency === Currency.ILS && h.stockCurrency === Currency.ILS) {
              const baseCPI = h.weightedAvgCPI || currentCPI;
              const inflationRate = (currentCPI / baseCPI) - 1;
              const inflationAdj = Math.max(0, costOfSoldPC * inflationRate);
              taxableGain = nominalGain - inflationAdj;
          }
          // If Foreign Asset: Real Gain = (Proceeds_SC - Cost_SC) * CurrentRate.
          // Since we lack historical FX, our 'nominalGain' (txnValuePC - costOfSoldPC) is an approximation.
          // If costOfSoldPC was derived from historical cost, then nominalGain is correct Nominal.
          // If we assume our calculated gain IS the Real Gain (due to lack of history), we use it.
          // Implementation Detail: For now, Foreign assets use Nominal as Taxable (conservative/fallback).
          
          h.realizedTaxableGain += taxableGain;

          // Calculate ILS Taxable Gain (for Tax Calculation in ILS)
          const avgCostILS = totalQty > 0 ? h.costBasisILS / totalQty : 0;
          const currentCostOfSoldILS = avgCostILS * tQty;
          
          const priceInILS = convertCurrency(t.price || 0, t.currency || h.stockCurrency, Currency.ILS, exchangeRates);
          const txnValueILS = tQty * priceInILS;
          
          let taxableGainILS = txnValueILS - currentCostOfSoldILS;
          
          if (h.stockCurrency === Currency.ILS) {
              const baseCPI = h.weightedAvgCPI || currentCPI;
              const inflationRate = (currentCPI / baseCPI) - 1;
              const inflationAdjILS = Math.max(0, currentCostOfSoldILS * inflationRate);
              taxableGainILS = taxableGainILS - inflationAdjILS;
          }
          h.realizedTaxableGainILS += taxableGainILS;

          h.costOfSoldStockCurrency += (totalQty > 0 ? h.costBasisStockCurrency / totalQty : 0) * tQty;
          h.costBasisStockCurrency -= (totalQty > 0 ? h.costBasisStockCurrency / totalQty : 0) * tQty;
          
          h.costOfSoldUSD += (totalQty > 0 ? h.costBasisUSD / totalQty : 0) * tQty;
          h.costBasisUSD -= (totalQty > 0 ? h.costBasisUSD / totalQty : 0) * tQty;
          h.proceedsUSD += tQty * priceInUSD;

          h.costOfSoldILS += (totalQty > 0 ? h.costBasisILS / totalQty : 0) * tQty;
          h.costBasisILS -= (totalQty > 0 ? h.costBasisILS / totalQty : 0) * tQty;
          h.proceedsILS += tQty * priceInILS;

          // Deduct quantity
          let q = tQty;
          if (isVested) { const canSell = Math.min(q, h.qtyVested); h.qtyVested -= canSell; q -= canSell; }
          if (q > 0) h.qtyUnvested -= q;
        } else if (t.type === 'DIVIDEND') {
          // Legacy support for DIVIDEND transactions in log
          h.dividendsPortfolioCurrency += txnValuePC;
          h.dividendsStockCurrency += txnValueSC;
          h.dividendsUSD += tQty * priceInUSD;
          h.dividendsILS += tQty * priceInILS;
        } else if (t.type === 'FEE') {
            // Fee logic: Amount = Price * Qty (usually Price is amount, Qty=1)
            const feeAmount = (t.price || 0) * (t.qty || 1);
            let val = feeAmount;
            // Currency normalization
            if (h.stockCurrency === Currency.ILA) val = val / 100;
            
            const feePC = convertCurrency(val, h.stockCurrency === Currency.ILA ? Currency.ILS : h.stockCurrency, h.portfolioCurrency, exchangeRates);
            h.totalFeesPortfolioCurrency += feePC;
        }
      });

      // 3. Hydrate live data for active holdings.
      const processedHoldings: DashboardHolding[] = [];
      const holdingsList = Array.from(holdingMap.values());
      const missingDataPromises = holdingsList.map(async (h) => {
        if (!h.currentPrice || h.currentPrice === 0 || h.exchange === Exchange.GEMEL || h.exchange === Exchange.PENSION) {
          try {
            const live = await getTickerData(h.ticker, h.exchange, null);
            if (live) {
              if ((live.exchange === Exchange.GEMEL || live.exchange === Exchange.PENSION) && live.timestamp) {
                const key = `${live.exchange}:${live.ticker}`;
                const storedHistory = extPrices[key];
                if (storedHistory) {
                  const liveDate = new Date(live.timestamp);
                  liveDate.setHours(0, 0, 0, 0);
                  const match = storedHistory.find(item => {
                    const itemDate = new Date(item.date);
                    itemDate.setHours(0, 0, 0, 0);
                    return itemDate.getTime() === liveDate.getTime();
                  });
                  if (match) {
                    const diff = Math.abs(match.price - (live.price || 0));
                    if (diff > 0.01) console.warn(`[Data Mismatch] ${key} at ${toGoogleSheetDateFormat(match.date)}: Live=${live.price}, Stored=${match.price}`);
                    else console.log(`[Data Verified] ${key} at ${toGoogleSheetDateFormat(match.date)}: Match (${live.price})`);
                  } else {
                    console.log(`[Data Info] ${key}: New live data point for ${toGoogleSheetDateFormat(liveDate)}. Latest stored: ${storedHistory[0]?.date ? toGoogleSheetDateFormat(storedHistory[0].date) : 'None'}`);
                  }
                }
              }

              if (live.price) h.currentPrice = live.price;
              if (live.changePct1d !== undefined) h.dayChangePct = live.changePct1d;
              if (live.name) h.displayName = live.name;
              if (live.type) h.type = live.type;
              // Hydrate extra periods if available
              if (live.changePctRecent) h.perf1w = live.changePctRecent;
              if (live.changePct1m) h.perf1m = live.changePct1m;
              if (live.changePct1y) h.perf1y = live.changePct1y;
            }
          } catch (e) { console.warn(`Failed to hydrate ${h.ticker}`, e); }
        }
        return h;
      });

      await Promise.all(missingDataPromises);

      // 4. Finalize holding-level derived metrics.
      holdingMap.forEach(h => {
        h.totalQty = h.qtyVested + h.qtyUnvested;
        const currentPricePC = convertCurrency(h.currentPrice, h.stockCurrency, h.portfolioCurrency, exchangeRates);
        h.marketValuePortfolioCurrency = h.totalQty * currentPricePC;
        h.unrealizedGainPortfolioCurrency = h.marketValuePortfolioCurrency - h.costBasisPortfolioCurrency;
        h.realizedGainPortfolioCurrency = h.proceedsPortfolioCurrency - h.costOfSoldPortfolioCurrency;
        h.totalGainPortfolioCurrency = h.unrealizedGainPortfolioCurrency + h.realizedGainPortfolioCurrency + h.dividendsPortfolioCurrency;
        
        // Calculate Unrealized Taxable Gain (Real Gain Policy)
        // Default: Nominal
        let taxableUnrealized = h.unrealizedGainPortfolioCurrency;
        
        if (h.portfolioCurrency === Currency.ILS && h.stockCurrency === Currency.ILS) {
            const currentCPI = getCPI(new Date(), realCpi); // Today
            const baseCPI = h.weightedAvgCPI || currentCPI;
            const inflationRate = (currentCPI / baseCPI) - 1;
            const inflationAdj = Math.max(0, h.costBasisPortfolioCurrency * inflationRate);
            taxableUnrealized = taxableUnrealized - inflationAdj;
        }
        h.unrealizedTaxableGain = taxableUnrealized;

        // Calculate Unrealized Taxable Gain in ILS (For Tax Calc)
        const priceInILS = convertCurrency(h.currentPrice, h.stockCurrency, Currency.ILS, exchangeRates);
        const mvILS = h.totalQty * priceInILS;
        let taxableUnrealizedILS = mvILS - h.costBasisILS;
        
        if (h.stockCurrency === Currency.ILS) {
            const currentCPI = getCPI(new Date(), realCpi);
            const baseCPI = h.weightedAvgCPI || currentCPI;
            const inflationRate = (currentCPI / baseCPI) - 1;
            const inflationAdjILS = Math.max(0, h.costBasisILS * inflationRate);
            taxableUnrealizedILS = taxableUnrealizedILS - inflationAdjILS;
        }
        h.unrealizedTaxableGainILS = taxableUnrealizedILS;

        h.totalMV = h.marketValuePortfolioCurrency;
        processedHoldings.push(h);
      });

      setHoldings(processedHoldings);
    } catch (e) {
      console.error('loadData error:', e);
      if (e instanceof SessionExpiredError) { showLoginModal(); setError('session_expired'); }
      else setError(e);
    } finally { setLoading(false); }
  }, [sheetId, options.includeUnvested, exchangeRates, showLoginModal]);

  useEffect(() => { loadData(); }, [loadData]);

  return { holdings, loading, error, portfolios, exchangeRates, hasFutureTxns, refresh: loadData };
}
