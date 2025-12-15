import { addDays, startOfWeek } from "date-fns";

export type Persona = {
  persona_username: string;
  persona_description: string;
};

export type Assignment = {
  persona: Persona;
  date: Date;
};

const timeWindows = [
  { start: 9, end: 12 },
  { start: 12, end: 15 },
  { start: 15, end: 19 }
];

export function randomizeWeekSlots(count: number): Date[] {
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const chosen = days.sort(() => 0.5 - Math.random()).slice(0, count);
  return chosen.map((day) => {
    const slot = timeWindows[Math.floor(Math.random() * timeWindows.length)];
    const hour =
      slot.start + Math.floor(Math.random() * (slot.end - slot.start));
    const dt = new Date(day);
    dt.setHours(hour, Math.floor(Math.random() * 60), 0, 0);
    return dt;
  });
}

export function assignPersonasToPosts(
  personas: Persona[],
  postsPerWeek: number
): { persona: Persona; date: Date }[] {
  if (!personas.length) return [];

  const assignments: Assignment[] = [];
  const personaCounts: Record<string, number> = {};
  const dates = randomizeWeekSlots(postsPerWeek);

  for (let i = 0; i < postsPerWeek; i++) {
    const sorted = [...personas].sort(
      (a, b) =>
        (personaCounts[a.persona_username] || 0) -
        (personaCounts[b.persona_username] || 0)
    );
    const persona =
      sorted.find((p) => (personaCounts[p.persona_username] || 0) < 3) ||
      sorted[0];

    personaCounts[persona.persona_username] =
      (personaCounts[persona.persona_username] || 0) + 1;

    assignments.push({ persona, date: dates[i] });
  }

  return assignments;
}
