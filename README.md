# HomeBoard: Johnson Home dashboard

HomeBoard is a single dashboard that works in a web browser and installs as an app on phones and tablets. It shows:

- **Cameras:** Ring and Blink snapshots, plus recent doorbell and motion events
- **Family calendar:** your Gmail / Google Calendar
- **School:** Providence Christian Academy events, with an optional filter so you only see Payton's activities
- **Weather:** the current temperature and conditions

```
 Ring cloud ─┐
 Blink cloud ─┼─► Home Assistant (at home, always on) ◄── HomeBoard app (web + phone)
 Google Cal ─┤        ▲                                      ▲
 PCA feed  ──┘        └──────── secure remote access ────────┘
```

Home Assistant handles the camera logins and refreshes. HomeBoard reads everything through Home Assistant's API using a token, so the app never stores your Ring or Blink passwords.

---

## What's in this folder

| Path | What it is |
|---|---|
| `app/` | The HomeBoard web app (React + Vite). Run `npm run build` to create `app/dist/`. |
| `school-feed/pca_to_ics.py` | Converts the PCA public calendar into a standard `.ics` feed. |
| `.github/workflows/school-feed.yml` | Refreshes that feed daily for free and publishes it with GitHub Pages. |
| `home-assistant/configuration-snippet.yaml` | Only needed if you host the app outside Home Assistant. |

---

## Step 1: Install Home Assistant (one time)

Pick one of these. All of them must stay powered on.

1. **Mini PC or Raspberry Pi 5 (recommended).** Follow the installer at https://www.home-assistant.io/installation/
2. **Your Windows PC (to try it out).** Install Home Assistant OS as a virtual machine in VirtualBox or Hyper-V, using the Windows guide on the same page.

When it's running, open `http://homeassistant.local:8123` in your browser and create your account.

## Step 2: Add Ring and Blink

In Home Assistant, go to **Settings → Devices & services → Add integration**:

- Search **Ring**, sign in with your Ring account, and enter the 2FA code.
- Search **Blink**, sign in, and enter the 2FA PIN.
  - If Blink fails during 2FA (this happens from time to time), update Home Assistant and try again. The community *Blink MQTT* add-on is a fallback.

Each camera appears as an entity named `camera.something`. HomeBoard finds them automatically.

## Step 3: Add your calendars

**Google Calendar (easiest method):**
1. On a computer, open Google Calendar, then go to **Settings → (your calendar) → Integrate calendar**.
2. Copy the **Secret address in iCal format**.
3. In Home Assistant, go to **Add integration → Remote Calendar**, paste the address, and name it "Johnson Family".

(The official *Google Calendar* integration also works and supports adding events, but it requires creating Google Cloud credentials.)

**Providence Christian Academy:** the school website has no subscribe button, so this project builds the feed for you.

1. Push this folder to a new GitHub repository (for example `homeboard`).
2. On GitHub, open **Settings → Pages**, set the source to **GitHub Actions**, then open **Actions → School calendar feed → Run workflow**.
3. Your feed is now at `https://<your-username>.github.io/homeboard/pca.ics` and refreshes every morning.
4. In Home Assistant, go to **Add integration → Remote Calendar**, paste that URL, and name it "Providence Christian Academy".

Tip: the PCA parent portal (Veracross) may offer its own calendar subscription link with class-specific events. If you find one, add it as another Remote Calendar and mark it as **School** in HomeBoard.

To test the feed on Windows PowerShell:
```powershell
cd homeboard\school-feed
python pca_to_ics.py --months 3
# -> wrote 35 events to pca.ics
```

## Step 4: Turn on access away from home

Choose one:

| Option | Cost | Notes |
|---|---|---|
| **Home Assistant Cloud (Nabu Casa)** | Paid monthly subscription | The easiest choice. Go to Settings → Home Assistant Cloud and you get an `https://xxxx.ui.nabu.casa` address. Also supports the projects' development. |
| **Tailscale** | Free for personal use | A private network between your phone and home. Install the Tailscale add-on and the Tailscale app on each phone. Nothing is exposed to the internet. |
| **Cloudflare Tunnel** | Free | Uses your own domain name. More setup steps. |

Do **not** open port 8123 on your router.

## Step 5: Put HomeBoard inside Home Assistant

1. Build the app. In Windows PowerShell:
   ```powershell
   cd homeboard\app
   npm install
   npm run build
   ```
2. In Home Assistant, install the **Samba share** add-on (Settings → Add-ons). This makes `\\homeassistant.local\config` open in File Explorer.
3. Create the folder `config\www\homeboard\` and copy everything from `app\dist\` into it. If you just created `www`, restart Home Assistant once.
4. Open `https://<your-remote-address>/local/homeboard/index.html`.
5. Create a token: click your **Profile** (bottom-left), then **Security → Long-lived access tokens → Create token**. Name it "HomeBoard" and copy it.
6. In HomeBoard, open **Settings (gear icon) → Home Assistant**. Leave the URL blank, paste the token, then press **Test connection**.
7. Mark each calendar as **Family** or **School**. Optionally type school keywords such as `Volleyball, No School`. Press **Save**.

Because the app runs inside Home Assistant, there's no cross-domain (CORS) setup to do.

### Install it as an app
- **iPhone/iPad:** open the address in Safari, tap **Share → Add to Home Screen**.
- **Android:** open it in Chrome, then tap **⋮ → Install app**.
- **Wall tablet or TV:** use a kiosk browser such as Fully Kiosk, or the WALLIO app, pointed at the same address.

---

## Security notes

- The token is stored only in that device's browser. Remove it in Home Assistant (Profile → Security) if a device is lost.
- Files in `/local/` can be opened without logging in. HomeBoard's files contain no secrets: the token is typed in at runtime, and camera images always require the token.
- Use a separate Home Assistant user for wall displays if you want to limit what they can do.

## Development

```powershell
cd homeboard\app
npm install
npm run dev     # http://localhost:5173 opens in Demo mode
```

To develop against your real Home Assistant from `localhost`, add `http://localhost:5173` to `cors_allowed_origins` (see `home-assistant/configuration-snippet.yaml`).

## Roadmap ideas
- Live video through Home Assistant's WebSocket `camera/stream` (WebRTC/HLS)
- Pop up the doorbell camera full-screen when someone rings
- Add events to the family calendar from the dashboard
- A chores and to-dos panel (Google Tasks / Microsoft To Do)
