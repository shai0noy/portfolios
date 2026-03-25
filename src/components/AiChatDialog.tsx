import React, { useState, useEffect, useMemo } from 'react';
import { Box, Typography, Button, Paper } from '@mui/material';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import PublicIcon from '@mui/icons-material/Public';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import PieChartIcon from '@mui/icons-material/PieChart';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import BalanceIcon from '@mui/icons-material/Balance';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import EventIcon from '@mui/icons-material/Event';
import { useLanguage } from '../lib/i18n';
import { ProfileForm, type UserFinancialProfile } from './ProfileForm';
import { calculateDashboardSummary } from '../lib/dashboard_calc';
import { type Portfolio, type DashboardHolding, type ExchangeRates, Exchange } from '../lib/types';
import { type FinanceEngine } from '../lib/data/engine';
import { formatPercent } from '../lib/currencyUtils';
import { getMetadataValue, setMetadataValue } from '../lib/sheets/api';
import { getTickerData } from '../lib/fetching';
import toast from 'react-hot-toast';
import { BaseAiChatDialog } from './chat/BaseAiChatDialog';
import { getRecentEventsData } from './dashboard/RecentEventsCard';

interface AiChatDialogProps {
  open: boolean;
  onClose: () => void;
  apiKey: string;
  sheetId: string;
  holdings: DashboardHolding[];
  portfolios: Portfolio[];
  displayCurrency: string;
  exchangeRates: ExchangeRates;
  engine: FinanceEngine | null;
  onTickerClick?: (ticker: { exchange: string; symbol: string }) => void;
  onNavClick?: (path: string) => void;
  initialPrompt?: string;
}

const SYSTEM_INSTRUCTION = `
You are a financial assistant. Be professional, objective, and direct. Avoid excessive praise or flattery. Focus on data-driven analysis and facts.
Please be careful in your wording around suggestions - you are just an AI.
- Do NOT list sources at the end of your response.
- You can create interactive links in your response using these formats:
 * {prompt::Text to prefill} to suggest a new prompt for the user - use it to suggest a followup question or two.
 * {ticker::Label::EXCHANGE:SYMBOL} to link to a specific ticker e.g. {ticker::Google::NASDAQ:GOOGL}
 * {userinfo::Button Text} to link to the user profile info form
 * {url::Label::Path} to navigate to any URL
 * NOT supported - {portfolio::XYZ}
 * They CANNOT be nested
`;

export const AiChatDialog: React.FC<AiChatDialogProps> = ({
  open, onClose, apiKey, sheetId,
  holdings, portfolios, displayCurrency, exchangeRates, engine,
  onTickerClick: extOnTickerClick, onNavClick, initialPrompt
}) => {
  const { t } = useLanguage();
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string | null>(null);

  const portfolioData = useMemo(() => {
    const filteredHoldings = selectedPortfolioId
      ? holdings.filter(h => h.portfolioId === selectedPortfolioId)
      : holdings;
    const newPortMap = new Map(portfolios.map(p => [p.id, p]));
    const calc = calculateDashboardSummary(filteredHoldings, displayCurrency, exchangeRates, newPortMap, engine);
    return {
      holdings: calc.holdings,
      summary: calc.summary,
      displayCurrency
    };
  }, [holdings, selectedPortfolioId, portfolios, displayCurrency, exchangeRates, engine]);

  const [openProfile, setOpenProfile] = useState(false);
  const [userProfile, setUserProfile] = useState<UserFinancialProfile>({});
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [marketOverview, setMarketOverview] = useState<string>('');

  useEffect(() => {
    if (open && apiKey) {
      const fetchMarketOverview = async () => {
        try {
          const symbols = [
            { ticker: '^SPX', exchange: Exchange.NYSE, name: 'S&P 500' },
            { ticker: '^NDX', exchange: Exchange.NASDAQ, name: 'NASDAQ 100' },
            { ticker: '^NYETR', exchange: Exchange.NYSE, name: 'NYSE Energy Sector' },
            { ticker: '^SP500-45', exchange: Exchange.NYSE, name: 'S&P 500 Info Tech' },
            { ticker: '137', exchange: Exchange.TASE, name: 'TA-125', sid: 137 },
            { ticker: '120010', exchange: Exchange.CBS, name: 'Israel Consumer Price Index (Inflation)', sid: 120010 },
          ];

          const results = await Promise.all(
            symbols.map(s => getTickerData(s.ticker, s.exchange, s.sid || null))
          );

          const overview = symbols.map((s, i) => {
            const data = results[i];
            if (!data) return `${s.name}: N/A`;
            const stats = [
              data.changePct1d !== undefined ? `1D: ${formatPercent(data.changePct1d)}` : null,
              data.changePctRecent !== undefined ? `1W: ${formatPercent(data.changePctRecent)}` : null,
              data.changePct1m !== undefined ? `1M: ${formatPercent(data.changePct1m)}` : null,
              data.changePct3m !== undefined ? `3M: ${formatPercent(data.changePct3m)}` : null,
              data.changePctYtd !== undefined ? `YTD: ${formatPercent(data.changePctYtd)}` : null,
              data.changePct1y !== undefined ? `1Y: ${formatPercent(data.changePct1y)}` : null,
              data.changePct5y !== undefined ? `5Y: ${formatPercent(data.changePct5y)}` : null,
            ].filter(Boolean).join(', ');

            return `${s.name}: ${stats}`;
          }).join('\\n');

          setMarketOverview(overview);
        } catch (err) {
          console.error("Failed to fetch market overview", err);
        }
      };

      fetchMarketOverview();
    }
  }, [open, apiKey]);

  useEffect(() => {
    if (open && sheetId && !userProfile.age) {
      setLoadingProfile(true);
      getMetadataValue(sheetId, 'user_financial_profile')
        .then(val => {
          if (val) {
            try {
              const parsed = JSON.parse(val);
              setUserProfile(parsed);
            } catch (e) {
              console.error("Failed to parse user profile: " + val, e);
            }
          }
        })
        .catch(e => console.error("Failed to load user profile", e))
        .finally(() => setLoadingProfile(false));
    }
  }, [open, sheetId]);

  const handleSaveProfile = async (profile: UserFinancialProfile) => {
    if (!sheetId) return;
    setSavingProfile(true);
    try {
      await setMetadataValue(sheetId, 'user_financial_profile', JSON.stringify(profile));
      setUserProfile(profile);
      setOpenProfile(false);
    } catch (e) {
      console.error("Failed to save profile", e);
      toast.error(t('Failed to save profile', 'שמירת הפרופיל נכשלה'));
    } finally {
      setSavingProfile(false);
    }
  };

  const summarizePortfolio = () => {
    const hSummary = portfolioData.holdings.map(h => ({
      symbol: h.ticker,
      exchange: h.exchange,
      name: h.displayName,
      value: h.display.marketValue,
      unrealizedGain: h.display.unrealizedGain,
      unrealizedGainPct: formatPercent(h.display.unrealizedGainPct),
      dayChangePct: formatPercent(h.display.dayChangePct),
      realizedGain: h.display.realizedGain,
      realizedGainPct: formatPercent(h.display.realizedGainPct),
      weightInAllHoldings: formatPercent(h.display.weightInGlobal),
      portfolioId: h.portfolioName,
      sector: h.sector,
      perf1w: formatPercent(h.perf1w),
      perf1m: formatPercent(h.perf1m),
      perf3m: formatPercent(h.perf3m),
      perf1y: formatPercent(h.perf1y),
      perf5y: formatPercent(h.perf5y),
      lots: h.activeLots.map(l => ({
        date: l.date,
        vestingDate: l.vestingDate,
        soldDate: l.soldDate,
        cost: l.costTotal
      }))
    }));

    const getTaxPolicyDesc = (policy?: string) => {
      switch (policy) {
        case 'TAX_FREE': return 'Tax Exempt / Keren Hishtalmut (0% Capital Gains Tax)';
        case 'IL_REAL_GAIN': return 'Israeli Real Gain (Taxed only on capital gains that exceed inflation/CPI)';
        case 'NOMINAL_GAIN': return 'Nominal Gain (Taxed on absolute value of capital gains)';
        case 'PENSION': return 'Pension / Providence Fund (Subject to special retirement fund tax rules, usually after retirement age)';
        case 'RSU_ACCOUNT': return 'RSU Account (Vesting taxed as income tax; subsequent gains taxed as capital gains)';
        default: return 'NA';
      }
    };

    const portfoliosInfo = (selectedPortfolioId
      ? portfolios.filter(p => p.id === selectedPortfolioId)
      : portfolios).map(p => {
        const portMap = new Map([[p.id, p]]);
        const portHoldings = holdings.filter(h => h.portfolioId === p.id);
        const calcObj = calculateDashboardSummary(portHoldings, displayCurrency, exchangeRates, portMap, engine);

        return {
          id: p.id,
          name: p.name,
          currency: p.currency,
          taxLevel: formatPercent(p.cgt),
          taxPolicy: getTaxPolicyDesc(p.taxPolicy),
          incomeTaxLevel: p.incTax ? formatPercent(p.incTax) : undefined,
          mgmtFee: p.mgmtVal ? `${p.mgmtType === 'percentage' ? formatPercent(p.mgmtVal) : p.mgmtVal} ${p.mgmtFreq || ''}`.trim() : 'None',
          totalValue: calcObj.summary.aum,
          valueAfterTax: calcObj.summary.valueAfterTax
        };
      });

    const relevantTransactions = engine?.transactions
      ? (selectedPortfolioId ? engine.transactions.filter(tx => tx.portfolioId === selectedPortfolioId) : engine.transactions)
      : [];
    const relevantDividendRecords = engine?.dividendRecords
      ? (selectedPortfolioId ? engine.dividendRecords.filter(tx => tx.portfolioId === selectedPortfolioId) : engine.dividendRecords)
      : [];
    const recentEventsRaw = getRecentEventsData(portfolioData.holdings, relevantTransactions, relevantDividendRecords, t);
    const recentEvents = recentEventsRaw.map(e => ({
      date: e.dateDisplay,
      ticker: e.ticker,
      type: e.titleStr,
      description: e.valueDesc
    }));

    return JSON.stringify({
      activePortfolios: portfoliosInfo,
      totalValue: portfolioData.summary.aum,
      totalGain: portfolioData.summary.totalReturn,
      currency: portfolioData.displayCurrency,
      perf1d: formatPercent(portfolioData.summary.perf1d),
      perf1w: formatPercent(portfolioData.summary.perf1w),
      perf1m: formatPercent(portfolioData.summary.perf1m),
      perf3m: formatPercent(portfolioData.summary.perf3m),
      perf1y: formatPercent(portfolioData.summary.perf1y),
      perf5y: formatPercent(portfolioData.summary.perf5y),
      totalUnvestedValue: portfolioData.summary.totalUnvestedValue,
      valueAfterTax: portfolioData.summary.valueAfterTax,
      holdings: hSummary,
      recentAndUpcomingEvents: recentEvents
    });
  };

  const getSystemInstruction = () => {
    const profileContext = userProfile && Object.keys(userProfile).length > 0
      ? `\\My Profile: ${JSON.stringify(userProfile)}`
      : '';

    return `${SYSTEM_INSTRUCTION}
==My Profile==${profileContext}

==Current Portfolio Data==
${summarizePortfolio()}

==Market Overview Benchmarks==
${marketOverview}

==User Session Start==`;
  };

  const generateBriefingPrompt = (timeframe: string, t: any) => {
    return t(
      `Brief ${timeframe} portfolio summary. Compare gains to market and refer to market trends. Name top movers & key events. Provide data and add insights.`,
      `סיכום מנהלים קצר לתיק ברמה ה${timeframe}. השתמש באימוג'ים ונקודות. השווה למדדי שוק (עליות וירידות), מניות בולטות, אירועי דיבידנד או דוחות. תן קונטקסט של טרנד ארוך משמעותי.`
    );
  };

  const renderEmptyState = (onSend: (text: string) => void) => (
    <Box sx={{ textAlign: 'center', mt: 4, opacity: 0.8 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, mb: 3 }}>
        <SmartToyIcon sx={{ fontSize: 48, color: 'primary.main', opacity: 0.5 }} />
        <Box sx={{ textAlign: 'left' }}>
          <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
            {t('Hello! I can help you analyze your portfolio.', 'שלום! אני יכול לעזור לך לנתח את התיק שלך.')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('Try asking one of these:', 'נסה לשאול את אחת השאלות הבאות:')}
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 4, mb: 4, alignItems: 'center' }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center' }}>
          <Button
            variant="outlined" color="primary"
            size="small"
            startIcon={<AssessmentOutlinedIcon />}
            onClick={() => onSend(generateBriefingPrompt(t('daily', 'יומי'), t))}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            {t('Daily Summary', 'סיכום יומי')}
          </Button>
          <Button
            variant="outlined" color="primary"
            size="small"
            startIcon={<AssessmentOutlinedIcon />}
            onClick={() => onSend(generateBriefingPrompt(t('weekly', 'שבועי'), t))}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            {t('Weekly Summary', 'סיכום שבועי')}
          </Button>
          <Button
            variant="outlined" color="primary"
            size="small"
            startIcon={<AssessmentOutlinedIcon />}
            onClick={() => onSend(generateBriefingPrompt(t('monthly', 'חודשי'), t))}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            {t('Monthly Summary', 'סיכום חודשי')}
          </Button>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center', mb: 4, px: 2 }}>
        {[
          { text: t("What current market events/trends are affecting my portfolio?", "אילו אירועי מאקרו או טרנדים בשוק משפיעים כרגע על התיק שלי?"), icon: <PublicIcon fontSize="small" /> },
          { text: t("What are the key risks in my portfolio?", "מהם הסיכונים המרכזיים בתיק?"), icon: <WarningAmberIcon fontSize="small" /> },
          { text: t("How is my asset allocation distributed?", "איך נראית הקצאת הנכסים שלי?"), icon: <PieChartIcon fontSize="small" /> },
          { text: t("Stress test: What if the market drops 20%?", "בדיקת עמידות: מה אם השוק יירד ב-20%?"), icon: <TrendingDownIcon fontSize="small" /> },
          { text: t("Suggest improvements for my portfolio", "הצע 3 שיפורים לתיק שלי"), icon: <LightbulbOutlinedIcon fontSize="small" /> },
          { text: t("Compare my performance to the market", "השווה את הביצועים שלי לשוק"), icon: <BalanceIcon fontSize="small" /> },
          { text: t("Perform a FIRE (Financial Independence) analysis", "בצע ניתוח FIRE (עצמאות כלכלית)"), icon: <LocalFireDepartmentIcon fontSize="small" /> },
          { text: t("Summarize upcoming and recent events in my portfolio", "סכם אירועים קרובים ועדכניים בתיק שלי"), icon: <EventIcon fontSize="small" /> },
        ].map((sg, i) => (
          <Button
            key={i}
            variant="outlined"
            color="primary"
            size="small"
            startIcon={sg.icon}
            onClick={() => onSend(sg.text)}
            sx={{ textTransform: 'none', borderRadius: 2, py: 0.5, px: 1.5, textAlign: 'left', justifyContent: 'flex-start' }}
          >
            {sg.text}
          </Button>
        ))}
      </Box>

      {(!userProfile.netYearlyEarnings || !userProfile.yearlySpending || !userProfile.age) && (
        <Paper variant="outlined" sx={{
          mt: 4, px: 2, py: 1,
          bgcolor: 'action.hover',
          borderStyle: 'dashed',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          textAlign: 'left'
        }}>
          <Typography variant="body2" color="text.secondary">
            {t(
              "Tip: Complete your financial profile to get personalized analysis and retirement projections.",
              "טיפ: השלם את הפרופיל הפיננסי שלך כדי לקבל ניתוח ותחזיות פרישה מותאמות אישית."
            )}
          </Typography>
          <Button
            size="small"
            onClick={() => setOpenProfile(true)}
            startIcon={<ManageAccountsIcon />}
            sx={{ textTransform: 'none', whiteSpace: 'nowrap' }}
          >
            {t("Complete Profile", "השלם פרופיל")}
          </Button>
        </Paper>
      )}
    </Box>
  );

  const activePortfolioName = selectedPortfolioId ? portfolios.find(p => p.id === selectedPortfolioId)?.name : t('All Portfolios', 'כל התיקים');
  const displayName = activePortfolioName || '';
  const chatTitle = selectedPortfolioId
    ? `${t('AI Portfolio Assistant', 'עוזר תיק השקעות AI')} - ${activePortfolioName}`
    : t('AI Portfolio Assistant', 'עוזר תיק השקעות AI');

  return (
    <>
      <BaseAiChatDialog
        open={open}
        onClose={onClose}
        apiKey={apiKey}
        sheetId={sheetId}
        chatId="portfolio_main"
        contextUrl={window.location.pathname + window.location.search}
        title={chatTitle}
        displayName={displayName}
        headerIcon={<SmartToyIcon color="primary" />}
        getSystemInstruction={getSystemInstruction}
        emptyStateContent={renderEmptyState}
        disclaimerText={t(
          'Disclaimer: This AI assistant provides analysis for informational purposes only and does not constitute financial advice. Always consult with a qualified financial expert before making investment decisions.',
          'הבהרה: עוזר ה-AI מספק ניתוח למטרות מידע בלבד ואינו מהווה ייעוץ פיננסי. תמיד התייעץ עם מומחה פיננסי מוסמך לפני קבלת החלטות השקעה.'
        )}
        portfolios={portfolios}
        selectedPortfolioId={selectedPortfolioId}
        onPortfolioChange={setSelectedPortfolioId}
        onTickerClick={(ex, sym) => extOnTickerClick?.({ exchange: ex, symbol: sym })}
        onNavClick={onNavClick}
        onProfileClick={() => setOpenProfile(true)}
        initialPrompt={initialPrompt}
      />

      {/* Profile Dialog */}
      {openProfile && (
        <ProfileForm
          open={openProfile}
          initialProfile={userProfile}
          loadingProfile={loadingProfile}
          displayCurrency={portfolioData.displayCurrency}
          onSave={handleSaveProfile}
          onCancel={() => setOpenProfile(false)}
          savingProfile={savingProfile}
        />
      )}
    </>
  );
};
