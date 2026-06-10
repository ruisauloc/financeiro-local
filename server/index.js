import express from "express";
import cors from "cors";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AsyncLocalStorage } from "node:async_hooks";
import Database from "better-sqlite3";
import * as XLSX from "xlsx";
import AdmZip from "adm-zip";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const dataRoot = path.resolve(process.env.FINANCEIRO_DATA_DIR || root);
fs.mkdirSync(dataRoot, { recursive: true });
const dbPath = path.resolve(process.env.FINANCEIRO_DB_PATH || path.join(dataRoot, "financeiro.sqlite"));
const seedPath = process.env.FINANCEIRO_SEED_PATH === "none"
  ? ""
  : path.resolve(process.env.FINANCEIRO_SEED_PATH || path.join(root, "seed-from-workbook.json"));
const defaultAttachmentsDir = path.resolve(process.env.FINANCEIRO_ATTACHMENTS_DIR || path.join(dataRoot, "uploads", "attachments"));
const defaultInstallPassword = String(process.env.FINANCEIRO_DEFAULT_PASSWORD || "").trim();
const runtimeConfigPath = path.join(dataRoot, "runtime-config.json");
const instancesRoot = path.join(dataRoot, "instances");
const instancesRegistryPath = path.join(dataRoot, "instances.json");
const defaultPorts = { apiPort: 6397, clientPort: 5179 };
const upload = multer({ storage: multer.memoryStorage() });
const app = express();
const rootDb = new Database(dbPath);
const instanceContext = new AsyncLocalStorage();
const dbPool = new Map([["admin", rootDb]]);
const db = new Proxy({}, {
  get(_target, prop) {
    const currentDb = instanceContext.getStore()?.db || rootDb;
    const value = currentDb[prop];
    return typeof value === "function" ? value.bind(currentDb) : value;
  },
});
const sessions = new Map();
const loginAttempts = new Map();
const telegramState = {
  timer: null,
  alertTimer: null,
  offset: 0,
  polling: false,
  drafts: new Map(),
  flows: new Map(),
};

function loadRuntimeConfig() {
  try {
    return JSON.parse(fs.readFileSync(runtimeConfigPath, "utf8"));
  } catch {
    return {};
  }
}

function writeRuntimeConfig(config) {
  fs.writeFileSync(runtimeConfigPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function slugifyInstanceName(name) {
  return normalizeText(name).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "instancia";
}

function getCurrentInstanceId() {
  return instanceContext.getStore()?.instanceId || "admin";
}

function instanceDir(instanceId) {
  if (instanceId === "admin") return dataRoot;
  return path.join(instancesRoot, instanceId);
}

function instanceDbPath(instanceId) {
  return instanceId === "admin" ? dbPath : path.join(instanceDir(instanceId), "financeiro.sqlite");
}

function defaultAttachmentsDirForInstance(instanceId = getCurrentInstanceId()) {
  return instanceId === "admin" ? defaultAttachmentsDir : path.join(instanceDir(instanceId), "uploads", "attachments");
}

function loadInstances() {
  try {
    const parsed = JSON.parse(fs.readFileSync(instancesRegistryPath, "utf8"));
    if (Array.isArray(parsed.instances)) return parsed.instances;
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // The registry is created lazily to preserve existing installations.
  }
  return [];
}

function saveInstances(instances) {
  fs.mkdirSync(path.dirname(instancesRegistryPath), { recursive: true });
  fs.writeFileSync(instancesRegistryPath, `${JSON.stringify({ instances }, null, 2)}\n`, "utf8");
}

function ensureInstancesRegistry() {
  const instances = loadInstances();
  if (instances.some((instance) => instance.id === "admin")) return instances;
  const next = [
    {
      id: "admin",
      name: "Admin",
      role: "admin",
      active: true,
      dbPath,
      dataRoot,
      createdAt: new Date().toISOString(),
    },
    ...instances,
  ];
  saveInstances(next);
  return next;
}

function publicInstances() {
  return ensureInstancesRegistry().map((instance) => ({
    id: instance.id,
    name: instance.name,
    role: instance.role,
    active: instance.active !== false,
    createdAt: instance.createdAt,
  }));
}

function getInstance(instanceId) {
  return ensureInstancesRegistry().find((instance) => instance.id === instanceId && instance.active !== false);
}

function getInstanceDb(instanceId = "admin") {
  const normalized = instanceId || "admin";
  if (dbPool.has(normalized)) return dbPool.get(normalized);
  const targetPath = instanceDbPath(normalized);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const targetDb = new Database(targetPath);
  dbPool.set(normalized, targetDb);
  return targetDb;
}

function runInInstance(instanceId, callback) {
  const instance = getInstance(instanceId);
  if (!instance) throw new Error("Instância inválida ou inativa.");
  return instanceContext.run({ instanceId: instance.id, db: getInstanceDb(instance.id) }, callback);
}

function assertAdminSession(req, res) {
  const session = readSession(req);
  if (!session) {
    res.status(401).json({ error: "Sessão expirada ou não autenticada." });
    return null;
  }
  if (session.instanceId !== "admin") {
    res.status(403).json({ error: "Apenas a instância admin pode gerenciar instâncias." });
    return null;
  }
  return session;
}

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    try {
      const url = new URL(origin);
      const allowed = ["localhost", "127.0.0.1"].includes(url.hostname) || /^192\.168\./.test(url.hostname) || /^10\./.test(url.hostname) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(url.hostname) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(url.hostname);
      return callback(allowed ? null : new Error("Origem não permitida."), allowed);
    } catch {
      return callback(new Error("Origem inválida."), false);
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: "4mb" }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Cache-Control", "no-store");
  next();
});

app.get("/api/auth/status", (req, res) => {
  const session = readSession(req);
  const instance = session ? getInstance(session.instanceId) : null;
  const setupRequired = runInInstance("admin", () => !hasPassword());
  res.json({
    authenticated: Boolean(session && instance),
    setupRequired,
    instances: publicInstances(),
    currentInstance: instance ? { id: instance.id, name: instance.name, role: instance.role } : null,
    user: session && instance ? { name: instance.name, role: instance.role, instanceId: instance.id } : null,
  });
});

app.post("/api/auth/setup", (req, res) => {
  runInInstance("admin", () => {
    if (hasPassword()) return res.status(409).json({ error: "Senha já configurada." });
    const password = String(req.body.password || "");
    const validation = validatePassword(password);
    if (validation) return res.status(400).json({ error: validation });
    setPassword(password);
    auditLog("auth_setup", "auth", "admin");
    createSession(res, "admin");
    res.status(201).json({ ok: true });
  });
});

app.post("/api/auth/login", (req, res) => {
  const instanceId = String(req.body.instanceId || "admin");
  const instance = getInstance(instanceId);
  if (!instance) return res.status(400).json({ error: "Instância inválida ou inativa." });
  runInInstance(instance.id, () => {
    if (!hasPassword()) return res.status(428).json({ error: "Configure a senha inicial." });
    const key = `${req.ip || "local"}:${instance.id}`;
    const attempt = loginAttempts.get(key) || { count: 0, until: 0 };
    if (attempt.until > Date.now()) return res.status(429).json({ error: "Muitas tentativas. Aguarde um pouco." });
    if (!verifyPassword(String(req.body.password || ""))) {
      const count = attempt.count + 1;
      loginAttempts.set(key, { count, until: count >= 5 ? Date.now() + 60_000 : 0 });
      return res.status(401).json({ error: "Senha inválida." });
    }
    loginAttempts.delete(key);
    createSession(res, instance.id);
    res.json({ ok: true });
  });
});

app.post("/api/auth/logout", (req, res) => {
  const token = unpackSession(getCookie(req, "financeiro_session"));
  if (token) sessions.delete(token);
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.put("/api/auth/password", (req, res) => {
  const session = readSession(req);
  if (!session) return res.status(401).json({ error: "Sessao expirada ou nao autenticada." });
  runInInstance(session.instanceId, () => {
    if (!hasPassword()) return res.status(428).json({ error: "Configure a senha inicial." });
    const currentPassword = String(req.body.currentPassword || "");
    const nextPassword = String(req.body.nextPassword || "");
    if (!verifyPassword(currentPassword)) return res.status(401).json({ error: "Senha atual invalida." });
    const validation = validatePassword(nextPassword);
    if (validation) return res.status(400).json({ error: validation });
    setPassword(nextPassword);
    auditLog("password_changed", "auth", session.instanceId);
    for (const [token, activeSession] of sessions.entries()) {
      if (activeSession.instanceId === session.instanceId) sessions.delete(token);
    }
    createSession(res, session.instanceId);
    res.json({ ok: true });
  });
});

app.use((req, res, next) => {
  if (!req.path.startsWith("/api/")) return next();
  if (req.path === "/api/health") return next();
  if (req.path.startsWith("/api/auth/")) return next();
  const session = readSession(req);
  if (!session) return res.status(401).json({ error: "Sessão expirada ou não autenticada." });
  const instance = getInstance(session.instanceId);
  if (!instance) return res.status(401).json({ error: "Instância inativa ou não encontrada." });
  instanceContext.run({ instanceId: instance.id, db: getInstanceDb(instance.id) }, () => {
    if (!hasPassword()) return res.status(428).json({ error: "Configure a senha inicial." });
    next();
  });
});

app.get("/api/attachments/:storedName", (req, res) => {
  const attachment = one("SELECT * FROM attachments WHERE stored_name=?", [req.params.storedName]);
  if (!attachment) return res.status(404).send("Anexo não encontrado.");
  const filePath = path.join(getAttachmentsDir(), attachment.stored_name);
  if (!fs.existsSync(filePath)) return res.status(404).send("Arquivo não encontrado.");
  res.type(attachment.mime_type || "application/octet-stream");
  res.sendFile(filePath);
});

function initDb(targetDb = db) {
  targetDb.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL,
      show_on_dashboard INTEGER NOT NULL DEFAULT 0,
      dashboard_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS subcategories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      category_id INTEGER NOT NULL REFERENCES categories(id)
    );
    CREATE TABLE IF NOT EXISTS institutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('Conta','Cartão')),
      opening_balance REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      institution_id INTEGER REFERENCES institutions(id),
      status TEXT NOT NULL DEFAULT 'Previsto',
      note TEXT,
      subcategory_id INTEGER REFERENCES subcategories(id),
      category_id INTEGER REFERENCES categories(id),
      result TEXT,
      signed_amount REAL NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'manual',
      forecast_type TEXT,
      fitid TEXT,
      transfer_group_id TEXT,
      subscription_id INTEGER REFERENCES subscriptions(id),
      installment_group_id TEXT,
      installment_number INTEGER,
      installment_total INTEGER,
      settled_at TEXT,
      settlement_type TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS installment_groups (
      id TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      principal_total REAL NOT NULL DEFAULT 0,
      installment_amount REAL NOT NULL DEFAULT 0,
      installments_count INTEGER NOT NULL DEFAULT 1,
      interest_total REAL NOT NULL DEFAULT 0,
      institution_id INTEGER REFERENCES institutions(id),
      subcategory_id INTEGER REFERENCES subcategories(id),
      first_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Aberto',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS ofx_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      institution_id INTEGER REFERENCES institutions(id),
      filename TEXT NOT NULL,
      file_hash TEXT NOT NULL UNIQUE,
      period_start TEXT,
      period_end TEXT,
      transactions_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS card_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paid_at TEXT NOT NULL,
      card_id INTEGER REFERENCES institutions(id),
      account_id INTEGER REFERENCES institutions(id),
      period_month INTEGER NOT NULL,
      period_year INTEGER NOT NULL,
      amount REAL NOT NULL,
      transaction_id INTEGER REFERENCES transactions(id)
    );
    CREATE TABLE IF NOT EXISTS rule_map (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern TEXT UNIQUE NOT NULL,
      subcategory_id INTEGER REFERENCES subcategories(id),
      priority INTEGER NOT NULL DEFAULT 50
    );
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category_id INTEGER REFERENCES categories(id),
      subcategory_id INTEGER REFERENCES subcategories(id),
      institution_id INTEGER REFERENCES institutions(id),
      billing_cycle TEXT NOT NULL CHECK(billing_cycle IN ('Mensal','Anual')),
      amount REAL NOT NULL,
      renewal_date TEXT,
      next_due_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Ativa',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      category_id INTEGER REFERENCES categories(id),
      subcategory_id INTEGER REFERENCES subcategories(id),
      status TEXT NOT NULL DEFAULT 'Ativo',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER REFERENCES transactions(id),
      installment_group_id TEXT REFERENCES installment_groups(id),
      subscription_id INTEGER REFERENCES subscriptions(id),
      kind TEXT NOT NULL DEFAULT 'file',
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      instance_id TEXT,
      action TEXT NOT NULL,
      entity TEXT,
      entity_id TEXT,
      details TEXT
    );
  `);
  fs.mkdirSync(getAttachmentsDir(), { recursive: true });
  migrateColumn("categories", "show_on_dashboard", "INTEGER NOT NULL DEFAULT 0", targetDb);
  migrateColumn("categories", "dashboard_order", "INTEGER NOT NULL DEFAULT 0", targetDb);
  migrateColumn("transactions", "forecast_type", "TEXT", targetDb);
  migrateColumn("transactions", "subscription_id", "INTEGER REFERENCES subscriptions(id)", targetDb);
  migrateColumn("transactions", "installment_number", "INTEGER", targetDb);
  migrateColumn("transactions", "installment_total", "INTEGER", targetDb);
  migrateColumn("transactions", "settled_at", "TEXT", targetDb);
  migrateColumn("transactions", "settlement_type", "TEXT", targetDb);
  migrateColumn("budgets", "category_id", "INTEGER REFERENCES categories(id)", targetDb);
  migrateColumn("budgets", "subcategory_id", "INTEGER REFERENCES subcategories(id)", targetDb);
  migrateColumn("budgets", "status", "TEXT NOT NULL DEFAULT 'Ativo'", targetDb);
}

const one = (sql, params = []) => db.prepare(sql).get(params);
const all = (sql, params = []) => db.prepare(sql).all(params);

function migrateColumn(table, column, definition, targetDb = db) {
  const exists = targetDb.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
  if (!exists) targetDb.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function getSetting(key, fallback = "") {
  try {
    return one("SELECT value FROM app_settings WHERE key=?", [key])?.value || fallback;
  } catch {
    return fallback;
  }
}

function setSetting(key, value) {
  db.prepare("INSERT INTO app_settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, value);
}

function getRootSetting(key, fallback = "") {
  try {
    return rootDb.prepare("SELECT value FROM app_settings WHERE key=?").get(key)?.value || fallback;
  } catch {
    return fallback;
  }
}

function setRootSetting(key, value) {
  rootDb.prepare("INSERT INTO app_settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, value);
}

function getTelegramConfig() {
  try {
    return {
      enabled: false,
      token: "",
      links: {},
      bindings: {},
      ...(JSON.parse(getRootSetting("telegramConfig", "{}") || "{}")),
    };
  } catch {
    return { enabled: false, token: "", links: {}, bindings: {} };
  }
}

function saveTelegramConfig(config) {
  setRootSetting("telegramConfig", JSON.stringify({
    enabled: Boolean(config.enabled),
    token: String(config.token || ""),
    links: config.links || {},
    bindings: config.bindings || {},
  }));
}

function defaultTelegramAlerts() {
  return [
    {
      id: "daily-summary",
      title: "Resumo diário",
      type: "daily-summary",
      enabled: false,
      message: "Resumo financeiro do dia",
      schedule: { mode: "daily", time: "08:00", days: [1, 2, 3, 4, 5, 6, 0], every: 1, unit: "days" },
      lastSentAt: "",
    },
    {
      id: "budget-risk",
      title: "Orçamento em risco",
      type: "budget-risk",
      enabled: false,
      message: "Orçamentos acima do limite configurado",
      schedule: { mode: "daily", time: "09:00", days: [1, 2, 3, 4, 5, 6, 0], every: 1, unit: "days" },
      lastSentAt: "",
    },
    {
      id: "pending-forecast",
      title: "Previstos pendentes",
      type: "pending-forecast",
      enabled: false,
      message: "Lançamentos previstos aguardando realização",
      schedule: { mode: "daily", time: "18:00", days: [1, 2, 3, 4, 5], every: 1, unit: "days" },
      lastSentAt: "",
    },
    {
      id: "monthly-bills",
      title: "Faturas do mês",
      type: "monthly-bills",
      enabled: false,
      message: "Resumo das faturas lançadas no mês",
      schedule: { mode: "weekly", time: "08:30", days: [1], every: 1, unit: "weeks" },
      lastSentAt: "",
    },
    {
      id: "weekly-close",
      title: "Fechamento semanal",
      type: "weekly-close",
      enabled: false,
      message: "Fechamento financeiro da semana",
      schedule: { mode: "weekly", time: "19:00", days: [5], every: 1, unit: "weeks" },
      lastSentAt: "",
    },
  ];
}

function getTelegramAlertsConfig() {
  try {
    const saved = JSON.parse(getSetting("telegramAlerts", "{}") || "{}");
    const presets = defaultTelegramAlerts();
    const savedAlerts = Array.isArray(saved.alerts) ? saved.alerts : [];
    const byId = new Map(savedAlerts.map((alert) => [alert.id, alert]));
    const mergedPresets = presets.map((preset) => ({ ...preset, ...(byId.get(preset.id) || {}) }));
    const custom = savedAlerts.filter((alert) => !presets.some((preset) => preset.id === alert.id));
    return {
      alerts: [...mergedPresets, ...custom].map(normalizeTelegramAlert),
      queries: (Array.isArray(saved.queries) ? saved.queries : defaultTelegramQueries()).map(normalizeTelegramQuery),
    };
  } catch {
    return { alerts: defaultTelegramAlerts(), queries: defaultTelegramQueries() };
  }
}

function setTelegramAlertsConfig(config) {
  setSetting("telegramAlerts", JSON.stringify({
    alerts: (config.alerts || []).map(normalizeTelegramAlert),
    queries: (config.queries || defaultTelegramQueries()).map(normalizeTelegramQuery),
  }));
}

function normalizeTelegramAlert(alert = {}) {
  const schedule = alert.schedule || {};
  const mode = ["interval", "daily", "weekly"].includes(schedule.mode) ? schedule.mode : "daily";
  const media = alert.media && alert.media.storedName
    ? {
        kind: ["image", "gif", "audio"].includes(alert.media.kind) ? alert.media.kind : "image",
        originalName: String(alert.media.originalName || "midia").slice(0, 160),
        storedName: path.basename(String(alert.media.storedName || "")),
        mimeType: String(alert.media.mimeType || "application/octet-stream").slice(0, 120),
        size: Number(alert.media.size || 0),
      }
    : null;
  return {
    id: String(alert.id || crypto.randomUUID()),
    title: String(alert.title || "Alerta Telegram").slice(0, 80),
    type: String(alert.type || "daily-summary"),
    enabled: Boolean(alert.enabled),
    message: String(alert.message || "").slice(0, 240),
    schedule: {
      mode,
      every: Math.max(1, Number(schedule.every || 1)),
      unit: ["minutes", "hours", "days", "weeks"].includes(schedule.unit) ? schedule.unit : "days",
      time: /^\d{2}:\d{2}$/.test(String(schedule.time || "")) ? schedule.time : "08:00",
      days: Array.isArray(schedule.days) ? schedule.days.map(Number).filter((day) => day >= 0 && day <= 6) : [1, 2, 3, 4, 5, 6, 0],
    },
    lastSentAt: String(alert.lastSentAt || ""),
    media,
  };
}

function defaultTelegramQueries() {
  return [
    { command: "/resumo", title: "Resumo do mês", type: "summary", enabled: true },
    { command: "/orcamentos", title: "Orçamentos ativos", type: "budgets", enabled: true },
    { command: "/previstos", title: "Previstos pendentes", type: "forecast", enabled: true },
    { command: "/faturas", title: "Faturas do mês", type: "bills", enabled: true },
    { command: "/top", title: "Top categorias", type: "top-categories", enabled: true },
  ];
}

function normalizeTelegramQuery(query = {}) {
  const command = String(query.command || "/consulta").trim().replace(/\s+/g, "-");
  return {
    command: command.startsWith("/") ? command : `/${command}`,
    title: String(query.title || "Consulta").slice(0, 80),
    type: ["summary", "budgets", "forecast", "bills", "top-categories", "custom-message"].includes(query.type) ? query.type : "summary",
    enabled: query.enabled !== false,
    customMessage: String(query.customMessage || "").slice(0, 1200),
    mentionUser: Boolean(query.mentionUser),
  };
}

function getCookie(req, name) {
  const cookies = String(req.headers.cookie || "").split(";").map((part) => part.trim());
  const pair = cookies.find((part) => part.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : "";
}

function getSecret() {
  let secret = rootDb.prepare("SELECT value FROM app_settings WHERE key=?").get("sessionSecret")?.value || "";
  if (!secret) {
    secret = crypto.randomBytes(32).toString("hex");
    rootDb.prepare("INSERT INTO app_settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run("sessionSecret", secret);
  }
  return secret;
}

function signToken(token) {
  return crypto.createHmac("sha256", getSecret()).update(token).digest("hex");
}

function packSession(token) {
  return `${token}.${signToken(token)}`;
}

function unpackSession(value) {
  const [token, signature] = String(value || "").split(".");
  if (!token || !signature) return "";
  const expected = signToken(token);
  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return "";
  } catch {
    return "";
  }
  return token;
}

function hasPassword() {
  return Boolean(getSetting("authPasswordHash", ""));
}

function validatePassword(password) {
  if (password.length < 8) return "Use uma senha com pelo menos 8 caracteres.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Use letras e números na senha.";
  return "";
}

function setPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 210_000, 32, "sha256").toString("hex");
  setSetting("authPasswordHash", `${salt}:${hash}`);
}

function ensureDefaultInstallPassword() {
  if (!defaultInstallPassword || hasPassword()) return;
  setPassword(defaultInstallPassword);
  setSetting("defaultInstallPasswordAppliedAt", new Date().toISOString());
  console.log("Senha inicial aplicada pelo instalador. Altere em Avancado > Seguranca.");
}

function verifyPassword(password) {
  const stored = getSetting("authPasswordHash", "");
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const test = crypto.pbkdf2Sync(password, salt, 210_000, 32, "sha256").toString("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(test, "hex"));
  } catch {
    return false;
  }
}

function createSession(res, instanceId = "admin") {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + 1000 * 60 * 60 * 12;
  sessions.set(token, { expiresAt, instanceId });
  res.cookie("financeiro_session", packSession(token), {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 1000 * 60 * 60 * 12,
    path: "/",
  });
}

function clearSessionCookie(res) {
  res.cookie("financeiro_session", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 0,
    path: "/",
  });
}

function readSession(req) {
  const token = unpackSession(getCookie(req, "financeiro_session"));
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function getAttachmentsDir() {
  const configured = getSetting("attachmentsDir", "");
  return configured ? path.resolve(configured) : defaultAttachmentsDirForInstance();
}

function getTelegramMediaDir() {
  return path.join(instanceDir(getCurrentInstanceId()), "telegram-media");
}

function auditLog(action, entity = "", entityId = "", details = {}) {
  try {
    db.prepare(`
      INSERT INTO audit_logs(created_at, instance_id, action, entity, entity_id, details)
      VALUES (?,?,?,?,?,?)
    `).run(new Date().toISOString(), getCurrentInstanceId(), action, entity, String(entityId || ""), JSON.stringify(details || {}));
  } catch (error) {
    console.warn("Auditoria:", error.message);
  }
}

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function dirStats(dir) {
  const stats = { files: 0, bytes: 0 };
  if (!dir || !fs.existsSync(dir)) return stats;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const child = dirStats(target);
      stats.files += child.files;
      stats.bytes += child.bytes;
    } else if (entry.isFile()) {
      stats.files++;
      stats.bytes += fs.statSync(target).size;
    }
  }
  return stats;
}

function addDirToZip(zip, sourceDir, zipDir) {
  if (!fs.existsSync(sourceDir)) return;
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const source = path.join(sourceDir, entry.name);
    const target = `${zipDir}/${entry.name}`.replace(/\\/g, "/");
    if (entry.isDirectory()) addDirToZip(zip, source, target);
    else if (entry.isFile()) zip.addLocalFile(source, path.posix.dirname(target), path.posix.basename(target));
  }
}

function copyDirContents(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) return { files: 0, bytes: 0 };
  fs.mkdirSync(targetDir, { recursive: true });
  const copied = { files: 0, bytes: 0 };
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const source = path.join(sourceDir, entry.name);
    const target = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      const child = copyDirContents(source, target);
      copied.files += child.files;
      copied.bytes += child.bytes;
    } else if (entry.isFile()) {
      fs.copyFileSync(source, target);
      const size = fs.statSync(source).size;
      copied.files++;
      copied.bytes += size;
    }
  }
  return copied;
}

function telegramMediaPath(media) {
  if (!media?.storedName) return "";
  return path.join(getTelegramMediaDir(), path.basename(media.storedName));
}

function normalizePort(value, fallback) {
  const port = Number(value || fallback);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("Use portas entre 1024 e 65535.");
  }
  return port;
}

function normalizePorts(value = {}) {
  const runtime = loadRuntimeConfig();
  const savedApiPort = getSetting("apiPort", "") || runtime.apiPort;
  const savedClientPort = getSetting("clientPort", "") || runtime.clientPort;
  const apiPort = normalizePort(value.apiPort ?? savedApiPort, defaultPorts.apiPort);
  const clientPort = normalizePort(value.clientPort ?? savedClientPort, defaultPorts.clientPort);
  if (apiPort === clientPort) throw new Error("A porta da API e a porta da interface precisam ser diferentes.");
  return { apiPort, clientPort };
}

function getAppPorts() {
  const ports = normalizePorts();
  return {
    ...ports,
    activeApiPort,
    restartRequired: ports.apiPort !== activeApiPort,
  };
}

function getBudgetAlertSettings() {
  try {
    const saved = JSON.parse(getSetting("budgetAlerts", "{}") || "{}");
    const levels = Array.isArray(saved.levels) ? saved.levels.map(Number).filter((n) => n > 0 && n <= 100) : [];
    return { levels: [...new Set(levels.length ? levels : [50, 75, 95])].sort((a, b) => a - b) };
  } catch {
    return { levels: [50, 75, 95] };
  }
}

function budgetStatus(spent, amount, settings = getBudgetAlertSettings()) {
  const limit = Math.max(0, Number(amount || 0));
  const used = limit > 0 ? Math.round((Number(spent || 0) / limit) * 10000) / 100 : 0;
  const levels = settings.levels || [50, 75, 95];
  const reached = levels.filter((level) => used >= level).at(-1) || 0;
  const remaining = limit - Number(spent || 0);
  let severity = "ok";
  if (used >= 100) severity = "negative";
  else if (used >= (levels.at(-1) || 95)) severity = "critical";
  else if (used >= (levels[1] || 75)) severity = "warning";
  else if (used >= (levels[0] || 50)) severity = "notice";
  return { used, remaining, reached, severity };
}

function seedDb() {
  const count = one("SELECT COUNT(*) AS total FROM categories").total;
  const defaultAccounts = ["Conta Principal"];
  const addInstitution = db.prepare("INSERT OR IGNORE INTO institutions(name,kind,opening_balance) VALUES (?,?,?)");
  for (const account of defaultAccounts) addInstitution.run(account, "Conta", 0);
  if (count || !seedPath || !fs.existsSync(seedPath)) return;

  const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));
  const addCategory = db.prepare("INSERT OR IGNORE INTO categories(name,type,show_on_dashboard,dashboard_order) VALUES (?,?,?,?)");
  const updateCategory = db.prepare("UPDATE categories SET type=?, show_on_dashboard=?, dashboard_order=? WHERE name=?");
  const addSubcategory = db.prepare("INSERT OR IGNORE INTO subcategories(name,category_id) VALUES (?,?)");
  const addRule = db.prepare("INSERT OR IGNORE INTO rule_map(pattern,subcategory_id,priority) VALUES (?,?,?)");

  const insertSeed = db.transaction(() => {
    for (const c of seed.categories || []) {
      addCategory.run(c.name, c.type, Number(c.showOnDashboard || 0), Number(c.dashboardOrder || 0));
      updateCategory.run(c.type, Number(c.showOnDashboard || 0), Number(c.dashboardOrder || 0), c.name);
    }
    for (const s of seed.subcategories || []) {
      const cat = one("SELECT id FROM categories WHERE name=?", [s.category]);
      if (cat) addSubcategory.run(s.name, cat.id);
    }
    for (const i of seed.institutions || []) addInstitution.run(i.name, i.kind, i.openingBalance || 0);
    for (const r of seed.rules || []) {
      const sub = one("SELECT id FROM subcategories WHERE name=?", [r.subcategory]);
      if (sub) addRule.run(r.pattern, sub.id, r.priority || 50);
    }
    for (const t of seed.transactions || []) createTransaction(t);
  });

  insertSeed();
}

function ensureCoreMappings() {
  const addCategory = db.prepare("INSERT OR IGNORE INTO categories(name,type) VALUES (?,?)");
  const addSubcategory = db.prepare("INSERT OR IGNORE INTO subcategories(name,category_id) VALUES (?,?)");
  const core = [
    ["Envio Transf", "Envio Transf", "Envio para outra conta"],
    ["Receb Transf", "Receb Transf", "Recebimento de outra conta"],
  ];
  for (const [category, type, subcategory] of core) {
    addCategory.run(category, type);
    const cat = one("SELECT id FROM categories WHERE name=?", [category]);
    addSubcategory.run(subcategory, cat.id);
  }
  db.prepare(`
    UPDATE transactions
    SET subcategory_id=(SELECT id FROM subcategories WHERE name=transactions.description),
        category_id=(SELECT s.category_id FROM subcategories s WHERE s.name=transactions.description),
        result=(SELECT c.type FROM subcategories s JOIN categories c ON c.id=s.category_id WHERE s.name=transactions.description),
        signed_amount=CASE
          WHEN (SELECT c.type FROM subcategories s JOIN categories c ON c.id=s.category_id WHERE s.name=transactions.description) IN ('Receita','Receb Transf') THEN amount
          WHEN (SELECT c.type FROM subcategories s JOIN categories c ON c.id=s.category_id WHERE s.name=transactions.description) IN ('Despesa','Envio Transf','Fatura') THEN -amount
          ELSE signed_amount
        END
    WHERE description IN ('Envio para outra conta','Recebimento de outra conta')
  `).run();
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findExistingSubcategory(candidates, expectedResult = "") {
  for (const name of candidates.filter(Boolean)) {
    const row = one(`
      SELECT s.*, c.name category_name, c.type result
      FROM subcategories s
      JOIN categories c ON c.id=s.category_id
      WHERE lower(s.name)=lower(?)
    `, [name]);
    if (row && (!expectedResult || row.result === expectedResult || expectedResult === "Todos")) return row;
  }
  const normalizedCandidates = candidates.map(normalizeText).filter(Boolean);
  if (!normalizedCandidates.length) return null;
  const rows = all(`
    SELECT s.*, c.name category_name, c.type result
    FROM subcategories s
    JOIN categories c ON c.id=s.category_id
  `);
  const compatibleRows = rows.filter((row) => !expectedResult || row.result === expectedResult || expectedResult === "Todos");
  for (const candidate of normalizedCandidates) {
    const exact = compatibleRows.find((row) => normalizeText(row.name) === candidate);
    if (exact) return exact;
  }
  for (const candidate of normalizedCandidates) {
    const contained = compatibleRows.find((row) => {
      const rowName = normalizeText(row.name);
      const haystack = normalizeText(`${row.name} ${row.category_name}`);
      return haystack.includes(candidate) || candidate.includes(rowName);
    });
    if (contained) return contained;
  }
  return null;
}

function ofxMerchantSafe(text) {
  const raw = String(text || "");
  const normalized = normalizeText(raw);
  if (normalized.includes("compra no debito")) {
    const marker = raw.indexOf("-");
    if (marker >= 0) return raw.slice(marker + 1).replace(/\s+\d{3,}.*$/g, "").trim();
  }
  const pix = raw.match(/pix\s*-\s*(.+?)\s*-/i);
  if (pix) return pix[1].trim();
  const transfer = raw.match(/transfer\S*\s+(?:enviada|recebida)(?:\s+pelo\s+pix)?\s*-\s*(.+?)\s*-/i);
  if (transfer) return transfer[1].trim();
  return raw.trim();
}

function classifyOfxTransactionSafe(t) {
  const text = `${t.note || ""} ${t.type || ""}`;
  const normalized = normalizeText(text);
  const amountResult = t.amount >= 0 ? "Receita" : "Despesa";
  const out = {
    context: amountResult === "Receita" ? "Entrada" : "Compra comum",
    confidence: 35,
    reason: "Sem regra contextual forte.",
    suggestedResult: amountResult,
    suggestedCategory: null,
    suggestedSubcategory: null,
    suggestedSubcategoryId: null,
    suggestedCategoryId: null,
    suggestedNewSubcategory: null,
    suggestedNewCategory: null,
    suggestedAction: null,
    suggestedSubscription: null,
    existingSubscriptionId: null,
    apply: false,
  };

  const applySub = (sub, confidence, context, reason) => {
    out.context = context;
    out.confidence = confidence;
    out.reason = reason;
    out.suggestedResult = sub.result;
    out.suggestedCategory = sub.category_name;
    out.suggestedCategoryId = sub.category_id;
    out.suggestedSubcategory = sub.name;
    out.suggestedSubcategoryId = sub.id;
    out.apply = confidence >= 85;
    return out;
  };

  const cls = resolveClassification({ note: t.note, description: t.note, result: amountResult });
  if (cls.subcategoryId) {
    const sub = one(`
      SELECT s.*, c.name category_name, c.type result
      FROM subcategories s JOIN categories c ON c.id=s.category_id
      WHERE s.id=?
    `, [cls.subcategoryId]);
    if (sub) return applySub(sub, 92, "Regra cadastrada", "Encontrado por regra ou nome exato ja cadastrado.");
  }

  if (normalized.includes("pagamento de fatura") || normalized.includes("fatura")) {
    const sub = findExistingSubcategory(["Pagamento de Fatura"], "Fatura") || findExistingSubcategory(["Pagamento de Fatura"], "Despesa");
    if (sub) return applySub(sub, 96, "Fatura", "Texto indica pagamento de fatura.");
    out.context = "Fatura";
    out.confidence = 76;
    out.suggestedNewSubcategory = "Pagamento de Fatura";
    out.suggestedNewCategory = "Pagamento de Fatura";
    out.reason = "Texto indica fatura, mas a subcategoria nao foi encontrada.";
    return out;
  }

  if (normalized.includes("transferencia recebida") || normalized.includes("recebida pelo pix") || normalized.includes("credito em conta")) {
    if (normalized.includes("extorno") || normalized.includes("estorno") || normalized.includes("devolucao")) {
      const sub = findExistingSubcategory(["Extorno"], "Receb Transf") || findExistingSubcategory(["Outras fontes de renda"], "Receita");
      if (sub) return applySub(sub, 88, "Extorno recebido", "Texto indica extorno/devolucao recebido.");
    }
    const recurring = t.amount > 500;
    const candidateNames = normalized.includes("priscila")
      ? ["Salario Priscila", "Salario Conjuge", "Outras fontes de renda", "Recebimento Transferencia"]
      : normalized.includes("rui saulo") || normalized.includes("rui ")
        ? ["Salario Rui", "Salario Principal", "Outras fontes de renda", "Recebimento Transferencia"]
        : recurring
          ? ["Salario Principal", "Outras fontes de renda", "Recebimento Transferencia"]
          : ["Recebimento Transferencia", "Recebimento de outra conta", "Outras fontes de renda"];
    const sub = findExistingSubcategory(candidateNames, "");
    if (sub) return applySub(sub, recurring ? 78 : 70, recurring ? "Receita recorrente provavel" : "Entrada/receita por transferencia", "Entrada por PIX/TED/DOC ou credito em conta; entra como receita, mas pode precisar confirmacao fina.");
  }

  if (normalized.includes("transferencia enviada") || normalized.includes("enviada pelo pix")) {
    const sub = findExistingSubcategory(["Envio para outra conta"], "Envio Transf");
    if (sub) return applySub(sub, 88, "Saida por transferencia", "PIX/TED/DOC enviado para conta nao cadastrada; tratado como saida/despesa operacional.");
  }

  const keywordGroups = [
    { words: ["bahamas", "supermercado", "mercado", "grocery"], subcategories: ["Supermercado"], category: "Alimentacao", context: "Compra comum", confidence: 88 },
    { words: ["acougue"], subcategories: ["Acougue"], category: "Alimentacao", context: "Compra comum", confidence: 91 },
    { words: ["drogaria", "farmacia"], subcategories: ["Farmacia", "Medicamentos Farmacia"], category: "Saude", context: "Compra comum", confidence: 91 },
    { words: ["uber"], subcategories: ["Uber"], category: "Transporte", context: "Compra comum", confidence: 90 },
    { words: ["taxi"], subcategories: ["Taxi"], category: "Transporte", context: "Compra comum", confidence: 86 },
    { words: ["posto", "shell", "ipiranga", "combustivel"], subcategories: ["Combustivel"], category: "Transporte", context: "Compra comum", confidence: 86 },
    { words: ["nic br", "registro br", "dominio"], subcategories: ["Despesas da Empresa", "Outros Empresa"], category: "Empresa", context: "Compra comum", confidence: 72 },
    { words: ["cacau show"], subcategories: ["Presentes", "Lanches Snacks", "Outros Alimentacao"], category: "Diversos", context: "Compra ambigua", confidence: 62 },
  ];

  const subscriptionVendors = [
    { words: ["netflix"], name: "Netflix" },
    { words: ["amazon prime", "prime video", "primevideo"], name: "Amazon Prime" },
    { words: ["spotify"], name: "Spotify" },
    { words: ["disney plus", "disney"], name: "Disney+" },
    { words: ["max com", "hbo max"], name: "Max" },
    { words: ["globoplay"], name: "Globoplay" },
    { words: ["apple com bill", "apple"], name: "Apple" },
    { words: ["google", "youtube"], name: "Google/YouTube" },
    { words: ["xbox", "game pass"], name: "Xbox/Game Pass" },
  ];

  for (const vendor of subscriptionVendors) {
    if (!vendor.words.some((word) => normalized.includes(normalizeText(word)))) continue;
    const sub = findExistingSubcategory(["Apps Netflix Spotify Xbox"], "Despesa");
    const existing = one("SELECT id, name, status FROM subscriptions WHERE lower(name)=lower(?) AND status<>'Cancelada'", [vendor.name]);
    if (sub) {
      applySub(sub, 90, "Assinatura", `${vendor.name} parece ser cobranca de assinatura.`);
      out.suggestedSubscription = vendor.name;
      out.existingSubscriptionId = existing?.id ?? null;
      out.suggestedAction = existing ? "Vincular assinatura existente" : "Sugerir criacao de assinatura";
      return out;
    }
    out.context = "Assinatura";
    out.confidence = 82;
    out.suggestedNewSubcategory = vendor.name;
    out.suggestedNewCategory = "Streams / Games";
    out.suggestedSubscription = vendor.name;
    out.existingSubscriptionId = existing?.id ?? null;
    out.suggestedAction = existing ? "Vincular assinatura existente" : "Sugerir criacao de assinatura";
    out.reason = `${vendor.name} parece ser cobranca recorrente de assinatura.`;
    return out;
  }

  for (const group of keywordGroups) {
    if (!group.words.some((word) => normalized.includes(normalizeText(word)))) continue;
    const sub = findExistingSubcategory(group.subcategories, amountResult);
    if (sub) return applySub(sub, group.confidence, group.context, `Palavra-chave contextual: ${group.words[0]}.`);
    out.context = group.context;
    out.confidence = Math.min(group.confidence, 74);
    out.suggestedNewSubcategory = group.subcategories[0];
    out.suggestedNewCategory = group.category;
    out.reason = "Ha contexto, mas nao encontrei subcategoria compativel cadastrada.";
    return out;
  }

  const merchant = ofxMerchantSafe(text);
  if (merchant && normalizeText(merchant) !== normalized) {
    out.suggestedNewSubcategory = merchant.slice(0, 80);
    out.suggestedNewCategory = amountResult === "Receita" ? "Renda Extra" : "Diversos";
    out.reason = "Sugestao derivada do favorecido/estabelecimento do OFX, aguardando confirmacao.";
  }

  return out;
}

function ofxTransactionKey(t, index) {
  return t.fitid || `${t.date}:${t.amount}:${normalizeText(t.note).slice(0, 80)}:${index}`;
}

function ofxNaturalKey(t) {
  return {
    date: t.date,
    amount: Math.abs(Number(t.amount || 0)),
    note: normalizeText(t.note || t.type || ""),
  };
}

function findExistingOfxTransaction(t, institutionId) {
  if (t.fitid) {
    const byFitid = one(
      "SELECT id FROM transactions WHERE institution_id=? AND fitid=?",
      [institutionId, t.fitid],
    );
    if (byFitid) return byFitid;
  }

  const natural = ofxNaturalKey(t);
  const sameDay = all(`
    SELECT id, note, description
    FROM transactions
    WHERE institution_id=?
      AND date=?
      AND abs(amount - ?) < 0.005
      AND source='ofx'
  `, [institutionId, natural.date, natural.amount]);

  return sameDay.find((row) => normalizeText(row.note || row.description || "") === natural.note) || null;
}

function ofxSubcategoryOptions(t, suggestion) {
  const expectedResult = suggestion.suggestedResult || (t.amount >= 0 ? "Receita" : "Despesa");
  const normalizedText = normalizeText(`${t.note || ""} ${t.type || ""} ${suggestion.suggestedNewSubcategory || ""}`);
  const tokens = normalizedText.split(" ").filter((token) => token.length >= 3 && !["com", "para", "pelo", "pela", "conta", "agencia", "transferencia", "enviada", "recebida"].includes(token));
  const rows = all(`
    SELECT s.id, s.name, c.name category, c.type result
    FROM subcategories s
    JOIN categories c ON c.id=s.category_id
  `);
  const scored = rows.map((row) => {
    const haystack = normalizeText(`${row.name} ${row.category}`);
    const tokenScore = tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 8 : 0), 0);
    const resultScore = row.result === expectedResult ? 20 : 0;
    const suggestedScore = suggestion.suggestedSubcategoryId === row.id ? 80 : 0;
    const categoryScore = suggestion.suggestedCategory && normalizeText(row.category) === normalizeText(suggestion.suggestedCategory) ? 12 : 0;
    return { ...row, score: suggestedScore + resultScore + categoryScore + tokenScore };
  }).filter((row) => row.score > 0);

  const seen = new Set();
  const options = scored
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "pt-BR"))
    .filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    })
    .slice(0, 3)
    .map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      result: row.result,
      confidence: Math.min(99, Math.max(45, row.score)),
    }));
  if (options.length >= 3) return options;

  const fallbackRows = rows
    .filter((row) => row.result === expectedResult && !seen.has(row.id))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, 3 - options.length)
    .map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      result: row.result,
      confidence: 45,
    }));
  return [...options, ...fallbackRows];
}

function resolveClassification(input) {
  let sub = input.subcategoryId
    ? one("SELECT s.*, c.name category_name, c.type result FROM subcategories s JOIN categories c ON c.id=s.category_id WHERE s.id=?", [input.subcategoryId])
    : input.subcategory
    ? one("SELECT s.*, c.name category_name, c.type result FROM subcategories s JOIN categories c ON c.id=s.category_id WHERE s.name=?", [input.subcategory])
    : null;

  if (!sub && input.description) {
    sub = one("SELECT s.*, c.name category_name, c.type result FROM subcategories s JOIN categories c ON c.id=s.category_id WHERE lower(s.name)=lower(?)", [input.description]);
  }

  if (!sub && input.note) {
    const rules = all("SELECT r.pattern, s.*, c.name category_name, c.type result FROM rule_map r JOIN subcategories s ON s.id=r.subcategory_id JOIN categories c ON c.id=s.category_id ORDER BY r.priority ASC");
    sub = rules.find((r) => input.note.toLowerCase().includes(r.pattern.toLowerCase())) || null;
  }

  if (!sub && input.categoryId) {
    const cat = one("SELECT id category_id, name category_name, type result FROM categories WHERE id=?", [input.categoryId]);
    if (cat) {
      return {
        subcategoryId: null,
        categoryId: cat.category_id,
        category: cat.category_name,
        result: cat.result,
      };
    }
  }

  return {
    subcategoryId: sub?.id ?? null,
    categoryId: sub?.category_id ?? null,
    category: sub?.category_name ?? input.category ?? null,
    result: sub?.result ?? input.result ?? null,
  };
}

function signedAmount(amount, result) {
  if (result === "Receita" || result === "Receb Transf") return Math.abs(amount);
  if (result === "Despesa" || result === "Envio Transf" || result === "Fatura") return -Math.abs(amount);
  return 0;
}

function boolInt(value) {
  return value === true || value === 1 || value === "1" || value === "true" || value === "on" ? 1 : 0;
}

function createTransaction(input) {
  const institution = input.institution
    ? one("SELECT id FROM institutions WHERE name=?", [input.institution])
    : input.institutionId
      ? { id: input.institutionId }
      : null;
  const cls = resolveClassification(input);
  const result = input.result || cls.result;
  const amount = Number(input.amount || 0);

  const stmt = db.prepare(`
    INSERT INTO transactions(date, description, amount, institution_id, status, note, subcategory_id, category_id, result, signed_amount, source, forecast_type, fitid, transfer_group_id, subscription_id, installment_group_id, installment_number, installment_total, settled_at, settlement_type)
    VALUES (@date, @description, @amount, @institutionId, @status, @note, @subcategoryId, @categoryId, @result, @signedAmount, @source, @forecastType, @fitid, @transferGroupId, @subscriptionId, @installmentGroupId, @installmentNumber, @installmentTotal, @settledAt, @settlementType)
  `);
  const info = stmt.run({
    date: normalizeDate(input.date),
    description: input.description || input.subcategory || "Lançamento",
    amount: Math.abs(amount),
    institutionId: institution?.id ?? null,
    status: input.status || "Previsto",
    note: input.note || "",
    subcategoryId: cls.subcategoryId,
    categoryId: cls.categoryId,
    result,
    signedAmount: signedAmount(amount, result),
    source: input.source || "manual",
    forecastType: input.forecastType || null,
    fitid: input.fitid || null,
    transferGroupId: input.transferGroupId || null,
    subscriptionId: input.subscriptionId || null,
    installmentGroupId: input.installmentGroupId || null,
    installmentNumber: input.installmentNumber || null,
    installmentTotal: input.installmentTotal || null,
    settledAt: input.settledAt || null,
    settlementType: input.settlementType || null,
  });
  return info.lastInsertRowid;
}

function normalizeDate(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return new Date(s).toISOString().slice(0, 10);
}

function addMonths(date, months) {
  const d = new Date(`${normalizeDate(date)}T12:00:00`);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() !== day) d.setDate(0);
  return d.toISOString().slice(0, 10);
}

function periodEndFromQuery(query = {}) {
  const year = Number(query.year || 0);
  const month = Number(query.month || 0);
  const day = Number(query.day || 0);
  if (year && month && day) return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (year && month) return new Date(year, month, 0).toISOString().slice(0, 10);
  if (year) return `${year}-12-31`;
  return new Date().toISOString().slice(0, 10);
}

function subscriptionCycleMonths(subscription) {
  return subscription.billing_cycle === "Anual" ? 12 : 1;
}

function subscriptionForecastType(subscription) {
  return subscription.billing_cycle === "Anual" ? "Assinatura anual" : "Assinatura mensal";
}

function subscriptionForecastNote(subscription, dueDate) {
  if (subscription.billing_cycle === "Anual") {
    return subscription.renewal_date
      ? `Assinatura anual. Renovação: ${subscription.renewal_date}`
      : `Assinatura anual. Cobrança: ${dueDate}`;
  }
  return `Assinatura mensal. Cobrança: ${dueDate}`;
}

function hasSubscriptionTransaction(subscription, dueDate) {
  return Boolean(one(`
    SELECT id
    FROM transactions
    WHERE source='subscription'
      AND date=?
      AND (
        subscription_id=?
        OR (subscription_id IS NULL AND lower(description)=lower(?))
      )
  `, [dueDate, subscription.id, subscription.name]));
}

function ensureSubscriptionForecasts(query = {}) {
  const throughDate = periodEndFromQuery(query);
  const rows = all("SELECT * FROM subscriptions WHERE status='Ativa' ORDER BY next_due_date, id");
  if (!rows.length) return { generated: 0, throughDate };

  let generated = 0;
  const run = db.transaction(() => {
    for (const subscription of rows) {
      let dueDate = normalizeDate(subscription.next_due_date || subscription.renewal_date || new Date());
      const cycleMonths = subscriptionCycleMonths(subscription);
      let guard = 0;

      while (dueDate <= throughDate && guard < 240) {
        if (!hasSubscriptionTransaction(subscription, dueDate)) {
          createTransaction({
            date: dueDate,
            description: subscription.name,
            amount: subscription.amount,
            institutionId: subscription.institution_id,
            status: "Previsto",
            note: subscriptionForecastNote(subscription, dueDate),
            categoryId: subscription.category_id,
            subcategoryId: subscription.subcategory_id,
            result: subscription.category_id ? undefined : "Despesa",
            source: "subscription",
            forecastType: subscriptionForecastType(subscription),
            subscriptionId: subscription.id,
          });
          generated++;
        }
        dueDate = addMonths(dueDate, cycleMonths);
        guard++;
      }

      if (dueDate !== subscription.next_due_date) {
        db.prepare("UPDATE subscriptions SET next_due_date=? WHERE id=?").run(dueDate, subscription.id);
      }
    }
  });
  run();
  return { generated, throughDate };
}

function monthName(date) {
  return new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(new Date(`${date}T12:00:00`)).replace(".", "");
}

function parseOfx(text) {
  const blocks = text.match(/<STMTTRN>[\s\S]*?(?=<STMTTRN>|<\/BANKTRANLIST>|<\/CCSTMTRS>|$)/gi) || [];
  const tag = (block, name) => {
    const m = block.match(new RegExp(`<${name}>([^<\\r\\n]+)`, "i"));
    return m ? m[1].trim() : "";
  };
  return blocks.map((block) => {
    const rawDate = tag(block, "DTPOSTED").slice(0, 8);
    const amount = Number(tag(block, "TRNAMT").replace(",", ".") || 0);
    return {
      date: `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`,
      amount,
      note: tag(block, "MEMO") || tag(block, "NAME"),
      fitid: tag(block, "FITID"),
      type: tag(block, "TRNTYPE"),
    };
  }).filter((t) => t.date.length === 10 && Number.isFinite(t.amount));
}

function decodeOfxBuffer(buffer) {
  const utf8 = buffer.toString("utf8");
  if (!utf8.includes("\uFFFD")) return utf8;
  return buffer.toString("latin1");
}

app.get("/api/health", (req, res) => {
  const session = readSession(req);
  if (!session) return res.json({ ok: true, authenticated: false });
  runInInstance(session.instanceId, () => {
    const instanceId = getCurrentInstanceId();
    const sqlitePath = instanceDbPath(instanceId);
    const attachmentsDir = getAttachmentsDir();
    const telegramDir = getTelegramMediaDir();
    const telegramConfig = getTelegramConfig();
    const bindings = Object.values(telegramConfig.bindings || {}).filter((id) => id === instanceId).length;
    const lastAudit = all("SELECT * FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT 8");
    res.json({
      ok: true,
      authenticated: true,
      instance: getInstance(instanceId),
      sqlite: {
        path: sqlitePath,
        exists: fs.existsSync(sqlitePath),
        bytes: fs.existsSync(sqlitePath) ? fs.statSync(sqlitePath).size : 0,
      },
      dataRoot: instanceDir(instanceId),
      attachments: {
        configuredDir: getSetting("attachmentsDir", ""),
        effectiveDir: attachmentsDir,
        defaultDir: defaultAttachmentsDirForInstance(instanceId),
        ...dirStats(attachmentsDir),
      },
      telegramMedia: {
        dir: telegramDir,
        ...dirStats(telegramDir),
      },
      ports: getAppPorts(),
      telegram: {
        enabled: Boolean(telegramConfig.enabled),
        tokenConfigured: Boolean(telegramConfig.token),
        chatsLinkedToInstance: bindings,
      },
      instances: {
        total: ensureInstancesRegistry().filter((instance) => instance.active !== false).length,
        max: 4,
      },
      counts: tableCounts(db),
      lastAudit,
    });
  });
});

app.get("/api/audit", (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 120), 20), 500);
  res.json(all("SELECT * FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT ?", [limit]));
});

app.get("/api/backup/export", async (req, res) => {
  const session = readSession(req);
  if (!session) return res.status(401).json({ error: "Sessão expirada ou não autenticada." });
  const tempDir = path.join(dataRoot, "tmp-backups", safeTimestamp());
  const zipPath = path.join(tempDir, `financeiro-backup-${safeTimestamp()}.zip`);
  fs.mkdirSync(tempDir, { recursive: true });
  try {
    const zip = new AdmZip();
    const instances = session.instanceId === "admin"
      ? ensureInstancesRegistry().filter((instance) => instance.active !== false)
      : [getInstance(session.instanceId)].filter(Boolean);
    const manifest = {
      createdAt: new Date().toISOString(),
      source: "Financeiro Local",
      version: process.env.npm_package_version || "local",
      mode: session.instanceId === "admin" ? "all-instances" : "current-instance",
      instances: instances.map((instance) => ({ id: instance.id, name: instance.name, role: instance.role })),
    };
    zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest, null, 2), "utf8"));
    if (session.instanceId === "admin" && fs.existsSync(instancesRegistryPath)) zip.addLocalFile(instancesRegistryPath, "", "instances.json");
    if (fs.existsSync(runtimeConfigPath)) zip.addLocalFile(runtimeConfigPath, "", "runtime-config.json");
    for (const instance of instances) {
      const sourceDb = getInstanceDb(instance.id);
      const dbTarget = path.join(tempDir, `${instance.id}.sqlite`);
      await sourceDb.backup(dbTarget);
      zip.addLocalFile(dbTarget, "databases", `${instance.id}.sqlite`);
      addDirToZip(zip, defaultAttachmentsDirForInstance(instance.id), `files/${instance.id}/attachments`);
      addDirToZip(zip, path.join(instanceDir(instance.id), "telegram-media"), `files/${instance.id}/telegram-media`);
    }
    zip.writeZip(zipPath);
    auditLog("backup_export", "backup", "", { instances: instances.map((instance) => instance.id) });
    res.download(zipPath, path.basename(zipPath), (error) => {
      fs.rmSync(tempDir, { recursive: true, force: true });
      if (error) console.warn("Backup download:", error.message);
    });
  } catch (error) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/backup/restore", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Arquivo de backup não enviado." });
  const tempDir = path.join(dataRoot, "tmp-restore", safeTimestamp());
  fs.mkdirSync(tempDir, { recursive: true });
  try {
    const zip = new AdmZip(req.file.buffer);
    zip.extractAllTo(tempDir, true);
    const instanceId = getCurrentInstanceId();
    const dbCandidate = path.join(tempDir, "databases", `${instanceId}.sqlite`);
    const dbFilesDir = path.join(tempDir, "databases");
    const firstDb = fs.existsSync(dbFilesDir)
      ? fs.readdirSync(dbFilesDir).find((file) => file.toLowerCase().endsWith(".sqlite"))
      : "";
    const restoreDbPath = fs.existsSync(dbCandidate) ? dbCandidate : firstDb ? path.join(dbFilesDir, firstDb) : "";
    if (!restoreDbPath) throw new Error("Backup sem banco SQLite restaurável.");
    importSqliteFileToCurrent(restoreDbPath);
    const attachmentsCopied = copyDirContents(path.join(tempDir, "files", instanceId, "attachments"), getAttachmentsDir());
    const telegramCopied = copyDirContents(path.join(tempDir, "files", instanceId, "telegram-media"), getTelegramMediaDir());
    auditLog("backup_restore", "backup", req.file.originalname, { attachmentsCopied, telegramCopied });
    res.json({ ok: true, restoredInstance: instanceId, counts: tableCounts(db), attachmentsCopied, telegramCopied });
  } catch (error) {
    res.status(400).json({ error: error.message });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

app.get("/api/reports/monthly.xlsx", (req, res) => {
  const year = Number(req.query.year || new Date().getFullYear());
  const month = Number(req.query.month || new Date().getMonth() + 1);
  const query = { year, month };
  ensureSubscriptionForecasts(query);
  const period = buildPeriodFilter(query, "t.date");
  const periodPlain = buildPeriodFilter(query, "date");
  const totals = one(`
    SELECT
      COALESCE(SUM(CASE WHEN result='Receita' AND status='Realizado' THEN amount END),0) receitas,
      COALESCE(SUM(CASE WHEN result='Despesa' AND status='Realizado' THEN amount END),0) despesas,
      COALESCE(SUM(CASE WHEN result='Fatura' AND status='Realizado' THEN amount END),0) faturas,
      COALESCE(SUM(CASE WHEN status='Previsto' THEN amount END),0) previstos,
      COALESCE(SUM(CASE WHEN status='Realizado' THEN signed_amount END),0) saldo
    FROM transactions
    ${periodPlain.where}
  `, periodPlain.params);
  const transactions = all(`
    SELECT t.date, t.description, t.amount, t.status, t.result, i.name institution, c.name category, s.name subcategory, t.note
    FROM transactions t
    LEFT JOIN institutions i ON i.id=t.institution_id
    LEFT JOIN categories c ON c.id=t.category_id
    LEFT JOIN subcategories s ON s.id=t.subcategory_id
    ${period.where}
    ORDER BY t.date, t.id
  `, period.params);
  const categories = all(`
    SELECT COALESCE(c.name,'Sem categoria') category, COALESCE(t.result,'') result, SUM(t.amount) total, COUNT(t.id) items
    FROM transactions t LEFT JOIN categories c ON c.id=t.category_id
    WHERE t.status='Realizado' ${period.and}
    GROUP BY c.name, t.result
    ORDER BY total DESC
  `, period.params);
  const subcategories = all(`
    SELECT COALESCE(s.name,'Sem subcategoria') subcategory, COALESCE(c.name,'Sem categoria') category, COALESCE(t.result,'') result, SUM(t.amount) total, COUNT(t.id) items
    FROM transactions t
    LEFT JOIN subcategories s ON s.id=t.subcategory_id
    LEFT JOIN categories c ON c.id=t.category_id
    WHERE t.status='Realizado' ${period.and}
    GROUP BY s.name, c.name, t.result
    ORDER BY total DESC
  `, period.params);
  const missingSubcategory = transactions.filter((row) => !row.subcategory);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ year, month, ...totals }]), "Resumo");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(transactions), "Lancamentos");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(categories), "Categorias");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(subcategories), "Subcategorias");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(budgetRows()), "Orcamentos");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(missingSubcategory), "Sem subcategoria");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  auditLog("report_export", "report", `${year}-${String(month).padStart(2, "0")}`, { rows: transactions.length });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename=financeiro-relatorio-${year}-${String(month).padStart(2, "0")}.xlsx`);
  res.send(buffer);
});

app.get("/api/config", (_req, res) => {
  res.json({
    categories: all("SELECT *, show_on_dashboard showOnDashboard, dashboard_order dashboardOrder FROM categories ORDER BY name"),
    subcategories: all("SELECT s.*, c.name category, c.type result FROM subcategories s JOIN categories c ON c.id=s.category_id ORDER BY s.name"),
    institutions: all("SELECT * FROM institutions ORDER BY kind, name"),
    rules: all("SELECT r.*, s.name subcategory FROM rule_map r LEFT JOIN subcategories s ON s.id=r.subcategory_id ORDER BY priority, pattern"),
    runtime: getAppPorts(),
  });
});

app.post("/api/categories", (req, res) => {
  const { name, type, showOnDashboard = 0, dashboardOrder = 0 } = req.body;
  if (!name || !type) return res.status(400).json({ error: "Nome e tipo são obrigatórios." });
  if (one("SELECT id FROM categories WHERE lower(name)=lower(?)", [String(name).trim()])) {
    return res.status(409).json({ error: "Categoria já existe." });
  }
  const info = db.prepare("INSERT INTO categories(name,type,show_on_dashboard,dashboard_order) VALUES (?,?,?,?)")
    .run(String(name).trim(), String(type).trim(), boolInt(showOnDashboard), Number(dashboardOrder || 0));
  auditLog("category_created", "category", info.lastInsertRowid, { name, type });
  res.status(201).json({ id: info.lastInsertRowid });
});

app.put("/api/categories/:id", (req, res) => {
  const { name, type, showOnDashboard = 0, dashboardOrder = 0 } = req.body;
  const duplicate = one("SELECT id FROM categories WHERE lower(name)=lower(?) AND id<>?", [String(name).trim(), req.params.id]);
  if (duplicate) return res.status(409).json({ error: "Categoria já existe." });
  db.prepare("UPDATE categories SET name=?, type=?, show_on_dashboard=?, dashboard_order=? WHERE id=?")
    .run(String(name).trim(), String(type).trim(), boolInt(showOnDashboard), Number(dashboardOrder || 0), req.params.id);
  auditLog("category_updated", "category", req.params.id, { name, type });
  res.json({ ok: true });
});

app.delete("/api/categories/:id", (req, res) => {
  const used = one("SELECT COUNT(*) total FROM subcategories WHERE category_id=?", [req.params.id]).total;
  if (used) return res.status(409).json({ error: "Categoria possui subcategorias vinculadas." });
  db.prepare("DELETE FROM categories WHERE id=?").run(req.params.id);
  auditLog("category_deleted", "category", req.params.id);
  res.json({ ok: true });
});

app.post("/api/subcategories", (req, res) => {
  const { name, categoryId } = req.body;
  if (!name || !categoryId) return res.status(400).json({ error: "Nome e categoria são obrigatórios." });
  if (one("SELECT id FROM subcategories WHERE lower(name)=lower(?)", [String(name).trim()])) {
    return res.status(409).json({ error: "Subcategoria já existe." });
  }
  const info = db.prepare("INSERT INTO subcategories(name,category_id) VALUES (?,?)").run(String(name).trim(), categoryId);
  auditLog("subcategory_created", "subcategory", info.lastInsertRowid, { name, categoryId });
  res.status(201).json({ id: info.lastInsertRowid });
});

app.put("/api/subcategories/:id", (req, res) => {
  const { name, categoryId } = req.body;
  const duplicate = one("SELECT id FROM subcategories WHERE lower(name)=lower(?) AND id<>?", [String(name).trim(), req.params.id]);
  if (duplicate) return res.status(409).json({ error: "Subcategoria já existe." });
  db.prepare("UPDATE subcategories SET name=?, category_id=? WHERE id=?").run(String(name).trim(), categoryId, req.params.id);
  auditLog("subcategory_updated", "subcategory", req.params.id, { name, categoryId });
  res.json({ ok: true });
});

app.delete("/api/subcategories/:id", (req, res) => {
  const used = one("SELECT COUNT(*) total FROM transactions WHERE subcategory_id=?", [req.params.id]).total;
  if (used) return res.status(409).json({ error: "Subcategoria possui lançamentos vinculados." });
  db.prepare("DELETE FROM subcategories WHERE id=?").run(req.params.id);
  auditLog("subcategory_deleted", "subcategory", req.params.id);
  res.json({ ok: true });
});

app.post("/api/institutions", (req, res) => {
  const { name, kind, openingBalance = 0 } = req.body;
  if (!name || !kind) return res.status(400).json({ error: "Nome e tipo são obrigatórios." });
  if (one("SELECT id FROM institutions WHERE lower(name)=lower(?)", [String(name).trim()])) {
    return res.status(409).json({ error: "Conta/cartão já existe." });
  }
  const info = db.prepare("INSERT INTO institutions(name,kind,opening_balance) VALUES (?,?,?)").run(String(name).trim(), kind, Number(openingBalance || 0));
  auditLog("institution_created", "institution", info.lastInsertRowid, { name, kind });
  res.status(201).json({ id: info.lastInsertRowid });
});

app.put("/api/institutions/:id", (req, res) => {
  const { name, kind, openingBalance = 0 } = req.body;
  const duplicate = one("SELECT id FROM institutions WHERE lower(name)=lower(?) AND id<>?", [String(name).trim(), req.params.id]);
  if (duplicate) return res.status(409).json({ error: "Conta/cartão já existe." });
  db.prepare("UPDATE institutions SET name=?, kind=?, opening_balance=? WHERE id=?").run(String(name).trim(), kind, Number(openingBalance || 0), req.params.id);
  auditLog("institution_updated", "institution", req.params.id, { name, kind });
  res.json({ ok: true });
});

app.delete("/api/institutions/:id", (req, res) => {
  const used = one("SELECT COUNT(*) total FROM transactions WHERE institution_id=?", [req.params.id]).total;
  if (used) return res.status(409).json({ error: "Instituição possui lançamentos vinculados." });
  db.prepare("DELETE FROM institutions WHERE id=?").run(req.params.id);
  auditLog("institution_deleted", "institution", req.params.id);
  res.json({ ok: true });
});

app.post("/api/rules", (req, res) => {
  const { pattern, subcategoryId, priority = 50 } = req.body;
  if (!pattern || !subcategoryId) return res.status(400).json({ error: "Padrão e subcategoria são obrigatórios." });
  if (one("SELECT id FROM rule_map WHERE lower(pattern)=lower(?)", [String(pattern).trim()])) {
    return res.status(409).json({ error: "Regra com esse padrão já existe." });
  }
  const info = db.prepare("INSERT INTO rule_map(pattern,subcategory_id,priority) VALUES (?,?,?)").run(String(pattern).trim(), subcategoryId, Number(priority));
  auditLog("rule_created", "rule", info.lastInsertRowid, { pattern, subcategoryId });
  res.status(201).json({ id: info.lastInsertRowid });
});

app.put("/api/rules/:id", (req, res) => {
  const { pattern, subcategoryId, priority = 50 } = req.body;
  db.prepare("UPDATE rule_map SET pattern=?, subcategory_id=?, priority=? WHERE id=?").run(String(pattern).trim(), subcategoryId, Number(priority), req.params.id);
  auditLog("rule_updated", "rule", req.params.id, { pattern, subcategoryId });
  res.json({ ok: true });
});

app.delete("/api/rules/:id", (req, res) => {
  db.prepare("DELETE FROM rule_map WHERE id=?").run(req.params.id);
  auditLog("rule_deleted", "rule", req.params.id);
  res.json({ ok: true });
});

app.post("/api/rules/train", (req, res) => {
  const transaction = one("SELECT * FROM transactions WHERE id=?", [req.body.transactionId]);
  if (!transaction) return res.status(404).json({ error: "Lançamento não encontrado." });
  const subcategoryId = Number(req.body.subcategoryId || transaction.subcategory_id || 0);
  const subcategory = subcategoryId ? one("SELECT id FROM subcategories WHERE id=?", [subcategoryId]) : null;
  if (!subcategory) return res.status(400).json({ error: "Informe uma subcategoria válida para treinar a regra." });
  const pattern = String(req.body.pattern || transaction.note || transaction.description || "").trim().slice(0, 120);
  if (pattern.length < 3) return res.status(400).json({ error: "Padrão muito curto para treinar a regra." });
  db.prepare(`
    INSERT INTO rule_map(pattern, subcategory_id, priority)
    VALUES (?,?,?)
    ON CONFLICT(pattern) DO UPDATE SET subcategory_id=excluded.subcategory_id, priority=excluded.priority
  `).run(pattern, subcategoryId, Number(req.body.priority || 85));
  auditLog("rule_trained", "transaction", transaction.id, { pattern, subcategoryId });
  res.status(201).json({ ok: true, pattern, subcategoryId });
});

app.post("/api/attachments", upload.array("files", 10), (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ error: "Nenhum arquivo enviado." });

  const transactionId = req.body.transactionId ? Number(req.body.transactionId) : null;
  const installmentGroupId = req.body.installmentGroupId || null;
  const subscriptionId = req.body.subscriptionId ? Number(req.body.subscriptionId) : null;
  const kind = req.body.kind === "camera" ? "camera" : "file";

  if (!transactionId && !installmentGroupId && !subscriptionId) {
    return res.status(400).json({ error: "Informe o vínculo do anexo." });
  }

  const saved = [];
  const attachmentsDir = getAttachmentsDir();
  fs.mkdirSync(attachmentsDir, { recursive: true });
  const insert = db.prepare(`
    INSERT INTO attachments(transaction_id, installment_group_id, subscription_id, kind, original_name, stored_name, mime_type, size)
    VALUES (?,?,?,?,?,?,?,?)
  `);

  for (const file of files) {
    const safeName = file.originalname.replace(/[^\w.\-À-ÿ ]+/g, "_");
    const storedName = `${Date.now()}-${crypto.randomUUID()}-${safeName}`;
    fs.writeFileSync(path.join(attachmentsDir, storedName), file.buffer);
    const info = insert.run(transactionId, installmentGroupId, subscriptionId, kind, file.originalname, storedName, file.mimetype, file.size);
    saved.push({
      id: info.lastInsertRowid,
      name: file.originalname,
      url: `/api/attachments/${storedName}`,
      kind,
    });
  }

  auditLog("attachment_uploaded", "attachment", saved.map((file) => file.id).join(","), { count: saved.length, kind });
  res.status(201).json({ saved });
});

app.get("/api/settings", (_req, res) => {
  const attachmentsDir = getSetting("attachmentsDir", "");
  const instanceId = getCurrentInstanceId();
  const activeInstance = getInstance(instanceId);
  res.json({
    attachmentsDir,
    effectiveAttachmentsDir: getAttachmentsDir(),
    defaultAttachmentsDir: defaultAttachmentsDirForInstance(instanceId),
    sqlitePath: instanceDbPath(instanceId),
    dataRoot: instanceDir(instanceId),
    instance: activeInstance ? { id: activeInstance.id, name: activeInstance.name, role: activeInstance.role } : null,
    ports: getAppPorts(),
    appearance: JSON.parse(getSetting("appearance", "{}") || "{}"),
    budgetAlerts: getBudgetAlertSettings(),
  });
});

app.put("/api/settings", (req, res) => {
  try {
    if (Object.prototype.hasOwnProperty.call(req.body, "attachmentsDir")) {
      const attachmentsDir = String(req.body.attachmentsDir || "").trim();
      if (attachmentsDir) {
        const resolved = path.resolve(attachmentsDir);
        fs.mkdirSync(resolved, { recursive: true });
        setSetting("attachmentsDir", resolved);
      } else {
        setSetting("attachmentsDir", "");
        fs.mkdirSync(defaultAttachmentsDirForInstance(), { recursive: true });
      }
    }
    if (req.body.appearance) {
      setSetting("appearance", JSON.stringify(req.body.appearance));
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "ports")) {
      if (getCurrentInstanceId() !== "admin") {
        return res.status(403).json({ error: "Apenas a instância admin pode alterar portas do aplicativo." });
      }
      const ports = normalizePorts(req.body.ports);
      setSetting("apiPort", String(ports.apiPort));
      setSetting("clientPort", String(ports.clientPort));
      writeRuntimeConfig(ports);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, "budgetAlerts")) {
      const levels = (req.body.budgetAlerts?.levels || []).map(Number).filter((n) => n > 0 && n <= 100);
      if (levels.length < 3) return res.status(400).json({ error: "Informe pelo menos 3 níveis de alerta entre 1 e 100." });
      setSetting("budgetAlerts", JSON.stringify({ levels: [...new Set(levels)].sort((a, b) => a - b) }));
    }
    auditLog("settings_updated", "settings", getCurrentInstanceId(), {
      attachmentsDirChanged: Object.prototype.hasOwnProperty.call(req.body, "attachmentsDir"),
      appearanceChanged: Boolean(req.body.appearance),
      portsChanged: Object.prototype.hasOwnProperty.call(req.body, "ports"),
      budgetAlertsChanged: Object.prototype.hasOwnProperty.call(req.body, "budgetAlerts"),
    });
    res.json({
      ok: true,
    attachmentsDir: getSetting("attachmentsDir", ""),
    effectiveAttachmentsDir: getAttachmentsDir(),
    defaultAttachmentsDir: defaultAttachmentsDirForInstance(),
    sqlitePath: instanceDbPath(getCurrentInstanceId()),
    dataRoot: instanceDir(getCurrentInstanceId()),
    instance: getInstance(getCurrentInstanceId()),
    ports: getAppPorts(),
      appearance: JSON.parse(getSetting("appearance", "{}") || "{}"),
      budgetAlerts: getBudgetAlertSettings(),
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

function copyRowsBetweenDbs(sourceDb, targetDb, table, columns) {
  const rows = sourceDb.prepare(`SELECT ${columns.join(", ")} FROM ${table}`).all();
  if (!rows.length) return 0;
  const placeholders = columns.map((column) => `@${column}`).join(", ");
  const stmt = targetDb.prepare(`INSERT OR REPLACE INTO ${table}(${columns.join(", ")}) VALUES (${placeholders})`);
  const run = targetDb.transaction(() => {
    for (const row of rows) stmt.run(row);
  });
  run();
  return rows.length;
}

function copyCadastrosToInstance(targetDb) {
  const counts = {};
  counts.categories = copyRowsBetweenDbs(rootDb, targetDb, "categories", ["id", "name", "type", "show_on_dashboard", "dashboard_order"]);
  counts.subcategories = copyRowsBetweenDbs(rootDb, targetDb, "subcategories", ["id", "name", "category_id"]);
  counts.institutions = copyRowsBetweenDbs(rootDb, targetDb, "institutions", ["id", "name", "kind", "opening_balance"]);
  counts.rule_map = copyRowsBetweenDbs(rootDb, targetDb, "rule_map", ["id", "pattern", "subcategory_id", "priority"]);

  const settings = rootDb.prepare("SELECT key, value FROM app_settings WHERE key IN ('appearance','budgetAlerts')").all();
  const stmt = targetDb.prepare("INSERT OR REPLACE INTO app_settings(key,value) VALUES (@key,@value)");
  const run = targetDb.transaction(() => {
    for (const row of settings) stmt.run(row);
  });
  run();
  counts.app_settings = settings.length;
  return counts;
}

app.get("/api/instances", (req, res) => {
  if (!assertAdminSession(req, res)) return;
  res.json({
    maxInstances: 4,
    currentInstanceId: readSession(req)?.instanceId || "admin",
    instances: publicInstances(),
  });
});

app.post("/api/instances", (req, res) => {
  if (!assertAdminSession(req, res)) return;
  const name = String(req.body.name || "").trim();
  const password = String(req.body.password || "");
  if (!name) return res.status(400).json({ error: "Informe o nome da instância." });
  const validation = validatePassword(password);
  if (validation) return res.status(400).json({ error: validation });

  const instances = ensureInstancesRegistry();
  if (instances.filter((instance) => instance.active !== false).length >= 4) {
    return res.status(400).json({ error: "Limite de 4 instâncias atingido." });
  }

  let id = slugifyInstanceName(name);
  let suffix = 2;
  const used = new Set(instances.map((instance) => instance.id));
  while (used.has(id)) id = `${slugifyInstanceName(name)}-${suffix++}`;

  const createdAt = new Date().toISOString();
  const targetPath = instanceDbPath(id);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const targetDb = getInstanceDb(id);
  instanceContext.run({ instanceId: id, db: targetDb }, () => {
    initDb(targetDb);
    copyCadastrosToInstance(targetDb);
    setPassword(password);
    fs.mkdirSync(defaultAttachmentsDirForInstance(id), { recursive: true });
  });

  const instance = {
    id,
    name,
    role: "user",
    active: true,
    dbPath: targetPath,
    dataRoot: instanceDir(id),
    createdAt,
    copiedFrom: "admin",
  };
  saveInstances([...instances, instance]);
  auditLog("instance_created", "instance", id, { name });
  res.status(201).json({ instance: { id, name, role: "user", active: true, createdAt }, copiedFrom: "admin" });
});

app.delete("/api/instances/:id", (req, res) => {
  if (!assertAdminSession(req, res)) return;
  const instanceId = String(req.params.id || "");
  if (instanceId === "admin") return res.status(400).json({ error: "A instância admin não pode ser excluída." });
  const instances = ensureInstancesRegistry();
  const instance = instances.find((item) => item.id === instanceId);
  if (!instance) return res.status(404).json({ error: "Instância não encontrada." });

  for (const [token, session] of sessions.entries()) {
    if (session.instanceId === instanceId) sessions.delete(token);
  }
  const targetDb = dbPool.get(instanceId);
  if (targetDb) {
    targetDb.close();
    dbPool.delete(instanceId);
  }
  fs.rmSync(instanceDir(instanceId), { recursive: true, force: true });
  saveInstances(instances.filter((item) => item.id !== instanceId));
  auditLog("instance_deleted", "instance", instanceId);
  res.json({ ok: true, deleted: instanceId });
});

app.get("/api/telegram/status", (req, res) => {
  const session = readSession(req);
  if (!session) return res.status(401).json({ error: "Sessão expirada ou não autenticada." });
  const config = getTelegramConfig();
  res.json({
    enabled: Boolean(config.enabled),
    tokenConfigured: Boolean(config.token),
    linkedToCurrentInstance: Object.values(config.bindings || {}).includes(session?.instanceId),
    currentInstanceId: session?.instanceId || "admin",
    isAdmin: session?.instanceId === "admin",
  });
});

app.put("/api/telegram/settings", (req, res) => {
  if (!assertAdminSession(req, res)) return;
  const config = getTelegramConfig();
  const token = Object.prototype.hasOwnProperty.call(req.body, "token")
    ? String(req.body.token || "").trim()
    : config.token;
  const enabled = Object.prototype.hasOwnProperty.call(req.body, "enabled")
    ? Boolean(req.body.enabled)
    : config.enabled;
  if (enabled && !token) return res.status(400).json({ error: "Informe o token do bot antes de ativar." });
  saveTelegramConfig({ ...config, token, enabled });
  syncTelegramBot();
  res.json({ ok: true, enabled, tokenConfigured: Boolean(token) });
});

app.post("/api/telegram/link-code", (req, res) => {
  const session = readSession(req);
  if (!session) return res.status(401).json({ error: "Sessão expirada ou não autenticada." });
  const instance = getInstance(session.instanceId);
  if (!instance) return res.status(400).json({ error: "Instância inválida." });
  const config = getTelegramConfig();
  const code = crypto.randomBytes(4).toString("hex").toUpperCase();
  const expiresAt = Date.now() + 1000 * 60 * 15;
  config.links = { ...(config.links || {}), [code]: { instanceId: instance.id, expiresAt } };
  saveTelegramConfig(config);
  res.status(201).json({ code, expiresAt, instance: { id: instance.id, name: instance.name } });
});

app.get("/api/telegram/alerts", (req, res) => {
  const session = readSession(req);
  if (!session) return res.status(401).json({ error: "Sessão expirada ou não autenticada." });
  res.json(getTelegramAlertsConfig());
});

app.put("/api/telegram/alerts", (req, res) => {
  const session = readSession(req);
  if (!session) return res.status(401).json({ error: "Sessão expirada ou não autenticada." });
  const alerts = Array.isArray(req.body.alerts) ? req.body.alerts : [];
  const queries = Array.isArray(req.body.queries) ? req.body.queries : defaultTelegramQueries();
  setTelegramAlertsConfig({ alerts, queries });
  res.json(getTelegramAlertsConfig());
});

app.post("/api/telegram/alerts/test", async (req, res) => {
  const session = readSession(req);
  if (!session) return res.status(401).json({ error: "Sessão expirada ou não autenticada." });
  const alert = normalizeTelegramAlert(req.body.alert || {});
  const chats = telegramChatsForInstance(session.instanceId);
  if (!chats.length) return res.status(400).json({ error: "Nenhum chat do Telegram vinculado a esta instância." });
  const message = buildTelegramSystemMessage(alert.type, alert.message);
  await Promise.all(chats.map((chatId) => sendTelegramAlert(chatId, alert, message)));
  res.json({ ok: true, chats: chats.length });
});

app.post("/api/telegram/alerts/media", upload.single("file"), (req, res) => {
  const session = readSession(req);
  if (!session) return res.status(401).json({ error: "Sessão expirada ou não autenticada." });
  if (!req.file) return res.status(400).json({ error: "Arquivo não enviado." });
  if (req.file.size > 8 * 1024 * 1024) return res.status(400).json({ error: "Mídia muito grande. Use até 8 MB." });
  const ext = path.extname(req.file.originalname || "").toLowerCase();
  const mime = String(req.file.mimetype || "").toLowerCase();
  let kind = "";
  if (mime.startsWith("image/") && ext !== ".gif") kind = "image";
  if (mime === "image/gif" || ext === ".gif") kind = "gif";
  if (mime === "audio/mpeg" || mime === "audio/mp3" || ext === ".mp3") kind = "audio";
  if (!kind) return res.status(400).json({ error: "Use imagem, GIF ou áudio MP3." });
  const mediaDir = getTelegramMediaDir();
  fs.mkdirSync(mediaDir, { recursive: true });
  const safeExt = kind === "audio" ? ".mp3" : kind === "gif" ? ".gif" : ([".jpg", ".jpeg", ".png", ".webp"].includes(ext) ? ext : ".jpg");
  const storedName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${safeExt}`;
  fs.writeFileSync(path.join(mediaDir, storedName), req.file.buffer);
  res.status(201).json({
    media: {
      kind,
      originalName: req.file.originalname,
      storedName,
      mimeType: req.file.mimetype,
      size: req.file.size,
    },
  });
});

app.get("/api/connections/current", (_req, res) => {
  const saved = getSetting("connectionConfig", "");
  res.json({
    activeProvider: "SQLite local",
    activePath: dbPath,
    savedConnection: saved ? JSON.parse(saved) : null,
    supportedProviders: ["sqlite", "sqlserver", "spreadsheet"],
    note: "A aplicação ainda roda sobre o SQLite local; estes conectores inicializam/migram bases externas e permitem importar de volta.",
  });
});

app.post("/api/connections/test", async (req, res) => {
  try {
    const config = req.body || {};
    if (config.provider === "sqlite") {
      const target = path.resolve(config.sqlitePath || dbPath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      const testDb = new Database(target);
      testDb.prepare("SELECT 1 ok").get();
      testDb.close();
      return res.json({ ok: true, message: "SQLite acessível.", target });
    }

    if (config.provider === "spreadsheet") {
      const target = path.resolve(config.spreadsheetPath || path.join(root, "financeiro-export.xlsx"));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      return res.json({ ok: true, message: "Caminho da planilha acessível.", target });
    }

    if (config.provider === "sqlserver") {
      const sql = await import("mssql");
      const pool = await sql.connect(sqlServerConfig(config));
      await pool.request().query("SELECT 1 AS ok");
      await pool.close();
      return res.json({ ok: true, message: "SQL Server conectado." });
    }

    res.status(400).json({ error: "Provider inválido." });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/connections/save", (req, res) => {
  const config = sanitizeConnectionConfig(req.body || {});
  setSetting("connectionConfig", JSON.stringify(config));
  res.json({ ok: true, savedConnection: config });
});

app.post("/api/connections/migrate-to", async (req, res) => {
  try {
    const config = req.body || {};
    if (config.provider === "sqlite") {
      const target = path.resolve(config.sqlitePath);
      migrateToSqliteFile(target);
      setSetting("connectionConfig", JSON.stringify(sanitizeConnectionConfig(config)));
      auditLog("connection_migrated", "connection", "sqlite", { target });
      return res.json({ ok: true, provider: "sqlite", target, counts: tableCounts(db) });
    }

    if (config.provider === "spreadsheet") {
      const target = path.resolve(config.spreadsheetPath || path.join(root, "financeiro-export.xlsx"));
      exportToSpreadsheet(target);
      setSetting("connectionConfig", JSON.stringify(sanitizeConnectionConfig(config)));
      auditLog("connection_migrated", "connection", "spreadsheet", { target });
      return res.json({ ok: true, provider: "spreadsheet", target, counts: tableCounts(db) });
    }

    if (config.provider === "sqlserver") {
      const result = await migrateToSqlServer(config);
      setSetting("connectionConfig", JSON.stringify(sanitizeConnectionConfig(config)));
      auditLog("connection_migrated", "connection", "sqlserver", { database: config.database, server: config.server });
      return res.json({ ok: true, provider: "sqlserver", ...result });
    }

    res.status(400).json({ error: "Provider inválido." });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/connections/import-to-sqlite", async (req, res) => {
  try {
    const config = req.body || {};
    if (config.provider === "spreadsheet") {
      const target = path.resolve(config.spreadsheetPath);
      importSpreadsheetToCurrent(target);
      auditLog("connection_imported", "connection", "spreadsheet", { target });
      return res.json({ ok: true, provider: "spreadsheet", importedTo: dbPath, counts: tableCounts(db) });
    }

    if (config.provider === "sqlite") {
      const target = path.resolve(config.sqlitePath);
      importSqliteFileToCurrent(target);
      auditLog("connection_imported", "connection", "sqlite", { target });
      return res.json({ ok: true, provider: "sqlite", importedTo: dbPath, counts: tableCounts(db) });
    }

    if (config.provider === "sqlserver") {
      return res.status(501).json({ error: "Importar de volta do SQL Server ainda será implementado após a camada ativa multi-provider." });
    }

    res.status(400).json({ error: "Provider inválido." });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/admin/clear-base", (req, res) => {
  const { confirmation, includeSettings = false } = req.body;
  if (confirmation !== "LIMPAR_BASE") {
    return res.status(400).json({ error: "Confirmação inválida. Digite LIMPAR_BASE para continuar." });
  }

  const run = db.transaction(() => {
    db.prepare("DELETE FROM card_payments").run();
    db.prepare("DELETE FROM ofx_imports").run();
    db.prepare("DELETE FROM transactions").run();
    db.prepare("DELETE FROM installment_groups").run();
    db.prepare("DELETE FROM subscriptions").run();
    db.prepare("DELETE FROM attachments").run();

    if (includeSettings) {
      db.prepare("DELETE FROM rule_map").run();
      db.prepare("DELETE FROM subcategories").run();
      db.prepare("DELETE FROM categories").run();
      db.prepare("DELETE FROM institutions").run();
    }

    db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('transactions','ofx_imports','card_payments')").run();
  });

  run();
  auditLog("base_cleared", "admin", getCurrentInstanceId(), { includeSettings });
  const activeAttachmentsDir = getAttachmentsDir();
  fs.mkdirSync(activeAttachmentsDir, { recursive: true });
  for (const file of fs.readdirSync(activeAttachmentsDir)) {
    fs.rmSync(path.join(activeAttachmentsDir, file), { force: true });
  }
  if (includeSettings) {
    seedDb();
    ensureCoreMappings();
  }
  res.json({ ok: true, includeSettings });
});

app.get("/api/transactions", (req, res) => {
  ensureSubscriptionForecasts(req.query);
  const limit = Math.min(Number(req.query.limit || 300), 1000);
  const period = buildPeriodFilter(req.query, "t.date");
  res.json(all(`
    SELECT t.*, i.name institution, i.kind institution_kind, c.name category, s.name subcategory,
      (SELECT COUNT(*) FROM attachments a WHERE a.transaction_id=t.id OR a.installment_group_id=t.installment_group_id) attachment_count,
      (
        SELECT json_group_array(json_object(
          'id', a.id,
          'name', a.original_name,
          'kind', a.kind,
          'url', '/api/attachments/' || a.stored_name
        ))
        FROM attachments a
        WHERE a.transaction_id=t.id OR a.installment_group_id=t.installment_group_id
      ) attachments
    FROM transactions t
    LEFT JOIN institutions i ON i.id=t.institution_id
    LEFT JOIN categories c ON c.id=t.category_id
    LEFT JOIN subcategories s ON s.id=t.subcategory_id
    ${period.where}
    ORDER BY date DESC, id DESC
    LIMIT ?
  `, [...period.params, limit]));
});

app.post("/api/transactions", (req, res) => {
  const id = createTransaction(req.body);
  auditLog("transaction_created", "transaction", id, { source: req.body.source || "manual", status: req.body.status || "Previsto" });
  res.status(201).json({ id });
});

app.put("/api/transactions/:id", (req, res) => {
  const existing = one("SELECT * FROM transactions WHERE id=?", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Lançamento não encontrado." });
  const institution = req.body.institution
    ? one("SELECT id FROM institutions WHERE name=?", [req.body.institution])
    : req.body.institutionId
      ? { id: req.body.institutionId }
      : null;
  const cls = resolveClassification(req.body);
  const result = req.body.result || cls.result;
  const amount = Number(req.body.amount || 0);
  db.prepare(`
    UPDATE transactions
    SET date=@date,
        description=@description,
        amount=@amount,
        institution_id=@institutionId,
        status=@status,
        note=@note,
        subcategory_id=@subcategoryId,
        category_id=@categoryId,
        result=@result,
        signed_amount=@signedAmount,
        forecast_type=@forecastType
    WHERE id=@id
  `).run({
    id: req.params.id,
    date: normalizeDate(req.body.date),
    description: req.body.description || req.body.subcategory || existing.description,
    amount: Math.abs(amount),
    institutionId: institution?.id ?? existing.institution_id,
    status: req.body.status || existing.status,
    note: req.body.note || "",
    subcategoryId: cls.subcategoryId,
    categoryId: cls.categoryId,
    result,
    signedAmount: signedAmount(amount, result),
    forecastType: req.body.forecastType || null,
  });
  auditLog("transaction_updated", "transaction", req.params.id, { previousStatus: existing.status, nextStatus: req.body.status || existing.status });
  res.json({ ok: true });
});

app.delete("/api/transactions/:id", (req, res) => {
  const existing = one("SELECT * FROM transactions WHERE id=?", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Lançamento não encontrado." });
  const run = db.transaction(() => {
    db.prepare("DELETE FROM attachments WHERE transaction_id=?").run(req.params.id);
    db.prepare("DELETE FROM transactions WHERE id=?").run(req.params.id);
  });
  run();
  auditLog("transaction_deleted", "transaction", req.params.id, { description: existing.description, amount: existing.amount });
  res.json({ ok: true });
});

app.post("/api/transactions/:id/realize", (req, res) => {
  const existing = one("SELECT * FROM transactions WHERE id=?", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Lançamento não encontrado." });
  if (existing.status === "Realizado") return res.json({ ok: true, id: existing.id, status: existing.status });
  const paymentDate = normalizeDate(req.body.paymentDate || new Date());
  db.prepare("UPDATE transactions SET status='Realizado', date=?, settled_at=?, settlement_type=COALESCE(settlement_type, 'Manual') WHERE id=?")
    .run(paymentDate, paymentDate, req.params.id);
  if (existing.installment_group_id) updateInstallmentGroupStatus(existing.installment_group_id);
  const updated = one("SELECT id, status, date, settled_at, settlement_type FROM transactions WHERE id=?", [req.params.id]);
  auditLog("transaction_realized", "transaction", req.params.id, { paymentDate });
  res.json(updated);
});

function budgetRows() {
  const settings = getBudgetAlertSettings();
  return all(`
    SELECT b.*, c.name category, s.name subcategory,
      COALESCE((
        SELECT SUM(t.amount)
        FROM transactions t
        WHERE t.status='Realizado'
          AND t.result='Despesa'
          AND date(t.date) BETWEEN date(b.start_date) AND date(b.end_date)
          AND (b.category_id IS NULL OR t.category_id=b.category_id)
          AND (b.subcategory_id IS NULL OR t.subcategory_id=b.subcategory_id)
      ),0) spent
    FROM budgets b
    LEFT JOIN categories c ON c.id=b.category_id
    LEFT JOIN subcategories s ON s.id=b.subcategory_id
    ORDER BY b.status, b.end_date, b.name
  `).map((row) => ({ ...row, ...budgetStatus(row.spent, row.amount, settings) }));
}

app.get("/api/budgets", (_req, res) => {
  res.json({ alerts: getBudgetAlertSettings(), rows: budgetRows() });
});

app.post("/api/budgets", (req, res) => {
  const name = String(req.body.name || "").trim();
  const amount = Number(req.body.amount || 0);
  const startDate = normalizeDate(req.body.startDate);
  const endDate = normalizeDate(req.body.endDate);
  if (!name || amount <= 0) return res.status(400).json({ error: "Nome e valor do orçamento são obrigatórios." });
  if (endDate < startDate) return res.status(400).json({ error: "Data final precisa ser maior ou igual à inicial." });
  const sub = req.body.subcategoryId ? one("SELECT s.id, s.category_id FROM subcategories s WHERE s.id=?", [req.body.subcategoryId]) : null;
  const categoryId = sub?.category_id || Number(req.body.categoryId || 0) || null;
  const info = db.prepare(`
    INSERT INTO budgets(name, amount, start_date, end_date, category_id, subcategory_id, status)
    VALUES (?,?,?,?,?,?,?)
  `).run(name, amount, startDate, endDate, categoryId, sub?.id || null, req.body.status || "Ativo");
  auditLog("budget_created", "budget", info.lastInsertRowid, { name, amount, startDate, endDate });
  res.status(201).json({ id: info.lastInsertRowid });
});

app.put("/api/budgets/:id", (req, res) => {
  const existing = one("SELECT * FROM budgets WHERE id=?", [req.params.id]);
  if (!existing) return res.status(404).json({ error: "Orçamento não encontrado." });
  const name = String(req.body.name || existing.name).trim();
  const amount = Number(req.body.amount || existing.amount);
  const startDate = normalizeDate(req.body.startDate || existing.start_date);
  const endDate = normalizeDate(req.body.endDate || existing.end_date);
  if (!name || amount <= 0) return res.status(400).json({ error: "Nome e valor do orçamento são obrigatórios." });
  if (endDate < startDate) return res.status(400).json({ error: "Data final precisa ser maior ou igual à inicial." });
  const sub = req.body.subcategoryId ? one("SELECT s.id, s.category_id FROM subcategories s WHERE s.id=?", [req.body.subcategoryId]) : null;
  const categoryId = sub?.category_id || Number(req.body.categoryId || 0) || null;
  db.prepare(`
    UPDATE budgets SET name=?, amount=?, start_date=?, end_date=?, category_id=?, subcategory_id=?, status=?
    WHERE id=?
  `).run(name, amount, startDate, endDate, categoryId, sub?.id || null, req.body.status || existing.status, req.params.id);
  auditLog("budget_updated", "budget", req.params.id, { name, amount, startDate, endDate });
  res.json({ ok: true });
});

app.delete("/api/budgets/:id", (req, res) => {
  db.prepare("DELETE FROM budgets WHERE id=?").run(req.params.id);
  auditLog("budget_deleted", "budget", req.params.id);
  res.json({ ok: true });
});

app.get("/api/summary", (req, res) => {
  ensureSubscriptionForecasts(req.query);
  const period = buildPeriodFilter(req.query, "date");
  const periodT = buildPeriodFilter(req.query, "t.date");
  const appearance = JSON.parse(getSetting("appearance", "{}") || "{}");
  const monthlyStatus = ["Realizado", "Previsto", "Todos"].includes(appearance?.dashboardRules?.monthlyStatus)
    ? appearance.dashboardRules.monthlyStatus
    : "Realizado";
  const monthlyStatusClause = monthlyStatus === "Todos" ? "" : `${period.where ? " AND" : " WHERE"} status=?`;
  const monthlyParams = monthlyStatus === "Todos" ? period.params : [...period.params, monthlyStatus];
  const totals = one(`
    SELECT
      COALESCE(SUM(CASE WHEN result='Receita' THEN amount END),0) receita,
      COALESCE(SUM(CASE WHEN result='Despesa' THEN amount END),0) despesa,
      COALESCE(SUM(CASE WHEN result='Fatura' THEN amount END),0) fatura,
      COALESCE(SUM(signed_amount),0) saldo_movimentos
    FROM transactions
    WHERE status='Realizado' ${period.and}
  `, period.params);
  const monthly = all(`
    SELECT substr(date,1,7) period,
      SUM(CASE WHEN result='Receita' THEN amount ELSE 0 END) receita,
      SUM(CASE WHEN result='Despesa' THEN amount ELSE 0 END) despesa,
      SUM(CASE WHEN result='Fatura' THEN amount ELSE 0 END) fatura
    FROM transactions
    ${period.where}${monthlyStatusClause}
    GROUP BY substr(date,1,7)
    ORDER BY period
  `, monthlyParams);
  const byCategory = all(`
    SELECT COALESCE(c.name,'Sem categoria') name, COALESCE(t.result,'') result, SUM(t.amount) value
    FROM transactions t LEFT JOIN categories c ON c.id=t.category_id
    WHERE t.status='Realizado' ${periodT.and}
    GROUP BY c.name, t.result
    ORDER BY value DESC
    LIMIT 50
  `, periodT.params);
  const bySubcategory = all(`
    SELECT
      COALESCE(s.name,'Sem subcategoria') name,
      COALESCE(c.name,'Sem categoria') category,
      COALESCE(t.result,'') result,
      SUM(t.amount) value,
      COUNT(t.id) transactions_count
    FROM transactions t
    LEFT JOIN subcategories s ON s.id=t.subcategory_id
    LEFT JOIN categories c ON c.id=t.category_id
    WHERE t.status='Realizado' ${periodT.and}
    GROUP BY s.name, c.name, t.result
    ORDER BY value DESC
    LIMIT 50
  `, periodT.params);
  const balances = all(`
    SELECT i.id, i.name, i.kind, i.opening_balance + COALESCE(SUM(t.signed_amount),0) balance
    FROM institutions i
    LEFT JOIN transactions t ON t.institution_id=i.id AND t.status='Realizado'
    GROUP BY i.id
    ORDER BY i.kind, i.name
  `);
  const future = one(`SELECT COALESCE(SUM(amount),0) total, COUNT(*) count FROM transactions WHERE status='Previsto' ${period.and}`, period.params);
  const dashboardCategories = all(`
    SELECT c.id, c.name, c.type,
      COALESCE(SUM(CASE WHEN t.status='Realizado' THEN t.amount ELSE 0 END),0) confirmed_amount,
      COALESCE(SUM(CASE WHEN t.status='Previsto' THEN t.amount ELSE 0 END),0) planned_amount,
      COUNT(t.id) transactions_count
    FROM categories c
    LEFT JOIN transactions t ON t.category_id=c.id
    WHERE c.show_on_dashboard=1 ${periodT.and}
    GROUP BY c.id
    ORDER BY c.dashboard_order, c.name
  `, periodT.params);
  const activeBudgets = budgetRows().filter((row) => row.status === "Ativo");
  const budgetAlerts = activeBudgets.filter((row) => row.severity !== "ok");
  const budgetSummary = activeBudgets.reduce((acc, row) => {
    acc.total += Number(row.amount || 0);
    acc.spent += Number(row.spent || 0);
    return acc;
  }, { total: 0, spent: 0 });
  budgetSummary.remaining = budgetSummary.total - budgetSummary.spent;
  budgetSummary.used = budgetSummary.total > 0 ? Math.round((budgetSummary.spent / budgetSummary.total) * 10000) / 100 : 0;
  res.json({ totals, monthly, byCategory, bySubcategory, balances, future, dashboardCategories, budgets: { ...budgetSummary, alerts: budgetAlerts, items: activeBudgets } });
});

function buildPeriodFilter(query, column = "date") {
  const clauses = [];
  const params = [];
  const year = Number(query.year || 0);
  const month = Number(query.month || 0);
  const day = Number(query.day || 0);

  if (year) {
    clauses.push(`strftime('%Y', ${column}) = ?`);
    params.push(String(year));
  }
  if (month) {
    clauses.push(`strftime('%m', ${column}) = ?`);
    params.push(String(month).padStart(2, "0"));
  }
  if (day) {
    clauses.push(`strftime('%d', ${column}) = ?`);
    params.push(String(day).padStart(2, "0"));
  }

  return {
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    and: clauses.length ? `AND ${clauses.join(" AND ")}` : "",
    params,
  };
}

app.post("/api/installments", (req, res) => {
  const group = crypto.randomUUID();
  const count = Number(req.body.installments || 1);
  const paid = Number(req.body.paidInstallments || 0);
  const installmentAmount = Number(req.body.installmentAmount || req.body.amount || 0);
  const principalTotal = Number(req.body.purchaseAmount || req.body.principalTotal || installmentAmount * count);
  const interestTotal = Math.max(0, installmentAmount * count - principalTotal);
  const institution = req.body.institution
    ? one("SELECT id FROM institutions WHERE name=?", [req.body.institution])
    : req.body.institutionId
      ? { id: Number(req.body.institutionId) }
      : null;
  const cls = resolveClassification(req.body);
  const ids = [];
  const run = db.transaction(() => {
    db.prepare(`
      INSERT INTO installment_groups(id, description, principal_total, installment_amount, installments_count, interest_total, institution_id, subcategory_id, first_date, status)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(
      group,
      req.body.description || req.body.note || req.body.subcategory || "Parcelamento",
      principalTotal,
      installmentAmount,
      count,
      interestTotal,
      institution?.id ?? null,
      cls.subcategoryId,
      normalizeDate(req.body.firstDate || req.body.date),
      "Aberto",
    );
    for (let i = Math.max(1, paid + 1); i <= count; i++) {
      ids.push(createTransaction({
        ...req.body,
        date: addMonths(req.body.firstDate || req.body.date, i - paid - 1),
        description: req.body.description || req.body.subcategory || "Parcelamento",
        amount: installmentAmount,
        note: `${req.body.note || req.body.description || "Parcelamento"} - Parcela ${String(i).padStart(2, "0")}/${String(count).padStart(2, "0")}`,
        status: req.body.status || "Previsto",
        source: "installment",
        forecastType: "Parcela",
        installmentGroupId: group,
        installmentNumber: i,
        installmentTotal: count,
      }));
    }
  });
  run();
  res.status(201).json({ group, ids, principalTotal, installmentAmount, interestTotal });
});

app.get("/api/installments", (_req, res) => {
  const groups = all(`
    SELECT g.*,
      i.name institution,
      s.name subcategory,
      c.name category,
      COUNT(t.id) generated_count,
      SUM(CASE WHEN t.status='Previsto' THEN 1 ELSE 0 END) open_count,
      SUM(CASE WHEN t.status='Realizado' THEN 1 ELSE 0 END) paid_count,
      COALESCE(SUM(CASE WHEN t.status='Previsto' THEN t.amount ELSE 0 END),0) open_amount,
      COALESCE(SUM(CASE WHEN t.status='Realizado' THEN t.amount ELSE 0 END),0) paid_amount
    FROM installment_groups g
    LEFT JOIN institutions i ON i.id=g.institution_id
    LEFT JOIN subcategories s ON s.id=g.subcategory_id
    LEFT JOIN categories c ON c.id=s.category_id
    LEFT JOIN transactions t ON t.installment_group_id=g.id
    GROUP BY g.id
    ORDER BY g.created_at DESC
  `);
  const items = all(`
    SELECT t.*, i.name institution, s.name subcategory, c.name category
    FROM transactions t
    LEFT JOIN institutions i ON i.id=t.institution_id
    LEFT JOIN subcategories s ON s.id=t.subcategory_id
    LEFT JOIN categories c ON c.id=t.category_id
    WHERE t.installment_group_id IS NOT NULL
    ORDER BY t.installment_group_id, t.installment_number
  `);
  res.json({ groups, items });
});

app.post("/api/installments/:groupId/anticipate", (req, res) => {
  const count = Math.max(1, Number(req.body.count || 1));
  const paymentDate = normalizeDate(req.body.paymentDate || new Date());
  const rows = all(`
    SELECT id FROM transactions
    WHERE installment_group_id=? AND status='Previsto'
    ORDER BY date, installment_number
    LIMIT ?
  `, [req.params.groupId, count]);
  const run = db.transaction(() => {
    const stmt = db.prepare("UPDATE transactions SET status='Realizado', date=?, settled_at=?, settlement_type='Antecipada' WHERE id=?");
    for (const row of rows) stmt.run(paymentDate, paymentDate, row.id);
    updateInstallmentGroupStatus(req.params.groupId);
  });
  run();
  res.json({ anticipated: rows.length, paymentDate });
});

app.post("/api/installments/:groupId/settle", (req, res) => {
  const paymentDate = normalizeDate(req.body.paymentDate || new Date());
  const rows = all(`
    SELECT id FROM transactions
    WHERE installment_group_id=? AND status='Previsto'
    ORDER BY date, installment_number
  `, [req.params.groupId]);
  const run = db.transaction(() => {
    const stmt = db.prepare("UPDATE transactions SET status='Realizado', date=?, settled_at=?, settlement_type='Quitada' WHERE id=?");
    for (const row of rows) stmt.run(paymentDate, paymentDate, row.id);
    updateInstallmentGroupStatus(req.params.groupId);
  });
  run();
  res.json({ settled: rows.length, paymentDate });
});

app.get("/api/subscriptions", (_req, res) => {
  ensureSubscriptionForecasts();
  const rows = all(`
    SELECT sub.*,
      i.name institution,
      c.name category,
      s.name subcategory
    FROM subscriptions sub
    LEFT JOIN institutions i ON i.id=sub.institution_id
    LEFT JOIN categories c ON c.id=sub.category_id
    LEFT JOIN subcategories s ON s.id=sub.subcategory_id
    ORDER BY sub.status, sub.next_due_date, sub.name
  `);
  res.json(rows);
});

app.post("/api/subscriptions", (req, res) => {
  const institution = req.body.institution
    ? one("SELECT id FROM institutions WHERE name=?", [req.body.institution])
    : req.body.institutionId
      ? { id: Number(req.body.institutionId) }
      : null;
  const cls = resolveClassification(req.body);
  const name = req.body.name || req.body.description || req.body.note || "Assinatura";
  const amount = Number(req.body.amount || 0);
  const nextDueDate = normalizeDate(req.body.nextDueDate || req.body.date || new Date());
  const billingCycle = req.body.billingCycle === "Anual" ? "Anual" : "Mensal";
  const renewalDate = req.body.renewalDate ? normalizeDate(req.body.renewalDate) : null;

  const run = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO subscriptions(name, category_id, subcategory_id, institution_id, billing_cycle, amount, renewal_date, next_due_date, status)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(name, cls.categoryId, cls.subcategoryId, institution?.id ?? null, billingCycle, amount, renewalDate, nextDueDate, "Ativa");

    const txId = createTransaction({
      date: nextDueDate,
      description: name,
      amount,
      institutionId: institution?.id,
      status: "Previsto",
      note: billingCycle === "Anual" && renewalDate ? `Assinatura anual. Renovação: ${renewalDate}` : `Assinatura ${billingCycle.toLowerCase()}`,
      categoryId: cls.categoryId,
      subcategoryId: cls.subcategoryId,
      result: cls.result,
      source: "subscription",
      forecastType: billingCycle === "Anual" ? "Assinatura anual" : "Assinatura mensal",
      subscriptionId: info.lastInsertRowid,
    });

    return { id: info.lastInsertRowid, transactionId: txId };
  });

  res.status(201).json(run());
});

app.post("/api/subscriptions/:id/cancel", (req, res) => {
  db.prepare("UPDATE subscriptions SET status='Cancelada' WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

app.post("/api/installments/:groupId/reopen", (req, res) => {
  const rows = all(`
    SELECT id FROM transactions
    WHERE installment_group_id=? AND status='Realizado' AND settlement_type IN ('Antecipada','Quitada','Manual')
    ORDER BY installment_number
  `, [req.params.groupId]);
  const run = db.transaction(() => {
    const stmt = db.prepare("UPDATE transactions SET status='Previsto', settled_at=NULL, settlement_type=NULL WHERE id=?");
    for (const row of rows) stmt.run(row.id);
    updateInstallmentGroupStatus(req.params.groupId);
  });
  run();
  res.json({ reopened: rows.length });
});

app.post("/api/installments/items/:id/toggle", (req, res) => {
  const row = one("SELECT * FROM transactions WHERE id=? AND installment_group_id IS NOT NULL", [req.params.id]);
  if (!row) return res.status(404).json({ error: "Parcela não encontrada." });
  const paymentDate = normalizeDate(req.body.paymentDate || new Date());
  if (row.status === "Previsto") {
    db.prepare("UPDATE transactions SET status='Realizado', date=?, settled_at=?, settlement_type='Manual' WHERE id=?").run(paymentDate, paymentDate, row.id);
  } else {
    db.prepare("UPDATE transactions SET status='Previsto', settled_at=NULL, settlement_type=NULL WHERE id=?").run(row.id);
  }
  updateInstallmentGroupStatus(row.installment_group_id);
  const updated = one("SELECT id, status, date, settled_at, settlement_type FROM transactions WHERE id=?", [row.id]);
  res.json(updated);
});

function updateInstallmentGroupStatus(groupId) {
  const open = one("SELECT COUNT(*) total FROM transactions WHERE installment_group_id=? AND status='Previsto'", [groupId]).total;
  db.prepare("UPDATE installment_groups SET status=? WHERE id=?").run(open ? "Aberto" : "Quitado", groupId);
}

app.post("/api/transfers", (req, res) => {
  const group = crypto.randomUUID();
  const amount = Math.abs(Number(req.body.amount || 0));
  const date = normalizeDate(req.body.date);
  const ids = [];
  const run = db.transaction(() => {
    ids.push(createTransaction({
      date,
      description: "Envio para outra conta",
      amount,
      institutionId: req.body.fromInstitutionId,
      status: "Realizado",
      subcategory: "Envio para outra conta",
      note: `Envio para ${req.body.toInstitutionName || "outra conta"}`,
      source: "transfer",
      transferGroupId: group,
    }));
    ids.push(createTransaction({
      date,
      description: "Recebimento de outra conta",
      amount,
      institutionId: req.body.toInstitutionId,
      status: "Realizado",
      subcategory: "Recebimento de outra conta",
      note: `Recebimento vindo de ${req.body.fromInstitutionName || "outra conta"}`,
      source: "transfer",
      transferGroupId: group,
    }));
  });
  run();
  res.status(201).json({ group, ids });
});

app.post("/api/card-payments", (req, res) => {
  const month = Number(req.body.month);
  const year = Number(req.body.year);
  const cardId = Number(req.body.cardId);
  const accountId = Number(req.body.accountId);
  const rows = all("SELECT * FROM transactions WHERE institution_id=? AND CAST(strftime('%m', date) AS INTEGER)=? AND CAST(strftime('%Y', date) AS INTEGER)=?", [cardId, month, year]);
  const total = rows.reduce((sum, row) => sum + Math.abs(row.amount), 0);
  const date = normalizeDate(req.body.date);
  const run = db.transaction(() => {
    db.prepare("UPDATE transactions SET status='Realizado' WHERE institution_id=? AND CAST(strftime('%m', date) AS INTEGER)=? AND CAST(strftime('%Y', date) AS INTEGER)=?").run(cardId, month, year);
    const txId = createTransaction({
      date,
      description: "Pagamento de Fatura",
      amount: total,
      institutionId: accountId,
      status: "Realizado",
      subcategory: "Pagamento de Fatura",
      note: `Fatura do cartão de ${String(month).padStart(2, "0")}/${year}`,
      source: "card_payment",
    });
    db.prepare("INSERT INTO card_payments(paid_at, card_id, account_id, period_month, period_year, amount, transaction_id) VALUES (?,?,?,?,?,?,?)")
      .run(date, cardId, accountId, month, year, total, txId);
    return txId;
  });
  const txId = run();
  res.status(201).json({ transactionId: txId, amount: total, items: rows.length });
});

app.post("/api/ofx/import", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Arquivo OFX não enviado." });
  const institutionId = Number(req.body.institutionId);
  const institution = one("SELECT * FROM institutions WHERE id=?", [institutionId]);
  if (!institution) return res.status(400).json({ error: "Conta inválida." });
  const hash = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
  if (one("SELECT id FROM ofx_imports WHERE file_hash=?", [hash])) return res.status(409).json({ error: "Arquivo já importado." });

  const text = decodeOfxBuffer(req.file.buffer);
  const transactions = parseOfx(text);
  if (!transactions.length) return res.status(400).json({ error: "Nenhuma transação OFX encontrada." });

  let overrides = {};
  try {
    overrides = req.body.overrides ? JSON.parse(req.body.overrides) : {};
  } catch {
    return res.status(400).json({ error: "Sugestões OFX inválidas." });
  }

  const dates = transactions.map((t) => t.date).sort();
  let inserted = 0;
  let skipped = 0;
  const run = db.transaction(() => {
    for (const [index, t] of transactions.entries()) {
      if (findExistingOfxTransaction(t, institutionId)) {
        skipped++;
        continue;
      }
      const suggestion = classifyOfxTransactionSafe(t);
      const selectedSubcategoryId = Number(overrides[ofxTransactionKey(t, index)] || 0);
      const selected = selectedSubcategoryId
        ? one(`
          SELECT s.id subcategoryId, c.id categoryId, c.type result
          FROM subcategories s
          JOIN categories c ON c.id=s.category_id
          WHERE s.id=?
        `, [selectedSubcategoryId])
        : null;
      const result = selected?.result || (suggestion.apply ? suggestion.suggestedResult : t.amount >= 0 ? "Receita" : "Despesa");
      createTransaction({
        date: t.date,
        description: t.note || t.type || "OFX",
        amount: Math.abs(t.amount),
        institutionId,
        status: "Realizado",
        note: t.note,
        result,
        subcategoryId: selected?.subcategoryId || (suggestion.apply ? suggestion.suggestedSubcategoryId : null),
        categoryId: selected?.categoryId || (suggestion.apply ? suggestion.suggestedCategoryId : null),
        source: "ofx",
        fitid: t.fitid,
      });
      inserted++;
    }
    db.prepare("INSERT INTO ofx_imports(institution_id, filename, file_hash, period_start, period_end, transactions_count) VALUES (?,?,?,?,?,?)")
      .run(institutionId, req.file.originalname, hash, dates[0], dates.at(-1), inserted);
  });
  run();
  auditLog("ofx_imported", "ofx", req.file.originalname, { institution: institution.name, inserted, skipped, periodStart: dates[0], periodEnd: dates.at(-1) });
  res.status(201).json({ inserted, skipped, periodStart: dates[0], periodEnd: dates.at(-1), institution: institution.name });
});

app.post("/api/ofx/preview", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Arquivo OFX não enviado." });
  const institutionId = Number(req.body.institutionId);
  const hash = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
  const duplicateFile = Boolean(one("SELECT id FROM ofx_imports WHERE file_hash=?", [hash]));
  const text = decodeOfxBuffer(req.file.buffer);
  const transactions = parseOfx(text).map((t, index) => {
    const existing = institutionId ? findExistingOfxTransaction(t, institutionId) : null;
    const duplicate = Boolean(existing);
    const suggestion = classifyOfxTransactionSafe(t);
    return {
      ...t,
      key: ofxTransactionKey(t, index),
      amountAbs: Math.abs(t.amount),
      direction: t.amount >= 0 ? "Entrada" : "Saída",
      duplicate,
      suggestedContext: suggestion.context,
      suggestedCategory: suggestion.suggestedCategory,
      suggestedSubcategory: suggestion.suggestedSubcategory,
      suggestedNewCategory: suggestion.suggestedNewCategory,
      suggestedNewSubcategory: suggestion.suggestedNewSubcategory,
      suggestedResult: suggestion.suggestedResult,
      suggestionConfidence: suggestion.confidence,
      suggestionReason: suggestion.reason,
      suggestedAction: suggestion.suggestedAction,
      suggestedSubscription: suggestion.suggestedSubscription,
      existingSubscriptionId: suggestion.existingSubscriptionId,
      willApplySuggestion: suggestion.apply,
      suggestionOptions: ofxSubcategoryOptions(t, suggestion),
    };
  });
  const suggestionSummary = transactions.reduce((acc, t) => {
    if (t.willApplySuggestion) acc.auto++;
    else if (t.suggestedSubcategory || t.suggestedNewSubcategory) acc.review++;
    else acc.empty++;
    return acc;
  }, { auto: 0, review: 0, empty: 0 });
  const dates = transactions.map((t) => t.date).sort();
  res.json({
    filename: req.file.originalname,
    hash,
    duplicateFile,
    periodStart: dates[0] || null,
    periodEnd: dates.at(-1) || null,
    count: transactions.length,
    totalCredits: transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0),
    totalDebits: transactions.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0),
    suggestionSummary,
    transactions,
  });
});

const portableTables = [
  "categories",
  "subcategories",
  "institutions",
  "transactions",
  "ofx_imports",
  "card_payments",
  "installment_groups",
  "subscriptions",
  "budgets",
  "attachments",
  "rule_map",
  "audit_logs",
  "app_settings",
];

function tableCounts(sourceDb) {
  const result = {};
  for (const table of portableTables) {
    try {
      result[table] = sourceDb.prepare(`SELECT COUNT(*) total FROM ${table}`).get().total;
    } catch {
      result[table] = 0;
    }
  }
  return result;
}

function sanitizeConnectionConfig(config) {
  const clean = { ...config };
  if (clean.password) clean.password = "********";
  return clean;
}

function sqlServerConfig(config) {
  return {
    server: config.server,
    port: Number(config.port || 1433),
    database: config.database,
    user: config.user,
    password: config.password,
    options: {
      encrypt: Boolean(config.encrypt),
      trustServerCertificate: config.trustServerCertificate !== false,
    },
  };
}

function migrateToSqliteFile(target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const targetDb = new Database(target);
  try {
    targetDb.exec(dbSchemaSql());
    copySqliteTables(db, targetDb);
  } finally {
    targetDb.close();
  }
}

function importSqliteFileToCurrent(sourcePath) {
  if (!fs.existsSync(sourcePath)) throw new Error("Arquivo SQLite não encontrado.");
  const sourceDb = new Database(sourcePath, { readonly: true });
  try {
    clearPortableTables(db);
    copySqliteTables(sourceDb, db);
  } finally {
    sourceDb.close();
  }
}

function dbSchemaSql() {
  return `
    CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, type TEXT NOT NULL, show_on_dashboard INTEGER NOT NULL DEFAULT 0, dashboard_order INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS subcategories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, category_id INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS institutions (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, kind TEXT NOT NULL, opening_balance REAL NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, description TEXT NOT NULL, amount REAL NOT NULL, institution_id INTEGER, status TEXT NOT NULL DEFAULT 'Previsto', note TEXT, subcategory_id INTEGER, category_id INTEGER, result TEXT, signed_amount REAL NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'manual', forecast_type TEXT, fitid TEXT, transfer_group_id TEXT, subscription_id INTEGER, installment_group_id TEXT, installment_number INTEGER, installment_total INTEGER, settled_at TEXT, settlement_type TEXT, created_at TEXT);
    CREATE TABLE IF NOT EXISTS ofx_imports (id INTEGER PRIMARY KEY AUTOINCREMENT, imported_at TEXT, institution_id INTEGER, filename TEXT NOT NULL, file_hash TEXT NOT NULL UNIQUE, period_start TEXT, period_end TEXT, transactions_count INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS card_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, paid_at TEXT NOT NULL, card_id INTEGER, account_id INTEGER, period_month INTEGER NOT NULL, period_year INTEGER NOT NULL, amount REAL NOT NULL, transaction_id INTEGER);
    CREATE TABLE IF NOT EXISTS installment_groups (id TEXT PRIMARY KEY, description TEXT NOT NULL, principal_total REAL NOT NULL DEFAULT 0, installment_amount REAL NOT NULL DEFAULT 0, installments_count INTEGER NOT NULL DEFAULT 1, interest_total REAL NOT NULL DEFAULT 0, institution_id INTEGER, subcategory_id INTEGER, first_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Aberto', created_at TEXT);
    CREATE TABLE IF NOT EXISTS subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category_id INTEGER, subcategory_id INTEGER, institution_id INTEGER, billing_cycle TEXT NOT NULL, amount REAL NOT NULL, renewal_date TEXT, next_due_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Ativa', created_at TEXT);
    CREATE TABLE IF NOT EXISTS budgets (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, amount REAL NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, category_id INTEGER, subcategory_id INTEGER, status TEXT NOT NULL DEFAULT 'Ativo', created_at TEXT);
    CREATE TABLE IF NOT EXISTS attachments (id INTEGER PRIMARY KEY AUTOINCREMENT, transaction_id INTEGER, installment_group_id TEXT, subscription_id INTEGER, kind TEXT NOT NULL DEFAULT 'file', original_name TEXT NOT NULL, stored_name TEXT NOT NULL, mime_type TEXT, size INTEGER NOT NULL DEFAULT 0, created_at TEXT);
    CREATE TABLE IF NOT EXISTS rule_map (id INTEGER PRIMARY KEY AUTOINCREMENT, pattern TEXT UNIQUE NOT NULL, subcategory_id INTEGER, priority INTEGER NOT NULL DEFAULT 50);
    CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, instance_id TEXT, action TEXT NOT NULL, entity TEXT, entity_id TEXT, details TEXT);
    CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT);
  `;
}

function clearPortableTables(targetDb) {
  const ordered = [...portableTables].reverse();
  for (const table of ordered) targetDb.prepare(`DELETE FROM ${table}`).run();
}

function copySqliteTables(sourceDb, targetDb) {
  const run = targetDb.transaction(() => {
    clearPortableTables(targetDb);
    for (const table of portableTables) {
      const rows = sourceDb.prepare(`SELECT * FROM ${table}`).all();
      for (const row of rows) {
        const columns = Object.keys(row);
        if (!columns.length) continue;
        const placeholders = columns.map(() => "?").join(",");
        targetDb.prepare(`INSERT OR REPLACE INTO ${table}(${columns.join(",")}) VALUES (${placeholders})`).run(columns.map((column) => row[column]));
      }
    }
  });
  run();
}

function exportToSpreadsheet(target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const workbook = XLSX.utils.book_new();
  for (const table of portableTables) {
    const rows = db.prepare(`SELECT * FROM ${table}`).all();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), table.slice(0, 31));
  }
  XLSX.writeFile(workbook, target);
}

function importSpreadsheetToCurrent(sourcePath) {
  if (!fs.existsSync(sourcePath)) throw new Error("Planilha não encontrada.");
  const workbook = XLSX.readFile(sourcePath);
  const run = db.transaction(() => {
    clearPortableTables(db);
    for (const table of portableTables) {
      const sheet = workbook.Sheets[table.slice(0, 31)];
      if (!sheet) continue;
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
      for (const row of rows) {
        const columns = Object.keys(row);
        if (!columns.length) continue;
        const placeholders = columns.map(() => "?").join(",");
        db.prepare(`INSERT OR REPLACE INTO ${table}(${columns.join(",")}) VALUES (${placeholders})`).run(columns.map((column) => row[column]));
      }
    }
  });
  run();
}

async function migrateToSqlServer(config) {
  const sql = await import("mssql");
  const pool = await sql.connect(sqlServerConfig(config));
  try {
    await createSqlServerSchema(pool);
    const counts = {};
    for (const table of portableTables) {
      const rows = db.prepare(`SELECT * FROM ${table}`).all();
      counts[table] = rows.length;
      await pool.request().query(`DELETE FROM ${sqlServerIdentifier(table)}`);
      for (const row of rows) await insertSqlServerRow(pool, table, row);
    }
    return {
      counts,
      warnings: [
        "A migração envia as tabelas e configurações da instância atual. Arquivos físicos de anexos e mídias do Telegram continuam nas pastas locais configuradas.",
        "Instâncias familiares separadas usam bancos próprios; migre cada instância individualmente se quiser levar todas para outro destino.",
      ],
    };
  } finally {
    await pool.close();
  }
}

async function createSqlServerSchema(pool) {
  for (const table of portableTables) {
    const columns = sqliteTableInfo(table);
    if (!columns.length) continue;
    const primaryKeys = columns.filter((column) => column.pk).sort((a, b) => a.pk - b.pk).map((column) => column.name);
    const columnSql = columns.map((column) => `${sqlServerIdentifier(column.name)} ${sqliteColumnToSqlServer(column)}`).join(", ");
    const primaryKeySql = primaryKeys.length
      ? `, CONSTRAINT ${sqlServerIdentifier(`PK_${table}`)} PRIMARY KEY (${primaryKeys.map(sqlServerIdentifier).join(", ")})`
      : "";
    await pool.request().query(`
      IF OBJECT_ID(N'${table}', N'U') IS NULL
      BEGIN
        CREATE TABLE ${sqlServerIdentifier(table)} (${columnSql}${primaryKeySql});
      END
    `);
    for (const column of columns) {
      await pool.request().query(`
        IF COL_LENGTH(N'${table}', N'${column.name}') IS NULL
        BEGIN
          ALTER TABLE ${sqlServerIdentifier(table)} ADD ${sqlServerIdentifier(column.name)} ${sqliteColumnToSqlServer(column, true)};
        END
      `);
    }
  }
}

async function insertSqlServerRow(pool, table, row) {
  const columns = Object.keys(row);
  if (!columns.length) return;
  const request = pool.request();
  columns.forEach((column, index) => request.input(`p${index}`, row[column]));
  const columnList = columns.map(sqlServerIdentifier).join(",");
  const valueList = columns.map((_, index) => `@p${index}`).join(",");
  await request.query(`INSERT INTO ${sqlServerIdentifier(table)}(${columnList}) VALUES (${valueList})`);
}

function sqliteTableInfo(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all();
}

function sqlServerIdentifier(name) {
  return `[${String(name).replace(/]/g, "]]")}]`;
}

function sqliteColumnToSqlServer(column, forAlter = false) {
  const declared = String(column.type || "").toUpperCase();
  let type = "NVARCHAR(MAX)";
  if (declared.includes("INT")) type = "INT";
  else if (declared.includes("REAL") || declared.includes("FLOA") || declared.includes("DOUB")) type = "FLOAT";
  else if (["key", "id", "status", "type", "kind", "date", "created_at", "updated_at", "name"].includes(column.name)) type = "NVARCHAR(255)";
  else if (declared.includes("TEXT")) type = "NVARCHAR(MAX)";
  const nullable = forAlter ? "NULL" : column.notnull || column.pk ? "NOT NULL" : "NULL";
  return `${type} ${nullable}`;
}

app.get("/api/mapping", (_req, res) => {
  res.type("text/markdown").send(fs.readFileSync(path.join(root, "docs", "MAPEAMENTO-PLANILHA.md"), "utf8"));
});

function telegramApiUrl(method) {
  const token = getTelegramConfig().token;
  return `https://api.telegram.org/bot${token}/${method}`;
}

async function telegramCall(method, body) {
  const config = getTelegramConfig();
  if (!config.token) return null;
  const response = await fetch(telegramApiUrl(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.description || "Falha ao falar com Telegram.");
  return data.result;
}

function sendTelegramMessage(chatId, text, replyMarkup = null) {
  return telegramCall("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  }).catch((error) => console.warn("Telegram:", error.message));
}

async function sendTelegramMedia(chatId, media, caption = "") {
  const config = getTelegramConfig();
  if (!config.token || !media?.storedName) return null;
  const filePath = telegramMediaPath(media);
  if (!fs.existsSync(filePath)) return sendTelegramMessage(chatId, caption || "Mídia não encontrada para este alerta.");
  const method = media.kind === "audio" ? "sendAudio" : media.kind === "gif" ? "sendAnimation" : "sendPhoto";
  const field = media.kind === "audio" ? "audio" : media.kind === "gif" ? "animation" : "photo";
  const body = new FormData();
  body.append("chat_id", chatId);
  if (caption) {
    body.append("caption", caption.slice(0, 1000));
    body.append("parse_mode", "HTML");
  }
  const bytes = fs.readFileSync(filePath);
  body.append(field, new Blob([bytes], { type: media.mimeType || "application/octet-stream" }), media.originalName || media.storedName);
  try {
    const response = await fetch(telegramApiUrl(method), { method: "POST", body });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.description || "Falha ao enviar mídia ao Telegram.");
    return data.result;
  } catch (error) {
    console.warn("Telegram media:", error.message);
    return null;
  }
}

async function sendTelegramAlert(chatId, alert, message) {
  if (!alert?.media) return sendTelegramMessage(chatId, message);
  if (message.length > 1000) {
    await sendTelegramMessage(chatId, message);
    return sendTelegramMedia(chatId, alert.media, "");
  }
  return sendTelegramMedia(chatId, alert.media, message);
}

function answerTelegramCallback(callbackQueryId) {
  return telegramCall("answerCallbackQuery", { callback_query_id: callbackQueryId }).catch(() => {});
}

function parseTelegramAmount(text) {
  const matches = String(text || "").match(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*|\d+)(?:[,.](\d{1,2}))?/g) || [];
  const raw = matches.at(-1);
  if (!raw) return 0;
  const clean = raw.replace(/R\$/gi, "").trim().replace(/\./g, "").replace(",", ".");
  return Number(clean);
}

function inferTelegramResult(text) {
  const normalized = normalizeText(text);
  if (/(recebi|receita|ganhei|salario|salário|caiu|deposito|depósito|entrada)/i.test(normalized)) return "Receita";
  return "Despesa";
}

function defaultTelegramInstitutionId(result) {
  const account = one("SELECT id FROM institutions WHERE kind='Conta' ORDER BY name LIMIT 1");
  if (account) return account.id;
  const any = one("SELECT id FROM institutions ORDER BY id LIMIT 1");
  return any?.id || null;
}

function buildTelegramDraftFromData(instanceId, chatId, data) {
  return runInInstance(instanceId, () => {
    const amount = Number(data.amount || 0);
    if (!amount || !Number.isFinite(amount)) return { error: "Valor inválido para o lançamento guiado." };
    const result = data.result === "Receita" ? "Receita" : "Despesa";
    const signed = result === "Receita" ? amount : -amount;
    const description = String(data.description || "Telegram").trim().slice(0, 120);
    const suggestion = classifyOfxTransactionSafe({ note: description, type: "TELEGRAM", amount: signed });
    const selectedSubcategoryId = suggestion.apply ? suggestion.suggestedSubcategoryId : null;
    const selected = selectedSubcategoryId
      ? one(`
        SELECT s.id subcategoryId, s.name subcategoryName, c.id categoryId, c.name categoryName, c.type result
        FROM subcategories s JOIN categories c ON c.id=s.category_id WHERE s.id=?
      `, [selectedSubcategoryId])
      : null;
    const finalResult = selected?.result || result;
    const draft = {
      id: crypto.randomUUID(),
      instanceId,
      chatId,
      text: `${result} ${moneyText(amount)} ${description}`,
      amount,
      result: finalResult,
      date: new Date().toISOString().slice(0, 10),
      institutionId: defaultTelegramInstitutionId(finalResult),
      description,
      subcategoryId: selected?.subcategoryId || null,
      categoryId: selected?.categoryId || null,
      subcategoryName: selected?.subcategoryName || "Sem subcategoria",
      categoryName: selected?.categoryName || "Sem categoria",
    };
    telegramState.drafts.set(draft.id, draft);
    return { draft };
  });
}

async function startTelegramLaunchFlow(instanceId, chatId) {
  telegramState.flows.set(chatId, { instanceId, step: "kind", data: {} });
  await sendTelegramMessage(chatId, "Vamos lançar passo a passo. Primeiro, escolha o tipo:", {
    inline_keyboard: [[
      { text: "Entrada", callback_data: "tg_flow:kind:Receita" },
      { text: "Saída", callback_data: "tg_flow:kind:Despesa" },
    ]],
  });
}

async function handleTelegramFlowText(chatId, text) {
  const flow = telegramState.flows.get(chatId);
  if (!flow) return false;
  if (flow.step === "amount") {
    const amount = parseTelegramAmount(text);
    if (!amount) {
      await sendTelegramMessage(chatId, "Me envie o valor. Exemplo: <code>42,90</code>.");
      return true;
    }
    flow.data.amount = amount;
    flow.step = "description";
    telegramState.flows.set(chatId, flow);
    await sendTelegramMessage(chatId, "Agora me diga o que foi. Exemplo: <code>mercado</code>, <code>salário</code>, <code>restaurante</code>.");
    return true;
  }
  if (flow.step === "description") {
    flow.data.description = text;
    const result = buildTelegramDraftFromData(flow.instanceId, chatId, flow.data);
    telegramState.flows.delete(chatId);
    if (result.error) {
      await sendTelegramMessage(chatId, result.error);
      return true;
    }
    await sendTelegramMessage(chatId, telegramDraftMessage(result.draft), {
      inline_keyboard: [[
        { text: "Confirmar", callback_data: `tg_confirm:${result.draft.id}` },
        { text: "Cancelar", callback_data: `tg_cancel:${result.draft.id}` },
      ]],
    });
    return true;
  }
  return false;
}

async function handleTelegramFlowCallback(callback) {
  const parts = String(callback.data || "").split(":");
  const chatId = String(callback.message.chat.id);
  const flow = telegramState.flows.get(chatId);
  if (!flow || parts[1] !== "kind") return false;
  flow.data.result = parts[2] === "Receita" ? "Receita" : "Despesa";
  flow.step = "amount";
  telegramState.flows.set(chatId, flow);
  await sendTelegramMessage(chatId, `Tipo escolhido: <b>${flow.data.result}</b>.\nAgora envie o valor.`);
  return true;
}

function buildTelegramDraft(instanceId, chatId, text) {
  return runInInstance(instanceId, () => {
    const amount = parseTelegramAmount(text);
    if (!amount || !Number.isFinite(amount)) return { error: "Não encontrei o valor. Exemplo: <b>gastei 42,90 no mercado</b>." };
    const result = inferTelegramResult(text);
    const signed = result === "Receita" ? amount : -amount;
    const suggestion = classifyOfxTransactionSafe({ note: text, type: "TELEGRAM", amount: signed });
    const selectedSubcategoryId = suggestion.apply ? suggestion.suggestedSubcategoryId : null;
    const selected = selectedSubcategoryId
      ? one(`
        SELECT s.id subcategoryId, s.name subcategoryName, c.id categoryId, c.name categoryName, c.type result
        FROM subcategories s JOIN categories c ON c.id=s.category_id WHERE s.id=?
      `, [selectedSubcategoryId])
      : null;
    const finalResult = selected?.result || result;
    const draft = {
      id: crypto.randomUUID(),
      instanceId,
      chatId,
      text,
      amount,
      result: finalResult,
      date: new Date().toISOString().slice(0, 10),
      institutionId: defaultTelegramInstitutionId(finalResult),
      description: text.replace(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*|\d+)(?:[,.](\d{1,2}))?/g, "").trim().slice(0, 120) || "Telegram",
      subcategoryId: selected?.subcategoryId || null,
      categoryId: selected?.categoryId || null,
      subcategoryName: selected?.subcategoryName || "Sem subcategoria",
      categoryName: selected?.categoryName || "Sem categoria",
    };
    telegramState.drafts.set(draft.id, draft);
    return { draft };
  });
}

function telegramDraftMessage(draft) {
  return [
    "Revise o lançamento:",
    "",
    `<b>${draft.result}</b> · ${moneyText(draft.amount)}`,
    `Descrição: ${escapeHtml(draft.description)}`,
    `Categoria: ${escapeHtml(draft.categoryName)}`,
    `Subcategoria: ${escapeHtml(draft.subcategoryName)}`,
    "",
    "Confirmar?",
  ].join("\n");
}

function moneyText(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

function escapeHtml(text) {
  return String(text || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function currentMonthRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(endDate).padStart(2, "0")}`;
  return { year, month, start, end };
}

function telegramChatsForInstance(instanceId) {
  const bindings = getTelegramConfig().bindings || {};
  return Object.entries(bindings)
    .filter(([, boundInstanceId]) => boundInstanceId === instanceId)
    .map(([chatId]) => chatId);
}

function buildTelegramSystemMessage(type, customMessage = "") {
  const { start, end } = currentMonthRange();
  const title = customMessage || "Atualização do Financeiro Local";
  if (type === "budget-risk") {
    const alerts = budgetRows().filter((row) => row.status === "Ativo" && row.severity !== "ok");
    if (!alerts.length) return `<b>${escapeHtml(title)}</b>\nNenhum orçamento em alerta agora.`;
    return [
      `<b>${escapeHtml(title)}</b>`,
      "",
      ...alerts.slice(0, 8).map((row) => `${escapeHtml(row.name)}: ${row.used}% usado (${moneyText(row.spent)} de ${moneyText(row.amount)})`),
    ].join("\n");
  }

  if (type === "pending-forecast") {
    const rows = all(`
      SELECT date, description, amount, result
      FROM transactions
      WHERE status='Previsto' AND date BETWEEN ? AND ?
      ORDER BY date, amount DESC
      LIMIT 10
    `, [start, end]);
    const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    return [
      `<b>${escapeHtml(title)}</b>`,
      `${rows.length} previsto(s) no mês, total ${moneyText(total)}.`,
      "",
      ...rows.map((row) => `${row.date} · ${escapeHtml(row.result || "")} · ${moneyText(row.amount)} · ${escapeHtml(row.description)}`),
    ].join("\n");
  }

  if (type === "monthly-bills") {
    const rows = all(`
      SELECT COALESCE(i.name,'Sem cartão') card, SUM(t.amount) amount
      FROM transactions t
      LEFT JOIN institutions i ON i.id=t.institution_id
      WHERE t.status='Realizado' AND t.result='Fatura' AND t.date BETWEEN ? AND ?
      GROUP BY i.name
      ORDER BY amount DESC
      LIMIT 10
    `, [start, end]);
    const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    return [
      `<b>${escapeHtml(title)}</b>`,
      `Faturas realizadas no mês: ${moneyText(total)}.`,
      "",
      ...(rows.length ? rows.map((row) => `${escapeHtml(row.card)}: ${moneyText(row.amount)}`) : ["Nenhuma fatura realizada no mês."]),
    ].join("\n");
  }

  if (type === "weekly-close") {
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((day + 6) % 7));
    const from = monday.toISOString().slice(0, 10);
    const to = now.toISOString().slice(0, 10);
    const totals = one(`
      SELECT
        COALESCE(SUM(CASE WHEN result='Receita' THEN amount END),0) receita,
        COALESCE(SUM(CASE WHEN result='Despesa' THEN amount END),0) despesa,
        COALESCE(SUM(CASE WHEN result='Fatura' THEN amount END),0) fatura,
        COALESCE(SUM(signed_amount),0) saldo
      FROM transactions
      WHERE status='Realizado' AND date BETWEEN ? AND ?
    `, [from, to]);
    return [
      `<b>${escapeHtml(title)}</b>`,
      `Período: ${from} a ${to}`,
      `Receitas: ${moneyText(totals.receita)}`,
      `Despesas: ${moneyText(totals.despesa)}`,
      `Faturas: ${moneyText(totals.fatura)}`,
      `Saldo dos movimentos: ${moneyText(totals.saldo)}`,
    ].join("\n");
  }

  const totals = one(`
    SELECT
      COALESCE(SUM(CASE WHEN result='Receita' THEN amount END),0) receita,
      COALESCE(SUM(CASE WHEN result='Despesa' THEN amount END),0) despesa,
      COALESCE(SUM(CASE WHEN result='Fatura' THEN amount END),0) fatura,
      COALESCE(SUM(signed_amount),0) saldo
    FROM transactions
    WHERE status='Realizado' AND date BETWEEN ? AND ?
  `, [start, end]);
  const future = one("SELECT COALESCE(SUM(amount),0) total, COUNT(*) count FROM transactions WHERE status='Previsto' AND date BETWEEN ? AND ?", [start, end]);
  return [
    `<b>${escapeHtml(title)}</b>`,
    `Mês atual: ${start.slice(0, 7)}`,
    `Receitas: ${moneyText(totals.receita)}`,
    `Despesas: ${moneyText(totals.despesa)}`,
    `Faturas: ${moneyText(totals.fatura)}`,
    `Previstos: ${future.count} item(ns), ${moneyText(future.total)}`,
    `Saldo dos movimentos: ${moneyText(totals.saldo)}`,
  ].join("\n");
}

function buildTelegramTopCategoriesMessage(title = "Top categorias de despesa") {
  const { start, end } = currentMonthRange();
  const rows = all(`
    SELECT
      COALESCE(c.name,'Sem categoria') name,
      COUNT(t.id) transactions_count,
      SUM(t.amount) amount
    FROM transactions t
    LEFT JOIN categories c ON c.id=t.category_id
    WHERE t.status='Realizado' AND t.result='Despesa' AND t.date BETWEEN ? AND ?
    GROUP BY c.name
    ORDER BY amount DESC
    LIMIT 5
  `, [start, end]);
  const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  return [
    `<b>${escapeHtml(title)}</b>`,
    `Mês atual: ${start.slice(0, 7)}`,
    `Total no Top 5: ${moneyText(total)}`,
    "",
    ...(rows.length
      ? rows.map((row, index) => `${index + 1}. ${escapeHtml(row.name)}: ${moneyText(row.amount)} (${row.transactions_count} lançamento(s))`)
      : ["Sem despesas realizadas no mês."]),
  ].join("\n");
}

function telegramUserMention(user) {
  if (!user?.id) return "";
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "usuário";
  return `<a href="tg://user?id=${user.id}">${escapeHtml(name)}</a>`;
}

function renderTelegramCustomMessage(query, user, command) {
  const now = new Date();
  const instance = getInstance(getCurrentInstanceId());
  const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.username || "";
  const replacements = {
    "{{nome}}": escapeHtml(name || "usuário"),
    "{{usuario}}": escapeHtml(user?.username ? `@${user.username}` : name || "usuário"),
    "{{data}}": now.toLocaleDateString("pt-BR"),
    "{{hora}}": now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    "{{mes}}": now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
    "{{instancia}}": escapeHtml(instance?.name || getCurrentInstanceId()),
    "{{comando}}": escapeHtml(String(command || query.command || "")),
  };
  let text = escapeHtml(query.customMessage || query.title || "Mensagem personalizada.");
  for (const [token, value] of Object.entries(replacements)) {
    text = text.replaceAll(token, value);
  }
  const mention = query.mentionUser ? telegramUserMention(user) : "";
  return [mention, text].filter(Boolean).join("\n");
}

function buildTelegramQueryMessage(command, query = null, user = null) {
  const queryTypeMap = {
    summary: "daily-summary",
    budgets: "budget-risk",
    forecast: "pending-forecast",
    bills: "monthly-bills",
    "top-categories": "top-categories",
  };
  const mappedType = queryTypeMap[query?.type] || query?.type;
  if (mappedType === "custom-message") return renderTelegramCustomMessage(query, user, command);
  if (mappedType === "daily-summary") return buildTelegramSystemMessage("daily-summary", query.title || "Resumo do mês");
  if (mappedType === "top-categories") return buildTelegramTopCategoriesMessage(query.title || "Top categorias de despesa");
  if (mappedType) return buildTelegramSystemMessage(mappedType, query.title || "Consulta Telegram");

  const normalized = normalizeText(command).split(/\s+/)[0];
  if (normalized === "/orcamentos") return buildTelegramSystemMessage("budget-risk", "Consulta de orçamentos");
  if (normalized === "/previstos") return buildTelegramSystemMessage("pending-forecast", "Consulta de previstos");
  if (normalized === "/faturas") return buildTelegramSystemMessage("monthly-bills", "Consulta de faturas");
  if (normalized === "/top") return buildTelegramTopCategoriesMessage();
  if (normalized === "/ajuda" || normalized === "/help") {
    return [
      "<b>Comandos do Financeiro Local</b>",
      "/resumo - resumo do mês",
      "/orcamentos - orçamentos em alerta",
      "/previstos - previstos pendentes",
      "/faturas - faturas do mês",
      "/top - top categorias de despesa",
      "/lancar - lançamento guiado por perguntas",
      "",
      "Para lançar: envie algo como <code>gastei 42,90 no mercado</code>.",
    ].join("\n");
  }
  return buildTelegramSystemMessage("daily-summary", "Resumo do mês");
}

function sameLocalDate(a, b = new Date()) {
  if (!a) return false;
  const date = new Date(a);
  return date.toDateString() === b.toDateString();
}

function shouldRunTelegramAlert(alert, now = new Date()) {
  if (!alert.enabled) return false;
  const schedule = alert.schedule || {};
  const last = alert.lastSentAt ? new Date(alert.lastSentAt) : null;
  if (schedule.mode === "interval") {
    if (!last) return true;
    const unitMs = { minutes: 60_000, hours: 3_600_000, days: 86_400_000, weeks: 604_800_000 }[schedule.unit] || 86_400_000;
    return now.getTime() - last.getTime() >= Math.max(1, Number(schedule.every || 1)) * unitMs;
  }
  const [hour, minute] = String(schedule.time || "08:00").split(":").map(Number);
  const dueToday = (schedule.days || []).includes(now.getDay()) && now.getHours() === hour && now.getMinutes() >= minute;
  if (!dueToday || sameLocalDate(alert.lastSentAt, now)) return false;
  return true;
}

async function runTelegramAlertScheduler() {
  const config = getTelegramConfig();
  if (!config.enabled || !config.token) return;
  const instances = ensureInstancesRegistry().filter((instance) => instance.active !== false);
  for (const instance of instances) {
    const chats = telegramChatsForInstance(instance.id);
    if (!chats.length) continue;
    await runInInstance(instance.id, async () => {
      const alertConfig = getTelegramAlertsConfig();
      let changed = false;
      for (const alert of alertConfig.alerts) {
        if (!shouldRunTelegramAlert(alert)) continue;
        const message = buildTelegramSystemMessage(alert.type, alert.message || alert.title);
        await Promise.all(chats.map((chatId) => sendTelegramAlert(chatId, alert, message)));
        alert.lastSentAt = new Date().toISOString();
        changed = true;
      }
      if (changed) setTelegramAlertsConfig(alertConfig);
    });
  }
}

async function handleTelegramText(message) {
  const chatId = String(message.chat.id);
  const text = String(message.text || "").trim();
  const config = getTelegramConfig();
  const boundInstanceId = config.bindings?.[chatId];

  if (text.startsWith("/start") || normalizeText(text).startsWith("vincular")) {
    const code = text.split(/\s+/).find((part) => /^[A-F0-9]{8}$/i.test(part));
    if (!code) {
      await sendTelegramMessage(chatId, "Envie o código de vínculo gerado em <b>Avançado &gt; Telegram Bot</b>.\nExemplo: <code>/start ABCD1234</code>");
      return;
    }
    const link = config.links?.[code.toUpperCase()];
    if (!link || link.expiresAt < Date.now() || !getInstance(link.instanceId)) {
      await sendTelegramMessage(chatId, "Código inválido ou expirado. Gere outro código no sistema.");
      return;
    }
    config.bindings = { ...(config.bindings || {}), [chatId]: link.instanceId };
    delete config.links[code.toUpperCase()];
    saveTelegramConfig(config);
    const instance = getInstance(link.instanceId);
    await sendTelegramMessage(chatId, `Chat vinculado à instância <b>${escapeHtml(instance.name)}</b>. Agora envie algo como: <code>gastei 42,90 no mercado</code>.`);
    return;
  }

  if (!boundInstanceId) {
    await sendTelegramMessage(chatId, "Este Telegram ainda não está vinculado. Gere um código em <b>Avançado &gt; Telegram Bot</b> e envie aqui.");
    return;
  }

  if (text.startsWith("/cancelar")) {
    for (const [id, draft] of telegramState.drafts.entries()) {
      if (draft.chatId === chatId) telegramState.drafts.delete(id);
    }
    telegramState.flows.delete(chatId);
    await sendTelegramMessage(chatId, "Operação cancelada.");
    return;
  }

  if (text.startsWith("/lancar") || text.startsWith("/lançar")) {
    await startTelegramLaunchFlow(boundInstanceId, chatId);
    return;
  }

  if (text.startsWith("/")) {
    const response = runInInstance(boundInstanceId, () => {
      const queryConfig = getTelegramAlertsConfig();
      const command = normalizeText(text).split(/\s+/)[0];
      const found = (queryConfig.queries || []).find((item) => item.enabled !== false && normalizeText(item.command) === command);
      if (!found && !["/ajuda", "/help"].includes(command)) return "Comando não habilitado. Envie <code>/ajuda</code> para ver opções.";
      return buildTelegramQueryMessage(text, found, message.from);
    });
    await sendTelegramMessage(chatId, response);
    return;
  }

  if (await handleTelegramFlowText(chatId, text)) return;

  const result = buildTelegramDraft(boundInstanceId, chatId, text);
  if (result.error) {
    await sendTelegramMessage(chatId, result.error);
    return;
  }
  await sendTelegramMessage(chatId, telegramDraftMessage(result.draft), {
    inline_keyboard: [[
      { text: "Confirmar", callback_data: `tg_confirm:${result.draft.id}` },
      { text: "Cancelar", callback_data: `tg_cancel:${result.draft.id}` },
    ]],
  });
}

async function handleTelegramCallback(callback) {
  await answerTelegramCallback(callback.id);
  if (String(callback.data || "").startsWith("tg_flow:")) {
    if (await handleTelegramFlowCallback(callback)) return;
    await sendTelegramMessage(callback.message.chat.id, "Fluxo expirado. Envie <code>/lancar</code> para começar novamente.");
    return;
  }
  const [action, draftId] = String(callback.data || "").split(":");
  const draft = telegramState.drafts.get(draftId);
  if (!draft) {
    await sendTelegramMessage(callback.message.chat.id, "Esse lançamento expirou. Envie a mensagem novamente.");
    return;
  }
  if (action === "tg_cancel") {
    telegramState.drafts.delete(draftId);
    await sendTelegramMessage(draft.chatId, "Lançamento cancelado.");
    return;
  }
  if (action === "tg_confirm") {
    runInInstance(draft.instanceId, () => {
      const id = createTransaction({
        date: draft.date,
        description: draft.description,
        amount: draft.amount,
        institutionId: draft.institutionId,
        status: "Realizado",
        note: `Telegram: ${draft.text}`,
        result: draft.result,
        subcategoryId: draft.subcategoryId,
        categoryId: draft.categoryId,
        source: "telegram",
        settlementType: "Telegram",
      });
      auditLog("telegram_transaction_created", "transaction", id, { chatId: draft.chatId, result: draft.result });
    });
    telegramState.drafts.delete(draftId);
    await sendTelegramMessage(draft.chatId, `Lançamento criado: <b>${draft.result}</b> · ${moneyText(draft.amount)}.`);
  }
}

async function pollTelegram() {
  const config = getTelegramConfig();
  if (!config.enabled || !config.token) return;
  if (telegramState.polling) return;
  telegramState.polling = true;
  try {
    const updates = await telegramCall("getUpdates", {
      offset: telegramState.offset,
      timeout: 20,
      allowed_updates: ["message", "callback_query"],
    }) || [];
    for (const update of updates) {
      telegramState.offset = Math.max(telegramState.offset, update.update_id + 1);
      if (update.message?.text) await handleTelegramText(update.message);
      if (update.callback_query) await handleTelegramCallback(update.callback_query);
    }
  } catch (error) {
    console.warn("Telegram polling:", error.message);
  } finally {
    telegramState.polling = false;
  }
}

function syncTelegramBot() {
  if (telegramState.timer) {
    clearInterval(telegramState.timer);
    telegramState.timer = null;
  }
  if (telegramState.alertTimer) {
    clearInterval(telegramState.alertTimer);
    telegramState.alertTimer = null;
  }
  const config = getTelegramConfig();
  if (!config.enabled || !config.token) return;
  pollTelegram();
  runTelegramAlertScheduler();
  telegramState.timer = setInterval(pollTelegram, 2500);
  telegramState.alertTimer = setInterval(runTelegramAlertScheduler, 60_000);
}

const frontendDir = path.join(root, "dist");
if (fs.existsSync(path.join(frontendDir, "index.html"))) {
  app.use(express.static(frontendDir));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(frontendDir, "index.html"));
  });
}

initDb();
ensureInstancesRegistry();
ensureDefaultInstallPassword();
seedDb();
ensureCoreMappings();
syncTelegramBot();

const activeApiPort = normalizePort(process.env.PORT || getSetting("apiPort", "") || loadRuntimeConfig().apiPort, defaultPorts.apiPort);
if (process.env.FINANCEIRO_BOOTSTRAP_PASSWORD_ONLY === "1") {
  rootDb.close();
  process.exit(0);
}
app.listen(activeApiPort, "0.0.0.0", () => {
  console.log(`Financeiro API em http://0.0.0.0:${activeApiPort}`);
});
