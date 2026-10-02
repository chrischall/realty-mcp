/**
 * `view` parameter + response helpers for a cohort MCP's read tools
 * (fleet-audit#1175).
 *
 * zillow / redfin / homes / compass / onehome each carry a `src/view.ts`
 * (57–81 lines, five different md5s) that is structurally identical:
 * honour `['compact', 'full']`, build `viewParam` with the same note
 * modulo the portal name, and answer compact as
 * `stripMediaUrls(data, { keep, drop })`. The only per-repo content is
 * the portal name and the `keep` / `drop` key lists — which become the
 * options here. Each repo keeps its docblock explaining WHY its keys are
 * kept or dropped; that reasoning is portal-specific and belongs there.
 *
 * Dependency-free: `viewParam` / `resolveView` / `stripMediaUrls` /
 * `minifiedResult` live in `@chrischall/mcp-utils`, which realty-core
 * must not import. Pass the module namespace
 * (`import * as mcpUtils from '@chrischall/mcp-utils'`) as the kit; the
 * returned helpers keep mcp-utils' own return types.
 */

/** The rungs the cohort's read tools honour (no `raw`: records are assembled). */
export const REALTY_VIEWS = ['compact', 'full'] as const;

/** A key matcher, as `stripMediaUrls` takes them. */
export type MediaKeyMatcher = string | RegExp;

/** The mcp-utils functions the helpers call (structural). */
export interface ViewKit<S, R> {
  viewParam(honoured: readonly ['compact', 'full'], opts?: { note?: string }): S;
  resolveView(value: string | undefined, honoured: readonly ['compact', 'full']): string;
  stripMediaUrls<T>(
    value: T,
    opts?: { keep?: readonly MediaKeyMatcher[]; drop?: readonly MediaKeyMatcher[] }
  ): T;
  minifiedResult(data: unknown): R;
}

export interface ViewHelperOptions {
  /** Portal name as it reads in prose, e.g. `'Redfin'`, `'Homes.com'`. */
  portal: string;
  /** Media-looking keys to KEEP on compact (fields this repo constructs). */
  keep?: readonly MediaKeyMatcher[];
  /** Extra keys to DROP on compact (pass-through media the rules miss). */
  drop?: readonly MediaKeyMatcher[];
  /** Override the `view` parameter note (defaults to {@link compactNote}). */
  note?: string;
}

export interface ViewHelpers<S, R> {
  views: typeof REALTY_VIEWS;
  /** The `view` parameter for a read tool's input schema. */
  viewArg(): S;
  /** Answer in the requested rung (compact strips media). Read tools only. */
  viewResponse(view: string | undefined, data: unknown): R;
}

/** The cohort's `view` note, with the portal name filled in. */
export function compactNote(portal: string): string {
  return (
    `compact strips image/avatar URLs from the response; "full" returns ${portal}'s payload untouched. ` +
    `No field projection: this server has no verified record of which ${portal} fields matter, and inventing ` +
    'one would risk dropping a field a caller needs.'
  );
}

/**
 * Build a repo's `viewArg` + `viewResponse`.
 *
 * @example
 * import * as mcpUtils from '@chrischall/mcp-utils';
 * export const { viewArg, viewResponse } = makeViewHelpers(mcpUtils, {
 *   portal: 'Redfin',
 *   keep: ['image_url', 'thumbnail_url'],
 *   drop: ['primary_photo_url'],
 * });
 */
export function makeViewHelpers<S, R>(
  kit: ViewKit<S, R>,
  opts: ViewHelperOptions
): ViewHelpers<S, R> {
  const note = opts.note ?? compactNote(opts.portal);
  const strip: { keep?: readonly MediaKeyMatcher[]; drop?: readonly MediaKeyMatcher[] } = {};
  if (opts.keep) strip.keep = opts.keep;
  if (opts.drop) strip.drop = opts.drop;
  return {
    views: REALTY_VIEWS,
    viewArg: () => kit.viewParam(REALTY_VIEWS, { note }),
    viewResponse: (view, data) => {
      const rung = kit.resolveView(view, REALTY_VIEWS);
      return kit.minifiedResult(rung === 'compact' ? kit.stripMediaUrls(data, strip) : data);
    },
  };
}
