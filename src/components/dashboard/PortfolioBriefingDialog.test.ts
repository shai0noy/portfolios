import { describe, it, expect } from 'vitest';
import { generateBriefingText } from './PortfolioBriefingDialog';

describe('generateBriefingText', () => {
  const t = (e: string, _h: string) => e; // Simple mock for testing English paths

  it('handles flat portfolio', () => {
    const text = generateBriefingText(
      '1D',
      { totalGain: 10, totalPct: 0.001, totalPct1M: 0.02, allMovers: [] },
      { spx: 0.01, ndx: 0.01, tlv: 0.01 },
      'USD',
      t
    );
    console.log("ACTUAL TEXT::::", text); expect(text).toContain('your portfolio saw a small change');
  });

  it('handles major gain', () => {
    const text = generateBriefingText(
      '1D',
      { totalGain: 5000, totalPct: 0.05, totalPct1M: 0.1, allMovers: [] },
      { spx: 0.01, ndx: 0.01, tlv: 0.01 },
      'USD',
      t
    );
    console.log("ACTUAL TEXT::::", text); expect(text).toContain('experienced a sharp jump');
  });

  it('handles notable loss', () => {
    const text = generateBriefingText(
      '1W',
      { totalGain: -2000, totalPct: -0.02, totalPct1M: -0.05, allMovers: [] },
      { spx: -0.03, ndx: -0.03, tlv: -0.01 },
      'USD',
      t
    );
    console.log("ACTUAL TEXT::::", text); expect(text).toContain('suffered a notable drop');
    console.log("ACTUAL TEXT::::", text); expect(text).toContain('mirrors a major selloff');
  });

  it('handles gain against red US market', () => {
    const text = generateBriefingText(
      '1D',
      { totalGain: 1000, totalPct: 0.01, totalPct1M: 0.02, allMovers: [] },
      { spx: -0.01, ndx: -0.01, tlv: 0.005 },
      'USD',
      t
    );
    console.log("ACTUAL TEXT::::", text); expect(text).toContain('gained value despite a red US market');
  });


  it('handles increase following Israel, despite US drop', () => {
    const text = generateBriefingText(
      '1D',
      { totalGain: 1000, totalPct: 0.02, totalPct1M: 0.02, allMovers: [] },
      { spx: -0.02, ndx: -0.02, tlv: 0.02 },
      'USD',
      t
    );
    console.log("ACTUAL TEXT::::", text); expect(text).toContain('following Israeli market trends, despite sharp drops in the US markets');
  });
});

describe('getNotableMoversSentence', () => {
  const t = (e: string, _h: string) => e;

  it('handles notable outperformers when portfolio rises', () => {
    const text = generateBriefingText(
      '1D',
      { totalGain: 1000, totalPct: 0.01, totalPct1M: 0.02, allMovers: [{ name: 'AAPL', pct: 0.03, gain: 100 }, { name: 'MSFT', pct: 0.005, gain: 10 }] },
      { spx: 0.01 },
      'USD',
      t
    );
    console.log("ACTUAL TEXT::::", text); expect(text).toContain('AAPL');
  });

  it('handles bright spots when portfolio drops', () => {
    const text = generateBriefingText(
      '1D',
      { totalGain: -1000, totalPct: -0.01, totalPct1M: 0.02, allMovers: [{ name: 'TSLA', pct: 0.05, gain: 100 }, { name: 'MSFT', pct: -0.02, gain: -10 }] },
      { spx: -0.01 },
      'USD',
      t
    );
    console.log("ACTUAL TEXT::::", text); expect(text).toContain('TSLA');
  });
});
