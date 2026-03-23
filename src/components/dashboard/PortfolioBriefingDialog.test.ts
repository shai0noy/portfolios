import { describe, it, expect } from 'vitest';
import { generateBriefingText } from './PortfolioBriefingDialog';

describe('generateBriefingText', () => {
  const t = (e: string, _h: string) => e; // Simple mock for testing English paths

  it('handles flat portfolio', () => {
    const text = generateBriefingText(
      '1D',
      { totalGain: 10, totalPct: 0.001, totalPct1M: 0.02 },
      { spx: 0.01, ndx: 0.01, tlv: 0.01 },
      'USD',
      t
    );
    expect(text).toContain('your portfolio saw a small change');
  });

  it('handles major gain', () => {
    const text = generateBriefingText(
      '1D',
      { totalGain: 5000, totalPct: 0.05, totalPct1M: 0.1 },
      { spx: 0.01, ndx: 0.01, tlv: 0.01 },
      'USD',
      t
    );
    expect(text).toContain('experienced a sharp jump');
  });

  it('handles notable loss', () => {
    const text = generateBriefingText(
      '1W',
      { totalGain: -2000, totalPct: -0.02, totalPct1M: -0.05 },
      { spx: -0.03, ndx: -0.03, tlv: -0.01 },
      'USD',
      t
    );
    expect(text).toContain('suffered a notable drop');
    expect(text).toContain('mirrors a broader selloff');
  });

  it('handles gain against red market', () => {
    const text = generateBriefingText(
      '1D',
      { totalGain: 1000, totalPct: 0.01, totalPct1M: 0.02 },
      { spx: -0.01, ndx: -0.01, tlv: -0.005 },
      'USD',
      t
    );
    expect(text).toContain('gained value despite a red US market');
  });
});
