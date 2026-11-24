// Colours and number formatting shared by the dashboard's charts and tables.

// Fixed-order categorical hues for nominal breakdowns (no inherent order).
export const CATEGORICAL = {
  blue: "#2a78d6",
  orange: "#eb6834",
  aqua: "#1baf7a",
};

// Reserved status hues, never reused for a plain "series N".
export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  critical: "#d03b3b",
};

// One-hue ordinal ramp (light to dark) for the BASTP pipeline, where the stage
// order carries meaning.
export const PIPELINE_RAMP = [
  "#86b6ef",
  "#5598e7",
  "#2a78d6",
  "#1c5cab",
  "#104281",
];

export const pct = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 100) : 0;

export const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(amount);
