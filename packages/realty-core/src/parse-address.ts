/**
 * Free-text address splitter — turn a single string like
 * `"123 Main St, Brooklyn NY 11201"` into `{ address, city, state, zip }`.
 *
 * Hoisted from zillow-mcp's `src/tools/address-parse.ts`. Other cohort
 * MCPs each have an ad-hoc inline split; redfin / compass / homes /
 * onehome all reinvent the same regex in slightly different shapes.
 *
 * Accepted shapes (all tested):
 *
 *  - `"123 Main St, Brooklyn NY 11201"`           (one comma)
 *  - `"123 Main St, Brooklyn, NY 11201"`          (two commas)
 *  - `"123 Main St, Brooklyn NY"`                 (no zip)
 *  - `"123 Main St, Brooklyn NY 11201-1234"`      (zip+4)
 *  - `"123 Main St"`                              (no comma)
 *
 * Returns an empty object for empty / whitespace-only input.
 */

const ZIP_RE = /^\d{5}(?:-\d{4})?$/;
const STATE_RE = /^[A-Za-z]{2}$/;

export interface ParsedAddress {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export function parseAddress(freetext: string): ParsedAddress {
  const text = (freetext ?? '').trim();
  if (!text) return {};

  const commaParts = text.split(',').map((s) => s.trim()).filter(Boolean);
  if (commaParts.length === 0) return {};

  // No comma — everything is the street address.
  if (commaParts.length === 1) {
    return { address: commaParts[0] };
  }

  const out: ParsedAddress = {};
  out.address = commaParts[0];

  // Two-comma form: middle = city, last = "STATE [ZIP]".
  // One-comma form: last = "CITY STATE [ZIP]".
  if (commaParts.length >= 3) {
    out.city = commaParts[1];
    const tail = commaParts[2]!.split(/\s+/);
    consumeStateAndZip(tail, out);
  } else {
    const tail = commaParts[1]!.split(/\s+/);
    consumeStateAndZip(tail, out, /* keepCity */ true);
  }

  return out;
}

function consumeStateAndZip(
  parts: string[],
  out: ParsedAddress,
  keepCity = false
): void {
  if (parts.length === 0) return;

  // Trailing zip?
  const last = parts[parts.length - 1];
  if (last && ZIP_RE.test(last)) {
    out.zip = last;
    parts = parts.slice(0, -1);
  }

  if (parts.length === 0) return;

  // Trailing state?
  const stateCandidate = parts[parts.length - 1];
  if (stateCandidate && STATE_RE.test(stateCandidate)) {
    out.state = stateCandidate.toUpperCase();
    parts = parts.slice(0, -1);
  }

  if (keepCity && parts.length > 0) {
    out.city = parts.join(' ');
  }
}
