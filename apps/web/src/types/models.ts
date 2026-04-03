export type {
  AllocationSlice,
  Cashflow,
  Position,
  PortfolioSnapshot,
  TransactionCategory,
  Transaction,
} from '@fremont/shared';

export type DocumentLink = {
  id: string;
  label: string;
  url?: string;
  kind?: string;
};

export type DocumentItem = {
  id: string;
  name: string;
  folder?: string;
  uploadedAt: string; // ISO string
  size: number; // bytes
  type: string; // MIME type
  tags: string[];
  note?: string;
  dataUrl?: string; // optional base64 payload (small files only)
  links?: DocumentLink[];
  metadataOnly?: boolean;
};

export type NewsPost = {
  id: string;
  title: string;
  summary: string;
  body?: string;
  publishDate: string; // ISO string
  author?: string;
  category?: string;
  tags?: string[];
  link?: string;
  pinned?: boolean;
  imageUrl?: string;
};

export type ActivityEntry = {
  id: string;
  timestamp: string; // ISO string
  ip: string;
  userId: string;
  userName: string;
  action: string;
  details?: Record<string, unknown>;
};

// Planning / Timeline types
export type PlanningAssetKind = 'Real Estate' | 'Car' | 'Boat' | 'Airplane' | 'Travel' | 'School' | 'OpCos';

export type PlanningAsset = {
  kind: PlanningAssetKind;
  // 'capital' assets shift liquidity into non-liquid net worth; 'expense' reduces both
  behavior: 'capital' | 'expense';
};

export type PlanEvent = {
  id: string;
  year: number;
  asset: PlanningAssetKind;
  value: number; // USD, positive number entered by user
  label?: string; // optional custom name for the item
  duration?: number; // years, defaults to 1
  color?: string; // CSS color for background span
  cost?: number; // one-time expense applied in start year
  recurring?: number; // expense applied each active year (including start)
  recurringGrowth?: number; // 0..1 annual increase rate for recurring (applies to School)
  // Airplane-specific straight-line depreciation
  usefulLifeYears?: number; // e.g., 10 years
  residualPct?: number; // 0..1 residual value as percentage of cost at end of life
  // OpCos transaction (buy uses cash, sell generates cash; NW unchanged)
  action?: 'buy' | 'sell';
  transfer?: number; // USD amount for OpCos buy/sell
};
