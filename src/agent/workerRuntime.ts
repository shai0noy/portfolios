/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Currency,
  Exchange,
  EXCHANGE_SETTINGS,
  isBuy,
  isSell,
  parseExchange,
  toGoogleFinanceExchangeCode,
  toGoogleSheetsExchangeCode,
  type DashboardHolding,
  type ExchangeRates,
  type Portfolio,
  type Transaction,
  type TransactionType,
} from '../lib/types';
import { InstrumentClassification } from '../lib/types/instrument';
import { coerceDate, formatYYYYMMDD, toGoogleSheetDateFormat } from '../lib/date';
import { normalizeCurrency, formatPercent } from '../lib/currencyUtils';
import { evaluateAlert } from '../lib/alerts';
import { FinanceEngine } from '../lib/data/engine';
import type { DividendEvent } from '../lib/data/model';
import { calculateDashboardSummary } from '../lib/dashboard_calc';
import {
  CONFIG_RANGE,
  configHeaders,
  DIV_SHEET_NAME,
  dividendHeaders,
  DIVIDENDS_RANGE,
  EXTERNAL_DATASETS_RANGE,
  HOLDINGS_RANGE,
  HOLDINGS_SHEET,
  holdingMapping,
  holdingNumericKeys,
  holdingsHeaders,
  METADATA_RANGE,
  METADATA_SHEET,
  metadataHeaders,
  PORT_OPT_RANGE,
  portfolioHeaders,
  portfolioMapping,
  portfolioNumericKeys,
  TRACKING_LISTS_RANGE,
  TX_FETCH_RANGE,
  TX_SHEET_NAME,
  TXN_COLS,
  transactionHeaders,
  transactionMapping,
  transactionNumericKeys,
  type SheetHolding as MappedSheetHolding,
} from '../lib/sheets/config';
import { getHistoricalPriceFormula } from '../lib/sheets/formulas';
import type { TickerData, Dividend } from '../lib/fetching/types';
import type { TrackingListItem, TickerAlert } from '../lib/sheets/types';

export class AgentApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'AgentApiError';
    this.status = status;
  }
}

export type ProxyApiInvoker = (
  apiId: string,
  params: Record<string, string>
) => Promise<Response>;

// --- Pure Row Mappers (Browser-free equivalent of src/lib/sheets/utils.ts) ---

function createPureRowMapper<T extends readonly string[]>(headers: T) {
  const headerMap = new Map(headers.map((h, i) => [h, i]));
  return <U>(
    row: unknown[],
    mapping: Record<keyof U, T[number]>,
    numericKeys: (keyof U)[] = []
  ): U => {
    const obj: Partial<U> = {};
    for (const key in mapping) {
      const headerName = mapping[key];
      const index = headerMap.get(headerName);
      if (index !== undefined && row[index] !== undefined && row[index] !== null) {
        const value = row[index];
        if (numericKeys.includes(key as keyof U)) {
          if (String(value).trim() === '') {
            (obj as any)[key] = undefined;
          } else {
            const strVal = String(value).trim();
            const isPercentage = strVal.endsWith('%');
            const numVal = parseFloat(strVal.replace(/,/g, '').replace(/%/, ''));
            (obj as any)[key] = isNaN(numVal) ? undefined : isPercentage ? numVal / 100 : numVal;
          }
        } else {
          (obj as any)[key] = typeof value === 'number' ? String(value) : value;
        }
      }
    }
    return obj as U;
  };
}

const mapRowToPortfolio = createPureRowMapper(portfolioHeaders);
const mapRowToTransaction = createPureRowMapper(transactionHeaders);
const mapRowToHolding = createPureRowMapper(holdingsHeaders);

const escapeSheetString = (str: string | null | undefined): string =>
  str ? str.replace(/"/g, '""') : '';

const sortedTxnColDefs = Object.values(TXN_COLS).sort((a, b) => {
  const lenDiff = a.colId.length - b.colId.length;
  return lenDiff !== 0 ? lenDiff : a.colId.localeCompare(b.colId);
});

// --- Google Sheets REST v4 Client ---

export class SheetsRestClient {
  readonly spreadsheetId: string;
  private readonly accessToken: string;
  private sheetIdCache: Map<string, number> | null = null;

  constructor(spreadsheetId: string, accessToken: string) {
    this.spreadsheetId = spreadsheetId;
    this.accessToken = accessToken;
  }

  private async request<T = any>(path: string, init?: RequestInit): Promise<T> {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(this.spreadsheetId)}${path}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });

    if (!res.ok) {
      const errBody: any = await res.json().catch(() => ({}));
      const msg = errBody?.error?.message || `Google Sheets API error (${res.status})`;
      throw new AgentApiError(res.status === 401 || res.status === 403 ? res.status : 400, msg);
    }

    return res.json() as Promise<T>;
  }

  async verifyAccess(): Promise<{ spreadsheetId: string; title: string }> {
    const meta = await this.request<any>('?fields=spreadsheetId,properties.title,sheets.properties(sheetId,title)');
    this.sheetIdCache = new Map();
    for (const s of meta.sheets || []) {
      if (s.properties?.title !== undefined && s.properties?.sheetId !== undefined) {
        this.sheetIdCache.set(s.properties.title, s.properties.sheetId);
      }
    }
    return {
      spreadsheetId: meta.spreadsheetId,
      title: meta.properties?.title || '',
    };
  }

  async getSheetNumericId(sheetName: string, createIfMissing = false): Promise<number> {
    if (!this.sheetIdCache) {
      await this.verifyAccess();
    }
    const existing = this.sheetIdCache!.get(sheetName);
    if (existing !== undefined) return existing;

    if (!createIfMissing) {
      throw new AgentApiError(400, `Sheet '${sheetName}' not found in spreadsheet.`);
    }

    const batchRes = await this.batchUpdate([
      { addSheet: { properties: { title: sheetName } } },
    ]);
    const newId = batchRes.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;
    this.sheetIdCache!.set(sheetName, newId);
    return newId;
  }

  async getValues(range: string, valueRenderOption: 'UNFORMATTED_VALUE' | 'FORMATTED_VALUE' = 'UNFORMATTED_VALUE'): Promise<any[][]> {
    try {
      const data = await this.request<any>(
        `/values/${encodeURIComponent(range)}?valueRenderOption=${valueRenderOption}`
      );
      return data.values || [];
    } catch (e: any) {
      // Optional tabs (like External_Datasets, Tracking_Lists, Dividends) may not exist in older sheets
      if (e instanceof AgentApiError && e.status === 400 && e.message.includes('Unable to parse range')) {
        return [];
      }
      throw e;
    }
  }

  async batchGetValues(ranges: string[], valueRenderOption: 'UNFORMATTED_VALUE' | 'FORMATTED_VALUE' = 'UNFORMATTED_VALUE'): Promise<Record<string, any[][]>> {
    const params = new URLSearchParams({ valueRenderOption });
    for (const r of ranges) {
      params.append('ranges', r);
    }
    const data = await this.request<any>(`/values:batchGet?${params.toString()}`);
    const out: Record<string, any[][]> = {};
    const valueRanges = data.valueRanges || [];
    ranges.forEach((r, idx) => {
      out[r] = valueRanges[idx]?.values || [];
    });
    return out;
  }

  async updateValues(range: string, values: any[][], valueInputOption: 'USER_ENTERED' | 'RAW' = 'USER_ENTERED'): Promise<any> {
    return this.request<any>(
      `/values/${encodeURIComponent(range)}?valueInputOption=${valueInputOption}`,
      {
        method: 'PUT',
        body: JSON.stringify({ values }),
      }
    );
  }

  async appendValues(
    range: string,
    values: any[][],
    valueInputOption: 'USER_ENTERED' | 'RAW' = 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS' | 'OVERWRITE' = 'INSERT_ROWS'
  ): Promise<any> {
    return this.request<any>(
      `/values/${encodeURIComponent(range)}:append?valueInputOption=${valueInputOption}&insertDataOption=${insertDataOption}`,
      {
        method: 'POST',
        body: JSON.stringify({ values }),
      }
    );
  }

  async clearValues(range: string): Promise<any> {
    return this.request<any>(`/values/${encodeURIComponent(range)}:clear`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  async batchUpdate(requests: any[]): Promise<any> {
    return this.request<any>(':batchUpdate', {
      method: 'POST',
      body: JSON.stringify({ requests }),
    });
  }

  async getMetadataMap(): Promise<Record<string, string>> {
    const rows = await this.getValues(METADATA_RANGE, 'FORMATTED_VALUE');
    const keyIdx = metadataHeaders.indexOf('Key');
    const valIdx = metadataHeaders.indexOf('Value');
    const map: Record<string, string> = {};
    for (const r of rows) {
      if (r[keyIdx]) {
        map[String(r[keyIdx])] = r[valIdx] !== undefined && r[valIdx] !== null ? String(r[valIdx]) : '';
      }
    }
    return map;
  }

  async setMetadataValue(key: string, value: string): Promise<void> {
    await this.getSheetNumericId(METADATA_SHEET, true);
    const rows = await this.getValues(METADATA_RANGE, 'FORMATTED_VALUE');
    const keyIdx = metadataHeaders.indexOf('Key');
    const existingIdx = rows.findIndex(r => String(r[keyIdx]) === key);
    if (existingIdx > -1) {
      const rowNum = existingIdx + 1;
      await this.updateValues(`${METADATA_SHEET}!B${rowNum}`, [[value]], 'RAW');
    } else {
      await this.appendValues(`${METADATA_SHEET}!A:B`, [[key, value]], 'RAW', 'INSERT_ROWS');
    }
  }
}

export async function verifySheetAgentKey(sheets: SheetsRestClient, expectedKeyHash: string): Promise<Record<string, string>> {
  const meta = await sheets.getMetadataMap();
  const activeHash = (meta['agent_api_key_hash'] || '').trim();
  if (!activeHash || activeHash !== expectedKeyHash) {
    throw new AgentApiError(401, 'Agent private key is invalid, revoked, or rotated for this spreadsheet.');
  }
  return meta;
}

// --- Lightweight Worker Market Data Service (Yahoo + Globes + CBS + BOI) ---

function extractXmlTag(xml: string, tag: string): string {
  const regex = new RegExp(`<(?:[a-zA-Z0-9_]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_]+:)?${tag}>`, 'i');
  const match = xml.match(regex);
  if (!match) return '';
  return match[1]
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function extractXmlNumber(xml: string, tag: string): number | undefined {
  const nilRegex = new RegExp(`<(?:[a-zA-Z0-9_]+:)?${tag}[^>]*xsi:nil="true"[^>]*\\/?>`, 'i');
  if (nilRegex.test(xml)) return undefined;
  const val = extractXmlTag(xml, tag);
  if (!val || val.toLowerCase() === 'null') return undefined;
  const n = parseFloat(val);
  return isNaN(n) ? undefined : n;
}

function toYahooSymbol(ticker: string, exchange: Exchange): string | null {
  const clean = ticker.trim().toUpperCase();
  if (exchange === Exchange.CBS || exchange === Exchange.BOI || exchange === Exchange.GEMEL || exchange === Exchange.PENSION || exchange === Exchange.CASH) {
    return null;
  }
  if (clean.startsWith('^')) return clean;
  if (exchange === Exchange.TASE) {
    if (clean === '137') return '^TA125.TA';
    if (clean === '142') return '^TA35.TA';
    if (/^\d+$/.test(clean) || clean.includes('-')) return null; // Numeric TASE fund IDs or TASE bonds use Globes
    return `${clean.replace(/\./g, '-')}.TA`;
  }
  if (exchange === Exchange.FOREX) {
    return clean.endsWith('=X') ? clean : `${clean.replace('/', '')}=X`;
  }
  const suffixMap: Partial<Record<Exchange, string>> = {
    [Exchange.LSE]: '.L',
    [Exchange.FWB]: '.DE',
    [Exchange.SWX]: '.SW',
    [Exchange.JPX]: '.T',
    [Exchange.HKEX]: '.HK',
    [Exchange.TSX]: '.TO',
    [Exchange.ASX]: '.AX',
    [Exchange.KSE]: '.KS',
  };
  const suffix = suffixMap[exchange] || '';
  return `${clean.replace(/\./g, '-')}${suffix}`;
}

function computePeriodChangesFromHistory(
  price: number,
  historical: { date: Date; price: number }[],
  prevClose?: number
): Partial<TickerData> {
  const out: Partial<TickerData> = {};
  if (prevClose && prevClose > 0) {
    out.changePct1d = (price - prevClose) / prevClose;
  } else if (historical.length >= 2) {
    const prev = historical[historical.length - 2].price;
    if (prev > 0) out.changePct1d = (price - prev) / prev;
  }

  const findPriceOnOrBefore = (targetDate: Date): number | undefined => {
    const targetMs = targetDate.getTime();
    for (let i = historical.length - 1; i >= 0; i--) {
      if (historical[i].date.getTime() <= targetMs && historical[i].price > 0) {
        return historical[i].price;
      }
    }
    return undefined;
  };

  const now = new Date();
  const d1w = new Date(now); d1w.setDate(now.getDate() - 7);
  const d1m = new Date(now); d1m.setMonth(now.getMonth() - 1);
  const d3m = new Date(now); d3m.setMonth(now.getMonth() - 3);
  const dYtd = new Date(Date.UTC(now.getUTCFullYear() - 1, 11, 31, 23, 59, 59));
  const d1y = new Date(now); d1y.setFullYear(now.getFullYear() - 1);
  const d3y = new Date(now); d3y.setFullYear(now.getFullYear() - 3);
  const d5y = new Date(now); d5y.setFullYear(now.getFullYear() - 5);

  const calc = (ref?: number) => (ref && ref > 0 ? (price - ref) / ref : undefined);
  out.changePctRecent = calc(findPriceOnOrBefore(d1w));
  out.changePct1m = calc(findPriceOnOrBefore(d1m));
  out.changePct3m = calc(findPriceOnOrBefore(d3m));
  out.changePctYtd = calc(findPriceOnOrBefore(dYtd));
  out.changePct1y = calc(findPriceOnOrBefore(d1y));
  out.changePct3y = calc(findPriceOnOrBefore(d3y));
  out.changePct5y = calc(findPriceOnOrBefore(d5y));
  return out;
}

export class WorkerMarketService {
  private readonly invokeProxy: ProxyApiInvoker;

  constructor(invokeProxy: ProxyApiInvoker) {
    this.invokeProxy = invokeProxy;
  }

  async fetchYahooData(ticker: string, exchange: Exchange, includeQuoteSummary = false): Promise<(TickerData & { fundamentals?: any }) | null> {
    const yahooSym = toYahooSymbol(ticker, exchange);
    if (!yahooSym) return null;

    try {
      const histRes = await this.invokeProxy('yahoo_hist', { ticker: yahooSym, range: '5y' });
      if (!histRes.ok) return null;
      const histJson: any = await histRes.json().catch(() => null);
      const result = histJson?.chart?.result?.[0];
      if (!result?.meta) return null;

      const meta = result.meta;
      let currency: Currency = Currency.USD;
      try {
        currency = meta.currency === 'ILA' ? Currency.ILA : normalizeCurrency(meta.currency || 'USD');
      } catch {
        currency = exchange === Exchange.TASE ? Currency.ILA : Currency.USD;
      }

      const timestamps: number[] = result.timestamp || [];
      const closes: (number | null)[] = result.indicators?.quote?.[0]?.close || [];
      const historical: { date: Date; price: number }[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        const c = closes[i];
        if (c !== null && c !== undefined && !isNaN(c) && c > 0) {
          historical.push({ date: new Date(timestamps[i] * 1000), price: c });
        }
      }

      const price = Number(meta.regularMarketPrice) || (historical.length > 0 ? historical[historical.length - 1].price : 0);
      if (!price) return null;

      const dividends: Dividend[] = [];
      const rawDivs = result.events?.dividends;
      if (rawDivs && typeof rawDivs === 'object') {
        for (const key of Object.keys(rawDivs)) {
          const d = rawDivs[key];
          if (d?.date && d?.amount) {
            dividends.push({
              date: new Date(d.date * 1000),
              amount: Number(d.amount),
              currency: currency === Currency.ILA ? Currency.ILS : currency,
            });
          }
        }
        dividends.sort((a, b) => a.date.getTime() - b.date.getTime());
      }

      const changes = computePeriodChangesFromHistory(price, historical, meta.chartPreviousClose || meta.previousClose);

      const out: TickerData & { fundamentals?: any } = {
        ticker: ticker.toUpperCase(),
        exchange,
        numericId: null,
        price,
        openPrice: meta.regularMarketOpen ? Number(meta.regularMarketOpen) : undefined,
        currency,
        name: meta.longName || meta.shortName || ticker.toUpperCase(),
        historical,
        dividends,
        source: 'Yahoo',
        timestamp: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000) : new Date(),
        ...changes,
      };

      if (includeQuoteSummary) {
        try {
          const qsRes = await this.invokeProxy('yahoo_quote_summary', {
            ticker: yahooSym,
            modules: 'calendarEvents,defaultKeyStatistics,financialData,recommendationTrend,price,summaryDetail,assetProfile',
          });
          if (qsRes.ok) {
            const qsJson: any = await qsRes.json().catch(() => null);
            const qs = qsJson?.quoteSummary?.result?.[0];
            if (qs) {
              out.sector = qs.assetProfile?.sector || undefined;
              const earningsArr = qs.calendarEvents?.earnings?.earningsDate;
              const earningsDate = Array.isArray(earningsArr) && earningsArr[0]?.raw ? new Date(earningsArr[0].raw * 1000) : undefined;
              const exDividendDate = qs.calendarEvents?.exDividendDate?.raw ? new Date(qs.calendarEvents.exDividendDate.raw * 1000) : undefined;
              const dividendDate = qs.calendarEvents?.dividendDate?.raw ? new Date(qs.calendarEvents.dividendDate.raw * 1000) : undefined;
              if (earningsDate || exDividendDate || dividendDate) {
                out.calendarEvents = {
                  earningsDate,
                  exDividendDate,
                  dividendDate,
                  dividendCurrency: currency === Currency.ILA ? Currency.ILS : currency,
                };
              }
              out.fundamentals = {
                sector: qs.assetProfile?.sector,
                industry: qs.assetProfile?.industry,
                marketCap: qs.price?.marketCap?.raw ?? qs.summaryDetail?.marketCap?.raw,
                trailingPE: qs.summaryDetail?.trailingPE?.raw,
                forwardPE: qs.summaryDetail?.forwardPE?.raw ?? qs.defaultKeyStatistics?.forwardPE?.raw,
                epsTrailingTwelveMonths: qs.defaultKeyStatistics?.trailingEps?.raw,
                dividendYield: qs.summaryDetail?.dividendYield?.raw,
                dividendRate: qs.summaryDetail?.dividendRate?.raw,
                fiftyTwoWeekHigh: qs.summaryDetail?.fiftyTwoWeekHigh?.raw,
                fiftyTwoWeekLow: qs.summaryDetail?.fiftyTwoWeekLow?.raw,
                beta: qs.summaryDetail?.beta?.raw ?? qs.defaultKeyStatistics?.beta?.raw,
                targetMeanPrice: qs.financialData?.targetMeanPrice?.raw,
                recommendationKey: qs.financialData?.recommendationKey,
              };
            }
          }
        } catch {
          // Optional fundamentals failure is non-fatal
        }
      }

      return out;
    } catch {
      return null;
    }
  }

  async fetchGlobesData(ticker: string, exchange: Exchange, numericId?: number | null): Promise<TickerData | null> {
    const globesEx = EXCHANGE_SETTINGS[exchange]?.globesCode;
    if (!globesEx) return null;
    const identifier = exchange === Exchange.TASE && numericId ? String(numericId) : ticker.toUpperCase().replace(/^\^/, '');
    if (exchange === Exchange.TASE && !numericId && !/^\d+$/.test(identifier)) {
      return null;
    }

    try {
      const res = await this.invokeProxy('globes_data', { exchange: globesEx, ticker: identifier });
      if (!res.ok) return null;
      const xml = await res.text();
      if (!xml || !xml.includes('Instrument')) return null;

      const last = extractXmlNumber(xml, 'last');
      if (last === undefined) return null;

      const currencyRate = extractXmlNumber(xml, 'CurrencyRate') ?? 1;
      const rawCurrency = extractXmlTag(xml, 'currency') || 'ILS';
      let currency = Currency.ILA;
      try {
        const base = normalizeCurrency(rawCurrency);
        currency = currencyRate === 0.01 && base === Currency.ILS ? Currency.ILA : base;
      } catch {
        currency = Currency.ILA;
      }

      let pct1d = extractXmlNumber(xml, 'percentageChange');
      if ((pct1d === undefined || pct1d === 0) && last !== 0) {
        const chg = extractXmlNumber(xml, 'change') || 0;
        const prev = last - chg;
        if (chg !== 0 && prev !== 0) pct1d = (chg / prev) * 100;
      }

      const calcRel = (prev?: number) => (prev && prev > 0 && prev !== last ? (last - prev) / prev : undefined);
      const ytdRaw = extractXmlNumber(xml, 'ChangeFromLastYear');
      const koteretAlName = extractXmlTag(xml, 'KoteretAlName');

      return {
        ticker: ticker.toUpperCase(),
        exchange,
        price: last,
        openPrice: extractXmlNumber(xml, 'openPrice'),
        currency,
        name: extractXmlTag(xml, 'name_en') || extractXmlTag(xml, 'nameEn') || undefined,
        nameHe: extractXmlTag(xml, 'name_he') || undefined,
        changePct1d: pct1d !== undefined ? pct1d / 100 : undefined,
        changePctRecent: calcRel(extractXmlNumber(xml, 'LastWeekClosePrice')),
        changePct1m: calcRel(extractXmlNumber(xml, 'LastMonthClosePrice')),
        changePct3m: calcRel(extractXmlNumber(xml, 'Last3MonthsAgoClosePrice')),
        changePctYtd: ytdRaw !== undefined ? ytdRaw / 100 : undefined,
        changePct3y: calcRel(extractXmlNumber(xml, 'Last3YearsAgoClosePrice')),
        numericId: numericId || (/^\d+$/.test(identifier) ? Number(identifier) : null),
        isFeeExempt: koteretAlName === 'קרן כספית',
        source: 'Globes',
      };
    } catch {
      return null;
    }
  }

  async fetchBoiRate(series = 'MNT_RIB_BOI_D.D.RIB_BOI'): Promise<TickerData | null> {
    try {
      const res = await this.invokeProxy('boi_statistics', { series });
      if (!res.ok) return null;
      const csv = await res.text();
      const lines = csv.split('\n').filter(l => l.trim().length > 0);
      if (lines.length < 2) return null;
      const headers = lines[0].split(',');
      const tIdx = headers.indexOf('TIME_PERIOD');
      const vIdx = headers.indexOf('OBS_VALUE');
      if (tIdx === -1 || vIdx === -1) return null;
      const historical: { date: Date; price: number }[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        const d = new Date(cols[tIdx]);
        const v = parseFloat(cols[vIdx]);
        if (!isNaN(d.getTime()) && !isNaN(v)) {
          historical.push({ date: d, price: v });
        }
      }
      historical.sort((a, b) => a.date.getTime() - b.date.getTime());
      if (!historical.length) return null;
      const latest = historical[historical.length - 1].price;
      return {
        ticker: series,
        exchange: Exchange.BOI,
        numericId: null,
        price: latest,
        currency: Currency.ILS,
        name: 'Bank of Israel Interest Rate',
        historical,
        ...computePeriodChangesFromHistory(latest, historical),
      };
    } catch {
      return null;
    }
  }

  async fetchCbsIndex(id = '120010'): Promise<TickerData | null> {
    try {
      const res = await this.invokeProxy('cbs_price_index', { id, page: '1' });
      if (!res.ok) return null;
      const json: any = await res.json().catch(() => null);
      const pts: { year: number; month: number; val: number }[] = [];
      for (const m of json?.month || []) {
        for (const d of m?.date || []) {
          if (d?.year && d?.month && d?.currBase?.value !== undefined) {
            pts.push({ year: Number(d.year), month: Number(d.month), val: Number(d.currBase.value) });
          }
        }
      }
      if (!pts.length) return null;
      pts.sort((a, b) => a.year - b.year || a.month - b.month);
      const historical = pts.map(p => ({
        date: new Date(Date.UTC(p.year, p.month - 1, 15)),
        price: p.val,
      }));
      const latest = historical[historical.length - 1].price;
      return {
        ticker: id,
        exchange: Exchange.CBS,
        numericId: Number(id) || null,
        price: latest,
        currency: Currency.ILS,
        name: 'Israel Consumer Price Index',
        historical,
        ...computePeriodChangesFromHistory(latest, historical),
      };
    } catch {
      return null;
    }
  }

  async fetchTickerData(
    ticker: string,
    exchange: Exchange,
    numericId?: number | null,
    includeFundamentals = false
  ): Promise<(TickerData & { fundamentals?: any }) | null> {
    if (exchange === Exchange.BOI) return this.fetchBoiRate(ticker);
    if (exchange === Exchange.CBS) return this.fetchCbsIndex(ticker);

    const yahoo = await this.fetchYahooData(ticker, exchange, includeFundamentals);
    if (yahoo) {
      if (exchange === Exchange.TASE && numericId) {
        const globes = await this.fetchGlobesData(ticker, exchange, numericId);
        if (globes?.nameHe) yahoo.nameHe = globes.nameHe;
      }
      return yahoo;
    }

    if (exchange === Exchange.TASE || exchange === Exchange.FOREX) {
      return this.fetchGlobesData(ticker, exchange, numericId);
    }
    return null;
  }
}

// --- Sheet Data Parsers ---

function parsePortfoliosFromRows(rows: any[][]): Portfolio[] {
  return rows
    .map(row => {
      const p = mapRowToPortfolio<Omit<Portfolio, 'holdings'>>(row, portfolioMapping, portfolioNumericKeys);
      if (!p || !p.id) return null;
      if (typeof (p as any).taxHistory === 'string') {
        try {
          p.taxHistory = JSON.parse((p as any).taxHistory);
        } catch {
          p.taxHistory = [];
        }
      }
      if (typeof (p as any).feeHistory === 'string') {
        try {
          p.feeHistory = JSON.parse((p as any).feeHistory);
        } catch {
          p.feeHistory = [];
        }
      }
      return { ...p, holdings: [] } as Portfolio;
    })
    .filter((p): p is Portfolio => p !== null);
}

function parseTransactionsFromRows(rows: any[][]): Transaction[] {
  const cleanNumber = (val: unknown, fallback: unknown) => {
    const parse = (v: unknown) => {
      if (typeof v === 'number') return v;
      if (!v && v !== 0) return NaN;
      return parseFloat(String(v).replace(/[^0-9.-]+/g, ''));
    };
    const c1 = parse(val);
    if (!isNaN(c1)) return c1;
    const c2 = parse(fallback);
    return isNaN(c2) ? 0 : c2;
  };

  return rows
    .map((row, index) => {
      const raw = mapRowToTransaction<Transaction>(row, transactionMapping, transactionNumericKeys) as any;
      raw.rowIndex = index + 2;
      if (raw.exchange) {
        try {
          raw.exchange = parseExchange(String(raw.exchange));
        } catch {
          raw.exchange = undefined;
        }
      } else {
        raw.exchange = undefined;
      }
      if (raw.type) {
        raw.type = String(raw.type).trim().toUpperCase() as TransactionType;
      }
      const normalizedDate = coerceDate(raw.date);
      const normalizedVestDate = raw.vestDate ? coerceDate(raw.vestDate) : null;
      const normalizedCreationDate = raw.creationDate ? coerceDate(raw.creationDate) : null;
      return {
        ...raw,
        date: normalizedDate ? formatYYYYMMDD(normalizedDate) : raw.date,
        vestDate: normalizedVestDate ? formatYYYYMMDD(normalizedVestDate) : raw.vestDate,
        creationDate: normalizedCreationDate ? formatYYYYMMDD(normalizedCreationDate) : raw.creationDate,
        qty: cleanNumber(raw.splitAdjustedQty, raw.originalQty),
        price: cleanNumber(raw.splitAdjustedPrice, raw.originalPrice),
      } as Transaction;
    })
    .filter(t => t.date && t.portfolioId && t.ticker);
}

function parseHoldingsSheetPriceMap(rows: any[][]): Map<string, TickerData> {
  const map = new Map<string, TickerData>();
  for (const row of rows) {
    const item = mapRowToHolding<Omit<MappedSheetHolding, 'qty'>>(row, holdingMapping, holdingNumericKeys as any) as any;
    if (!item?.ticker) continue;
    let ex: Exchange;
    try {
      ex = item.exchange ? parseExchange(String(item.exchange)) : Exchange.NASDAQ;
    } catch {
      continue;
    }
    let currency: Currency = ex === Exchange.TASE ? Currency.ILA : Currency.USD;
    const rawCurr = item.currency ? String(item.currency).trim() : '';
    if (rawCurr && !rawCurr.startsWith('=') && !rawCurr.startsWith('#') && rawCurr !== 'Loading...') {
      try {
        currency = rawCurr === 'ILA' ? Currency.ILA : normalizeCurrency(rawCurr);
      } catch {
        // keep default
      }
    }
    const price = Number(item.price) || 0;
    if (price > 0) {
      map.set(`${ex}:${String(item.ticker).toUpperCase()}`, {
        ticker: String(item.ticker).toUpperCase(),
        exchange: ex,
        price,
        currency,
        name: item.name && item.name !== 'Loading...' ? String(item.name).trim() : undefined,
        nameHe: item.nameHe ? String(item.nameHe) : undefined,
        sector: item.sector ? String(item.sector) : undefined,
        type: item.type ? new InstrumentClassification(String(item.type)) : undefined,
        changePct1d: item.changePct1d,
        changePctRecent: item.changePctRecent,
        changePct1m: item.changePct1m,
        changePct3m: item.changePct3m,
        changePctYtd: item.changePctYtd,
        changePct1y: item.changePct1y,
        changePct3y: item.changePct3y,
        changePct5y: item.changePct5y,
        changePct10y: item.changePct10y,
        numericId: item.numericId ?? null,
        source: 'GoogleSheets',
      });
    }
  }
  return map;
}

function parseDividendsFromRows(rows: any[][]) {
  return rows
    .map((row, index) => {
      let date: Date;
      const rawDate = row[2];
      if (typeof rawDate === 'number') {
        date = new Date((rawDate - 25569) * 86400 * 1000);
      } else {
        date = coerceDate(rawDate) || new Date(NaN);
      }
      let exchange: Exchange | undefined;
      try {
        exchange = parseExchange(String(row[0]));
      } catch {
        exchange = undefined;
      }
      return {
        rowIndex: index + 2,
        exchange: exchange as Exchange,
        ticker: String(row[1] || '').toUpperCase(),
        date,
        dateStr: !isNaN(date.getTime()) ? formatYYYYMMDD(date) : '',
        amount: Number(row[3]),
        source: String(row[4] || ''),
        assetPriceAtTime:
          row[5] !== undefined && row[5] !== null && String(row[5]).trim() !== '' && !isNaN(Number(row[5]))
            ? Number(row[5])
            : undefined,
        currency: row[7] ? String(row[7]) : undefined,
      };
    })
    .filter(d => d.exchange && d.ticker && !isNaN(d.date.getTime()) && !isNaN(d.amount));
}

function parseExchangeRatesFromRows(rows: any[][]): ExchangeRates {
  const keyIndex = configHeaders.indexOf('Key');
  const periodIndices: Record<string, number> = {
    current: configHeaders.indexOf('Value'),
    ago1d: configHeaders.indexOf('1D Ago'),
    ago1w: configHeaders.indexOf('1W Ago'),
    ago1m: configHeaders.indexOf('1M Ago'),
    ago3m: configHeaders.indexOf('3M Ago'),
    ytd: configHeaders.indexOf('YTD'),
    ago1y: configHeaders.indexOf('1Y Ago'),
    ago3y: configHeaders.indexOf('3Y Ago'),
    ago5y: configHeaders.indexOf('5Y Ago'),
  };

  const allRates: Record<string, Record<string, number>> = {};
  const rawPairs: Record<string, Record<string, number>> = {};
  for (const period in periodIndices) {
    allRates[period] = { USD: 1 };
    rawPairs[period] = {};
  }

  for (const row of rows) {
    const pair = typeof row[keyIndex] === 'string' ? row[keyIndex].trim().toUpperCase() : '';
    if (pair.length !== 6) continue;
    for (const period in periodIndices) {
      const val = Number(row[periodIndices[period]]);
      if (!isNaN(val) && val > 0) {
        rawPairs[period][pair] = val;
      }
    }
  }

  const sortedPeriods = ['ago1d', 'current', ...Object.keys(periodIndices).filter(p => p !== 'current' && p !== 'ago1d')];
  for (const period of sortedPeriods) {
    const periodRaw = rawPairs[period];
    const rates = allRates[period];
    const graph: Record<string, Record<string, number>> = {};
    const nodes = new Set<string>(['USD']);
    const addEdge = (from: string, to: string, rate: number) => {
      if (!graph[from]) graph[from] = {};
      graph[from][to] = rate;
    };

    for (const pair of Object.keys(periodRaw)) {
      const val = periodRaw[pair];
      if (val > 0) {
        const from = pair.slice(0, 3);
        const to = pair.slice(3, 6);
        addEdge(from, to, val);
        addEdge(to, from, 1 / val);
        nodes.add(from);
        nodes.add(to);
      }
    }

    nodes.forEach(target => {
      if (target === 'USD') return;
      if (graph['USD']?.[target]) {
        rates[target] = graph['USD'][target];
        return;
      }
      if (graph['USD']) {
        for (const inter of Object.keys(graph['USD'])) {
          if (graph[inter]?.[target]) {
            rates[target] = graph['USD'][inter] * graph[inter][target];
            return;
          }
        }
      }
    });

    if (period === 'current') {
      for (const curr of Object.keys(allRates['ago1d'])) {
        if (curr !== 'USD' && (!rates[curr] || rates[curr] === 0) && allRates['ago1d'][curr] > 0) {
          rates[curr] = allRates['ago1d'][curr];
        }
      }
    }
  }

  if (!allRates.current.ILS || allRates.current.ILS <= 0) allRates.current.ILS = 3.7;
  if (!allRates.current.EUR || allRates.current.EUR <= 0) allRates.current.EUR = 0.92;
  if (!allRates.current.GBP || allRates.current.GBP <= 0) allRates.current.GBP = 0.78;

  return allRates as unknown as ExchangeRates;
}

function parseTrackingListsFromRows(rows: any[][]): TrackingListItem[] {
  const out: TrackingListItem[] = [];
  rows.forEach((row, idx) => {
    if (!row[0] || !row[1] || !row[2]) return;
    let exchange: Exchange;
    try {
      exchange = parseExchange(String(row[2]));
    } catch {
      return;
    }
    let dateAdded: Date;
    if (typeof row[3] === 'number') {
      dateAdded = new Date((row[3] - 25569) * 86400 * 1000);
    } else {
      dateAdded = coerceDate(row[3]) || new Date();
    }
    let alerts: TickerAlert[] = [];
    if (row[4]) {
      try {
        alerts = JSON.parse(String(row[4]));
      } catch {
        alerts = [];
      }
    }
    out.push({
      listName: String(row[0]),
      ticker: String(row[1]).toUpperCase(),
      exchange,
      dateAdded,
      rowIndex: idx + 2,
      alerts,
    });
  });
  return out;
}

function parseExternalPricesFromRows(rows: any[][]): Map<string, TickerData> {
  const byKey = new Map<string, { date: Date; price: number; currency: Currency; ticker: string; exchange: Exchange }[]>();
  for (const row of rows) {
    if (!row[0] || !row[1] || !row[3]) continue;
    let exchange: Exchange;
    try {
      exchange = parseExchange(String(row[1]));
    } catch {
      continue;
    }
    let dateVal: Date;
    if (typeof row[2] === 'number') {
      dateVal = new Date((row[2] - 25569) * 86400 * 1000);
    } else {
      dateVal = coerceDate(row[2]) || new Date(NaN);
    }
    if (isNaN(dateVal.getTime())) continue;
    const ticker = String(row[0]).toUpperCase();
    const key = `${exchange}:${ticker}`;
    let curr = Currency.ILS;
    try {
      curr = normalizeCurrency(String(row[4] || 'ILS'));
    } catch {
      curr = Currency.ILS;
    }
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push({ date: dateVal, price: Number(row[3]), currency: curr, ticker, exchange });
  }

  const out = new Map<string, TickerData>();
  for (const [key, list] of byKey.entries()) {
    list.sort((a, b) => a.date.getTime() - b.date.getTime());
    const latest = list[list.length - 1];
    const historical = list.map(i => ({ date: i.date, price: i.price }));
    out.set(key, {
      ticker: latest.ticker,
      exchange: latest.exchange,
      numericId: null,
      price: latest.price,
      currency: latest.currency,
      historical,
      source: 'ExternalDataset',
      ...computePeriodChangesFromHistory(latest.price, historical),
    });
  }
  return out;
}

// --- Holdings Rebuild Helper (Keeps Sheet Holdings Tab 100% Synced After Writes) ---

function createHoldingSheetRow(
  h: { ticker: string; exchange: Exchange; qty: number; numericId: number | null },
  meta: Partial<TickerData> | null,
  rowNum: number
): any[] {
  const tickerCell = `A${rowNum}`;
  const priceCell = `C${rowNum}`;
  const gfExchangeCell = `T${rowNum}`;
  const tickerAndExchange = `IF(${gfExchangeCell}="", ${tickerCell}, ${gfExchangeCell}&":"&${tickerCell})`;
  const row = new Array(holdingsHeaders.length).fill('');
  const isTASE = h.exchange === Exchange.TASE;
  const defaultCurrency = meta?.currency || (isTASE ? 'ILA' : '');

  row[0] = String(h.ticker).toUpperCase();
  row[1] = toGoogleSheetsExchangeCode(h.exchange);
  row[2] = `=IFERROR(GOOGLEFINANCE(${tickerAndExchange}))`;
  row[3] = `=IFERROR(GOOGLEFINANCE(${tickerAndExchange}, "currency"), "${escapeSheetString(defaultCurrency)}")`;
  row[4] = `=${h.qty}*${priceCell}`;
  row[5] = `=IFERROR(GOOGLEFINANCE(${tickerAndExchange}, "name"), " ${escapeSheetString(meta?.name)}")`;
  row[6] = meta?.nameHe || '';
  row[7] = meta?.sector || '';
  row[8] = meta?.type?.type || '';
  row[9] = `=IFERROR(GOOGLEFINANCE(${tickerAndExchange}, "changepct")/100, 0)`;

  const priceFormula = (dateExpr: string) => getHistoricalPriceFormula(tickerAndExchange, dateExpr);
  row[10] = `=IFERROR((${priceCell}/${priceFormula('TODAY()-7')})-1, "")`;
  row[11] = `=IFERROR((${priceCell}/${priceFormula('EDATE(TODAY(),-1)')})-1, "")`;
  row[12] = `=IFERROR((${priceCell}/${priceFormula('EDATE(TODAY(),-3)')})-1, "")`;
  row[13] = `=IFERROR(${priceCell} / ${priceFormula('DATE(YEAR(TODAY())-1, 12, 31)')} - 1, "")`;
  row[14] = `=IFERROR((${priceCell}/${priceFormula('EDATE(TODAY(),-12)')})-1, "")`;
  row[15] = `=IFERROR((${priceCell}/${priceFormula('EDATE(TODAY(),-36)')})-1, "")`;
  row[16] = `=IFERROR((${priceCell}/${priceFormula('EDATE(TODAY(),-60)')})-1, "")`;
  row[17] = `=IFERROR((${priceCell}/${priceFormula('EDATE(TODAY(),-120)')})-1, "")`;
  row[18] = h.numericId || '';
  row[19] = toGoogleFinanceExchangeCode(h.exchange);
  return row;
}

async function rebuildHoldingsSheetOnWorker(sheets: SheetsRestClient, market: WorkerMarketService): Promise<void> {
  const [currentHoldingsRows, txRows] = await Promise.all([
    sheets.getValues(HOLDINGS_RANGE, 'UNFORMATTED_VALUE'),
    sheets.getValues(TX_FETCH_RANGE, 'UNFORMATTED_VALUE'),
  ]);

  const existingPriceMap = parseHoldingsSheetPriceMap(currentHoldingsRows);
  const transactions = parseTransactionsFromRows(txRows);
  transactions.sort((a, b) => (coerceDate(a.date)?.getTime() || 0) - (coerceDate(b.date)?.getTime() || 0));

  const holdings: Record<string, { ticker: string; exchange: Exchange; qty: number; numericId: number | null }> = {};
  for (const txn of transactions) {
    if (txn.type === 'BUY' || txn.type === 'SELL' || txn.type === 'BUY_TRANSFER' || txn.type === 'SELL_TRANSFER') {
      if (!txn.exchange) continue;
      const key = `${txn.exchange}:${txn.ticker.toUpperCase()}`;
      if (!holdings[key]) {
        holdings[key] = { ticker: txn.ticker.toUpperCase(), exchange: txn.exchange, qty: 0, numericId: null };
      }
      if (txn.numericId !== undefined && txn.numericId !== null) {
        holdings[key].numericId = txn.numericId;
      }
      const mult = txn.type === 'BUY' || txn.type === 'BUY_TRANSFER' ? 1 : -1;
      const qty = parseFloat(String(txn.splitAdjustedQty || txn.originalQty)) || 0;
      holdings[key].qty += qty * mult;
    }
  }

  const activeHoldings = Object.values(holdings).filter(h => Math.abs(h.qty) > 1e-8);
  const enriched = await Promise.all(
    activeHoldings.map(async h => {
      const key = `${h.exchange}:${h.ticker}`;
      let meta: TickerData | null | undefined = existingPriceMap.get(key);
      if (!meta || !meta.name) {
        const fresh = await market.fetchTickerData(h.ticker, h.exchange, h.numericId, false);
        if (fresh) meta = { ...(meta || {}), ...fresh };
      }
      return { h, meta: meta || null };
    })
  );

  const rowsToWrite = enriched.map(({ h, meta }, idx) => createHoldingSheetRow(h, meta, idx + 2));
  await sheets.clearValues(HOLDINGS_RANGE);
  if (rowsToWrite.length > 0) {
    await sheets.updateValues(`${HOLDINGS_SHEET}!A2`, rowsToWrite, 'USER_ENTERED');
  }
  await sheets.setMetadataValue('holdings_rebuild', toGoogleSheetDateFormat(new Date()));
}

// --- Transaction Row Formatting & Formulas ---

function buildTransactionSheetRow(t: Transaction): (string | number | null)[] {
  const rowData: Record<string, string | number | null | undefined> = { ...(t as any) };
  const parsedDate = coerceDate(t.date);
  if (!parsedDate) {
    throw new AgentApiError(400, `Invalid transaction date: '${t.date}'`);
  }
  rowData.date = toGoogleSheetDateFormat(parsedDate);
  rowData.ticker = String(t.ticker).trim().toUpperCase();
  rowData.exchange = toGoogleSheetsExchangeCode(t.exchange!);
  rowData.gfExchange = toGoogleFinanceExchangeCode(t.exchange!);
  rowData.vestDate = t.vestDate ? toGoogleSheetDateFormat(coerceDate(t.vestDate)!) : '';
  rowData.comment = t.comment || '';
  rowData.source = t.source || 'AGENT_API';

  const comm = Number(t.commission) || 0;
  const isILA = String(t.currency || '').toUpperCase() === 'ILA';
  rowData.commission = isILA ? comm * 100 : comm;

  const cDate = (t.creationDate ? coerceDate(t.creationDate) : null) || new Date();
  rowData.creationDate = toGoogleSheetDateFormat(cDate);
  rowData.numeric_id = t.numericId ?? null;

  return sortedTxnColDefs.map(colDef => {
    if (colDef.formula) return null;
    const key = colDef.key;
    const val = rowData[key] ?? (t as any)[key];
    return val === undefined ? null : (val as string | number | null);
  });
}

function buildTransactionFormulaRequests(txSheetNumericId: number, rowNumbers: number[]): any[] {
  const formulaColDefs = Object.values(TXN_COLS).filter(colDef => !!colDef.formula);
  const allColDefs = Object.values(TXN_COLS);
  const requests: any[] = [];

  for (const rowNum of rowNumbers) {
    for (const colDef of formulaColDefs) {
      const formula = colDef.formula!(rowNum, TXN_COLS);
      const colIndex = allColDefs.indexOf(colDef);
      requests.push({
        updateCells: {
          range: {
            sheetId: txSheetNumericId,
            startRowIndex: rowNum - 1,
            endRowIndex: rowNum,
            startColumnIndex: colIndex,
            endColumnIndex: colIndex + 1,
          },
          rows: [{ values: [{ userEnteredValue: { formulaValue: formula } }] }],
          fields: 'userEnteredValue.formulaValue',
        },
      });
    }
  }
  return requests;
}

// --- Recent & Upcoming Events Builder (Pure equivalent of RecentEventsCard.getRecentEventsData) ---

function computeRecentAndUpcomingEvents(
  holdings: DashboardHolding[],
  transactions: Transaction[],
  dividendRecords: any[]
) {
  const today = new Date();
  const oneMonthAgo = new Date(today);
  oneMonthAgo.setDate(today.getDate() - 30);
  const oneMonthFuture = new Date(today);
  oneMonthFuture.setDate(today.getDate() + 30);

  const holdingSymbols = new Set(holdings.map(h => h.ticker.toUpperCase()));
  const events: any[] = [];

  for (const txn of transactions) {
    if (!holdingSymbols.has(txn.ticker.toUpperCase()) || !txn.vestDate) continue;
    const vDate = coerceDate(txn.vestDate);
    if (vDate && vDate >= oneMonthAgo && vDate <= oneMonthFuture) {
      const qty = txn.qty || txn.originalQty || 0;
      events.push({
        date: formatYYYYMMDD(vDate),
        ticker: txn.ticker,
        exchange: txn.exchange,
        type: vDate > today ? 'UPCOMING_VEST' : 'RECENT_VEST',
        qty,
        portfolioId: txn.portfolioId,
      });
    }
  }

  for (const div of dividendRecords || []) {
    if (!holdingSymbols.has(div.ticker.toUpperCase())) continue;
    const dDate = coerceDate(div.date);
    if (dDate && dDate >= oneMonthAgo && dDate <= oneMonthFuture) {
      events.push({
        date: formatYYYYMMDD(dDate),
        ticker: div.ticker,
        exchange: div.exchange,
        type: 'DIVIDEND_RECORDED',
        portfolioId: div.portfolioId,
        unitsHeld: div.unitsHeld,
        grossAmount: div.grossAmount,
        netAmount: div.netAmount,
      });
    }
  }

  for (const h of holdings as any[]) {
    if (h.earningsDate) {
      const eDate = coerceDate(h.earningsDate);
      if (eDate && eDate >= oneMonthAgo && eDate <= oneMonthFuture) {
        events.push({
          date: formatYYYYMMDD(eDate),
          ticker: h.ticker,
          exchange: h.exchange,
          type: eDate >= today ? 'UPCOMING_EARNINGS' : 'RECENT_EARNINGS',
        });
      }
    }
    if (h.exDividendDate) {
      const exDate = coerceDate(h.exDividendDate);
      if (exDate && exDate >= oneMonthAgo && exDate <= oneMonthFuture) {
        events.push({
          date: formatYYYYMMDD(exDate),
          ticker: h.ticker,
          exchange: h.exchange,
          type: exDate >= today ? 'UPCOMING_EX_DIVIDEND' : 'RECENT_EX_DIVIDEND',
        });
      }
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date));
  return events;
}

// --- Public Agent Operations ---

export function getAgentApiHelp(baseUrl: string) {
  return {
    service: 'Portfolios Agent API',
    baseUrl: `${baseUrl}/agent`,
    authentication: {
      header: 'Authorization: Bearer ptf_<YOUR_PRIVATE_KEY>',
      alternateHeader: 'X-Agent-Key: ptf_<YOUR_PRIVATE_KEY>',
      scope: 'Scoped strictly to the single Google Sheet where the key was generated. Revocable anytime from Advanced Tools -> Agent API Access or via App_Metadata in Google Sheets.',
    },
    endpoints: [
      {
        method: 'GET',
        path: '/agent/help',
        description: 'Returns API documentation, supported exchanges, currencies, transaction types, and payload schemas.',
      },
      {
        method: 'GET',
        path: '/agent/state',
        queryParams: {
          portfolioId: 'Optional portfolio ID to filter holdings/summary',
          currency: 'Display currency for summary & holding values (default: ILS; e.g. USD, ILS, EUR, GBP)',
          fast: 'Set "true" to use cached Google Sheets GOOGLEFINANCE prices without live Yahoo/Globes enrichment',
          includeBenchmarks: 'Set "false" to skip market benchmark indices (default: "true")',
          includeLots: 'Set "false" to omit activeLots/realizedLots arrays on holdings (default: "true")',
        },
        description: 'Returns comprehensive portfolio state (identical to & richer than the built-in AI helper): summary stats, tax-adjusted net worth, performance across 1D/1W/1M/3M/YTD/1Y/3Y/5Y, portfolios, holdings with FIFO lots, recent/upcoming events, watchlist & alert states, user profile, and market benchmarks.',
      },
      {
        method: 'GET',
        path: '/agent/portfolios',
        description: 'Lists all configured portfolios and their tax/fee policies.',
      },
      {
        method: 'GET',
        path: '/agent/transactions',
        queryParams: {
          portfolioId: 'Optional filter by portfolioId',
          ticker: 'Optional filter by ticker symbol',
          exchange: 'Optional filter by exchange (e.g. NASDAQ, NYSE, TASE)',
          type: 'Optional filter by type (BUY, SELL, BUY_TRANSFER, SELL_TRANSFER, DEPOSIT, WITHDRAWAL, FEE)',
          fromDate: 'Optional YYYY-MM-DD lower bound (inclusive)',
          toDate: 'Optional YYYY-MM-DD upper bound (inclusive)',
          limit: 'Optional max records to return',
          offset: 'Optional pagination offset',
        },
        description: 'Lists transactions from Transaction_Log including rowIndex (used for PUT/PATCH/DELETE), original & split-adjusted qty/price, vesting dates, comments, and commissions.',
      },
      {
        method: 'POST',
        path: '/agent/transactions',
        bodySchema: {
          date: 'YYYY-MM-DD (required)',
          portfolioId: 'Portfolio ID from /agent/portfolios (required)',
          ticker: 'Ticker symbol, e.g. "AAPL" or "1159250" (required)',
          exchange: 'NASDAQ | NYSE | TASE | LSE | FWB | TSE | HKEX | KRX | CRYPTO | FOREX | GEMEL | PENSION | CBS | BOI | CASH | MANUAL (required)',
          type: 'BUY | SELL | BUY_TRANSFER | SELL_TRANSFER | DEPOSIT | WITHDRAWAL | FEE (required)',
          originalQty: 'Number > 0 (required)',
          originalPrice: 'Price per unit in transaction currency (required)',
          currency: 'USD | ILS | ILA | EUR | GBP | CAD | JPY | HKD | AUD | CHF | KRW (required; note TASE stocks/funds quoted in Agorot use ILA)',
          vestDate: 'Optional YYYY-MM-DD for RSU / unvested grant lots',
          comment: 'Optional string note',
          commission: 'Optional commission in major currency (or set autoCommission: true to compute from portfolio fee rules)',
          autoCommission: 'Optional boolean (default false)',
          numericId: 'Optional TASE numeric security ID',
          allowOversell: 'Optional boolean (default false; prevents selling more units than held)',
        },
        batchSupport: 'Pass { "transactions": [ ... ] } to add multiple transactions atomically (e.g. RSU vesting schedules or swaps).',
        description: 'Appends one or more transactions, populates split-tracking formulas, and rebuilds the Holdings sheet.',
      },
      {
        method: 'PUT / PATCH',
        path: '/agent/transactions/:rowIndex',
        bodySchema: {
          '...fieldsToUpdate': 'Any transaction fields to update (PATCH merges with existing row; PUT replaces)',
          expectedTicker: 'Optional safety check: fails with 409 if row ticker does not match',
          expectedQty: 'Optional safety check: fails with 409 if row originalQty does not match',
        },
        description: 'Edits an existing transaction at rowIndex, updates sheet formulas, and rebuilds Holdings.',
      },
      {
        method: 'DELETE',
        path: '/agent/transactions/:rowIndex',
        queryOrBodyParams: {
          expectedTicker: 'Optional safety check: fails with 409 if row ticker does not match',
          expectedQty: 'Optional safety check: fails with 409 if row originalQty does not match',
        },
        description: 'Deletes the transaction row at rowIndex from Transaction_Log and rebuilds Holdings.',
      },
      {
        method: 'GET',
        path: '/agent/dividends',
        queryParams: {
          ticker: 'Optional filter by ticker',
          exchange: 'Optional filter by exchange',
          source: 'Optional filter by source (MANUAL or YAHOO)',
          fromDate: 'Optional YYYY-MM-DD',
          toDate: 'Optional YYYY-MM-DD',
        },
        description: 'Lists all dividend per-share events from the Dividends sheet with their rowIndex.',
      },
      {
        method: 'POST',
        path: '/agent/dividends',
        bodySchema: {
          ticker: 'Ticker symbol (required)',
          exchange: 'Exchange code (required)',
          date: 'YYYY-MM-DD ex-dividend/payment date (required)',
          amount: 'Dividend amount per share (required)',
          currency: 'Optional dividend currency (e.g. USD, ILS)',
          source: 'Optional source label (default: MANUAL)',
        },
        batchSupport: 'Pass { "dividends": [ ... ] } to add multiple dividend events.',
        description: 'Adds manual dividend event(s) to the Dividends sheet.',
      },
      {
        method: 'PUT / PATCH',
        path: '/agent/dividends/:rowIndex',
        description: 'Updates an existing dividend event at rowIndex.',
      },
      {
        method: 'DELETE',
        path: '/agent/dividends/:rowIndex',
        description: 'Deletes a dividend event at rowIndex from the Dividends sheet.',
      },
      {
        method: 'GET',
        path: '/agent/ticker/:exchange/:ticker',
        description: 'Fetches live quote, period returns, fundamentals (P/E, EPS, market cap, target price, upcoming earnings/dividends), and any owned position/transactions for the ticker.',
      },
    ],
  };
}

export async function getAgentPortfolioState(
  sheets: SheetsRestClient,
  market: WorkerMarketService,
  expectedKeyHash: string,
  options: {
    portfolioId?: string | null;
    displayCurrency?: string | null;
    fast?: boolean;
    includeBenchmarks?: boolean;
    includeLots?: boolean;
  } = {}
) {
  const ranges = [
    PORT_OPT_RANGE,
    TX_FETCH_RANGE,
    HOLDINGS_RANGE,
    CONFIG_RANGE,
    DIVIDENDS_RANGE,
    TRACKING_LISTS_RANGE,
    EXTERNAL_DATASETS_RANGE,
    METADATA_RANGE,
  ];

  // Fetch all core sheets in parallel (gracefully handling optional tabs if missing)
  let batchData: Record<string, any[][]>;
  try {
    batchData = await sheets.batchGetValues(ranges, 'UNFORMATTED_VALUE');
  } catch {
    const results = await Promise.all(ranges.map(r => sheets.getValues(r, 'UNFORMATTED_VALUE')));
    batchData = {};
    ranges.forEach((r, idx) => {
      batchData[r] = results[idx];
    });
  }

  // Verify per-user sheet key hash from App_Metadata
  const metaRows = batchData[METADATA_RANGE] || [];
  const metaMap: Record<string, string> = {};
  for (const r of metaRows) {
    if (r[0]) metaMap[String(r[0])] = r[1] !== undefined && r[1] !== null ? String(r[1]) : '';
  }
  const activeHash = (metaMap['agent_api_key_hash'] || '').trim();
  if (!activeHash || activeHash !== expectedKeyHash) {
    throw new AgentApiError(401, 'Agent private key is invalid, revoked, or rotated for this spreadsheet.');
  }

  const portfolios = parsePortfoliosFromRows(batchData[PORT_OPT_RANGE] || []);
  const transactions = parseTransactionsFromRows(batchData[TX_FETCH_RANGE] || []);
  const sheetPriceMap = parseHoldingsSheetPriceMap(batchData[HOLDINGS_RANGE] || []);
  const exchangeRates = parseExchangeRatesFromRows(batchData[CONFIG_RANGE] || []);
  const rawDivs = parseDividendsFromRows(batchData[DIVIDENDS_RANGE] || []);
  const trackingLists = parseTrackingListsFromRows(batchData[TRACKING_LISTS_RANGE] || []);
  const externalPriceMap = parseExternalPricesFromRows(batchData[EXTERNAL_DATASETS_RANGE] || []);

  // Collect unique tickers across transactions & watchlist
  const tickerInfoMap = new Map<string, { ticker: string; exchange: Exchange; numericId?: number | null }>();
  for (const t of transactions) {
    const ex = t.exchange || Exchange.TASE;
    const key = `${ex}:${t.ticker.toUpperCase()}`;
    if (!tickerInfoMap.has(key)) {
      tickerInfoMap.set(key, { ticker: t.ticker.toUpperCase(), exchange: ex, numericId: t.numericId });
    } else if (t.numericId && !tickerInfoMap.get(key)!.numericId) {
      tickerInfoMap.get(key)!.numericId = t.numericId;
    }
  }
  for (const item of trackingLists) {
    const key = `${item.exchange}:${item.ticker.toUpperCase()}`;
    if (!tickerInfoMap.has(key)) {
      tickerInfoMap.set(key, { ticker: item.ticker.toUpperCase(), exchange: item.exchange });
    }
  }

  const livePricesMap = new Map<string, TickerData>();
  for (const [k, v] of externalPriceMap.entries()) livePricesMap.set(k, v);
  for (const [k, v] of sheetPriceMap.entries()) {
    const existing = livePricesMap.get(k);
    livePricesMap.set(k, existing ? { ...existing, ...v } : v);
  }

  if (!options.fast) {
    const entries = Array.from(tickerInfoMap.values());
    const chunkSize = 8;
    for (let i = 0; i < entries.length; i += chunkSize) {
      const chunk = entries.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async ({ ticker, exchange, numericId }) => {
          const key = `${exchange}:${ticker}`;
          const sheetMeta = sheetPriceMap.get(key);
          const fresh = await market.fetchTickerData(ticker, exchange, numericId || sheetMeta?.numericId, true);
          if (fresh && fresh.price > 0) {
            livePricesMap.set(key, {
              ...(sheetMeta || {}),
              ...fresh,
              name: fresh.name || sheetMeta?.name,
              nameHe: fresh.nameHe || sheetMeta?.nameHe,
              sector: fresh.sector || sheetMeta?.sector,
            });
          }
        })
      );
    }
  }

  // Patch USD transactions missing originalPriceILA if needed
  const txnsNeedingRates = transactions.filter(t => t.currency === 'USD' && !t.originalPriceILA && t.originalPrice && t.date);
  if (txnsNeedingRates.length > 0 && !options.fast) {
    const usdIls = await market.fetchYahooData('USDILS=X', Exchange.FOREX, false);
    if (usdIls?.historical) {
      const rateMap = new Map<string, number>();
      for (const h of usdIls.historical) {
        rateMap.set(h.date.toISOString().split('T')[0], h.price);
      }
      for (const t of txnsNeedingRates) {
        const d = new Date(t.date);
        let rate = rateMap.get(d.toISOString().split('T')[0]);
        for (let back = 1; !rate && back <= 3; back++) {
          d.setDate(d.getDate() - 1);
          rate = rateMap.get(d.toISOString().split('T')[0]);
        }
        if (rate) {
          t.originalPriceILA = t.originalPrice * rate * 100;
        }
      }
    }
  }

  const cpiData = !options.fast ? await market.fetchCbsIndex('120010') : null;

  const dividendEvents: DividendEvent[] = rawDivs.map(d => {
    let dripPrice = d.assetPriceAtTime;
    if (dripPrice === undefined) {
      const tdata = livePricesMap.get(`${d.exchange}:${d.ticker}`);
      if (tdata?.historical) {
        const ds = d.date.toISOString().split('T')[0];
        const hp = tdata.historical.find(h => h.date.toISOString().split('T')[0] === ds);
        if (hp) dripPrice = hp.price;
      }
    }
    return {
      ticker: d.ticker,
      exchange: d.exchange,
      date: d.date,
      amount: d.amount,
      source: d.source || 'SHEET',
      assetPriceAtDrip: dripPrice,
    };
  });

  const engine = new FinanceEngine(portfolios, exchangeRates, cpiData);
  engine.processEvents(transactions, dividendEvents);
  engine.hydrateLivePrices(livePricesMap);

  const holdingsWithFees = Array.from(engine.holdings.values()).filter(h => {
    const p = engine.portfolios.get(h.portfolioId);
    return p && (p.mgmtType === 'percentage' || (p.feeHistory && p.feeHistory.some(f => f.mgmtType === 'percentage')));
  });
  if (holdingsWithFees.length > 0) {
    engine.generateRecurringFees((ticker, exchange) => {
      const match = holdingsWithFees.find(h => h.ticker === ticker && h.exchange === exchange);
      const h = match ? engine.holdings.get(`${match.portfolioId}_${ticker}`) : undefined;
      return h ? h.currentPrice : 0;
    });
  }
  engine.calculateSnapshot();

  let displayCurrency = 'ILS';
  if (options.displayCurrency) {
    try {
      displayCurrency = normalizeCurrency(options.displayCurrency);
    } catch {
      displayCurrency = 'ILS';
    }
  }

  const allHoldings = Array.from(engine.holdings.values()) as unknown as DashboardHolding[];
  const filteredHoldings = options.portfolioId
    ? allHoldings.filter(h => h.portfolioId === options.portfolioId)
    : allHoldings;

  const portMap = new Map(portfolios.map(p => [p.id, p]));
  const calc = calculateDashboardSummary(filteredHoldings, displayCurrency, exchangeRates, portMap, engine);

  const getTaxPolicyDesc = (policy?: string) => {
    switch (policy) {
      case 'TAX_FREE': return 'Tax Exempt / Keren Hishtalmut (0% Capital Gains Tax)';
      case 'IL_REAL_GAIN': return 'Israeli Real Gain (Taxed only on capital gains exceeding CPI inflation)';
      case 'NOMINAL_GAIN': return 'Nominal Gain (Taxed on nominal capital gains)';
      case 'PENSION': return 'Pension / Provident Fund';
      case 'RSU_ACCOUNT': return 'RSU Account (Vesting taxed as income; post-vesting gains taxed as capital gains)';
      default: return policy || 'NA';
    }
  };

  const portfoliosSummary = (options.portfolioId ? portfolios.filter(p => p.id === options.portfolioId) : portfolios).map(p => {
    const singleMap = new Map([[p.id, p]]);
    const pHoldings = allHoldings.filter(h => h.portfolioId === p.id);
    const pCalc = calculateDashboardSummary(pHoldings, displayCurrency, exchangeRates, singleMap, engine);
    return {
      id: p.id,
      name: p.name,
      currency: p.currency,
      cgtRate: p.cgt,
      incomeTaxRate: p.incTax,
      taxPolicy: p.taxPolicy,
      taxPolicyDescription: getTaxPolicyDesc(p.taxPolicy),
      divPolicy: p.divPolicy,
      mgmtFee: p.mgmtVal ? `${p.mgmtType === 'percentage' ? formatPercent(p.mgmtVal) : p.mgmtVal} ${p.mgmtFreq || ''}`.trim() : 'None',
      commRate: p.commRate,
      commMin: p.commMin,
      commMax: p.commMax,
      commExemption: p.commExemption,
      summary: pCalc.summary,
    };
  });

  const includeLots = options.includeLots !== false;
  const holdingsOutput = calc.holdings.map(h => {
    const live = livePricesMap.get(`${h.exchange}:${h.ticker}`) as any;
    return {
      id: (h as any).id,
      symbol: h.ticker,
      exchange: h.exchange,
      name: h.displayName || h.ticker,
      nameHe: h.nameHe,
      sector: h.sector,
      portfolioId: h.portfolioId,
      portfolioName: h.portfolioName,
      stockCurrency: h.stockCurrency,
      currentPrice: h.currentPrice,
      qtyTotal: h.qtyTotal,
      qtyVested: h.qtyVested,
      qtyUnvested: h.qtyUnvested,
      displayCurrency,
      marketValue: h.display.marketValue,
      valueAfterTax: h.display.valueAfterTax,
      costBasis: h.display.costBasis,
      adjustedCostBasis: h.display.adjustedCost,
      unrealizedGain: h.display.unrealizedGain,
      unrealizedGainPct: h.display.unrealizedGainPct,
      realizedGain: h.display.realizedGain,
      realizedGainPct: h.display.realizedGainPct,
      realizedGainAfterTax: h.display.realizedGainAfterTax,
      dividendsTotal: h.display.dividends,
      unrealizedTaxLiability: h.display.unrealizedTax,
      realizedTaxPaid: h.display.realizedTax,
      dayChange: h.display.dayChangeVal,
      dayChangePct: h.display.dayChangePct,
      weightInPortfolio: h.display.weightInPortfolio,
      weightInAllHoldings: h.display.weightInGlobal,
      unvestedMarketValue: h.display.unvestedValue,
      perf1w: h.perf1w,
      perf1m: h.perf1m,
      perf3m: h.perf3m,
      perfYtd: h.perfYtd,
      perf1y: h.perf1y,
      perf3y: h.perf3y,
      perf5y: h.perf5y,
      fundamentals: live?.fundamentals,
      ...(includeLots
        ? {
            activeLots: h.activeLots,
            realizedLots: h.realizedLots,
          }
        : {}),
    };
  });

  // User profile (matching AiChatDialog privacy handling: birthYear -> age)
  let userProfile: any = null;
  if (metaMap['user_financial_profile']) {
    try {
      const parsed = JSON.parse(metaMap['user_financial_profile']);
      if (parsed && typeof parsed === 'object') {
        userProfile = { ...parsed };
        if (userProfile.birthYear !== undefined) {
          userProfile.age = new Date().getFullYear() - Number(userProfile.birthYear);
          delete userProfile.birthYear;
        }
      }
    } catch {
      userProfile = null;
    }
  }

  const relevantTxns = options.portfolioId
    ? engine.transactions.filter(tx => tx.portfolioId === options.portfolioId)
    : engine.transactions;
  const relevantDivRecords = options.portfolioId
    ? engine.dividendRecords.filter(d => d.portfolioId === options.portfolioId)
    : engine.dividendRecords;

  // Attach calendar events onto holdings for event extraction
  for (const h of calc.holdings as any[]) {
    const live = livePricesMap.get(`${h.exchange}:${h.ticker}`);
    if (live?.calendarEvents?.earningsDate) h.earningsDate = live.calendarEvents.earningsDate;
    if (live?.calendarEvents?.exDividendDate) h.exDividendDate = live.calendarEvents.exDividendDate;
  }
  const recentAndUpcomingEvents = computeRecentAndUpcomingEvents(calc.holdings, relevantTxns, relevantDivRecords);

  const watchlist = trackingLists.map(item => {
    const live = livePricesMap.get(`${item.exchange}:${item.ticker}`);
    return {
      listName: item.listName,
      ticker: item.ticker,
      exchange: item.exchange,
      price: live?.price,
      currency: live?.currency,
      changePct1d: live?.changePct1d,
      alerts: (item.alerts || []).map(a => ({
        ...a,
        triggered: live ? evaluateAlert(a, live) : false,
      })),
    };
  });

  let marketOverview: any[] | undefined = undefined;
  if (options.includeBenchmarks !== false && !options.fast) {
    const benchmarks = [
      { ticker: '^SPX', exchange: Exchange.NYSE, name: 'S&P 500' },
      { ticker: '^NDX', exchange: Exchange.NASDAQ, name: 'NASDAQ 100' },
      { ticker: '^STOXX', exchange: Exchange.FWB, name: 'STOXX Europe 600' },
      { ticker: '^NYETR', exchange: Exchange.NYSE, name: 'NYSE Energy Sector' },
      { ticker: '^SP500-45', exchange: Exchange.NYSE, name: 'S&P 500 Info Tech' },
      { ticker: '137', exchange: Exchange.TASE, name: 'TA-125', numericId: 137 },
      { ticker: '120010', exchange: Exchange.CBS, name: 'Israel Consumer Price Index (Inflation)' },
      { ticker: 'MNT_RIB_BOI_D.D.RIB_BOI', exchange: Exchange.BOI, name: 'Bank of Israel Interest Rate' },
    ];
    const results = await Promise.all(
      benchmarks.map(b =>
        b.ticker === '120010' && cpiData
          ? Promise.resolve(cpiData)
          : market.fetchTickerData(b.ticker, b.exchange, b.numericId, false)
      )
    );
    marketOverview = benchmarks.map((b, idx) => {
      const d = results[idx];
      return {
        name: b.name,
        ticker: b.ticker,
        exchange: b.exchange,
        value: d?.price ?? null,
        perf1d: d?.changePct1d ?? null,
        perf1w: d?.changePctRecent ?? null,
        perf1m: d?.changePct1m ?? null,
        perf3m: d?.changePct3m ?? null,
        perfYtd: d?.changePctYtd ?? null,
        perf1y: d?.changePct1y ?? null,
        perf5y: d?.changePct5y ?? null,
      };
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    displayCurrency,
    exchangeRates: exchangeRates.current,
    userProfile,
    summary: calc.summary,
    portfolios: portfoliosSummary,
    holdings: holdingsOutput,
    recentAndUpcomingEvents,
    watchlist,
    ...(marketOverview ? { marketOverview } : {}),
  };
}

export async function listAgentPortfolios(sheets: SheetsRestClient, expectedKeyHash: string) {
  await verifySheetAgentKey(sheets, expectedKeyHash);
  const rows = await sheets.getValues(PORT_OPT_RANGE, 'UNFORMATTED_VALUE');
  return { portfolios: parsePortfoliosFromRows(rows) };
}

export async function listAgentTransactions(
  sheets: SheetsRestClient,
  expectedKeyHash: string,
  filters: {
    portfolioId?: string | null;
    ticker?: string | null;
    exchange?: string | null;
    type?: string | null;
    fromDate?: string | null;
    toDate?: string | null;
    limit?: number;
    offset?: number;
  } = {}
) {
  const batch = await sheets.batchGetValues([METADATA_RANGE, PORT_OPT_RANGE, TX_FETCH_RANGE], 'UNFORMATTED_VALUE');
  const metaRows = batch[METADATA_RANGE] || [];
  const activeHash = String(metaRows.find(r => String(r[0]) === 'agent_api_key_hash')?.[1] || '').trim();
  if (!activeHash || activeHash !== expectedKeyHash) {
    throw new AgentApiError(401, 'Agent private key is invalid, revoked, or rotated for this spreadsheet.');
  }

  const portfolios = parsePortfoliosFromRows(batch[PORT_OPT_RANGE] || []);
  const portNameMap = new Map(portfolios.map(p => [p.id, p.name]));
  let txns = parseTransactionsFromRows(batch[TX_FETCH_RANGE] || []);

  if (filters.portfolioId) {
    txns = txns.filter(t => t.portfolioId === filters.portfolioId);
  }
  if (filters.ticker) {
    const sym = filters.ticker.trim().toUpperCase();
    txns = txns.filter(t => t.ticker.toUpperCase() === sym);
  }
  if (filters.exchange) {
    const ex = parseExchange(filters.exchange);
    txns = txns.filter(t => t.exchange === ex);
  }
  if (filters.type) {
    const tp = filters.type.trim().toUpperCase();
    txns = txns.filter(t => t.type === tp);
  }
  if (filters.fromDate) {
    txns = txns.filter(t => String(t.date) >= filters.fromDate!);
  }
  if (filters.toDate) {
    txns = txns.filter(t => String(t.date) <= filters.toDate!);
  }

  // Sort newest first by date, then descending rowIndex
  txns.sort((a, b) => {
    const cmp = String(b.date).localeCompare(String(a.date));
    return cmp !== 0 ? cmp : (b.rowIndex || 0) - (a.rowIndex || 0);
  });

  const totalCount = txns.length;
  const offset = Math.max(0, filters.offset || 0);
  const limit = filters.limit && filters.limit > 0 ? filters.limit : txns.length;
  const sliced = txns.slice(offset, offset + limit).map(t => ({
    ...t,
    portfolioName: portNameMap.get(t.portfolioId) || t.portfolioId,
  }));

  return {
    totalCount,
    offset,
    count: sliced.length,
    transactions: sliced,
  };
}

function computeDefaultCommission(port: Portfolio, type: TransactionType, totalMajor: number): number {
  if (!Number.isFinite(totalMajor) || totalMajor <= 0) return 0;
  if (!isBuy(type) && !isSell(type)) return 0;
  if (port.commExemption === 'all') return 0;
  if (port.commExemption === 'sells' && isSell(type)) return 0;
  const raw = totalMajor * (port.commRate || 0);
  const clampedMin = Math.max(raw, port.commMin || 0);
  const max = port.commMax || 0;
  return Number((max > 0 ? Math.min(clampedMin, max) : clampedMin).toFixed(2));
}

const VALID_TXN_TYPES = new Set<string>([
  'BUY',
  'SELL',
  'BUY_TRANSFER',
  'SELL_TRANSFER',
  'DEPOSIT',
  'WITHDRAWAL',
  'FEE',
]);

export async function addAgentTransactions(
  sheets: SheetsRestClient,
  market: WorkerMarketService,
  expectedKeyHash: string,
  body: any
) {
  await verifySheetAgentKey(sheets, expectedKeyHash);

  const rawItems: any[] = Array.isArray(body?.transactions)
    ? body.transactions
    : body?.transaction
    ? [body.transaction]
    : [body];

  if (!rawItems.length) {
    throw new AgentApiError(400, 'At least one transaction object is required.');
  }

  const [portRows, existingTxRows] = await Promise.all([
    sheets.getValues(PORT_OPT_RANGE, 'UNFORMATTED_VALUE'),
    sheets.getValues(TX_FETCH_RANGE, 'UNFORMATTED_VALUE'),
  ]);
  const portfolios = parsePortfoliosFromRows(portRows);
  const portMap = new Map(portfolios.map(p => [p.id, p]));
  const existingTxns = parseTransactionsFromRows(existingTxRows);

  // Track current held quantities per portfolioId+exchange+ticker for oversell validation
  const heldQtyMap = new Map<string, number>();
  for (const tx of existingTxns) {
    if (isBuy(tx.type) || isSell(tx.type)) {
      const k = `${tx.portfolioId}:${tx.exchange}:${tx.ticker.toUpperCase()}`;
      const mult = isBuy(tx.type) ? 1 : -1;
      heldQtyMap.set(k, (heldQtyMap.get(k) || 0) + (tx.qty || tx.originalQty || 0) * mult);
    }
  }

  const normalizedTxns: Transaction[] = [];
  for (const item of rawItems) {
    const type = String(item.type || '').trim().toUpperCase() as TransactionType;
    if (type === ('DIVIDEND' as any)) {
      throw new AgentApiError(400, 'Use POST /agent/dividends to add dividend events instead of /agent/transactions.');
    }
    if (!VALID_TXN_TYPES.has(type)) {
      throw new AgentApiError(400, `Invalid transaction type '${item.type}'. Allowed: ${Array.from(VALID_TXN_TYPES).join(', ')}`);
    }

    const portfolioId = String(item.portfolioId || '').trim();
    const port = portMap.get(portfolioId);
    if (!port) {
      throw new AgentApiError(
        400,
        `Portfolio '${portfolioId}' not found. Available portfolios: ${portfolios.map(p => `${p.id} (${p.name})`).join(', ')}`
      );
    }

    const ticker = String(item.ticker || '').trim().toUpperCase();
    if (!ticker) throw new AgentApiError(400, 'Transaction ticker is required.');

    let exchange: Exchange;
    try {
      exchange = parseExchange(String(item.exchange || ''));
    } catch {
      throw new AgentApiError(400, `Invalid exchange '${item.exchange}'.`);
    }

    const parsedDate = coerceDate(item.date);
    if (!parsedDate) {
      throw new AgentApiError(400, `Invalid date '${item.date}'. Use YYYY-MM-DD.`);
    }

    const originalQty = Number(item.originalQty ?? item.qty);
    if (!Number.isFinite(originalQty) || originalQty <= 0) {
      throw new AgentApiError(400, 'originalQty must be a positive number.');
    }

    const originalPrice = Number(item.originalPrice ?? item.price);
    if (!Number.isFinite(originalPrice) || originalPrice < 0) {
      throw new AgentApiError(400, 'originalPrice must be a non-negative number.');
    }

    let currency: Currency;
    try {
      currency = String(item.currency || '').toUpperCase() === 'ILA'
        ? Currency.ILA
        : normalizeCurrency(String(item.currency || (exchange === Exchange.TASE ? 'ILA' : port.currency || 'USD')));
    } catch {
      throw new AgentApiError(400, `Invalid currency '${item.currency}'.`);
    }

    if (isSell(type) && !item.allowOversell) {
      const k = `${portfolioId}:${exchange}:${ticker}`;
      const available = heldQtyMap.get(k) || 0;
      if (available < originalQty - 1e-6) {
        throw new AgentApiError(
          400,
          `Cannot sell ${originalQty} of ${exchange}:${ticker} in portfolio '${portfolioId}': only ${available} held (pass allowOversell: true to override).`
        );
      }
      heldQtyMap.set(k, available - originalQty);
    } else if (isBuy(type)) {
      const k = `${portfolioId}:${exchange}:${ticker}`;
      heldQtyMap.set(k, (heldQtyMap.get(k) || 0) + originalQty);
    }

    let commission = item.commission !== undefined ? Number(item.commission) : 0;
    if (item.autoCommission && item.commission === undefined) {
      const rawTotal = originalQty * originalPrice;
      const totalMajor = currency === Currency.ILA ? rawTotal / 100 : rawTotal;
      commission = computeDefaultCommission(port, type, totalMajor);
    }

    let origOpenPrice = item.origOpenPriceAtCreationDate !== undefined ? Number(item.origOpenPriceAtCreationDate) : undefined;
    let numericId: number | undefined = item.numericId !== undefined && item.numericId !== null ? Number(item.numericId) : undefined;
    if (origOpenPrice === undefined) {
      const live = await market.fetchTickerData(ticker, exchange, numericId, false);
      if (live?.openPrice && live.openPrice > 0) {
        origOpenPrice = live.openPrice;
      } else if (live?.price && live.price > 0) {
        origOpenPrice = live.price;
      }
      if (!numericId && live?.numericId) {
        numericId = live.numericId;
      }
    }

    normalizedTxns.push({
      date: formatYYYYMMDD(parsedDate),
      portfolioId,
      ticker,
      exchange,
      type,
      originalQty,
      originalPrice,
      qty: originalQty,
      price: originalPrice,
      currency,
      vestDate: item.vestDate ? formatYYYYMMDD(coerceDate(item.vestDate)!) : undefined,
      comment: item.comment ? String(item.comment) : undefined,
      commission,
      source: item.source ? String(item.source) : 'AGENT_API',
      creationDate: formatYYYYMMDD(new Date()),
      origOpenPriceAtCreationDate: origOpenPrice,
      numericId,
    });
  }

  const rowsToAppend = normalizedTxns.map(buildTransactionSheetRow);
  const appendRes = await sheets.appendValues(`${TX_SHEET_NAME}!A:A`, rowsToAppend, 'USER_ENTERED', 'INSERT_ROWS');
  const updatedRange: string = appendRes?.updates?.updatedRange || '';
  const match = updatedRange.match(/!A(\d+):/);
  if (!match) {
    throw new AgentApiError(500, `Could not determine appended row range from '${updatedRange}'.`);
  }
  const startRow = parseInt(match[1], 10);
  const rowNumbers = normalizedTxns.map((_, i) => startRow + i);

  const txSheetId = await sheets.getSheetNumericId(TX_SHEET_NAME);
  const formulaRequests = buildTransactionFormulaRequests(txSheetId, rowNumbers);
  if (formulaRequests.length > 0) {
    await sheets.batchUpdate(formulaRequests);
  }

  await rebuildHoldingsSheetOnWorker(sheets, market);

  return {
    success: true,
    addedCount: normalizedTxns.length,
    transactions: normalizedTxns.map((t, idx) => ({ ...t, rowIndex: startRow + idx })),
  };
}

export async function updateAgentTransaction(
  sheets: SheetsRestClient,
  market: WorkerMarketService,
  expectedKeyHash: string,
  rowIndex: number,
  body: any,
  isPartial: boolean
) {
  if (!Number.isInteger(rowIndex) || rowIndex < 2) {
    throw new AgentApiError(400, 'rowIndex must be an integer >= 2.');
  }
  await verifySheetAgentKey(sheets, expectedKeyHash);

  const [portRows, allTxRows] = await Promise.all([
    sheets.getValues(PORT_OPT_RANGE, 'UNFORMATTED_VALUE'),
    sheets.getValues(TX_FETCH_RANGE, 'UNFORMATTED_VALUE'),
  ]);
  const portfolios = parsePortfoliosFromRows(portRows);
  const portMap = new Map(portfolios.map(p => [p.id, p]));

  const rawExistingRow = allTxRows[rowIndex - 2];
  if (!rawExistingRow || rawExistingRow.every((c: any) => c === '' || c === null || c === undefined)) {
    throw new AgentApiError(404, `Transaction at rowIndex ${rowIndex} not found.`);
  }

  const parsedExistingList = parseTransactionsFromRows([rawExistingRow]);
  const existing = parsedExistingList[0];
  if (!existing) {
    throw new AgentApiError(404, `Row ${rowIndex} does not contain a valid transaction.`);
  }
  existing.rowIndex = rowIndex;

  if (body.expectedTicker && String(body.expectedTicker).toUpperCase() !== existing.ticker.toUpperCase()) {
    throw new AgentApiError(
      409,
      `Verification failed at row ${rowIndex}: expected ticker '${body.expectedTicker}', found '${existing.ticker}'.`
    );
  }
  if (body.expectedQty !== undefined && Math.abs(Number(body.expectedQty) - Number(existing.originalQty)) > 0.0001) {
    throw new AgentApiError(
      409,
      `Verification failed at row ${rowIndex}: expected qty ${body.expectedQty}, found ${existing.originalQty}.`
    );
  }

  const merged: any = isPartial ? { ...existing, ...body } : { ...body, rowIndex };
  if (body.qty !== undefined && body.originalQty === undefined) merged.originalQty = Number(body.qty);
  if (body.price !== undefined && body.originalPrice === undefined) merged.originalPrice = Number(body.price);

  const type = String(merged.type || '').trim().toUpperCase() as TransactionType;
  if (!VALID_TXN_TYPES.has(type)) {
    throw new AgentApiError(400, `Invalid transaction type '${merged.type}'.`);
  }
  if (!portMap.has(String(merged.portfolioId))) {
    throw new AgentApiError(400, `Portfolio '${merged.portfolioId}' not found.`);
  }

  const exchange = parseExchange(String(merged.exchange || existing.exchange || ''));
  const parsedDate = coerceDate(merged.date);
  if (!parsedDate) throw new AgentApiError(400, `Invalid date '${merged.date}'.`);

  const originalQty = Number(merged.originalQty);
  const originalPrice = Number(merged.originalPrice);
  if (!Number.isFinite(originalQty) || originalQty <= 0) {
    throw new AgentApiError(400, 'originalQty must be > 0.');
  }
  if (!Number.isFinite(originalPrice) || originalPrice < 0) {
    throw new AgentApiError(400, 'originalPrice must be >= 0.');
  }

  const currency =
    String(merged.currency || '').toUpperCase() === 'ILA'
      ? Currency.ILA
      : normalizeCurrency(String(merged.currency || existing.currency || 'USD'));

  const updatedTxn: Transaction = {
    rowIndex,
    date: formatYYYYMMDD(parsedDate),
    portfolioId: String(merged.portfolioId),
    ticker: String(merged.ticker).trim().toUpperCase(),
    exchange,
    type,
    originalQty,
    originalPrice,
    qty: originalQty,
    price: originalPrice,
    currency,
    vestDate: merged.vestDate ? formatYYYYMMDD(coerceDate(merged.vestDate)!) : undefined,
    comment: merged.comment !== undefined ? String(merged.comment) : undefined,
    commission: merged.commission !== undefined ? Number(merged.commission) : existing.commission || 0,
    source: merged.source ? String(merged.source) : existing.source || 'AGENT_API',
    creationDate: existing.creationDate || formatYYYYMMDD(new Date()),
    origOpenPriceAtCreationDate:
      merged.origOpenPriceAtCreationDate !== undefined
        ? Number(merged.origOpenPriceAtCreationDate)
        : existing.origOpenPriceAtCreationDate,
    numericId: merged.numericId !== undefined ? Number(merged.numericId) : existing.numericId,
  };

  const rowValues = buildTransactionSheetRow(updatedTxn);
  await sheets.updateValues(`${TX_SHEET_NAME}!A${rowIndex}`, [rowValues], 'USER_ENTERED');

  const txSheetId = await sheets.getSheetNumericId(TX_SHEET_NAME);
  const formulaRequests = buildTransactionFormulaRequests(txSheetId, [rowIndex]);
  if (formulaRequests.length > 0) {
    await sheets.batchUpdate(formulaRequests);
  }

  await rebuildHoldingsSheetOnWorker(sheets, market);

  return {
    success: true,
    transaction: updatedTxn,
  };
}

export async function deleteAgentTransaction(
  sheets: SheetsRestClient,
  market: WorkerMarketService,
  expectedKeyHash: string,
  rowIndex: number,
  opts: { expectedTicker?: string | null; expectedQty?: number | null } = {}
) {
  if (!Number.isInteger(rowIndex) || rowIndex < 2) {
    throw new AgentApiError(400, 'rowIndex must be an integer >= 2.');
  }
  await verifySheetAgentKey(sheets, expectedKeyHash);

  const rowRes = await sheets.getValues(`${TX_SHEET_NAME}!A${rowIndex}:V${rowIndex}`, 'UNFORMATTED_VALUE');
  const rawRow = rowRes[0];
  if (!rawRow || rawRow.every((c: any) => c === '' || c === null || c === undefined)) {
    throw new AgentApiError(404, `Transaction at rowIndex ${rowIndex} not found.`);
  }

  const parsed = parseTransactionsFromRows([rawRow])[0];
  if (!parsed) {
    throw new AgentApiError(404, `Row ${rowIndex} does not contain a valid transaction.`);
  }
  parsed.rowIndex = rowIndex;

  if (opts.expectedTicker && opts.expectedTicker.toUpperCase() !== parsed.ticker.toUpperCase()) {
    throw new AgentApiError(
      409,
      `Verification failed at row ${rowIndex}: expected ticker '${opts.expectedTicker}', found '${parsed.ticker}'.`
    );
  }
  if (opts.expectedQty !== undefined && opts.expectedQty !== null && Math.abs(Number(opts.expectedQty) - Number(parsed.originalQty)) > 0.0001) {
    throw new AgentApiError(
      409,
      `Verification failed at row ${rowIndex}: expected qty ${opts.expectedQty}, found ${parsed.originalQty}.`
    );
  }

  const txSheetId = await sheets.getSheetNumericId(TX_SHEET_NAME);
  await sheets.batchUpdate([
    {
      deleteDimension: {
        range: {
          sheetId: txSheetId,
          dimension: 'ROWS',
          startIndex: rowIndex - 1,
          endIndex: rowIndex,
        },
      },
    },
  ]);

  await rebuildHoldingsSheetOnWorker(sheets, market);

  return {
    success: true,
    deletedTransaction: parsed,
  };
}

// --- Dividends CRUD Operations ---

function buildDividendSheetRow(
  exchange: Exchange,
  ticker: string,
  date: Date,
  amount: number,
  source: string,
  currency?: string
): any[] {
  const priceFormula = `=IFERROR(INDEX(GOOGLEFINANCE(IF(TRIM(INDIRECT("A"&ROW()))="", INDIRECT("B"&ROW()), INDIRECT("A"&ROW())&":"&INDIRECT("B"&ROW())), "price", INDIRECT("C"&ROW())), 2, 2), "")`;
  const assetPriceCurrencyFormula = `=IFERROR(GOOGLEFINANCE(IF(TRIM(INDIRECT("A"&ROW()))="", INDIRECT("B"&ROW()), INDIRECT("A"&ROW())&":"&INDIRECT("B"&ROW())), "currency"), "")`;
  const divCurrency = currency || (exchange === Exchange.TASE ? 'ILS' : 'USD');
  return [
    toGoogleSheetsExchangeCode(exchange),
    ticker.toUpperCase(),
    toGoogleSheetDateFormat(date),
    amount,
    source,
    priceFormula,
    assetPriceCurrencyFormula,
    divCurrency,
  ];
}

export async function listAgentDividends(
  sheets: SheetsRestClient,
  expectedKeyHash: string,
  filters: {
    ticker?: string | null;
    exchange?: string | null;
    source?: string | null;
    fromDate?: string | null;
    toDate?: string | null;
  } = {}
) {
  await verifySheetAgentKey(sheets, expectedKeyHash);
  const rows = await sheets.getValues(DIVIDENDS_RANGE, 'UNFORMATTED_VALUE');
  let divs = parseDividendsFromRows(rows).map(d => ({
    rowIndex: d.rowIndex,
    exchange: d.exchange,
    ticker: d.ticker,
    date: d.dateStr,
    amount: d.amount,
    currency: d.currency || (d.exchange === Exchange.TASE ? 'ILS' : 'USD'),
    source: d.source,
    assetPriceAtTime: d.assetPriceAtTime,
  }));

  if (filters.ticker) {
    const sym = filters.ticker.trim().toUpperCase();
    divs = divs.filter(d => d.ticker === sym);
  }
  if (filters.exchange) {
    const ex = parseExchange(filters.exchange);
    divs = divs.filter(d => d.exchange === ex);
  }
  if (filters.source) {
    const src = filters.source.trim().toUpperCase();
    divs = divs.filter(d => d.source.toUpperCase() === src);
  }
  if (filters.fromDate) {
    divs = divs.filter(d => d.date >= filters.fromDate!);
  }
  if (filters.toDate) {
    divs = divs.filter(d => d.date <= filters.toDate!);
  }

  divs.sort((a, b) => b.date.localeCompare(a.date) || b.rowIndex - a.rowIndex);
  return {
    count: divs.length,
    dividends: divs,
  };
}

export async function addAgentDividends(
  sheets: SheetsRestClient,
  expectedKeyHash: string,
  body: any
) {
  await verifySheetAgentKey(sheets, expectedKeyHash);

  const rawItems: any[] = Array.isArray(body?.dividends)
    ? body.dividends
    : body?.dividend
    ? [body.dividend]
    : [body];

  if (!rawItems.length) {
    throw new AgentApiError(400, 'At least one dividend object is required.');
  }

  // Ensure Dividends sheet exists with headers if new
  const existingRows = await sheets.getValues(DIVIDENDS_RANGE, 'UNFORMATTED_VALUE');
  if (existingRows.length === 0) {
    const sheetId = await sheets.getSheetNumericId(DIV_SHEET_NAME, true);
    if (sheetId !== undefined) {
      const headerCheck = await sheets.getValues(`${DIV_SHEET_NAME}!A1:H1`, 'FORMATTED_VALUE');
      if (!headerCheck.length) {
        await sheets.updateValues(`${DIV_SHEET_NAME}!A1:H1`, [Array.from(dividendHeaders)], 'USER_ENTERED');
      }
    }
  }

  const newRows: any[][] = [];
  const addedSummary: any[] = [];

  for (const item of rawItems) {
    const ticker = String(item.ticker || '').trim().toUpperCase();
    if (!ticker) throw new AgentApiError(400, 'Dividend ticker is required.');

    let exchange: Exchange;
    try {
      exchange = parseExchange(String(item.exchange || ''));
    } catch {
      throw new AgentApiError(400, `Invalid dividend exchange '${item.exchange}'.`);
    }

    const parsedDate = coerceDate(item.date);
    if (!parsedDate) throw new AgentApiError(400, `Invalid dividend date '${item.date}'.`);

    const amount = Number(item.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new AgentApiError(400, 'Dividend amount must be > 0.');
    }

    const source = item.source ? String(item.source).toUpperCase() : 'MANUAL';
    const currency = item.currency ? normalizeCurrency(String(item.currency)) : exchange === Exchange.TASE ? Currency.ILS : Currency.USD;

    newRows.push(buildDividendSheetRow(exchange, ticker, parsedDate, amount, source, currency));
    addedSummary.push({
      ticker,
      exchange,
      date: formatYYYYMMDD(parsedDate),
      amount,
      currency,
      source,
    });
  }

  const appendRes = await sheets.appendValues(`${DIV_SHEET_NAME}!A:A`, newRows, 'USER_ENTERED', 'INSERT_ROWS');
  const updatedRange: string = appendRes?.updates?.updatedRange || '';
  const match = updatedRange.match(/!A(\d+):/);
  const startRow = match ? parseInt(match[1], 10) : undefined;

  await sheets.setMetadataValue('dividends_rebuild', toGoogleSheetDateFormat(new Date()));

  return {
    success: true,
    addedCount: addedSummary.length,
    dividends: addedSummary.map((d, idx) => ({
      ...d,
      ...(startRow !== undefined ? { rowIndex: startRow + idx } : {}),
    })),
  };
}

export async function updateAgentDividend(
  sheets: SheetsRestClient,
  expectedKeyHash: string,
  rowIndex: number,
  body: any
) {
  if (!Number.isInteger(rowIndex) || rowIndex < 2) {
    throw new AgentApiError(400, 'rowIndex must be an integer >= 2.');
  }
  await verifySheetAgentKey(sheets, expectedKeyHash);

  const rowRes = await sheets.getValues(`${DIV_SHEET_NAME}!A${rowIndex}:H${rowIndex}`, 'UNFORMATTED_VALUE');
  const rawRow = rowRes[0];
  if (!rawRow || rawRow.every((c: any) => c === '' || c === null || c === undefined)) {
    throw new AgentApiError(404, `Dividend at rowIndex ${rowIndex} not found.`);
  }

  const existing = parseDividendsFromRows([rawRow])[0];
  if (!existing) {
    throw new AgentApiError(404, `Row ${rowIndex} in Dividends is invalid.`);
  }

  if (body.expectedTicker && String(body.expectedTicker).toUpperCase() !== existing.ticker) {
    throw new AgentApiError(409, `Verification failed: expected ticker '${body.expectedTicker}', found '${existing.ticker}'.`);
  }
  if (body.expectedAmount !== undefined && Math.abs(Number(body.expectedAmount) - existing.amount) > 0.000001) {
    throw new AgentApiError(409, `Verification failed: expected amount ${body.expectedAmount}, found ${existing.amount}.`);
  }

  const exchange = body.exchange ? parseExchange(String(body.exchange)) : existing.exchange;
  const ticker = body.ticker ? String(body.ticker).trim().toUpperCase() : existing.ticker;
  const parsedDate = body.date ? coerceDate(body.date) : existing.date;
  if (!parsedDate) throw new AgentApiError(400, `Invalid dividend date '${body.date}'.`);

  const amount = body.amount !== undefined ? Number(body.amount) : existing.amount;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AgentApiError(400, 'Dividend amount must be > 0.');
  }

  const source = body.source ? String(body.source).toUpperCase() : existing.source || 'MANUAL';
  const currency = body.currency ? normalizeCurrency(String(body.currency)) : existing.currency;

  const updatedRow = buildDividendSheetRow(exchange, ticker, parsedDate, amount, source, currency);
  await sheets.updateValues(`${DIV_SHEET_NAME}!A${rowIndex}:H${rowIndex}`, [updatedRow], 'USER_ENTERED');

  return {
    success: true,
    dividend: {
      rowIndex,
      ticker,
      exchange,
      date: formatYYYYMMDD(parsedDate),
      amount,
      currency: currency || (exchange === Exchange.TASE ? 'ILS' : 'USD'),
      source,
    },
  };
}

export async function deleteAgentDividend(
  sheets: SheetsRestClient,
  expectedKeyHash: string,
  rowIndex: number,
  opts: { expectedTicker?: string | null; expectedAmount?: number | null } = {}
) {
  if (!Number.isInteger(rowIndex) || rowIndex < 2) {
    throw new AgentApiError(400, 'rowIndex must be an integer >= 2.');
  }
  await verifySheetAgentKey(sheets, expectedKeyHash);

  const rowRes = await sheets.getValues(`${DIV_SHEET_NAME}!A${rowIndex}:H${rowIndex}`, 'UNFORMATTED_VALUE');
  const rawRow = rowRes[0];
  if (!rawRow || rawRow.every((c: any) => c === '' || c === null || c === undefined)) {
    throw new AgentApiError(404, `Dividend at rowIndex ${rowIndex} not found.`);
  }

  const existing = parseDividendsFromRows([rawRow])[0];
  if (!existing) {
    throw new AgentApiError(404, `Row ${rowIndex} in Dividends is invalid.`);
  }

  if (opts.expectedTicker && opts.expectedTicker.toUpperCase() !== existing.ticker) {
    throw new AgentApiError(409, `Verification failed: expected ticker '${opts.expectedTicker}', found '${existing.ticker}'.`);
  }
  if (opts.expectedAmount !== undefined && opts.expectedAmount !== null && Math.abs(Number(opts.expectedAmount) - existing.amount) > 0.000001) {
    throw new AgentApiError(409, `Verification failed: expected amount ${opts.expectedAmount}, found ${existing.amount}.`);
  }

  const divSheetId = await sheets.getSheetNumericId(DIV_SHEET_NAME);
  await sheets.batchUpdate([
    {
      deleteDimension: {
        range: {
          sheetId: divSheetId,
          dimension: 'ROWS',
          startIndex: rowIndex - 1,
          endIndex: rowIndex,
        },
      },
    },
  ]);

  return {
    success: true,
    deletedDividend: {
      rowIndex,
      ticker: existing.ticker,
      exchange: existing.exchange,
      date: existing.dateStr,
      amount: existing.amount,
      currency: existing.currency,
      source: existing.source,
    },
  };
}

export async function getAgentTickerStats(
  sheets: SheetsRestClient,
  market: WorkerMarketService,
  expectedKeyHash: string,
  exchangeStr: string,
  tickerStr: string,
  numericId?: number | null
) {
  await verifySheetAgentKey(sheets, expectedKeyHash);
  let exchange: Exchange;
  try {
    exchange = parseExchange(exchangeStr);
  } catch {
    throw new AgentApiError(400, `Invalid exchange '${exchangeStr}'.`);
  }
  const ticker = tickerStr.trim().toUpperCase();

  const [txRows, divRows] = await Promise.all([
    sheets.getValues(TX_FETCH_RANGE, 'UNFORMATTED_VALUE'),
    sheets.getValues(DIVIDENDS_RANGE, 'UNFORMATTED_VALUE'),
  ]);

  const matchingTxns = parseTransactionsFromRows(txRows).filter(
    t => t.ticker.toUpperCase() === ticker && (!t.exchange || t.exchange === exchange)
  );
  const resolvedNumericId = numericId || matchingTxns.find(t => t.numericId)?.numericId || null;

  const live = await market.fetchTickerData(ticker, exchange, resolvedNumericId, true);
  const matchingDivs = parseDividendsFromRows(divRows)
    .filter(d => d.ticker === ticker && d.exchange === exchange)
    .map(d => ({
      rowIndex: d.rowIndex,
      date: d.dateStr,
      amount: d.amount,
      currency: d.currency,
      source: d.source,
    }));

  return {
    ticker,
    exchange,
    marketData: live
      ? {
          price: live.price,
          openPrice: live.openPrice,
          currency: live.currency,
          name: live.name,
          nameHe: live.nameHe,
          sector: live.sector,
          changePct1d: live.changePct1d,
          changePct1w: live.changePctRecent,
          changePct1m: live.changePct1m,
          changePct3m: live.changePct3m,
          changePctYtd: live.changePctYtd,
          changePct1y: live.changePct1y,
          changePct3y: live.changePct3y,
          changePct5y: live.changePct5y,
          earningsDate: live.calendarEvents?.earningsDate,
          exDividendDate: live.calendarEvents?.exDividendDate,
          dividendPayDate: live.calendarEvents?.dividendDate,
          fundamentals: live.fundamentals,
          recentHistoryPoints: live.historical ? live.historical.slice(-30) : [],
        }
      : null,
    userTransactions: matchingTxns,
    recordedDividends: matchingDivs,
  };
}
