/**
 * The vocabulary of the whole system. Every later stage — planning, document
 * export, scene generation — is a pure transformation over these shapes.
 */

/**
 * What kind of source a channel carries. Drives the preset that gets applied,
 * so it is deliberately about *sound role*, not about the microphone model.
 */
export type InstrumentTag =
  | 'kick'
  | 'snare'
  | 'hihat'
  | 'tom'
  | 'floor-tom'
  | 'overhead'
  | 'percussion'
  | 'cajon'
  | 'darbuka'
  | 'bass-di'
  | 'bass-mic'
  | 'guitar-electric'
  | 'guitar-acoustic'
  | 'keys'
  | 'strings'
  | 'oud'
  | 'qanun'
  | 'violin'
  | 'woodwind'
  | 'brass'
  | 'vocal-lead'
  | 'vocal-backing'
  | 'talk-mic'
  | 'playback-di'
  | 'ambience'
  | 'spare';

export type SourceType = 'mic' | 'di' | 'wireless' | 'line';

/**
 * Where on stage the source physically sits. Multicore placement is decided by
 * grouping channels into zones, so this is the field that makes or breaks a
 * usable stage layout.
 */
export type StageZone =
  | 'drums'
  | 'front-left'
  | 'front-center'
  | 'front-right'
  | 'upstage-left'
  | 'upstage-center'
  | 'upstage-right'
  | 'foh';

export const STAGE_ZONES: readonly StageZone[] = [
  'drums',
  'front-left',
  'front-center',
  'front-right',
  'upstage-left',
  'upstage-center',
  'upstage-right',
  'foh',
];

/** One line item as requested by a band's tech rider. Output of ingest. */
export interface ChannelRequest {
  /** Stable id within the event, used to trace a planned channel back to a rider. */
  id: string;
  bandId: string;
  /** Human label as it should appear on the console scribble strip. */
  label: string;
  instrument: InstrumentTag;
  sourceType: SourceType;
  /** Free text as written in the rider: "Beta91", "SM57", "DI / Open XLR". */
  micModel?: string;
  phantom: boolean;
  stageZone: StageZone;
  /**
   * True when several bands can share this exact source — a house drum kit, a
   * podium mic. Shared requests collapse into a single console channel.
   */
  shareable: boolean;
  /** Optional stereo pairing hint: two requests with the same key pair up. */
  stereoPairKey?: string;
  notes?: string;
  /**
   * Per-field confidence from the ingest stage, 0..1. Anything the extractor
   * was unsure about is surfaced in the UI for the technician to confirm.
   */
  confidence?: Partial<Record<string, number>>;
}

export interface Band {
  id: string;
  name: string;
  /** Order in the running list. Earlier bands get the lower channel numbers. */
  slot: number;
}

// ---------------------------------------------------------------------------
// Inventory — the technician's actual gear, entered once and reused per event.
// ---------------------------------------------------------------------------

export interface ConsoleProfile {
  model: 'M32' | 'X32';
  /** XLR inputs on the console rear panel. */
  localInputs: number;
  /** XLR outputs on the console rear panel. */
  localOutputs: number;
  /** Console channel strips available for input sources. */
  channelStrips: number;
  mixBuses: number;
}

export const M32: ConsoleProfile = {
  model: 'M32',
  localInputs: 32,
  localOutputs: 16,
  channelStrips: 32,
  mixBuses: 16,
};

export interface StageBox {
  name: string;
  inputs: number;
  outputs: number;
  /** Which AES50 port it hangs off, and where its inputs start in that port. */
  aesPort: 'A' | 'B';
  /** 0-based offset of this box's first input within the AES50 port. */
  aesOffset: number;
}

/**
 * A physical snake run out onto the stage. Its capacity is the hard constraint
 * the planner has to respect — this is the number the technician actually runs
 * out of on a busy stage.
 */
export interface Multicore {
  name: string;
  inputs: number;
  outputs: number;
}

export interface Inventory {
  console: ConsoleProfile;
  stageBoxes: StageBox[];
  multicores: Multicore[];
}

// ---------------------------------------------------------------------------
// The plan — the single document everything else is derived from.
// ---------------------------------------------------------------------------

/** Where a channel's signal physically enters the system. */
export interface PhysicalInput {
  /** 'local' = console rear panel; otherwise the stage box name. */
  device: string;
  /** 1-based connector number on that device. */
  connector: number;
  /** The routing source the console needs. */
  busType: 'LOCAL' | 'AES50-A' | 'AES50-B' | 'CARD';
  /** 1-based index within that bus type, used for the scene routing block. */
  busIndex: number;
}

/** Which multicore line carries this channel from the stage to the box. */
export interface LineAssignment {
  multicore: string;
  /** 1-based line number on that multicore. */
  line: number;
  channelNumber: number;
}

export interface PlannedChannel {
  /** 1-based console channel strip. */
  channelNumber: number;
  /** Console scribble label, trimmed to what the strip can display. */
  name: string;
  instrument: InstrumentTag;
  sourceType: SourceType;
  micModel?: string;
  phantom: boolean;
  stageZone: StageZone;
  /** Every rider request that collapsed into this channel. */
  requestIds: string[];
  /** Bands that use this channel. More than one means it is shared. */
  bandIds: string[];
  input: PhysicalInput;
  multicore?: LineAssignment;
  /** Key into the preset library; the scene generator resolves it. */
  presetId: InstrumentTag;
  notes?: string;
}

export interface MulticoreRun {
  multicore: string;
  stageZone: StageZone;
  lines: LineAssignment[];
  /** Monitor sends running back down this snake. */
  returnsUsed: number;
}

export type ConflictSeverity = 'error' | 'warning';

/**
 * Something the technician must see before trusting the plan. Never swallowed:
 * a plan that silently drops a channel is worse than no plan at all.
 */
export interface Conflict {
  severity: ConflictSeverity;
  code:
    | 'input-capacity-exceeded'
    | 'channel-capacity-exceeded'
    | 'multicore-capacity-exceeded'
    | 'no-multicore-for-zone'
    | 'duplicate-physical-input'
    | 'unmapped-request';
  message: string;
  /** Channels or requests the conflict touches, for highlighting in the UI. */
  refs: string[];
  suggestion?: string;
}

export interface EventInfo {
  name: string;
  date: string;
  venue: string;
}

export interface MegapatchPlan {
  event: EventInfo;
  inventory: Inventory;
  bands: Band[];
  channels: PlannedChannel[];
  multicoreLayout: MulticoreRun[];
  conflicts: Conflict[];
}
