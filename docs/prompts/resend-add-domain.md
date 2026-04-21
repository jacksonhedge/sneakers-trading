# Chrome prompt — Add sneakersterminal.com to Resend

Adds `sneakersterminal.com` as a custom sender domain in Resend and captures the DNS records to apply at Namecheap. Assumes the Resend API key already exists (set earlier for waitlist confirmation emails); this prompt **only adds the domain**.

---

Task: add `sneakersterminal.com` as a verified sender domain in Resend. Do NOT create a new API key — one already exists and is wired into Vercel. This prompt is just for generating the DNS records we need to apply at Namecheap in the follow-up.

Prerequisites:
- Logged into resend.com as `jackson@hedgepayments.com` on the `hedgepayments` team (Pro plan)
- You've already verified that `sneakersterminal.com` is NOT in the current domain list (confirmed prior: rosterframe.com, bankroll.live, hedgepayments.com are present; sneakersterminal.com is not)

---

STEP 1 — Add the domain

1. Go to https://resend.com/domains
2. Click "+ Add Domain" (top right).
3. Fill in:
   - **Domain:** `sneakersterminal.com`
   - **Region:** `us-east-1` (default, closest to Vercel's edge)
   - **DKIM Bit Length:** default (2048)
   - **Click Tracking:** ON (default)
   - **Open Tracking:** ON (default)
4. Click Add.

---

STEP 2 — Capture the DNS records

Resend will drop you on the domain detail page for `sneakersterminal.com`. It displays a table of DNS records that need to exist at the domain's DNS provider (Namecheap, in our case) before the domain can be verified.

Capture every record in the table. For each row, note:

| Type | Host / Name | Value | TTL | Priority (MX only) |
|------|-------------|-------|-----|--------------------|

Resend's standard layout is usually:
- 1 × MX (host: `send` or `send.sneakersterminal.com`)
- 1 × TXT (host: `send`) — SPF value starting with `v=spf1 include:amazonses.com ~all`
- 1 × TXT **or** 1–3 × CNAME for DKIM (host: `resend._domainkey` or similar; the TXT would be a massive string starting with `p=`, the CNAME points at an amazonses.com hostname)
- 1 × TXT for DMARC (host: `_dmarc`)

Record EXACTLY what Resend shows — don't summarize or approximate. For long TXT values (especially DKIM's `p=...`), copy the full string character-by-character. If Resend has a copy button per row, use it.

---

STEP 3 — Screenshot

- Full screenshot of the domain detail page showing all DNS records and their values.
- If the DKIM TXT is truncated in the UI, click into it or use the copy button to get the full value, and paste that into the report below.

---

STEP 4 — Report back

Reply with:

1. Confirmation the domain was added successfully (you should see sneakersterminal.com in the domains list with status "Pending" or "Not Started")
2. The full DNS record table — every record, every field, exact values. Format as a code block so values aren't re-interpreted:

```
Record 1:
  Type: MX
  Host: send
  Value: feedback-smtp.us-east-1.amazonses.com
  Priority: 10
  TTL: Auto

Record 2:
  Type: TXT
  Host: send
  Value: v=spf1 include:amazonses.com ~all
  TTL: Auto

Record 3:
  Type: TXT
  Host: resend._domainkey
  Value: p=<full DKIM public key — paste the entire string here>
  TTL: Auto

... etc
```

3. Which DKIM variant Resend used — single TXT (one record with `p=...`) vs multiple CNAMEs (three records pointing at amazonses.com hostnames). Either works, but we handle them differently at Namecheap.

4. Screenshot of the domain detail page.

---

Do NOT:
- Create a new Resend API key (already exists)
- Click "Verify DNS Records" (it'll fail and may put the domain into an error state — DNS hasn't been applied to Namecheap yet)
- Delete or modify any other domain (rosterframe.com, bankroll.live, hedgepayments.com)
- Upgrade / change team plan / touch billing
- Switch teams or workspaces

If the "Add Domain" UI rejects the domain for any reason, stop and paste the error verbatim. If Resend immediately marks something verified (unlikely at this stage), also stop and report — it would mean DNS has somehow been pre-configured.

---

What happens next:
Once you report back with the record values, I'll write the Namecheap follow-up prompt (`docs/prompts/namecheap-apply-resend-records.md` already exists as a scaffold with `<FROM-RESEND>` placeholders — I'll fill in the real values from your report so Chrome can apply them without manual substitution).
