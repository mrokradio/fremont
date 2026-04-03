import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CashflowItemKind } from '@prisma/client';
import { ProjectionService } from './projection.service';
import type { PrismaService } from '../common/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScenario(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'scenario-1',
    ownerId: 'user-1',
    name: 'Test Scenario',
    startYear: 2025,
    horizonYears: 3,
    baseNetWorth: 1_000_000,
    baseLiquidity: 500_000,
    inputs: {},
    events: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return { id: 'user-1', email: 'user@example.com', name: 'Test User', role: 'VIEWER', exp: 9999999999, ...overrides };
}

function makePrisma(scenario: ReturnType<typeof makeScenario> | null, cashflows: unknown[] = []) {
  return {
    planningScenario: {
      findUnique: jest.fn().mockResolvedValue(scenario),
    },
    planningCashflowItem: {
      findMany: jest.fn().mockResolvedValue(cashflows),
    },
  } as unknown as PrismaService;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProjectionService', () => {
  describe('projectScenario', () => {
    it('throws NotFoundException when scenario does not exist', async () => {
      const service = new ProjectionService(makePrisma(null));
      await expect(service.projectScenario(makeUser(), 'missing')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user does not own scenario', async () => {
      const scenario = makeScenario({ ownerId: 'other-user' });
      const service = new ProjectionService(makePrisma(scenario));
      await expect(service.projectScenario(makeUser({ role: 'VIEWER' }), scenario.id)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows ADMIN to view any scenario', async () => {
      const scenario = makeScenario({ ownerId: 'other-user' });
      const service = new ProjectionService(makePrisma(scenario));
      const result = await service.projectScenario(makeUser({ role: 'ADMIN' }), scenario.id);
      expect(result.scenarioId).toBe('scenario-1');
    });

    it('allows owner to view their own scenario', async () => {
      const scenario = makeScenario({ ownerId: 'user-1' });
      const service = new ProjectionService(makePrisma(scenario));
      const result = await service.projectScenario(makeUser({ id: 'user-1' }), scenario.id);
      expect(result.scenarioId).toBe('scenario-1');
    });

    describe('basic projection with no cashflows', () => {
      it('returns one point per horizon year', async () => {
        const scenario = makeScenario({ horizonYears: 3, startYear: 2025 });
        const service = new ProjectionService(makePrisma(scenario));
        const result = await service.projectScenario(makeUser(), scenario.id);
        expect(result.points).toHaveLength(3);
        expect(result.points.map((p) => p.year)).toEqual([2025, 2026, 2027]);
      });

      it('net worth and liquidity stay flat with no cashflows or events', async () => {
        const scenario = makeScenario({ baseNetWorth: 1_000_000, baseLiquidity: 400_000, horizonYears: 2 });
        const service = new ProjectionService(makePrisma(scenario));
        const result = await service.projectScenario(makeUser(), scenario.id);
        for (const point of result.points) {
          expect(point.netWorth).toBe(1_000_000);
          expect(point.liquidity).toBe(400_000);
          expect(point.income).toBe(0);
          expect(point.outflow).toBe(0);
          expect(point.taxes).toBe(0);
        }
      });

      it('handles horizonYears of 0 by producing a single year', async () => {
        const scenario = makeScenario({ horizonYears: 0, startYear: 2025 });
        const service = new ProjectionService(makePrisma(scenario));
        const result = await service.projectScenario(makeUser(), scenario.id);
        expect(result.points).toHaveLength(1);
        expect(result.points[0].year).toBe(2025);
      });
    });

    describe('cashflow projection', () => {
      it('accumulates income across years', async () => {
        const scenario = makeScenario({ baseNetWorth: 0, baseLiquidity: 0, horizonYears: 3, startYear: 2025 });
        const cashflows = [
          { kind: CashflowItemKind.Income, amount: 100_000, startYear: 2025, endYear: 2027, ownerId: 'user-1', name: 'salary', id: '1' },
        ];
        const service = new ProjectionService(makePrisma(scenario, cashflows));
        const result = await service.projectScenario(makeUser(), scenario.id);
        expect(result.points[0].income).toBe(100_000);
        expect(result.points[0].netWorth).toBe(100_000);
        expect(result.points[1].netWorth).toBe(200_000);
        expect(result.points[2].netWorth).toBe(300_000);
      });

      it('subtracts outflows from net worth', async () => {
        const scenario = makeScenario({ baseNetWorth: 500_000, baseLiquidity: 500_000, horizonYears: 2, startYear: 2025 });
        const cashflows = [
          { kind: CashflowItemKind.Outflow, amount: 50_000, startYear: 2025, endYear: 2026, ownerId: 'user-1', name: 'expenses', id: '2' },
        ];
        const service = new ProjectionService(makePrisma(scenario, cashflows));
        const result = await service.projectScenario(makeUser(), scenario.id);
        expect(result.points[0].outflow).toBe(50_000);
        expect(result.points[0].netWorth).toBe(450_000);
        expect(result.points[1].netWorth).toBe(400_000);
      });

      it('only includes cashflow items within their active date range', async () => {
        const scenario = makeScenario({ baseNetWorth: 0, baseLiquidity: 0, horizonYears: 3, startYear: 2025 });
        const cashflows = [
          { kind: CashflowItemKind.Income, amount: 80_000, startYear: 2026, endYear: 2026, ownerId: 'user-1', name: 'bonus', id: '3' },
        ];
        const service = new ProjectionService(makePrisma(scenario, cashflows));
        const result = await service.projectScenario(makeUser(), scenario.id);
        expect(result.points[0].income).toBe(0); // 2025 - not active
        expect(result.points[1].income).toBe(80_000); // 2026 - active
        expect(result.points[2].income).toBe(0); // 2027 - not active
      });
    });

    describe('tax calculation', () => {
      it('applies gross_income tax basis by default', async () => {
        const scenario = makeScenario({
          inputs: { taxRate: 0.25, taxBasis: 'gross_income' },
          baseNetWorth: 0,
          baseLiquidity: 0,
          horizonYears: 1,
          startYear: 2025,
        });
        const cashflows = [
          { kind: CashflowItemKind.Income, amount: 200_000, startYear: 2025, endYear: 2025, ownerId: 'user-1', name: 'salary', id: '1' },
          { kind: CashflowItemKind.Outflow, amount: 50_000, startYear: 2025, endYear: 2025, ownerId: 'user-1', name: 'rent', id: '2' },
        ];
        const service = new ProjectionService(makePrisma(scenario, cashflows));
        const result = await service.projectScenario(makeUser(), scenario.id);
        // taxable = gross income = 200_000; tax = 0.25 * 200_000 = 50_000
        expect(result.points[0].taxes).toBeCloseTo(50_000);
        // net = 200_000 - 50_000 - 50_000 = 100_000
        expect(result.points[0].netWorth).toBeCloseTo(100_000);
      });

      it('applies net_income tax basis when specified', async () => {
        const scenario = makeScenario({
          inputs: { taxRate: 0.25, taxBasis: 'net_income' },
          baseNetWorth: 0,
          baseLiquidity: 0,
          horizonYears: 1,
          startYear: 2025,
        });
        const cashflows = [
          { kind: CashflowItemKind.Income, amount: 200_000, startYear: 2025, endYear: 2025, ownerId: 'user-1', name: 'salary', id: '1' },
          { kind: CashflowItemKind.Outflow, amount: 50_000, startYear: 2025, endYear: 2025, ownerId: 'user-1', name: 'rent', id: '2' },
        ];
        const service = new ProjectionService(makePrisma(scenario, cashflows));
        const result = await service.projectScenario(makeUser(), scenario.id);
        // taxable = net income = 200_000 - 50_000 = 150_000; tax = 0.25 * 150_000 = 37_500
        expect(result.points[0].taxes).toBeCloseTo(37_500);
        // net = 200_000 - 50_000 - 37_500 = 112_500
        expect(result.points[0].netWorth).toBeCloseTo(112_500);
      });

      it('clamps tax rate to [0, 1]', async () => {
        const scenario = makeScenario({
          inputs: { taxRate: 5 }, // over 100% - should be clamped to 1
          baseNetWorth: 0,
          baseLiquidity: 0,
          horizonYears: 1,
          startYear: 2025,
        });
        const cashflows = [
          { kind: CashflowItemKind.Income, amount: 100_000, startYear: 2025, endYear: 2025, ownerId: 'user-1', name: 'salary', id: '1' },
        ];
        const service = new ProjectionService(makePrisma(scenario, cashflows));
        const result = await service.projectScenario(makeUser(), scenario.id);
        // taxRate clamped to 1.0 → taxes = 100_000 → netWorth delta = 0
        expect(result.points[0].taxes).toBe(100_000);
        expect(result.points[0].netWorth).toBe(0);
      });

      it('does not produce negative taxes when outflows exceed income', async () => {
        const scenario = makeScenario({
          inputs: { taxRate: 0.3 },
          baseNetWorth: 500_000,
          baseLiquidity: 500_000,
          horizonYears: 1,
          startYear: 2025,
        });
        const cashflows = [
          { kind: CashflowItemKind.Outflow, amount: 100_000, startYear: 2025, endYear: 2025, ownerId: 'user-1', name: 'expenses', id: '1' },
        ];
        const service = new ProjectionService(makePrisma(scenario, cashflows));
        const result = await service.projectScenario(makeUser(), scenario.id);
        expect(result.points[0].taxes).toBe(0);
      });
    });

    describe('events', () => {
      it('deducts one-time cost from liquidity and net worth for generic events', async () => {
        const scenario = makeScenario({
          events: [{ year: 2025, cost: 200_000, duration: 1 }],
          baseNetWorth: 1_000_000,
          baseLiquidity: 1_000_000,
          horizonYears: 2,
          startYear: 2025,
        });
        const service = new ProjectionService(makePrisma(scenario));
        const result = await service.projectScenario(makeUser(), scenario.id);
        expect(result.points[0].netWorth).toBe(800_000);
        expect(result.points[0].liquidity).toBe(800_000);
        // Year 2 — event is over (duration=1), no further impact
        expect(result.points[1].netWorth).toBe(800_000);
      });

      it('only deducts capital asset purchase cost from liquidity (not net worth)', async () => {
        const scenario = makeScenario({
          events: [{ year: 2025, asset: 'Real Estate', cost: 500_000, duration: 1 }],
          baseNetWorth: 1_000_000,
          baseLiquidity: 1_000_000,
          horizonYears: 1,
          startYear: 2025,
        });
        const service = new ProjectionService(makePrisma(scenario));
        const result = await service.projectScenario(makeUser(), scenario.id);
        expect(result.points[0].liquidity).toBe(500_000);
        // net worth is unchanged by capital purchase (asset swaps liquidity)
        expect(result.points[0].netWorth).toBe(1_000_000);
      });

      it('applies airplane depreciation to net worth over useful life', async () => {
        const scenario = makeScenario({
          events: [{
            year: 2025,
            asset: 'Airplane',
            cost: 1_000_000,
            usefulLifeYears: 5,
            residualPct: 0.2,   // residual = 200_000; depreciable = 800_000; annual = 160_000
            duration: 5,
          }],
          baseNetWorth: 2_000_000,
          baseLiquidity: 2_000_000,
          horizonYears: 3,
          startYear: 2025,
        });
        const service = new ProjectionService(makePrisma(scenario));
        const result = await service.projectScenario(makeUser(), scenario.id);
        // Year 2025: liquidity -= 1_000_000 (purchase); net worth -= 160_000 (depreciation)
        expect(result.points[0].liquidity).toBe(1_000_000);
        expect(result.points[0].netWorth).toBeCloseTo(1_840_000);
        // Year 2026: no purchase cost; net worth -= 160_000
        expect(result.points[1].netWorth).toBeCloseTo(1_680_000);
      });

      it('handles OpCos buy — reduces liquidity', async () => {
        const scenario = makeScenario({
          events: [{ year: 2025, asset: 'OpCos', transfer: 300_000, action: 'buy', duration: 1 }],
          baseNetWorth: 1_000_000,
          baseLiquidity: 1_000_000,
          horizonYears: 1,
          startYear: 2025,
        });
        const service = new ProjectionService(makePrisma(scenario));
        const result = await service.projectScenario(makeUser(), scenario.id);
        expect(result.points[0].liquidity).toBe(700_000);
        // net worth not affected by OpCos transfer direction
        expect(result.points[0].netWorth).toBe(1_000_000);
      });

      it('handles OpCos sell — increases liquidity', async () => {
        const scenario = makeScenario({
          events: [{ year: 2025, asset: 'OpCos', transfer: 300_000, action: 'sell', duration: 1 }],
          baseNetWorth: 1_000_000,
          baseLiquidity: 700_000,
          horizonYears: 1,
          startYear: 2025,
        });
        const service = new ProjectionService(makePrisma(scenario));
        const result = await service.projectScenario(makeUser(), scenario.id);
        expect(result.points[0].liquidity).toBe(1_000_000);
      });

      it('applies recurring costs with growth over multi-year events', async () => {
        const scenario = makeScenario({
          events: [{ year: 2025, recurring: 10_000, recurringGrowth: 0.1, duration: 3 }],
          baseNetWorth: 500_000,
          baseLiquidity: 500_000,
          horizonYears: 3,
          startYear: 2025,
        });
        const service = new ProjectionService(makePrisma(scenario));
        const result = await service.projectScenario(makeUser(), scenario.id);
        // year 0: recurring = 10_000
        // year 1: recurring = 10_000 * 1.1 = 11_000
        // year 2: recurring = 10_000 * 1.21 = 12_100
        expect(result.points[0].netWorth).toBeCloseTo(490_000);
        expect(result.points[1].netWorth).toBeCloseTo(479_000);
        expect(result.points[2].netWorth).toBeCloseTo(466_900);
      });
    });

    describe('nonLiquid calculation', () => {
      it('nonLiquid = max(0, netWorth - max(0, liquidity))', async () => {
        const scenario = makeScenario({ baseNetWorth: 1_000_000, baseLiquidity: 300_000, horizonYears: 1, startYear: 2025 });
        const service = new ProjectionService(makePrisma(scenario));
        const result = await service.projectScenario(makeUser(), scenario.id);
        expect(result.points[0].nonLiquid).toBe(700_000);
      });

      it('nonLiquid is 0 when liquidity exceeds net worth', async () => {
        const scenario = makeScenario({ baseNetWorth: 100_000, baseLiquidity: 200_000, horizonYears: 1, startYear: 2025 });
        const service = new ProjectionService(makePrisma(scenario));
        const result = await service.projectScenario(makeUser(), scenario.id);
        expect(result.points[0].nonLiquid).toBe(0);
      });
    });

    describe('response metadata', () => {
      it('includes correct metadata fields', async () => {
        const scenario = makeScenario({ startYear: 2025, horizonYears: 5, baseNetWorth: 1_000_000, baseLiquidity: 500_000 });
        const service = new ProjectionService(makePrisma(scenario));
        const result = await service.projectScenario(makeUser(), scenario.id);
        expect(result.scenarioId).toBe('scenario-1');
        expect(result.startYear).toBe(2025);
        expect(result.horizonYears).toBe(5);
        expect(result.baseNetWorth).toBe(1_000_000);
        expect(result.baseLiquidity).toBe(500_000);
        expect(result.generatedAt).toBeDefined();
      });
    });
  });

  describe('compareScenarios', () => {
    it('computes delta net worth and liquidity at horizon', async () => {
      const scenario1 = makeScenario({ id: 'baseline', ownerId: 'user-1', baseNetWorth: 1_000_000, baseLiquidity: 500_000, horizonYears: 1, startYear: 2025 });
      const scenario2 = makeScenario({ id: 'comparison', ownerId: 'user-1', baseNetWorth: 1_200_000, baseLiquidity: 600_000, horizonYears: 1, startYear: 2025 });

      const prisma = {
        planningScenario: {
          findUnique: jest.fn()
            .mockResolvedValueOnce(scenario1)  // baseline lookup
            .mockResolvedValueOnce(scenario2), // comparison lookup
        },
        planningCashflowItem: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      } as unknown as PrismaService;

      const service = new ProjectionService(prisma);
      const result = await service.compareScenarios(makeUser(), 'baseline', 'comparison');
      expect(result.deltaNetWorthAtHorizon).toBe(200_000);
      expect(result.deltaLiquidityAtHorizon).toBe(100_000);
    });

    it('reports years where comparison scenario has negative liquidity', async () => {
      const scenario1 = makeScenario({ id: 'baseline', ownerId: 'user-1', baseNetWorth: 1_000_000, baseLiquidity: 500_000, horizonYears: 2, startYear: 2025 });
      const scenario2 = makeScenario({ id: 'comparison', ownerId: 'user-1', baseNetWorth: 100_000, baseLiquidity: -200_000, horizonYears: 2, startYear: 2025 });

      const prisma = {
        planningScenario: {
          findUnique: jest.fn()
            .mockResolvedValueOnce(scenario1)
            .mockResolvedValueOnce(scenario2),
        },
        planningCashflowItem: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      } as unknown as PrismaService;

      const service = new ProjectionService(prisma);
      const result = await service.compareScenarios(makeUser(), 'baseline', 'comparison');
      expect(result.negativeLiquidityYears).toContain(2025);
      expect(result.negativeLiquidityYears).toContain(2026);
    });
  });
});
