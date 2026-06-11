"use client";

import {
  Site,
  Plant,
  LossCategory,
  LossSubcategory,
  LossDetailCode,
  DailyLog,
  LossEntry,
} from "@/types";
import { createBrowserClient } from "@supabase/ssr";

// ─── Supabase client (lazy singleton) ─────────────────────────────

let _sb: ReturnType<typeof createBrowserClient> | undefined;

function sb() {
  if (_sb !== undefined) return _sb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url.includes("your-project")) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  _sb = createBrowserClient(url, key);
  return _sb;
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

function toSite(r: Row): Site {
  return {
    id: r.id,
    name: r.name,
    displayOrder: r.display_order ?? 0,
    isActive: r.is_active ?? true,
    createdAt: r.created_at,
  };
}

function toPlant(r: Row): Plant {
  return {
    id: r.id,
    siteId: r.site_id,
    name: r.name,
    displayOrder: r.display_order ?? 0,
    isActive: r.is_active ?? true,
    createdAt: r.created_at,
  };
}

function toSub(r: Row): LossSubcategory {
  return {
    id: r.id,
    categoryId: r.category_id,
    plantId: r.plant_id ?? "",
    name: r.name,
    displayOrder: r.display_order ?? 0,
    isActive: r.is_active ?? true,
    createdAt: r.created_at,
  };
}

function toDc(r: Row): LossDetailCode {
  return {
    id: r.id,
    subcategoryId: r.subcategory_id,
    name: r.name,
    displayOrder: r.display_order,
    isActive: r.is_active,
    createdAt: r.created_at,
  };
}

function toLog(r: Row): DailyLog {
  return {
    id: r.id,
    plantId: r.plant_id ?? "",
    date: r.date,
    production: Number(r.production),
    bar: Number(r.bar),
    delta: Number(r.delta),
    comments: r.comments,
    status: r.status as DailyLog["status"],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toEntry(r: Row): LossEntry {
  return {
    id: r.id,
    dailyLogId: r.daily_log_id,
    plantId: r.plant_id ?? "",
    date: nullToEmpty(r.date),
    categoryId: nullToEmpty(r.category_id),
    subcategoryId: nullToEmpty(r.subcategory_id),
    detailCodeId: nullToEmpty(r.detail_code_id),
    lossType: r.loss_type as LossEntry["lossType"],
    amount: Number(r.amount),
    durationHours:
      r.duration_hours === null || r.duration_hours === undefined
        ? null
        : Number(r.duration_hours),
    comments: r.comments,
    createdAt: r.created_at,
  };
}

// ─── Sites ──────────────────────────────────────────────────────

export async function getSites(): Promise<Site[]> {
  const { data, error } = await sb()
    .from("sites")
    .select("*")
    .eq("is_active", true)
    .order("display_order");
  if (error) throw error;
  return (data ?? []).map(toSite);
}

export async function createSite(
  data: Omit<Site, "id" | "createdAt">
): Promise<Site> {
  const { data: row, error } = await sb()
    .from("sites")
    .insert({ name: data.name, display_order: data.displayOrder, is_active: data.isActive })
    .select()
    .single();
  if (error) throw error;
  return toSite(row);
}

export async function updateSite(
  id: string,
  data: Partial<Site>
): Promise<Site | null> {
  const update: Record<string, unknown> = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.displayOrder !== undefined) update.display_order = data.displayOrder;
  if (data.isActive !== undefined) update.is_active = data.isActive;
  const { data: row, error } = await sb()
    .from("sites")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return toSite(row);
}

export async function deleteSite(id: string): Promise<void> {
  const { error } = await sb().from("sites").update({ is_active: false }).eq("id", id);
  if (error) throw error;
}

// ─── Plants ─────────────────────────────────────────────────────

export async function getPlants(siteId?: string): Promise<Plant[]> {
  let q = sb().from("plants").select("*").eq("is_active", true).order("display_order");
  if (siteId) q = q.eq("site_id", siteId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(toPlant);
}

export async function createPlant(
  data: Omit<Plant, "id" | "createdAt">
): Promise<Plant> {
  const { data: row, error } = await sb()
    .from("plants")
    .insert({ site_id: data.siteId, name: data.name, display_order: data.displayOrder, is_active: data.isActive })
    .select()
    .single();
  if (error) throw error;
  return toPlant(row);
}

export async function updatePlant(
  id: string,
  data: Partial<Plant>
): Promise<Plant | null> {
  const update: Record<string, unknown> = {};
  if (data.siteId !== undefined) update.site_id = data.siteId;
  if (data.name !== undefined) update.name = data.name;
  if (data.displayOrder !== undefined) update.display_order = data.displayOrder;
  if (data.isActive !== undefined) update.is_active = data.isActive;
  const { data: row, error } = await sb()
    .from("plants")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return toPlant(row);
}

export async function deletePlant(id: string): Promise<void> {
  const { error } = await sb().from("plants").update({ is_active: false }).eq("id", id);
  if (error) throw error;
}

// ─── Categories ──────────────────────────────────────────────────

export async function getCategories(): Promise<LossCategory[]> {
  const { data, error } = await sb()
    .from("loss_categories")
    .select("*")
    .eq("is_active", true)
    .order("display_order");
  if (error) throw error;
  return (data ?? []).map(toCat);
}

export async function getAllCategories(): Promise<LossCategory[]> {
  const { data, error } = await sb()
    .from("loss_categories")
    .select("*")
    .order("display_order");
  if (error) throw error;
  return (data ?? []).map(toCat);
}

export async function createCategory(
  data: Omit<LossCategory, "id" | "createdAt">
): Promise<LossCategory> {
  const { data: row, error } = await sb()
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

export async function updateCategory(
  id: string,
  data: Partial<LossCategory>
): Promise<LossCategory | null> {
  const update: Record<string, unknown> = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.displayOrder !== undefined) update.display_order = data.displayOrder;
  if (data.allowedLossTypes !== undefined) update.allowed_loss_types = data.allowedLossTypes;
  if (data.isActive !== undefined) update.is_active = data.isActive;
  const { data: row, error } = await sb()
    .from("loss_categories")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return toCat(row);
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await sb()
    .from("loss_categories")
    .update({ is_active: false })
    .eq("id", id);
  if (error) throw error;
}

// ─── Subcategories ───────────────────────────────────────────────

export async function getSubcategories(plantId: string, categoryId?: string): Promise<LossSubcategory[]> {
  let q = sb().from("loss_subcategories").select("*")
    .eq("is_active", true).eq("plant_id", plantId).order("display_order");
  if (categoryId) q = q.eq("category_id", categoryId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(toSub);
}

export async function getAllSubcategories(plantId?: string): Promise<LossSubcategory[]> {
  let q = sb().from("loss_subcategories").select("*").order("display_order");
  if (plantId) q = q.eq("plant_id", plantId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(toSub);
}

export async function createSubcategory(
  data: Omit<LossSubcategory, "id" | "createdAt">
): Promise<LossSubcategory> {
  const { data: row, error } = await sb()
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

export async function updateSubcategory(
  id: string,
  data: Partial<LossSubcategory>
): Promise<LossSubcategory | null> {
  const update: Record<string, unknown> = {};
  if (data.categoryId !== undefined) update.category_id = data.categoryId;
  if (data.name !== undefined) update.name = data.name;
  if (data.displayOrder !== undefined) update.display_order = data.displayOrder;
  if (data.isActive !== undefined) update.is_active = data.isActive;
  const { data: row, error } = await sb()
    .from("loss_subcategories")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return toSub(row);
}

export async function deleteSubcategory(id: string): Promise<void> {
  const { error } = await sb()
    .from("loss_subcategories")
    .update({ is_active: false })
    .eq("id", id);
  if (error) throw error;
}

// ─── Detail Codes ───────────────────────────────────────────────

export async function getDetailCodes(subcategoryId?: string): Promise<LossDetailCode[]> {
  let q = sb().from("loss_detail_codes").select("*").eq("is_active", true).order("display_order");
  if (subcategoryId) q = q.eq("subcategory_id", subcategoryId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(toDc);
}

export async function getAllDetailCodes(): Promise<LossDetailCode[]> {
  const { data, error } = await sb()
    .from("loss_detail_codes")
    .select("*")
    .order("display_order");
  if (error) throw error;
  return (data ?? []).map(toDc);
}

export async function createDetailCode(
  data: Omit<LossDetailCode, "id" | "createdAt">
): Promise<LossDetailCode> {
  const { data: row, error } = await sb()
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

export async function updateDetailCode(
  id: string,
  data: Partial<LossDetailCode>
): Promise<LossDetailCode | null> {
  const update: Record<string, unknown> = {};
  if (data.subcategoryId !== undefined) update.subcategory_id = data.subcategoryId;
  if (data.name !== undefined) update.name = data.name;
  if (data.displayOrder !== undefined) update.display_order = data.displayOrder;
  if (data.isActive !== undefined) update.is_active = data.isActive;
  const { data: row, error } = await sb()
    .from("loss_detail_codes")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return toDc(row);
}

export async function deleteDetailCode(id: string): Promise<void> {
  const { error } = await sb()
    .from("loss_detail_codes")
    .update({ is_active: false })
    .eq("id", id);
  if (error) throw error;
}

// ─── Daily Logs ──────────────────────────────────────────────────

export async function getDailyLogs(plantId: string): Promise<DailyLog[]> {
  const { data, error } = await sb()
    .from("daily_logs")
    .select("*")
    .eq("plant_id", plantId)
    .order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toLog);
}

export async function getDailyLog(plantId: string, date: string): Promise<DailyLog | null> {
  const { data, error } = await sb()
    .from("daily_logs")
    .select("*")
    .eq("plant_id", plantId)
    .eq("date", date)
    .maybeSingle();
  if (error) throw error;
  return data ? toLog(data) : null;
}

export async function getDailyLogById(id: string): Promise<DailyLog | null> {
  const { data, error } = await sb()
    .from("daily_logs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toLog(data) : null;
}

export async function createDailyLog(
  data: Omit<DailyLog, "id" | "createdAt" | "updatedAt" | "delta">
): Promise<DailyLog> {
  // delta is a GENERATED column — omit it from insert
  const { data: row, error } = await sb()
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

export async function updateDailyLog(
  dateOrId: string,
  data: Partial<Omit<DailyLog, "id" | "createdAt">>
): Promise<DailyLog | null> {
  // delta is GENERATED — don't send it
  const update: Record<string, unknown> = {};
  if (data.production !== undefined) update.production = data.production;
  if (data.bar !== undefined) update.bar = data.bar;
  if (data.comments !== undefined) update.comments = data.comments;
  if (data.status !== undefined) update.status = data.status;
  const isDate = /^\d{4}-\d{2}-\d{2}$/.test(dateOrId);
  const col = isDate ? "date" : "id";
  const { data: row, error } = await sb()
    .from("daily_logs")
    .update(update)
    .eq(col, dateOrId)
    .select()
    .single();
  if (error) throw error;
  return toLog(row);
}

export async function getDailyLogsByDateRange(
  plantId: string,
  startDate: string,
  endDate: string
): Promise<DailyLog[]> {
  const { data, error } = await sb()
    .from("daily_logs")
    .select("*")
    .eq("plant_id", plantId)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date");
  if (error) throw error;
  return (data ?? []).map(toLog);
}

// ─── Bulk Day Operations ─────────────────────────────────────────

export async function bulkUpdateDayStatus(
  ids: string[],
  status: "open" | "closed"
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await sb()
    .from("daily_logs")
    .update({ status })
    .in("id", ids);
  if (error) throw error;
}

export async function deleteDailyLog(id: string): Promise<void> {
  // Delete associated loss entries first
  const { error: entryErr } = await sb()
    .from("loss_entries")
    .delete()
    .eq("daily_log_id", id);
  if (entryErr) throw entryErr;
  const { error } = await sb().from("daily_logs").delete().eq("id", id);
  if (error) throw error;
}

export async function bulkDeleteDailyLogs(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error: entryErr } = await sb()
    .from("loss_entries")
    .delete()
    .in("daily_log_id", ids);
  if (entryErr) throw entryErr;
  const { error } = await sb().from("daily_logs").delete().in("id", ids);
  if (error) throw error;
}

// ─── Loss Entries ────────────────────────────────────────────────

export async function getLossEntries(plantId: string, date?: string): Promise<LossEntry[]> {
  let q = sb().from("loss_entries").select("*").eq("plant_id", plantId).order("created_at");
  if (date) q = q.eq("date", date);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(toEntry);
}

export async function getAllLossEntries(plantId: string): Promise<LossEntry[]> {
  const { data, error } = await sb().from("loss_entries").select("*").eq("plant_id", plantId);
  if (error) throw error;
  return (data ?? []).map(toEntry);
}

export async function getLossEntriesByDateRange(
  plantId: string,
  startDate: string,
  endDate: string
): Promise<LossEntry[]> {
  const { data, error } = await sb()
    .from("loss_entries")
    .select("*")
    .eq("plant_id", plantId)
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date");
  if (error) throw error;
  return (data ?? []).map(toEntry);
}

export async function createLossEntry(
  data: Omit<LossEntry, "id" | "createdAt">
): Promise<LossEntry> {
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
  if (data.durationHours !== undefined && data.durationHours !== null) {
    row.duration_hours = data.durationHours;
  }

  const { data: inserted, error } = await sb()
    .from("loss_entries")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return toEntry(inserted);
}

export async function updateLossEntry(
  id: string,
  data: Partial<Omit<LossEntry, "id" | "createdAt">>
): Promise<LossEntry | null> {
  const update: Record<string, unknown> = {};
  if (data.dailyLogId !== undefined) update.daily_log_id = data.dailyLogId;
  if (data.date !== undefined) update.date = emptyToNull(data.date);
  if (data.categoryId !== undefined) update.category_id = emptyToNull(data.categoryId);
  if (data.subcategoryId !== undefined) update.subcategory_id = emptyToNull(data.subcategoryId);
  if (data.detailCodeId !== undefined) update.detail_code_id = emptyToNull(data.detailCodeId);
  if (data.lossType !== undefined) update.loss_type = data.lossType;
  if (data.amount !== undefined) update.amount = data.amount;
  if (data.durationHours !== undefined) update.duration_hours = data.durationHours;
  if (data.comments !== undefined) update.comments = data.comments;
  const { data: row, error } = await sb()
    .from("loss_entries")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return toEntry(row);
}

export async function deleteLossEntry(id: string): Promise<void> {
  const { error } = await sb().from("loss_entries").delete().eq("id", id);
  if (error) throw error;
}

// ─── Config ──────────────────────────────────────────────────────

export async function getConfig(key: string): Promise<string | null> {
  const { data, error } = await sb()
    .from("app_config")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
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
  const { error } = await sb()
    .from("app_config")
    .upsert({ key, value: String(value) }, { onConflict: "key" });
  if (error) throw error;
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
  const { data: logs, error: logErr } = await sb()
    .from("daily_logs")
    .select("*")
    .eq("plant_id", plantId)
    .lt("date", beforeDate)
    .order("date", { ascending: false })
    .limit(days);
  if (logErr) throw logErr;
  if (!logs || logs.length === 0) return [];

  const dates = logs.map((l: Row) => l.date);
  const { data: entries, error: entErr } = await sb()
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
