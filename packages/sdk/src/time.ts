// Instants and dates as HOS Events writes them: every instant in UTC, every business date in the property's time zone.

// An instant as HOS writes it: UTC, with milliseconds only when there are any.
export function utc(value: string | number) {
  const iso = new Date(value).toISOString();
  return iso.endsWith(".000Z") ? `${iso.slice(0, -5)}Z` : iso;
}

function zonedParts(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(instant));
  return (type: string) => parts.find((item) => item.type === type)!.value;
}

export function localDate(iso: string, timeZone: string) {
  const part = zonedParts(Date.parse(iso), timeZone);
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// The UTC instant of a wall-clock time at the property, such as a 15:00 check-in on 30 July.
export function zonedTimeToUtc(date: string, time: string, timeZone: string) {
  const wall = Date.parse(`${date}T${time.length === 5 ? `${time}:00` : time}Z`);
  const offset = (instant: number) => {
    const part = zonedParts(instant, timeZone);
    return Date.UTC(+part("year"), +part("month") - 1, +part("day"), +part("hour"), +part("minute"), +part("second")) - instant;
  };
  // A second pass settles instants next to a daylight-saving change.
  const first = wall - offset(wall);
  return utc(wall - offset(first));
}
