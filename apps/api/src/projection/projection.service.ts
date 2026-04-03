import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CashflowItemKind, type PlanningScenario as PlanningScenarioRow } from '@prisma/client';
import type { ProjectionPoint, ProjectionResponse, ScenarioCompareDetailResponse, TaxBasis } from '@fremont/shared';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../common/prisma.service';

type ScenarioEvent = {
  year?: number;
  asset?: string;
  duration?: number;
  cost?: number;
  recurring?: number;
  recurringGrowth?: number;
  usefulLifeYears?: number;
  residualPct?: number;
  action?: 'buy' | 'sell';
  transfer?: number;
};

const CAPITAL_ASSETS = new Set(['Real Estate', 'Car', 'Boat', 'Airplane', 'OpCos']);

@Injectable()
export class ProjectionService {
  constructor(private readonly prisma: PrismaService) {}

  private canRead(user: AuthenticatedUser, ownerId: string): boolean {
    return user.role === 'ADMIN' || user.id === ownerId;
  }

  private normalizeTax(inputs: Record<string, unknown> | undefined): { rate: number; basis: TaxBasis } {
    const rawRate = Number(inputs?.taxRate ?? 0);
    const rate = Number.isFinite(rawRate) ? Math.max(0, Math.min(1, rawRate)) : 0;
    const basis: TaxBasis = inputs?.taxBasis === 'net_income' ? 'net_income' : 'gross_income';
    return { rate, basis };
  }

  private normalizeEvents(value: unknown): ScenarioEvent[] {
    if (!Array.isArray(value)) return [];
    return value as ScenarioEvent[];
  }

  async projectScenario(user: AuthenticatedUser, scenarioId: string): Promise<ProjectionResponse> {
    const scenario = await this.prisma.planningScenario.findUnique({ where: { id: scenarioId } });
    if (!scenario) throw new NotFoundException('Scenario not found');
    if (!this.canRead(user, scenario.ownerId)) throw new ForbiddenException('Cannot view this scenario');

    return this.buildProjection(scenario);
  }

  async projectScenarioForOwner(
    user: AuthenticatedUser,
    scenarioId: string,
  ): Promise<{ scenario: PlanningScenarioRow; projection: ProjectionResponse }> {
    const scenario = await this.prisma.planningScenario.findUnique({ where: { id: scenarioId } });
    if (!scenario) throw new NotFoundException('Scenario not found');
    if (!this.canRead(user, scenario.ownerId)) throw new ForbiddenException('Cannot view this scenario');
    const projection = await this.buildProjection(scenario);
    return { scenario, projection };
  }

  async compareScenarios(
    user: AuthenticatedUser,
    baselineScenarioId: string,
    comparisonScenarioId: string,
  ): Promise<ScenarioCompareDetailResponse> {
    const [baseline, comparison] = await Promise.all([
      this.projectScenarioForOwner(user, baselineScenarioId),
      this.projectScenarioForOwner(user, comparisonScenarioId),
    ]);

    const baselinePoints = new Map(baseline.projection.points.map((point) => [point.year, point]));
    const comparisonPoints = new Map(comparison.projection.points.map((point) => [point.year, point]));
    const years = Array.from(new Set([...baselinePoints.keys(), ...comparisonPoints.keys()])).sort((a, b) => a - b);
    const points = years.map((year) => {
      const baselinePoint = baselinePoints.get(year);
      const comparisonPoint = comparisonPoints.get(year);
      const baselineNetWorth = baselinePoint?.netWorth ?? baseline.projection.baseNetWorth;
      const comparisonNetWorth = comparisonPoint?.netWorth ?? comparison.projection.baseNetWorth;
      const baselineLiquidity = baselinePoint?.liquidity ?? baseline.projection.baseLiquidity;
      const comparisonLiquidity = comparisonPoint?.liquidity ?? comparison.projection.baseLiquidity;
      return {
        year,
        baselineNetWorth,
        comparisonNetWorth,
        baselineLiquidity,
        comparisonLiquidity,
        deltaNetWorth: comparisonNetWorth - baselineNetWorth,
        deltaLiquidity: comparisonLiquidity - baselineLiquidity,
      };
    });

    const baselineLast = baseline.projection.points[baseline.projection.points.length - 1];
    const comparisonLast = comparison.projection.points[comparison.projection.points.length - 1];
    const deltaNetWorthAtHorizon =
      (comparisonLast?.netWorth ?? comparison.projection.baseNetWorth) -
      (baselineLast?.netWorth ?? baseline.projection.baseNetWorth);
    const deltaLiquidityAtHorizon =
      (comparisonLast?.liquidity ?? comparison.projection.baseLiquidity) -
      (baselineLast?.liquidity ?? baseline.projection.baseLiquidity);

    const negativeLiquidityYears = points
      .filter((point) => point.comparisonLiquidity < 0)
      .map((point) => point.year);

    return {
      baselineScenarioId,
      comparisonScenarioId,
      deltaNetWorthAtHorizon,
      deltaLiquidityAtHorizon,
      negativeLiquidityYears,
      points,
    };
  }

  private async buildProjection(scenario: PlanningScenarioRow): Promise<ProjectionResponse> {
    const cashflows = await this.prisma.planningCashflowItem.findMany({
      where: { ownerId: scenario.ownerId },
      orderBy: [{ kind: 'asc' }, { startYear: 'asc' }, { name: 'asc' }],
    });

    const { rate: taxRate, basis: taxBasis } = this.normalizeTax((scenario.inputs as Record<string, unknown>) ?? {});
    const events = this.normalizeEvents(scenario.events);

    const incomeItems = cashflows.filter((item) => item.kind === CashflowItemKind.Income);
    const outflowItems = cashflows.filter((item) => item.kind === CashflowItemKind.Outflow);

    const years = Array.from({ length: Math.max(1, scenario.horizonYears) }, (_, i) => scenario.startYear + i);
    const points: ProjectionPoint[] = [];
    let netWorth = scenario.baseNetWorth;
    let liquidity = scenario.baseLiquidity;

    for (const year of years) {
      const income = incomeItems
        .filter((item) => year >= item.startYear && year <= item.endYear)
        .reduce((sum, item) => sum + item.amount, 0);
      const outflow = outflowItems
        .filter((item) => year >= item.startYear && year <= item.endYear)
        .reduce((sum, item) => sum + item.amount, 0);

      const taxableIncome = taxBasis === 'net_income' ? Math.max(0, income - outflow) : Math.max(0, income);
      const taxes = taxableIncome * taxRate;
      const baseDelta = income - outflow - taxes;

      let eventImpactNetWorth = 0;
      let eventImpactLiquidity = 0;
      const activeEvents = events.filter((event) => {
        const startYear = Math.round(Number(event.year) || year);
        const duration = Math.max(1, Math.round(Number(event.duration) || 1));
        return year >= startYear && year < startYear + duration;
      });

      for (const event of activeEvents) {
        const eventYear = Math.round(Number(event.year) || year);
        const oneTime = Math.max(0, Number(event.cost) || 0);
        const recurringBase = Math.max(0, Number(event.recurring) || 0);
        const recurringGrowth = Math.max(0, Number(event.recurringGrowth) || 0);
        const yearsSinceStart = year - eventYear;
        const recurring =
          recurringBase > 0
            ? recurringBase * Math.pow(1 + recurringGrowth, Math.max(0, yearsSinceStart))
            : 0;
        const asset = String(event.asset || '');

        if (asset === 'OpCos') {
          if (year === eventYear) {
            const transfer = Math.max(0, Number(event.transfer) || 0);
            eventImpactLiquidity += event.action === 'sell' ? transfer : -transfer;
          }
          continue;
        }

        if (CAPITAL_ASSETS.has(asset)) {
          if (year === eventYear && oneTime > 0) eventImpactLiquidity -= oneTime;
          if (recurring > 0) {
            eventImpactLiquidity -= recurring;
            eventImpactNetWorth -= recurring;
          }
          if (asset === 'Airplane') {
            const usefulLifeYears = Math.max(1, Math.round(Number(event.usefulLifeYears) || 0));
            if (usefulLifeYears > 0) {
              const residual = Math.max(0, Math.min(1, Number(event.residualPct) || 0)) * oneTime;
              const depreciable = Math.max(0, oneTime - residual);
              const annualDepreciation = depreciable / usefulLifeYears;
              if (yearsSinceStart >= 0 && yearsSinceStart < usefulLifeYears) {
                eventImpactNetWorth -= annualDepreciation;
              }
            }
          }
        } else {
          if (year === eventYear && oneTime > 0) {
            eventImpactLiquidity -= oneTime;
            eventImpactNetWorth -= oneTime;
          }
          if (recurring > 0) {
            eventImpactLiquidity -= recurring;
            eventImpactNetWorth -= recurring;
          }
        }
      }

      netWorth += baseDelta + eventImpactNetWorth;
      liquidity += baseDelta + eventImpactLiquidity;
      const liquidityDisplay = Math.max(0, liquidity);
      const nonLiquid = Math.max(0, netWorth - liquidityDisplay);

      points.push({
        year,
        income,
        outflow,
        taxes,
        netWorth,
        liquidity,
        nonLiquid,
      });
    }

    return {
      scenarioId: scenario.id,
      startYear: scenario.startYear,
      horizonYears: scenario.horizonYears,
      baseNetWorth: scenario.baseNetWorth,
      baseLiquidity: scenario.baseLiquidity,
      points,
      generatedAt: new Date().toISOString(),
    };
  }
}
