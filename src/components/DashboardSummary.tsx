import { Box, Paper, Grid, Typography, Select, MenuItem } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Button from '@mui/material/Button';
import { convertCurrency } from '../lib/currency';

interface SummaryProps {
  summary: {
    aum: number;
    totalUnrealized: number;
    totalRealized: number;
    totalDividends: number;
    totalReturn: number;
    realizedGainAfterTax: number;
    valueAfterTax: number;

    totalDayChange: number;
    totalDayChangePct: number;
    perf1w: number;
    perf1m: number;
    perf3m: number;
    perf1y: number;
    perf3y: number;
    perf5y: number;
    perfYtd: number;
  };
  displayCurrency: string;
  exchangeRates: Record<string, number>;
  selectedPortfolio: string | null;
  onBack: () => void;
  onCurrencyChange: (currency: string) => void;
}

export function DashboardSummary({ summary, displayCurrency, exchangeRates, selectedPortfolio, onBack, onCurrencyChange }: SummaryProps) {
  
  const formatMoney = (n: number, currency: string, decimals = 0) => {
    const val = n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    if (currency === 'USD') return `$${val}`;
    if (currency === 'ILS') return `₪${val}`;
    if (currency === 'EUR') return `€${val}`;
    return `${val} ${currency}`;
  };

  const formatConverted = (n: number) => {
    const converted = convertCurrency(n, 'USD', displayCurrency, exchangeRates);
    return formatMoney(converted, displayCurrency);
  };

  const formatPct = (n: number) => (n * 100).toFixed(2) + '%';

  const renderSummaryValue = (label: string, value: number, color?: string, isMain = false) => {
    const displayVal = formatConverted(value);
    return (
      <Box textAlign="left" minWidth={120}>
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>{label}</Typography>
        <Typography variant={isMain ? "h4" : "h6"} fontWeight={isMain ? "bold" : "medium"} color={color || 'text.primary'}>
          {displayVal}
        </Typography>
      </Box>
    );
  };

  return (
    <Paper variant="outlined" sx={{ p: 3, mb: 4 }}>
      <Grid container spacing={4} alignItems="center">
        <Grid size={{ xs: 12, md: 3 }}>
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
          <Typography variant="h4" fontWeight="bold" color="primary">{formatConverted(summary.aum)}</Typography>
        </Grid>
        <Grid size={{ xs: 12, md: 9 }}>
          <Box display="flex" gap={4} justifyContent="flex-end" alignItems="center" flexWrap="wrap">
            {renderSummaryValue("Value After Tax", summary.valueAfterTax)}
            {renderSummaryValue("Unrealized Gain", summary.totalUnrealized, summary.totalUnrealized >= 0 ? 'success.main' : 'error.main')}
            {renderSummaryValue("Realized Gain", summary.totalRealized)}
            <Box textAlign="left" minWidth={120}>
               <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>Day Change</Typography>
               <Typography variant="h6" fontWeight="medium" color={summary.totalDayChange >= 0 ? 'success.main' : 'error.main'}>
                 {formatConverted(summary.totalDayChange)}
                 <span style={{ fontSize: '0.7em', marginLeft: 4, color: 'text.secondary' }}>
                    ({formatPct(summary.totalDayChangePct)})

                  </span>
               </Typography>
            </Box>

            {/* TODO: Implement actual calculations for these performance metrics */}
            <Box textAlign="left" minWidth={120}>
               <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>1W Change</Typography>
               <Typography variant="h6" fontWeight="medium" color={summary.perf1w >= 0 ? 'success.main' : 'error.main'}>
                 {formatPct(summary.perf1w)}
               </Typography>
            </Box>
            <Box textAlign="left" minWidth={120}>
               <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>1M Change</Typography>
               <Typography variant="h6" fontWeight="medium" color={summary.perf1m >= 0 ? 'success.main' : 'error.main'}>
                 {formatPct(summary.perf1m)}
               </Typography>
            </Box>
            <Box textAlign="left" minWidth={120}>
               <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>YTD Change</Typography>
               <Typography variant="h6" fontWeight="medium" color={summary.perfYtd >= 0 ? 'success.main' : 'error.main'}>
                 {formatPct(summary.perfYtd)}
               </Typography>
            </Box>
            
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