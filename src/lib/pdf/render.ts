import "server-only";
import { chromium, type Browser } from "playwright-core";

/**
 * המרת HTML ל־PDF עם Chromium — הדרך האמינה לעברית, RTL ומספרים מעורבים.
 * בשרת ייצור יש להתקין Chromium ולהגדיר CHROMIUM_PATH (או להשתמש בהתקנת Playwright).
 */
const globalForPdf = globalThis as unknown as { browser?: Promise<Browser> };

function getBrowser(): Promise<Browser> {
  globalForPdf.browser ??= chromium
    .launch({ executablePath: process.env.CHROMIUM_PATH || undefined })
    .then((browser) => {
      browser.on("disconnected", () => {
        globalForPdf.browser = undefined;
      });
      return browser;
    })
    .catch((err) => {
      globalForPdf.browser = undefined;
      throw err;
    });
  return globalForPdf.browser;
}

export async function htmlToPdf(html: string): Promise<Uint8Array> {
  const browser = await getBrowser();
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    // חסימת כל בקשת רשת: התבנית עצמאית לגמרי, וכך תוכן משתמש לא יכול למשוך משאבים חיצוניים
    await page.route("**/*", (route) => route.abort());
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await context.close();
  }
}
