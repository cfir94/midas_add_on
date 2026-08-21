import type { InstrumentTag } from '../models/types.js';

/**
 * Console strip colours as the M32/X32 scene format spells them.
 * The 'i' suffix is the inverted (filled) variant.
 */
export type ScribbleColor =
  | 'OFF' | 'RD' | 'GN' | 'YE' | 'BL' | 'MG' | 'CY' | 'WH'
  | 'OFFi' | 'RDi' | 'GNi' | 'YEi' | 'BLi' | 'MGi' | 'CYi' | 'WHi';

export type EqBandType = 'LCut' | 'LShv' | 'PEQ' | 'VEQ' | 'HShv' | 'HCut';

export interface EqBand {
  type: EqBandType;
  /** Hz */
  freq: number;
  /** dB */
  gain: number;
  /** Q */
  q: number;
}

export interface GateSettings {
  on: boolean;
  mode: 'GATE' | 'EXP2' | 'EXP3' | 'EXP4' | 'DUCK';
  /** dB */
  threshold: number;
  /** dB of attenuation below threshold */
  range: number;
  /** ms */
  attack: number;
  /** ms */
  hold: number;
  /** ms */
  release: number;
}

export interface DynSettings {
  on: boolean;
  mode: 'COMP' | 'EXP';
  detection: 'PEAK' | 'RMS';
  envelope: 'LIN' | 'LOG';
  /** dB */
  threshold: number;
  /** ratio index into the console's ratio table, see RATIO_VALUES */
  ratio: number;
  knee: number;
  /** dB of makeup gain */
  makeupGain: number;
  /** ms */
  attack: number;
  /** ms */
  release: number;
  position: 'PRE' | 'POST';
}

export interface ChannelPreset {
  id: InstrumentTag;
  /** Shown in the UI so the technician knows what they are applying. */
  description: string;
  color: ScribbleColor;
  /** Console icon index, 1..74. */
  icon: number;
  /** Phantom power default. Overridden by the rider when it says otherwise. */
  phantom: boolean;
  /** Starting head amp gain in dB — a safe point, not a mixed level. */
  gain: number;
  eq: EqBand[];
  gate: GateSettings;
  dyn: DynSettings;
}

/** The console stores compressor ratio as an index; these are the values. */
export const RATIO_VALUES = [
  1.1, 1.3, 1.5, 1.7, 2, 2.5, 3, 4, 5, 7, 10, 20, 100,
] as const;

const noGate: GateSettings = {
  on: false, mode: 'EXP4', threshold: -40, range: 20, attack: 10, hold: 20, release: 250,
};

const noDyn: DynSettings = {
  on: false, mode: 'COMP', detection: 'RMS', envelope: 'LIN',
  threshold: -18, ratio: 6, knee: 2, makeupGain: 0, attack: 10, release: 150, position: 'POST',
};

/**
 * Deliberately conservative starting points, not finished mixes. Every value
 * here is something a technician would dial before soundcheck anyway; the point
 * is to arrive at soundcheck with a usable picture instead of a flat console.
 *
 * `ratio` is an index into RATIO_VALUES, matching how the console stores it.
 */
export const PRESETS: Record<InstrumentTag, ChannelPreset> = {
  kick: {
    id: 'kick', description: 'Kick drum — sub kept, box notched out', color: 'RD', icon: 2,
    phantom: false, gain: 20,
    eq: [
      { type: 'LCut', freq: 30, gain: 0, q: 2 },
      { type: 'PEQ', freq: 60, gain: 3, q: 1.5 },
      { type: 'PEQ', freq: 380, gain: -4, q: 2.5 },
      { type: 'PEQ', freq: 3500, gain: 3, q: 1.5 },
    ],
    gate: { on: true, mode: 'GATE', threshold: -35, range: 25, attack: 1, hold: 40, release: 200 },
    dyn: { ...noDyn, on: true, threshold: -20, ratio: 7, makeupGain: 3, attack: 12, release: 180 },
  },
  snare: {
    id: 'snare', description: 'Snare — body kept, cymbal bleed rolled off', color: 'RD', icon: 3,
    phantom: false, gain: 24,
    eq: [
      { type: 'LCut', freq: 90, gain: 0, q: 2 },
      { type: 'PEQ', freq: 220, gain: 2, q: 1.5 },
      { type: 'PEQ', freq: 800, gain: -3, q: 2 },
      { type: 'PEQ', freq: 5000, gain: 3, q: 1.5 },
    ],
    gate: { on: true, mode: 'GATE', threshold: -32, range: 18, attack: 1, hold: 30, release: 150 },
    dyn: { ...noDyn, on: true, threshold: -18, ratio: 7, makeupGain: 3, attack: 8, release: 150 },
  },
  hihat: {
    id: 'hihat', description: 'Hi-hat — low end removed entirely', color: 'RD', icon: 4,
    phantom: true, gain: 28,
    eq: [
      { type: 'LCut', freq: 300, gain: 0, q: 2 },
      { type: 'PEQ', freq: 900, gain: -3, q: 2 },
      { type: 'HShv', freq: 8000, gain: 2, q: 1 },
    ],
    gate: noGate, dyn: noDyn,
  },
  tom: {
    id: 'tom', description: 'Rack tom — gated, mids scooped', color: 'RD', icon: 5,
    phantom: false, gain: 24,
    eq: [
      { type: 'LCut', freq: 70, gain: 0, q: 2 },
      { type: 'PEQ', freq: 400, gain: -4, q: 2.5 },
      { type: 'PEQ', freq: 4000, gain: 2, q: 1.5 },
    ],
    gate: { on: true, mode: 'GATE', threshold: -34, range: 22, attack: 2, hold: 60, release: 300 },
    dyn: { ...noDyn, on: true, threshold: -20, ratio: 6, makeupGain: 2, attack: 15, release: 200 },
  },
  'floor-tom': {
    id: 'floor-tom', description: 'Floor tom — gated, lower fundamental', color: 'RD', icon: 5,
    phantom: false, gain: 22,
    eq: [
      { type: 'LCut', freq: 50, gain: 0, q: 2 },
      { type: 'PEQ', freq: 350, gain: -4, q: 2.5 },
      { type: 'PEQ', freq: 3000, gain: 2, q: 1.5 },
    ],
    gate: { on: true, mode: 'GATE', threshold: -34, range: 22, attack: 2, hold: 80, release: 400 },
    dyn: { ...noDyn, on: true, threshold: -20, ratio: 6, makeupGain: 2, attack: 15, release: 200 },
  },
  overhead: {
    id: 'overhead', description: 'Overhead — condenser, steep low cut', color: 'RDi', icon: 6,
    phantom: true, gain: 30,
    eq: [
      { type: 'LCut', freq: 250, gain: 0, q: 2 },
      { type: 'PEQ', freq: 500, gain: -2, q: 1.5 },
      { type: 'HShv', freq: 10000, gain: 2, q: 1 },
    ],
    gate: noGate, dyn: noDyn,
  },
  percussion: {
    id: 'percussion', description: 'General percussion', color: 'MG', icon: 7,
    phantom: true, gain: 26,
    eq: [
      { type: 'LCut', freq: 120, gain: 0, q: 2 },
      { type: 'PEQ', freq: 500, gain: -2, q: 2 },
      { type: 'HShv', freq: 8000, gain: 2, q: 1 },
    ],
    gate: noGate,
    dyn: { ...noDyn, on: true, threshold: -16, ratio: 5, makeupGain: 2, attack: 10, release: 150 },
  },
  cajon: {
    id: 'cajon', description: 'Cajon — kick body plus slap top', color: 'MG', icon: 7,
    phantom: false, gain: 24,
    eq: [
      { type: 'LCut', freq: 50, gain: 0, q: 2 },
      { type: 'PEQ', freq: 90, gain: 2, q: 1.5 },
      { type: 'PEQ', freq: 400, gain: -3, q: 2 },
      { type: 'PEQ', freq: 3000, gain: 2, q: 1.5 },
    ],
    gate: noGate,
    dyn: { ...noDyn, on: true, threshold: -18, ratio: 6, makeupGain: 2, attack: 10, release: 150 },
  },
  darbuka: {
    id: 'darbuka', description: 'Darbuka / riq — snap preserved', color: 'MG', icon: 7,
    phantom: false, gain: 26,
    eq: [
      { type: 'LCut', freq: 80, gain: 0, q: 2 },
      { type: 'PEQ', freq: 350, gain: -3, q: 2 },
      { type: 'PEQ', freq: 4500, gain: 2, q: 1.5 },
    ],
    gate: noGate,
    dyn: { ...noDyn, on: true, threshold: -16, ratio: 6, makeupGain: 2, attack: 8, release: 120 },
  },
  'bass-di': {
    id: 'bass-di', description: 'Bass DI — compressed, mud notched', color: 'BL', icon: 10,
    phantom: false, gain: 12,
    eq: [
      { type: 'LCut', freq: 35, gain: 0, q: 2 },
      { type: 'PEQ', freq: 250, gain: -3, q: 2 },
      { type: 'PEQ', freq: 800, gain: 2, q: 1.5 },
    ],
    gate: noGate,
    dyn: { ...noDyn, on: true, threshold: -22, ratio: 7, makeupGain: 4, attack: 15, release: 200 },
  },
  'bass-mic': {
    id: 'bass-mic', description: 'Bass cabinet mic', color: 'BL', icon: 10,
    phantom: false, gain: 20,
    eq: [
      { type: 'LCut', freq: 35, gain: 0, q: 2 },
      { type: 'PEQ', freq: 250, gain: -3, q: 2 },
      { type: 'PEQ', freq: 1500, gain: 2, q: 1.5 },
    ],
    gate: noGate,
    dyn: { ...noDyn, on: true, threshold: -22, ratio: 7, makeupGain: 4, attack: 15, release: 200 },
  },
  'guitar-electric': {
    id: 'guitar-electric', description: 'Electric guitar cabinet', color: 'CY', icon: 12,
    phantom: false, gain: 24,
    eq: [
      { type: 'LCut', freq: 90, gain: 0, q: 2 },
      { type: 'PEQ', freq: 400, gain: -2, q: 2 },
      { type: 'PEQ', freq: 2500, gain: 2, q: 1.5 },
    ],
    gate: noGate,
    dyn: { ...noDyn, on: true, threshold: -18, ratio: 5, makeupGain: 2, attack: 20, release: 200 },
  },
  'guitar-acoustic': {
    id: 'guitar-acoustic', description: 'Acoustic guitar — boxiness notched', color: 'CY', icon: 13,
    phantom: false, gain: 18,
    eq: [
      { type: 'LCut', freq: 100, gain: 0, q: 2 },
      { type: 'PEQ', freq: 220, gain: -4, q: 2.5 },
      { type: 'HShv', freq: 8000, gain: 2, q: 1 },
    ],
    gate: noGate,
    dyn: { ...noDyn, on: true, threshold: -18, ratio: 5, makeupGain: 2, attack: 20, release: 200 },
  },
  keys: {
    id: 'keys', description: 'Keyboards DI', color: 'GN', icon: 15,
    phantom: false, gain: 12,
    eq: [
      { type: 'LCut', freq: 40, gain: 0, q: 2 },
      { type: 'PEQ', freq: 300, gain: -2, q: 2 },
    ],
    gate: noGate,
    dyn: { ...noDyn, on: true, threshold: -20, ratio: 5, makeupGain: 2, attack: 20, release: 200 },
  },
  strings: {
    id: 'strings', description: 'String section', color: 'YE', icon: 17,
    phantom: true, gain: 28,
    eq: [
      { type: 'LCut', freq: 120, gain: 0, q: 2 },
      { type: 'PEQ', freq: 400, gain: -2, q: 2 },
      { type: 'HShv', freq: 9000, gain: 2, q: 1 },
    ],
    gate: noGate,
    dyn: { ...noDyn, on: true, threshold: -20, ratio: 5, makeupGain: 2, attack: 20, release: 250 },
  },
  oud: {
    id: 'oud', description: 'Oud — warm body, boom controlled', color: 'YE', icon: 13,
    phantom: false, gain: 26,
    eq: [
      { type: 'LCut', freq: 80, gain: 0, q: 2 },
      { type: 'PEQ', freq: 200, gain: -3, q: 2 },
      { type: 'PEQ', freq: 3000, gain: 2, q: 1.5 },
    ],
    gate: noGate,
    dyn: { ...noDyn, on: true, threshold: -20, ratio: 5, makeupGain: 3, attack: 15, release: 200 },
  },
  qanun: {
    id: 'qanun', description: 'Qanun — plucked attack preserved', color: 'YE', icon: 17,
    phantom: true, gain: 26,
    eq: [
      { type: 'LCut', freq: 100, gain: 0, q: 2 },
      { type: 'PEQ', freq: 300, gain: -3, q: 2 },
      { type: 'HShv', freq: 8000, gain: 2, q: 1 },
    ],
    gate: noGate,
    dyn: { ...noDyn, on: true, threshold: -20, ratio: 5, makeupGain: 3, attack: 15, release: 200 },
  },
  violin: {
    id: 'violin', description: 'Violin — harshness tamed', color: 'YE', icon: 17,
    phantom: false, gain: 24,
    eq: [
      { type: 'LCut', freq: 150, gain: 0, q: 2 },
      { type: 'PEQ', freq: 2500, gain: -3, q: 2.5 },
      { type: 'HShv', freq: 9000, gain: 2, q: 1 },
    ],
    gate: noGate,
    dyn: { ...noDyn, on: true, threshold: -20, ratio: 5, makeupGain: 3, attack: 15, release: 200 },
  },
  woodwind: {
    id: 'woodwind', description: 'Clarinet / flute / ney', color: 'GNi', icon: 19,
    phantom: false, gain: 26,
    eq: [
      { type: 'LCut', freq: 120, gain: 0, q: 2 },
      { type: 'PEQ', freq: 1200, gain: -2, q: 2 },
      { type: 'HShv', freq: 8000, gain: 2, q: 1 },
    ],
    gate: noGate,
    dyn: { ...noDyn, on: true, threshold: -20, ratio: 5, makeupGain: 3, attack: 15, release: 200 },
  },
  brass: {
    id: 'brass', description: 'Trumpet / sax / trombone', color: 'GNi', icon: 20,
    phantom: false, gain: 20,
    eq: [
      { type: 'LCut', freq: 120, gain: 0, q: 2 },
      { type: 'PEQ', freq: 1800, gain: -3, q: 2 },
    ],
    gate: noGate,
    dyn: { ...noDyn, on: true, threshold: -18, ratio: 7, makeupGain: 3, attack: 10, release: 150 },
  },
  'vocal-lead': {
    id: 'vocal-lead', description: 'Lead vocal — proximity trimmed, presence lifted', color: 'WHi', icon: 22,
    phantom: false, gain: 30,
    eq: [
      { type: 'LCut', freq: 100, gain: 0, q: 2 },
      { type: 'PEQ', freq: 300, gain: -3, q: 2 },
      { type: 'PEQ', freq: 3500, gain: 3, q: 1.5 },
      { type: 'HShv', freq: 10000, gain: 2, q: 1 },
    ],
    gate: noGate,
    dyn: { ...noDyn, on: true, threshold: -20, ratio: 6, makeupGain: 4, attack: 10, release: 150 },
  },
  'vocal-backing': {
    id: 'vocal-backing', description: 'Backing vocal — sits behind the lead', color: 'WH', icon: 22,
    phantom: false, gain: 30,
    eq: [
      { type: 'LCut', freq: 120, gain: 0, q: 2 },
      { type: 'PEQ', freq: 300, gain: -3, q: 2 },
      { type: 'PEQ', freq: 3500, gain: 2, q: 1.5 },
    ],
    gate: noGate,
    dyn: { ...noDyn, on: true, threshold: -20, ratio: 6, makeupGain: 4, attack: 10, release: 150 },
  },
  'talk-mic': {
    id: 'talk-mic', description: 'Talk mic — narrow band, heavily filtered', color: 'BLi', icon: 22,
    phantom: false, gain: 30,
    eq: [
      { type: 'LCut', freq: 150, gain: 0, q: 2 },
      { type: 'PEQ', freq: 400, gain: -3, q: 2 },
      { type: 'PEQ', freq: 3000, gain: 3, q: 1.5 },
      { type: 'HCut', freq: 12000, gain: 0, q: 2 },
    ],
    gate: noGate,
    dyn: { ...noDyn, on: true, threshold: -22, ratio: 8, makeupGain: 5, attack: 10, release: 150 },
  },
  'playback-di': {
    id: 'playback-di', description: 'Playback / track DI — left flat on purpose', color: 'MGi', icon: 25,
    phantom: false, gain: 6,
    eq: [{ type: 'LCut', freq: 25, gain: 0, q: 2 }],
    gate: noGate, dyn: noDyn,
  },
  ambience: {
    id: 'ambience', description: 'Audience / ambience mic', color: 'CYi', icon: 23,
    phantom: true, gain: 34,
    eq: [
      { type: 'LCut', freq: 150, gain: 0, q: 2 },
      { type: 'HShv', freq: 10000, gain: 2, q: 1 },
    ],
    gate: noGate, dyn: noDyn,
  },
  spare: {
    id: 'spare', description: 'Unused strip — flat and safe', color: 'OFF', icon: 1,
    phantom: false, gain: 0,
    eq: [], gate: noGate, dyn: noDyn,
  },
};

export function getPreset(tag: InstrumentTag): ChannelPreset {
  return PRESETS[tag];
}
