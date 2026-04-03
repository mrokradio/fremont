import type { StrategyKind } from '@fremont/shared';

export const STRATEGY_KINDS = [
  'Liquidity Program',
  'OpCos',
  'BF Global',
  'Opportunities Fund',
] as const satisfies readonly StrategyKind[];

