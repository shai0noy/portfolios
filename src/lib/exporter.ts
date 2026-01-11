import { fetchTransactions, exportToSheet, fetchPortfolios, createEmptySpreadsheet, getSpreadsheet } from './sheets/index';

export const downloadCSV = (data: any[], filename: string) => {
  const csvContent = [
    Object.keys(data[0] || {}).join(','),
    ...data.map(row =>
      Object.keys(row).map(k => {
        let value = row[k] == null ? '' : String(row[k]);
        // Escape values with comma or quotes
        if (/,|"|\n/.test(value)) {
          value = `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export async function exportDashboardData(opts: {
  type: 'holdings' | 'transactions' | 'both';
  format: 'csv' | 'sheet';
  sheetId?: string;
  holdings?: any[];
  selectedPortfolioId?: string | null;
  portMap?: Map<string, any>;
  setLoading?: (b: boolean) => void;
  setExportMenuAnchorEl?: (el: HTMLElement | null) => void;
  onSuccess?: (msg: string, url?: string) => void;
  onError?: (msg: string) => void;
}) {
  const { type, format, sheetId, holdings, selectedPortfolioId, portMap, setLoading, setExportMenuAnchorEl, onSuccess, onError } = opts;
  setExportMenuAnchorEl?.(null);

  const t = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${t.getFullYear()}${pad(t.getMonth()+1)}${pad(t.getDate())}_${pad(t.getHours())}${pad(t.getMinutes())}${pad(t.getSeconds())}`;

  let data: any[] = [];
  let filename = '';
  let headers: string[] = [];

  const effectiveSheetId = sheetId || await getSpreadsheet() || undefined;

  // Prepare holdings data if requested
  let holdingsData: any[] | null = null;
  let holdingsHeaders: string[] = [];
  if (type === 'holdings' || type === 'both') {
    let resolvedHoldings = holdings;
    if (!resolvedHoldings || resolvedHoldings.length === 0) {
      if (effectiveSheetId) {
        try {
          const ports = await fetchPortfolios(effectiveSheetId);
          resolvedHoldings = [];
          ports.forEach(p => {
            p.holdings?.forEach((h: any) => {
              resolvedHoldings!.push({
                portfolioId: p.id,
                portfolioName: p.name,
                ticker: h.ticker,
                exchange: h.exchange,
                totalQty: h.qty || 0,
                avgCost: h.price || 0,
                currentPrice: h.price || 0,
                totalMV: h.totalValue || (h.qty && h.price ? h.qty * h.price : 0),
                dayChangePct: h.changePct || 0,
                unrealizedGain: 0,
                realizedGain: 0,
                dividends: 0,
                totalGain: 0,
                stockCurrency: h.currency || p.currency || 'USD',
                sector: h.sector || ''
              });
            });
          });
        } catch (e) {
          console.error('Failed to fetch portfolios to build holdings:', e);
          resolvedHoldings = [];
        }
      } else {
        resolvedHoldings = [];
      }
    }

    const filteredHoldings = selectedPortfolioId && resolvedHoldings ? resolvedHoldings.filter(h => h.portfolioId === selectedPortfolioId) : (resolvedHoldings || []);
    holdingsData = filteredHoldings.map(h => ({
      Portfolio: h.portfolioName,
      Ticker: h.ticker,
      Exchange: h.exchange,
      Quantity: h.totalQty,
      AvgCost: h.avgCost,
      Price: h.currentPrice,
      MarketValue: h.totalMV,
      DayChangePct: h.dayChangePct,
      UnrealizedGain: h.unrealizedGain,
      RealizedGain: h.realizedGain,
      Dividends: h.dividends,
      TotalGain: h.totalGain,
      Currency: h.stockCurrency,
      Sector: h.sector,
    }));
    holdingsHeaders = Object.keys(holdingsData[0] || {});
  }

  // Prepare transactions data if requested
  let transactionsData: any[] | null = null;
  let transactionsHeaders: string[] = [];
  if (type === 'transactions' || type === 'both') {
    if (!effectiveSheetId) {
      transactionsData = [];
    } else {
      const txns = await fetchTransactions(effectiveSheetId);
      let resolvedPortMap = portMap;
      if (!resolvedPortMap) {
        try {
          const ports = await fetchPortfolios(effectiveSheetId);
          resolvedPortMap = new Map(ports.map((p: any) => [p.id, p]));
        } catch (e) {
          console.error('Failed to fetch portfolios for transaction export:', e);
          resolvedPortMap = new Map();
        }
      }

      const filteredTxns = selectedPortfolioId ? txns.filter(t => t.portfolioId === selectedPortfolioId) : txns;
      transactionsData = filteredTxns.map((t: any) => ({
        Date: t.date,
        Portfolio: resolvedPortMap.get(t.portfolioId)?.name || t.portfolioId,
        Ticker: t.ticker,
        Exchange: t.exchange,
        Type: t.type,
        Qty: t.qty,
        Price: t.price,
        Currency: t.currency,
        Comment: t.comment
      }));
      transactionsHeaders = Object.keys(transactionsData[0] || {});
    }
  }

  // If single CSV export requested, set data/headers/filename accordingly
  if (format === 'csv') {
    if (type === 'holdings') {
      data = holdingsData || [];
      filename = 'holdings.csv';
      headers = holdingsHeaders;
    } else if (type === 'transactions') {
      data = transactionsData || [];
      filename = 'transactions.csv';
      headers = transactionsHeaders;
    } else {
      // both & csv not supported as a single CSV; fallback to exporting holdings then transactions separately
      if ((holdingsData || []).length > 0) downloadCSV(holdingsData!, `holdings_${stamp}.csv`);
      if ((transactionsData || []).length > 0) downloadCSV(transactionsData!, `transactions_${stamp}.csv`);
      onSuccess?.('Downloaded CSV exports');
      return;
    }

    if (!data || data.length === 0) {
      onError?.('No data to export.');
      if (!onError) alert('No data to export.');
      return;
    }

    downloadCSV(data, filename);
    onSuccess?.('Downloaded CSV');
    return;
  }

  // export to Google Sheet - create a new spreadsheet document and write sheet(s) into it
  try {
    setLoading?.(true);

    // Create a timestamped title to avoid duplicates
    const sheetsToWrite: Array<{sheetName: string, headers: string[], data: any[]}> = [];

    if (type === 'holdings' || type === 'both') {
      if (!holdingsData || holdingsData.length === 0) {
        onError?.('No holdings data to export.');
      } else {
        sheetsToWrite.push({ sheetName: 'Holdings', headers: holdingsHeaders, data: holdingsData });
      }
    }
    if (type === 'transactions' || type === 'both') {
      if (!transactionsData || transactionsData.length === 0) {
        onError?.('No transactions data to export.');
      } else {
        sheetsToWrite.push({ sheetName: 'Transactions', headers: transactionsHeaders, data: transactionsData });
      }
    }

    if (sheetsToWrite.length === 0) {
      onError?.('No data to export.');
      return;
    }

    const title = `Exported_${type}_${stamp}`;
    const newSpreadsheetId = await createEmptySpreadsheet(title);
    if (!newSpreadsheetId) throw new Error('Failed to create spreadsheet');

    for (const sheet of sheetsToWrite) {
      const dataForSheet = sheet.data.map(row => sheet.headers.map(h => row[h]));
      await exportToSheet(newSpreadsheetId, sheet.sheetName, sheet.headers, dataForSheet);
    }

    // Delete the default "Sheet1"
    try {
        const sheetsResponse = await window.gapi.client.sheets.spreadsheets.get({ spreadsheetId: newSpreadsheetId });
        const sheet1 = sheetsResponse.result.sheets?.find((s: any) => s.properties.title === 'Sheet1');
        if (sheet1 && sheet1.properties?.sheetId !== undefined) {
            await window.gapi.client.sheets.spreadsheets.batchUpdate({
                spreadsheetId: newSpreadsheetId,
                resource: {
                    requests: [{
                        deleteSheet: { sheetId: sheet1.properties.sheetId }
                    }]
                }
            });
        }
    } catch (e) {
        console.warn('Could not delete default Sheet1:', e);
    }

    const url = `https://docs.google.com/spreadsheets/d/${newSpreadsheetId}`;
    onSuccess?.(`Successfully exported to new Google Sheet: ${title}`, url);

  } catch (e) {
    console.error('Export to sheet failed:', e);
    const msg = e instanceof Error ? e.message : String(e);
    onError?.(`Export to Google Sheet failed: ${msg}`);
    if (!onError) alert('Export to Google Sheet failed. See console for details.');
  } finally {
    setLoading?.(false);
  }
}
