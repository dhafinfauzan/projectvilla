export function dateKey(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function utcBusinessDate(value: Date | string): Date {
  const key = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : dateKey(value);
  return new Date(`${key}T00:00:00.000Z`);
}

export function stayDates(checkIn: Date | string, checkOut: Date | string): Date[] {
  const start = utcBusinessDate(checkIn);
  const end = utcBusinessDate(checkOut);
  const dates: Date[] = [];
  for (let cursor = start.getTime(); cursor < end.getTime(); cursor += 86_400_000) {
    dates.push(new Date(cursor));
  }
  return dates;
}

export function propertyDateTime(date: string, hour: number): Date {
  return new Date(`${date}T${String(hour).padStart(2, "0")}:00:00`);
}
