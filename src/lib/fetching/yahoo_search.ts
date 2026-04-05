import { Exchange, parseExchange } from '../types';
import { InstrumentClassification, InstrumentType } from '../types/instrument';
import type { TickerProfile } from '../types/ticker';
import { WORKER_URL } from '../../config';
import { deduplicateRequest } from './utils/request_deduplicator';

export async function searchYahooTickers(term: string, signal?: AbortSignal): Promise<TickerProfile[]> {
  const reqKey = `searchYahooTickers:${term}`;
  return deduplicateRequest(reqKey, async () => {
    try {
      const url = `${WORKER_URL}/?apiId=yahoo_search&searchTerm=${encodeURIComponent(term)}`;
      const response = await fetch(url, { signal });
      if (!response.ok) return [];

      const data = await response.json();
      if (!data || !data.quotes || !Array.isArray(data.quotes)) return [];

      const typeMap: Record<string, InstrumentType> = {
        'EQUITY': InstrumentType.STOCK,
        'ETF': InstrumentType.ETF,
        'MUTUALFUND': InstrumentType.MUTUAL_FUND,
        'INDEX': InstrumentType.INDEX,
        'CURRENCY': InstrumentType.CURRENCY,
        'CRYPTOCURRENCY': InstrumentType.CRYPTO,
        'FUTURE': InstrumentType.FUTURE,
      };

      return data.quotes
        .map((q: any) => {
          let type: InstrumentType = typeMap[q.quoteType];
          if (!type) return null;
          let exchange: Exchange;
          try {
            exchange = parseExchange(q.exchange);
          } catch (error) {
            return null;
          }
          let symbol = q.symbol.split('.')[0].replace('-', '.');
          if (type === InstrumentType.INDEX && symbol.startsWith('^')) {
            symbol = symbol.substring(1);
          }
          return {
            // NWMD.TA -> NWMD ; MTF-F30 -> MTF.F30
            symbol,
            exchange: exchange,
            name: q.longname || q.shortname || q.symbol,
            type: new InstrumentClassification(type),
            sector: q.sector || q.quoteType,
          } as TickerProfile;
        }).filter((q: TickerProfile) => !!q);
    } catch (error) {
      console.error('Yahoo search failed', error);
      return [];
    }
  });
}
