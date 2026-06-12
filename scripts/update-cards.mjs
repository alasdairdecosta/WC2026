import fs from "node:fs/promises";

const ESPN_URL = process.env.ESPN_DISCIPLINE_URL || "https://www.espn.com/soccer/stats/_/league/FIFA.WORLD/view/discipline/season/2026/copa-mundial";

const TEAMS = [
  "Mexico","South Africa","Korea Republic","Czechia","Canada","Bosnia and Herzegovina","Qatar","Switzerland",
  "Brazil","Morocco","Haiti","Scotland","USA","Paraguay","Australia","Türkiye","Germany","Curaçao",
  "Côte d'Ivoire","Ecuador","Netherlands","Japan","Sweden","Tunisia","Belgium","Egypt","IR Iran","New Zealand",
  "Spain","Cabo Verde","Saudi Arabia","Uruguay","France","Senegal","Iraq","Norway","Argentina","Algeria",
  "Austria","Jordan","Portugal","Colombia","Uzbekistan","Congo DR","England","Croatia","Ghana","Panama"
];

const ESPN_NAMES = new Map([
  ["Mexico", ["Mexico"]],
  ["South Africa", ["South Africa"]],
  ["Korea Republic", ["South Korea", "Korea Republic", "Republic of Korea"]],
  ["Czechia", ["Czechia", "Czech Republic"]],
  ["Canada", ["Canada"]],
  ["Bosnia and Herzegovina", ["Bosnia-Herzegovina", "Bosnia and Herzegovina", "Bosnia"]],
  ["Qatar", ["Qatar"]],
  ["Switzerland", ["Switzerland"]],
  ["Brazil", ["Brazil"]],
  ["Morocco", ["Morocco"]],
  ["Haiti", ["Haiti"]],
  ["Scotland", ["Scotland"]],
  ["USA", ["United States", "USA"]],
  ["Paraguay", ["Paraguay"]],
  ["Australia", ["Australia"]],
  ["Türkiye", ["Türkiye", "Turkey", "Turkiye"]],
  ["Germany", ["Germany"]],
  ["Curaçao", ["Curaçao", "Curacao"]],
  ["Côte d'Ivoire", ["Ivory Coast", "Côte d'Ivoire", "Cote d'Ivoire"]],
  ["Ecuador", ["Ecuador"]],
  ["Netherlands", ["Netherlands"]],
  ["Japan", ["Japan"]],
  ["Sweden", ["Sweden"]],
  ["Tunisia", ["Tunisia"]],
  ["Belgium", ["Belgium"]],
  ["Egypt", ["Egypt"]],
  ["IR Iran", ["Iran", "IR Iran"]],
  ["New Zealand", ["New Zealand"]],
  ["Spain", ["Spain"]],
  ["Cabo Verde", ["Cape Verde", "Cabo Verde"]],
  ["Saudi Arabia", ["Saudi Arabia"]],
  ["Uruguay", ["Uruguay"]],
  ["France", ["France"]],
  ["Senegal", ["Senegal"]],
  ["Iraq", ["Iraq"]],
  ["Norway", ["Norway"]],
  ["Argentina", ["Argentina"]],
  ["Algeria", ["Algeria"]],
  ["Austria", ["Austria"]],
  ["Jordan", ["Jordan"]],
  ["Portugal", ["Portugal"]],
  ["Colombia", ["Colombia"]],
  ["Uzbekistan", ["Uzbekistan"]],
  ["Congo DR", ["Congo DR", "DR Congo", "Congo"]],
  ["England", ["England"]],
  ["Croatia", ["Croatia"]],
  ["Ghana", ["Ghana"]],
  ["Panama", ["Panama"]]
]);

function htmlDecode(s) {
  return String(s)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(html) {
  return htmlDecode(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toNumberToken(tok) {
  if (tok === undefined || tok === null) return 0;
  const s = String(tok).trim();
  if (!s || s === "-") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function findTeamStats(text, team, diagnostics) {
  const aliases = ESPN_NAMES.get(team) || [team];
  for (const alias of aliases) {
    // ESPN discipline rows appear as: Team P YC RC PTS
    // Example: South Africa 1 2 2 8
    const re = new RegExp(`(?:^|\\s)${escRegex(alias)}\\s+(-|\\d+)\\s+(-|\\d+)\\s+(-|\\d+)\\s+(-|\\d+)(?=\\s|$)`, "i");
    const m = text.match(re);
    if (m) {
      return {
        alias,
        played: toNumberToken(m[1]),
        yellow: toNumberToken(m[2]),
        red: toNumberToken(m[3]),
        espnPoints: toNumberToken(m[4])
      };
    }
  }
  diagnostics.unmatchedTeams.push(team);
  return null;
}

console.log(`Fetching ESPN discipline stats from ${ESPN_URL}`);
const res = await fetch(ESPN_URL, {
  headers: {
    "user-agent": "Mozilla/5.0 (compatible; OIT World Cup sweepstake card updater)",
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
  }
});

const html = await res.text();
if (!res.ok) {
  throw new Error(`ESPN request failed HTTP ${res.status}. First 300 chars: ${html.slice(0, 300)}`);
}

let text = stripHtml(html);

// Narrow the parsing zone if the headings are present.
const startIdx = text.search(/Performance Discipline|Discipline RK Team|RK Team P YC RC PTS/i);
const endIdx = text.search(/Glossary RK|Glossary/i);
if (startIdx >= 0 && endIdx > startIdx) {
  text = text.slice(startIdx, endIdx);
}

const cards = Object.fromEntries(TEAMS.map(t => [t, { yellow: 0, secondYellow: 0, straightRed: 0 }]));
const diagnostics = {
  updatedAt: new Date().toISOString(),
  sourceUrl: ESPN_URL,
  htmlLength: html.length,
  textLength: text.length,
  parseZoneFound: startIdx >= 0,
  rowsMapped: 0,
  unmatchedTeams: [],
  sampleText: text.slice(0, 600)
};

for (const team of TEAMS) {
  const stats = findTeamStats(text, team, diagnostics);
  if (!stats) continue;
  cards[team] = {
    yellow: stats.yellow,
    secondYellow: 0,
    straightRed: stats.red
  };
  diagnostics.rowsMapped++;
}

if (diagnostics.rowsMapped === 0) {
  throw new Error("No ESPN discipline rows were parsed. ESPN may have changed the page markup or blocked the request.");
}

const output = {
  source: "ESPN FIFA World Cup discipline stats",
  updatedAt: new Date().toISOString(),
  scoring: { yellow: 1, red: 3 },
  caveat: "ESPN exposes YC and RC totals. Yellow cards are worth 1 point and red cards are worth 3 points.",
  diagnostics,
  cards
};

await fs.writeFile("cards.json", JSON.stringify(output, null, 2) + "\n", "utf8");
console.log(`Wrote cards.json from ESPN. Rows mapped: ${diagnostics.rowsMapped}/${TEAMS.length}.`);
