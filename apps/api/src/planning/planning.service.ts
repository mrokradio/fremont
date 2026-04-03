import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { PlanningScenario } from '@fremont/shared';
import { Prisma, type PlanningScenario as PlanningScenarioRow } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UpsertPlanningScenarioDto } from './dto/upsert-planning-scenario.dto';

@Injectable()
export class PlanningService {
  constructor(private readonly prisma: PrismaService) {}

  private toScenario(row: PlanningScenarioRow): PlanningScenario {
    return {
      id: row.id,
      name: row.name,
      startYear: row.startYear,
      horizonYears: row.horizonYears,
      baseNetWorth: row.baseNetWorth,
      baseLiquidity: row.baseLiquidity,
      inputs: (row.inputs as Record<string, unknown>) ?? {},
      events: (Array.isArray(row.events) ? row.events : []) as Record<string, unknown>[],
      ownerId: row.ownerId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private canMutate(user: AuthenticatedUser, ownerId: string): boolean {
    return user.role === 'ADMIN' || user.id === ownerId;
  }

  async list(user: AuthenticatedUser): Promise<PlanningScenario[]> {
    const where = user.role === 'ADMIN' ? {} : { ownerId: user.id };

    const rows = await this.prisma.planningScenario.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
    });

    return rows.map((row) => this.toScenario(row));
  }

  async create(user: AuthenticatedUser, dto: UpsertPlanningScenarioDto): Promise<PlanningScenario> {
    const created = await this.prisma.planningScenario.create({
      data: {
        name: dto.name.trim(),
        startYear: dto.startYear,
        horizonYears: dto.horizonYears,
        baseNetWorth: dto.baseNetWorth,
        baseLiquidity: dto.baseLiquidity,
        inputs: dto.inputs as Prisma.InputJsonValue,
        events: dto.events as Prisma.InputJsonValue,
        ownerId: user.id,
      },
    });

    return this.toScenario(created);
  }

  async update(user: AuthenticatedUser, id: string, dto: UpsertPlanningScenarioDto): Promise<PlanningScenario> {
    const existing = await this.prisma.planningScenario.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Scenario not found');
    }
    if (!this.canMutate(user, existing.ownerId)) {
      throw new ForbiddenException('Cannot modify this scenario');
    }

    const updated = await this.prisma.planningScenario.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        startYear: dto.startYear,
        horizonYears: dto.horizonYears,
        baseNetWorth: dto.baseNetWorth,
        baseLiquidity: dto.baseLiquidity,
        inputs: dto.inputs as Prisma.InputJsonValue,
        events: dto.events as Prisma.InputJsonValue,
      },
    });

    return this.toScenario(updated);
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    const existing = await this.prisma.planningScenario.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Scenario not found');
    }
    if (!this.canMutate(user, existing.ownerId)) {
      throw new ForbiddenException('Cannot modify this scenario');
    }

    await this.prisma.planningScenario.delete({ where: { id } });
  }
}
