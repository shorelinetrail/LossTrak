import * as XLSX from "xlsx";
import { DailyLog } from "@/types";
import {
  CategorySummaryRow,
  ReportKpis,
  SubcategorySummaryGroup,
} from "./aggregate";

export interface ReportExport {
  filename: string;
  periodLabel: string;
  productionUnit: string;
  kpis: ReportKpis;
  categorySummary: CategorySummaryRow[];
  subcategorySummary: SubcategorySummaryGroup[];
  logs: DailyLog[];
}

/** Builds a multi-sheet Excel workbook and triggers a browser download. */
export function exportReportToExcel({
  filename,
  periodLabel,
  productionUnit,
  kpis,
  categorySummary,
  subcategorySummary,
  logs,
}: ReportExport): void {
  const wb = XLSX.utils.book_new();

  const summarySheet = XLSX.utils.aoa_to_sheet([
    ["LossTrak Report", periodLabel],
    [],
    ["Metric", `Value (${productionUnit})`],
    ["Total Production", round1(kpis.totalProduction)],
    ["Total BAR", round1(kpis.totalBAR)],
    ["Total Losses", round1(kpis.totalLosses)],
    ["Utilization %", Number(kpis.utilization.toFixed(1))],
  ]);
  XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");

  const catSheet = XLSX.utils.aoa_to_sheet([
    ["Category", "Shutdown", "Slowdown", "Total", "% of Total Losses"],
    ...categorySummary.map((row) => [
      row.name,
      round1(row.shutdown),
      round1(row.slowdown),
      round1(row.total),
      Number(row.pctOfTotal.toFixed(1)),
    ]),
  ]);
  XLSX.utils.book_append_sheet(wb, catSheet, "Categories");

  const subRows: (string | number)[][] = [
    ["Category", "Subcategory", "Shutdown", "Slowdown", "Total", "% of Total Losses"],
  ];
  for (const group of subcategorySummary) {
    for (const sub of group.subcategories) {
      subRows.push([
        group.categoryName,
        sub.name,
        round1(sub.shutdown),
        round1(sub.slowdown),
        round1(sub.total),
        Number(sub.pctOfTotal.toFixed(1)),
      ]);
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(subRows), "Subcategories");

  const dailySheet = XLSX.utils.aoa_to_sheet([
    ["Date", "Production", "BAR", "Delta", "Status", "Comments"],
    ...[...logs]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((log) => [
        log.date,
        log.production,
        log.bar,
        log.delta,
        log.status,
        log.comments,
      ]),
  ]);
  XLSX.utils.book_append_sheet(wb, dailySheet, "Daily Data");

  XLSX.writeFile(wb, `${filename}.xlsx`);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
