import React from 'react';
import { BaseAiChatDialog } from './chat/BaseAiChatDialog';
import { useLanguage } from '../lib/i18n';
import type { Holding } from '../lib/data/model';
import { formatPercent } from '../lib/currency';
import type { ExchangeRates } from '../lib/types';

interface TickerAiChatProps {
  open: boolean;
  onClose: () => void;
  apiKey: string;
  tickerData?: any;
  holdings: Holding[];
  displayCurrency: string;
  exchangeRates?: ExchangeRates | null;
  subjectName?: string;
}

export const TickerAiChat: React.FC<TickerAiChatProps> = ({
  open, onClose, apiKey, tickerData, holdings, displayCurrency: _displayCurrency, exchangeRates: _exchangeRates, subjectName
}) => {
  const { t } = useLanguage();

  if (!tickerData) return null;

  const summarizeTicker = () => {
    // Generate context string specifically for this ticker
    const contextObj = {
      asset: {
        symbol: tickerData.ticker,
        exchange: tickerData.exchange,
        name: tickerData.name,
        sector: tickerData.sector || 'N/A',
        industry: tickerData.subSector || 'N/A',
      },
      currentPricing: {
        price: tickerData.price,
        currency: tickerData.currency,
        dayChangePct: tickerData.changePct1d ? formatPercent(tickerData.changePct1d) : 'N/A',
        ytdChangePct: tickerData.changePctYtd ? formatPercent(tickerData.changePctYtd) : 'N/A',
        oneYearChangePct: tickerData.changePct1y ? formatPercent(tickerData.changePct1y) : 'N/A',
        dividendYield: tickerData.dividendYield ? formatPercent(tickerData.dividendYield) : 'N/A',
      },
      userHoldings: holdings.map(h => ({
        portfolioId: h.portfolioId,
        activeLotsCount: h.activeLots.length,
        totalQuantity: h.activeLots.reduce((sum, l) => sum + (l.qty || 0), 0),
        // Simplistic total cost / value info can be added here
      }))
    };
    return JSON.stringify(contextObj, null, 2);
  };

  const getSystemInstruction = () => {
    return `You are a financial assistant. Be professional, objective, and direct. Focus on data-driven analysis and facts.
Please be careful in your wording around suggestions - you are just an AI.
- Do NOT list sources at the end of your response.
- You can create interactive links in your response using these formats:
 * {prompt::Text to prefill} to suggest a new prompt for the user
 * {ticker::Label::EXCHANGE:SYMBOL} to link to a specific ticker e.g. {ticker::Google::NASDAQ:GOOGL}
 * {userinfo::Button Text} to link to the user profile info form
 * {url::Label::Path} to navigate to any URL
 * Not supported! - {portfolio::XYZ}

>> We are discussing the following asset: ${tickerData.exchange}:${tickerData.ticker} (${tickerData.name || subjectName}).

== Current Data ==
${summarizeTicker()}`;
  };

  const suggestions = [
    t('Summarize this asset', 'סכם את הנכס הזה'),
    t('What are the recent news or events?', 'מה החדשות או האירועים האחרונים?'),
    t('Analyze its performance over the last year', 'נתח את ביצועיו בשנה האחרונה'),
    t('Compare it to its sector peers', 'השווה אותו למתחרים בסקטור')
  ];

  return (
    <BaseAiChatDialog
      open={open}
      onClose={onClose}
      apiKey={apiKey}
      chatId={`ticker_${tickerData.exchange}_${tickerData.ticker || subjectName} `}
      title={`${t('AI Assistant', 'עוזר AI')} - ${tickerData.ticker || subjectName || ''} `}
      getSystemInstruction={getSystemInstruction}
      suggestions={suggestions}
    />
  );
};
