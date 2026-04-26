import { vi, describe, it, expect, afterEach } from 'vitest';
import { fetchYahooTickerData } from './yahoo';
import { Exchange } from '../types';
import * as currency from '../currency';
import * as cache from './utils/cache';

// Mocking fetch
vi.stubGlobal('fetch', vi.fn());

vi.spyOn(cache, 'fetchWithCache').mockImplementation((_key, _ttl, _force, fn) => fn());
vi.spyOn(currency, 'convertCurrency').mockImplementation((amount, from, to) => {
  if (from === 'ILA' && to === 'ILS') return amount / 100;
  if (from === 'ILA' && to === 'USD') return (amount / 100) / 3.7;
  return amount;
});

const createFetchResponse = (data: any) => ({
  ok: true,
  json: () => new Promise((resolve) => resolve(data)),
});

describe('fetchYahooTickerData', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should correctly calculate forwardPE and handle dividends for LUMI.TA', async () => {
    const lumiQuoteSummary = {
      quoteSummary: {
        result: [
          {
            price: {
              regularMarketPrice: { raw: 6979.0 },
              currency: 'ILA',
            },
            financialData: {
              financialCurrency: 'ILS',
            },
            defaultKeyStatistics: {
              forwardPE: { raw: 900.93 },
              forwardEps: { raw: 5.41 },
              lastDividendValue: { raw: 1.020377 },
              lastDividendDate: { raw: 1764028800 },
            },
            calendarEvents: {
              exDividendDate: { raw: 1773273600 },
            },
          },
        ],
      },
    };
    const histData = { chart: { result: [{ meta: { regularMarketPrice: 6979.0, currency: 'ILA' }, indicators: { quote: [{close: [6979]}] }, timestamp: [Date.now()/1000] }] } };

    (fetch as any).mockResolvedValueOnce(createFetchResponse(histData));
    (fetch as any).mockResolvedValueOnce(createFetchResponse(lumiQuoteSummary));

    const data = await fetchYahooTickerData('LUMI', Exchange.TASE);

    expect(data?.advancedStats?.forwardPE).toBeCloseTo(12.9, 1);
    expect(data?.calendarEvents?.dividendAmount).toBe(1.020377);
    expect(data?.calendarEvents?.dividendCurrency).toBe('ILS');
  });

  it('should correctly calculate forwardPE and handle dividends for NWMD.TA', async () => {
    const nwmdQuoteSummary = {
      quoteSummary: {
        result: [
          {
            price: {
              regularMarketPrice: { raw: 1799.0 },
              currency: 'ILA',
            },
            financialData: {
              financialCurrency: 'USD',
            },
            defaultKeyStatistics: {
              forwardPE: { raw: 1067.3391 },
              forwardEps: { raw: 1.72 },
              lastDividendValue: { raw: 0.05963 },
              lastDividendDate: { raw: 1774310400 },
            },
            calendarEvents: {
              exDividendDate: { raw: 1774310400 },
            },
          },
        ],
      },
    };
    const histData = { chart: { result: [{ meta: { regularMarketPrice: 1799.0, currency: 'ILA' }, indicators: { quote: [{close: [1799]}] }, timestamp: [Date.now()/1000] }] } };

    (fetch as any).mockResolvedValueOnce(createFetchResponse(histData));
    (fetch as any).mockResolvedValueOnce(createFetchResponse(nwmdQuoteSummary));

    const data = await fetchYahooTickerData('NWMD', Exchange.TASE);

    expect(data?.advancedStats?.forwardPE).toBeCloseTo(2.83, 2);
    expect(data?.calendarEvents?.dividendAmount).toBe(0.05963);
    expect(data?.calendarEvents?.dividendCurrency).toBe('USD');
  });
});
