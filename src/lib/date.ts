export function toGoogleSheetDateFormat(date: Date): string {
  if (!date) return '';
  if (isNaN(date.getTime())) return '';

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  // User preferred format: dd-mm-yyyy
  return `${day}-${month}-${year}`;
}

export function fromGoogleSheetDate(value: string | number | null | undefined): Date | null {
  if (value === undefined || value === null || value === '') return null;

  if (typeof value === 'number') {
    // Google Sheets serial date (usually < 100,000 for current dates)
    if (value < 100000) {
      return new Date(Math.round((value - 25569) * 86400 * 1000));
    }
    // Otherwise assume it's a millisecond timestamp
    return new Date(value);
  }

  return coerceDate(String(value));
}

export function formatDate(dateInput: string | Date | number | null | undefined): string {
  if (!dateInput) return '';
  const date = (dateInput instanceof Date) ? dateInput : coerceDate(dateInput);
  if (!date || isNaN(date.getTime())) return String(dateInput || '');

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
}

export function coerceDate(d: any): Date | null {
  if (d === undefined || d === null || d === '') return null;

  if (d instanceof Date) return isNaN(d.getTime()) ? null : d;

  if (typeof d === 'number') {
    return fromGoogleSheetDate(d);
  }

  const str = String(d).trim();
  if (!str) return null;

  // Handle DD/MM/YYYY or DD-MM-YYYY or MM/DD/YYYY (ambiguous)
  // We prioritize DD/MM/YYYY as it is the app's standard
  if (str.includes('/') || str.includes('-')) {
    const parts = str.split(/[\/\-]/);
    if (parts.length === 3) {
      const p0 = parts[0];
      const p1 = parts[1];
      const p2 = parts[2];

      // ISO Format: YYYY-MM-DD
      if (p0.length === 4) {
        const y = parseInt(p0, 10);
        const m = parseInt(p1, 10);
        const dayVal = parseInt(p2, 10);
        if (!isNaN(y) && !isNaN(m) && !isNaN(dayVal)) return new Date(y, m - 1, dayVal);
      }

      // Standard Format: DD-MM-YYYY or MM-DD-YYYY
      if (p2.length === 4) {
        const d_or_m = parseInt(p0, 10);
        const m_or_d = parseInt(p1, 10);
        const y = parseInt(p2, 10);

        if (!isNaN(d_or_m) && !isNaN(m_or_d) && !isNaN(y)) {
          // If d_or_m > 12, it MUST be the day.
          if (d_or_m > 12) {
            return new Date(y, m_or_d - 1, d_or_m);
          }
          // Otherwise, assume DD-MM-YYYY as per user preference, 
          // but this is where the mm/dd/yyyy ambiguity lives.
          return new Date(y, m_or_d - 1, d_or_m);
        }
      }
    }
  }

  const date = new Date(d);
  return isNaN(date.getTime()) ? null : date;
}
