import fs from "node:fs/promises";

const LEAGUE = "fifa.world";
const SCOREBOARD_BASE = `https://site.api.espn.com/apis/site/v2/sports/soccer/${LEAGUE}/scoreboard`;
const SUMMARY_BASE = `https://site.api.espn.com/apis/site/v2/sports/soccer/${LEAGUE}/summary`;

const FALLBACK_TEAMS = [
  "Mexico","South Africa","Korea Republic","Czechia","Canada","Bosnia and Herzegovina","Qatar","Switzerland",
  "Brazil","Morocco","Haiti","Scotland","USA","Paraguay","Australia","Türkiye","Germany","Curaçao",
  "Côte d'Ivoire","Ecuador","Netherlands","Japan","Sweden","Tunisia","Belgium","Egypt","IR Iran","New Zealand",
  "Spain","Cabo Verde","Saudi Arabia","Uruguay","France","Senegal","Iraq","Norway","Argentina","Algeria",
  "Austria","Jordan","Portugal","Colombia","Uzbekistan","Congo DR","England","Croatia","Ghana","Panama"
];

const ALIASES = new Map([
  ["United States", "USA"], ["USA", "USA"],
  ["South Korea", "Korea Republic"], ["Republic of Korea", "Korea Republic"],
  ["Iran", "IR Iran"], ["IR Iran", "IR Iran"],
  ["Turkey", "Türkiye"], ["Turkiye", "Türkiye"], ["Türkiye", "Türkiye"],
  ["Ivory Coast", "Côte d'Ivoire"], ["Cote d'Ivoire", "Côte d'Ivoire"],
  ["Cape Verde", "Cabo Verde"],
  ["DR Congo", "Congo DR"], ["Congo DR", "Congo DR"], ["Congo", "Congo DR"],
  ["Democratic Republic of the Congo", "Congo DR"], ["D.R. Congo", "Congo DR"], ["D R Congo", "Congo DR"],
  ["Czech Republic", "Czechia"],
  ["Bosnia-Herzegovina", "Bosnia and Herzegovina"], ["Bosnia & Herzegovina", "Bosnia and Herzegovina"],
  ["Curacao", "Curaçao"], ["Curaçao", "Curaçao"]
]);

function norm(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function readExistingJson() {
  try {
    return JSON.parse(await fs.readFile("cards.json", "utf8"));
  } catch {
    return {};
  }
}

function makeLookup(teams) {
  const lookup = new Map();
  for (const team of teams) lookup.set(norm(team), team);
  for (const [alias, team] of ALIASES) {
    if (teams.includes(team)) lookup.set(norm(alias), team);
  }
  return lookup;
}

function canonicalTeam(raw, lookup) {
  if (!raw) return null;
  const n = norm(raw);
  if (lookup.has(n)) return lookup.get(n);

  for (const [aliasNorm, team] of lookup.entries()) {
    if (aliasNorm && (n.includes(aliasNorm) || aliasNorm.includes(n))) return team;
  }
  return null;
}

function emptyCards(teams) {
  return Object.fromEntries(teams.map(team => [team, { yellow: 0, secondYellow: 0, straightRed: 0 }]));
}

function countNonZeroRows(cards) {
  return Object.values(cards || {}).filter(v =>
    Number(v.yellow || 0) || Number(v.straightRed || v.red || 0)
  ).length;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "accept": "application/json,text/plain,*/*",
      "user-agent": "Mozilla/5.0 (compatible; OIT-card-updater-safe/1.0)"
    }
  });

  const text = await res.text();

  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}: ${text.slice(0, 300)}`);

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response for ${url}: ${text.slice(0, 300)}`);
  }
}

function dateToYmd(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

function tournamentDates() {
  const explicit = process.env.ESPN_SCOREBOARD_DATES;
  if (explicit) return explicit.split(",").map(s => s.trim()).filter(Boolean);

  const out = [];
  let d = new Date("2026-06-11T00:00:00Z");
  const end = new Date("2026-07-19T00:00:00Z");

  while (d <= end) {
    out.push(dateToYmd(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }

  return out;
}

function eventShouldBeChecked(event) {
  const type = event?.status?.type || {};
  const state = String(type.state || "").toLowerCase();
  const name = String(type.name || type.description || type.detail || "").toLowerCase();

  return Boolean(
    type.completed ||
    ["in", "post"].includes(state) ||
    name.includes("final") ||
    name.includes("full") ||
    name.includes("progress") ||
    name.includes("half")
  );
}

function extractEvents(scoreboard, sourceUrl) {
  const events = [];

  for (const e of scoreboard?.events || []) {
    const id = e?.id || String(e?.uid || "").split("~").pop();
    if (!id) continue;

    const competitors = e?.competitions?.[0]?.competitors || [];
    const teams = competitors
      .map(c => c?.team?.displayName || c?.team?.location || c?.team?.name || c?.team?.abbreviation)
      .filter(Boolean);

    events.push({
      id: String(id),
      sourceUrl,
      name: e?.name || e?.shortName || teams.join(" v "),
      status: e?.status?.type?.description || e?.status?.type?.name || e?.status?.type?.state || "",
      shouldFetch: eventShouldBeChecked(e),
      teams
    });
  }

  return events;
}

function statName(stat) {
  return norm([
    stat?.name,
    stat?.displayName,
    stat?.label,
    stat?.abbreviation,
    stat?.shortDisplayName,
    stat?.type
  ].filter(Boolean).join(" "));
}

function statValue(stat) {
  const v = stat?.value ?? stat?.displayValue ?? stat?.display_value;
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  const text = String(v).trim();
  if (!text || text === "-") return 0;
  const m = text.match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : undefined;
}

function isYellowCardsStat(stat) {
  const n = statName(stat);
  return n === "yellow cards" ||
    n === "yellowcards" ||
    n === "yc" ||
    (n.includes("yellow") && !n.includes("red"));
}

function isRedCardsStat(stat) {
  const n = statName(stat);
  return n === "red cards" ||
    n === "redcards" ||
    n === "rc" ||
    n.includes("red card");
}

function teamNameFromBlock(block) {
  return block?.team?.displayName ||
    block?.team?.location ||
    block?.team?.name ||
    block?.team?.abbreviation ||
    block?.displayName ||
    block?.name ||
    null;
}

function statsArrayFromBlock(block) {
  if (Array.isArray(block?.statistics)) return block.statistics;
  if (Array.isArray(block?.stats)) return block.stats;
  return [];
}

function collectTeamStatsFromSummary(summary, eventId, cards, diagnostics, lookup) {
  // Trust explicit team statistics only. Do not count commentary, keyEvents or plays,
  // because those can duplicate the same incident and produced inflated totals.
  const candidateBlocks = [];

  if (Array.isArray(summary?.boxscore?.teams)) {
    candidateBlocks.push(...summary.boxscore.teams);
  }

  const competitors = summary?.header?.competitions?.[0]?.competitors || [];
  for (const c of competitors) {
    candidateBlocks.push(c);
  }

  let mappedForEvent = 0;

  for (const block of candidateBlocks) {
    const rawTeam = teamNameFromBlock(block);
    const team = canonicalTeam(rawTeam, lookup);
    if (!team) continue;

    const stats = statsArrayFromBlock(block);
    if (!stats.length) continue;

    let yellow;
    let red;

    for (const stat of stats) {
      if (isYellowCardsStat(stat)) yellow = statValue(stat);
      if (isRedCardsStat(stat)) red = statValue(stat);
    }

    if (yellow === undefined && red === undefined) {
      diagnostics.teamStatBlocksWithoutCardStats.push({
        eventId,
        rawTeam,
        statNames: stats.map(s => s.name || s.displayName || s.abbreviation || s.label || s.type).filter(Boolean)
      });
      continue;
    }

    cards[team].yellow += Number(yellow || 0);
    cards[team].straightRed += Number(red || 0);
    mappedForEvent++;

    diagnostics.teamCardStats.push({
      eventId,
      team,
      rawTeam,
      yellow: Number(yellow || 0),
      red: Number(red || 0)
    });
  }

  return mappedForEvent;
}

const existing = await readExistingJson();
const teams = Object.keys(existing.cards || {}).length ? Object.keys(existing.cards) : FALLBACK_TEAMS;
const lookup = makeLookup(teams);

const diagnostics = {
  updatedAt: new Date().toISOString(),
  source: "ESPN site API scoreboard + match summaries, explicit team statistics only",
  scoreboardUrlsTried: [],
  scoreboardCallsSucceeded: 0,
  scoreboardCallsFailed: 0,
  eventsFound: 0,
  eventsChecked: 0,
  summaryCallsSucceeded: 0,
  summaryCallsFailed: 0,
  teamCardStats: [],
  teamStatBlocksWithoutCardStats: [],
  warnings: []
};

const eventMap = new Map();
const scoreboardUrls = [
  `${SCOREBOARD_BASE}?limit=300`,
  ...tournamentDates().map(d => `${SCOREBOARD_BASE}?dates=${d}&limit=300`)
];

for (const url of scoreboardUrls) {
  diagnostics.scoreboardUrlsTried.push(url);

  try {
    const data = await fetchJson(url);
    diagnostics.scoreboardCallsSucceeded += 1;

    for (const event of extractEvents(data, url)) {
      const existingEvent = eventMap.get(event.id);
      if (!existingEvent) {
        eventMap.set(event.id, event);
      } else {
        existingEvent.shouldFetch = existingEvent.shouldFetch || event.shouldFetch;
      }
    }
  } catch (e) {
    diagnostics.scoreboardCallsFailed += 1;
    diagnostics.warnings.push(`Scoreboard fetch failed: ${url} :: ${e.message}`);
  }
}

diagnostics.eventsFound = eventMap.size;
let cards = emptyCards(teams);

for (const event of eventMap.values()) {
  if (!event.shouldFetch) continue;

  diagnostics.eventsChecked += 1;

  try {
    const summary = await fetchJson(`${SUMMARY_BASE}?event=${encodeURIComponent(event.id)}`);
    diagnostics.summaryCallsSucceeded += 1;
    collectTeamStatsFromSummary(summary, event.id, cards, diagnostics, lookup);
  } catch (e) {
    diagnostics.summaryCallsFailed += 1;
    diagnostics.warnings.push(`Summary fetch failed for ${event.id} ${event.name}: ${e.message}`);
  }
}

diagnostics.rowsMapped = Object.values(cards).filter(v => v.yellow || v.straightRed).length;
diagnostics.nonZeroRows = countNonZeroRows(cards);

let caveat = "Cards are parsed only from explicit ESPN team statistics. Yellow cards are worth 1 point and red cards are worth 3 points. Commentary/key-event text is deliberately ignored to avoid double-counting.";

if (diagnostics.teamCardStats.length === 0) {
  const previousSource = String(existing.source || "");
  const existingCards = existing.cards || emptyCards(teams);
  const existingNonZero = countNonZeroRows(existingCards);

  // Do not preserve obviously inflated values produced by the old match-summary event/commentary parser.
  // Preserve values only when they were manually edited or came from the old discipline seed/table.
  const previousLooksInflated =
    previousSource.includes("ESPN match summaries") &&
    Object.values(existingCards).some(v => Number(v.yellow || 0) >= 8 || Number(v.straightRed || 0) >= 3);

  if (existingNonZero > 0 && !previousLooksInflated) {
    cards = existingCards;
    diagnostics.nonZeroRows = existingNonZero;
    diagnostics.rowsMapped = 0;
    diagnostics.warnings.push("No explicit ESPN team card statistics were parsed, so previous non-inflated card totals were preserved.");
    caveat += " Warning: no explicit ESPN team card statistics were parsed on this run, so previous non-inflated card totals were preserved.";
  } else {
    cards = emptyCards(teams);
    diagnostics.nonZeroRows = 0;
    diagnostics.rowsMapped = 0;
    diagnostics.warnings.push("No explicit ESPN team card statistics were parsed. Previous values were not preserved because they looked like duplicate-counted event/commentary totals.");
    caveat += " Warning: no explicit ESPN team card statistics were parsed, so totals were reset to zero rather than preserving likely duplicate-counted values.";
  }
}

const output = {
  source: "ESPN explicit team statistics",
  updatedAt: new Date().toISOString(),
  scoring: { yellow: 1, red: 3 },
  caveat,
  diagnostics,
  cards
};

await fs.writeFile("cards.json", JSON.stringify(output, null, 2) + "\n", "utf8");

console.log(
  `Wrote cards.json. Events found: ${diagnostics.eventsFound}; ` +
  `checked: ${diagnostics.eventsChecked}; summaries: ${diagnostics.summaryCallsSucceeded}; ` +
  `team stat rows: ${diagnostics.teamCardStats.length}; non-zero teams: ${diagnostics.nonZeroRows}.`
);
