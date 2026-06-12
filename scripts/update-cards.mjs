import fs from "node:fs/promises";

const API_KEY = process.env.API_FOOTBALL_KEY;
const LEAGUE_ID = process.env.API_FOOTBALL_LEAGUE_ID || "1";
const SEASON = process.env.API_FOOTBALL_SEASON || "2026";
const BASE = "https://v3.football.api-sports.io";

const TEAMS = [
  "Mexico","South Africa","Korea Republic","Czechia","Canada","Bosnia and Herzegovina","Qatar","Switzerland",
  "Brazil","Morocco","Haiti","Scotland","USA","Paraguay","Australia","Türkiye","Germany","Curaçao",
  "Côte d'Ivoire","Ecuador","Netherlands","Japan","Sweden","Tunisia","Belgium","Egypt","IR Iran","New Zealand",
  "Spain","Cabo Verde","Saudi Arabia","Uruguay","France","Senegal","Iraq","Norway","Argentina","Algeria",
  "Austria","Jordan","Portugal","Colombia","Uzbekistan","Congo DR","England","Croatia","Ghana","Panama"
];

const ALIASES = new Map([
  ["United States", "USA"], ["USA", "USA"], ["USMNT", "USA"],
  ["South Korea", "Korea Republic"], ["Republic of Korea", "Korea Republic"], ["Korea Republic", "Korea Republic"],
  ["Iran", "IR Iran"], ["IR Iran", "IR Iran"],
  ["Turkey", "Türkiye"], ["Turkiye", "Türkiye"], ["Türkiye", "Türkiye"],
  ["Ivory Coast", "Côte d'Ivoire"], ["Cote d'Ivoire", "Côte d'Ivoire"], ["Côte d'Ivoire", "Côte d'Ivoire"],
  ["Cape Verde", "Cabo Verde"], ["Cabo Verde", "Cabo Verde"],
  ["DR Congo", "Congo DR"], ["Congo DR", "Congo DR"], ["Congo", "Congo DR"],
  ["Czech Republic", "Czechia"], ["Czechia", "Czechia"],
  ["Bosnia-Herzegovina", "Bosnia and Herzegovina"], ["Bosnia", "Bosnia and Herzegovina"]
]);

function norm(s) {
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const lookup = new Map();
for (const team of TEAMS) lookup.set(norm(team), team);
for (const [alias, team] of ALIASES) lookup.set(norm(alias), team);

function canonicalTeam(name) {
  return lookup.get(norm(name)) || null;
}

function numberOrZero(v) {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getCardsFromRow(row) {
  const stats = Array.isArray(row.statistics) ? row.statistics : [];
  let yellow = 0;
  let red = 0;
  let teamName = null;

  for (const stat of stats) {
    const t = stat?.team?.name || stat?.team?.team || stat?.teamName || null;
    if (t && !teamName) teamName = t;
    yellow = Math.max(yellow, numberOrZero(stat?.cards?.yellow ?? stat?.cards?.yellow_cards ?? stat?.yellow ?? stat?.yellowCards));
    red = Math.max(red, numberOrZero(stat?.cards?.red ?? stat?.cards?.red_cards ?? stat?.red ?? stat?.redCards));
  }

  teamName = teamName || row?.team?.name || row?.team?.team || row?.teamName || row?.statistics?.team?.name;
  return { teamName, yellow, red };
}

async function api(endpoint, page = 1) {
  const url = `${BASE}/${endpoint}?league=${encodeURIComponent(LEAGUE_ID)}&season=${encodeURIComponent(SEASON)}&page=${page}`;
  const res = await fetch(url, {
    headers: { "x-apisports-key": API_KEY }
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`${endpoint} HTTP ${res.status}: ${JSON.stringify(data).slice(0, 500)}`);
  if (data.errors && Object.keys(data.errors).length) {
    console.warn(`${endpoint} errors:`, JSON.stringify(data.errors));
  }
  return data;
}

async function fetchAll(endpoint) {
  const all = [];
  let page = 1;
  let totalPages = 1;

  do {
    const data = await api(endpoint, page);
    all.push(...(data.response || []));
    totalPages = Number(data?.paging?.total || 1);
    page += 1;
  } while (page <= totalPages);

  return all;
}

if (!API_KEY) {
  throw new Error("Missing API_FOOTBALL_KEY GitHub secret");
}

const cards = Object.fromEntries(TEAMS.map(t => [t, { yellow: 0, secondYellow: 0, straightRed: 0 }]));
const diagnostics = {
  updatedAt: new Date().toISOString(),
  leagueId: LEAGUE_ID,
  season: SEASON,
  yellowRows: 0,
  redRows: 0,
  mappedYellowRows: 0,
  mappedRedRows: 0,
  unmatchedYellowRows: [],
  unmatchedRedRows: [],
  caveat: "API-Football top-card endpoints are player ranking endpoints. Red cards are treated as straightRed unless API-Football exposes a separate second-yellow field."
};

console.log(`Fetching players/topyellowcards league=${LEAGUE_ID} season=${SEASON}`);
const yellowRows = await fetchAll("players/topyellowcards");
diagnostics.yellowRows = yellowRows.length;

for (const row of yellowRows) {
  const { teamName, yellow } = getCardsFromRow(row);
  const team = canonicalTeam(teamName);
  if (!team) {
    diagnostics.unmatchedYellowRows.push({ teamName, player: row?.player?.name || null });
    continue;
  }
  cards[team].yellow += yellow;
  diagnostics.mappedYellowRows++;
}

console.log(`Fetching players/topredcards league=${LEAGUE_ID} season=${SEASON}`);
const redRows = await fetchAll("players/topredcards");
diagnostics.redRows = redRows.length;

for (const row of redRows) {
  const { teamName, red } = getCardsFromRow(row);
  const team = canonicalTeam(teamName);
  if (!team) {
    diagnostics.unmatchedRedRows.push({ teamName, player: row?.player?.name || null });
    continue;
  }
  cards[team].straightRed += red;
  diagnostics.mappedRedRows++;
}

const output = {
  source: "API-Football players/topyellowcards + players/topredcards",
  updatedAt: new Date().toISOString(),
  leagueId: LEAGUE_ID,
  season: SEASON,
  scoring: { yellow: 1, secondYellow: 2, straightRed: 3 },
  caveat: "Red cards from API-Football topredcards are treated as straight reds because this endpoint does not reliably distinguish second-yellow dismissals.",
  diagnostics,
  cards
};

await fs.writeFile("cards.json", JSON.stringify(output, null, 2) + "\n", "utf8");
console.log(`Wrote cards.json. Yellow rows ${diagnostics.mappedYellowRows}/${diagnostics.yellowRows}; red rows ${diagnostics.mappedRedRows}/${diagnostics.redRows}.`);
