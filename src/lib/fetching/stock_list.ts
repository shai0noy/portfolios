// src/lib/fetching/stock_list.ts
import { fetchXml, parseXmlString, extractDataFromXmlNS } from './utils/xml_parser';
import { withTaseCache } from './utils/cache';
import type { TaseTicker, TaseTypeConfig } from './types';

const TASE_API_NAMESPACE = 'http://financial.globes.co.il/';
const XSI_NAMESPACE = 'http://www.w3.org/2001/XMLSchema-instance';

export const DEFAULT_TASE_TYPE_CONFIG: TaseTypeConfig = {
  stock: { enabled: true, displayName: 'Stocks' },
  etf: { enabled: true, displayName: 'ETFs' },
  index: { enabled: false, displayName: 'Indices' },
  makam: { enabled: false, displayName: 'Makam' },
  gov_generic: { enabled: false, displayName: 'Gov Bonds' },
  bond_conversion: { enabled: false, displayName: 'Convertible Bonds' },
  bond_ta: { enabled: false, displayName: 'Corporate Bonds' },
  fund: { enabled: false, displayName: 'Funds' },
  option_ta: { enabled: false, displayName: 'Options TA' },
  option_maof: { enabled: false, displayName: 'Options Maof' },
  option_other: { enabled: false, displayName: 'Other Derivatives' },
};

async function fetchTaseTickersByType(type: string, signal?: AbortSignal): Promise<TaseTicker[]> {
  const cacheKey = `tase:tickers:${type}`;
  return withTaseCache(cacheKey, async () => {
    const globesApiUrl = `https://portfolios.noy-shai.workers.dev/?apiId=globes_list&exchange=tase&type=${type}`;
    const xmlString = await fetchXml(globesApiUrl, signal);
    const xmlDoc = parseXmlString(xmlString);
    return extractDataFromXmlNS(xmlDoc, TASE_API_NAMESPACE, 'anyType', (element) => {
      if (element.getAttributeNS(XSI_NAMESPACE, 'type') !== 'Instrument') {
        return null;
      }
      const symbolElement = element.getElementsByTagNameNS(TASE_API_NAMESPACE, 'symbol')[0];
      const nameHeElement = element.getElementsByTagNameNS(TASE_API_NAMESPACE, 'name_he')[0];
      const nameEnElement = element.getElementsByTagNameNS(TASE_API_NAMESPACE, 'name_en')[0];
      const instrumentIdElement = element.getElementsByTagNameNS(TASE_API_NAMESPACE, 'instrumentId')[0];

      if (!symbolElement || !nameHeElement || !nameEnElement || !instrumentIdElement) {
        console.warn('Missing expected elements in TASE ticker XML for type:', type, element);
        return null;
      }
      return {
        symbol: symbolElement.textContent || '',
        name_he: nameHeElement.textContent || '',
        name_en: nameEnElement.textContent || '',
        instrumentId: instrumentIdElement.textContent || '',
        type: type,
      };
    });
  });
}

export async function fetchAllTaseTickers(
  signal?: AbortSignal,
  config: TaseTypeConfig = DEFAULT_TASE_TYPE_CONFIG
): Promise<Record<string, TaseTicker[]>> {
  const allTickersByType: Record<string, TaseTicker[]> = {};
  const instrumentTypes = Object.keys(config);

  const fetchPromises = instrumentTypes.map(async (type) => {
    const typeConfig = config[type];
    if (typeConfig && typeConfig.enabled) {
      try {
        console.log(`Fetching TASE tickers for type: ${type}`);
        const tickers = await fetchTaseTickersByType(type, signal);
        allTickersByType[type] = tickers;
      } catch (e) {
        console.warn(`Failed to fetch tickers for type ${type}:`, e);
        allTickersByType[type] = [];
      }
    }
  });

  await Promise.all(fetchPromises);
  return allTickersByType;
}
