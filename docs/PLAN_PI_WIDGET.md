# Sneakers Pi Widget — portable mini-terminal

Written 2026-04-24. Companion to PLAN_AUTONOMOUS_BOTS.md and the existing
Mac-based Sneakers Terminal hardware bundle. The Pi widget is the cheap,
portable, "always next to you" version — desk widget for one person, not
common-room install for a frat.

## TL;DR

**Mac Studio** = always-on common-room install for a frat ($199/mo bundled).
**MacBook Pro** = mobile chapter terminal, hybrid trips ($199/mo bundled).
**Pi Widget** = personal desk companion. ~$80 BOM. Sells direct or bundled
with Terminal tier. Shows your bot's live state at a glance, runs O'Toole
voice, pings you on fills.

The Mac is the trading floor. The Pi is the ticker watch on your desk.

---

## The product shape

A 4–5" e-ink or small color display + Pi Zero 2 W (or Pi 5 if we want full
power) in a custom 3D-printed case with the Sneakers wordmark. Sits on a
dorm desk or nightstand. Wifi-connected. No keyboard, no mouse — passive
display + capacitive button or rotary encoder for a few interactions.

**What it shows by default**:
- Top: Bot status pill (`ACTIVE` / `PAUSED` / `IDLE`)
- Middle: Today's P&L in big tabular numbers
- Bottom: Last trade — market name + outcome + ±$
- Tiny scroll line: live arb scanner alert when one fires

**What it does on button press**:
- Single tap: cycle screens (P&L → next trade → top arb → leaderboard rank)
- Long press: pause bot for 24h (matches the dashboard kill switch)
- Double tap: open O'Toole voice — speaks current state, can take a voice command back ("what's the best market right now")

**Audio**: tiny piezo buzzer for trade fill alerts (off by default — enabled in app settings). One short beep on win, descending double on loss.

**LED**: single RGB LED on the case edge. Green pulsing = bot running well. Amber = paused. Red blinking = needs attention (low budget, error, kill-switch tripped).

---

## Why Pi (vs other options we'd consider)

| Option | Cost | Pros | Cons |
|---|---|---|---|
| **Pi Zero 2 W** | $15 board + $30 display + $15 case = **~$60-80** | Tiny, well-supported, vast community, Wi-Fi built-in | Limited compute — no on-device LLM |
| **Pi 5** | $80 board + $40 display + $20 case = **~$140** | More compute, 2× USB, better thermal | Overkill for a widget; bigger case |
| **ESP32 + e-ink** | ~$25 BOM | Cheapest, instant-on, low power | Bare-metal C/Rust dev, no Python ecosystem, harder for app updates |
| **Custom PCB** | $40+/unit at scale | Cleanest UX | Capital cost, lead time, hardware bugs are deadly |
| **Existing devices** (Apple Watch, etc.) | $0 hardware | No inventory | Can't differentiate; just an app |

**Verdict**: Pi Zero 2 W for the test cohort. Cheapest path that lets us iterate fast. The hardware ecosystem (HATs, displays, cases) is mature. We can ship 50 units to college testers at ~$80 each — $4K total — to learn what they actually want.

If feedback says "wish it were instant-on without a 30-second boot," graduate to ESP32 for V2. If feedback says "wish it could run O'Toole on-device," graduate to Pi 5.

---

## BOM for the test unit

| Item | Source | Qty | Unit cost |
|---|---|---|---|
| Raspberry Pi Zero 2 W | Adafruit / official distributor | 1 | $15 |
| 4.0" e-ink display HAT (Waveshare 4.01") OR 3.5" color TFT | Waveshare / Adafruit | 1 | $30-50 |
| MicroSD card 32GB (Class 10) | Amazon | 1 | $8 |
| USB-C power adapter (5V 2.5A) | Amazon | 1 | $7 |
| 3D-printed case (custom, sneakers branding) | Local print shop / JLCPCB / Shapeways | 1 | $8-15 |
| WS2812B single LED + resistor | Adafruit | 1 | $1 |
| Piezo buzzer | DigiKey | 1 | $1 |
| Capacitive touch button OR rotary encoder | Adafruit | 1 | $3-7 |
| Misc wiring + standoffs | DigiKey | — | $3 |
| **Total per unit** | | | **~$76-100** |

At scale (500+ units) we'd source a custom PCB that replaces the discrete components, dropping BOM to ~$40 and giving us a cleaner enclosure.

---

## Software stack

**OS**: Raspberry Pi OS Lite (no desktop env, headless from day one)

**App**: Python 3 service that:
1. Authenticates to Sneakers via long-lived API token (issued from `/dashboard/devices`)
2. Subscribes to Supabase Realtime for the user's `bot_trade_attempts` channel
3. Polls the latest snapshot of bot state every 60 sec (fallback if Realtime drops)
4. Renders to the display
5. Listens to button input
6. Optional: runs `aplay` for buzzer beeps + WS2812 LED control via `rpi_ws281x`

**Repo location**: new top-level `apps/widget/` (alongside `apps/platform`, `apps/trader`, `apps/ios`).

**Structure**:
```
apps/widget/
├── README.md              # setup instructions for testers
├── pyproject.toml         # uv / pip deps
├── src/
│   ├── main.py           # entry point, async loop
│   ├── auth.py           # device-token bootstrap
│   ├── realtime.py       # Supabase Realtime client
│   ├── render.py         # display drawing logic
│   ├── input.py          # button + encoder handling
│   ├── led.py            # WS2812 control
│   ├── audio.py          # buzzer beeps
│   └── config.py         # YAML config (display type, brightness, etc)
├── systemd/
│   └── sneakers-widget.service  # auto-start on boot
└── flash/
    └── flash.sh          # one-command image flasher (curl | sh)
```

**Update mechanism**: `apt`-installed package would be ideal but overkill at MVP. Start with: `git pull && systemctl restart sneakers-widget` driven by a daily cron. When we're at 100+ units, switch to a proper Mender / RAUC OTA system.

---

## Backend integration — what Sneakers needs to add

A new table for device-level auth + telemetry:

```sql
CREATE TABLE user_devices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_type     text NOT NULL,                -- 'pi_widget' | 'mac_studio' | 'macbook_pro' | 'ios'
  device_token    text NOT NULL UNIQUE,         -- long-lived bearer for the device's API calls
  device_label    text,                         -- user-set: "desk widget", "frat house Mac", etc
  last_seen_at    timestamptz,
  firmware_version text,
  paired_at       timestamptz NOT NULL DEFAULT now(),
  revoked_at      timestamptz                   -- user can revoke via /dashboard/devices
);

CREATE INDEX user_devices_user_idx ON user_devices (user_id) WHERE revoked_at IS NULL;
```

A new endpoint pair:

- `POST /api/devices/pair` — user-authed, generates a 6-digit pairing code displayed on the Pi during setup. Pi POSTs the code + its hardware ID to claim a device_token.
- `GET /api/devices/state` — device-token-authed, returns the user's bot summary in compact JSON for the Pi to render. Cache for 30 sec.

```json
{
  "bot": { "status": "active", "paused_until": null },
  "today": { "trades": 4, "pnl_usd": 8.30, "budget_remaining_usd": 41.70 },
  "last_trade": {
    "market": "Lakers @ Warriors ML",
    "outcome": "Lakers",
    "stake": 5.00,
    "result": "won",
    "pnl": 1.25,
    "at": "2026-04-24T22:14:00Z"
  },
  "top_arb": {
    "market": "BTC > $100k EOM",
    "edge_pp": 4.2,
    "expires_at": "2026-04-24T22:18:00Z"
  },
  "rank": { "school": 14, "global": 287 }
}
```

A new dashboard page `/dashboard/devices` for users to:
- See paired devices + last_seen
- Generate pairing codes for new ones
- Revoke a stolen / lost device's token
- Set the device's label

---

## UX flows

### First-time setup (the hard part)

The Pi has no keyboard. Wifi credentials need to be entered somehow. Standard pattern for headless IoT:

1. Out of the box, Pi boots into "config mode" — runs a captive-portal Wi-Fi access point named `sneakers-setup-XXXX`
2. User connects their phone to that AP, opens any browser → redirected to `http://192.168.4.1`
3. Web form on the Pi asks for their home Wi-Fi SSID + password + a Sneakers pairing code
4. User generates the pairing code in the Sneakers app at `/dashboard/devices/pair`
5. Pi joins the home Wi-Fi, redeems the pairing code with our API → gets device_token
6. Boots into widget mode showing the bot's state

**5-minute setup. No SSH, no terminal, no SD card flashing for the user.**

We'd ship the SD card pre-flashed; user just plugs in power and follows the phone instructions.

### Daily use

Mostly passive — user glances at it. Useful interactions:

- **Bot just filled a winning trade** → green LED pulse + cheerful chime + display flashes the trade for 5 sec
- **Daily P&L breaches threshold** → amber LED + steady display showing details
- **Bot paused itself after losing streak** → red blink + display says "Paused: 3 losses in 1h. Resume in app."
- **Long press button** → bot pauses for 24h. Display confirms.
- **Double-tap button** → mic activates, plays "What can I help with?" — voice query routes to O'Toole, response plays through the buzzer (text-to-speech via Pi-side library or server-side via OpenAI TTS)

---

## Pricing options

### Option A — sell direct, one-time
- $99 retail, ~$80 cost = ~20% margin
- Ship to user, they self-setup
- One-time revenue, no recurring
- Risk: support load on SD-card flashing failures, Wi-Fi setup failures

### Option B — bundle with Terminal tier
- Free with first month of Terminal ($99) when you sign up for annual
- "Sneakers ships you a Pi widget on us" as a marketing hook
- Locks in annual contracts (annual is $948 vs $99/mo × 12 = $1,188 — they save $240 = subsidize the $80 widget easily)
- We eat the BOM but get LTV in exchange

### Option C — sell the Pi as a referral reward
- Refer 5 friends to Terminal tier → get a free widget
- Strong organic-growth lever
- Cost: ~$80 per 5 acquisitions = $16 CAC, much cheaper than paid ads

**Recommendation**: launch with **Option C** (referral reward only) for the first 100 units. Tests demand without committing to retail logistics. If 100 widgets ship and create chatter, expand to **Option B**. **Option A** retail comes last (or never, if logistics is too painful).

---

## Distribution + logistics

For the first 50 units (test cohort):

- Order parts on Amazon / Adafruit (~$4K all-in)
- Hand-assemble in evenings (10 min/unit × 50 = ~8 hours)
- Pre-flash SD cards via a script (1 min/unit)
- Ship via USPS Ground Advantage in padded envelopes ($5 each)
- Tracking number into a Supabase row tied to the `user_devices` table

For 50–500 units:
- Contract with a Shenzhen-based small-batch assembler (typical lead time 2-3 weeks)
- Custom PCB via JLCPCB once design is locked
- Direct ship from the assembler to US users

For 500+: real fulfillment partner (ShipBob, Easyship). Custom retail packaging with sneakers wordmark + "powered by Sneakers Terminal" small print.

---

## Risks

1. **Setup friction kills the experience.** If 1 in 5 testers can't get past Wi-Fi pairing, we lose the cohort. Mitigation: test the captive-portal flow with non-technical users before shipping. Have a phone support line for the first 50 testers.

2. **E-ink refresh rate is slow.** Updates take 1-3 sec on big partial refreshes. Trade-fill alerts feel laggy. Mitigation: use a small color TFT instead of e-ink for trade-fill flashes; e-ink for the steady-state display only.

3. **Pi reliability over time.** SD card corruption is the #1 Pi failure mode. Mitigation: use industrial-grade SD cards ($15 instead of $8), add daily auto-restart cron, log to remote (Supabase logs) so we see crashes.

4. **App-Store-style reviews.** No app store, but if a Pi widget ships glitchy, social media will roast it. Mitigation: only ship to users who opt into a "first 100 testers" agreement that explicitly says "this is beta hardware, bugs expected, free repair/replace."

5. **Regulatory.** If the widget displays gambling odds, some jurisdictions might consider it gambling-adjacent. Mitigation: it shows the user's OWN bot state, not generic odds. They had to opt into the bot already. Same regulatory surface as the app, no incremental risk.

---

## Rollout phases

### Phase 1 — Engineering proof (~2 weeks)
- Build 1 working unit on a breadboard
- Pi Zero 2 W + Waveshare 4.0" e-ink + WS2812 LED + buzzer
- Python service polls a fake /api/devices/state response from localhost
- Renders the basic 3-line layout (status, P&L, last trade)
- Buttons work (single tap = cycle screens)
- Goal: prove the hardware + software path works end-to-end

### Phase 2 — Backend + pairing flow (~1 week, parallel to Phase 1)
- `user_devices` table migration
- POST /api/devices/pair + GET /api/devices/state
- /dashboard/devices page in the web app
- Captive-portal Wi-Fi setup script on the Pi
- Goal: a tester can take a flashed SD card, plug into a Pi, follow phone instructions, end up with a working widget

### Phase 3 — Pilot cohort (~3 weeks)
- Buy parts for 50 units
- 3D print 50 cases (1 weekend with a friend's Bambu Lab, or hire a local print shop ~$300)
- Hand-assemble + flash + ship to 50 verified students
- Tester agreement: $0 cost, return after 60 days OR $50 keeper fee
- Goal: gather feedback. What do they show people? What annoys them? What features get used?

### Phase 4 — Cleanup + scale to 500 (~6 weeks)
- Custom PCB design replacing breadboard wiring
- Better case (rev 2 based on feedback)
- Contract assembler for batch of 500
- Open as a referral reward (Option C)
- Goal: ship to first 500 paying-Terminal users at $0 CAC

### Phase 5 — Retail + bundle expansion (open-ended)
- Sell standalone for $99 if there's demand
- Bundle with annual Terminal subscriptions
- V2 hardware exploration (ESP32 for instant-on, or Pi 5 for on-device O'Toole)

---

## Brand fit

The Pi widget is *deeply* on-brand:

- **"The terminal everywhere"** — desktop Pi widget + Mac trading floor + iOS in your pocket = Sneakers is wherever you are
- **Hardware + software is hard to copy** — software-only competitors can't ship you a thing
- **Network effects** — every dorm room with a glowing Sneakers widget is free advertising
- **Premium feel at low price** — $80 BOM that looks like a $200 product because of the case + decals

Compare to Bloomberg's terminal hardware (the dedicated keyboard) — that's half of what makes Bloomberg feel premium. We're doing the same thing for college, at 1/30th the cost.

---

## Open questions

1. **Voice input feasibility on a Pi Zero 2 W?** The Pi has limited compute. We might need to send audio to a server for STT, then play the response back. Acceptable latency? Test before committing.

2. **Do we ship batteries or wall-power only?** Battery-powered makes it more "widget" feel, but doubles BOM and complicates safety. MVP: USB-C wall power only, button-cell for the LED to keep state during reboots.

3. **What if the Pi gets stolen?** The device_token can be revoked from the dashboard, but the device itself can be flashed back to factory. Probably fine — user just revokes and orders another.

4. **OS updates.** Long-term, we need a way to push firmware updates without users SSHing in. Mender / RAUC adds complexity. For MVP, daily `apt update + git pull` cron is fine.

5. **Lego mode — can users print their own case?** STL files released under MIT, custom cases encouraged. Pro: maker community engagement. Con: support headache when their print fits but breaks the buttons.

---

## What this enables (and why it matters)

- **Marketing**: every dorm with a glowing Sneakers widget = free organic reach. One Reddit post of "look what I got from my fraternity's Sneakers signup" = 50K impressions.
- **Lock-in**: someone with a physical device on their desk is way less likely to churn. 6-month retention probably 2-3x app-only users.
- **Pricing power**: "the company that sends you a Pi widget" is differentiated enough that we can hold $99/mo Terminal pricing while competitors race to $19.

Conservative model: ship 1,000 widgets in year 1 to Terminal subscribers (referral reward + free-with-annual). At $80 BOM and $99/mo retention floor, even one extra month of retention pays for the unit. Anything beyond that is upside.

---

## Starting point for the next session

If picking this up cold:

1. Read PLAN_AUTONOMOUS_BOTS.md — the widget is the visible front end of the bot platform
2. Order 1 of each part on Adafruit: Pi Zero 2 W ($15), 4" e-ink HAT ($40), WS2812 LED strip ($5), piezo buzzer ($1), 32GB SD card ($8). Total ~$80 to start.
3. Install Raspberry Pi Imager, flash latest Pi OS Lite to the SD
4. SSH in over USB OTG, install Python deps
5. Wire the breadboard, run the e-ink Hello World example
6. Start the `apps/widget/` Python service skeleton
7. Mock the API response, render the layout

Hardware in hand → first working widget in a long evening.

---

## Review cadence

After Phase 1 ships (1 working unit), revisit. After Phase 3 ships (50 units in users' hands), revisit hard with feedback data. Don't let hardware roadmap drift past Phase 3 without learning.
