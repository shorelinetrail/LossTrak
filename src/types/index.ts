// Core domain types for LossTrak

export type LossType = "shutdown" | "slowdown";

export interface Site {
  id: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
}

export interface Plant {
  id: string;
  siteId: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
}

export interface LossCategory {
  id: string;
  name: string;
  displayOrder: number;
  /** Which loss types are allowed. Grade Slate only allows "slowdown". */
  allowedLossTypes: LossType[];
  isActive: boolean;
  createdAt: string;
}

export interface LossSubcategory {
  id: string;
  categoryId: string;
  plantId: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
}

export interface LossDetailCode {
  id: string;
  subcategoryId: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
}

export interface DailyLog {
  id: string;
  plantId: string;
  date: string; // YYYY-MM-DD
  production: number;
  bar: number; // Best Achievable Rate for this day
  delta: number; // bar - production (computed)
  comments: string;
  status: "open" | "closed";
  createdAt: string;
  updatedAt: string;
}

export interface LossEntry {
  id: string;
  dailyLogId: string;
  plantId: string;
  date: string; // denormalized for easy filtering
  categoryId: string;
  subcategoryId: string;
  detailCodeId: string; // optional third level below subcategory
  lossType: LossType;
  amount: number;
  comments: string;
  createdAt: string;
}

export interface AppConfig {
  id: string;
  key: string;
  value: string;
  updatedAt: string;
}

// Derived types for UI
export interface LossEntryWithDetails extends LossEntry {
  categoryName: string;
  subcategoryName: string;
  detailCodeName: string;
}

export interface DailyLogWithEntries extends DailyLog {
  entries: LossEntryWithDetails[];
}

export interface ReportRow {
  label: string;
  shutdown: number;
  slowdown: number;
  total: number;
}

export interface MonthlyData {
  month: string;
  production: number;
  bar: number;
  totalLosses: number;
  categories: Record<string, number>;
}
