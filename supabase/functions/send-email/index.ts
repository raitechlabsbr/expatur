// Edge Function: send-email — envia o email de confirmação (COMMS) via Resend.
// Recebe HTML + anexos PDF (base64) + imagens inline (cid). verify_jwt ativo:
// só agentes autenticados chamam. Secret: RESEND_API_KEY. From: FROM_EMAIL.
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "administration@expaturtravel.com";
  if (!RESEND_API_KEY) return json({ ok: false, error: "RESEND_API_KEY ausente" });

  let p: any;
  try { p = await req.json(); } catch { return json({ ok: false, error: "JSON inválido" }); }
  if (!p || !p.to || !p.subject || !p.html) {
    return json({ ok: false, error: "campos obrigatórios: to, subject, html" });
  }

  // Resend: anexos base64 diretos; imagens inline viram anexos com content_id (cid:).
  const attachments = [
    ...(Array.isArray(p.attachments) ? p.attachments : []).map((a: any) => ({
      filename: a.filename,
      content: a.contentBase64,
      content_type: a.mimeType,
    })),
    ...(Array.isArray(p.inlineImages) ? p.inlineImages : []).map((im: any) => ({
      filename: im.cid,
      content: im.contentBase64,
      content_id: im.cid,
      content_type: im.mimeType,
    })),
  ];

  const payload: Record<string, unknown> = {
    from: FROM_EMAIL,
    to: [p.to],
    subject: p.subject,
    html: p.html,
  };
  if (p.bcc) payload.bcc = [p.bcc];
  if (attachments.length) payload.attachments = attachments;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json({ ok: false, error: data?.message || `HTTP ${r.status}` });
    return json({ ok: true, id: data?.id });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) });
  }
});
