import { BadRequestException, Injectable } from '@nestjs/common';
import { parse as parseCsvAsync } from 'csv-parse/sync';
import type {
  CsvIngestError,
  CsvIngestResult,
  IngestionMode,
  PositionWriteInput,
  TransactionCategory,
  TransactionWriteInput,
} from '@fremont/shared';
import { Prisma, TransactionCategory as PrismaTransactionCategory } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CsvIngestDto } from './dto/csv-ingest.dto';

const CATEGORY_FROM_DB: Record<PrismaTransactionCategory, TransactionCategory> = {
  Capital_Call: 'Capital Call',
  Distribution: 'Distribution',
  Fee: 'Fee',
  Interest: 'Interest',
  Dividend: 'Dividend',
  Transfer: 'Transfer',
  Expense: 'Expense',
  Other: 'Other',
};

const CATEGORY_TO_DB: Record<TransactionCategory, PrismaTransactionCategory> = {
  'Capital Call': 'Capital_Call',
  Distribution: 'Distribution',
  Fee: 'Fee',
  Interest: 'Interest',
  Dividend: 'Dividend',
  Transfer: 'Transfer',
  Expense: 'Expense',
  Other: 'Other',
};

function parseCsv(csv: string): string[][] {
  try {
    return parseCsvAsync(csv, {
      trim: true,
      skip_empty_lines: true,
      relax_column_count: true,
    }) as string[][];
  } catch (err) {
    throw new BadRequestException(`Invalid CSV: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function normalizeHeader(name: string): string {
  return name.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function splitTags(input: string): string[] {
  if (!input) return [];
  return input
    .split(/[|;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseBoolean(value: string): boolean | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  if (['true', 'yes', 'y', '1'].includes(normalized)) return true;
  if (['false', 'no', 'n', '0'].includes(normalized)) return false;
  return null;
}

function parseCategory(value: string): PrismaTransactionCategory | null {
  const normalized = value.trim().toLowerCase().replace(/[\s_-]+/g, '');

  switch (normalized) {
    case 'capitalcall':
      return 'Capital_Call';
    case 'distribution':
      return 'Distribution';
    case 'fee':
      return 'Fee';
    case 'interest':
      return 'Interest';
    case 'dividend':
      return 'Dividend';
    case 'transfer':
      return 'Transfer';
    case 'expense':
      return 'Expense';
    case 'other':
      return 'Other';
    default:
      return null;
  }
}

function normalizeMode(mode?: IngestionMode): IngestionMode {
  return mode === 'replace' ? 'replace' : 'append';
}

@Injectable()
export class IngestService {
  constructor(private readonly prisma: PrismaService) {}

  async ingestPositions(user: AuthenticatedUser, dto: CsvIngestDto): Promise<CsvIngestResult<PositionWriteInput>> {
    const dryRun = dto.dryRun ?? true;
    const mode = normalizeMode(dto.mode);
    const rows = parseCsv(dto.csv);

    if (rows.length < 2) {
      throw new BadRequestException('CSV must include a header row and at least one data row');
    }

    const headers = rows[0].map(normalizeHeader);
    const col = new Map<string, number>(headers.map((header, idx) => [header, idx]));

    const required = ['name', 'assetclass', 'value'];
    const missing = required.filter((name) => !col.has(name));
    if (missing.length > 0) {
      throw new BadRequestException(`Missing required column(s): ${missing.join(', ')}`);
    }

    const preview: PositionWriteInput[] = [];
    const errors: CsvIngestError[] = [];

    for (let i = 1; i < rows.length; i += 1) {
      const raw = rows[i];
      const rowNumber = i + 1;
      const name = raw[col.get('name') ?? -1]?.trim() ?? '';
      const assetClass = raw[col.get('assetclass') ?? -1]?.trim() ?? '';
      const valueRaw = raw[col.get('value') ?? -1]?.trim() ?? '';

      if (!name) {
        errors.push({ row: rowNumber, message: 'name is required' });
        continue;
      }
      if (!assetClass) {
        errors.push({ row: rowNumber, message: 'assetClass is required' });
        continue;
      }

      const value = Number(valueRaw);
      if (!Number.isFinite(value)) {
        errors.push({ row: rowNumber, message: 'value must be numeric' });
        continue;
      }

      const liquidRaw = raw[col.get('liquid') ?? -1] ?? '';
      const liquid = parseBoolean(liquidRaw);
      if (liquid === null) {
        errors.push({ row: rowNumber, message: 'liquid must be one of true/false/yes/no/1/0' });
        continue;
      }

      const costBasisRaw = raw[col.get('costbasis') ?? -1]?.trim() ?? '';
      const irrRaw = raw[col.get('irr') ?? -1]?.trim() ?? '';
      const yearRaw = raw[col.get('year') ?? -1]?.trim() ?? '';
      const tagsRaw = raw[col.get('tags') ?? -1] ?? '';

      const costBasis = costBasisRaw ? Number(costBasisRaw) : undefined;
      if (costBasisRaw && !Number.isFinite(costBasis)) {
        errors.push({ row: rowNumber, message: 'costBasis must be numeric when provided' });
        continue;
      }

      const irr = irrRaw ? Number(irrRaw) : undefined;
      if (irrRaw && !Number.isFinite(irr)) {
        errors.push({ row: rowNumber, message: 'irr must be numeric when provided' });
        continue;
      }

      let year: number | undefined;
      if (yearRaw) {
        const parsedYear = Number(yearRaw);
        if (!Number.isInteger(parsedYear) || parsedYear < 1900 || parsedYear > 3000) {
          errors.push({ row: rowNumber, message: 'year must be an integer between 1900 and 3000 when provided' });
          continue;
        }
        year = parsedYear;
      }
      preview.push({
        name,
        assetClass,
        year,
        value,
        costBasis,
        irr,
        tags: splitTags(tagsRaw),
        liquid,
      });
    }

    let imported = 0;
    if (!dryRun && errors.length === 0 && preview.length > 0) {
      if (mode === 'replace') {
        await this.prisma.position.deleteMany();
      }
      await this.prisma.position.createMany({
        data: preview.map((item) => ({
          name: item.name,
          assetClass: item.assetClass,
          year: item.year,
          value: item.value,
          costBasis: item.costBasis,
          irr: item.irr,
          tags: item.tags ?? [],
          liquid: item.liquid ?? false,
        })),
      });
      imported = preview.length;
    }

    await this.prisma.ingestionJob.create({
      data: {
        type: 'Position',
        mode: mode === 'replace' ? 'REPLACE' : 'APPEND',
        dryRun,
        imported,
        errors: errors.length > 0 ? (errors as Prisma.InputJsonValue) : undefined,
        requestedById: user.id,
      },
    });

    return {
      dryRun,
      mode,
      imported,
      preview,
      errors,
    };
  }

  async ingestTransactions(
    user: AuthenticatedUser,
    dto: CsvIngestDto,
  ): Promise<CsvIngestResult<TransactionWriteInput>> {
    const dryRun = dto.dryRun ?? true;
    const mode = normalizeMode(dto.mode);
    const rows = parseCsv(dto.csv);

    if (rows.length < 2) {
      throw new BadRequestException('CSV must include a header row and at least one data row');
    }

    const headers = rows[0].map(normalizeHeader);
    const col = new Map<string, number>(headers.map((header, idx) => [header, idx]));

    const required = ['date', 'description', 'amount', 'category'];
    const missing = required.filter((name) => !col.has(name));
    if (missing.length > 0) {
      throw new BadRequestException(`Missing required column(s): ${missing.join(', ')}`);
    }

    const preview: TransactionWriteInput[] = [];
    const errors: CsvIngestError[] = [];

    for (let i = 1; i < rows.length; i += 1) {
      const raw = rows[i];
      const rowNumber = i + 1;
      const dateRaw = raw[col.get('date') ?? -1]?.trim() ?? '';
      const description = raw[col.get('description') ?? -1]?.trim() ?? '';
      const amountRaw = raw[col.get('amount') ?? -1]?.trim() ?? '';
      const categoryRaw = raw[col.get('category') ?? -1]?.trim() ?? '';
      const tagsRaw = raw[col.get('tags') ?? -1] ?? '';

      if (!description) {
        errors.push({ row: rowNumber, message: 'description is required' });
        continue;
      }

      const date = new Date(dateRaw);
      if (!dateRaw || Number.isNaN(date.getTime())) {
        errors.push({ row: rowNumber, message: 'date must be a valid date (YYYY-MM-DD recommended)' });
        continue;
      }

      const amount = Number(amountRaw);
      if (!Number.isFinite(amount)) {
        errors.push({ row: rowNumber, message: 'amount must be numeric' });
        continue;
      }

      const dbCategory = parseCategory(categoryRaw);
      if (!dbCategory) {
        errors.push({ row: rowNumber, message: 'category is invalid' });
        continue;
      }

      preview.push({
        date: date.toISOString().slice(0, 10),
        description,
        amount,
        category: CATEGORY_FROM_DB[dbCategory],
        tags: splitTags(tagsRaw),
      });
    }

    let imported = 0;
    if (!dryRun && errors.length === 0 && preview.length > 0) {
      if (mode === 'replace') {
        await this.prisma.transaction.deleteMany();
      }
      await this.prisma.transaction.createMany({
        data: preview.map((item) => ({
          date: new Date(item.date),
          description: item.description,
          amount: item.amount,
          category: CATEGORY_TO_DB[item.category],
          tags: item.tags ?? [],
        })),
      });
      imported = preview.length;
    }

    await this.prisma.ingestionJob.create({
      data: {
        type: 'Transaction',
        mode: mode === 'replace' ? 'REPLACE' : 'APPEND',
        dryRun,
        imported,
        errors: errors.length > 0 ? (errors as Prisma.InputJsonValue) : undefined,
        requestedById: user.id,
      },
    });

    return {
      dryRun,
      mode,
      imported,
      preview,
      errors,
    };
  }
}
