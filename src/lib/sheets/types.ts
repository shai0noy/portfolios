
// --- Column Definitions ---

export type TxnKey = 
    | 'date' | 'portfolioId' | 'ticker' | 'exchange' | 'type' 
    | 'originalQty' | 'originalPrice' | 'currency' | 'originalPriceILA' | 'originalPriceUSD'
    | 'vestDate' | 'comment' | 'commission' | 'tax' | 'source' 
    | 'creationDate' | 'origOpenPriceAtCreationDate' | 'splitAdjOpenPrice' | 'splitRatio'
    | 'splitAdjustedPrice' | 'splitAdjustedQty' | 'numericId' | 'grossValue' | 'valueAfterTax';

export interface TxnColumnDef {
    key: TxnKey;
    colName: string;
    colId: string;
    numeric?: boolean;
    formula?: (rowNum: number, cols: TransactionColumns) => string;
}

// Utility type to enforce all keys of Transaction are present
export type TransactionColumns = Record<TxnKey, TxnColumnDef>;
