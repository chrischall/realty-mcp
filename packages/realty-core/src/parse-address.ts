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
 *  - `"123 Main St, Apt 4, Brooklyn, NY 11201"`   (unit segment)
 *  - `"123 Main St, Brooklyn, NY, 11201"`         (ZIP as its own part)
 *  - `"123 Main St, Brooklyn, NY 11201, USA"`     (country trailer)
 *
 * With three or more parts, state / ZIP come from the LAST part and the
 * city from the part before it (or from the last part's leading words, as
 * in `"Brooklyn NY 11201"`). Any segments in between — unit / suite
 * lines — are folded into `address` (fleet-audit#659).
 *
 * Returns an empty object for empty / whitespace-only input.
 */

const ZIP_RE = /^\d{5}(?:-\d{4})?$/;
const STATE_RE = /^[A-Za-z]{2}$/;
const COUNTRY_RE = /^(?:USA?|U\.S\.A?\.?|United States(?: of America)?)$/i;

export interface ParsedAddress {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export function parseAddress(freetext: string): ParsedAddress {
  const text = (freetext ?? '').trim();
  if (!text) return {};

  const parts = text.split(',').map((s) => s.trim()).filter(Boolean);
  // A trailing country segment carries no locality.
  if (parts.length > 1 && COUNTRY_RE.test(parts[parts.length - 1]!)) parts.pop();
  // "…, NY, 11201": rejoin a bare trailing ZIP onto the state before it.
  if (parts.length >= 3 && ZIP_RE.test(parts[parts.length - 1]!)) {
    const zip = parts.pop()!;
    parts[parts.length - 1] = `${parts[parts.length - 1]} ${zip}`;
  }
  if (parts.length === 0) return {};

  // No comma — everything is the street address.
  if (parts.length === 1) {
    return { address: parts[0] };
  }

  const out: ParsedAddress = {};
  const tail = consumeStateAndZip(parts[parts.length - 1]!.split(/\s+/), out);

  // One-comma form: "ADDRESS, CITY STATE [ZIP]".
  if (parts.length === 2) {
    out.address = parts[0];
    if (tail.length > 0) out.city = tail.join(' ');
    return out;
  }

  // Three or more parts. The last part's leftover words are the city when
  // it is "CITY STATE [ZIP]", or the whole last part is the city when it
  // carries no state / ZIP at all. Otherwise (a bare "STATE [ZIP]", or a
  // spelled-out state we can't read) the city is the part before it.
  const cityInLast =
    tail.length > 0 && (out.state !== undefined || out.zip === undefined);
  const cityIdx = cityInLast ? parts.length - 1 : parts.length - 2;
  if (cityInLast) out.city = tail.join(' ');
  else out.city = parts[cityIdx];
  out.address = parts.slice(0, cityIdx).join(', ');
  return out;
}

/**
 * Strip a trailing ZIP and then a trailing two-letter state off `parts`,
 * recording them on `out`. Returns the words left over (the city, when
 * the segment was "CITY STATE ZIP").
 */
function consumeStateAndZip(parts: string[], out: ParsedAddress): string[] {
  const last = parts[parts.length - 1];
  if (last && ZIP_RE.test(last)) {
    out.zip = last;
    parts = parts.slice(0, -1);
  }

  const stateCandidate = parts[parts.length - 1];
  if (stateCandidate && STATE_RE.test(stateCandidate)) {
    out.state = stateCandidate.toUpperCase();
    parts = parts.slice(0, -1);
  }

  return parts;
}
