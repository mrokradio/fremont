import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class UpsertPositionDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  assetClass!: string;

  @Type(() => Number)
  @IsNumber()
  value!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(3000)
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  costBasis?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  irr?: number;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  liquid?: boolean;

  @IsOptional()
  @IsString()
  owner?: string;
}
