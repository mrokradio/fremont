import type {
  AddUserAccountAssociationRequest,
  AuthGoogleExchangeRequest,
  AuthGoogleUrlResponse,
  AuthLoginResponse,
  AuthMicrosoftExchangeRequest,
  AuthMicrosoftUrlResponse,
  AuthUser,
  AssetRecord,
  AssetWriteInput,
  CashflowsResponse,
  CsvIngestRequest,
  CsvIngestResult,
  DashboardResponse,
  FinancialProfile,
  FinancialWorkspaceResponse,
  HealthResponse,
  PlanningScenario,
  PlanningScenarioWriteInput,
  Position,
  PositionWriteInput,
  ProjectionResponse,
  ReportingYearFacts,
  ScenarioCompareDetailResponse,
  StrategyBenchmark,
  StrategyReportingBundle,
  Transaction,
  TransactionWriteInput,
  UpsertUserContactRequest,
  UpsertStrategyBenchmarksRequest,
  UpsertCashflowsRequest,
  UpsertFinancialProfileRequest,
  UpsertStrategyExposuresRequest,
  UserProfileResponse,
} from '@fremont/shared';
import { LOCAL_STORAGE_KEYS } from '@fremont/shared';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000').replace(
  '://localhost',
  '://127.0.0.1',
);
const TOKEN_KEY = LOCAL_STORAGE_KEYS.authToken;

let tokenCache: string | null = null;

function readStoredToken(): string | null {
  if (tokenCache) return tokenCache;
  if (typeof window === 'undefined') return null;

  const value = window.localStorage.getItem(TOKEN_KEY);
  if (value) {
    tokenCache = value;
  }
  return value;
}

function writeStoredToken(token: string | null): void {
  tokenCache = token;
  if (typeof window === 'undefined') return;

  if (token) {
    window.localStorage.setItem(TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(TOKEN_KEY);
  }
}

function hasStoredToken(): boolean {
  return Boolean(readStoredToken());
}

async function responseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: unknown };
    if (typeof payload.message === 'string' && payload.message.trim()) {
      return payload.message.trim();
    }
    if (Array.isArray(payload.message) && payload.message.length > 0) {
      const first = payload.message.find((item) => typeof item === 'string' && item.trim());
      if (typeof first === 'string') {
        return first.trim();
      }
    }
  } catch {
    // no-op: fallback below
  }

  return fallback;
}

async function login(email: string, password: string): Promise<AuthLoginResponse> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error(`Login failed (${response.status})`);
  }

  const payload = (await response.json()) as AuthLoginResponse;
  writeStoredToken(payload.accessToken);
  return payload;
}

async function googleAuthUrl(redirectUri: string): Promise<AuthGoogleUrlResponse> {
  const response = await fetch(
    `${API_BASE}/auth/google/url?redirectUri=${encodeURIComponent(redirectUri)}`,
    { method: 'GET' },
  );
  if (!response.ok) {
    throw new Error(`Google auth URL failed (${response.status})`);
  }
  return (await response.json()) as AuthGoogleUrlResponse;
}

async function loginWithGoogleCode(input: AuthGoogleExchangeRequest): Promise<AuthLoginResponse> {
  const response = await fetch(`${API_BASE}/auth/google/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const message = await responseErrorMessage(
      response,
      `Google exchange failed (${response.status})`,
    );
    throw new Error(message);
  }
  const payload = (await response.json()) as AuthLoginResponse;
  writeStoredToken(payload.accessToken);
  return payload;
}

async function microsoftAuthUrl(redirectUri: string): Promise<AuthMicrosoftUrlResponse> {
  const response = await fetch(
    `${API_BASE}/auth/microsoft/url?redirectUri=${encodeURIComponent(redirectUri)}`,
    { method: 'GET' },
  );
  if (!response.ok) {
    throw new Error(`Microsoft auth URL failed (${response.status})`);
  }
  return (await response.json()) as AuthMicrosoftUrlResponse;
}

async function loginWithMicrosoftCode(input: AuthMicrosoftExchangeRequest): Promise<AuthLoginResponse> {
  const response = await fetch(`${API_BASE}/auth/microsoft/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const message = await responseErrorMessage(
      response,
      `Microsoft exchange failed (${response.status})`,
    );
    throw new Error(message);
  }
  const payload = (await response.json()) as AuthLoginResponse;
  writeStoredToken(payload.accessToken);
  return payload;
}

async function ensureToken(force = false): Promise<string | null> {
  if (!force) {
    const existing = readStoredToken();
    if (existing) return existing;
  }

  const email = process.env.NEXT_PUBLIC_API_EMAIL;
  const password = process.env.NEXT_PUBLIC_API_PASSWORD;
  if (!email || !password) return null;

  try {
    const session = await login(email, password);
    return session.accessToken;
  } catch {
    return null;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  retry?: boolean;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = false, retry = true } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (auth) {
    const token = await ensureToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 401 && auth && retry) {
    writeStoredToken(null);
    const refreshed = await ensureToken(true);
    if (refreshed) {
      return request<T>(path, { ...options, retry: false });
    }
  }

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  return (await response.json()) as T;
}

export const api = {
  health: () => request<HealthResponse>('/health'),
  login,
  googleAuthUrl,
  loginWithGoogleCode,
  microsoftAuthUrl,
  loginWithMicrosoftCode,
  logout: () => writeStoredToken(null),
  hasStoredToken,
  me: () => request<AuthUser>('/auth/me', { auth: true }),
  userProfile: () => request<UserProfileResponse>('/users/me/profile', { auth: true }),
  upsertUserContact: (input: UpsertUserContactRequest) =>
    request<UserProfileResponse>('/users/me/profile/contact', { method: 'PATCH', body: input, auth: true }),
  addUserAccountAssociation: (input: AddUserAccountAssociationRequest) =>
    request<UserProfileResponse>('/users/me/profile/associations', { method: 'POST', body: input, auth: true }),
  removeUserAccountAssociation: (id: string) =>
    request<UserProfileResponse>(`/users/me/profile/associations/${id}`, { method: 'DELETE', auth: true }),

  dashboard: () => request<DashboardResponse>('/portfolio/dashboard'),

  positions: () => request<Position[]>('/portfolio/positions'),
  createPosition: (input: PositionWriteInput) => request<Position>('/portfolio/positions', { method: 'POST', body: input, auth: true }),
  updatePosition: (id: string, input: PositionWriteInput) => request<Position>(`/portfolio/positions/${id}`, { method: 'PUT', body: input, auth: true }),
  deletePosition: (id: string) => request<{ status: 'ok' }>(`/portfolio/positions/${id}`, { method: 'DELETE', auth: true }),

  assets: () => request<AssetRecord[]>('/assets', { auth: true }),
  createAsset: (input: AssetWriteInput) => request<AssetRecord>('/assets', { method: 'POST', body: input, auth: true }),
  updateAsset: (id: string, input: AssetWriteInput) => request<AssetRecord>(`/assets/${id}`, { method: 'PUT', body: input, auth: true }),
  deleteAsset: (id: string) => request<{ status: 'ok' }>(`/assets/${id}`, { method: 'DELETE', auth: true }),

  transactions: () => request<Transaction[]>('/portfolio/transactions'),
  createTransaction: (input: TransactionWriteInput) => request<Transaction>('/portfolio/transactions', { method: 'POST', body: input, auth: true }),
  updateTransaction: (id: string, input: TransactionWriteInput) => request<Transaction>(`/portfolio/transactions/${id}`, { method: 'PUT', body: input, auth: true }),
  deleteTransaction: (id: string) => request<{ status: 'ok' }>(`/portfolio/transactions/${id}`, { method: 'DELETE', auth: true }),

  scenarios: () => request<PlanningScenario[]>('/planning/scenarios', { auth: true }),
  createScenario: (input: PlanningScenarioWriteInput) => request<PlanningScenario>('/planning/scenarios', { method: 'POST', body: input, auth: true }),
  updateScenario: (id: string, input: PlanningScenarioWriteInput) => request<PlanningScenario>(`/planning/scenarios/${id}`, { method: 'PUT', body: input, auth: true }),
  deleteScenario: (id: string) => request<{ status: 'ok' }>(`/planning/scenarios/${id}`, { method: 'DELETE', auth: true }),

  financialProfile: () => request<FinancialProfile>('/financial/profile', { auth: true }),
  upsertFinancialProfile: (input: UpsertFinancialProfileRequest) =>
    request<FinancialProfile>('/financial/profile', { method: 'PUT', body: input, auth: true }),

  cashflows: () => request<CashflowsResponse>('/cashflows', { auth: true }),
  upsertCashflows: (input: UpsertCashflowsRequest) =>
    request<CashflowsResponse>('/cashflows', { method: 'PUT', body: input, auth: true }),

  projectionScenario: (id: string) => request<ProjectionResponse>(`/projection/scenarios/${id}`, { auth: true }),
  reportingFacts: (year: number) =>
    request<ReportingYearFacts>(`/reporting/facts?year=${encodeURIComponent(year)}`, { auth: true }),
  compareScenarios: (baselineId: string, comparisonId: string) =>
    request<ScenarioCompareDetailResponse>(
      `/reporting/scenarios/compare?baselineId=${encodeURIComponent(baselineId)}&comparisonId=${encodeURIComponent(comparisonId)}`,
      { auth: true },
    ),
  financialWorkspace: (year: number) =>
    request<FinancialWorkspaceResponse>(`/financial/workspace?year=${encodeURIComponent(year)}`, { auth: true }),

  strategyReporting: () => request<StrategyReportingBundle>('/reporting/strategies', { auth: true }),
  upsertStrategyReporting: (input: UpsertStrategyExposuresRequest) =>
    request<StrategyReportingBundle>('/reporting/strategies', { method: 'PUT', body: input, auth: true }),
  strategyBenchmarks: () => request<StrategyBenchmark[]>('/reporting/strategies/benchmarks', { auth: true }),
  upsertStrategyBenchmarks: (input: UpsertStrategyBenchmarksRequest) =>
    request<StrategyBenchmark[]>('/reporting/strategies/benchmarks', { method: 'PUT', body: input, auth: true }),

  ingestPositions: (input: CsvIngestRequest) =>
    request<CsvIngestResult<PositionWriteInput>>('/ingest/positions', { method: 'POST', body: input, auth: true }),
  ingestTransactions: (input: CsvIngestRequest) =>
    request<CsvIngestResult<TransactionWriteInput>>('/ingest/transactions', { method: 'POST', body: input, auth: true }),
};
