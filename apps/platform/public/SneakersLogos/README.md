# SneakersLogos

Staging directory for the Sneakers Terminal brand + partner-platform logos and supporting art. Served from `apps/platform/public/SneakersLogos/` at `/SneakersLogos/...` on the live site.

## Structure

- `partners/` — logos for platforms Sneakers covers (sportsbooks, DFS, prediction markets, sweeps). Naming: `<brand>-<product>.png` — e.g. `draftkings-sportsbook.png` vs `draftkings-predictions.png`, since DK operates distinct products.
- `aesthetic/` — hero illustrations, OG share images, 404 art. Brand-flavored visuals that aren't logos.

## Current contents

### partners/
- `draftkings-sportsbook.png` — DK crown+D mark (shared DK brand parent).
- `draftkings-predictions.png` — DK Predictions square tile (dark green bg). May need a transparent variant for the black terminal UI.
- `fanduel-sportsbook.jpeg` — FanDuel shield mark, blue bg. JPEG — swap for SVG or transparent PNG when available.
- `fanduel-predicts.png` — FanDuel Predicts tile (blue gradient + PREDICTS wordmark). Separate product from FanDuel Sportsbook, same shield mark.
- `novig.png` — NoVig logo (white N-mark on black). Prediction exchange.

### aesthetic/
- `sneakers-on-wire-draftkings.png` — high-top sneakers hanging from a wire with DK crown+D on them, sunset cityscape. ~1.9 MB; resize before shipping to production.

## Partner logos still needed

### Tier-1 US sportsbooks
- [ ] BetMGM
- [ ] Caesars
- [ ] ESPN BET
- [ ] Fanatics (non-NY)
- [ ] BetRivers
- [ ] Hard Rock Bet
- [ ] Bally Bet
- [ ] bet365

### Prediction markets / exchanges (Sneakers scraper targets)
- [ ] Kalshi
- [ ] Polymarket
- [ ] Coinbase Predict
- [ ] Crypto.com / OG Markets
- [ ] CDNA
- [ ] ProphetX
- [ ] FanDuel Predicts (added 2026-04-21 — confirm scraper plan covers it alongside DK Predictions)

### DFS / pick'em
- [ ] PrizePicks
- [ ] Underdog Fantasy
- [ ] Sleeper
- [ ] OwnersBox
- [ ] Betr Picks
- [ ] Vivid Picks
- [ ] ParlayPlay
- [ ] Dabble
- [ ] DraftKings Pick 6

### Sweeps / social sportsbooks
- [ ] Thrillz
- [ ] Fliff
- [ ] Stake.us
- [ ] Rebet
- [ ] McLuck
- [ ] High 5
- [ ] Chumba
- [ ] Pulsz

## Sourcing note

Pull official SVG/PNG packs from each platform's affiliate-dashboard creative library (user is partnered with all 12 WINDAILY brands — see `reference_windaily_affiliate_links.md`). Prefer SVG; if only PNG is offered, grab the largest size available.
