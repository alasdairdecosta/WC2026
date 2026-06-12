import fs from "node:fs/promises";

const API_KEY = process.env.WORLDCUPAPI_KEY || process.env.WORLD_CUP_API_KEY;
const BASE = process.env.WORLDCUPAPI_BASE || "https://api.worldcupapi.com";

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
  ["Czech Republic", "Czechia"], ["Czechia", "Czechia"]
]);

function norm(s) {
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const lookup = new Map();
for (const t of TEAMS) lookup.set(norm(t), t);
for (const [a, t] of ALIASES) lookup.set(norm(a), t);

function canonicalTeam(name) {
  return lookup.get(norm(name)) || null;
}

function num(v) {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function pick(obj, keys) {
  if (!obj || typeof obj !== "object") return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  }
  return undefined;
}

function findTeamName(row) {
  return pick(row, [
    "team", "teamName", "team_name", "country", "countryName", "country_name",
    "name", "nation", "team_en", "teamNameEn", "team_name_en"
  ]);
}

function extractRows(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.cards)) return raw.cards;
  if (Array.isArray(raw.data)) return raw.data;
  if (Array.isArray(raw.teams)) return raw.teams;
  if (Array.isArray(raw.disciplinary)) return raw.disciplinary;
  if (Array.isArray(raw.results)) return raw.results;
  if (raw.cards && typeof raw.cards === "object") {
    return Object.entries(raw.cards).map(([team, value]) => ({ team, ...(value || {}) }));
  }
  if (raw.data && typeof raw.data === "object") {
    return Object.entries(raw.data).map(([team, value]) => ({ team, ...(value || {}) }));
  }
  return [];
}

if (!API_KEY) {
  throw new Error("Missing WORLDCUPAPI_KEY GitHub secret");
}

const url = `${BASE.replace(/\/$/, "")}/cards?key=${encodeURIComponent(API_KEY)}`;
console.log(`Fetching cards from ${BASE}/cards`);
const res = await fetch(url, { headers: { "Accept": "application/json" } });
const text = await res.text();

let raw;
try {
  raw = JSON.parse(text);
} catch {
  throw new Error(`WorldCupAPI did not return JSON. HTTP ${res.status}. First 300 chars: ${text.slice(0, 300)}`);
}

if (!res.ok) {
  throw new Error(`WorldCupAPI /cards failed HTTP ${res.status}: ${JSON.stringify(raw).slice(0, 500)}`);
}

const rows = extractRows(raw);
const cards = Object.fromEntries(TEAMS.map(t => [t, { yellow: 0, secondYellow: 0, straightRed: 0 }]));
const diagnostics = {
  updatedAt: new Date().toISOString(),
  endpoint: `${BASE}/cards`,
  rowCount: rows.length,
  mappedRows: 0,
  unmatchedRows: [],
  sampleKeys: rows[0] ? Object.keys(rows[0]) : [],
  rawTopLevelKeys: raw && typeof raw === "object" ? Object.keys(raw) : []
};

for (const row of rows) {
  const rawTeam = findTeamName(row);
  const team = canonicalTeam(rawTeam);
  if (!team) {
    diagnostics.unmatchedRows.push({ rawTeam, row });
    continue;
  }

  const yellow = num(pick(row, ["yellow", "yellows", "yellowCards", "yellow_cards", "yellow_cards_total", "yc"]));
  const secondYellow = num(pick(row, ["secondYellow", "second_yellow", "yellowRed", "yellow_red", "secondYellowRed", "yellow_red_cards", "second_yellow_cards"]));
  const straightRed = num(pick(row, ["straightRed", "straight_red", "red", "reds", "redCards", "red_cards", "red_cards_total", "rc"]));

  const totalRed = num(pick(row, ["totalRedCards", "total_red_cards", "red_card_total"]));
  cards[team] = {
    yellow: yellow ?? 0,
    secondYellow: secondYellow ?? 0,
    straightRed: straightRed ?? totalRed ?? 0
  };
  diagnostics.mappedRows++;
}

const output = {
  source: "WorldCupAPI /cards",
  updatedAt: new Date().toISOString(),
  scoring: { yellow: 1, secondYellow: 2, straightRed: 3 },
  diagnostics,
  cards
};

await fs.writeFile("cards.json", JSON.stringify(output, null, 2) + "\n", "utf8");
console.log(`Wrote cards.json: ${diagnostics.mappedRows}/${diagnostics.rowCount} rows mapped`);
if (diagnostics.unmatchedRows.length) {
  console.log(`Unmatched rows: ${diagnostics.unmatchedRows.length}`);
}
