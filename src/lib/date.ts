export function toGoogleSheetDateFormat(date: Date ): string {
  if (!date) return '';
  if (isNaN(date.getTime())) return '';
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  return `${month}/${day}/${year}`;
}

export function fromGoogleSheetDate(value: string | number): string {
    if (!value) return '';
    if (typeof value === 'number') {
        const date = new Date(Math.round((value - 25569) * 86400 * 1000));
        return toGoogleSheetDateFormat(date);
    }
    return String(value);
}
