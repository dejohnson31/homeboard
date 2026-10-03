import type { Activity, CalEvent, Camera, Weather } from "./ha";
import pca from "./demo-pca.json";

// Demo data so the dashboard is usable before Home Assistant is connected.
// School events are the real Providence Christian Academy public calendar
// (captured by school-feed/pca_to_ics.py); family events are made up.

const img = (f: string) => (bust: number) => `${import.meta.env.BASE_URL}demo/${f}.jpg?_=${Math.floor(bust / 60000)}`;

export const demoCameras: Camera[] = [
  { id: "camera.front_door", name: "Front Door", brand: "Ring", state: "idle", snapshot: img("cam-front-door") },
  { id: "camera.driveway", name: "Driveway", brand: "Ring", state: "idle", snapshot: img("cam-driveway") },
  { id: "camera.backyard", name: "Backyard", brand: "Blink", state: "idle", snapshot: img("cam-backyard") },
  { id: "camera.side_gate", name: "Side Gate", brand: "Blink", state: "idle", snapshot: img("cam-side-gate") },
];

export function demoActivity(now: Date): Activity[] {
  const ago = (m: number) => new Date(now.getTime() - m * 60000);
  return [
    { id: "a1", label: "Front Door", kind: "ding", at: ago(14) },
    { id: "a2", label: "Driveway", kind: "motion", at: ago(37) },
    { id: "a3", label: "Backyard", kind: "motion", at: ago(126) },
    { id: "a4", label: "Front Door", kind: "motion", at: ago(190) },
  ];
}

export const demoWeather: Weather = { condition: "partlycloudy", temp: 74, unit: "°F" };

export function demoEvents(now: Date): CalEvent[] {
  const at = (dayOffset: number, h: number, m = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const fam = (id: string, title: string, s: Date, durMin: number, location?: string): CalEvent => ({
    id,
    title,
    start: s,
    end: new Date(s.getTime() + durMin * 60000),
    allDay: false,
    location,
    source: "family",
    calendarName: "Johnson Family (Google)",
  });
  const family: CalEvent[] = [
    fam("f1", "Payton piano lesson", at(0, 16, 30), 45, "Grayson Music Studio"),
    fam("f2", "Trash & recycling out", at(0, 20, 0), 15),
    fam("f3", "Family dinner at Grandma's", at(1, 18, 0), 120, "Snellville"),
    fam("f4", "Dentist — Payton", at(3, 9, 30), 60, "Gwinnett Family Dental"),
    fam("f5", "Millay — book club", at(4, 19, 0), 120),
    fam("f6", "Hawks preseason game", at(5, 19, 30), 180, "State Farm Arena"),
    fam("f7", "HOA meeting", at(8, 18, 30), 60, "Clubhouse"),
  ];
  const school: CalEvent[] = (pca as any[]).map((e) => {
    const start = e.start ? new Date(e.start) : (() => { const [y, m, d] = e.date.split("-").map(Number); return new Date(y, m - 1, d); })();
    return {
      id: e.uid,
      title: e.summary,
      start,
      end: e.end ? new Date(e.end) : null,
      allDay: !e.start,
      location: e.location,
      source: "school" as const,
      calendarName: "Providence Christian Academy",
    };
  });
  return [...family, ...school];
}
