import { beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { M32, type Inventory } from '@stagepatch/core';
import type { ExtractionOutcome } from '@stagepatch/ingest';
import { buildApp } from '../src/app.js';

const inventory: Inventory = {
  console: M32,
  stageBoxes: [{ name: 'DL32', inputs: 32, outputs: 16, aesPort: 'A', aesOffset: 0 }],
  multicores: [
    { name: 'Multi Drums', inputs: 12, outputs: 4 },
    { name: 'Multi Front L', inputs: 8, outputs: 4 },
  ],
};

/** A stand-in extractor, so the API is exercised without calling a model. */
function fakeExtract(bandId: string, labels: string[]): ExtractionOutcome {
  return {
    bandId,
    bandName: bandId,
    requests: labels.map((label, i) => ({
      id: `${bandId}-${i + 1}`,
      bandId,
      label,
      instrument: label === 'Kick' ? ('kick' as const) : ('keys' as const),
      sourceType: 'di' as const,
      phantom: false,
      stageZone: label === 'Kick' ? ('drums' as const) : ('front-left' as const),
      shareable: label === 'Kick',
    })),
    monitorsByZone: { drums: 1 },
    warnings: [`${bandId} rider is missing a stage plot`],
  };
}

let app: FastifyInstance;
let extractResult: ExtractionOutcome;
let extractError: Error | undefined;

beforeEach(async () => {
  extractError = undefined;
  extractResult = fakeExtract('mozaika', ['Kick', 'Keys L']);
  app = buildApp({
    extract: async () => {
      if (extractError) throw extractError;
      return extractResult;
    },
  });
  await app.ready();
});

async function newEvent() {
  const res = await app.inject({
    method: 'POST',
    url: '/api/events',
    payload: { event: { name: 'Safed Day 3', date: '2026-08-20', venue: 'Ashtam' }, inventory },
  });
  return res.json() as { id: string };
}

function riderForm(bandName: string) {
  const boundary = '----test';
  const body =
    `--${boundary}\r\nContent-Disposition: form-data; name="bandName"\r\n\r\n${bandName}\r\n` +
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="rider.pdf"\r\n` +
    `Content-Type: application/pdf\r\n\r\n%PDF-1.4 fake\r\n--${boundary}--\r\n`;
  return { body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

describe('events', () => {
  it('rejects an event with no name', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/events', payload: { event: {} } });
    expect(res.statusCode).toBe(400);
  });

  it('creates an event and reads it back', async () => {
    const { id } = await newEvent();
    const res = await app.inject({ method: 'GET', url: `/api/events/${id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().event.name).toBe('Safed Day 3');
  });

  it('answers 404 for an event that does not exist', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/events/nope' });
    expect(res.statusCode).toBe(404);
  });

  it('starts a new event with a usable console even with no gear entered', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/events', payload: { event: { name: 'Bare', date: '', venue: '' } },
    });
    expect(res.json().inventory.console.model).toBe('M32');
  });
});

describe('rider upload', () => {
  it('extracts a rider and plans in one call', async () => {
    const { id } = await newEvent();
    const form = riderForm('Mozaika');
    const res = await app.inject({
      method: 'POST', url: `/api/events/${id}/riders`, ...form,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.extracted).toBe(2);
    expect(body.plan.channels).toHaveLength(2);
    expect(body.plan.channels[0].name).toBe('Kick');
  });

  it('rejects an upload with no file attached', async () => {
    const { id } = await newEvent();
    const boundary = '----t';
    const res = await app.inject({
      method: 'POST',
      url: `/api/events/${id}/riders`,
      body: `--${boundary}\r\nContent-Disposition: form-data; name="bandName"\r\n\r\nX\r\n--${boundary}--\r\n`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('reports an extraction failure without destroying the event', async () => {
    const { id } = await newEvent();
    extractError = new Error('model unavailable');

    const res = await app.inject({ method: 'POST', url: `/api/events/${id}/riders`, ...riderForm('Mozaika') });
    expect(res.statusCode).toBe(502);
    expect(res.json().detail).toContain('model unavailable');

    const after = await app.inject({ method: 'GET', url: `/api/events/${id}` });
    expect(after.statusCode).toBe(200);
    expect(after.json().bands).toHaveLength(0);
  });

  it('keeps extraction warnings rather than dropping them', async () => {
    const { id } = await newEvent();
    await app.inject({ method: 'POST', url: `/api/events/${id}/riders`, ...riderForm('Mozaika') });
    const record = (await app.inject({ method: 'GET', url: `/api/events/${id}` })).json();
    expect(record.warnings[0].message).toContain('missing a stage plot');
  });

  it('merges a second band into the same plan', async () => {
    const { id } = await newEvent();
    await app.inject({ method: 'POST', url: `/api/events/${id}/riders`, ...riderForm('Mozaika') });

    extractResult = fakeExtract('musa', ['Kick', 'Keys L']);
    const res = await app.inject({ method: 'POST', url: `/api/events/${id}/riders`, ...riderForm('Musa') });

    // The shared kick collapses; the two bands' keys stay separate.
    expect(res.json().plan.channels).toHaveLength(3);
    const kick = res.json().plan.channels.find((c: { name: string }) => c.name === 'Kick');
    expect(kick.bandIds).toHaveLength(2);
  });

  it('replaces a band rather than duplicating it when its rider is re-uploaded', async () => {
    const { id } = await newEvent();
    await app.inject({ method: 'POST', url: `/api/events/${id}/riders`, ...riderForm('Mozaika') });

    extractResult = fakeExtract('mozaika', ['Kick', 'Keys L', 'Keys R']);
    const res = await app.inject({ method: 'POST', url: `/api/events/${id}/riders`, ...riderForm('Mozaika') });

    const record = (await app.inject({ method: 'GET', url: `/api/events/${id}` })).json();
    expect(record.bands).toHaveLength(1);
    expect(res.json().plan.channels).toHaveLength(3);
  });
});

describe('plan edits', () => {
  it('stores the technician\'s edits as given', async () => {
    const { id } = await newEvent();
    const upload = await app.inject({ method: 'POST', url: `/api/events/${id}/riders`, ...riderForm('Mozaika') });
    const plan = upload.json().plan;
    plan.channels[0].name = 'Kick In';

    await app.inject({ method: 'PUT', url: `/api/events/${id}/plan`, payload: plan });

    const record = (await app.inject({ method: 'GET', url: `/api/events/${id}` })).json();
    expect(record.plan.channels[0].name).toBe('Kick In');
  });

  it('re-plans from the requests, discarding edits when asked to', async () => {
    const { id } = await newEvent();
    const upload = await app.inject({ method: 'POST', url: `/api/events/${id}/riders`, ...riderForm('Mozaika') });
    const plan = upload.json().plan;
    plan.channels[0].name = 'Kick In';
    await app.inject({ method: 'PUT', url: `/api/events/${id}/plan`, payload: plan });

    const replanned = await app.inject({ method: 'POST', url: `/api/events/${id}/plan` });
    expect(replanned.json().channels[0].name).toBe('Kick');
  });

  it('re-plans when the inventory changes', async () => {
    const { id } = await newEvent();
    await app.inject({ method: 'POST', url: `/api/events/${id}/riders`, ...riderForm('Mozaika') });

    const res = await app.inject({
      method: 'PUT',
      url: `/api/events/${id}/inventory`,
      payload: { inventory: { console: M32, stageBoxes: [], multicores: [] } },
    });

    // With no stage box the console's own inputs are used instead.
    expect(res.json().channels[0].input.device).toBe('local');
  });
});

describe('export', () => {
  it('refuses to export a scene before there is a plan', async () => {
    const { id } = await newEvent();
    const res = await app.inject({ method: 'GET', url: `/api/events/${id}/export/scene` });
    expect(res.statusCode).toBe(409);
  });

  it('serves the scene as a downloadable .scn file', async () => {
    const { id } = await newEvent();
    await app.inject({ method: 'POST', url: `/api/events/${id}/riders`, ...riderForm('Mozaika') });

    const res = await app.inject({ method: 'GET', url: `/api/events/${id}/export/scene` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toContain('safed-day-3.scn');
    expect(res.body).toContain('/ch/01/config "Kick"');
  });

  it('serves the patch sheet as CSV and Markdown', async () => {
    const { id } = await newEvent();
    await app.inject({ method: 'POST', url: `/api/events/${id}/riders`, ...riderForm('Mozaika') });

    const csv = await app.inject({ method: 'GET', url: `/api/events/${id}/export/csv` });
    expect(csv.body.split('\n')[0]).toContain('Ch,Name');

    const md = await app.inject({ method: 'GET', url: `/api/events/${id}/export/markdown` });
    expect(md.body).toContain('# Megapatch — Safed Day 3');
  });
});
