"""
Providence Christian Academy -> iCalendar (.ics) feed.

The school's public calendar (Finalsite) does not offer a subscribe link, so this
script reads the public calendar page month by month and writes a standard .ics
file that Home Assistant's "Remote Calendar" integration (or Google Calendar)
can subscribe to.

Usage:
    python pca_to_ics.py                     # writes ./pca.ics (this month + next 3)
    python pca_to_ics.py --months 6 --out docs/pca.ics
    python pca_to_ics.py --json events.json  # also dump JSON (used by the demo)

Only uses the Python standard library.
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import re
import sys
import urllib.request

CALENDAR_URL = "https://www.providencechristianacademy.org/about-us/public-calendar"
USER_AGENT = "Mozilla/5.0 (HomeBoard school-feed; family use)"

EVENT_RE = re.compile(
    r'<a class="fsCalendarEventTitle[^"]*"[^>]*title="(?P<title>[^"]*)"[^>]*data-occur-id="(?P<occ>\d+)"'
    r'(?P<rest>.*?)(?=<a class="fsCalendarEventTitle|<div class="fsCalendarDaybox|$)',
    re.S,
)
DATE_BOX_RE = re.compile(
    r'<div class="fsCalendarDate" data-day="(?P<d>\d+)" data-year="(?P<y>\d+)" data-month="(?P<m>\d+)"'
)
START_RE = re.compile(r'<time datetime="(?P<dt>[^"]+)" class="fsStartTime"')
END_RE = re.compile(r'<time datetime="(?P<dt>[^"]+)" class="fsEndTime"')
LOC_RE = re.compile(r'<div class="fsLocation">(?P<loc>.*?)</div>', re.S)


def fetch(month: dt.date) -> str:
    url = f"{CALENDAR_URL}?cal_date={month:%Y-%m-01}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", "replace")


def parse(page: str) -> list[dict]:
    events = []
    # Split the page into day boxes so all-day events still get a date.
    boxes = DATE_BOX_RE.split(page)
    # split() returns [pre, d, y, m, body, d, y, m, body, ...]
    for i in range(1, len(boxes) - 3, 4):
        day, year, month0, body = boxes[i], boxes[i + 1], boxes[i + 2], boxes[i + 3]
        date = dt.date(int(year), int(month0) + 1, int(day))  # Finalsite months are 0-based
        for m in EVENT_RE.finditer(body):
            rest = m.group("rest")
            start = START_RE.search(rest)
            end = END_RE.search(rest)
            loc = LOC_RE.search(rest)
            events.append(
                {
                    "uid": f"pca-{m.group('occ')}@providencechristianacademy.org",
                    "summary": html.unescape(m.group("title")).strip(),
                    "date": date.isoformat(),
                    "start": start.group("dt") if start else None,
                    "end": end.group("dt") if end else None,
                    "location": html.unescape(re.sub(r"<[^>]+>", "", loc.group("loc"))).strip() if loc else "",
                }
            )
    return events


def ics_escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def to_ics(events: list[dict]) -> str:
    now = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//HomeBoard//PCA school feed//EN",
        "CALSCALE:GREGORIAN",
        "X-WR-CALNAME:Providence Christian Academy",
        "X-WR-TIMEZONE:America/New_York",
    ]
    for e in events:
        lines += ["BEGIN:VEVENT", f"UID:{e['uid']}", f"DTSTAMP:{now}"]
        if e["start"]:
            s = dt.datetime.fromisoformat(e["start"])
            en = dt.datetime.fromisoformat(e["end"]) if e["end"] else s + dt.timedelta(hours=1)
            lines.append(f"DTSTART:{s.astimezone(dt.timezone.utc):%Y%m%dT%H%M%SZ}")
            lines.append(f"DTEND:{en.astimezone(dt.timezone.utc):%Y%m%dT%H%M%SZ}")
        else:
            d = dt.date.fromisoformat(e["date"])
            lines.append(f"DTSTART;VALUE=DATE:{d:%Y%m%d}")
            lines.append(f"DTEND;VALUE=DATE:{d + dt.timedelta(days=1):%Y%m%d}")
        lines.append(f"SUMMARY:{ics_escape(e['summary'])}")
        if e["location"]:
            lines.append(f"LOCATION:{ics_escape(e['location'])}")
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--months", type=int, default=4, help="months to fetch, starting this month")
    ap.add_argument("--out", default="pca.ics")
    ap.add_argument("--json", default=None)
    args = ap.parse_args()

    today = dt.date.today().replace(day=1)
    seen: dict[str, dict] = {}
    for k in range(args.months):
        y, m = divmod(today.month - 1 + k, 12)
        month = dt.date(today.year + y, m + 1, 1)
        try:
            for e in parse(fetch(month)):
                seen[e["uid"]] = e
        except Exception as exc:  # keep going if one month fails
            print(f"warning: {month:%Y-%m} failed: {exc}", file=sys.stderr)

    events = sorted(seen.values(), key=lambda e: (e["start"] or e["date"]))
    with open(args.out, "w", encoding="utf-8", newline="") as f:
        f.write(to_ics(events))
    if args.json:
        with open(args.json, "w", encoding="utf-8") as f:
            json.dump(events, f, indent=1)
    print(f"wrote {len(events)} events to {args.out}")
    return 0 if events else 1


if __name__ == "__main__":
    sys.exit(main())
