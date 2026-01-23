import { Box, Paper, Typography, Grid, Tooltip, Button, ToggleButton, ToggleButtonGroup, IconButton } from '@mui/material';
import { formatPercent, formatValue, calculatePerformanceInDisplayCurrency } from '../lib/currency';
import { logIfFalsy } from '../lib/utils';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import type { ExchangeRates, DashboardHolding } from '../lib/types';
import { useLanguage } from '../lib/i18n';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

// Time constants for auto-stepping
const AUTO_STEP_DELAY = 2 * 60 * 1000; // 2 minutes
const INTERACTION_STEP_DELAY = 8 * 60 * 1000; // 8 minutes

interface SummaryProps {
  summary: {
    aum: number;
    totalUnrealized: number;
    totalUnrealizedGainPct: number;
    totalRealized: number;
    totalRealizedGainPct: number;
    totalCostOfSold: number;
    totalDividends: number;
    totalReturn: number;
    realizedGainAfterTax: number;
    valueAfterTax: number;

    totalDayChange: number;
    totalDayChangePct: number;
    totalDayChangeIsIncomplete: boolean;
    perf1w: number;
    perf1w_incomplete: boolean;
    perf1m: number;
    perf1m_incomplete: boolean;
    perf3m: number;
    perf3m_incomplete: boolean;
    perf1y: number;
    perf1y_incomplete: boolean;
    perf3y: number;
    perf3y_incomplete: boolean;
    perf5y: number;
    perf5y_incomplete: boolean;
    perfYtd: number;
    perfYtd_incomplete: boolean;
  };
  holdings: DashboardHolding[];
  displayCurrency: string;
  exchangeRates: ExchangeRates;
  selectedPortfolio: string | null;
  onBack: () => void;
  onCurrencyChange: (currency: string) => void;
}

interface StatProps {
  label: string;
  value: number;
  pct?: number;
  color?: string;
  tooltip?: string;
  isMain?: boolean;
  size?: 'normal' | 'small';
  displayCurrency: string;
}

const Stat = ({ label, value, pct, color, tooltip, isMain = false, size = 'normal', displayCurrency }: StatProps) => {
  const isSmall = size === 'small';
  
  return (
      <Box textAlign="left" minWidth={isSmall ? 'auto' : 120}>
          <Box display="flex" alignItems="center">
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontSize: isSmall ? '0.7rem' : '0.75rem' }}>{label}</Typography>
              {tooltip && (
                  <Tooltip title={tooltip}>
                      <InfoOutlinedIcon sx={{ fontSize: '0.9rem', ml: 0.5, color: 'text.secondary' }} />
                  </Tooltip>
              )}
          </Box>
          <Typography 
              variant={isMain ? "h4" : (isSmall ? "body2" : "h6")} 
              fontWeight={isMain ? "bold" : "medium"} 
              color={color || 'text.primary'}
              lineHeight={isSmall ? 1.2 : undefined}
          >
              {formatValue(value, displayCurrency, isMain ? 0 : 2)}
          </Typography>
          {(pct !== undefined && !isNaN(pct)) && (
              <Typography 
                  variant="caption" 
                  color={color || 'text.secondary'} 
                  sx={{ opacity: color ? 1 : 0.7, fontSize: isSmall ? '0.7rem' : '0.75rem' }}
              >
                  {pct > 0 ? '+' : ''}{formatPercent(pct)}
              </Typography>
          )}
      </Box>
  );
};

interface PerfStatProps {
  label: string;
  percentage: number;
  isIncomplete: boolean;
  aum: number;
  displayCurrency: string;
  size?: 'normal' | 'small';
}

const PerfStat = ({ label, percentage, isIncomplete, aum, displayCurrency, size = 'normal' }: PerfStatProps) => {
  const { t } = useLanguage(); // Hook for translation
  if (percentage === 0 || isNaN(percentage)) {
      return <Stat label={label} value={0} pct={0} displayCurrency={displayCurrency} size={size} />;
  }

  const previousAUM = aum / (1 + percentage);
  const absoluteChange = aum - previousAUM;
  const color = percentage >= 0 ? 'success.main' : 'error.main';
  
  return <Stat label={label} value={absoluteChange} pct={percentage} color={color} tooltip={isIncomplete ? t("Calculation is based on partial data.", "החישוב מבוסס על נתונים חלקיים.") : undefined} displayCurrency={displayCurrency} size={size} />;
}

type TimePeriod = '1d' | '1w' | '1m';

interface Mover {
  key: string;
  name: string;
  ticker: string;
  change: number;
  pct: number;
}

const TopMovers = ({ holdings, displayCurrency, exchangeRates }: { holdings: DashboardHolding[], displayCurrency: string, exchangeRates: ExchangeRates }) => {
  const { t } = useLanguage();
  const [period, setPeriod] = useState<TimePeriod>('1d');

  const movers = useMemo((): Mover[] => {
    if (!holdings) return [];

    const getChange = (h: DashboardHolding) => {
      const perf = (() => {
        switch (period) {
          case '1d':
            return h.dayChangePct;
          case '1w':
            return h.perf1w;
          case '1m':
            return h.perf1m;
          default:
            return 0;
        }
      })();

      if (isNaN(perf) || perf === 0) return 0;
      
      const { changeVal } = calculatePerformanceInDisplayCurrency(h.currentPrice, h.stockCurrency, perf, displayCurrency, exchangeRates);
      return changeVal * h.totalQty;
    };
    
    const getPct = (h: DashboardHolding) => {
        switch (period) {
            case '1d':
                return h.dayChangePct;
            case '1w':
                return h.perf1w;
            case '1m':
                return h.perf1m;
            default:
                return 0;
        }
    }

    return holdings
      .map(h => ({
        key: h.key,
        name: h.displayName,
        ticker: h.ticker,
        change: getChange(h),
        pct: getPct(h)
      }))
      .filter(h => !isNaN(h.change) && h.change !== 0)
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
      .slice(0, 5);
  }, [holdings, period, displayCurrency, exchangeRates]);

  return (
    <Box sx={{height: 150}}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
        <Typography variant="subtitle2" color="text.secondary">{t('Top Movers', 'המניות הבולטות')}</Typography>
        <ToggleButtonGroup
          value={period}
          exclusive
          size="small"
          onChange={(_, newPeriod) => { if (newPeriod) setPeriod(newPeriod); }}
        >
          <ToggleButton value="1d" sx={{px: 1, fontSize: '0.7rem'}}>{t('1D', 'יום')}</ToggleButton>
          <ToggleButton value="1w" sx={{px: 1, fontSize: '0.7rem'}}>{t('1W', 'שבוע')}</ToggleButton>
          <ToggleButton value="1m" sx={{px: 1, fontSize: '0.7rem'}}>{t('1M', 'חודש')}</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <Grid container spacing={1}>
        {movers.map(mover => (
          <Grid item xs={12} sm={6} md={4} lg={2.4} key={mover.key}>
            <Box display="flex" justifyContent="space-between" alignItems="center" sx={{
              borderBottom: '1px solid',
              borderColor: 'divider',
              pb: 0.5,
            }}>
              <Tooltip title={mover.name}>
                  <Typography variant="body2" fontWeight="500" noWrap sx={{maxWidth: 80}}>
                      {mover.ticker}
                  </Typography>
              </Tooltip>
              <Box textAlign="right">
                <Typography variant="body2" color={mover.change >= 0 ? 'success.main' : 'error.main'}>
                  {formatValue(mover.change, displayCurrency, 0)}
                </Typography>
                <Typography variant="caption" color={mover.change >= 0 ? 'success.main' : 'error.main'}>
                  {mover.pct > 0 ? '+' : ''}{formatPercent(mover.pct)}
                </Typography>
              </Box>
            </Box>
          </Grid>
        ))}
        {movers.length === 0 && (
            <Grid item xs={12} sx={{textAlign: 'center', color: 'text.secondary', mt: 4}}>
                 <Typography variant="body2">{t('No significant movers for this period.', 'אין תנודות משמעותיות בתקופה זו.')}</Typography>
            </Grid>
        )}
      </Grid>
    </Box>
  );
};

export function DashboardSummary({ summary, holdings, displayCurrency, exchangeRates, onBack, onCurrencyChange, selectedPortfolio }: SummaryProps) {
  logIfFalsy(exchangeRates, "DashboardSummary: exchangeRates missing");
  const { t, isRtl } = useLanguage();
  
  const [activeStep, setActiveStep] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isManualRef = useRef(false);

  // Timer logic
  const startTimer = useCallback((delay: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
        setActiveStep(prev => (prev + 1) % 3);
    }, delay);
  }, []);

  useEffect(() => {
    const delay = isManualRef.current ? INTERACTION_STEP_DELAY : AUTO_STEP_DELAY;
    isManualRef.current = false;
    startTimer(delay);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [activeStep, startTimer]);

  const handleManualStep = (direction: 'next' | 'prev') => {
    isManualRef.current = true;
    setActiveStep(prev => {
        if (direction === 'next') return (prev + 1) % 3;
        return (prev - 1 + 3) % 3;
    });
  };

  const handleInteraction = () => {
    // Reset timer to long delay without changing step
    startTimer(INTERACTION_STEP_DELAY);
  };

  return (
    <Paper 
        variant="outlined" 
        sx={{ p: 3, mb: 4, position: 'relative' }} 
        onClick={handleInteraction}
    >
      {/* Navigation Buttons */}
      <IconButton 
         onClick={(e) => { e.stopPropagation(); handleManualStep('prev'); }}
         sx={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', zIndex: 2 }}
         size="small"
      >
         <ChevronLeftIcon />
      </IconButton>
       
      <IconButton 
         onClick={(e) => { e.stopPropagation(); handleManualStep('next'); }}
         sx={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', zIndex: 2 }}
         size="small"
      >
         <ChevronRightIcon />
      </IconButton>

      <Box sx={{ px: 4 }}>
        {activeStep === 0 && (
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={3}>
              {selectedPortfolio ? (
                <>
                  <Button 
                    variant="text" 
                    onClick={(e) => { e.stopPropagation(); handleInteraction(); onBack(); }} 
                    startIcon={<ArrowBackIcon fontSize="small" sx={{ transform: isRtl ? 'rotate(180deg)' : 'none' }} />}
                    sx={{ 
                      mb: 0.5, 
                      textTransform: 'none', 
                      color: 'text.secondary', 
                      minWidth: 'auto', 
                      p: 0,
                      ml: -1,
                      mt: -3.5,
                      '&:hover': { bgcolor: 'transparent', color: 'text.primary' } 
                    }}
                    disableRipple
                  >
                    {t('Back to All', 'חזרה לכל התיקים')}
                  </Button>
                  <Typography variant="h5" fontWeight="bold" color="primary">{selectedPortfolio}</Typography>
                </>
              ) : (
                <Typography variant="subtitle2" color="text.secondary">{t('TOTAL AUM', 'שווי כולל')}</Typography>
              )}
              <Typography variant="h4" fontWeight="bold" color="primary">{formatValue(summary.aum, displayCurrency, 0)}</Typography>
            </Grid>
            <Grid item xs={12} md={9}>
              <Box display="flex" flexDirection="column" gap={2} alignItems="flex-end">
                  {/* Main Stats Row */}
                  <Box display="flex" gap={4} justifyContent="flex-end" alignItems="center" flexWrap="wrap">
                    <Stat 
                        label={t("Value After Tax", "שווי אחרי מס")}
                        value={summary.valueAfterTax}
                        pct={summary.aum > 0 ? summary.valueAfterTax / summary.aum : undefined}
                        displayCurrency={displayCurrency}
                    />
                    <Stat 
                        label={t("Unrealized Gain", "רווח לא ממומש")}
                        value={summary.totalUnrealized}
                        pct={summary.totalUnrealizedGainPct}
                        color={summary.totalUnrealized >= 0 ? 'success.main' : 'error.main'}
                        displayCurrency={displayCurrency}
                    />
                    <Stat 
                        label={t("Realized Gain", "רווח ממומש")}
                        value={summary.totalRealized}
                        pct={summary.totalRealizedGainPct}
                        color={summary.totalRealized >= 0 ? 'success.main' : 'error.main'}
                        displayCurrency={displayCurrency}
                    />
                    <ToggleButtonGroup
                      value={displayCurrency}
                      exclusive
                      onChange={(_, val) => {
                          if (val) {
                              handleInteraction();
                              onCurrencyChange(val);
                          }
                      }}
                      size="small"
                      sx={{ ml: 2, height: 32, direction: 'ltr' }}
                    >
                      <ToggleButton value="USD" sx={{ px: 2, fontWeight: 600 }}>USD</ToggleButton>
                      <ToggleButton value="ILS" sx={{ px: 2, fontWeight: 600 }}>ILS</ToggleButton>
                    </ToggleButtonGroup>
                  </Box>

                  {/* Performance / Detail Row */}
                  <Box display="flex" gap={2} justifyContent="flex-end" alignItems="center" flexWrap="wrap">
                    <Stat
                        label={t("1D", "יומי")}
                        value={summary.totalDayChange}
                        pct={summary.totalDayChangePct}
                        color={summary.totalDayChange >= 0 ? 'success.main' : 'error.main'}
                        tooltip={summary.totalDayChangeIsIncomplete ? t("Calculation is based on partial data.", "החישוב מבוסס על נתונים חלקיים.") : undefined}
                        displayCurrency={displayCurrency}
                        size="small"
                    />
                    
                    <PerfStat label={t("1W", "שבוע")} percentage={summary.perf1w} isIncomplete={summary.perf1w_incomplete} aum={summary.aum} displayCurrency={displayCurrency} size="small" />
                    <PerfStat label={t("1M", "חודש")} percentage={summary.perf1m} isIncomplete={summary.perf1m_incomplete} aum={summary.aum} displayCurrency={displayCurrency} size="small" />
                    <PerfStat label={t("3M", "3 חודשים")} percentage={summary.perf3m} isIncomplete={summary.perf3m_incomplete} aum={summary.aum} displayCurrency={displayCurrency} size="small" />
                    <PerfStat label={t("YTD", "מתחילת שנה")} percentage={summary.perfYtd} isIncomplete={summary.perfYtd_incomplete} aum={summary.aum} displayCurrency={displayCurrency} size="small" />
                    <PerfStat label={t("1Y", "שנה")} percentage={summary.perf1y} isIncomplete={summary.perf1y_incomplete} aum={summary.aum} displayCurrency={displayCurrency} size="small" />
                  </Box>
              </Box>
            </Grid>
          </Grid>
        )}
        {activeStep === 1 && (
            <Box height={150} display="flex" alignItems="center" justifyContent="center">
                <Typography variant="h6" color="text.secondary">Screen 2 Placeholder</Typography>
            </Box>
        )}
        {activeStep === 2 && (
            <TopMovers holdings={holdings} displayCurrency={displayCurrency} exchangeRates={exchangeRates} />
        )}
      </Box>
    </Paper>
  );
}
