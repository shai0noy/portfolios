import { Box, Paper, Typography, Grid, Tooltip, Button, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { formatPercent, formatValue } from '../lib/currency';
import { logIfFalsy } from '../lib/utils';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import type { ExchangeRates } from '../lib/types';
import { useLanguage } from '../lib/i18n';

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

export function DashboardSummary({ summary, displayCurrency, exchangeRates, onBack, onCurrencyChange, selectedPortfolio }: SummaryProps) {
  logIfFalsy(exchangeRates, "DashboardSummary: exchangeRates missing");
  const { t, isRtl } = useLanguage();

  return (
    <Paper variant="outlined" sx={{ p: 3, mb: 4, position: 'relative' }}>
      <Grid container spacing={2} alignItems="center">
        <Grid item xs={12} md={3}>
          {selectedPortfolio ? (
            <>
              <Button 
                variant="text" 
                onClick={onBack} 
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
                  onChange={(_, val) => val && onCurrencyChange(val)}
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
    </Paper>
  );
}
