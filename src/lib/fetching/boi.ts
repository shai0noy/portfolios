// src/lib/fetching/boi.ts
import { CACHE_TTL, fetchWithCache } from './utils/cache';
import { WORKER_URL } from '../../config';
import { Exchange } from '../types';
import { InstrumentClassification, InstrumentType } from '../types/instrument';
import type { TickerProfile } from '../types/ticker';
import type { TickerData } from './types';
import { calculateTickerDataFromIndexHistory, type FundData, type FundDataPoint } from './gemel_utils';

const BOI_SERIES: Record<string, { nameHe: string; nameEn: string }> = {
  "MNT_RIB_BOI_D.D.RIB_BOI": { nameHe: "ריבית בנק ישראל", nameEn: "Bank of Israel Interest Rate" }
};

export function getBoiTickers(): TickerProfile[] {
  return Object.entries(BOI_SERIES).map(([id, info]) => ({
    symbol: id,
    exchange: Exchange.BOI,
    name: info.nameEn,
    nameHe: info.nameHe,
    type: new InstrumentClassification(InstrumentType.INDEX, undefined, { en: 'Interest Rate', he: 'ריבית בנק ישראל' })
  }));
}

export async function fetchBoiData(
  series: string,
  signal?: AbortSignal,
  forceRefresh = false
): Promise<TickerData | null> {
  const cacheKey = `boi:${series}:full_v1`;

  return fetchWithCache(
    cacheKey,
    CACHE_TTL,
    forceRefresh,
    async () => {
      const url = `${WORKER_URL}/?apiId=boi_statistics&series=${series}`;
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`BOI API fetch failed with status ${res.status}`);

      const csvText = await res.text();
      const lines = csvText.split('\n').filter(l => l.trim().length > 0);
      if (lines.length < 2) return null;

      const header = lines[0].split(',');
      const timeIdx = header.indexOf('TIME_PERIOD');
      const valIdx = header.indexOf('OBS_VALUE');

      if (timeIdx === -1 || valIdx === -1) {
        throw new Error("Missing required columns in BOI CSV");
      }

      const dataPoints: FundDataPoint[] = lines.slice(1).map(line => {
        const parts = line.split(',');
        const dateStr = parts[timeIdx];
        const valStr = parts[valIdx];

        return {
          date: new Date(dateStr).getTime(),
          nominalReturn: parseFloat(valStr)
        };
      }).filter(p => !isNaN(p.date) && !isNaN(p.nominalReturn));

      // Sort chronologically
      dataPoints.sort((a, b) => a.date - b.date);

      if (dataPoints.length === 0) return null;

      const fundData: FundData = {
        fundId: series,
        fundName: BOI_SERIES[series]?.nameHe || series,
        data: dataPoints,
        lastUpdated: Date.now()
      };

      return calculateTickerDataFromIndexHistory(fundData, Exchange.BOI, 'BOI');
    }
  );
}
