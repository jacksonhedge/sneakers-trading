# Venue logos download — iPhone-style icons for the landing ticker

## What I need you to do

For each of the 16 venues below, find and download the highest-resolution official icon that looks clean as an iPhone home-screen icon. The Sneakers Terminal landing page has a marquee ticker rendering these as 56px rounded-squares, so I need square, centered, crisp icons with a consistent brand-fill feel.

**Save each file to `~/Downloads/sneakers-venue-logos/` with the EXACT filename shown** (I'll move the whole folder into the repo in one command afterward). Filenames must end in `.png`. Case-sensitive.

## Sourcing priority (per venue — try top-down)

1. **Apple App Store page** — inspect the main app-icon `<img>`. The product image at `/mzstatic/.../AppIcon-...@3x.png` is 1024×1024 official. Right-click → Save Image As.
2. **Brand press kit / media assets** — e.g. `caesars.com/press`, `mgmresorts.com/en/about/news/press-releases.html`, etc. Often has a square logo download.
3. **Site `apple-touch-icon`** — `<link rel="apple-touch-icon">` in HTML head. Typically 180×180 PNG; not ideal but works.
4. **Favicon at highest resolution** — last resort.

Prefer PNG. If the source is SVG, export to PNG at 512×512 or larger. If no square icon exists, report back with what you found — don't fabricate one by cropping.

## Output format

**Dimensions:** 512×512 minimum, 1024×1024 preferred. Square aspect ratio.
**Background:** transparent OR solid brand color. NOT white unless that's the brand's actual icon background.
**Padding:** whatever the brand uses in their iOS icon — don't add your own padding.

## Venues to fetch

| filename (save as) | Brand | Primary source to try | Notes |
|---|---|---|---|
| `sporttrade.png` | Sporttrade | App Store: "Sporttrade — Sports Trading" | |
| `metamask_predictions.png` | MetaMask (Predict) | metamask.io apple-touch-icon, or App Store "MetaMask – Blockchain Wallet" | Use the main MetaMask wallet icon |
| `og_markets.png` | OG Markets | og.com site icons, or their Twitter avatar | CFTC-regulated exchange, newer brand |
| `sleeper_markets.png` | Sleeper | Reuse the Sleeper app icon (same brand as `sleeper_picks.png`) | App Store: "Sleeper – Fantasy Leagues" |
| `cdna.png` | Crypto.com Derivatives | Crypto.com app icon (parent brand) | App Store: "Crypto.com: Buy BTC, ETH, SOL" |
| `fanatics_sb.png` | Fanatics Sportsbook | App Store: "Fanatics Sportsbook" | Distinct from `fanatics_predicts.png` which we already have |
| `betmgm.png` | BetMGM | App Store: "BetMGM Sportsbook" | |
| `caesars.png` | Caesars Sportsbook | App Store: "Caesars Sportsbook & Casino" | |
| `espn_bet.png` | theScore Bet | App Store: "theScore Bet Sportsbook" | Rebranded from ESPN BET 2025-12-01; use the CURRENT theScore Bet icon |
| `betrivers.png` | BetRivers | App Store: "BetRivers Sportsbook & Casino" | |
| `hard_rock_bet.png` | Hard Rock Bet | App Store: "Hard Rock Bet" | |
| `bally_bet.png` | Bally Bet | App Store: "Bally Bet Sportsbook & Casino" | |
| `bet365.png` | bet365 | App Store: "bet365 Sportsbook" | |
| `betr_picks.png` | Betr Picks | App Store: "Betr Picks" or "Betr Fantasy" | Jake Paul's Betr |
| `parlayplay.png` | ParlayPlay | App Store: "ParlayPlay: Player Props DFS" | |
| `dk_pick6.png` | DraftKings Pick 6 | App Store: "DraftKings Pick 6" | Distinct from DK Sportsbook and DK Predictions — Pick 6 is their DFS pick'em product |

## After you're done

Report back as a markdown table with these columns:

| filename | source URL | dimensions (e.g. 1024×1024) | confidence (high/med/low) | notes |

**"Confidence" rubric:**
- **high** — App Store app-icon PNG at ≥512px, pulled directly from Apple's CDN.
- **med** — brand's own apple-touch-icon or press kit, 180–512px.
- **low** — favicon, social avatar, or a crop of a wordmark. Anything you'd want a human to eyeball before shipping.

If you can't find an icon for a venue after 2–3 sourcing attempts, leave the row with filename + `NOT FOUND` and explain what you tried. Don't substitute an unrelated image.

## Things to avoid

- Don't grab Wikipedia or Google Images logos — they're often outdated, wrong resolution, or the wrong brand variant (e.g., an old ESPN BET icon instead of theScore Bet).
- Don't composite or recolor. If the brand's icon has a specific color, keep it.
- Don't download `.webp` or `.jpg` — PNG only so transparency is preserved.
- Don't grab any NSFW / ad-network banners that might live near these brands' pages.

When finished, the `~/Downloads/sneakers-venue-logos/` folder should contain up to 16 PNG files named exactly as listed above, plus your markdown report pasted into this chat.
