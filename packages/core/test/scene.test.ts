import { describe, expect, it } from 'vitest';
import { buildPlan, generateScene, planToSceneLines, PRESETS } from '../src/index.js';
import * as f from '../src/scn/format.js';
import { bands, inventory, monitorsByZone, requests } from './fixture.js';

const event = { name: 'Safed Day 3', date: '2026-08-20', venue: 'Ashtam Stage' };
const plan = buildPlan({ event, inventory, bands, requests, monitorsByZone });

describe('value formatting', () => {
  it('writes levels signed with one decimal', () => {
    expect(f.level(0)).toBe('+0.0');
    expect(f.level(-23)).toBe('-23.0');
    expect(f.level(41)).toBe('+41.0');
  });

  it('writes EQ gain signed with two decimals', () => {
    expect(f.eqGain(-6)).toBe('-6.00');
    expect(f.eqGain(0)).toBe('+0.00');
  });

  it('switches frequency notation at 1 kHz', () => {
    expect(f.freq(232.3)).toBe('232.3');
    expect(f.freq(1390)).toBe('1k39');
    expect(f.freq(10000)).toBe('10k00');
    expect(f.freq(3500)).toBe('3k50');
  });

  it('truncates names to what the scribble strip shows', () => {
    expect(f.scribbleName('Clarinet Wireless Receiver')).toHaveLength(12);
  });

  it('strips quotes that would corrupt the file', () => {
    expect(f.quoted('Say "hi"')).toBe('"Say hi"');
  });
});

describe('scene generation', () => {
  const lines = planToSceneLines(plan);

  it('starts with a scene header', () => {
    expect(lines[0]).toMatch(/^#4\.0# ".*" ".*"/);
  });

  it('emits a routing line naming four input blocks', () => {
    const routing = lines.find((l) => l.startsWith('/config/routing/IN'))!;
    expect(routing.split(/\s+/)).toHaveLength(5);
  });

  it('writes every one of the console channel strips, used or not', () => {
    for (let n = 1; n <= inventory.console.channelStrips; n++) {
      const path = `/ch/${String(n).padStart(2, '0')}/config`;
      expect(lines.some((l) => l.startsWith(path + ' '))).toBe(true);
    }
  });

  it('names each channel from the plan', () => {
    const kick = lines.find((l) => l.startsWith('/ch/01/config'))!;
    expect(kick).toContain('"Kick"');
    expect(kick).toContain(PRESETS.kick.color);
  });

  it('blanks unused strips instead of leaving the previous show on them', () => {
    const last = `/ch/${String(inventory.console.channelStrips).padStart(2, '0')}/config`;
    const line = lines.find((l) => l.startsWith(last))!;
    expect(line).toContain('""');
    expect(line).toContain('OFF');
  });

  it('opens no faders — every channel loads at -oo', () => {
    const mixLines = lines.filter((l) => /^\/ch\/\d\d\/mix /.test(l));
    expect(mixLines).toHaveLength(inventory.console.channelStrips);
    expect(mixLines.every((l) => l.includes('-oo'))).toBe(true);
  });

  it('always writes four EQ bands per channel', () => {
    const bands01 = lines.filter((l) => /^\/ch\/01\/eq\/\d /.test(l));
    expect(bands01).toHaveLength(4);
  });

  it('turns on the channel low cut when the preset defines one', () => {
    const preamp = lines.find((l) => l.startsWith('/ch/01/preamp'))!;
    // Kick preset low-cuts at 30 Hz.
    expect(preamp).toMatch(/ ON 12 30$/);
  });

  it('sets phantom on the head amp of a channel that needs it', () => {
    const qanun = plan.channels.find((c) => c.name === 'Qanun XLR')!;
    const idx = String(32 + qanun.input.busIndex - 1).padStart(3, '0');
    const ha = lines.find((l) => l.startsWith(`/headamp/${idx} `))!;
    expect(ha.endsWith(' ON')).toBe(true);
  });

  it('emits one head amp line per patched channel', () => {
    const ha = lines.filter((l) => l.startsWith('/headamp/'));
    expect(ha).toHaveLength(plan.channels.length);
  });

  it('produces no duplicate OSC paths', () => {
    const paths = lines.filter((l) => l.startsWith('/')).map((l) => l.split(' ', 1)[0]);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('emits nothing but header and OSC paths', () => {
    for (const line of lines.slice(1)) {
      expect(line.startsWith('/')).toBe(true);
    }
  });
});

describe('merging onto a base scene', () => {
  it('replaces the lines it owns and keeps everything else', () => {
    const base = [
      '#4.0# "Old" "note" %000000000 1',
      '/ch/01/config "Old Name" 1 GN 1',
      '/fx/1/type DLY',
      '/dca/1/config "Band" 1 BL',
    ].join('\n');

    const merged = generateScene(plan, { baseScene: base });
    expect(merged).toContain('/fx/1/type DLY');
    expect(merged).toContain('/dca/1/config "Band" 1 BL');
    expect(merged).not.toContain('"Old Name"');
    expect(merged).toContain('/ch/01/config "Kick"');
  });

  it('appends paths the base file does not have', () => {
    const merged = generateScene(plan, { baseScene: '#4.0# "Old" "n" %000000000 1' });
    expect(merged).toContain('/ch/32/config');
    expect(merged).toContain('/headamp/');
  });
});
