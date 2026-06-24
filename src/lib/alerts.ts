import type { TickerAlert } from './types';
import type { TickerData } from './fetching';

export function evaluateAlert(alert: TickerAlert, liveData: TickerData): boolean {
  const curPrice = liveData.price;
  let triggered = false;

  if (alert.type === 'price_above' && alert.targetPrice !== undefined) {
    triggered = curPrice >= alert.targetPrice;
  } else if (alert.type === 'price_below' && alert.targetPrice !== undefined) {
    triggered = curPrice <= alert.targetPrice;
  } else if (alert.type === 'price_moved_percent' && alert.percentChange !== undefined && alert.daysWindow !== undefined) {
    const hist = liveData.historical;
    if (hist && hist.length > 0) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - alert.daysWindow);

      let priceNDaysAgo: number | undefined;
      let minTimeDiff = Infinity;
      for (const p of hist) {
        // Handle dates properly whether they are strings from cache or Date objects
        const pDate = new Date(p.date);
        const diff = Math.abs(pDate.getTime() - targetDate.getTime());
        if (diff < minTimeDiff) {
          minTimeDiff = diff;
          priceNDaysAgo = p.price;
        }
      }

      if (priceNDaysAgo && priceNDaysAgo > 0) {
        const changePctVal = ((curPrice - priceNDaysAgo) / priceNDaysAgo) * 100;
        if (alert.direction === 'up') {
          triggered = changePctVal >= alert.percentChange;
        } else if (alert.direction === 'down') {
          triggered = changePctVal <= -alert.percentChange;
        } else {
          triggered = Math.abs(changePctVal) >= alert.percentChange;
        }
      }
    } else {
      // Fallback if no history is available
      const changeVal = alert.daysWindow <= 1 ? liveData.changePct1d :
                        alert.daysWindow <= 7 ? liveData.changePctRecent :
                        liveData.changePct1m;
      const pct = (changeVal || 0) * 100;
      if (alert.direction === 'up') triggered = pct >= alert.percentChange;
      else if (alert.direction === 'down') triggered = pct <= -alert.percentChange;
      else triggered = Math.abs(pct) >= alert.percentChange;
    }
  }
  return triggered;
}
