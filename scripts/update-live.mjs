import fs from "node:fs/promises";

const NOW = new Date();
const OUT_PATH = "live.json";
const MANUAL_OVERRIDE_PATH = "live-override.json";

// Layer 1: existing specialist World Cup source, with several URL variants.
const WORLD_CUP_26_ENDPOINTS = [
  "https://worldcup26.ir/get/games",
  "https://www.worldcup26.ir/get/games",
  "http://worldcup26.ir/get/games",
  "http://www.worldcup26.ir/get/games"
];

// Layer 2: ESPN public scoreboard endpoints. These have usually been more reliable for scores.
const ESPN_ENDPOINTS = [
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=500&dates=20260611-20260719",
  "https://site.web.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=500&dates=20260611-20260719",
  "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=500",
  "https://site.web.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=500"
];

// Layer 3: date-window ESPN fallback. Useful if the broad dates endpoint gets truncated.
function espnDateWindowEndpoints() {
  const windows = [
    ["20260611", "20260618"],
    ["20260619", "20260627"],
    ["20260628", "20260705"],
    ["20260706", "20260719"]
  ];
  const urls = [];
  for (const [from, to] of windows) {
    urls.push(`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=200&dates=${from}-${to}`);
    urls.push(`https://site.web.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=200&dates=${from}-${to}`);
  }
  return urls;
}

function norm(s) {
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const TEAM_ALIASES = new Map([
  ["south korea", "Korea Republic"], ["republic of korea", "Korea Republic"], ["korea republic", "Korea Republic"], ["korea", "Korea Republic"], ["kor", "Korea Republic"],
  ["iran", "IR Iran"], ["ir iran", "IR Iran"], ["iri", "IR Iran"],
  ["turkey", "Türkiye"], ["turkiye", "Türkiye"], ["türkiye", "Türkiye"], ["tur", "Türkiye"],
  ["ivory coast", "Côte d'Ivoire"], ["cote d ivoire", "Côte d'Ivoire"], ["côte d ivoire", "Côte d'Ivoire"], ["civ", "Côte d'Ivoire"],
  ["cape verde", "Cabo Verde"], ["cabo verde", "Cabo Verde"], ["cpv", "Cabo Verde"],
  ["dr congo", "Congo DR"], ["congo dr", "Congo DR"], ["drc", "Congo DR"], ["cod", "Congo DR"], ["d r congo", "Congo DR"], ["democratic republic of the congo", "Congo DR"], ["congo democratic republic", "Congo DR"], ["dem republic congo", "Congo DR"],
  ["czech republic", "Czechia"], ["czechia", "Czechia"], ["cze", "Czechia"],
  ["usa", "USA"], ["united states", "USA"], ["united states of america", "USA"], ["us", "USA"],
  ["bosnia herzegovina", "Bosnia and Herzegovina"], ["bosnia and herzegovina", "Bosnia and Herzegovina"], ["bosnia", "Bosnia and Herzegovina"], ["bih", "Bosnia and Herzegovina"],
  ["curacao", "Curaçao"], ["curaçao", "Curaçao"], ["cuw", "Curaçao"],
  ["new zealand", "New Zealand"], ["nzl", "New Zealand"],
  ["saudi arabia", "Saudi Arabia"], ["ksa", "Saudi Arabia"],
  ["netherlands", "Netherlands"], ["holland", "Netherlands"], ["ned", "Netherlands"],
  ["argentina", "Argentina"], ["arg", "Argentina"],
  ["algeria", "Algeria"], ["dza", "Algeria"],
  ["austria", "Austria"], ["aut", "Austria"],
  ["jordan", "Jordan"], ["jor", "Jordan"],
  ["portugal", "Portugal"], ["por", "Portugal"],
  ["england", "England"], ["eng", "England"],
  ["croatia", "Croatia"], ["cro", "Croatia"],
  ["iraq", "Iraq"], ["irq", "Iraq"],
  ["norway", "Norway"], ["nor", "Norway"],
  ["france", "France"], ["fra", "France"],
  ["senegal", "Senegal"], ["sen", "Senegal"],
  ["mexico", "Mexico"], ["mex", "Mexico"],
  ["south africa", "South Africa"], ["rsa", "South Africa"],
  ["canada", "Canada"], ["can", "Canada"],
  ["qatar", "Qatar"], ["qat", "Qatar"],
  ["switzerland", "Switzerland"], ["sui", "Switzerland"],
  ["brazil", "Brazil"], ["bra", "Brazil"],
  ["morocco", "Morocco"], ["mar", "Morocco"],
  ["haiti", "Haiti"], ["hti", "Haiti"],
  ["scotland", "Scotland"], ["sco", "Scotland"],
  ["paraguay", "Paraguay"], ["par", "Paraguay"],
  ["australia", "Australia"], ["aus", "Australia"],
  ["germany", "Germany"], ["ger", "Germany"],
  ["ecuador", "Ecuador"], ["ecu", "Ecuador"],
  ["japan", "Japan"], ["jpn", "Japan"],
  ["sweden", "Sweden"], ["swe", "Sweden"],
  ["tunisia", "Tunisia"], ["tun", "Tunisia"],
  ["belgium", "Belgium"], ["bel", "Belgium"],
  ["egypt", "Egypt"], ["egy", "Egypt"],
  ["spain", "Spain"], ["esp", "Spain"],
  ["uruguay", "Uruguay"], ["uru", "Uruguay"],
  ["ghana", "Ghana"], ["gha", "Ghana"],
  ["panama", "Panama"], ["pan", "Panama"],
  ["uzbekistan", "Uzbekistan"], ["uzb", "Uzbekistan"],
  ["colombia", "Colombia"], ["col", "Colombia"]
]);

function canonicalTeam(s) {
  const raw = String(s || "").trim();
  if (!raw) return "";
  const n = norm(raw);
  return TEAM_ALIASES.get(n) || raw;
}

function numericScore(v) {
  if (v === undefined || v === null || v === "") return undefined;
  if (Array.isArray(v)) return v.length;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function firstValue(obj, keys) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== "") return obj[key];
  }
}

function statusLabel(raw) {
  const s = String(raw || "").toLowerCase().trim();
  if (!s || ["scheduled", "notstarted", "not started", "upcoming", "tbd", "ns", "pre", "pre-game", "false"].includes(s)) return "scheduled";
  if (["finished", "fulltime", "full time", "ft", "final", "completed", "complete", "post", "true"].includes(s) || s.includes("finish") || s.includes("full") || s.includes("final") || s.includes("complete")) return "finished";
  if (s.includes("live") || s.includes("progress") || s.includes("half") || s.includes("in-game") || s === "in") return "live";
  return raw || "scheduled";
}

function arrayFromPayload(data) {
  if (Array.isArray(data)) return data;
  for (const k of ["data", "games", "matches", "response", "events"]) {
    if (Array.isArray(data?.[k])) return data[k];
  }
  return [];
}

async function fetchJson(url, timeoutMs = 25000) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "accept": "application/json,text/plain,*/*",
        "user-agent": "Mozilla/5.0 (compatible; OIT World Cup sweepstake live updater)"
      }
    });
    const text = await res.text();
    const ms = Date.now() - started;
    if (!res.ok) throw new Error(`HTTP ${res.status} after ${ms}ms: ${text.slice(0, 300)}`);
    try {
      return { json: JSON.parse(text), ms };
    } catch {
      throw new Error(`Non-JSON response after ${ms}ms: ${text.slice(0, 300)}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function readJsonIfExists(path) {
  try {
    return JSON.parse(await fs.readFile(path, "utf8"));
  } catch {
    return null;
  }
}

function parseWorldCup26Row(row) {
  const home = firstValue(row, ["home_team_name_en", "homeTeamName", "home_team", "home", "team1", "team_a", "localteam_name", "homeTeam", "home_name"]);
  const away = firstValue(row, ["away_team_name_en", "awayTeamName", "away_team", "away", "team2", "team_b", "visitorteam_name", "awayTeam", "away_name"]);
  const statusRaw = firstValue(row, ["status", "match_status", "state", "finished", "is_finished", "time_elapsed", "status_en"]);
  return {
    id: firstValue(row, ["id", "_id", "match_id", "game_id", "number"]),
    t1: canonicalTeam(home),
    t2: canonicalTeam(away),
    score1: numericScore(firstValue(row, ["home_score", "homeScore", "home_goals", "score1", "team1_score", "localteam_score", "homeTeamScore", "home_result"])),
    score2: numericScore(firstValue(row, ["away_score", "awayScore", "away_goals", "score2", "team2_score", "visitorteam_score", "awayTeamScore", "away_result"])),
    status: statusLabel(statusRaw),
    rawStatus: statusRaw,
    source: "WorldCup26"
  };
}

function parseEspnEvent(event) {
  const comp = event?.competitions?.[0] || event;
  const competitors = comp?.competitors || [];
  const home = competitors.find(c => c.homeAway === "home") || competitors[0];
  const away = competitors.find(c => c.homeAway === "away") || competitors[1];

  const homeName = home?.team?.displayName || home?.team?.shortDisplayName || home?.team?.name || home?.team?.abbreviation || home?.displayName;
  const awayName = away?.team?.displayName || away?.team?.shortDisplayName || away?.team?.name || away?.team?.abbreviation || away?.displayName;

  const statusRaw = event?.status?.type?.name || event?.status?.type?.state || event?.status?.type?.description || comp?.status?.type?.name;
  const statusState = event?.status?.type?.state || comp?.status?.type?.state;

  return {
    id: event?.id || comp?.id,
    t1: canonicalTeam(homeName),
    t2: canonicalTeam(awayName),
    score1: numericScore(home?.score),
    score2: numericScore(away?.score),
    status: statusLabel(statusState || statusRaw),
    rawStatus: statusRaw || statusState,
    kickoff: event?.date || comp?.date,
    source: "ESPN"
  };
}

function matchKey(m) {
  return [norm(m.t1), norm(m.t2)].sort().join("|");
}

function hasScore(m) {
  return m && m.score1 !== undefined && m.score2 !== undefined;
}

function isLiveOrFinished(m) {
  const s = statusLabel(m?.status);
  return s === "live" || s === "finished";
}

function scoredMatchCount(matches) {
  return matches.filter(m => hasScore(m) && isLiveOrFinished(m)).length;
}

function qualityScore(m) {
  let score = 0;
  if (hasScore(m)) score += 100;
  if (statusLabel(m.status) === "finished") score += 40;
  if (statusLabel(m.status) === "live") score += 30;
  if (m.kickoff) score += 5;
  if (m.source === "manual override") score += 1000;
  if (m.source === "ESPN") score += 10;
  return score;
}

function dedupeAndPreferBest(matches) {
  const map = new Map();
  for (const m of matches) {
    if (!m?.t1 || !m?.t2) continue;
    const key = matchKey(m);
    const existing = map.get(key);
    if (!existing || qualityScore(m) >= qualityScore(existing)) map.set(key, m);
  }
  return [...map.values()];
}

function mergeWithPrevious(newMatches, previousMatches, diagnostics) {
  const combined = new Map();

  for (const m of previousMatches || []) {
    if (!m?.t1 || !m?.t2) continue;
    combined.set(matchKey(m), { ...m, source: m.source || "previous live.json" });
  }

  let preservedScores = 0;
  let replacedScores = 0;
  let newScores = 0;

  for (const m of newMatches || []) {
    if (!m?.t1 || !m?.t2) continue;
    const key = matchKey(m);
    const prev = combined.get(key);

    if (!prev) {
      combined.set(key, m);
      if (hasScore(m)) newScores++;
      continue;
    }

    if (hasScore(m) || !hasScore(prev)) {
      if (hasScore(m) && hasScore(prev)) replacedScores++;
      combined.set(key, qualityScore(m) >= qualityScore(prev) ? m : prev);
    } else {
      preservedScores++;
      combined.set(key, prev);
    }
  }

  diagnostics.previousScoresPreserved = preservedScores;
  diagnostics.previousScoresReplaced = replacedScores;
  diagnostics.newScoreMatchesAdded = newScores;
  return [...combined.values()];
}

async function trySourceGroup(name, urls, parser, diagnostics, { stopOnFirstGood = false } = {}) {
  const all = [];
  for (const url of urls) {
    const attempt = { source: name, url, ok: false, rowsRead: 0, matchesParsed: 0, scoreMatchesParsed: 0 };
    diagnostics.attempts.push(attempt);
    try {
      const { json, ms } = await fetchJson(url);
      attempt.ms = ms;
      const rows = arrayFromPayload(json);
      attempt.rowsRead = rows.length;
      const matches = rows.map(parser).filter(m => m.t1 && m.t2);
      attempt.matchesParsed = matches.length;
      attempt.scoreMatchesParsed = scoredMatchCount(matches);
      attempt.ok = matches.length > 0;
      attempt.sample = matches.slice(0, 8).map(m => `${m.t1} ${m.score1 ?? ""}-${m.score2 ?? ""} ${m.t2} (${m.status})`);
      all.push(...matches);
      if (stopOnFirstGood && attempt.ok && attempt.scoreMatchesParsed > 0) break;
    } catch (e) {
      attempt.error = e.message;
    }
  }
  return dedupeAndPreferBest(all);
}

async function manualOverrideMatches(diagnostics) {
  const manual = await readJsonIfExists(MANUAL_OVERRIDE_PATH);
  if (!manual) return [];
  const raw = Array.isArray(manual) ? manual : Array.isArray(manual.matches) ? manual.matches : [];
  const matches = raw.map(m => ({
    id: m.id,
    t1: canonicalTeam(m.t1 || m.team1 || m.home || m.home_team),
    t2: canonicalTeam(m.t2 || m.team2 || m.away || m.away_team),
    score1: numericScore(m.score1 ?? m.homeScore ?? m.home_score),
    score2: numericScore(m.score2 ?? m.awayScore ?? m.away_score),
    status: statusLabel(m.status || "finished"),
    rawStatus: m.status,
    source: "manual override"
  })).filter(m => m.t1 && m.t2);

  diagnostics.manualOverride = {
    file: MANUAL_OVERRIDE_PATH,
    rowsRead: raw.length,
    matchesParsed: matches.length,
    scoreMatchesParsed: scoredMatchCount(matches)
  };

  return matches;
}

const diagnostics = {
  generatedAt: NOW.toISOString(),
  strategy: [
    "manual override, if present",
    "WorldCup26 endpoint variants",
    "ESPN broad scoreboard endpoints",
    "ESPN date-window scoreboard endpoints",
    "merge with previous live.json so scored results are not lost",
    "preserve previous live.json if all sources fail"
  ],
  attempts: [],
  selectedSource: null,
  rowsRead: 0,
  matchesParsed: 0,
  scoreMatchesParsed: 0,
  previousScoresPreserved: 0,
  previousScoresReplaced: 0,
  newScoreMatchesAdded: 0,
  warning: null,
  stale: false
};

const previous = await readJsonIfExists(OUT_PATH);
const previousMatches = Array.isArray(previous?.matches) ? previous.matches : [];

const manualMatches = await manualOverrideMatches(diagnostics);
const wcMatches = await trySourceGroup("WorldCup26", WORLD_CUP_26_ENDPOINTS, parseWorldCup26Row, diagnostics);
const espnBroadMatches = await trySourceGroup("ESPN broad", ESPN_ENDPOINTS, parseEspnEvent, diagnostics);
const espnWindowMatches = await trySourceGroup("ESPN date windows", espnDateWindowEndpoints(), parseEspnEvent, diagnostics);

let selected = dedupeAndPreferBest([
  ...wcMatches,
  ...espnBroadMatches,
  ...espnWindowMatches,
  ...manualMatches
]);

selected = mergeWithPrevious(selected, previousMatches, diagnostics);
selected = dedupeAndPreferBest(selected);

diagnostics.rowsRead = diagnostics.attempts.reduce((sum, a) => sum + (a.rowsRead || 0), 0) + (diagnostics.manualOverride?.rowsRead || 0);
diagnostics.matchesParsed = selected.length;
diagnostics.scoreMatchesParsed = scoredMatchCount(selected);

const sourceSummary = [];
if (manualMatches.length) sourceSummary.push("manual override");
if (wcMatches.length) sourceSummary.push("WorldCup26");
if (espnBroadMatches.length) sourceSummary.push("ESPN broad");
if (espnWindowMatches.length) sourceSummary.push("ESPN date windows");
if (previousMatches.length) sourceSummary.push("previous live.json preservation");
diagnostics.selectedSource = sourceSummary.length ? sourceSummary.join(" + ") : "none";

if (!selected.length) {
  diagnostics.warning = "All live-score sources returned zero usable matches and no previous live.json data was available.";
  diagnostics.stale = true;
} else if (scoredMatchCount(selected) === 0) {
  diagnostics.warning = "Live-score sources returned matches but no scored/live or finished results. Check upstream sources.";
  diagnostics.stale = true;
} else if (!espnBroadMatches.length && !espnWindowMatches.length && !wcMatches.length) {
  diagnostics.warning = "Only previous/manual data is available; live API sources failed or returned no usable matches.";
  diagnostics.stale = true;
} else if (!wcMatches.length) {
  diagnostics.warning = "WorldCup26 returned no usable matches; fallback sources were used.";
} else if (espnBroadMatches.length || espnWindowMatches.length) {
  diagnostics.warning = "Multiple live data sources were merged for redundancy.";
}

const output = selected.length ? {
  source: diagnostics.selectedSource,
  updatedAt: NOW.toISOString(),
  caveat: diagnostics.warning || "Live scores fetched by GitHub Actions using redundant sources.",
  diagnostics,
  matches: selected
} : (previous ? {
  ...previous,
  diagnostics,
  caveat: "Live-score update failed; previous live.json values were preserved.",
  updatedAt: previous.updatedAt || NOW.toISOString()
} : {
  source: "Live data updater",
  updatedAt: NOW.toISOString(),
  caveat: "No live-score source returned usable data and no previous live.json was available.",
  diagnostics,
  matches: []
});

await fs.writeFile(OUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf8");

console.log(`Wrote ${OUT_PATH}`);
console.log(`Selected source: ${output.diagnostics?.selectedSource || output.source}`);
console.log(`Matches: ${output.matches?.length || 0}; scored/live-finished: ${scoredMatchCount(output.matches || [])}`);
if (output.diagnostics?.warning) console.log(`Warning: ${output.diagnostics.warning}`);
