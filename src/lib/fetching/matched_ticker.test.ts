
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTickerData } from './index';
import { fetchAllTickers } from './stock_list';
import { Exchange } from '../types';
import type { TickerProfile } from '../types/ticker';
import { InstrumentClassification, InstrumentType } from '../types/instrument';

// Mock dependencies
vi.mock('./stock_list', () => ({
  fetchAllTickers: vi.fn(),
  getCbsTickers: () => []
}));
vi.mock('./globes');
vi.mock('./yahoo', () => ({
  fetchYahooTickerData: vi.fn().mockResolvedValue(null)
}));
vi.mock('./cbs', () => ({
  fetchCpi: vi.fn(),
  getCbsTickers: () => []
}));

describe('getTickerData matching', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('matches numeric string ticker to securityId even if secId param is null', async () => {
    // Setup mock dataset
    const mockProfile: TickerProfile = {
      symbol: '12345',
      name: 'Test Fund',
      exchange: Exchange.TASE,
      securityId: 12345,
      type: new InstrumentClassification(InstrumentType.MUTUAL_FUND, 'Fund'),
      meta: { type: 'TASE', securityId: 12345 }
    };

    // Mock fetchAllTickers to return this profile
    (fetchAllTickers as any).mockResolvedValue({
      'Fund': [mockProfile]
    });

    // Test with ticker "012345" which implies number 12345
    // getTickerData(ticker, exchange, numericSecurityId, ...)
    const data = await getTickerData('012345', Exchange.TASE, null, undefined, true); // Force refresh to bypass cache

    expect(data).not.toBeNull();
    expect(data?.numericId).toBe(12345);
    expect(data?.name).toBe('Test Fund');
  });
});
