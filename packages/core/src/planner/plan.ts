import type {
  Band,
  ChannelRequest,
  Conflict,
  EventInfo,
  Inventory,
  LineAssignment,
  MegapatchPlan,
  MulticoreRun,
  PhysicalInput,
  PlannedChannel,
  StageZone,
} from '../models/types.js';
import { getPreset } from '../presets/library.js';
import { mergeRequests, type MergedSource } from './merge.js';
import {
  allocateMulticores,
  validateAssignment,
  type ZoneDemand,
  type ZoneToMulticore,
} from './multicore.js';

export interface PlanInput {
  event: EventInfo;
  inventory: Inventory;
  bands: Band[];
  requests: ChannelRequest[];
  /**
   * Monitor sends required per stage zone. Feeds multicore sizing — a zone with
   * four wedges needs four return lines down the same snake.
   */
  monitorsByZone?: Partial<Record<StageZone, number>>;
  /**
   * A stage layout proposed elsewhere (the AI layer). When present it is
   * validated against the inventory instead of being computed, and any problem
   * it causes surfaces as a conflict rather than being silently accepted.
   */
  multicoreAssignment?: ZoneToMulticore;
}

/**
 * Build the ordered list of physical inputs the console can reach, stage boxes
 * first. Stage boxes sit on stage where the sources are, so filling them before
 * the console's rear panel is what a technician does by default.
 */
function buildInputPool(inventory: Inventory): PhysicalInput[] {
  const pool: PhysicalInput[] = [];

  for (const box of inventory.stageBoxes) {
    for (let i = 1; i <= box.inputs; i++) {
      pool.push({
        device: box.name,
        connector: i,
        busType: box.aesPort === 'A' ? 'AES50-A' : 'AES50-B',
        busIndex: box.aesOffset + i,
      });
    }
  }

  for (let i = 1; i <= inventory.console.localInputs; i++) {
    pool.push({ device: 'local', connector: i, busType: 'LOCAL', busIndex: i });
  }

  return pool;
}

function zoneDemands(
  sources: MergedSource[],
  monitorsByZone: Partial<Record<StageZone, number>>,
): ZoneDemand[] {
  const inputs = new Map<StageZone, number>();
  for (const src of sources) {
    const zone = src.requests[0]!.stageZone;
    inputs.set(zone, (inputs.get(zone) ?? 0) + 1);
  }

  const zones = new Set<StageZone>([
    ...inputs.keys(),
    ...(Object.keys(monitorsByZone) as StageZone[]),
  ]);

  return [...zones].map((zone) => ({
    zone,
    inputs: inputs.get(zone) ?? 0,
    returns: monitorsByZone[zone] ?? 0,
  }));
}

/**
 * Turn every band's rider into one megapatch: merged channels in conventional
 * order, each mapped to a physical input and a multicore line, with every
 * capacity problem reported rather than hidden.
 */
export function buildPlan(input: PlanInput): MegapatchPlan {
  const { event, inventory, bands, requests } = input;
  const monitorsByZone = input.monitorsByZone ?? {};
  const conflicts: Conflict[] = [];

  const sources = mergeRequests(requests, bands);

  // --- Stage layout: which snake serves which zone -------------------------
  const demands = zoneDemands(sources, monitorsByZone);
  let assignment: ZoneToMulticore;
  if (input.multicoreAssignment) {
    assignment = input.multicoreAssignment;
    conflicts.push(...validateAssignment(assignment, demands, inventory.multicores));
  } else {
    const allocated = allocateMulticores(demands, inventory.multicores);
    assignment = allocated.assignment;
    conflicts.push(...allocated.conflicts);
  }

  // --- Channel strips and physical inputs ----------------------------------
  const pool = buildInputPool(inventory);
  const strips = inventory.console.channelStrips;
  const channels: PlannedChannel[] = [];
  const lineCounter = new Map<string, number>();
  const runs = new Map<string, MulticoreRun>();

  sources.forEach((src, index) => {
    const channelNumber = index + 1;
    const head = src.requests[0]!;

    if (channelNumber > strips) {
      conflicts.push({
        severity: 'error',
        code: 'channel-capacity-exceeded',
        message: `"${src.label}" does not fit: the ${inventory.console.model} has ${strips} channel strips and this is source ${channelNumber}.`,
        refs: src.requests.map((r) => r.id),
        suggestion: 'Share more sources between bands, or sub-mix the drum kit.',
      });
      return;
    }

    const physical = pool[index];
    if (!physical) {
      conflicts.push({
        severity: 'error',
        code: 'input-capacity-exceeded',
        message: `"${src.label}" has no physical input left: the inventory provides ${pool.length} inputs.`,
        refs: src.requests.map((r) => r.id),
        suggestion: 'Add a stage box, or free an input by sharing a source.',
      });
      return;
    }

    const preset = getPreset(head.instrument);
    const zone = head.stageZone;

    let multicore: LineAssignment | undefined;
    const snake = assignment[zone];
    if (snake) {
      const line = (lineCounter.get(snake) ?? 0) + 1;
      lineCounter.set(snake, line);
      multicore = { multicore: snake, line, channelNumber };

      let run = runs.get(snake);
      if (!run) {
        run = { multicore: snake, stageZone: zone, lines: [], returnsUsed: monitorsByZone[zone] ?? 0 };
        runs.set(snake, run);
      }
      run.lines.push(multicore);
    }

    channels.push({
      channelNumber,
      name: src.label,
      instrument: head.instrument,
      sourceType: head.sourceType,
      micModel: head.micModel,
      // A rider asking for phantom always wins over the preset default; a
      // condenser that arrives unpowered is a dead channel at showtime.
      phantom: src.requests.some((r) => r.phantom) || preset.phantom,
      stageZone: zone,
      requestIds: src.requests.map((r) => r.id),
      bandIds: [...new Set(src.requests.map((r) => r.bandId))],
      input: physical,
      multicore,
      presetId: head.instrument,
      notes: src.requests.map((r) => r.notes).filter(Boolean).join('; ') || undefined,
    });
  });

  conflicts.push(...detectPatchConflicts(channels));

  return {
    event,
    inventory,
    bands,
    channels,
    multicoreLayout: [...runs.values()],
    conflicts,
  };
}

/**
 * Problems visible only once every channel has a physical input: two channels
 * on one connector, and phantom power forced onto a line shared with a source
 * that cannot take it.
 */
function detectPatchConflicts(channels: PlannedChannel[]): Conflict[] {
  const conflicts: Conflict[] = [];
  const byConnector = new Map<string, PlannedChannel[]>();

  for (const ch of channels) {
    const key = `${ch.input.device}:${ch.input.connector}`;
    const list = byConnector.get(key) ?? [];
    list.push(ch);
    byConnector.set(key, list);
  }

  for (const [key, list] of byConnector) {
    if (list.length > 1) {
      conflicts.push({
        severity: 'error',
        code: 'duplicate-physical-input',
        message: `Input ${key} is patched to ${list.length} channels: ${list.map((c) => c.name).join(', ')}.`,
        refs: list.map((c) => String(c.channelNumber)),
      });
    }
  }

  // Phantom power is switched per input on this console, so a condenser and a
  // dynamic sharing one snake is not a hazard and is not flagged here. The real
  // phantom risk — a ribbon mic — is not something a rider reliably states, so
  // guessing at it would produce warnings the crew learns to ignore.

  return conflicts;
}
