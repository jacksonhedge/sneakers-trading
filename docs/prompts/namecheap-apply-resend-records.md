# Chrome prompt — Apply Resend DNS records at Namecheap

Adds the DNS records Resend needs to verify `sneakersterminal.com` as a custom sender domain. Run **after** `docs/prompts/resend-setup.md` has generated the records in the Resend dashboard, and **without** breaking the existing Vercel A+CNAME records or the locked Namecheap email-forwarding SPF.

**Before running:** replace the `<FROM-RESEND>` placeholders in Step 3 with the exact values Resend showed on the Domains → sneakersterminal.com page. Resend generates domain-specific DKIM values that I can't pre-fill.

---

Task: at Namecheap Advanced DNS for sneakersterminal.com, add the DNS records Resend needs so we can send from `noreply@sneakersterminal.com`. Do NOT touch any existing record except to add the new Resend ones.

Prerequisites:
- Logged into ap.www.namecheap.com
- The Resend setup prompt has been run, and the Resend dashboard is open in another tab showing the DNS records for `sneakersterminal.com` (Resend domains page → `sneakersterminal.com` detail view)
- You have access to both tabs

What's already at Namecheap (DO NOT TOUCH):
- **A Record** @ `216.150.1.1` — apex points at Vercel. Critical — the site dies if you touch this.
- **CNAME Record** `www` → `2213b6151752473d.vercel-dns-016.com.` — www points at Vercel. Also critical.
- **TXT Record** @ `v=spf1 include:spf.efwd.registrar-servers.com ~all` — Namecheap's email-forwarding SPF. This lives under "Mail Settings" and is locked/managed by Namecheap.

We deliberately use a **subdomain** (`send.sneakersterminal.com`) for Resend's MAIL-FROM and SPF to avoid fighting with the locked apex SPF. Resend supports this out of the box.

---

STEP 1 — Navigate

1. Go to https://ap.www.namecheap.com/domains/list/
2. Click "MANAGE" next to sneakersterminal.com
3. Click the "Advanced DNS" tab
4. Keep the Resend domains page open in another tab for cross-reference

STEP 2 — Sanity check

Confirm the existing records shown on Advanced DNS are:
- A Record, `@`, value `216.150.1.1`
- CNAME Record, `www`, value `2213b6151752473d.vercel-dns-016.com.`

And under Mail Settings section below, a locked TXT: `v=spf1 include:spf.efwd.registrar-servers.com ~all`.

If the existing records differ from these, STOP and report what you see — don't proceed.

STEP 3 — Add the Resend records

In the Host Records section (NOT Mail Settings — that's locked), click **ADD NEW RECORD** for each of the records Resend shows.

Copy the exact values Resend is displaying. Resend's standard layout is:

---

**Record A — MX (bounce handling)**
- Type: **MX Record**
- Host: `send` (NOT `@` — Resend puts this on a subdomain)
- Value: `<FROM-RESEND — will look like feedback-smtp.us-east-1.amazonses.com>`
- Priority: `10` (or whatever Resend shows)
- TTL: Automatic

---

**Record B — TXT (SPF for the send subdomain)**
- Type: **TXT Record**
- Host: `send`
- Value: `<FROM-RESEND — will look like v=spf1 include:amazonses.com ~all>`
- TTL: Automatic

---

**Record C — TXT (DKIM public key)**
- Type: **TXT Record**
- Host: `resend._domainkey`
- Value: `<FROM-RESEND — very long string starting with p=MIGfMA0GCSqGSIb3... or similar, hundreds of characters>`
- TTL: Automatic

> **Important:** when you paste the DKIM value into Namecheap, do NOT wrap it in quotes, do NOT add line breaks, and do NOT truncate it. Namecheap will split long TXT values across multiple quoted strings automatically — that's fine. If you see a validation error about length, use the full un-split value.

---

**Record D — TXT (DMARC, optional)**

Resend *may* also show a DMARC record. If it does:
- Type: **TXT Record**
- Host: `_dmarc`
- Value: `<FROM-RESEND — will look like v=DMARC1; p=none; rua=mailto:...>`
- TTL: Automatic

If Resend doesn't show a DMARC record, skip Record D.

---

**Record E — CNAME (DKIM via CNAME, alternative setup)**

Some Resend configurations use CNAMEs instead of a TXT for DKIM. If you see CNAMEs in Resend's list (multiple records with hosts like `resend._domainkey`, `s1._domainkey`, `s2._domainkey`), add them as CNAMEs instead of Record C above:

- Type: **CNAME Record**
- Host: `<FROM-RESEND — e.g. resend._domainkey>`
- Value: `<FROM-RESEND — long amazon hostname>`
- TTL: Automatic

Add ALL of them. Only ONE of Record C or Record E will apply depending on what Resend shows you.

---

STEP 4 — Save

Namecheap usually has a green "Save All Changes" button (or a per-row checkmark). Save once all records are added.

STEP 5 — Verify at Resend

1. Switch back to the Resend domains page for sneakersterminal.com.
2. Click "Verify DNS Records" (or whatever the button is called — usually at the top right of the domain detail page).
3. DNS propagation at Namecheap PremiumDNS is usually 30–60 seconds. Each record should flip from "Pending" to "Verified" (green checkmark).
4. If any records still show "Pending" after 3–4 minutes:
   - Re-check Namecheap Advanced DNS — make sure all values exactly match.
   - For DKIM specifically, watch for leading/trailing spaces or missing characters in the long value.
   - Do NOT re-save Namecheap records multiple times — wait for propagation.

STEP 6 — Report back

- Screenshot of the Resend domains page showing all records Verified (or their current state)
- Screenshot of Namecheap Advanced DNS showing the full final list of host records (should be the original 2 Vercel records + however many Resend records — 3 or 4 typically)
- Which DKIM variant Resend used (Record C single TXT, or Record E multiple CNAMEs) — affects how we configure the app
- Any records that failed to verify and why

Do NOT:
- Delete the Vercel A or CNAME record (site breaks)
- Modify the locked Namecheap SPF TXT under Mail Settings
- Add a second apex SPF record (that would conflict with the locked one)
- Change Nameservers (keep Namecheap PremiumDNS)
- Buy anything
- Touch any other domain

If a record won't save (Namecheap UI error), copy the exact error text. If Resend still won't verify after ~5 min of retries, paste back the current Namecheap record list exactly as shown — most likely a typo or missed character in the DKIM value.

---

**What happens after this succeeds:**
Once Resend shows sneakersterminal.com as verified, I'll update `WAITLIST_FROM_EMAIL` in Vercel to `Sneakers Terminal <noreply@sneakersterminal.com>` and redeploy. Future waitlist confirmation + invite emails will send from the branded address instead of `onboarding@resend.dev`.
