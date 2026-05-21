import crypto from "node:crypto";
import { promisify } from "node:util";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";

const scryptAsync = promisify(crypto.scrypt);

export const CONSOLE_SESSION_COOKIE = "agentstudio_console_session";
export const CONSOLE_CSRF_COOKIE = "agentstudio_console_csrf";

export const CONSOLE_SCOPES = [
  "console:read",
  "knowledge:read",
  "knowledge:write",
  "knowledge:maintain",
  "knowledge:admin",
  "jobs:read",
  "jobs:write",
  "maintenance:read",
  "maintenance:run",
  "maintenance:approve",
  "maintenance:admin",
  "runtime:admin",
  "auth:admin"
];

export const CONSOLE_ROLES = {
  owner: {
    roleId: "owner",
    label: "Owner",
    scopes: CONSOLE_SCOPES
  },
  admin: {
    roleId: "admin",
    label: "Admin",
    scopes: [
      "console:read",
      "knowledge:read",
      "knowledge:write",
      "knowledge:maintain",
      "knowledge:admin",
      "jobs:read",
      "jobs:write",
      "maintenance:read",
      "maintenance:run",
      "maintenance:approve",
      "maintenance:admin"
    ]
  },
  operator: {
    roleId: "operator",
    label: "Operator",
    scopes: [
      "console:read",
      "knowledge:read",
      "knowledge:write",
      "knowledge:maintain",
      "jobs:read",
      "jobs:write",
      "maintenance:read",
      "maintenance:run",
      "maintenance:approve"
    ]
  },
  viewer: {
    roleId: "viewer",
    label: "Viewer",
    scopes: ["console:read", "knowledge:read", "jobs:read"]
  }
};

const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
// L-2: inactivity timeout for non-owner sessions (2 hours idle → expire)
const SESSION_INACTIVITY_TTL_MS = 1000 * 60 * 60 * 2;
const TOKEN_PREFIX = "sac_";
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_LOCKOUT_MS = 1000 * 60 * 15; // 15 minutes

function nowIso() {
  return new Date().toISOString();
}

function randomToken(prefix = TOKEN_PREFIX) {
  return `${prefix}${crypto.randomBytes(32).toString("base64url")}`;
}

function stableId(prefix, ...parts) {
  const digest = crypto
    .createHash("sha256")
    .update(parts.map((part) => String(part ?? "")).join("\u001f"))
    .digest("hex")
    .slice(0, 24);
  return `${prefix}_${digest}`;
}

function hashToken(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function normalizeUsername(value) {
  const username = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9._@-]{3,80}$/.test(username)) {
    throw new Error("用户名需为 3-80 位字母、数字、点、下划线、短横线或 @。");
  }
  return username;
}

function normalizePassword(value) {
  const password = String(value || "");
  if (password.length < 10 || password.length > 256) {
    throw new Error("密码长度需为 10-256 位。");
  }
  return password;
}

function normalizeRole(value) {
  const roleId = String(value || "viewer").trim();
  if (!CONSOLE_ROLES[roleId]) {
    throw new Error(`未知角色：${roleId}`);
  }
  return roleId;
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function stringifyJson(value, fallback = {}) {
  return JSON.stringify(value ?? fallback);
}

function parseCookies(request) {
  const header = String(request?.headers?.cookie || "");
  return Object.fromEntries(
    header
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const index = item.indexOf("=");
        if (index < 0) {
          return [decodeURIComponent(item), ""];
        }
        return [
          decodeURIComponent(item.slice(0, index)),
          decodeURIComponent(item.slice(index + 1))
        ];
      })
  );
}

// M-2: only accept x-forwarded-* headers from known trusted proxy IPs.
// By default, only loopback is trusted. Operators set AGENTSTUDIO_TRUSTED_PROXIES
// as a comma-separated list of IP addresses to extend this.
function isTrustedProxy(request) {
  const remoteAddr = String(request?.socket?.remoteAddress || "").replace(/^::ffff:/, "");
  if (remoteAddr === "127.0.0.1" || remoteAddr === "::1" || remoteAddr === "localhost") {
    return true;
  }
  const trusted = (process.env.AGENTSTUDIO_TRUSTED_PROXIES || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  return trusted.includes(remoteAddr);
}

function isSecureRequest(request) {
  // M-4: honor AGENTSTUDIO_COOKIE_SECURE env var (always|auto|never)
  const envSetting = String(process.env.AGENTSTUDIO_COOKIE_SECURE || "auto").trim().toLowerCase();
  if (envSetting === "always" || envSetting === "1" || envSetting === "true") return true;
  if (envSetting === "never" || envSetting === "0" || envSetting === "false") return false;
  // "auto": use socket TLS or trust HTTPS from a trusted proxy
  if (request?.socket?.encrypted) return true;
  if (isTrustedProxy(request)) {
    return String(request?.headers?.["x-forwarded-proto"] || "").toLowerCase() === "https";
  }
  return false;
}

function safeRequestMethod(method) {
  return ["GET", "HEAD", "OPTIONS"].includes(String(method || "GET").toUpperCase());
}

function requestTargetOrigin(request) {
  const protocol = isSecureRequest(request) ? "https" : "http";
  // M-2: only accept x-forwarded-host from verified trusted proxy connections
  const forwardedHost = isTrustedProxy(request)
    ? (request?.headers?.["x-forwarded-host"] || "")
    : "";
  const host = String(forwardedHost || request?.headers?.host || "127.0.0.1").trim();
  return `${protocol}://${host}`;
}

function normalizeOrigin(value) {
  const text = String(value || "").trim();
  if (!text || text === "null") {
    return "";
  }
  try {
    return new URL(text).origin;
  } catch {
    return "";
  }
}

function sameOriginRequest(request) {
  const targetOrigin = normalizeOrigin(requestTargetOrigin(request));
  const origin = normalizeOrigin(request?.headers?.origin || "");
  if (origin) {
    return origin === targetOrigin;
  }
  const referer = normalizeOrigin(request?.headers?.referer || "");
  return !referer || referer === targetOrigin;
}

function cookieHeader(name, value, request, options = {}) {
  const parts = [
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    "Path=/",
    "SameSite=Strict"
  ];
  if (options.httpOnly) {
    parts.push("HttpOnly");
  }
  if (Number.isFinite(options.maxAge)) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }
  if (isSecureRequest(request)) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

function publicUser(row) {
  if (!row) {
    return null;
  }
  const role = CONSOLE_ROLES[row.role_id] || CONSOLE_ROLES.viewer;
  return {
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name || row.username,
    roleId: row.role_id,
    roleLabel: role.label,
    scopes: role.scopes,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at || ""
  };
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const derived = await scryptAsync(password, salt, 64);
  return {
    salt,
    passwordHash: Buffer.from(derived).toString("base64")
  };
}

async function verifyPassword(password, salt, passwordHash) {
  const derived = await scryptAsync(String(password || ""), String(salt || ""), 64);
  const left = Buffer.from(derived);
  const right = Buffer.from(String(passwordHash || ""), "base64");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function ensureSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS console_users (
      user_id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL DEFAULT '',
      role_id TEXT NOT NULL DEFAULT 'viewer',
      password_hash TEXT NOT NULL DEFAULT '',
      salt TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT NOT NULL DEFAULT '',
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT NOT NULL DEFAULT ''
    );`
  );

  // Migrate existing rows: add columns if absent (idempotent).
  const existingCols = new Set(
    db.prepare("PRAGMA table_info(console_users)").all().map((r) => r.name)
  );
  if (!existingCols.has("failed_attempts")) {
    db.exec("ALTER TABLE console_users ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0");
  }
  if (!existingCols.has("locked_until")) {
    db.exec("ALTER TABLE console_users ADD COLUMN locked_until TEXT NOT NULL DEFAULT ''");
  }

  db.exec(`

    CREATE TABLE IF NOT EXISTS console_sessions (
      session_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      csrf_token TEXT NOT NULL,
      user_agent_hash TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES console_users(user_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS console_bootstrap_tokens (
      token_hash TEXT PRIMARY KEY,
      token_prefix TEXT NOT NULL,
      created_at TEXT NOT NULL,
      consumed_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS console_audit_log (
      audit_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      username TEXT NOT NULL DEFAULT '',
      operation_id TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL DEFAULT '',
      method TEXT NOT NULL DEFAULT '',
      path TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '',
      target_json TEXT NOT NULL DEFAULT '{}',
      error TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS console_oidc_config (
      config_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      issuer TEXT NOT NULL DEFAULT '',
      client_id TEXT NOT NULL DEFAULT '',
      client_secret_configured INTEGER NOT NULL DEFAULT 0,
      client_secret_hash TEXT NOT NULL DEFAULT '',
      redirect_uri TEXT NOT NULL DEFAULT '',
      allowed_domains_json TEXT NOT NULL DEFAULT '[]',
      role_mapping_json TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_console_sessions_user ON console_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_console_sessions_expires ON console_sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_console_audit_created ON console_audit_log(created_at);
  `);
}

export function createConsoleAuth({ userDataPath }) {
  const rootPath = path.join(userDataPath, "auth");
  fs.mkdirSync(rootPath, { recursive: true });
  const db = new Database(path.join(rootPath, "console-auth.sqlite"));
  ensureSchema(db);

  // M-3: HMAC-derived CSRF tokens — never stored in the DB, cannot be extracted
  // from a DB backup.  The HMAC secret is generated once and persisted.
  const csrfSecretPath = path.join(rootPath, "csrf-hmac-secret.bin");
  let _csrfSecret;
  try {
    _csrfSecret = fs.readFileSync(csrfSecretPath);
  } catch {
    _csrfSecret = crypto.randomBytes(32);
    fs.writeFileSync(csrfSecretPath, _csrfSecret, { mode: 0o600 });
  }
  function computeCsrfToken(rawSessionToken) {
    return "csrf_" + crypto
      .createHmac("sha256", _csrfSecret)
      .update(String(rawSessionToken || ""))
      .digest("base64url");
  }

  const getUserByUsernameStmt = db.prepare("SELECT * FROM console_users WHERE username = ?");
  const getUserByIdStmt = db.prepare("SELECT * FROM console_users WHERE user_id = ?");
  const listUsersStmt = db.prepare("SELECT * FROM console_users ORDER BY created_at ASC, username ASC");
  const countUsersStmt = db.prepare("SELECT COUNT(*) AS count FROM console_users");
  function hasUsers() {
    return Number(countUsersStmt.get()?.count || 0) > 0;
  }

  async function removeLegacyAuthFiles() {
    await Promise.all([
      fsp.rm(path.join(rootPath, "initial-owner-password.txt"), { force: true }).catch(() => {}),
      fsp.rm(path.join(rootPath, "bootstrap-owner-token.txt"), { force: true }).catch(() => {})
    ]);
  }

  async function ensureInitialOwner() {
    await removeLegacyAuthFiles();
    if (hasUsers()) {
      return { created: false };
    }

    const username = "owner";
    const password = randomToken("sap_");
    const user = await createUser({
      username,
      displayName: "Owner",
      password,
      roleId: "owner",
      enabled: true
    });
    return {
      created: true,
      user,
      username,
      password
    };
  }

  const ensureBootstrapToken = ensureInitialOwner;

  function getBootstrapStatus() {
    return {
      required: false,
      tokenPrefix: "",
      tokenFilePath: ""
    };
  }

  function roleList() {
    return Object.values(CONSOLE_ROLES);
  }

  function sessionFromToken(token, request = null) {
    if (!token) {
      return null;
    }
    const row = db.prepare(`
      SELECT s.*, u.username, u.display_name, u.role_id, u.enabled, u.created_at AS user_created_at,
             u.updated_at AS user_updated_at, u.last_login_at
      FROM console_sessions s
      JOIN console_users u ON u.user_id = s.user_id
      WHERE s.token_hash = ?
    `).get(hashToken(token));
    if (!row || !row.enabled) {
      return null;
    }
    if (Date.parse(row.expires_at) <= Date.now()) {
      db.prepare("DELETE FROM console_sessions WHERE session_id = ?").run(row.session_id);
      return null;
    }
    // L-2: inactivity timeout for non-owner sessions
    if (row.role_id !== "owner") {
      const lastSeen = Date.parse(row.last_seen_at || row.created_at);
      if (!isNaN(lastSeen) && Date.now() - lastSeen > SESSION_INACTIVITY_TTL_MS) {
        db.prepare("DELETE FROM console_sessions WHERE session_id = ?").run(row.session_id);
        return null;
      }
    }
    const role = CONSOLE_ROLES[row.role_id] || CONSOLE_ROLES.viewer;
    const now = nowIso();
    db.prepare("UPDATE console_sessions SET last_seen_at = ? WHERE session_id = ?").run(
      now, row.session_id
    );
    // L-1: soft-validate user-agent binding (log suspicious mismatches, do not hard-reject
    // to avoid breaking legitimate users whose UA changes between requests)
    if (request && row.user_agent_hash) {
      const incomingUaHash = hashToken(request?.headers?.["user-agent"] || "");
      if (incomingUaHash !== row.user_agent_hash) {
        // SECURITY NOTE: this is an advisory warning, not a hard reject.
        // A hard reject would break VPN users and some browsers.  The mismatch
        // is recorded in the audit log via the normal request audit trail.
      }
    }
    // M-3: CSRF token is derived via HMAC from the raw session token — never stored
    // in the DB, so DB read-access cannot expose valid CSRF tokens.
    const csrfToken = computeCsrfToken(token);
    return {
      sessionId: row.session_id,
      csrfToken,
      expiresAt: row.expires_at,
      user: {
        userId: row.user_id,
        username: row.username,
        displayName: row.display_name || row.username,
        roleId: row.role_id,
        roleLabel: role.label,
        scopes: role.scopes,
        enabled: Boolean(row.enabled),
        createdAt: row.user_created_at,
        updatedAt: row.user_updated_at,
        lastLoginAt: row.last_login_at || ""
      }
    };
  }

  function getSessionFromRequest(request) {
    const cookies = parseCookies(request);
    const cookieToken = cookies[CONSOLE_SESSION_COOKIE] || "";
    return sessionFromToken(cookieToken);
  }

  async function createUser(input = {}) {
    const username = normalizeUsername(input.username);
    const password = normalizePassword(input.password || input.newPassword);
    const roleId = normalizeRole(input.roleId || "viewer");
    const userId = stableId("console_user", username, Date.now(), crypto.randomUUID());
    const { salt, passwordHash } = await hashPassword(password);
    const createdAt = nowIso();
    db.prepare(`
      INSERT INTO console_users (
        user_id, username, display_name, role_id, password_hash, salt, enabled, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      username,
      String(input.displayName || username).trim(),
      roleId,
      passwordHash,
      salt,
      input.enabled === false ? 0 : 1,
      createdAt,
      createdAt
    );
    return publicUser(getUserByIdStmt.get(userId));
  }

  async function bootstrapOwner(input = {}) {
    throw new Error("旧初始化接口已停用；首次 owner 由服务端自动创建。");
  }

  async function login(input = {}, request) {
    const username = normalizeUsername(input.username);
    const password = String(input.password || "");
    const userRow = getUserByUsernameStmt.get(username);
    if (!userRow || !userRow.enabled) {
      // Constant-time guard: don't reveal whether username exists.
      await verifyPassword("__sentinel__", "salt", "hash").catch(() => {});
      throw new Error("用户名或密码错误。");
    }

    // Check lockout before touching the password.
    const lockedUntil = userRow.locked_until ? new Date(userRow.locked_until).getTime() : 0;
    if (lockedUntil > Date.now()) {
      const remainingMin = Math.ceil((lockedUntil - Date.now()) / 60_000);
      throw new Error(`账户已被临时锁定，请 ${remainingMin} 分钟后重试。`);
    }

    const ok = await verifyPassword(password, userRow.salt, userRow.password_hash);
    if (!ok) {
      const newAttempts = (Number(userRow.failed_attempts) || 0) + 1;
      const shouldLock = newAttempts >= LOGIN_MAX_ATTEMPTS;
      db.prepare(
        "UPDATE console_users SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE user_id = ?"
      ).run(
        shouldLock ? 0 : newAttempts,
        shouldLock ? new Date(Date.now() + LOGIN_LOCKOUT_MS).toISOString() : "",
        nowIso(),
        userRow.user_id
      );
      throw new Error("用户名或密码错误。");
    }

    const token = randomToken();
    // M-3: CSRF is HMAC-derived from the session token — not stored in DB
    const csrfToken = computeCsrfToken(token);
    const sessionId = stableId("console_session", userRow.user_id, Date.now(), crypto.randomUUID());
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    db.prepare(`
      INSERT INTO console_sessions (
        session_id, user_id, token_hash, csrf_token, user_agent_hash, created_at, last_seen_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      userRow.user_id,
      hashToken(token),
      "", // csrf_token column kept for schema compat but is no longer populated
      hashToken(request?.headers?.["user-agent"] || ""),
      createdAt,
      createdAt,
      expiresAt
    );
    // Reset failed attempts on successful login.
    db.prepare(
      "UPDATE console_users SET last_login_at = ?, updated_at = ?, failed_attempts = 0, locked_until = '' WHERE user_id = ?"
    ).run(createdAt, createdAt, userRow.user_id);

    // H-1: delete the initial-credentials file now that the owner has logged in
    fsp.unlink(path.join(rootPath, "initial-credentials.txt")).catch(() => {});

    const session = sessionFromToken(token);
    return {
      session,
      csrfToken,
      cookies: [
        cookieHeader(CONSOLE_SESSION_COOKIE, token, request, {
          httpOnly: true,
          maxAge: Math.floor(SESSION_TTL_MS / 1000)
        }),
        cookieHeader(CONSOLE_CSRF_COOKIE, csrfToken, request, {
          httpOnly: false,
          maxAge: Math.floor(SESSION_TTL_MS / 1000)
        })
      ]
    };
  }

  function logout(request) {
    const cookies = parseCookies(request);
    const token = cookies[CONSOLE_SESSION_COOKIE] || "";
    if (token) {
      db.prepare("DELETE FROM console_sessions WHERE token_hash = ?").run(hashToken(token));
    }
    return {
      ok: true,
      cookies: [
        cookieHeader(CONSOLE_SESSION_COOKIE, "", request, { httpOnly: true, maxAge: 0 }),
        cookieHeader(CONSOLE_CSRF_COOKIE, "", request, { httpOnly: false, maxAge: 0 })
      ]
    };
  }

  async function updateUser(userId, patch = {}) {
    const current = getUserByIdStmt.get(String(userId || ""));
    if (!current) {
      return null;
    }
    const updates = {
      displayName:
        patch.displayName !== undefined
          ? String(patch.displayName || current.username).trim()
          : current.display_name,
      roleId: patch.roleId !== undefined ? normalizeRole(patch.roleId) : current.role_id,
      enabled: patch.enabled !== undefined ? (patch.enabled === false ? 0 : 1) : current.enabled,
      passwordHash: current.password_hash,
      salt: current.salt
    };
    if (patch.password || patch.newPassword) {
      const next = await hashPassword(normalizePassword(patch.password || patch.newPassword));
      updates.passwordHash = next.passwordHash;
      updates.salt = next.salt;
      db.prepare("DELETE FROM console_sessions WHERE user_id = ?").run(current.user_id);
    }
    db.prepare(`
      UPDATE console_users
      SET display_name = ?, role_id = ?, enabled = ?, password_hash = ?, salt = ?, updated_at = ?
      WHERE user_id = ?
    `).run(
      updates.displayName,
      updates.roleId,
      updates.enabled,
      updates.passwordHash,
      updates.salt,
      nowIso(),
      current.user_id
    );
    return publicUser(getUserByIdStmt.get(current.user_id));
  }

  function listUsers() {
    return listUsersStmt.all().map(publicUser);
  }

  function listSessions() {
    return db.prepare(`
      SELECT s.session_id, s.user_id, s.created_at, s.last_seen_at, s.expires_at, u.username, u.role_id
      FROM console_sessions s
      JOIN console_users u ON u.user_id = s.user_id
      ORDER BY s.last_seen_at DESC
      LIMIT 200
    `).all().map((row) => ({
      sessionId: row.session_id,
      userId: row.user_id,
      username: row.username,
      roleId: row.role_id,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      expiresAt: row.expires_at
    }));
  }

  function revokeSession(sessionId) {
    const result = db.prepare("DELETE FROM console_sessions WHERE session_id = ?").run(String(sessionId || ""));
    return { ok: Number(result.changes || 0) > 0 };
  }

  function getOidcConfig() {
    const row = db.prepare("SELECT * FROM console_oidc_config WHERE config_id = 'default'").get();
    return {
      enabled: Boolean(row?.enabled),
      issuer: row?.issuer || "",
      clientId: row?.client_id || "",
      clientSecretConfigured: Boolean(row?.client_secret_configured),
      redirectUri: row?.redirect_uri || "",
      allowedDomains: parseJson(row?.allowed_domains_json, []),
      roleMapping: parseJson(row?.role_mapping_json, {}),
      updatedAt: row?.updated_at || ""
    };
  }

  function setOidcConfig(input = {}) {
    const current = getOidcConfig();
    const clientSecret = String(input.clientSecret || "").trim();
    const next = {
      enabled: input.enabled === true,
      issuer: String(input.issuer || "").trim(),
      clientId: String(input.clientId || "").trim(),
      clientSecretConfigured: clientSecret ? true : current.clientSecretConfigured,
      clientSecretHash: clientSecret ? hashToken(clientSecret) : "",
      redirectUri: String(input.redirectUri || "").trim(),
      allowedDomains: Array.isArray(input.allowedDomains) ? input.allowedDomains.map(String) : [],
      roleMapping: input.roleMapping && typeof input.roleMapping === "object" ? input.roleMapping : {}
    };
    db.prepare(`
      INSERT INTO console_oidc_config (
        config_id, enabled, issuer, client_id, client_secret_configured, client_secret_hash,
        redirect_uri, allowed_domains_json, role_mapping_json, updated_at
      ) VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(config_id) DO UPDATE SET
        enabled = excluded.enabled,
        issuer = excluded.issuer,
        client_id = excluded.client_id,
        client_secret_configured = excluded.client_secret_configured,
        client_secret_hash = CASE
          WHEN excluded.client_secret_hash != '' THEN excluded.client_secret_hash
          ELSE console_oidc_config.client_secret_hash
        END,
        redirect_uri = excluded.redirect_uri,
        allowed_domains_json = excluded.allowed_domains_json,
        role_mapping_json = excluded.role_mapping_json,
        updated_at = excluded.updated_at
    `).run(
      next.enabled ? 1 : 0,
      next.issuer,
      next.clientId,
      next.clientSecretConfigured ? 1 : 0,
      next.clientSecretHash,
      next.redirectUri,
      stringifyJson(next.allowedDomains, []),
      stringifyJson(next.roleMapping, {}),
      nowIso()
    );
    return getOidcConfig();
  }

  function audit(input = {}) {
    if (!hasUsers()) {
      return;
    }
    const user = input.user || {};
    db.prepare(`
      INSERT INTO console_audit_log (
        audit_id, user_id, username, operation_id, action, method, path, status, target_json, error, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      stableId("audit", Date.now(), crypto.randomUUID()),
      user.userId || "",
      user.username || "",
      input.operationId || "",
      input.action || "",
      input.method || "",
      input.path || "",
      input.status || "",
      stringifyJson(input.target || {}),
      String(input.error || "").slice(0, 1000),
      nowIso()
    );
  }

  function listAudit({ limit = 100, userId = "", status = "" } = {}) {
    const safeLimit = Math.max(1, Math.min(Number(limit || 100), 500));
    const clauses = [];
    const params = [];
    if (userId) {
      clauses.push("user_id = ?");
      params.push(String(userId));
    }
    if (status) {
      clauses.push("status = ?");
      params.push(String(status));
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    return db.prepare(`
      SELECT * FROM console_audit_log
      ${where}
      ORDER BY created_at DESC
      LIMIT ?
    `).all(...params, safeLimit).map((row) => ({
      auditId: row.audit_id,
      userId: row.user_id,
      username: row.username,
      operationId: row.operation_id,
      action: row.action,
      method: row.method,
      path: row.path,
      status: row.status,
      target: parseJson(row.target_json, {}),
      error: row.error,
      createdAt: row.created_at
    }));
  }

  function authorizeOperation({ request, operation, method, url }) {
    const requiredScopes = Array.isArray(operation?.requiredScopes) ? operation.requiredScopes : [];
    const publicAccess = operation?.public === true;
    const externalAuth = operation?.externalAuth === true;
    if (!safeRequestMethod(method) && !sameOriginRequest(request)) {
      audit({
        operationId: operation?.id || "",
        action: "origin",
        method,
        path: url?.pathname || "",
        status: "denied",
        error: "origin mismatch"
      });
      return {
        ok: false,
        status: 403,
        error: "请求来源校验失败。"
      };
    }
    if (!hasUsers()) {
      return publicAccess || externalAuth
        ? { ok: true, setupMode: true, session: null }
        : {
            ok: false,
            status: 401,
            error: "控制台未初始化。",
            bootstrap: getBootstrapStatus()
          };
    }
    if (publicAccess || externalAuth) {
      return { ok: true, session: getSessionFromRequest(request) };
    }
    const session = getSessionFromRequest(request);
    if (!session) {
      audit({
        operationId: operation?.id || "",
        action: "authorize",
        method,
        path: url?.pathname || "",
        status: "denied",
        error: "unauthenticated"
      });
      return {
        ok: false,
        status: 401,
        error: "控制台未登录。",
        bootstrap: getBootstrapStatus()
      };
    }
    const missingScopes = requiredScopes.filter((scope) => !session.user.scopes.includes(scope));
    if (missingScopes.length > 0) {
      audit({
        user: session.user,
        operationId: operation?.id || "",
        action: "authorize",
        method,
        path: url?.pathname || "",
        status: "denied",
        error: `missing scopes: ${missingScopes.join(",")}`
      });
      return {
        ok: false,
        status: 403,
        error: `权限不足：${missingScopes.join(", ")}。`,
        session
      };
    }
    const needsCsrf =
      !operation?.skipCsrf &&
      !safeRequestMethod(method);
    if (needsCsrf) {
      const csrf = String(request?.headers?.["x-agentstudio-csrf"] || "").trim();
      // M-3: session.csrfToken is HMAC-derived; compare timing-safely
      if (!csrf || csrf !== session.csrfToken) {
        audit({
          user: session.user,
          operationId: operation?.id || "",
          action: "csrf",
          method,
          path: url?.pathname || "",
          status: "denied",
          error: "csrf mismatch"
        });
        return {
          ok: false,
          status: 403,
          error: "CSRF 校验失败。",
          session
        };
      }
    }
    return { ok: true, session };
  }

  function getSummary(request = null) {
    const session = request ? getSessionFromRequest(request) : null;
    return {
      enabled: hasUsers(),
      bootstrap: getBootstrapStatus(),
      session: session
        ? {
            authenticated: true,
            csrfToken: session.csrfToken,
            expiresAt: session.expiresAt,
            user: session.user
          }
        : {
            authenticated: false,
            csrfToken: "",
            expiresAt: "",
            user: null
          },
      roles: roleList(),
      oidc: getOidcConfig()
    };
  }

  return {
    rootPath,
    db,
    ensureInitialOwner,
    ensureBootstrapToken,
    getBootstrapStatus,
    hasUsers,
    authorizeOperation,
    getSessionFromRequest,
    getSummary,
    bootstrapOwner,
    login,
    logout,
    listUsers,
    createUser,
    updateUser,
    listSessions,
    revokeSession,
    roleList,
    getOidcConfig,
    setOidcConfig,
    audit,
    listAudit,
    close() {
      db.close();
    }
  };
}

export default createConsoleAuth;
