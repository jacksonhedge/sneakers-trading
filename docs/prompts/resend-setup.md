# Chrome prompt — Resend API key + domain setup

Creates the production Resend API key, adds it to Vercel, and starts the custom-sender domain verification for `sneakersterminal.com`. Does **not** apply DNS records at Namecheap — those come in a follow-up prompt once we have the exact values Resend wants.

---

Task: set up Resend for the Sneakers Terminal project — generate a production API key, add it to Vercel, and start the domain verification for sneakersterminal.com so we can send from a custom `noreply@sneakersterminal.com` sender instead of the default `onboarding@resend.dev`.

Prerequisites:
- Logged into resend.com (dashboard URL: https://resend.com/overview)
- Logged into vercel.com (project: sneakers-terminal under jackson-fitzgeralds-projects)

IMPORTANT:
- Do NOT paste the API key value into the chat. Paste it directly into Vercel from Resend's "reveal" view while it's still displayed (Resend shows keys only once at creation). If you miss the copy window, just delete the key and make a new one.
- Do NOT buy any paid Resend plan or upgrade tier. The free tier (100 emails/day, 3k/month) is plenty.

---

PHASE 1 — Generate the production API key

1. Go to https://resend.com/api-keys
2. Click "+ Create API Key" (top right).
3. Fill in:
   - **Name:** `sneakers-terminal-prod`
   - **Permission:** **Sending access** (scoped to sending, can't manage domains/team — safer than Full Access)
   - **Domain:** leave as "All Domains" for now (we haven't verified sneakersterminal.com yet)
4. Click Create.
5. Resend displays the key **once** — starts with `re_`. Copy it immediately.

PHASE 2 — Paste the key into Vercel env vars

1. Still with the key on your clipboard, open a new tab:
   https://vercel.com/jackson-fitzgeralds-projects/sneakers-terminal/settings/environment-variables

2. Find the existing `RESEND_API_KEY` row (there should already be one from the earlier setup).
   - Click the ⋯ menu next to it → **Edit**.
   - Paste the new key as the value, overwriting the old one.
   - Ensure it's applied to **Production, Preview, and Development**.
   - Save.

3. If there's NO existing `RESEND_API_KEY` row (possible if the earlier setup was aborted):
   - Click "Add New"
   - Name: `RESEND_API_KEY`
   - Value: paste the new key
   - Apply to Production + Preview + Development
   - Save.

4. Trigger a redeploy so the new key takes effect:
   - Deployments tab → latest production deployment → ⋯ → **Redeploy**
   - Do NOT enable "Use existing Build Cache" — we want a fresh build.

5. Wait for the build to finish (~1–2 min). Confirm it succeeds.

PHASE 3 — Add the custom sender domain

1. Go to https://resend.com/domains
2. Click "+ Add Domain".
3. Enter:
   - **Domain:** `sneakersterminal.com`
   - **Region:** us-east-1 (or whatever's closest to the Sneakers user base — default is fine)
   - **DKIM Bit Length:** default (2048 is fine)
   - **Click Tracking:** ON (default)
   - **Open Tracking:** ON (default)
4. Click Add.

5. Resend will drop you into a page showing 3–4 DNS records to add at your DNS provider. Typically:
   - One MX record (for receiving bounces)
   - One TXT record (SPF) with value roughly `v=spf1 include:amazonses.com ~all`
   - One or more CNAME records for DKIM (something like `resend._domainkey.sneakersterminal.com` → `resend._domainkey.<hash>.amazonses.com`)
   - Optionally a TXT for DMARC

   Capture each as a structured table. For each record, record:
   - Type (MX / TXT / CNAME)
   - Host / Name
   - Value
   - TTL (if shown)
   - Priority (for MX)

6. Screenshot the full Domain details page with all records visible.

7. **Important:** do NOT click "Verify" / "Check DNS" yet — DNS records don't exist at Namecheap until we apply them in the next step. The domain status will stay "Pending" / "Not Verified" for now. That's expected.

PHASE 4 — Report back

Tell me:
- Whether Phase 1 (key creation) succeeded — yes/no, any weirdness
- Whether Phase 2 (Vercel env var updated + redeploy) succeeded — yes/no, what the build log showed
- The full DNS record table from Phase 3, exactly as Resend presented it (I need the exact values to apply at Namecheap next)
- Screenshot of the Resend Domains page showing the pending records

What I'll do next once you report back:
1. Generate a Namecheap Chrome prompt with the exact records to add, including how to merge SPF with Namecheap's existing email-forwarding SPF record (since we can't have two SPF records on one domain).
2. Once records are applied at Namecheap and DNS propagates, you return to Resend and click Verify.

Do NOT:
- Apply any DNS record at Namecheap yet (that's the follow-up prompt)
- Delete or rotate the key more than once
- Enable any paid Resend feature
- Verify the domain at Resend before DNS is applied (it'll fail and you'll have to retry)
- Change the API key's `Permission` setting to Full Access unless the `Sending access` scope causes an error in Phase 2's redeploy

If any step fails with an error, stop and paste me the verbatim error text.
