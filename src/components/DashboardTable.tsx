import React, { useState, useEffect, useCallback } from 'react';
import { Menu, MenuItem, Alert } from '@mui/material';
import { logIfFalsy } from '../lib/utils';
import type { ExchangeRates } from '../lib/types';
import type { EnrichedDashboardHolding } from '../lib/dashboard';
import { useLanguage } from '../lib/i18n';
import { DashboardGroup } from './DashboardGroup';

interface TableProps {
  holdings: EnrichedDashboardHolding[];
  groupedData: Record<string, EnrichedDashboardHolding[]>;
  groupByPortfolio: boolean;
  displayCurrency: string;
  exchangeRates: ExchangeRates;
  onSelectPortfolio: (id: string | null) => void;
  columnVisibility: Record<string, boolean>;
  onHideColumn: (column: string) => void;
  preventColumnHide?: boolean;
}

export function DashboardTable(props: TableProps) {
  const { groupedData, groupByPortfolio, displayCurrency, exchangeRates, onSelectPortfolio, columnVisibility, onHideColumn, preventColumnHide } = props;
  const { t } = useLanguage();

  const [sortBy, setSortBy] = useState<string>('marketValue');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number; column: string; } | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);

  useEffect(() => {
    if (exchangeRates && exchangeRates.current) {
      const missing = [];
      if (!exchangeRates.current.ILS) missing.push('ILS');
      if (!exchangeRates.current.EUR) missing.push('EUR');
      if (missing.length > 0) {
        setRateError(t(`Missing exchange rates for: ${missing.join(', ')}. Values may be 0. Check 'Currency_Conversions' sheet.`, `לא נמצאו שערי המרה עבור: ${missing.join(', ')}. ייתכן שערכים מסוימים יוצגו כ-0. יש לבדוק את גיליון 'Currency_Conversions'.`));
      } else {
        setRateError(null);
      }
    }
  }, [exchangeRates, t]);

  logIfFalsy(exchangeRates, "DashboardTable: exchangeRates missing");

  const handleSort = useCallback((key: string) => {
    setSortBy(prev => {
      if (prev === key) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        return prev;
      } else {
        setSortDir('desc');
        return key;
      }
    });
  }, []);

  const handleContextMenu = useCallback((event: React.MouseEvent, column: string) => {
    event.preventDefault();
    setContextMenu({ mouseX: event.clientX - 2, mouseY: event.clientY - 4, column });
  }, []);

  const handleCloseContextMenu = useCallback(() => setContextMenu(null), []);

  const handleHideColumn = useCallback(() => {
    if (contextMenu) onHideColumn(contextMenu.column);
    handleCloseContextMenu();
  }, [contextMenu, onHideColumn, handleCloseContextMenu]);

  return (
    <>
      {rateError && <Alert severity="error" sx={{ mb: 2 }}>{rateError}</Alert>}
      {Object.entries(groupedData).map(([groupName, groupHoldings]) => (
        <DashboardGroup
          key={groupName}
          groupName={groupName}
          groupHoldings={groupHoldings}
          groupByPortfolio={groupByPortfolio}
          displayCurrency={displayCurrency}
          exchangeRates={exchangeRates}
          columnVisibility={columnVisibility}
          onSelectPortfolio={onSelectPortfolio}
          onContextMenu={handleContextMenu}
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={handleSort}
        />
      ))}
      <Menu
        open={contextMenu !== null}
        onClose={handleCloseContextMenu}
        anchorReference="anchorPosition"
        anchorPosition={contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined}
      >
        <MenuItem onClick={handleHideColumn} disabled={preventColumnHide}>{t('Hide Column', 'הסתר עמודה')}</MenuItem>
      </Menu>
    </>
  );
}
