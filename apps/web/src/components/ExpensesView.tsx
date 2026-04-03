import React, { Fragment, useEffect, useMemo, useState } from 'react';
import { LOCAL_STORAGE_KEYS } from '@fremont/shared';
import { safeLocalGet, safeLocalSet } from '../utils/storage';

type ExpenseItem = {
  id: string;
  date: string; // YYYY-MM-DD
  dueDate?: string; // YYYY-MM-DD
  description: string;
  vendor?: string;
  category: string;
  amount: number; // negative for outflow
  status: ExpenseStatus;
  tags?: string[];
  attachmentsCount?: number; // placeholder for future files support
  comments?: CommentItem[];
};

type ExpenseStatus = 'New' | 'Processing' | 'Approved' | 'Archived';

type CommentItem = {
  id: string;
  text: string;
  at: string; // ISO
  author?: string;
  editedAt?: string; // ISO when last edited
};

const STORAGE_KEY = LOCAL_STORAGE_KEYS.expenses;

const createEmptyExpense = (): ExpenseItem => {
  const id = Math.random().toString(36).slice(2, 8);
  const today = new Date().toISOString().slice(0, 10);
  return {
    id,
    date: today,
    dueDate: today,
    description: 'New Expense',
    vendor: '',
    category: 'Uncategorized',
    amount: 0,
    status: 'New',
    tags: [],
    attachmentsCount: 0,
    comments: [],
  };
};

const normalizeExpense = (draft: ExpenseItem): ExpenseItem => ({
  ...draft,
  date: (draft.date || '').slice(0, 10),
  dueDate: draft.dueDate ? String(draft.dueDate).slice(0, 10) : undefined,
  description: draft.description.trim() || 'Untitled',
  vendor: draft.vendor?.toString().trim() || '',
  category: draft.category.trim() || 'Uncategorized',
  amount: Number(draft.amount) || 0,
  status: (['New', 'Processing', 'Approved', 'Archived'] as ExpenseStatus[]).includes(draft.status)
    ? draft.status
    : 'New',
  tags: (draft.tags || []).map((t) => t.trim()).filter(Boolean),
});

export function ExpensesView() {
  const [items, setItems] = useState<ExpenseItem[]>(() => {
    const parsed = safeLocalGet<Partial<ExpenseItem>[]>(STORAGE_KEY, []);
    if (!Array.isArray(parsed) || parsed.length === 0) return [];
    const coalesced = parsed.map((it) => ({
      id: it.id as string,
      date: (it.date || new Date().toISOString().slice(0, 10)) as string,
      description: (it.description || 'Untitled') as string,
      dueDate: (it as any).dueDate
        ? String((it as any).dueDate).slice(0, 10)
        : String(it.date || new Date().toISOString().slice(0, 10)).slice(0, 10),
      vendor: (it as any).vendor ? String((it as any).vendor) : '',
      category: (it.category || 'Uncategorized') as string,
      amount: Number(it.amount) || 0,
      status: (['New', 'Processing', 'Approved', 'Archived'] as ExpenseStatus[]).includes(it.status as ExpenseStatus)
        ? (it.status as ExpenseStatus)
        : 'New',
      tags: Array.isArray(it.tags) ? (it.tags as string[]).filter(Boolean) : [],
      attachmentsCount: Number((it as any).attachmentsCount) || 0,
      comments: Array.isArray((it as any).comments)
        ? ((it as any).comments as any[]).map((c, idx) => ({
            id: String(c?.id || 'c' + idx + Math.random().toString(36).slice(2, 6)),
            text: String(c?.text || ''),
            at: String(c?.at || new Date().toISOString()),
            author: c?.author ? String(c.author) : undefined,
            editedAt: c?.editedAt ? String(c.editedAt) : undefined,
          }))
        : [],
    }));
    return coalesced as ExpenseItem[];
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ExpenseItem | null>(null);
  const [q, setQ] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<'All' | 'Needs Approval' | ExpenseStatus>('All');
  const [categoryFilter, setCategoryFilter] = useState<'All' | string>('All');
  const [dueStart, setDueStart] = useState('');
  const [dueEnd, setDueEnd] = useState('');
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [showMobileSheet, setShowMobileSheet] = useState(false);
  const [mobileDraft, setMobileDraft] = useState<ExpenseItem | null>(null);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 767px)').matches
      : false
  );
  type SortKey = 'date' | 'due' | 'description' | 'vendor' | 'category' | 'amount' | 'status';
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const toggleSort = (key: SortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((prevDir) => (prevDir === 'asc' ? 'desc' : 'asc'));
        return prevKey;
      } else {
        setSortDir(key === 'amount' || key === 'date' ? 'desc' : 'asc');
        return key;
      }
    });
  };

  useEffect(() => {
    safeLocalSet(STORAGE_KEY, items);
  }, [items]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (event: MediaQueryListEvent | MediaQueryList) => setIsMobile(event.matches);
    handler(mq);
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
    if (typeof (mq as any).addListener === 'function') {
      (mq as any).addListener(handler);
      return () => (mq as any).removeListener(handler);
    }
    return undefined;
  }, []);

  const handleAddExpense = () => {
    if (isMobile) {
      const draftExpense = createEmptyExpense();
      setMobileDraft(draftExpense);
      setShowMobileSheet(true);
      return;
    }
    addRow();
  };

  const closeMobileSheet = () => {
    setShowMobileSheet(false);
    setMobileDraft(null);
  };

  const saveMobileDraft = () => {
    if (!mobileDraft) return;
    const normalized = normalizeExpense(mobileDraft);
    setItems((prev) => [normalized, ...prev]);
    closeMobileSheet();
  };

  const addRow = () => {
    const row = createEmptyExpense();
    setItems((prev) => [row, ...prev]);
    setEditingId(row.id);
    setDraft(row);
  };

  const beginEdit = (row: ExpenseItem) => {
    setEditingId(row.id);
    setDraft({ ...row });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const saveEdit = () => {
    if (!editingId || !draft) return;
    const normalized = normalizeExpense(draft);
    setItems((prev) => prev.map((it) => (it.id === editingId ? normalized : it)));
    setEditingId(null);
    setDraft(null);
  };

  const removeRow = (id: string) => setItems((prev) => prev.filter((it) => it.id !== id));

  const approveRow = (id: string) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status: 'Approved' } : it)));

  const total = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);

  const statusBadge = (s: ExpenseStatus) => {
    const base = 'inline-block rounded-full px-2 py-0.5 text-xs font-medium ';
    switch (s) {
      case 'Approved':
        return base + 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-300';
      case 'Processing':
        return base + 'bg-amber-50 text-amber-700 ring-1 ring-amber-300';
      case 'Archived':
        return base + 'bg-slate-100 text-slate-600 ring-1 ring-slate-300';
      case 'New':
      default:
        return base + 'bg-sky-50 text-sky-700 ring-1 ring-sky-300';
    }
  };

  const allTags = useMemo(
    () => Array.from(new Set(items.flatMap((it) => it.tags || []))).sort(),
    [items]
  );

  const allCategories = useMemo(
    () =>
      Array.from(
        new Set(
          items
            .map((it) => (it.category || '').trim())
            .filter((v) => v && v.length > 0)
        )
      ).sort(),
    [items]
  );

  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const suggestCategories = (q: string, opts: string[]) => {
    const nq = norm(q);
    if (!nq) return [] as string[];
    return opts
      .filter((o) => norm(o).includes(nq))
      .sort((a, b) => {
        const ai = norm(a).indexOf(nq);
        const bi = norm(b).indexOf(nq);
        if (ai !== bi) return ai - bi;
        if (a.length !== b.length) return a.length - b.length;
        return a.localeCompare(b);
      })
      .slice(0, 6);
  };

  const toggleTag = (t: string) =>
    setSelectedTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const byText = term
      ? items.filter((it) =>
          [it.description, it.vendor, it.category, ...(it.tags || [])]
            .filter(Boolean)
            .some((f) => String(f).toLowerCase().includes(term))
        )
      : items;
    const byTags = selectedTags.length
      ? byText.filter((it) => selectedTags.every((t) => (it.tags || []).includes(t)))
      : byText;
    const byCategory = categoryFilter === 'All'
      ? byTags
      : byTags.filter((it) => (it.category || '') === categoryFilter);
    const startMs = dueStart ? Date.parse(dueStart) : null;
    const endMs = dueEnd ? Date.parse(dueEnd) : null;
    const byDue = startMs == null && endMs == null
      ? byCategory
      : byCategory.filter((it) => {
          const d = it.dueDate ? Date.parse(it.dueDate) : NaN;
          if (Number.isNaN(d)) return false;
          if (startMs != null && d < startMs) return false;
          if (endMs != null && d > endMs) return false;
          return true;
        });
    const byStatus = (() => {
      if (statusFilter === 'All') return byDue;
      if (statusFilter === 'Needs Approval') return byDue.filter((it) => it.status === 'New');
      return byDue.filter((it) => it.status === statusFilter);
    })();
    const dirFor = (d: 'asc' | 'desc') => (d === 'asc' ? 1 : -1);
    const sorted = [...byStatus].sort((a, b) => {
      const dir = dirFor(sortDir);
      switch (sortKey) {
        case 'amount':
          return dir * ((Number(a.amount) || 0) - (Number(b.amount) || 0));
        case 'date':
          return dir * ((Date.parse(a.date || '') || 0) - (Date.parse(b.date || '') || 0));
        case 'due':
          return dir * ((Date.parse(a.dueDate || '') || 0) - (Date.parse(b.dueDate || '') || 0));
        case 'description':
          return dir * String(a.description || '').localeCompare(String(b.description || ''), undefined, { sensitivity: 'base' });
        case 'vendor':
          return dir * String(a.vendor || '').localeCompare(String(b.vendor || ''), undefined, { sensitivity: 'base' });
        case 'category':
          return dir * String(a.category || '').localeCompare(String(b.category || ''), undefined, { sensitivity: 'base' });
        case 'status': {
          const order: Record<ExpenseStatus, number> = { New: 1, Processing: 2, Approved: 3, Archived: 4 };
          return dir * ((order[a.status] || 0) - (order[b.status] || 0));
        }
        default:
          return 0;
      }
    });
    return sorted;
  }, [items, q, selectedTags, statusFilter, categoryFilter, dueStart, dueEnd, sortKey, sortDir]);

  const toggleComments = (id: string) => {
    setOpenThreadId((prev) => (prev === id ? null : id));
    setCommentDraft('');
    setEditingCommentId(null);
    setEditingText('');
  };

  const addComment = (expenseId: string, text: string) => {
    const body = text.trim();
    if (!body) return;
    const comment: CommentItem = {
      id: 'c' + Math.random().toString(36).slice(2, 8),
      text: body,
      at: new Date().toISOString(),
      author: 'You',
    };
    setItems((prev) =>
      prev.map((it) => (it.id === expenseId ? { ...it, comments: [...(it.comments || []), comment] } : it))
    );
    setCommentDraft('');
  };

  const deleteComment = (expenseId: string, commentId: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === expenseId ? { ...it, comments: (it.comments || []).filter((c) => c.id !== commentId) } : it
      )
    );
    if (editingCommentId === commentId) {
      setEditingCommentId(null);
      setEditingText('');
    }
  };

  const beginEditComment = (commentId: string, currentText: string) => {
    setEditingCommentId(commentId);
    setEditingText(currentText);
  };

  const cancelEditComment = () => {
    setEditingCommentId(null);
    setEditingText('');
  };

  const saveEditComment = (expenseId: string, commentId: string) => {
    const body = editingText.trim();
    if (!body) return;
    setItems((prev) =>
      prev.map((it) =>
        it.id === expenseId
          ? {
              ...it,
              comments: (it.comments || []).map((c) =>
                c.id === commentId ? { ...c, text: body, editedAt: new Date().toISOString() } : c
              ),
            }
          : it
      )
    );
    setEditingCommentId(null);
    setEditingText('');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
        <button
          className="rounded-md border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
          onClick={handleAddExpense}
        >
          Add Expense
        </button>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search expenses"
          className="w-full max-w-xs rounded-md border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-brand-500"
        />
        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-sm text-slate-500">Tags:</span>
            {allTags.map((t) => {
              const active = selectedTags.includes(t);
              return (
                <button
                  key={t}
                  onClick={() => toggleTag(t)}
                  className={
                    'rounded-full px-2 py-0.5 text-xs ' +
                    (active
                      ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-300 hover:bg-brand-100'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
                  }
                >
                  #{t}
                </button>
              );
            })}
          </div>
        )}
        {selectedTags.length > 0 && (
          <button
            className="rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50"
            onClick={() => setSelectedTags([])}
          >
            Clear tags
          </button>
        )}
        <div className="flex flex-wrap items-center gap-2 text-sm md:ml-auto">
          <label className="text-slate-600">Due</label>
          <input
            type="date"
            className="w-38 rounded border border-slate-200 px-2 py-1"
            value={dueStart}
            onChange={(e) => setDueStart(e.target.value)}
          />
          <span className="text-slate-400">–</span>
          <input
            type="date"
            className="w-38 rounded border border-slate-200 px-2 py-1"
            value={dueEnd}
            onChange={(e) => setDueEnd(e.target.value)}
          />
          <button
            className="rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50"
            onClick={() => {
              const today = new Date().toISOString().slice(0, 10);
              setDueStart('');
              setDueEnd(today);
              setStatusFilter('New');
            }}
            title="Show New items due today or earlier"
          >
            Today
          </button>
          {(dueStart || dueEnd) && (
            <button
              className="rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-600 hover:bg-slate-50"
              onClick={() => { setDueStart(''); setDueEnd(''); }}
            >
              Clear
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="text-slate-600">Category</label>
          <select
            className="rounded border border-slate-200 px-2 py-1"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as any)}
          >
            <option value="All">All</option>
            {allCategories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="text-slate-600">Status</label>
          <select
            className="rounded border border-slate-200 px-2 py-1"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option value="All">All</option>
            <option value="Needs Approval">Needs Approval</option>
            <option value="New">New</option>
            <option value="Processing">Processing</option>
            <option value="Approved">Approved</option>
            <option value="Archived">Archived</option>
          </select>
        </div>
        <div className="text-sm text-slate-600 md:ml-auto">
          Total: <span className="font-medium text-slate-900">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(total)}</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-[760px] bg-white text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left font-medium">
                <button className="flex items-center gap-1 hover:underline" onClick={() => toggleSort('date')}>
                  <span>Date</span>
                  {sortKey === 'date' && (
                    <span className="material-symbols-outlined text-base">{sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>
                  )}
                </button>
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <button className="flex items-center gap-1 hover:underline" onClick={() => toggleSort('description')}>
                  <span>Description</span>
                  {sortKey === 'description' && (
                    <span className="material-symbols-outlined text-base">{sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>
                  )}
                </button>
              </th>
              <th className="hidden px-3 py-2 text-left font-medium md:table-cell">
                <button className="flex items-center gap-1 hover:underline" onClick={() => toggleSort('vendor')}>
                  <span>Vendor</span>
                  {sortKey === 'vendor' && (
                    <span className="material-symbols-outlined text-base">{sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>
                  )}
                </button>
              </th>
              <th className="px-3 py-2 text-left font-medium">
                <button className="flex items-center gap-1 hover:underline" onClick={() => toggleSort('category')}>
                  <span>Category</span>
                  {sortKey === 'category' && (
                    <span className="material-symbols-outlined text-base">{sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>
                  )}
                </button>
              </th>
              <th className="px-3 py-2 text-right font-medium">
                <button className="flex items-center gap-1 hover:underline" onClick={() => toggleSort('amount')}>
                  <span>Amount</span>
                  {sortKey === 'amount' && (
                    <span className="material-symbols-outlined text-base">{sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>
                  )}
                </button>
              </th>
              <th className="hidden px-3 py-2 text-left font-medium md:table-cell">Tags</th>
              <th className="px-3 py-2 text-left font-medium">
                <button className="flex items-center gap-1 hover:underline" onClick={() => toggleSort('status')}>
                  <span>Status</span>
                  {sortKey === 'status' && (
                    <span className="material-symbols-outlined text-base">{sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>
                  )}
                </button>
              </th>
              <th className="hidden px-3 py-2 text-center font-medium md:table-cell">Comments</th>
              <th className="hidden px-3 py-2 text-center font-medium md:table-cell">Files</th>
              <th className="px-3 py-2 text-left font-medium">
                <button className="flex items-center gap-1 hover:underline" onClick={() => toggleSort('due')}>
                  <span>Due</span>
                  {sortKey === 'due' && (
                    <span className="material-symbols-outlined text-base">{sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>
                  )}
                </button>
              </th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((row) => (
              <Fragment key={row.id}>
              <tr>
                <td className="px-3 py-2 text-slate-700">
                  {editingId === row.id ? (
                    <input
                      type="date"
                      className="w-full rounded border border-slate-200 px-2 py-1 md:w-40"
                      value={draft?.date || ''}
                      onChange={(e) => setDraft((d) => ({ ...(d as ExpenseItem), date: e.target.value }))}
                    />
                  ) : (
                    row.date
                  )}
                </td>
                <td className="px-3 py-2 text-slate-800">
                  {editingId === row.id ? (
                    <input
                      className="w-full rounded border border-slate-200 px-2 py-1"
                      value={draft?.description || ''}
                      onChange={(e) => setDraft((d) => ({ ...(d as ExpenseItem), description: e.target.value }))}
                    />
                  ) : (
                    row.description
                  )}
                </td>
                <td className="hidden px-3 py-2 text-slate-700 md:table-cell">
                  {editingId === row.id ? (
                    <input
                      className="w-full rounded border border-slate-200 px-2 py-1"
                      value={draft?.vendor || ''}
                      onChange={(e) => setDraft((d) => ({ ...(d as ExpenseItem), vendor: e.target.value }))}
                      placeholder="Vendor"
                    />
                  ) : (
                    <span className="text-slate-700">{row.vendor && row.vendor.trim() ? row.vendor : '—'}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-700">
                  {editingId === row.id ? (
                    <div className="relative">
                      <input
                        className="w-full rounded border border-slate-200 px-2 py-1"
                        value={draft?.category || ''}
                        onChange={(e) => setDraft((d) => ({ ...(d as ExpenseItem), category: e.target.value }))}
                        placeholder="Select or type category"
                      />
                      {(() => {
                        const q = draft?.category || '';
                        const matches = suggestCategories(q, allCategories);
                        const showAdd = q.trim().length > 0 && !allCategories.some((c) => norm(c) === norm(q));
                        if (matches.length === 0 && !showAdd) return null;
                        return (
                          <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-md">
                            {matches.map((m) => (
                              <li key={m}>
                                <button
                                  type="button"
                                  className="flex w-full cursor-pointer items-center justify-between px-2 py-1 text-left hover:bg-slate-50"
                                  onClick={() => setDraft((d) => ({ ...(d as ExpenseItem), category: m }))}
                                >
                                  <span className="text-slate-800">{m}</span>
                                  <span className="text-xs text-slate-400">match</span>
                                </button>
                              </li>
                            ))}
                            {showAdd && (
                              <li>
                                <button
                                  type="button"
                                  className="flex w-full cursor-pointer items-center gap-1 px-2 py-1 text-left text-slate-700 hover:bg-slate-50"
                                  onClick={() => setDraft((d) => ({ ...(d as ExpenseItem), category: q.trim() }))}
                                >
                                  <span className="material-symbols-outlined text-base text-slate-500">add</span>
                                  Add "{q.trim()}"
                                </button>
                              </li>
                            )}
                          </ul>
                        );
                      })()}
                    </div>
                  ) : (
                    row.category
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {editingId === row.id ? (
                    <input
                      type="number"
                      className="w-full rounded border border-slate-200 px-2 py-1 text-right"
                      value={draft?.amount ?? 0}
                      onChange={(e) => setDraft((d) => ({ ...(d as ExpenseItem), amount: Number(e.target.value) || 0 }))}
                    />
                  ) : (
                    <span className="text-slate-900">{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(row.amount)}</span>
                  )}
                </td>
                <td className="hidden px-3 py-2 md:table-cell">
                  {editingId === row.id ? (
                    <input
                      className="w-full rounded border border-slate-200 px-2 py-1"
                      value={(draft?.tags || []).join(', ')}
                      onChange={(e) =>
                        setDraft((d) => ({ ...(d as ExpenseItem), tags: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }))
                      }
                      placeholder="tag1, tag2"
                    />
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {(row.tags || []).map((t) => {
                        const active = selectedTags.includes(t);
                        return (
                          <button
                            key={t}
                            onClick={() => toggleTag(t)}
                            className={
                              'rounded-full px-2 py-0.5 text-xs ' +
                              (active
                                ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-300 hover:bg-brand-100'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
                            }
                            title={`${active ? 'Remove' : 'Filter by'} #${t}`}
                          >
                            #{t}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2">
                  {editingId === row.id ? (
                    <select
                      className="w-full rounded border border-slate-200 px-2 py-1 md:w-40"
                      value={draft?.status || 'New'}
                      onChange={(e) => setDraft((d) => ({ ...(d as ExpenseItem), status: e.target.value as ExpenseStatus }))}
                    >
                      {(['New', 'Processing', 'Approved', 'Archived'] as ExpenseStatus[]).map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={statusBadge(row.status)}>{row.status}</span>
                  )}
                </td>
                <td className="hidden px-3 py-2 text-center md:table-cell">
                  <button
                    className="rounded p-1 text-slate-600 hover:bg-slate-100"
                    onClick={() => toggleComments(row.id)}
                    title="Open comments"
                  >
                    <span className="material-symbols-outlined text-base align-middle">chat</span>
                    <span className="ml-1 align-middle text-xs">{(row.comments || []).length}</span>
                  </button>
                </td>
                <td className="hidden px-3 py-2 text-center md:table-cell">
                  <button
                    className={
                      'rounded p-1 ' +
                      ((row.attachmentsCount || 0) > 0
                        ? 'text-slate-700 hover:bg-slate-100'
                        : 'text-slate-400 cursor-not-allowed')
                    }
                    title={
                      (row.attachmentsCount || 0) > 0
                        ? `${row.attachmentsCount} attachment${(row.attachmentsCount || 0) === 1 ? '' : 's'}`
                        : 'Attachments (coming soon)'
                    }
                    disabled={(row.attachmentsCount || 0) === 0}
                  >
                    <span className="material-symbols-outlined text-base">picture_as_pdf</span>
                  </button>
                </td>
                <td className="px-3 py-2 text-slate-700">
                  {editingId === row.id ? (
                    <input
                      type="date"
                      className="w-full rounded border border-slate-200 px-2 py-1 md:w-40"
                      value={draft?.dueDate || ''}
                      onChange={(e) => setDraft((d) => ({ ...(d as ExpenseItem), dueDate: e.target.value }))}
                    />
                  ) : (
                    <span className={(row.dueDate && Date.parse(row.dueDate) < Date.now() && row.status !== 'Approved' && row.status !== 'Archived') ? 'text-rose-600' : ''}>
                      {row.dueDate || '—'}
                    </span>
                  )}
                </td>
                
                <td className="px-3 py-2 text-right">
                  {editingId === row.id ? (
                    <div className="flex justify-end gap-2">
                      <button className="rounded-md border border-slate-200 px-2 py-1 hover:bg-slate-50" onClick={cancelEdit}>Cancel</button>
                      <button className="rounded-md bg-brand-600 px-2 py-1 text-white hover:bg-brand-700" onClick={saveEdit}>Save</button>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-2">
                      {row.status === 'New' && (
                        <button
                          className="rounded-md border border-emerald-200 px-2 py-1 text-emerald-700 hover:bg-emerald-50"
                          onClick={() => approveRow(row.id)}
                          title="Approve expense"
                        >
                          Approve
                        </button>
                      )}
                      <button className="rounded-md border border-slate-200 px-2 py-1 hover:bg-slate-50" onClick={() => beginEdit(row)}>Edit</button>
                      <button className="rounded-md border border-rose-200 px-2 py-1 text-rose-700 hover:bg-rose-50" onClick={() => removeRow(row.id)}>Delete</button>
                    </div>
                  )}
                </td>
              </tr>
              {openThreadId === row.id && (
                <tr>
                  <td colSpan={11} className="bg-slate-50 px-4 py-3">
                    <div className="rounded-md border border-slate-200 bg-white p-3">
                      <div className="mb-2 text-sm font-medium text-slate-700">Comments</div>
                      {(row.comments || []).length > 0 ? (
                        <ul className="space-y-2">
                          {(row.comments || []).map((c) => {
                            const mine = !c.author || c.author === 'You';
                            const isEditing = editingCommentId === c.id;
                            return (
                              <li key={c.id} className="flex items-start justify-between gap-3">
                                <div className="flex-1">
                                  {isEditing ? (
                                    <input
                                      className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                                      value={editingText}
                                      onChange={(e) => setEditingText(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveEditComment(row.id, c.id);
                                        if (e.key === 'Escape') cancelEditComment();
                                      }}
                                      autoFocus
                                    />
                                  ) : (
                                    <div className="text-sm text-slate-800">{c.text}</div>
                                  )}
                                  <div className="mt-0.5 text-xs text-slate-500">
                                    {c.author ? c.author + ' • ' : ''}
                                    {new Date(c.at).toLocaleString()}
                                    {c.editedAt && <span> • edited {new Date(c.editedAt).toLocaleString()}</span>}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  {isEditing ? (
                                    <>
                                      <button
                                        className="rounded p-1 text-emerald-700 hover:bg-emerald-50"
                                        title="Save"
                                        onClick={() => saveEditComment(row.id, c.id)}
                                      >
                                        <span className="material-symbols-outlined text-base">done</span>
                                      </button>
                                      <button
                                        className="rounded p-1 text-slate-600 hover:bg-slate-100"
                                        title="Cancel"
                                        onClick={cancelEditComment}
                                      >
                                        <span className="material-symbols-outlined text-base">close</span>
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      {mine && (
                                        <button
                                          className="rounded p-1 text-slate-600 hover:bg-slate-100"
                                          title="Edit comment"
                                          onClick={() => beginEditComment(c.id, c.text)}
                                        >
                                          <span className="material-symbols-outlined text-base">edit</span>
                                        </button>
                                      )}
                                      <button
                                        className="rounded p-1 text-rose-600 hover:bg-rose-50"
                                        title="Delete comment"
                                        onClick={() => deleteComment(row.id, c.id)}
                                      >
                                        <span className="material-symbols-outlined text-base">delete</span>
                                      </button>
                                    </>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <div className="text-sm text-slate-500">No comments yet</div>
                      )}
                      <div className="mt-3 flex items-center gap-2">
                        <input
                          className="w-full rounded border border-slate-200 px-3 py-1 text-sm"
                          placeholder="Add a comment..."
                          value={commentDraft}
                          onChange={(e) => setCommentDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') addComment(row.id, commentDraft);
                          }}
                        />
                        <button
                          className="rounded-md bg-brand-600 px-3 py-1 text-sm text-white hover:bg-brand-700 disabled:opacity-50"
                          onClick={() => addComment(row.id, commentDraft)}
                          disabled={!commentDraft.trim()}
                        >
                          Post
                        </button>
                        <button
                          className="rounded-md border border-slate-200 px-3 py-1 text-sm hover:bg-slate-50"
                          onClick={() => setOpenThreadId(null)}
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-slate-500">No matching expenses</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showMobileSheet && mobileDraft && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-slate-900/40 md:hidden" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0" aria-label="Close expense sheet" onClick={closeMobileSheet} />
          <div className="relative max-h-[85vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">New Expense</h2>
                <p className="text-sm text-slate-500">Capture an expense on the go.</p>
              </div>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
                aria-label="Close"
                onClick={closeMobileSheet}
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            <div className="space-y-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Description</span>
                <input
                  className="rounded-md border border-slate-200 px-3 py-2"
                  value={mobileDraft.description}
                  onChange={(e) => setMobileDraft((prev) => (prev ? { ...prev, description: e.target.value } : prev))}
                />
              </label>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Date</span>
                  <input
                    type="date"
                    className="rounded-md border border-slate-200 px-3 py-2"
                    value={mobileDraft.date}
                    onChange={(e) => setMobileDraft((prev) => (prev ? { ...prev, date: e.target.value } : prev))}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Due Date</span>
                  <input
                    type="date"
                    className="rounded-md border border-slate-200 px-3 py-2"
                    value={mobileDraft.dueDate || ''}
                    onChange={(e) => setMobileDraft((prev) => (prev ? { ...prev, dueDate: e.target.value || undefined } : prev))}
                  />
                </label>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Category</span>
                  <input
                    className="rounded-md border border-slate-200 px-3 py-2"
                    value={mobileDraft.category}
                    onChange={(e) => setMobileDraft((prev) => (prev ? { ...prev, category: e.target.value } : prev))}
                    placeholder="Uncategorized"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Vendor</span>
                  <input
                    className="rounded-md border border-slate-200 px-3 py-2"
                    value={mobileDraft.vendor || ''}
                    onChange={(e) => setMobileDraft((prev) => (prev ? { ...prev, vendor: e.target.value } : prev))}
                    placeholder="Optional"
                  />
                </label>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Amount</span>
                  <input
                    type="number"
                    className="rounded-md border border-slate-200 px-3 py-2"
                    value={mobileDraft.amount}
                    onChange={(e) => setMobileDraft((prev) => (prev ? { ...prev, amount: Number(e.target.value) || 0 } : prev))}
                    placeholder="0"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Status</span>
                  <select
                    className="rounded-md border border-slate-200 px-3 py-2"
                    value={mobileDraft.status}
                    onChange={(e) => setMobileDraft((prev) => (prev ? { ...prev, status: e.target.value as ExpenseStatus } : prev))}
                  >
                    {(['New', 'Processing', 'Approved', 'Archived'] as ExpenseStatus[]).map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Tags</span>
                <input
                  className="rounded-md border border-slate-200 px-3 py-2"
                  value={(mobileDraft.tags || []).join(', ')}
                  onChange={(e) => setMobileDraft((prev) => (prev ? {
                    ...prev,
                    tags: e.target.value.split(',').map((tag) => tag.trim()).filter(Boolean),
                  } : prev))}
                  placeholder="finance, tax"
                />
              </label>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
                  onClick={closeMobileSheet}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
                  onClick={saveMobileDraft}
                >
                  Save expense
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
