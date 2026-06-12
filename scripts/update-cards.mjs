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
  const n = Number(String(v).replace("%", ""));
  return Number.isFinite(n) ? n : 0;
}

async function api(path) {
  const res = await fetch(BASE + path, {
    headers: { "x-apisports-key": API_KEY }
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${path} did not return JSON. HTTP ${res.status}. First 300 chars: ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    throw new Error(`${path} failed HTTP ${res.status}: ${JSON.stringify(data).slice(0, 500)}`);
  }
  if (data.errors && Object.keys(data.errors).length) {
    console.warn(`${path} errors:`, JSON.stringify(data.errors));
  }
  return data.response || [];
}

function fixtureIsWorthChecking(fixture) {
  const short = String(fixture?.fixture?.status?.short || "").toUpperCase();
  const elapsed = fixture?.fixture?.status?.elapsed;
  // Only query stats for fixtures that are live/finished/played, not not-started future games.
  return !["NS", "TBD", "PST", "CANC"].includes(short) || elapsed !== null;
}

function statValue(stats, wantedType) {
  const found = stats.find(s => norm(s.type) === norm(wantedType));
  return numberOrZero(found?.value);
}

if (!API_KEY) {
  throw new Error("Missing API_FOOTBALL_KEY GitHub secret");
}

const cards = Object.fromEntries(TEAMS.map(t => [t, { yellow: 0, secondYellow: 0, straightRed: 0 }]));
const diagnostics = {
  updatedAt: new Date().toISOString(),
  leagueId: LEAGUE_ID,
  season: SEASON,
  fixtureCount: 0,
  checkedFixtureCount: 0,
  statsFixtureCalls: 0,
  statsRows: 0,
  mappedTeamRows: 0,
  unmatchedTeams: [],
  notes: [],
  caveat: "API-Football fixture statistics expose Yellow Cards and Red Cards by team, but do not reliably split straight reds from second-yellow dismissals. Red Cards are treated as straightRed."
};

console.log(`Fetching fixtures league=${LEAGUE_ID} season=${SEASON}`);
const fixtures = await api(`/fixtures?league=${encodeURIComponent(LEAGUE_ID)}&season=${encodeURIComponent(SEASON)}`);
diagnostics.fixtureCount = fixtures.length;

const checkFixtures = fixtures.filter(fixtureIsWorthChecking);
diagnostics.checkedFixtureCount = checkFixtures.length;

console.log(`Found ${fixtures.length} fixtures; checking statistics for ${checkFixtures.length}`);

if (!checkFixtures.length) {
  diagnostics.notes.push("No live or played fixtures found; card totals will remain zero until fixtures are live or finished.");
}

for (const fixture of checkFixtures) {
  const fixtureId = fixture?.fixture?.id;
  if (!fixtureId) continue;
  diagnostics.statsFixtureCalls++;
  const rows = await api(`/fixtures/statistics?fixture=${encodeURIComponent(fixtureId)}`);
  diagnostics.statsRows += rows.length;

  for (const row of rows) {
    const rawTeam = row?.team?.name;
    const team = canonicalTeam(rawTeam);
    if (!team) {
      diagnostics.unmatchedTeams.push({ rawTeam, fixtureId });
      continue;
    }

    const stats = Array.isArray(row.statistics) ? row.statistics : [];
    const yellow = statValue(stats, "Yellow Cards");
    const red = statValue(stats, "Red Cards");

    cards[team].yellow += yellow;
    cards[team].straightRed += red;
    diagnostics.mappedTeamRows++;
  }
}

if (diagnostics.statsRows === 0 && checkFixtures.length) {
  diagnostics.notes.push("API-Football returned no fixture statistics rows for live/played fixtures. Check plan coverage and whether statistics are available for this competition.");
}

const output = {
  source: "API-Football fixtures/statistics",
  updatedAt: new Date().toISOString(),
  leagueId: LEAGUE_ID,
  season: SEASON,
  scoring: { yellow: 1, secondYellow: 2, straightRed: 3 },
  caveat: "Red Cards from fixture statistics are treated as straight reds because fixture statistics do not distinguish second-yellow dismissals.",
  diagnostics,
  cards
};

await fs.writeFile("cards.json", JSON.stringify(output, null, 2) + "\n", "utf8");
console.log(`Wrote cards.json. Stats rows ${diagnostics.statsRows}; mapped rows ${diagnostics.mappedTeamRows}.`);
