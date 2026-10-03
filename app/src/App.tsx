import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_SETTINGS,
  activityFrom,
  camerasFrom,
  getEvents,
  getStates,
  guessCalendarRoles,
  listCalendars,
  ping,
  weatherFrom,
  type Activity,
  type CalEvent,
  type Camera,
  type Settings,
  type Weather,
} from "./ha";
import { demoActivity, demoCameras, demoEvents, demoWeather } from "./demo";

/* ---------- persistence (falls back to memory where storage is blocked) ---------- */
const KEY = "homeboard.settings.v1";
let memory: Settings | null = null;
function loadSettings(): Settings {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return memory ?? DEFAULT_SETTINGS;
}
function saveSettings(s: Settings) {
  memory = s;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

/* ---------- helpers ---------- */
const DAY = 86400000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const fmtTime = (d: Date) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
function relative(d: Date, now: Date) {
  const m = Math.round((now.getTime() - d.getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
function dayLabel(d: Date, now: Date) {
  const diff = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / DAY);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return d.toLocaleDateString([], { weekday: "long" });
}
const WEATHER: Record<string, string> = {
  "clear-night": "Clear", cloudy: "Cloudy", fog: "Fog", hail: "Hail", lightning: "Storms",
  "lightning-rainy": "Storms", partlycloudy: "Partly cloudy", pouring: "Heavy rain", rainy: "Rain",
  snowy: "Snow", "snowy-rainy": "Sleet", sunny: "Sunny", windy: "Windy", exceptional: "Alert",
};

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/* ---------- icons ---------- */
const Icon = {
  logo: (
    <svg viewBox="0 0 32 32" width="28" height="28" aria-label="HomeBoard" fill="none">
      <path d="M4 15 16 5l12 10" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="8" y="15" width="16" height="12" rx="2.5" stroke="currentColor" strokeWidth="2.6" />
      <circle cx="16" cy="21" r="2.6" fill="var(--accent)" />
    </svg>
  ),
  gear: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  ),
  motion: (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="2" /><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19 5a10 10 0 0 1 0 14M5 19A10 10 0 0 1 5 5" />
    </svg>
  ),
  pin: (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" /><circle cx="12" cy="9" r="2.5" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  ),
};

/* ---------- data hook ---------- */
type Data = {
  cameras: Camera[];
  events: CalEvent[];
  activity: Activity[];
  weather: Weather;
  error: string | null;
  loading: boolean;
  updated: Date | null;
};

function useDashboardData(settings: Settings) {
  const [data, setData] = useState<Data>({ cameras: [], events: [], activity: [], weather: null, error: null, loading: true, updated: null });

  const refresh = useCallback(async () => {
    const now = new Date();
    if (settings.mode === "demo") {
      setData({ cameras: demoCameras, events: demoEvents(now), activity: demoActivity(now), weather: demoWeather, error: null, loading: false, updated: now });
      return;
    }
    try {
      const [states, cals] = await Promise.all([getStates(settings), listCalendars(settings)]);
      const names = Object.fromEntries(cals.map((c) => [c.entity_id, c.name]));
      const events = await getEvents(settings, startOfDay(now), new Date(startOfDay(now).getTime() + 14 * DAY), names);
      setData({
        cameras: camerasFrom(settings, states),
        events,
        activity: activityFrom(states),
        weather: weatherFrom(states),
        error: null,
        loading: false,
        updated: new Date(),
      });
    } catch (e: any) {
      setData((d) => ({ ...d, loading: false, error: e?.message ?? "Could not reach Home Assistant" }));
    }
  }, [settings]);

  useEffect(() => {
    setData((d) => ({ ...d, loading: true }));
    refresh();
    const t = setInterval(refresh, 60000);
    return () => clearInterval(t);
  }, [refresh]);

  return { ...data, refresh };
}

/* ---------- components ---------- */
function Header({ now, weather, settings, error, onSettings }: { now: Date; weather: Weather; settings: Settings; error: string | null; onSettings: () => void }) {
  const live = settings.mode === "live";
  return (
    <header className="header">
      <div className="brand">
        <span className="brand-mark">{Icon.logo}</span>
        <div>
          <div className="brand-name">Johnson Home</div>
          <div className="brand-sub">Grayson, GA</div>
        </div>
      </div>
      <div className="clock" data-testid="text-clock">
        <span className="clock-time">{now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
        <span className="clock-date">{now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</span>
      </div>
      <div className="header-right">
        {weather && (
          <div className="weather" data-testid="text-weather">
            <span className="weather-temp">{weather.temp}°</span>
            <span className="weather-cond">{WEATHER[weather.condition] ?? weather.condition}</span>
          </div>
        )}
        <span className={`status ${error ? "is-error" : live ? "is-live" : "is-demo"}`} data-testid="status-connection">
          <span className="dot" />
          {error ? "Offline" : live ? "Live" : "Demo"}
        </span>
        <button className="icon-btn" onClick={onSettings} aria-label="Settings" data-testid="button-settings">
          {Icon.gear}
        </button>
      </div>
    </header>
  );
}

function CameraTile({ cam, tick, onOpen }: { cam: Camera; tick: number; onOpen: () => void }) {
  const [failed, setFailed] = useState(false);
  return (
    <button className="cam" onClick={onOpen} data-testid={`card-camera-${cam.id}`}>
      {!failed ? (
        <img src={cam.snapshot(tick)} alt={`${cam.name} camera`} loading="lazy" onError={() => setFailed(true)} onLoad={() => setFailed(false)} />
      ) : (
        <div className="cam-fallback">Snapshot unavailable</div>
      )}
      <div className="cam-meta">
        <span className="cam-name">{cam.name}</span>
        <span className={`chip chip-${cam.brand.toLowerCase()}`}>{cam.brand}</span>
      </div>
    </button>
  );
}

function CameraModal({ cam, onClose, haUrl }: { cam: Camera; onClose: () => void; haUrl: string }) {
  const [tick, setTick] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 2000);
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => { clearInterval(t); window.removeEventListener("keydown", k); };
  }, [onClose]);
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={cam.name} onClick={onClose}>
      <div className="modal-card cam-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">{cam.name}</div>
            <div className="muted small">{cam.brand} · refreshing every 2s</div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close" data-testid="button-close-camera">{Icon.close}</button>
        </div>
        <img className="cam-big" src={cam.snapshot(tick)} alt={`${cam.name} camera`} />
        {haUrl !== null && (
          <div className="modal-foot">
            <span className="muted small">For two-way talk and recordings, open the camera in the {cam.brand === "Blink" ? "Blink" : "Ring"} or Home Assistant app.</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ActivityList({ items, now }: { items: Activity[]; now: Date }) {
  return (
    <section className="panel activity" aria-label="Recent activity">
      <div className="panel-head"><h2>Recent activity</h2></div>
      {items.length === 0 ? (
        <p className="muted small empty">No motion or doorbell events yet.</p>
      ) : (
        <ul>
          {items.map((a) => (
            <li key={a.id} data-testid={`row-activity-${a.id}`}>
              <span className={`act-icon ${a.kind}`}>{a.kind === "ding" ? Icon.bell : Icon.motion}</span>
              <span className="act-label">{a.label}<span className="muted"> · {a.kind === "ding" ? "Doorbell" : "Motion"}</span></span>
              <span className="act-time">{relative(a.at, now)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type Filter = "all" | "family" | "school";

function Agenda({ events, now, keywords, loading }: { events: CalEvent[]; now: Date; keywords: string; loading: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const kw = keywords.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);

  const groups = useMemo(() => {
    const from = startOfDay(now).getTime();
    const to = from + 10 * DAY;
    const list = events
      .filter((e) => e.start.getTime() >= from && e.start.getTime() < to)
      .filter((e) => (e.end ? e.end.getTime() : e.start.getTime() + 3600000) > now.getTime() || e.allDay || startOfDay(e.start).getTime() > from)
      .filter((e) => filter === "all" || e.source === filter)
      .filter((e) => e.source !== "school" || kw.length === 0 || kw.some((k) => e.title.toLowerCase().includes(k)))
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    const map = new Map<number, CalEvent[]>();
    for (const e of list) {
      const k = startOfDay(e.start).getTime();
      map.set(k, [...(map.get(k) ?? []), e]);
    }
    return [...map.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, filter, keywords, Math.floor(now.getTime() / 60000)]);

  const counts = {
    family: events.filter((e) => e.source === "family" && e.start >= startOfDay(now)).length,
    school: events.filter((e) => e.source === "school" && e.start >= startOfDay(now)).length,
  };

  return (
    <section className="panel agenda" aria-label="Upcoming events">
      <div className="panel-head">
        <h2>Coming up</h2>
        <div className="seg" role="tablist">
          {(["all", "family", "school"] as Filter[]).map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)} data-testid={`button-filter-${f}`}>
              {f === "all" ? "All" : f === "family" ? "Family" : "PCA"}
            </button>
          ))}
        </div>
      </div>
      <div className="legend">
        <span><i className="sw family" />Family calendar</span>
        <span><i className="sw school" />Providence Christian Academy</span>
      </div>
      <div className="agenda-scroll">
        {loading && groups.length === 0 ? (
          <div className="skeleton-list">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" />)}</div>
        ) : groups.length === 0 ? (
          <p className="muted empty">
            {counts.family + counts.school === 0 ? "No calendars connected yet. Add them in Settings." : "Nothing scheduled in the next 10 days."}
          </p>
        ) : (
          groups.map(([day, list]) => (
            <div className="day" key={day}>
              <div className="day-head">
                <span className="day-name">{dayLabel(new Date(day), now)}</span>
                <span className="day-date">{new Date(day).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
              </div>
              <ul>
                {list.map((e) => (
                  <li key={e.id} className={`ev ${e.source}`} data-testid={`row-event-${e.id}`}>
                    <span className="ev-time">{e.allDay ? "All day" : fmtTime(e.start)}</span>
                    <span className="ev-body">
                      <span className="ev-title">{e.title}</span>
                      {e.location && <span className="ev-loc">{Icon.pin}{e.location}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function SettingsSheet({ initial, onSave, onClose }: { initial: Settings; onSave: (s: Settings) => void; onClose: () => void }) {
  const [s, setS] = useState<Settings>(initial);
  const [cals, setCals] = useState<{ entity_id: string; name: string }[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const test = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const m = await ping(s);
      const list = await listCalendars(s);
      setCals(list);
      if (s.familyCalendars.length + s.schoolCalendars.length === 0) {
        const g = guessCalendarRoles(list);
        setS((x) => ({ ...x, familyCalendars: g.family, schoolCalendars: g.school }));
      }
      setMsg({ ok: true, text: `${m}. Found ${list.length} calendar${list.length === 1 ? "" : "s"}.` });
    } catch (e: any) {
      setMsg({ ok: false, text: `${e?.message ?? e}. Check the URL, token, and CORS settings (see README).` });
    } finally {
      setBusy(false);
    }
  };

  const toggle = (key: "familyCalendars" | "schoolCalendars", id: string) =>
    setS((x) => {
      const other = key === "familyCalendars" ? "schoolCalendars" : "familyCalendars";
      const has = x[key].includes(id);
      return { ...x, [key]: has ? x[key].filter((i) => i !== id) : [...x[key], id], [other]: x[other].filter((i) => i !== id) };
    });

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="Settings" onClick={onClose}>
      <div className="modal-card settings" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title">Settings</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close" data-testid="button-close-settings">{Icon.close}</button>
        </div>

        <div className="field">
          <span className="label">Data source</span>
          <div className="seg wide">
            <button className={s.mode === "demo" ? "on" : ""} onClick={() => setS({ ...s, mode: "demo" })} data-testid="button-mode-demo">Demo data</button>
            <button className={s.mode === "live" ? "on" : ""} onClick={() => setS({ ...s, mode: "live" })} data-testid="button-mode-live">Home Assistant</button>
          </div>
        </div>

        {s.mode === "live" && (
          <>
            <label className="field">
              <span className="label">Home Assistant URL</span>
              <input value={s.haUrl} onChange={(e) => setS({ ...s, haUrl: e.target.value.trim() })} placeholder="Leave blank if this app is hosted inside Home Assistant" data-testid="input-ha-url" />
              <span className="hint">Example: https://abc123.ui.nabu.casa</span>
            </label>
            <label className="field">
              <span className="label">Long-lived access token</span>
              <input type="password" value={s.token} onChange={(e) => setS({ ...s, token: e.target.value.trim() })} placeholder="Profile → Security → Long-lived access tokens" data-testid="input-ha-token" />
              <span className="hint">Stored only on this device.</span>
            </label>
            <button className="btn" onClick={test} disabled={busy || !s.token} data-testid="button-test-connection">
              {busy ? "Connecting…" : "Test connection"}
            </button>
            {msg && <p className={`msg ${msg.ok ? "ok" : "bad"}`} data-testid="status-test">{msg.text}</p>}

            {cals.length > 0 && (
              <div className="field">
                <span className="label">Calendars</span>
                <div className="cal-table">
                  {cals.map((c) => (
                    <div className="cal-row" key={c.entity_id}>
                      <span className="cal-name">{c.name}</span>
                      <button className={`pill ${s.familyCalendars.includes(c.entity_id) ? "on family" : ""}`} onClick={() => toggle("familyCalendars", c.entity_id)}>Family</button>
                      <button className={`pill ${s.schoolCalendars.includes(c.entity_id) ? "on school" : ""}`} onClick={() => toggle("schoolCalendars", c.entity_id)}>School</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <label className="field">
          <span className="label">Only show school events containing</span>
          <input value={s.schoolKeywords} onChange={(e) => setS({ ...s, schoolKeywords: e.target.value })} placeholder="e.g. Volleyball, Middle School, No School" data-testid="input-school-keywords" />
          <span className="hint">Comma-separated. Leave blank to show every PCA event.</span>
        </label>

        <div className="modal-foot right">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => onSave(s)} data-testid="button-save-settings">Save</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- app ---------- */
export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [openCam, setOpenCam] = useState<Camera | null>(null);
  const now = useNow(1000);
  const tick = Math.floor(now.getTime() / 10000) * 10000; // camera snapshot refresh every 10s
  const data = useDashboardData(settings);

  return (
    <div className="app">
      <Header now={now} weather={data.weather} settings={settings} error={data.error} onSettings={() => setShowSettings(true)} />

      {data.error && (
        <div className="banner" role="alert" data-testid="status-error">
          {data.error} <button className="link" onClick={() => setShowSettings(true)}>Open settings</button>
        </div>
      )}

      <main className="grid">
        <section className="panel cams" aria-label="Cameras">
          <div className="panel-head">
            <h2>Cameras</h2>
            <span className="muted small">{data.cameras.length} online · updated {data.updated ? relative(data.updated, now) : "—"}</span>
          </div>
          {data.loading && data.cameras.length === 0 ? (
            <div className="cam-grid">{[0, 1, 2, 3].map((i) => <div key={i} className="cam skeleton" />)}</div>
          ) : data.cameras.length === 0 ? (
            <p className="muted empty">No cameras found. Add the Ring and Blink integrations in Home Assistant.</p>
          ) : (
            <div className="cam-grid">
              {data.cameras.map((c) => <CameraTile key={c.id} cam={c} tick={tick} onOpen={() => setOpenCam(c)} />)}
            </div>
          )}
        </section>

        <ActivityList items={data.activity} now={now} />
        <Agenda events={data.events} now={now} keywords={settings.schoolKeywords} loading={data.loading} />
      </main>

      {openCam && <CameraModal cam={openCam} haUrl={settings.haUrl} onClose={() => setOpenCam(null)} />}
      {showSettings && (
        <SettingsSheet
          initial={settings}
          onClose={() => setShowSettings(false)}
          onSave={(s) => { saveSettings(s); setSettings(s); setShowSettings(false); }}
        />
      )}
    </div>
  );
}
