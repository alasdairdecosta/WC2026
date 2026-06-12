# OIT World Cup 2026 sweepstake

This version uses:

- WorldCup26 open API for live scores in the browser.
- WorldCupAPI `/cards` endpoint for card totals via GitHub Actions.

## Setup

Upload all files/folders to the root of your GitHub repo.

Add a GitHub Actions repository secret:

`WORLDCUPAPI_KEY`

This is the API key from your WorldCupAPI dashboard.

Then go to Actions → Update World Cup card data → Run workflow.

The workflow runs every 5 minutes and updates `cards.json`.

The webpage refreshes automatically when opened and every 60 seconds while open.

## Files

- `index.html` — the page
- `cards.json` — card totals read by the page
- `scripts/update-cards.mjs` — pulls `/cards` from WorldCupAPI
- `.github/workflows/update-cards.yml` — scheduled updater

## Card scoring

- Yellow = 1
- Second-yellow red = 2
- Straight red = 3
