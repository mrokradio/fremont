'use client';

import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { SummaryCard } from './components/SummaryCard';
import { AllocationChart } from './components/AllocationChart';
import { CashflowList } from './components/CashflowList';
import { CashflowsView } from './components/CashflowsView';
import { ExpensesView } from './components/ExpensesView';
import { TransactionsTable } from './components/TransactionsTable';
import { PositionsView } from './components/PositionsView';
import { PlanningView } from './components/PlanningView';
import { AdminView, type AdminTab } from './components/AdminView';
import { AssetsView } from './components/AssetsView';
import { StrategyProgressOverview } from './components/StrategyProgressOverview';
import { RawDataView } from './components/RawDataView';
import { DocumentsView } from './components/DocumentsView';
import { NewsView } from './components/NewsView';
import { ReportingView } from './components/ReportingView';
import { ProfileModal } from './components/ProfileModal';
import { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { usePortfolioData } from './hooks/usePortfolioData';

type View = 'dashboard' | 'news' | 'positions' | 'assets' | 'documents' | 'cashflows' | 'expenses' | 'planning' | 'reporting' | 'profile' | 'admin' | 'data';
type ProfileSection = 'contact' | 'associations';

const VIEW_LABELS: Record<View, string> = {
  dashboard: 'Dashboard',
  news: 'News',
  positions: 'Positions',
  assets: 'Assets',
  documents: 'Documents',
  cashflows: 'Cashflows',
  expenses: 'Expenses',
  planning: 'Planning',
  reporting: 'Reporting',
  profile: 'Profile',
  admin: 'Admin',
  data: 'Raw Data',
};

const ADMIN_TABS: Array<{ id: AdminTab; label: string }> = [
  { id: 'asset-defaults', label: 'Asset Defaults' },
  { id: 'strategy-benchmarks', label: 'Strategy Benchmarks' },
  { id: 'activity-log', label: 'Activity Log' },
];

export function App() {
  const [view, setView] = useState<View>('dashboard');
  const [profileSection, setProfileSection] = useState<ProfileSection>('contact');
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminTab, setAdminTab] = useState<AdminTab>('asset-defaults');

  const {
    authStatus,
    currentUser,
    loginEmail,
    setLoginEmail,
    loginPassword,
    setLoginPassword,
    loginLoading,
    googleAuthLoading,
    microsoftAuthLoading,
    authError,
    handlePasswordLogin,
    startGoogleSignIn,
    startMicrosoftSignIn,
    signOut,
  } = useAuth(() => {
    // Reset UI state on sign-out
    setProfileModalOpen(false);
    setSidebarOpen(false);
  });

  const {
    snapshot,
    positions,
    transactions,
    workspace,
    apiConnected,
    selectedYear,
    setSelectedYear,
    baseNetWorth,
    baseLiquidity,
    addPosition,
    createPositionFromInput,
    updatePosition,
    deletePosition,
    toggleLiquid,
    resetData,
  } = usePortfolioData(authStatus);

  // Reset portfolio data on sign-out
  const handleSignOut = () => {
    resetData();
    signOut();
  };

  const handleNavigate = (next: View) => {
    if (next === 'profile') {
      setProfileSection('contact');
      setProfileModalOpen(true);
      setSidebarOpen(false);
      return;
    }
    setView(next);
    setSidebarOpen(false);
  };

  if (authStatus !== 'authenticated') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6">
            <div className="text-2xl font-semibold text-brand-700">fremont</div>
            <h1 className="mt-2 text-xl font-semibold text-slate-900">Sign in</h1>
            <p className="mt-1 text-sm text-slate-500">
              Authenticate to access your planning and reporting workspace.
            </p>
          </div>

          {authStatus === 'checking' ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Checking session...
            </div>
          ) : (
            <>
              {authError && (
                <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {authError}
                </div>
              )}
              <form className="space-y-3" onSubmit={handlePasswordLogin}>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(event) => setLoginEmail(event.target.value)}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                    placeholder="name@company.com"
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(event) => setLoginPassword(event.target.value)}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loginLoading || googleAuthLoading || microsoftAuthLoading}
                  className="w-full rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
                >
                  {loginLoading ? 'Signing in...' : 'Sign in'}
                </button>
              </form>

              <div className="my-4 border-t border-slate-200" />

              <button
                type="button"
                onClick={startGoogleSignIn}
                disabled={googleAuthLoading || microsoftAuthLoading || loginLoading}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {googleAuthLoading ? 'Redirecting to Google...' : 'Sign in with Google'}
              </button>
              <button
                type="button"
                onClick={startMicrosoftSignIn}
                disabled={microsoftAuthLoading || googleAuthLoading || loginLoading}
                className="mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {microsoftAuthLoading ? 'Redirecting to Microsoft...' : 'Sign in with Microsoft'}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app-grid relative bg-slate-50">
      <aside className="app-sidebar hidden border-r border-slate-200 bg-white lg:flex">
        <Sidebar current={view} onNavigate={handleNavigate} />
      </aside>
      <header className="app-topbar border-b border-slate-200 bg-white">
        <TopBar
          title={VIEW_LABELS[view] || 'Fremont'}
          subtitle={`As of ${snapshot.asOf}${apiConnected ? ' - API' : ' - Local'}`}
          onMenuClick={() => setSidebarOpen(true)}
          selectedYear={selectedYear}
          onSelectedYearChange={setSelectedYear}
          warningCount={workspace?.facts.warnings.length ?? 0}
          userName={currentUser?.name}
          userEmail={currentUser?.email}
          onOpenProfile={() => {
            setProfileSection('contact');
            setProfileModalOpen(true);
          }}
          onOpenAccount={() => {
            setProfileSection('associations');
            setProfileModalOpen(true);
          }}
          onSignOut={handleSignOut}
        />
        {view === 'admin' && (
          <div className="border-t border-slate-200 px-4 pt-2 sm:px-6">
            <div className="overflow-x-auto">
              <div className="min-w-max border-b border-slate-300">
                <div className="flex items-end gap-1">
                  {ADMIN_TABS.map((tab) => (
                    <button
                      type="button"
                      key={tab.id}
                      className={
                        'rounded-t-lg border px-4 py-2 text-sm transition-colors ' +
                        (adminTab === tab.id
                          ? '-mb-px border-slate-300 border-b-white bg-white font-semibold text-slate-900'
                          : 'border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800')
                      }
                      onClick={() => setAdminTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </header>
      <main className="app-main px-4 py-6 sm:p-6">
        {view === 'dashboard' && (
          <>
            <section className="grid grid-cols-1 gap-6 lg:grid-cols-4">
              <SummaryCard title="Net Worth" value={baseNetWorth} format="currency" className="lg:col-span-2" />
              <SummaryCard title="Liquidity" value={baseLiquidity} format="currency" />
              <SummaryCard title="Holdings" value={snapshot.allocation.length} format="count" />
            </section>

            {workspace && (
              <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
                <SummaryCard title={`Plan vs Actual NW (${selectedYear})`} value={workspace.facts.netWorthVariance ?? 0} format="currency" />
                <SummaryCard title={`Plan vs Actual Liquidity (${selectedYear})`} value={workspace.facts.liquidityVariance ?? 0} format="currency" />
                <SummaryCard title={`Return Impact (${selectedYear})`} value={workspace.facts.returnImpactPct} format="percent" />
              </section>
            )}

            <section className="mt-6">
              <StrategyProgressOverview
                facts={workspace?.facts ?? null}
                selectedYear={selectedYear}
                positions={positions}
              />
            </section>

            <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h2 className="mb-4 text-lg font-semibold text-slate-800">Asset Allocation</h2>
                  <AllocationChart data={snapshot.allocation} />
                </div>
              </div>
              <div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h2 className="mb-4 text-lg font-semibold text-slate-800">Upcoming Cashflows</h2>
                  <CashflowList items={snapshot.upcomingCashflows} />
                </div>
              </div>
            </section>

            <section className="mt-6">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <h2 className="mb-4 text-lg font-semibold">
                  <button
                    type="button"
                    className="text-left text-slate-800 underline-offset-2 hover:text-brand-700 hover:underline"
                    onClick={() => setView('expenses')}
                    title="Go to Expenses"
                  >
                    Expenses
                  </button>
                </h2>
                <ExpensesView />
              </div>
            </section>

            <section className="mt-6">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <h2 className="mb-4 text-lg font-semibold text-slate-800">Recent Transactions</h2>
                <TransactionsTable items={transactions} />
              </div>
            </section>
          </>
        )}

        {view === 'news' && (
          <section className="grid grid-cols-1 gap-6">
            <NewsView />
          </section>
        )}

        {view === 'positions' && (
          <section className="grid grid-cols-1 gap-6">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-4 text-lg font-semibold text-slate-800">Positions</h2>
              <PositionsView
                positions={positions}
                onToggleLiquid={toggleLiquid}
                onAddPosition={addPosition}
                onCreatePosition={createPositionFromInput}
                onDeletePosition={deletePosition}
                onUpdatePosition={updatePosition}
              />
            </div>
          </section>
        )}

        {view === 'expenses' && (
          <section className="grid grid-cols-1 gap-6">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-4 text-lg font-semibold text-slate-800">Expense Management</h2>
              <ExpensesView />
            </div>
          </section>
        )}

        {view === 'assets' && (
          <section className="grid grid-cols-1 gap-6">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-4 text-lg font-semibold text-slate-800">Assets</h2>
              <AssetsView />
            </div>
          </section>
        )}

        {view === 'documents' && (
          <section className="grid grid-cols-1 gap-6">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-4 text-lg font-semibold text-slate-800">Documents</h2>
              <DocumentsView />
            </div>
          </section>
        )}

        {view === 'cashflows' && (
          <section className="grid grid-cols-1 gap-6">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-4 text-lg font-semibold text-slate-800">Cashflows</h2>
              <CashflowsView startLiquidity={baseLiquidity} defaultYear={selectedYear} />
            </div>
          </section>
        )}

        {view === 'planning' && (
          <section className="grid grid-cols-1 gap-6">
            <PlanningView
              startYear={selectedYear}
              selectedYear={selectedYear}
              baseNetWorth={baseNetWorth}
              baseLiquidity={baseLiquidity}
              workspace={workspace}
            />
          </section>
        )}

        {view === 'reporting' && (
          <section className="grid grid-cols-1 gap-6">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-4 text-lg font-semibold text-slate-800">Reporting</h2>
              <ReportingView
                baseNetWorth={baseNetWorth}
                selectedYear={selectedYear}
                workspace={workspace}
                positions={positions}
              />
            </div>
          </section>
        )}

        {view === 'admin' && (
          <section className="grid grid-cols-1 gap-6">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <AdminView activeTab={adminTab} />
            </div>
          </section>
        )}

        {view === 'data' && (
          <section className="grid grid-cols-1 gap-6">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="mb-4 text-lg font-semibold text-slate-800">Raw Data</h2>
              <RawDataView
                positions={positions}
                transactions={transactions}
                onUpdatePosition={updatePosition}
                onDeletePosition={deletePosition}
              />
            </div>
          </section>
        )}
      </main>
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative flex h-full w-72 max-w-[85%] flex-col border-r border-slate-200 bg-white shadow-xl">
            <Sidebar
              current={view}
              onNavigate={handleNavigate}
              onDismiss={() => setSidebarOpen(false)}
            />
          </div>
        </div>
      )}
      <ProfileModal
        open={profileModalOpen}
        user={currentUser}
        initialSection={profileSection}
        onClose={() => setProfileModalOpen(false)}
      />
    </div>
  );
}
