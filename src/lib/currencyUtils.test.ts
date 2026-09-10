import { describe, it, expect } from 'vitest';
import {
  resolveTickerPriceCurrency,
  isAgorotQuote,
  extractInstrumentGroup,
} from './currencyUtils';
import { Currency, Exchange } from './types';
import { InstrumentClassification, InstrumentGroup, InstrumentType } from './types/instrument';

describe('extractInstrumentGroup', () => {
  it('extracts group from InstrumentClassification instance', () => {
    const stockClass = new InstrumentClassification(InstrumentType.STOCK);
    expect(extractInstrumentGroup(stockClass)).toBe(InstrumentGroup.STOCK);

    const etfClass = new InstrumentClassification('etf');
    expect(extractInstrumentGroup(etfClass)).toBe(InstrumentGroup.ETF);

    const makamClass = new InstrumentClassification('makam');
    expect(extractInstrumentGroup(makamClass)).toBe(InstrumentGroup.BOND);

    const indexClass = new InstrumentClassification('index');
    expect(extractInstrumentGroup(indexClass)).toBe(InstrumentGroup.INDEX);

    const optionClass = new InstrumentClassification('option_maof');
    expect(extractInstrumentGroup(optionClass)).toBe(InstrumentGroup.DERIVATIVE);

    const currClass = new InstrumentClassification('currency');
    expect(extractInstrumentGroup(currClass)).toBe(InstrumentGroup.FOREX);
  });

  it('extracts group from plain object', () => {
    expect(extractInstrumentGroup({ group: 'STOCK' })).toBe(InstrumentGroup.STOCK);
    expect(extractInstrumentGroup({ type: InstrumentType.BOND_GOV })).toBe(InstrumentGroup.BOND);
  });

  it('extracts group from string names and Globes keys', () => {
    expect(extractInstrumentGroup('STOCK')).toBe(InstrumentGroup.STOCK);
    expect(extractInstrumentGroup('BOND')).toBe(InstrumentGroup.BOND);
    expect(extractInstrumentGroup('fund')).toBe(InstrumentGroup.MUTUAL_FUND);
    expect(extractInstrumentGroup('monetary_fund')).toBe(InstrumentGroup.MONETARY_FUND);
    expect(extractInstrumentGroup('currency')).toBe(InstrumentGroup.FOREX);
    expect(extractInstrumentGroup('option_ta')).toBe(InstrumentGroup.DERIVATIVE);
  });

  it('returns undefined for empty/unknown types', () => {
    expect(extractInstrumentGroup(undefined)).toBeUndefined();
    expect(extractInstrumentGroup('non_existent_type')).toBeUndefined();
  });
});

describe('resolveTickerPriceCurrency', () => {
  describe('TASE securities', () => {
    it('defaults standard TASE stock to Currency.ILA when reported as ILS or missing', () => {
      // Yahoo typically returns 'ILS' for TASE stock prices that are actually in Agorot
      expect(resolveTickerPriceCurrency({
        exchange: Exchange.TASE,
        ticker: '1159250',
        reportedCurrency: 'ILS',
        type: InstrumentGroup.STOCK,
      })).toBe(Currency.ILA);

      // Undefined reportedCurrency
      expect(resolveTickerPriceCurrency({
        exchange: Exchange.TASE,
        ticker: 'LUMI',
        type: InstrumentGroup.STOCK,
      })).toBe(Currency.ILA);

      // Stock with no type specified defaults to ILA on TASE
      expect(resolveTickerPriceCurrency({
        exchange: Exchange.TASE,
        ticker: '1159250',
      })).toBe(Currency.ILA);
    });

    it('returns Currency.ILA when explicitly reported as ILA', () => {
      expect(resolveTickerPriceCurrency({
        exchange: Exchange.TASE,
        ticker: '1159250',
        reportedCurrency: Currency.ILA,
      })).toBe(Currency.ILA);
    });

    it('resolves TASE Bonds, ETFs, and Mutual Funds to Currency.ILA', () => {
      expect(resolveTickerPriceCurrency({
        exchange: Exchange.TASE,
        ticker: 'MAKAM_01',
        reportedCurrency: 'ILS',
        type: InstrumentGroup.BOND,
      })).toBe(Currency.ILA);

      expect(resolveTickerPriceCurrency({
        exchange: Exchange.TASE,
        ticker: 'ETF_TASE',
        reportedCurrency: 'ILS',
        type: InstrumentGroup.ETF,
      })).toBe(Currency.ILA);

      expect(resolveTickerPriceCurrency({
        exchange: Exchange.TASE,
        ticker: 'FUND_01',
        reportedCurrency: 'ILS',
        type: InstrumentGroup.MUTUAL_FUND,
      })).toBe(Currency.ILA);

      expect(resolveTickerPriceCurrency({
        exchange: Exchange.TASE,
        ticker: 'KASPIT_01',
        reportedCurrency: 'ILS',
        type: InstrumentGroup.MONETARY_FUND,
      })).toBe(Currency.ILA);
    });

    it('respects foreign currency for USD-denominated assets on TASE', () => {
      // TASE USD-denominated bond or ETF
      expect(resolveTickerPriceCurrency({
        exchange: Exchange.TASE,
        ticker: 'BOND_USD',
        reportedCurrency: 'USD',
        type: InstrumentGroup.BOND,
      })).toBe(Currency.USD);

      // Dual-listed or foreign stock on TASE reported in USD
      expect(resolveTickerPriceCurrency({
        exchange: Exchange.TASE,
        ticker: 'US_STOCK',
        reportedCurrency: 'USD',
      })).toBe(Currency.USD);

      // Foreign stock on TASE reported in EUR
      expect(resolveTickerPriceCurrency({
        exchange: Exchange.TASE,
        ticker: 'EUR_STOCK',
        reportedCurrency: 'EUR',
      })).toBe(Currency.EUR);

      // Asset held in USD where reported currency was omitted
      expect(resolveTickerPriceCurrency({
        exchange: Exchange.TASE,
        ticker: 'BOND_USD',
        stockCurrency: Currency.USD,
      })).toBe(Currency.USD);
    });

    it('resolves TASE indices, forex, and derivatives to Currency.ILS (not ILA)', () => {
      // Index (e.g. TA-35, TA-125) quotes in points/ILS, not Agorot
      expect(resolveTickerPriceCurrency({
        exchange: Exchange.TASE,
        ticker: 'TA35',
        reportedCurrency: 'ILS',
        type: new InstrumentClassification('index'),
      })).toBe(Currency.ILS);

      expect(resolveTickerPriceCurrency({
        exchange: Exchange.TASE,
        ticker: 'TA125',
        type: InstrumentGroup.INDEX,
      })).toBe(Currency.ILS);

      // Forex / Currency quotes in Shekels (ILS)
      expect(resolveTickerPriceCurrency({
        exchange: Exchange.TASE,
        ticker: 'USD/ILS',
        reportedCurrency: 'ILS',
        type: new InstrumentClassification('currency'),
      })).toBe(Currency.ILS);

      // Derivatives / Options quote in Shekels (ILS)
      expect(resolveTickerPriceCurrency({
        exchange: Exchange.TASE,
        ticker: 'OPT_TASE',
        reportedCurrency: 'ILS',
        type: new InstrumentClassification('option_maof'),
      })).toBe(Currency.ILS);

      expect(resolveTickerPriceCurrency({
        exchange: Exchange.TASE,
        ticker: 'OPT_GENERIC',
        type: InstrumentGroup.DERIVATIVE,
      })).toBe(Currency.ILS);
    });

    it('infers TASE from .TA ticker suffix if exchange is not explicitly passed', () => {
      expect(resolveTickerPriceCurrency({
        ticker: 'TEVA.TA',
        reportedCurrency: 'ILS',
        type: InstrumentGroup.STOCK,
      })).toBe(Currency.ILA);
    });
  });

  describe('Non-TASE exchanges', () => {
    it('resolves US exchanges (NASDAQ, NYSE) to USD', () => {
      expect(resolveTickerPriceCurrency({
        exchange: Exchange.NASDAQ,
        ticker: 'AAPL',
        reportedCurrency: 'USD',
      })).toBe(Currency.USD);

      expect(resolveTickerPriceCurrency({
        exchange: Exchange.NASDAQ,
        ticker: 'MSFT',
      })).toBe(Currency.USD);

      expect(resolveTickerPriceCurrency({
        exchange: Exchange.NYSE,
        ticker: 'BRK.A',
      })).toBe(Currency.USD);
    });

    it('resolves LSE to GBP', () => {
      expect(resolveTickerPriceCurrency({
        exchange: Exchange.LSE,
        ticker: 'SHEL',
      })).toBe(Currency.GBP);

      expect(resolveTickerPriceCurrency({
        exchange: Exchange.LSE,
        ticker: 'SHEL',
        reportedCurrency: 'GBP',
      })).toBe(Currency.GBP);
    });

    it('resolves FWB to EUR', () => {
      expect(resolveTickerPriceCurrency({
        exchange: Exchange.FWB,
        ticker: 'SAP',
      })).toBe(Currency.EUR);
    });

    it('resolves SWX to CHF', () => {
      expect(resolveTickerPriceCurrency({
        exchange: Exchange.SWX,
        ticker: 'NESN',
      })).toBe(Currency.CHF);
    });
  });
});

describe('isAgorotQuote', () => {
  it('returns true for standard TASE stocks, bonds, and ETFs', () => {
    expect(isAgorotQuote({ exchange: Exchange.TASE, ticker: '1159250' })).toBe(true);
    expect(isAgorotQuote({ exchange: Exchange.TASE, ticker: '1159250', reportedCurrency: 'ILS' })).toBe(true);
    expect(isAgorotQuote({ exchange: Exchange.TASE, ticker: '1159250', type: InstrumentGroup.STOCK })).toBe(true);
    expect(isAgorotQuote({ exchange: Exchange.TASE, ticker: 'BOND_TA', type: InstrumentGroup.BOND })).toBe(true);
    expect(isAgorotQuote({ exchange: Exchange.TASE, ticker: 'ETF_TA', type: InstrumentGroup.ETF })).toBe(true);
  });

  it('returns false for foreign-currency TASE assets', () => {
    expect(isAgorotQuote({ exchange: Exchange.TASE, ticker: 'USD_BOND', reportedCurrency: 'USD' })).toBe(false);
    expect(isAgorotQuote({ exchange: Exchange.TASE, ticker: 'USD_BOND', stockCurrency: Currency.USD })).toBe(false);
  });

  it('returns false for TASE indices, forex, and options', () => {
    expect(isAgorotQuote({ exchange: Exchange.TASE, ticker: 'TA35', type: InstrumentGroup.INDEX })).toBe(false);
    expect(isAgorotQuote({ exchange: Exchange.TASE, ticker: 'USD/ILS', type: InstrumentGroup.FOREX })).toBe(false);
    expect(isAgorotQuote({ exchange: Exchange.TASE, ticker: 'OPT', type: InstrumentGroup.DERIVATIVE })).toBe(false);
  });

  it('returns false for non-TASE tickers', () => {
    expect(isAgorotQuote({ exchange: Exchange.NASDAQ, ticker: 'AAPL' })).toBe(false);
    expect(isAgorotQuote({ exchange: Exchange.LSE, ticker: 'SHEL' })).toBe(false);
  });
});
