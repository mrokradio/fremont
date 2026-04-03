// Shared number/percent formatting helpers to avoid per-render Intl allocations

const currencyFormatters = new Map<number, Intl.NumberFormat>();
const getCurrencyFormatter = (maxFractionDigits = 0) => {
  if (!currencyFormatters.has(maxFractionDigits)) {
    currencyFormatters.set(
      maxFractionDigits,
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: maxFractionDigits,
      }),
    );
  }
  return currencyFormatters.get(maxFractionDigits)!;
};

export const formatCurrency = (value: number, maxFractionDigits = 0) =>
  getCurrencyFormatter(maxFractionDigits).format(Number.isFinite(value) ? value : 0);

export const formatPercent = (value?: number, fractionDigits = 1) => {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${(value * 100).toFixed(fractionDigits)}%`;
};
