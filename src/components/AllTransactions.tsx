import React, { useMemo, useState, useEffect } from 'react';
import { Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, Typography, CircularProgress, IconButton, Tooltip } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { useLanguage } from '../lib/i18n';
import { useDashboardData } from '../lib/dashboard';
import { formatMoneyValue, convertCurrency } from '../lib/currencyUtils';
import { normalizeCurrency } from '../lib/currency';
import { useSearchParams, useNavigate } from 'react-router-dom';
import type { Transaction } from '../lib/types';

export const AllTransactions = ({ sheetId }: { sheetId: string }) => {
  const { t } = useLanguage();
  const { holdings, loading, portfolios, engine, exchangeRates } = useDashboardData(sheetId);
  const transactions = engine?.transactions || [];
  const dividendRecords = engine?.dividendRecords || [];
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [displayCurrency, setDisplayCurrency] = useState<string>(() => normalizeCurrency(localStorage.getItem('displayCurrency') || 'USD'));

  useEffect(() => {
    const portId = searchParams.get('portfolioId');
    const selectedPort = portfolios.find(p => p.id === portId);
    if (selectedPort) {
      setDisplayCurrency(normalizeCurrency(selectedPort.currency));
    } else if (!portId) {
      setDisplayCurrency(normalizeCurrency(localStorage.getItem('displayCurrency') || 'USD'));
    }
  }, [searchParams, portfolios]);

  const [txnSortConfig, setTxnSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'date', direction: 'desc' });

  const transactionsData = useMemo(() => {
    const allTxns: any[] = [];

    const getTickerName = (ticker: string, portfolioId: string) => {
      const h = (holdings || []).find((x: any) => x.ticker === ticker && x.portfolioId === portfolioId) as any;
      return h ? (h.customName || h.displayName || h.name || h.marketName || h.nameHe || ticker) : ticker;
    };

    const getTxnCurrency = (txn: Transaction) => {
      if (txn.currency) return normalizeCurrency(txn.currency);
      const h = (holdings || []).find((x: any) => x.ticker === txn.ticker && x.portfolioId === txn.portfolioId) as any;
      if (h && h.stockCurrency) return normalizeCurrency(h.stockCurrency);
      const p = portfolios.find(p => p.id === txn.portfolioId);
      if (p && p.currency) return normalizeCurrency(p.currency);
      return 'USD';
    };

    const grantGroups: Record<string, { date: string, ticker: string, exchange: string, portfolioId: string, qty: number, value: number, events: Transaction[] }> = {};

    (transactions || []).forEach(txn => {
      const isGrant = !!txn.vestDate;
      const val = (txn.originalQty ?? txn.qty ?? 0) * (txn.originalPrice ?? txn.price ?? 0);
      
      if (isGrant) {
          const dateStr = new Date(txn.date).toISOString().split('T')[0];
          const key = `${dateStr}_${txn.ticker}_${txn.exchange}_${txn.portfolioId}`;
          
          if (!grantGroups[key]) {
              grantGroups[key] = { date: txn.date, ticker: txn.ticker, exchange: txn.exchange || '', portfolioId: txn.portfolioId, qty: 0, value: 0, events: [] };
          }
          grantGroups[key].qty += (txn.originalQty ?? txn.qty ?? 0);
          grantGroups[key].value += val;
          grantGroups[key].events.push(txn);
      } else {
          const convertedVal = convertCurrency(val, getTxnCurrency(txn), displayCurrency, exchangeRates);
          allTxns.push({
              date: txn.date,
              type: txn.type,
              ticker: txn.ticker,
              exchange: txn.exchange || '',
              portfolioId: txn.portfolioId,
              portfolioName: portfolios.find(p => p.id === txn.portfolioId)?.name || 'Unknown',
              name: getTickerName(txn.ticker, txn.portfolioId),
              qty: txn.originalQty ?? txn.qty ?? 0,
              value: convertedVal,
              original: txn
          });
      }
    });

    for (const key in grantGroups) {
        const g = grantGroups[key];
        const convertedVal = convertCurrency(g.value, getTxnCurrency(g.events[0]), displayCurrency, exchangeRates);
        allTxns.push({
            date: g.date,
            type: 'GRANT',
            ticker: g.ticker,
            exchange: g.exchange,
            portfolioId: g.portfolioId,
            portfolioName: portfolios.find(p => p.id === g.portfolioId)?.name || 'Unknown',
            name: getTickerName(g.ticker, g.portfolioId),
            qty: g.qty,
            value: convertedVal,
            original: g.events[0]
        });
    }

    (dividendRecords || []).forEach(div => {
        const val = div.grossAmount.amount;
        const divCurrency = normalizeCurrency(div.grossAmount.currency);
        const convertedVal = convertCurrency(val, divCurrency, displayCurrency, exchangeRates);
        allTxns.push({
            date: div.date,
            type: 'DIVIDEND',
            ticker: div.ticker,
            exchange: div.exchange || '',
            portfolioId: div.portfolioId,
            portfolioName: portfolios.find(p => p.id === div.portfolioId)?.name || 'Unknown',
            name: getTickerName(div.ticker, div.portfolioId),
            qty: div.unitsHeld || 0,
            value: convertedVal,
            original: div
        });
    });

    return allTxns;
  }, [transactions, dividendRecords, holdings, portfolios, exchangeRates, displayCurrency]);

  const sortedTransactionsData = useMemo(() => {
    const data = [...transactionsData];
    data.sort((a, b) => {
      let valA = a[txnSortConfig.key];
      let valB = b[txnSortConfig.key];

      if (txnSortConfig.key === 'date') {
        valA = new Date(valA).getTime();
        valB = new Date(valB).getTime();
      }

      if (valA < valB) return txnSortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return txnSortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return data;
  }, [transactionsData, txnSortConfig]);

  const handleEditTransaction = (e: React.MouseEvent, row: any) => {
    e.stopPropagation();
    if (row.type === 'DIVIDEND') {
      navigate('/transaction', {
        state: {
          editDividend: row.original
        }
      });
    } else {
      navigate('/transaction', {
        state: {
          editTransaction: row.original,
          initialName: row.name
        }
      });
    }
  };

  if (loading) {
      return <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>;
  }

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" fontWeight={800} sx={{ mb: 2, color: 'text.primary' }}>{t('All Transactions', 'כל הפעולות')}</Typography>
      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', borderRadius: 2 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>
                <TableSortLabel active={txnSortConfig.key === 'date'} direction={txnSortConfig.key === 'date' ? txnSortConfig.direction : 'desc'} onClick={() => setTxnSortConfig({ key: 'date', direction: txnSortConfig.key === 'date' && txnSortConfig.direction === 'desc' ? 'asc' : 'desc' })}>
                  {t('Date', 'תאריך')}
                </TableSortLabel>
              </TableCell>
              <TableCell>{t('Portfolio', 'תיק')}</TableCell>
              <TableCell>{t('Type', 'סוג')}</TableCell>
              <TableCell>{t('Ticker', 'סימול')}</TableCell>
              <TableCell>
                <TableSortLabel active={txnSortConfig.key === 'name'} direction={txnSortConfig.key === 'name' ? txnSortConfig.direction : 'desc'} onClick={() => setTxnSortConfig({ key: 'name', direction: txnSortConfig.key === 'name' && txnSortConfig.direction === 'desc' ? 'asc' : 'desc' })}>
                  {t('Name', 'שם')}
                </TableSortLabel>
              </TableCell>
              <TableCell align="right">{t('Qty', 'כמות')}</TableCell>
              <TableCell align="right">{t('Value', 'שווי')}</TableCell>
              <TableCell align="center">{t('Actions', 'פעולות')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedTransactionsData.map((row, idx) => (
              <TableRow 
                key={idx} 
                hover 
                onClick={() => navigate(`/ticker/${encodeURIComponent(row.exchange || 'unknown')}/${encodeURIComponent(row.ticker)}`)}
                sx={{ cursor: 'pointer' }}
              >
                <TableCell>{new Date(row.date).toLocaleDateString()}</TableCell>
                <TableCell>{row.portfolioName}</TableCell>
                <TableCell>{row.type}</TableCell>
                <TableCell>{row.exchange ? `${row.exchange}:${row.ticker}` : row.ticker}</TableCell>
                <TableCell>{row.name}</TableCell>
                <TableCell align="right">{row.qty.toFixed(2)}</TableCell>
                <TableCell align="right">{formatMoneyValue({ amount: row.value, currency: normalizeCurrency(displayCurrency) }, undefined)}</TableCell>
                <TableCell align="center">
                  <Tooltip title={t('Edit Transaction', 'ערוך עסקה')}>
                    <IconButton size="small" onClick={(e) => handleEditTransaction(e, row)}>
                      <EditIcon fontSize="small" sx={{ fontSize: '0.9rem', opacity: 0.7 }} />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {sortedTransactionsData.length === 0 && (
                <TableRow>
                    <TableCell colSpan={8} align="center">
                        {t('No transactions found.', 'לא נמצאו פעולות.')}
                    </TableCell>
                </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};
