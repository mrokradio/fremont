import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpsertUserContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(191)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  secondaryEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  notes?: string;
}
