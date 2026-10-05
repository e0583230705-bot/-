import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

let cached: Promise<string> | undefined;

/** Heebo מוטמע ב־CSS כ־data URI, כדי שה־PDF לא יהיה תלוי בגופנים שמותקנים בשרת */
export function embeddedFontCss(): Promise<string> {
  cached ??= (async () => {
    const dir = path.join(process.cwd(), "assets", "fonts");
    const faces = await Promise.all(
      (
        [
          ["hebrew", 400, "U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F"],
          ["hebrew", 700, "U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F"],
          ["latin", 400, "U+0000-00FF, U+2000-206F, U+20AC, U+2212"],
          ["latin", 700, "U+0000-00FF, U+2000-206F, U+20AC, U+2212"],
        ] as const
      ).map(async ([subset, weight, range]) => {
        const data = await readFile(path.join(dir, `heebo-${subset}-${weight}-normal.woff2`));
        return `@font-face{font-family:Heebo;font-weight:${weight};font-style:normal;src:url(data:font/woff2;base64,${data.toString("base64")}) format("woff2");unicode-range:${range};}`;
      }),
    );
    return faces.join("\n");
  })();
  return cached;
}
