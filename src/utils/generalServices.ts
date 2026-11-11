import type { GeneralServiceUom } from "../types/generalService.types";

interface ServiceLike {
  total_days?: number | string | null;
  quantity?: number | string | null;
  service_type?: { uom?: string | null } | null;
}

export const serviceUom = (s: ServiceLike): GeneralServiceUom => {
  const uom = s.service_type?.uom;
  return uom === "ton" || uom === "kali" || uom === "ls" ? uom : "day";
};

export const isTonService = (s: ServiceLike): boolean =>
  serviceUom(s) === "ton";

// Kali (times) and Ls (lump sum): a plain quantity, one row per BASTP, and no
// dates — unlike day services (a date range) and ton services (supply dates).
export const isFixedQuantityUom = (uom: string | null | undefined): boolean =>
  uom === "kali" || uom === "ls";

export const isFixedQuantityService = (s: ServiceLike): boolean =>
  isFixedQuantityUom(serviceUom(s));

// What a service is priced by: its days for day-based services, its quantity
// (tons, times, lump sums) for everything else.
export const billableQuantity = (s: ServiceLike): number =>
  serviceUom(s) === "day" ? Number(s.total_days) || 0 : Number(s.quantity) || 0;

export const UOM_LABEL: Record<GeneralServiceUom, string> = {
  day: "Hari",
  ton: "Ton",
  kali: "Kali",
  ls: "Ls",
};

export const FRESH_WATER_SERVICE_CODE = "FRESH_WATER_SUPPLY";

// A BASTP normally hands over completed work details. The one exception is a
// fresh-water-only BASTP: water delivered to a vessel afloat (not docked at
// the yard) has no work details behind it, so the services alone make the
// BASTP. At least one service is required, and every one must be fresh water.
export const isFreshWaterOnly = (
  serviceCodes: (string | null | undefined)[],
): boolean =>
  serviceCodes.length > 0 &&
  serviceCodes.every((code) => code === FRESH_WATER_SERVICE_CODE);

export const formatTons =(value: number | string | null | undefined): string =>
  (Math.round((Number(value) || 0) * 100) / 100).toLocaleString("id-ID");

// e.g. "12,5 ton", "1 kali", "1 Ls" or "3 days"
export const formatServiceQuantity = (s: ServiceLike): string => {
  const uom = serviceUom(s);
  if (uom === "ton") return `${formatTons(s.quantity)} ton`;
  if (uom === "kali") return `${formatTons(s.quantity)} kali`;
  if (uom === "ls") return `${formatTons(s.quantity)} Ls`;
  const days = Number(s.total_days) || 0;
  return `${days} day${days !== 1 ? "s" : ""}`;
};

interface SortableService extends ServiceLike {
  start_date?: string | null;
  service_type?: { uom?: string | null; display_order?: number | null } | null;
}

// Display order of the service type, then supply/start date — so several
// Fresh Water deliveries on one BASTP list chronologically.
export function sortServices<T extends SortableService>(services: T[]): T[] {
  return [...services].sort(
    (a, b) =>
      (Number(a.service_type?.display_order) || 0) -
        (Number(b.service_type?.display_order) || 0) ||
      (a.start_date || "").localeCompare(b.start_date || ""),
  );
}

interface InvoiceServiceRow extends SortableService {
  id: number;
  service_type_id: number;
  unit_price?: number | null;
  payment_price?: number | null;
}

// One priced line on the invoice. Day-based services are one row each; all
// deliveries of a ton-based service (Fresh Water Supply) collapse into a
// single line priced once: unit price x total tons.
export interface InvoiceServiceLine<T> {
  key: string;
  service: T;
  rows: T[];
  quantity: number;
  unit_price: number;
  payment_price: number;
}

export function groupServicesForInvoice<T extends InvoiceServiceRow>(
  services: T[],
): InvoiceServiceLine<T>[] {
  const lines: InvoiceServiceLine<T>[] = [];
  const tonLines = new Map<number, InvoiceServiceLine<T>>();

  for (const s of sortServices(services)) {
    if (!isTonService(s)) {
      lines.push({
        key: `row-${s.id}`,
        service: s,
        rows: [s],
        quantity: billableQuantity(s),
        unit_price: Number(s.unit_price) || 0,
        payment_price: Number(s.payment_price) || 0,
      });
      continue;
    }
    const existing = tonLines.get(s.service_type_id);
    if (existing) {
      existing.rows.push(s);
      existing.quantity += billableQuantity(s);
      existing.payment_price += Number(s.payment_price) || 0;
    } else {
      const line: InvoiceServiceLine<T> = {
        key: `type-${s.service_type_id}`,
        service: s,
        rows: [s],
        quantity: billableQuantity(s),
        unit_price: Number(s.unit_price) || 0,
        payment_price: Number(s.payment_price) || 0,
      };
      tonLines.set(s.service_type_id, line);
      lines.push(line);
    }
  }
  return lines;
}

// e.g. "40 ton" for a grouped Fresh Water line, "3 days" otherwise
export const formatLineQuantity = <T extends InvoiceServiceRow>(
  line: InvoiceServiceLine<T>,
): string =>
  isTonService(line.service)
    ? `${formatTons(line.quantity)} ton`
    : formatServiceQuantity(line.service);

// Splits unit price x total tons across the individual deliveries, so each
// stored row carries its own share and the rows still sum to exactly the
// invoice line's amount (any rounding remainder goes on the last delivery).
export function splitAmountByQuantity(
  unitPrice: number,
  rows: { id: number; quantity: number }[],
): { id: number; payment_price: number }[] {
  const total = Math.round(
    unitPrice * rows.reduce((sum, r) => sum + r.quantity, 0),
  );
  let allocated = 0;
  return rows.map((r, i) => {
    const amount =
      i === rows.length - 1 ? total - allocated : Math.round(unitPrice * r.quantity);
    allocated += amount;
    return { id: r.id, payment_price: amount };
  });
}
