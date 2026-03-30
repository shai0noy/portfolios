import { describe, it, expect } from 'vitest';
import { generateBriefingText } from './PortfolioBriefingDialog';

describe('generateBriefingText', () => {
  const t = (e: string, _h: string) => e; // Simple mock for testing English paths

  it('handles flat portfolio', () => {
    const text = generateBriefingText(
      '1D',
      { totalGain: 10, totalPct: 0.001, totalPct1M: 0.02, totalPct1Y: 0.1, totalDivs: 0, allMovers: [] },
      { spx: 0.01, ndx: 0.01, tlv: 0.01 },
      'USD',
      t
    );
    expect(text).toContain('your portfolio saw a small change');
  });

  it('handles major gain', () => {
    const text = generateBriefingText(
      '1D',
      { totalGain: 5000, totalPct: 0.05, totalPct1M: 0.1, totalPct1Y: 0.1, totalDivs: 0, allMovers: [] },
      { spx: 0.01, ndx: 0.01, tlv: 0.01 },
      'USD',
      t
    );
    expect(text).toContain('experienced a sharp jump');
  });

  it('handles notable loss', () => {
    const text = generateBriefingText(
      '1W',
      { totalGain: -2000, totalPct: -0.02, totalPct1M: -0.05, totalPct1Y: 0.1, totalDivs: 0, allMovers: [] },
      { spx: -0.03, ndx: -0.03, tlv: -0.01 },
      'USD',
      t
    );
    expect(text).toContain('suffered a notable drop');
    expect(text).toContain('mirrors heavy losses in the US');
  });

  it('handles gain against red US market', () => {
    const text = generateBriefingText(
      '1D',
      { totalGain: 1000, totalPct: 0.01, totalPct1M: 0.02, totalPct1Y: 0.1, totalDivs: 0, allMovers: [] },
      { spx: -0.01, ndx: -0.01, tlv: 0.005 },
      'USD',
      t
    );
    expect(text).toContain('Bucking a mixed trend, this aligns with a solid Israeli market');
  });

  it('handles increase following Israel, despite US drop', () => {
    const text = generateBriefingText(
      '1D',
      { totalGain: 1000, totalPct: 0.02, totalPct1M: 0.02, totalPct1Y: 0.1, totalDivs: 0, allMovers: [] },
      { spx: -0.02, ndx: -0.02, tlv: 0.02 },
      'USD',
      t
    );
    expect(text).toContain('Bucking a mixed trend, this aligns with strong surges in the Israeli market');
  });

  it('handles dividends received', () => {
    const text = generateBriefingText(
      '1M',
      { totalGain: 1000, totalPct: 0.01, totalPct1M: 0.02, totalPct1Y: 0.1, totalDivs: 500, allMovers: [] },
      { spx: 0.01 },
      'USD',
      t
    );
    expect(text).toMatch(/the portfolio earned.*500 in dividends/);
  });

  it('triggers tzniha (plunge) for 1D drop > 5%', () => {
    const t_he = (_e: string, h: string) => h;
    const text = generateBriefingText(
      '1D',
      { totalGain: -6000, totalPct: -0.06, totalPct1M: -0.1, totalPct1Y: 0.1, totalDivs: 0, allMovers: [] },
      { spx: -0.01 },
      'USD',
      t_he
    );
    expect(text).toContain('צניחה');
  });

  it('does NOT trigger tzniha for 1Y drop < 40%', () => {
    const t_he = (_e: string, h: string) => h;
    const text = generateBriefingText(
      '1Y',
      { totalGain: -10000, totalPct: -0.15, totalPct1M: -0.15, totalPct1Y: 0.1, totalDivs: 0, allMovers: [] },
      { spx: -0.05 },
      'USD',
      t_he
    );
    expect(text).not.toContain('צניחה');
    expect(text).toContain('ירידה');
  });

  it('handles notable movers in Hebrew', () => {
    const t_he = (_e: string, h: string) => h;
    const text = generateBriefingText(
      '1D',
      { totalGain: -1000, totalPct: -0.01, totalPct1M: 0.02, totalPct1Y: 0.1, totalDivs: 0, allMovers: [{ name: 'TSLA', pct: 0.05, gain: 100 }, { name: 'MSFT', pct: -0.02, gain: -10 }] },
      { spx: -0.01 },
      'USD',
      t_he
    );
    expect(text).toContain('TSLA');
  });

  it('handles consolidated activity sentence', () => {
    const text = generateBriefingText(
      '1M',
      { totalGain: 1000, totalPct: 0.01, totalPct1M: 0.02, totalPct1Y: 0.1, totalDivs: 500, totalFlow: 2000, totalVests: 1500, allMovers: [] },
      { spx: 0.01 },
      'USD',
      t
    );
    expect(text).toMatch(/This month the portfolio earned .*500 in dividends, and equity grants worth about .*1,500.*vested\./);
    expect(text).toMatch(/Additionally, you deposited .*2,000 into the portfolio\./);
  });
});
