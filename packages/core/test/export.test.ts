import { describe, expect, it } from 'vitest';
import { buildPlan, toCsv, toMarkdown } from '../src/index.js';
import { bands, inventory, monitorsByZone, requests } from './fixture.js';

const plan = buildPlan({
  event: { name: 'Safed Day 3', date: '2026-08-20', venue: 'Ashtam Stage' },
  inventory, bands, requests, monitorsByZone,
});

describe('megapatch document', () => {
  it('writes one CSV row per channel plus a header', () => {
    const rows = toCsv(plan).trimEnd().split('\n');
    expect(rows).toHaveLength(plan.channels.length + 1);
  });

  it('carries the physical patch and the snake line, not just the channel', () => {
    const csv = toCsv(plan);
    expect(csv).toContain('DL32 Stage 1');
    expect(csv).toContain('Multi Drums');
  });

  it('marks phantom channels', () => {
    expect(toCsv(plan)).toContain('+48V');
  });

  it('shows a shared source as belonging to both bands', () => {
    const kickRow = toCsv(plan).split('\n').find((l) => l.startsWith('1,Kick'))!;
    expect(kickRow).toContain('Mozaika + Musa Berlin');
  });

  it('surfaces conflicts in the Markdown sheet rather than hiding them', () => {
    const md = toMarkdown(plan);
    expect(md).toContain('## Conflicts');
    expect(md).toContain('upstage-left');
  });

  it('says so plainly when a plan has no conflicts', () => {
    // Drop the zone that has no snake left — both its inputs and its monitor
    // returns, since a zone with only wedges still needs a line run to it.
    const { 'upstage-left': _dropped, ...monitors } = monitorsByZone;
    const clean = buildPlan({
      event: plan.event, inventory, bands,
      requests: requests.filter((r) => r.stageZone !== 'upstage-left'),
      monitorsByZone: monitors,
    });
    expect(clean.conflicts).toHaveLength(0);
    expect(toMarkdown(clean)).toContain('None — the plan fits the inventory.');
  });
});
