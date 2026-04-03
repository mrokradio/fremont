import { useEffect, useRef, useState } from 'react';

type Props = {
  title: string;
  subtitle?: string;
  onMenuClick?: () => void;
  selectedYear?: number;
  onSelectedYearChange?: (year: number) => void;
  warningCount?: number;
  onGoogleSignIn?: () => void;
  googleSignInLoading?: boolean;
  userName?: string;
  userEmail?: string;
  onOpenProfile?: () => void;
  onOpenAccount?: () => void;
  onSignOut?: () => void;
};

export function TopBar({
  title,
  subtitle,
  onMenuClick,
  selectedYear,
  onSelectedYearChange,
  warningCount = 0,
  onGoogleSignIn,
  googleSignInLoading = false,
  userName,
  userEmail,
  onOpenProfile,
  onOpenAccount,
  onSignOut,
}: Props) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const currentYear = new Date().getFullYear();
  const yearRange = Array.from({ length: 21 }, (_, idx) => currentYear - 10 + idx);
  const yearOptions = selectedYear != null && !yearRange.includes(selectedYear)
    ? [...yearRange, selectedYear].sort((a, b) => a - b)
    : yearRange;

  const avatarSeed = (userName || userEmail || '?').trim();
  const initials = avatarSeed
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';

  useEffect(() => {
    if (!userMenuOpen) return undefined;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (userMenuRef.current?.contains(target)) return;
      setUserMenuOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setUserMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [userMenuOpen]);

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 md:flex-nowrap md:py-0">
      <div className="flex items-center gap-3">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 lg:hidden"
            aria-label="Open navigation"
          >
            <span className="material-symbols-outlined text-xl">menu</span>
          </button>
        )}
        <div>
          <h1 className="text-base font-semibold text-slate-900 md:text-lg">{title}</h1>
          {subtitle && (
            <p className="text-xs text-slate-500 md:text-sm">{subtitle}</p>
          )}
        </div>
      </div>
      <div className="flex w-full items-center gap-2 md:ml-auto md:w-auto">
        {selectedYear != null && onSelectedYearChange && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">Year</label>
            <select
              value={selectedYear}
              onChange={(event) => onSelectedYearChange(Number(event.target.value))}
              className="rounded-md border border-slate-200 px-2 py-2 text-sm text-slate-700"
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        )}
        {warningCount > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
            {warningCount} data warning{warningCount === 1 ? '' : 's'}
          </div>
        )}
        <input
          placeholder="Search"
          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 md:w-64"
          aria-label="Search"
        />
        {onGoogleSignIn && (
          <button
            type="button"
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            onClick={onGoogleSignIn}
            disabled={googleSignInLoading}
          >
            {googleSignInLoading ? 'Signing in...' : 'Sign in with Google'}
          </button>
        )}
        <button className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-700">
          New
        </button>
        {(userName || userEmail) && (
          <div className="relative ml-1" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setUserMenuOpen((prev) => !prev)}
              aria-haspopup="menu"
              aria-expanded={userMenuOpen}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white ring-2 ring-transparent transition hover:bg-brand-700 focus:outline-none focus:ring-brand-200"
              title={userName || userEmail}
            >
              {initials}
            </button>

            {userMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
              >
                <div className="border-b border-slate-100 px-3 py-3">
                  <div className="truncate text-sm font-semibold text-slate-800">{userName || userEmail}</div>
                  {userEmail && <div className="truncate text-xs text-slate-500">{userEmail}</div>}
                </div>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    setUserMenuOpen(false);
                    onOpenProfile?.();
                  }}
                >
                  <span className="material-symbols-outlined text-base" aria-hidden="true">person</span>
                  Profile
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  onClick={() => setUserMenuOpen(false)}
                >
                  <span className="material-symbols-outlined text-base" aria-hidden="true">settings</span>
                  Settings
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  onClick={() => {
                    setUserMenuOpen(false);
                    onOpenAccount?.();
                  }}
                >
                  <span className="material-symbols-outlined text-base" aria-hidden="true">manage_accounts</span>
                  Account
                </button>
                {onSignOut && (
                  <>
                    <div className="border-t border-slate-100" aria-hidden="true" />
                    <button
                      type="button"
                      role="menuitem"
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-rose-700 hover:bg-rose-50"
                      onClick={() => {
                        setUserMenuOpen(false);
                        onSignOut();
                      }}
                    >
                      <span className="material-symbols-outlined text-base" aria-hidden="true">logout</span>
                      Sign out
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
