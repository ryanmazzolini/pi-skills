import { validateSchedule } from "./index.mjs";

const SEARCH_YEARS = 5;
const MAX_SEARCH_MINUTES = SEARCH_YEARS * 366 * 24 * 60;

function fieldValues(field, minimum, maximum, { normalize = (value) => value } = {}) {
  const values = new Set();
  for (const part of field.split(",")) {
    const [base, stepValue] = part.split("/");
    const step = stepValue === undefined ? 1 : Number(stepValue);
    let start;
    let end;
    if (base === "*") {
      start = minimum;
      end = maximum;
    } else if (base.includes("-")) {
      [start, end] = base.split("-").map(Number);
    } else {
      start = Number(base);
      end = stepValue === undefined ? start : maximum;
    }
    for (let value = start; value <= end; value += step) values.add(normalize(value));
  }
  return values;
}

function compileSchedule(schedule) {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = validateSchedule(schedule).split(" ");
  return {
    minutes: fieldValues(minute, 0, 59),
    hours: fieldValues(hour, 0, 23),
    daysOfMonth: fieldValues(dayOfMonth, 1, 31),
    months: fieldValues(month, 1, 12),
    daysOfWeek: fieldValues(dayOfWeek, 0, 7, { normalize: (value) => value === 7 ? 0 : value }),
    dayOfMonthStartsWildcard: dayOfMonth.startsWith("*"),
    dayOfWeekStartsWildcard: dayOfWeek.startsWith("*"),
  };
}

function matchesDay(compiled, date) {
  if (!compiled.months.has(date.getMonth() + 1)) return false;
  const dayOfMonthMatches = compiled.daysOfMonth.has(date.getDate());
  const dayOfWeekMatches = compiled.daysOfWeek.has(date.getDay());
  return compiled.dayOfMonthStartsWildcard
    ? compiled.dayOfWeekStartsWildcard || dayOfWeekMatches
    : compiled.dayOfWeekStartsWildcard
      ? dayOfMonthMatches
      : dayOfMonthMatches || dayOfWeekMatches;
}

function matches(compiled, date) {
  return matchesDay(compiled, date)
    && compiled.hours.has(date.getHours())
    && compiled.minutes.has(date.getMinutes());
}

function nextDayBoundary(date, direction) {
  const boundary = new Date(date);
  if (direction > 0) boundary.setHours(24, 0, 0, 0);
  else boundary.setHours(0, 0, 0, 0);
  return direction > 0 ? boundary.getTime() : boundary.getTime() - 60_000;
}

function occurrence(schedule, startMilliseconds, direction, maxMinutes) {
  const compiled = compileSchedule(schedule);
  let timestamp = startMilliseconds;
  let searched = 0;
  while (searched <= maxMinutes) {
    const candidate = new Date(timestamp);
    if (matches(compiled, candidate)) return candidate;
    let nextTimestamp = timestamp + direction * 60_000;
    if (!matchesDay(compiled, candidate)) nextTimestamp = nextDayBoundary(candidate, direction);
    const advanced = Math.max(1, Math.round(Math.abs(nextTimestamp - timestamp) / 60_000));
    searched += advanced;
    timestamp = nextTimestamp;
  }
  return undefined;
}

export function nextCronOccurrence(schedule, {
  after = new Date(),
  maxMinutes = MAX_SEARCH_MINUTES,
} = {}) {
  const start = Math.floor(after.getTime() / 60_000) * 60_000 + 60_000;
  return occurrence(schedule, start, 1, maxMinutes);
}

export function previousCronOccurrence(schedule, {
  atOrBefore = new Date(),
  maxMinutes = MAX_SEARCH_MINUTES,
} = {}) {
  const start = Math.floor(atOrBefore.getTime() / 60_000) * 60_000;
  return occurrence(schedule, start, -1, maxMinutes);
}
