import fs from "node:fs/promises";

const ENDPOINTS = ["https://worldcup26.ir/get/games", "https://www.worldcup26.ir/get/games"];

function norm(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

const TEAM_ALIASES = new Map([
  ["south korea", "Korea Republic"], ["republic of korea", "Korea Republic"], ["korea republic", "Korea Republic"],
  ["iran", "IR Iran"], ["ir iran", "IR Iran"],
  ["turkey", "Türkiye"], ["turkiye", "Türkiye"],
  ["ivory coast", "Côte d'Ivoire"], ["cote d ivoire", "Côte d'Ivoire"],
  ["cape verde", "Cabo Verde"], ["dr congo", "Congo DR"], ["congo dr", "Congo DR"],
  ["czech republic", "Czechia"], ["usa", "USA"], ["united states", "USA"],
  ["bosnia herzegovina", "Bosnia and Herzegovina"], ["bosnia and herzegovina", "Bosnia and Herzegovina"],
  ["curacao", "Curaçao"], ["curaçao", "Curaçao"]
]);

function canonicalTeam(s) {
  return TEAM_ALIASES.get(norm(s)) || String(s || "").trim();
}

function arrayFromPayload(data) {
  if (Array.isArray(data)) return data;
  for (const k of ["data", "games", "matches", "response"]) if (Array.isArray(data?.[k])) return data[k];
  return [];
}

function firstValue(obj, keys) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") return obj[key];
  }
}

function numericScore(v) {
  if (v === undefined || v === null || v === "") return undefined;
  if (Array.isArray(v)) return v.length;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function statusLabel(raw) {
  const s = String(raw || "").toLowerCase().trim();
  if (!s || ["scheduled", "notstarted", "not started", "upcoming", "tbd", "ns", "false"].includes(s)) return "scheduled";
  if (["finished", "fulltime", "full time", "ft", "final", "completed", "true"].includes(s) || s.includes("finish") || s.includes("full") || s.includes("final")) return "finished";
  if (s.includes("live") || s.includes("progress") || s.includes("half")) return "live";
  return raw;
}

function parseMatch(row) {
  const home = firstValue(row, ["home_team_name_en", "homeTeamName", "home_team", "home", "team1", "team_a", "localteam_name"]);
  const away = firstValue(row, ["away_team_name_en", "awayTeamName", "away_team", "away", "team2", "team_b", "visitorteam_name"]);
  const statusRaw = firstValue(row, ["status", "match_status", "state", "finished", "is_finished", "time_elapsed"]);
  return {
    id: firstValue(row, ["id", "_id", "match_id", "game_id", "number"]),
    t1: canonicalTeam(home),
    t2: canonicalTeam(away),
    score1: numericScore(firstValue(row, ["home_score", "homeScore", "home_goals", "score1", "team1_score", "localteam_score"])),
    score2: numericScore(firstValue(row, ["away_score", "awayScore", "away_goals", "score2", "team2_score", "visitorteam_score"])),
    status: statusLabel(statusRaw),
    rawStatus: statusRaw
  };
}

async function fetchJson(url) {
  const res = await fetch(url, {headers: {"accept": "application/json,text/plain,*/*", "user-agent": "Mozilla/5.0 (compatible; OIT sweepstake live updater)"}});
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { throw new Error(`Non-JSON response: ${text.slice(0, 300)}`); }
}

async function readExisting() {
  try { return JSON.parse(await fs.readFile("live.json", "utf8")); } catch { return null; }
}

const diagnostics = {updatedAt: new Date().toISOString(), endpointsTried: [], endpointUsed: null, rowsRead: 0, matchesParsed: 0, warning: null};
let output = null;

for (const endpoint of ENDPOINTS) {
  diagnostics.endpointsTried.push(endpoint);
  try {
    const data = await fetchJson(endpoint);
    const rows = arrayFromPayload(data);
    diagnostics.endpointUsed = endpoint;
    diagnostics.rowsRead = rows.length;
    const matches = rows.map(parseMatch).filter(m => m.t1 && m.t2);
    diagnostics.matchesParsed = matches.length;
    output = {source: "WorldCup26 API via GitHub Actions", updatedAt: new Date().toISOString(), caveat: "Live scores are fetched server-side by GitHub Actions to avoid browser CORS failures.", diagnostics, matches};
    break;
  } catch (e) {
    diagnostics.warning = `${endpoint} failed: ${e.message}`;
  }
}

if (!output) {
  output = await readExisting() || {source: "WorldCup26 API via GitHub Actions", updatedAt: new Date().toISOString(), caveat: "Live-score update failed and no previous live.json was available.", diagnostics, matches: []};
  output.diagnostics = {...(output.diagnostics || {}), latestUpdateFailure: diagnostics};
  output.caveat = "Live-score update failed, so previous live.json values were preserved.";
}

await fs.writeFile("live.json", JSON.stringify(output, null, 2) + "\n", "utf8");
console.log(`Wrote live.json: ${output.matches?.length || 0} matches. Endpoint: ${diagnostics.endpointUsed || "none"}`);
