const { chromium } = require("playwright");

async function extractOccupiedFromCalendars(page, aptId) {
  await page.waitForTimeout(1000);

  const result = await page.evaluate(() => {
    function unique(arr) {
      return Array.from(new Set(arr));
    }

    function getWeekDates(rowEl) {
      const bgDays = Array.from(
        rowEl.querySelectorAll(".fc-bg td.fc-day[data-date]")
      );

      const dates = bgDays
        .map((el) => el.getAttribute("data-date"))
        .filter((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d));

      return unique(dates).slice(0, 7);
    }

    const occupied = new Set();
    const rows = Array.from(document.querySelectorAll(".fc-row.fc-week"));

    for (const row of rows) {
      const weekDates = getWeekDates(row);
      if (weekDates.length !== 7) continue;

      const bgRows = Array.from(
        row.querySelectorAll(".fc-bgevent-skeleton tbody tr")
      );

      for (const tr of bgRows) {
        const cells = Array.from(tr.querySelectorAll("td"));
        if (cells.length === 0) continue;

        let cursor = 0;

        for (const td of cells) {
          const colspan = Number(td.getAttribute("colspan") || "1");
          const isBlocked = td.classList.contains("fc-bgevent");

          if (isBlocked) {
            for (let i = 0; i < colspan; i++) {
              const date = weekDates[cursor + i];
              if (date) occupied.add(date);
            }
          }

          cursor += colspan;
        }
      }
    }

    return Array.from(occupied).sort();
  });

  if (aptId === "app02") {
    const march = result.filter((d) => d.startsWith("2026-03"));
    console.log(`[${aptId}] occupied_days March: ${march.join(",")}`);
  }

  return result;
}

async function scrapeApartment(browser, apt) {
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);

  try {
    await page.goto(apt.url, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(5000);

    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(2000);

    const occupied_days = await extractOccupiedFromCalendars(page, apt.id);

    return {
      id: apt.id,
      title: apt.title || apt.name || apt.id,
      url: apt.url,
      occupied_days,
    };
  } finally {
    await page.close();
  }
}

async function scrapeAll(apartments) {
  const browser = await chromium.launch({ headless: true });

  try {
    const results = [];

    for (const apt of apartments) {
      try {
        const r = await scrapeApartment(browser, apt);
        results.push(r);
      } catch (e) {
        results.push({
          id: apt.id,
          title: apt.title || apt.name || apt.id,
          url: apt.url,
          occupied_days: [],
          error: String(e && e.message ? e.message : e),
        });
      }
    }

    return results;
  } finally {
    await browser.close();
  }
}

module.exports = { scrapeAll };