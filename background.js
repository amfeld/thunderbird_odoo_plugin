/*
 * Odoo for Thunderbird — background script.
 *
 * Owns the connection to Odoo: the OAuth-style handshake against the
 * `mail_plugin` module and every authenticated JSON-RPC call. The popup never
 * talks to Odoo directly; it sends messages here. That keeps the access token
 * in one place and avoids CORS/host-permission juggling in the popup.
 *
 * Server contract (Odoo 19 `mail_plugin` and friends):
 *   GET  /mail_plugin/auth?scope=outlook&friendlyname=..&redirect=..&state=..
 *        -> consent screen, requires the user to be logged into Odoo, then
 *           redirects to <redirect>?success=1&auth_code=..&state=..
 *   POST /mail_plugin/auth/access_token {auth_code}   -> {access_token}
 *        (api key, scope "odoo.plugin.outlook", valid ~1 day)
 *   POST /mail_plugin/auth/check_version              -> 1 (module installed?)
 *   All data routes are type="jsonrpc", auth="outlook", and expect the header
 *   Authorization: Bearer <access_token>.
 */

const SETTINGS_KEY = "settings"; // { baseUrl }
const TOKEN_KEY = "token"; // { accessToken, obtainedAt }

// Odoo requires exactly this scope: _auth_method_outlook checks for the api-key
// scope "odoo.plugin.outlook", which is built from the scope we send here.
const AUTH_SCOPE = "outlook";
const FRIENDLY_NAME = "Thunderbird";

// ---------------------------------------------------------------------------
// small storage helpers
// ---------------------------------------------------------------------------

async function getSettings() {
  const data = await messenger.storage.local.get(SETTINGS_KEY);
  return data[SETTINGS_KEY] || {};
}

async function getBaseUrl() {
  const { baseUrl } = await getSettings();
  if (!baseUrl) return null;
  return baseUrl.replace(/\/+$/, ""); // no trailing slash
}

async function getToken() {
  const data = await messenger.storage.local.get(TOKEN_KEY);
  return data[TOKEN_KEY] || null;
}

async function setToken(token) {
  await messenger.storage.local.set({ [TOKEN_KEY]: token });
}

async function clearToken() {
  await messenger.storage.local.remove(TOKEN_KEY);
}

// ---------------------------------------------------------------------------
// low-level HTTP
// ---------------------------------------------------------------------------

// Odoo type="jsonrpc" routes expect a JSON-RPC 2.0 envelope and answer with
// { result } on success or { error } on a server exception. Auth failures are
// raised before dispatch and come back as HTTP 400 instead.
async function jsonRpc(path, params, { token } = {}) {
  const base = await getBaseUrl();
  if (!base) throw new PluginError("not_configured");

  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = "Bearer " + token;

  let res;
  try {
    res = await fetch(base + path, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "call",
        params: params || {},
        id: 0,
      }),
    });
  } catch (e) {
    throw new PluginError("network", String(e && e.message ? e.message : e));
  }

  // 400/401/403 from an authenticated route means the token is missing/expired.
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    if (token) await clearToken();
    throw new PluginError("needs_auth");
  }
  if (!res.ok) {
    throw new PluginError("http", "HTTP " + res.status);
  }

  const payload = await res.json();
  if (payload.error) {
    const msg =
      (payload.error.data && payload.error.data.message) ||
      payload.error.message ||
      "server error";
    throw new PluginError("server", msg);
  }
  return payload.result;
}

class PluginError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// connection state / handshake
// ---------------------------------------------------------------------------

async function checkVersion() {
  // auth="none" route, so no token needed. Returns 1 when the module is live.
  return jsonRpc("/mail_plugin/auth/check_version", {});
}

async function connect() {
  const base = await getBaseUrl();
  if (!base) throw new PluginError("not_configured");

  // Make sure we can actually reach the module before opening a browser window.
  try {
    await checkVersion();
  } catch (e) {
    if (e.code === "network") throw e;
    throw new PluginError("module_missing");
  }

  const redirectUri = messenger.identity.getRedirectURL();
  const authUrl =
    base +
    "/mail_plugin/auth?" +
    new URLSearchParams({
      scope: AUTH_SCOPE,
      friendlyname: FRIENDLY_NAME,
      redirect: redirectUri,
    }).toString();

  let resultUrl;
  try {
    resultUrl = await messenger.identity.launchWebAuthFlow({
      url: authUrl,
      interactive: true,
    });
  } catch (e) {
    // user closed the window / denied
    throw new PluginError("auth_cancelled");
  }

  const params = new URL(resultUrl).searchParams;
  if (params.get("success") !== "1" || !params.get("auth_code")) {
    throw new PluginError("auth_denied");
  }

  const authCode = params.get("auth_code");
  const result = await jsonRpc("/mail_plugin/auth/access_token", {
    auth_code: authCode,
  });
  if (!result || !result.access_token) {
    throw new PluginError("token_exchange_failed");
  }

  await setToken({
    accessToken: result.access_token,
    obtainedAt: Date.now(),
  });
  return { connected: true };
}

// Authenticated JSON-RPC call; surfaces a clean "needs_auth" so the popup can
// offer a reconnect button instead of a raw error.
async function apiCall(path, params) {
  const token = await getToken();
  if (!token) throw new PluginError("needs_auth");
  return jsonRpc(path, params, { token: token.accessToken });
}

async function getState() {
  const base = await getBaseUrl();
  const token = await getToken();
  return {
    configured: !!base,
    connected: !!token,
    baseUrl: base,
  };
}

// ---------------------------------------------------------------------------
// message router (popup + options talk to us through this)
// ---------------------------------------------------------------------------

messenger.runtime.onMessage.addListener((msg) => {
  switch (msg && msg.type) {
    case "getState":
      return getState();
    case "connect":
      return connect().then(
        (r) => ({ ok: true, ...r }),
        (e) => ({ ok: false, code: e.code || "error", message: e.message })
      );
    case "disconnect":
      return clearToken().then(() => ({ ok: true }));
    case "api":
      return apiCall(msg.path, msg.params).then(
        (result) => ({ ok: true, result }),
        (e) => ({ ok: false, code: e.code || "error", message: e.message })
      );
    default:
      return false;
  }
});
