import { Box, Paper, Table, TableHead, TableRow, TableCell, TableBody } from '@mui/material';
import { formatPercent, formatNumber, formatMoneyValue } from '../../lib/currency';
import { useLanguage } from '../../lib/i18n';
import type { PortfolioGroup } from './types';

interface HoldingDistributionProps {
    groupedLayers: PortfolioGroup[];
}

export function HoldingDistribution({ groupedLayers }: HoldingDistributionProps) {
    const { t } = useLanguage();

    return (
        <Box sx={{ mb: 4 }}>
            <Paper variant="outlined">
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ bgcolor: 'background.paper' }}>{t('Portfolio', 'תיק')}</TableCell>
                            <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Weight', 'משקל')}</TableCell>
                            <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Original Qty', 'כמות מקורית')}</TableCell>
                            <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Current Qty', 'כמות נוכחית')}</TableCell>
                            <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Total Cost', 'עלות כוללת')}</TableCell>
                            <TableCell align="right" sx={{ bgcolor: 'background.paper' }}>{t('Value', 'שווי')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {groupedLayers.map(group => (
                            <TableRow key={group.portfolioId} hover>
                                <TableCell component="th" scope="row" sx={{ fontWeight: 'bold' }}>{group.portfolioName}</TableCell>
                                <TableCell align="right">{formatPercent(group.stats.weight)}</TableCell>
                                <TableCell align="right">{formatNumber(group.stats.originalQty)}</TableCell>
                                <TableCell align="right">{formatNumber(group.stats.currentQty)}</TableCell>
                                <TableCell align="right">{formatMoneyValue(group.stats.cost)}</TableCell>
                                <TableCell align="right">{formatMoneyValue(group.stats.value)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </Paper>
        </Box>
    );
}
