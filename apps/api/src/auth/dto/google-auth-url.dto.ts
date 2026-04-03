import { IsString, MinLength } from 'class-validator';

export class GoogleAuthUrlDto {
  @IsString()
  @MinLength(1)
  redirectUri!: string;
}

