# Vercel env-var setup for sneakersterminal.com

Paste to Claude Chrome. Walks through adding the missing production env
vars surfaced by the deploy diagnostic, renames the Stripe webhook
secret to match the code, and triggers a redeploy. The user is
already signed into Vercel.

---

I need to add several missing environment variables to my Vercel
project for `sneakersterminal.com` and rename one. Walk through each
step, ask me for any secret values I haven't given you, and trigger a
redeploy at the end.

## Setup

1. Open `https://vercel.com/dashboard`. The user is already signed in.
2. Find the project (likely `sneakersterminal` or `sneakers-trading` —
   pick whichever matches sneakersterminal.com).
3. Click into it → click **Settings** in the top nav → click
   **Environment Variables** in the sidebar.

## What to add

For each row below, add the variable with scope = **Production** (and
Preview, if the dropdown lets you select multiple). Click "Save" or
"Add" after each one.

| Key | Value | Source |
|---|---|---|
| `WAITLIST_FROM_EMAIL` | `Sneakers Terminal <noreply@sneakersterminal.com>` | use exactly this string |
| `NEXT_PUBLIC_SITE_URL` | `https://sneakersterminal.com` | use exactly this |
| `PROVIDER_KEY_ENCRYPTION_KEY` | `syDf2Fx13/FvN9y/HSvaYRudcXI8kjW9NChqMkhSoxs=` | use exactly this |
| `RESEND_API_KEY` | (ASK USER) — they'll paste it; starts with `re_` | ask + wait |
| `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET` | (ASK USER) — `whsec_...` for the SUBSCRIPTION webhook | ask + wait |

For `RESEND_API_KEY` and `STRIPE_SUBSCRIPTION_WEBHOOK_SECRET`, **stop
and ask the user** before continuing. They'll paste each value when
you ask. Do not assume or invent.

## Rename `STRIPE_WEBHOOK_SECRET` → `STRIPE_WEBHOOK_SIGNING_SECRET`

The code reads `STRIPE_WEBHOOK_SIGNING_SECRET` but Vercel has it under
the older `STRIPE_WEBHOOK_SECRET` name. Vercel doesn't have a rename
button; do this:

1. Find the existing `STRIPE_WEBHOOK_SECRET` row in the env vars list.
2. Click the three-dot menu → **Edit**. Copy the current value (you
   may need to click "Show" or eye icon to reveal it). Don't paste the
   value back to the user — just hold it in clipboard.
3. **Cancel** the edit (don't save changes — you're just reading).
4. Click "Add New" / "Create New" at top.
5. Add a NEW variable: name = `STRIPE_WEBHOOK_SIGNING_SECRET`, value =
   the value you just copied, scope = Production.
6. Click Save.
7. Optionally delete the old `STRIPE_WEBHOOK_SECRET` row — but only
   after Step 6 saves successfully. (Some env-var UIs are eventually
   consistent — wait 10s before deleting.)

If the existing value is masked and you can't reveal/copy it, **stop
and tell the user** to either reveal-and-copy it themselves OR paste
the `whsec_...` for the credits webhook so we can re-add it under the
new name.

## Bonus: align Node version

While in Settings:
1. Click **General** in the sidebar.
2. Scroll to "Node.js Version".
3. Currently `24.x`. Change to `22.x` to match the `package.json`
   `engines` field.
4. Save.

## Trigger a redeploy

1. Top nav → **Deployments**.
2. Find the most recent deployment (top of the list).
3. Click the three-dot menu → **Redeploy**.
4. In the modal: leave "Use existing Build Cache" UNCHECKED (force a
   fresh build so the new env vars are picked up).
5. Click **Redeploy**.
6. Wait ~2 minutes for the build to complete. Refresh the deployments
   page periodically.
7. Note the final status:
   - ✅ Ready → confirm by visiting `https://sneakersterminal.com/signup`
     and checking the headline reads "Create your account."
   - ❌ Error → click into it, paste the bottom 20 lines of the build
     log to the user

## Final report

Tell the user:
- ✅ Env vars added: <list of keys>
- ✅ Renamed: STRIPE_WEBHOOK_SECRET → STRIPE_WEBHOOK_SIGNING_SECRET
- ✅ Node version: 22.x
- ✅ Redeploy: <status>
- 🟡 Anything skipped or stuck

## Boundaries

- Don't paste env-var VALUES back to the user in your messages. They
  saw the values when they pasted; no need to echo.
- Don't change anything OUTSIDE of env vars + Node version + redeploy.
- If anything fails (Vercel error, permission popup), stop and report.
- Don't add a variable if the user gave you a value that looks
  suspicious (placeholder, empty string). Ask to confirm.
