# Chrome prompt — verify `sneakersterminal.com` for Resend email

Login is broken because Resend is in **testing mode** — it can only deliver mail to `jackson@hedgepayments.com` until the sending domain is verified. This prompt walks the browser through capturing the DNS records Resend wants, adding them in Namecheap, and triggering re-verification.

**Do NOT touch existing A/CNAME records on the apex `sneakersterminal.com` or `www.sneakersterminal.com`** — those point at Vercel (`A 216.150.1.1` + `CNAME 2213b6151752473d.vercel-dns-016.com.`) and break the live site if removed. Only ADD the new email-related TXT/MX/CNAME records Resend gives us.

---

Task: verify the sneakersterminal.com domain on Resend so production magic-link emails actually deliver.

Prerequisites:

- Logged into [resend.com](https://resend.com) as `jackson@hedgepayments.com`
- Logged into [namecheap.com](https://namecheap.com) on the same account that owns `sneakersterminal.com`
- The Resend domains page already shows `sneakersterminal.com` in **Pending** status (added Apr 21, "Missing records")

Run each step, screenshot anything that fails, end with a summary table.

---

## Step 1 — Capture the exact DNS records Resend wants

1. Go to https://resend.com/domains
2. Click on the `sneakersterminal.com` row to open it.
3. Click the **Records** tab (just above the bottom of the page).
4. Resend lists 3-5 records, each with: Type (TXT/MX/CNAME), Host (e.g., `send`, `resend._domainkey`, `@`), Value, Priority (for MX), and a "Status" column showing red ⚠ for missing ones.
5. **Screenshot the Records tab.** Then write each record down in this exact format so we don't lose precision:

   ```
   #  TYPE   HOST                       VALUE                                    PRIORITY  STATUS
   1  TXT    send                       v=spf1 include:amazonses.com ~all        —         missing
   2  TXT    resend._domainkey          p=MIIBIjANBgkqh...                       —         missing
   3  MX     send                       feedback-smtp.us-east-1.amazonses.com    10        missing
   ```

   (Your actual values will differ — copy verbatim from the Resend UI.)

6. If the **DMARC** record is offered as optional, include it. It looks like:
   ```
   TXT  _dmarc   v=DMARC1; p=none;
   ```
   Optional but recommended for deliverability.

**PASS criteria**: you have an exact list of 3-5 records to add, each with Type / Host / Value / (Priority).

---

## Step 2 — Open Namecheap Advanced DNS for the domain

1. Go to https://ap.www.namecheap.com/Domains/DomainControlPanel/sneakersterminal.com/advancedns
2. Confirm the existing records DO include:
   - `A Record` host `@` value `216.150.1.1`
   - `CNAME Record` host `www` value `2213b6151752473d.vercel-dns-016.com.`
   These point the live site at Vercel — **leave them alone**.
3. Screenshot the Advanced DNS panel before changes.

**PASS criteria**: you can see the current records, including the two Vercel records.

---

## Step 3 — Add each Resend record

For each record from Step 1:

1. Click **ADD NEW RECORD** at the bottom of the records list.
2. Pick the Type from the dropdown (TXT, MX, or CNAME). Note: Namecheap labels them as "TXT Record", "MX Record", "CNAME Record".
3. **Host**: paste the host value EXACTLY as Resend showed it. Important Namecheap quirks:
   - If Resend shows `@`, type `@` (Namecheap converts to apex automatically).
   - If Resend shows `send` or `resend._domainkey`, type just that — NOT `send.sneakersterminal.com`. Namecheap appends the apex automatically.
   - Subdomains for click tracking like `email` go in the Host field as `email`.
4. **Value**: paste verbatim from Resend.
   - For TXT records, **don't** wrap the value in extra quotes — Namecheap adds them.
   - For DKIM (the long `p=MIIB...` string), make sure the entire key copies. These are 200-400+ chars and Namecheap accepts them in one field.
5. **Priority** (MX only): set to whatever Resend showed (usually `10`).
6. **TTL**: leave as Automatic.
7. Click the green ✓ to save the row.
8. Repeat for each record.

After all rows are added, click **SAVE ALL CHANGES** if Namecheap surfaces that button.

**PASS criteria**: every record from Step 1 now appears in the Namecheap records list. Screenshot the new state.

---

## Step 4 — Trigger Resend re-verification

1. Back to https://resend.com/domains/<the domain id from the URL>
2. Click **Verify DNS Records** (top right) or refresh the page — Resend re-checks DNS automatically.
3. The Status column starts as `Pending` / red. Within 5-15 minutes (sometimes longer for Namecheap) each record flips to green ✓.
4. The overall domain Status flips from **Pending** → **Verified** when all required records pass.

If after 30 min the status is still red:

- Spot-check the records via DNS lookup tools. In a terminal:
  ```
  dig TXT send.sneakersterminal.com +short
  dig TXT resend._domainkey.sneakersterminal.com +short
  dig MX  send.sneakersterminal.com +short
  ```
  These should return the values from Step 1. If they return nothing, DNS hasn't propagated yet — wait another 15 min and re-check.
- If `dig` returns the wrong value, you typed something wrong in Namecheap. Open Advanced DNS and compare to Resend's expected values character-by-character.

**PASS criteria**: Resend dashboard shows the domain as `Verified` with all rows green.

---

## Step 5 — Decline shared click tracking (optional, mentioned in the banner)

Resend showed a yellow banner: *"sneakersterminal.com uses shared click tracking. Switch to a custom tracking subdomain for better deliverability."*

This is optional but recommended for production deliverability. To enable:

1. Click the **Enable now** button on the banner.
2. Resend offers a custom subdomain like `email.sneakersterminal.com` or `track.sneakersterminal.com`. Pick one.
3. Resend gives you ONE additional CNAME record for that subdomain. Add it in Namecheap exactly like Step 3.
4. Wait for verification (same flow as Step 4).

If you'd rather skip this for now, click the X on the banner. Mail still works; just deliverability is a bit weaker.

**PASS criteria**: either the click-tracking subdomain is added and verified, OR the banner is dismissed.

---

## Final report

Report back as a table:

| Record | Host | Value | Status |
|--------|------|-------|--------|
| TXT (SPF) | send | v=spf1... | ✅ verified |
| TXT (DKIM) | resend._domainkey | p=MIIB... | ✅ verified |
| MX | send | feedback-smtp... | ✅ verified |
| (DMARC, if added) | _dmarc | v=DMARC1... | ✅ verified |
| (Click tracking, if enabled) | email or track | resend... | ✅ verified |

Plus:

- Total time elapsed
- Anything that didn't work first-try
- Final domain status: **Verified** ✅ or still pending

After verification lands, the user can update `apps/platform/.env.local`:
```
WAITLIST_FROM_EMAIL=Sneakers Terminal <noreply@sneakersterminal.com>
```
and login emails will deliver to anyone, not just `jackson@hedgepayments.com`.

---

## Boundaries

- DO NOT delete or modify the existing `A` (`216.150.1.1`) or `CNAME` (`vercel-dns-016.com.`) records — those serve the production site.
- DO NOT change name servers — domain stays on Namecheap's nameservers (`dns1/dns2.registrar-servers.com`).
- If anything else looks weird (records you didn't add, status pages 500'ing, etc.), screenshot and STOP rather than guessing — DNS is hard to reverse if you delete the wrong thing.
- DO NOT click "Delete Domain" on Resend, even if it looks like a way to retry — re-adding wipes the records and you start over.
