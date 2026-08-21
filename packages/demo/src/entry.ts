/**
 * Everything the demo page needs, exposed as one global.
 *
 * The seed data is imported from the core test fixture rather than copied: it
 * is the same two real riders (Mozaika / Musa Berlin) the planner tests run
 * against, so the demo can never drift from what the engine is tested on.
 */
export {
  buildPlan,
  generateScene,
  toCsv,
  toMarkdown,
  PRESETS,
  STAGE_ZONES,
  M32,
} from '../../core/src/index.js';

export {
  bands as seedBands,
  inventory as seedInventory,
  requests as seedRequests,
  monitorsByZone as seedMonitors,
} from '../../core/test/fixture.js';
