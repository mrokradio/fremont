import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  AddUserAccountAssociationRequest,
  AuthUser,
  CreateUserRequest,
  UpsertUserContactRequest,
  UserProfileResponse,
  UserRole,
} from '@fremont/shared';
import { AccountProvider as PrismaAccountProvider } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { hashPassword } from '../common/security';
import type { AuthenticatedUser } from '../auth/auth.types';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizeAssociationIdentifier(value: string): string {
    return value.trim().toLowerCase();
  }

  private normalizeOptionalText(value: string | undefined): string | null {
    const next = (value ?? '').trim();
    return next ? next : null;
  }

  private async ensurePasswordAssociation(userId: string, email: string): Promise<void> {
    const identifier = this.normalizeAssociationIdentifier(email);
    await this.prisma.userAccountAssociation.upsert({
      where: {
        ownerId_provider_identifier: {
          ownerId: userId,
          provider: PrismaAccountProvider.Password,
          identifier,
        },
      },
      update: {},
      create: {
        ownerId: userId,
        provider: PrismaAccountProvider.Password,
        identifier,
      },
    });
  }

  private async mapProfile(userId: string): Promise<UserProfileResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.ensurePasswordAssociation(user.id, user.email);

    const [contact, associations] = await Promise.all([
      this.prisma.userContactProfile.findUnique({ where: { ownerId: user.id } }),
      this.prisma.userAccountAssociation.findMany({
        where: { ownerId: user.id },
        orderBy: [{ provider: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    return {
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      contact: {
        phone: contact?.phone ?? undefined,
        secondaryEmail: contact?.secondaryEmail ?? undefined,
        title: contact?.title ?? undefined,
        company: contact?.company ?? undefined,
        location: contact?.location ?? undefined,
        notes: contact?.notes ?? undefined,
        updatedAt: contact?.updatedAt.toISOString() ?? new Date().toISOString(),
      },
      associations: associations.map((association) => ({
        id: association.id,
        provider: association.provider,
        identifier: association.identifier,
        linkedAt: association.createdAt.toISOString(),
        removable: association.provider !== PrismaAccountProvider.Password,
      })),
    };
  }

  async list(): Promise<AuthUser[]> {
    const rows = await this.prisma.user.findMany({
      orderBy: [{ role: 'asc' }, { email: 'asc' }],
      select: { id: true, email: true, name: true, role: true },
    });

    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role,
    }));
  }

  async create(input: CreateUserRequest): Promise<AuthUser> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const created = await this.prisma.user.create({
      data: {
        email,
        name: input.name.trim(),
        passwordHash: hashPassword(input.password),
        role: input.role ?? 'VIEWER',
        accountAssociations: {
          create: {
            provider: PrismaAccountProvider.Password,
            identifier: email,
          },
        },
      },
      select: { id: true, email: true, name: true, role: true },
    });

    return {
      id: created.id,
      email: created.email,
      name: created.name,
      role: created.role,
    };
  }

  async updateRole(id: string, role: UserRole): Promise<AuthUser> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, email: true, name: true, role: true },
    });

    return {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      role: updated.role,
    };
  }

  async resetPassword(id: string, password: string): Promise<void> {
    const existing = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash: hashPassword(password) },
    });

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { email: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    await this.ensurePasswordAssociation(id, user.email);
  }

  async me(user: AuthenticatedUser): Promise<UserProfileResponse> {
    return this.mapProfile(user.id);
  }

  async upsertMyContact(user: AuthenticatedUser, input: UpsertUserContactRequest): Promise<UserProfileResponse> {
    await this.prisma.userContactProfile.upsert({
      where: { ownerId: user.id },
      create: {
        ownerId: user.id,
        phone: this.normalizeOptionalText(input.phone),
        secondaryEmail: this.normalizeOptionalText(input.secondaryEmail),
        title: this.normalizeOptionalText(input.title),
        company: this.normalizeOptionalText(input.company),
        location: this.normalizeOptionalText(input.location),
        notes: this.normalizeOptionalText(input.notes),
      },
      update: {
        phone: this.normalizeOptionalText(input.phone),
        secondaryEmail: this.normalizeOptionalText(input.secondaryEmail),
        title: this.normalizeOptionalText(input.title),
        company: this.normalizeOptionalText(input.company),
        location: this.normalizeOptionalText(input.location),
        notes: this.normalizeOptionalText(input.notes),
      },
    });

    return this.mapProfile(user.id);
  }

  async addMyAssociation(
    user: AuthenticatedUser,
    input: AddUserAccountAssociationRequest,
  ): Promise<UserProfileResponse> {
    const identifier = this.normalizeAssociationIdentifier(input.identifier);
    if (!identifier) {
      throw new BadRequestException('identifier is required');
    }

    await this.prisma.userAccountAssociation.upsert({
      where: {
        ownerId_provider_identifier: {
          ownerId: user.id,
          provider: input.provider,
          identifier,
        },
      },
      update: {},
      create: {
        ownerId: user.id,
        provider: input.provider,
        identifier,
      },
    });

    return this.mapProfile(user.id);
  }

  async removeMyAssociation(user: AuthenticatedUser, associationId: string): Promise<UserProfileResponse> {
    const association = await this.prisma.userAccountAssociation.findFirst({
      where: { id: associationId, ownerId: user.id },
      select: { id: true, provider: true },
    });
    if (!association) {
      throw new NotFoundException('Association not found');
    }
    if (association.provider === PrismaAccountProvider.Password) {
      throw new BadRequestException('Cannot remove password association');
    }

    const count = await this.prisma.userAccountAssociation.count({
      where: { ownerId: user.id },
    });
    if (count <= 1) {
      throw new BadRequestException('At least one account association must remain linked');
    }

    await this.prisma.userAccountAssociation.delete({ where: { id: association.id } });
    return this.mapProfile(user.id);
  }
}
