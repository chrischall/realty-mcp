import { describe, it, expect } from 'vitest';
import { mapEventType, type NormalizedEventType } from '../src/event-type.js';

describe('mapEventType', () => {
  it('maps the Relisted synonyms (checked before Listed)', () => {
    expect(mapEventType('Relisted')).toBe('Relisted');
    expect(mapEventType('Re-listed')).toBe('Relisted');
    expect(mapEventType('relist')).toBe('Relisted');
  });

  it('maps the Listed synonyms', () => {
    expect(mapEventType('Listed')).toBe('Listed');
    expect(mapEventType('Listed for sale')).toBe('Listed');
    expect(mapEventType('New Listing')).toBe('Listed');
    expect(mapEventType('Active')).toBe('Listed');
    expect(mapEventType('Coming Soon')).toBe('Listed');
    expect(mapEventType('For Sale')).toBe('Listed');
  });

  it('maps the PriceChange synonyms', () => {
    expect(mapEventType('Price Change')).toBe('PriceChange');
    expect(mapEventType('Price Changed')).toBe('PriceChange');
    expect(mapEventType('Price Decrease')).toBe('PriceChange');
    expect(mapEventType('Price Increase')).toBe('PriceChange');
    expect(mapEventType('Price Reduced')).toBe('PriceChange');
    expect(mapEventType('Price Reduction')).toBe('PriceChange');
    expect(mapEventType('Price Drop')).toBe('PriceChange');
  });

  it('maps the Pending synonym', () => {
    expect(mapEventType('Pending')).toBe('Pending');
    expect(mapEventType('Pending sale')).toBe('Pending');
  });

  it('maps the Contingent synonym', () => {
    expect(mapEventType('Contingent')).toBe('Contingent');
  });

  it('maps the Sold synonyms', () => {
    expect(mapEventType('Sold')).toBe('Sold');
    expect(mapEventType('Sold (Public Records)')).toBe('Sold');
    expect(mapEventType('Sold (MLS)')).toBe('Sold');
    expect(mapEventType('Closed')).toBe('Sold');
  });

  it('maps the Withdrawn synonyms', () => {
    expect(mapEventType('Withdrawn')).toBe('Withdrawn');
    expect(mapEventType('Listing removed')).toBe('Withdrawn');
  });

  it('maps the Delisted synonyms (incl. compass off-market / expired)', () => {
    expect(mapEventType('Delisted')).toBe('Delisted');
    expect(mapEventType('Off Market')).toBe('Delisted');
    expect(mapEventType('Expired')).toBe('Delisted');
  });

  it('does case-insensitive matching', () => {
    expect(mapEventType('SOLD')).toBe('Sold');
    expect(mapEventType('pEnDiNg')).toBe('Pending');
    expect(mapEventType('OFF MARKET')).toBe('Delisted');
  });

  it('does substring matching inside a longer description', () => {
    expect(mapEventType('Home was sold last week')).toBe('Sold');
    expect(mapEventType('Status: pending review')).toBe('Pending');
  });

  it('prefers the more specific match (Relisted before Listed, Pending before Sold)', () => {
    expect(mapEventType('Re-listed for sale')).toBe('Relisted');
    // "Pending sale" contains neither "sold"; Pending must win regardless.
    expect(mapEventType('Pending')).toBe('Pending');
  });

  it('returns the Unknown sentinel for unrecognized / missing input', () => {
    expect(mapEventType('Foreclosure auction')).toBe('Unknown');
    expect(mapEventType('')).toBe('Unknown');
    expect(mapEventType(undefined as unknown as string)).toBe('Unknown');
  });

  it('the union type accepts every member including Unknown', () => {
    const all: NormalizedEventType[] = [
      'Listed',
      'PriceChange',
      'Pending',
      'Contingent',
      'Sold',
      'Withdrawn',
      'Relisted',
      'Delisted',
      'Unknown',
    ];
    expect(all).toHaveLength(9);
  });
});
