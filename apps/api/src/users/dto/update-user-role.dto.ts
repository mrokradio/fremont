import { IsIn } from 'class-validator';
import type { UserRole } from '@fremont/shared';

const USER_ROLES: UserRole[] = ['ADMIN', 'ANALYST', 'VIEWER'];

export class UpdateUserRoleDto {
  @IsIn(USER_ROLES)
  role!: UserRole;
}
