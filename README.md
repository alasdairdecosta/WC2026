# OIT World Cup 2026 sweepstake

This package contains:

- `index.html` — the sweepstake page.
- `cards.json` — the card totals feed read by the page.
- `scripts/update-cards.mjs` — fetches card events from API-Football and writes `cards.json`.
- `.github/workflows/update-cards.yml` — runs the updater every 5 minutes and on demand.

## What has changed

The page refreshes automatically when it first loads, and then every 60 seconds while open. The visible manual update buttons have been removed to keep the page cleaner.

Scores still come from the free WorldCup26 API.

Cards come from `cards.json`. The included GitHub Action can update that file from API-Football's fixture events endpoint.

## Setup

1. Upload all files/folders in this ZIP to the root of your GitHub Pages repository.
2. In GitHub, go to **Settings → Secrets and variables → Actions**.
3. Add a repository secret:
   - `API_FOOTBALL_KEY` = your API-Football / API-Sports key.
4. Optionally add repository variables:
   - `API_FOOTBALL_LEAGUE_ID` = `1` by default. API-Football commonly uses league `1` for the FIFA World Cup, but confirm in your API-Football dashboard if needed.
   - `API_FOOTBALL_SEASON` = `2026`.
5. Go to **Actions → Update World Cup card data → Run workflow** once.
6. The workflow will update `cards.json`, and the page will read it automatically.

## Card scoring

- Yellow = 1
- Second-yellow red = 2
- Straight red = 3

## Important note

Do not put your API key directly into `index.html`. The GitHub Action uses a GitHub secret so the key is not exposed in the public webpage.
