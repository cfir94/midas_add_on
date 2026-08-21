# Fixtures

Real documents from live events, kept as the yardstick for the ingest stage.

- `mega-patch-day3.pdf` — a megapatch written by hand for a two-band festival
  day (Mozaika / Musa Berlin, Safed 2025). The extraction stage is measured
  against this: feed it the two bands' tech riders and the resulting plan should
  land close to what a technician actually produced.

The machine-readable version of the same event lives in
`packages/core/test/fixture.ts`, where it drives the planner tests.
