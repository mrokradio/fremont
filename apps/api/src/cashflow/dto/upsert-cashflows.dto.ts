import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

class CashflowItemDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @Type(() => Number)
  @IsNumber()
  amount!: number;

  @Type(() => Number)
  @Min(1900)
  start!: number;

  @Type(() => Number)
  @Min(1900)
  end!: number;
}

export class UpsertCashflowsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CashflowItemDto)
  income!: CashflowItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CashflowItemDto)
  outflow!: CashflowItemDto[];
}
