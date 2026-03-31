"use client";

import {
  Site,
  Plant,
  LossCategory,
  LossSubcategory,
  LossDetailCode,
  DailyLog,
  LossEntry,
  AppConfig,
} from "@/types";
import { createBrowserClient } from "@supabase/ssr";

// ─── Supabase client (lazy singleton) ─────────────────────────────

let _sb: ReturnType<typeof createBrowserClient> | null | undefined;

function sb() {
  if (_sb !== undefined) return _sb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes("your-project")) {
    _sb = null;
    return null;
  }
  _sb = createBrowserClient(url, key);
  return _sb;
}

// ─── localStorage helpers (fallback when no Supabase) ─────────────

const STORAGE_KEYS = {
  sites: "losstrak_sites",
  plants: "losstrak_plants",
  categories: "losstrak_categories",
  subcategories: "losstrak_subcategories",
  detailCodes: "losstrak_detail_codes",
  dailyLogs: "losstrak_daily_logs",
  lossEntries: "losstrak_loss_entries",
  config: "losstrak_config",
  initialized: "losstrak_initialized",
  migratedV2: "losstrak_migrated_v2",
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

// ─── Row ↔ domain mappers ─────────────────────────────────────────

function emptyToNull(v: string): string | null {
  return v === "" ? null : v;
}

function nullToEmpty(v: string | null | undefined): string {
  return v ?? "";
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = any;

function toCat(r: Row): LossCategory {
  return {
    id: r.id,
    name: r.name,
    displayOrder: r.display_order,
    allowedLossTypes: r.allowed_loss_types as LossCategory["allowedLossTypes"],
    isActive: r.is_active,
    createdAt: r.created_at,
  };
}

function toSite(r: any): Site {
  return {
    id: r.id,
    name: r.name,
    displayOrder: r.display_order ?? r.displayOrder ?? 0,
    isActive: r.is_active ?? r.isActive ?? true,
    createdAt: r.created_at ?? r.createdAt,
  };
}

function toPlant(r: any): Plant {
  return {
    id: r.id,
    siteId: r.site_id ?? r.siteId,
    name: r.name,
    displayOrder: r.display_order ?? r.displayOrder ?? 0,
    isActive: r.is_active ?? r.isActive ?? true,
    createdAt: r.created_at ?? r.createdAt,
  };
}

function toSub(r: any): LossSubcategory {
  return {
    id: r.id,
    categoryId: r.category_id ?? r.categoryId,
    plantId: r.plant_id ?? r.plantId ?? "",
    name: r.name,
    displayOrder: r.display_order ?? r.displayOrder ?? 0,
    isActive: r.is_active ?? r.isActive ?? true,
    createdAt: r.created_at ?? r.createdAt,
  };
}

function toDc(r: any): LossDetailCode {
  return {
    id: r.id,
    subcategoryId: r.subcategory_id,
    name: r.name,
    displayOrder: r.display_order,
    isActive: r.is_active,
    createdAt: r.created_at,
  };
}

function toLog(r: any): DailyLog {
  return {
    id: r.id,
    plantId: r.plant_id ?? r.plantId ?? "",
    date: r.date,
    production: Number(r.production),
    bar: Number(r.bar),
    delta: Number(r.delta),
    comments: r.comments,
    status: r.status as DailyLog["status"],
    createdAt: r.created_at ?? r.createdAt,
    updatedAt: r.updated_at ?? r.updatedAt,
  };
}

function toEntry(r: any): LossEntry {
  return {
    id: r.id,
    dailyLogId: r.daily_log_id ?? r.dailyLogId,
    plantId: r.plant_id ?? r.plantId ?? "",
    date: nullToEmpty(r.date),
    categoryId: nullToEmpty(r.category_id ?? r.categoryId),
    subcategoryId: nullToEmpty(r.subcategory_id ?? r.subcategoryId),
    detailCodeId: nullToEmpty(r.detail_code_id ?? r.detailCodeId),
    lossType: (r.loss_type ?? r.lossType) as LossEntry["lossType"],
    amount: Number(r.amount),
    comments: r.comments,
    createdAt: r.created_at ?? r.createdAt,
  };
}

// ─── Default seed data (localStorage only) ────────────────────────

const DEFAULT_CATEGORIES: Omit<LossCategory, "id" | "createdAt">[] = [
  { name: "Grade Slate", displayOrder: 1, allowedLossTypes: ["slowdown"], isActive: true },
  { name: "Process", displayOrder: 2, allowedLossTypes: ["shutdown", "slowdown"], isActive: true },
  { name: "Maintenance", displayOrder: 3, allowedLossTypes: ["shutdown", "slowdown"], isActive: true },
  { name: "External", displayOrder: 4, allowedLossTypes: ["shutdown", "slowdown"], isActive: true },
  { name: "Business", displayOrder: 5, allowedLossTypes: ["shutdown", "slowdown"], isActive: true },
];

const DEFAULT_SUBCATEGORIES: Record<string, { name: string; displayOrder: number }[]> = {
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

const DEFAULT_SITE_ID = "00000000-0000-0000-0000-000000000001";
const DEFAULT_PLANT_ID = "00000000-0000-0000-0000-000000000002";

const DEFAULT_CONFIG: { key: string; value: string }[] = [
  { key: `plant:${DEFAULT_PLANT_ID}:bar_rate`, value: "1200" },
  { key: `plant:${DEFAULT_PLANT_ID}:production_unit`, value: "tonnes" },
  { key: `plant:${DEFAULT_PLANT_ID}:operating_hours`, value: "24" },
  { key: "selected_plant_id", value: DEFAULT_PLANT_ID },
];

export function initializeStore(): void {
  if (typeof window === "undefined") return;
  // Supabase is seeded via migrations — only seed localStorage
  if (sb()) return;

  if (!localStorage.getItem(STORAGE_KEYS.initialized)) {
    const defaultSite: Site = {
      id: DEFAULT_SITE_ID, name: "Default Site", displayOrder: 1,
      isActive: true, createdAt: now(),
    };
    const defaultPlant: Plant = {
      id: DEFAULT_PLANT_ID, siteId: DEFAULT_SITE_ID, name: "Default Plant",
      displayOrder: 1, isActive: true, createdAt: now(),
    };
    setStore(STORAGE_KEYS.sites, [defaultSite]);
    setStore(STORAGE_KEYS.plants, [defaultPlant]);

    const categories: LossCategory[] = DEFAULT_CATEGORIES.map((cat) => ({
      ...cat, id: generateId(), createdAt: now(),
    }));
    setStore(STORAGE_KEYS.categories, categories);

    const subcategories: LossSubcategory[] = [];
    for (const cat of categories) {
      for (const sub of DEFAULT_SUBCATEGORIES[cat.name] || []) {
        subcategories.push({
          id: generateId(), categoryId: cat.id, plantId: DEFAULT_PLANT_ID,
          name: sub.name, displayOrder: sub.displayOrder, isActive: true,
          createdAt: now(),
        });
      }
    }
    setStore(STORAGE_KEYS.subcategories, subcategories);
    setStore(STORAGE_KEYS.detailCodes, []);

    const config: AppConfig[] = DEFAULT_CONFIG.map((c) => ({
      id: generateId(), key: c.key, value: c.value, updatedAt: now(),
    }));
    setStore(STORAGE_KEYS.config, config);
    setStore(STORAGE_KEYS.dailyLogs, []);
    setStore(STORAGE_KEYS.lossEntries, []);
    localStorage.setItem(STORAGE_KEYS.initialized, "true");
  }

  // Migrate existing v1 data to v2 (add plantId)
  if (!localStorage.getItem(STORAGE_KEYS.migratedV2)) {
    // Ensure default site/plant exist
    const sites = getStore<Site>(STORAGE_KEYS.sites);
    if (sites.length === 0) {
      setStore(STORAGE_KEYS.sites, [{
        id: DEFAULT_SITE_ID, name: "Default Site", displayOrder: 1,
        isActive: true, createdAt: now(),
      }]);
    }
    const plants = getStore<Plant>(STORAGE_KEYS.plants);
    if (plants.length === 0) {
      setStore(STORAGE_KEYS.plants, [{
        id: DEFAULT_PLANT_ID, siteId: DEFAULT_SITE_ID, name: "Default Plant",
        displayOrder: 1, isActive: true, createdAt: now(),
      }]);
    }

    // Backfill plantId on subcategories
    const subs = getStore<LossSubcategory>(STORAGE_KEYS.subcategories);
    setStore(STORAGE_KEYS.subcategories,
      subs.map((s) => ({ ...s, plantId: s.plantId || DEFAULT_PLANT_ID }))
    );

    // Backfill plantId on daily logs
    const logs = getStore<DailyLog>(STORAGE_KEYS.dailyLogs);
    setStore(STORAGE_KEYS.dailyLogs,
      logs.map((l) => ({ ...l, plantId: l.plantId || DEFAULT_PLANT_ID }))
    );

    // Backfill plantId on loss entries
    const entries = getStore<LossEntry>(STORAGE_KEYS.lossEntries);
    setStore(STORAGE_KEYS.lossEntries,
      entries.map((e) => ({ ...e, plantId: e.plantId || DEFAULT_PLANT_ID }))
    );

    // Migrate config keys: bar_rate → plant:{id}:bar_rate
    const configs = getStore<AppConfig>(STORAGE_KEYS.config);
    const legacyKeys = ["bar_rate", "production_unit", "operating_hours", "barRate", "productionUnit", "operatingHours"];
    const canonical: Record<string, string> = {
      bar_rate: "bar_rate", barRate: "bar_rate",
      production_unit: "production_unit", productionUnit: "production_unit",
      operating_hours: "operating_hours", operatingHours: "operating_hours",
    };
    const updated = configs.map((c) => {
      if (legacyKeys.includes(c.key)) {
        return { ...c, key: `plant:${DEFAULT_PLANT_ID}:${canonical[c.key]}` };
      }
      return c;
    });
    // Add selected_plant_id if missing
    if (!updated.find((c) => c.key === "selected_plant_id")) {
      updated.push({ id: generateId(), key: "selected_plant_id", value: DEFAULT_PLANT_ID, updatedAt: now() });
    }
    setStore(STORAGE_KEYS.config, updated);

    localStorage.setItem(STORAGE_KEYS.migratedV2, "true");
  }
}

// ─── Sites ──────────────────────────────────────────────────────

export async function getSites(): Promise<Site[]> {
  const client = sb();
  if (client) {
    const { data, error } = await client
      .from("sites")
      .select("*")
      .eq("is_active", true)
      .order("display_order");
    if (error) throw error;
    return (data ?? []).map(toSite);
  }
  return getStore<Site>(STORAGE_KEYS.sites)
    .filter((s) => s.isActive)
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

export async function createSite(
  data: Omit<Site, "id" | "createdAt">
): Promise<Site> {
  const client = sb();
  if (client) {
    const { data: row, error } = await client
      .from("sites")
      .insert({ name: data.name, display_order: data.displayOrder, is_active: data.isActive })
      .select()
      .single();
    if (error) throw error;
    return toSite(row);
  }
  const sites = getStore<Site>(STORAGE_KEYS.sites);
  const site: Site = { ...data, id: generateId(), createdAt: now() };
  sites.push(site);
  setStore(STORAGE_KEYS.sites, sites);
  return site;
}

export async function updateSite(
  id: string,
  data: Partial<Site>
): Promise<Site | null> {
  const client = sb();
  if (client) {
    const update: Record<string, unknown> = {};
    if (data.name !== undefined) update.name = data.name;
    if (data.displayOrder !== undefined) update.display_order = data.displayOrder;
    if (data.isActive !== undefined) update.is_active = data.isActive;
    const { data: row, error } = await client
      .from("sites")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return toSite(row);
  }
  const sites = getStore<Site>(STORAGE_KEYS.sites);
  const idx = sites.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  sites[idx] = { ...sites[idx], ...data };
  setStore(STORAGE_KEYS.sites, sites);
  return sites[idx];
}

export async function deleteSite(id: string): Promise<void> {
  const client = sb();
  if (client) {
    const { error } = await client.from("sites").update({ is_active: false }).eq("id", id);
    if (error) throw error;
    return;
  }
  const sites = getStore<Site>(STORAGE_KEYS.sites);
  setStore(STORAGE_KEYS.sites, sites.map((s) => (s.id === id ? { ...s, isActive: false } : s)));
}

// ─── Plants ─────────────────────────────────────────────────────

export async function getPlants(siteId?: string): Promise<Plant[]> {
  const client = sb();
  if (client) {
    let q = client.from("plants").select("*").eq("is_active", true).order("display_order");
    if (siteId) q = q.eq("site_id", siteId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(toPlant);
  }
  let plants = getStore<Plant>(STORAGE_KEYS.plants).filter((p) => p.isActive);
  if (siteId) plants = plants.filter((p) => p.siteId === siteId);
  return plants.sort((a, b) => a.displayOrder - b.displayOrder);
}

export async function createPlant(
  data: Omit<Plant, "id" | "createdAt">
): Promise<Plant> {
  const client = sb();
  if (client) {
    const { data: row, error } = await client
      .from("plants")
      .insert({ site_id: data.siteId, name: data.name, display_order: data.displayOrder, is_active: data.isActive })
      .select()
      .single();
    if (error) throw error;
    return toPlant(row);
  }
  const plants = getStore<Plant>(STORAGE_KEYS.plants);
  const plant: Plant = { ...data, id: generateId(), createdAt: now() };
  plants.push(plant);
  setStore(STORAGE_KEYS.plants, plants);
  return plant;
}

export async function updatePlant(
  id: string,
  data: Partial<Plant>
): Promise<Plant | null> {
  const client = sb();
  if (client) {
    const update: Record<string, unknown> = {};
    if (data.siteId !== undefined) update.site_id = data.siteId;
    if (data.name !== undefined) update.name = data.name;
    if (data.displayOrder !== undefined) update.display_order = data.displayOrder;
    if (data.isActive !== undefined) update.is_active = data.isActive;
    const { data: row, error } = await client
      .from("plants")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return toPlant(row);
  }
  const plants = getStore<Plant>(STORAGE_KEYS.plants);
  const idx = plants.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  plants[idx] = { ...plants[idx], ...data };
  setStore(STORAGE_KEYS.plants, plants);
  return plants[idx];
}

export async function deletePlant(id: string): Promise<void> {
  const client = sb();
  if (client) {
    const { error } = await client.from("plants").update({ is_active: false }).eq("id", id);
    if (error) throw error;
    return;
  }
  const plants = getStore<Plant>(STORAGE_KEYS.plants);
  setStore(STORAGE_KEYS.plants, plants.map((p) => (p.id === id ? { ...p, isActive: false } : p)));
}

// ─── Categories ──────────────────────────────────────────────────

export async function getCategories(): Promise<LossCategory[]> {
  const client = sb();
  if (client) {
    const { data, error } = await client
      .from("loss_categories")
      .select("*")
      .eq("is_active", true)
      .order("display_order");
    if (error) throw error;
    return (data ?? []).map(toCat);
  }
  return getStore<LossCategory>(STORAGE_KEYS.categories)
    .filter((c) => c.isActive)
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

export async function getAllCategories(): Promise<LossCategory[]> {
  const client = sb();
  if (client) {
    const { data, error } = await client
      .from("loss_categories")
      .select("*")
      .order("display_order");
    if (error) throw error;
    return (data ?? []).map(toCat);
  }
  return getStore<LossCategory>(STORAGE_KEYS.categories).sort(
    (a, b) => a.displayOrder - b.displayOrder
  );
}

export async function createCategory(
  data: Omit<LossCategory, "id" | "createdAt">
): Promise<LossCategory> {
  const client = sb();
  if (client) {
    const { data: row, error } = await client
      .from("loss_categories")
      .insert({
        name: data.name,
        display_order: data.displayOrder,
        allowed_loss_types: data.allowedLossTypes,
        is_active: data.isActive,
      })
      .select()
      .single();
    if (error) throw error;
    return toCat(row);
  }
  const categories = getStore<LossCategory>(STORAGE_KEYS.categories);
  const category: LossCategory = { ...data, id: generateId(), createdAt: now() };
  categories.push(category);
  setStore(STORAGE_KEYS.categories, categories);
  return category;
}

export async function updateCategory(
  id: string,
  data: Partial<LossCategory>
): Promise<LossCategory | null> {
  const client = sb();
  if (client) {
    const update: Record<string, unknown> = {};
    if (data.name !== undefined) update.name = data.name;
    if (data.displayOrder !== undefined) update.display_order = data.displayOrder;
    if (data.allowedLossTypes !== undefined) update.allowed_loss_types = data.allowedLossTypes;
    if (data.isActive !== undefined) update.is_active = data.isActive;
    const { data: row, error } = await client
      .from("loss_categories")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return toCat(row);
  }
  const categories = getStore<LossCategory>(STORAGE_KEYS.categories);
  const idx = categories.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  categories[idx] = { ...categories[idx], ...data };
  setStore(STORAGE_KEYS.categories, categories);
  return categories[idx];
}

export async function deleteCategory(id: string): Promise<void> {
  const client = sb();
  if (client) {
    const { error } = await client
      .from("loss_categories")
      .update({ is_active: false })
      .eq("id", id);
    if (error) throw error;
    return;
  }
  const categories = getStore<LossCategory>(STORAGE_KEYS.categories);
  setStore(
    STORAGE_KEYS.categories,
    categories.map((c) => (c.id === id ? { ...c, isActive: false } : c))
  );
}

// ─── Subcategories ───────────────────────────────────────────────

export async function getSubcategories(plantId: string, categoryId?: string): Promise<LossSubcategory[]> {
  const client = sb();
  if (client) {
    let q = client.from("loss_subcategories").select("*")
      .eq("is_active", true).eq("plant_id", plantId).order("display_order");
    if (categoryId) q = q.eq("category_id", categoryId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(toSub);
  }
  let subs = getStore<LossSubcategory>(STORAGE_KEYS.subcategories)
    .filter((s) => s.isActive && s.plantId === plantId);
  if (categoryId) subs = subs.filter((s) => s.categoryId === categoryId);
  return subs.sort((a, b) => a.displayOrder - b.displayOrder);
}

export async function getAllSubcategories(plantId?: string): Promise<LossSubcategory[]> {
  const client = sb();
  if (client) {
    let q = client.from("loss_subcategories").select("*").order("display_order");
    if (plantId) q = q.eq("plant_id", plantId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(toSub);
  }
  let subs = getStore<LossSubcategory>(STORAGE_KEYS.subcategories);
  if (plantId) subs = subs.filter((s) => s.plantId === plantId);
  return subs.sort((a, b) => a.displayOrder - b.displayOrder);
}

export async function createSubcategory(
  data: Omit<LossSubcategory, "id" | "createdAt">
): Promise<LossSubcategory> {
  const client = sb();
  if (client) {
    const { data: row, error } = await client
      .from("loss_subcategories")
      .insert({
        category_id: data.categoryId,
        plant_id: data.plantId,
        name: data.name,
        display_order: data.displayOrder,
        is_active: data.isActive,
      })
      .select()
      .single();
    if (error) throw error;
    return toSub(row);
  }
  const subs = getStore<LossSubcategory>(STORAGE_KEYS.subcategories);
  const sub: LossSubcategory = { ...data, id: generateId(), createdAt: now() };
  subs.push(sub);
  setStore(STORAGE_KEYS.subcategories, subs);
  return sub;
}

export async function updateSubcategory(
  id: string,
  data: Partial<LossSubcategory>
): Promise<LossSubcategory | null> {
  const client = sb();
  if (client) {
    const update: Record<string, unknown> = {};
    if (data.categoryId !== undefined) update.category_id = data.categoryId;
    if (data.name !== undefined) update.name = data.name;
    if (data.displayOrder !== undefined) update.display_order = data.displayOrder;
    if (data.isActive !== undefined) update.is_active = data.isActive;
    const { data: row, error } = await client
      .from("loss_subcategories")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return toSub(row);
  }
  const subs = getStore<LossSubcategory>(STORAGE_KEYS.subcategories);
  const idx = subs.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  subs[idx] = { ...subs[idx], ...data };
  setStore(STORAGE_KEYS.subcategories, subs);
  return subs[idx];
}

export async function deleteSubcategory(id: string): Promise<void> {
  const client = sb();
  if (client) {
    const { error } = await client
      .from("loss_subcategories")
      .update({ is_active: false })
      .eq("id", id);
    if (error) throw error;
    return;
  }
  const subs = getStore<LossSubcategory>(STORAGE_KEYS.subcategories);
  setStore(
    STORAGE_KEYS.subcategories,
    subs.map((s) => (s.id === id ? { ...s, isActive: false } : s))
  );
}

// ─── Detail Codes ───────────────────────────────────────────────

export async function getDetailCodes(subcategoryId?: string): Promise<LossDetailCode[]> {
  const client = sb();
  if (client) {
    let q = client.from("loss_detail_codes").select("*").eq("is_active", true).order("display_order");
    if (subcategoryId) q = q.eq("subcategory_id", subcategoryId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(toDc);
  }
  const codes = getStore<LossDetailCode>(STORAGE_KEYS.detailCodes).filter((d) => d.isActive);
  if (subcategoryId)
    return codes
      .filter((d) => d.subcategoryId === subcategoryId)
      .sort((a, b) => a.displayOrder - b.displayOrder);
  return codes.sort((a, b) => a.displayOrder - b.displayOrder);
}

export async function getAllDetailCodes(): Promise<LossDetailCode[]> {
  const client = sb();
  if (client) {
    const { data, error } = await client
      .from("loss_detail_codes")
      .select("*")
      .order("display_order");
    if (error) throw error;
    return (data ?? []).map(toDc);
  }
  return getStore<LossDetailCode>(STORAGE_KEYS.detailCodes).sort(
    (a, b) => a.displayOrder - b.displayOrder
  );
}

export async function createDetailCode(
  data: Omit<LossDetailCode, "id" | "createdAt">
): Promise<LossDetailCode> {
  const client = sb();
  if (client) {
    const { data: row, error } = await client
      .from("loss_detail_codes")
      .insert({
        subcategory_id: data.subcategoryId,
        name: data.name,
        display_order: data.displayOrder,
        is_active: data.isActive,
      })
      .select()
      .single();
    if (error) throw error;
    return toDc(row);
  }
  const codes = getStore<LossDetailCode>(STORAGE_KEYS.detailCodes);
  const code: LossDetailCode = { ...data, id: generateId(), createdAt: now() };
  codes.push(code);
  setStore(STORAGE_KEYS.detailCodes, codes);
  return code;
}

export async function updateDetailCode(
  id: string,
  data: Partial<LossDetailCode>
): Promise<LossDetailCode | null> {
  const client = sb();
  if (client) {
    const update: Record<string, unknown> = {};
    if (data.subcategoryId !== undefined) update.subcategory_id = data.subcategoryId;
    if (data.name !== undefined) update.name = data.name;
    if (data.displayOrder !== undefined) update.display_order = data.displayOrder;
    if (data.isActive !== undefined) update.is_active = data.isActive;
    const { data: row, error } = await client
      .from("loss_detail_codes")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return toDc(row);
  }
  const codes = getStore<LossDetailCode>(STORAGE_KEYS.detailCodes);
  const idx = codes.findIndex((d) => d.id === id);
  if (idx === -1) return null;
  codes[idx] = { ...codes[idx], ...data };
  setStore(STORAGE_KEYS.detailCodes, codes);
  return codes[idx];
}

export async function deleteDetailCode(id: string): Promise<void> {
  const client = sb();
  if (client) {
    const { error } = await client
      .from("loss_detail_codes")
      .update({ is_active: false })
      .eq("id", id);
    if (error) throw error;
    return;
  }
  const codes = getStore<LossDetailCode>(STORAGE_KEYS.detailCodes);
  setStore(
    STORAGE_KEYS.detailCodes,
    codes.map((d) => (d.id === id ? { ...d, isActive: false } : d))
  );
}

// ─── Daily Logs ──────────────────────────────────────────────────

export async function getDailyLogs(plantId: string): Promise<DailyLog[]> {
  const client = sb();
  if (client) {
    const { data, error } = await client
      .from("daily_logs")
      .select("*")
      .eq("plant_id", plantId)
      .order("date", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(toLog);
  }
  return getStore<DailyLog>(STORAGE_KEYS.dailyLogs)
    .filter((l) => l.plantId === plantId)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function getDailyLog(plantId: string, date: string): Promise<DailyLog | null> {
  const client = sb();
  if (client) {
    const { data, error } = await client
      .from("daily_logs")
      .select("*")
      .eq("plant_id", plantId)
      .eq("date", date)
      .maybeSingle();
    if (error) throw error;
    return data ? toLog(data) : null;
  }
  const logs = getStore<DailyLog>(STORAGE_KEYS.dailyLogs);
  return logs.find((l) => l.plantId === plantId && l.date === date) || null;
}

export async function getDailyLogById(id: string): Promise<DailyLog | null> {
  const client = sb();
  if (client) {
    const { data, error } = await client
      .from("daily_logs")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? toLog(data) : null;
  }
  const logs = getStore<DailyLog>(STORAGE_KEYS.dailyLogs);
  return logs.find((l) => l.id === id) || null;
}

export async function createDailyLog(
  data: Omit<DailyLog, "id" | "createdAt" | "updatedAt" | "delta">
): Promise<DailyLog> {
  const client = sb();
  if (client) {
    // delta is a GENERATED column — omit it from insert
    const { data: row, error } = await client
      .from("daily_logs")
      .insert({
        plant_id: data.plantId,
        date: data.date,
        production: data.production,
        bar: data.bar,
        comments: data.comments,
        status: data.status,
      })
      .select()
      .single();
    if (error) throw error;
    return toLog(row);
  }
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

export async function updateDailyLog(
  dateOrId: string,
  data: Partial<Omit<DailyLog, "id" | "createdAt">>
): Promise<DailyLog | null> {
  const client = sb();
  if (client) {
    // delta is GENERATED — don't send it
    const update: Record<string, unknown> = {};
    if (data.production !== undefined) update.production = data.production;
    if (data.bar !== undefined) update.bar = data.bar;
    if (data.comments !== undefined) update.comments = data.comments;
    if (data.status !== undefined) update.status = data.status;
    // Try by date first
    const isDate = /^\d{4}-\d{2}-\d{2}$/.test(dateOrId);
    const col = isDate ? "date" : "id";
    const { data: row, error } = await client
      .from("daily_logs")
      .update(update)
      .eq(col, dateOrId)
      .select()
      .single();
    if (error) throw error;
    return toLog(row);
  }
  const logs = getStore<DailyLog>(STORAGE_KEYS.dailyLogs);
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

export async function getDailyLogsByDateRange(
  plantId: string,
  startDate: string,
  endDate: string
): Promise<DailyLog[]> {
  const client = sb();
  if (client) {
    const { data, error } = await client
      .from("daily_logs")
      .select("*")
      .eq("plant_id", plantId)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date");
    if (error) throw error;
    return (data ?? []).map(toLog);
  }
  return getStore<DailyLog>(STORAGE_KEYS.dailyLogs)
    .filter((l) => l.plantId === plantId && l.date >= startDate && l.date <= endDate)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Bulk Day Operations ─────────────────────────────────────────

export async function bulkUpdateDayStatus(
  ids: string[],
  status: "open" | "closed"
): Promise<void> {
  if (ids.length === 0) return;
  const client = sb();
  if (client) {
    const { error } = await client
      .from("daily_logs")
      .update({ status })
      .in("id", ids);
    if (error) throw error;
    return;
  }
  const logs = getStore<DailyLog>(STORAGE_KEYS.dailyLogs);
  for (const log of logs) {
    if (ids.includes(log.id)) {
      log.status = status;
      log.updatedAt = now();
    }
  }
  setStore(STORAGE_KEYS.dailyLogs, logs);
}

export async function deleteDailyLog(id: string): Promise<void> {
  const client = sb();
  if (client) {
    // Delete associated loss entries first
    const { error: entryErr } = await client
      .from("loss_entries")
      .delete()
      .eq("daily_log_id", id);
    if (entryErr) throw entryErr;
    const { error } = await client.from("daily_logs").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  const logs = getStore<DailyLog>(STORAGE_KEYS.dailyLogs);
  const log = logs.find((l) => l.id === id);
  if (log) {
    const entries = getStore<LossEntry>(STORAGE_KEYS.lossEntries);
    setStore(
      STORAGE_KEYS.lossEntries,
      entries.filter((e) => e.dailyLogId !== id)
    );
  }
  setStore(
    STORAGE_KEYS.dailyLogs,
    logs.filter((l) => l.id !== id)
  );
}

export async function bulkDeleteDailyLogs(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const client = sb();
  if (client) {
    const { error: entryErr } = await client
      .from("loss_entries")
      .delete()
      .in("daily_log_id", ids);
    if (entryErr) throw entryErr;
    const { error } = await client.from("daily_logs").delete().in("id", ids);
    if (error) throw error;
    return;
  }
  const logs = getStore<DailyLog>(STORAGE_KEYS.dailyLogs);
  const entries = getStore<LossEntry>(STORAGE_KEYS.lossEntries);
  const idSet = new Set(ids);
  setStore(
    STORAGE_KEYS.lossEntries,
    entries.filter((e) => !idSet.has(e.dailyLogId))
  );
  setStore(
    STORAGE_KEYS.dailyLogs,
    logs.filter((l) => !idSet.has(l.id))
  );
}

// ─── Loss Entries ────────────────────────────────────────────────

export async function getLossEntries(plantId: string, date?: string): Promise<LossEntry[]> {
  const client = sb();
  if (client) {
    let q = client.from("loss_entries").select("*").eq("plant_id", plantId).order("created_at");
    if (date) q = q.eq("date", date);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(toEntry);
  }
  const entries = getStore<LossEntry>(STORAGE_KEYS.lossEntries).filter((e) => e.plantId === plantId);
  if (date) {
    return entries
      .filter((e) => e.date === date)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
  return entries;
}

export async function getAllLossEntries(plantId: string): Promise<LossEntry[]> {
  const client = sb();
  if (client) {
    const { data, error } = await client.from("loss_entries").select("*").eq("plant_id", plantId);
    if (error) throw error;
    return (data ?? []).map(toEntry);
  }
  return getStore<LossEntry>(STORAGE_KEYS.lossEntries).filter((e) => e.plantId === plantId);
}

export async function createLossEntry(
  data: Omit<LossEntry, "id" | "createdAt">
): Promise<LossEntry> {
  const client = sb();
  if (client) {
    const row: Record<string, unknown> = {
      daily_log_id: data.dailyLogId,
      plant_id: data.plantId,
      loss_type: data.lossType,
      amount: data.amount,
      comments: data.comments,
    };
    // Only include FK / date columns when they have a value
    if (data.date) row.date = data.date;
    if (data.categoryId) row.category_id = data.categoryId;
    if (data.subcategoryId) row.subcategory_id = data.subcategoryId;
    if (data.detailCodeId) row.detail_code_id = data.detailCodeId;

    const { data: inserted, error } = await client
      .from("loss_entries")
      .insert(row)
      .select()
      .single();
    if (error) throw error;
    return toEntry(inserted);
  }
  const entries = getStore<LossEntry>(STORAGE_KEYS.lossEntries);
  const entry: LossEntry = { ...data, id: generateId(), createdAt: now() };
  entries.push(entry);
  setStore(STORAGE_KEYS.lossEntries, entries);
  return entry;
}

export async function updateLossEntry(
  id: string,
  data: Partial<Omit<LossEntry, "id" | "createdAt">>
): Promise<LossEntry | null> {
  const client = sb();
  if (client) {
    const update: Record<string, unknown> = {};
    if (data.dailyLogId !== undefined) update.daily_log_id = data.dailyLogId;
    if (data.date !== undefined) update.date = emptyToNull(data.date);
    if (data.categoryId !== undefined) update.category_id = emptyToNull(data.categoryId);
    if (data.subcategoryId !== undefined) update.subcategory_id = emptyToNull(data.subcategoryId);
    if (data.detailCodeId !== undefined) update.detail_code_id = emptyToNull(data.detailCodeId);
    if (data.lossType !== undefined) update.loss_type = data.lossType;
    if (data.amount !== undefined) update.amount = data.amount;
    if (data.comments !== undefined) update.comments = data.comments;
    const { data: row, error } = await client
      .from("loss_entries")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return toEntry(row);
  }
  const entries = getStore<LossEntry>(STORAGE_KEYS.lossEntries);
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  entries[idx] = { ...entries[idx], ...data };
  setStore(STORAGE_KEYS.lossEntries, entries);
  return entries[idx];
}

export async function deleteLossEntry(id: string): Promise<void> {
  const client = sb();
  if (client) {
    const { error } = await client.from("loss_entries").delete().eq("id", id);
    if (error) throw error;
    return;
  }
  const entries = getStore<LossEntry>(STORAGE_KEYS.lossEntries);
  setStore(
    STORAGE_KEYS.lossEntries,
    entries.filter((e) => e.id !== id)
  );
}

// ─── Config ──────────────────────────────────────────────────────

export async function getConfig(key: string): Promise<string | null> {
  const client = sb();
  if (client) {
    const { data, error } = await client
      .from("app_config")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) throw error;
    return data?.value ?? null;
  }
  const configs = getStore<AppConfig>(STORAGE_KEYS.config);
  const config = configs.find((c) => c.key === key);
  return config ? config.value : null;
}

function plantConfigKey(plantId: string, key: string): string {
  return `plant:${plantId}:${key}`;
}

export async function getBarRate(plantId: string): Promise<number> {
  const val = await getConfig(plantConfigKey(plantId, "bar_rate"));
  return val ? parseFloat(val) : 1200;
}

export async function getProductionUnit(plantId: string): Promise<string> {
  const val = await getConfig(plantConfigKey(plantId, "production_unit"));
  return val || "tonnes";
}

export async function getOperatingHours(plantId: string): Promise<number> {
  const val = await getConfig(plantConfigKey(plantId, "operating_hours"));
  return val ? parseFloat(val) : 24;
}

export async function setPlantConfig(
  plantId: string,
  key: string,
  value: string | number
): Promise<void> {
  return setConfig(plantConfigKey(plantId, key), value);
}

export async function getSelectedPlantId(): Promise<string | null> {
  return getConfig("selected_plant_id");
}

export async function setSelectedPlantId(id: string): Promise<void> {
  return setConfig("selected_plant_id", id);
}

export async function setConfig(key: string, value: string | number): Promise<void> {
  const strValue = String(value);
  const client = sb();
  if (client) {
    const { error } = await client
      .from("app_config")
      .upsert({ key, value: strValue }, { onConflict: "key" });
    if (error) throw error;
    return;
  }
  const configs = getStore<AppConfig>(STORAGE_KEYS.config);
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
  localStorage.removeItem(STORAGE_KEYS.migratedV2);
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

export async function getRecentHistory(
  plantId: string,
  beforeDate: string,
  days: number = 7
): Promise<DaySnapshot[]> {
  const client = sb();
  if (client) {
    const { data: logs, error: logErr } = await client
      .from("daily_logs")
      .select("*")
      .eq("plant_id", plantId)
      .lt("date", beforeDate)
      .order("date", { ascending: false })
      .limit(days);
    if (logErr) throw logErr;
    if (!logs || logs.length === 0) return [];

    const dates = logs.map((l: Row) => l.date);
    const { data: entries, error: entErr } = await client
      .from("loss_entries")
      .select("*")
      .eq("plant_id", plantId)
      .in("date", dates);
    if (entErr) throw entErr;

    const entryMap = new Map<string, LossEntry[]>();
    for (const e of (entries ?? []).map(toEntry)) {
      const list = entryMap.get(e.date) ?? [];
      list.push(e);
      entryMap.set(e.date, list);
    }

    return logs.map((log: Row) => ({
      date: log.date,
      production: Number(log.production),
      bar: Number(log.bar),
      delta: Number(log.delta),
      status: log.status as "open" | "closed",
      entries: entryMap.get(log.date) ?? [],
    }));
  }

  const allLogs = getStore<DailyLog>(STORAGE_KEYS.dailyLogs);
  const allEntries = getStore<LossEntry>(STORAGE_KEYS.lossEntries);

  const recentLogs = allLogs
    .filter((l) => l.plantId === plantId && l.date < beforeDate)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, days);

  return recentLogs.map((log) => ({
    date: log.date,
    production: log.production,
    bar: log.bar,
    delta: log.delta,
    status: log.status as "open" | "closed",
    entries: allEntries.filter((e) => e.plantId === plantId && e.date === log.date),
  }));
}
