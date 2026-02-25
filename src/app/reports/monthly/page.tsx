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
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  parseISO,
  getMonth,
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

const MONTHS = [
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

export default function MonthlyReportPage() {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<number>(getMonth(now));
  const [selectedYear, setSelectedYear] = useState<number>(getYear(now));

  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);
  const [allLossEntries, setAllLossEntries] = useState<LossEntry[]>([]);
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
    const monthStart = startOfMonth(new Date(selectedYear, selectedMonth, 1));
    const monthEnd = endOfMonth(monthStart);
    const startStr = format(monthStart, "yyyy-MM-dd");
    const endStr = format(monthEnd, "yyyy-MM-dd");

    const logs = getDailyLogsByDateRange(startStr, endStr);
    setDailyLogs(logs);

    const allLosses = getAllLossEntries();
    const filtered = allLosses.filter((entry) => {
      const entryDate = parseISO(entry.date);
      return entryDate >= monthStart && entryDate <= monthEnd;
    });
    setAllLossEntries(filtered);
  }, [selectedMonth, selectedYear]);

  const daysInMonth = useMemo(() => {
    const monthStart = startOfMonth(new Date(selectedYear, selectedMonth, 1));
    const monthEnd = endOfMonth(monthStart);
    return eachDayOfInterval({ start: monthStart, end: monthEnd });
  }, [selectedMonth, selectedYear]);

  const logsByDate = useMemo(() => {
    const map: Record<string, DailyLog> = {};
    dailyLogs.forEach((log) => {
      map[log.date] = log;
    });
    return map;
  }, [dailyLogs]);

  const categoryMap = useMemo(() => {
    const map: Record<string, LossCategory> = {};
    categories.forEach((cat) => {
      map[cat.id] = cat;
    });
    return map;
  }, [categories]);

  const subcategoryMap = useMemo(() => {
    const map: Record<string, LossSubcategory> = {};
    subcategories.forEach((sub) => {
      map[sub.id] = sub;
    });
    return map;
  }, [subcategories]);

  const totalProduction = useMemo(
    () => dailyLogs.reduce((sum, log) => sum + (log.production ?? 0), 0),
    [dailyLogs]
  );

  const totalBAR = useMemo(
    () => dailyLogs.reduce((sum, log) => sum + (log.bar ?? 0), 0),
    [dailyLogs]
  );

  const totalLosses = useMemo(
    () =>
      allLossEntries.reduce((sum, entry) => sum + (entry.amount ?? 0), 0),
    [allLossEntries]
  );

  const utilization = useMemo(
    () => (totalBAR > 0 ? (totalProduction / totalBAR) * 100 : 0),
    [totalProduction, totalBAR]
  );

  // Stacked bar chart data: daily losses by category
  const stackedBarData = useMemo(() => {
    return daysInMonth.map((day) => {
      const dateStr = format(day, "yyyy-MM-dd");
      const dayLabel = format(day, "dd");
      const dayLosses = allLossEntries.filter((e) => e.date === dateStr);

      const dataPoint: Record<string, string | number> = { day: dayLabel };
      categories.forEach((cat) => {
        const catLoss = dayLosses
          .filter((e) => e.categoryId === cat.id)
          .reduce((sum, e) => sum + (e.amount ?? 0), 0);
        dataPoint[cat.name] = catLoss;
      });
      return dataPoint;
    });
  }, [daysInMonth, allLossEntries, categories]);

  // Line chart data: daily production vs BAR
  const productionLineData = useMemo(() => {
    return daysInMonth.map((day) => {
      const dateStr = format(day, "yyyy-MM-dd");
      const dayLabel = format(day, "dd");
      const log = dailyLogs.find((l) => l.date === dateStr);
      return {
        day: dayLabel,
        Production: log?.production ?? 0,
        BAR: log?.bar ?? 0,
      };
    });
  }, [daysInMonth, dailyLogs]);

  // Category summary table
  const categorySummary = useMemo(() => {
    return categories
      .map((cat) => {
        const catEntries = allLossEntries.filter(
          (e) => e.categoryId === cat.id
        );
        const shutdown = catEntries
          .filter((e) => e.lossType === "shutdown")
          .reduce((sum, e) => sum + (e.amount ?? 0), 0);
        const slowdown = catEntries
          .filter((e) => e.lossType === "slowdown")
          .reduce((sum, e) => sum + (e.amount ?? 0), 0);
        const total = shutdown + slowdown;
        const pctOfTotal = totalLosses > 0 ? (total / totalLosses) * 100 : 0;
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
  }, [categories, allLossEntries, totalLosses]);

  // Subcategory summary grouped by category
  const subcategorySummary = useMemo(() => {
    const grouped: {
      categoryId: string;
      categoryName: string;
      categoryColor?: string;
      subcategories: {
        name: string;
        shutdown: number;
        slowdown: number;
        total: number;
        pctOfTotal: number;
      }[];
    }[] = [];

    categories.forEach((cat) => {
      const catEntries = allLossEntries.filter(
        (e) => e.categoryId === cat.id
      );
      if (catEntries.length === 0) return;

      const subsInCat = subcategories.filter((s) => s.categoryId === cat.id);
      const subRows = subsInCat
        .map((sub) => {
          const subEntries = catEntries.filter(
            (e) => e.subcategoryId === sub.id
          );
          const shutdown = subEntries
            .filter((e) => e.lossType === "shutdown")
            .reduce((sum, e) => sum + (e.amount ?? 0), 0);
          const slowdown = subEntries
            .filter((e) => e.lossType === "slowdown")
            .reduce((sum, e) => sum + (e.amount ?? 0), 0);
          const total = shutdown + slowdown;
          const pctOfTotal =
            totalLosses > 0 ? (total / totalLosses) * 100 : 0;
          return { name: sub.name, shutdown, slowdown, total, pctOfTotal };
        })
        .filter((row) => row.total > 0)
        .sort((a, b) => b.total - a.total);

      if (subRows.length > 0) {
        grouped.push({
          categoryId: cat.id,
          categoryName: cat.name,
          categoryColor: COLORS[categories.indexOf(cat) % COLORS.length],
          subcategories: subRows,
        });
      }
    });

    return grouped;
  }, [categories, subcategories, allLossEntries, totalLosses]);

  return (
    <div className="space-y-3 p-4">
      {/* Header & Selectors */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Monthly Report</h1>
          <p className="text-sm text-muted-foreground">
            {MONTHS[selectedMonth]} {selectedYear}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(selectedMonth)}
            onValueChange={(val) => setSelectedMonth(Number(val))}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((month, idx) => (
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
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
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
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
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
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
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

      {/* Stacked Bar Chart - Daily Losses by Category */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Daily Losses by Category</CardTitle>
        </CardHeader>
        <CardContent>
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
                  fill={COLORS[categories.indexOf(cat) % COLORS.length] || COLORS[idx % COLORS.length]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Line Chart - Daily Production vs BAR */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Daily Production vs BAR</CardTitle>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      {/* Losses per Category Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Losses per Category</CardTitle>
        </CardHeader>
        <CardContent>
          {categorySummary.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No loss data for this month.
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

      {/* Losses per Subcategory Grouped by Category */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Losses per Subcategory</CardTitle>
        </CardHeader>
        <CardContent>
          {subcategorySummary.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No subcategory loss data for this month.
            </p>
          ) : (
            <div className="space-y-4">
              {subcategorySummary.map((group) => (
                <div key={group.categoryId}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <div
                      className="h-2.5 w-2.5 rounded-full"
                      style={{
                        backgroundColor: group.categoryColor || "#6b7280",
                      }}
                    />
                    <h4 className="font-semibold text-sm">
                      {group.categoryName}
                    </h4>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Subcategory</TableHead>
                        <TableHead className="text-right">Shutdown</TableHead>
                        <TableHead className="text-right">Slowdown</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">
                          % of Total Losses
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.subcategories.map((sub, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="pl-6">{sub.name}</TableCell>
                          <TableCell className="text-right">
                            {sub.shutdown.toLocaleString(undefined, {
                              maximumFractionDigits: 1,
                            })}
                          </TableCell>
                          <TableCell className="text-right">
                            {sub.slowdown.toLocaleString(undefined, {
                              maximumFractionDigits: 1,
                            })}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {sub.total.toLocaleString(undefined, {
                              maximumFractionDigits: 1,
                            })}
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline">
                              {sub.pctOfTotal.toFixed(1)}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
