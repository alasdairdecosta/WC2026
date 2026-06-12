import fs from "node:fs/promises";

const ESPN_URLS = [
  process.env.ESPN_DISCIPLINE_URL || "https://www.espn.com/soccer/stats/_/league/FIFA.WORLD/view/discipline/season/2026",
  "https://www.espn.com/soccer/stats/_/league/FIFA.WORLD/view/discipline/season/2026/sort/points",
  "https://www.espn.com/soccer/stats/_/league/FIFA.WORLD/view/discipline/fifa-world-cup"
];

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
    .replace(/&gt;/g, " ")
    .replace(/\\u002F/g, "/")
    .replace(/\\u0026/g, "&")
    .replace(/\\u003C/g, "<")
    .replace(/\\u003E/g, ">");
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

function compact(s) {
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function toNumberToken(tok) {
  if (tok === undefined || tok === null) return 0;
  const s = String(tok).trim();
  if (!s || s === "-") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function emptyCards() {
  return Object.fromEntries(TEAMS.map(t => [t, { yellow: 0, secondYellow: 0, straightRed: 0 }]));
}

function parseFromReadableText(text, diagnostics) {
  const cards = emptyCards();

  for (const team of TEAMS) {
    const aliases = ESPN_NAMES.get(team) || [team];
    let matched = false;

    for (const alias of aliases) {
      // Handles rows like:
      // 1 South Africa 1 2 2 8
      // South Africa 1 2 2 8
      // South Africa ----
      const patterns = [
        new RegExp(`(?:^|\\s)(?:\\d+\\s+)?${escRegex(alias)}\\s+(-|\\d+)\\s+(-|\\d+)\\s+(-|\\d+)\\s+(-|\\d+)(?=\\s|$)`, "i"),
        new RegExp(`(?:^|\\s)(?:\\d+\\s*)?${escRegex(alias).replace(/\\ /g, "\\s*")}\\s*(-|\\d+)\\s*(-|\\d+)\\s*(-|\\d+)\\s*(-|\\d+)(?=\\s|$)`, "i")
      ];

      for (const re of patterns) {
        const m = text.match(re);
        if (m) {
          cards[team] = {
            yellow: toNumberToken(m[2]),
            secondYellow: 0,
            straightRed: toNumberToken(m[3])
          };
          diagnostics.matchedRows.push({ team, alias, played: m[1], yellow: m[2], red: m[3], espnPoints: m[4] });
          matched = true;
          break;
        }
      }
      if (matched) break;
    }

    if (!matched) diagnostics.unmatchedTeams.push(team);
  }

  return cards;
}

function parseFromCompactText(text, diagnostics) {
  const cards = emptyCards();
  const ctext = compact(text);

  for (const team of TEAMS) {
    const aliases = ESPN_NAMES.get(team) || [team];
    let matched = false;

    for (const alias of aliases) {
      const a = compact(alias);
      const idx = ctext.indexOf(a);
      if (idx < 0) continue;

      // After the compacted team name, ESPN rows should have P YC RC PTS as digits.
      // This is a fallback for markup where spaces disappear.
      const after = ctext.slice(idx + a.length, idx + a.length + 12);
      const m = after.match(/^(\d|-)(\d|-)(\d|-)(\d|-)/);
      if (m) {
        cards[team] = {
          yellow: toNumberToken(m[2]),
          secondYellow: 0,
          straightRed: toNumberToken(m[3])
        };
        diagnostics.compactMatches.push({ team, alias, snippet: after.slice(0, 8), played: m[1], yellow: m[2], red: m[3], espnPoints: m[4] });
        matched = true;
        break;
      }
    }
    if (!matched && !diagnostics.unmatchedTeams.includes(team)) diagnostics.unmatchedTeams.push(team);
  }

  return cards;
}

function mergeCards(primary, fallback) {
  const out = emptyCards();
  for (const team of TEAMS) {
    const p = primary[team] || {};
    const f = fallback[team] || {};
    out[team] = {
      yellow: Number.isFinite(Number(p.yellow)) ? Number(p.yellow) : Number(f.yellow || 0),
      secondYellow: 0,
      straightRed: Number.isFinite(Number(p.straightRed)) ? Number(p.straightRed) : Number(f.straightRed || 0)
    };
  }
  return out;
}

async function readExistingCards() {
  try {
    const data = JSON.parse(await fs.readFile("cards.json", "utf8"));
    return data.cards || emptyCards();
  } catch {
    return emptyCards();
  }
}

let best = null;
let lastError = null;

for (const url of ESPN_URLS) {
  try {
    console.log(`Fetching ESPN discipline stats from ${url}`);
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-GB,en;q=0.9,en-US;q=0.8"
      }
    });

    const html = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}. First 300 chars: ${html.slice(0, 300)}`);

    let text = stripHtml(html);
    const startIdx = text.search(/FIFA World Cup Discipline Stats|Discipline RK Team|RK Team P/i);
    const endIdx = text.search(/Glossary RK|Glossary/i);
    let parseText = text;
    if (startIdx >= 0 && endIdx > startIdx) parseText = text.slice(startIdx, endIdx);

    const diagnostics = {
      updatedAt: new Date().toISOString(),
      sourceUrl: url,
      finalUrl: res.url,
      httpStatus: res.status,
      htmlLength: html.length,
      textLength: text.length,
      parseTextLength: parseText.length,
      parseZoneFound: startIdx >= 0,
      matchedRows: [],
      compactMatches: [],
      unmatchedTeams: [],
      sampleText: parseText.slice(0, 800)
    };

    let readableCards = parseFromReadableText(parseText, diagnostics);
    let compactCards = parseFromCompactText(parseText, diagnostics);
    let cards = mergeCards(readableCards, compactCards);

    const rowsMapped = new Set([
      ...diagnostics.matchedRows.map(r => r.team),
      ...diagnostics.compactMatches.map(r => r.team)
    ]).size;
    diagnostics.rowsMapped = rowsMapped;

    if (!best || rowsMapped > best.diagnostics.rowsMapped) {
      best = { url, cards, diagnostics };
    }

    if (rowsMapped > 0) break;
  } catch (e) {
    lastError = e;
    console.warn(`Failed ESPN URL: ${url}`);
    console.warn(e.message);
  }
}

let source = "ESPN FIFA World Cup discipline stats";
let cards;
let diagnostics;
let caveat = "ESPN exposes YC and RC totals. Yellow cards are worth 1 point and red cards are worth 3 points.";

if (best && best.diagnostics.rowsMapped > 0) {
  cards = best.cards;
  diagnostics = best.diagnostics;
} else {
  // Do not hard-fail the Action. Keep the previous values so a temporary ESPN markup/blocking problem does not wipe data.
  cards = await readExistingCards();
  diagnostics = {
    updatedAt: new Date().toISOString(),
    rowsMapped: 0,
    sourceUrlsTried: ESPN_URLS,
    lastError: lastError ? lastError.message : null,
    warning: "No ESPN discipline rows were parsed. Previous cards.json values were preserved."
  };
  caveat += " Warning: no ESPN rows were parsed on the latest run, so previous card totals were preserved.";
  console.warn("No ESPN discipline rows parsed. Preserving existing cards.json values.");
}

const output = {
  source,
  updatedAt: new Date().toISOString(),
  scoring: { yellow: 1, red: 3 },
  caveat,
  diagnostics,
  cards
};

await fs.writeFile("cards.json", JSON.stringify(output, null, 2) + "\n", "utf8");
console.log(`Wrote cards.json. ESPN rows mapped: ${diagnostics.rowsMapped || 0}/${TEAMS.length}.`);
