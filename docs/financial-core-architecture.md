# Financial Core Architecture Blueprint

## Goal
Unify data capture, planning, and reporting around one financial model so every screen answers the same question from a different angle:

- `Capture`: What is true today?
- `Plan`: What could happen?
- `Report`: What happened vs plan?

This blueprint maps the current Fremont app into a phased target architecture without breaking existing workflows.

## Current State (Inventory)
Frontend currently stores core planning data in browser localStorage:

- `fremont.assets.v1`
- `fremont.planning.cashflows.v1`
- `fremont.scenarios.v1`
- `fremont.planning.defaults.v1`

Backend currently persists:

- Positions, transactions, snapshots (`apps/api/src/portfolio`)
- Planning scenarios (`apps/api/src/planning`) as JSON `inputs` + JSON `events`
- Auth/users/ingestion (`apps/api/src/auth`, `apps/api/src/users`, `apps/api/src/ingest`)

Main issue: the same financial truth is split between API tables and local browser state.

## Target Information Architecture
Keep existing nav labels, but organize by data lifecycle.

### Capture
- Positions
- Assets
- Income Items
- Outflows
- Documents
- Transactions

### Plan
- Scenario Setup (starting values + assumptions)
- Timeline Events (asset/life events)
- Projection Engine output
- Scenario Comparison

### Report
- Actuals vs Plan variance
- Liquidity runway
- Tax impact
- Net worth trajectory
- Exports

## Canonical Domain Model
`Financial Core` should be the only write target for planning/reporting.

### Facts (actuals)
- Position
- Transaction
- AssetRecord
- IncomeItem
- OutflowItem
- DocumentRecord

### Assumptions
- Tax assumptions (`rate`, `basis`)
- Return assumptions
- Inflation assumptions

### Scenarios
- Scenario metadata (`name`, horizon, start year)
- Baseline balances (`baseNetWorth`, `baseLiquidity`)
- Scenario events (typed events, not generic JSON blobs long term)

### Outputs (derived)
- Yearly/monthly projection points
- Risk markers (negative liquidity years, min liquidity)
- Variance outputs (actual vs plan)

## Backend Module Target
Add/expand modules in `apps/api/src`:

1. `financial-profile`
- Owns per-user baseline financial settings and assumptions.

2. `cashflow`
- Owns income/outflow tables.

3. `planning`
- Owns scenario metadata/events (already present, evolve shape).

4. `projection`
- Stateless calculation service used by planning and reporting.

5. `reporting`
- Read models and comparison endpoints.

## API Contract Direction
Shared contracts live in `packages/shared/src`.

Added foundation types:
- `packages/shared/src/financial-core.ts`
- `packages/shared/src/financial-contracts.ts`

Recommended endpoint set:

- `GET /financial/profile`
- `PUT /financial/profile`
- `GET /cashflows`
- `PUT /cashflows`
- `GET /planning/scenarios`
- `POST /planning/scenarios`
- `PUT /planning/scenarios/:id`
- `POST /projection/scenarios/:id`
- `GET /reporting/scenarios/compare?base=:id&compare=:id`

## Projection Engine Rules
Centralize rules once (backend service), then reuse everywhere:

1. Income and outflows from cashflow tables.
2. Taxes based on scenario assumptions (`gross_income` or `net_income`).
3. Timeline event impacts applied by year.
4. Net worth and liquidity roll-forward.
5. Derived metrics (negative liquidity years, min liquidity, deltas vs baseline).

## Migration Plan
Phased rollout to minimize risk.

### Phase 1 (Now)
- Centralize storage key definitions in shared constants.
- Normalize frontend types for planning cashflows and assumptions.
- Keep localStorage behavior intact.

### Phase 2
- Add API write endpoints for financial profile + cashflows.
- On web load: fetch from API first, fallback to localStorage.
- Dual-write (API + localStorage) for a short transition window.

### Phase 3
- Move projection logic into backend `projection` service.
- Web planning and cashflows consume projection API response.

### Phase 4
- Add reporting read models for actual-vs-plan and scenario comparison.
- Remove localStorage dependence for financial core entities.

### Phase 5
- Migrate/cleanup local keys after successful backfill.

## Data Mapping (Current -> Target)

- `fremont.planning.cashflows.v1`
  -> `cashflow_income_item`, `cashflow_outflow_item`
- `fremont.scenarios.v1`
  -> `planning_scenario` + typed `planning_event` rows
- `fremont.planning.defaults.v1`
  -> `asset_event_defaults` (per user)
- `fremont.assets.v1`
  -> `asset_record`

## Immediate Next Build Steps
1. Add `financial-profile` API module with Prisma model.
2. Add `cashflow` API module with `income_item` and `outflow_item` models.
3. Update web `PlanningView` and `CashflowsView` to load/save through API client.
4. Add one shared projection response contract and switch both views to it.
