# Dev-server smoke test — single-market page

Target: `http://localhost:3000/dashboard/markets/kalshi/KXNBASPREAD-26APR23DENMIN-MIN14`

The app is running in **Next.js 16 dev mode via Turbopack** (not a production build), so expect:

- First page load can take 1-3 seconds as Turbopack compiles on demand.
- React DevTools messages in the console are normal.
- `[Fast Refresh]` messages in the console are normal.
- A 307 redirect to `/signup` or `/login` on first hit means you're not signed in. Sign in, then hit the URL again.

## What counts as a failure

Only report these as ❌ — everything else is noise in dev mode:

1. **Runtime React error** — red Next.js error overlay, or console messages matching `Uncaught`, `Error:`, `TypeError:`, `Cannot read`, `is not a function`.
2. **Hydration mismatch warning** — console message containing `hydration failed` or `Text content did not match`.
3. **HTTP 5xx** from any request in the Network panel.
4. **HTTP 404** for any JS/CSS/font/image asset (route 307s to login are fine; those aren't 404s).
5. **Blank screen** — the page finishes loading but shows no content.
6. **Layout collapse** — the 3-column layout breaks below ~1200px viewport or overlaps badly.
7. **Dead theme toggle** — clicking the theme button in the topbar doesn't change colors.

## The smoke run

Do these in order. Stop and report the first hard failure.

1. **Load the page.** Take a screenshot. Note the time-to-render.
2. **Open DevTools → Console** and DevTools → Network (preserve log, disable cache). Hard-reload (Cmd-Shift-R). Record any errors from the lists above.
3. **Click the theme toggle** (`☀ Light` button in the topbar, right side). It should cycle Light → Dark → Rainbow → Light. Screenshot each state.
4. **Click `← Markets`** in the breadcrumb. You should land on `/markets`. Hit back.
5. **Type `nba` in the search input** and press Enter. You should land on `/markets?q=nba`. Hit back.
6. **Drag the AMOUNT slider** in the right trade panel from 0 to ~50%. The dollar readout, fill bar, and `TO WIN` value should update live. No console errors during drag.
7. **Click the NO button** (right outcome tile in the trade panel). It should light up red; the `TO WIN` should recompute.
8. **Edit any file** (I'll do that — you don't need to). Confirm Fast Refresh applies without a full page reload. **Skip this step if you can't observe it — just move on.**

## Reporting format

```
## Smoke result
Overall: PASS | FAIL | PARTIAL

## Load
- time-to-render: <ms or sec>
- screenshot: <attach>

## Theme cycle
- Light → Dark: ✅/❌
- Dark → Rainbow: ✅/❌
- Rainbow → Light: ✅/❌
- screenshots: <attach each>

## Navigation
- breadcrumb Markets link: ✅/❌
- search submit: ✅/❌

## Trade panel
- slider: ✅/❌ (<note if live-updating or glitchy>)
- NO button: ✅/❌

## Console/Network failures
<paste only entries matching the "What counts as a failure" list — not all console output>
```

If step 1 or step 2 fails, stop immediately and report just that. No point continuing through a broken page.
