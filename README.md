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

## Live refresh and prediction update

Live scores are now fetched by GitHub Actions into `live.json`; the page reads that local file first. This avoids browser CORS failures from the WorldCup26 API and means cards still refresh even when live scores fail.

The worst-performing-team probability model has been reweighted so actual results dominate. Heavy defeats now carry a strong non-linear penalty, so a team losing 7-1 becomes very likely to win the worst-performing-team prize unless later results dramatically change the picture.

## Feed-through fix

This version fixes two feed-through issues:

- Live scores now map `Democratic Republic of the Congo` to `Congo DR`, so Congo DR fixtures no longer appear as unmatched.
- Cards now use `scripts/update-cards.mjs` based on ESPN match-summary JSON endpoints, not the old ESPN discipline-table scraper. If ESPN exposes card events, this writes new totals to `cards.json`; otherwise it preserves the previous card totals and writes diagnostics.

## Ordered worst-performing-team model

The worst-performing-team prediction now follows the actual prize logic more closely:

1. estimate likely final group points, especially the chance of losing all three matches;
2. compare likely final goal difference among the lowest-points teams;
3. use goals scored and team strength only as secondary uncertainty factors;
4. cap probabilities before the group stage is complete so one result cannot show as a false 100%.

A 7-1 defeat therefore makes a team a strong favourite for worst-performing team, but not mathematically certain while there are matches left.

## Safer card parser

The card updater no longer counts ESPN commentary, key events or play text. Those sources can duplicate the same incident and produced inflated totals such as 10 yellows for one team.

The new updater only trusts explicit team statistics labelled Yellow Cards and Red Cards in ESPN match summaries. If ESPN does not expose those explicit team-card statistics, it writes a diagnostic warning rather than guessing from text.

## Retrospective probability charts

The landing page probability charts now reconstruct a retrospective history by replaying completed fixtures in date order and recalculating the prize probabilities after each result.

World Cup winner and worst-performing-team history use the actual completed scores. Conduct history is estimated from the current aggregate `cards.json` totals because the card data source does not provide per-match card timings.

## Home page and bar chart races

The site now has separate Home and Prize probabilities pages. Home contains the landing-page content: current prize leaders, next fixtures and three triggerable bar-chart races. Prize probabilities keeps the detailed table, ranked lists and methodology text.

The previous line charts have been replaced by minimalist bar-chart races showing every participant. Each race can be played, reset or scrubbed manually.

## Home navigation wiring fix

This version fixes the actual navigation architecture used by the page. The page uses `showView(...)` and `hidden` sections, not `data-view` tab classes. Home is now wired into that system with a real `homeView` section and a Home button.

## Root blank-page fix

The page previously referenced `lastRefresh` during startup without declaring it. Because `showView("home")` runs as the page opens, that ReferenceError stopped all page sections from rendering. This version declares `lastRefresh` with a safe default and makes the refresh-status render defensive.

## Plain-English refresh and disciplinary status text

The header intro now references the Policy Insights Unit with linked PDF and email contact. The latest refresh box and Disciplinary leaderboard now use consistent plain-English status messages with en-GB date/time formatting.

## Header text simplification

The header now reads: “Brought to you by the Policy Insights Unit. If you have a policy or analysis challenge and you think we could help, get in touch.” The Policy Insights Unit text links to the PIU PDF and “get in touch” opens a mailto link. Header links are no longer bold or yellow.

## Final style consistency pass

Colours are now standardised by prize across leader tiles, probability cards, race cards and tables: World Cup winner uses OIT teal, worst-performing team uses OIT orange, and worst conduct uses OIT purple. Participant colours in race charts are consistently mapped by participant order. The Home leader tiles no longer show a redundant “leading” badge.

## Participants tab clean colour update

Participants now have a stable assigned colour palette. The Participants tab has been restyled back to a cleaner card layout, using each participant colour only as a subtle top/side accent. Race bars use the same participant colour mapping.

## Mobile header and race containment fix

On mobile, the green header now becomes compact as the user scrolls, with navigation hidden behind a small Menu button. Race chart rows are contained within their stage using fixed stage height, overflow clipping and translate3d transforms to prevent bars drifting or scrolling out of position.

## Mobile one-line collapsed header

On mobile, the compact scrolled header now collapses to a single line containing only the Menu button and the OIT World Cup 2026 sweepstake title. Opening Menu expands the navigation controls.

## Mobile fixed topbar no-resize approach

This replaces the resizing sticky-header approach. On mobile, the original green header now scrolls away normally. Once the user scrolls down, a separate fixed compact bar appears with only Menu and the title. Because the original header no longer changes size or position during scroll, this avoids the previous resizing/glitching behaviour.

## Refresh cadence and next-fixture strip alignment

The next-fixture strip now uses a fixed inline grid for team, “v”, team and time so each fixture sits on a neat baseline. Browser reads of live.json/cards.json are cache-busted with no-store. The live-score GitHub Actions workflow is set to run every 5 minutes and can also be run manually.

## Live-score diagnostics and fallback source

The live-score updater now writes diagnostics into live.json, including source attempts, rows read, matches parsed and scored matches parsed. It tries WorldCup26 first and ESPN as a fallback/merge source. The page displays the source and diagnostic warning in the Latest data refresh box, so stale or empty live data should no longer fail silently.

## Extra live-score redundancy

The live updater now uses several redundancy layers: optional live-override.json, WorldCup26 URL variants, ESPN broad scoreboard endpoints, ESPN date-window endpoints, previous live.json score preservation, and previous-file fallback if all live sources fail. Diagnostics in live.json list every source attempt and selected source.

## Combined scheduled data workflow

Scheduled data updates are consolidated into `.github/workflows/update-world-cup-data.yml`, which updates both `live.json` and `cards.json` every five minutes at offset minutes. The separate live/card workflows remain available for manual runs only. This makes it easier to verify whether scheduled GitHub Actions are actually firing.
