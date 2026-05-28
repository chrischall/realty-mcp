import { describe, it, expect } from 'vitest';
import { locationToSlug } from '../src/location-slug.js';

describe('locationToSlug', () => {
  it('slugifies a "City, ST" string', () => {
    expect(locationToSlug('Brooklyn, NY')).toBe('brooklyn-ny');
    expect(locationToSlug('New York, NY')).toBe('new-york-ny');
    expect(locationToSlug('Lake Lure, NC')).toBe('lake-lure-nc');
  });

  it('passes a bare ZIP through unchanged', () => {
    expect(locationToSlug('94110')).toBe('94110');
  });

  it('lowercases and collapses spaces in a neighborhood', () => {
    expect(locationToSlug('Park Slope')).toBe('park-slope');
  });

  it('strips diacritics via NFKD normalization', () => {
    expect(locationToSlug('Cañon City, CO')).toBe('canon-city-co');
    expect(locationToSlug('Coeur d’Alene, ID')).toBe('coeur-d-alene-id');
  });

  it('collapses runs of punctuation/whitespace to a single dash', () => {
    expect(locationToSlug('San   Francisco,,  CA')).toBe('san-francisco-ca');
  });

  it('trims leading and trailing dashes', () => {
    expect(locationToSlug('  -- Asheville, NC -- ')).toBe('asheville-nc');
  });

  it('returns an empty string for all-punctuation input', () => {
    expect(locationToSlug('---')).toBe('');
    expect(locationToSlug('')).toBe('');
  });
});
