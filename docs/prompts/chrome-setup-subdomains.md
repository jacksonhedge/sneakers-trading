# Chrome prompt — set up admin + app subdomains on sneakersterminal.com

Wires two production subdomains for Sneakers Terminal:

- `admin.sneakersterminal.com` → `/admin` (admin console)
- `app.sneakersterminal.com` → `/dashboard` (O'Toole Terminal)

The Next.js proxy at `apps/platform/src/proxy.ts` handles the path rewrite automatically once the hostnames resolve to our Vercel project. Two steps: add the domains in Vercel (which gives you DNS records), then apply those records at Namecheap.

---

Task: configure two new subdomains (`admin.sneakersterminal.com` and `app.sneakersterminal.com`) so they resolve to our Vercel-hosted Sneakers Terminal project.

Prerequisites:
- Logged into vercel.com with access to the `sneakers-terminal` project
- Logged into namecheap.com with access to the `sneakersterminal.com` domain

---

## Step 1 — Add the domains in Vercel

1. Go to https://vercel.com/dashboard and click into the `sneakers-terminal` project (the one whose Production URL is `sneakersterminal.com`).
2. In the left sidebar: **Settings → Domains**.
3. Take a "before" screenshot showing the current domain list.
4. In the "Add domain" input box, type:  `admin.sneakersterminal.com`  → click **Add**.
5. Vercel will show a configuration panel with either:
   - A **CNAME** record pointing to `cname.vercel-dns.com`, OR
   - An **A** record pointing to an IP (e.g., `76.76.21.21`).
6. **Copy the exact record details** (type, name, value) that Vercel shows — we'll need them in Step 2.
7. Repeat steps 4–6 for: `app.sneakersterminal.com`.
8. Leave both domains in the "Invalid Configuration" / "Pending Verification" state for now — they'll go green after DNS propagates in Step 3.
9. Screenshot the Vercel Domains page showing both subdomains listed.

---

## Step 2 — Add DNS records at Namecheap

1. Go to https://ap.www.namecheap.com/domains/list/ and click **Manage** next to `sneakersterminal.com`.
2. Click the **Advanced DNS** tab.
3. Screenshot the current Host Records table (the "before" state).
4. For **admin.sneakersterminal.com**:
   - Click **Add New Record**
   - Type: **CNAME Record** (if Vercel told you CNAME in Step 1) or **A Record** (if A)
   - Host: `admin`
   - Value: exactly what Vercel showed in Step 1 (usually `cname.vercel-dns.com` for CNAME, or the IP for A)
   - TTL: **Automatic** (or 1 min for faster propagation)
   - Click the green checkmark to save
5. For **app.sneakersterminal.com**:
   - Repeat with Host: `app` and the same Value from Step 1.
6. Screenshot the Advanced DNS page showing both new records saved.

---

## Step 3 — Wait for DNS + verify in Vercel

1. Go back to https://vercel.com/dashboard → `sneakers-terminal` → **Settings → Domains**.
2. Wait up to 5 minutes. Refresh the page every ~60 seconds.
3. Both `admin.sneakersterminal.com` and `app.sneakersterminal.com` should flip from **Invalid Configuration** (yellow) to **Valid Configuration** (green checkmark) once DNS propagates. Vercel auto-provisions the SSL cert during this transition.
4. Screenshot when both go green.

---

## Step 4 — End-to-end sanity check

1. Open a new tab to https://admin.sneakersterminal.com
   - Expected: redirects to `/signup` (since you're not logged in) or renders `/admin` if you are logged in as an admin.
   - The URL bar should stay on `admin.sneakersterminal.com` — the path rewrite happens server-side.
2. Open a new tab to https://app.sneakersterminal.com
   - Expected: redirects to `/signup` (if logged out) or renders the O'Toole Terminal dashboard (if logged in with a burned invite).
   - URL bar stays on `app.sneakersterminal.com`.
3. Confirm https://sneakersterminal.com still loads the landing page unchanged.
4. Screenshot all three.

---

## Step 5 — Report

Summarize:
- Which DNS record type Vercel asked for (CNAME vs A)
- That both domains turned green in Vercel
- What each of the three hostnames renders when unauthenticated
- Any records you had to add or change beyond `admin` and `app`

Don't touch any existing records at Namecheap besides adding the two new ones — the Resend DNS records and the apex A record for `sneakersterminal.com` stay as-is.

---

## If something goes wrong

- **Domain stays red/yellow after 15 minutes**: DNS hasn't propagated. Try `dig admin.sneakersterminal.com` from a terminal — if it doesn't resolve, the record isn't saved or has a typo. Double-check Namecheap.
- **404 on the new subdomain**: the proxy may not have deployed yet. Confirm `apps/platform/src/proxy.ts` is on the currently-deployed branch (should be `feat/platform-scaffold` or `main`).
- **Auth redirects break**: the callback URL allowlist in Supabase may need the new subdomains added. Open `https://supabase.com/dashboard/project/ujfgtkebslesepbjrhyr/auth/url-configuration` and ensure `https://admin.sneakersterminal.com/auth/callback` and `https://app.sneakersterminal.com/auth/callback` are both listed, plus `https://admin.sneakersterminal.com/**` and `https://app.sneakersterminal.com/**` as wildcards.
