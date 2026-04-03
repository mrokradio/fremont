type NavKey = 'dashboard' | 'news' | 'positions' | 'assets' | 'documents' | 'cashflows' | 'expenses' | 'planning' | 'reporting' | 'profile' | 'admin' | 'data';

type NavItem = {
  key: NavKey;
  label: string;
  icon: string;
};

type Props = {
  current?: NavKey;
  onNavigate?: (key: NavKey) => void;
  onDismiss?: () => void;
  className?: string;
};

export function Sidebar({
  current = 'dashboard',
  onNavigate,
  onDismiss,
  className,
}: Props) {
  const broadcastItems: NavItem[] = [
    { key: 'dashboard', label: 'Dashboard', icon: 'space_dashboard' },
    { key: 'news', label: 'News', icon: 'campaign' },
  ];

  const workspaceItems: NavItem[] = [
    { key: 'positions', label: 'Positions', icon: 'insights' },
    { key: 'assets', label: 'Assets', icon: 'account_balance' },
    { key: 'documents', label: 'Documents', icon: 'description' },
    { key: 'cashflows', label: 'Cashflows', icon: 'sync_alt' },
    { key: 'expenses', label: 'Expenses', icon: 'receipt_long' },
    { key: 'planning', label: 'Planning', icon: 'event' },
    { key: 'reporting', label: 'Reporting', icon: 'monitoring' },
    { key: 'admin', label: 'Admin', icon: 'tune' },
    { key: 'data', label: 'Raw Data', icon: 'dataset' },
  ];

  const containerClass = ['flex h-full flex-col', className].filter(Boolean).join(' ');
  return (
    <div className={containerClass}>
      <div className="flex items-center justify-between p-4">
        <div className="text-xl font-semibold" style={{ color: '#E23D2D' }}>fremont</div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
            aria-label="Close navigation"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        )}
      </div>
      <nav className="flex-1 space-y-1 p-2">
        {broadcastItems.map(({ key, label, icon }) => {
          const active = key === current;
          return (
            <button
              key={key}
              onClick={() => onNavigate && onNavigate(key)}
              className={
                'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium ' +
                (active
                  ? 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200'
                  : 'text-slate-700 hover:bg-slate-100')
              }
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">{icon}</span>
              <span className="truncate">{label}</span>
            </button>
          );
        })}
        <div className="my-2 border-t border-slate-200" aria-hidden="true" />
        <div className="space-y-1">
          {workspaceItems.map(({ key, label, icon }) => {
            const active = key === current;
            return (
              <button
                key={key}
                onClick={() => onNavigate && onNavigate(key)}
                className={
                  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium ' +
                  (active
                    ? 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200'
                    : 'text-slate-700 hover:bg-slate-100')
                }
              >
                <span className="material-symbols-outlined text-base" aria-hidden="true">{icon}</span>
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
      <div className="p-3 text-xs text-slate-500">© {new Date().getFullYear()} Fremont</div>
    </div>
  );
}
