export interface ColDef {
    key: string;
    colName: string;
    colId: string;
    numeric?: boolean;
    formula?: (rowNum: number, cols: any) => string;
}

export type TransactionKey = 'date' | 'portfolioId' | 'ticker' | 'exchange' | 'type' | 'originalQty' | 'originalPrice' | 'currency' | 'originalPriceILA' | 'originalPriceUSD' | 'vestDate' | 'comment' | 'commission' | 'source' | 'creationDate' | 'origOpenPriceAtCreationDate' | 'splitAdjOpenPrice' | 'splitRatio' | 'splitAdjustedPrice' | 'splitAdjustedQty' | 'numericId' | 'grossValue' | 'linkId';

// Note: This must match the keys in TXN_COLS
export type TransactionColumns = {
    date: ColDef;
    portfolioId: ColDef;
    ticker: ColDef;
    exchange: ColDef;
    type: ColDef;
    originalQty: ColDef;
    originalPrice: ColDef;
    currency: ColDef;
    originalPriceILA: ColDef;
    originalPriceUSD: ColDef;
    vestDate: ColDef;
    comment: ColDef;
    commission: ColDef;
    source: ColDef;
    creationDate: ColDef;
    origOpenPriceAtCreationDate: ColDef;
    splitAdjOpenPrice: ColDef;
    splitRatio: ColDef;
    splitAdjustedPrice: ColDef;
    splitAdjustedQty: ColDef;
    numericId: ColDef;
    grossValue: ColDef;
};

export type TxnKey = keyof TransactionColumns;

import type { Exchange } from '../types';

export interface TrackingListItem {
    listName: string;
    ticker: string;
    exchange: Exchange;
    dateAdded: Date;
    rowIndex?: number;
}
