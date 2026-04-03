import { useEffect } from 'react';
import type { AuthUser } from '@fremont/shared';
import { ProfileView } from './ProfileView';

type ProfileSection = 'contact' | 'associations';

type Props = {
  open: boolean;
  user: AuthUser | null;
  initialSection?: ProfileSection;
  onClose: () => void;
};

export function ProfileModal({ open, user, initialSection = 'contact', onClose }: Props) {
  useEffect(() => {
    if (!open) return undefined;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        aria-label="Close profile"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Profile</h2>
            <p className="text-xs text-slate-500">Manage contact details and linked accounts.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-500"
            aria-label="Close profile modal"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
        <div className="max-h-[min(84vh,820px)] overflow-y-auto p-4 sm:p-6">
          <ProfileView user={user} initialSection={initialSection} />
        </div>
      </div>
    </div>
  );
}
