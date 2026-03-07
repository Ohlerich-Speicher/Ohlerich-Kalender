const fs = require("fs");
const path = require("path");

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
  return (days || []).join("|");
}

async function main() {
  const dataDir = path.join(__dirname, "..", "data");
  const docsDir = path.join(__dirname, "..", "docs");

  const apartmentsPath = path.join(dataDir, "apartments.json");
  const statePath = path.join(dataDir, "state.json");

  const apartments = readJson(apartmentsPath);

  let state = { last_hash: {} };

  if (fs.existsSync(statePath)) {
    state = readJson(statePath);
  }

  const results = await scrapeAll(apartments);

  let changedCount = 0;

  for (const r of results) {
    if (r.error) {
      console.log(`[${r.id}] error: ${r.error}`);
      continue;
    }

    const days = r.occupied_days || [];
    const h = hashDays(days);
    const old = state.last_hash[r.id];

    if (h !== old) {
      const ics = generateIcsForApartment(r, days);
      const filePath = writeIcsFile(docsDir, r, ics);

      state.last_hash[r.id] = h;
      changedCount++;

      console.log(
        `[${r.id}] update. days=${days.length}. file=${path.basename(filePath)}`
      );
    } else {
      console.log(`[${r.id}] ok. days=${days.length}`);
    }
  }

  writeJson(statePath, state);

  console.log(`done. updated=${changedCount}/${results.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});