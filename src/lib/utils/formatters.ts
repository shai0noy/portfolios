const LTR_MARK = '\u200E';

export function formatYears(n: number | undefined | null, t: (en: string, he: string) => string): string {
  if (n === undefined || n === null || isNaN(n)) return '-';
  const options: Intl.NumberFormatOptions = {
    useGrouping: true,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  };
  return LTR_MARK + n.toLocaleString('en-US', options) + t('y', "ש'");
}
