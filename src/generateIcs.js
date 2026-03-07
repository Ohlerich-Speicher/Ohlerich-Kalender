const fs = require("fs");
const path = require("path");

function ymdToIcsDate(ymd) {
  return String(ymd).replace(/-/g, "");
}

function addOneDay(ymd) {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function nowStampUtc() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

function escapeIcsText(s) {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function generateIcsForApartment(apartment, occupiedDays) {
  const dtstamp = nowStampUtc();
  const days = Array.from(new Set(occupiedDays || [])).sort();

  const lines = [];
  lines.push("BEGIN:VCALENDAR");
  lines.push("VERSION:2.0");
  lines.push("PRODID:-//Ohlerich Calendar Sync//DE");
  lines.push("CALSCALE:GREGORIAN");
  lines.push("METHOD:PUBLISH");

  for (const day of days) {
    const nextDay = addOneDay(day);
    const uid = `${apartment.id}-${day.replace(/-/g, "")}@ohlerich-sync`;

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART;VALUE=DATE:${ymdToIcsDate(day)}`);
    lines.push(`DTEND;VALUE=DATE:${ymdToIcsDate(nextDay)}`);
    lines.push("SUMMARY:Belegt");
    lines.push(
      `DESCRIPTION:${escapeIcsText(`Quelle: ohlerich-speicher.de, ${apartment.title || apartment.name || apartment.id} (${apartment.id})`)}`
    );
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  lines.push("");

  return lines.join("\r\n");
}

function writeIcsFile(outDir, apartment, icsText) {
  fs.mkdirSync(outDir, { recursive: true });
  const filePath = path.join(outDir, `${apartment.id}.ics`);
  fs.writeFileSync(filePath, icsText, "utf8");
  return filePath;
}

function buildRanges(occupiedDays) {
  // wird im neuen Modus nicht mehr benutzt
  return Array.from(new Set(occupiedDays || [])).sort().map(day => ({
    start: day.replace(/-/g, ""),
    end: addOneDay(day).replace(/-/g, ""),
  }));
}

module.exports = {
  generateIcsForApartment,
  writeIcsFile,
  buildRanges,
};