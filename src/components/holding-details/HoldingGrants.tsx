import React, { useMemo } from 'react';
import { Box, Typography, Card, CardContent, Divider, useTheme, Tooltip } from '@mui/material';
import { useLanguage } from '../../lib/i18n';
import { formatMoneyPrice, formatMoneyValue, formatPercent } from '../../lib/currencyUtils';
import { convertCurrency, normalizeCurrency } from '../../lib/currency';
import type { Lot } from '../../lib/data/model';
import type { ExchangeRates } from '../../lib/types';

export interface EnrichedLot extends Lot {
  portfolioId: string;
  portfolioCurrency?: string;
  vestDate?: Date | string;
}

interface HoldingGrantsProps {
  layers: EnrichedLot[];
  displayCurrency: string;
  exchangeRates: ExchangeRates | null;
  stockCurrency: string;
  portfolioNameMap: Record<string, string>;
  formatDate: (d: Date | string | undefined | null) => string;
  currentPrice: number;
}

interface GrantGroup {
  id: string; // unique ID for the grant group
  portfolioId: string;
  grantDate?: Date;
  costPerUnitPC: number;
  portfolioCurrency: string;
  totalQty: number;
  vestedQty: number;
  unvestedQty: number;
  lots: {
    qty: number;
    vestDate?: Date;
    isVested: boolean;
  }[];
  lastVestingDate?: Date;
  nextVestingDate?: Date;
  nextVestQty: number;
}

export const HoldingGrants: React.FC<HoldingGrantsProps> = ({
  layers,
  displayCurrency,
  exchangeRates,
  stockCurrency,
  portfolioNameMap,
  formatDate,
  currentPrice
}) => {
  const { t } = useLanguage();
  const theme = useTheme();

  const grants = useMemo(() => {
    const groups = new Map<string, GrantGroup>();

    layers.forEach(l => {
      const vDateStr = l.vestingDate || (l as any).vestDate;
      if (!vDateStr) return;

      const vDate = new Date(vDateStr);
      const isVested = vDate <= new Date();

      const gDate = l.date ? new Date(l.date) : undefined;
      const gDateKey = gDate ? gDate.getTime().toString() : 'unknown';
      const costPCStr = String(l.costPerUnit?.amount ?? (l as any).price ?? 0);
      const isILA = l.costPerUnit?.currency === 'ILA' || l.costPerUnit?.currency === ('אג' as any) || l.portfolioCurrency === 'ILA';
      const actualCostPC = Number(costPCStr) * (isILA ? 0.01 : 1);

      // Group by portfolio + grant date + grant price
      const key = `${l.portfolioId}-${gDateKey}-${actualCostPC}`;

      if (!groups.has(key)) {
        groups.set(key, {
          id: key,
          portfolioId: l.portfolioId,
          grantDate: gDate,
          costPerUnitPC: actualCostPC,
          portfolioCurrency: (l.costPerUnit?.currency || l.portfolioCurrency || 'USD') as string,
          totalQty: 0,
          vestedQty: 0,
          unvestedQty: 0,
          lots: [],
          nextVestQty: 0,
        });
      }

      const group = groups.get(key)!;
      const qty = l.qty || 0;

      group.lots.push({
        qty,
        vestDate: vDate,
        isVested
      });

      group.totalQty += qty;
      if (isVested) {
        group.vestedQty += qty;
        if (!group.lastVestingDate || vDate > group.lastVestingDate) {
          group.lastVestingDate = vDate;
        }
      } else {
        group.unvestedQty += qty;
        if (!group.nextVestingDate || vDate < group.nextVestingDate) {
          group.nextVestingDate = vDate;
          group.nextVestQty = qty;
        } else if (group.nextVestingDate && vDate.getTime() === group.nextVestingDate.getTime()) {
          group.nextVestQty += qty;
        }
      }
    });

    const sortedGroups = Array.from(groups.values()).sort((a, b) => {
      const aTime = a.grantDate ? a.grantDate.getTime() : 0;
      const bTime = b.grantDate ? b.grantDate.getTime() : 0;
      return bTime - aTime;
    });

    sortedGroups.forEach(g => {
      g.lots.sort((a, b) => {
        const aTime = a.vestDate ? a.vestDate.getTime() : 0;
        const bTime = b.vestDate ? b.vestDate.getTime() : 0;
        return aTime - bTime;
      });
    });

    return sortedGroups;
  }, [layers]);

  if (grants.length === 0) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography color="text.secondary">{t('No active grants found.', 'לא נמצאו מענקים פעילים.')}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="h6" color="primary" sx={{ fontWeight: 'bold' }}>
        {t('Equity Grants', 'מענקים הוניים')}
      </Typography>

      {grants.map((grant) => {
        const currentValSC = grant.totalQty * currentPrice;
        const currentValDisplay = convertCurrency(currentValSC, stockCurrency, displayCurrency, exchangeRates || undefined);
        const totalCostPC = grant.totalQty * grant.costPerUnitPC;

        const totalCostDisplay = convertCurrency(totalCostPC, grant.portfolioCurrency, displayCurrency, exchangeRates || undefined);

        const gainDisplay = currentValDisplay - totalCostDisplay;
        const gainPct = totalCostDisplay ? gainDisplay / totalCostDisplay : 0;

        // Unit cost in ticker's native currency (or ILA if ILS)
        const displayUnitCurrency = normalizeCurrency(grant.portfolioCurrency);
        // We do not convert the grant price to "displayCurrency" anymore. It should be the ticker's native.

        return (
          <Card key={grant.id} variant="outlined" sx={{ borderRadius: 2 }}>
            <CardContent sx={{ p: '16px !important' }}>
              <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                <Box display="flex" alignItems="baseline" gap={1} flexWrap="wrap">
                  <Typography variant="subtitle1" fontWeight="bold">
                    {grant.totalQty.toLocaleString()} {t('Units', 'יחידות')} - {formatDate(grant.grantDate) || t('Unknown Date', 'תאריך לא ידוע')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {portfolioNameMap[grant.portfolioId] || t('Unknown Portfolio', 'תיק לא ידוע')}
                  </Typography>
                </Box>
                <Box textAlign="right">
                  <Box display="flex" alignItems="baseline" justifyContent="flex-end" gap={1}>
                    <Typography variant="caption" color="text.secondary">
                      {t('Total Value', 'שווי כולל')}
                    </Typography>
                    <Typography variant="h6" fontWeight="bold" sx={{ lineHeight: 1.2 }}>
                      {formatMoneyValue({ amount: currentValDisplay, currency: normalizeCurrency(displayCurrency) })}
                    </Typography>
                  </Box>
                  <Box display="flex" alignItems="baseline" justifyContent="flex-end" gap={1}>
                    <Typography variant="caption" color="text.secondary">
                      {t('Change', 'שינוי')}
                    </Typography>
                    <Typography variant="body2" color={gainDisplay >= 0 ? 'success.main' : 'error.main'} fontWeight="bold">
                      {gainDisplay > 0 ? '+' : ''}{formatMoneyValue({ amount: gainDisplay, currency: normalizeCurrency(displayCurrency) })} ({formatPercent(gainPct)})
                    </Typography>
                  </Box>
                </Box>
              </Box>

              <Divider sx={{ my: 1.5 }} />

              <Box display="flex" flexDirection="row" gap={3}>
                <Box flex={1}>
                  <Box display="flex" flexWrap="wrap" gap={3}>
                    <Box>
                      <Typography variant="caption" color="text.secondary" display="block">{t('Total Quantity', 'כמות כוללת')}</Typography>
                      <Typography variant="body2" fontWeight="medium">{grant.totalQty.toLocaleString()}</Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary" display="block">{t('Vested', 'הבשיל')}</Typography>
                      <Typography variant="body2" fontWeight="medium" color="success.main">
                        {grant.vestedQty.toLocaleString()} {formatMoneyValue({ amount: convertCurrency(grant.vestedQty * currentPrice, stockCurrency, displayCurrency, exchangeRates || undefined), currency: normalizeCurrency(displayCurrency) })}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary" display="block">{t('Unvested', 'טרם הבשיל')}</Typography>
                      <Typography variant="body2" fontWeight="medium">
                        {grant.unvestedQty.toLocaleString()} {formatMoneyValue({ amount: convertCurrency(grant.unvestedQty * currentPrice, stockCurrency, displayCurrency, exchangeRates || undefined), currency: normalizeCurrency(displayCurrency) })}
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="caption" color="text.secondary" display="block">{t('Grant Price', 'מחיר מענק')}</Typography>
                      <Typography variant="body2" fontWeight="medium">
                        {formatMoneyPrice({ amount: grant.costPerUnitPC, currency: displayUnitCurrency }, t)}
                        {/* <Typography component="span" variant="caption" color="text.secondary"> / unit</Typography> */}
                      </Typography>
                    </Box>
                    {grant.nextVestingDate && (
                      <Box>
                        <Typography variant="caption" color="text.secondary" display="block">{t('Next Vest', 'הבשלה קרובה')}</Typography>
                        <Typography variant="body2" fontWeight="medium">
                          {formatDate(grant.nextVestingDate)} {formatMoneyValue({ amount: convertCurrency(grant.nextVestQty * currentPrice, stockCurrency, displayCurrency, exchangeRates || undefined), currency: normalizeCurrency(displayCurrency) })}
                        </Typography>
                      </Box>
                    )}
                    {grant.lastVestingDate && (
                      <Box>
                        <Typography variant="caption" color="text.secondary" display="block">{t('Last Vesting', 'הבשלה אחרונה')}</Typography>
                        <Typography variant="body2" fontWeight="medium">{formatDate(grant.lastVestingDate)}</Typography>
                      </Box>
                    )}
                  </Box>
                </Box>

                <Box sx={{ flexShrink: 0, minWidth: { xs: 80, sm: 160 }, maxWidth: { xs: 100, sm: 220 } }}>
                  <Typography variant="caption" fontWeight="bold" color="text.secondary" sx={{ display: 'block', mb: 1, textAlign: { xs: 'left', sm: 'right' } }}>
                    {Math.round((grant.vestedQty / grant.totalQty) * 100)}% {t('Vested', 'הבשיל')}
                  </Typography>
                  <Box display="flex" flexWrap="wrap" gap={0.5} justifyContent={{ xs: 'flex-start', sm: 'flex-end' }}>
                    {grant.lots.map((lot, idx) => {
                      const lotValSC = lot.qty * currentPrice;
                      const lotValDisplay = convertCurrency(lotValSC, stockCurrency, displayCurrency, exchangeRates || undefined);
                      const lotValFormatted = formatMoneyValue({ amount: lotValDisplay, currency: normalizeCurrency(displayCurrency) });

                      return (
                        <Tooltip
                          key={idx}
                          title={`${formatDate(lot.vestDate)} • ${lot.qty.toLocaleString()} ${t('units', 'יחידות')} • ${lotValFormatted}`}
                          arrow
                          placement="top"
                        >
                          <Box
                            sx={{
                              width: 14,
                              height: 14,
                              borderRadius: '3px',
                              bgcolor: lot.isVested ? 'success.main' : (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'),
                              border: '1px solid',
                              borderColor: lot.isVested ? 'success.dark' : (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'),
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              '&:hover': {
                                transform: 'scale(1.2)',
                                borderColor: lot.isVested ? 'success.light' : 'primary.main',
                              }
                            }}
                          />
                        </Tooltip>
                      );
                    })}
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>
        );
      })}
    </Box>
  );
};
