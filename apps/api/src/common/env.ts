type RuntimeEnvironment = {
  port: number;
  corsAllowedOrigins: string[];
};

const USER_ROLES = new Set(['ADMIN', 'ANALYST', 'VIEWER']);
const LOCALHOST_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

function parsePort(raw: string | undefined, errors: string[]): number {
  if (!raw) return 4000;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    errors.push('PORT must be an integer between 1 and 65535.');
    return 4000;
  }
  return value;
}

function normalizeOrigin(value: string, envName: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${envName} contains an invalid URL: "${value}".`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${envName} must use http:// or https:// origins only.`);
  }

  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`${envName} must contain origins only (no path/query/hash): "${value}".`);
  }

  return parsed.origin;
}

export function parseOriginList(raw: string | undefined, envName: string): string[] {
  if (!raw) return [];

  const unique = new Set<string>();
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    unique.add(normalizeOrigin(trimmed, envName));
  }
  return [...unique];
}

export function loadRuntimeEnvironment(env: NodeJS.ProcessEnv = process.env): RuntimeEnvironment {
  const errors: string[] = [];
  const nodeEnv = (env.NODE_ENV ?? 'development').trim().toLowerCase();

  const port = parsePort(env.PORT, errors);

  const databaseUrl = (env.DATABASE_URL ?? '').trim();
  if (!databaseUrl) {
    errors.push('DATABASE_URL is required.');
  } else {
    try {
      const parsed = new URL(databaseUrl);
      if (parsed.protocol !== 'mysql:') {
        errors.push('DATABASE_URL must use the mysql:// scheme.');
      }
    } catch {
      errors.push('DATABASE_URL must be a valid absolute URL.');
    }
  }

  const jwtSecret = (env.JWT_SECRET ?? '').trim();
  if (!jwtSecret) {
    errors.push('JWT_SECRET is required.');
  } else if (nodeEnv === 'production' && jwtSecret === 'dev_jwt_secret') {
    errors.push('JWT_SECRET must not use the development default in production.');
  }

  const ttlRaw = env.JWT_EXPIRES_IN_SECONDS ?? '28800';
  const ttlSeconds = Number(ttlRaw);
  if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
    errors.push('JWT_EXPIRES_IN_SECONDS must be a positive integer.');
  }

  const googleClientId = (env.OAUTH_GOOGLE_CLIENT_ID ?? '').trim();
  const googleClientSecret = (env.OAUTH_GOOGLE_CLIENT_SECRET ?? '').trim();
  if ((googleClientId && !googleClientSecret) || (!googleClientId && googleClientSecret)) {
    errors.push('OAUTH_GOOGLE_CLIENT_ID and OAUTH_GOOGLE_CLIENT_SECRET must both be set together.');
  }

  const googleDefaultRole = (env.OAUTH_GOOGLE_DEFAULT_ROLE ?? 'VIEWER').trim().toUpperCase();
  if (!USER_ROLES.has(googleDefaultRole)) {
    errors.push('OAUTH_GOOGLE_DEFAULT_ROLE must be ADMIN, ANALYST, or VIEWER.');
  }

  try {
    parseOriginList(env.OAUTH_GOOGLE_ALLOWED_REDIRECT_ORIGINS, 'OAUTH_GOOGLE_ALLOWED_REDIRECT_ORIGINS');
  } catch (error) {
    errors.push((error as Error).message);
  }

  const microsoftClientId = (env.OAUTH_MICROSOFT_CLIENT_ID ?? '').trim();
  const microsoftClientSecret = (env.OAUTH_MICROSOFT_CLIENT_SECRET ?? '').trim();
  if ((microsoftClientId && !microsoftClientSecret) || (!microsoftClientId && microsoftClientSecret)) {
    errors.push('OAUTH_MICROSOFT_CLIENT_ID and OAUTH_MICROSOFT_CLIENT_SECRET must both be set together.');
  }

  const microsoftDefaultRole = (env.OAUTH_MICROSOFT_DEFAULT_ROLE ?? 'VIEWER').trim().toUpperCase();
  if (!USER_ROLES.has(microsoftDefaultRole)) {
    errors.push('OAUTH_MICROSOFT_DEFAULT_ROLE must be ADMIN, ANALYST, or VIEWER.');
  }

  try {
    parseOriginList(env.OAUTH_MICROSOFT_ALLOWED_REDIRECT_ORIGINS, 'OAUTH_MICROSOFT_ALLOWED_REDIRECT_ORIGINS');
  } catch (error) {
    errors.push((error as Error).message);
  }

  let corsAllowedOrigins: string[] = [];
  const corsRaw = (env.CORS_ALLOWED_ORIGINS ?? '').trim() || (env.WEB_BASE_URL ?? '').trim();
  try {
    corsAllowedOrigins = parseOriginList(corsRaw, 'CORS_ALLOWED_ORIGINS');
  } catch (error) {
    errors.push((error as Error).message);
  }

  if (nodeEnv === 'production' && corsAllowedOrigins.length === 0) {
    errors.push('CORS_ALLOWED_ORIGINS must be configured in production.');
  }
  if (corsAllowedOrigins.length === 0) {
    corsAllowedOrigins = LOCALHOST_ORIGINS;
  }

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n- ${errors.join('\n- ')}`);
  }

  return { port, corsAllowedOrigins };
}
