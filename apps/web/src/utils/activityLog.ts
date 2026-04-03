import { LOCAL_STORAGE_KEYS } from '@fremont/shared';
import type { ActivityEntry } from '../types/models';

const LOG_KEY = LOCAL_STORAGE_KEYS.activityLog;
const IP_KEY = LOCAL_STORAGE_KEYS.activityIp;
const MAX_ENTRIES = 400;
const USER_ID_KEY = LOCAL_STORAGE_KEYS.activityUserId;
const USER_NAME_KEY = LOCAL_STORAGE_KEYS.activityUserName;
export const ACTIVITY_EVENT_KEY = LOCAL_STORAGE_KEYS.activityUpdatedEvent;

const safeParse = (raw: string | null): ActivityEntry[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ActivityEntry[];
    if (Array.isArray(parsed)) {
      return parsed.map((entry) => ({
        ...entry,
        userId: entry.userId || 'anon',
        userName: entry.userName || 'Anonymous',
      }));
    }
  } catch {}
  return [];
};

export const getActivityLog = (): ActivityEntry[] => {
  if (typeof window === 'undefined') return [];
  return safeParse(window.localStorage.getItem(LOG_KEY));
};

export const setActivityUser = (userId: string, userName: string) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(USER_ID_KEY, userId);
  window.localStorage.setItem(USER_NAME_KEY, userName);
};

export const getActivityUser = (): { userId: string; userName: string } => {
  if (typeof window === 'undefined') return { userId: 'anon', userName: 'Anonymous' };
  const userId = window.localStorage.getItem(USER_ID_KEY) || 'anon';
  const userName = window.localStorage.getItem(USER_NAME_KEY) || 'Anonymous';
  return { userId, userName };
};

export const setActivityIp = (ip: string) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(IP_KEY, ip || '127.0.0.1');
};

export const getActivityIp = (): string => {
  if (typeof window === 'undefined') return '127.0.0.1';
  return window.localStorage.getItem(IP_KEY) || '127.0.0.1';
};

export const appendActivity = (action: string, details?: Record<string, unknown>) => {
  if (typeof window === 'undefined') return;
  const { userId, userName } = getActivityUser();
  const entry: ActivityEntry = {
    id: 'act_' + Math.random().toString(36).slice(2, 10),
    timestamp: new Date().toISOString(),
    ip: getActivityIp(),
    userId,
    userName,
    action,
    details,
  };
  const current = getActivityLog();
  const next = [entry, ...current].slice(0, MAX_ENTRIES);
  window.localStorage.setItem(LOG_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(ACTIVITY_EVENT_KEY));
};

export const clearActivityLog = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(LOG_KEY);
  window.dispatchEvent(new CustomEvent(ACTIVITY_EVENT_KEY));
};
