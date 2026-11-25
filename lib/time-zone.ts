// Calendar math in an IANA time zone, without a date library.

export const TZ_COOKIE = "pa_tz";

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

type Parts = { y: number; m: number; d: number; h: number; min: number; s: number };

function partsIn(date: Date, tz: string): Parts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });
  const get = (t: string) => Number(fmt.formatToParts(date).find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute"), s: get("second") };
}

/** Offset of `tz` from UTC at `date`, in ms (e.g. +8h for Asia/Hong_Kong). */
function offsetMs(date: Date, tz: string): number {
  const p = partsIn(date, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** The instant of local midnight on local calendar date y-m-d (month 1-based; overflow OK). */
function zonedMidnight(y: number, m: number, d: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - offsetMs(new Date(guess), tz);
  t = guess - offsetMs(new Date(t), tz); // second pass handles DST transitions
  return new Date(t);
}

/** Local midnight today, and the next one. */
export function dayBounds(now: Date, tz: string): { start: Date; end: Date } {
  const p = partsIn(now, tz);
  return { start: zonedMidnight(p.y, p.m, p.d, tz), end: zonedMidnight(p.y, p.m, p.d + 1, tz) };
}

/** Local midnight on the 1st of this month, and of next month. */
export function monthBounds(now: Date, tz: string): { start: Date; end: Date } {
  const p = partsIn(now, tz);
  return { start: zonedMidnight(p.y, p.m, 1, tz), end: zonedMidnight(p.y, p.m + 1, 1, tz) };
}
