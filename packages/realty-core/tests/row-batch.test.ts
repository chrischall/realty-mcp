import { describe, it, expect, vi } from 'vitest';
import { runBoundedBatch } from '@chrischall/mcp-utils';
import {
  classifyRowError,
  retryOnceOnTimeout,
  FetchproxyTimeoutError,
  FetchproxyBridgeDownError,
} from '@chrischall/mcp-utils/fetchproxy';
import {
  runRowBatch,
  rowEnvelope,
  errorRow,
  pendingRow,
  pendingRowMessage,
  isRetryableRowKind,
  throwIfAborted,
  RowAbandonedError,
  guardMethods,
  DEFAULT_ROW_BATCH_DEADLINE_MS,
  DEFAULT_ROW_BATCH_CONCURRENCY,
  type RowBatchKit,
} from '../src/row-batch.js';

/**
 * The real mcp-utils primitives — realty-core never imports them, the
 * consumer injects them, so the tests inject the same ones a consumer
 * would.
 */
const kit: RowBatchKit = { runBoundedBatch, classifyRowError, retryOnceOnTimeout };

function timeoutError(): Error {
  return Object.assign(Object.create(FetchproxyTimeoutError.prototype) as Error, {
    message: 'tab stalled',
    name: 'FetchproxyTimeoutError',
    retrySafe: true,
  });
}

function bridgeDownError(): Error {
  return Object.assign(Object.create(FetchproxyBridgeDownError.prototype) as Error, {
    message: 'no extension',
    name: 'FetchproxyBridgeDownError',
  });
}

const never = () => new Promise<never>(() => {});

describe('defaults', () => {
  it('pins the cohort convention: 45s deadline, 6 in flight', () => {
    expect(DEFAULT_ROW_BATCH_DEADLINE_MS).toBe(45_000);
    expect(DEFAULT_ROW_BATCH_CONCURRENCY).toBe(6);
  });
});

describe('isRetryableRowKind', () => {
  it.each(['timeout', 'bridge_down', 'pending', 'bot_challenge'])('%s is retryable', (k) => {
    expect(isRetryableRowKind(k)).toBe(true);
  });
  it.each(['protocol', 'other', 'ok'])('%s is not', (k) => {
    expect(isRetryableRowKind(k)).toBe(false);
  });
  it('honours a caller-supplied set', () => {
    expect(isRetryableRowKind('auth_required', new Set(['auth_required']))).toBe(true);
    expect(isRetryableRowKind('timeout', new Set(['auth_required']))).toBe(false);
  });
});

describe('row builders', () => {
  it('errorRow carries status + error_kind + retryable + error after the base fields', () => {
    expect(errorRow({ zpid: '7' }, { kind: 'timeout', message: 'm' })).toEqual({
      zpid: '7',
      status: 'timeout',
      error_kind: 'timeout',
      retryable: true,
      error: 'm',
    });
    expect(errorRow({}, { kind: 'other', message: 'x' }).retryable).toBe(false);
  });

  it('pendingRow is retryable and says it is NOT a miss', () => {
    const r = pendingRow({ url: 'u' }, 'redfin_bulk_get');
    expect(r).toMatchObject({ url: 'u', status: 'pending', error_kind: 'pending', retryable: true });
    expect(r.error).toBe(pendingRowMessage('redfin_bulk_get'));
    expect(r.error).toMatch(/^redfin_bulk_get overall deadline reached/);
    expect(r.error).toMatch(/NOT a missing listing/);
  });
});

describe('rowEnvelope', () => {
  it('counts ok / errored and omits zero pending / blocked', () => {
    const rows = [{ status: 'ok' }, { status: 'other' }];
    expect(rowEnvelope(rows)).toEqual({ count: 2, ok: 1, errored: 1, results: rows });
  });

  it('adds pending and blocked counts when non-zero, and honours resultsKey', () => {
    const rows = [{ status: 'ok' }, { status: 'pending' }, { status: 'bot_challenge' }];
    expect(rowEnvelope(rows, { resultsKey: 'rows' })).toEqual({
      count: 3,
      ok: 1,
      errored: 2,
      pending: 1,
      blocked: 1,
      rows,
    });
  });
});

describe('throwIfAborted / guardMethods', () => {
  it('throwIfAborted throws RowAbandonedError only once aborted', () => {
    const c = new AbortController();
    expect(() => throwIfAborted(c.signal)).not.toThrow();
    expect(() => throwIfAborted(undefined)).not.toThrow();
    c.abort();
    expect(() => throwIfAborted(c.signal)).toThrow(RowAbandonedError);
  });

  it('guardMethods refuses guarded calls after abort, leaves others alone', async () => {
    const client = {
      n: 0,
      async fetchHtml(p: string) {
        this.n += 1;
        return `html:${p}`;
      },
      label() {
        return `n=${this.n}`;
      },
    };
    const c = new AbortController();
    const g = guardMethods(client, c.signal, ['fetchHtml']);
    expect(await g.fetchHtml('/a')).toBe('html:/a');
    c.abort();
    await expect(g.fetchHtml('/b')).rejects.toBeInstanceOf(RowAbandonedError);
    expect(client.n).toBe(1);
    expect(g.label()).toBe('n=1');
    expect(guardMethods(client, undefined, ['fetchHtml'])).toBe(client);
  });
});

describe('runRowBatch', () => {
  it('returns input-ordered ok rows merged over the base, with the envelope', async () => {
    const env = await runRowBatch(
      [3, 1, 2],
      async (n) => {
        await new Promise((r) => setTimeout(r, n));
        return { id: String(n), property: { price: n * 100 } };
      },
      { kit, toolLabel: 't', rowBase: (n) => ({ id: `in-${n}` }) }
    );
    expect(env).toEqual({
      count: 3,
      ok: 3,
      errored: 0,
      results: [
        { id: '3', status: 'ok', property: { price: 300 } },
        { id: '1', status: 'ok', property: { price: 100 } },
        { id: '2', status: 'ok', property: { price: 200 } },
      ],
    });
  });

  it('forces status "ok" even if the worker value carries its own status', async () => {
    const env = await runRowBatch([1], async () => ({ status: 'weird' }), {
      kit,
      toolLabel: 't',
      rowBase: () => ({}),
    });
    expect(env.results[0]!.status).toBe('ok');
  });

  it('retries a bridge timeout once, then succeeds', async () => {
    let calls = 0;
    const env = await runRowBatch(
      ['a'],
      async () => {
        calls += 1;
        if (calls === 1) throw timeoutError();
        return { v: 1 };
      },
      { kit, toolLabel: 't', rowBase: (s) => ({ key: s }) }
    );
    expect(calls).toBe(2);
    expect(env.results[0]).toEqual({ key: 'a', status: 'ok', v: 1 });
  });

  it('classifies a failure that survives the retry as a retryable timeout row', async () => {
    const env = await runRowBatch(
      ['a', 'b'],
      async (s) => {
        if (s === 'a') throw timeoutError();
        throw new Error('no listing found');
      },
      { kit, toolLabel: 't', rowBase: (s) => ({ key: s }) }
    );
    expect(env.results[0]).toEqual({
      key: 'a',
      status: 'timeout',
      error_kind: 'timeout',
      retryable: true,
      error: 'bridge timeout after retry: tab stalled',
    });
    expect(env.results[1]).toEqual({
      key: 'b',
      status: 'other',
      error_kind: 'other',
      retryable: false,
      error: 'no listing found',
    });
    expect(env).toMatchObject({ count: 2, ok: 0, errored: 2 });
  });

  it('bridge_down is retryable but NOT retried in-row', async () => {
    let calls = 0;
    const env = await runRowBatch(
      ['a'],
      async () => {
        calls += 1;
        throw bridgeDownError();
      },
      { kit, toolLabel: 't', rowBase: () => ({}) }
    );
    expect(calls).toBe(1);
    expect(env.results[0]).toMatchObject({ status: 'bridge_down', retryable: true });
  });

  it('works without an injected retry (no in-row retry)', async () => {
    let calls = 0;
    const env = await runRowBatch(
      ['a'],
      async () => {
        calls += 1;
        throw timeoutError();
      },
      {
        kit: { runBoundedBatch, classifyRowError },
        toolLabel: 't',
        rowBase: () => ({}),
      }
    );
    expect(calls).toBe(1);
    expect(env.results[0]!.status).toBe('timeout');
  });

  it('a hung row becomes a retryable pending row at the deadline; settled rows survive', async () => {
    const env = await runRowBatch(
      ['fast', 'hung'],
      async (s) => {
        if (s === 'hung') return never();
        return { v: s };
      },
      { kit, toolLabel: 'x_bulk_get', rowBase: (s) => ({ key: s }), deadlineMs: 30 }
    );
    expect(env.results[0]).toEqual({ key: 'fast', status: 'ok', v: 'fast' });
    expect(env.results[1]).toEqual({
      key: 'hung',
      status: 'pending',
      error_kind: 'pending',
      retryable: true,
      error: pendingRowMessage('x_bulk_get'),
    });
    expect(env).toMatchObject({ count: 2, ok: 1, errored: 1, pending: 1 });
  });

  it('never starts — or retries — a fetch for a row abandoned by the deadline (strictest abort guard)', async () => {
    // Row "slow" times out on its first attempt only AFTER the deadline
    // fired. retryOnceOnTimeout would normally re-dial; the guard inside
    // the retry closure must stop it. Concurrency 1 also leaves "queued"
    // undispatched behind it.
    const dialled: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const promise = runRowBatch(
      ['slow', 'queued'],
      async (s) => {
        dialled.push(s);
        if (s === 'slow') {
          await gate;
          throw timeoutError();
        }
        return { v: s };
      },
      { kit, toolLabel: 't', rowBase: (s) => ({ key: s }), deadlineMs: 20, concurrency: 1 }
    );
    const env = await promise;
    expect(env.results.map((r) => r.status)).toEqual(['pending', 'pending']);
    release();
    await new Promise((r) => setTimeout(r, 20));
    expect(dialled).toEqual(['slow']);
  });

  it('passes the batch signal to the worker so it can guard its own client', async () => {
    const seen: Array<AbortSignal | undefined> = [];
    await runRowBatch(
      [1],
      async (_n, signal) => {
        seen.push(signal);
        return {};
      },
      { kit, toolLabel: 't', rowBase: () => ({}) }
    );
    expect(seen[0]).toBeInstanceOf(AbortSignal);
  });

  it('a worker that throws RowAbandonedError is reported pending, never classified', async () => {
    const classify = vi.fn(classifyRowError);
    const env = await runRowBatch(
      ['a'],
      async () => {
        throw new RowAbandonedError();
      },
      {
        kit: { runBoundedBatch, classifyRowError: classify },
        toolLabel: 't',
        rowBase: () => ({}),
      }
    );
    expect(env.results[0]!.status).toBe('pending');
    expect(classify).not.toHaveBeenCalled();
  });

  it('counts bot_challenge rows as blocked and honours retryableKinds / resultsKey', async () => {
    const env = await runRowBatch(
      ['a', 'b'],
      async (s) => {
        throw Object.assign(new Error(`walled ${s}`), { wall: true });
      },
      {
        kit: {
          runBoundedBatch,
          classifyRowError: (e) =>
            (e as { wall?: boolean }).wall
              ? { kind: 'bot_challenge', message: (e as Error).message }
              : classifyRowError(e),
        },
        toolLabel: 't',
        rowBase: (s) => ({ zpid: s }),
        resultsKey: 'rows',
        retryableKinds: new Set(['timeout']),
      }
    );
    expect(env).toMatchObject({ count: 2, ok: 0, errored: 2, blocked: 2 });
    expect(env.rows).toHaveLength(2);
    expect(env.rows![0]).toMatchObject({ zpid: 'a', status: 'bot_challenge', retryable: false });
  });

  it('caps in-flight workers at the requested concurrency', async () => {
    let inFlight = 0;
    let peak = 0;
    await runRowBatch(
      Array.from({ length: 20 }, (_, i) => i),
      async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 2));
        inFlight -= 1;
        return {};
      },
      { kit, toolLabel: 't', rowBase: () => ({}) }
    );
    expect(peak).toBe(DEFAULT_ROW_BATCH_CONCURRENCY);
  });

  it('an empty batch is an empty envelope', async () => {
    expect(
      await runRowBatch([], async () => ({}), { kit, toolLabel: 't', rowBase: () => ({}) })
    ).toEqual({ count: 0, ok: 0, errored: 0, results: [] });
  });
});
