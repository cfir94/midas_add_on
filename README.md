# StagePatch

Turn tech riders into a megapatch, and a megapatch into a MIDAS M32 scene file.

A live sound technician handed several bands' tech riders has to merge them into
one plan: decide the channel order, share what can be shared, run multicores to
the right places, and then program the console by hand — patch, names, colours,
low cut, EQ, gate, compressor. It takes hours, and it happens again at the next
event.

StagePatch does that chain: **riders → megapatch → `.scn` scene file**.

## Where this can and cannot run

The M32 runs closed firmware with no SDK and no third-party app platform, so
nothing can run *on* the console. The two ways in are:

1. **Scene files** — `.scn` is a line-based ASCII format the console loads from
   a USB stick. This is what StagePatch generates today.
2. **OSC over the network** — live parameter control. Planned, not built.

## Layout

```
packages/core/          Pure logic. No network, no UI, no API keys.
  models/types.ts       The vocabulary: ChannelRequest, MegapatchPlan, Inventory
  presets/library.ts    Per-instrument EQ / gate / compressor starting points
  planner/merge.ts      Collapsing several bands' riders into shared channels
  planner/multicore.ts  Assigning snakes to stage zones within real capacity
  planner/plan.ts       Building the plan and reporting every conflict
  export/megapatch.ts   The patch sheet as CSV / Markdown
  scn/generate.ts       The scene file
fixtures/               Real megapatches, used to measure the ingest stage
```

`packages/core` has no external dependencies, so the whole planner and scene
generator can be tested without a console and without an API key.

## Design commitments

**Conflicts are never swallowed.** If a source does not fit — no input left, no
snake big enough, more sources than channel strips — it is reported by name with
a suggested fix. A plan that silently drops a channel is worse than no plan.

**Presets are a table, not a model.** EQ and dynamics come from a fixed
per-instrument library, so the same instrument gets the same starting point
every time. These are conservative starting points to arrive at soundcheck with,
not a finished mix.

**Faders load closed.** Every channel is written at `-oo`. A scene that loads
with open faders is a scene that hurts a room.

**Unused strips are written out.** A blank strip is emitted explicitly rather
than left alone, so the previous show cannot bleed into this one.

**AI proposes, code verifies.** The stage layout can be suggested by a model,
but `validateAssignment` checks it against the real inventory — a suggestion
that does not fit the gear becomes a conflict rather than a silent mistake.

## Scene file format

Verified against a scene saved by a real console. Lines this generator owns:

```
#4.0# "Safed Day 3" "Ashtam 2026-08-20" %000000000 1
/config/routing/IN A1-8 A9-16 A17-24 AN25-32
/ch/01/config "Kick" 2 RD 1
/ch/01/preamp +0.0 OFF ON 12 30
/ch/01/gate ON GATE -35.0 25.0 1 40 200 0
/ch/01/dyn ON COMP RMS LIN -20.0 4.0 2 3.00 12 0.03 180 POST 0 100 OFF
/ch/01/eq/1 LCut 30.0 +0.00 2.0
/headamp/000 +20.0 OFF
```

`generateScene(plan, { baseScene })` merges onto a scene exported from your own
console, replacing only the paths above and carrying every other parameter
through untouched. **This is the recommended path** — it guarantees the file has
the full parameter set the console expects.

> **Not yet verified on hardware.** The format matches a real scene file, but no
> generated scene has been loaded into an M32 yet. Do that — on the console or
> in M32-Edit's offline mode — before trusting one at a show.

## Running it

```sh
npm install
npm test          # 43 tests, no console or API key needed
npm run typecheck
```

## Not built yet

- Ingest: riders (PDF / image / spreadsheet, Hebrew and English) → `ChannelRequest[]`
- Web UI: inventory, upload, the editable megapatch grid, export
- Live OSC push
- Other consoles — the plan model is already console-agnostic
