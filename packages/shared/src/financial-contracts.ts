import type { PlanningCashflowStore, PlanningScenarioInputs } from './financial-core';

export type PlanningScenarioRecord = {
  id: string;
  name: string;
  startYear: number;
  horizonYears: number;
  baseNetWorth: number;
  baseLiquidity: number;
  inputs: Record<string, unknown>;
  events: Record<string, unknown>[];
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

export type FinancialProfile = {
  userId: string;
  baseNetWorth: number;
  baseLiquidity: number;
  assumptions: PlanningScenarioInputs;
  updatedAt: string;
};

export type FinancialFactBundle = {
  positionsCount: number;
  transactionsCount: number;
  assetsCount: number;
  documentsCount: number;
  cashflows: PlanningCashflowStore;
};

export type ProjectionPoint = {
  year: number;
  income: number;
  outflow: number;
  taxes: number;
  netWorth: number;
  liquidity: number;
  nonLiquid: number;
};

export type ProjectionResponse = {
  scenarioId: string;
  startYear: number;
  horizonYears: number;
  baseNetWorth: number;
  baseLiquidity: number;
  points: ProjectionPoint[];
  generatedAt: string;
};

export type ScenarioCompareResponse = {
  baselineScenarioId: string;
  comparisonScenarioId: string;
  deltaNetWorthAtHorizon: number;
  deltaLiquidityAtHorizon: number;
  negativeLiquidityYears: number[];
};

export type DataQualitySeverity = 'info' | 'warning';

export type DataQualityWarning = {
  code: string;
  message: string;
  severity: DataQualitySeverity;
};

export type StrategyYearFact = {
  strategy: string;
  capital: number;
  capitalYear: number | null;
  targetReturnRate: number;
  actualReturnRate: number;
  plannedLiquidityRate: number;
  actualLiquidityRate: number;
  targetReturnValue: number;
  actualReturnValue: number;
  plannedLiquidityValue: number;
  actualLiquidityValue: number;
  returnVariance: number;
  liquidityVariance: number;
};

export type ReportingYearFacts = {
  year: number;
  strategyRows: StrategyYearFact[];
  totalReturnVariance: number;
  totalLiquidityVariance: number;
  returnImpactPct: number;
  baselineScenarioId: string | null;
  baselineScenarioName: string | null;
  plannedNetWorth: number | null;
  plannedLiquidity: number | null;
  actualNetWorth: number;
  actualLiquidity: number;
  netWorthVariance: number | null;
  liquidityVariance: number | null;
  transactionNetFlow: number;
  warnings: DataQualityWarning[];
};

export type ScenarioComparePoint = {
  year: number;
  baselineNetWorth: number;
  comparisonNetWorth: number;
  baselineLiquidity: number;
  comparisonLiquidity: number;
  deltaNetWorth: number;
  deltaLiquidity: number;
};

export type ScenarioCompareDetailResponse = ScenarioCompareResponse & {
  points: ScenarioComparePoint[];
};

export type FinancialWorkspaceResponse = {
  year: number;
  profile: FinancialProfile;
  cashflows: PlanningCashflowStore;
  positionsCount: number;
  transactionsCount: number;
  scenarios: Array<{ id: string; name: string; startYear: number; horizonYears: number }>;
  facts: ReportingYearFacts;
};

export type UpsertFinancialProfileRequest = {
  baseNetWorth: number;
  baseLiquidity: number;
  assumptions: PlanningScenarioInputs;
};

export type UpsertCashflowsRequest = PlanningCashflowStore;
export type CashflowsResponse = PlanningCashflowStore;

export type UpsertScenarioRequest = {
  scenario: PlanningScenarioRecord;
};
