import { useEffect, useMemo, useState } from 'react';
import type { AssetRecord, AssetWriteInput } from '@fremont/shared';
import { LOCAL_STORAGE_KEYS } from '@fremont/shared';
import { api } from '../lib/api';

type AssetItem = Pick<AssetRecord, 'id' | 'name' | 'category' | 'value' | 'liquid' | 'owner' | 'note'>;

const STORAGE_KEY = LOCAL_STORAGE_KEYS.assets;

const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

function fromRecord(item: AssetRecord): AssetItem {
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    value: item.value,
    liquid: item.liquid,
    owner: item.owner,
    note: item.note,
  };
}

function toWriteInput(item: AssetItem): AssetWriteInput {
  return {
    name: item.name.trim() || 'Untitled',
    category: item.category.trim() || 'Uncategorized',
    value: Math.max(0, Number(item.value) || 0),
    liquid: !!item.liquid,
    owner: item.owner?.trim() || undefined,
    note: item.note?.trim() || undefined,
  };
}

function readLocalAssets(): AssetItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as AssetItem[]) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => ({
      id: String(item?.id ?? `tmp-${Math.random().toString(36).slice(2, 8)}`),
      name: String(item?.name ?? 'Untitled'),
      category: String(item?.category ?? 'Uncategorized'),
      value: Number(item?.value) || 0,
      liquid: !!item?.liquid,
      owner: typeof item?.owner === 'string' ? item.owner : undefined,
      note: typeof item?.note === 'string' ? item.note : undefined,
    }));
  } catch {
    return [];
  }
}

export function AssetsView() {
  const [items, setItems] = useState<AssetItem[]>(() => readLocalAssets());
  const [apiConnected, setApiConnected] = useState(false);
  const [q, setQ] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AssetItem | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('fremont.assets.updated'));
  }, [items]);

  useEffect(() => {
    let active = true;
    const localAtMount = readLocalAssets();

    const load = async () => {
      try {
        const remote = await api.assets();
        if (!active) return;

        if (remote.length === 0 && localAtMount.length > 0) {
          const migrated = await Promise.all(
            localAtMount.map((item) =>
              api
                .createAsset(toWriteInput(item))
                .then((saved) => fromRecord(saved))
                .catch(() => null),
            ),
          );
          if (!active) return;

          if (migrated.length > 0) {
            setItems(migrated.map((item, index) => item ?? localAtMount[index]));
          }
        } else {
          setItems(remote.map((item) => fromRecord(item)));
        }

        setApiConnected(true);
      } catch {
        if (!active) return;
        setApiConnected(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter((it) =>
      [it.name, it.category, it.owner, it.note]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(term)),
    );
  }, [items, q]);

  const totalValue = useMemo(() => items.reduce((sum, it) => sum + (it.value || 0), 0), [items]);

  const addRow = () => {
    const id = `tmp-${Math.random().toString(36).slice(2, 8)}`;
    const row: AssetItem = {
      id,
      name: 'New Asset',
      category: 'Uncategorized',
      value: 0,
      liquid: false,
    };
    setItems((prev) => [row, ...prev]);
    setEditingId(id);
    setDraft(row);
  };

  const beginEdit = (row: AssetItem) => {
    setEditingId(row.id);
    setDraft({ ...row });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const saveEdit = () => {
    if (!editingId || !draft) return;
    const normalized: AssetItem = {
      ...draft,
      ...toWriteInput(draft),
    };

    setItems((prev) => prev.map((it) => (it.id === editingId ? normalized : it)));

    if (editingId.startsWith('tmp-')) {
      void api
        .createAsset(toWriteInput(normalized))
        .then((saved) => {
          setItems((prev) => prev.map((it) => (it.id === editingId ? fromRecord(saved) : it)));
          setApiConnected(true);
        })
        .catch(() => setApiConnected(false));
    } else {
      void api
        .updateAsset(editingId, toWriteInput(normalized))
        .then((saved) => {
          setItems((prev) => prev.map((it) => (it.id === editingId ? fromRecord(saved) : it)));
          setApiConnected(true);
        })
        .catch(() => setApiConnected(false));
    }

    setEditingId(null);
    setDraft(null);
  };

  const removeRow = (id: string) => {
    const previous = items;
    setItems((prev) => prev.filter((it) => it.id !== id));

    if (id.startsWith('tmp-')) return;

    void api
      .deleteAsset(id)
      .then(() => setApiConnected(true))
      .catch(() => {
        setItems(previous);
        setApiConnected(false);
      });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="rounded-md border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
          onClick={addRow}
        >
          Add Asset
        </button>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search assets"
          className="w-full max-w-xs rounded-md border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-brand-500"
        />
        <div className="ml-auto text-sm text-slate-600">
          Total Value:{' '}
          <span className="font-medium text-slate-900">{currency.format(totalValue)}</span>
        </div>
        <div className={`text-xs ${apiConnected ? 'text-emerald-700' : 'text-slate-500'}`}>
          {apiConnected ? 'API Sync' : 'Local Fallback'}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="min-w-full bg-white text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Category</th>
              <th className="px-3 py-2 text-left font-medium">Owner</th>
              <th className="px-3 py-2 text-left font-medium">Notes</th>
              <th className="px-3 py-2 text-center font-medium">Liquid</th>
              <th className="px-3 py-2 text-right font-medium">Value</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2">
                  {editingId === row.id ? (
                    <input
                      className="w-full rounded border border-slate-200 px-2 py-1"
                      value={draft?.name || ''}
                      onChange={(e) => setDraft((d) => ({ ...(d as AssetItem), name: e.target.value }))}
                    />
                  ) : (
                    <span className="text-slate-800">{row.name}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {editingId === row.id ? (
                    <input
                      className="w-full rounded border border-slate-200 px-2 py-1"
                      value={draft?.category || ''}
                      onChange={(e) =>
                        setDraft((d) => ({ ...(d as AssetItem), category: e.target.value }))
                      }
                    />
                  ) : (
                    <span className="text-slate-700">{row.category}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {editingId === row.id ? (
                    <input
                      className="w-full rounded border border-slate-200 px-2 py-1"
                      value={draft?.owner || ''}
                      onChange={(e) => setDraft((d) => ({ ...(d as AssetItem), owner: e.target.value }))}
                    />
                  ) : (
                    <span className="text-slate-700">{row.owner || '—'}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {editingId === row.id ? (
                    <input
                      className="w-full rounded border border-slate-200 px-2 py-1"
                      value={draft?.note || ''}
                      onChange={(e) => setDraft((d) => ({ ...(d as AssetItem), note: e.target.value }))}
                    />
                  ) : (
                    <span className="text-slate-700">{row.note || '—'}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  {editingId === row.id ? (
                    <input
                      type="checkbox"
                      checked={!!draft?.liquid}
                      onChange={(e) =>
                        setDraft((d) => ({ ...(d as AssetItem), liquid: e.target.checked }))
                      }
                    />
                  ) : (
                    <span className="text-slate-700">{row.liquid ? 'Yes' : 'No'}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {editingId === row.id ? (
                    <input
                      className="w-full rounded border border-slate-200 px-2 py-1 text-right"
                      type="number"
                      min={0}
                      value={draft?.value ?? 0}
                      onChange={(e) =>
                        setDraft((d) => ({ ...(d as AssetItem), value: Number(e.target.value) || 0 }))
                      }
                    />
                  ) : (
                    <span className="text-slate-900">{currency.format(row.value)}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {editingId === row.id ? (
                    <div className="flex justify-end gap-2">
                      <button
                        className="rounded-md border border-slate-200 px-2 py-1 hover:bg-slate-50"
                        onClick={cancelEdit}
                      >
                        Cancel
                      </button>
                      <button
                        className="rounded-md bg-brand-600 px-2 py-1 text-white hover:bg-brand-700"
                        onClick={saveEdit}
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-2">
                      <button
                        className="rounded-md border border-slate-200 px-2 py-1 hover:bg-slate-50"
                        onClick={() => beginEdit(row)}
                      >
                        Edit
                      </button>
                      <button
                        className="rounded-md border border-rose-200 px-2 py-1 text-rose-700 hover:bg-rose-50"
                        onClick={() => removeRow(row.id)}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                  No assets found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
