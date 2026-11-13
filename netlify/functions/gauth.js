/* Keeps you signed in to Google on this device.
   The browser only ever gets short-lived access tokens. The long-lived refresh
   tokens stay in an encrypted, HttpOnly cookie that page scripts can't read.
   Needs one environment variable in Netlify: GOOGLE_CLIENT_SECRET
   (optional: GOOGLE_CLIENT_ID, otherwise the one in config.js is used). */
const crypto = require("crypto");

const COOKIE = "oi_rt";
const PATH = "/.netlify/functions/gauth";
const MAX_AGE = 400 * 24 * 3600;
const TOKEN_URL = "https://oauth2.googleapis.com/token";

function key() {
  return crypto.createHash("sha256").update("owninbox-v1:" + process.env.GOOGLE_CLIENT_SECRET).digest();
}
function seal(obj) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString("base64url");
}
function open(s) {
  try {
    const b = Buffer.from(s, "base64url");
    const d = crypto.createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    const v = JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8"));
    return v && typeof v === "object" ? v : {};
  } catch (e) { return {}; }
}
function readJar(headers) {
  const raw = headers.cookie || headers.Cookie || "";
  const part = raw.split(/;\s*/).find((x) => x.startsWith(COOKIE + "="));
  return part ? open(part.slice(COOKIE.length + 1)) : {};
}
function jarCookie(jar) {
  const v = Object.keys(jar).length ? seal(jar) : "";
  return `${COOKIE}=${v}; Path=${PATH}; HttpOnly; Secure; SameSite=Strict; Max-Age=${v ? MAX_AGE : 0}`;
}
function reply(status, body, jar) {
  const r = { statusCode: status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) };
  if (jar) r.multiValueHeaders = { "Set-Cookie": [jarCookie(jar)] };
  return r;
}
async function google(params) {
  const r = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params).toString() });
  let j = {};
  try { j = await r.json(); } catch (e) {}
  return { ok: r.ok, j };
}
async function emailOf(token) {
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers: { Authorization: "Bearer " + token } });
  if (!r.ok) return "";
  const j = await r.json().catch(() => ({}));
  return String(j.emailAddress || "").toLowerCase();
}

exports.handler = async (event) => {
  if (!process.env.GOOGLE_CLIENT_SECRET) return reply(501, { error: "not_configured" });
  if (event.httpMethod !== "POST") return reply(405, { error: "method" });
  /* only this site's own pages may call this */
  const h = event.headers || {};
  const host = h["x-forwarded-host"] || h.host || "";
  const origin = h.origin || "";
  if (!origin || origin !== "https://" + host || h["x-owninbox"] !== "1") return reply(403, { error: "forbidden" });

  let body = {};
  try { body = JSON.parse(event.body || "{}"); } catch (e) {}
  const op = (event.queryStringParameters || {}).op;
  const clientId = process.env.GOOGLE_CLIENT_ID || String(body.client_id || "");
  if (!clientId) return reply(400, { error: "no_client_id" });
  const jar = readJar(h);

  if (op === "list") return reply(200, { ok: true, emails: Object.keys(jar) });

  if (op === "exchange") {
    const { ok, j } = await google({ code: String(body.code || ""), client_id: clientId, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: "postmessage", grant_type: "authorization_code" });
    if (!ok || !j.access_token) return reply(400, { error: j.error || "exchange_failed" });
    const email = await emailOf(j.access_token);
    if (!email) return reply(400, { error: "no_email" });
    if (j.refresh_token) jar[email] = j.refresh_token;
    else if (!jar[email]) return reply(200, { email, access_token: j.access_token, expires_in: j.expires_in, need_consent: true });
    return reply(200, { email, access_token: j.access_token, expires_in: j.expires_in }, jar);
  }

  if (op === "refresh") {
    const email = String(body.email || "").toLowerCase();
    const rt = jar[email];
    if (!rt) return reply(401, { error: "needs_signin" });
    const { ok, j } = await google({ refresh_token: rt, client_id: clientId, client_secret: process.env.GOOGLE_CLIENT_SECRET, grant_type: "refresh_token" });
    if (!ok || !j.access_token) {
      if (j.error === "invalid_grant") { delete jar[email]; return reply(401, { error: "needs_signin" }, jar); }
      return reply(502, { error: j.error || "refresh_failed" });
    }
    return reply(200, { email, access_token: j.access_token, expires_in: j.expires_in });
  }

  if (op === "signout") {
    const email = String(body.email || "").toLowerCase();
    const list = email ? [email] : Object.keys(jar);
    /* forget it here only: revoking would also sign out your other devices */
    for (const e of list) delete jar[e];
    return reply(200, { ok: true }, jar);
  }

  return reply(400, { error: "unknown_op" });
};
