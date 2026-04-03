import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto';
import type { UserRole } from '@fremont/shared';

const HASH_ITERATIONS = 120000;
const HASH_BYTES = 64;
const HASH_DIGEST = 'sha512';

type AccessTokenPayload = {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
  iat: number;
  exp: number;
  typ: 'access';
};

type AccessTokenInput = {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
};

function encodeBase64Url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function decodeBase64Url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function parsePayload(tokenPart: string): AccessTokenPayload | null {
  try {
    const json = decodeBase64Url(tokenPart);
    const parsed = JSON.parse(json) as Partial<AccessTokenPayload>;
    if (
      typeof parsed.sub !== 'string' ||
      typeof parsed.email !== 'string' ||
      typeof parsed.name !== 'string' ||
      (parsed.role !== 'ADMIN' && parsed.role !== 'ANALYST' && parsed.role !== 'VIEWER') ||
      typeof parsed.iat !== 'number' ||
      typeof parsed.exp !== 'number' ||
      parsed.typ !== 'access'
    ) {
      return null;
    }
    return parsed as AccessTokenPayload;
  } catch {
    return null;
  }
}

function sign(message: string, secret: string): string {
  return createHmac('sha256', secret).update(message).digest('base64url');
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_BYTES, HASH_DIGEST).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  const parts = passwordHash.split(':');
  if (parts.length !== 2) return false;

  const [salt, stored] = parts;
  const computed = pbkdf2Sync(password, salt, HASH_ITERATIONS, HASH_BYTES, HASH_DIGEST).toString('hex');

  const storedBuffer = Buffer.from(stored, 'hex');
  const computedBuffer = Buffer.from(computed, 'hex');
  if (storedBuffer.length !== computedBuffer.length) return false;
  return timingSafeEqual(storedBuffer, computedBuffer);
}

export function issueAccessToken(input: AccessTokenInput, secret: string, ttlSeconds: number): { token: string; expiresAt: Date } {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + Math.max(60, ttlSeconds);
  const header = encodeBase64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = encodeBase64Url(
    JSON.stringify({
      ...input,
      iat: now,
      exp,
      typ: 'access',
    } satisfies AccessTokenPayload),
  );
  const signingInput = `${header}.${payload}`;
  const signature = sign(signingInput, secret);

  return {
    token: `${signingInput}.${signature}`,
    expiresAt: new Date(exp * 1000),
  };
}

export function verifyAccessToken(token: string, secret: string): AccessTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  const signingInput = `${header}.${payload}`;
  const expectedSignature = sign(signingInput, secret);

  const signatureBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  if (signatureBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) return null;

  const parsedPayload = parsePayload(payload);
  if (!parsedPayload) return null;
  if (parsedPayload.exp <= Math.floor(Date.now() / 1000)) return null;

  return parsedPayload;
}
