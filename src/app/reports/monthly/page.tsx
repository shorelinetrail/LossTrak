"use client";

import { useState, useMemo } from "react";
import { usePlant } from "@/components/plant-context";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
  eachDayOfInterval,
  eachMonthOfInterval,
  getMonth,
  getYear,
} from "date-fns";
import { cn } from "@/lib/utils";
import {
  CHART_COLORS,
  MONTH_NAMES,
  computeKpis,
  summarizeByCategory,
  summarizeBySubcategory,
} from "@/lib/reports/aggregate";
import { useReportData } from "@/lib/reports/use-report-data";
import { exportReportToExcel } from "@/lib/reports/export";
import { KpiCards } from "@/components/reports/kpi-cards";
import {
  CategorySummaryTable,
  SubcategorySummaryTable,
} from "@/components/reports/summary-tables";
import { ChartCard } from "@/components/reports/chart-card";

type ViewMode = "month" | "rolling12";

export default function MonthlyReportPage() {
  const { selectedPlantId } = usePlant();
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(getMonth(now));
  const [selectedYear, setSelectedYear] = useState<number>(getYear(now));
  const [viewMode, setViewMode] = useState<ViewMode>("month");

  const yearOptions = useMemo(() => {
    const currentYear = getYear(new Date());
    return Array.from({ length: 10 }, (_, i) => currentYear - i);
  }, []);

  const handlePrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  const { rangeStart, rangeEnd } = useMemo(() => {
    const anchor = new Date(selectedYear, selectedMonth, 1);
    if (viewMode === "rolling12") {
      return {
        rangeStart: startOfMonth(subMonths(anchor, 11)),
        rangeEnd: endOfMonth(anchor),
      };
    }
    return { rangeStart: startOfMonth(anchor), rangeEnd: endOfMonth(anchor) };
  }, [selectedMonth, selectedYear, viewMode]);

  const { logs, entries, categories, subcategories, productionUnit, loading } =
    useReportData(selectedPlantId, rangeStart, rangeEnd);

  const kpis = useMemo(() => computeKpis(logs, entries), [logs, entries]);

  const categorySummary = useMemo(
    () => summarizeByCategory(entries, categories, kpis.totalLosses),
    [entries, categories, kpis.totalLosses]
  );

  const subcategorySummary = useMemo(
    () =>
      summarizeBySubcategory(entries, categories, subcategories, kpis.totalLosses),
    [entries, categories, subcategories, kpis.totalLosses]
  );

  // Stacked bar chart: losses by category — per day (month view) or per month (rolling)
  const stackedBarData = useMemo(() => {
    const buckets =
      viewMode === "rolling12"
        ? eachMonthOfInterval({ start: rangeStart, end: rangeEnd }).map((m) => ({
            label: format(m, "MMM yy"),
            prefix: format(m, "yyyy-MM"),
          }))
        : eachDayOfInterval({ start: rangeStart, end: rangeEnd }).map((d) => ({
            label: format(d, "dd"),
            prefix: format(d, "yyyy-MM-dd"),
          }));

    return buckets.map((bucket) => {
      const bucketLosses = entries.filter((e) => e.date.startsWith(bucket.prefix));
      const dataPoint: Record<string, string | number> = { day: bucket.label };
      categories.forEach((cat) => {
        dataPoint[cat.name] = bucketLosses
          .filter((e) => e.categoryId === cat.id)
          .reduce((sum, e) => sum + (e.amount ?? 0), 0);
      });
      return dataPoint;
    });
  }, [entries, categories, viewMode, rangeStart, rangeEnd]);

  // Line chart: production vs BAR — per day (month view) or per month (rolling)
  const productionLineData = useMemo(() => {
    if (viewMode === "rolling12") {
      return eachMonthOfInterval({ start: rangeStart, end: rangeEnd }).map((m) => {
        const monthStr = format(m, "yyyy-MM");
        const monthLogs = logs.filter((l) => l.date.startsWith(monthStr));
        return {
          day: format(m, "MMM yy"),
          Production: monthLogs.reduce((sum, l) => sum + (l.production ?? 0), 0),
          BAR: monthLogs.reduce((sum, l) => sum + (l.bar ?? 0), 0),
        };
      });
    }
    return eachDayOfInterval({ start: rangeStart, end: rangeEnd }).map((d) => {
      const dateStr = format(d, "yyyy-MM-dd");
      const log = logs.find((l) => l.date === dateStr);
      return {
        day: format(d, "dd"),
        Production: log?.production ?? 0,
        BAR: log?.bar ?? 0,
      };
    });
  }, [logs, viewMode, rangeStart, rangeEnd]);

  const periodLabel =
    viewMode === "rolling12"
      ? `${format(rangeStart, "MMM yyyy")} – ${format(rangeEnd, "MMM yyyy")}`
      : `${MONTH_NAMES[selectedMonth]} ${selectedYear}`;

  const handleExport = () => {
    exportReportToExcel({
      filename: `losstrak-monthly-${format(rangeStart, "yyyy-MM")}${viewMode === "rolling12" ? "-rolling12" : ""}`,
      periodLabel,
      productionUnit,
      kpis,
      categorySummary,
      subcategorySummary,
      logs,
    });
  };

  if (!selectedPlantId) {
    return (
      <div className="container mx-auto max-w-5xl py-3 px-4">
        <p className="text-sm text-muted-foreground">
          Select a plant from the top bar to continue.
        </p>
      </div>
    );
  }

  const noLossData = entries.length === 0;

  return (
    <div className="space-y-3 p-4">
      {/* Header & Selectors */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Monthly Report</h1>
          <p className="text-sm text-muted-foreground">{periodLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* View mode toggle */}
          <div className="flex rounded-md border border-input overflow-hidden h-9">
            <button
              type="button"
              onClick={() => setViewMode("month")}
              className={cn(
                "px-3 text-xs font-medium transition-colors",
                viewMode === "month"
                  ? "bg-foreground text-background"
                  : "bg-transparent text-muted-foreground hover:bg-muted"
              )}
            >
              Month
            </button>
            <button
              type="button"
              onClick={() => setViewMode("rolling12")}
              className={cn(
                "px-3 text-xs font-medium transition-colors border-l border-input",
                viewMode === "rolling12"
                  ? "bg-foreground text-background"
                  : "bg-transparent text-muted-foreground hover:bg-muted"
              )}
            >
              12-Month
            </button>
          </div>

          <Button variant="outline" size="icon" className="h-9 w-9" onClick={handlePrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Select
            value={String(selectedMonth)}
            onValueChange={(val) => setSelectedMonth(Number(val))}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((month, idx) => (
                <SelectItem key={idx} value={String(idx)}>
                  {month}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(selectedYear)}
            onValueChange={(val) => setSelectedYear(Number(val))}
          >
            <SelectTrigger className="w-[100px]">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="icon" className="h-9 w-9" onClick={handleNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>

          <Button variant="outline" className="h-9" onClick={handleExport} disabled={loading}>
            <Download className="h-4 w-4 mr-1.5" />
            Export
          </Button>
        </div>
      </div>

      <KpiCards kpis={kpis} productionUnit={productionUnit} loading={loading} />

      <ChartCard
        title={
          viewMode === "rolling12"
            ? "Monthly Losses by Category"
            : "Daily Losses by Category"
        }
        loading={loading}
        empty={noLossData}
      >
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={stackedBarData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip />
            <Legend />
            {categories.map((cat, idx) => (
              <Bar
                key={cat.id}
                dataKey={cat.name}
                stackId="losses"
                fill={CHART_COLORS[idx % CHART_COLORS.length]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title={
          viewMode === "rolling12"
            ? "Monthly Production vs BAR"
            : "Daily Production vs BAR"
        }
        loading={loading}
        empty={logs.length === 0}
      >
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={productionLineData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="Production"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="BAR"
              stroke="#3b82f6"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <CategorySummaryTable
        rows={categorySummary}
        totalLosses={kpis.totalLosses}
        loading={loading}
        emptyMessage="No loss data for this month."
      />

      <SubcategorySummaryTable
        groups={subcategorySummary}
        loading={loading}
        emptyMessage="No subcategory loss data for this month."
      />
    </div>
  );
}
