/**
 * Value formatting for the X32/M32 scene text format.
 *
 * The console is strict about how numbers are written — it round-trips its own
 * output and rejects shapes it did not produce. These helpers exist so every
 * emitted value goes through one place that matches the observed format of a
 * scene file saved by a real console.
 */

/** Levels and gains: always signed, one decimal. `+0.0`, `-23.0`. */
export function level(db: number): string {
  const v = db.toFixed(1);
  return db >= 0 ? `+${v}` : v;
}

/** EQ gain: always signed, two decimals. `+0.00`, `-6.00`. */
export function eqGain(db: number): string {
  const v = db.toFixed(2);
  return db >= 0 ? `+${v}` : v;
}

/**
 * Frequency. Below 1 kHz the console writes a plain decimal (`232.3`); at and
 * above 1 kHz it writes the `k` notation with the fraction after the k
 * (`1k39` = 1390 Hz, `10k0` = 10000 Hz).
 */
export function freq(hz: number): string {
  if (hz < 1000) return hz.toFixed(1);
  const k = Math.floor(hz / 1000);
  const rem = Math.round((hz - k * 1000) / 10);
  return `${k}k${String(rem).padStart(2, '0')}`;
}

/** Q factor: one decimal. */
export function q(value: number): string {
  return value.toFixed(1);
}

/** Milliseconds: the console writes these as plain integers. */
export function ms(value: number): string {
  return String(Math.round(value));
}

export function onOff(value: boolean): string {
  return value ? 'ON' : 'OFF';
}

/**
 * A scene string field. The console quotes names and escapes nothing, so a
 * quote inside a name would corrupt the file — strip them rather than emit a
 * file the console will refuse to load.
 */
export function quoted(text: string): string {
  return `"${text.replace(/"/g, '')}"`;
}

/**
 * Scribble strip names are limited to 12 characters on the channel display.
 * Longer names are truncated rather than silently mangled by the console.
 */
export const MAX_NAME_LENGTH = 12;

export function scribbleName(text: string): string {
  return text.trim().slice(0, MAX_NAME_LENGTH);
}

/** Two-digit channel index as used in scene paths: `/ch/01/`. */
export function ch2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Three-digit head amp index as used in `/headamp/000`. */
export function ha3(n: number): string {
  return String(n).padStart(3, '0');
}
