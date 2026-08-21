import { describe, expect, it } from 'vitest';
import {
  M32,
  allocateMulticores,
  buildPlan,
  mergeRequests,
  validateAssignment,
  type ChannelRequest,
  type Inventory,
} from '../src/index.js';
import { bands, inventory, monitorsByZone, requests } from './fixture.js';

const event = { name: 'Safed Day 3', date: '2026-08-20', venue: 'Ashtam Stage' };

function plan(overrides: Partial<Parameters<typeof buildPlan>[0]> = {}) {
  return buildPlan({ event, inventory, bands, requests, monitorsByZone, ...overrides });
}

describe('merging riders', () => {
  it('collapses a shared source both bands asked for into one channel', () => {
    const merged = mergeRequests(requests, bands);
    const kick = merged.find((m) => m.requests[0]!.instrument === 'kick');
    expect(kick!.requests).toHaveLength(2);
    expect(kick!.requests.map((r) => r.bandId).sort()).toEqual(['mozaika', 'musa']);
  });

  it('keeps band-exclusive sources on their own channel', () => {
    const merged = mergeRequests(requests, bands);
    const keys = merged.filter((m) => m.requests[0]!.instrument === 'keys');
    expect(keys).toHaveLength(2);
    expect(keys.every((k) => k.requests.length === 1)).toBe(true);
  });

  it('never merges sources that disagree on stage zone', () => {
    const sameLabelDifferentZone: ChannelRequest[] = [
      { id: 'a', bandId: 'x', label: 'Kick', instrument: 'kick', sourceType: 'mic', phantom: false, stageZone: 'drums', shareable: true },
      { id: 'b', bandId: 'y', label: 'Kick', instrument: 'kick', sourceType: 'mic', phantom: false, stageZone: 'upstage-left', shareable: true },
    ];
    const merged = mergeRequests(sameLabelDifferentZone, bands);
    expect(merged).toHaveLength(2);
  });

  it('orders channels by console convention, drums first and talk mics late', () => {
    const p = plan();
    const names = p.channels.map((c) => c.name);
    expect(names[0]).toBe('Kick');
    expect(names[1]).toBe('Snare');
    expect(names.indexOf('Keys Talk')).toBeGreaterThan(names.indexOf('Keys L'));
  });
});

describe('patching', () => {
  it('assigns every merged source a distinct physical input', () => {
    const p = plan();
    const keys = p.channels.map((c) => `${c.input.device}:${c.input.connector}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('fills the stage box before the console rear panel', () => {
    const p = plan();
    expect(p.channels[0]!.input.device).toBe('DL32 Stage');
    expect(p.channels[0]!.input.busType).toBe('AES50-A');
  });

  it('numbers channels from 1 with no gaps', () => {
    const p = plan();
    expect(p.channels.map((c) => c.channelNumber)).toEqual(
      p.channels.map((_, i) => i + 1),
    );
  });

  it('honours a rider phantom request even when the preset defaults to off', () => {
    const p = plan();
    const qanun = p.channels.find((c) => c.name === 'Qanun XLR')!;
    expect(qanun.phantom).toBe(true);
  });
});

describe('capacity conflicts', () => {
  it('reports every source that overruns the available inputs', () => {
    const tiny: Inventory = {
      console: M32,
      stageBoxes: [{ name: 'DL16', inputs: 4, outputs: 8, aesPort: 'A', aesOffset: 0 }],
      multicores: [{ name: 'Multi 8', inputs: 8, outputs: 4 }],
    };
    const noLocal: Inventory = { ...tiny, console: { ...M32, localInputs: 0 } };
    const p = plan({ inventory: noLocal });

    const overruns = p.conflicts.filter((c) => c.code === 'input-capacity-exceeded');
    expect(overruns.length).toBeGreaterThan(0);
    expect(p.channels).toHaveLength(4);
  });

  it('reports sources that overrun the console channel strips', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      id: `x${i}`, bandId: 'mozaika', label: `Src ${i}`, instrument: 'keys' as const,
      sourceType: 'di' as const, phantom: false, stageZone: 'front-left' as const, shareable: false,
    }));
    const p = plan({ requests: many });
    expect(p.conflicts.some((c) => c.code === 'channel-capacity-exceeded')).toBe(true);
    expect(p.channels.length).toBeLessThanOrEqual(M32.channelStrips);
  });

  it('never silently drops a source — every overrun names the source', () => {
    const noLocal: Inventory = {
      console: { ...M32, localInputs: 0 },
      stageBoxes: [{ name: 'DL16', inputs: 4, outputs: 8, aesPort: 'A', aesOffset: 0 }],
      multicores: inventory.multicores,
    };
    const p = plan({ inventory: noLocal });
    const reported = p.conflicts.flatMap((c) => c.refs);
    const placed = p.channels.flatMap((c) => c.requestIds);
    for (const r of requests) {
      expect(placed.includes(r.id) || reported.includes(r.id)).toBe(true);
    }
  });
});

describe('multicore allocation', () => {
  it('puts the busiest zone on a snake that actually fits it', () => {
    const p = plan();
    const drums = p.multicoreLayout.find((r) => r.stageZone === 'drums')!;
    const snake = inventory.multicores.find((m) => m.name === drums.multicore)!;
    expect(drums.lines.length).toBeLessThanOrEqual(snake.inputs);
  });

  it('accounts for monitor returns when sizing a snake', () => {
    const { assignment, conflicts } = allocateMulticores(
      [{ zone: 'front-left', inputs: 2, returns: 6 }],
      [{ name: 'Small', inputs: 8, outputs: 2 }, { name: 'Big', inputs: 8, outputs: 8 }],
    );
    expect(assignment['front-left']).toBe('Big');
    expect(conflicts).toHaveLength(0);
  });

  it('prefers a snake named for the zone when several fit', () => {
    const { assignment } = allocateMulticores(
      [{ zone: 'drums', inputs: 4, returns: 1 }],
      [{ name: 'Multi Front L', inputs: 8, outputs: 4 }, { name: 'Multi Drums', inputs: 8, outputs: 4 }],
    );
    expect(assignment['drums']).toBe('Multi Drums');
  });

  it('ignores a matching name when that snake cannot carry the zone', () => {
    const { assignment } = allocateMulticores(
      [{ zone: 'drums', inputs: 10, returns: 1 }],
      [{ name: 'Multi Drums', inputs: 8, outputs: 4 }, { name: 'Multi Big', inputs: 16, outputs: 4 }],
    );
    expect(assignment['drums']).toBe('Multi Big');
  });

  it('reports when no snake in the inventory can carry a zone', () => {
    const { conflicts } = allocateMulticores(
      [{ zone: 'drums', inputs: 16, returns: 2 }],
      [{ name: 'Multi 8', inputs: 8, outputs: 4 }],
    );
    expect(conflicts[0]!.code).toBe('multicore-capacity-exceeded');
    expect(conflicts[0]!.suggestion).toBeTruthy();
  });

  it('rejects a proposed layout that does not fit the real gear', () => {
    const conflicts = validateAssignment(
      { drums: 'Multi Front L' },
      [{ zone: 'drums', inputs: 12, returns: 1 }],
      [{ name: 'Multi Front L', inputs: 8, outputs: 4 }],
    );
    expect(conflicts.some((c) => c.code === 'multicore-capacity-exceeded')).toBe(true);
  });

  it('rejects a proposed layout naming gear that is not in the inventory', () => {
    const conflicts = validateAssignment(
      { drums: 'Imaginary Snake' },
      [{ zone: 'drums', inputs: 4, returns: 0 }],
      inventory.multicores,
    );
    expect(conflicts.some((c) => c.code === 'no-multicore-for-zone')).toBe(true);
  });
});
