
// --- Column Definitions ---
export interface TxnColumnDef {
    key: string;
    colName: string;
    colId: string;
    numeric?: boolean;
    formula?: (rowNum: number, cols: TransactionColumns) => string;
}

// Utility type to enforce all keys of Transaction are present
export type TransactionColumns = {
    [key: string]: TxnColumnDef;
};
