"use client";

import { useState, useEffect, useMemo } from "react";
import {
  getDailyLogsByDateRange,
  getAllLossEntries,
  getCategories,
  getSubcategories,
  getProductionUnit,
} from "@/lib/store";
import { DailyLog, LossEntry, LossCategory, LossSubcategory } from "@/types";
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
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, BarChart3 } from "lucide-react";
import {
  format,
  startOfQuarter,
  endOfQuarter,
  eachMonthOfInterval,
  parseISO,
  getYear,
  getQuarter,
} from "date-fns";
import { cn } from "@/lib/utils";

const COLORS = [
  "#10b981",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
];

const QUARTER_LABELS = ["Q1", "Q2", "Q3", "Q4"];

function getQuarterStartMonth(quarter: number): number {
  return (quarter - 1) * 3;
}

export default function QuarterlyReportPage() {
  const now = new Date();
  const currentQuarter = getQuarter(now);
  const [selectedQuarter, setSelectedQuarter] =
    useState<number>(currentQuarter);
  const [selectedYear, setSelectedYear] = useState<number>(getYear(now));

  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);
  const [lossEntries, setLossEntries] = useState<LossEntry[]>([]);
  const [categories, setCategories] = useState<LossCategory[]>([]);
  const [subcategories, setSubcategories] = useState<LossSubcategory[]>([]);
  const [productionUnit, setProductionUnit] = useState<string>("tons");

  const yearOptions = useMemo(() => {
    const currentYear = getYear(new Date());
    return Array.from({ length: 10 }, (_, i) => currentYear - i);
  }, []);

  useEffect(() => {
    const unit = getProductionUnit();
    if (unit) setProductionUnit(unit);

    const cats = getCategories();
    setCategories(cats);

    const subs = getSubcategories();
    setSubcategories(subs);
  }, []);

  useEffect(() => {
    const startMonth = getQuarterStartMonth(selectedQuarter);
    const quarterStart = startOfQuarter(
      new Date(selectedYear, startMonth, 1)
    );
    const quarterEnd = endOfQuarter(quarterStart);
    const startStr = format(quarterStart, "yyyy-MM-dd");
    const endStr = format(quarterEnd, "yyyy-MM-dd");

    const logs = getDailyLogsByDateRange(startStr, endStr);
    setDailyLogs(logs);

    const allLosses = getAllLossEntries();
    const filtered = allLosses.filter((entry) => {
      const entryDate = parseISO(entry.date);
      return entryDate >= quarterStart && entryDate <= quarterEnd;
    });
    setLossEntries(filtered);
  }, [selectedQuarter, selectedYear]);

  const monthsInQuarter = useMemo(() => {
    const startMonth = getQuarterStartMonth(selectedQuarter);
    const quarterStart = startOfQuarter(
      new Date(selectedYear, startMonth, 1)
    );
    const quarterEnd = endOfQuarter(quarterStart);
    return eachMonthOfInterval({ start: quarterStart, end: quarterEnd });
  }, [selectedQuarter, selectedYear]);

  const totalProduction = useMemo(
    () =>
      dailyLogs.reduce((sum, log) => sum + (log.production ?? 0), 0),
    [dailyLogs]
  );

  const totalBAR = useMemo(
    () => dailyLogs.reduce((sum, log) => sum + (log.bar ?? 0), 0),
    [dailyLogs]
  );

  const totalLosses = useMemo(
    () =>
      lossEntries.reduce((sum, entry) => sum + (entry.amount ?? 0), 0),
    [lossEntries]
  );

  const utilization = useMemo(
    () => (totalBAR > 0 ? (totalProduction / totalBAR) * 100 : 0),
    [totalProduction, totalBAR]
  );

  // Bar chart: monthly totals within the quarter (3 bars grouped by month)
  const monthlyBarData = useMemo(() => {
    return monthsInQuarter.map((monthDate) => {
      const monthStr = format(monthDate, "yyyy-MM");
      const monthLabel = format(monthDate, "MMM yyyy");

      const monthLogs = dailyLogs.filter((log) =>
        log.date.startsWith(monthStr)
      );
      const monthLosses = lossEntries.filter((entry) =>
        entry.date.startsWith(monthStr)
      );

      return {
        month: monthLabel,
        Production: monthLogs.reduce(
          (sum, log) => sum + (log.production ?? 0),
          0
        ),
        BAR: monthLogs.reduce(
          (sum, log) => sum + (log.bar ?? 0),
          0
        ),
        Losses: monthLosses.reduce(
          (sum, entry) => sum + (entry.amount ?? 0),
          0
        ),
      };
    });
  }, [monthsInQuarter, dailyLogs, lossEntries]);

  // Pie/donut chart: loss distribution by category
  const pieData = useMemo(() => {
    return categories
      .map((cat, idx) => {
        const catLoss = lossEntries
          .filter((e) => e.categoryId === cat.id)
          .reduce((sum, e) => sum + (e.amount ?? 0), 0);
        return {
          name: cat.name,
          value: catLoss,
          color: COLORS[categories.indexOf(cat) % COLORS.length] || COLORS[idx % COLORS.length],
        };
      })
      .filter((d) => d.value > 0);
  }, [categories, lossEntries]);

  // Category summary table
  const categorySummary = useMemo(() => {
    return categories
      .map((cat) => {
        const catEntries = lossEntries.filter(
          (e) => e.categoryId === cat.id
        );
        const shutdown = catEntries
          .filter((e) => e.lossType === "shutdown")
          .reduce((sum, e) => sum + (e.amount ?? 0), 0);
        const slowdown = catEntries
          .filter((e) => e.lossType === "slowdown")
          .reduce((sum, e) => sum + (e.amount ?? 0), 0);
        const total = shutdown + slowdown;
        const pctOfTotal =
          totalLosses > 0 ? (total / totalLosses) * 100 : 0;
        return {
          id: cat.id,
          name: cat.name,
          color: COLORS[categories.indexOf(cat) % COLORS.length],
          shutdown,
          slowdown,
          total,
          pctOfTotal,
        };
      })
      .filter((row) => row.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [categories, lossEntries, totalLosses]);

  // Production trend line data across the quarter
  const productionTrendData = useMemo(() => {
    return monthsInQuarter.map((monthDate) => {
      const monthStr = format(monthDate, "yyyy-MM");
      const monthLabel = format(monthDate, "MMM");

      const monthLogs = dailyLogs.filter((log) =>
        log.date.startsWith(monthStr)
      );

      return {
        month: monthLabel,
        Production: monthLogs.reduce(
          (sum, log) => sum + (log.production ?? 0),
          0
        ),
        BAR: monthLogs.reduce(
          (sum, log) => sum + (log.bar ?? 0),
          0
        ),
      };
    });
  }, [monthsInQuarter, dailyLogs]);

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
          <p className="text-sm text-muted-foreground">
            {QUARTER_LABELS[selectedQuarter - 1]} {selectedYear}
          </p>
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
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0">
            <CardTitle className="text-sm font-medium">
              Total Production
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">
              {totalProduction.toLocaleString(undefined, {
                maximumFractionDigits: 1,
              })}
            </div>
            <p className="text-xs text-muted-foreground">{productionUnit}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0">
            <CardTitle className="text-sm font-medium">Total BAR</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">
              {totalBAR.toLocaleString(undefined, {
                maximumFractionDigits: 1,
              })}
            </div>
            <p className="text-xs text-muted-foreground">{productionUnit}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0">
            <CardTitle className="text-sm font-medium">Total Losses</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">
              {totalLosses.toLocaleString(undefined, {
                maximumFractionDigits: 1,
              })}
            </div>
            <p className="text-xs text-muted-foreground">{productionUnit}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0">
            <CardTitle className="text-sm font-medium">
              Utilization %
            </CardTitle>
            {utilization >= 80 ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                "text-xl font-bold",
                utilization >= 80 ? "text-green-600" : "text-red-600"
              )}
            >
              {utilization.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">Production / BAR</p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Totals Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Monthly Totals</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      {/* Pie/Donut Chart - Loss Distribution by Category */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Loss Distribution by Category</CardTitle>
        </CardHeader>
        <CardContent>
          {pieData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No loss data for this quarter.
            </p>
          ) : (
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
          )}
        </CardContent>
      </Card>

      {/* Category Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Losses per Category</CardTitle>
        </CardHeader>
        <CardContent>
          {categorySummary.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No loss data for this quarter.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Shutdown</TableHead>
                  <TableHead className="text-right">Slowdown</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">
                    % of Total Losses
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categorySummary.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{
                            backgroundColor: row.color || "#6b7280",
                          }}
                        />
                        <span className="font-medium">{row.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {row.shutdown.toLocaleString(undefined, {
                        maximumFractionDigits: 1,
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.slowdown.toLocaleString(undefined, {
                        maximumFractionDigits: 1,
                      })}
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {row.total.toLocaleString(undefined, {
                        maximumFractionDigits: 1,
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={
                          row.pctOfTotal > 25 ? "destructive" : "secondary"
                        }
                      >
                        {row.pctOfTotal.toFixed(1)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-bold border-t-2">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">
                    {categorySummary
                      .reduce((s, r) => s + r.shutdown, 0)
                      .toLocaleString(undefined, {
                        maximumFractionDigits: 1,
                      })}
                  </TableCell>
                  <TableCell className="text-right">
                    {categorySummary
                      .reduce((s, r) => s + r.slowdown, 0)
                      .toLocaleString(undefined, {
                        maximumFractionDigits: 1,
                      })}
                  </TableCell>
                  <TableCell className="text-right">
                    {totalLosses.toLocaleString(undefined, {
                      maximumFractionDigits: 1,
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge>100%</Badge>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Production Trend Line Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Production Trend</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  );
}
