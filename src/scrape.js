const { chromium } = require("playwright");

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toIso(y, m, d) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function normalizeMonthName(s) {
  return (s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\u00e4/g, "ae") // ä
    .replace(/\u00f6/g, "oe") // ö
    .replace(/\u00fc/g, "ue") // ü
    .replace(/\u00df/g, "ss") // ß
    .trim();
}

const MONTHS = {
  januar: 1,
  februar: 2,
  maerz: 3,
  april: 4,
  mai: 5,
  juni: 6,
  juli: 7,
  august: 8,
  september: 9,
  oktober: 10,
  november: 11,
  dezember: 12,
};

function parseMonthYear(text) {
  const t = normalizeMonthName(text);
  const m = t.match(
    /(januar|februar|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)\s+(\d{4})/
  );
  if (!m) return null;
  const month = MONTHS[m[1]];
  const year = Number(m[2]);
  if (!month || !year) return null;
  return { year, month };
}

function parseRgb(bg) {
  const s = String(bg || "").replace(/\s+/g, "");
  if (s === "transparent" || s === "rgba(0,0,0,0)" || !s) return null;

  let m = s.match(/^rgb\((\d+),(\d+),(\d+)\)$/i);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: 1 };

  m = s.match(/^rgba\((\d+),(\d+),(\d+),([0-9.]+)\)$/i);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: +m[4] };

  return null;
}

function looksLikeBlue(rgb) {
  if (!rgb) return false;
  if (rgb.a === 0) return false;

  const { r, g, b } = rgb;

  // Weiß und sehr helles Grau weg
  const avg = (r + g + b) / 3;
  if (avg >= 245) return false;

  // Blau Tendenz
  if (b > r + 20 && b > g + 20) return true;

  return false;
}

async function getClassBackgrounds(page) {
  return await page.evaluate(() => {
    const classes = ["r1", "r2", "r3"];
    const out = {};
    for (const c of classes) {
      const el = document.querySelector(`td.${c}`);
      if (!el) {
        out[c] = null;
        continue;
      }
      const bg = window.getComputedStyle(el).backgroundColor;
      out[c] = bg || null;
    }
    return out;
  });
}

async function scrapeApartment(page, apt) {
  await page.goto(apt.url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  const classBgs = await getClassBackgrounds(page);

  let occupiedClasses = [];
  const rgb1 = parseRgb(classBgs.r1);
  const rgb2 = parseRgb(classBgs.r2);
  const rgb3 = parseRgb(classBgs.r3);

  if (looksLikeBlue(rgb2)) occupiedClasses.push("r2");
  if (looksLikeBlue(rgb1)) occupiedClasses.push("r1");
  if (looksLikeBlue(rgb3)) occupiedClasses.push("r3");
  if (occupiedClasses.length === 0 && classBgs.r2) occupiedClasses = ["r2"];

  if (process.env.PRINT_CLASSES === "1") {
    console.log(`[${apt.id}] class backgrounds: r1=${classBgs.r1} r2=${classBgs.r2} r3=${classBgs.r3}`);
    console.log(`[${apt.id}] occupied classes: ${occupiedClasses.join(",")}`);
  }

  const occupied = new Set();

  function daysInMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  const tables = await page.locator("table").elementHandles();

  for (const table of tables) {
    const hasR = await table.evaluate((el) => !!el.querySelector("td.r1, td.r2, td.r3"));
    if (!hasR) continue;

    // Monat Jahr robust aus der nächsten Überschrift vor der Tabelle
    const monthYearText = await table.evaluate((el) => {
      const rx = /(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+\d{4}/i;

      function findInNode(n) {
        const t = (n && n.textContent) ? n.textContent.trim() : "";
        if (t && rx.test(t)) return t.match(rx)[0];
        return null;
      }

      // erst prev siblings durchsuchen
      let p = el.previousElementSibling;
      for (let i = 0; i < 30 && p; i++) {
        const hit = findInNode(p);
        if (hit) return hit;
        p = p.previousElementSibling;
      }

      // dann in parent rückwärts
      let parent = el.parentElement;
      for (let depth = 0; depth < 6 && parent; depth++) {
        let q = parent.previousElementSibling;
        for (let i = 0; i < 20 && q; i++) {
          const hit = findInNode(q);
          if (hit) return hit;
          q = q.previousElementSibling;
        }
        parent = parent.parentElement;
      }

      return "";
    });

    const parsed = parseMonthYear(monthYearText);
    if (!parsed) continue;

    const { year, month } = parsed;
    const dim = daysInMonth(year, month);

    const cells = await table.$$(`td.${occupiedClasses.join(",td.")}`);

    for (const cell of cells) {
      const txt = (await cell.evaluate((el) => (el.textContent || "").trim())).replace(/\s+/g, "");
      if (!/^\d{1,2}$/.test(txt)) continue;

      const day = Number(txt);
      if (!day || day < 1) continue;

      // harte Validierung gegen ungültige Tage im Monat
      if (day > dim) continue;

      occupied.add(toIso(year, month, day));
    }
  }

  return {
    id: apt.id,
    url: apt.url,
    title: apt.title || apt.id,
    occupied_days: Array.from(occupied).sort(),
    debug_colors: [],
    debug_classes: classBgs,
  };
}

async function scrapeAll(apartments, opts = {}) {
  const headless = opts.headless !== false;

  const browser = await chromium.launch({ headless });
  const page = await browser.newPage();

  const results = [];
  for (const apt of apartments) {
    try {
      const r = await scrapeApartment(page, apt);
      results.push(r);
      console.log(`${apt.id}: ${r.occupied_days.length} Tage gelesen`);
    } catch (e) {
      results.push({
        id: apt.id,
        url: apt.url,
        title: apt.title || apt.id,
        occupied_days: [],
        debug_colors: [],
        error: String(e && e.message ? e.message : e),
      });
      console.log(`${apt.id}: Fehler ${String(e && e.message ? e.message : e)}`);
    }
  }

  await browser.close();
  return results;
}

module.exports = { scrapeAll };