import { vi } from 'vitest'

type Result = { data?: unknown; error?: unknown }
type Op = { method: string; args: unknown[] }

class FromBuilder {
  ops: Op[] = []
  constructor(
    public table: string,
    public result: Result
  ) {}

  // Chain methods all push their args onto `ops` and return `this` so they
  // can be awaited directly (via `then`) OR further chained.
  select(...args: unknown[]) {
    this.ops.push({ method: 'select', args })
    return this
  }
  update(...args: unknown[]) {
    this.ops.push({ method: 'update', args })
    return this
  }
  insert(...args: unknown[]) {
    this.ops.push({ method: 'insert', args })
    return this
  }
  eq(...args: unknown[]) {
    this.ops.push({ method: 'eq', args })
    return this
  }
  order(...args: unknown[]) {
    this.ops.push({ method: 'order', args })
    return this
  }
  limit(...args: unknown[]) {
    this.ops.push({ method: 'limit', args })
    return this
  }
  // `.single()` and `.maybeSingle()` both resolve with the canned result.
  // maybeSingle is supabase-js's no-throw variant for 0-or-1 rows; the
  // route treats `data: null, error: null` as "no row found".
  single() {
    this.ops.push({ method: 'single', args: [] })
    return Promise.resolve(this.result)
  }
  maybeSingle() {
    this.ops.push({ method: 'maybeSingle', args: [] })
    return Promise.resolve(this.result)
  }
  // PromiseLike so `await builder` works for chains that don't end in
  // `.single()` (e.g., `update(...).eq(...)` or `insert(...)`).
  then(
    resolve: (v: Result) => unknown,
    reject?: (e: unknown) => unknown
  ): Promise<unknown> {
    return Promise.resolve(this.result).then(resolve, reject)
  }
}

export interface MockUser {
  id: string
  email?: string
}

export interface MockSupabaseOpts {
  user: MockUser | null
  /**
   * Results returned by successive `.from(table)` chains, in FIFO order.
   * The first `.from()` call dequeues the first result, second call the
   * second, etc. If the queue runs out, a sentinel `{ data: null, error: null }`
   * is used and a test-debug warning is logged.
   */
  fromResults?: Result[]
}

export interface MockSupabase {
  client: {
    auth: { getUser: ReturnType<typeof vi.fn> }
    from: ReturnType<typeof vi.fn>
  }
  /** Builder instances captured per `.from()` call, in call order. */
  fromCalls: FromBuilder[]
}

export function makeSupabase(opts: MockSupabaseOpts): MockSupabase {
  const fromCalls: FromBuilder[] = []
  const results = [...(opts.fromResults ?? [])]

  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: opts.user },
        error: null,
      }),
    },
    from: vi.fn((table: string) => {
      const result = results.shift() ?? { data: null, error: null }
      const builder = new FromBuilder(table, result)
      fromCalls.push(builder)
      return builder
    }),
  }

  return { client, fromCalls }
}

/**
 * Pull the payload passed to a chain method. E.g., `payloadOf(builder, 'update')`
 * returns the first arg of the `.update(...)` call. Returns `undefined` if the
 * method wasn't called.
 */
export function payloadOf(
  builder: FromBuilder,
  method: Op['method']
): unknown {
  const op = builder.ops.find((o) => o.method === method)
  return op?.args[0]
}
