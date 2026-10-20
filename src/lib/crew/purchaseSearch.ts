import { listAliases, runPurchaseSearch } from "./purchaseQueries";
import { TRADES, normalizeJobName, type AliasRule, type Trade } from "./purchases";
import { listJobs } from "./queries";
import { addDays, isDay, localDay, weekStart } from "./time";

// Finding a purchase (migration 0026). Owner intent (Lando, 2026-10-19): "a
// search option for owners and PM if they need to find a specific purchase;
// they should be able to ask and receive matches." The words are typed, said
// into the phone, or sent to the bot; what comes back is trips, with the
// lines that matched pointed at.
//
// The query is plain words. Before the database sees it, parseQuery takes
// out what is not a product word: a date or a month ("august", "8/12",
// "2026-08", "last week") becomes a date filter, and a job's name or one of
// its register aliases ("point loma", "pt loma") narrows to that job. Then
// purchases_search() matches every word as a prefix in the line's full text;
// when that finds nothing, the same words go by trigram similarity against
// the description, so "drywal" and "ultralite" still land ("close matches").
//
// Scope is the caller's: owners pass jobIds null (everything), the project
// manager passes the jobs he is on. The route decides that, never the query.
// parseQuery and groupTrips are pure; searchPurchases reads.

export const SEARCH_MAX_TRIPS = 50;
export const SEARCH_MAX_LINES = 40;
export const SEARCH_MAX_QUERY = 200;
/** A word closer than this to a description, by trigram, is a close match (purchases_search, fuzzy mode). */
export const FUZZY_MIN_SIMILARITY = 0.3;

export type SearchMode = "full-text" | "fuzzy";

export type ParsedQuery = {
  /** Plain lowercase words, punctuation stripped, dates and the job taken out. */
  words: string[];
  from: string | null;
  to: string | null;
  jobId: string | null;
  /** What was read as the job, as it was typed, for the screen. */
  jobText: string | null;
  /** What was read as a date, as it was typed. */
  dateText: string | null;
};

export type ParseContext = {
  /** The Phoenix day: "august" is this year's August unless it has not come yet. */
  today: string;
  /** The jobs the caller may see; a word that is one of these names (or ids) narrows to it. */
  jobs: { id: string; name: string }[];
  /** Register aliases (job_aliases) for those jobs; "ignore" aliases (null job) never narrow. */
  aliases: AliasRule[];
};

// ---- dates -------------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

type Range = { from: string; to: string };

const two = (n: number) => String(n).padStart(2, "0");

function monthRange(year: number, month: number): Range {
  const first = `${year}-${two(month)}-01`;
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${two(month + 1)}-01`;
  return { from: first, to: addDays(next, -1) };
}

function dayOf(year: number, month: number, dom: number): string | null {
  const d = `${year}-${two(month)}-${two(dom)}`;
  // Reject 2/30: the parsed instant would roll into March.
  return isDay(d) && new Date(`${d}T12:00:00Z`).getUTCMonth() + 1 === month ? d : null;
}

function fullYear(y: string): number {
  const n = Number(y);
  return y.length === 2 ? 2000 + n : n;
}

/** A month with no year is this year's, unless that is still ahead of today: then last year's. */
function monthOf(month: number, today: string): Range {
  const year = Number(today.slice(0, 4));
  const r = monthRange(year, month);
  return r.from > today ? monthRange(year - 1, month) : r;
}

function relative(phrase: string, today: string): Range | null {
  const monday = weekStart(today);
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  switch (phrase) {
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case "this week":
      return { from: monday, to: addDays(monday, 6) };
    case "last week":
    case "past week":
      return { from: addDays(monday, -7), to: addDays(monday, -1) };
    case "this month":
      return monthRange(y, m);
    case "last month":
    case "past month":
      return m === 1 ? monthRange(y - 1, 12) : monthRange(y, m - 1);
    case "this year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    case "last year":
    case "past year":
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    default:
      return null;
  }
}

const trimPunct = (t: string) => t.replace(/^[^a-z0-9/-]+|[^a-z0-9/-]+$/g, "");

/** A number token "12", "12th", "3rd" -> 12, 3; else null. */
function dayNumber(t: string | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2})(?:st|nd|rd|th)?$/.exec(trimPunct(t));
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 31 ? n : null;
}

function yearToken(t: string | undefined): number | null {
  if (!t) return null;
  const m = /^(20\d{2})$/.exec(trimPunct(t));
  return m ? Number(m[1]) : null;
}

/**
 * Read a date at `tokens[i]`. -> the range, and how many tokens it took; null
 * when the token is not a date. Handles "today", "last week", "this month",
 * month names with an optional day and year ("august", "aug 12", "august 12
 * 2025", "august 2025"), m/d and m/d/y, yyyy-mm and yyyy-mm-dd, and a bare
 * year (2000-2099).
 */
function readDate(tokens: string[], i: number, today: string): { range: Range; took: number } | null {
  const t = trimPunct(tokens[i]);
  const pair = `${t} ${trimPunct(tokens[i + 1] ?? "")}`;
  const rel2 = relative(pair, today);
  if (rel2) return { range: rel2, took: 2 };
  const rel1 = relative(t, today);
  if (rel1) return { range: rel1, took: 1 };

  const month = MONTHS[t];
  if (month) {
    const dom = dayNumber(tokens[i + 1]);
    if (dom !== null) {
      const year = yearToken(tokens[i + 2]);
      if (year !== null) {
        const d = dayOf(year, month, dom);
        return d ? { range: { from: d, to: d }, took: 3 } : null;
      }
      const thisYear = Number(today.slice(0, 4));
      let d = dayOf(thisYear, month, dom);
      if (d && d > today) d = dayOf(thisYear - 1, month, dom);
      // "may 45" is not a date: leave both words alone.
      return d ? { range: { from: d, to: d }, took: 2 } : null;
    }
    const year = yearToken(tokens[i + 1]);
    if (year !== null) return { range: monthRange(year, month), took: 2 };
    return { range: monthOf(month, today), took: 1 };
  }

  let m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(t);
  if (m) {
    const year = Number(m[1]);
    const mon = Number(m[2]);
    if (mon < 1 || mon > 12) return null;
    if (m[3]) {
      const d = dayOf(year, mon, Number(m[3]));
      return d ? { range: { from: d, to: d }, took: 1 } : null;
    }
    return { range: monthRange(year, mon), took: 1 };
  }

  m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(t);
  if (m) {
    const mon = Number(m[1]);
    const dom = Number(m[2]);
    if (mon < 1 || mon > 12) return null;
    if (m[3]) {
      const d = dayOf(fullYear(m[3]), mon, dom);
      return d ? { range: { from: d, to: d }, took: 1 } : null;
    }
    const thisYear = Number(today.slice(0, 4));
    let d = dayOf(thisYear, mon, dom);
    if (d && d > today) d = dayOf(thisYear - 1, mon, dom);
    return d ? { range: { from: d, to: d }, took: 1 } : null;
  }

  const year = yearToken(t);
  if (year !== null) return { range: { from: `${year}-01-01`, to: `${year}-12-31` }, took: 1 };
  return null;
}

// ---- the parser -----------------------------------------------------------------------------

/**
 * Plain words in, a query out: dates become the filter (two dates span from
 * the earlier to the later), the first job name or alias found narrows to that
 * job, the rest are the words (lowercased, punctuation dropped, as
 * normalizeJobName spells them, so a word matches the way a register name does).
 */
export function parseQuery(q: string, ctx: ParseContext): ParsedQuery {
  const tokens = q.toLowerCase().slice(0, SEARCH_MAX_QUERY).split(/\s+/).filter(Boolean);
  const ranges: Range[] = [];
  const dateText: string[] = [];
  const rest: string[] = [];
  for (let i = 0; i < tokens.length; ) {
    const d = readDate(tokens, i, ctx.today);
    if (d) {
      ranges.push(d.range);
      dateText.push(tokens.slice(i, i + d.took).join(" "));
      i += d.took;
    } else {
      rest.push(tokens[i]);
      i++;
    }
  }
  let words = normalizeJobName(rest.join(" ")).split(" ").filter(Boolean);

  // Which job: the longest run of words that is a job's name, id or alias. A
  // name two jobs share, or an alias and a name that disagree, narrows nothing.
  const jobOf = new Map<string, string | null>();
  const claim = (key: string, id: string) => {
    if (!key) return;
    const cur = jobOf.get(key);
    if (cur === undefined) jobOf.set(key, id);
    else if (cur !== id) jobOf.set(key, null);
  };
  for (const j of ctx.jobs) {
    claim(normalizeJobName(j.name), j.id);
    claim(normalizeJobName(j.id), j.id);
  }
  for (const a of ctx.aliases) if (a.jobId) claim(normalizeJobName(a.alias), a.jobId);
  let jobId: string | null = null;
  let jobText: string | null = null;
  outer: for (let n = Math.min(4, words.length); n >= 1; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      const phrase = words.slice(i, i + n).join(" ");
      const id = jobOf.get(phrase);
      if (id) {
        jobId = id;
        jobText = phrase;
        words = [...words.slice(0, i), ...words.slice(i + n)];
        break outer;
      }
    }
  }

  const from = ranges.length ? ranges.map((r) => r.from).sort()[0] : null;
  const to = ranges.length ? ranges.map((r) => r.to).sort().at(-1)! : null;
  return { words, from, to, jobId, jobText, dateText: dateText.length ? dateText.join(", ") : null };
}

// ---- rows -> trips ------------------------------------------------------------------------------

/** One row of purchases_search(): a line of one of the top trips. */
export type SearchRow = {
  tripKey: string;
  rank: number;
  totalTrips: number;
  tripCents: number;
  tripLines: number;
  sourceKey: string;
  purchasedOn: string;
  store: string;
  vendor: string;
  jobId: string | null;
  /** crew_jobs.name when the line is on a job. */
  jobName: string | null;
  jobNameRaw: string;
  trade: string;
  description: string;
  sku: string;
  qty: number;
  lineTotalCents: number;
  matched: boolean;
};

export type SearchLine = { description: string; sku: string; qty: number; lineTotalCents: number; trade: string; matched: boolean };

export type SearchTrip = {
  tripKey: string;
  purchasedOn: string;
  store: string;
  vendor: string;
  jobId: string | null;
  /** The job's name, or the register name for a line on no job. */
  jobName: string;
  /** The trades on the trip, most spent first. */
  trades: string[];
  /** The whole trip, every line, net of returns. */
  totalCents: number;
  /** How many lines the trip has; `lines` holds up to SEARCH_MAX_LINES of them, the matched ones first. */
  lineCount: number;
  lines: SearchLine[];
};

export type SearchResult = {
  trips: SearchTrip[];
  /** How many trips matched in all; `trips` is the top `limit` of them. */
  total: number;
  took: SearchMode;
  filters: { from: string | null; to: string | null; jobId: string | null; jobName: string | null };
};

/** The rows, in the order the database ranked them, as trips. */
export function groupTrips(rows: SearchRow[]): SearchTrip[] {
  const trips = new Map<string, SearchTrip & { byTrade: Map<string, number> }>();
  for (const r of rows) {
    let t = trips.get(r.tripKey);
    if (!t) {
      t = {
        tripKey: r.tripKey,
        purchasedOn: r.purchasedOn,
        store: r.store,
        vendor: r.vendor,
        jobId: r.jobId,
        jobName: r.jobId ? r.jobName || r.jobNameRaw : r.jobNameRaw,
        trades: [],
        totalCents: r.tripCents,
        lineCount: r.tripLines,
        lines: [],
        byTrade: new Map(),
      };
      trips.set(r.tripKey, t);
    }
    const trade = r.trade || "general";
    t.byTrade.set(trade, (t.byTrade.get(trade) ?? 0) + r.lineTotalCents);
    t.lines.push({ description: r.description, sku: r.sku, qty: r.qty, lineTotalCents: r.lineTotalCents, trade, matched: r.matched });
  }
  return [...trips.values()].map(({ byTrade, ...t }) => ({
    ...t,
    trades: [...byTrade.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([trade]) => trade),
  }));
}

// ---- the read -----------------------------------------------------------------------------------

export type SearchParams = {
  q: string;
  /** null = every job (owners). A project manager passes the jobs he is on. */
  jobIds?: string[] | null;
  /** One job picked outright (the Material block). Must be within jobIds, or nothing is found. */
  jobId?: string | null;
  trade?: string | null;
  from?: string | null;
  to?: string | null;
  limit?: number;
  /** The Phoenix day; defaults to now. */
  today?: string;
};

/** True when the error says migration 0026 (or 0022) is not applied yet. */
export function missingSearch(e: unknown): boolean {
  return /does not exist|schema cache|could not find the (table|function)/i.test((e as Error)?.message ?? "");
}

/**
 * Find a purchase. Full text first; when that finds nothing and there are
 * words, the same words by trigram similarity ("fuzzy"). At most `limit`
 * trips (SEARCH_MAX_TRIPS), each with up to SEARCH_MAX_LINES lines, ranked by
 * match then date, newest first.
 */
export async function searchPurchases(params: SearchParams): Promise<SearchResult> {
  const today = params.today ?? localDay();
  const scope = params.jobIds ?? null;
  const [jobs, aliases] = await Promise.all([listJobs(), listAliases()]);
  const visible = scope === null ? jobs : jobs.filter((j) => scope.includes(j.id));
  const parsed = parseQuery(params.q, {
    today,
    jobs: visible.map((j) => ({ id: j.id, name: j.name })),
    aliases: aliases.filter((a) => a.jobId && (scope === null || scope.includes(a.jobId))),
  });
  const picked = params.jobId || parsed.jobId;
  // The pick never widens the scope: a job outside it finds nothing.
  const jobIds = picked ? (scope === null || scope.includes(picked) ? [picked] : []) : scope;
  const trade = params.trade && (TRADES as readonly string[]).includes(params.trade) ? (params.trade as Trade) : "";
  const from = params.from && isDay(params.from) ? params.from : parsed.from;
  const to = params.to && isDay(params.to) ? params.to : parsed.to;
  const limit = Math.max(1, Math.min(SEARCH_MAX_TRIPS, Math.floor(params.limit ?? SEARCH_MAX_TRIPS) || SEARCH_MAX_TRIPS));
  const args = { words: parsed.words, jobIds, trade, from, to, trips: limit, lines: SEARCH_MAX_LINES };

  let took: SearchMode = "full-text";
  let rows = await runPurchaseSearch({ ...args, mode: "full-text" });
  if (!rows.length && parsed.words.length) {
    took = "fuzzy";
    rows = await runPurchaseSearch({ ...args, mode: "fuzzy" });
  }
  const jobName = picked ? (jobs.find((j) => j.id === picked)?.name ?? null) : null;
  return {
    trips: groupTrips(rows),
    total: rows[0]?.totalTrips ?? 0,
    took,
    filters: { from, to, jobId: picked && jobIds?.length ? picked : null, jobName: jobIds?.length ? jobName : null },
  };
}
