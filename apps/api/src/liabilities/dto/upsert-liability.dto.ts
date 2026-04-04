import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UpsertLiabilityDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  category!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  balance!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rate?: number;

  @IsOptional()
  @IsString()
  maturityDate?: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  owner?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
