import { useEffect, useMemo, useState } from 'react';
import { LOCAL_STORAGE_KEYS } from '@fremont/shared';
import type { ActivityEntry } from '../types/models';
import { appendActivity, clearActivityLog, getActivityIp, getActivityLog, getActivityUser, setActivityIp, setActivityUser, ACTIVITY_EVENT_KEY } from '../utils/activityLog';
import { safeLocalGet, safeLocalSet } from '../utils/storage';
import { StrategyBenchmarksAdmin } from './StrategyBenchmarksAdmin';

type Kind = 'Real Estate' | 'Car' | 'Boat' | 'Airplane' | 'Travel' | 'School' | 'OpCos';
export type AdminTab = 'asset-defaults' | 'strategy-benchmarks' | 'activity-log';

type Defaults = {
  cost?: string;
  recurring?: string;
  duration?: string;
  color?: string;
  recurringInc?: string;
  lifeYears?: string;
  residualPct?: string;
  opAction?: 'buy' | 'sell';
  opAmount?: string;
};

const STORAGE_KEY = LOCAL_STORAGE_KEYS.planningDefaults;

const COLORS: Record<Kind, string> = {
  'Real Estate': '#fde68a',
  Car: '#bfdbfe',
  Boat: '#c4b5fd',
  Airplane: '#fca5a5',
  Travel: '#bbf7d0',
  School: '#fecdd3',
  OpCos: '#e0f2fe',
};

const initialByKind: Record<Kind, Defaults> = {
  'Real Estate': { cost: '$1,500,000', recurring: '$25,000', duration: '10', color: COLORS['Real Estate'] },
  Car: { cost: '$50,000', duration: '5', color: COLORS.Car },
  Boat: { cost: '$250,000', duration: '10', color: COLORS.Boat },
  Airplane: { cost: '$2,000,000', recurring: '$500,000', lifeYears: '10', residualPct: '20', color: COLORS.Airplane },
  Travel: { cost: '$5,000', duration: '1', color: COLORS.Travel },
  School: { cost: '$50,000', recurring: '$50,000', recurringInc: '5.0', duration: '3', color: COLORS.School },
  OpCos: { opAction: 'buy', opAmount: '$100,000', color: COLORS.OpCos },
};

type Props = {
  activeTab: AdminTab;
};

export function AdminView({ activeTab }: Props) {
  const [data, setData] = useState<Record<Kind, Defaults>>(initialByKind);
  const [activity, setActivity] = useState<ActivityEntry[]>(() => getActivityLog());
  const [ipAddress, setIpAddress] = useState<string>(() => getActivityIp());
  const [{ userId, userName }, setUserState] = useState(() => getActivityUser());

  useEffect(() => {
    const stored = safeLocalGet<Record<Kind, Defaults> | null>(STORAGE_KEY, null);
    if (stored) setData({ ...initialByKind, ...stored });
  }, []);

  useEffect(() => {
    const handler = () => setActivity(getActivityLog());
    window.addEventListener(ACTIVITY_EVENT_KEY, handler as EventListener);
    return () => window.removeEventListener(ACTIVITY_EVENT_KEY, handler as EventListener);
  }, []);

  const save = () => {
    safeLocalSet(STORAGE_KEY, data);
    appendActivity('Admin defaults saved', { keys: Object.keys(data) });
  };

  const reset = () => {
    setData(initialByKind);
    safeLocalSet(STORAGE_KEY, initialByKind);
    appendActivity('Admin defaults reset');
  };

  const onIpBlur = () => {
    const cleaned = ipAddress.trim() || '127.0.0.1';
    setIpAddress(cleaned);
    const previous = getActivityIp();
    if (cleaned !== previous) {
      setActivityIp(cleaned);
      appendActivity('Admin IP override set', { ip: cleaned, previous });
    }
  };

  const onUserBlur = () => {
    const normalizedId = userId.trim() || 'anon';
    const normalizedName = userName.trim() || 'Anonymous';
    const previous = getActivityUser();
    if (previous.userId !== normalizedId || previous.userName !== normalizedName) {
      setActivityUser(normalizedId, normalizedName);
      setUserState({ userId: normalizedId, userName: normalizedName });
      appendActivity('Admin user identity set', { previous, next: { userId: normalizedId, userName: normalizedName } });
    } else {
      setUserState({ userId: normalizedId, userName: normalizedName });
    }
  };

  const kinds: Kind[] = ['Real Estate', 'Car', 'Boat', 'Airplane', 'Travel', 'School', 'OpCos'];

  const activityVisibleCount = 25;
  const [page, setPage] = useState(0);
  const totalEntries = activity.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / activityVisibleCount));

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages - 1));
  }, [totalPages]);

  const startIndex = page * activityVisibleCount;
  const endIndex = Math.min(startIndex + activityVisibleCount, totalEntries);
  const hasPrev = page > 0;
  const hasNext = page < totalPages - 1;
  const recentActivity = useMemo(() => activity.slice(startIndex, endIndex), [activity, startIndex, endIndex]);

  const formatTimestamp = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const renderDetails = (details?: Record<string, unknown>) => {
    if (!details || Object.keys(details).length === 0) return '—';
    try {
      return JSON.stringify(details);
    } catch {
      return String(details);
    }
  };

  return (
    <div className="space-y-6">
      <section className={activeTab === 'asset-defaults' ? 'space-y-4' : 'hidden'}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Admin — Asset Defaults</h2>
          <div className="flex gap-2">
            <button className="rounded-md border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50" onClick={reset}>Reset</button>
            <button className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700" onClick={save}>Save</button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {kinds.map((k) => {
            const v = data[k] || {};
            return (
              <div key={k} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-base font-medium text-slate-800">{k}</h3>
                  <input type="color" value={v.color || COLORS[k]} onChange={(e) => setData((prev) => ({ ...prev, [k]: { ...(prev[k] || {}), color: e.target.value } }))} />
                </div>
                {k !== 'OpCos' && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="mb-1 block text-slate-500">Default Cost (USD)</span>
                      <input className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={v.cost || ''} onChange={(e) => setData((prev) => ({ ...prev, [k]: { ...(prev[k] || {}), cost: e.target.value } }))} placeholder="$10,000" />
                    </label>
                    {k !== 'Travel' && (
                      <label className="block text-sm">
                        <span className="mb-1 block text-slate-500">Default Recurring (USD/yr)</span>
                        <input className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={v.recurring || ''} onChange={(e) => setData((prev) => ({ ...prev, [k]: { ...(prev[k] || {}), recurring: e.target.value } }))} placeholder="$5,000" />
                      </label>
                    )}
                  </div>
                )}

                {(['Real Estate', 'Car', 'Boat', 'Travel', 'School'] as Kind[]).includes(k) && (
                  <label className="mt-3 block text-sm">
                    <span className="mb-1 block text-slate-500">Default Duration (years)</span>
                    <input type="number" min={1} step={1} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={v.duration || '1'} onChange={(e) => setData((prev) => ({ ...prev, [k]: { ...(prev[k] || {}), duration: e.target.value } }))} />
                  </label>
                )}

                {k === 'School' && (
                  <label className="mt-3 block text-sm">
                    <span className="mb-1 block text-slate-500">Annual Increase (%)</span>
                    <input className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={v.recurringInc || ''} onChange={(e) => setData((prev) => ({ ...prev, [k]: { ...(prev[k] || {}), recurringInc: e.target.value } }))} />
                  </label>
                )}

                {k === 'Airplane' && (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="mb-1 block text-slate-500">Useful Life (years)</span>
                      <input type="number" min={1} step={1} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={v.lifeYears || ''} onChange={(e) => setData((prev) => ({ ...prev, [k]: { ...(prev[k] || {}), lifeYears: e.target.value } }))} />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block text-slate-500">Residual Value (%)</span>
                      <input type="number" min={0} max={100} step={0.5} className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={v.residualPct || ''} onChange={(e) => setData((prev) => ({ ...prev, [k]: { ...(prev[k] || {}), residualPct: e.target.value } }))} />
                    </label>
                  </div>
                )}

                {k === 'OpCos' && (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="mb-1 block text-slate-500">Default Action</span>
                      <select className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={v.opAction || 'buy'} onChange={(e) => setData((prev) => ({ ...prev, [k]: { ...(prev[k] || {}), opAction: e.target.value as 'buy' | 'sell' } }))}>
                        <option value="buy">Buy (use cash)</option>
                        <option value="sell">Sell (generate cash)</option>
                      </select>
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block text-slate-500">Default Amount (USD)</span>
                      <input className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm" value={v.opAmount || ''} onChange={(e) => setData((prev) => ({ ...prev, [k]: { ...(prev[k] || {}), opAmount: e.target.value } }))} />
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className={activeTab === 'strategy-benchmarks' ? 'block' : 'hidden'}>
        <StrategyBenchmarksAdmin />
      </section>

      <section className={activeTab === 'activity-log' ? 'block' : 'hidden'}>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Activity Log</h2>
            <p className="text-sm text-slate-500">Tracks recent user actions for auditing.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <span>Override IP</span>
              <input
                value={ipAddress}
                onChange={(e) => setIpAddress(e.target.value)}
                onBlur={onIpBlur}
                placeholder="127.0.0.1"
                className="w-32 rounded-md border border-slate-200 px-2 py-1 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <span>User ID</span>
              <input
                value={userId}
                onChange={(e) => setUserState((prev) => ({ ...prev, userId: e.target.value }))}
                onBlur={onUserBlur}
                placeholder="user-123"
                className="w-32 rounded-md border border-slate-200 px-2 py-1 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <span>User Name</span>
              <input
                value={userName}
                onChange={(e) => setUserState((prev) => ({ ...prev, userName: e.target.value }))}
                onBlur={onUserBlur}
                placeholder="Admin User"
                className="w-36 rounded-md border border-slate-200 px-2 py-1 text-sm"
              />
            </label>
            <button
              className="rounded-md border border-rose-200 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50"
              onClick={() => {
                clearActivityLog();
                appendActivity('Activity log cleared', { previousCount: activity.length });
              }}
            >
              Clear log
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Time</th>
                <th className="px-3 py-2 text-left font-medium">IP</th>
                <th className="px-3 py-2 text-left font-medium">User</th>
                <th className="px-3 py-2 text-left font-medium">Action</th>
                <th className="px-3 py-2 text-left font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentActivity.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{formatTimestamp(entry.timestamp)}</td>
                  <td className="px-3 py-2 text-slate-700">{entry.ip}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {entry.userName || 'Anonymous'}
                    <span className="text-xs text-slate-400"> ({entry.userId || 'anon'})</span>
                  </td>
                  <td className="px-3 py-2 text-slate-800">{entry.action}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{renderDetails(entry.details)}</td>
                </tr>
              ))}
              {recentActivity.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-sm text-slate-500" colSpan={5}>
                    No activity recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-col gap-2 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {totalEntries === 0
              ? 'No entries recorded yet.'
              : `Showing ${startIndex + 1}${endIndex > startIndex + 1 ? `-${endIndex}` : ''} of ${totalEntries} entries (page ${page + 1} of ${totalPages}).`}
          </div>
          {totalEntries > activityVisibleCount && (
            <div className="flex items-center gap-2">
              <button
                className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                disabled={!hasPrev}
                onClick={() => setPage((prev) => Math.max(prev - 1, 0))}
              >
                Prev
              </button>
              <button
                className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                disabled={!hasNext}
                onClick={() => setPage((prev) => Math.min(prev + 1, totalPages - 1))}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
      </section>
    </div>
  );
}
