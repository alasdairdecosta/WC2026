# OIT World Cup 2026 sweepstake

This version uses ESPN's public FIFA World Cup 2026 discipline stats page as the free card source.

It does not need an API key.

## Setup

Upload all files/folders to the root of your GitHub repo, replacing the existing files.

The GitHub Action runs every 5 minutes and updates `cards.json`.

## Card source

Primary ESPN discipline page:
https://www.espn.com/soccer/stats/_/league/FIFA.WORLD/view/discipline

The updater parses team rows with:

- P = played
- YC = yellow cards
- RC = red cards
- PTS = ESPN disciplinary points

## Card scoring

- Yellow card = 1 point
- Red card = 3 points

The leaderboard uses yellow cards and red cards only.

## Fallback

If ESPN blocks or changes the page in GitHub Actions, the updater preserves the previous values. If the previous values are all zero, it uses a small initial ESPN snapshot seed so the leaderboard is not blank.


## Score-matching fix

The live-score updater matches API records to fixtures by team names first. It does not trust numeric API IDs, because they are not the same as this wall chart's fixture numbers. It also ignores placeholder scores for scheduled/not-started fixtures.

This version clears old locally stored scores once using the `wc2026_sweepstake_score_matching_version` browser key, so previously mis-mapped results are removed when the updated page loads.
