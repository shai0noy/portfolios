export interface DashboardColumnConfig {
  key: string;
  labelEn: string;
  labelHe: string;
  defaultVisible: boolean;
  sortKey?: string; // If different from key, otherwise assumes key
  numeric?: boolean; // For alignment (right usually)
}

export const DASHBOARD_COLUMNS: DashboardColumnConfig[] = [
  { key: 'displayName', labelEn: 'Display Name', labelHe: 'שם תצוגה', defaultVisible: true, sortKey: 'ticker' }, // Sort by ticker default? Table uses ticker for display name sort
  { key: 'ticker', labelEn: 'Ticker', labelHe: 'סימול', defaultVisible: true },
  { key: 'type', labelEn: 'Type', labelHe: 'סוג', defaultVisible: true },
  { key: 'sector', labelEn: 'Sector', labelHe: 'סקטור', defaultVisible: true },
  { key: 'qty', labelEn: 'Quantity', labelHe: 'כמות', defaultVisible: true, numeric: true },
  { key: 'avgCost', labelEn: 'Avg Unit Cost', labelHe: 'עלות ממוצעת ליחידה', defaultVisible: true, numeric: true },
  { key: 'currentPrice', labelEn: 'Current Unit Price', labelHe: 'מחיר נוכחי ליחידה', defaultVisible: true, numeric: true },
  { key: 'costBasis', labelEn: 'Cost Basis', labelHe: 'עלות מקורית', defaultVisible: true, numeric: true },
  { key: 'weight', labelEn: 'Weight', labelHe: 'משקל', defaultVisible: true, numeric: true },
  { key: 'dayChangeVal', labelEn: 'Day Change $', labelHe: 'שינוי יומי', defaultVisible: true, numeric: true },
  { key: 'dayChangePct', labelEn: 'Day Change %', labelHe: '% שינוי יומי', defaultVisible: true, numeric: true },
  { key: 'perf1w', labelEn: '1W Return', labelHe: 'תשואה שבועית', defaultVisible: false, numeric: true },
  { key: 'perf1m', labelEn: '1M Return', labelHe: 'תשואה חודשית', defaultVisible: false, numeric: true },
  { key: 'perfYtd', labelEn: 'YTD Return', labelHe: 'תשואה מתחילת שנה', defaultVisible: false, numeric: true },
  { key: 'perf1y', labelEn: '1Y Return', labelHe: 'תשואה שנתית', defaultVisible: false, numeric: true },
  { key: 'mv', labelEn: 'Market Value', labelHe: 'שווי שוק', defaultVisible: true, sortKey: 'marketValue', numeric: true },
  { key: 'unvestedValue', labelEn: 'Unvested Value', labelHe: 'שווי לא מובשל', defaultVisible: false, sortKey: 'mvUnvested', numeric: true },
  { key: 'dividends', labelEn: 'Dividends', labelHe: 'דיבידנדים', defaultVisible: false, numeric: true },
  { key: 'unrealizedGain', labelEn: 'Unrealized Gain', labelHe: 'רווח לא ממומש', defaultVisible: true, numeric: true },
  { key: 'unrealizedGainPct', labelEn: 'Unrealized Gain %', labelHe: '% רווח לא ממומש', defaultVisible: true, numeric: true },
  { key: 'realizedGain', labelEn: 'Realized Gain', labelHe: 'רווח ממומש', defaultVisible: true, numeric: true },
  { key: 'realizedGainPct', labelEn: 'Realized Gain %', labelHe: '% רווח ממומש', defaultVisible: true, numeric: true },
  { key: 'realizedGainAfterTax', labelEn: 'Realized Gain After Tax', labelHe: 'רווח ממומש נטו', defaultVisible: true, numeric: true },
  { key: 'totalGain', labelEn: 'Total Gain', labelHe: 'רווח כולל', defaultVisible: true, numeric: true },
  { key: 'totalGainPct', labelEn: 'Total Gain %', labelHe: '% רווח כולל', defaultVisible: true, numeric: true },
  { key: 'valueAfterTax', labelEn: 'Value After Tax', labelHe: 'שווי אחרי מס', defaultVisible: true, numeric: true },
];

export function getDefaultColumnVisibility(): Record<string, boolean> {
  return getPresetVisibility('overview');
}

export function getColumnDisplayNames(t: (en: string, he: string) => string): Record<string, string> {
  return DASHBOARD_COLUMNS.reduce((acc, col) => {
    acc[col.key] = t(col.labelEn, col.labelHe);
    return acc;
  }, {} as Record<string, string>);
}

export type ColumnPresetType = 'custom' | 'overview' | 'gains' | 'analytics' | 'technical' | 'all';

export const PRESET_COLUMNS: Record<Exclude<ColumnPresetType, 'custom' | 'all'>, string[]> = {
  overview: ['displayName', 'ticker', 'type', 'qty', 'currentPrice', 'dayChangeVal', 'dayChangePct', 'mv', 'totalGainPct'],
  gains: ['displayName', 'ticker', 'avgCost', 'currentPrice', 'costBasis', 'mv', 'dividends', 'unrealizedGain', 'unrealizedGainPct', 'realizedGain', 'realizedGainPct', 'totalGain', 'totalGainPct'],
  analytics: ['displayName', 'ticker', 'type', 'sector', 'weight', 'avgCost', 'currentPrice', 'costBasis', 'mv', 'unvestedValue', 'realizedGainAfterTax', 'valueAfterTax'],
  technical: ['displayName', 'ticker', 'type', 'sector', 'weight', 'mv', 'perf1w', 'perf1m', 'perfYtd', 'perf1y']
};

export function getPresetVisibility(preset: Exclude<ColumnPresetType, 'custom'>): Record<string, boolean> {
  if (preset === 'all') {
    return DASHBOARD_COLUMNS.reduce((acc, col) => {
      acc[col.key] = true;
      return acc;
    }, {} as Record<string, boolean>);
  }
  const cols = PRESET_COLUMNS[preset] || [];
  return DASHBOARD_COLUMNS.reduce((acc, col) => {
    acc[col.key] = cols.includes(col.key);
    return acc;
  }, {} as Record<string, boolean>);
}
