import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildPlan, M32 } from '@stagepatch/core';
import { ExtractionResult, toOutcome, uncertainFields } from '../src/index.js';

/**
 * A model response shaped like one from a real rider. Kept as a literal so the
 * conversion into planner input is tested without a network round trip.
 */
const modelResponse: ExtractionResult = {
  bandName: 'Musa Berlin',
  channels: [
    { label: 'Kick', instrument: 'kick', sourceType: 'mic', micModel: 'Beta91', phantom: true, stageZone: 'drums', shareable: true, stereoPairKey: null, notes: 'House kit', uncertainFields: [] },
    { label: 'Keys L', instrument: 'keys', sourceType: 'di', micModel: 'DI', phantom: false, stageZone: 'front-left', shareable: false, stereoPairKey: 'keys', notes: null, uncertainFields: [] },
    { label: 'Keys R', instrument: 'keys', sourceType: 'di', micModel: 'DI', phantom: false, stageZone: 'front-left', shareable: false, stereoPairKey: 'keys', notes: null, uncertainFields: [] },
    { label: 'Clarinet WL', instrument: 'woodwind', sourceType: 'wireless', micModel: null, phantom: false, stageZone: 'front-center', shareable: false, stereoPairKey: null, notes: null, uncertainFields: ['micModel', 'phantom'] },
  ],
  monitorsByZone: [
    { zone: 'drums', count: 1 },
    { zone: 'front-left', count: 2 },
    { zone: 'front-center', count: 2 },
  ],
  warnings: ['Rider offers violin or accordion — extracted violin, confirm which act brings.'],
};

describe('extraction schema', () => {
  it('converts to JSON Schema, which is how the SDK sends it to the model', () => {
    // Regression guard: the SDK's betaZodOutputFormat calls z.toJSONSchema,
    // which exists only on Zod v4. Dropping back to v3 makes every real
    // extraction fail at request time while every parse-only test still passes.
    const schema = z.toJSONSchema(ExtractionResult) as { properties?: object };
    expect(schema.properties).toBeTruthy();
  });


  it('accepts a well-formed model response', () => {
    expect(() => ExtractionResult.parse(modelResponse)).not.toThrow();
  });

  it('rejects an instrument tag the planner would not understand', () => {
    const bad = structuredClone(modelResponse) as Record<string, unknown>;
    (bad['channels'] as Array<Record<string, unknown>>)[0]!['instrument'] = 'theremin';
    expect(() => ExtractionResult.parse(bad)).toThrow();
  });

  it('rejects a stage zone outside the known set', () => {
    const bad = structuredClone(modelResponse) as Record<string, unknown>;
    (bad['channels'] as Array<Record<string, unknown>>)[0]!['stageZone'] = 'stage-left-ish';
    expect(() => ExtractionResult.parse(bad)).toThrow();
  });
});

describe('converting a response into planner input', () => {
  const outcome = toOutcome(modelResponse);

  it('derives a band id from the band name', () => {
    expect(outcome.bandId).toBe('musa-berlin');
    expect(outcome.requests.every((r) => r.bandId === 'musa-berlin')).toBe(true);
  });

  it('gives every request a unique id', () => {
    const ids = outcome.requests.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps every channel the rider listed, in order', () => {
    expect(outcome.requests.map((r) => r.label)).toEqual([
      'Kick', 'Keys L', 'Keys R', 'Clarinet WL',
    ]);
  });

  it('flags the fields the model guessed at', () => {
    const clarinet = outcome.requests.find((r) => r.label === 'Clarinet WL')!;
    expect(uncertainFields(clarinet).sort()).toEqual(['micModel', 'phantom']);
  });

  it('leaves confidently extracted fields unflagged', () => {
    const kick = outcome.requests.find((r) => r.label === 'Kick')!;
    expect(uncertainFields(kick)).toEqual([]);
  });

  it('turns a null micModel into an absent field rather than the string "null"', () => {
    const clarinet = outcome.requests.find((r) => r.label === 'Clarinet WL')!;
    expect(clarinet.micModel).toBeUndefined();
  });

  it('reshapes monitor counts into the map the planner takes', () => {
    expect(outcome.monitorsByZone).toEqual({
      drums: 1, 'front-left': 2, 'front-center': 2,
    });
  });

  it('carries document-level warnings through instead of dropping them', () => {
    expect(outcome.warnings).toHaveLength(1);
    expect(outcome.warnings[0]).toContain('accordion');
  });
});

describe('extraction feeding the planner', () => {
  it('produces requests the planner can build a scene from end to end', () => {
    const outcome = toOutcome(modelResponse);
    const plan = buildPlan({
      event: { name: 'Test', date: '2026-08-21', venue: 'Hall' },
      inventory: {
        console: M32,
        stageBoxes: [{ name: 'DL16', inputs: 16, outputs: 8, aesPort: 'A', aesOffset: 0 }],
        multicores: [
          { name: 'Multi Drums', inputs: 8, outputs: 4 },
          { name: 'Multi Front L', inputs: 8, outputs: 4 },
          { name: 'Multi Front C', inputs: 8, outputs: 4 },
        ],
      },
      bands: [{ id: outcome.bandId, name: outcome.bandName, slot: 1 }],
      requests: outcome.requests,
      monitorsByZone: outcome.monitorsByZone,
    });

    expect(plan.channels).toHaveLength(4);
    expect(plan.conflicts).toHaveLength(0);
    expect(plan.channels[0]!.name).toBe('Kick');
  });
});
