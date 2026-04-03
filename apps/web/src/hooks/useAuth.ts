'use client';

import { useState, useEffect, type FormEvent } from 'react';
import type { AuthUser } from '@fremont/shared';
import { api } from '../lib/api';

const GOOGLE_OAUTH_STATE_KEY = 'fremont.oauth.google.state.v1';
const MICROSOFT_OAUTH_STATE_KEY = 'fremont.oauth.microsoft.state.v1';

export const CONFIGURED_OAUTH_REDIRECT_URI = (
  process.env.NEXT_PUBLIC_OAUTH_REDIRECT_URI ??
  process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI ??
  ''
).trim();

function resolveRedirectUri(): string {
  if (CONFIGURED_OAUTH_REDIRECT_URI) return CONFIGURED_OAUTH_REDIRECT_URI;
  return `${window.location.origin}${window.location.pathname}`;
}

function clearOAuthParamsFromUrl(): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  ['code', 'state', 'scope', 'authuser', 'prompt', 'session_state'].forEach((param) => {
    url.searchParams.delete(param);
  });
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

export type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated';

export type UseAuthReturn = {
  authStatus: AuthStatus;
  currentUser: AuthUser | null;
  loginEmail: string;
  setLoginEmail: (v: string) => void;
  loginPassword: string;
  setLoginPassword: (v: string) => void;
  loginLoading: boolean;
  loginError: string | null;
  googleAuthLoading: boolean;
  googleAuthError: string | null;
  microsoftAuthLoading: boolean;
  microsoftAuthError: string | null;
  authError: string | null;
  handlePasswordLogin: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  startGoogleSignIn: () => Promise<void>;
  startMicrosoftSignIn: () => Promise<void>;
  signOut: () => void;
};

export function useAuth(onSignOut?: () => void): UseAuthReturn {
  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking');
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [googleAuthLoading, setGoogleAuthLoading] = useState(false);
  const [googleAuthError, setGoogleAuthError] = useState<string | null>(null);
  const [microsoftAuthLoading, setMicrosoftAuthLoading] = useState(false);
  const [microsoftAuthError, setMicrosoftAuthError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (typeof window === 'undefined') return undefined;

    const bootstrap = async () => {
      setAuthStatus('checking');
      const params = new URLSearchParams(window.location.search);
      const providerError = params.get('error');
      const providerErrorDescription = params.get('error_description');
      const providerErrorUri = (params.get('error_uri') ?? '').toLowerCase();
      const code = params.get('code');
      const state = params.get('state');

      if (providerError) {
        const rawDescription = providerErrorDescription
          ? decodeURIComponent(providerErrorDescription).replace(/\+/g, ' ')
          : providerError;
        const normalized = rawDescription.toLowerCase();
        const isMicrosoft =
          providerErrorUri.includes('login.microsoftonline.com') ||
          normalized.includes('aadsts') ||
          normalized.includes('microsoft');

        if (!active) return;
        if (isMicrosoft) {
          setMicrosoftAuthError(rawDescription);
          setGoogleAuthError(null);
        } else {
          setGoogleAuthError(rawDescription);
          setMicrosoftAuthError(null);
        }
        window.sessionStorage.removeItem(GOOGLE_OAUTH_STATE_KEY);
        window.sessionStorage.removeItem(MICROSOFT_OAUTH_STATE_KEY);
        clearOAuthParamsFromUrl();
        setGoogleAuthLoading(false);
        setMicrosoftAuthLoading(false);
        setAuthStatus('unauthenticated');
        return;
      }

      if (code) {
        const googleState = window.sessionStorage.getItem(GOOGLE_OAUTH_STATE_KEY);
        const microsoftState = window.sessionStorage.getItem(MICROSOFT_OAUTH_STATE_KEY);
        const isGoogleFlow = Boolean(state && googleState && state === googleState);
        const isMicrosoftFlow = Boolean(state && microsoftState && state === microsoftState);

        if (!isGoogleFlow && !isMicrosoftFlow) {
          if (!active) return;
          setGoogleAuthError('Sign-in state mismatch. Please try signing in again.');
          setMicrosoftAuthError(null);
          clearOAuthParamsFromUrl();
          setAuthStatus('unauthenticated');
          return;
        }

        setGoogleAuthLoading(isGoogleFlow);
        setMicrosoftAuthLoading(isMicrosoftFlow);
        setGoogleAuthError(null);
        setMicrosoftAuthError(null);
        try {
          const redirectUri = resolveRedirectUri();
          const session = isGoogleFlow
            ? await api.loginWithGoogleCode({ code, state: state as string, redirectUri })
            : await api.loginWithMicrosoftCode({ code, state: state as string, redirectUri });
          window.sessionStorage.removeItem(GOOGLE_OAUTH_STATE_KEY);
          window.sessionStorage.removeItem(MICROSOFT_OAUTH_STATE_KEY);
          clearOAuthParamsFromUrl();
          if (!active) return;
          setCurrentUser(session.user);
          setAuthStatus('authenticated');
          setGoogleAuthLoading(false);
          setMicrosoftAuthLoading(false);
          return;
        } catch (error) {
          const message = error instanceof Error && error.message.trim() ? error.message.trim() : null;
          if (!active) return;
          if (isGoogleFlow) {
            setGoogleAuthError(message ?? 'Google sign-in failed. Please try again.');
          } else {
            setMicrosoftAuthError(message ?? 'Microsoft sign-in failed. Please try again.');
          }
          setGoogleAuthLoading(false);
          setMicrosoftAuthLoading(false);
          setAuthStatus('unauthenticated');
          return;
        }
      }

      if (!api.hasStoredToken()) {
        if (!active) return;
        setAuthStatus('unauthenticated');
        return;
      }

      try {
        const me = await api.me();
        if (!active) return;
        setCurrentUser(me);
        setAuthStatus('authenticated');
      } catch {
        if (!active) return;
        api.logout();
        setAuthStatus('unauthenticated');
      }
    };

    void bootstrap();
    return () => {
      active = false;
    };
  }, []);

  const handlePasswordLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!loginEmail.trim() || !loginPassword) {
      setLoginError('Enter email and password.');
      return;
    }
    setLoginLoading(true);
    setLoginError(null);
    setGoogleAuthError(null);
    try {
      const session = await api.login(loginEmail.trim(), loginPassword);
      setCurrentUser(session.user);
      setAuthStatus('authenticated');
      setLoginPassword('');
    } catch {
      setLoginError('Invalid email or password.');
      setAuthStatus('unauthenticated');
    } finally {
      setLoginLoading(false);
    }
  };

  const startGoogleSignIn = async () => {
    if (typeof window === 'undefined' || googleAuthLoading) return;
    setGoogleAuthLoading(true);
    setGoogleAuthError(null);
    setMicrosoftAuthError(null);
    setLoginError(null);
    try {
      const { url, state } = await api.googleAuthUrl(resolveRedirectUri());
      window.sessionStorage.setItem(GOOGLE_OAUTH_STATE_KEY, state);
      window.location.assign(url);
    } catch {
      setGoogleAuthError('Unable to start Google sign-in. Check OAuth configuration and try again.');
      setGoogleAuthLoading(false);
    }
  };

  const startMicrosoftSignIn = async () => {
    if (typeof window === 'undefined' || microsoftAuthLoading) return;
    setMicrosoftAuthLoading(true);
    setMicrosoftAuthError(null);
    setGoogleAuthError(null);
    setLoginError(null);
    try {
      const { url, state } = await api.microsoftAuthUrl(resolveRedirectUri());
      window.sessionStorage.setItem(MICROSOFT_OAUTH_STATE_KEY, state);
      window.location.assign(url);
    } catch {
      setMicrosoftAuthError('Unable to start Microsoft sign-in. Check OAuth configuration and try again.');
      setMicrosoftAuthLoading(false);
    }
  };

  const signOut = () => {
    api.logout();
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(GOOGLE_OAUTH_STATE_KEY);
      window.sessionStorage.removeItem(MICROSOFT_OAUTH_STATE_KEY);
    }
    setCurrentUser(null);
    setAuthStatus('unauthenticated');
    setLoginPassword('');
    onSignOut?.();
  };

  return {
    authStatus,
    currentUser,
    loginEmail,
    setLoginEmail,
    loginPassword,
    setLoginPassword,
    loginLoading,
    loginError,
    googleAuthLoading,
    googleAuthError,
    microsoftAuthLoading,
    microsoftAuthError,
    authError: loginError ?? googleAuthError ?? microsoftAuthError,
    handlePasswordLogin,
    startGoogleSignIn,
    startMicrosoftSignIn,
    signOut,
  };
}
