import type { MegapatchPlan, PlannedChannel } from '../models/types.js';
import { getPreset } from '../presets/library.js';

/** Columns in the order a technician reads a patch sheet. */
const COLUMNS = [
  'Ch',
  'Name',
  'Source',
  'Mic / DI',
  'Phantom',
  'Zone',
  'Multicore',
  'Line',
  'Input',
  'Preset',
  'Bands',
  'Notes',
] as const;

function row(plan: MegapatchPlan, ch: PlannedChannel): string[] {
  const bandNames = ch.bandIds
    .map((id) => plan.bands.find((b) => b.id === id)?.name ?? id)
    .join(' + ');

  return [
    String(ch.channelNumber),
    ch.name,
    ch.sourceType.toUpperCase(),
    ch.micModel ?? '',
    ch.phantom ? '+48V' : '',
    ch.stageZone,
    ch.multicore?.multicore ?? '—',
    ch.multicore ? String(ch.multicore.line) : '—',
    `${ch.input.device} ${ch.input.connector}`,
    getPreset(ch.presetId).description,
    bandNames,
    ch.notes ?? '',
  ];
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * The megapatch as a spreadsheet. This is the document that gets printed and
 * taped to the console, so it carries the physical patch and the snake line
 * numbers — not just what the console ended up set to.
 */
export function toCsv(plan: MegapatchPlan): string {
  const lines = [COLUMNS.join(',')];
  for (const ch of plan.channels) {
    lines.push(row(plan, ch).map(csvCell).join(','));
  }
  return lines.join('\n') + '\n';
}

/** The same sheet as Markdown, for review in a browser or a chat thread. */
export function toMarkdown(plan: MegapatchPlan): string {
  const out: string[] = [
    `# Megapatch — ${plan.event.name}`,
    '',
    `**${plan.event.venue}** · ${plan.event.date} · ${plan.inventory.console.model}`,
    '',
    `| ${COLUMNS.join(' | ')} |`,
    `| ${COLUMNS.map(() => '---').join(' | ')} |`,
  ];

  for (const ch of plan.channels) {
    out.push(`| ${row(plan, ch).map((c) => c.replace(/\|/g, '\\|')).join(' | ')} |`);
  }

  out.push('', '## Stage layout', '');
  for (const run of plan.multicoreLayout) {
    const lines = run.lines.map((l) => l.channelNumber).join(', ');
    out.push(
      `- **${run.multicore}** → ${run.stageZone} — ${run.lines.length} inputs (ch ${lines}), ${run.returnsUsed} returns`,
    );
  }

  if (plan.conflicts.length > 0) {
    out.push('', '## Conflicts', '');
    for (const c of plan.conflicts) {
      const tail = c.suggestion ? ` _${c.suggestion}_` : '';
      out.push(`- **${c.severity.toUpperCase()}** ${c.message}${tail}`);
    }
  } else {
    out.push('', '## Conflicts', '', 'None — the plan fits the inventory.');
  }

  return out.join('\n') + '\n';
}
