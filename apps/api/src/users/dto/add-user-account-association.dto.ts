import { IsIn, IsString, MinLength } from 'class-validator';
import type { AddUserAccountAssociationRequest } from '@fremont/shared';

const ASSOCIATION_PROVIDERS: AddUserAccountAssociationRequest['provider'][] = ['Google', 'Microsoft'];

export class AddUserAccountAssociationDto {
  @IsIn(ASSOCIATION_PROVIDERS)
  provider!: AddUserAccountAssociationRequest['provider'];

  @IsString()
  @MinLength(3)
  identifier!: string;
}
