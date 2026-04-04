import { ConfigService } from '@nestjs/config';
import { BadRequestException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type {
  AuthGoogleUrlResponse,
  AuthLoginResponse,
  AuthMicrosoftUrlResponse,
  AuthUser,
  UserRole,
} from '@fremont/shared';
import { AccountProvider as PrismaAccountProvider, type User } from '@prisma/client';
import { createHmac, createPublicKey, createVerify, randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { parseOriginList } from '../common/env';
import { hashPassword, issueAccessToken, verifyAccessToken, verifyPassword } from '../common/security';
import type { AuthenticatedUser } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get jwtSecret(): string {
    const secret = (this.config.get<string>('JWT_SECRET') ?? '').trim();
    if (!secret) {
      throw new Error('JWT_SECRET is required.');
    }
    return secret;
  }

  private get tokenTtlSeconds(): number {
    const value = Number(this.config.get<string>('JWT_EXPIRES_IN_SECONDS') ?? 60 * 60 * 8);
    return Number.isFinite(value) ? value : 60 * 60 * 8;
  }

  private get oauthStateSecret(): string {
    return this.config.get<string>('OAUTH_STATE_SECRET') || this.jwtSecret;
  }

  private get googleClientId(): string {
    return (this.config.get<string>('OAUTH_GOOGLE_CLIENT_ID') ?? '').trim();
  }

  private get googleClientSecret(): string {
    return (this.config.get<string>('OAUTH_GOOGLE_CLIENT_SECRET') ?? '').trim();
  }

  private get microsoftClientId(): string {
    return (this.config.get<string>('OAUTH_MICROSOFT_CLIENT_ID') ?? '').trim();
  }

  private get microsoftClientSecret(): string {
    return (this.config.get<string>('OAUTH_MICROSOFT_CLIENT_SECRET') ?? '').trim();
  }

  private get microsoftTenant(): string {
    return (this.config.get<string>('OAUTH_MICROSOFT_TENANT_ID') ?? 'common').trim() || 'common';
  }

  private get googleDefaultRole(): UserRole {
    const role = (this.config.get<string>('OAUTH_GOOGLE_DEFAULT_ROLE') ?? 'VIEWER').trim().toUpperCase();
    if (role === 'ADMIN' || role === 'ANALYST' || role === 'VIEWER') return role;
    return 'VIEWER';
  }

  private get microsoftDefaultRole(): UserRole {
    const role = (this.config.get<string>('OAUTH_MICROSOFT_DEFAULT_ROLE') ?? 'VIEWER').trim().toUpperCase();
    if (role === 'ADMIN' || role === 'ANALYST' || role === 'VIEWER') return role;
    return 'VIEWER';
  }

  private toAuthUser(user: Pick<User, 'id' | 'email' | 'name' | 'role'>): AuthUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  private normalizeAssociationIdentifier(value: string): string {
    return value.trim().toLowerCase();
  }

  private async ensureAssociation(userId: string, provider: PrismaAccountProvider, identifierRaw: string): Promise<void> {
    const identifier = this.normalizeAssociationIdentifier(identifierRaw);
    if (!identifier) return;

    await this.prisma.userAccountAssociation.upsert({
      where: {
        ownerId_provider_identifier: {
          ownerId: userId,
          provider,
          identifier,
        },
      },
      update: {},
      create: {
        ownerId: userId,
        provider,
        identifier,
      },
    });
  }

  private async ensureOrValidateAssociation(
    user: Pick<User, 'id'>,
    provider: PrismaAccountProvider,
    identifierRaw: string,
  ): Promise<void> {
    const identifier = this.normalizeAssociationIdentifier(identifierRaw);
    const existing = await this.prisma.userAccountAssociation.findMany({
      where: { ownerId: user.id },
      select: { provider: true, identifier: true },
    });

    if (existing.length === 0) {
      await this.ensureAssociation(user.id, provider, identifier);
      return;
    }

    const hasAssociation = existing.some(
      (association) => association.provider === provider && association.identifier === identifier,
    );
    if (!hasAssociation) {
      throw new UnauthorizedException(`This ${provider} account is not linked`);
    }
  }

  private ensureGoogleConfigured(): void {
    if (!this.googleClientId || !this.googleClientSecret) {
      throw new BadRequestException('Google OAuth is not configured');
    }
  }

  private ensureMicrosoftConfigured(): void {
    if (!this.microsoftClientId || !this.microsoftClientSecret) {
      throw new BadRequestException('Microsoft OAuth is not configured');
    }
  }

  private normalizeRedirectUri(raw: string, allowedOriginsEnvName: string): string {
    const trimmed = raw.trim();
    if (!trimmed) {
      throw new BadRequestException('redirectUri is required');
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new BadRequestException('redirectUri must be a valid absolute URL');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new BadRequestException('redirectUri must use http or https');
    }

    const allowed = parseOriginList(
      this.config.get<string>(allowedOriginsEnvName),
      allowedOriginsEnvName,
    );

    if (allowed.length > 0 && !allowed.includes(parsed.origin)) {
      throw new BadRequestException('redirectUri origin is not allowed');
    }

    parsed.hash = '';
    return parsed.toString();
  }

  private signStatePayload(payload: string): string {
    return createHmac('sha256', this.oauthStateSecret).update(payload).digest('base64url');
  }

  private issueOAuthState(redirectUri: string): string {
    const exp = Math.floor(Date.now() / 1000) + 60 * 10;
    const nonce = randomBytes(8).toString('hex');
    const payload = Buffer.from(JSON.stringify({ redirectUri, exp, nonce }), 'utf8').toString('base64url');
    const signature = this.signStatePayload(payload);
    return `${payload}.${signature}`;
  }

  private verifyOAuthState(state: string, redirectUri: string): boolean {
    const [payloadEncoded, signature] = state.split('.');
    if (!payloadEncoded || !signature) return false;

    const expectedSignature = this.signStatePayload(payloadEncoded);
    const sigBuf = Buffer.from(signature, 'utf8');
    const expectedBuf = Buffer.from(expectedSignature, 'utf8');
    if (sigBuf.length !== expectedBuf.length) return false;
    if (!timingSafeEqual(sigBuf, expectedBuf)) return false;

    try {
      const payload = JSON.parse(Buffer.from(payloadEncoded, 'base64url').toString('utf8')) as {
        redirectUri?: string;
        exp?: number;
      };
      if (typeof payload.redirectUri !== 'string' || payload.redirectUri !== redirectUri) return false;
      if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) return false;
      return true;
    } catch {
      return false;
    }
  }

  private issueSession(user: Pick<User, 'id' | 'email' | 'name' | 'role'>): AuthLoginResponse {
    const issued = issueAccessToken(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      this.jwtSecret,
      this.tokenTtlSeconds,
    );

    return {
      accessToken: issued.token,
      expiresAt: issued.expiresAt.toISOString(),
      user: this.toAuthUser(user),
    };
  }

  private async resolveOrCreateOAuthUser(
    emailRaw: string,
    nameRaw: string | undefined,
    defaultRole: UserRole,
    provider: PrismaAccountProvider,
  ): Promise<User> {
    const email = emailRaw.trim().toLowerCase();
    if (!email) {
      throw new UnauthorizedException('Identity provider did not provide an email');
    }

    const name = (nameRaw ?? '').trim() || email.split('@')[0] || 'OAuth User';
    let user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      try {
        user = await this.prisma.user.create({
          data: {
            email,
            name,
            passwordHash: hashPassword(randomBytes(32).toString('hex')),
            role: defaultRole,
            accountAssociations: {
              create: {
                provider,
                identifier: email,
              },
            },
          },
        });
        return user;
      } catch (err: any) {
        if (err?.code !== 'P2002') throw err;
        // Another request created the user between our findUnique and create — fetch it
        user = await this.prisma.user.findUniqueOrThrow({ where: { email } });
      }
    }

    await this.ensureOrValidateAssociation(user, provider, email);
    return user;
  }

  private parseJwtPart<T>(value: string): T | null {
    try {
      const raw = Buffer.from(value, 'base64url').toString('utf8');
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private formatOAuthFetchError(error: unknown): string {
    if (!error || typeof error !== 'object') return '';

    const parts: string[] = [];
    const typed = error as { message?: unknown; cause?: unknown; code?: unknown; errno?: unknown };
    if (typeof typed.message === 'string' && typed.message.trim()) {
      parts.push(typed.message.trim());
    }
    if (typeof typed.code === 'string' && typed.code.trim()) {
      parts.push(`code=${typed.code.trim()}`);
    }
    if (typeof typed.errno === 'string' && typed.errno.trim()) {
      parts.push(`errno=${typed.errno.trim()}`);
    }

    const cause = typed.cause;
    if (cause && typeof cause === 'object') {
      const causeTyped = cause as { message?: unknown; code?: unknown };
      if (typeof causeTyped.message === 'string' && causeTyped.message.trim()) {
        parts.push(`cause=${causeTyped.message.trim()}`);
      }
      if (typeof causeTyped.code === 'string' && causeTyped.code.trim()) {
        parts.push(`causeCode=${causeTyped.code.trim()}`);
      }
    }

    return parts.length > 0 ? parts.join(' | ') : '';
  }

  private async oauthFetch(url: string, init: RequestInit, provider: 'Google' | 'Microsoft', step: string): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (error) {
      const detail = this.formatOAuthFetchError(error);
      throw new ServiceUnavailableException(
        `${provider} OAuth network error during ${step}. Check API outbound HTTPS connectivity and proxy configuration.${
          detail ? ` Details: ${detail}` : ''
        }`,
      );
    }
  }

  private async responseErrorDetail(response: Response): Promise<string> {
    try {
      const text = (await response.text()).trim();
      if (!text) return '';
      return text.length > 240 ? `${text.slice(0, 240)}...` : text;
    } catch {
      return '';
    }
  }

  private async validateMicrosoftIdToken(idToken: string): Promise<{
    email: string;
    name: string;
  }> {
    const [headerRaw, payloadRaw, signatureRaw] = idToken.split('.');
    if (!headerRaw || !payloadRaw || !signatureRaw) {
      throw new UnauthorizedException('Microsoft identity token is malformed');
    }

    const header = this.parseJwtPart<{ alg?: string; kid?: string }>(headerRaw);
    const payload = this.parseJwtPart<{
      aud?: string;
      exp?: number;
      nbf?: number;
      iss?: string;
      tid?: string;
      email?: string;
      preferred_username?: string;
      upn?: string;
      name?: string;
    }>(payloadRaw);

    if (!header || !payload) {
      throw new UnauthorizedException('Microsoft identity token is malformed');
    }
    if (header.alg !== 'RS256' || !header.kid) {
      throw new UnauthorizedException('Microsoft identity token header is invalid');
    }
    if (payload.aud !== this.microsoftClientId) {
      throw new UnauthorizedException('Microsoft token audience mismatch');
    }

    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp <= now) {
      throw new UnauthorizedException('Microsoft identity token is expired');
    }
    if (payload.nbf && payload.nbf > now + 60) {
      throw new UnauthorizedException('Microsoft identity token is not yet valid');
    }

    const tenant = this.microsoftTenant;
    const openidResponse = await this.oauthFetch(
      `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/v2.0/.well-known/openid-configuration`,
      { method: 'GET' },
      'Microsoft',
      'openid configuration fetch',
    );
    if (!openidResponse.ok) {
      const detail = await this.responseErrorDetail(openidResponse);
      throw new UnauthorizedException(
        `Unable to load Microsoft OpenID configuration (${openidResponse.status})${detail ? `: ${detail}` : ''}`,
      );
    }
    const openid = (await openidResponse.json()) as { issuer?: string; jwks_uri?: string };
    if (!openid.issuer || !openid.jwks_uri) {
      throw new UnauthorizedException('Microsoft OpenID configuration is invalid');
    }

    const issuer = payload.iss ?? '';
    if (!issuer) {
      throw new UnauthorizedException('Microsoft identity token has no issuer');
    }
    if (openid.issuer.includes('{tenantid}')) {
      const tid = (payload.tid ?? '').trim();
      const expectedIssuer = tid ? openid.issuer.replace('{tenantid}', tid) : '';
      if (!expectedIssuer || issuer !== expectedIssuer) {
        throw new UnauthorizedException('Microsoft identity token issuer mismatch');
      }
    } else if (issuer !== openid.issuer) {
      throw new UnauthorizedException('Microsoft identity token issuer mismatch');
    }

    const jwksResponse = await this.oauthFetch(
      openid.jwks_uri,
      { method: 'GET' },
      'Microsoft',
      'JWKS fetch',
    );
    if (!jwksResponse.ok) {
      const detail = await this.responseErrorDetail(jwksResponse);
      throw new UnauthorizedException(
        `Unable to load Microsoft signing keys (${jwksResponse.status})${detail ? `: ${detail}` : ''}`,
      );
    }
    const jwks = (await jwksResponse.json()) as {
      keys?: Array<{ kid?: string; kty?: string; use?: string } & Record<string, unknown>>;
    };
    const signingKey = (jwks.keys ?? []).find((key) => key.kid === header.kid && key.kty === 'RSA');
    if (!signingKey) {
      throw new UnauthorizedException('Microsoft signing key not found');
    }

    const signature = Buffer.from(signatureRaw, 'base64url');
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${headerRaw}.${payloadRaw}`);
    verifier.end();

    const publicKey = createPublicKey({
      key: signingKey as Record<string, unknown>,
      format: 'jwk',
    });
    const valid = verifier.verify(publicKey, signature);
    if (!valid) {
      throw new UnauthorizedException('Microsoft identity token signature is invalid');
    }

    const emailCandidate = (payload.email ?? payload.preferred_username ?? payload.upn ?? '').trim().toLowerCase();
    if (!emailCandidate || !emailCandidate.includes('@')) {
      throw new UnauthorizedException('Microsoft account did not provide a valid email');
    }

    const name = (payload.name ?? '').trim() || emailCandidate.split('@')[0] || 'Microsoft User';
    return { email: emailCandidate, name };
  }

  async login(email: string, password: string): Promise<AuthLoginResponse> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user || !verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.ensureOrValidateAssociation(user, PrismaAccountProvider.Password, normalizedEmail);
    return this.issueSession(user);
  }

  getGoogleAuthUrl(redirectUriRaw: string): AuthGoogleUrlResponse {
    this.ensureGoogleConfigured();
    const redirectUri = this.normalizeRedirectUri(redirectUriRaw, 'OAUTH_GOOGLE_ALLOWED_REDIRECT_ORIGINS');
    const state = this.issueOAuthState(redirectUri);

    const params = new URLSearchParams({
      client_id: this.googleClientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'select_account',
      state,
    });

    return {
      state,
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    };
  }

  async exchangeGoogleCode(codeRaw: string, redirectUriRaw: string, stateRaw: string): Promise<AuthLoginResponse> {
    this.ensureGoogleConfigured();

    const code = codeRaw.trim();
    const redirectUri = this.normalizeRedirectUri(redirectUriRaw, 'OAUTH_GOOGLE_ALLOWED_REDIRECT_ORIGINS');
    const state = stateRaw.trim();

    if (!code) throw new BadRequestException('code is required');
    if (!state || !this.verifyOAuthState(state, redirectUri)) {
      throw new UnauthorizedException('Invalid OAuth state');
    }

    const tokenResponse = await this.oauthFetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.googleClientId,
        client_secret: this.googleClientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    }, 'Google', 'token exchange');

    if (!tokenResponse.ok) {
      const detail = await this.responseErrorDetail(tokenResponse);
      throw new UnauthorizedException(
        `Unable to exchange Google authorization code (${tokenResponse.status})${detail ? `: ${detail}` : ''}`,
      );
    }

    const tokenPayload = (await tokenResponse.json()) as { id_token?: string };
    const idToken = (tokenPayload.id_token ?? '').trim();
    if (!idToken) {
      throw new UnauthorizedException('Google token response was missing id_token');
    }

    const infoResponse = await this.oauthFetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
      { method: 'GET' },
      'Google',
      'id token validation',
    );
    if (!infoResponse.ok) {
      const detail = await this.responseErrorDetail(infoResponse);
      throw new UnauthorizedException(
        `Unable to validate Google identity token (${infoResponse.status})${detail ? `: ${detail}` : ''}`,
      );
    }

    const info = (await infoResponse.json()) as {
      aud?: string;
      email?: string;
      email_verified?: string;
      name?: string;
      sub?: string;
      exp?: string;
    };

    if (info.aud !== this.googleClientId) {
      throw new UnauthorizedException('Google token audience mismatch');
    }
    if ((info.email_verified ?? '').toLowerCase() !== 'true') {
      throw new UnauthorizedException('Google email is not verified');
    }

    const expSeconds = Number(info.exp ?? 0);
    if (!Number.isFinite(expSeconds) || expSeconds <= Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Google identity token is expired');
    }

    const user = await this.resolveOrCreateOAuthUser(
      (info.email ?? '').trim().toLowerCase(),
      info.name,
      this.googleDefaultRole,
      PrismaAccountProvider.Google,
    );

    return this.issueSession(user);
  }

  getMicrosoftAuthUrl(redirectUriRaw: string): AuthMicrosoftUrlResponse {
    this.ensureMicrosoftConfigured();
    const redirectUri = this.normalizeRedirectUri(redirectUriRaw, 'OAUTH_MICROSOFT_ALLOWED_REDIRECT_ORIGINS');
    const state = this.issueOAuthState(redirectUri);

    const params = new URLSearchParams({
      client_id: this.microsoftClientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      response_mode: 'query',
      scope: 'openid profile email offline_access',
      state,
      prompt: 'select_account',
    });

    return {
      state,
      url: `https://login.microsoftonline.com/${encodeURIComponent(this.microsoftTenant)}/oauth2/v2.0/authorize?${params.toString()}`,
    };
  }

  async exchangeMicrosoftCode(codeRaw: string, redirectUriRaw: string, stateRaw: string): Promise<AuthLoginResponse> {
    this.ensureMicrosoftConfigured();

    const code = codeRaw.trim();
    const redirectUri = this.normalizeRedirectUri(redirectUriRaw, 'OAUTH_MICROSOFT_ALLOWED_REDIRECT_ORIGINS');
    const state = stateRaw.trim();

    if (!code) throw new BadRequestException('code is required');
    if (!state || !this.verifyOAuthState(state, redirectUri)) {
      throw new UnauthorizedException('Invalid OAuth state');
    }

    const tokenResponse = await this.oauthFetch(
      `https://login.microsoftonline.com/${encodeURIComponent(this.microsoftTenant)}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: this.microsoftClientId,
          client_secret: this.microsoftClientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          scope: 'openid profile email offline_access',
        }).toString(),
      },
      'Microsoft',
      'token exchange',
    );

    if (!tokenResponse.ok) {
      const detail = await this.responseErrorDetail(tokenResponse);
      throw new UnauthorizedException(
        `Unable to exchange Microsoft authorization code (${tokenResponse.status})${detail ? `: ${detail}` : ''}`,
      );
    }

    const tokenPayload = (await tokenResponse.json()) as { id_token?: string };
    const idToken = (tokenPayload.id_token ?? '').trim();
    if (!idToken) {
      throw new UnauthorizedException('Microsoft token response was missing id_token');
    }

    const identity = await this.validateMicrosoftIdToken(idToken);
    const user = await this.resolveOrCreateOAuthUser(
      identity.email,
      identity.name,
      this.microsoftDefaultRole,
      PrismaAccountProvider.Microsoft,
    );

    return this.issueSession(user);
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return this.toAuthUser(user);
  }

  validateAccessToken(token: string): AuthenticatedUser | null {
    const payload = verifyAccessToken(token, this.jwtSecret);
    if (!payload) return null;

    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      exp: payload.exp,
    };
  }
}
