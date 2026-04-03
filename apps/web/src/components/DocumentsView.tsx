import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LOCAL_STORAGE_KEYS } from '@fremont/shared';
import type { DocumentItem, DocumentLink } from '../types/models';

const STORAGE_KEY = LOCAL_STORAGE_KEYS.documents;
const FOLDER_KEY = LOCAL_STORAGE_KEYS.documentFolders;
const MAX_INLINE_BYTES = 1.5 * 1024 * 1024; // 1.5 MB per file

type FolderNode = {
  id: string;
  name: string;
  path: string;
  children: FolderNode[];
  count: number;
};

type BreadcrumbPath = 'All' | 'Unfiled' | string;
type TableRow = { kind: 'folder'; folder: FolderNode } | { kind: 'document'; doc: DocumentItem };

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const size = bytes / 1024 ** idx;
  return `${size.toFixed(size >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
};

const normalizeDocument = (doc: DocumentItem): DocumentItem => ({
  ...doc,
  name: doc.name.trim() || 'Untitled',
  folder: doc.folder?.trim() || undefined,
  note: doc.note?.trim() || undefined,
  tags: (doc.tags || []).map((tag) => tag.trim()).filter(Boolean),
  links: (doc.links || [])
    .map((link) => ({
      ...link,
      label: link.label?.trim() || 'Linked item',
      url: link.url?.trim() || undefined,
      kind: link.kind?.trim() || undefined,
    }))
    .filter((link) => link.label || link.url),
});

const iconForType = (mime: string) => {
  if (!mime) return 'description';
  if (mime.includes('pdf')) return 'picture_as_pdf';
  if (mime.includes('spreadsheet') || mime.includes('excel')) return 'table';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return 'slideshow';
  if (mime.includes('word') || mime.includes('document')) return 'description';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'movie';
  if (mime.startsWith('audio/')) return 'audio_file';
  if (mime.includes('zip') || mime.includes('compressed')) return 'folder_zip';
  return 'description';
};

const linkKinds: { value: DocumentLink['kind']; label: string }[] = [
  { value: 'Task', label: 'Task' },
  { value: 'Expense', label: 'Expense' },
  { value: 'Position', label: 'Position' },
  { value: 'Plan', label: 'Planning Item' },
  { value: 'Admin', label: 'Admin Record' },
  { value: 'Custom', label: 'Custom' },
];

export function DocumentsView() {
  const [documents, setDocuments] = useState<DocumentItem[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as DocumentItem[];
    } catch {}
    return [];
  });
  const [folderLibrary, setFolderLibrary] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(FOLDER_KEY);
      if (raw) return JSON.parse(raw) as string[];
    } catch {}
    return [];
  });
  const [search, setSearch] = useState('');
  const [folderFilter, setFolderFilter] = useState<'All' | 'Unfiled' | string>('All');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<'uploadedAt' | 'name' | 'size'>('uploadedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DocumentItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => new Set<string>(['__root__']));
  const [moveCandidate, setMoveCandidate] = useState<{ path: string; name: string; parent: string } | null>(null);
  const [moveParentSelection, setMoveParentSelection] = useState('');
  const [moveError, setMoveError] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(documents));
  }, [documents]);

  useEffect(() => {
    localStorage.setItem(FOLDER_KEY, JSON.stringify(folderLibrary));
  }, [folderLibrary]);

  const ensureFolderRegistered = (folder?: string) => {
    if (!folder) return;
    setFolderLibrary((prev) => (prev.includes(folder) ? prev : [...prev, folder]));
  };

  const allFolders = useMemo(() => {
    const derived = new Set<string>();
    folderLibrary.forEach((f) => f && derived.add(f));
    documents.forEach((doc) => doc.folder && derived.add(doc.folder));
    return Array.from(derived).sort((a, b) => a.localeCompare(b));
  }, [documents, folderLibrary]);

  const availableTags = useMemo(() => {
    const derived = new Set<string>();
    documents.forEach((doc) => (doc.tags || []).forEach((tag) => derived.add(tag)));
    return Array.from(derived).sort((a, b) => a.localeCompare(b));
  }, [documents]);

  const totalSize = useMemo(() => documents.reduce((sum, doc) => sum + (doc.size || 0), 0), [documents]);

  const { treeRoot, unfiledCount } = useMemo(() => {
    const folderSet = new Set<string>();
    documents.forEach((doc) => doc.folder && folderSet.add(doc.folder));
    folderLibrary.forEach((folder) => folder && folderSet.add(folder));

    const docCountMap = new Map<string, number>();
    const increment = (path: string) => {
      docCountMap.set(path, (docCountMap.get(path) || 0) + 1);
    };

    documents.forEach((doc) => {
      increment('__root__');
      if (!doc.folder) {
        increment('__unfiled__');
        return;
      }
      const segments = doc.folder.split('/').map((seg) => seg.trim()).filter(Boolean);
      let accumulator = '';
      segments.forEach((segment) => {
        accumulator = accumulator ? `${accumulator}/${segment}` : segment;
        increment(accumulator);
      });
    });

    const root: FolderNode = { id: '__root__', name: 'All Documents', path: '', children: [], count: docCountMap.get('__root__') || documents.length };

    const ensurePath = (path: string) => {
      const segments = path.split('/').map((seg) => seg.trim()).filter(Boolean);
      let current = root;
      let accumulator = '';
      segments.forEach((segment) => {
        accumulator = accumulator ? `${accumulator}/${segment}` : segment;
        let child = current.children.find((c) => c.path === accumulator);
        if (!child) {
          child = { id: accumulator, name: segment, path: accumulator, children: [], count: docCountMap.get(accumulator) || 0 };
          current.children.push(child);
        }
        current = child;
      });
    };

    folderSet.forEach((path) => ensurePath(path));

    const sortChildren = (node: FolderNode) => {
      node.children.sort((a, b) => a.name.localeCompare(b.name));
      node.children.forEach(sortChildren);
    };
    sortChildren(root);

    const applyCounts = (node: FolderNode) => {
      node.count = docCountMap.get(node.path || '__root__') || 0;
      node.children.forEach(applyCounts);
    };
    applyCounts(root);

    return { treeRoot: root, unfiledCount: docCountMap.get('__unfiled__') || documents.filter((doc) => !doc.folder).length };
  }, [documents, folderLibrary]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const byFolder = documents.filter((doc) => {
      if (folderFilter === 'All') return true;
      if (folderFilter === 'Unfiled') return !doc.folder;
      return doc.folder === folderFilter;
    });
    const byTags = selectedTags.length
      ? byFolder.filter((doc) => selectedTags.every((tag) => (doc.tags || []).includes(tag)))
      : byFolder;
    const byTerm = term
      ? byTags.filter((doc) =>
          [doc.name, doc.folder, doc.note, ...(doc.tags || []), ...(doc.links || []).map((l) => l.label)]
            .filter(Boolean)
            .some((field) => String(field).toLowerCase().includes(term))
        )
      : byTags;
    const sorted = [...byTerm].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'name':
          return dir * a.name.localeCompare(b.name);
        case 'size':
          return dir * ((a.size || 0) - (b.size || 0));
        case 'uploadedAt':
        default:
          return dir * (Date.parse(a.uploadedAt) - Date.parse(b.uploadedAt));
      }
    });
    return sorted;
  }, [documents, folderFilter, search, selectedTags, sortDir, sortKey]);

  const findNodeByPath = useCallback(
    (path: string) => {
      if (!path) return treeRoot;
      const segments = path.split('/').map((seg) => seg.trim()).filter(Boolean);
      let current: FolderNode | null = treeRoot;
      let accumulator = '';
      for (const segment of segments) {
        if (!current) return null;
        accumulator = accumulator ? `${accumulator}/${segment}` : segment;
        current = current.children.find((child) => child.path === accumulator) || null;
        if (!current) return null;
      }
      return current;
    },
    [treeRoot]
  );

  const currentFolderNode = useMemo(() => {
    if (folderFilter === 'Unfiled') return null;
    const targetPath = folderFilter === 'All' ? '' : folderFilter;
    return findNodeByPath(targetPath) || treeRoot;
  }, [findNodeByPath, folderFilter, treeRoot]);

  const childFolders = useMemo(() => {
    if (folderFilter === 'Unfiled') return [] as FolderNode[];
    return currentFolderNode?.children ?? [];
  }, [currentFolderNode, folderFilter]);

  const documentsInCurrentFolder = useMemo(() => {
    if (folderFilter === 'All') return documents;
    if (folderFilter === 'Unfiled') return documents.filter((doc) => !doc.folder);
    return documents.filter((doc) => doc.folder === folderFilter);
  }, [documents, folderFilter]);

  const breadcrumbs = useMemo(() => {
    const baseLabel = treeRoot?.name || 'All Documents';
    if (folderFilter === 'Unfiled') {
      return [
        { label: baseLabel, path: 'All' as BreadcrumbPath },
        { label: 'Unfiled', path: 'Unfiled' as BreadcrumbPath },
      ];
    }
    const segments = folderFilter === 'All'
      ? []
      : folderFilter.split('/').map((seg) => seg.trim()).filter(Boolean);
    const crumbs: { label: string; path: BreadcrumbPath }[] = [
      { label: baseLabel, path: 'All' },
    ];
    let accumulator = '';
    segments.forEach((segment) => {
      accumulator = accumulator ? `${accumulator}/${segment}` : segment;
      crumbs.push({ label: segment, path: accumulator });
    });
    return crumbs;
  }, [folderFilter, treeRoot]);

  const handleBreadcrumbClick = (path: BreadcrumbPath) => {
    goToFolder(path);
  };

  const handleOpenFolder = (path: string) => {
    goToFolder(path);
  };

  const handleMoveFolder = (folder: FolderNode) => {
    const parent = folder.path.includes('/') ? folder.path.slice(0, folder.path.lastIndexOf('/')) : '';
    setMoveCandidate({ path: folder.path, name: folder.name, parent });
    setMoveParentSelection(parent);
    setMoveError(null);
  };

  const handleRenameFolder = (folder: FolderNode) => {
    if (!folder.path) return;
    const next = window.prompt('Rename folder', folder.name);
    if (next === null) return;
    const cleaned = next.trim();
    if (!cleaned || cleaned === folder.name) return;
    if (cleaned.includes('/')) {
      window.alert('Folder names cannot include "/"');
      return;
    }
    const parentPath = folder.path.includes('/') ? folder.path.slice(0, folder.path.lastIndexOf('/')) : '';
    const candidatePath = parentPath ? `${parentPath}/${cleaned}` : cleaned;
    if (folderLibrary.some((path) => path === candidatePath && path !== folder.path)) {
      window.alert('A folder with that name already exists in this location.');
      return;
    }
    renameFolder(folder.path, cleaned);
  };

const visibleFolders = useMemo(() => {
    if (folderFilter === 'Unfiled') return [] as FolderNode[];
    const term = search.trim().toLowerCase();
    if (!term) return childFolders;
    return childFolders.filter((folder) => folder.name.toLowerCase().includes(term));
  }, [childFolders, folderFilter, search]);

  const tableRows = useMemo<TableRow[]>(
    () => [
      ...visibleFolders.map((folder) => ({ kind: 'folder' as const, folder })),
      ...filtered.map((doc) => ({ kind: 'document' as const, doc })),
    ],
    [visibleFolders, filtered]
  );

  const toggleTagFilter = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const handleUploadButton = () => {
    fileInputRef.current?.click();
  };

  const handleFiles = async (files: FileList | File[]) => {
    const currentFolder = folderFilter === 'All' ? undefined : folderFilter === 'Unfiled' ? undefined : folderFilter;
    const tasks = Array.from(files).map(
      (file) =>
        new Promise<DocumentItem>((resolve) => {
          const base: DocumentItem = {
            id: 'doc_' + Math.random().toString(36).slice(2, 8),
            name: file.name,
            folder: currentFolder,
            uploadedAt: new Date().toISOString(),
            size: file.size,
            type: file.type || 'application/octet-stream',
            tags: [],
            note: undefined,
            links: [],
          };

          if (file.size > MAX_INLINE_BYTES) {
            resolve({ ...base, metadataOnly: true });
            return;
          }

          const reader = new FileReader();
          reader.onload = () => {
            resolve({ ...base, dataUrl: reader.result as string });
          };
          reader.onerror = () => {
            resolve({ ...base, metadataOnly: true });
          };
          reader.readAsDataURL(file);
        })
    );

    const docs = await Promise.all(tasks);
    docs.forEach((doc) => ensureFolderRegistered(doc.folder));
    setDocuments((prev) => [...docs, ...prev]);
  };

  const onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { files } = event.target;
    if (files && files.length > 0) {
      void handleFiles(files);
    }
    // reset so same file can be re-uploaded
    event.target.value = '';
  };

  const handleCreateFolder = () => {
    const name = window.prompt('Folder name');
    if (!name) return;
    const cleaned = name.trim();
    if (!cleaned) return;
    const parentPath = folderFilter === 'All' || folderFilter === 'Unfiled' ? '' : folderFilter;
    const newPath = parentPath ? `${parentPath}/${cleaned}` : cleaned;
    setFolderLibrary((prev) => (prev.includes(newPath) ? prev : [...prev, newPath]));
    goToFolder(newPath);
  };

  const beginEdit = (doc: DocumentItem) => {
    setEditingId(doc.id);
    setDraft({
      ...doc,
      tags: [...(doc.tags || [])],
      links: (doc.links || []).map((link) => ({ ...link })),
    });
    if (doc.folder) expandPath(doc.folder);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const saveEdit = () => {
    if (!editingId || !draft) return;
    const normalized = normalizeDocument(draft);
    setDocuments((prev) => prev.map((doc) => (doc.id === editingId ? { ...doc, ...normalized } : doc)));
    if (normalized.folder) ensureFolderRegistered(normalized.folder);
    setEditingId(null);
    setDraft(null);
  };

  const deleteDocument = (id: string) => {
    if (!window.confirm('Delete this document?')) return;
    setDocuments((prev) => prev.filter((doc) => doc.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setDraft(null);
    }
  };

  const addDraftLink = () => {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            links: [...(prev.links || []), { id: 'ln_' + Math.random().toString(36).slice(2, 8), label: 'Linked item', kind: 'Custom' }],
          }
        : prev
    );
  };

  const updateDraftLink = (linkId: string, updates: Partial<DocumentLink>) => {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            links: (prev.links || []).map((link) => (link.id === linkId ? { ...link, ...updates } : link)),
          }
        : prev
    );
  };

  const removeDraftLink = (linkId: string) => {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            links: (prev.links || []).filter((link) => link.id !== linkId),
          }
        : prev
    );
  };

  const toggleSort = (key: typeof sortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDir((prevDir) => (prevDir === 'asc' ? 'desc' : 'asc'));
        return prevKey;
      }
      setSortDir(key === 'uploadedAt' ? 'desc' : 'asc');
      return key;
    });
  };

  const toggleNode = (pathKey: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(pathKey)) {
        next.delete(pathKey);
      } else {
        next.add(pathKey);
      }
      return next;
    });
  };

  const expandPath = (path: string) => {
    if (!path) return;
    const segments = path.split('/').map((seg) => seg.trim()).filter(Boolean);
    let accumulator = '';
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      next.add('__root__');
      segments.forEach((segment) => {
        accumulator = accumulator ? `${accumulator}/${segment}` : segment;
        next.add(accumulator);
      });
      return next;
    });
  };

  const goToFolder = (target: 'All' | 'Unfiled' | string) => {
    if (target === 'All') {
      setFolderFilter('All');
      setExpandedNodes((prev) => {
        const next = new Set(prev);
        next.add('__root__');
        return next;
      });
      return;
    }
    if (target === 'Unfiled') {
      setFolderFilter('Unfiled');
      return;
    }
    const normalized = target
      .split('/')
      .map((seg) => seg.trim())
      .filter(Boolean)
      .join('/');
    if (!normalized) {
      setFolderFilter('All');
      return;
    }
    setFolderFilter(normalized);
    expandPath(normalized);
  };

  const moveFolder = (sourcePath: string, parentPath: string) => {
    const segments = sourcePath.split('/').map((seg) => seg.trim()).filter(Boolean);
    const folderName = segments[segments.length - 1] || sourcePath;
    const destinationParent = parentPath
      .split('/')
      .map((seg) => seg.trim())
      .filter(Boolean)
      .join('/');
    const newPath = destinationParent ? `${destinationParent}/${folderName}` : folderName;
    if (newPath === sourcePath) {
      goToFolder(newPath);
      return;
    }

    setFolderLibrary((prev) => {
      const updated = prev.map((path) => {
        if (path === sourcePath) return newPath;
        if (path.startsWith(`${sourcePath}/`)) {
          return `${newPath}${path.slice(sourcePath.length)}`;
        }
        return path;
      });
      if (!updated.includes(newPath)) updated.push(newPath);
      const dedup = Array.from(new Set(updated));
      dedup.sort((a, b) => a.localeCompare(b));
      return dedup;
    });

    setDocuments((prev) =>
      prev.map((doc) => {
        if (!doc.folder) return doc;
        if (doc.folder === sourcePath) {
          return { ...doc, folder: newPath };
        }
        if (doc.folder.startsWith(`${sourcePath}/`)) {
          return { ...doc, folder: `${newPath}${doc.folder.slice(sourcePath.length)}` };
        }
        return doc;
      })
    );

    goToFolder(newPath);
  };

  const renameFolder = (sourcePath: string, newName: string) => {
    const segments = sourcePath.split('/').map((seg) => seg.trim()).filter(Boolean);
    if (segments.length === 0) return;
    const parentPath = segments.slice(0, -1).join('/');
    const newPath = parentPath ? `${parentPath}/${newName}` : newName;
    const remapPath = (value: string) => {
      if (value === sourcePath) return newPath;
      if (value.startsWith(`${sourcePath}/`)) return `${newPath}${value.slice(sourcePath.length)}`;
      return value;
    };

    setFolderLibrary((prev) => {
      const mapped = prev.map(remapPath);
      if (!mapped.includes(newPath)) mapped.push(newPath);
      const dedup = Array.from(new Set(mapped.filter((path) => path.trim().length > 0)));
      dedup.sort((a, b) => a.localeCompare(b));
      return dedup;
    });

    setDocuments((prev) =>
      prev.map((doc) => {
        if (!doc.folder) return doc;
        const updatedFolder = remapPath(doc.folder);
        return updatedFolder === doc.folder ? doc : { ...doc, folder: updatedFolder };
      })
    );

    setExpandedNodes((prev) => {
      const next = new Set<string>();
      prev.forEach((path) => {
        if (path === '__root__') {
          next.add(path);
          return;
        }
        if (path === sourcePath) {
          next.add(newPath);
        } else if (path.startsWith(`${sourcePath}/`)) {
          next.add(`${newPath}${path.slice(sourcePath.length)}`);
        } else {
          next.add(path);
        }
      });
      return next;
    });

    setFolderFilter((prev) => {
      if (prev === 'All' || prev === 'Unfiled') return prev;
      const remapped = remapPath(prev);
      return remapped || 'All';
    });

    expandPath(newPath);
  };

  const isNodeSelected = (path: string) => {
    if (!path) return folderFilter === 'All';
    return folderFilter === path;
  };

  const handleSelectNode = (path: string) => {
    goToFolder(path ? path : 'All');
  };

  const renderTree = (node: FolderNode, depth = 0) => {
    const pathKey = node.path || '__root__';
    const expanded = expandedNodes.has(pathKey);
    const isSelected = isNodeSelected(node.path);
    const paddingStyle = depth === 0 ? {} : { paddingLeft: `${depth * 12}px` };
    return (
      <div key={pathKey} className="py-0.5">
        <div className={`flex items-center gap-1 rounded-md px-2 py-1 text-sm ${isSelected ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200' : 'text-slate-700 hover:bg-slate-100'}`} style={paddingStyle}>
          {node.children.length > 0 ? (
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:text-slate-700"
              onClick={(event) => {
                event.stopPropagation();
                toggleNode(pathKey);
              }}
            >
              <span className="material-symbols-outlined text-base leading-none">{expanded ? 'expand_more' : 'chevron_right'}</span>
            </button>
          ) : (
            <span className="inline-flex h-6 w-6" />
          )}
          <button
            type="button"
            className="flex flex-1 items-center gap-2 text-left"
            onClick={() => handleSelectNode(node.path)}
          >
            <span className="truncate">{node.name}</span>
            <span className="ml-auto text-xs text-slate-500">{node.count}</span>
          </button>
        </div>
        {node.children.length > 0 && expanded && (
          <div>
            {node.children.map((child) => renderTree(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
            onClick={handleUploadButton}
          >
            Upload documents
          </button>
          <button
            type="button"
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            onClick={handleCreateFolder}
          >
            New folder
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={onFileChange}
          />
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search documents"
          className="w-full max-w-xs rounded-md border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-brand-500"
        />
        <div className="ml-auto flex items-center gap-2 text-sm text-slate-600">
          <span>{documents.length} files</span>
          <span>•</span>
          <span>{formatBytes(totalSize)} stored</span>
        </div>
      </div>

      {availableTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500">Tags:</span>
          {availableTags.map((tag) => {
            const active = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                onClick={() => toggleTagFilter(tag)}
                className={`rounded-full px-2 py-0.5 text-xs ${active ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                #{tag}
              </button>
            );
          })}
          {selectedTags.length > 0 && (
            <button
              className="rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
              onClick={() => setSelectedTags([])}
            >
              Clear
            </button>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[240px,1fr]">
        <aside className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Folders</h3>
            <span className="text-xs text-slate-400">{documents.length} files</span>
          </div>
          <div className="mt-2 text-sm">
            {renderTree(treeRoot)}
            <div className={`mt-1 rounded-md px-2 py-1 text-sm ${folderFilter === 'Unfiled' ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200' : 'text-slate-700 hover:bg-slate-100'}`}>
              <button
                type="button"
                className="flex w-full items-center gap-2 text-left"
                onClick={() => goToFolder('Unfiled')}
              >
                <span>Unfiled</span>
                <span className="ml-auto text-xs text-slate-500">{unfiledCount}</span>
              </button>
            </div>
          </div>
        </aside>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-1 text-sm text-slate-600">
              {breadcrumbs.map((crumb, index) => (
                <div key={`${crumb.path}-${index}`} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleBreadcrumbClick(crumb.path)}
                    className={`rounded px-1.5 py-1 text-sm transition ${folderFilter === crumb.path || (crumb.path === 'All' && folderFilter === 'All') ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200' : 'text-slate-600 hover:text-brand-700'}`}
                  >
                    {crumb.label}
                  </button>
                  {index < breadcrumbs.length - 1 && (
                    <span className="material-symbols-outlined text-base text-slate-400">chevron_right</span>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>{childFolders.length} folders</span>
              <span>•</span>
              <span>
                Showing {filtered.length} of {documentsInCurrentFolder.length}{' '}
                {documentsInCurrentFolder.length === 1 ? 'file' : 'files'}
              </span>
            </div>

            {folderFilter === 'Unfiled' ? (
              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Files here haven't been assigned a folder yet.
              </div>
            ) : childFolders.length === 0 ? (
              <div className="mt-4 rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                No subfolders yet. Use "New folder" to start organizing this space.
              </div>
            ) : visibleFolders.length === 0 ? (
              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                No folders match the current search.
              </div>
            ) : null}
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-[900px] bg-white text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">
                    <button className="flex items-center gap-1 hover:underline" onClick={() => toggleSort('name')}>
                      <span>Name</span>
                  {sortKey === 'name' && <span className="material-symbols-outlined text-base">{sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>}
                </button>
              </th>
              <th className="px-3 py-2 text-left font-medium">Folder</th>
              <th className="px-3 py-2 text-left font-medium">Tags</th>
              <th className="px-3 py-2 text-left font-medium">Linked items</th>
              <th className="px-3 py-2 text-left font-medium">
                <button className="flex items-center gap-1 hover:underline" onClick={() => toggleSort('uploadedAt')}>
                  <span>Uploaded</span>
                  {sortKey === 'uploadedAt' && <span className="material-symbols-outlined text-base">{sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>}
                </button>
              </th>
              <th className="px-3 py-2 text-right font-medium">
                <button className="flex items-center gap-1 hover:underline" onClick={() => toggleSort('size')}>
                  <span>Size</span>
                  {sortKey === 'size' && <span className="material-symbols-outlined text-base">{sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}</span>}
                </button>
              </th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tableRows.map((row) => {
              if (row.kind === 'folder') {
                const folder = row.folder;
                return (
                  <tr key={`folder-${folder.path || '__root__'}`} className="bg-slate-50/60">
                    <td className="px-3 py-2 align-top">
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-brand-700 hover:bg-brand-50"
                        onClick={() => handleOpenFolder(folder.path)}
                      >
                        <span className="material-symbols-outlined text-base">folder</span>
                        <span className="font-medium">{folder.name}</span>
                        <span className="ml-auto text-xs text-slate-500">{folder.count} items</span>
                      </button>
                    </td>
                    <td className="px-3 py-2 align-top text-slate-500">—</td>
                    <td className="px-3 py-2 align-top text-slate-500">—</td>
                    <td className="px-3 py-2 align-top text-slate-500">—</td>
                    <td className="px-3 py-2 align-top text-slate-500">—</td>
                    <td className="px-3 py-2 align-top text-right text-slate-500">—</td>
                    <td className="px-3 py-2 align-top text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
                          onClick={() => handleRenameFolder(folder)}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
                          onClick={() => handleMoveFolder(folder)}
                        >
                          Move
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
                          onClick={() => handleOpenFolder(folder.path)}
                        >
                          Open
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }

              const doc = row.doc;
              const isEditing = editingId === doc.id;
              const hasInlineData = Boolean(doc.dataUrl);
              return (
                <tr key={doc.id}>
                  <td className="px-3 py-2 align-top">
                    {isEditing ? (
                      <div className="space-y-2">
                        <input
                          className="w-full rounded border border-slate-200 px-2 py-1"
                          value={draft?.name || ''}
                          onChange={(e) => setDraft((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
                        />
                        <textarea
                          className="w-full rounded border border-slate-200 px-2 py-1"
                          rows={2}
                          placeholder="Description or notes"
                          value={draft?.note || ''}
                          onChange={(e) => setDraft((prev) => (prev ? { ...prev, note: e.target.value } : prev))}
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-base text-slate-500">{iconForType(doc.type)}</span>
                          <span className="font-medium text-slate-800">{doc.name}</span>
                          {doc.metadataOnly && (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">Metadata only</span>
                          )}
                        </div>
                        {doc.note && <div className="text-xs text-slate-500">{doc.note}</div>}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-slate-700">
                    {isEditing ? (
                      <input
                        className="w-full rounded border border-slate-200 px-2 py-1"
                        list="document-folders"
                        value={draft?.folder || ''}
                        onChange={(e) => setDraft((prev) => (prev ? { ...prev, folder: e.target.value } : prev))}
                      />
                    ) : (
                      doc.folder || '—'
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {isEditing ? (
                      <input
                        className="w-full rounded border border-slate-200 px-2 py-1"
                        value={(draft?.tags || []).join(', ')}
                        onChange={(e) =>
                          setDraft((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  tags: e.target.value
                                    .split(',')
                                    .map((tag) => tag.trim())
                                    .filter(Boolean),
                                }
                              : prev
                          )
                        }
                        placeholder="compliance, taxes"
                      />
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {(doc.tags || []).map((tag) => (
                          <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                            #{tag}
                          </span>
                        ))}
                        {(doc.tags || []).length === 0 && <span className="text-slate-400">—</span>}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {isEditing ? (
                      <div className="space-y-2">
                        {(draft?.links || []).map((link) => (
                          <div key={link.id} className="space-y-1 rounded border border-slate-200 p-2">
                            <div className="flex items-center gap-2">
                              <select
                                className="w-32 rounded border border-slate-200 px-2 py-1 text-sm"
                                value={link.kind || 'Custom'}
                                onChange={(e) => updateDraftLink(link.id, { kind: e.target.value })}
                              >
                                {linkKinds.map((option) => (
                                  <option key={option.value} value={option.value || 'Custom'}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                              <button
                                className="ml-auto rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-50"
                                onClick={() => removeDraftLink(link.id)}
                              >
                                Remove
                              </button>
                            </div>
                            <input
                              className="w-full rounded border border-slate-200 px-2 py-1"
                              placeholder="Label"
                              value={link.label}
                              onChange={(e) => updateDraftLink(link.id, { label: e.target.value })}
                            />
                            <input
                              className="w-full rounded border border-slate-200 px-2 py-1"
                              placeholder="https://..."
                              value={link.url || ''}
                              onChange={(e) => updateDraftLink(link.id, { url: e.target.value })}
                            />
                          </div>
                        ))}
                        <button
                          type="button"
                          className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                          onClick={addDraftLink}
                        >
                          Add link
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {(doc.links || []).length === 0 && <span className="text-slate-400">—</span>}
                        {(doc.links || []).map((link) => (
                          <a
                            key={link.id}
                            href={link.url}
                            target={link.url ? '_blank' : undefined}
                            rel={link.url ? 'noopener noreferrer' : undefined}
                            className={`inline-flex items-center gap-1 text-xs ${link.url ? 'text-brand-700 hover:underline' : 'text-slate-500'}`}
                          >
                            <span className="material-symbols-outlined text-[14px]">link</span>
                            {link.label}
                          </a>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-slate-600">
                    {new Date(doc.uploadedAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 align-top text-right text-slate-700">
                    {formatBytes(doc.size)}
                  </td>
                  <td className="px-3 py-2 align-top text-right">
                    {isEditing ? (
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
                        {hasInlineData && (
                          <a
                            href={doc.dataUrl}
                            download={doc.name}
                            className="rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
                          >
                            Download
                          </a>
                        )}
                        <button
                          className="rounded-md border border-slate-200 px-2 py-1 hover:bg-slate-50"
                          onClick={() => beginEdit(doc)}
                        >
                          Edit
                        </button>
                        <button
                          className="rounded-md border border-rose-200 px-2 py-1 text-rose-700 hover:bg-rose-50"
                          onClick={() => deleteDocument(doc.id)}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {tableRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-slate-500">
                  No documents match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
        </div>
      </div>

      <datalist id="document-folders">
        {allFolders.map((folder) => (
          <option key={folder} value={folder} />
        ))}
      </datalist>
    </div>
  );
}
