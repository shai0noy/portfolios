import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box, Grid, Chip } from '@mui/material';
import { NewTransaction } from './NewTransaction';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useState } from 'react';

interface TickerDetailsProps {
  open: boolean;
  onClose: () => void;
  ticker: string;
  exchange: string;
  name: string;
  price: number;
  currency: string;
  sector: string;
  dayChangePct: number;
  dayChangeVal: number;
  globesInstrumentId?: number; // TODO - extract data from globes fetch (also persist in storage)
  sheetId: string;
}

export function TickerDetails({ open, onClose, ticker, exchange, name, price, currency, sector, dayChangePct, dayChangeVal, globesInstrumentId=0, sheetId }: TickerDetailsProps) {
  const [addTradeOpen, setAddTradeOpen] = useState(false);
  
  const formatMoney = (n: number, currency: string) => {
    let curr = currency;
    if (curr === '#N/A' || !curr) curr = 'ILS'; // Fallback
    
    const val = n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (curr === 'USD') return `$${val}`;
    if (curr === 'ILS' || curr === 'NIS') return `₪${val}`;
    if (curr === 'EUR') return `€${val}`;
    return `${val} ${curr}`;
  };

  const formatPct = (n: number) => (n * 100).toFixed(2) + '%';

  const getExternalLinks = () => {
    const links = [];
    // Yahoo
    links.push({ name: 'Yahoo Finance', url: `https://finance.yahoo.com/quote/${ticker}` });
    
    // Google Finance
    let gExchange = exchange;
    if (exchange === 'TASE') gExchange = 'TLV';
    links.push({ name: 'Google Finance', url: `https://www.google.com/finance/quote/${ticker}:${gExchange}` });

    if (exchange === 'TASE') {
      links.push({ name: 'Globes', url: `https://www.globes.co.il/finance/instrument/${globesInstrumentId}` }); 
      links.push({ name: 'Bizportal', url: `https://www.bizportal.co.il/realestates/quote/generalview/${ticker}` }); 
    }
    
    return links;
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="h5" component="span" fontWeight="bold">{ticker}</Typography>
            <Typography variant="body2" color="text.secondary" component="span" sx={{ ml: 1 }}>{exchange}</Typography>
          </Box>
          <Chip label={sector || 'Unknown Sector'} size="small" variant="outlined" />
        </Box>
        <Typography variant="subtitle1" color="text.secondary">{name}</Typography>
      </DialogTitle>
      
      <DialogContent dividers>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid size={{ xs: 6 }}>
            <Typography variant="caption" color="text.secondary">PRICE</Typography>
            <Typography variant="h4">{formatMoney(price, currency)}</Typography>
          </Grid>
          <Grid size={{ xs: 6 }}>
            <Typography variant="caption" color="text.secondary">DAY CHANGE</Typography>
            <Typography variant="h5" color={dayChangePct >= 0 ? 'success.main' : 'error.main'}>
              {dayChangePct >= 0 ? '+' : ''}{formatPct(dayChangePct)}
            </Typography>
            <Typography variant="body2" color={dayChangePct >= 0 ? 'success.main' : 'error.main'}>
              {dayChangeVal !== 0 ? `${dayChangeVal > 0 ? '+' : ''}${formatMoney(dayChangeVal, currency)}` : ''}
            </Typography>
          </Grid>
        </Grid>

        <Typography variant="subtitle2" gutterBottom>External Links</Typography>
        <Box display="flex" flexWrap="wrap" gap={1}>
          {getExternalLinks().map(link => (
            <Button 
              key={link.name} 
              variant="outlined" 
              size="small" 
              href={link.url} 
              target="_blank" 
              endIcon={<OpenInNewIcon />}
            >
              {link.name}
            </Button>
          ))}
        </Box>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={() => setAddTradeOpen(true)}>New Transaction</Button>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>

      <Dialog open={addTradeOpen} onClose={() => setAddTradeOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Add Transaction for {ticker}</DialogTitle>
        <DialogContent>
          <NewTransaction 
            sheetId={sheetId}
            initialTicker={ticker}
            initialExchange={exchange}
            initialPrice={price.toString()}
            initialCurrency={currency}
            onSaveSuccess={() => {
              setAddTradeOpen(false);
              onClose(); // Close ticker details after saving transaction
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddTradeOpen(false)}>Cancel</Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
