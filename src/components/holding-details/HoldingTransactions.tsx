import { Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody, Tooltip, IconButton } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { formatValue, formatNumber, formatPrice } from '../../lib/currency';
import { useLanguage } from '../../lib/i18n';
import type { Transaction } from '../../lib/types';
import { isBuy, isSell } from '../../lib/types';

interface HoldingTransactionsProps {
    txnHistory: Transaction[];
    portfolioNameMap: Record<string, string>;
    formatDate: (d: string | Date | number) => string;
    onEditTransaction: (txn: Transaction) => void;
}

export function HoldingTransactions({ txnHistory, portfolioNameMap, formatDate, onEditTransaction }: HoldingTransactionsProps) {
    const { t } = useLanguage();

    return (
        <Box>
            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>{t('Transaction History', 'היסטוריית עסקאות')}</Typography>
            <Paper variant="outlined" sx={{ maxHeight: 500, overflowY: 'auto' }}>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ bgcolor: 'background.paper' }}>{t('Date', 'תאריך')}</TableCell>
                            <TableCell sx={{ bgcolor: 'background.paper' }}>{t('Action', 'פעולה')}</TableCell>
                            <TableCell sx={{ bgcolor: 'background.paper', maxWidth: 100 }}>{t('Portfolio', 'תיק')}</TableCell>
                            <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Qty', 'כמות')}</TableCell>
                            <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Price', 'מחיר')}</TableCell>
                            <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Value', 'שווי')}</TableCell>
                            <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Fees', 'עמלות')}</TableCell>
                            <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Vesting Date', 'תאריך הבשלה')}</TableCell>
                            <TableCell align="center" sx={{ bgcolor: 'background.paper' }}></TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {txnHistory.map((txn, i) => {
                            const rawValue = (txn.qty || 0) * (txn.price || 0);
                            const fees = txn.commission || 0;
                            const tickerCurrency = txn.currency || 'USD';

                            // If vesting date exists and type is BUY, show Grant
                            let typeLabel = txn.type;
                            if (isBuy(txn.type) && txn.vestDate) {
                                typeLabel = 'Grant' as any;
                            }
                            const txnPortfolioName = portfolioNameMap[txn.portfolioId] || txn.portfolioId;

                            const titleCase = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
                            // Handle BUY_TRANSFER -> Buy Transfer
                            const displayLabel = titleCase(typeLabel).replace('_', ' ');

                            const isBuyTxn = isBuy(txn.type);
                            const isSellTxn = isSell(txn.type);

                            return (
                                <TableRow key={i} hover>
                                    <TableCell>{formatDate(txn.date)}</TableCell>
                                    <TableCell>
                                        <Typography
                                            variant="caption"
                                            fontWeight="bold"
                                            sx={{ color: isBuyTxn ? 'primary.main' : isSellTxn ? 'secondary.main' : 'text.secondary' }}
                                        >
                                            {displayLabel}
                                        </Typography>
                                    </TableCell>
                                    <TableCell sx={{ maxWidth: 100, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        <Tooltip title={txnPortfolioName} enterTouchDelay={0} leaveTouchDelay={3000}>
                                            <span>{txnPortfolioName}</span>
                                        </Tooltip>
                                    </TableCell>
                                    <TableCell align="right">{formatNumber(txn.qty)}</TableCell>
                                    <TableCell align="right">{formatPrice(txn.price || 0, tickerCurrency)}</TableCell>
                                    <TableCell align="right">{formatValue(rawValue, tickerCurrency)}</TableCell>
                                    <TableCell align="right" sx={{ color: 'text.secondary' }}>{fees > 0 ? formatValue(fees, tickerCurrency) : '-'}</TableCell>
                                    <TableCell align="right">{txn.vestDate ? formatDate(txn.vestDate) : '-'}</TableCell>
                                    <TableCell align="center">
                                        <Tooltip title={t('Edit Transaction', 'ערוך עסקה')}>
                                            <IconButton size="small" onClick={() => onEditTransaction(txn)}>
                                                <EditIcon fontSize="small" sx={{ fontSize: '0.9rem', opacity: 0.7 }} />
                                            </IconButton>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                        {txnHistory.length === 0 && (
                            <TableRow><TableCell colSpan={9} align="center" sx={{ py: 3, color: 'text.secondary' }}>{t('No transactions found.', 'לא נמצאו עסקאות.')}</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </Paper>
        </Box>
    );
}
