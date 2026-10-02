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
 *  - `"123 Main St, Apt 4, Brooklyn, 11201"`      (unit + state-less ZIP)
 *  - `"123 Main St, Brooklyn, New York 11201"`    (spelled-out state)
 *
 * Parsed from the END: a trailing ZIP, then a state (code, or a spelled-out
 * name when enough parts remain to still hold a city), then the city —
 * either the last part's leading words (`"Brooklyn NY 11201"`) or the
 * part before. Everything left — street plus any unit / suite lines — is
 * the `address` (fleet-audit#659).
 *
 * Returns an empty object for empty / whitespace-only input.
 */

const ZIP_RE = /^\d{5}(?:-\d{4})?$/;
const STATE_RE = /^[A-Za-z]{2}$/;
const COUNTRY_RE = /^(?:USA?|U\.S\.A?\.?|United States(?: of America)?)$/i;

/** Spelled-out state / DC names → USPS codes. */
const STATE_NAMES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI',
  minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT',
  nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC',
  'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR',
  pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT',
  vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY', 'puerto rico': 'PR',
};

function stateName(words: string): string | undefined {
  return STATE_NAMES[words.toLowerCase().replace(/\s+/g, ' ')];
}

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
  if (parts.length === 0) return {};
  // No comma — everything is the street address.
  if (parts.length === 1) return { address: parts[0] };

  const out: ParsedAddress = {};
  const last = () => parts[parts.length - 1]!;

  // 1. A ZIP given as its own trailing part.
  if (ZIP_RE.test(last())) out.zip = parts.pop();

  // 2. A state given as its own part: a 2-letter code, or a spelled-out
  //    name only right before a ZIP and when a city AND a street still
  //    precede it — "123 Main St, New York" and "…, Apt 4, Washington" keep
  //    the name as the city.
  if (parts.length >= 2 && STATE_RE.test(last())) {
    out.state = parts.pop()!.toUpperCase();
  } else if (out.zip !== undefined && parts.length >= 3 && stateName(last())) {
    out.state = stateName(parts.pop()!);
  }

  // 3. "[CITY] [STATE] [ZIP]" inside the last remaining part.
  let city: string | undefined;
  if (parts.length >= 2 && out.state === undefined) {
    const before = { ...out };
    const tail = consumeStateAndZip(last().split(/\s+/), out);
    const foundState = out.state !== undefined;
    const foundZip = out.zip !== undefined && before.zip === undefined;
    if (tail.length === 0 && (foundState || foundZip)) {
      parts.pop(); // the part was only "STATE [ZIP]" / "ZIP"
    } else if (foundState) {
      parts.pop();
      city = tail.join(' '); // "Brooklyn NY 11201"
    } else if (foundZip) {
      parts.pop();
      const words = tail.join(' ');
      const named = parts.length >= 2 ? stateName(words) : undefined;
      if (named) out.state = named; // "…, Brooklyn, New York 11201"
      else city = words; // "…, Apt 4, Brooklyn 11201"
    }
  }

  // 4. Otherwise the city is the last remaining part (when a street precedes it).
  if (city === undefined && parts.length >= 2) city = parts.pop();
  if (city !== undefined) out.city = city;
  out.address = parts.join(', ');
  return out;
}

/**
 * Strip a trailing ZIP and then a trailing two-letter state off `parts`,
 * recording them on `out`. Returns the words left over (the city, when
 * the segment was "CITY STATE ZIP").
 */
function consumeStateAndZip(parts: string[], out: ParsedAddress): string[] {
  const last = parts[parts.length - 1];
  if (last && out.zip === undefined && ZIP_RE.test(last)) {
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
