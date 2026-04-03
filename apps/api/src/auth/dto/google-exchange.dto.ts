import { IsString, MinLength } from 'class-validator';

export class GoogleExchangeDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  state!: string;

  @IsString()
  @MinLength(1)
  redirectUri!: string;
}

