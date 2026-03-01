export function interpolateSparseHistory<T extends { date: Date; [key: string]: any }>(
  history: T[] | undefined
): T[] | undefined {
  if (!history || history.length < 2) return history;

  const sorted = [...history].sort((a, b) => a.date.getTime() - b.date.getTime());
  const result: T[] = [];

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    result.push(current);

    const tCurrent = current.date.getTime();
    const tNext = next.date.getTime();

    // Adding 1 hour to handle possible DST jump issues to safely floor
    const daysDiff = Math.floor((tNext - tCurrent + 1000 * 60 * 60) / (1000 * 60 * 60 * 24));

    if (daysDiff > 3) {
      const keysToInterpolate = Object.keys(current).filter(
        (k) => k !== 'date' && typeof current[k] === 'number' && typeof next[k] === 'number'
      );

      for (let j = 1; j < daysDiff; j++) {
        const fraction = j / daysDiff;
        const interpTime = tCurrent + j * 24 * 60 * 60 * 1000;

        const interpolatedPoint: any = { ...current, date: new Date(interpTime) };
        keysToInterpolate.forEach((k) => {
          interpolatedPoint[k] = current[k] + (next[k] - current[k]) * fraction;
        });

        result.push(interpolatedPoint as T);
      }
    }
  }

  result.push(sorted[sorted.length - 1]);
  return result;
}
