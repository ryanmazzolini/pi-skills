import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  accessToken,
  authorizeUrl,
  callbackResult,
  login,
  PlanAuthError,
  printableAuthorizeUrl,
  readRecord,
  writeRecord,
} from "./chatgpt-plan.mjs";

const NOW = Date.UTC(2026, 9, 7, 12);
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const JWK = { ...publicKey.export({ format: "jwk" }), kid: "test-key", alg: "RS256" };

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "chatgpt-plan-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function idToken(claims) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", kid: "test-key" })}.${encode(claims)}`;
  return `${unsigned}.${sign("sha256", Buffer.from(unsigned), privateKey).toString("base64url")}`;
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

// Fake OpenAI auth endpoints. `token` decides the token-endpoint reply and
// receives the submitted form so tests can assert on it.
function fakeOpenAI(token) {
  const forms = [];
  const fetchImpl = async (url, init = {}) => {
    if (url.endsWith("/.well-known/openid-configuration")) return json({ jwks_uri: "https://auth.test/jwks" });
    if (url === "https://auth.test/jwks") return json({ keys: [JWK] });
    if (url.endsWith("/api/accounts/oauth/token")) {
      const form = Object.fromEntries(new URLSearchParams(String(init.body)));
      forms.push(form);
      return token(form);
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  return { fetchImpl, forms };
}

function savedRecord(overrides = {}) {
  return {
    ext_agent_host_id: "urn:uuid:host",
    client_id: "oaiapp_saved",
    subject: "user-1",
    email: "user@example.com",
    id_token: "old-id-token",
    access_token: "old-access",
    refresh_token: "old-refresh",
    scopes: ["chatgpt.tokens.use.direct"],
    expires_at: NOW + 60 * 60_000,
    ...overrides,
  };
}

test("first sign-in registers the tool; a returning sign-in reuses its registration", () => {
  const common = { hostId: "urn:uuid:host", redirectUri: "http://127.0.0.1:1455/auth/callback", state: "s", nonce: "n", challenge: "c" };
  const first = new URL(authorizeUrl({ ...common, record: null })).searchParams;
  assert.equal(first.get("client_id"), "dynamic_agent_client");
  assert.equal(first.get("agent_name_hint"), "pi-skill-evals");
  assert.match(first.get("scope"), /\bchatgpt\.tokens\.use\.direct\b/);
  assert.equal(first.get("resource"), "https://api.openai.com/v1");
  assert.equal(first.get("code_challenge_method"), "S256");

  const returning = new URL(authorizeUrl({ ...common, record: savedRecord() })).searchParams;
  assert.equal(returning.get("client_id"), "oaiapp_saved");
  assert.equal(returning.get("agent_name_hint"), null);
  assert.equal(returning.get("id_token_hint"), "old-id-token");
  assert.equal(returning.get("login_hint"), "user@example.com");

  const printable = new URL(printableAuthorizeUrl(authorizeUrl({ ...common, record: savedRecord() }))).searchParams;
  assert.equal(printable.get("id_token_hint"), null);
  assert.equal(printable.get("login_hint"), null);
  assert.equal(printable.get("client_id"), "oaiapp_saved");
});

test("callbacks that do not match the sign-in attempt are rejected", () => {
  const pending = { state: "expected", clientId: null };
  assert.throws(() => callbackResult("/auth/callback?state=other&code=c&client_id=x", pending), /unexpected state/);
  assert.throws(() => callbackResult("/auth/callback?state=expected&error=access_denied", pending), /declined/);
  assert.throws(() => callbackResult("/auth/callback?state=expected&code=c", pending), /did not finish registering/);
  assert.throws(
    () => callbackResult("/auth/callback?state=expected&code=c&client_id=oaiapp_other", { state: "expected", clientId: "oaiapp_saved" }),
    /different app registration/,
  );
  assert.deepEqual(
    callbackResult("/auth/callback?state=expected&code=c", { state: "expected", clientId: "oaiapp_saved" }),
    { code: "c", clientId: "oaiapp_saved" },
  );
});

// Drives the real loopback listener: the fake browser follows the authorize URL
// straight to the callback, as the OpenAI consent page would.
async function signIn(t, { scope = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct", nonceOverride } = {}) {
  const dir = tempDir(t);
  let nonce;
  const { fetchImpl, forms } = fakeOpenAI(() => json({
    access_token: "new-access",
    refresh_token: "new-refresh",
    id_token: idToken({ iss: "https://auth.openai.com", aud: "oaiapp_new", sub: "user-1", email: "user@example.com", exp: NOW / 1000 + 600, nonce: nonceOverride ?? nonce }),
    expires_in: 3600,
    scope,
  }));
  const openBrowser = (url) => {
    const params = new URL(url).searchParams;
    nonce = params.get("nonce");
    fetch(`${params.get("redirect_uri")}?code=auth-code&state=${params.get("state")}&client_id=oaiapp_new`).catch(() => {});
  };
  const result = login({ fetchImpl, dir, openBrowser, log: () => {}, now: () => NOW });
  return { dir, forms, result };
}

test("sign-in exchanges the code and saves owner-only credentials", async (t) => {
  const { dir, forms, result } = await signIn(t);
  const saved = await result;
  assert.equal(saved.client_id, "oaiapp_new");
  assert.equal(saved.email, "user@example.com");
  assert.equal(saved.expires_at, NOW + 3600 * 1000);
  assert.match(saved.ext_agent_host_id, /^urn:uuid:/);
  assert.deepEqual(readRecord(dir), saved);
  assert.equal(statSync(join(dir, "chatgpt-plan.json")).mode & 0o777, 0o600);
  assert.equal(forms[0].grant_type, "authorization_code");
  assert.equal(forms[0].client_id, "oaiapp_new");
  assert.ok(forms[0].code_verifier);
  assert.equal(forms[0].resource, "https://api.openai.com/v1");
});

test("sign-in fails without plan permission or with an ID token from another attempt", async (t) => {
  const withoutPlan = await signIn(t, { scope: "openid profile email offline_access" });
  await assert.rejects(withoutPlan.result, /plan usage was not allowed/);
  assert.equal(readRecord(withoutPlan.dir), null);

  const replayed = await signIn(t, { nonceOverride: "someone-else" });
  await assert.rejects(replayed.result, /another sign-in attempt/);
});

test("a fresh access token is returned without calling OpenAI", async (t) => {
  const dir = tempDir(t);
  writeRecord(dir, savedRecord());
  const fetchImpl = async () => assert.fail("no network expected");
  assert.equal(await accessToken({ fetchImpl, dir, now: () => NOW }), "old-access");
});

test("a token near expiry is refreshed and the rotated refresh token is saved", async (t) => {
  const dir = tempDir(t);
  writeRecord(dir, savedRecord({ expires_at: NOW + 60_000 }));
  const { fetchImpl, forms } = fakeOpenAI(() => json({ access_token: "next-access", refresh_token: "next-refresh", expires_in: 3600 }));

  assert.equal(await accessToken({ fetchImpl, dir, now: () => NOW }), "next-access");
  assert.deepEqual(
    { grant_type: forms[0].grant_type, client_id: forms[0].client_id, refresh_token: forms[0].refresh_token },
    { grant_type: "refresh_token", client_id: "oaiapp_saved", refresh_token: "old-refresh" },
  );
  const saved = readRecord(dir);
  assert.equal(saved.refresh_token, "next-refresh");
  assert.equal(saved.id_token, "old-id-token");
  assert.equal(saved.expires_at, NOW + 3600 * 1000);
});

test("parallel eval processes refresh once and share the replacement token", async (t) => {
  const dir = tempDir(t);
  writeRecord(dir, savedRecord({ expires_at: NOW - 1 }));
  const { fetchImpl, forms } = fakeOpenAI(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    return json({ access_token: "shared-access", refresh_token: "shared-refresh", expires_in: 3600 });
  });

  const tokens = await Promise.all(Array.from({ length: 5 }, () => accessToken({ fetchImpl, dir, now: () => NOW })));
  assert.deepEqual(new Set(tokens), new Set(["shared-access"]));
  assert.equal(forms.length, 1);
});

test("a refresh lock left by a killed process is taken over", async (t) => {
  const dir = tempDir(t);
  writeRecord(dir, savedRecord({ expires_at: NOW - 1 }));
  const lock = join(dir, "chatgpt-plan.json.lock");
  writeFileSync(lock, "");
  const longAgo = new Date(Date.now() - 5 * 60_000);
  utimesSync(lock, longAgo, longAgo);
  const { fetchImpl } = fakeOpenAI(() => json({ access_token: "after-crash", refresh_token: "r", expires_in: 3600 }));

  assert.equal(await accessToken({ fetchImpl, dir, now: () => NOW }), "after-crash");
});

test("a revoked sign-in clears the unusable tokens and asks for a new sign-in", async (t) => {
  const dir = tempDir(t);
  writeRecord(dir, savedRecord({ expires_at: NOW - 1 }));
  const { fetchImpl } = fakeOpenAI(() => json({ error: "invalid_grant", error_description: "revoked" }, 400));

  await assert.rejects(accessToken({ fetchImpl, dir, now: () => NOW }), (error) => {
    assert.ok(error instanceof PlanAuthError);
    assert.match(error.message, /npm run eval:skills:chatgpt:login/);
    return true;
  });
  const saved = readRecord(dir);
  assert.equal(saved.access_token, undefined);
  assert.equal(saved.refresh_token, undefined);
  assert.equal(saved.client_id, "oaiapp_saved");
});

test("a temporary refresh failure keeps the saved credentials", async (t) => {
  const dir = tempDir(t);
  writeRecord(dir, savedRecord({ expires_at: NOW - 1 }));
  const { fetchImpl } = fakeOpenAI(() => json({ detail: "unavailable" }, 503));

  await assert.rejects(accessToken({ fetchImpl, dir, now: () => NOW }), /token request failed/);
  assert.equal(readRecord(dir).refresh_token, "old-refresh");
});

test("a successful refresh without an access token fails clearly and saves nothing", async (t) => {
  const dir = tempDir(t);
  writeRecord(dir, savedRecord({ expires_at: NOW - 1 }));
  const { fetchImpl } = fakeOpenAI(() => new Response("not json", { status: 200 }));

  await assert.rejects(accessToken({ fetchImpl, dir, now: () => NOW }), /had no access token/);
  assert.equal(readRecord(dir).access_token, "old-access");
});

test("without saved credentials the token command explains how to sign in", async (t) => {
  await assert.rejects(accessToken({ dir: tempDir(t), now: () => NOW }), /Not signed in to ChatGPT\. Run: npm run eval:skills:chatgpt:login/);
});
