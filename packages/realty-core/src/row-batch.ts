/**
 * Bounded, deadline-guarded per-row batch plumbing for the cohort's
 * `*_bulk_get` / `*_compare_properties` / `*_resolve_addresses` tools
 * (fleet-audit#1091).
 *
 * Every cohort MCP hand-assembled the same envelope: `runBoundedBatch`
 * (or plain `mapWithConcurrency` / `Promise.all` where it hadn't been
 * adopted), `retryOnceOnTimeout` per row, `classifyRowError` → a status
 * + retryable flag, a `pending` backfill row, and a `{ count, …, results }`
 * envelope. The copies drifted in exactly the places that matter:
 *
 *  | copy                              | deadline | abort guard            | row error fields                  |
 *  | --------------------------------- | -------- | ---------------------- | --------------------------------- |
 *  | redfin bulk_get / compare / resolve | 45s    | before + inside retry  | status=kind, retryable            |
 *  | zillow bulk_get / resolve         | 45s      | before every dial      | error_kind=kind                   |
 *  | zillow compare                    | none     | none                   | error only                        |
 *  | homes bulk_get                    | 45s      | inside retry           | status: ok/error/pending          |
 *  | homes compare                     | none     | none                   | error only                        |
 *  | homes resolve                     | 50s      | runner loop            | status: resolved/…/pending        |
 *  | compass bulk_get / compare / resolve | 45s   | client proxy (#927)    | status only on transient kinds    |
 *  | onehome bulk_get / resolve        | none     | none                   | error only                        |
 *  | onehome compare                   | none (unbounded Promise.all) | none | error only (no classify)  |
 *
 * The canonical behaviour here takes the strictest of each:
 *
 *  - **Always deadline-bounded** (default {@link DEFAULT_ROW_BATCH_DEADLINE_MS},
 *    45s — the cohort convention, under the MCP client's ~60s request
 *    timeout) and **always concurrency-bounded** (default
 *    {@link DEFAULT_ROW_BATCH_CONCURRENCY} = fetchproxy's `BRIDGE_CONCURRENCY`).
 *  - **Abort guard before every attempt, including the retry** (redfin
 *    #956 + homes fleet-audit#131): a row the deadline already answered
 *    `pending` neither starts nor re-dials a fetch through the user's tab.
 *    The worker also receives the batch `signal` so a multi-request row
 *    can guard its client ({@link guardMethods} — compass's #927 proxy).
 *  - **Abandoned ≠ failed**: a row that dies with {@link RowAbandonedError}
 *    (or after the signal fired) is reported `pending`, never classified
 *    as an error.
 *  - **Every error row carries both `status` and `error_kind`** (= the
 *    classified kind) plus `retryable` and `error`, so redfin's `status`
 *    readers and zillow's `error_kind` readers both keep working; ok rows
 *    carry `status: 'ok'`.
 *  - **Envelope**: `{ count, ok, errored, pending?, blocked?, results }`
 *    (redfin's counts + zillow's `blocked`), `pending` / `blocked` only
 *    when non-zero, `results` renameable to `rows` (zillow / compass /
 *    onehome's key).
 *
 * Dependency-free: `runBoundedBatch`, `classifyRowError` and
 * `retryOnceOnTimeout` live in `@chrischall/mcp-utils`, which realty-core
 * must not import — the consumer injects them as a {@link RowBatchKit}.
 */

/** Overall hard deadline for one batch call — the cohort's 45s value. */
export const DEFAULT_ROW_BATCH_DEADLINE_MS = 45_000;

/** Rows in flight at once — fetchproxy's `BRIDGE_CONCURRENCY` (#78). */
export const DEFAULT_ROW_BATCH_CONCURRENCY = 6;

/**
 * Row kinds where re-issuing the same row could plausibly succeed:
 * transient bridge faults, a deadline cut, and a bot-wall block (retry
 * after the wall's retry-after). `protocol` / `other` (genuine misses,
 * parse failures) are structural.
 */
export const DEFAULT_RETRYABLE_ROW_KINDS: ReadonlySet<string> = new Set([
  'timeout',
  'bridge_down',
  'pending',
  'bot_challenge',
]);

/** The injected mcp-utils primitives (structural — pass the real ones). */
export interface RowBatchKit {
  /** `runBoundedBatch` from `@chrischall/mcp-utils`. */
  runBoundedBatch<T, R>(
    items: T[],
    worker: (item: T, signal?: AbortSignal) => Promise<R>,
    opts: {
      deadlineMs: number;
      concurrency?: number;
      onTimeout: (item: T, index: number) => R;
      onError?: (item: T, index: number, err: unknown) => R;
    }
  ): Promise<R[]>;
  /** `classifyRowError` from `@chrischall/mcp-utils/fetchproxy` (or a wrapper of it). */
  classifyRowError(err: unknown): { kind: string; message: string };
  /** `retryOnceOnTimeout` from `@chrischall/mcp-utils/fetchproxy`. Omit for no in-row retry. */
  retryOnceOnTimeout?<R>(fn: () => Promise<R>): Promise<R>;
}

/** Fields every error / pending row carries. */
export interface RowErrorFields {
  status: string;
  error_kind: string;
  retryable: boolean;
  error: string;
}

/** A row's outcome: the worker's value (`status: 'ok'`) or an error row. */
export type RowOutcome<B extends object, V extends object> =
  | (B & Omit<V, 'status'> & { status: 'ok' })
  | (B & RowErrorFields);

/** The envelope counts, without the rows. */
export interface RowEnvelopeCounts {
  count: number;
  ok: number;
  errored: number;
  pending?: number;
  blocked?: number;
}

export type RowEnvelope<R, K extends string = 'results'> = RowEnvelopeCounts & {
  [P in K]: R[];
};

/** Thrown in place of a request once the batch has abandoned the row. */
export class RowAbandonedError extends Error {
  constructor() {
    super('batch overall deadline reached; row abandoned');
    this.name = 'RowAbandonedError';
  }
}

/** Throw {@link RowAbandonedError} if `signal` has fired. */
export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new RowAbandonedError();
}

/**
 * Wrap `target` so the named (async) methods reject with
 * {@link RowAbandonedError} once `signal` has fired; every other member
 * passes through, bound to the target. Returns `target` itself when
 * there is no signal. Generalises compass's `guardClient` (#927).
 */
export function guardMethods<T extends object>(
  target: T,
  signal: AbortSignal | undefined,
  methods: readonly (keyof T & string)[]
): T {
  if (!signal) return target;
  const guarded = new Set<PropertyKey>(methods);
  return new Proxy(target, {
    get(t, prop) {
      const value = Reflect.get(t, prop, t) as unknown;
      if (typeof value !== 'function') return value;
      const fn = value as (...args: unknown[]) => unknown;
      if (!guarded.has(prop)) return fn.bind(t);
      return (...args: unknown[]) =>
        signal.aborted ? Promise.reject(new RowAbandonedError()) : fn.apply(t, args);
    },
  });
}

/** Whether `kind` is worth a caller-side retry. */
export function isRetryableRowKind(
  kind: string,
  retryable: ReadonlySet<string> = DEFAULT_RETRYABLE_ROW_KINDS
): boolean {
  return retryable.has(kind);
}

/** The message every `pending` row carries. */
export function pendingRowMessage(toolLabel: string): string {
  return (
    `${toolLabel} overall deadline reached before this row settled — the ` +
    'request is still pending (likely a slow or hung sub-request), NOT a ' +
    'missing listing. Re-run just the pending rows.'
  );
}

/** A classified error row over `base`. */
export function errorRow<B extends object>(
  base: B,
  classified: { kind: string; message: string },
  retryable: ReadonlySet<string> = DEFAULT_RETRYABLE_ROW_KINDS
): B & RowErrorFields {
  return {
    ...base,
    status: classified.kind,
    error_kind: classified.kind,
    retryable: isRetryableRowKind(classified.kind, retryable),
    error: classified.message,
  };
}

/** A retryable `pending` row over `base` (the deadline cut it off). */
export function pendingRow<B extends object>(base: B, toolLabel: string): B & RowErrorFields {
  return {
    ...base,
    status: 'pending',
    error_kind: 'pending',
    retryable: true,
    error: pendingRowMessage(toolLabel),
  };
}

/**
 * Build the `{ count, ok, errored, pending?, blocked?, results }`
 * envelope. `ok` counts `status: 'ok'` rows; `blocked` counts
 * `bot_challenge` rows.
 */
export function rowEnvelope<R extends { status?: unknown }, K extends string = 'results'>(
  rows: R[],
  opts: { resultsKey?: K } = {}
): RowEnvelope<R, K> {
  const ok = rows.filter((r) => r.status === 'ok').length;
  const pending = rows.filter((r) => r.status === 'pending').length;
  const blocked = rows.filter((r) => r.status === 'bot_challenge').length;
  const env: Record<string, unknown> = { count: rows.length, ok, errored: rows.length - ok };
  if (pending > 0) env.pending = pending;
  if (blocked > 0) env.blocked = blocked;
  env[opts.resultsKey ?? 'results'] = rows;
  return env as RowEnvelope<R, K>;
}

export interface RunRowBatchOptions<T, B extends object, K extends string> {
  /** The injected mcp-utils primitives. */
  kit: RowBatchKit;
  /** Names the tool in `pending` messages, e.g. `'redfin_bulk_get'`. */
  toolLabel: string;
  /**
   * Fields every row starts from — the identity a caller needs to re-run
   * the row (zpid / url / input / query, and e.g. `resolved: false` for a
   * resolver). A successful worker value is spread over it, so it can
   * refine them (a canonical URL, the portal's own id).
   */
  rowBase: (item: T) => B;
  /** Overall deadline. Default {@link DEFAULT_ROW_BATCH_DEADLINE_MS}. */
  deadlineMs?: number;
  /** Rows in flight. Default {@link DEFAULT_ROW_BATCH_CONCURRENCY}. */
  concurrency?: number;
  /** Kinds flagged `retryable`. Default {@link DEFAULT_RETRYABLE_ROW_KINDS}. */
  retryableKinds?: ReadonlySet<string>;
  /** Envelope key for the rows. Default `'results'`. */
  resultsKey?: K;
}

/**
 * Fetch every item into one row, bounded by concurrency and an overall
 * deadline, and return the envelope. `fetchRow` returns the row's success
 * fields (merged over `rowBase(item)` with `status: 'ok'`) or throws;
 * a throw is retried once if the kit's retry says so, then classified.
 * Never rejects.
 */
export async function runRowBatch<T, V extends object, B extends object, K extends string = 'results'>(
  items: readonly T[],
  fetchRow: (item: T, signal?: AbortSignal) => Promise<V>,
  opts: RunRowBatchOptions<T, B, K>
): Promise<RowEnvelope<RowOutcome<B, V>, K>> {
  const { kit, toolLabel, rowBase } = opts;
  const retryable = opts.retryableKinds ?? DEFAULT_RETRYABLE_ROW_KINDS;
  const retry = kit.retryOnceOnTimeout
    ? <R>(fn: () => Promise<R>) => kit.retryOnceOnTimeout!(fn)
    : <R>(fn: () => Promise<R>) => fn();

  const toErrorRow = (item: T, err: unknown, signal?: AbortSignal): RowOutcome<B, V> =>
    err instanceof RowAbandonedError || signal?.aborted
      ? pendingRow(rowBase(item), toolLabel)
      : errorRow(rowBase(item), kit.classifyRowError(err), retryable);

  const rows = await kit.runBoundedBatch<T, RowOutcome<B, V>>(
    [...items],
    async (item, signal) => {
      try {
        const value = await retry(() => {
          throwIfAborted(signal);
          return fetchRow(item, signal);
        });
        const row = { ...rowBase(item), status: 'ok', ...value } as Record<string, unknown>;
        row.status = 'ok';
        return row as RowOutcome<B, V>;
      } catch (err) {
        return toErrorRow(item, err, signal);
      }
    },
    {
      deadlineMs: opts.deadlineMs ?? DEFAULT_ROW_BATCH_DEADLINE_MS,
      concurrency: opts.concurrency ?? DEFAULT_ROW_BATCH_CONCURRENCY,
      onTimeout: (item) => pendingRow(rowBase(item), toolLabel),
      onError: (item, _index, err) => toErrorRow(item, err),
    }
  );
  return rowEnvelope(rows, { resultsKey: opts.resultsKey });
}
