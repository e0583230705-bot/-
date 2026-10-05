import "server-only";
import { z } from "zod";
import { getContext } from "@/lib/auth/dal";
import { claimOriginal, getDocument } from "@/lib/services/documents";
import { renderDocumentHtml, type CopyMark } from "./document-html";
import { embeddedFontCss } from "./fonts";

/** טוען מסמך של העסק הפעיל (או null), עם בדיקת הרשאת קריאה */
export async function loadDocumentForPrint(id: string) {
  const ctx = await getContext();
  if (!ctx.can("read") || !z.uuid().safeParse(id).success) return null;
  const found = await getDocument(ctx.org.id, id);
  return found ? { ctx, ...found } : null;
}

export async function documentHtml(
  loaded: NonNullable<Awaited<ReturnType<typeof loadDocumentForPrint>>>,
  mark: CopyMark,
) {
  return renderDocumentHtml({
    org: loaded.ctx.org,
    doc: loaded.doc,
    lines: loaded.lines,
    mark,
    fontCss: await embeddedFontCss(),
  });
}

/** קובע אם ההפקה הנוכחית היא המקור. רק מי שרשאי לעבוד על הספרים יכול להפיק מקור. */
export async function markForDownload(loaded: NonNullable<Awaited<ReturnType<typeof loadDocumentForPrint>>>) {
  if (loaded.doc.originalDeliveredAt || !loaded.ctx.can("write_books")) return "copy" as const;
  const isOriginal = await claimOriginal(loaded.ctx.org.id, loaded.doc.id, loaded.ctx.user.id);
  return isOriginal ? ("original" as const) : ("copy" as const);
}
