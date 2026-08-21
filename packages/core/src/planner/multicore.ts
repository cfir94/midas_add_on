import type { Conflict, Multicore, StageZone } from '../models/types.js';

export interface ZoneDemand {
  zone: StageZone;
  /** Channels originating in this zone. */
  inputs: number;
  /** Monitor sends that have to run back out to this zone. */
  returns: number;
}

/** Which multicore serves which stage zone. */
export type ZoneToMulticore = Record<string, string>;

export interface MulticoreAllocation {
  assignment: ZoneToMulticore;
  conflicts: Conflict[];
}

/**
 * Score how well a multicore's name matches a stage zone. Technicians label
 * their snakes by where they run them ("Multi Drums", "\u05de\u05d5\u05dc\u05d8\u05d9 \u05ea\u05d5\u05e4\u05d9\u05dd"), and a patch
 * sheet that sends "Multi Drums" to the keys riser is one the crew will not
 * trust even when it fits electrically. Capacity still decides what is
 * possible; this only decides between options that all fit.
 */
const ZONE_KEYWORDS: Record<StageZone, string[]> = {
  drums: ['drum', 'kit', '\u05ea\u05d5\u05e4'],
  'front-left': ['front l', 'fl', '\u05d8\u05e0\u05d5\u05e8\u05d8 \u05e9\u05de\u05d0\u05dc'],
  'front-center': ['front c', 'center', 'centre', '\u05de\u05e8\u05db\u05d6'],
  'front-right': ['front r', 'fr', '\u05d8\u05e0\u05d5\u05e8\u05d8 \u05d9\u05de\u05d9\u05df'],
  'upstage-left': ['upstage l', 'up l', 'back l', '\u05d0\u05d7\u05d5\u05e8\u05d4 \u05e9\u05de\u05d0\u05dc'],
  'upstage-center': ['upstage c', 'back c', '\u05d0\u05d7\u05d5\u05e8\u05d4 \u05de\u05e8\u05db\u05d6'],
  'upstage-right': ['upstage r', 'up r', 'back r', '\u05d0\u05d7\u05d5\u05e8\u05d4 \u05d9\u05de\u05d9\u05df'],
  foh: ['foh', 'front of house'],
};

function nameAffinity(multicoreName: string, zone: StageZone): boolean {
  const name = multicoreName.toLowerCase();
  return ZONE_KEYWORDS[zone].some((kw) => name.includes(kw));
}

/**
 * Assign each stage zone a multicore from the inventory.
 *
 * Best-fit decreasing: the most demanding zone is placed first into the
 * smallest snake that still fits it. Running a 24-way to a zone with two inputs
 * while the drum zone has nothing left is the failure this ordering avoids.
 * Among snakes that fit, one named for the zone wins.
 *
 * The AI layer may propose a different assignment; whatever it proposes is
 * validated by `validateAssignment` below, so a suggestion that does not fit
 * the real gear is caught rather than trusted.
 */
export function allocateMulticores(
  demands: ZoneDemand[],
  multicores: Multicore[],
): MulticoreAllocation {
  const conflicts: Conflict[] = [];
  const assignment: ZoneToMulticore = {};
  const available = [...multicores].sort((a, b) => a.inputs - b.inputs);
  const taken = new Set<string>();

  const ordered = [...demands]
    .filter((d) => d.inputs > 0 || d.returns > 0)
    .sort((a, b) => b.inputs + b.returns - (a.inputs + a.returns));

  for (const demand of ordered) {
    const fits = available.filter(
      (m) =>
        !taken.has(m.name) && m.inputs >= demand.inputs && m.outputs >= demand.returns,
    );
    const fit = fits.find((m) => nameAffinity(m.name, demand.zone)) ?? fits[0];

    if (fit) {
      assignment[demand.zone] = fit.name;
      taken.add(fit.name);
      continue;
    }

    // Nothing fits. Report precisely which constraint failed rather than a
    // generic "no multicore" — the technician needs to know whether to bring a
    // bigger snake or drop a monitor send.
    const spare = available.find((m) => !taken.has(m.name));
    if (spare) {
      assignment[demand.zone] = spare.name;
      taken.add(spare.name);
      conflicts.push({
        severity: 'error',
        code: 'multicore-capacity-exceeded',
        message:
          `Zone "${demand.zone}" needs ${demand.inputs} inputs and ${demand.returns} returns, ` +
          `but "${spare.name}" only carries ${spare.inputs} in / ${spare.outputs} out.`,
        refs: [demand.zone, spare.name],
        suggestion:
          demand.inputs > spare.inputs
            ? 'Split the zone across two snakes, or sub-snake the drum kit.'
            : 'Reduce monitor sends to this zone, or run a separate return line.',
      });
    } else {
      conflicts.push({
        severity: 'error',
        code: 'no-multicore-for-zone',
        message: `No multicore left for zone "${demand.zone}" (${demand.inputs} inputs, ${demand.returns} returns).`,
        refs: [demand.zone],
        suggestion: 'Add a multicore to the inventory, or combine two adjacent zones.',
      });
    }
  }

  return { assignment, conflicts };
}

/**
 * Check an assignment — typically one proposed by the AI stage layout — against
 * the real inventory. Returns the conflicts it would cause; an empty array means
 * the assignment is usable as-is.
 */
export function validateAssignment(
  assignment: ZoneToMulticore,
  demands: ZoneDemand[],
  multicores: Multicore[],
): Conflict[] {
  const conflicts: Conflict[] = [];
  const byName = new Map(multicores.map((m) => [m.name, m]));
  const seen = new Map<string, StageZone>();

  for (const demand of demands) {
    const name = assignment[demand.zone];
    if (!name) {
      if (demand.inputs > 0) {
        conflicts.push({
          severity: 'error',
          code: 'no-multicore-for-zone',
          message: `Zone "${demand.zone}" has ${demand.inputs} inputs but no multicore assigned.`,
          refs: [demand.zone],
        });
      }
      continue;
    }

    const mc = byName.get(name);
    if (!mc) {
      conflicts.push({
        severity: 'error',
        code: 'no-multicore-for-zone',
        message: `Zone "${demand.zone}" is assigned to "${name}", which is not in the inventory.`,
        refs: [demand.zone, name],
      });
      continue;
    }

    const alreadyOn = seen.get(name);
    if (alreadyOn) {
      conflicts.push({
        severity: 'warning',
        code: 'multicore-capacity-exceeded',
        message: `Multicore "${name}" serves both "${alreadyOn}" and "${demand.zone}".`,
        refs: [name, alreadyOn, demand.zone],
        suggestion: 'Confirm the snake physically reaches both positions.',
      });
    }
    seen.set(name, demand.zone);

    if (demand.inputs > mc.inputs) {
      conflicts.push({
        severity: 'error',
        code: 'multicore-capacity-exceeded',
        message: `Zone "${demand.zone}" needs ${demand.inputs} inputs but "${name}" carries ${mc.inputs}.`,
        refs: [demand.zone, name],
      });
    }
    if (demand.returns > mc.outputs) {
      conflicts.push({
        severity: 'error',
        code: 'multicore-capacity-exceeded',
        message: `Zone "${demand.zone}" needs ${demand.returns} returns but "${name}" carries ${mc.outputs}.`,
        refs: [demand.zone, name],
      });
    }
  }

  return conflicts;
}
