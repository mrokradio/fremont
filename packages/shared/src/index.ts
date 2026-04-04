export type AllocationSlice = {
  assetClass: string;
  percent: number; // 0..1
};

export type Cashflow = {
  date: string; // YYYY-MM-DD
  amount: number; // USD
  description: string;
};

// Asset class taxonomy
// Top-level categories used to classify positions in the portfolio
export type TopLevelAssetCategory =
  | 'Fremont Holdings'
  | 'Cash'
  | 'Residential Real Estate'
  | 'BGI'
  | 'Other Assets';

// Sub-categories within Fremont Holdings
export type FremontSubCategory =
  | 'Private Equity'
  | 'Public Equity'
  | 'Diversifying Assets'
  | 'Fixed Income'
  | 'Real Assets'
  | 'Cash';

export const TOP_LEVEL_ASSET_CATEGORIES: TopLevelAssetCategory[] = [
  'Fremont Holdings',
  'Cash',
  'Residential Real Estate',
  'BGI',
  'Other Assets',
];

export const FREMONT_SUB_CATEGORIES: FremontSubCategory[] = [
  'Private Equity',
  'Public Equity',
  'Diversifying Assets',
  'Fixed Income',
  'Real Assets',
  'Cash',
];

export type Position = {
  id: string;
  name: string;
  assetClass: string;
  year?: number; // YYYY
  value: number; // USD
  costBasis?: number; // USD
  irr?: number; // 0..1
  tags?: string[];
  liquid?: boolean;
  owner?: string; // legal entity / trust / individual (e.g. "Smith Family Trust")
};

export type PositionWriteInput = {
  name: string;
  assetClass: string;
  year?: number;
  value: number;
  costBasis?: number;
  irr?: number;
  tags?: string[];
  liquid?: boolean;
  owner?: string; // legal entity / trust / individual
};

// Per-position cash flow entry for inception-to-date performance tracking
export type PositionCashflow = {
  id: string;
  positionId: string;
  date: string; // YYYY-MM-DD
  amount: number; // positive = contribution/capital call, negative = distribution/withdrawal
  note?: string;
  createdAt: string;
};

export type PositionCashflowWriteInput = {
  date: string;
  amount: number;
  note?: string;
};

// Liability category options
export type LiabilityCategory =
  | 'Mortgage'
  | 'Note Payable'
  | 'Committed Grant'
  | 'Line of Credit'
  | 'Other';

export const LIABILITY_CATEGORIES: LiabilityCategory[] = [
  'Mortgage',
  'Note Payable',
  'Committed Grant',
  'Line of Credit',
  'Other',
];

export type Liability = {
  id: string;
  name: string;
  category: LiabilityCategory | string;
  balance: number; // outstanding balance (positive number), USD
  rate?: number; // annual interest rate 0..1
  maturityDate?: string; // YYYY-MM-DD
  owner?: string; // legal entity / individual
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type LiabilityWriteInput = {
  name: string;
  category: LiabilityCategory | string;
  balance: number;
  rate?: number;
  maturityDate?: string;
  owner?: string;
  note?: string;
};

export type AssetRecord = {
  id: string;
  ownerId: string;
  name: string;
  category: string;
  value: number; // USD
  liquid: boolean;
  owner?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
};

export type AssetWriteInput = {
  name: string;
  category: string;
  value: number;
  liquid?: boolean;
  owner?: string;
  note?: string;
};

export type PortfolioSnapshot = {
  asOf: string; // YYYY-MM-DD
  netWorth: number; // USD
  liquidity: number; // USD
  allocation: AllocationSlice[];
  upcomingCashflows: Cashflow[];
};

export type TransactionCategory =
  | 'Capital Call'
  | 'Distribution'
  | 'Fee'
  | 'Interest'
  | 'Dividend'
  | 'Transfer'
  | 'Expense'
  | 'Other';

export type Transaction = {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // USD (+inflow, -outflow)
  category: TransactionCategory;
  tags?: string[];
};

export type TransactionWriteInput = {
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

export type UserRole = 'ADMIN' | 'ANALYST' | 'VIEWER';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

export type AccountProvider = 'Password' | 'Google' | 'Microsoft';

export type UserContactInfo = {
  phone?: string;
  secondaryEmail?: string;
  title?: string;
  company?: string;
  location?: string;
  notes?: string;
  updatedAt: string;
};

export type UserAccountAssociation = {
  id: string;
  provider: AccountProvider;
  identifier: string;
  linkedAt: string;
  removable: boolean;
};

export type UserProfileResponse = {
  userId: string;
  name: string;
  email: string;
  role: UserRole;
  contact: UserContactInfo;
  associations: UserAccountAssociation[];
};

export type UpsertUserContactRequest = {
  phone?: string;
  secondaryEmail?: string;
  title?: string;
  company?: string;
  location?: string;
  notes?: string;
};

export type AddUserAccountAssociationRequest = {
  provider: Exclude<AccountProvider, 'Password'>;
  identifier: string;
};

export type AuthLoginRequest = {
  email: string;
  password: string;
};

export type AuthLoginResponse = {
  accessToken: string;
  expiresAt: string;
  user: AuthUser;
};

export type AuthGoogleUrlResponse = {
  url: string;
  state: string;
};

export type AuthGoogleExchangeRequest = {
  code: string;
  state: string;
  redirectUri: string;
};

export type AuthMicrosoftUrlResponse = {
  url: string;
  state: string;
};

export type AuthMicrosoftExchangeRequest = {
  code: string;
  state: string;
  redirectUri: string;
};

export type CreateUserRequest = {
  email: string;
  name: string;
  password: string;
  role?: UserRole;
};

export type UpdateUserRoleRequest = {
  role: UserRole;
};

export type JsonRecord = Record<string, unknown>;

export type PlanningScenario = {
  id: string;
  name: string;
  startYear: number;
  horizonYears: number;
  baseNetWorth: number;
  baseLiquidity: number;
  inputs: JsonRecord;
  events: JsonRecord[];
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

export type PlanningScenarioWriteInput = {
  name: string;
  startYear: number;
  horizonYears: number;
  baseNetWorth: number;
  baseLiquidity: number;
  inputs: JsonRecord;
  events: JsonRecord[];
};

export type IngestionMode = 'append' | 'replace';

export type CsvIngestRequest = {
  csv: string;
  dryRun?: boolean;
  mode?: IngestionMode;
};

export type CsvIngestError = {
  row: number;
  message: string;
};

export type CsvIngestResult<T> = {
  dryRun: boolean;
  mode: IngestionMode;
  imported: number;
  preview: T[];
  errors: CsvIngestError[];
};

export type {
  CashflowItem,
  FinancialDataDomain,
  LocalStorageKeys,
  PlanningCashflowStore,
  PlanningScenarioInputs,
  PlanningTaxAssumptions,
  TaxBasis,
} from './financial-core';
export { LOCAL_STORAGE_KEYS } from './financial-core';

export type {
  FinancialFactBundle,
  FinancialProfile,
  PlanningScenarioRecord,
  ProjectionPoint,
  ProjectionResponse,
  CashflowsResponse,
  DataQualitySeverity,
  DataQualityWarning,
  FinancialWorkspaceResponse,
  ReportingYearFacts,
  ScenarioCompareDetailResponse,
  ScenarioComparePoint,
  ScenarioCompareResponse,
  StrategyYearFact,
  UpsertCashflowsRequest,
  UpsertFinancialProfileRequest,
  UpsertScenarioRequest,
} from './financial-contracts';

export type {
  StrategyBenchmark,
  StrategyBenchmarkWriteInput,
  StrategyExposure,
  StrategyExposureWriteInput,
  StrategyKind,
  StrategyReportingBundle,
  UpsertStrategyBenchmarksRequest,
  UpsertStrategyExposuresRequest,
} from './strategy-reporting';
export { STRATEGY_KINDS } from './strategy-reporting';
