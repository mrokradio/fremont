import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import type { TransactionCategory } from '@fremont/shared';

const TRANSACTION_CATEGORIES: TransactionCategory[] = [
  'Capital Call',
  'Distribution',
  'Fee',
  'Interest',
  'Dividend',
  'Transfer',
  'Expense',
  'Other',
];

export class UpsertTransactionDto {
  @IsDateString()
  date!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @Type(() => Number)
  @IsNumber()
  amount!: number;

  @IsIn(TRANSACTION_CATEGORIES)
  category!: TransactionCategory;

  @IsOptional()
  @IsArray()
  tags?: string[];
}
