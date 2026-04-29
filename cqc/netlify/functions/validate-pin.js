// netlify/functions/validate-pin.js
//
// Server-side PIN validation for the CQC Assessment demo.
//
// SETUP:
// 1. In your Netlify dashboard → Site settings → Environment variables
// 2. Add: CQC_ACCESS_PIN = your-6-digit-pin (e.g. 291025)
// 3. Deploy — the function will be available at /.netlify/functions/validate-pin
//
// The PIN never appears in your frontend code. The function returns
// a simple session token (signed with a server-side secret) that
// the frontend stores in sessionStorage.

const crypto = require("crypto");

// Generate a simple HMAC token so we can verify sessions without a database
function generateToken(pin) {
  const secret = process.env.CQC_SESSION_SECRET || "neos-wave-demo-secret-change-me";
  const expiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  const payload = `${pin}:${expiry}`;
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${expiry}:${signature}`;
}

function verifyToken(token) {
  if (!token) return false;
  const secret = process.env.CQC_SESSION_SECRET || "neos-wave-demo-secret-change-me";
  const parts = token.split(":");
  if (parts.length !== 2) return false;

  const [expiry, signature] = parts;
  if (Date.now() > parseInt(expiry)) return false; // Expired

  const pin = process.env.CQC_ACCESS_PIN || "291025";
  const payload = `${pin}:${expiry}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

exports.handler = async (event) => {
  // CORS headers
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

  try {
    const body = JSON.parse(event.body || "{}");

    // Token validation (for existing sessions)
    if (body.token) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ valid: verifyToken(body.token) }),
      };
    }

    // PIN validation (for new logins)
    if (body.pin) {
      const correctPin = process.env.CQC_ACCESS_PIN || "291025";

      // Basic rate limiting via a short delay to slow brute force
      await new Promise((r) => setTimeout(r, 500));

      if (body.pin === correctPin) {
        const token = generateToken(body.pin);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ valid: true, token }),
        };
      } else {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ valid: false }),
        };
      }
    }

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Missing pin or token" }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Internal error" }),
    };
  }
};
