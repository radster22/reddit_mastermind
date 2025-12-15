import { addMinutes } from "date-fns";

export function iso(date: Date) {
  return date.toISOString();
}

export function childTimestamp(parent: string) {
  const base = new Date(parent);
  const offset = 5 + Math.floor(Math.random() * 15);
  return iso(addMinutes(base, offset));
}
