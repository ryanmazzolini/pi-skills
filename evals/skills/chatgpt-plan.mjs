#!/usr/bin/env node
// Signs the skill evals in with ChatGPT so they use the signed-in ChatGPT plan
// instead of an OpenAI API key. Implements OpenAI's public "Sign in with
// ChatGPT" plan-usage protocol for local open-source tools:
// https://developers.openai.com/siwc/token-sharing-open-source
//
//   node chatgpt-plan.mjs login    browser sign-in; needed again only after 30 idle days
//   node chatgpt-plan.mjs token    print a valid access token, refreshing it when needed
//   node chatgpt-plan.mjs models   list the models the signed-in plan can use
//
// Access tokens last one hour. The eval client asks for a token before each
// request, so a long run keeps refreshing. Credentials live in
// ~/.config/pi-skill-evals/chatgpt-plan.json (owner-only), or under
// $SKILL_EVAL_CHATGPT_DIR.

import { spawn } from "node:child_process";
import { createHash, createPublicKey, randomBytes, randomUUID, verify } from "node:crypto";
import { mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync, closeSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ISSUER = "https://auth.openai.com";
const AUTHORIZE_URL = `${ISSUER}/api/accounts/authorize`;
const TOKEN_URL = `${ISSUER}/api/accounts/oauth/token`;
const RESOURCE = "https://api.openai.com/v1";
const PLAN_SCOPE = "chatgpt.tokens.use.direct";
const SCOPES = `openid profile email offline_access resource.invoke ${PLAN_SCOPE}`;
const AGENT_NAME = "pi-skill-evals";
const CALLBACK_PATH = "/auth/callback";
const PREFERRED_PORT = 1455;
const REFRESH_MARGIN_MS = 5 * 60_000;
const LOGIN_TIMEOUT_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 15_000;
const LOGIN_COMMAND = "npm run eval:skills:chatgpt:login";
const RECORD_FILE = "chatgpt-plan.json";
// Refresh failures that mean the saved refresh token can never work again.
const TERMINAL_REFRESH_ERRORS = new Set([
  "invalid_grant",
  "invalid_refresh_token",
  "token_expired",
  "refresh_token_expired",
  "refresh_token_invalidated",
  "refresh_token_reused",
]);

export class PlanAuthError extends Error {
  constructor(message, code = null) {
    super(message);
    this.name = "PlanAuthError";
    this.code = code;
  }
}

export function credentialsDir(env = process.env) {
  return env.SKILL_EVAL_CHATGPT_DIR || join(homedir(), ".config", "pi-skill-evals");
}

export function readRecord(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, RECORD_FILE), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

// Write atomically with owner-only permissions so a crash never leaves a
// half-written credential file and other users cannot read it.
export function writeRecord(dir, record) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, RECORD_FILE);
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

const base64url = (buffer) => Buffer.from(buffer).toString("base64url");

export function pkcePair() {
  const verifier = base64url(randomBytes(32));
  return { verifier, challenge: base64url(createHash("sha256").update(verifier).digest()) };
}

// A first sign-in registers this tool with `dynamic_agent_client`. Later sign-ins
// reuse the issued client ID and identify the saved account.
export function authorizeUrl({ record, hostId, redirectUri, state, nonce, challenge }) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: record?.client_id ?? "dynamic_agent_client",
    ext_agent_host_id: hostId,
    redirect_uri: redirectUri,
    scope: SCOPES,
    resource: RESOURCE,
    state,
    nonce,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  if (record?.client_id) {
    if (record.id_token) params.set("id_token_hint", record.id_token);
    if (record.email) params.set("login_hint", record.email);
  } else {
    params.set("agent_name_hint", AGENT_NAME);
  }
  return `${AUTHORIZE_URL}?${params}`;
}

// The account hints identify the user, and the ID token hint is a credential.
// Printed fallback links omit them; the account selector then asks instead.
export function printableAuthorizeUrl(url) {
  const printable = new URL(url);
  printable.searchParams.delete("id_token_hint");
  printable.searchParams.delete("login_hint");
  return printable.toString();
}

export function callbackResult(url, { state, clientId }) {
  const params = new URL(url, "http://127.0.0.1").searchParams;
  if (params.get("state") !== state) throw new PlanAuthError("Sign-in returned an unexpected state. Start the sign-in again.");
  const error = params.get("error");
  if (error === "access_denied") {
    throw new PlanAuthError("ChatGPT sign-in was declined. Run the sign-in again and allow use of your ChatGPT plan.", error);
  }
  if (error) throw new PlanAuthError(`ChatGPT sign-in failed: ${error}`, error);
  const code = params.get("code");
  if (!code) throw new PlanAuthError("Sign-in returned no authorization code. Start the sign-in again.");
  const returnedClientId = params.get("client_id");
  if (clientId) {
    if (returnedClientId && returnedClientId !== clientId) {
      throw new PlanAuthError("Sign-in returned a different app registration than the saved one.");
    }
    return { code, clientId };
  }
  if (!returnedClientId) throw new PlanAuthError("Sign-in did not finish registering this tool. Start the sign-in again.");
  return { code, clientId: returnedClientId };
}

async function tokenRequest(fetchImpl, form) {
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ ...form, resource: RESOURCE }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const code = typeof body?.error === "string" ? body.error : body?.error?.code ?? null;
    const detail = body?.error_description ?? body?.error?.message ?? body?.detail ?? `HTTP ${response.status}`;
    throw new PlanAuthError(`ChatGPT token request failed (${code ?? response.status}): ${detail}`, code);
  }
  if (!body?.access_token) throw new PlanAuthError("ChatGPT token response had no access token. Try again, or sign in again.");
  return body;
}

async function getJson(fetchImpl, url) {
  const response = await fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new PlanAuthError(`Request to ${url} failed with HTTP ${response.status}.`);
  return response.json();
}

export async function verifyIdToken(idToken, { fetchImpl, clientId, nonce, now }) {
  const [encodedHeader, encodedClaims, encodedSignature] = String(idToken).split(".");
  if (!encodedSignature) throw new PlanAuthError("Sign-in returned a malformed ID token.");
  const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
  if (header.alg !== "RS256") throw new PlanAuthError(`Sign-in returned an ID token signed with unsupported ${header.alg}.`);
  const { jwks_uri: jwksUri } = await getJson(fetchImpl, `${ISSUER}/.well-known/openid-configuration`);
  const { keys = [] } = await getJson(fetchImpl, jwksUri);
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) throw new PlanAuthError("Sign-in returned an ID token signed by an unknown key.");
  const signed = verify(
    "sha256",
    Buffer.from(`${encodedHeader}.${encodedClaims}`),
    createPublicKey({ key: jwk, format: "jwk" }),
    Buffer.from(encodedSignature, "base64url"),
  );
  if (!signed) throw new PlanAuthError("Sign-in returned an ID token with an invalid signature.");
  const claims = JSON.parse(Buffer.from(encodedClaims, "base64url").toString("utf8"));
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== ISSUER || !audiences.includes(clientId)) throw new PlanAuthError("Sign-in returned an ID token for another issuer or app.");
  if (!(claims.exp * 1000 > now)) throw new PlanAuthError("Sign-in returned an expired ID token.");
  if (claims.nonce !== nonce) throw new PlanAuthError("Sign-in returned an ID token for another sign-in attempt.");
  return claims;
}

function recordFromTokens(previous, tokens, { clientId, hostId, claims, now }) {
  return {
    ext_agent_host_id: hostId,
    client_id: clientId,
    subject: claims?.sub ?? previous?.subject,
    email: claims?.email ?? previous?.email,
    id_token: tokens.id_token ?? previous?.id_token,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? previous?.refresh_token,
    scopes: tokens.scope ? tokens.scope.split(" ") : previous?.scopes ?? [],
    expires_at: now + Number(tokens.expires_in ?? 3600) * 1000,
    saved_at: new Date(now).toISOString(),
  };
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address().port);
    });
  });
}

function openInBrowser(url) {
  const [command, args] = process.platform === "darwin"
    ? ["open", [url]]
    : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  spawn(command, args, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}

export async function login({
  fetchImpl = fetch,
  dir = credentialsDir(),
  openBrowser = openInBrowser,
  log = (line) => process.stderr.write(`${line}\n`),
  now = Date.now,
} = {}) {
  const record = readRecord(dir);
  const hostId = record?.ext_agent_host_id ?? `urn:uuid:${randomUUID()}`;
  const state = base64url(randomBytes(24));
  const nonce = base64url(randomBytes(24));
  const { verifier, challenge } = pkcePair();
  const pending = { state, clientId: record?.client_id ?? null };

  let settle;
  const callback = new Promise((resolve, reject) => { settle = { resolve, reject }; });
  const server = createServer((request, response) => {
    if (!request.url?.startsWith(CALLBACK_PATH)) {
      response.writeHead(404).end();
      return;
    }
    try {
      const result = callbackResult(request.url, pending);
      response.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end("Signed in. You can close this tab.");
      settle.resolve(result);
    } catch (error) {
      response.writeHead(400, { "content-type": "text/plain; charset=utf-8" }).end(error.message);
      settle.reject(error);
    }
  });
  // Codex also uses 1455; any loopback port works once the preferred one is busy.
  const port = await listen(server, PREFERRED_PORT).catch((error) => {
    if (error.code !== "EADDRINUSE") throw error;
    return listen(server, 0);
  });
  const timer = setTimeout(() => settle.reject(new PlanAuthError("Timed out waiting for ChatGPT sign-in.")), LOGIN_TIMEOUT_MS);
  try {
    const redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`;
    const url = authorizeUrl({ record, hostId, redirectUri, state, nonce, challenge });
    log("Opening ChatGPT sign-in in your browser. If it does not open, visit:");
    log(printableAuthorizeUrl(url));
    openBrowser(url);
    const { code, clientId } = await callback;
    const tokens = await tokenRequest(fetchImpl, {
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
    });
    const claims = await verifyIdToken(tokens.id_token, { fetchImpl, clientId, nonce, now: now() });
    if (record?.subject && claims.sub !== record.subject) {
      throw new PlanAuthError(`Signed in as a different ChatGPT account. To switch accounts, delete ${join(dir, RECORD_FILE)} and sign in again.`);
    }
    const scopes = String(tokens.scope ?? "").split(" ");
    if (!scopes.includes(PLAN_SCOPE)) {
      throw new PlanAuthError("Signed in, but ChatGPT plan usage was not allowed. Sign in again and allow this tool to use your plan.");
    }
    const saved = recordFromTokens(record, tokens, { clientId, hostId, claims, now: now() });
    writeRecord(dir, saved);
    log(`Signed in as ${saved.email ?? saved.subject}. Evals can now use your ChatGPT plan.`);
    return saved;
  } finally {
    clearTimeout(timer);
    server.close();
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Parallel eval scenarios all ask for tokens. Only one process may spend the
// rotating refresh token; the others wait and then read its replacement. A
// refresh is bounded by REQUEST_TIMEOUT_MS, so a lock older than `staleMs` was
// left by a killed process and the next waiter takes it over.
async function withRefreshLock(dir, action, { timeoutMs = 30_000, staleMs = 20_000 } = {}) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = join(dir, `${RECORD_FILE}.lock`);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      closeSync(openSync(path, "wx", 0o600));
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      try {
        if (Date.now() - statSync(path).mtimeMs > staleMs) unlinkSync(path);
      } catch {}
      if (Date.now() > deadline) throw new PlanAuthError("Timed out waiting for another eval process to refresh the ChatGPT token.");
      await sleep(50);
    }
  }
  try {
    return await action();
  } finally {
    try { unlinkSync(path); } catch {}
  }
}

const isFresh = (record, now) => Boolean(record?.access_token) && record.expires_at - now > REFRESH_MARGIN_MS;

export async function accessToken({ fetchImpl = fetch, dir = credentialsDir(), now = Date.now } = {}) {
  const record = readRecord(dir);
  if (isFresh(record, now())) return record.access_token;
  if (!record?.refresh_token) throw new PlanAuthError(`Not signed in to ChatGPT. Run: ${LOGIN_COMMAND}`);
  return withRefreshLock(dir, async () => {
    const current = readRecord(dir);
    if (isFresh(current, now())) return current.access_token;
    if (!current?.refresh_token) throw new PlanAuthError(`Not signed in to ChatGPT. Run: ${LOGIN_COMMAND}`);
    let tokens;
    try {
      tokens = await tokenRequest(fetchImpl, {
        grant_type: "refresh_token",
        client_id: current.client_id,
        refresh_token: current.refresh_token,
      });
    } catch (error) {
      if (!TERMINAL_REFRESH_ERRORS.has(error.code)) throw error;
      const { access_token, refresh_token, ...signedOut } = current;
      writeRecord(dir, signedOut);
      throw new PlanAuthError(`The ChatGPT sign-in has expired or was revoked. Run: ${LOGIN_COMMAND}`, error.code);
    }
    const saved = recordFromTokens(current, tokens, {
      clientId: current.client_id,
      hostId: current.ext_agent_host_id,
      claims: null,
      now: now(),
    });
    writeRecord(dir, saved);
    return saved.access_token;
  });
}

export async function listModels({ fetchImpl = fetch, token }) {
  const response = await fetchImpl(`${RESOURCE}/models`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new PlanAuthError(`Listing ChatGPT plan models failed with HTTP ${response.status}: ${JSON.stringify(body)}`);
  return (body.models ?? body.data ?? []).filter((model) => (model.visibility ?? "list") === "list");
}

async function main(command) {
  if (command === "login") {
    await login();
  } else if (command === "token") {
    process.stdout.write(`${await accessToken()}\n`);
  } else if (command === "models") {
    for (const model of await listModels({ token: await accessToken() })) {
      process.stdout.write(`${model.slug ?? model.id}\t${model.display_name ?? ""}\n`);
    }
  } else {
    process.stderr.write("Usage: chatgpt-plan.mjs login | token | models\n");
    process.exitCode = 2;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv[2]).catch((error) => {
    process.stderr.write(`${error instanceof PlanAuthError ? error.message : error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}
