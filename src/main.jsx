import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  Pie,
  PieChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowLeftRight,
  Banknote,
  CalendarClock,
  CreditCard,
  Database,
  FileInput,
  LayoutDashboard,
  ListChecks,
  RefreshCw,
  Settings2,
  Sparkles,
  Upload,
  Trash2,
  Save,
  Plus,
  X,
  ShieldAlert,
  Paperclip,
  Camera,
  Pencil,
  Lock,
  LogOut,
} from "lucide-react";
import "./styles.css";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const alphaPtBr = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });
const sortByNamePtBr = (rows) => [...rows].sort((a, b) => alphaPtBr.compare(a.name || "", b.name || ""));
const normalizeText = (text) => String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const THEMES = {
  aurora: {
    name: "Aurora",
    colors: { bg: "#081016", surface: "#111923", panel: "#111923", text: "#e7eef7", muted: "#8ca0b3", border: "#263341", primary: "#2dd4bf", secondary: "#f59e0b", danger: "#fb7185", chartReceita: "#2dd4bf", chartDespesa: "#fb7185", chartSubcategory: "#7dd3fc" },
  },
  claro: {
    name: "Claro executivo",
    colors: { bg: "#f6f8fb", surface: "#ffffff", panel: "#ffffff", text: "#172033", muted: "#607087", border: "#cfd8e3", primary: "#0f766e", secondary: "#b45309", danger: "#be123c", chartReceita: "#0f766e", chartDespesa: "#e11d48", chartSubcategory: "#2563eb" },
  },
  grafite: {
    name: "Grafite",
    colors: { bg: "#0b0d10", surface: "#15191f", panel: "#181d24", text: "#f4f7fb", muted: "#a8b3c2", border: "#303946", primary: "#38bdf8", secondary: "#a3e635", danger: "#f43f5e", chartReceita: "#38bdf8", chartDespesa: "#f43f5e", chartSubcategory: "#a3e635" },
  },
  floresta: {
    name: "Floresta",
    colors: { bg: "#07130f", surface: "#102019", panel: "#13261d", text: "#eef8f0", muted: "#9fb7a8", border: "#294436", primary: "#34d399", secondary: "#fbbf24", danger: "#fb7185", chartReceita: "#34d399", chartDespesa: "#f87171", chartSubcategory: "#fbbf24" },
  },
  oceano: {
    name: "Oceano",
    colors: { bg: "#07111f", surface: "#101b2d", panel: "#132238", text: "#eef6ff", muted: "#9ab0c8", border: "#294160", primary: "#22d3ee", secondary: "#f97316", danger: "#f43f5e", chartReceita: "#22d3ee", chartDespesa: "#f43f5e", chartSubcategory: "#60a5fa" },
  },
};
const chartModels = ["bar", "horizontal", "line", "area", "donut", "radial"];
const monthlyChartModels = ["area", "bar", "line", "composed"];
const DEFAULT_DASHBOARD_BLOCKS = {
  kpis: true,
  dashboardCategories: true,
  monthly: true,
  topCategories: true,
  topSubcategories: true,
  balances: true,
  latest: true,
};
const DEFAULT_EXTRA_DASHBOARDS = {
  netBalance: false,
  uncategorized: false,
  withoutSubcategory: false,
  transactionCount: false,
  budgetBalance: false,
};
const DEFAULT_DASHBOARD_RULES = {
  topCategoriesResult: "Despesa",
  topSubcategoriesResult: "Despesa",
  monthlyStatus: "Realizado",
};
const DEFAULT_APPEARANCE = {
  theme: "aurora",
  density: "comfortable",
  sidebarMode: "expanded",
  fabPosition: "right",
  dashboardModel: "default",
  dashboardChartSize: "normal",
  monthlyChartModel: "area",
  topLimit: 5,
  dashboardBlocks: DEFAULT_DASHBOARD_BLOCKS,
  extraDashboards: DEFAULT_EXTRA_DASHBOARDS,
  dashboardRules: DEFAULT_DASHBOARD_RULES,
  topCategoryChartModel: "bar",
  topSubcategoryChartModel: "bar",
  customColors: THEMES.aurora.colors,
};

function mergeAppearance(value = {}) {
  const theme = THEMES[value.theme] ? value.theme : DEFAULT_APPEARANCE.theme;
  return {
    theme,
    density: ["comfortable", "compact", "dense"].includes(value.density) ? value.density : "comfortable",
    sidebarMode: ["expanded", "compact"].includes(value.sidebarMode) ? value.sidebarMode : "expanded",
    fabPosition: ["right", "left"].includes(value.fabPosition) ? value.fabPosition : "right",
    dashboardModel: ["default", "compact", "contrast"].includes(value.dashboardModel) ? value.dashboardModel : "default",
    dashboardChartSize: ["compact", "normal", "large"].includes(value.dashboardChartSize) ? value.dashboardChartSize : "normal",
    monthlyChartModel: monthlyChartModels.includes(value.monthlyChartModel) ? value.monthlyChartModel : "area",
    topLimit: [5, 10].includes(Number(value.topLimit)) ? Number(value.topLimit) : 5,
    dashboardBlocks: { ...DEFAULT_DASHBOARD_BLOCKS, ...(value.dashboardBlocks || {}) },
    extraDashboards: { ...DEFAULT_EXTRA_DASHBOARDS, ...(value.extraDashboards || {}) },
    dashboardRules: { ...DEFAULT_DASHBOARD_RULES, ...(value.dashboardRules || {}) },
    topCategoryChartModel: chartModels.includes(value.topCategoryChartModel) ? value.topCategoryChartModel : "bar",
    topSubcategoryChartModel: chartModels.includes(value.topSubcategoryChartModel) ? value.topSubcategoryChartModel : "bar",
    customColors: { ...THEMES[theme].colors, ...(value.customColors || {}) },
  };
}

function themeStyle(appearance) {
  const c = mergeAppearance(appearance).customColors;
  return {
    "--app-bg": c.bg,
    "--app-surface": c.surface,
    "--app-panel": c.panel,
    "--app-text": c.text,
    "--app-muted": c.muted,
    "--app-border": c.border,
    "--app-primary": c.primary,
    "--app-secondary": c.secondary,
    "--app-danger": c.danger,
    "--chart-receita": c.chartReceita,
    "--chart-despesa": c.chartDespesa,
    "--chart-subcategory": c.chartSubcategory,
  };
}

function hexToRgb(hex) {
  const clean = String(hex || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(clean)) return null;
  return [0, 2, 4].map((start) => parseInt(clean.slice(start, start + 2), 16));
}

function contrastRatio(a, b) {
  const lum = (hex) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return 0;
    const values = rgb.map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
  };
  const [lighter, darker] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

function appearanceIssues(appearance) {
  const c = mergeAppearance(appearance).customColors;
  const checks = [
    ["Texto principal com fundo", c.text, c.bg],
    ["Texto principal nos painéis", c.text, c.panel],
    ["Texto secundário nos painéis", c.muted, c.panel],
    ["Botão primário com fundo", c.bg, c.primary],
    ["Cor de perigo com painel", c.danger, c.panel],
    ["Receitas no dashboard", c.chartReceita, c.panel],
    ["Despesas no dashboard", c.chartDespesa, c.panel],
    ["Subcategorias no dashboard", c.chartSubcategory, c.panel],
  ];
  return checks
    .map(([label, fg, bg]) => ({ label, ratio: contrastRatio(fg, bg) }))
    .filter((item) => item.ratio < 3);
}
const api = (url, options) => fetch(`/api${url}`, { credentials: "same-origin", ...options }).then(async (r) => {
  const text = await r.text();
  const type = r.headers.get("content-type") || "";
  let data = {};
  if (text && type.includes("application/json")) {
    data = JSON.parse(text);
  } else if (text && text.trim().startsWith("{")) {
    try {
      data = JSON.parse(text);
    } catch {
      data = {};
    }
  }
  if (!r.ok) throw new Error(data.error || `Falha na requisição (${r.status}). Atualize a página e tente novamente.`);
  if (text && !type.includes("application/json")) throw new Error("A API retornou uma página em vez de dados. Atualize a página e confirme o endereço de acesso.");
  return data;
});

const emptyTransactionForm = () => ({
  date: today(),
  status: "Realizado",
  forecastType: "",
  amount: "",
  purchaseAmount: "",
  installmentAmount: "",
  installments: 2,
  paidInstallments: 0,
  billingCycle: "Mensal",
  renewalDate: "",
  institution: "",
  subcategory: "",
  note: "",
  files: [],
  photos: [],
});

async function uploadAttachments(result, form) {
  let target = null;
  if (result?.group) target = ["installmentGroupId", result.group];
  else if (result?.transactionId) target = ["transactionId", result.transactionId];
  else if (result?.id) target = ["transactionId", result.id];

  if (!target) return;

  const send = async (files, kind) => {
    if (!files?.length) return;
    const body = new FormData();
    for (const file of files) body.append("files", file);
    body.append(target[0], target[1]);
    body.append("kind", kind);
    const response = await fetch("/api/attachments", { method: "POST", body });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Falha ao enviar anexo");
  };

  await send(form.files, "file");
  await send(form.photos, "camera");
}

async function saveTransactionForm(form) {
  if (form.status === "Previsto" && form.forecastType === "Parcela") {
    return api("/installments", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        ...form,
        firstDate: form.date,
        description: form.note || form.subcategory || "Parcelamento",
        installmentAmount: form.installmentAmount || form.amount,
        purchaseAmount: form.purchaseAmount || form.amount,
      }),
    });
  }

  if (form.status === "Previsto" && form.forecastType === "Assinatura") {
    return api("/subscriptions", {
      method: "POST",
      headers: jsonHeaders(),
      body: JSON.stringify({
        ...form,
        name: form.note || form.subcategory || "Assinatura",
        date: form.date,
        billingCycle: form.billingCycle,
        renewalDate: form.renewalDate || null,
      }),
    });
  }

  return api("/transactions", {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      ...form,
      forecastType: form.status === "Previsto" ? form.forecastType : null,
      description: form.subcategory || "Lançamento rápido",
    }),
  });
}

function TransactionFields({ form, setForm, config, modal = false }) {
  const gridClass = modal ? "form-grid modal-grid" : "form-grid transaction-form-grid";
  return (
    <div className={gridClass}>
      <Input label="Data" type="date" value={form.date} onChange={(date) => setForm({ ...form, date })} />
      <Select label="Instituição" value={form.institution} onChange={(institution) => setForm({ ...form, institution })} options={config.institutions.map((i) => i.name)} />
      <SmartSubcategorySelect value={form.subcategory} onChange={(subcategory) => setForm({ ...form, subcategory })} subcategories={config.subcategories} />
      <Input label="Valor" type="number" value={form.amount} onChange={(amount) => setForm({ ...form, amount })} />
      <Select label="Status" value={form.status} onChange={(status) => setForm({ ...form, status, forecastType: status === "Realizado" ? "" : form.forecastType })} options={["Realizado", "Previsto"]} />
      {form.status === "Previsto" && (
        <Select label="Tipo do previsto" value={form.forecastType} onChange={(forecastType) => setForm({ ...form, forecastType })} options={["Parcela", "Assinatura", "Conta futura", "Recorrente", "Receita esperada", "Compra planejada"]} />
      )}
      <Input className="wide-field" label="Observação" value={form.note} onChange={(note) => setForm({ ...form, note })} />
      <AttachmentPicker form={form} setForm={setForm} />
      {form.status === "Previsto" && form.forecastType === "Assinatura" && (
        <>
          <Select label="Ciclo" value={form.billingCycle} onChange={(billingCycle) => setForm({ ...form, billingCycle })} options={["Mensal", "Anual"]} />
          {form.billingCycle === "Anual" && (
            <Input label="Renovação opcional" type="date" value={form.renewalDate} onChange={(renewalDate) => setForm({ ...form, renewalDate })} />
          )}
        </>
      )}
      {form.status === "Previsto" && form.forecastType === "Parcela" && (
        <>
          <Input label="Valor da compra" type="number" value={form.purchaseAmount} onChange={(purchaseAmount) => setForm({ ...form, purchaseAmount })} />
          <Input label="Valor da parcela" type="number" value={form.installmentAmount} onChange={(installmentAmount) => setForm({ ...form, installmentAmount })} />
          <Input label="Quantidade de parcelas" type="number" value={form.installments} onChange={(installments) => setForm({ ...form, installments })} />
          <Input label="Parcelas já pagas" type="number" value={form.paidInstallments} onChange={(paidInstallments) => setForm({ ...form, paidInstallments })} />
        </>
      )}
    </div>
  );
}

function AttachmentPicker({ form, setForm }) {
  const fileCount = (form.files?.length || 0) + (form.photos?.length || 0);
  return (
    <div className="attachment-picker">
      <label className="attachment-button" title="Anexar arquivo">
        <Paperclip size={18} />
        <input type="file" multiple onChange={(e) => setForm({ ...form, files: Array.from(e.target.files || []) })} />
      </label>
      <label className="attachment-button" title="Tirar foto">
        <Camera size={18} />
        <input type="file" accept="image/*" capture="environment" onChange={(e) => setForm({ ...form, photos: Array.from(e.target.files || []) })} />
      </label>
      <span>{fileCount ? `${fileCount} anexo(s)` : "Sem anexos"}</span>
    </div>
  );
}

function App() {
  const [active, setActive] = useState("dashboard");
  const [summary, setSummary] = useState(null);
  const [config, setConfig] = useState({ institutions: [], categories: [], subcategories: [], runtime: { apiPort: 6397, clientPort: 5179, activeApiPort: 6397 } });
  const [transactions, setTransactions] = useState([]);
  const [message, setMessageState] = useState(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [appearance, setAppearance] = useState(() => mergeAppearance(JSON.parse(localStorage.getItem("financeiroAppearance") || "{}")));
  const [auth, setAuth] = useState({ loading: true, authenticated: false, setupRequired: false });
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: "" };
  });

  const refresh = async () => {
    if (!auth.authenticated) return;
    const periodQuery = new URLSearchParams(
      Object.entries(period)
        .filter(([, value]) => value !== "" && value !== null && value !== undefined)
        .map(([key, value]) => [key, String(value)])
    ).toString();
    const [s, c, t] = await Promise.all([
      api(`/summary?${periodQuery}`),
      api("/config"),
      api(`/transactions?limit=250&${periodQuery}`),
    ]);
    setSummary(s);
    setConfig(c);
    setTransactions(t);
  };

  const setMessage = (value, type = "success") => {
    if (!value) return setMessageState(null);
    if (typeof value === "object") return setMessageState(value);
    const inferredType = /(erro|falha|inválid|obrigat|não |nao |já existe|ja existe|duplicad|bloquead|conflito|vinculad|possui|não encontrado|nao encontrado)/i.test(value)
      ? "error"
      : type;
    setMessageState({ text: value, type: inferredType });
  };

  useEffect(() => {
    api("/auth/status")
      .then((status) => setAuth({ loading: false, ...status }))
      .catch(() => setAuth({ loading: false, authenticated: false, setupRequired: false }));
  }, []);

  useEffect(() => {
    if (!auth.authenticated) return;
    refresh().catch((e) => setMessage(e.message));
  }, [auth.authenticated, period.year, period.month, period.day]);

  useEffect(() => {
    if (!auth.authenticated) return;
    api("/settings")
      .then((settings) => {
        const next = mergeAppearance(settings.appearance);
        setAppearance(next);
        localStorage.setItem("financeiroAppearance", JSON.stringify(next));
      })
      .catch(() => {});
  }, [auth.authenticated]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessageState(null), 3500);
    return () => window.clearTimeout(timer);
  }, [message]);

  const nav = [
    ["dashboard", LayoutDashboard, "Painel"],
    ["transactions", ListChecks, "Lançamentos"],
    ["ofx", FileInput, "OFX"],
    ["installments", CalendarClock, "Parcelas"],
    ["subscriptions", RefreshCw, "Assinaturas"],
    ["budgets", Banknote, "Orçamento"],
    ["cards", CreditCard, "Faturas"],
    ["transfer", ArrowLeftRight, "Transferir"],
    ["settings", Settings2, "Cadastros"],
    ["advanced", ShieldAlert, "Avançado"],
    ["rules", Settings2, "Mapa"],
  ];

  const logout = async () => {
    await api("/auth/logout", { method: "POST", headers: jsonHeaders(), body: "{}" }).catch(() => {});
    setAuth({ loading: false, authenticated: false, setupRequired: false });
    setSummary(null);
    setTransactions([]);
  };

  if (auth.loading) return <AuthShell title="Carregando segurança" subtitle="Validando sessão local..." />;
  if (!auth.authenticated) {
    return (
      <AuthGate
        setupRequired={auth.setupRequired}
        onAuthenticated={(status) => setAuth({ loading: false, ...status, authenticated: true, setupRequired: false })}
      />
    );
  }

  return (
    <div className={`app-shell dashboard-${appearance.dashboardModel} dashboard-chart-size-${appearance.dashboardChartSize} density-${appearance.density} sidebar-${appearance.sidebarMode} fab-${appearance.fabPosition}`} style={themeStyle(appearance)}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Sparkles size={20} /></div>
          <div>
            <strong>Financeiro Local</strong>
            <span>SQLite + regras migradas</span>
          </div>
        </div>
        <nav>
          {nav.map(([key, Icon, label]) => (
            <button key={key} className={active === key ? "active" : ""} onClick={() => setActive(key)}>
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <button className="sync" onClick={() => refresh().catch((e) => setMessage(e.message))}>
          <RefreshCw size={16} /> Atualizar
        </button>
        <button className="sync logout-button" onClick={logout}>
          <LogOut size={16} /> Sair
        </button>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <p>Projeto web local</p>
            <h1>{nav.find(([key]) => key === active)?.[2]}</h1>
          </div>
          <div className="topbar-actions">
            <BudgetTopbar budgets={summary?.budgets?.items || []} />
            <PeriodFilter period={period} setPeriod={setPeriod} />
            <div className="status-pill"><Database size={16} /> Porta API {config.runtime?.activeApiPort || config.runtime?.apiPort || 6397}</div>
          </div>
        </header>
        {message && <div className={`toast ${message.type || "success"}`} onClick={() => setMessageState(null)}>{message.text}</div>}
        <button className="fab" onClick={() => setQuickOpen(true)} title="Novo lançamento">
          <Plus size={28} />
        </button>
        {quickOpen && (
          <QuickTransactionModal
            config={config}
            onClose={() => setQuickOpen(false)}
            onSaved={() => {
              setQuickOpen(false);
              setMessage("Lançamento criado.");
              refresh();
            }}
            setMessage={setMessage}
          />
        )}

        <motion.section
          key={active}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="content"
        >
          {active === "dashboard" && <Dashboard summary={summary} transactions={transactions} appearance={appearance} />}
          {active === "transactions" && <Transactions transactions={transactions} config={config} onSaved={refresh} setMessage={setMessage} />}
          {active === "ofx" && <OfxImport config={config} onSaved={refresh} setMessage={setMessage} />}
          {active === "installments" && <Installments config={config} onSaved={refresh} setMessage={setMessage} />}
          {active === "subscriptions" && <Subscriptions config={config} onSaved={refresh} setMessage={setMessage} />}
          {active === "budgets" && <Budgets config={config} onSaved={refresh} setMessage={setMessage} />}
          {active === "cards" && <CardPayment config={config} onSaved={refresh} setMessage={setMessage} />}
          {active === "transfer" && <Transfer config={config} onSaved={refresh} setMessage={setMessage} />}
          {active === "settings" && <Settings config={config} onSaved={refresh} setMessage={setMessage} />}
          {active === "advanced" && <AdvancedSettings onSaved={refresh} setMessage={setMessage} appearance={appearance} onAppearanceChange={setAppearance} />}
          {active === "rules" && <RuleMap config={config} onSaved={refresh} setMessage={setMessage} />}
        </motion.section>
      </main>
    </div>
  );
}

function QuickTransactionModal({ config, onClose, onSaved, setMessage }) {
  const [form, setForm] = useState(emptyTransactionForm);

  const save = async (e) => {
    e.preventDefault();
    try {
      const result = await saveTransactionForm(form);
      await uploadAttachments(result, form);
      onSaved();
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <motion.form
        className="quick-modal"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22 }}
        onSubmit={save}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span>Novo</span>
            <h2>Lançamento rápido</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} title="Fechar">
            <X size={18} />
          </button>
        </div>
        <TransactionFields form={form} setForm={setForm} config={config} modal />
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
          <button className="primary">Salvar lançamento</button>
        </div>
      </motion.form>
    </div>
  );
}

function ConfirmDialog({ open, title, body, confirmLabel = "Confirmar", cancelLabel = "Cancelar", intent = "danger", busy = false, onCancel, onConfirm }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop confirm-backdrop" onMouseDown={onCancel}>
      <motion.div
        className={`confirm-dialog ${intent}`}
        initial={{ opacity: 0, y: 18, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18 }}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="confirm-icon"><ShieldAlert size={22} /></div>
        <div>
          <h2>{title}</h2>
          <p>{body}</p>
        </div>
        <div className="confirm-actions">
          <button type="button" className="secondary" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button type="button" className={`primary ${intent === "danger" ? "danger-action" : ""}`} onClick={onConfirm} disabled={busy}>
            {busy ? "Processando..." : confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function AuthShell({ title, subtitle, children }) {
  return (
    <div className="auth-shell">
      <motion.div className="auth-card" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
        <div className="brand-mark"><Lock size={20} /></div>
        <div>
          <span>Financeiro Local</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

function AuthGate({ setupRequired, onAuthenticated }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isSetup = setupRequired;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (isSetup && password !== confirm) {
      setError("As senhas não conferem.");
      return;
    }
    setBusy(true);
    try {
      await api(isSetup ? "/auth/setup" : "/auth/login", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ password }),
      });
      const status = await api("/auth/status");
      onAuthenticated(status);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title={isSetup ? "Defina a senha de acesso" : "Acesse o sistema"}
      subtitle={isSetup ? "Essa senha protege o uso pela rede local e pela VPN." : "Digite a senha local para abrir o financeiro."}
    >
      <form className="auth-form" onSubmit={submit}>
        <Input label="Senha" type="password" value={password} onChange={setPassword} />
        {isSetup && <Input label="Confirmar senha" type="password" value={confirm} onChange={setConfirm} />}
        {error && <div className="auth-error">{error}</div>}
        <button className="primary" disabled={busy}>{busy ? "Validando..." : isSetup ? "Criar senha" : "Entrar"}</button>
      </form>
    </AuthShell>
  );
}

function PeriodFilter({ period, setPeriod }) {
  const years = Array.from({ length: 7 }, (_, index) => new Date().getFullYear() - 3 + index);
  const months = [
    ["", "Todos"],
    [1, "Jan"],
    [2, "Fev"],
    [3, "Mar"],
    [4, "Abr"],
    [5, "Mai"],
    [6, "Jun"],
    [7, "Jul"],
    [8, "Ago"],
    [9, "Set"],
    [10, "Out"],
    [11, "Nov"],
    [12, "Dez"],
  ];
  const days = [["", "Dia"], ...Array.from({ length: 31 }, (_, index) => [index + 1, String(index + 1).padStart(2, "0")])];
  const resetToCurrentMonth = () => {
    const now = new Date();
    setPeriod({ year: now.getFullYear(), month: now.getMonth() + 1, day: "" });
  };

  return (
    <div className="period-filter" aria-label="Filtro de período">
      <select value={period.day} onChange={(e) => setPeriod({ ...period, day: e.target.value })} title="Dia">
        {days.map(([value, label]) => <option key={label} value={value}>{label}</option>)}
      </select>
      <select value={period.month} onChange={(e) => setPeriod({ ...period, month: e.target.value, day: "" })} title="Mês">
        {months.map(([value, label]) => <option key={label} value={value}>{label}</option>)}
      </select>
      <select value={period.year} onChange={(e) => setPeriod({ ...period, year: e.target.value })} title="Ano">
        {years.map((year) => <option key={year} value={year}>{year}</option>)}
      </select>
      <button type="button" onClick={resetToCurrentMonth}>Mês atual</button>
    </div>
  );
}

function BudgetTopbar({ budgets }) {
  const activeBudgets = (budgets || []).filter((budget) => budget.status === "Ativo");
  if (!activeBudgets.length) return null;
  return (
    <div className="budget-topbar-list" aria-label="Orçamentos ativos">
      {activeBudgets.map((budget) => {
        const used = Number(budget.used || 0);
        const cappedUsed = Math.max(0, Math.min(100, used));
        const overLimit = Math.max(0, used - 100);
        return (
          <div
            className={`budget-pill ${budget.severity || "ok"}`}
            key={budget.id}
            style={{ "--budget-fill": `${cappedUsed}%` }}
            title={`${budget.name}: ${used}% usado (${money.format(budget.spent || 0)} de ${money.format(budget.amount || 0)})`}
          >
            <span>{budget.name}</span>
            <strong>{used}%</strong>
            {overLimit > 0 && <em>+{Math.round(overLimit)}%</em>}
          </div>
        );
      })}
    </div>
  );
}

function Dashboard({ summary, transactions, appearance }) {
  const [budgetAlertsCollapsed, setBudgetAlertsCollapsed] = useState(false);
  if (!summary) return <Empty title="Carregando dados" />;
  const appliedAppearance = mergeAppearance(appearance);
  const colors = appliedAppearance.customColors;
  const blocks = appliedAppearance.dashboardBlocks;
  const extras = appliedAppearance.extraDashboards;
  const rules = appliedAppearance.dashboardRules;
  const topLimit = appliedAppearance.topLimit;
  const filterByResult = (items, result) => result === "Todos" ? items : items.filter((item) => item.result === result);
  const topCategories = filterByResult(summary.byCategory || [], rules.topCategoriesResult).slice(0, topLimit);
  const topSubcategories = filterByResult(summary.bySubcategory || [], rules.topSubcategoriesResult).slice(0, topLimit);
  const uncategorizedTotal = transactions.filter((t) => !t.category).reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const withoutSubcategoryTotal = transactions.filter((t) => !t.subcategory).reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const extraCards = [
    extras.netBalance && ["Saldo líquido", summary.totals.saldo_movimentos, "income"],
    extras.uncategorized && ["Sem categoria", uncategorizedTotal, "future"],
    extras.withoutSubcategory && ["Sem subcategoria", withoutSubcategoryTotal, "expense"],
    extras.transactionCount && ["Lançamentos", transactions.length, "card", "count"],
    extras.budgetBalance && ["Orçamento livre", summary.budgets?.remaining || 0, (summary.budgets?.remaining || 0) < 0 ? "expense" : "income"],
  ].filter(Boolean);
  const cards = [
    ["Receitas", summary.totals.receita, "income"],
    ["Despesas", summary.totals.despesa, "expense"],
    ["Faturas", summary.totals.fatura, "card"],
    ["Previstos", summary.future.total, "future"],
  ];
  return (
    <>
      {blocks.kpis && (
        <section className="kpi-grid">
          {[...cards, ...extraCards].map(([label, value, tone, kind]) => (
            <motion.div className={`kpi ${tone}`} key={label} whileHover={{ y: -4 }}>
              <span>{label}</span>
              <strong>{kind === "count" ? value || 0 : money.format(value || 0)}</strong>
            </motion.div>
          ))}
        </section>
      )}

      <section className="dashboard-grid">
        {summary.budgets?.alerts?.length > 0 && (
          <div className={`panel wide budget-alert-panel ${budgetAlertsCollapsed ? "collapsed" : ""}`}>
            <div className="budget-alert-panel-head">
              <PanelTitle icon={Banknote} title="Alertas de Orçamento" />
              <button type="button" className="ghost compact" onClick={() => setBudgetAlertsCollapsed((value) => !value)}>
                {budgetAlertsCollapsed ? "Expandir" : "Recolher"}
              </button>
            </div>
            {!budgetAlertsCollapsed && (
              <div className="budget-alert-list">
                {summary.budgets.alerts.slice(0, 6).map((budget) => (
                  <div className={`budget-alert ${budget.severity}`} key={budget.id}>
                    <strong>{budget.name}</strong>
                    <span>{budget.used}% usado · {money.format(budget.spent)} de {money.format(budget.amount)}</span>
                    <small>{budget.remaining < 0 ? `Estourou ${money.format(Math.abs(budget.remaining))}` : `Restam ${money.format(budget.remaining)}`}</small>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {blocks.dashboardCategories && summary.dashboardCategories?.length > 0 && (
          <div className="panel wide">
            <PanelTitle icon={LayoutDashboard} title="Categorias no painel" />
            <div className="category-panel-grid">
              {summary.dashboardCategories.map((category) => (
                <div className="category-panel" key={category.id}>
                  <span>{category.type}</span>
                  <strong>{category.name}</strong>
                  <div>
                    <p>Confirmado: {money.format(category.confirmed_amount || 0)}</p>
                    <p>Previsto: {money.format(category.planned_amount || 0)}</p>
                    <p>Lançamentos: {category.transactions_count || 0}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {blocks.monthly && <div className="panel wide">
          <PanelTitle icon={Banknote} title="Fluxo Mensal" />
          <div className="monthly-chart-area">
            <ResponsiveContainer width="100%" height="100%">
              <MonthlyChart data={summary.monthly} model={appliedAppearance.monthlyChartModel} colors={colors} />
            </ResponsiveContainer>
          </div>
        </div>}

        {blocks.topCategories && <div className="panel">
          <PanelTitle icon={CreditCard} title={`Top Categorias${rules.topCategoriesResult !== "Todos" ? ` · ${rules.topCategoriesResult}` : ""}`} />
          <div className="top-chart-area">
            <TopChart data={topCategories} model={appliedAppearance.topCategoryChartModel} colors={colors} expenseColor={colors.secondary} />
          </div>
          <div className="ranking-list">
            {topCategories.map((item, index) => (
              <div key={`${item.name}-${item.result}-${index}`}>
                <span>{index + 1}. {item.name}<small>{item.result || "Sem tipo"}</small></span>
                <strong>{money.format(item.value || 0)}</strong>
              </div>
            ))}
          </div>
        </div>}

        {blocks.topSubcategories && <div className="panel">
          <PanelTitle icon={ListChecks} title={`Top Subcategorias${rules.topSubcategoriesResult !== "Todos" ? ` · ${rules.topSubcategoriesResult}` : ""}`} />
          {topSubcategories.length ? (
            <>
              <div className="top-chart-area">
                <TopChart data={topSubcategories} model={appliedAppearance.topSubcategoryChartModel} colors={colors} expenseColor={colors.chartSubcategory} showCategory />
              </div>
              <div className="ranking-list">
                {topSubcategories.map((item, index) => (
                  <div key={`${item.name}-${item.category}-${index}`}>
                    <span>{index + 1}. {item.name}<small>{item.category}</small></span>
                    <strong>{money.format(item.value || 0)}</strong>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="muted">Sem subcategorias realizadas no período selecionado.</p>
          )}
        </div>}

        {blocks.balances && <div className="panel">
          <PanelTitle icon={Database} title="Saldos" />
          <div className="balance-list">
            {summary.balances.map((b) => (
              <div key={b.id}>
                <span>{b.name}</span>
                <strong>{b.kind === "Cartão" ? "Cartão" : money.format(b.balance || 0)}</strong>
              </div>
            ))}
          </div>
        </div>}

        {blocks.latest && <div className="panel wide">
          <PanelTitle icon={ListChecks} title="Últimos lançamentos" />
          <TransactionTable rows={transactions.slice(0, 8)} compact />
        </div>}
      </section>
    </>
  );
}

function TopChart({ data, model, colors, expenseColor, showCategory = false }) {
  const tooltipProps = {
    formatter: (v) => money.format(v),
    labelFormatter: (label) => {
      if (!showCategory) return label;
      const item = data?.find((entry) => entry.name === label);
      return item?.category ? `${label} · ${item.category}` : label;
    },
    contentStyle: { background: colors.panel, border: `1px solid ${colors.border}` },
  };

  if (model === "horizontal") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 18, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
          <XAxis type="number" stroke={colors.muted} />
          <YAxis type="category" dataKey="name" width={88} stroke={colors.muted} tick={{ fontSize: 11 }} />
          <Tooltip {...tooltipProps} />
          <Bar dataKey="value" barSize={24} minPointSize={3} radius={[0, 6, 6, 0]}>
            {data.map((item, index) => <Cell key={index} fill={item.result === "Receita" ? colors.chartReceita : expenseColor} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (model === "line") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
          <XAxis dataKey="name" hide />
          <YAxis stroke={colors.muted} />
          <Tooltip {...tooltipProps} />
          <Line type="monotone" dataKey="value" stroke={expenseColor} strokeWidth={3} dot={{ r: 4, fill: colors.chartReceita }} activeDot={{ r: 6 }} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (model === "area") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`top-area-${showCategory ? "sub" : "cat"}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={expenseColor} stopOpacity={0.75} />
              <stop offset="95%" stopColor={expenseColor} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
          <XAxis dataKey="name" hide />
          <YAxis stroke={colors.muted} />
          <Tooltip {...tooltipProps} />
          <Area type="monotone" dataKey="value" stroke={expenseColor} fill={`url(#top-area-${showCategory ? "sub" : "cat"})`} strokeWidth={3} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  if (model === "donut") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip {...tooltipProps} />
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="48%"
            outerRadius="78%"
            paddingAngle={3}
            stroke={colors.panel}
            strokeWidth={2}
          >
            {data.map((item, index) => (
              <Cell key={index} fill={item.result === "Receita" ? colors.chartReceita : index % 2 ? expenseColor : colors.secondary} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (model === "radial") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart innerRadius="18%" outerRadius="92%" data={data.map((item, index) => ({ ...item, fill: item.result === "Receita" ? colors.chartReceita : index % 2 ? expenseColor : colors.secondary }))} startAngle={90} endAngle={-270}>
          <Tooltip {...tooltipProps} />
          <RadialBar dataKey="value" cornerRadius={8} background={{ fill: colors.surface }} />
        </RadialBarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
        <XAxis dataKey="name" hide />
        <YAxis stroke={colors.muted} />
        <Tooltip {...tooltipProps} />
        <Bar dataKey="value" barSize={showCategory ? 42 : 62} minPointSize={3} radius={[6, 6, 0, 0]}>
          {data.map((item, index) => <Cell key={index} fill={item.result === "Receita" ? colors.chartReceita : expenseColor} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function MonthlyChart({ data, model, colors }) {
  const tooltip = { formatter: (v) => money.format(v), contentStyle: { background: colors.panel, border: `1px solid ${colors.border}` } };
  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke={colors.border} />
      <XAxis dataKey="period" stroke={colors.muted} />
      <YAxis stroke={colors.muted} />
      <Tooltip {...tooltip} />
    </>
  );

  if (model === "bar") {
    return (
      <BarChart data={data}>
        {axes}
        <Bar dataKey="receita" fill={colors.chartReceita} radius={[6, 6, 0, 0]} />
        <Bar dataKey="despesa" fill={colors.chartDespesa} radius={[6, 6, 0, 0]} />
      </BarChart>
    );
  }

  if (model === "line") {
    return (
      <LineChart data={data}>
        {axes}
        <Line type="monotone" dataKey="receita" stroke={colors.chartReceita} strokeWidth={3} dot={{ r: 4 }} />
        <Line type="monotone" dataKey="despesa" stroke={colors.chartDespesa} strokeWidth={3} dot={{ r: 4 }} />
      </LineChart>
    );
  }

  if (model === "composed") {
    return (
      <ComposedChart data={data}>
        {axes}
        <Bar dataKey="despesa" fill={colors.chartDespesa} radius={[6, 6, 0, 0]} />
        <Line type="monotone" dataKey="receita" stroke={colors.chartReceita} strokeWidth={3} dot={{ r: 4 }} />
      </ComposedChart>
    );
  }

  return (
    <AreaChart data={data}>
      <defs>
        <linearGradient id="receita" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor={colors.chartReceita} stopOpacity={0.8} />
          <stop offset="95%" stopColor={colors.chartReceita} stopOpacity={0.05} />
        </linearGradient>
        <linearGradient id="despesa" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor={colors.chartDespesa} stopOpacity={0.75} />
          <stop offset="95%" stopColor={colors.chartDespesa} stopOpacity={0.05} />
        </linearGradient>
      </defs>
      {axes}
      <Area type="monotone" dataKey="receita" stroke={colors.chartReceita} fill="url(#receita)" />
      <Area type="monotone" dataKey="despesa" stroke={colors.chartDespesa} fill="url(#despesa)" />
    </AreaChart>
  );
}

function Transactions({ transactions, config, onSaved, setMessage }) {
  const [form, setForm] = useState(emptyTransactionForm);
  const [editing, setEditing] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    try {
      const result = await saveTransactionForm(form);
      await uploadAttachments(result, form);
      setMessage(form.status === "Previsto" && form.forecastType ? `${form.forecastType} criada.` : "Lançamento criado.");
      setForm({ ...emptyTransactionForm(), institution: form.institution, status: form.status });
      onSaved();
    } catch (error) {
      setMessage(error.message);
    }
  };
  return (
    <>
      <FormPanel title="Novo lançamento" onSubmit={save} className="transaction-panel">
        <TransactionFields form={form} setForm={setForm} config={config} />
      </FormPanel>
      <div className="panel">
        <PanelTitle icon={ListChecks} title="Tabela de lançamentos" />
        <TransactionTable
          rows={transactions}
          onEdit={(row) => setEditing(transactionToForm(row))}
          onDelete={(row) => setPendingDelete(row)}
        />
      </div>
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Excluir lançamento?"
        body={`Isso remove "${pendingDelete?.description || "este lançamento"}" da base. Essa ação não pode ser desfeita automaticamente.`}
        confirmLabel="Excluir"
        busy={deleting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          setDeleting(true);
          try {
            await api(`/transactions/${pendingDelete.id}`, { method: "DELETE" });
            setMessage("Lançamento excluído.");
            setPendingDelete(null);
            onSaved();
          } catch (error) {
            setMessage(error.message);
          } finally {
            setDeleting(false);
          }
        }}
      />
      {editing && (
        <EditTransactionModal
          row={editing}
          config={config}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setMessage("Lançamento atualizado.");
            onSaved();
          }}
          setMessage={setMessage}
        />
      )}
    </>
  );
}

function transactionToForm(row) {
  return {
    id: row.id,
    date: row.date,
    status: row.status || "Realizado",
    forecastType: row.forecast_type || "",
    amount: row.amount ?? "",
    purchaseAmount: "",
    installmentAmount: "",
    installments: 2,
    paidInstallments: 0,
    billingCycle: "Mensal",
    renewalDate: "",
    institution: row.institution || "",
    subcategory: row.subcategory || "",
    note: row.note || "",
    files: [],
    photos: [],
  };
}

function EditTransactionModal({ row, config, onClose, onSaved, setMessage }) {
  const [form, setForm] = useState(row);
  const save = async (e) => {
    e.preventDefault();
    try {
      await api(`/transactions/${form.id}`, {
        method: "PUT",
        headers: jsonHeaders(),
        body: JSON.stringify({ ...form, description: form.subcategory || row.description }),
      });
      const result = { id: form.id };
      await uploadAttachments(result, form);
      onSaved();
    } catch (error) {
      setMessage(error.message);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <motion.form
        className="quick-modal"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22 }}
        onSubmit={save}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <span>Editar</span>
            <h2>Lançamento</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} title="Fechar">
            <X size={18} />
          </button>
        </div>
        <TransactionFields form={form} setForm={setForm} config={config} modal />
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
          <button className="primary">Salvar alterações</button>
        </div>
      </motion.form>
    </div>
  );
}

function OfxImport({ config, onSaved, setMessage }) {
  const [file, setFile] = useState(null);
  const [institutionId, setInstitutionId] = useState("");
  const [preview, setPreview] = useState(null);
  const [selectedSuggestions, setSelectedSuggestions] = useState({});
  const [customSearches, setCustomSearches] = useState({});
  const [loading, setLoading] = useState("");
  const accounts = sortByNamePtBr(config.institutions).filter((i) => normalizeText(i.kind || "Conta").includes("conta"));
  const previewFile = async () => {
    if (!file) return;
    setLoading("Analisando OFX");
    const body = new FormData();
    body.append("file", file);
    try {
      const result = await fetch("/api/ofx/preview", { method: "POST", body }).then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        return data;
      });
      setPreview(result);
      setSelectedSuggestions({});
      setCustomSearches({});
    } finally {
      setLoading("");
    }
  };
  const submit = async (e) => {
    e.preventDefault();
    if (!file) return setMessage("Escolha um arquivo OFX.");
    if (!preview) return setMessage("Pré-visualize o OFX antes de importar para confirmar as sugestões.");
    if (!institutionId) return setMessage("Selecione a conta antes de importar.");
    const pendingReviews = reviewTransactions.filter((t) => !selectedSuggestions[t.key]);
    if (pendingReviews.length) return setMessage(`Revise ${pendingReviews.length} item(ns) antes de importar.`);
    setLoading("Importando OFX");
    const body = new FormData();
    body.append("file", file);
    body.append("institutionId", institutionId);
    body.append("overrides", JSON.stringify(selectedSuggestions));
    try {
      const result = await fetch("/api/ofx/import", { method: "POST", body }).then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        return data;
      });
      setMessage(`OFX importado: ${result.inserted} transações.`);
      setPreview(null);
      setSelectedSuggestions({});
      setCustomSearches({});
      onSaved();
    } finally {
      setLoading("");
    }
  };
  const chooseSuggestion = (transactionKey, optionId) => {
    setSelectedSuggestions((current) => {
      const next = { ...current };
      if (Number(next[transactionKey]) === Number(optionId)) delete next[transactionKey];
      else next[transactionKey] = optionId;
      return next;
    });
    setCustomSearches((current) => ({ ...current, [transactionKey]: "" }));
  };
  const setCustomSearch = (transactionKey, value) => {
    setCustomSearches((current) => ({ ...current, [transactionKey]: value }));
    if (!String(value || "").trim()) {
      setSelectedSuggestions((current) => {
        const next = { ...current };
        delete next[transactionKey];
        return next;
      });
    }
  };
  const chooseCustomSubcategory = (transactionKey, item) => {
    setSelectedSuggestions((current) => ({ ...current, [transactionKey]: item.id }));
    setCustomSearch(transactionKey, `${item.name} · ${item.category}`);
  };
  const reviewTransactions = preview?.transactions.filter((t) => !t.willApplySuggestion) || [];
  const pendingReviewCount = reviewTransactions.filter((t) => !selectedSuggestions[t.key]).length;
  const selectedCount = Object.keys(selectedSuggestions).length;
  return (
    <>
      {loading && (
        <div className="loading-backdrop" role="status" aria-live="polite">
          <div className="loading-card">
            <span className="loading-spinner" />
            <strong>{loading}</strong>
            <small>Preparando a importação com as regras e escolhas da prévia.</small>
          </div>
        </div>
      )}
      <FormPanel title="Importar OFX" onSubmit={submit} button="Importar definitivo">
        <Select label="Conta" value={institutionId} onChange={setInstitutionId} options={accounts.map((i) => [i.id, `${i.name} · ${i.kind || "Conta"}`])} />
        {!accounts.length && <p className="muted wide-field">Nenhuma conta bancária encontrada. Confira em Cadastros se a instituição está com tipo Conta.</p>}
        <label className="file-box">
          <Upload size={24} />
          <span>{file ? file.name : "Escolha um arquivo .ofx"}</span>
          <input type="file" accept=".ofx" onChange={(e) => { setFile(e.target.files?.[0]); setPreview(null); setSelectedSuggestions({}); setCustomSearches({}); }} />
        </label>
        <button type="button" className="secondary" disabled={!file || Boolean(loading)} onClick={() => previewFile().catch((e) => setMessage(e.message))}>Pré-visualizar</button>
      </FormPanel>
      {preview && (
        <div className="panel">
          <PanelTitle icon={FileInput} title={`Prévia: ${preview.count} transações`} />
          <div className="preview-stats">
            <span>Período: {preview.periodStart} a {preview.periodEnd}</span>
            <span>Entradas: {money.format(preview.totalCredits)}</span>
            <span>Saídas: {money.format(Math.abs(preview.totalDebits))}</span>
            <span>Auto: {preview.suggestionSummary?.auto || 0}</span>
            <span>Revisar: {preview.suggestionSummary?.review || 0}</span>
            <span>Escolhidas: {selectedCount}</span>
            <span>Pendentes: {pendingReviewCount}</span>
            <span>{preview.duplicateFile ? "Arquivo já importado" : "Arquivo novo"}</span>
          </div>
          {reviewTransactions.length > 0 && (
            <div className="ofx-review-box">
              <div className="ofx-review-head">
                <strong>Revisar antes de importar</strong>
                <span>{pendingReviewCount ? `${pendingReviewCount} pendente(s)` : "Tudo revisado"}</span>
              </div>
              <div className="ofx-review-list">
                {reviewTransactions.map((t) => (
                  <div className={selectedSuggestions[t.key] ? "ofx-review-item done" : "ofx-review-item"} key={t.key}>
                    <div className="ofx-review-meta">
                      <strong>{t.note}</strong>
                      <span>{t.date} · {t.direction} · {money.format(t.amountAbs)} · {t.suggestionConfidence || 0}%</span>
                      <small>{t.suggestionReason}</small>
                    </div>
                    <div className="ofx-suggestion-options compact">
                      {(t.suggestionOptions || []).slice(0, 3).map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          className={selectedSuggestions[t.key] === option.id ? "selected" : ""}
                          onClick={() => chooseSuggestion(t.key, option.id)}
                        >
                          <span>{option.name}</span>
                          <small>{option.category} · {option.result}</small>
                        </button>
                      ))}
                    </div>
                    <OfxSubcategorySearch
                      value={customSearches[t.key] || ""}
                      selectedId={selectedSuggestions[t.key]}
                      onQueryChange={(value) => setCustomSearch(t.key, value)}
                      onSelect={(item) => chooseCustomSubcategory(t.key, item)}
                      subcategories={config.subcategories}
                    />
                    {!(t.suggestionOptions || []).length && <small className="ofx-no-options">Sem subcategoria próxima encontrada. Confira os cadastros.</small>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="table-wrap">
            <table className="ofx-preview-table">
              <thead><tr><th>Data</th><th>Tipo</th><th>Memo</th><th>Contexto</th><th>Sugestões</th><th>Conf.</th><th>Valor</th></tr></thead>
              <tbody>
                {preview.transactions.slice(0, 40).map((t, i) => (
                  <tr key={`${t.fitid}-${i}`}>
                    <td>{t.date}</td>
                    <td>{t.duplicate ? "Duplicado" : t.direction}</td>
                    <td>{t.note}</td>
                    <td>{t.suggestedContext || t.suggestedResult}</td>
                    <td className="ofx-suggestion-cell">
                      <strong>{t.willApplySuggestion ? "Aplicação automática" : "Escolha uma sugestão"}</strong>
                      <div className="ofx-suggestion-options">
                        {(t.suggestionOptions || []).map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            className={selectedSuggestions[t.key] === option.id || (!selectedSuggestions[t.key] && t.willApplySuggestion && option.name === t.suggestedSubcategory) ? "selected" : ""}
                            onClick={() => chooseSuggestion(t.key, option.id)}
                          >
                            <span>{option.name}</span>
                            <small>{option.category} · {option.result}</small>
                          </button>
                        ))}
                      </div>
                      {t.suggestedAction && <span>{t.suggestedAction}{t.suggestedSubscription ? `: ${t.suggestedSubscription}` : ""}</span>}
                      <small>{selectedSuggestions[t.key] ? "Vai importar com a opção escolhida." : t.willApplySuggestion ? "Vai importar automaticamente. Você pode trocar clicando em outra opção." : t.suggestionReason}</small>
                    </td>
                    <td>{t.suggestionConfidence ? `${t.suggestionConfidence}%` : "-"}</td>
                    <td className={t.amount >= 0 ? "pos" : "neg"}>{money.format(t.amountAbs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function Installments({ config, onSaved, setMessage }) {
  const [form, setForm] = useState({ firstDate: today(), installments: 2, paidInstallments: 0, purchaseAmount: "", installmentAmount: "", institution: "", subcategory: "Parcelamento Cartão de Crédito", note: "" });
  const [data, setData] = useState({ groups: [], items: [] });
  const [action, setAction] = useState({ count: 1, paymentDate: today() });
  const loadInstallments = async () => setData(await api("/installments"));
  useEffect(() => {
    loadInstallments().catch((e) => setMessage(e.message));
  }, []);
  const projectedTotal = Number(form.installmentAmount || 0) * Number(form.installments || 0);
  const interest = Math.max(0, projectedTotal - Number(form.purchaseAmount || 0));
  const submit = async (e) => {
    e.preventDefault();
    const result = await api("/installments", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ ...form, description: form.note || form.subcategory }) });
    setMessage(`Parcelamento criado: ${result.ids.length} parcelas, juros de ${money.format(result.interestTotal)}.`);
    await loadInstallments();
    onSaved();
  };
  const anticipate = async (groupId) => {
    const result = await api(`/installments/${groupId}/anticipate`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify(action) });
    setMessage(`${result.anticipated} parcela(s) antecipada(s).`);
    await loadInstallments();
    onSaved();
  };
  const settle = async (groupId) => {
    const result = await api(`/installments/${groupId}/settle`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ paymentDate: action.paymentDate }) });
    setMessage(`Parcelamento quitado: ${result.settled} parcela(s).`);
    await loadInstallments();
    onSaved();
  };
  const reopen = async (groupId) => {
    const result = await api(`/installments/${groupId}/reopen`, { method: "POST", headers: jsonHeaders() });
    setMessage(`${result.reopened} parcela(s) reaberta(s).`);
    await loadInstallments();
    onSaved();
  };
  const toggleParcel = async (parcel) => {
    const result = await api(`/installments/items/${parcel.id}/toggle`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ paymentDate: action.paymentDate }) });
    setMessage(result.status === "Realizado" ? "Parcela marcada como realizada." : "Parcela voltou para previsto.");
    await loadInstallments();
    onSaved();
  };
  return (
    <>
      <FormPanel title="Novo parcelamento" onSubmit={submit} button="Gerar parcelas">
        <Input label="Primeira parcela" type="date" value={form.firstDate} onChange={(firstDate) => setForm({ ...form, firstDate })} />
        <Select label="Instituição" value={form.institution} onChange={(institution) => setForm({ ...form, institution })} options={config.institutions.map((i) => i.name)} />
        <SmartSubcategorySelect value={form.subcategory} onChange={(subcategory) => setForm({ ...form, subcategory })} subcategories={config.subcategories} />
        <Input label="Valor da compra" type="number" value={form.purchaseAmount} onChange={(purchaseAmount) => setForm({ ...form, purchaseAmount })} />
        <Input label="Valor da parcela" type="number" value={form.installmentAmount} onChange={(installmentAmount) => setForm({ ...form, installmentAmount })} />
        <Input label="Quantidade de parcelas" type="number" value={form.installments} onChange={(installments) => setForm({ ...form, installments })} />
        <Input label="Parcelas já pagas" type="number" value={form.paidInstallments} onChange={(paidInstallments) => setForm({ ...form, paidInstallments })} />
        <Input label="Descrição" value={form.note} onChange={(note) => setForm({ ...form, note })} />
        <div className="calc-card">
          <span>Total final</span>
          <strong>{money.format(projectedTotal || 0)}</strong>
          <small>Juros: {money.format(interest || 0)}</small>
        </div>
      </FormPanel>

      <div className="panel">
        <PanelTitle icon={CalendarClock} title="Parcelamentos abertos" />
        <div className="installment-actions">
          <Input label="Data da antecipação/quitação" type="date" value={action.paymentDate} onChange={(paymentDate) => setAction({ ...action, paymentDate })} />
          <Input label="Qtd. para antecipar" type="number" value={action.count} onChange={(count) => setAction({ ...action, count })} />
        </div>
        <div className="installment-list">
          {data.groups.map((group) => {
            const rows = data.items.filter((item) => item.installment_group_id === group.id);
            return (
              <div className="installment-card" key={group.id}>
                <div className="installment-head">
                  <div>
                    <span>{group.status}</span>
                    <h3>{group.description}</h3>
                    <p>{group.institution || "Sem instituição"} · {group.subcategory || "Sem subcategoria"}</p>
                  </div>
                  <div className="installment-money">
                    <strong>{group.installments_count}x {money.format(group.installment_amount)}</strong>
                    <span>Compra {money.format(group.principal_total)} · Juros {money.format(group.interest_total)}</span>
                  </div>
                </div>
                <div className="installment-progress">
                  <div style={{ width: `${Math.min(100, ((group.paid_count || 0) / Math.max(1, group.installments_count)) * 100)}%` }} />
                </div>
                <div className="installment-summary">
                  <span>Pagas: {group.paid_count || 0}</span>
                  <span>Abertas: {group.open_count || 0}</span>
                  <span>Saldo futuro: {money.format(group.open_amount || 0)}</span>
                </div>
                <div className="parcel-grid">
                  {rows.map((row) => (
                    <button type="button" className={`parcel-chip ${row.status === "Realizado" ? "paid" : ""}`} key={row.id} onClick={() => toggleParcel(row).catch((e) => setMessage(e.message))} title="Clique para alternar previsto/realizado">
                      <span>{String(row.installment_number).padStart(2, "0")}/{row.installment_total}</span>
                      <strong>{money.format(row.amount)}</strong>
                      <em>{row.status}{row.settlement_type ? ` · ${row.settlement_type}` : ""}</em>
                      <small>{row.date}</small>
                    </button>
                  ))}
                </div>
                <div className="modal-actions">
                  <button type="button" className="secondary" onClick={() => anticipate(group.id).catch((e) => setMessage(e.message))}>Antecipar</button>
                  <button type="button" className="secondary" onClick={() => reopen(group.id).catch((e) => setMessage(e.message))}>Reabrir</button>
                  <button type="button" className="primary" onClick={() => settle(group.id).catch((e) => setMessage(e.message))}>Quitar</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function Subscriptions({ config, onSaved, setMessage }) {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ date: today(), billingCycle: "Mensal", renewalDate: "", amount: "", institution: "", subcategory: "", name: "" });
  const load = async () => setRows(await api("/subscriptions"));
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, []);
  const submit = async (e) => {
    e.preventDefault();
    const result = await api("/subscriptions", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ ...form, note: form.name }) });
    setMessage(`Assinatura criada e previsão #${result.transactionId} gerada.`);
    setForm({ ...form, amount: "", name: "" });
    await load();
    onSaved();
  };
  const cancel = async (id) => {
    await api(`/subscriptions/${id}/cancel`, { method: "POST", headers: jsonHeaders() });
    setMessage("Assinatura cancelada.");
    await load();
    onSaved();
  };

  return (
    <>
      <FormPanel title="Nova assinatura" onSubmit={submit} button="Criar assinatura">
        <Input label="Nome" value={form.name} onChange={(name) => setForm({ ...form, name })} />
        <Input label="Próxima cobrança" type="date" value={form.date} onChange={(date) => setForm({ ...form, date })} />
        <Select label="Ciclo" value={form.billingCycle} onChange={(billingCycle) => setForm({ ...form, billingCycle })} options={["Mensal", "Anual"]} />
        <Input label={form.billingCycle === "Anual" ? "Valor anual" : "Valor mensal"} type="number" value={form.amount} onChange={(amount) => setForm({ ...form, amount })} />
        <Select label="Instituição" value={form.institution} onChange={(institution) => setForm({ ...form, institution })} options={config.institutions.map((i) => i.name)} />
        <SmartSubcategorySelect value={form.subcategory} onChange={(subcategory) => setForm({ ...form, subcategory })} subcategories={config.subcategories} />
        {form.billingCycle === "Anual" && <Input label="Renovação opcional" type="date" value={form.renewalDate} onChange={(renewalDate) => setForm({ ...form, renewalDate })} />}
      </FormPanel>
      <div className="panel">
        <PanelTitle icon={RefreshCw} title="Assinaturas" />
        <div className="subscription-grid">
          {rows.map((row) => (
            <div className={`subscription-card ${row.status === "Cancelada" ? "disabled" : ""}`} key={row.id}>
              <span>{row.billing_cycle} · {row.status}</span>
              <strong>{row.name}</strong>
              <p>{row.category || "Sem categoria"} · {row.institution || "Sem instituição"}</p>
              <div>
                <b>{money.format(row.amount)}</b>
                <small>Próxima: {row.next_due_date}{row.renewal_date ? ` · Renovação: ${row.renewal_date}` : ""}</small>
              </div>
              {row.status !== "Cancelada" && <button className="secondary" onClick={() => cancel(row.id).catch((e) => setMessage(e.message))}>Cancelar</button>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Budgets({ config, onSaved, setMessage }) {
  const monthStart = today().slice(0, 8) + "01";
  const [form, setForm] = useState({ name: "", amount: "", startDate: monthStart, endDate: today(), categoryId: "", subcategoryId: "", status: "Ativo" });
  const [data, setData] = useState({ rows: [], alerts: { levels: [50, 75, 95] } });
  const loadBudgets = async () => setData(await api("/budgets"));
  useEffect(() => {
    loadBudgets().catch((e) => setMessage(e.message));
  }, []);
  const categories = sortByNamePtBr(config.categories).filter((c) => c.type === "Despesa");
  const subcategories = sortByNamePtBr(config.subcategories).filter((s) => !form.categoryId || Number(s.category_id) === Number(form.categoryId));
  const submit = async (e) => {
    e.preventDefault();
    await api("/budgets", { method: "POST", headers: jsonHeaders(), body: JSON.stringify(form) });
    setForm({ name: "", amount: "", startDate: monthStart, endDate: today(), categoryId: "", subcategoryId: "", status: "Ativo" });
    await loadBudgets();
    onSaved();
    setMessage("Orçamento criado.");
  };
  const updateBudget = async (row, patch) => {
    await api(`/budgets/${row.id}`, {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({
        name: row.name,
        amount: row.amount,
        startDate: row.start_date,
        endDate: row.end_date,
        categoryId: row.category_id || "",
        subcategoryId: row.subcategory_id || "",
        status: row.status,
        ...patch,
      }),
    });
    await loadBudgets();
    onSaved();
    setMessage("Orçamento atualizado.");
  };
  const removeBudget = async (id) => {
    await api(`/budgets/${id}`, { method: "DELETE" });
    await loadBudgets();
    onSaved();
    setMessage("Orçamento excluído.");
  };

  return (
    <>
      <FormPanel title="Novo orçamento" onSubmit={(e) => submit(e).catch((error) => setMessage(error.message))} button="Criar orçamento">
        <Input label="Nome" value={form.name} onChange={(name) => setForm({ ...form, name })} />
        <Input label="Meta de gasto" type="number" value={form.amount} onChange={(amount) => setForm({ ...form, amount })} />
        <Input label="Data inicial" type="date" value={form.startDate} onChange={(startDate) => setForm({ ...form, startDate })} />
        <Input label="Data final" type="date" value={form.endDate} onChange={(endDate) => setForm({ ...form, endDate })} />
        <Select label="Categoria opcional" value={form.categoryId} onChange={(categoryId) => setForm({ ...form, categoryId, subcategoryId: "" })} options={categories.map((c) => [c.id, c.name])} />
        <Select label="Subcategoria opcional" value={form.subcategoryId} onChange={(subcategoryId) => setForm({ ...form, subcategoryId })} options={subcategories.map((s) => [s.id, `${s.name} · ${s.category}`])} />
      </FormPanel>
      <div className="panel">
        <PanelTitle icon={Banknote} title="Orçamentos" />
        <div className="budget-list">
          {data.rows.map((row) => (
            <div className={`budget-card ${row.severity}`} key={row.id}>
              <div className="budget-card-head">
                <div>
                  <strong>{row.name}</strong>
                  <span>{row.start_date} a {row.end_date}</span>
                </div>
                <em>{row.used}%</em>
              </div>
              <div className="budget-progress"><span style={{ width: `${Math.min(140, row.used || 0)}%` }} /></div>
              <div className="budget-card-values">
                <span>Gasto: {money.format(row.spent || 0)}</span>
                <span>Meta: {money.format(row.amount || 0)}</span>
                <strong className={row.remaining < 0 ? "neg" : "pos"}>{row.remaining < 0 ? "Negativo " : "Livre "}{money.format(row.remaining || 0)}</strong>
              </div>
              <small>{row.subcategory || row.category || "Todas as despesas"} · {row.status}</small>
              <div className="row-actions">
                <button type="button" onClick={() => updateBudget(row, { status: row.status === "Ativo" ? "Pausado" : "Ativo" }).catch((e) => setMessage(e.message))}>{row.status === "Ativo" ? "Pausar" : "Ativar"}</button>
                <button type="button" className="danger" onClick={() => removeBudget(row.id).catch((e) => setMessage(e.message))}><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
          {!data.rows.length && <Empty title="Nenhum orçamento cadastrado" />}
        </div>
      </div>
    </>
  );
}

function CardPayment({ config, onSaved, setMessage }) {
  const cards = config.institutions.filter((i) => i.kind === "Cartão");
  const accounts = config.institutions.filter((i) => i.kind === "Conta");
  const [form, setForm] = useState({ date: today(), cardId: "", accountId: "", month: new Date().getMonth() + 1, year: new Date().getFullYear() });
  const submit = async (e) => {
    e.preventDefault();
    const result = await api("/card-payments", { method: "POST", headers: jsonHeaders(), body: JSON.stringify(form) });
    setMessage(`Fatura registrada: ${money.format(result.amount)} em ${result.items} itens.`);
    onSaved();
  };
  return (
    <FormPanel title="Pagar fatura de cartão" onSubmit={submit} button="Registrar fatura">
      <Select label="Cartão" value={form.cardId} onChange={(cardId) => setForm({ ...form, cardId })} options={cards.map((i) => [i.id, i.name])} />
      <Select label="Conta de débito" value={form.accountId} onChange={(accountId) => setForm({ ...form, accountId })} options={accounts.map((i) => [i.id, i.name])} />
      <Input label="Mês" type="number" value={form.month} onChange={(month) => setForm({ ...form, month })} />
      <Input label="Ano" type="number" value={form.year} onChange={(year) => setForm({ ...form, year })} />
      <Input label="Data pagamento" type="date" value={form.date} onChange={(date) => setForm({ ...form, date })} />
    </FormPanel>
  );
}

function Transfer({ config, onSaved, setMessage }) {
  const accounts = config.institutions.filter((i) => i.kind === "Conta");
  const [form, setForm] = useState({ date: today(), fromInstitutionId: "", toInstitutionId: "", amount: "" });
  const submit = async (e) => {
    e.preventDefault();
    const from = accounts.find((i) => String(i.id) === String(form.fromInstitutionId));
    const to = accounts.find((i) => String(i.id) === String(form.toInstitutionId));
    await api("/transfers", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ ...form, fromInstitutionName: from?.name, toInstitutionName: to?.name }) });
    setMessage("Transferência registrada com saída e entrada vinculadas.");
    onSaved();
  };
  return (
    <FormPanel title="Transferência entre contas" onSubmit={submit}>
      <Input label="Data" type="date" value={form.date} onChange={(date) => setForm({ ...form, date })} />
      <Select label="Conta saída" value={form.fromInstitutionId} onChange={(fromInstitutionId) => setForm({ ...form, fromInstitutionId })} options={accounts.map((i) => [i.id, i.name])} />
      <Select label="Conta entrada" value={form.toInstitutionId} onChange={(toInstitutionId) => setForm({ ...form, toInstitutionId })} options={accounts.map((i) => [i.id, i.name])} />
      <Input label="Valor" type="number" value={form.amount} onChange={(amount) => setForm({ ...form, amount })} />
    </FormPanel>
  );
}

function Settings({ config, onSaved, setMessage }) {
  const categories = sortByNamePtBr(config.categories);
  const subcategories = sortByNamePtBr(config.subcategories);
  const institutions = sortByNamePtBr(config.institutions);
  return (
    <div className="settings-grid">
      <CrudBox
        title="Categorias"
        endpoint="categories"
        rows={categories}
        fields={[
          ["name", "Nome"],
          ["type", "Tipo", ["Receita", "Despesa", "Fatura", "Envio Transf", "Receb Transf"]],
          ["showOnDashboard", "Painel", "checkbox"],
          ["dashboardOrder", "Ordem"],
        ]}
        blank={{ name: "", type: "Despesa", showOnDashboard: 0, dashboardOrder: 0 }}
        onSaved={onSaved}
        setMessage={setMessage}
      />
      <CrudBox
        title="Subcategorias"
        endpoint="subcategories"
        rows={subcategories.map((s) => ({ ...s, categoryId: s.category_id }))}
        fields={[
          ["name", "Nome"],
          ["categoryId", "Categoria", categories.map((c) => [c.id, c.name])],
        ]}
        blank={{ name: "", categoryId: "" }}
        onSaved={onSaved}
        setMessage={setMessage}
      />
      <CrudBox
        title="Contas e cartões"
        endpoint="institutions"
        rows={institutions.map((i) => ({ ...i, openingBalance: i.opening_balance }))}
        fields={[
          ["name", "Nome"],
          ["kind", "Tipo", ["Conta", "Cartão"]],
          ["openingBalance", "Saldo inicial"],
        ]}
        blank={{ name: "", kind: "Conta", openingBalance: 0 }}
        onSaved={onSaved}
        setMessage={setMessage}
      />
    </div>
  );
}

function AdvancedSettings({ onSaved, setMessage, appearance, onAppearanceChange }) {
  const [tab, setTab] = useState("general");
  const [confirmation, setConfirmation] = useState("");
  const [includeSettings, setIncludeSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", nextPassword: "", confirmPassword: "" });
  const [settings, setSettings] = useState({
    attachmentsDir: "",
    effectiveAttachmentsDir: "",
    defaultAttachmentsDir: "",
    ports: { apiPort: 6397, clientPort: 5179, activeApiPort: 6397, restartRequired: false },
    appearance: mergeAppearance(appearance),
    budgetAlerts: { levels: [50, 75, 95] },
  });

  const loadSettings = async () => {
    const loaded = await api("/settings");
    const nextAppearance = mergeAppearance(loaded.appearance);
    setSettings({ ...loaded, appearance: nextAppearance });
    onAppearanceChange(nextAppearance);
    localStorage.setItem("financeiroAppearance", JSON.stringify(nextAppearance));
  };
  useEffect(() => {
    loadSettings().catch((e) => setMessage(e.message));
  }, []);

  const clearBase = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/admin/clear-base", {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify({ confirmation, includeSettings }),
      });
      setConfirmation("");
      setMessage(includeSettings ? "Base e configurações reiniciadas." : "Base operacional limpa.");
      onSaved();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    try {
      const saved = await api("/settings", {
        method: "PUT",
        headers: jsonHeaders(),
        body: JSON.stringify({
          attachmentsDir: settings.attachmentsDir,
          budgetAlerts: settings.budgetAlerts,
          ports: {
            apiPort: settings.ports?.apiPort,
            clientPort: settings.ports?.clientPort,
          },
        }),
      });
      const nextAppearance = mergeAppearance(saved.appearance);
      setSettings({ ...saved, appearance: nextAppearance });
      onAppearanceChange(nextAppearance);
      localStorage.setItem("financeiroAppearance", JSON.stringify(nextAppearance));
      setMessage(saved.ports?.restartRequired ? "Configurações salvas. Reinicie o aplicativo para aplicar as novas portas." : "Configurações salvas.");
    } catch (error) {
      setMessage(error.message);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (passwordForm.nextPassword !== passwordForm.confirmPassword) {
      setMessage("A nova senha e a confirmação não conferem.");
      return;
    }
    try {
      await api("/auth/password", {
        method: "PUT",
        headers: jsonHeaders(),
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          nextPassword: passwordForm.nextPassword,
        }),
      });
      setPasswordForm({ currentPassword: "", nextPassword: "", confirmPassword: "" });
      setMessage("Senha alterada com sucesso.");
    } catch (error) {
      setMessage(error.message);
    }
  };

  const options = [
    ["Backup local", "Exportar o SQLite e gerar pacote de segurança."],
    ["Importação em lote", "Processar vários OFX de uma pasta de uma vez."],
    ["Recalcular saldos", "Reprocessar saldo assinado e categorias de todos os lançamentos."],
    ["Reaplicar regras", "Aplicar regras de categorização em lançamentos antigos."],
    ["Privacidade", "Mascarar nomes, CPF/CNPJ e dados sensíveis importados do OFX."],
    ["Auditoria", "Registrar histórico de alterações, quitações e reaberturas."],
    ["Reset operacional", "Limpar lançamentos, OFX, faturas e parcelamentos."],
    ["Reset completo", "Limpar também cadastros e recriar a estrutura inicial."],
  ];

  return (
    <div className="advanced-grid">
      <div className="advanced-tabs">
        <button className={tab === "general" ? "active" : ""} onClick={() => setTab("general")}>Geral</button>
        <button className={tab === "connections" ? "active" : ""} onClick={() => setTab("connections")}>Conexões</button>
        <button className={tab === "appearance" ? "active" : ""} onClick={() => setTab("appearance")}>Personalização</button>
        <button className={tab === "dashboards" ? "active" : ""} onClick={() => setTab("dashboards")}>Dashboards</button>
        <button className={tab === "budgetAlerts" ? "active" : ""} onClick={() => setTab("budgetAlerts")}>Alertas de Orçamento</button>
        <button className={tab === "nextUpdates" ? "active" : ""} onClick={() => setTab("nextUpdates")}>NextUpdates</button>
      </div>

      {tab === "connections" && <ConnectionSettings setMessage={setMessage} />}
      {tab === "appearance" && (
        <AppearanceSettings
          appearance={settings.appearance}
          onChange={(next) => {
            const merged = mergeAppearance(next);
            setSettings({ ...settings, appearance: merged });
            onAppearanceChange(merged);
            localStorage.setItem("financeiroAppearance", JSON.stringify(merged));
          }}
          setMessage={setMessage}
        />
      )}
      {tab === "dashboards" && (
        <DashboardSettings
          appearance={settings.appearance}
          onChange={(next) => {
            const merged = mergeAppearance(next);
            setSettings({ ...settings, appearance: merged });
            onAppearanceChange(merged);
            localStorage.setItem("financeiroAppearance", JSON.stringify(merged));
          }}
          setMessage={setMessage}
        />
      )}
      {tab === "nextUpdates" && <NextUpdatesSettings />}
      {tab === "budgetAlerts" && (
        <BudgetAlertSettings
          value={settings.budgetAlerts}
          onChange={(budgetAlerts) => setSettings({ ...settings, budgetAlerts })}
          onSave={saveSettings}
        />
      )}

      {tab === "general" && (
        <>
      <div className="panel full">
        <PanelTitle icon={ShieldAlert} title="Configurações avançadas possíveis" />
        <div className="advanced-options">
          {options.map(([title, body]) => (
            <div className="advanced-option" key={title}>
              <strong>{title}</strong>
              <span>{body}</span>
            </div>
          ))}
        </div>
      </div>

      <form className="form-panel" onSubmit={saveSettings}>
        <h2>Geral</h2>
        <div className="form-grid">
          <Input
            label="Porta da interface"
            type="number"
            value={settings.ports?.clientPort || 5179}
            onChange={(clientPort) => setSettings({ ...settings, ports: { ...settings.ports, clientPort } })}
          />
          <Input
            label="Porta da API"
            type="number"
            value={settings.ports?.apiPort || 6397}
            onChange={(apiPort) => setSettings({ ...settings, ports: { ...settings.ports, apiPort } })}
          />
          <div className="path-info">
            <span>API em uso agora</span>
            <strong>{settings.ports?.activeApiPort || 6397}</strong>
          </div>
        </div>
        <p className="muted">As portas são aplicadas depois de reiniciar o app. Use valores entre 1024 e 65535 e mantenha API e interface em portas diferentes.</p>

        <h2>Pasta de anexos</h2>
        <div className="form-grid">
          <Input
            className="wide-field"
            label="Pasta personalizada"
            value={settings.attachmentsDir}
            onChange={(attachmentsDir) => setSettings({ ...settings, attachmentsDir })}
          />
          <div className="path-info">
            <span>Pasta em uso</span>
            <strong>{settings.effectiveAttachmentsDir || settings.defaultAttachmentsDir}</strong>
          </div>
        </div>
        <p className="muted">Deixe vazio para usar a pasta padrão do projeto.</p>
        <button className="primary">Salvar configurações</button>
      </form>

      <form className="form-panel" onSubmit={changePassword}>
        <h2>Segurança</h2>
        <div className="form-grid">
          <Input
            label="Senha atual"
            type="password"
            value={passwordForm.currentPassword}
            onChange={(currentPassword) => setPasswordForm({ ...passwordForm, currentPassword })}
          />
          <Input
            label="Nova senha"
            type="password"
            value={passwordForm.nextPassword}
            onChange={(nextPassword) => setPasswordForm({ ...passwordForm, nextPassword })}
          />
          <Input
            label="Confirmar nova senha"
            type="password"
            value={passwordForm.confirmPassword}
            onChange={(confirmPassword) => setPasswordForm({ ...passwordForm, confirmPassword })}
          />
        </div>
        <p className="muted">Instalações novas podem entrar com a senha padrão 123456. Altere aqui para uma senha com pelo menos 8 caracteres, letras e números.</p>
        <button className="primary">Alterar senha</button>
      </form>

      <form className="danger-zone" onSubmit={clearBase}>
        <div>
          <span>Zona crítica</span>
          <h2>Limpar base</h2>
          <p>
            Remove lançamentos, importações OFX, pagamentos de fatura e parcelamentos.
            Os cadastros são preservados, a menos que você marque o reset completo.
          </p>
        </div>
        <label className="checkbox-line">
          <input type="checkbox" checked={includeSettings} onChange={(e) => setIncludeSettings(e.target.checked)} />
          <span>Também limpar cadastros, categorias, instituições e regras</span>
        </label>
        <Input label="Digite LIMPAR_BASE para confirmar" value={confirmation} onChange={setConfirmation} />
        <button className="danger-button" disabled={busy || confirmation !== "LIMPAR_BASE"}>
          {busy ? "Limpando..." : "Limpar base"}
        </button>
      </form>
        </>
      )}
    </div>
  );
}

function AppearanceSettings({ appearance, onChange, setMessage }) {
  const current = mergeAppearance(appearance);
  const issues = appearanceIssues(current);
  const setColor = (key, value) => onChange({ ...current, customColors: { ...current.customColors, [key]: value } });
  const setTheme = (theme) => onChange({ ...current, theme, customColors: THEMES[theme].colors });
  const save = async (e) => {
    e.preventDefault();
    const validation = appearanceIssues(current);
    if (validation.length) {
      setMessage(`Tema com baixo contraste: ${validation.map((item) => item.label).join(", ")}.`);
      return;
    }
    const saved = await api("/settings", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ appearance: current }),
    });
    const next = mergeAppearance(saved.appearance);
    onChange(next);
    localStorage.setItem("financeiroAppearance", JSON.stringify(next));
    setMessage("Personalização salva.");
  };
  const colorFields = [
    ["bg", "Fundo"],
    ["surface", "Menu/superfície"],
    ["panel", "Painéis"],
    ["text", "Texto"],
    ["muted", "Texto secundário"],
    ["border", "Bordas"],
    ["primary", "Primária"],
    ["secondary", "Secundária"],
    ["danger", "Alerta"],
    ["chartReceita", "Dashboard receita"],
    ["chartDespesa", "Dashboard despesa"],
    ["chartSubcategory", "Dashboard subcategoria"],
  ];
  return (
    <form className="panel full appearance-panel" onSubmit={save}>
      <PanelTitle icon={Sparkles} title="Personalização" />
      <div className="theme-grid">
        {Object.entries(THEMES).map(([key, theme]) => (
          <button type="button" className={`theme-card ${current.theme === key ? "active" : ""}`} key={key} onClick={() => setTheme(key)}>
            <span>{theme.name}</span>
            <div className="theme-swatches">
              <i style={{ background: theme.colors.bg }} />
              <i style={{ background: theme.colors.panel }} />
              <i style={{ background: theme.colors.primary }} />
              <i style={{ background: theme.colors.secondary }} />
              <i style={{ background: theme.colors.danger }} />
            </div>
          </button>
        ))}
      </div>

      <div className="form-grid">
        <Select
          label="Densidade"
          value={current.density}
          onChange={(density) => onChange({ ...current, density })}
          options={[["comfortable", "Confortável"], ["compact", "Compacta"], ["dense", "Densa"]]}
        />
        <Select
          label="Menu lateral"
          value={current.sidebarMode}
          onChange={(sidebarMode) => onChange({ ...current, sidebarMode })}
          options={[["expanded", "Expandido"], ["compact", "Compacto com ícones"]]}
        />
        <Select
          label="Botão +"
          value={current.fabPosition}
          onChange={(fabPosition) => onChange({ ...current, fabPosition })}
          options={[["right", "Inferior direito"], ["left", "Inferior esquerdo"]]}
        />
      </div>

      <div className="color-grid">
        {colorFields.map(([key, label]) => (
          <label className="color-control" key={key}>
            <span>{label}</span>
            <input type="color" value={current.customColors[key]} onChange={(e) => setColor(key, e.target.value)} />
            <code>{current.customColors[key]}</code>
          </label>
        ))}
      </div>

      {issues.length ? (
        <div className="contrast-warning">
          <strong>Contraste insuficiente</strong>
          <span>{issues.map((item) => `${item.label} (${item.ratio.toFixed(1)}:1)`).join(" · ")}</span>
        </div>
      ) : (
        <div className="contrast-ok">Contraste validado para textos, botões e dashboards.</div>
      )}

      <div className="dashboard-preview-grid">
          <div className="kpi income preview-card"><span>Receitas</span><strong>R$ 0,00</strong></div>
          <div className="kpi expense preview-card"><span>Despesas</span><strong>R$ 0,00</strong></div>
        <div className="preview-chart">
          <b>Prévia dashboard</b>
          <span style={{ height: "76%", background: current.customColors.chartReceita }} />
          <span style={{ height: "48%", background: current.customColors.chartDespesa }} />
          <span style={{ height: "34%", background: current.customColors.chartSubcategory }} />
        </div>
      </div>

      <button className="primary" disabled={Boolean(issues.length)}>Salvar personalização</button>
    </form>
  );
}

function DashboardSettings({ appearance, onChange, setMessage }) {
  const current = mergeAppearance(appearance);
  const setBlock = (key, checked) => onChange({ ...current, dashboardBlocks: { ...current.dashboardBlocks, [key]: checked } });
  const setExtra = (key, checked) => onChange({ ...current, extraDashboards: { ...current.extraDashboards, [key]: checked } });
  const setRule = (key, value) => onChange({ ...current, dashboardRules: { ...current.dashboardRules, [key]: value } });
  const save = async (e) => {
    e.preventDefault();
    const saved = await api("/settings", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ appearance: current }),
    });
    const next = mergeAppearance(saved.appearance);
    onChange(next);
    localStorage.setItem("financeiroAppearance", JSON.stringify(next));
    setMessage("Configurações de dashboards salvas.");
  };
  const blockOptions = [
    ["kpis", "Resumo principal", "Receitas, despesas, faturas e previstos."],
    ["dashboardCategories", "Categorias fixadas", "Cards das categorias marcadas em Cadastros."],
    ["monthly", "Fluxo mensal", "Comparação mensal de receitas e despesas."],
    ["topCategories", "Top categorias", "Ranking por categoria conforme a regra escolhida."],
    ["topSubcategories", "Top subcategorias", "Ranking por subcategoria conforme a regra escolhida."],
    ["balances", "Saldos", "Saldo por conta cadastrada."],
    ["latest", "Últimos lançamentos", "Tabela curta com os últimos registros."],
  ];
  const extraOptions = [
    ["netBalance", "Saldo líquido", "Receitas menos despesas realizadas."],
    ["uncategorized", "Sem categoria", "Valor de lançamentos ainda sem categoria."],
    ["withoutSubcategory", "Sem subcategoria", "Valor de lançamentos sem subcategoria."],
    ["transactionCount", "Quantidade", "Total de lançamentos no filtro atual."],
    ["budgetBalance", "Orçamento livre", "Saldo disponível dos orçamentos ativos."],
  ];
  const chartOptions = [["bar", "Barras verticais"], ["horizontal", "Barras horizontais"], ["line", "Linha"], ["area", "Área"]];
  const topChartOptions = [...chartOptions, ["donut", "Rosca"], ["radial", "Radial"]];
  const monthlyOptions = [["area", "Área"], ["bar", "Barras agrupadas"], ["line", "Linhas"], ["composed", "Barras + linha"]];
  const resultOptions = [["Despesa", "Somente despesas"], ["Receita", "Somente receitas"], ["Fatura", "Somente faturas"], ["Todos", "Todos os tipos"]];
  const activeBlocks = blockOptions.filter(([key]) => current.dashboardBlocks[key]).length;
  const activeExtras = extraOptions.filter(([key]) => current.extraDashboards[key]).length;
  return (
    <form className="panel full dashboard-settings-panel" onSubmit={save}>
      <div className="dashboard-settings-head">
        <PanelTitle icon={LayoutDashboard} title="Dashboards" />
        <div className="dashboard-summary">
          <span>{activeBlocks} blocos ativos</span>
          <span>{activeExtras} cards extras</span>
          <span>{current.topLimit === 10 ? "Top 10" : "Top 5"}</span>
        </div>
      </div>

      <div className="dashboard-config-section">
        <div className="dashboard-section-copy">
          <span>1</span>
          <div>
            <strong>Escolha o que aparece no painel</strong>
            <p>Essas opções só mostram ou escondem blocos. Nenhum dado é apagado.</p>
          </div>
        </div>
        <div className="dashboard-block-grid">
          {blockOptions.map(([key, label, body]) => (
            <label className="dashboard-block-option" key={key}>
              <input type="checkbox" checked={Boolean(current.dashboardBlocks[key])} onChange={(e) => setBlock(key, e.target.checked)} />
              <span><b>{label}</b><small>{body}</small></span>
            </label>
          ))}
        </div>
      </div>

      <div className="dashboard-config-section">
        <div className="dashboard-section-copy">
          <span>2</span>
          <div>
            <strong>Defina as regras dos rankings</strong>
            <p>Por padrão os rankings usam despesas, mas você pode trocar para receitas, faturas ou todos os tipos.</p>
          </div>
        </div>
        <div className="dashboard-rule-grid">
          <Select
            label="Top Categorias considera"
            value={current.dashboardRules.topCategoriesResult}
            onChange={(topCategoriesResult) => setRule("topCategoriesResult", topCategoriesResult)}
            options={resultOptions}
          />
          <Select
            label="Top Subcategorias considera"
            value={current.dashboardRules.topSubcategoriesResult}
            onChange={(topSubcategoriesResult) => setRule("topSubcategoriesResult", topSubcategoriesResult)}
            options={resultOptions}
          />
          <Select
            label="Tamanho do ranking"
            value={current.topLimit}
            onChange={(topLimit) => onChange({ ...current, topLimit: Number(topLimit) })}
            options={[[5, "Top 5"], [10, "Top 10"]]}
          />
        </div>
      </div>

      <div className="dashboard-config-section">
        <div className="dashboard-section-copy">
          <span>3</span>
          <div>
            <strong>Escolha os modelos visuais</strong>
            <p>Essas opções mudam apenas o desenho dos gráficos. As listas Top 5 ou Top 10 continuam fixas.</p>
          </div>
        </div>
        <div className="dashboard-rule-grid">
          <Select
            label="Visual geral do painel"
            value={current.dashboardModel}
            onChange={(dashboardModel) => onChange({ ...current, dashboardModel })}
            options={[["default", "Padrão"], ["compact", "Compacto"], ["contrast", "Alto contraste"]]}
          />
          <Select
            label="Altura dos gráficos"
            value={current.dashboardChartSize}
            onChange={(dashboardChartSize) => onChange({ ...current, dashboardChartSize })}
            options={[["compact", "Baixa"], ["normal", "Normal"], ["large", "Alta"]]}
          />
          <Select
            label="Fluxo Mensal"
            value={current.monthlyChartModel}
            onChange={(monthlyChartModel) => onChange({ ...current, monthlyChartModel })}
            options={monthlyOptions}
          />
          <Select
            label="Top Categorias"
            value={current.topCategoryChartModel}
            onChange={(topCategoryChartModel) => onChange({ ...current, topCategoryChartModel })}
            options={topChartOptions}
          />
          <Select
            label="Top Subcategorias"
            value={current.topSubcategoryChartModel}
            onChange={(topSubcategoryChartModel) => onChange({ ...current, topSubcategoryChartModel })}
            options={topChartOptions}
          />
        </div>
      </div>

      <div className="dashboard-config-section">
        <div className="dashboard-section-copy">
          <span>4</span>
          <div>
            <strong>Adicione cards rápidos</strong>
            <p>Esses cards entram na primeira faixa do painel junto com receitas, despesas e previstos.</p>
          </div>
        </div>
        <div className="dashboard-block-grid compact">
          {extraOptions.map(([key, label, body]) => (
            <label className="dashboard-block-option" key={key}>
              <input type="checkbox" checked={Boolean(current.extraDashboards[key])} onChange={(e) => setExtra(key, e.target.checked)} />
              <span><b>{label}</b><small>{body}</small></span>
            </label>
          ))}
        </div>
      </div>

      <div className="dashboard-config-section preview-section">
        <div className="dashboard-section-copy">
          <span>5</span>
          <div>
            <strong>Prévia rápida</strong>
            <p>Um resumo visual para conferir se a combinação está coerente antes de salvar.</p>
          </div>
        </div>
        <div className="dashboard-preview-grid">
          <div className="kpi income preview-card"><span>Receitas</span><strong>R$ 0,00</strong></div>
          <div className="preview-chart">
            <b>Top Categorias</b>
            <span style={{ height: current.topCategoryChartModel === "horizontal" ? "32%" : "76%", background: current.customColors.chartReceita }} />
            <span style={{ height: current.topCategoryChartModel === "line" ? "52%" : "48%", background: current.customColors.secondary }} />
            <span style={{ height: "34%", background: current.customColors.secondary }} />
          </div>
          <div className="preview-chart">
            <b>Top Subcategorias</b>
            <span style={{ height: "70%", background: current.customColors.chartReceita }} />
            <span style={{ height: "44%", background: current.customColors.chartSubcategory }} />
            <span style={{ height: "30%", background: current.customColors.chartSubcategory }} />
          </div>
        </div>
      </div>

      <div className="dashboard-save-row">
        <button className="primary">Salvar dashboards</button>
      </div>
    </form>
  );
}

function BudgetAlertSettings({ value, onChange, onSave }) {
  const levels = value?.levels || [50, 75, 95];
  const setLevel = (index, nextValue) => {
    const next = [...levels];
    next[index] = Number(nextValue || 0);
    onChange({ levels: next });
  };
  return (
    <form className="panel full dashboard-settings-panel" onSubmit={onSave}>
      <div className="dashboard-settings-head">
        <PanelTitle icon={Banknote} title="Alertas de Orçamento" />
        <div className="dashboard-summary">
          <span>{levels.join("% · ")}%</span>
        </div>
      </div>
      <div className="dashboard-config-section">
        <div className="dashboard-section-copy">
          <span>1</span>
          <div>
            <strong>Defina os gatilhos de alerta</strong>
            <p>Quando o gasto realizado alcançar esses percentuais do orçamento, o painel agrava a cor e a mensagem.</p>
          </div>
        </div>
        <div className="dashboard-rule-grid">
          <Input label="Alerta inicial (%)" type="number" value={levels[0]} onChange={(v) => setLevel(0, v)} />
          <Input label="Alerta médio (%)" type="number" value={levels[1]} onChange={(v) => setLevel(1, v)} />
          <Input label="Alerta crítico (%)" type="number" value={levels[2]} onChange={(v) => setLevel(2, v)} />
        </div>
      </div>
      <div className="budget-alert-preview">
        <div className="budget-alert notice"><strong>{levels[0]}%</strong><span>Atenção ao consumo do orçamento.</span></div>
        <div className="budget-alert warning"><strong>{levels[1]}%</strong><span>Gasto avançado, vale revisar o ritmo.</span></div>
        <div className="budget-alert critical"><strong>{levels[2]}%</strong><span>Perto do limite planejado.</span></div>
        <div className="budget-alert negative"><strong>100%</strong><span>Orçamento negativo a partir daqui.</span></div>
      </div>
      <div className="dashboard-save-row">
        <button className="primary">Salvar alertas</button>
      </div>
    </form>
  );
}

function NextUpdatesSettings() {
  const cards = [
    {
      title: "Integração com IA",
      status: "Planejado",
      body: "Classificação automática de lançamentos, leitura de comprovantes e sugestões de orçamento com base no histórico local.",
    },
    {
      title: "AgentBot",
      status: "Conceito",
      body: "Assistente dentro do sistema para consultar gastos, explicar dashboards, encontrar lançamentos e executar rotinas guiadas.",
    },
    {
      title: "Agent WhatsApp",
      status: "Backlog",
      body: "Registro rápido por mensagem, envio de comprovante por foto e alertas de faturas ou vencimentos pelo WhatsApp.",
    },
    {
      title: "Agent Telegram",
      status: "Backlog",
      body: "Bot privado para lançar despesas, consultar saldo do mês, receber resumo diário e aprovar categorização sugerida.",
    },
    {
      title: "SMS Alerts",
      status: "Backlog",
      body: "Alertas simples por SMS para vencimentos críticos, limite de gastos e confirmações de rotinas importantes.",
    },
  ];

  return (
    <div className="panel full next-updates-panel">
      <PanelTitle icon={Sparkles} title="NextUpdates" />
      <p className="muted">Ideias mapeadas para próximas evoluções. Estes cards são um roadmap visual e ainda não ativam integrações externas.</p>
      <div className="next-updates-grid">
        {cards.map((card) => (
          <div className="next-update-card" key={card.title}>
            <div>
              <strong>{card.title}</strong>
              <span>{card.status}</span>
            </div>
            <p>{card.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConnectionSettings({ setMessage }) {
  const [current, setCurrent] = useState(null);
  const [form, setForm] = useState({
    provider: "sqlite",
    sqlitePath: "financeiro-externo.sqlite",
    spreadsheetPath: "financeiro-export.xlsx",
    server: "",
    database: "",
    user: "",
    password: "",
    port: 1433,
    encrypt: false,
    trustServerCertificate: true,
  });
  const [busy, setBusy] = useState("");

  const load = async () => setCurrent(await api("/connections/current"));
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, []);

  const runAction = async (action, label) => {
    setBusy(label);
    try {
      const result = await api(`/connections/${action}`, {
        method: "POST",
        headers: jsonHeaders(),
        body: JSON.stringify(form),
      });
      setMessage(result.message || `${label} concluído.`);
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="panel connection-panel">
      <PanelTitle icon={Database} title="Conexões de dados" />
      <div className="current-connection">
        <span>Base atual em uso</span>
        <strong>{current?.activeProvider || "SQLite local"}</strong>
        <code>{current?.activePath}</code>
        <p>{current?.note}</p>
      </div>

      <div className="form-grid connection-grid">
        <Select label="Tipo" value={form.provider} onChange={(provider) => setForm({ ...form, provider })} options={[["sqlite", "SQLite"], ["sqlserver", "SQL Server"], ["spreadsheet", "Planilha Excel"]]} />

        {form.provider === "sqlite" && (
          <Input className="wide-field" label="Caminho do SQLite" value={form.sqlitePath} onChange={(sqlitePath) => setForm({ ...form, sqlitePath })} />
        )}

        {form.provider === "spreadsheet" && (
          <Input className="wide-field" label="Caminho da planilha" value={form.spreadsheetPath} onChange={(spreadsheetPath) => setForm({ ...form, spreadsheetPath })} />
        )}

        {form.provider === "sqlserver" && (
          <>
            <Input label="Servidor" value={form.server} onChange={(server) => setForm({ ...form, server })} />
            <Input label="Banco de dados" value={form.database} onChange={(database) => setForm({ ...form, database })} />
            <Input label="Usuário" value={form.user} onChange={(user) => setForm({ ...form, user })} />
            <Input label="Senha" type="password" value={form.password} onChange={(password) => setForm({ ...form, password })} />
            <Input label="Porta" type="number" value={form.port} onChange={(port) => setForm({ ...form, port })} />
            <label className="checkbox-line">
              <input type="checkbox" checked={form.encrypt} onChange={(e) => setForm({ ...form, encrypt: e.target.checked })} />
              <span>Criptografar conexão</span>
            </label>
            <label className="checkbox-line">
              <input type="checkbox" checked={form.trustServerCertificate} onChange={(e) => setForm({ ...form, trustServerCertificate: e.target.checked })} />
              <span>Confiar certificado</span>
            </label>
          </>
        )}
      </div>

      <div className="connection-actions">
        <button className="secondary" onClick={() => runAction("test", "Teste")} disabled={Boolean(busy)}>{busy === "Teste" ? "Testando..." : "Testar conexão"}</button>
        <button className="secondary" onClick={() => runAction("save", "Salvar conexão")} disabled={Boolean(busy)}>Salvar configuração</button>
        <button className="primary" onClick={() => runAction("migrate-to", "Migração")} disabled={Boolean(busy)}>Criar estrutura e migrar dados</button>
        <button className="secondary" onClick={() => runAction("import-to-sqlite", "Importar de volta")} disabled={Boolean(busy)}>Voltar para SQLite atual</button>
      </div>
    </div>
  );
}

function CrudBox({ title, endpoint, rows, fields, blank, onSaved, setMessage }) {
  const [draft, setDraft] = useState(blank);
  const [search, setSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const filteredRows = rows.filter((row) => {
    const terms = normalizeText(search).split(/\s+/).filter(Boolean);
    if (!terms.length) return true;
    const haystack = normalizeText(Object.values(row).join(" "));
    return terms.every((term) => haystack.includes(term));
  });
  const saveNew = async (e) => {
    e.preventDefault();
    try {
      await api(`/${endpoint}`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify(draft) });
      setDraft(blank);
      setMessage(`${title}: registro criado.`);
      onSaved();
    } catch (error) {
      setMessage(error.message);
    }
  };
  const saveRow = async (row) => {
    try {
      await api(`/${endpoint}/${row.id}`, { method: "PUT", headers: jsonHeaders(), body: JSON.stringify(row) });
      setMessage(`${title}: registro atualizado.`);
      onSaved();
    } catch (error) {
      setMessage(error.message);
    }
  };
  const deleteRow = async (row) => {
    setBusyDelete(true);
    try {
      await api(`/${endpoint}/${row.id}`, { method: "DELETE" });
      setMessage(`${title}: registro removido.`);
      setPendingDelete(null);
      onSaved();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusyDelete(false);
    }
  };

  return (
    <div className="panel">
      <PanelTitle icon={Settings2} title={title} />
      <form className="mini-form" onSubmit={saveNew}>
        {fields.map(([key, label, options]) => {
          if (options === "checkbox") {
            return (
              <label className="checkbox-line" key={key}>
                <input type="checkbox" checked={Boolean(Number(draft[key])) || draft[key] === true} onChange={(e) => setDraft({ ...draft, [key]: e.target.checked ? 1 : 0 })} />
                <span>{label}</span>
              </label>
            );
          }
          return options
            ? <Select key={key} label={label} value={draft[key]} onChange={(value) => setDraft({ ...draft, [key]: value })} options={options} />
            : <Input key={key} label={label} value={draft[key]} onChange={(value) => setDraft({ ...draft, [key]: value })} />;
        })}
        <button className="primary compact"><Save size={16} />Adicionar</button>
      </form>
      <div className="crud-meta">
        <label className="crud-search">
          <span>Buscar em {title.toLowerCase()}</span>
          <input value={search} placeholder="Digite para filtrar" onChange={(e) => setSearch(e.target.value)} />
        </label>
        <span>{filteredRows.length} de {rows.length} registro(s)</span>
      </div>
      <div className="crud-list">
        {filteredRows.map((row) => (
          <EditableRow key={row.id} row={row} fields={fields} onSave={saveRow} onDelete={setPendingDelete} />
        ))}
        {!filteredRows.length && <Empty title="Nenhum cadastro encontrado" />}
      </div>
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={`Remover de ${title}?`}
        body={`Confirme para excluir "${pendingDelete?.name || "este registro"}". Se houver uso em lançamentos ou vínculos, o sistema vai bloquear e avisar.`}
        confirmLabel="Remover"
        busy={busyDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteRow(pendingDelete)}
      />
    </div>
  );
}

function EditableRow({ row, fields, onSave, onDelete }) {
  const [draft, setDraft] = useState(row);
  useEffect(() => setDraft(row), [row]);
  return (
    <div className="editable-row">
      {fields.map(([key, label, options]) => {
        if (options === "checkbox") {
          return <input key={key} type="checkbox" checked={Boolean(Number(draft[key])) || draft[key] === true} aria-label={label} onChange={(e) => setDraft({ ...draft, [key]: e.target.checked ? 1 : 0 })} />;
        }
        return options
        ? <select key={key} value={draft[key] ?? ""} aria-label={label} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}>
            {options.map((opt) => {
              const pair = Array.isArray(opt) ? opt : [opt, opt];
              return <option value={pair[0]} key={pair[0]}>{pair[1]}</option>;
            })}
          </select>
        : <input key={key} value={draft[key] ?? ""} aria-label={label} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />;
      })}
      <button type="button" className="save-row-button" onClick={() => onSave(draft)} title="Salvar"><Save size={16} /> Salvar</button>
      <button type="button" className="icon-button danger" onClick={() => onDelete(draft)} title="Remover"><Trash2 size={16} /></button>
    </div>
  );
}

function RuleMap({ config, onSaved, setMessage }) {
  const [rule, setRule] = useState({ pattern: "", subcategoryId: "", priority: 50 });
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const submitRule = async (e) => {
    e.preventDefault();
    try {
      await api("/rules", { method: "POST", headers: jsonHeaders(), body: JSON.stringify(rule) });
      setRule({ pattern: "", subcategoryId: "", priority: 50 });
      setMessage("Regra de categorização criada.");
      onSaved();
    } catch (error) {
      setMessage(error.message);
    }
  };
  const deleteRule = async (row) => {
    setBusyDelete(true);
    try {
      await api(`/rules/${row.id}`, { method: "DELETE" });
      setMessage("Regra removida.");
      setPendingDelete(null);
      onSaved();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusyDelete(false);
    }
  };
  const rules = [
    ["Categoria automática", "Descrição/Subcategoria -> Categoria -> Resultado"],
    ["Saldo", "Receita e recebimento somam; despesa, envio e fatura subtraem"],
    ["Parcelamento", "Gera lançamentos previstos mensais com grupo de parcelas"],
    ["Transferência", "Cria saída e entrada realizadas com o mesmo grupo"],
    ["Fatura", "Soma lançamentos do cartão por mês/ano, baixa como realizado e cria pagamento"],
    ["OFX", "Importa transações, registra arquivo, usa hash e FITID contra duplicidade"],
  ];
  return (
    <div className="map-grid">
      {rules.map(([title, body]) => (
        <motion.div className="rule-card" key={title} whileHover={{ scale: 1.02 }}>
          <span>{title}</span>
          <strong>{body}</strong>
        </motion.div>
      ))}
      <div className="panel full">
        <PanelTitle icon={Settings2} title="Arquivo de referência" />
        <p className="muted">O mapeamento detalhado foi salvo em <code>docs/MAPEAMENTO-PLANILHA.md</code>.</p>
      </div>
      <form className="form-panel full" onSubmit={submitRule}>
        <h2>Regra automática por texto</h2>
        <div className="form-grid">
          <Input label="Quando o texto contiver" value={rule.pattern} onChange={(pattern) => setRule({ ...rule, pattern })} />
          <Select label="Classificar como" value={rule.subcategoryId} onChange={(subcategoryId) => setRule({ ...rule, subcategoryId })} options={config.subcategories.map((s) => [s.id, s.name])} />
          <Input label="Prioridade" type="number" value={rule.priority} onChange={(priority) => setRule({ ...rule, priority })} />
        </div>
        <button className="primary">Criar regra</button>
      </form>
      <div className="panel full">
        <PanelTitle icon={Sparkles} title="Regras cadastradas" />
        <div className="crud-list">
          {config.rules.map((r) => (
            <div className="rule-line" key={r.id}>
              <span>{r.pattern}</span>
              <strong>{r.subcategory}</strong>
              <em>Prioridade {r.priority}</em>
              <button className="icon-button danger" onClick={() => setPendingDelete(r)}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      </div>
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Remover regra?"
        body={`A regra "${pendingDelete?.pattern || ""}" deixará de categorizar novos lançamentos automaticamente.`}
        confirmLabel="Remover"
        busy={busyDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteRule(pendingDelete)}
      />
    </div>
  );
}

function TransactionTable({ rows, compact, onEdit, onDelete }) {
  const showActions = Boolean(onEdit || onDelete);
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Descrição</th>
            <th>Instituição</th>
            <th>Categoria</th>
            <th>Subcategoria</th>
            <th>Status</th>
            <th>Anexos</th>
            <th>Valor</th>
            {showActions && <th>Ações</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id}>
              <td>{t.date}</td>
              <td>{compact ? t.description : <><strong>{t.description}</strong><span>{t.note}</span></>}</td>
              <td>{t.institution}</td>
              <td>{t.category || t.result || "Sem categoria"}</td>
              <td className={!t.subcategory ? "missing-subcategory" : ""}>{t.subcategory || "Sem subcategoria"}</td>
              <td><em>{t.status}</em></td>
              <td><AttachmentLinks row={t} /></td>
              <td className={t.signed_amount >= 0 ? "pos" : "neg"}>{money.format(t.amount)}</td>
              {showActions && (
                <td>
                  <div className="row-actions">
                    {onEdit && <button type="button" className="icon-button" onClick={() => onEdit(t)} title="Editar"><Pencil size={15} /></button>}
                    {onDelete && <button type="button" className="icon-button danger" onClick={() => onDelete(t)} title="Excluir"><Trash2 size={15} /></button>}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AttachmentLinks({ row }) {
  const attachments = parseAttachments(row.attachments);
  if (!attachments.length) return "";
  if (attachments.length === 1) {
    return (
      <a className="attachment-link" href={attachments[0].url} target="_blank" rel="noreferrer" title={attachments[0].name}>
        <Paperclip size={14} />
        Abrir
      </a>
    );
  }

  return (
    <details className="attachment-menu">
      <summary><Paperclip size={14} /> {attachments.length}</summary>
      <div>
        {attachments.map((item) => (
          <a key={item.id} href={item.url} target="_blank" rel="noreferrer" title={item.name}>
            {item.kind === "camera" ? "Foto" : "Arquivo"} · {item.name}
          </a>
        ))}
      </div>
    </details>
  );
}

function parseAttachments(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    return JSON.parse(value).filter(Boolean);
  } catch {
    return [];
  }
}

function FormPanel({ title, children, onSubmit, button = "Salvar", className = "" }) {
  return (
    <form className={`form-panel ${className}`} onSubmit={onSubmit}>
      <h2>{title}</h2>
      <div className="form-grid">{children}</div>
      <button className="primary">{button}</button>
    </form>
  );
}

function Input({ label, value, onChange, type = "text", className = "" }) {
  return <label className={className}><span>{label}</span><input type={type} value={value ?? ""} step="0.01" onChange={(e) => onChange(e.target.value)} /></label>;
}

function SmartSubcategorySelect({ value, onChange, subcategories, label = "Subcategoria", className = "" }) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);
  useEffect(() => setQuery(value || ""), [value]);
  const terms = normalizeText(query).split(/\s+/).filter(Boolean);
  const filtered = subcategories
    .filter((item) => {
      if (!terms.length) return true;
      const haystack = normalizeText(`${item.name} ${item.category} ${item.result}`);
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, 40);
  const choose = (name) => {
    onChange(name);
    setQuery(name);
    setOpen(false);
  };

  return (
    <label className={`smart-combo ${className}`}>
      <span>{label}</span>
      <input
        value={query}
        placeholder="Digite subcategoria ou categoria"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && filtered[0]) {
            e.preventDefault();
            choose(filtered[0].name);
          }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && (
        <div className="smart-combo-list">
          {filtered.length ? filtered.map((item) => (
            <button type="button" key={item.id || `${item.category}-${item.name}`} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(item.name)}>
              <strong>{item.name}</strong>
              <span>{item.category || "Sem categoria"} · {item.result || "Sem tipo"}</span>
            </button>
          )) : (
            <div className="smart-combo-empty">Nenhuma subcategoria encontrada.</div>
          )}
        </div>
      )}
    </label>
  );
}

function OfxSubcategorySearch({ value, selectedId, onQueryChange, onSelect, subcategories }) {
  const [open, setOpen] = useState(false);
  const terms = normalizeText(value).split(/\s+/).filter(Boolean);
  const filtered = subcategories
    .filter((item) => {
      if (!terms.length) return true;
      const haystack = normalizeText(`${item.name} ${item.category} ${item.result}`);
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, 8);

  return (
    <div className="ofx-custom-search" onBlur={(e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
    }}>
      <span>Buscar outra subcategoria</span>
      <input
        value={value}
        placeholder="Digite categoria ou subcategoria"
        onFocus={() => {
          if (terms.length) setOpen(true);
        }}
        onChange={(e) => {
          const nextValue = e.target.value;
          onQueryChange(nextValue);
          setOpen(Boolean(nextValue.trim()));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && filtered[0]) {
            e.preventDefault();
            onSelect(filtered[0]);
            setOpen(false);
          }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && terms.length > 0 && (
        <div className="ofx-custom-results">
          {filtered.length ? filtered.map((item) => (
            <button
              type="button"
              key={item.id}
              className={Number(selectedId) === Number(item.id) ? "selected" : ""}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSelect(item);
                setOpen(false);
              }}
            >
              <strong>{item.name}</strong>
              <small>{item.category} · {item.result}</small>
            </button>
          )) : (
            <div>Nenhuma subcategoria encontrada.</div>
          )}
        </div>
      )}
    </div>
  );
}

function Select({ label, value, onChange, options, className = "" }) {
  return (
    <label className={className}>
      <span>{label}</span>
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Selecione</option>
        {options.map((opt) => {
          const pair = Array.isArray(opt) ? opt : [opt, opt];
          return <option value={pair[0]} key={pair[0]}>{pair[1]}</option>;
        })}
      </select>
    </label>
  );
}

function PanelTitle({ icon: Icon, title }) {
  return <div className="panel-title"><Icon size={18} /><h2>{title}</h2></div>;
}

function Empty({ title }) {
  return <div className="panel"><h2>{title}</h2></div>;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function jsonHeaders() {
  return { "Content-Type": "application/json" };
}

createRoot(document.getElementById("root")).render(<App />);
