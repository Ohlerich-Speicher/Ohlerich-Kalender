const fs = require("fs");
const path = require("path");

function yyyymmdd(iso) {
  return iso.replace(/-/g, "");
}

function addDaysIso(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function buildRanges(occupiedDays) {
  const days = (occupiedDays || []).slice().sort();
  const ranges = [];
  if (days.length === 0) return ranges;

  let start = days[0];
  let prev = days[0];

  for (let i = 1; i < days.length; i++) {
    const cur = days[i];
    const expected = addDaysIso(prev, 1);

    if (cur === expected) {
      prev = cur;
      continue;
    }

    ranges.push({ start, end_exclusive: addDaysIso(prev, 1) });
    start = cur;
    prev = cur;
  }

  ranges.push({ start, end_exclusive: addDaysIso(prev, 1) });
  return ranges;
}

function dtstampUtc() {
  const dt = new Date();
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  const hh = String(dt.getUTCHours()).padStart(2, "0");
  const mm = String(dt.getUTCMinutes()).padStart(2, "0");
  const ss = String(dt.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${d}T${hh}${mm}${ss}Z`;
}

function escapeText(s) {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function generateIcsForApartment(apartment, occupiedDays) {
  const ranges = buildRanges(occupiedDays);
  const stamp = dtstampUtc();

  const lines = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//Ohlerich Calendar Sync//DE");
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:PUBLISH");

  for (const r of ranges) {
    const uid = `${apartment.id}-${yyyymmdd(r.start)}-${yyyymmdd(r.end_exclusive)}@ohlerich-sync`;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${escapeText(uid)}`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`DTSTART;VALUE=DATE:${yyyymmdd(r.start)}`);
    lines.push(`DTEND;VALUE=DATE:${yyyymmdd(r.end_exclusive)}`);
    lines.push(`SUMMARY:${escapeText("Belegt")}`);
    lines.push(
      `DESCRIPTION:${escapeText(
        `Quelle: urlaub-in-boltenhagen.de, ${apartment.title} (${apartment.id})`
      )}`
    );
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

function writeIcsFile(outDir, apartment, icsText) {
  fs.mkdirSync(outDir, { recursive: true });
  const filePath = path.join(outDir, `${apartment.id}.ics`);
  fs.writeFileSync(filePath, icsText, "utf8");
  return filePath;
}

module.exports = {
  generateIcsForApartment,
  writeIcsFile,
  buildRanges,
};