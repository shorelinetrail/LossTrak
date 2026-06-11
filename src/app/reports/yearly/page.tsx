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
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import {
  format,
  startOfYear,
  endOfYear,
  eachMonthOfInterval,
  getYear,
} from "date-fns";
import {
  CHART_COLORS,
  categoryColor,
  computeKpis,
  summarizeByCategory,
  summarizeBySubcategory,
} from "@/lib/reports/aggregate";
import { useReportData } from "@/lib/reports/use-report-data";
import { exportReportToExcel } from "@/lib/reports/export";
import { KpiCards } from "@/components/reports/kpi-cards";
import { CategorySummaryTable } from "@/components/reports/summary-tables";
import { ChartCard } from "@/components/reports/chart-card";

export default function YearlyReportPage() {
  const { selectedPlantId } = usePlant();
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(getYear(now));

  const yearOptions = useMemo(() => {
    const currentYear = getYear(new Date());
    return Array.from({ length: 10 }, (_, i) => currentYear - i);
  }, []);

  const { rangeStart, rangeEnd } = useMemo(() => {
    const yearStart = startOfYear(new Date(selectedYear, 0, 1));
    return { rangeStart: yearStart, rangeEnd: endOfYear(yearStart) };
  }, [selectedYear]);

  const { logs, entries, categories, subcategories, productionUnit, loading } =
    useReportData(selectedPlantId, rangeStart, rangeEnd);

  const monthsInYear = useMemo(
    () => eachMonthOfInterval({ start: rangeStart, end: rangeEnd }),
    [rangeStart, rangeEnd]
  );

  const kpis = useMemo(() => computeKpis(logs, entries), [logs, entries]);

  // Bar chart: monthly production vs BAR for the year (12 months)
  const monthlyProductionData = useMemo(() => {
    return monthsInYear.map((month) => {
      const monthStr = format(month, "yyyy-MM");
      const monthLogs = logs.filter((log) => log.date.startsWith(monthStr));
      const production = monthLogs.reduce(
        (sum, log) => sum + (log.production ?? 0),
        0
      );
      const bar = monthLogs.reduce((sum, log) => sum + (log.bar ?? 0), 0);
      return {
        month: format(month, "MMM"),
        Production: production,
        BAR: bar,
      };
    });
  }, [monthsInYear, logs]);

  // Stacked area chart: monthly losses by category
  const stackedAreaData = useMemo(() => {
    return monthsInYear.map((month) => {
      const monthStr = format(month, "yyyy-MM");
      const monthLosses = entries.filter((entry) =>
        entry.date.startsWith(monthStr)
      );

      const dataPoint: Record<string, string | number> = {
        month: format(month, "MMM"),
      };

      categories.forEach((cat) => {
        const catLoss = monthLosses
          .filter((e) => e.categoryId === cat.id)
          .reduce((sum, e) => sum + (e.amount ?? 0), 0);
        dataPoint[cat.name] = catLoss;
      });

      return dataPoint;
    });
  }, [monthsInYear, entries, categories]);

  // Category summary table
  const categorySummary = useMemo(
    () => summarizeByCategory(entries, categories, kpis.totalLosses),
    [entries, categories, kpis.totalLosses]
  );

  const subcategorySummary = useMemo(
    () =>
      summarizeBySubcategory(entries, categories, subcategories, kpis.totalLosses),
    [entries, categories, subcategories, kpis.totalLosses]
  );

  // Pie chart data: category distribution
  const pieData = useMemo(() => {
    return categories
      .map((cat) => {
        const catLoss = entries
          .filter((e) => e.categoryId === cat.id)
          .reduce((sum, e) => sum + (e.amount ?? 0), 0);
        return {
          name: cat.name,
          value: catLoss,
          color: categoryColor(categories, cat.id),
        };
      })
      .filter((d) => d.value > 0);
  }, [categories, entries]);

  const periodLabel = String(selectedYear);

  const handleExport = () => {
    exportReportToExcel({
      filename: `losstrak-yearly-${selectedYear}`,
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
        <p className="text-sm text-muted-foreground">Select a plant from the top bar to continue.</p>
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderCustomLabel = (props: any) => {
    const { cx, cy, midAngle, innerRadius, outerRadius, percent, name } = props;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 1.4;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    if (percent < 0.05) return null;

    return (
      <text
        x={x}
        y={y}
        fill="currentColor"
        textAnchor={x > cx ? "start" : "end"}
        dominantBaseline="central"
        fontSize={12}
      >
        {name} ({(percent * 100).toFixed(1)}%)
      </text>
    );
  };

  return (
    <div className="space-y-3 p-4">
      {/* Header & Selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Yearly Report</h1>
          <p className="text-sm text-muted-foreground">{selectedYear}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(selectedYear)}
            onValueChange={(val) => setSelectedYear(Number(val))}
          >
            <SelectTrigger className="w-[120px]">
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

          <Button variant="outline" className="h-9" onClick={handleExport} disabled={loading}>
            <Download className="h-4 w-4 mr-1.5" />
            Export
          </Button>
        </div>
      </div>

      <KpiCards kpis={kpis} productionUnit={productionUnit} loading={loading} />

      <ChartCard
        title="Monthly Production vs BAR"
        loading={loading}
        empty={logs.length === 0}
      >
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={monthlyProductionData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip />
            <Legend />
            <Bar dataKey="Production" fill="#10b981" />
            <Bar dataKey="BAR" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Monthly Losses by Category"
        loading={loading}
        empty={entries.length === 0}
        emptyMessage="No loss data for this year."
      >
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={stackedAreaData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip />
            <Legend />
            {categories.map((cat, idx) => (
              <Area
                key={cat.id}
                type="monotone"
                dataKey={cat.name}
                stackId="losses"
                stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                fill={CHART_COLORS[idx % CHART_COLORS.length]}
                fillOpacity={0.6}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <CategorySummaryTable
        rows={categorySummary}
        totalLosses={kpis.totalLosses}
        loading={loading}
        emptyMessage="No loss data for this year."
      />

      <ChartCard
        title="Category Distribution"
        loading={loading}
        empty={entries.length === 0}
        emptyMessage="No loss data for this year."
      >
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              outerRadius={150}
              paddingAngle={2}
              dataKey="value"
              label={renderCustomLabel}
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) =>
                Number(value).toLocaleString(undefined, {
                  maximumFractionDigits: 1,
                })
              }
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
