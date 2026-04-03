export type TaxBasis = 'gross_income' | 'net_income';

export type CashflowItem = {
  id: string;
  name: string;
  amount: number;
  start: number;
  end: number;
};

export type PlanningCashflowStore = {
  income: CashflowItem[];
  outflow: CashflowItem[];
};

export type PlanningTaxAssumptions = {
  taxRate: number; // 0..1
  taxBasis: TaxBasis;
};

export type PlanningScenarioInputs = PlanningTaxAssumptions & {
  inflationRate?: number; // 0..1
  returnRate?: number; // 0..1
};

export type FinancialDataDomain =
  | 'capture'
  | 'assumptions'
  | 'planning'
  | 'reporting';

export type LocalStorageKeys = {
  authToken: string;
  assets: string;
  expenses: string;
  planningDefaults: string;
  planningCashflows: string;
  planningScenarios: string;
  documents: string;
  documentFolders: string;
  newsFeed: string;
  activityLog: string;
  activityIp: string;
  activityUserId: string;
  activityUserName: string;
  activityUpdatedEvent: string;
  strategyReporting: string;
  strategyBenchmarks: string;
};

export const LOCAL_STORAGE_KEYS: LocalStorageKeys = {
  authToken: 'fremont.auth.accessToken.v1',
  assets: 'fremont.assets.v1',
  expenses: 'fremont.expenses.v1',
  planningDefaults: 'fremont.planning.defaults.v1',
  planningCashflows: 'fremont.planning.cashflows.v1',
  planningScenarios: 'fremont.scenarios.v1',
  documents: 'fremont.documents.v1',
  documentFolders: 'fremont.documents.folders.v1',
  newsFeed: 'fremont.newsFeed.v1',
  activityLog: 'fremont.activity.log.v1',
  activityIp: 'fremont.activity.ip',
  activityUserId: 'fremont.activity.userId',
  activityUserName: 'fremont.activity.userName',
  activityUpdatedEvent: 'fremont.activity.updated',
  strategyReporting: 'fremont.reporting.strategy.v1',
  strategyBenchmarks: 'fremont.reporting.strategy.benchmarks.v1',
};
