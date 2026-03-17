export function toGoogleSheetDateFormat(date: Date): string {
  if (!date) return '';
  if (isNaN(date.getTime())) return '';

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  // User preferred format is dd/mm/yyyy for display, but for API submission 
  // via USER_ENTERED, ISO YYYY-MM-DD guarantees it gets interpreted as a date 
  // rather than a text string regardless of the Spreadsheet region locale.
  return `${year}-${month}-${day}`;
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

  // Handle parsable formats quickly: YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY
  if (str.includes('/') || str.includes('-')) {
    const parts = str.split(/[\/\-]/).map(p => parseInt(p, 10));
    if (parts.length === 3 && parts.every(p => !isNaN(p))) {
      const [n0, n1, n2] = parts;

      if (n0 > 1000) {
        // YYYY-MM-DD
        return new Date(n0, n1 - 1, n2);
      } else if (n2 > 1000) {
        // Default to DD/MM/YYYY, fallback to MM/DD/YYYY if middle part is > 12
        if (n1 > 12) {
          return new Date(n2, n0 - 1, n1);
        }
        return new Date(n2, n1 - 1, n0);
      }
    }
  }

  // Handle purely numeric strings (e.g. "45006") generated when UNFORMATTED_VALUE hits non-numeric keys
  if (/^\\d+(\\.\\d+)?$/.test(str)) {
    return fromGoogleSheetDate(Number(str));
  }

  const date = new Date(d);
  return isNaN(date.getTime()) ? null : date;
}

export function formatYYYYMMDD(d: Date | null | undefined): string {
  if (!d || isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
