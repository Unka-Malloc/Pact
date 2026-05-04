import assert from "node:assert/strict";

const AUTH_RULES = [];
const ORIGINAL_FETCH = globalThis.fetch.bind(globalThis);
let fetchInstalled = false;

function cookieHeaderFrom(response) {
  const setCookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : String(response.headers.get("set-cookie") || "")
          .split(/,(?=\s*splitall_)/)
          .filter(Boolean);
  return setCookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

async function loginOwner(server) {
  const password = server.initialOwner?.password || "";
  assert.ok(password, "test auth helper requires a newly created server owner password");
  const response = await ORIGINAL_FETCH(`${server.url}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      username: "owner",
      password
    })
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  return {
    cookie: cookieHeaderFrom(response),
    csrf: payload.csrfToken
  };
}

function ensureFetchInstalled() {
  if (fetchInstalled) {
    return;
  }
  fetchInstalled = true;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url
    );
    const rule = AUTH_RULES.find((item) => item.origin === url.origin);
    if (!rule || url.pathname === "/api/auth/login") {
      return ORIGINAL_FETCH(input, init);
    }

    const headers = new Headers(init.headers || {});
    if (!headers.has("Cookie")) {
      headers.set("Cookie", rule.auth.cookie);
    }

    const method = String(init.method || input?.method || "GET").toUpperCase();
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      if (!headers.has("x-splitall-csrf")) {
        headers.set("x-splitall-csrf", rule.auth.csrf);
      }
      if (rule.safetyConfirm && !headers.has("x-splitall-safety-confirm")) {
        headers.set("x-splitall-safety-confirm", "true");
      }
    }

    return ORIGINAL_FETCH(input, {
      ...init,
      headers
    });
  };
}

export async function installAuthenticatedFetch(server, options = {}) {
  const auth = options.auth || await loginOwner(server);
  const origin = new URL(server.url).origin;
  const existing = AUTH_RULES.find((item) => item.origin === origin);
  if (existing) {
    existing.auth = auth;
    existing.safetyConfirm = options.safetyConfirm !== false;
  } else {
    AUTH_RULES.push({
      origin,
      auth,
      safetyConfirm: options.safetyConfirm !== false
    });
  }

  ensureFetchInstalled();
  if (options.setProcessEnv !== false) {
    process.env.SPLITALL_CONSOLE_COOKIE = auth.cookie;
    process.env.SPLITALL_CONSOLE_CSRF = auth.csrf;
    process.env.SPLITALL_SAFETY_CONFIRM = options.safetyConfirm === false ? "" : "1";
  }
  return auth;
}

export function authHeaders(auth, { safetyConfirm = true, method = "GET" } = {}) {
  const headers = {
    Cookie: auth.cookie
  };
  if (!["GET", "HEAD", "OPTIONS"].includes(String(method || "GET").toUpperCase())) {
    headers["x-splitall-csrf"] = auth.csrf;
    if (safetyConfirm) {
      headers["x-splitall-safety-confirm"] = "true";
    }
  }
  return headers;
}
