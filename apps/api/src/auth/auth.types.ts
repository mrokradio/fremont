import type { UserRole } from '@fremont/shared';

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  exp: number;
};

export type RequestWithUser = {
  headers: {
    authorization?: string;
  };
  user?: AuthenticatedUser;
};
