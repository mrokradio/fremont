import {
  Controller,
  Get,
  Param,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { ProjectionResponse } from '@fremont/shared';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { AuthenticatedUser } from '../auth/auth.types';
import { ProjectionService } from './projection.service';

@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN', 'ANALYST', 'VIEWER')
@Controller('/projection')
export class ProjectionController {
  constructor(private readonly projectionService: ProjectionService) {}

  @Get('/scenarios/:id')
  async byScenario(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id') id: string,
  ): Promise<ProjectionResponse> {
    if (!user) throw new UnauthorizedException('Not authenticated');
    return this.projectionService.projectScenario(user, id);
  }
}
