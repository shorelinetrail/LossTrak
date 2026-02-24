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
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
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
  startOfYear,
  endOfYear,
  eachMonthOfInterval,
  parseISO,
  getYear,
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

export default function YearlyReportPage() {
  const now = new Date();
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
    const yearStart = startOfYear(new Date(selectedYear, 0, 1));
    const yearEnd = endOfYear(yearStart);
    const startStr = format(yearStart, "yyyy-MM-dd");
    const endStr = format(yearEnd, "yyyy-MM-dd");

    const logs = getDailyLogsByDateRange(startStr, endStr);
    setDailyLogs(logs);

    const allLosses = getAllLossEntries();
    const filtered = allLosses.filter((entry) => {
      const entryDate = parseISO(entry.date);
      return entryDate >= yearStart && entryDate <= yearEnd;
    });
    setLossEntries(filtered);
  }, [selectedYear]);

  const monthsInYear = useMemo(() => {
    const yearStart = startOfYear(new Date(selectedYear, 0, 1));
    const yearEnd = endOfYear(yearStart);
    return eachMonthOfInterval({ start: yearStart, end: yearEnd });
  }, [selectedYear]);

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

  // Bar chart: monthly production vs BAR for the year (12 months)
  const monthlyProductionData = useMemo(() => {
    return monthsInYear.map((month) => {
      const monthStr = format(month, "yyyy-MM");
      const monthLogs = dailyLogs.filter((log) =>
        log.date.startsWith(monthStr)
      );
      const production = monthLogs.reduce(
        (sum, log) => sum + (log.production ?? 0),
        0
      );
      const bar = monthLogs.reduce(
        (sum, log) => sum + (log.bar ?? 0),
        0
      );
      return {
        month: format(month, "MMM"),
        Production: production,
        BAR: bar,
      };
    });
  }, [monthsInYear, dailyLogs]);

  // Stacked area chart: monthly losses by category
  const stackedAreaData = useMemo(() => {
    return monthsInYear.map((month) => {
      const monthStr = format(month, "yyyy-MM");
      const monthLosses = lossEntries.filter((entry) =>
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
  }, [monthsInYear, lossEntries, categories]);

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

  // Pie chart data: category distribution
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
    <div className="space-y-6 p-6">
      {/* Header & Selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Yearly Report</h1>
          <p className="text-muted-foreground">
            Production and loss analysis for {selectedYear}
          </p>
        </div>
        <div className="flex items-center gap-3">
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Production
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalProduction.toLocaleString(undefined, {
                maximumFractionDigits: 1,
              })}
            </div>
            <p className="text-xs text-muted-foreground">{productionUnit}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total BAR</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalBAR.toLocaleString(undefined, {
                maximumFractionDigits: 1,
              })}
            </div>
            <p className="text-xs text-muted-foreground">{productionUnit}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Losses</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalLosses.toLocaleString(undefined, {
                maximumFractionDigits: 1,
              })}
            </div>
            <p className="text-xs text-muted-foreground">{productionUnit}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
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
                "text-2xl font-bold",
                utilization >= 80 ? "text-green-600" : "text-red-600"
              )}
            >
              {utilization.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">Production / BAR</p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Production vs BAR Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Production vs BAR</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
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
        </CardContent>
      </Card>

      {/* Stacked Area Chart - Monthly Losses by Category */}
      <Card>
        <CardHeader>
          <CardTitle>Monthly Losses by Category</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
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
                  stroke={COLORS[categories.indexOf(cat) % COLORS.length] || COLORS[idx % COLORS.length]}
                  fill={COLORS[categories.indexOf(cat) % COLORS.length] || COLORS[idx % COLORS.length]}
                  fillOpacity={0.6}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Category Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle>Losses per Category</CardTitle>
        </CardHeader>
        <CardContent>
          {categorySummary.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No loss data for this year.
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

      {/* Pie Chart - Category Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Category Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          {pieData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-12 text-center">
              No loss data for this year.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={400}>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
