import type { Band, ChannelRequest } from '../models/types.js';
import { instrumentRank } from './order.js';

/**
 * A group of rider requests that will become one console channel. Several bands
 * asking for the same shareable source — a house drum kit, a podium mic —
 * collapse into a single group rather than eating a strip each.
 */
export interface MergedSource {
  key: string;
  label: string;
  requests: ChannelRequest[];
}

/**
 * Normalise a label enough to recognise the same source written differently
 * across two riders: case, punctuation and filler words removed.
 */
export function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[()\/\-_.,+]/g, ' ')
    .replace(/\b(mic|microphone|line|channel|ch)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Merge every band's requests into the set of console channels the event needs.
 *
 * Only requests explicitly marked `shareable` are merged, and only when they
 * agree on instrument, source type and stage zone. Merging a source two bands
 * actually use differently is worse than spending an extra strip, so the bar
 * for merging is deliberately high.
 */
export function mergeRequests(
  requests: ChannelRequest[],
  bands: Band[],
): MergedSource[] {
  const bandSlot = new Map(bands.map((b) => [b.id, b.slot]));
  const groups = new Map<string, MergedSource>();
  const standalone: MergedSource[] = [];

  for (const req of requests) {
    if (!req.shareable) {
      standalone.push({ key: req.id, label: req.label, requests: [req] });
      continue;
    }
    const key = [
      'shared',
      req.instrument,
      req.sourceType,
      req.stageZone,
      normalizeLabel(req.label),
    ].join('|');

    const existing = groups.get(key);
    if (existing) {
      existing.requests.push(req);
    } else {
      groups.set(key, { key, label: req.label, requests: [req] });
    }
  }

  const all = [...groups.values(), ...standalone];

  // Order by instrument convention first, then by which band goes on first, so
  // the earliest act's exclusive channels sit above later ones.
  all.sort((a, b) => {
    const ai = instrumentRank(a.requests[0]!.instrument);
    const bi = instrumentRank(b.requests[0]!.instrument);
    if (ai !== bi) return ai - bi;

    const aSlot = Math.min(...a.requests.map((r) => bandSlot.get(r.bandId) ?? 99));
    const bSlot = Math.min(...b.requests.map((r) => bandSlot.get(r.bandId) ?? 99));
    if (aSlot !== bSlot) return aSlot - bSlot;

    return a.label.localeCompare(b.label);
  });

  return all;
}
