export const STRATEGY_KINDS = [
  'Liquidity Program',
  'OpCos',
  'BF Global',
  'Opportunities Fund',
] as const;

export type StrategyKind = (typeof STRATEGY_KINDS)[number];

export type StrategyExposure = {
  id: string;
  strategy: StrategyKind;
  capital: number;
};

export type StrategyBenchmark = {
  id: string;
  strategy: StrategyKind;
  year: number;
  targetReturnRate: number; // 0..1
  actualReturnRate: number; // 0..1
  plannedLiquidityRate: number; // 0..1
  actualLiquidityRate: number; // 0..1
};

export type StrategyReportingBundle = {
  exposures: StrategyExposure[];
  benchmarks: StrategyBenchmark[];
};

export type StrategyExposureWriteInput = {
  strategy: StrategyKind;
  capital: number;
};

export type StrategyBenchmarkWriteInput = {
  strategy: StrategyKind;
  year: number;
  targetReturnRate: number;
  actualReturnRate: number;
  plannedLiquidityRate: number;
  actualLiquidityRate: number;
};

export type UpsertStrategyExposuresRequest = {
  exposures: StrategyExposureWriteInput[];
};

export type UpsertStrategyBenchmarksRequest = {
  benchmarks: StrategyBenchmarkWriteInput[];
};
