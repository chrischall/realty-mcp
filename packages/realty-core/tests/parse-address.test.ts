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
});
