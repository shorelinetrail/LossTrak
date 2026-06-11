import { DailyLog, LossCategory, LossEntry, LossSubcategory } from "@/types";

// Shared palette for category series across all reports.
export const CHART_COLORS = [
  "#10b981",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
];

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function categoryColor(
  categories: LossCategory[],
  categoryId: string
): string {
  const idx = categories.findIndex((c) => c.id === categoryId);
  return idx >= 0 ? CHART_COLORS[idx % CHART_COLORS.length] : "#6b7280";
}

export interface ReportKpis {
  totalProduction: number;
  totalBAR: number;
  totalLosses: number;
  utilization: number;
}

export function computeKpis(logs: DailyLog[], entries: LossEntry[]): ReportKpis {
  const totalProduction = logs.reduce((sum, l) => sum + (l.production ?? 0), 0);
  const totalBAR = logs.reduce((sum, l) => sum + (l.bar ?? 0), 0);
  const totalLosses = entries.reduce((sum, e) => sum + (e.amount ?? 0), 0);
  return {
    totalProduction,
    totalBAR,
    totalLosses,
    utilization: totalBAR > 0 ? (totalProduction / totalBAR) * 100 : 0,
  };
}

export interface CategorySummaryRow {
  id: string;
  name: string;
  color: string;
  shutdown: number;
  slowdown: number;
  total: number;
  pctOfTotal: number;
}

export function summarizeByCategory(
  entries: LossEntry[],
  categories: LossCategory[],
  totalLosses: number
): CategorySummaryRow[] {
  return categories
    .map((cat) => {
      const catEntries = entries.filter((e) => e.categoryId === cat.id);
      const shutdown = catEntries
        .filter((e) => e.lossType === "shutdown")
        .reduce((sum, e) => sum + (e.amount ?? 0), 0);
      const slowdown = catEntries
        .filter((e) => e.lossType === "slowdown")
        .reduce((sum, e) => sum + (e.amount ?? 0), 0);
      const total = shutdown + slowdown;
      return {
        id: cat.id,
        name: cat.name,
        color: categoryColor(categories, cat.id),
        shutdown,
        slowdown,
        total,
        pctOfTotal: totalLosses > 0 ? (total / totalLosses) * 100 : 0,
      };
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);
}

export interface SubcategorySummaryRow {
  name: string;
  shutdown: number;
  slowdown: number;
  total: number;
  pctOfTotal: number;
}

export interface SubcategorySummaryGroup {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  subcategories: SubcategorySummaryRow[];
}

export function summarizeBySubcategory(
  entries: LossEntry[],
  categories: LossCategory[],
  subcategories: LossSubcategory[],
  totalLosses: number
): SubcategorySummaryGroup[] {
  const grouped: SubcategorySummaryGroup[] = [];

  categories.forEach((cat) => {
    const catEntries = entries.filter((e) => e.categoryId === cat.id);
    if (catEntries.length === 0) return;

    const subRows = subcategories
      .filter((s) => s.categoryId === cat.id)
      .map((sub) => {
        const subEntries = catEntries.filter((e) => e.subcategoryId === sub.id);
        const shutdown = subEntries
          .filter((e) => e.lossType === "shutdown")
          .reduce((sum, e) => sum + (e.amount ?? 0), 0);
        const slowdown = subEntries
          .filter((e) => e.lossType === "slowdown")
          .reduce((sum, e) => sum + (e.amount ?? 0), 0);
        const total = shutdown + slowdown;
        return {
          name: sub.name,
          shutdown,
          slowdown,
          total,
          pctOfTotal: totalLosses > 0 ? (total / totalLosses) * 100 : 0,
        };
      })
      .filter((row) => row.total > 0)
      .sort((a, b) => b.total - a.total);

    if (subRows.length > 0) {
      grouped.push({
        categoryId: cat.id,
        categoryName: cat.name,
        categoryColor: categoryColor(categories, cat.id),
        subcategories: subRows,
      });
    }
  });

  return grouped;
}

export function formatAmount(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}
