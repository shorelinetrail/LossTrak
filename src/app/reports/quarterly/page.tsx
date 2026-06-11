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
  PieChart,
  Pie,
  Cell,
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
  startOfQuarter,
  endOfQuarter,
  eachMonthOfInterval,
  getYear,
  getQuarter,
} from "date-fns";
import {
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

const QUARTER_LABELS = ["Q1", "Q2", "Q3", "Q4"];

function getQuarterStartMonth(quarter: number): number {
  return (quarter - 1) * 3;
}

export default function QuarterlyReportPage() {
  const { selectedPlantId } = usePlant();
  const now = new Date();
  const currentQuarter = getQuarter(now);
  const [selectedQuarter, setSelectedQuarter] =
    useState<number>(currentQuarter);
  const [selectedYear, setSelectedYear] = useState<number>(getYear(now));

  const yearOptions = useMemo(() => {
    const currentYear = getYear(new Date());
    return Array.from({ length: 10 }, (_, i) => currentYear - i);
  }, []);

  const { rangeStart, rangeEnd } = useMemo(() => {
    const startMonth = getQuarterStartMonth(selectedQuarter);
    const quarterStart = startOfQuarter(new Date(selectedYear, startMonth, 1));
    return { rangeStart: quarterStart, rangeEnd: endOfQuarter(quarterStart) };
  }, [selectedQuarter, selectedYear]);

  const { logs, entries, categories, subcategories, productionUnit, loading } =
    useReportData(selectedPlantId, rangeStart, rangeEnd);

  const monthsInQuarter = useMemo(
    () => eachMonthOfInterval({ start: rangeStart, end: rangeEnd }),
    [rangeStart, rangeEnd]
  );

  const kpis = useMemo(() => computeKpis(logs, entries), [logs, entries]);

  // Bar chart: monthly totals within the quarter (3 bars grouped by month)
  const monthlyBarData = useMemo(() => {
    return monthsInQuarter.map((monthDate) => {
      const monthStr = format(monthDate, "yyyy-MM");
      const monthLabel = format(monthDate, "MMM yyyy");

      const monthLogs = logs.filter((log) => log.date.startsWith(monthStr));
      const monthLosses = entries.filter((entry) =>
        entry.date.startsWith(monthStr)
      );

      return {
        month: monthLabel,
        Production: monthLogs.reduce(
          (sum, log) => sum + (log.production ?? 0),
          0
        ),
        BAR: monthLogs.reduce((sum, log) => sum + (log.bar ?? 0), 0),
        Losses: monthLosses.reduce((sum, entry) => sum + (entry.amount ?? 0), 0),
      };
    });
  }, [monthsInQuarter, logs, entries]);

  // Pie/donut chart: loss distribution by category
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

  // Production trend line data across the quarter
  const productionTrendData = useMemo(() => {
    return monthsInQuarter.map((monthDate) => {
      const monthStr = format(monthDate, "yyyy-MM");
      const monthLabel = format(monthDate, "MMM");

      const monthLogs = logs.filter((log) => log.date.startsWith(monthStr));

      return {
        month: monthLabel,
        Production: monthLogs.reduce(
          (sum, log) => sum + (log.production ?? 0),
          0
        ),
        BAR: monthLogs.reduce((sum, log) => sum + (log.bar ?? 0), 0),
      };
    });
  }, [monthsInQuarter, logs]);

  const periodLabel = `${QUARTER_LABELS[selectedQuarter - 1]} ${selectedYear}`;

  const handleExport = () => {
    exportReportToExcel({
      filename: `losstrak-quarterly-${selectedYear}-Q${selectedQuarter}`,
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
      {/* Header & Selectors */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Quarterly Report</h1>
          <p className="text-sm text-muted-foreground">{periodLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(selectedQuarter)}
            onValueChange={(val) => setSelectedQuarter(Number(val))}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Quarter" />
            </SelectTrigger>
            <SelectContent>
              {QUARTER_LABELS.map((label, idx) => (
                <SelectItem key={idx} value={String(idx + 1)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        title="Monthly Totals"
        loading={loading}
        empty={logs.length === 0 && entries.length === 0}
      >
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={monthlyBarData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip />
            <Legend />
            <Bar dataKey="Production" fill="#10b981" />
            <Bar dataKey="BAR" fill="#3b82f6" />
            <Bar dataKey="Losses" fill="#ef4444" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Loss Distribution by Category"
        loading={loading}
        empty={entries.length === 0}
        emptyMessage="No loss data for this quarter."
      >
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={80}
              outerRadius={140}
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

      <CategorySummaryTable
        rows={categorySummary}
        totalLosses={kpis.totalLosses}
        loading={loading}
        emptyMessage="No loss data for this quarter."
      />

      <ChartCard
        title="Production Trend"
        loading={loading}
        empty={logs.length === 0}
        height={280}
      >
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={productionTrendData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="Production"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ r: 5 }}
            />
            <Line
              type="monotone"
              dataKey="BAR"
              stroke="#3b82f6"
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
