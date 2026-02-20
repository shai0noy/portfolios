import { Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper } from '@mui/material';
import { useLanguage } from '../../lib/i18n';

interface HoldingUnderlyingAssetsProps {
    assets?: { name: string, weight: number }[];
}

export function HoldingUnderlyingAssets({ assets }: HoldingUnderlyingAssetsProps) {
    const { t } = useLanguage();

    if (!assets || assets.length === 0) return null;

    // Sort by weight descending
    const sortedAssets = [...assets].sort((a, b) => b.weight - a.weight);

    return (
        <Box sx={{ mt: 3, mb: 2 }}>
            <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                {t('Underlying Assets', 'נכסי בסיס')}
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300 }}>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell>{t('Asset', 'נכס')}</TableCell>
                            <TableCell align="right">{t('Weight', 'משקל')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {sortedAssets.map((asset, index) => (
                            <TableRow key={index} hover>
                                <TableCell component="th" scope="row" sx={{ fontSize: '0.875rem' }}>
                                    {asset.name}
                                </TableCell>
                                <TableCell align="right" sx={{ fontSize: '0.875rem' }}>
                                    {asset.weight.toFixed(2)}%
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}
