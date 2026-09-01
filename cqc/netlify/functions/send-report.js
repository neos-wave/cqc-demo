// netlify/functions/send-report.js
//
// Emails the readiness-review report to an address the user provides.
// Sends via the Resend API (https://resend.com).
//
// SETUP:
// In Netlify dashboard → Site settings → Environment variables:
// RESEND_API_KEY    = re_... (from resend.com → API Keys)
// REPORT_FROM_EMAIL = CQC Readiness Review <reports@yourdomain.com>
//                     (the domain must be verified in Resend → Domains)
//
// The report HTML is rendered here from structured data — never from
// client-supplied markup — and every string is escaped, so a session
// holder cannot send arbitrary content through the domain.

const crypto = require("crypto");

// Must mirror the token scheme in validate-pin.js (same env vars).
function verifyToken(token) {
  if (!token || typeof token !== "string") return false;
  const secret = process.env.CQC_SESSION_SECRET || "neos-wave-demo-secret-change-me";
  const parts = token.split(":");
  if (parts.length !== 2) return false;

  const [expiry, signature] = parts;
  if (Date.now() > parseInt(expiry)) return false;

  const pin = process.env.CQC_ACCESS_PIN || "291025";
  const payload = `${pin}:${expiry}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const RATINGS = {
  outstanding: { label: "Outstanding", color: "#1B5E20", bg: "#E8F5E9" },
  good: { label: "Good", color: "#2E7D32", bg: "#F1F8E9" },
  requiresImprovement: { label: "Requires Improvement", color: "#E65100", bg: "#FFF3E0" },
  inadequate: { label: "Inadequate", color: "#B71C1C", bg: "#FFEBEE" },
};

function list(items, bg) {
  if (!Array.isArray(items) || !items.length) return "";
  return items.slice(0, 8).map(i =>
    `<div style="background:${bg};border-radius:6px;padding:8px 12px;margin:0 0 6px;font-size:13px;line-height:1.5">${esc(i)}</div>`
  ).join("");
}

function renderEmail(r) {
  const home = r.careHome || {};
  const domains = Array.isArray(r.domains) ? r.domains.slice(0, 5) : [];

  const domainBlocks = domains.map(d => {
    const ri = RATINGS[d.rating] || { label: "Pending", color: "#999", bg: "#F5F5F5" };
    return `
    <div style="border:1px solid #E5E7EB;border-radius:10px;padding:18px;margin:0 0 16px">
      <div style="margin:0 0 10px">
        <span style="font-size:16px;font-weight:700;color:#111">${esc(d.label)}</span>
        <span style="float:right;background:${ri.bg};color:${ri.color};border-radius:14px;padding:3px 12px;font-size:12px;font-weight:700">${ri.label}</span>
      </div>
      <p style="font-size:13px;line-height:1.6;color:#333;margin:0 0 10px">${esc(d.findings)}</p>
      ${d.strengths && d.strengths.length ? `<div style="font-size:12px;font-weight:700;color:#2E7D32;margin:0 0 4px">Strengths</div>${list(d.strengths, "#F1F8E9")}` : ""}
      ${d.gaps && d.gaps.length ? `<div style="font-size:12px;font-weight:700;color:#E65100;margin:8px 0 4px">Gaps &amp; Concerns</div>${list(d.gaps, "#FFF3E0")}` : ""}
      ${d.actions && d.actions.length ? `<div style="font-size:12px;font-weight:700;color:#3730A3;margin:8px 0 4px">Required Actions</div>${list(d.actions, "#E8EAF6")}` : ""}
    </div>`;
  }).join("");

  const priorities = Array.isArray(r.priorityActions) ? r.priorityActions.slice(0, 5) : [];
  const priorityBlock = priorities.length ? `
    <div style="background:#FFF8E1;border:1px solid #FFE082;border-radius:10px;padding:18px;margin:0 0 16px">
      <div style="font-size:16px;font-weight:700;color:#F57F17;margin:0 0 10px">Priority Actions</div>
      ${priorities.map((a, i) => `<p style="font-size:13px;line-height:1.6;margin:0 0 8px"><strong>${i + 1}.</strong> ${esc(a)}</p>`).join("")}
    </div>` : "";

  return `
<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#FAFAFA;font-family:Arial,Helvetica,sans-serif;color:#111">
<div style="max-width:640px;margin:0 auto;padding:24px 16px">
  <div style="background:#6911ed;border-radius:14px;padding:28px;color:#fff;margin:0 0 20px">
    <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;opacity:.75;margin:0 0 6px">CQC Readiness Review Report</div>
    <div style="font-size:26px;font-weight:700;margin:0 0 4px">${esc(home.name)}</div>
    <div style="font-size:13px;opacity:.85">${esc(home.type)}${home.size ? " · " + esc(home.size) + " beds" : ""}${home.loc ? " · " + esc(home.loc) : ""} · ${esc(r.generatedDate)}</div>
    ${r.stats ? `<div style="font-size:13px;opacity:.85;margin-top:10px">Statements covered: ${esc(r.stats.covered)}/${esc(r.stats.total)} · Gaps found: ${esc(r.stats.gaps)}</div>` : ""}
  </div>
  ${r.overallSummary ? `<div style="background:#fff;border:1px solid #E5E7EB;border-radius:10px;padding:18px;margin:0 0 16px"><div style="font-size:16px;font-weight:700;color:#6911ed;margin:0 0 8px">Executive Summary</div><p style="font-size:13px;line-height:1.7;margin:0">${esc(r.overallSummary)}</p></div>` : ""}
  ${r.inspectionReadiness ? `<div style="background:#E3F2FD;border:1px solid #90CAF9;border-radius:10px;padding:18px;margin:0 0 16px"><div style="font-size:16px;font-weight:700;color:#1565C0;margin:0 0 8px">Inspection Readiness</div><p style="font-size:13px;line-height:1.7;margin:0">${esc(r.inspectionReadiness)}</p></div>` : ""}
  ${priorityBlock}
  ${domainBlocks}
  ${r.coverageNotes ? `<div style="background:#FFF8E1;border:1px solid #FFE082;border-radius:10px;padding:18px;margin:0 0 16px"><div style="font-size:14px;font-weight:700;color:#F57F17;margin:0 0 8px">Coverage Notes</div><p style="font-size:13px;line-height:1.6;margin:0">${esc(r.coverageNotes)}</p></div>` : ""}
  <p style="font-size:11px;color:#999;text-align:center;line-height:1.6;margin:24px 0 0">AI-powered readiness review simulation — not a substitute for professional CQC guidance.<br>Powered by Neos Wave · neoswave.com</p>
</div>
</body></html>`;
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Email sending is not configured" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");

    if (!verifyToken(body.token)) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: "Invalid or expired session — please re-enter your access code" }),
      };
    }

    const email = String(body.email || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "A valid email address is required" }) };
    }

    if (!body.report || typeof body.report !== "object") {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "report data required" }) };
    }

    const homeName = String(body.report.careHome?.name || "your care home").slice(0, 120);
    const from = process.env.REPORT_FROM_EMAIL || "CQC Readiness Review <onboarding@resend.dev>";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: `CQC Readiness Review Report — ${homeName}`,
        html: renderEmail(body.report),
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Resend error:", res.status, JSON.stringify(data));
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: data.message || "Email could not be sent" }),
      };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ sent: true, id: data.id }) };
  } catch (err) {
    console.error("send-report error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Internal server error" }) };
  }
};
