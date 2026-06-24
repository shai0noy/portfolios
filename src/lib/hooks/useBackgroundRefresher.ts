import { useEffect, useState, useRef } from 'react';
import { getTickerData, appendLivePriceToHistory } from '../fetching';
import type { TrackingListItem, TickerAlert, DashboardHolding } from '../types';
import { FinanceEngine } from '../data/engine';
import { convertCurrency } from '../currencyUtils';
import { evaluateAlert } from '../alerts';
import toast from 'react-hot-toast';

export function useBackgroundRefresher(
  engine: FinanceEngine | null,
  holdings: DashboardHolding[] | undefined,
  trackingLists: TrackingListItem[], 
  watchlistAlertsEnabled: boolean,
  notableMovesAlertsEnabled: boolean,
  globalAlertPct: number,
  globalAlertValue: number
) {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const trackingListsRef = useRef(trackingLists);
  const holdingsRef = useRef(holdings);
  const engineRef = useRef(engine);
  const lastFetchedRef = useRef<Map<string, number>>(new Map());
  const activeAlertsRef = useRef<Set<string>>(new Set());
  const seenTickersRef = useRef<Set<string>>(new Set());

  // Store refs so interval closure can access latest without resetting
  const globalAlertPctRef = useRef(globalAlertPct);
  const globalAlertValueRef = useRef(globalAlertValue);
  const watchlistAlertsEnabledRef = useRef(watchlistAlertsEnabled);
  const notableMovesAlertsEnabledRef = useRef(notableMovesAlertsEnabled);

  useEffect(() => {
    trackingListsRef.current = trackingLists;
    holdingsRef.current = holdings;
    engineRef.current = engine;
    globalAlertPctRef.current = globalAlertPct;
    globalAlertValueRef.current = globalAlertValue;
    watchlistAlertsEnabledRef.current = watchlistAlertsEnabled;
    notableMovesAlertsEnabledRef.current = notableMovesAlertsEnabled;

    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, [trackingLists, holdings, engine, globalAlertPct, globalAlertValue, watchlistAlertsEnabled, notableMovesAlertsEnabled]);

  const requestPermission = async (): Promise<NotificationPermission> => {
    if ('Notification' in window) {
      const p = await Notification.requestPermission();
      setPermission(p);
      if (p === 'granted') {
        toast.success('Device notifications enabled!');
      } else {
        toast.error('Device notifications denied.');
      }
      return p;
    } else {
      toast.error('Notifications not supported in this browser.');
      return 'denied';
    }
  };

  useEffect(() => {
    let timeoutId: any;

    const tick = async () => {
      const allTickers = new Map<string, { ticker: string, exchange: string, alerts: TickerAlert[], isOwned: boolean }>();

      // 1. Add from tracking lists
      const lists = trackingListsRef.current || [];
      lists.forEach(item => {
        const key = `${item.exchange}_${item.ticker}`;
        allTickers.set(key, { ticker: item.ticker, exchange: item.exchange as string, alerts: item.alerts || [], isOwned: false });
      });

      // 2. Add from holdings
      const currentHoldings = holdingsRef.current || [];
      currentHoldings.forEach(h => {
        const key = `${h.exchange}_${h.ticker}`;
        if (!allTickers.has(key)) {
          allTickers.set(key, { ticker: h.ticker, exchange: h.exchange as string, alerts: [], isOwned: true });
        } else {
          allTickers.get(key)!.isOwned = true;
        }
      });

      if (allTickers.size === 0) {
        timeoutId = setTimeout(tick, 10000);
        return;
      }


      // Find the most overdue ticker
      let selectedKey = '';
      let maxOverdueRatio = -Infinity;
      let hasAlertsCount = 0;

      for (const [key, item] of allTickers.entries()) {
        const fetchedTime = lastFetchedRef.current.get(key) || 0;
        const staleness = Date.now() - fetchedTime;
        
        let targetInterval = 60 * 60 * 1000; // Default 1 hour
        const hasAlert = item.alerts && item.alerts.length > 0;
        if (hasAlert) {
          targetInterval = 15 * 60 * 1000; // 15 mins for alerts
          hasAlertsCount++;
        } else if (item.isOwned) {
          targetInterval = 60 * 60 * 1000; // 60 mins for owned
        }

        const irregularExchanges = ['GEMEL', 'PENSION', 'CBS', 'BOI', 'CASH'];
        if (irregularExchanges.includes(item.exchange)) {
          targetInterval = 24 * 60 * 60 * 1000; // 24 hours for non-regular exchanges
        }

        const overdueRatio = staleness / targetInterval;
        
        if (overdueRatio > maxOverdueRatio) {
          maxOverdueRatio = overdueRatio;
          selectedKey = key;
        }
      }

      if (maxOverdueRatio < 1.0) {
        // Nobody is overdue! Sleep and check again later.
        timeoutId = setTimeout(tick, 10000);
        return;
      }

      const item = allTickers.get(selectedKey);

      if (!item) {
        timeoutId = setTimeout(tick, 10000);
        return;
      }

      lastFetchedRef.current.set(selectedKey, Date.now());

      try {

        const hasAlert = item.alerts && item.alerts.length > 0;
        const summaryOnly = !hasAlert; // Only fetch history if there's an alert
        console.debug(`[BackgroundRefresher] Fetching data for ticker: ${item.ticker} (hasAlert: ${hasAlert})`);
        
        // Force refresh. Passing maxAge helps avoid too many requests if we're spamming.
        const newData = await getTickerData(item.ticker, item.exchange as any, null, undefined, true, undefined, summaryOnly);
        
        if (newData) {
          // Merge old history so UI sparklines don't disappear if summaryOnly=true
          const oldData = engineRef.current?.livePrices.get(`${item.exchange}:${item.ticker}`);
          if (summaryOnly && oldData && oldData.historical) {
            newData.historical = appendLivePriceToHistory(oldData.historical, newData.price);
          }

          let newlyTriggered = false;
          let msgs: string[] = [];
          const isFirstSeen = !seenTickersRef.current.has(item.ticker);
          seenTickersRef.current.add(item.ticker);

          let watchlistAlertActive = false;

          // 1. Evaluate explicit Tracking List alerts
          item.alerts.forEach(alert => {
            const isCurrentlyTriggered = evaluateAlert(alert, newData);
            const wasTriggered = activeAlertsRef.current.has(alert.id);

            if (isCurrentlyTriggered) {
              watchlistAlertActive = true;
              if (watchlistAlertsEnabledRef.current) {
                activeAlertsRef.current.add(alert.id);
                if (!wasTriggered && !isFirstSeen) {
                  newlyTriggered = true;
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
                    msgs.push(`${item.ticker} ${dirStr} ${Math.abs(pct).toFixed(1)}% ${daysStr}${todayStr}`);
                  } else {
                    msgs.push(`${item.ticker} alert triggered`);
                  }
                }
              }
            } else {
              activeAlertsRef.current.delete(alert.id);
            }
          });

          // 2. Evaluate Global Alerts
          if (notableMovesAlertsEnabledRef.current && !watchlistAlertActive) {
            const gPct = globalAlertPctRef.current;
          const gVal = globalAlertValueRef.current;
          
          if (gPct > 0 || gVal > 0) {
            const pct1d = (newData.changePct1d || 0) * 100;
            const dirStr = pct1d >= 0 ? 'up' : 'down';
            
            // Check global % change
            const globalPctId = `global_pct_${item.exchange}_${item.ticker}`;
            const wasPctTriggered = activeAlertsRef.current.has(globalPctId);
            if (gPct > 0 && Math.abs(pct1d) >= gPct) {
              activeAlertsRef.current.add(globalPctId);
              if (!wasPctTriggered && !isFirstSeen) {
                newlyTriggered = true;
                msgs.push(`${item.ticker} ${dirStr} ${Math.abs(pct1d).toFixed(1)}% today`);
              }
            } else {
              activeAlertsRef.current.delete(globalPctId);
            }

            // Check global value change (only for owned)
            if (item.isOwned && gVal > 0 && engineRef.current && newData.price) {
              let totalShares = 0;
              let firstPortfolioCurrency = 'ILS';
              const currentHoldings = holdingsRef.current || [];
              currentHoldings.forEach(h => {
                if (h.ticker === item.ticker && h.exchange === item.exchange) {
                  totalShares += h.qtyTotal;
                  firstPortfolioCurrency = h.portfolioCurrency; // Use as fallback
                }
              });

              if (totalShares > 0) {
                const prevClose = newData.price / (1 + (newData.changePct1d || 0));
                const priceChangeSC = newData.price - prevClose;
                const valueChangeSC = totalShares * priceChangeSC;
                
                const valueChangeBase = convertCurrency(valueChangeSC, newData.currency || 'USD', firstPortfolioCurrency, engineRef.current.exchangeRates);
                
                const globalValId = `global_val_${item.exchange}_${item.ticker}`;
                const wasValTriggered = activeAlertsRef.current.has(globalValId);

                if (Math.abs(valueChangeBase) >= gVal) {
                  activeAlertsRef.current.add(globalValId);
                  if (!wasValTriggered && !isFirstSeen) {
                    newlyTriggered = true;
                    // Note: User requested not to show the absolute value change for privacy
                    msgs.push(`${item.ticker} had a notable daily value change`);
                  }
                } else {
                  activeAlertsRef.current.delete(globalValId);
                }
              }
            }
            }
          }

          // Trigger notification
          if (newlyTriggered && msgs.length > 0 && document.visibilityState === 'hidden' && Notification.permission === 'granted') {
            console.debug('[BackgroundRefresher] Triggering notification', msgs);
            // Deduplicate messages if both % and value triggered
            const uniqueMsgs = Array.from(new Set(msgs));
            new Notification('Portfolio Alert', { body: uniqueMsgs.join('\n') });
          } else if (newlyTriggered && msgs.length > 0) {
             console.debug('[BackgroundRefresher] Notification skipped', { newlyTriggered, msgs, visibilityState: document.visibilityState, permission: Notification.permission });
          }


          // Dispatch specific update event so UI updates immediately without reloading cache
          console.debug('[BackgroundRefresher] Dispatching ticker-updated event');
          window.dispatchEvent(new CustomEvent('ticker-updated', { detail: newData }));

        }
    } catch (e) {
        console.error('[BackgroundRefresher] Background refresh failed for', item.ticker, e);
      }


      // Sleep a short fixed delay before checking the queue again
      timeoutId = setTimeout(tick, 10000);

    };

    timeoutId = setTimeout(tick, 5000);

    return () => clearTimeout(timeoutId);
  }, []);

  return { permission, requestPermission };
}
