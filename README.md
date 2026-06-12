# OIT World Cup 2026 sweepstake

This version uses API-Football top-card endpoints for the card leaderboard:

- `/players/topyellowcards?league=1&season=2026`
- `/players/topredcards?league=1&season=2026`

The GitHub Action aggregates player card totals by team and writes `cards.json`.

## Setup

Upload all files/folders to the root of your GitHub repo.

Add a GitHub Actions repository secret:

`API_FOOTBALL_KEY`

Optionally add repository variables:

`API_FOOTBALL_LEAGUE_ID = 1`
`API_FOOTBALL_SEASON = 2026`

Then go to Actions → Update World Cup card data → Run workflow.

The workflow runs every 5 minutes and updates `cards.json`.

## Caveat

API-Football's top-card endpoints are player ranking endpoints. Red cards from `/players/topredcards` are treated as straight reds unless the response exposes a separate second-yellow field. Yellow card totals should be more reliable.
