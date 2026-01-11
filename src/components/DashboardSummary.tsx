import { Box, Paper, Typography, Grid, Tooltip, IconButton, Select, MenuItem, FormControl, InputLabel } from '@mui/material';
import { convertCurrency, formatCurrency } from '../lib/currency';
import { logIfFalsy } from '../lib/utils';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

interface SummaryProps {
  summary: {
    aum: number;
    totalUnrealized: number;
    totalRealized: number;
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
  exchangeRates: Record<string, number>;
  selectedPortfolio: string | null;
  onBack: () => void;
  onCurrencyChange: (currency: string) => void;
}

export function DashboardSummary({ summary, displayCurrency, exchangeRates, onBack, onCurrencyChange, selectedPortfolio }: SummaryProps) {
  logIfFalsy(exchangeRates, "DashboardSummary: exchangeRates missing");
  
  const formatMoney = (n: number, currency: string, decimals = 0) => {
    const val = n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    if (currency === 'USD') return `$${val}`;
    if (currency === 'ILS') return `₪${val}`;
    if (currency === 'EUR') return `€${val}`;
    return `${val} ${currency}`;
  };

  const formatPct = (n: number) => (n * 100).toFixed(2) + '%';

  const Stat = ({ label, value, pct, color, tooltip, isMain = false }: { label: string, value: number, pct?: number, color?: string, tooltip?: string, isMain?: boolean }) => {
    return (
        <Box textAlign="left" minWidth={120}>
            <Box display="flex" alignItems="center">
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>{label}</Typography>
                {tooltip && (
                    <Tooltip title={tooltip}>
                        <InfoOutlinedIcon sx={{ fontSize: '1rem', ml: 0.5, color: 'text.secondary' }} />
                    </Tooltip>
                )}
            </Box>
            <Typography variant={isMain ? "h4" : "h6"} fontWeight={isMain ? "bold" : "medium"} color={color || 'text.primary'}>
                {formatCurrency(value, displayCurrency)}
            </Typography>
            {(pct !== undefined && !isNaN(pct)) && (
                <Typography variant="caption" color={color || 'text.secondary'} sx={{ opacity: color ? 1 : 0.7 }}>
                    ({formatPct(pct)})
                </Typography>
            )}
        </Box>
    );
  };

  const PerfStat = ({ label, percentage, isIncomplete }: { label: string, percentage: number, isIncomplete: boolean }) => {
    if (percentage === 0 || isNaN(percentage)) {
        return <Stat label={label} value={0} pct={0} />;
    }

    const currentAUM = summary.aum;
    // Calculate the previous value in the display currency
    const previousAUM = currentAUM / (1 + percentage);
    const absoluteChange = currentAUM - previousAUM;
    const color = percentage >= 0 ? 'success.main' : 'error.main';
    
    return <Stat label={label} value={absoluteChange} pct={percentage} color={color} tooltip={isIncomplete ? "Calculation is based on partial data." : undefined} />;
  }


  return (
    <Paper variant="outlined" sx={{ p: 3, mb: 4 }}>
      <Grid container spacing={4} alignItems="center">
        <Grid item xs={12} md={3}>
          {selectedPortfolio ? (
            <>
              <Button 
                variant="outlined" 
                color="inherit" 
                onClick={onBack} 
                sx={{ mb: 1 }}
                startIcon={<ArrowBackIcon />}
              >
                Back to All
              </Button>
              <Typography variant="h5" fontWeight="bold" color="primary">{selectedPortfolio}</Typography>
            </>
          ) : (
            <Typography variant="subtitle2" color="text.secondary">TOTAL AUM</Typography>
          )}
          <Typography variant="h4" fontWeight="bold" color="primary">{formatMoney(summary.aum, displayCurrency)}</Typography>
        </Grid>
        <Grid item xs={12} md={9}>
          <Box display="flex" gap={4} justifyContent="flex-end" alignItems="center" flexWrap="wrap">
            <Stat 
                label="Value After Tax"
                value={summary.valueAfterTax}
                pct={summary.aum > 0 ? summary.valueAfterTax / summary.aum : undefined}
            />
            <Stat 
                label="Unrealized Gain"
                value={summary.totalUnrealized}
                pct={summary.totalUnrealizedGainPct}
                color={summary.totalUnrealized >= 0 ? 'success.main' : 'error.main'}
            />
            <Stat 
                label="Realized Gain"
                value={summary.totalRealized}
                pct={summary.totalRealizedGainPct}
                color={summary.totalRealized >= 0 ? 'success.main' : 'error.main'}
            />
            <Stat
                label="Day Change"
                value={summary.totalDayChange}
                pct={summary.totalDayChangePct}
                color={summary.totalDayChange >= 0 ? 'success.main' : 'error.main'}
                tooltip={summary.totalDayChangeIsIncomplete ? "Calculation is based on partial data." : undefined}
            />
            
            <PerfStat label="1W" percentage={summary.perf1w} isIncomplete={summary.perf1w_incomplete} />
            <PerfStat label="1M" percentage={summary.perf1m} isIncomplete={summary.perf1m_incomplete} />
            <PerfStat label="3M" percentage={summary.perf3m} isIncomplete={summary.perf3m_incomplete} />
            <PerfStat label="YTD" percentage={summary.perfYtd} isIncomplete={summary.perfYtd_incomplete} />
            <PerfStat label="1Y" percentage={summary.perf1y} isIncomplete={summary.perf1y_incomplete} />

            <Select 
              value={displayCurrency} 
              onChange={(e) => onCurrencyChange(e.target.value)} 
              size="small" 
            >
              <MenuItem value="USD">🇺🇸 USD</MenuItem>
              <MenuItem value="ILS">🇮🇱 ILS</MenuItem>
            </Select>
          </Box>
        </Grid>
      </Grid>
    </Paper>
  );
}
