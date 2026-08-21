import type { Band, ChannelRequest, Inventory } from '../src/index.js';
import { M32 } from '../src/index.js';

/**
 * Derived from a real megapatch (Mozaika / Musa Berlin, Safed Festival day 3).
 * Kept as a fixture because it exercises the cases that matter: a shared house
 * drum kit, mixed Hebrew/English labels, wireless and DI sources, talk mics,
 * and four distinct stage zones fed by different snakes.
 */
export const bands: Band[] = [
  { id: 'mozaika', name: 'Mozaika', slot: 1 },
  { id: 'musa', name: 'Musa Berlin', slot: 2 },
];

export const inventory: Inventory = {
  console: M32,
  stageBoxes: [
    { name: 'DL32 Stage', inputs: 32, outputs: 16, aesPort: 'A', aesOffset: 0 },
  ],
  multicores: [
    { name: 'Multi Drums', inputs: 12, outputs: 4 },
    { name: 'Multi Front L', inputs: 8, outputs: 4 },
    { name: 'Multi Front R', inputs: 8, outputs: 4 },
    { name: 'Multi Upstage L', inputs: 8, outputs: 4 },
  ],
};

let seq = 0;
function req(r: Omit<ChannelRequest, 'id'>): ChannelRequest {
  return { id: `r${++seq}`, ...r };
}

export const requests: ChannelRequest[] = [
  // House drum kit — both bands use it, so it must collapse to one strip each.
  req({ bandId: 'mozaika', label: 'Kick', instrument: 'kick', sourceType: 'mic', micModel: 'Beta91', phantom: true, stageZone: 'drums', shareable: true }),
  req({ bandId: 'musa', label: 'Kick', instrument: 'kick', sourceType: 'mic', micModel: 'Beta91', phantom: true, stageZone: 'drums', shareable: true }),
  req({ bandId: 'mozaika', label: 'Snare', instrument: 'snare', sourceType: 'mic', micModel: 'SM57', phantom: false, stageZone: 'drums', shareable: true }),
  req({ bandId: 'musa', label: 'Snare', instrument: 'snare', sourceType: 'mic', micModel: 'SM57', phantom: false, stageZone: 'drums', shareable: true }),
  req({ bandId: 'mozaika', label: 'Tom 1', instrument: 'tom', sourceType: 'mic', micModel: 'e904', phantom: false, stageZone: 'drums', shareable: true }),
  req({ bandId: 'mozaika', label: 'Tom 2', instrument: 'tom', sourceType: 'mic', micModel: 'e904', phantom: false, stageZone: 'drums', shareable: true }),
  req({ bandId: 'mozaika', label: 'Floor Tom', instrument: 'floor-tom', sourceType: 'mic', micModel: 'e904', phantom: false, stageZone: 'drums', shareable: true }),
  req({ bandId: 'mozaika', label: 'OH L', instrument: 'overhead', sourceType: 'mic', micModel: 'Pencil', phantom: true, stageZone: 'drums', shareable: true, stereoPairKey: 'oh' }),
  req({ bandId: 'mozaika', label: 'OH R', instrument: 'overhead', sourceType: 'mic', micModel: 'Pencil', phantom: true, stageZone: 'drums', shareable: true, stereoPairKey: 'oh' }),

  // Mozaika only.
  req({ bandId: 'mozaika', label: 'Bass XLR 1', instrument: 'bass-di', sourceType: 'di', micModel: 'DI / Open XLR', phantom: false, stageZone: 'upstage-left', shareable: false }),
  req({ bandId: 'mozaika', label: 'Guitar DI', instrument: 'guitar-electric', sourceType: 'di', micModel: 'DI', phantom: false, stageZone: 'front-right', shareable: false }),
  req({ bandId: 'mozaika', label: 'Oud Pro35', instrument: 'oud', sourceType: 'mic', micModel: 'Pro35', phantom: true, stageZone: 'front-right', shareable: false }),
  req({ bandId: 'mozaika', label: 'Qanun XLR', instrument: 'qanun', sourceType: 'line', micModel: 'Open XLR + Phantom', phantom: true, stageZone: 'front-right', shareable: false }),
  req({ bandId: 'mozaika', label: 'Violin', instrument: 'violin', sourceType: 'di', micModel: 'DI', phantom: false, stageZone: 'front-left', shareable: false }),
  req({ bandId: 'mozaika', label: 'Darbuka', instrument: 'darbuka', sourceType: 'mic', micModel: 'SM57', phantom: false, stageZone: 'upstage-left', shareable: false }),
  req({ bandId: 'mozaika', label: 'Cajon 1', instrument: 'cajon', sourceType: 'mic', micModel: 'SM91', phantom: true, stageZone: 'upstage-left', shareable: false }),

  // Musa Berlin only.
  req({ bandId: 'musa', label: 'Keys L', instrument: 'keys', sourceType: 'di', micModel: 'DI', phantom: false, stageZone: 'front-left', shareable: false, stereoPairKey: 'keys' }),
  req({ bandId: 'musa', label: 'Keys R', instrument: 'keys', sourceType: 'di', micModel: 'DI', phantom: false, stageZone: 'front-left', shareable: false, stereoPairKey: 'keys' }),
  req({ bandId: 'musa', label: 'Keys Talk', instrument: 'talk-mic', sourceType: 'mic', micModel: 'Pro35', phantom: true, stageZone: 'front-left', shareable: false }),
  req({ bandId: 'musa', label: 'Clarinet WL', instrument: 'woodwind', sourceType: 'wireless', micModel: 'Wireless RX', phantom: false, stageZone: 'front-center', shareable: false }),
  req({ bandId: 'musa', label: 'Clarinet Bkp', instrument: 'woodwind', sourceType: 'mic', micModel: 'SM57', phantom: false, stageZone: 'front-center', shareable: false }),
  req({ bandId: 'musa', label: 'Clarinet Talk', instrument: 'talk-mic', sourceType: 'mic', micModel: 'SM57', phantom: false, stageZone: 'front-center', shareable: false }),
];

export const monitorsByZone = {
  drums: 1,
  'front-left': 2,
  'front-center': 2,
  'front-right': 2,
  'upstage-left': 1,
} as const;
