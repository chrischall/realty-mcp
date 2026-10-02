import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import * as mcpUtils from '@chrischall/mcp-utils';
import { makeViewHelpers, compactNote } from '../src/view.js';

const data = {
  address: '1 Main St',
  primary_photo_url: 'https://cdn.example/x.jpg',
  image_url: 'https://cdn.example/y.jpg',
  photos: ['https://cdn.example/z.jpg'],
  floorplan_urls: ['https://cdn.example/f.jpg'], // array under a non-media key: only `drop` reaches it
};

function body(res: { content: Array<{ type: string; text?: string }> }): unknown {
  return JSON.parse(res.content[0]!.text!);
}

describe('makeViewHelpers', () => {
  it('honours compact + full and builds the portal-named note', () => {
    const v = makeViewHelpers(mcpUtils, { portal: 'Redfin' });
    expect(v.views).toEqual(['compact', 'full']);
    const schema = z.object({ view: v.viewArg() });
    expect(schema.parse({}).view).toBeUndefined();
    expect(schema.parse({ view: 'full' }).view).toBe('full');
    expect(() => schema.parse({ view: 'raw' })).toThrow();
    expect(JSON.stringify(z.toJSONSchema(schema))).toContain(
      JSON.stringify(compactNote('Redfin')).slice(1, -1)
    );
  });

  it('compact strips media, honouring keep and drop; full is untouched', () => {
    const v = makeViewHelpers(mcpUtils, {
      portal: 'Redfin',
      keep: ['image_url'],
      drop: ['primary_photo_url', 'floorplan_urls'],
    });
    expect(body(v.viewResponse(undefined, data))).toEqual({
      address: '1 Main St',
      image_url: 'https://cdn.example/y.jpg',
    });
    expect(body(v.viewResponse('compact', data))).toEqual(body(v.viewResponse(undefined, data)));
    expect(body(v.viewResponse('full', data))).toEqual(data);
  });

  it('without keep / drop, compact is exactly the bare stripMediaUrls (onehome)', () => {
    const v = makeViewHelpers(mcpUtils, { portal: 'OneHome' });
    const compact = body(v.viewResponse(undefined, data)) as Record<string, unknown>;
    expect(compact).toEqual(JSON.parse(JSON.stringify(mcpUtils.stripMediaUrls(data))));
    expect(compact).not.toHaveProperty('image_url');
    expect(compact).toHaveProperty('floorplan_urls');
  });

  it('an unknown rung fails toward compact (resolveView semantics)', () => {
    const v = makeViewHelpers(mcpUtils, { portal: 'Zillow' });
    expect(body(v.viewResponse('raw', data))).toEqual(body(v.viewResponse('compact', data)));
  });

  it('compactNote is the cohort text with the portal name', () => {
    expect(compactNote("Homes.com")).toBe(
      'compact strips image/avatar URLs from the response; "full" returns Homes.com\'s payload untouched. ' +
        'No field projection: this server has no verified record of which Homes.com fields matter, and inventing ' +
        'one would risk dropping a field a caller needs.'
    );
  });

  it('a custom note overrides the template', () => {
    const v = makeViewHelpers(mcpUtils, { portal: 'X', note: 'custom' });
    const json = JSON.stringify(z.toJSONSchema(z.object({ view: v.viewArg() })));
    expect(json).toContain('custom');
    expect(json).not.toContain('payload untouched');
  });
});
