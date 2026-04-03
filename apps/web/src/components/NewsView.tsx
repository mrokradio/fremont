import { FormEvent, useMemo, useState } from 'react';
import { LOCAL_STORAGE_KEYS } from '@fremont/shared';
import type { NewsPost } from '../types/models';
import { useLocalState } from '../utils/storage';

const STORAGE_KEY = LOCAL_STORAGE_KEYS.newsFeed;

export const defaultNewsPosts: NewsPost[] = [
  {
    id: 'news-1',
    title: 'Q1 2025 Market Insights',
    summary: 'How we navigated a volatile first quarter and positioned client portfolios for the rest of the year.',
    body: `Equity markets staged a late-quarter rally as inflation data continued to trend lower. We used the volatility to increase exposure to quality growth while trimming overweight positions in real assets. Private market deployment remains on pace with earlier guidance.`,
    publishDate: '2025-04-10',
    author: 'Investment Committee',
    category: 'Insights',
    tags: ['Markets', 'Strategy'],
    link: 'https://example.com/q1-letter',
    pinned: true,
    imageUrl: 'https://images.unsplash.com/photo-1556740749-887f6717d7e4?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 'news-2',
    title: 'Welcome Our New Chief Operating Officer',
    summary: 'Industry veteran Priya Desai joins Fremont to expand our operating platform and strengthen client service.',
    publishDate: '2025-03-22',
    author: 'Firm News',
    category: 'Announcement',
    tags: ['Team'],
    imageUrl: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 'news-3',
    title: 'Family Office Summit — Save the Date',
    summary: 'Our annual client summit returns to Napa Valley on June 6–7. Registration details and agenda highlights inside.',
    publishDate: '2025-03-05',
    author: 'Client Experience',
    category: 'Event',
    tags: ['Events', 'Client'],
    link: 'https://example.com/summit',
    imageUrl: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=400&q=80',
  },
  {
    id: 'news-4',
    title: 'Operations Update: Secure Document Exchange',
    summary: 'We rolled out multi-factor authentication and audit trails across the client document vault.',
    publishDate: '2025-02-18',
    author: 'Operations',
    category: 'Operations',
    tags: ['Security', 'Platform'],
    imageUrl: 'https://images.unsplash.com/photo-1525182008055-f88b95ff7980?auto=format&fit=crop&w=400&q=80',
  },
];

const createDraft = () => ({
  title: '',
  summary: '',
  body: '',
  publishDate: new Date().toISOString().slice(0, 10),
  author: '',
  category: '',
  tags: [] as string[],
  link: '',
  imageUrl: '',
  pinned: false,
});

const parseTags = (value: string) =>
  value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

const formatDate = (iso: string) => {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso));
  } catch {
    return iso;
  }
};

const makeId = () => `news-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function NewsView() {
  const [posts, setPosts] = useLocalState<NewsPost[]>(STORAGE_KEY, defaultNewsPosts);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'All' | string>('All');
  const [tagFilter, setTagFilter] = useState<'All' | string>('All');
  const [draft, setDraft] = useState(createDraft);
  const [draftTags, setDraftTags] = useState('');
  const [showComposer, setShowComposer] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const categories = useMemo(() => {
    const values = new Set<string>();
    posts.forEach((post) => post.category && values.add(post.category));
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [posts]);

  const tags = useMemo(() => {
    const values = new Set<string>();
    posts.forEach((post) => (post.tags || []).forEach((tag) => values.add(tag)));
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [posts]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return posts.filter((post) => {
      if (categoryFilter !== 'All' && post.category !== categoryFilter) return false;
      if (tagFilter !== 'All' && !(post.tags || []).includes(tagFilter)) return false;
      if (!term) return true;
      return [post.title, post.summary, post.body, post.author, post.category, ...(post.tags || [])]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term));
    });
  }, [posts, categoryFilter, tagFilter, searchTerm]);

  const ordered = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return Date.parse(b.publishDate) - Date.parse(a.publishDate);
    });
  }, [filtered]);

  const pinnedCount = ordered.filter((post) => post.pinned).length;

  const resetDraft = () => {
    setDraft(createDraft());
    setDraftTags('');
    setFormError(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = draft.title.trim();
    const summary = draft.summary.trim();
    if (!title || !summary) {
      setFormError('Title and summary are required.');
      return;
    }

    const next: NewsPost = {
      id: makeId(),
      title,
      summary,
      body: draft.body?.trim() || undefined,
      publishDate: draft.publishDate || new Date().toISOString().slice(0, 10),
      author: draft.author?.trim() || undefined,
      category: draft.category?.trim() || undefined,
      tags: parseTags(draftTags),
      link: draft.link?.trim() || undefined,
      imageUrl: draft.imageUrl?.trim() || undefined,
      pinned: draft.pinned,
    };

    setPosts((prev) => [next, ...prev]);
    resetDraft();
    setShowComposer(false);
  };

  const handleDelete = (id: string) => {
    setPosts((prev) => prev.filter((post) => post.id !== id));
  };

  const handleTogglePinned = (id: string) => {
    setPosts((prev) =>
      prev.map((post) => (post.id === id ? { ...post, pinned: !post.pinned } : post)),
    );
  };

  const handleTagClick = (tag: string) => {
    setTagFilter((prev) => (prev === tag ? 'All' : tag));
    setSearchTerm('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Firm News Feed</h2>
          <p className="text-sm text-slate-500">
            Publish updates, announcements, and insights for your clients and internal teams.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
            onClick={() => setShowComposer((prev) => !prev)}
            type="button"
          >
            {showComposer ? 'Close composer' : 'Compose update'}
          </button>
          <div className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600">
            {posts.length} updates · {pinnedCount} pinned
          </div>
        </div>
      </div>

      {showComposer && (
        <form className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Title</span>
                <input
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  value={draft.title}
                  onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Quarterly investment letter"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Category</span>
                <input
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  value={draft.category}
                  onChange={(event) => setDraft((prev) => ({ ...prev, category: event.target.value }))}
                  placeholder="Insights, Announcement, Event..."
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Publish Date</span>
                <input
                  type="date"
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  value={draft.publishDate}
                  onChange={(event) => setDraft((prev) => ({ ...prev, publishDate: event.target.value }))}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Author</span>
                <input
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  value={draft.author}
                  onChange={(event) => setDraft((prev) => ({ ...prev, author: event.target.value }))}
                  placeholder="Investment Committee"
                />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Summary</span>
              <textarea
                rows={3}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                value={draft.summary}
                onChange={(event) => setDraft((prev) => ({ ...prev, summary: event.target.value }))}
                placeholder="Key message clients should know"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Body (optional)</span>
              <textarea
                rows={6}
                className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                value={draft.body}
                onChange={(event) => setDraft((prev) => ({ ...prev, body: event.target.value }))}
                placeholder="Long-form context, highlights, attachments..."
              />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Tags</span>
                <input
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  value={draftTags}
                  onChange={(event) => setDraftTags(event.target.value)}
                  placeholder="Markets, Strategy"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Link (optional)</span>
                <input
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  value={draft.link}
                  onChange={(event) => setDraft((prev) => ({ ...prev, link: event.target.value }))}
                  placeholder="https://fremont.com/update"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Image URL (optional)</span>
                <input
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  value={draft.imageUrl}
                  onChange={(event) => setDraft((prev) => ({ ...prev, imageUrl: event.target.value }))}
                  placeholder="https://cdn.fremont.com/news/hero.jpg"
                />
              </label>
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  checked={draft.pinned}
                  onChange={(event) => setDraft((prev) => ({ ...prev, pinned: event.target.checked }))}
                />
                Pin to top of feed
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
                  onClick={resetDraft}
                >
                  Reset
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                >
                  Publish update
                </button>
              </div>
            </div>
            {formError && <p className="text-sm text-red-600">{formError}</p>}
          </div>
        </form>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2">
            <input
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 md:w-56"
              placeholder="Search updates"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            <select
              className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value="All">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
            >
              <option value="All">All tags</option>
              {tags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>
          <div className="text-sm text-slate-500">
            Showing {ordered.length} of {posts.length} updates
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {ordered.length === 0 && (
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
              No updates match the current filters. Try publishing a new post or adjusting the filters above.
            </div>
          )}

          {ordered.map((post) => {
            const hasImage = Boolean(post.imageUrl);
            const fallbackInitial = (post.title || post.category || '?').trim().charAt(0).toUpperCase() || '#';

            return (
              <article
                key={post.id}
                className={`rounded-lg border px-4 py-4 transition hover:border-brand-200 ${
                  post.pinned ? 'border-brand-200 bg-brand-50/70' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="flex flex-1 flex-col gap-3 md:flex-row md:gap-4">
                    <div className="h-48 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100 md:h-32 md:w-40 md:flex-none">
                      {hasImage ? (
                        <img
                          src={post.imageUrl}
                          alt={post.title ? `${post.title} preview` : 'News illustration'}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-slate-200 text-2xl font-semibold text-slate-600">
                          {fallbackInitial}
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                        <span>{formatDate(post.publishDate)}</span>
                        {post.category && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{post.category}</span>}
                        {post.pinned && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-700">Pinned</span>}
                      </div>
                      <h3 className="mt-1 text-lg font-semibold text-slate-800">{post.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{post.summary}</p>
                      {post.body && <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-500">{post.body}</p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {post.author && (
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                            {post.author}
                          </span>
                        )}
                        {(post.tags || []).map((tag) => {
                          const active = tagFilter === tag;
                          return (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => handleTagClick(tag)}
                              className={
                                'rounded-full border px-3 py-1 text-xs font-medium transition ' +
                                (active
                                  ? 'border-brand-300 bg-brand-50 text-brand-700 shadow-sm'
                                  : 'border-transparent bg-slate-100 text-slate-600 hover:border-slate-200 hover:bg-slate-100/80')
                              }
                            >
                              #{tag}
                            </button>
                          );
                        })}
                      </div>
                      {post.link && (
                        <a
                          href={post.link}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800"
                        >
                          Read more
                          <span className="material-symbols-outlined text-base">north_east</span>
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2 text-sm">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                      onClick={() => handleTogglePinned(post.id)}
                    >
                      <span className="material-symbols-outlined text-base">{post.pinned ? 'bookmark_remove' : 'bookmark_add'}</span>
                      {post.pinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                      onClick={() => handleDelete(post.id)}
                    >
                      <span className="material-symbols-outlined text-base">delete</span>
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
