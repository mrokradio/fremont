import { Body, Controller, Delete, Get, Param, Patch, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { AuthUser, UserProfileResponse } from '@fremont/shared';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedUser } from '../auth/auth.types';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AddUserAccountAssociationDto } from './dto/add-user-account-association.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto';
import { UpsertUserContactDto } from './dto/upsert-user-contact.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UsersService } from './users.service';

@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async list(): Promise<AuthUser[]> {
    return this.usersService.list();
  }

  @Get('/me/profile')
  @Roles('ADMIN', 'ANALYST', 'VIEWER')
  async me(@CurrentUser() user: AuthenticatedUser | undefined): Promise<UserProfileResponse> {
    if (!user) throw new UnauthorizedException('Not authenticated');
    return this.usersService.me(user);
  }

  @Patch('/me/profile/contact')
  @Roles('ADMIN', 'ANALYST', 'VIEWER')
  async upsertMyContact(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: UpsertUserContactDto,
  ): Promise<UserProfileResponse> {
    if (!user) throw new UnauthorizedException('Not authenticated');
    return this.usersService.upsertMyContact(user, dto);
  }

  @Post('/me/profile/associations')
  @Roles('ADMIN', 'ANALYST', 'VIEWER')
  async addMyAssociation(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() dto: AddUserAccountAssociationDto,
  ): Promise<UserProfileResponse> {
    if (!user) throw new UnauthorizedException('Not authenticated');
    return this.usersService.addMyAssociation(user, dto);
  }

  @Delete('/me/profile/associations/:id')
  @Roles('ADMIN', 'ANALYST', 'VIEWER')
  async removeMyAssociation(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id') id: string,
  ): Promise<UserProfileResponse> {
    if (!user) throw new UnauthorizedException('Not authenticated');
    return this.usersService.removeMyAssociation(user, id);
  }

  @Post()
  async create(@Body() dto: CreateUserDto): Promise<AuthUser> {
    return this.usersService.create(dto);
  }

  @Patch('/:id/role')
  async updateRole(@Param('id') id: string, @Body() dto: UpdateUserRoleDto): Promise<AuthUser> {
    return this.usersService.updateRole(id, dto.role);
  }

  @Patch('/:id/password')
  async resetPassword(@Param('id') id: string, @Body() dto: ResetUserPasswordDto): Promise<{ status: 'ok' }> {
    await this.usersService.resetPassword(id, dto.password);
    return { status: 'ok' };
  }
}
