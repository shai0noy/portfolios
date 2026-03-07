import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Tooltip, useTheme } from '@mui/material';
import { useLanguage } from '../../lib/i18n';
import { useScrollShadows, ScrollShadows } from '../../lib/ui-utils';

interface HoldingUnderlyingAssetsProps {
    assets?: { name: string, weight: number }[];
}

export function HoldingUnderlyingAssets({ assets }: HoldingUnderlyingAssetsProps) {
    const { t } = useLanguage();
    const theme = useTheme();
    const { containerRef, showTop, showBottom, showLeft, showRight } = useScrollShadows('both');

    if (!assets || assets.length === 0) return null;

    // Sort by weight descending
    const sortedAssets = [...assets].sort((a, b) => b.weight - a.weight);

    return (
        <Box sx={{ mt: 3, mb: 2 }}>
            <Box display="flex" alignItems="center" gap={1} mb={1}>
                <Typography variant="subtitle2" color="text.secondary">
                    {t('Underlying Assets', 'נכסי בסיס')}
                </Typography>
                <Tooltip title={t('Reported by TASE and might not accurately reflect all held assets', 'מדווח על ידי הבורסה ועשוי שלא לשקף במדויק את כל הנכסים המוחזקים')} arrow enterTouchDelay={0} leaveTouchDelay={3000}>
                    <InfoOutlinedIcon fontSize="small" color="action" sx={{ opacity: 0.7, fontSize: '0.9rem' }} />
                </Tooltip>
            </Box>
            <Box sx={{ position: 'relative' }}>
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300, overflowX: 'auto' }} ref={containerRef}>
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
                <ScrollShadows top={showTop} bottom={showBottom} left={showLeft} right={showRight} theme={theme} />
            </Box>
        </Box>
    );
}
