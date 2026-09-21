// Official Indonesian national holidays (Hari Libur Nasional) per the
// government's SKB 3 Menteri joint decree — deliberately NOT including
// "cuti bersama" (joint leave) days, since those aren't official public
// holidays, just a separate govt/schools convention.
//
// Movable Islamic-calendar holidays (Idul Fitri, Idul Adha, Isra Mikraj,
// Maulid Nabi, 1 Muharram) and a few others (Nyepi, Easter, Vesak) shift
// every year and are only announced a year or so in advance — there's no
// way to compute them, so this list has to be extended by hand once each
// new year's SKB 3 Menteri is published. Only years actually needed by
// existing work order dates are included below; add the next year's list
// (verified against an official source, e.g. setneg.go.id or
// kemenkopmk.go.id) before it's needed.
export const INDONESIAN_NATIONAL_HOLIDAYS = new Set<string>([
  // 2025 (only the date range this app's data actually reaches)
  "2025-12-25", // Hari Raya Natal (Christmas)

  // 2026 — verified against setneg.go.id / kalenderlengkap.id / detik.com
  "2026-01-01", // Tahun Baru Masehi (New Year's Day)
  "2026-01-16", // Isra Mikraj Nabi Muhammad SAW
  "2026-02-17", // Tahun Baru Imlek (Chinese New Year)
  "2026-03-19", // Hari Suci Nyepi
  "2026-03-21", // Hari Raya Idul Fitri
  "2026-03-22", // Hari Raya Idul Fitri
  "2026-04-03", // Wafat Yesus Kristus (Good Friday)
  "2026-04-05", // Kebangkitan Yesus Kristus (Easter)
  "2026-05-01", // Hari Buruh Internasional (Labour Day)
  "2026-05-14", // Kenaikan Yesus Kristus (Ascension Day)
  "2026-05-27", // Hari Raya Idul Adha
  "2026-05-31", // Hari Raya Waisak (Vesak Day)
  "2026-06-01", // Hari Lahir Pancasila (Pancasila Day)
  "2026-06-16", // Tahun Baru Islam 1448 H (Islamic New Year)
  "2026-08-17", // Hari Kemerdekaan RI (Independence Day)
  "2026-08-25", // Maulid Nabi Muhammad SAW
  "2026-12-25", // Hari Raya Natal (Christmas)
]);

// Parses a "YYYY-MM-DD" date-only string as a UTC calendar date — avoids
// the classic JS pitfall where `new Date("2026-06-13")` combined with
// local-timezone day-of-week/increment methods can silently shift by a
// day depending on the browser's timezone. Callers should use the
// UTC-suffixed Date methods (getUTCDay, setUTCDate, etc.) consistently
// with whatever this returns.
export function parseISODateUTC(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

// Counts working days in [start, end] inclusive — every calendar day
// except Sundays and Indonesian national holidays. Saturday is still
// counted as a working day; only Sunday specifically is excluded, per how
// the shipyard actually schedules work.
export function calcWorkingDays(
  start?: string | null,
  end?: string | null,
): number {
  if (!start || !end) return 0;
  const startDate = parseISODateUTC(start);
  const endDate = parseISODateUTC(end);
  if (endDate.getTime() < startDate.getTime()) return 0;

  let count = 0;
  const cursor = new Date(startDate);
  while (cursor.getTime() <= endDate.getTime()) {
    const isSunday = cursor.getUTCDay() === 0;
    const isoDate = cursor.toISOString().slice(0, 10);
    if (!isSunday && !INDONESIAN_NATIONAL_HOLIDAYS.has(isoDate)) {
      count++;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}
