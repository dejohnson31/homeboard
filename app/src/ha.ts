// Thin Home Assistant REST client.
// Docs: https://developers.home-assistant.io/docs/api/rest/
// Every request sends the long-lived access token as a Bearer header.

export type Settings = {
  mode: "demo" | "live";
  haUrl: string; // "" = same origin (app hosted inside HA at /local/homeboard/)
  token: string;
  familyCalendars: string[]; // calendar.* entity ids shown as "Family"
  schoolCalendars: string[]; // calendar.* entity ids shown as "School"
  schoolKeywords: string; // comma list, e.g. "Volleyball, 6th Grade" (blank = all)
  hiddenCameras: string[];
};

export const DEFAULT_SETTINGS: Settings = {
  mode: "demo",
  haUrl: "",
  token: "",
  familyCalendars: [],
  schoolCalendars: [],
  schoolKeywords: "",
  hiddenCameras: [],
};

export type HAState = {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_changed: string;
  last_updated: string;
};

export type Camera = {
  id: string;
  name: string;
  brand: "Ring" | "Blink" | "Camera";
  snapshot: (bust: number) => string;
  state: string;
};

export type CalEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date | null;
  allDay: boolean;
  location?: string;
  source: "family" | "school";
  calendarName: string;
};

export type Activity = {
  id: string;
  label: string;
  kind: "motion" | "ding";
  at: Date;
};

export type Weather = { condition: string; temp: number; unit: string } | null;

function base(s: Settings) {
  return (s.haUrl || window.location.origin).replace(/\/+$/, "");
}

async function get<T>(s: Settings, path: string): Promise<T> {
  const r = await fetch(base(s) + path, {
    headers: { Authorization: `Bearer ${s.token}`, "Content-Type": "application/json" },
  });
  if (r.status === 401) throw new Error("Home Assistant rejected the token (401).");
  if (!r.ok) throw new Error(`Home Assistant returned ${r.status} for ${path}`);
  return r.json();
}

export async function ping(s: Settings): Promise<string> {
  const r = await get<{ message: string }>(s, "/api/");
  return r.message;
}

export async function listCalendars(s: Settings) {
  return get<{ entity_id: string; name: string }[]>(s, "/api/calendars");
}

export async function getStates(s: Settings) {
  return get<HAState[]>(s, "/api/states");
}

export function brandOf(st: HAState): Camera["brand"] {
  const blob = `${st.entity_id} ${st.attributes.attribution ?? ""} ${st.attributes.friendly_name ?? ""} ${st.attributes.brand ?? ""}`.toLowerCase();
  if (blob.includes("ring")) return "Ring";
  if (blob.includes("blink")) return "Blink";
  return "Camera";
}

export function camerasFrom(s: Settings, states: HAState[]): Camera[] {
  return states
    .filter((st) => st.entity_id.startsWith("camera.") && !s.hiddenCameras.includes(st.entity_id))
    .map((st) => ({
      id: st.entity_id,
      name: st.attributes.friendly_name ?? st.entity_id,
      brand: brandOf(st),
      state: st.state,
      // entity_picture already carries a short-lived access token, so <img> can load it.
      snapshot: (bust: number) =>
        `${base(s)}${st.attributes.entity_picture ?? `/api/camera_proxy/${st.entity_id}`}&_=${bust}`,
    }));
}

export function activityFrom(states: HAState[]): Activity[] {
  return states
    .filter((st) => /^(event|binary_sensor)\..*(ding|motion|doorbell|person)/.test(st.entity_id))
    .map((st) => {
      const at = st.entity_id.startsWith("event.") && st.state !== "unknown" ? new Date(st.state) : new Date(st.last_changed);
      const ding = /ding|doorbell/.test(st.entity_id);
      return {
        id: st.entity_id,
        label: (st.attributes.friendly_name ?? st.entity_id).replace(/\b(motion|ding)\b/gi, "").trim() || st.entity_id,
        kind: ding ? ("ding" as const) : ("motion" as const),
        at,
      };
    })
    .filter((a) => !isNaN(a.at.getTime()))
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 6);
}

export function weatherFrom(states: HAState[]): Weather {
  const w = states.find((st) => st.entity_id.startsWith("weather."));
  if (!w) return null;
  return {
    condition: w.state,
    temp: Math.round(Number(w.attributes.temperature)),
    unit: w.attributes.temperature_unit ?? "°F",
  };
}

type RawEvent = {
  uid?: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  location?: string;
};

function parseHADate(v: { dateTime?: string; date?: string }) {
  if (v.dateTime) return { d: new Date(v.dateTime), allDay: false };
  const [y, m, d] = (v.date ?? "").split("-").map(Number);
  return { d: new Date(y, m - 1, d), allDay: true };
}

export async function getEvents(s: Settings, from: Date, to: Date, names: Record<string, string>): Promise<CalEvent[]> {
  const all = [
    ...s.familyCalendars.map((id) => ({ id, source: "family" as const })),
    ...s.schoolCalendars.map((id) => ({ id, source: "school" as const })),
  ];
  const q = `?start=${encodeURIComponent(from.toISOString())}&end=${encodeURIComponent(to.toISOString())}`;
  const lists = await Promise.all(
    all.map(async ({ id, source }) => {
      const raw = await get<RawEvent[]>(s, `/api/calendars/${id}${q}`);
      return raw.map((e, i): CalEvent => {
        const st = parseHADate(e.start);
        const en = parseHADate(e.end);
        return {
          id: `${id}-${e.uid ?? i}-${st.d.getTime()}`,
          title: e.summary,
          start: st.d,
          end: en.d,
          allDay: st.allDay,
          location: e.location,
          source,
          calendarName: names[id] ?? id,
        };
      });
    }),
  );
  return lists.flat();
}

export function guessCalendarRoles(cals: { entity_id: string; name: string }[]) {
  const school = cals
    .filter((c) => /pca|providence|school|academy/i.test(`${c.entity_id} ${c.name}`))
    .map((c) => c.entity_id);
  const family = cals
    .filter((c) => !school.includes(c.entity_id) && !/holiday|birthday|contacts/i.test(c.name))
    .map((c) => c.entity_id);
  return { school, family };
}
