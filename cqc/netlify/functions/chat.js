// netlify/functions/chat.js
//
// Proxies AI conversation requests to the Anthropic API.
// The API key is stored as a Netlify environment variable (ANTHROPIC_API_KEY).
//
// SETUP:
// In Netlify dashboard → Site settings → Environment variables:
// ANTHROPIC_API_KEY = sk-ant-... (your Anthropic API key)

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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }),
    };
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

    // Validate required fields
    if (!body.messages || !Array.isArray(body.messages)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "messages array required" }),
      };
    }

    // Build the Anthropic API request
    const apiBody = {
      model: body.model || "claude-sonnet-4-6",
      max_tokens: body.max_tokens || 1200,
      messages: body.messages,
    };

    // Include system prompt if provided
    if (body.system) {
      apiBody.system = body.system;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(apiBody),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ error: data.error?.message || "API request failed" }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data),
    };
  } catch (err) {
    console.error("Chat function error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
