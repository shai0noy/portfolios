import { useEffect, useState, useRef } from 'react';
import { getTickerData } from '../fetching';
import type { TrackingListItem, TickerAlert } from '../types';
import toast from 'react-hot-toast';

function evaluateAlert(alert: TickerAlert, liveData: any): boolean {
  const curPrice = liveData.price;
  if (!curPrice) return false;

  if (alert.type === 'price_above' && alert.targetPrice !== undefined) {
    return curPrice >= alert.targetPrice;
  }
  if (alert.type === 'price_below' && alert.targetPrice !== undefined) {
    return curPrice <= alert.targetPrice;
  }
  if (alert.type === 'price_moved_percent' && alert.percentChange !== undefined && alert.daysWindow !== undefined) {
    const changeVal = alert.daysWindow <= 1 ? liveData.changePct1d :
                      alert.daysWindow <= 7 ? liveData.changePctRecent :
                      liveData.changePct1m;
    const pct = (changeVal || 0) * 100;
    if (alert.direction === 'up') return pct >= alert.percentChange;
    if (alert.direction === 'down') return pct <= -alert.percentChange;
    return Math.abs(pct) >= alert.percentChange;
  }
  return false;
}

export function useBackgroundRefresher(trackingLists: TrackingListItem[]) {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const trackingListsRef = useRef(trackingLists);
  const queueRef = useRef<{ ticker: string, exchange: string, alerts: TickerAlert[] }[]>([]);
  const activeAlertsRef = useRef<Set<string>>(new Set());
  const seenTickersRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    trackingListsRef.current = trackingLists;
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, [trackingLists]);

  const requestPermission = async () => {
    if ('Notification' in window) {
      const p = await Notification.requestPermission();
      setPermission(p);
      if (p === 'granted') {
        toast.success('Device notifications enabled!');
      } else {
        toast.error('Device notifications denied.');
      }
    } else {
      toast.error('Notifications not supported in this browser.');
    }
  };

  useEffect(() => {
    // Collect all tickers that have alerts
    const refreshQueue = () => {
      const newQueue: { ticker: string, exchange: string, alerts: TickerAlert[] }[] = [];
      const lists = trackingListsRef.current || [];
      lists.forEach(item => {
        if (item.alerts && item.alerts.length > 0) {
          // Avoid duplicates
          if (!newQueue.find(q => q.ticker === item.ticker && q.exchange === item.exchange)) {
            newQueue.push({ ticker: item.ticker, exchange: item.exchange as string, alerts: item.alerts });
          }
        }
      });
      queueRef.current = newQueue;
    };

    refreshQueue();

    // Check interval: cycle through the queue over 60 minutes
    // E.g. if we have 60 items, interval is 1 minute
    // If we have 5 items, interval is 12 minutes
    // Cap at minimum 10 seconds to avoid spamming if there's only 1 item
    const getIntervalTime = () => {
      const itemsCount = Math.max(1, queueRef.current.length);
      const oneHourMs = 60 * 60 * 1000;
      return Math.max(10000, Math.floor(oneHourMs / itemsCount));
    };

    let intervalId: any;

    const tick = async () => {
      if (queueRef.current.length === 0) {
        refreshQueue(); // Try to replenish
        if (queueRef.current.length === 0) return;
      }

      // Pop the first item
      const item = queueRef.current.shift();
      if (!item) return;

      try {
        // Force refresh
        const newData = await getTickerData(item.ticker, item.exchange as any, null, undefined, true);
        if (newData) {
          // Check if any alert is newly triggered based on this fetch
          let newlyTriggered = false;
          let msg = '';
          const isFirstSeen = !seenTickersRef.current.has(item.ticker);
          seenTickersRef.current.add(item.ticker);

          item.alerts.forEach(alert => {
            const isCurrentlyTriggered = evaluateAlert(alert, newData);
            const wasTriggered = activeAlertsRef.current.has(alert.id);

            if (isCurrentlyTriggered) {
              activeAlertsRef.current.add(alert.id);
              if (!wasTriggered && !isFirstSeen) {
                newlyTriggered = true;
                // Only show % change to protect user privacy
                if (alert.type === 'price_moved_percent') {
                  const changeVal = alert.daysWindow !== undefined && alert.daysWindow <= 1 ? newData.changePct1d :
                                    alert.daysWindow !== undefined && alert.daysWindow <= 7 ? newData.changePctRecent :
                                    newData.changePct1m;
                  const pct = (changeVal || 0) * 100;
                  const dirStr = pct >= 0 ? 'up' : 'down';
                  const daysStr = alert.daysWindow === 1 ? 'today' : `in last ${alert.daysWindow || 30} days`;
                  
                  let todayStr = '';
                  if (alert.daysWindow !== 1 && newData.changePct1d !== undefined) {
                    const pct1d = newData.changePct1d * 100;
                    const dir1d = pct1d >= 0 ? 'up' : 'down';
                    todayStr = ` (${dir1d} ${Math.abs(pct1d).toFixed(1)}% today)`;
                  }

                  msg = `${item.ticker} ${dirStr} ${Math.abs(pct).toFixed(1)}% ${daysStr}${todayStr}`;
                } else {
                  msg = `${item.ticker} alert triggered`;
                }
              }
            } else {
              activeAlertsRef.current.delete(alert.id);
            }
          });

          // Only show when the alert triggers first, and not in the foreground
          if (newlyTriggered && document.visibilityState === 'hidden' && Notification.permission === 'granted') {
            new Notification('Portfolio Alert', { body: msg });
          }
          // Emit event so the rest of the app updates
          window.dispatchEvent(new CustomEvent('market-data-refreshed'));
        }
      } catch (e) {
        console.error('Background refresh failed for', item.ticker, e);
      }
    };

    // Note: setInterval may be throttled aggressively by mobile browsers if tab is in background,
    // often clamped to 1 execution per minute.
    intervalId = setInterval(tick, getIntervalTime());

    return () => clearInterval(intervalId);
  }, []);

  return { permission, requestPermission };
}
