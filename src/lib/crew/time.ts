// Days and clock times for the crew side of the app. Client-safe and pure.
//
// Everything is Phoenix time, whatever the phone or the server is set to: a
// shift that starts at 6:00 AM in Scottsdale belongs to that calendar day even
// though the server (UTC) is already seven hours ahead, and a foreman reading
// the timesheet from another time zone sees the jobsite's clock, not his own.
// Arizona does not change its clocks, so the offset is -07:00 all year.

export const CREW_TZ = "America/Phoenix";
const OFFSET = "-07:00";

const DAY_FMT = new Intl.DateTimeFormat("en-CA", { timeZone: CREW_TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const HHMM_FMT = new Intl.DateTimeFormat("en-GB", { timeZone: CREW_TZ, hour: "2-digit", minute: "2-digit", hour12: false });

export type Instant = Date | string | number;

function toDate(at: Instant): Date {
  return at instanceof Date ? at : new Date(at);
}

export function isDay(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));
}

export function isClock(v: unknown): v is string {
  return typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

/** The Phoenix calendar day of an instant, as YYYY-MM-DD. */
export function localDay(at: Instant = new Date()): string {
  return DAY_FMT.format(toDate(at));
}

/** The Phoenix wall-clock time of an instant, as HH:MM (24 hour). */
export function localClock(at: Instant): string {
  // en-GB gives "24:05" for five past midnight in some engines; fold it.
  return HHMM_FMT.format(toDate(at)).replace(/^24/, "00");
}

/** A Phoenix day and wall-clock time, as the instant it names. */
export function localInstant(day: string, hhmm: string): Date {
  return new Date(`${day}T${hhmm}:00${OFFSET}`);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 Sunday .. 6 Saturday. */
export function weekdayOf(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

/** The Monday on or before `day`. The week on a timesheet runs Monday to Sunday. */
export function weekStart(day: string): string {
  return addDays(day, -((weekdayOf(day) + 6) % 7));
}

export function weekDays(start: string): string[] {
  return [0, 1, 2, 3, 4, 5, 6].map((n) => addDays(start, n));
}

/** "6:02 AM", Phoenix time. */
export function clock12(at: Instant | null | undefined): string {
  if (at === null || at === undefined || at === "") return "";
  const d = toDate(at);
  if (Number.isNaN(d.getTime())) return "";
  const [h, m] = localClock(d).split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

/** "06:00" -> "6:00 AM". */
export function clockText(hhmm: string): string {
  if (!isClock(hhmm)) return hhmm;
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export type Worked = { startedAt: string; endedAt: string | null; breakMin: number };

/** Minutes on the clock, less the unpaid break. An open shift counts up to `now`. */
export function workedMinutes(shift: Worked, now: Instant = new Date()): number {
  const start = Date.parse(shift.startedAt);
  const end = shift.endedAt ? Date.parse(shift.endedAt) : toDate(now).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 60000) - (shift.endedAt ? shift.breakMin : 0));
}

/** 450 -> "7 h 30 min"; 45 -> "45 min"; 480 -> "8 h". */
export function hoursText(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (!h) return `${rest} min`;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

/** 450 -> "7.50". Hours as payroll enters them. */
export function hoursDecimal(minutes: number): string {
  return (Math.max(0, minutes) / 60).toFixed(2);
}

const MONTHS = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
};
const WEEKDAYS = {
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  es: ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"],
};
const WEEKDAYS_LONG = {
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  es: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],
};

/** "Mon, Oct 5" / "lun 5 oct". */
export function dayShort(day: string, lang: "en" | "es" = "en"): string {
  if (!isDay(day)) return day;
  const wd = WEEKDAYS[lang][weekdayOf(day)];
  const month = MONTHS[lang][Number(day.slice(5, 7)) - 1];
  const dom = Number(day.slice(8, 10));
  return lang === "es" ? `${wd} ${dom} ${month}` : `${wd}, ${month} ${dom}`;
}

/** "Today", "Tomorrow", "Yesterday", or the weekday and date. */
export function dayLabel(day: string, today: string, lang: "en" | "es" = "en"): string {
  if (day === today) return lang === "es" ? "Hoy" : "Today";
  if (day === addDays(today, 1)) return lang === "es" ? "Mañana" : "Tomorrow";
  if (day === addDays(today, -1)) return lang === "es" ? "Ayer" : "Yesterday";
  return dayShort(day, lang);
}

export function weekdayLong(day: string, lang: "en" | "es" = "en"): string {
  return isDay(day) ? WEEKDAYS_LONG[lang][weekdayOf(day)] : day;
}
