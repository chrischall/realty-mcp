import { describe, it, expect } from 'vitest';
import { parseAddress } from '../src/parse-address.js';

describe('parseAddress', () => {
  it('splits "address, city state zip"', () => {
    expect(parseAddress('126 Sleeping Bear Ln, Lake Lure NC 28746')).toEqual({
      address: '126 Sleeping Bear Ln',
      city: 'Lake Lure',
      state: 'NC',
      zip: '28746',
    });
  });

  it('handles a Brooklyn-style two-comma split', () => {
    expect(parseAddress('123 Main St, Brooklyn, NY 11201')).toEqual({
      address: '123 Main St',
      city: 'Brooklyn',
      state: 'NY',
      zip: '11201',
    });
  });

  it('handles a zip-only trailer', () => {
    expect(parseAddress('123 Main St, Brooklyn NY')).toEqual({
      address: '123 Main St',
      city: 'Brooklyn',
      state: 'NY',
    });
  });

  it('accepts ZIP+4', () => {
    expect(parseAddress('123 Main St, Brooklyn NY 11201-1234')).toEqual({
      address: '123 Main St',
      city: 'Brooklyn',
      state: 'NY',
      zip: '11201-1234',
    });
  });

  it('returns just an address when there is no comma', () => {
    expect(parseAddress('123 Main St')).toEqual({ address: '123 Main St' });
  });

  it('returns empty object for empty input', () => {
    expect(parseAddress('')).toEqual({});
    expect(parseAddress('   ')).toEqual({});
  });

  // fleet-audit#659: a unit segment must not be taken as the city.
  it('folds a unit segment into the address (four comma parts)', () => {
    expect(parseAddress('123 Main St, Apt 4, Brooklyn, NY 11201')).toEqual({
      address: '123 Main St, Apt 4',
      city: 'Brooklyn',
      state: 'NY',
      zip: '11201',
    });
  });

  it('folds a unit segment when the last part is "CITY STATE ZIP"', () => {
    expect(parseAddress('123 Main St, Apt 4, Brooklyn NY 11201')).toEqual({
      address: '123 Main St, Apt 4',
      city: 'Brooklyn',
      state: 'NY',
      zip: '11201',
    });
  });

  it('takes the city from the last part when it carries no state or ZIP', () => {
    expect(parseAddress('123 Main St, Apt 4, Brooklyn')).toEqual({
      address: '123 Main St, Apt 4',
      city: 'Brooklyn',
    });
  });

  it('reads the ZIP when it is its own trailing segment', () => {
    expect(parseAddress('123 Main St, Apt 4, Brooklyn, NY, 11201')).toEqual({
      address: '123 Main St, Apt 4',
      city: 'Brooklyn',
      state: 'NY',
      zip: '11201',
    });
  });

  it('ignores a trailing country segment', () => {
    expect(parseAddress('123 Main St, Brooklyn, NY 11201, USA')).toEqual({
      address: '123 Main St',
      city: 'Brooklyn',
      state: 'NY',
      zip: '11201',
    });
    expect(
      parseAddress('123 Main St, Unit 2B, Brooklyn, NY 11201, United States')
    ).toEqual({
      address: '123 Main St, Unit 2B',
      city: 'Brooklyn',
      state: 'NY',
      zip: '11201',
    });
  });

  it('keeps the middle segment as the city when the state is spelled out', () => {
    expect(parseAddress('123 Main St, Brooklyn, New York 11201')).toEqual({
      address: '123 Main St',
      city: 'Brooklyn',
      state: 'NY',
      zip: '11201',
    });
    expect(parseAddress('123 Main St, Apt 4, Brooklyn, New York, 11201')).toEqual({
      address: '123 Main St, Apt 4',
      city: 'Brooklyn',
      state: 'NY',
      zip: '11201',
    });
  });

  it('keeps a state-named city when no ZIP marks it as a state', () => {
    expect(parseAddress('123 Main St, Apt 4, Washington')).toEqual({
      address: '123 Main St, Apt 4',
      city: 'Washington',
    });
    expect(parseAddress('123 Main St, Apt 4, Washington, DC 20001')).toEqual({
      address: '123 Main St, Apt 4',
      city: 'Washington',
      state: 'DC',
      zip: '20001',
    });
  });

  it('keeps a state-named city in the one-comma forms', () => {
    expect(parseAddress('123 Main St, New York')).toEqual({
      address: '123 Main St',
      city: 'New York',
    });
    expect(parseAddress('123 Main St, New York 10001')).toEqual({
      address: '123 Main St',
      city: 'New York',
      zip: '10001',
    });
    expect(parseAddress('123 Main St, New York, NY 10001')).toEqual({
      address: '123 Main St',
      city: 'New York',
      state: 'NY',
      zip: '10001',
    });
  });

  // auto-review #81: a unit segment + a state-less trailing ZIP part.
  it.each([
    ['123 Main St, Apt 4, Brooklyn, 11201', { address: '123 Main St, Apt 4', city: 'Brooklyn', zip: '11201' }],
    ['123 Main St, Unit 4, Brooklyn, 11201', { address: '123 Main St, Unit 4', city: 'Brooklyn', zip: '11201' }],
    ['123 Main St, #4, Brooklyn, 11201', { address: '123 Main St, #4', city: 'Brooklyn', zip: '11201' }],
    ['123 Main St, Suite 200, Brooklyn, 11201-1234', { address: '123 Main St, Suite 200', city: 'Brooklyn', zip: '11201-1234' }],
    ['123 Main St, Apt 4, Brooklyn 11201', { address: '123 Main St, Apt 4', city: 'Brooklyn', zip: '11201' }],
    ['123 Main St, Suite 200, Brooklyn NY, 11201', { address: '123 Main St, Suite 200', city: 'Brooklyn', state: 'NY', zip: '11201' }],
    ['123 Main St, #4, Brooklyn, NY', { address: '123 Main St, #4', city: 'Brooklyn', state: 'NY' }],
    ['123 Main St, Unit 4, Brooklyn NY', { address: '123 Main St, Unit 4', city: 'Brooklyn', state: 'NY' }],
    ['123 Main St, Brooklyn, 11201', { address: '123 Main St', city: 'Brooklyn', zip: '11201' }],
    ['123 Main St, 11201', { address: '123 Main St', zip: '11201' }],
    ['123 Main St, NY 11201', { address: '123 Main St', state: 'NY', zip: '11201' }],
  ])('parses %s', (input, expected) => {
    expect(parseAddress(input)).toEqual(expected);
  });
});

