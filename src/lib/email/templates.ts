import { escapeHtml } from "@/lib/pdf/document-html";

function layout(title: string, body: string) {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#f6f7f9;font-family:Arial,sans-serif;color:#16202c">
<div style="max-width:560px;margin:24px auto;background:#fff;border:1px solid #e3e6eb;border-radius:12px;padding:24px;text-align:right">
${body}
</div></body></html>`;
}

const paragraphs = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((p) => `<p style="line-height:1.6;margin:0 0 12px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");

export function documentEmail(params: {
  businessName: string;
  documentTitle: string;
  customerName: string;
  total: string;
  message?: string;
}) {
  const message =
    params.message?.trim() ||
    `שלום ${params.customerName},\n\nמצורף ${params.documentTitle} על סך ${params.total}.\n\nתודה,\n${params.businessName}`;
  const subject = `${params.documentTitle} מאת ${params.businessName}`;
  return {
    subject,
    text: message,
    html: layout(subject, `${paragraphs(message)}<p style="color:#5d6b7c;font-size:12px;margin-top:24px">המסמך מצורף כקובץ PDF.</p>`),
  };
}

export function passwordResetEmail(params: { name: string; link: string }) {
  const subject = "איפוס סיסמה";
  const text = `שלום ${params.name},\n\nלאיפוס הסיסמה היכנסו לקישור הבא (בתוקף לשעה):\n${params.link}\n\nאם לא ביקשתם לאפס סיסמה, אפשר להתעלם מהמייל.`;
  const html = layout(
    subject,
    `<p style="line-height:1.6">שלום ${escapeHtml(params.name)},</p>
<p style="line-height:1.6">לאיפוס הסיסמה לחצו על הכפתור. הקישור בתוקף לשעה אחת.</p>
<p style="margin:24px 0"><a href="${escapeHtml(params.link)}" style="background:#0f6e5a;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold">איפוס סיסמה</a></p>
<p style="color:#5d6b7c;font-size:12px">אם לא ביקשתם לאפס סיסמה, אפשר להתעלם מהמייל.</p>`,
  );
  return { subject, text, html };
}
