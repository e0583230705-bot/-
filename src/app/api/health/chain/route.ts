import net from "node:net";
import tls from "node:tls";

export const dynamic = "force-dynamic";

/**
 * אבחון זמני: מציג את שרשרת התעודות שמציג שרת מסד הנתונים (שמות, טביעות אצבע ו־PEM — אין כאן סודות).
 * משמש כדי לאסוף את תעודת השורש של Supabase לצורך DATABASE_SSL_CA. הקריאה רק *קוראת* את השרשרת;
 * לא נשלחת שום הודעת Postgres ולא סיסמה.
 */
export async function GET() {
  const url = process.env.DATABASE_URL;
  if (!url) return Response.json({ error: "no DATABASE_URL" }, { status: 404 });
  const { hostname, port } = new URL(url);
  const result = await new Promise<unknown>((resolve) => {
    // פרוטוקול Postgres: שולחים SSLRequest, השרת עונה 'S', ואז מתחיל TLS
    const sock = net.connect({ host: hostname, port: Number(port || 5432) }, () => {
      sock.write(Buffer.from([0, 0, 0, 8, 4, 210, 22, 47]));
    });
    sock.once("data", (b: Buffer) => {
      if (b[0] !== 0x53) return resolve({ error: "server refused SSL", byte: b[0] });
      const s = tls.connect({ socket: sock, servername: hostname, rejectUnauthorized: false }, () => {
        const out: { subject: unknown; issuer: unknown; fingerprint256: string; pem: string }[] = [];
        let c = s.getPeerCertificate(true);
        const seen = new Set<string>();
        while (c && c.fingerprint256 && !seen.has(c.fingerprint256)) {
          seen.add(c.fingerprint256);
          out.push({ subject: c.subject, issuer: c.issuer, fingerprint256: c.fingerprint256, pem: `-----BEGIN CERTIFICATE-----\n${c.raw.toString("base64").replace(/(.{64})/g, "$1\n")}\n-----END CERTIFICATE-----` });
          c = c.issuerCertificate;
        }
        s.end();
        resolve({ authorized: s.authorized, authorizationError: String(s.authorizationError ?? ""), chain: out });
      });
      s.on("error", (e) => resolve({ error: String(e) }));
    });
    sock.on("error", (e) => resolve({ error: String(e) }));
    setTimeout(() => resolve({ error: "timeout" }), 15000);
  });
  return Response.json(result);
}
