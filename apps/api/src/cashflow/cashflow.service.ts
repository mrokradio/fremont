import { Injectable } from '@nestjs/common';
import type { CashflowsResponse, PlanningCashflowStore } from '@fremont/shared';
import { CashflowItemKind } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../common/prisma.service';
import { UpsertCashflowsDto } from './dto/upsert-cashflows.dto';

@Injectable()
export class CashflowService {
  constructor(private readonly prisma: PrismaService) {}

  async get(user: AuthenticatedUser): Promise<CashflowsResponse> {
    const items = await this.prisma.planningCashflowItem.findMany({
      where: { ownerId: user.id },
      orderBy: [{ kind: 'asc' }, { startYear: 'asc' }, { name: 'asc' }],
    });

    const income: PlanningCashflowStore['income'] = [];
    const outflow: PlanningCashflowStore['outflow'] = [];
    for (const item of items) {
      const mapped = {
        id: item.id,
        name: item.name,
        amount: item.amount,
        start: item.startYear,
        end: item.endYear,
      };
      if (item.kind === CashflowItemKind.Income) income.push(mapped);
      else outflow.push(mapped);
    }

    return { income, outflow };
  }

  async replace(user: AuthenticatedUser, dto: UpsertCashflowsDto): Promise<CashflowsResponse> {
    const incomeRows = (dto.income ?? []).map((item) => ({
      id: item.id || undefined,
      ownerId: user.id,
      kind: CashflowItemKind.Income,
      name: item.name.trim(),
      amount: Number(item.amount) || 0,
      startYear: Math.round(Number(item.start) || new Date().getFullYear()),
      endYear: Math.round(Number(item.end) || Number(item.start) || new Date().getFullYear()),
    }));
    const outflowRows = (dto.outflow ?? []).map((item) => ({
      id: item.id || undefined,
      ownerId: user.id,
      kind: CashflowItemKind.Outflow,
      name: item.name.trim(),
      amount: Number(item.amount) || 0,
      startYear: Math.round(Number(item.start) || new Date().getFullYear()),
      endYear: Math.round(Number(item.end) || Number(item.start) || new Date().getFullYear()),
    }));

    await this.prisma.$transaction(async (tx) => {
      await tx.planningCashflowItem.deleteMany({ where: { ownerId: user.id } });
      const allRows = [...incomeRows, ...outflowRows];
      if (allRows.length > 0) {
        await tx.planningCashflowItem.createMany({
          data: allRows.map((row) => ({
            ...row,
            endYear: Math.max(row.startYear, row.endYear),
          })),
        });
      }
    });

    return this.get(user);
  }
}
