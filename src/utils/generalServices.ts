import type { GeneralServiceUom } from "../types/generalService.types";

interface ServiceLike {
  total_days?: number | string | null;
  quantity?: number | string | null;
  service_type?: { uom?: string | null } | null;
}

export const serviceUom = (s: ServiceLike): GeneralServiceUom =>
  s.service_type?.uom === "ton" ? "ton" : "day";

export const isTonService = (s: ServiceLike): boolean =>
  serviceUom(s) === "ton";

// What a service is priced by: tons for ton-based services, days otherwise.
export const billableQuantity = (s: ServiceLike): number =>
  isTonService(s) ? Number(s.quantity) || 0 : Number(s.total_days) || 0;

export const formatTons = (value: number | string | null | undefined): string =>
  (Math.round((Number(value) || 0) * 100) / 100).toLocaleString("id-ID");

// e.g. "12,5 ton" or "3 days"
export const formatServiceQuantity = (s: ServiceLike): string => {
  if (isTonService(s)) return `${formatTons(s.quantity)} ton`;
  const days = Number(s.total_days) || 0;
  return `${days} day${days !== 1 ? "s" : ""}`;
};
