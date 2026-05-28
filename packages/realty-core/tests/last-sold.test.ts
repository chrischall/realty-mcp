import { describe, it, expect } from 'vitest';
import { lastSold } from '../src/last-sold.js';

// Redfin-style raw event: epoch-ms `eventDate` + free-text `eventDescription`.
interface RedfinEvent {
  eventDate?: number;
  eventDescription?: string;
  price?: number;
}
const redfinGet = {
  date: (e: RedfinEvent) => e.eventDate,
  price: (e: RedfinEvent) => e.price,
  type: (e: RedfinEvent) => e.eventDescription,
};

// Zillow-style raw event: ISO `date` + `event`.
interface ZillowEvent {
  date?: string;
  event?: string;
  price?: number;
}
const zillowGet = {
  date: (e: ZillowEvent) => e.date,
  price: (e: ZillowEvent) => e.price,
  type: (e: ZillowEvent) => e.event,
};

describe('lastSold', () => {
  it('returns null for an empty event list', () => {
    expect(lastSold([], redfinGet)).toBeNull();
  });

  it('returns null when no event maps to Sold', () => {
    const events: ZillowEvent[] = [
      { date: '2023-01-01', event: 'Listed', price: 500_000 },
      { date: '2023-02-01', event: 'Price Reduced', price: 480_000 },
      { date: '2023-03-01', event: 'Pending', price: 480_000 },
    ];
    expect(lastSold(events, zillowGet)).toBeNull();
  });

  it('identifies sold events via mapEventType, not raw string equality', () => {
    // "Sold (Public Records)" is not literally "Sold" but mapEventType -> Sold.
    const events: RedfinEvent[] = [
      {
        eventDate: Date.parse('2020-06-15'),
        eventDescription: 'Sold (Public Records)',
        price: 410_000,
      },
    ];
    const result = lastSold(events, redfinGet);
    expect(result).not.toBeNull();
    expect(result?.price).toBe(410_000);
  });

  it('picks the most-recent sold event by date (zillow-style ISO strings)', () => {
    const events: ZillowEvent[] = [
      { date: '2015-04-01', event: 'Sold', price: 300_000 },
      { date: '2021-09-12', event: 'Sold', price: 525_000 },
      { date: '2018-07-03', event: 'Sold', price: 410_000 },
      { date: '2022-01-01', event: 'Listed', price: 600_000 },
    ];
    const result = lastSold(events, zillowGet);
    expect(result?.price).toBe(525_000);
    expect(result?.date).toBe('2021-09-12');
  });

  it('picks the most-recent sold event by date (redfin-style epoch ms)', () => {
    const events: RedfinEvent[] = [
      {
        eventDate: Date.parse('2015-04-01'),
        eventDescription: 'Sold (MLS)',
        price: 300_000,
      },
      {
        eventDate: Date.parse('2021-09-12'),
        eventDescription: 'Sold',
        price: 525_000,
      },
      {
        eventDate: Date.parse('2018-07-03'),
        eventDescription: 'Sold (Public Records)',
        price: 410_000,
      },
    ];
    const result = lastSold(events, redfinGet);
    expect(result?.price).toBe(525_000);
    expect(result?.date).toBe(Date.parse('2021-09-12'));
  });

  it('echoes back the same date type the accessor returns (string in, string out)', () => {
    const events: ZillowEvent[] = [
      { date: '2021-09-12', event: 'Sold', price: 525_000 },
    ];
    const result = lastSold(events, zillowGet);
    expect(typeof result?.date).toBe('string');
    expect(result?.date).toBe('2021-09-12');
  });

  it('echoes back a numeric date when the accessor returns a number', () => {
    const ts = Date.parse('2021-09-12');
    const events: RedfinEvent[] = [
      { eventDate: ts, eventDescription: 'Sold', price: 525_000 },
    ];
    const result = lastSold(events, redfinGet);
    expect(typeof result?.date).toBe('number');
    expect(result?.date).toBe(ts);
  });

  it('returns price null when the sold event has no numeric price', () => {
    const events: ZillowEvent[] = [{ date: '2021-09-12', event: 'Sold' }];
    const result = lastSold(events, zillowGet);
    expect(result).not.toBeNull();
    expect(result?.price).toBeNull();
  });

  it('ignores sold events with no usable date', () => {
    const events: ZillowEvent[] = [
      { date: undefined, event: 'Sold', price: 999_999 },
      { date: '2019-01-01', event: 'Sold', price: 350_000 },
    ];
    const result = lastSold(events, zillowGet);
    expect(result?.price).toBe(350_000);
    expect(result?.date).toBe('2019-01-01');
  });
});
