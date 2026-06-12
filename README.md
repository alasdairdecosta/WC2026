# OIT World Cup 2026 sweepstake

This version uses API-Football fixture statistics for the card leaderboard.

It calls:

- `/fixtures?league=1&season=2026`
- `/fixtures/statistics?fixture=FIXTURE_ID`

The statistics endpoint can include team-level `Yellow Cards` and `Red Cards`.

## Setup

Upload all files/folders to the root of your GitHub repo.

Add a GitHub Actions repository secret:

`API_FOOTBALL_KEY`

Add or keep these repository variables:

`API_FOOTBALL_LEAGUE_ID = 1`
`API_FOOTBALL_SEASON = 2026`

Then go to Actions → Update World Cup card data → Run workflow.

The workflow runs every 5 minutes and updates `cards.json`.

## Caveat

Fixture statistics expose total team red cards but do not reliably split straight-red cards from second-yellow dismissals. This package treats `Red Cards` as `straightRed`.
