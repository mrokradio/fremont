export type AllocationSlice = {
    assetClass: string;
    percent: number;
};
export type Cashflow = {
    date: string;
    amount: number;
    description: string;
};
export type Position = {
    id: string;
    name: string;
    assetClass: string;
    value: number;
    costBasis?: number;
    irr?: number;
    tags?: string[];
    liquid?: boolean;
};
export type PortfolioSnapshot = {
    asOf: string;
    netWorth: number;
    liquidity: number;
    allocation: AllocationSlice[];
    upcomingCashflows: Cashflow[];
};
export type TransactionCategory = 'Capital Call' | 'Distribution' | 'Fee' | 'Interest' | 'Dividend' | 'Transfer' | 'Expense' | 'Other';
export type Transaction = {
    id: string;
    date: string;
    description: string;
    amount: number;
    category: TransactionCategory;
    tags?: string[];
};
export type HealthResponse = {
    status: 'ok';
    service: 'fremont-api';
    timestamp: string;
};
export type DashboardResponse = {
    snapshot: PortfolioSnapshot;
    positions: Position[];
    transactions: Transaction[];
};
