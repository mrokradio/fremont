import { IsString, MinLength } from 'class-validator';

export class MicrosoftAuthUrlDto {
  @IsString()
  @MinLength(1)
  redirectUri!: string;
}

