"use client";

import {
  LossCategory,
  LossSubcategory,
  DailyLog,
  LossEntry,
  AppConfig,
} from "@/types";

// Local storage-backed data store
// Swap this for Supabase client calls when connecting a real instance

const STORAGE_KEYS = {
  categories: "losstrak_categories",
  subcategories: "losstrak_subcategories",
  dailyLogs: "losstrak_daily_logs",
  lossEntries: "losstrak_loss_entries",
  config: "losstrak_config",
  initialized: "losstrak_initialized",
} as const;

function generateId(): string {
  return crypto.randomUUID();
}

function now(): string {
  return new Date().toISOString();
}

function getStore<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : [];
}

function setStore<T>(key: string, data: T[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(data));
}

// Default seed data
const DEFAULT_CATEGORIES: Omit<LossCategory, "id" | "createdAt">[] = [
  {
    name: "Grade Slate",
    displayOrder: 1,
    allowedLossTypes: ["slowdown"],
    isActive: true,
  },
  {
    name: "Process",
    displayOrder: 2,
    allowedLossTypes: ["shutdown", "slowdown"],
    isActive: true,
  },
  {
    name: "Maintenance",
    displayOrder: 3,
    allowedLossTypes: ["shutdown", "slowdown"],
    isActive: true,
  },
  {
    name: "External",
    displayOrder: 4,
    allowedLossTypes: ["shutdown", "slowdown"],
    isActive: true,
  },
  {
    name: "Business",
    displayOrder: 5,
    allowedLossTypes: ["shutdown", "slowdown"],
    isActive: true,
  },
];

const DEFAULT_SUBCATEGORIES: Record<
  string,
  { name: string; displayOrder: number }[]
> = {
  "Grade Slate": [
    { name: "Grade Change", displayOrder: 1 },
    { name: "Product Mix", displayOrder: 2 },
    { name: "Quality Adjustment", displayOrder: 3 },
  ],
  Process: [
    { name: "Fouling", displayOrder: 1 },
    { name: "Catalyst", displayOrder: 2 },
    { name: "Corrosion", displayOrder: 3 },
    { name: "Instrumentation", displayOrder: 4 },
    { name: "Process Upset", displayOrder: 5 },
  ],
  Maintenance: [
    { name: "Planned Maintenance", displayOrder: 1 },
    { name: "Unplanned Maintenance", displayOrder: 2 },
    { name: "Equipment Failure", displayOrder: 3 },
    { name: "Turnaround", displayOrder: 4 },
  ],
  External: [
    { name: "Feedstock", displayOrder: 1 },
    { name: "Utilities", displayOrder: 2 },
    { name: "Weather", displayOrder: 3 },
    { name: "Logistics", displayOrder: 4 },
  ],
  Business: [
    { name: "Market", displayOrder: 1 },
    { name: "Regulatory", displayOrder: 2 },
    { name: "Commercial", displayOrder: 3 },
  ],
};

const DEFAULT_CONFIG: { key: string; value: string }[] = [
  { key: "bar_rate", value: "1200" },
  { key: "production_unit", value: "tonnes" },
];

export function initializeStore(): void {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(STORAGE_KEYS.initialized)) return;

  const categories: LossCategory[] = DEFAULT_CATEGORIES.map((cat) => ({
    ...cat,
    id: generateId(),
    createdAt: now(),
  }));
  setStore(STORAGE_KEYS.categories, categories);

  const subcategories: LossSubcategory[] = [];
  for (const cat of categories) {
    const subs = DEFAULT_SUBCATEGORIES[cat.name] || [];
    for (const sub of subs) {
      subcategories.push({
        id: generateId(),
        categoryId: cat.id,
        name: sub.name,
        displayOrder: sub.displayOrder,
        isActive: true,
        createdAt: now(),
      });
    }
  }
  setStore(STORAGE_KEYS.subcategories, subcategories);

  const config: AppConfig[] = DEFAULT_CONFIG.map((c) => ({
    id: generateId(),
    key: c.key,
    value: c.value,
    updatedAt: now(),
  }));
  setStore(STORAGE_KEYS.config, config);

  setStore(STORAGE_KEYS.dailyLogs, []);
  setStore(STORAGE_KEYS.lossEntries, []);

  localStorage.setItem(STORAGE_KEYS.initialized, "true");
}

// ─── Categories ──────────────────────────────────────────────────

export function getCategories(): LossCategory[] {
  return getStore<LossCategory>(STORAGE_KEYS.categories)
    .filter((c) => c.isActive)
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

export function getAllCategories(): LossCategory[] {
  return getStore<LossCategory>(STORAGE_KEYS.categories).sort(
    (a, b) => a.displayOrder - b.displayOrder
  );
}

export function createCategory(
  data: Omit<LossCategory, "id" | "createdAt">
): LossCategory {
  const categories = getStore<LossCategory>(STORAGE_KEYS.categories);
  const category: LossCategory = { ...data, id: generateId(), createdAt: now() };
  categories.push(category);
  setStore(STORAGE_KEYS.categories, categories);
  return category;
}

export function updateCategory(
  id: string,
  data: Partial<LossCategory>
): LossCategory | null {
  const categories = getStore<LossCategory>(STORAGE_KEYS.categories);
  const idx = categories.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  categories[idx] = { ...categories[idx], ...data };
  setStore(STORAGE_KEYS.categories, categories);
  return categories[idx];
}

export function deleteCategory(id: string): void {
  const categories = getStore<LossCategory>(STORAGE_KEYS.categories);
  setStore(
    STORAGE_KEYS.categories,
    categories.map((c) => (c.id === id ? { ...c, isActive: false } : c))
  );
}

// ─── Subcategories ───────────────────────────────────────────────

export function getSubcategories(categoryId?: string): LossSubcategory[] {
  const subs = getStore<LossSubcategory>(STORAGE_KEYS.subcategories).filter(
    (s) => s.isActive
  );
  if (categoryId) return subs.filter((s) => s.categoryId === categoryId);
  return subs.sort((a, b) => a.displayOrder - b.displayOrder);
}

export function getAllSubcategories(): LossSubcategory[] {
  return getStore<LossSubcategory>(STORAGE_KEYS.subcategories).sort(
    (a, b) => a.displayOrder - b.displayOrder
  );
}

export function createSubcategory(
  data: Omit<LossSubcategory, "id" | "createdAt">
): LossSubcategory {
  const subs = getStore<LossSubcategory>(STORAGE_KEYS.subcategories);
  const sub: LossSubcategory = { ...data, id: generateId(), createdAt: now() };
  subs.push(sub);
  setStore(STORAGE_KEYS.subcategories, subs);
  return sub;
}

export function updateSubcategory(
  id: string,
  data: Partial<LossSubcategory>
): LossSubcategory | null {
  const subs = getStore<LossSubcategory>(STORAGE_KEYS.subcategories);
  const idx = subs.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  subs[idx] = { ...subs[idx], ...data };
  setStore(STORAGE_KEYS.subcategories, subs);
  return subs[idx];
}

export function deleteSubcategory(id: string): void {
  const subs = getStore<LossSubcategory>(STORAGE_KEYS.subcategories);
  setStore(
    STORAGE_KEYS.subcategories,
    subs.map((s) => (s.id === id ? { ...s, isActive: false } : s))
  );
}

// ─── Daily Logs ──────────────────────────────────────────────────

export function getDailyLogs(): DailyLog[] {
  return getStore<DailyLog>(STORAGE_KEYS.dailyLogs).sort(
    (a, b) => b.date.localeCompare(a.date)
  );
}

export function getDailyLog(date: string): DailyLog | null {
  const logs = getStore<DailyLog>(STORAGE_KEYS.dailyLogs);
  return logs.find((l) => l.date === date) || null;
}

export function getDailyLogById(id: string): DailyLog | null {
  const logs = getStore<DailyLog>(STORAGE_KEYS.dailyLogs);
  return logs.find((l) => l.id === id) || null;
}

export function createDailyLog(
  data: Omit<DailyLog, "id" | "createdAt" | "updatedAt" | "delta">
): DailyLog {
  const logs = getStore<DailyLog>(STORAGE_KEYS.dailyLogs);
  const log: DailyLog = {
    ...data,
    id: generateId(),
    delta: data.bar - data.production,
    createdAt: now(),
    updatedAt: now(),
  };
  logs.push(log);
  setStore(STORAGE_KEYS.dailyLogs, logs);
  return log;
}

/** Update daily log by date string (YYYY-MM-DD) or by ID */
export function updateDailyLog(
  dateOrId: string,
  data: Partial<Omit<DailyLog, "id" | "createdAt">>
): DailyLog | null {
  const logs = getStore<DailyLog>(STORAGE_KEYS.dailyLogs);
  // Try matching by date first (YYYY-MM-DD pattern), then by ID
  let idx = logs.findIndex((l) => l.date === dateOrId);
  if (idx === -1) idx = logs.findIndex((l) => l.id === dateOrId);
  if (idx === -1) return null;
  const updated = { ...logs[idx], ...data, updatedAt: now() };
  if (data.production !== undefined || data.bar !== undefined) {
    updated.delta = updated.bar - updated.production;
  }
  logs[idx] = updated;
  setStore(STORAGE_KEYS.dailyLogs, logs);
  return logs[idx];
}

export function getDailyLogsByDateRange(
  startDate: string,
  endDate: string
): DailyLog[] {
  return getStore<DailyLog>(STORAGE_KEYS.dailyLogs)
    .filter((l) => l.date >= startDate && l.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Loss Entries ────────────────────────────────────────────────

/** Get loss entries. If date is provided, filter by date. Otherwise return all. */
export function getLossEntries(date?: string): LossEntry[] {
  const entries = getStore<LossEntry>(STORAGE_KEYS.lossEntries);
  if (date) {
    return entries
      .filter((e) => e.date === date)
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
  }
  return entries;
}

export function getAllLossEntries(): LossEntry[] {
  return getStore<LossEntry>(STORAGE_KEYS.lossEntries);
}

export function createLossEntry(
  data: Omit<LossEntry, "id" | "createdAt">
): LossEntry {
  const entries = getStore<LossEntry>(STORAGE_KEYS.lossEntries);
  const entry: LossEntry = { ...data, id: generateId(), createdAt: now() };
  entries.push(entry);
  setStore(STORAGE_KEYS.lossEntries, entries);
  return entry;
}

export function updateLossEntry(
  id: string,
  data: Partial<Omit<LossEntry, "id" | "createdAt">>
): LossEntry | null {
  const entries = getStore<LossEntry>(STORAGE_KEYS.lossEntries);
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  entries[idx] = { ...entries[idx], ...data };
  setStore(STORAGE_KEYS.lossEntries, entries);
  return entries[idx];
}

export function deleteLossEntry(id: string): void {
  const entries = getStore<LossEntry>(STORAGE_KEYS.lossEntries);
  setStore(
    STORAGE_KEYS.lossEntries,
    entries.filter((e) => e.id !== id)
  );
}

// ─── Config ──────────────────────────────────────────────────────

export function getConfig(key: string): string | null {
  const configs = getStore<AppConfig>(STORAGE_KEYS.config);
  // Support both camelCase and snake_case keys
  const config = configs.find((c) => c.key === key);
  return config ? config.value : null;
}

export function getBarRate(): number {
  const val = getConfig("bar_rate") || getConfig("barRate");
  return val ? parseFloat(val) : 1200;
}

export function getProductionUnit(): string {
  return getConfig("production_unit") || getConfig("productionUnit") || "tonnes";
}

export function setConfig(key: string, value: string | number): void {
  const configs = getStore<AppConfig>(STORAGE_KEYS.config);
  const strValue = String(value);
  const idx = configs.findIndex((c) => c.key === key);
  if (idx !== -1) {
    configs[idx] = { ...configs[idx], value: strValue, updatedAt: now() };
  } else {
    configs.push({ id: generateId(), key, value: strValue, updatedAt: now() });
  }
  setStore(STORAGE_KEYS.config, configs);
}

// ─── Reset ───────────────────────────────────────────────────────

export function resetStore(): void {
  Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
  initializeStore();
}

// ─── Recent History (for loss context panel) ─────────────────────

export interface DaySnapshot {
  date: string;
  production: number;
  bar: number;
  delta: number;
  status: "open" | "closed";
  entries: LossEntry[];
}

/** Get snapshots for the N days preceding (but not including) the given date. */
export function getRecentHistory(
  beforeDate: string,
  days: number = 7
): DaySnapshot[] {
  const allLogs = getStore<DailyLog>(STORAGE_KEYS.dailyLogs);
  const allEntries = getStore<LossEntry>(STORAGE_KEYS.lossEntries);

  // Get logs before the target date, sorted most recent first
  const recentLogs = allLogs
    .filter((l) => l.date < beforeDate)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, days);

  return recentLogs.map((log) => ({
    date: log.date,
    production: log.production,
    bar: log.bar,
    delta: log.delta,
    status: log.status as "open" | "closed",
    entries: allEntries.filter((e) => e.date === log.date),
  }));
}
