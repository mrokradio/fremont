import { useEffect, useMemo, useState } from 'react';
import type { AddUserAccountAssociationRequest, AuthUser, UserProfileResponse } from '@fremont/shared';
import { api } from '../lib/api';

type ProfileSection = 'contact' | 'associations';
type AccountProvider = AddUserAccountAssociationRequest['provider'];

type ContactDraft = {
  phone: string;
  secondaryEmail: string;
  title: string;
  company: string;
  location: string;
  notes: string;
};

type Props = {
  user: AuthUser | null;
  initialSection?: ProfileSection;
};

const emptyContact: ContactDraft = {
  phone: '',
  secondaryEmail: '',
  title: '',
  company: '',
  location: '',
  notes: '',
};

const defaultSection: ProfileSection = 'contact';

const formatTimestamp = (raw: string): string => {
  if (!raw) return 'Never';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return 'Never';
  return date.toLocaleString();
};

const toContactDraft = (profile: UserProfileResponse): ContactDraft => ({
  phone: profile.contact.phone ?? '',
  secondaryEmail: profile.contact.secondaryEmail ?? '',
  title: profile.contact.title ?? '',
  company: profile.contact.company ?? '',
  location: profile.contact.location ?? '',
  notes: profile.contact.notes ?? '',
});

const errorToMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return fallback;
};

export function ProfileView({ user, initialSection = defaultSection }: Props) {
  const [activeSection, setActiveSection] = useState<ProfileSection>(initialSection);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [associationMessage, setAssociationMessage] = useState('');
  const [newProvider, setNewProvider] = useState<AccountProvider>('Google');
  const [newIdentifier, setNewIdentifier] = useState('');
  const [profileState, setProfileState] = useState<UserProfileResponse | null>(null);
  const [contactDraft, setContactDraft] = useState<ContactDraft>(emptyContact);

  useEffect(() => {
    setActiveSection(initialSection);
  }, [initialSection]);

  useEffect(() => {
    if (!user) {
      setProfileState(null);
      setContactDraft(emptyContact);
      setLoadingProfile(false);
      return;
    }

    let active = true;
    setLoadingProfile(true);
    setErrorMessage('');
    void api
      .userProfile()
      .then((profile) => {
        if (!active) return;
        setProfileState(profile);
        setContactDraft(toContactDraft(profile));
      })
      .catch((error) => {
        if (!active) return;
        setErrorMessage(errorToMessage(error, 'Unable to load profile.'));
      })
      .finally(() => {
        if (!active) return;
        setLoadingProfile(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  const providerChoices = useMemo(
    () => ['Google', 'Microsoft'] as const,
    [],
  );

  if (!user) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
        Profile is unavailable until you are authenticated.
      </div>
    );
  }

  const saveContact = async () => {
    if (!profileState || saving) return;
    setSaving(true);
    setErrorMessage('');
    try {
      const updated = await api.upsertUserContact({
        phone: contactDraft.phone,
        secondaryEmail: contactDraft.secondaryEmail,
        title: contactDraft.title,
        company: contactDraft.company,
        location: contactDraft.location,
        notes: contactDraft.notes,
      });
      setProfileState(updated);
      setContactDraft(toContactDraft(updated));
      setSavedMessage('Contact information saved.');
      window.setTimeout(() => setSavedMessage(''), 2200);
    } catch (error) {
      setErrorMessage(errorToMessage(error, 'Unable to save contact information.'));
    } finally {
      setSaving(false);
    }
  };

  const addAssociation = async () => {
    if (!profileState || saving) return;
    const identifier = newIdentifier.trim();
    if (!identifier) {
      setAssociationMessage('Enter an account identifier before adding.');
      return;
    }

    setSaving(true);
    setErrorMessage('');
    try {
      const updated = await api.addUserAccountAssociation({
        provider: newProvider,
        identifier,
      });
      setProfileState(updated);
      setNewIdentifier('');
      setAssociationMessage(`${newProvider} association added.`);
    } catch (error) {
      setErrorMessage(errorToMessage(error, 'Unable to add account association.'));
    } finally {
      setSaving(false);
    }
  };

  const removeAssociation = async (associationId: string) => {
    if (!profileState || saving) return;
    const association = profileState.associations.find((item) => item.id === associationId);
    if (!association) return;

    setSaving(true);
    setErrorMessage('');
    try {
      const updated = await api.removeUserAccountAssociation(associationId);
      setProfileState(updated);
      setAssociationMessage(`${association.provider} association removed.`);
    } catch (error) {
      setErrorMessage(errorToMessage(error, 'Unable to remove account association.'));
    } finally {
      setSaving(false);
    }
  };

  if (loadingProfile) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
        Loading profile...
      </div>
    );
  }

  if (!profileState) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
        {errorMessage || 'Unable to load profile.'}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-900">Profile</h2>
        <p className="mt-1 text-sm text-slate-600">
          Manage your contact details and account associations.
        </p>
        {errorMessage && (
          <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {errorMessage}
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveSection('contact')}
            className={
              'rounded-md px-3 py-1.5 text-sm ' +
              (activeSection === 'contact'
                ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-300'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
            }
          >
            Contact Information
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('associations')}
            className={
              'rounded-md px-3 py-1.5 text-sm ' +
              (activeSection === 'associations'
                ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-300'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200')
            }
          >
            Account Associations
          </button>
        </div>
      </div>

      {activeSection === 'contact' && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Display Name</label>
              <input
                value={user.name}
                disabled
                className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Primary Email</label>
              <input
                value={user.email}
                disabled
                className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Phone</label>
              <input
                value={contactDraft.phone}
                onChange={(event) => setContactDraft((prev) => ({ ...prev, phone: event.target.value }))}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                placeholder="+1 555 555 5555"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Secondary Email</label>
              <input
                value={contactDraft.secondaryEmail}
                onChange={(event) =>
                  setContactDraft((prev) => ({ ...prev, secondaryEmail: event.target.value }))
                }
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                placeholder="alias@company.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Title</label>
              <input
                value={contactDraft.title}
                onChange={(event) => setContactDraft((prev) => ({ ...prev, title: event.target.value }))}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                placeholder="Managing Director"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Company</label>
              <input
                value={contactDraft.company}
                onChange={(event) => setContactDraft((prev) => ({ ...prev, company: event.target.value }))}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                placeholder="Fremont Capital"
              />
            </div>
          </div>
          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-slate-700">Location</label>
            <input
              value={contactDraft.location}
              onChange={(event) => setContactDraft((prev) => ({ ...prev, location: event.target.value }))}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              placeholder="San Francisco, CA"
            />
          </div>
          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
            <textarea
              value={contactDraft.notes}
              onChange={(event) => setContactDraft((prev) => ({ ...prev, notes: event.target.value }))}
              rows={4}
              className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              placeholder="Additional contact preferences or details."
            />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void saveContact()}
              disabled={saving}
              className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save Contact Info'}
            </button>
            <span className="text-xs text-slate-500">
              Last saved: {formatTimestamp(profileState.contact.updatedAt)}
            </span>
            {savedMessage && <span className="text-xs text-emerald-700">{savedMessage}</span>}
          </div>
        </div>
      )}

      {activeSection === 'associations' && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h3 className="text-base font-semibold text-slate-900">Linked Accounts</h3>
          <p className="mt-1 text-sm text-slate-600">
            Add or remove account associations used to access this workspace.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[180px_1fr_auto]">
            <select
              value={newProvider}
              onChange={(event) => setNewProvider(event.target.value as AccountProvider)}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm"
            >
              {providerChoices.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </select>
            <input
              value={newIdentifier}
              onChange={(event) => setNewIdentifier(event.target.value)}
              className="rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              placeholder="name@company.com"
            />
            <button
              type="button"
              onClick={() => void addAssociation()}
              disabled={saving}
              className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Add'}
            </button>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
            <table className="min-w-full bg-white text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Provider</th>
                  <th className="px-3 py-2 text-left font-medium">Identifier</th>
                  <th className="px-3 py-2 text-left font-medium">Linked</th>
                  <th className="px-3 py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {profileState.associations.map((association) => (
                  <tr key={association.id}>
                    <td className="px-3 py-2 text-slate-700">{association.provider}</td>
                    <td className="px-3 py-2 text-slate-700">{association.identifier}</td>
                    <td className="px-3 py-2 text-slate-500">{formatTimestamp(association.linkedAt)}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        disabled={!association.removable}
                        onClick={() => void removeAssociation(association.id)}
                        className="rounded-md border border-rose-200 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
                      >
                        Remove association
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {associationMessage && (
            <div className="mt-3 text-sm text-slate-600">{associationMessage}</div>
          )}
        </div>
      )}
    </div>
  );
}
