const fs = require('fs');
const file = '/usr/local/google/home/shain/Portfolios/portfolios/src/components/WatchlistPage.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetRegex = /if \(alert\.type === 'price_above' && alert\.targetPrice !== undefined\) \{[\s\S]*?\}\n                \} else if \(alert\.type === 'price_moved_percent' && alert\.percentChange !== undefined && alert\.daysWindow !== undefined\) \{[\s\S]*?\n                \}/g;

const replacement = `if (alert.type === 'price_above' && alert.targetPrice !== undefined) {
                  isTriggered = curPrice >= alert.targetPrice;
                } else if (alert.type === 'price_below' && alert.targetPrice !== undefined) {
                  isTriggered = curPrice <= alert.targetPrice;
                } else if (alert.type === 'price_moved_percent' && alert.percentChange !== undefined && alert.daysWindow !== undefined) {
                  const changePct = alert.daysWindow <= 1 ? liveData?.changePct1d :
                                    alert.daysWindow <= 7 ? liveData?.changePctRecent :
                                    liveData?.changePct1m;
                  const changePctVal = (changePct || 0) * 100;
                  if (alert.direction === 'up') isTriggered = changePctVal >= alert.percentChange;
                  else if (alert.direction === 'down') isTriggered = changePctVal <= -alert.percentChange;
                  else isTriggered = Math.abs(changePctVal) >= alert.percentChange;
                }`;

content = content.replace(targetRegex, replacement);
fs.writeFileSync(file, content);
