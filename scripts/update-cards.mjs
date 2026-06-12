import fs from "node:fs/promises";

const API_KEY = process.env.API_FOOTBALL_KEY;
const LEAGUE_ID = process.env.API_FOOTBALL_LEAGUE_ID || "1";
const SEASON = process.env.API_FOOTBALL_SEASON || "2026";
const BASE = "https://v3.football.api-sports.io";

const TEAM_ALIASES = new Map([
  ["United States", "USA"],
  ["USA", "USA"],
  ["USMNT", "USA"],
  ["South Korea", "Korea Republic"],
  ["Korea Republic", "Korea Republic"],
  ["Iran", "IR Iran"],
  ["IR Iran", "IR Iran"],
  ["Turkey", "Türkiye"],
  ["Türkiye", "Türkiye"],
  ["Turkiye", "Türkiye"],
  ["Ivory Coast", "Côte d'Ivoire"],
  ["Cote d'Ivoire", "Côte d'Ivoire"],
  ["Côte d'Ivoire", "Côte d'Ivoire"],
  ["Cape Verde", "Cabo Verde"],
  ["Cabo Verde", "Cabo Verde"],
  ["DR Congo", "Congo DR"],
  ["Congo DR", "Congo DR"],
  ["Congo", "Congo DR"]
]);

const TEAMS = [
  "Mexico","South Africa","Korea Republic","Czechia","Canada","Bosnia and Herzegovina","Qatar","Switzerland",
  "Brazil","Morocco","Haiti","Scotland","USA","Paraguay","Australia","Türkiye","Germany","Curaçao",
  "Côte d'Ivoire","Ecuador","Netherlands","Japan","Sweden","Tunisia","Belgium","Egypt","IR Iran","New Zealand",
  "Spain","Cabo Verde","Saudi Arabia","Uruguay","France","Senegal","Iraq","Norway","Argentina","Algeria",
  "Austria","Jordan","Portugal","Colombia","Uzbekistan","Congo DR","England","Croatia","Ghana","Panama"
];

function norm(s) {
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const TEAM_LOOKUP = new Map();
for (const team of TEAMS) TEAM_LOOKUP.set(norm(team), team);
for (const [alias, team] of TEAM_ALIASES) TEAM_LOOKUP.set(norm(alias), team);

function canonicalTeam(name) {
  return TEAM_LOOKUP.get(norm(name)) || TEAM_ALIASES.get(name) || name;
}

async function api(path) {
  const res = await fetch(BASE + path, {
    headers: {
      "x-apisports-key": API_KEY
    }
  });
  if (!res.ok) throw new Error(`${path} failed with HTTP ${res.status}`);
  const data = await res.json();
  if (data.errors && Object.keys(data.errors).length) {
    console.warn("API errors for", path, data.errors);
  }
  return data.response || [];
}

function cardKind(event) {
  const type = String(event.type || "").toLowerCase();
  const detail = String(event.detail || event.comments || "").toLowerCase();

  if (!type.includes("card") && !detail.includes("card")) return null;

  if (detail.includes("second") || detail.includes("yellow/red") || detail.includes("yellow red")) {
    return "secondYellow";
  }
  if (detail.includes("red")) return "straightRed";
  if (detail.includes("yellow")) return "yellow";

  return null;
}

if (!API_KEY) {
  throw new Error("Missing API_FOOTBALL_KEY GitHub secret");
}

const cards = Object.fromEntries(TEAMS.map(t => [t, { yellow: 0, secondYellow: 0, straightRed: 0 }]));

console.log(`Fetching API-Football fixtures for league=${LEAGUE_ID}, season=${SEASON}`);
const fixtures = await api(`/fixtures?league=${encodeURIComponent(LEAGUE_ID)}&season=${encodeURIComponent(SEASON)}`);
console.log(`Found ${fixtures.length} fixture(s)`);

let eventCount = 0;
for (const fixture of fixtures) {
  const fixtureId = fixture?.fixture?.id;
  if (!fixtureId) continue;

  const events = await api(`/fixtures/events?fixture=${fixtureId}`);
  for (const event of events) {
    const kind = cardKind(event);
    if (!kind) continue;

    const teamName = canonicalTeam(event?.team?.name);
    if (!cards[teamName]) continue;

    cards[teamName][kind] += 1;
    eventCount++;
  }
}

const output = {
  source: "API-Football fixtures/events",
  updatedAt: new Date().toISOString(),
  leagueId: LEAGUE_ID,
  season: SEASON,
  eventCount,
  scoring: { yellow: 1, secondYellow: 2, straightRed: 3 },
  cards
};

await fs.writeFile("cards.json", JSON.stringify(output, null, 2) + "\n", "utf8");
console.log(`Wrote cards.json with ${eventCount} card event(s)`);
