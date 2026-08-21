import type { MegapatchPlan, PlannedChannel, PhysicalInput } from '../models/types.js';
import { getPreset, RATIO_VALUES, type ChannelPreset } from '../presets/library.js';
import * as f from './format.js';

export interface GenerateOptions {
  /** Scene name written into the file header, max 12 characters. */
  sceneName?: string;
  /** Free-text note stored alongside the scene. */
  sceneNote?: string;
  /**
   * A scene file saved from a real console. When supplied, only the lines this
   * generator owns are replaced and every other parameter is carried through
   * untouched. This is the recommended path: it guarantees the file contains
   * the full parameter set the console expects.
   */
  baseScene?: string;
}

/**
 * X32/M32 routing is assigned in blocks of eight inputs, so the input source a
 * channel can reach is decided by which device feeds its block. Channel N reads
 * from global input slot N under the default one-to-one channel source mapping.
 */
const ROUTING_BLOCK_SIZE = 8;

/** Routing block tokens the console understands for the `/config/routing/IN` line. */
const ROUTING_TOKENS: Record<string, string[]> = {
  LOCAL: ['AN1-8', 'AN9-16', 'AN17-24', 'AN25-32'],
  'AES50-A': ['A1-8', 'A9-16', 'A17-24', 'A25-32'],
  'AES50-B': ['B1-8', 'B9-16', 'B17-24', 'B25-32'],
  CARD: ['card1-8', 'card9-16', 'card17-24', 'card25-32'],
};

/**
 * Decide the four input routing blocks from where each block's channels
 * physically arrive. A block is fed by whichever device the majority of its
 * channels use; mixed blocks are reported as a conflict by the planner, so by
 * the time a plan reaches here the majority is normally unanimous.
 */
function routingBlocks(channels: PlannedChannel[]): string[] {
  const blocks: string[] = [];
  for (let b = 0; b < 4; b++) {
    const first = b * ROUTING_BLOCK_SIZE + 1;
    const last = first + ROUTING_BLOCK_SIZE - 1;
    const inBlock = channels.filter(
      (c) => c.channelNumber >= first && c.channelNumber <= last,
    );
    const tally = new Map<string, number>();
    for (const c of inBlock) {
      tally.set(c.input.busType, (tally.get(c.input.busType) ?? 0) + 1);
    }
    let winner: PhysicalInput['busType'] = 'LOCAL';
    let best = 0;
    for (const [bus, count] of tally) {
      if (count > best) {
        best = count;
        winner = bus as PhysicalInput['busType'];
      }
    }
    blocks.push(ROUTING_TOKENS[winner]![b]!);
  }
  return blocks;
}

function configLine(ch: PlannedChannel, preset: ChannelPreset): string {
  // `/ch/NN/config "name" icon color source`
  // Source is the global input slot, which under block routing equals the
  // channel's index within its bus.
  const source = ch.input.busIndex;
  return `/ch/${f.ch2(ch.channelNumber)}/config ${f.quoted(f.scribbleName(ch.name))} ${preset.icon} ${preset.color} ${source}`;
}

function preampLine(ch: PlannedChannel, preset: ChannelPreset): string {
  // `/ch/NN/preamp trim invert hpf-on hpf-slope hpf-freq`
  // The channel low cut is driven by the preset's LCut band when it has one.
  const lcut = preset.eq.find((b) => b.type === 'LCut');
  const hpfOn = f.onOff(Boolean(lcut));
  const hpfFreq = lcut ? Math.round(lcut.freq) : 100;
  return `/ch/${f.ch2(ch.channelNumber)}/preamp ${f.level(0)} OFF ${hpfOn} 12 ${hpfFreq}`;
}

function gateLines(ch: PlannedChannel, preset: ChannelPreset): string[] {
  const g = preset.gate;
  const n = f.ch2(ch.channelNumber);
  return [
    `/ch/${n}/gate ${f.onOff(g.on)} ${g.mode} ${f.level(g.threshold)} ${g.range.toFixed(1)} ${f.ms(g.attack)} ${f.ms(g.hold)} ${f.ms(g.release)} 0`,
    `/ch/${n}/gate/filter OFF 3.0 ${f.freq(1390)}`,
  ];
}

function dynLines(ch: PlannedChannel, preset: ChannelPreset): string[] {
  const d = preset.dyn;
  const n = f.ch2(ch.channelNumber);
  const ratio = RATIO_VALUES[d.ratio] ?? RATIO_VALUES[6]!;
  return [
    `/ch/${n}/dyn ${f.onOff(d.on)} ${d.mode} ${d.detection} ${d.envelope} ${f.level(d.threshold)} ${ratio.toFixed(1)} ${d.knee} ${d.makeupGain.toFixed(2)} ${f.ms(d.attack)} 0.03 ${f.ms(d.release)} ${d.position} 0 100 OFF`,
    `/ch/${n}/dyn/filter OFF 3.0 ${f.freq(1390)}`,
  ];
}

function eqLines(ch: PlannedChannel, preset: ChannelPreset): string[] {
  const n = f.ch2(ch.channelNumber);
  const lines = [`/ch/${n}/eq ${f.onOff(preset.eq.length > 0)}`];

  // The console always has four bands. Anything the preset does not define is
  // written flat so a reloaded scene cannot inherit a previous band's setting.
  const bands = preset.eq.slice(0, 4);
  const defaults: Array<[string, number]> = [
    ['LCut', 100],
    ['PEQ', 500],
    ['PEQ', 2000],
    ['HShv', 10000],
  ];
  for (let i = 0; i < 4; i++) {
    const band = bands[i];
    if (band) {
      lines.push(
        `/ch/${n}/eq/${i + 1} ${band.type} ${f.freq(band.freq)} ${f.eqGain(band.gain)} ${f.q(band.q)}`,
      );
    } else {
      const [type, hz] = defaults[i]!;
      lines.push(`/ch/${n}/eq/${i + 1} ${type} ${f.freq(hz)} ${f.eqGain(0)} ${f.q(2)}`);
    }
  }
  return lines;
}

function mixLines(ch: PlannedChannel): string[] {
  const n = f.ch2(ch.channelNumber);
  // Faders start down. A scene that loads with open faders is a scene that
  // blows up a room, so this is deliberate and not a placeholder.
  const lines = [`/ch/${n}/mix ON -oo ON +0 OFF -oo`];
  for (let bus = 1; bus <= 16; bus++) {
    lines.push(`/ch/${n}/mix/${f.ch2(bus)} ON -oo +0 PRE`);
  }
  return lines;
}

/** Head amp index for a physical input, as addressed by `/headamp/NNN`. */
function headampIndex(input: PhysicalInput): number {
  // 0..31 are the local XLR inputs; AES50-A starts at 32 and AES50-B at 80.
  const base = { LOCAL: 0, 'AES50-A': 32, 'AES50-B': 80, CARD: 0 }[input.busType];
  return base + (input.busIndex - 1);
}

function headampLine(ch: PlannedChannel, preset: ChannelPreset): string {
  const phantom = ch.phantom || preset.phantom;
  return `/headamp/${f.ha3(headampIndex(ch.input))} ${f.level(preset.gain)} ${f.onOff(phantom)}`;
}

/** Every scene line this generator owns, in console load order. */
export function planToSceneLines(plan: MegapatchPlan, options: GenerateOptions = {}): string[] {
  const name = f.scribbleName(options.sceneName ?? plan.event.name);
  const note = options.sceneNote ?? `${plan.event.venue} ${plan.event.date}`;

  const lines: string[] = [
    `#4.0# ${f.quoted(name)} ${f.quoted(note)} %000000000 1`,
    `/config/routing/IN ${routingBlocks(plan.channels).join(' ')}`,
  ];

  const byNumber = new Map(plan.channels.map((c) => [c.channelNumber, c]));
  const strips = plan.inventory.console.channelStrips;

  for (let n = 1; n <= strips; n++) {
    const ch = byNumber.get(n);
    if (ch) {
      const preset = getPreset(ch.presetId);
      lines.push(
        configLine(ch, preset),
        preampLine(ch, preset),
        ...gateLines(ch, preset),
        ...dynLines(ch, preset),
        ...eqLines(ch, preset),
        ...mixLines(ch),
      );
    } else {
      // Unused strips are written out explicitly. Leaving them alone would let
      // whatever the console had loaded before bleed into the new show.
      const spare = getPreset('spare');
      const blank: PlannedChannel = {
        channelNumber: n,
        name: '',
        instrument: 'spare',
        sourceType: 'line',
        phantom: false,
        stageZone: 'foh',
        requestIds: [],
        bandIds: [],
        input: { device: 'local', connector: n, busType: 'LOCAL', busIndex: n },
        presetId: 'spare',
      };
      lines.push(
        configLine(blank, spare),
        preampLine(blank, spare),
        ...gateLines(blank, spare),
        ...dynLines(blank, spare),
        ...eqLines(blank, spare),
        ...mixLines(blank),
      );
    }
  }

  for (const ch of plan.channels) {
    lines.push(headampLine(ch, getPreset(ch.presetId)));
  }

  return lines;
}

/**
 * Merge generated lines onto a base scene, replacing a base line whenever the
 * generator owns the same OSC path and appending anything the base lacks. This
 * preserves every parameter the generator does not model.
 */
function mergeOntoBase(base: string, generated: string[]): string {
  const pathOf = (line: string) => line.split(/\s+/, 1)[0] ?? '';
  const overrides = new Map(generated.map((l) => [pathOf(l), l]));
  const used = new Set<string>();

  const merged = base.split(/\r?\n/).map((line) => {
    const path = pathOf(line);
    const override = overrides.get(path);
    if (override && path.startsWith('/')) {
      used.add(path);
      return override;
    }
    return line;
  });

  for (const line of generated) {
    const path = pathOf(line);
    if (path.startsWith('/') && !used.has(path)) merged.push(line);
  }
  return merged.join('\n');
}

/** Render a plan as the text content of a `.scn` file. */
export function generateScene(plan: MegapatchPlan, options: GenerateOptions = {}): string {
  const lines = planToSceneLines(plan, options);
  if (options.baseScene) return mergeOntoBase(options.baseScene, lines);
  return lines.join('\n') + '\n';
}
