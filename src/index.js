// src/index.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { scrapeAll } = require("./scrape");
const { generateIcsForApartment, writeIcsFile } = require("./generateIcs");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

function hashDays(days) {
  const h = crypto.createHash("sha256");
  h.update((days || []).join("|"));
  return h.digest("hex");
}

function parseEnvColors() {
  const raw = process.env.OCCUPIED_COLORS || "";
  return raw
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main() {
  const apartmentsPath = path.join(__dirname, "..", "data", "apartments.json");
  const statePath = path.join(__dirname, "..", "data", "state.json");
  const outDir = path.join(__dirname, "..", "public");

  const apartments = readJson(apartmentsPath);

  let state = { last_hash: {} };
  if (fs.existsSync(statePath)) state = readJson(statePath);

  const occupiedColors = parseEnvColors();
  const concurrency = Number(process.env.CONCURRENCY || 3);

  const results = await scrapeAll(apartments, {
    headless: process.env.HEADLESS !== "0",
    concurrency,
    occupiedColors,
  });

  let changedCount = 0;

  for (const r of results) {
    const h = hashDays(r.occupied_days);
    const prev = state.last_hash[r.id];

    const hasError = !!r.error;
    const changed = !hasError && h !== prev;

    if (hasError) {
      console.log(`[${r.id}] error: ${r.error}`);
      continue;
    }

    if (changed) {
      const ics = generateIcsForApartment(r, r.occupied_days);
      const filePath = writeIcsFile(outDir, r, ics);
      state.last_hash[r.id] = h;
      changedCount++;
      console.log(
        `[${r.id}] update. days=${r.occupied_days.length}. file=${path.basename(
          filePath
        )}`
      );
    } else {
      console.log(`[${r.id}] ok. days=${r.occupied_days.length}`);
    }

    if (process.env.PRINT_COLORS === "1") {
      const top = (r.debug_colors || [])
        .map(([c, n]) => `${c}=${n}`)
        .join(", ");
      console.log(`[${r.id}] colors: ${top}`);
    }
  }

  writeJson(statePath, state);
  console.log(`done. updated=${changedCount}/${results.length}`);
}

main().catch((e) => {
  console.error(String(e && e.stack ? e.stack : e));
  process.exit(1);
});