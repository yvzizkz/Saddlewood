// Read every row of a query, a page at a time. PostgREST returns at most
// max_rows per request (1000 here and on the hosted default) whatever
// .limit() asks, so a long period read in one go silently loses rows. The
// query must have a stable order. Stops at a hard cap and says so (`capped`),
// so a screen can warn rather than show a short total.

export const PAGE_SIZE = 1000;
/** 50 pages of 1,000: far past a year of Saddlewood rows, short of a runaway read. */
export const MAX_PAGES = 50;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function readAll<T>(
  page: (from: number, to: number) => Page<T>,
  what: string,
  opts: { size?: number; maxPages?: number } = {},
): Promise<{ rows: T[]; capped: boolean }> {
  const size = opts.size ?? PAGE_SIZE;
  const maxPages = opts.maxPages ?? MAX_PAGES;
  const rows: T[] = [];
  for (let n = 0; n < maxPages; n++) {
    const { data, error } = await page(n * size, n * size + size - 1);
    if (error) throw new Error(`${what}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < size) return { rows, capped: false };
  }
  return { rows, capped: true };
}
