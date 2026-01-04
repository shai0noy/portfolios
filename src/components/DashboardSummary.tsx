import { Box, Paper, Grid, Typography, Select, MenuItem, Tooltip } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
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

export function DashboardSummary({ summary, displayCurrency, exchangeRates, selectedPortfolio, onBack, onCurrencyChange }: SummaryProps) {
  
  const formatMoney = (n: number, currency: string, decimals = 0) => {
    const val = n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    if (currency === 'USD') return `${val}`;
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
    const percentage = summary.aum > 0 ? value / summary.aum : 0;
    return (
      <Box textAlign="left" minWidth={120}>
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>{label}</Typography>
        <Typography variant={isMain ? "h4" : "h6"} fontWeight={isMain ? "bold" : "medium"} color={color || 'text.primary'}>
          {displayVal}
          {label === 'Unrealized Gain' && summary.aum > 0 && (
            <span style={{ fontSize: '0.7em', marginLeft: 4, color: 'text.secondary' }}>
              ({formatPct(percentage)})
            </span>
          )}
        </Typography>
      </Box>
    );
  };

  const renderPerfValue = (label: string, percentage: number, isIncomplete: boolean) => {
    const labelBox = (
      <Box display="flex" alignItems="center">
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>{label}</Typography>
        {isIncomplete && (
          <Tooltip title="Calculation is based on partial data as some holdings were missing live price information.">
            <InfoOutlinedIcon sx={{ fontSize: '1rem', ml: 0.5, color: 'text.secondary' }} />
          </Tooltip>
        )}
      </Box>
    );

    if (percentage === 0 || isNaN(percentage)) {
        return (
            <Box textAlign="left" minWidth={120}>
                {labelBox}
                <Typography variant="h6" fontWeight="medium" color="text.primary">
                    -
                </Typography>
            </Box>
        );
    }

    const absoluteChange = summary.aum - (summary.aum / (1 + percentage));
    const color = percentage >= 0 ? 'success.main' : 'error.main';

    return (
        <Box textAlign="left" minWidth={120}>
           {labelBox}
           <Typography variant="h6" fontWeight="medium" color={color}>
             {formatConverted(absoluteChange)}
           </Typography>
           <Typography variant="caption" color="text.secondary">
              ({formatPct(percentage)})
           </Typography>
        </Box>
    );
  };

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
          <Typography variant="h4" fontWeight="bold" color="primary">{formatConverted(summary.aum)}</Typography>
        </Grid>
        <Grid item xs={12} md={9}>
          <Box display="flex" gap={4} justifyContent="flex-end" alignItems="center" flexWrap="wrap">
            <Box textAlign="left" minWidth={120}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>Value After Tax</Typography>
                <Typography variant="h6" fontWeight="medium" color="text.primary">
                    {formatConverted(summary.valueAfterTax)}
                    {summary.aum > 0 && (
                        <span style={{ fontSize: '0.7em', marginLeft: 4, color: 'text.secondary' }}>
                            ({formatPct(summary.valueAfterTax / summary.aum)})
                        </span>
                    )}
                </Typography>
            </Box>
            {renderSummaryValue("Unrealized Gain", summary.totalUnrealized, summary.totalUnrealized >= 0 ? 'success.main' : 'error.main')}
            {renderSummaryValue("Realized Gain", summary.totalRealized)}
            <Box textAlign="left" minWidth={120}>
                <Box display="flex" alignItems="center">
                    <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>Day Change</Typography>
                    {summary.totalDayChangeIsIncomplete && (
                      <Tooltip title="Calculation is based on partial data as some holdings were missing live price information.">
                        <InfoOutlinedIcon sx={{ fontSize: '1rem', ml: 0.5, color: 'text.secondary' }} />
                      </Tooltip>
                    )}
                </Box>
               <Typography variant="h6" fontWeight="medium" color={summary.totalDayChange >= 0 ? 'success.main' : 'error.main'}>
                 {formatConverted(summary.totalDayChange)}
                 <span style={{ fontSize: '0.7em', marginLeft: 4, color: 'text.secondary' }}>
                    ({formatPct(summary.totalDayChangePct)})
                  </span>
               </Typography>
            </Box>

            {renderPerfValue("1W Change", summary.perf1w, summary.perf1w_incomplete)}
            {renderPerfValue("1M Change", summary.perf1m, summary.perf1m_incomplete)}
            {renderPerfValue("3M Change", summary.perf3m, summary.perf3m_incomplete)}
            {renderPerfValue("YTD Change", summary.perfYtd, summary.perfYtd_incomplete)}
            {renderPerfValue("1Y Change", summary.perf1y, summary.perf1y_incomplete)}
            {renderPerfValue("3Y Change", summary.perf3y, summary.perf3y_incomplete)}
            {renderPerfValue("5Y Change", summary.perf5y, summary.perf5y_incomplete)}
            
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
