/**
 * Converts a non-negative integer into Indonesian words ("terbilang"),
 * e.g. 17 -> "Tujuh Belas", 100 -> "Seratus". Used for the Work Order
 * document's "Target Total Hari: 17 ( Tujuh Belas ) Hari" style text.
 *
 * Handles 0 up to 999,999 — comfortably beyond any realistic day count.
 */
const ONES = [
  "",
  "Satu",
  "Dua",
  "Tiga",
  "Empat",
  "Lima",
  "Enam",
  "Tujuh",
  "Delapan",
  "Sembilan",
];

function belowHundred(n: number): string {
  if (n < 10) return ONES[n];
  if (n < 20) return n === 10 ? "Sepuluh" : `${ONES[n - 10]} Belas`;
  const tens = Math.floor(n / 10);
  const rest = n % 10;
  return rest === 0 ? `${ONES[tens]} Puluh` : `${ONES[tens]} Puluh ${ONES[rest]}`;
}

function belowThousand(n: number): string {
  if (n < 100) return belowHundred(n);
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const prefix = hundreds === 1 ? "Seratus" : `${ONES[hundreds]} Ratus`;
  return rest === 0 ? prefix : `${prefix} ${belowHundred(rest)}`;
}

export function terbilang(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  if (n === 0) return "Nol";

  const rounded = Math.round(n);
  if (rounded < 1000) return belowThousand(rounded);

  const thousands = Math.floor(rounded / 1000);
  const rest = rounded % 1000;
  const prefix = thousands === 1 ? "Seribu" : `${belowThousand(thousands)} Ribu`;
  return rest === 0 ? prefix : `${prefix} ${belowThousand(rest)}`;
}
