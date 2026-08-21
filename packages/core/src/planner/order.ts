import type { InstrumentTag } from '../models/types.js';

/**
 * Conventional channel order on a live console. Technicians read a patch sheet
 * by muscle memory, so ordering by convention matters more than any clever
 * optimisation: drums, bass, guitars, keys, other instruments, vocals, playback.
 */
const ORDER: InstrumentTag[] = [
  'kick',
  'snare',
  'hihat',
  'tom',
  'floor-tom',
  'overhead',
  'percussion',
  'cajon',
  'darbuka',
  'bass-di',
  'bass-mic',
  'guitar-electric',
  'guitar-acoustic',
  'keys',
  'oud',
  'qanun',
  'violin',
  'strings',
  'woodwind',
  'brass',
  'vocal-lead',
  'vocal-backing',
  'talk-mic',
  'playback-di',
  'ambience',
  'spare',
];

const RANK = new Map(ORDER.map((tag, i) => [tag, i]));

export function instrumentRank(tag: InstrumentTag): number {
  return RANK.get(tag) ?? ORDER.length;
}
