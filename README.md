# OIT World Cup 2026 sweepstake

This version uses ESPN's public FIFA World Cup 2026 discipline stats page as the free card source.

It does not need an API key.

## Setup

Upload all files/folders to the root of your GitHub repo, replacing the existing files.

The GitHub Action runs every 5 minutes and updates `cards.json`.

## Card source

ESPN discipline page:
https://www.espn.com/soccer/stats/_/league/FIFA.WORLD/view/discipline/season/2026/copa-mundial

The updater parses team rows with:
- P = played
- YC = yellow cards
- RC = red cards
- PTS = ESPN disciplinary points

## Caveat

ESPN shows YC and RC totals. It does not distinguish straight reds from second-yellow dismissals in this table, so this package treats RC as straightRed.
