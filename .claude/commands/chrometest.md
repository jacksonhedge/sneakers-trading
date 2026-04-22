---
description: Generate a Chrome-extension test prompt from recent UI changes
argument-hint: [optional focus slug, e.g. login-flow, admin-console]
allowed-tools: Bash, Read, Write, Glob, Grep
---

# /chrometest — generate a Claude Chrome test prompt

Your job is to produce a **browser-automation test prompt** the user will paste into their Claude Chrome extension. The Chrome extension can navigate URLs, click, type, take screenshots, and read DOM/Gmail — it CANNOT run shell commands, curl APIs, or query databases. Design the prompt around what a browser can observe.

## Focus

If the user passed args, use them as a hint for which changes to test:

```
$ARGUMENTS
```

If no args, infer the focus from the most recent work on this branch.

## Step 1 — Identify recent UI changes

Run these to get the picture:

```bash
cd ~/sneakers-trading
git log --oneline -10
git diff HEAD~5..HEAD --stat -- 'apps/platform/src/app/**/*.tsx' 'apps/platform/src/app/**/*.ts'
```

Look especially at files under `apps/platform/src/app/` — `page.tsx`, form components, new routes. Skim the diffs for:
- New routes / pages added under `apps/platform/src/app/*`
- Changes to forms, buttons, copy on existing pages
- New user-facing flows (sign-up, login, referral, etc.)
- Text strings that would be visible in the DOM (the browser can grep for them)

If `$ARGUMENTS` is set, narrow the scope to changes matching that slug; otherwise cover the last session's worth of UI work.

## Step 2 — Decide the slug

Pick a short kebab-case slug that describes what the prompt tests. Examples:
- `login-clubhouse` if recent work was login + auto-invite
- `admin-console` if recent work was the /admin UI
- `hero-copy-v2` if it was a landing-page rewrite

If the user passed `$ARGUMENTS`, use that as the slug (normalized). Otherwise synthesize one from the commit subjects.

Your output file path is:

```
docs/prompts/chrome-test-<slug>.md
```

## Step 3 — Write the prompt

Follow the style of existing prompts in `docs/prompts/` (read a couple first, e.g. `configure-supabase-auth.md`, `auth-e2e-test.md`) — Task block, Prerequisites, numbered Steps, screenshot asks. Match tone and formatting.

The generated prompt MUST:

1. **Start with a Task paragraph** saying what's being tested and on which URL (default to `https://sneakersterminal.com` unless the recent changes clearly reference localhost or a preview URL).

2. **List prerequisites**: logged into Gmail as the test account, logged-out state in the target site so the flow starts clean, any specific browser state (e.g. cookies cleared).

3. **Use numbered Steps, one action per step.** Each step is ONE of:
   - Navigate to a URL
   - Click a specific element (describe it by visible label, not CSS selector)
   - Type a specific value into a specific field
   - Verify specific text appears in the DOM (`expect to see "..."`)
   - Take a screenshot and describe what should be in it
   - Open Gmail, find an email, screenshot, click a link

4. **Include a "confirm" bullet after every Step** — the literal thing the agent should see. Chrome agents drift if you don't pin them to observable state.

5. **Cover the happy path first**, then one or two edge cases that would be browser-observable (invalid email rejected, button disabled on empty input, etc.). Don't try to test anything that requires DB/API inspection — Chrome can't see that.

6. **End with a Report section** that asks the agent to summarize PASS/FAIL per step with screenshots attached.

7. **Avoid anything Chrome-can't-do**: no curl, no pnpm, no file reads, no regex grepping of response bodies. If a change can only be verified via API/DB, note it as out-of-scope and suggest the user run the corresponding Claude Code prompt instead.

## Step 4 — Save + print

Write the prompt to `docs/prompts/chrome-test-<slug>.md`.

Then echo the entire prompt contents back to the user in a single fenced markdown block so they can copy-paste it into Claude Chrome with one click. Before the fenced block, give a one-line summary of what the prompt covers and the file path for their records.

Don't commit the file — let the user commit when ready.

## Notes / gotchas

- Gmail interactions are delicate — Chrome agents sometimes lose the thread navigating in and out of mail. Keep Gmail steps minimal (find email by subject line, click the main CTA button, done).
- Claude Chrome can't access `chrome://`, `about:`, or extension internals. Stick to your app's URLs and Gmail.
- Don't require the user to have specific test accounts seeded unless the recent work obviously depends on that (e.g. Clubhouse auto-invite needs a referrer with ≥2 referrals; browser can't set that up, so either seed first or mark it out-of-scope).
- For admin-only pages: assume the user already has admin access (magic-link flow works end-to-end) and write the prompt from that starting point, since the prereq "admin can log in" is what the magic-link test covers anyway.
