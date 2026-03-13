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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  eachDayOfInterval,
  eachMonthOfInterval,
  parseISO,
  getMonth,
  getYear,
} from "date-fns";
import { cn } from "@/lib/utils";

type ViewMode = "day" | "month" | "year";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Categories considered "planned" for CTP calculation
const GRADE_SLATE_NAME = "Grade Slate";
const PLANNED_CATEGORY_NAME = "Business";

function fmtNum(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export default function TableReportPage() {
  const now = new Date();
  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [selectedMonth, setSelectedMonth] = useState<number>(getMonth(now));
  const [selectedYear, setSelectedYear] = useState<number>(getYear(now));
  const [selectedDay, setSelectedDay] = useState<string>(format(now, "yyyy-MM-dd"));

  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);
  const [allLossEntries, setAllLossEntries] = useState<LossEntry[]>([]);
  const [categories, setCategories] = useState<LossCategory[]>([]);
  const [subcategories, setSubcategories] = useState<LossSubcategory[]>([]);
  const [productionUnit, setProductionUnit] = useState<string>("tonnes");

  const yearOptions = useMemo(() => {
    const currentYear = getYear(new Date());
    return Array.from({ length: 10 }, (_, i) => currentYear - i);
  }, []);

  // Compute date range based on view mode
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (viewMode === "day") {
      const d = parseISO(selectedDay);
      return { rangeStart: d, rangeEnd: d };
    }
    if (viewMode === "month") {
      const anchor = new Date(selectedYear, selectedMonth, 1);
      return { rangeStart: startOfMonth(anchor), rangeEnd: endOfMonth(anchor) };
    }
    // year
    const anchor = new Date(selectedYear, 0, 1);
    return { rangeStart: startOfYear(anchor), rangeEnd: endOfYear(anchor) };
  }, [viewMode, selectedDay, selectedMonth, selectedYear]);

  // Navigation helpers
  const handlePrev = () => {
    if (viewMode === "day") {
      const d = parseISO(selectedDay);
      d.setDate(d.getDate() - 1);
      setSelectedDay(format(d, "yyyy-MM-dd"));
    } else if (viewMode === "month") {
      if (selectedMonth === 0) {
        setSelectedMonth(11);
        setSelectedYear((y) => y - 1);
      } else {
        setSelectedMonth((m) => m - 1);
      }
    } else {
      setSelectedYear((y) => y - 1);
    }
  };

  const handleNext = () => {
    if (viewMode === "day") {
      const d = parseISO(selectedDay);
      d.setDate(d.getDate() + 1);
      setSelectedDay(format(d, "yyyy-MM-dd"));
    } else if (viewMode === "month") {
      if (selectedMonth === 11) {
        setSelectedMonth(0);
        setSelectedYear((y) => y + 1);
      } else {
        setSelectedMonth((m) => m + 1);
      }
    } else {
      setSelectedYear((y) => y + 1);
    }
  };

  // Load static data
  useEffect(() => {
    async function load() {
      const unit = await getProductionUnit();
      if (unit) setProductionUnit(unit);
      const cats = await getCategories();
      setCategories(cats);
      const subs = await getSubcategories();
      setSubcategories(subs);
    }
    load();
  }, []);

  // Fetch data for range
  useEffect(() => {
    async function load() {
      const startStr = format(rangeStart, "yyyy-MM-dd");
      const endStr = format(rangeEnd, "yyyy-MM-dd");
      const logs = await getDailyLogsByDateRange(startStr, endStr);
      setDailyLogs(logs);
      const allLosses = await getAllLossEntries();
      const filtered = allLosses.filter((entry) => {
        const entryDate = parseISO(entry.date);
        return entryDate >= rangeStart && entryDate <= rangeEnd;
      });
      setAllLossEntries(filtered);
    }
    load();
  }, [rangeStart, rangeEnd]);

  // Maps
  const categoryMap = useMemo(() => {
    const map: Record<string, LossCategory> = {};
    categories.forEach((cat) => { map[cat.id] = cat; });
    return map;
  }, [categories]);

  const subcategoryMap = useMemo(() => {
    const map: Record<string, LossSubcategory> = {};
    subcategories.forEach((sub) => { map[sub.id] = sub; });
    return map;
  }, [subcategories]);

  // Aggregated totals
  const totalProduction = useMemo(
    () => dailyLogs.reduce((sum, log) => sum + (log.production ?? 0), 0),
    [dailyLogs]
  );
  const totalBAR = useMemo(
    () => dailyLogs.reduce((sum, log) => sum + (log.bar ?? 0), 0),
    [dailyLogs]
  );
  const totalLosses = useMemo(
    () => allLossEntries.reduce((sum, e) => sum + (e.amount ?? 0), 0),
    [allLossEntries]
  );

  // Grade Slate + Business (planned) totals for CTP
  const gradeSlateId = useMemo(
    () => categories.find((c) => c.name === GRADE_SLATE_NAME)?.id,
    [categories]
  );
  const plannedCategoryId = useMemo(
    () => categories.find((c) => c.name === PLANNED_CATEGORY_NAME)?.id,
    [categories]
  );

  const gradeSlateLoss = useMemo(
    () =>
      allLossEntries
        .filter((e) => e.categoryId === gradeSlateId)
        .reduce((sum, e) => sum + (e.amount ?? 0), 0),
    [allLossEntries, gradeSlateId]
  );

  const plannedLoss = useMemo(
    () =>
      allLossEntries
        .filter((e) => e.categoryId === plannedCategoryId)
        .reduce((sum, e) => sum + (e.amount ?? 0), 0),
    [allLossEntries, plannedCategoryId]
  );

  const ctp = totalBAR - gradeSlateLoss - plannedLoss;

  // Category rows: shutdown, slowdown, total per category
  const categorySummary = useMemo(() => {
    return categories.map((cat) => {
      const catEntries = allLossEntries.filter((e) => e.categoryId === cat.id);
      const shutdown = catEntries
        .filter((e) => e.lossType === "shutdown")
        .reduce((sum, e) => sum + (e.amount ?? 0), 0);
      const slowdown = catEntries
        .filter((e) => e.lossType === "slowdown")
        .reduce((sum, e) => sum + (e.amount ?? 0), 0);
      const total = shutdown + slowdown;
      return { id: cat.id, name: cat.name, shutdown, slowdown, total };
    });
  }, [categories, allLossEntries]);

  // Subcategory rows grouped by category
  const subcategorySummary = useMemo(() => {
    return categories.map((cat) => {
      const catEntries = allLossEntries.filter((e) => e.categoryId === cat.id);
      const subsInCat = subcategories
        .filter((s) => s.categoryId === cat.id)
        .map((sub) => {
          const subEntries = catEntries.filter((e) => e.subcategoryId === sub.id);
          const shutdown = subEntries
            .filter((e) => e.lossType === "shutdown")
            .reduce((sum, e) => sum + (e.amount ?? 0), 0);
          const slowdown = subEntries
            .filter((e) => e.lossType === "slowdown")
            .reduce((sum, e) => sum + (e.amount ?? 0), 0);
          return { id: sub.id, name: sub.name, shutdown, slowdown, total: shutdown + slowdown };
        });
      return { categoryId: cat.id, categoryName: cat.name, subcategories: subsInCat };
    });
  }, [categories, subcategories, allLossEntries]);

  // Time-period breakdown rows for month/year views
  const periodBreakdown = useMemo(() => {
    if (viewMode === "day") return [];

    if (viewMode === "month") {
      const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
      return days.map((day) => {
        const dateStr = format(day, "yyyy-MM-dd");
        const log = dailyLogs.find((l) => l.date === dateStr);
        const dayEntries = allLossEntries.filter((e) => e.date === dateStr);
        const shutdown = dayEntries
          .filter((e) => e.lossType === "shutdown")
          .reduce((sum, e) => sum + (e.amount ?? 0), 0);
        const slowdown = dayEntries
          .filter((e) => e.lossType === "slowdown")
          .reduce((sum, e) => sum + (e.amount ?? 0), 0);
        const bar = log?.bar ?? 0;
        const production = log?.production ?? 0;
        const gs = dayEntries
          .filter((e) => e.categoryId === gradeSlateId)
          .reduce((sum, e) => sum + (e.amount ?? 0), 0);
        const pl = dayEntries
          .filter((e) => e.categoryId === plannedCategoryId)
          .reduce((sum, e) => sum + (e.amount ?? 0), 0);
        return {
          label: format(day, "dd MMM"),
          bar,
          production,
          shutdown,
          slowdown,
          totalLoss: shutdown + slowdown,
          ctp: bar - gs - pl,
        };
      });
    }

    // year view: monthly rows
    const months = eachMonthOfInterval({ start: rangeStart, end: rangeEnd });
    return months.map((month) => {
      const monthStr = format(month, "yyyy-MM");
      const monthLogs = dailyLogs.filter((l) => l.date.startsWith(monthStr));
      const monthEntries = allLossEntries.filter((e) => e.date.startsWith(monthStr));
      const bar = monthLogs.reduce((s, l) => s + (l.bar ?? 0), 0);
      const production = monthLogs.reduce((s, l) => s + (l.production ?? 0), 0);
      const shutdown = monthEntries
        .filter((e) => e.lossType === "shutdown")
        .reduce((s, e) => s + (e.amount ?? 0), 0);
      const slowdown = monthEntries
        .filter((e) => e.lossType === "slowdown")
        .reduce((s, e) => s + (e.amount ?? 0), 0);
      const gs = monthEntries
        .filter((e) => e.categoryId === gradeSlateId)
        .reduce((s, e) => s + (e.amount ?? 0), 0);
      const pl = monthEntries
        .filter((e) => e.categoryId === plannedCategoryId)
        .reduce((s, e) => s + (e.amount ?? 0), 0);
      return {
        label: format(month, "MMM yyyy"),
        bar,
        production,
        shutdown,
        slowdown,
        totalLoss: shutdown + slowdown,
        ctp: bar - gs - pl,
      };
    });
  }, [viewMode, rangeStart, rangeEnd, dailyLogs, allLossEntries, gradeSlateId, plannedCategoryId]);

  // Per-category breakdown by time period (for the detailed table)
  const categoryPeriodBreakdown = useMemo(() => {
    if (viewMode === "day") return [];

    const periods = viewMode === "month"
      ? eachDayOfInterval({ start: rangeStart, end: rangeEnd })
      : eachMonthOfInterval({ start: rangeStart, end: rangeEnd });

    return categories.map((cat) => {
      const rows = periods.map((period) => {
        const key = viewMode === "month"
          ? format(period, "yyyy-MM-dd")
          : format(period, "yyyy-MM");
        const label = viewMode === "month"
          ? format(period, "dd MMM")
          : format(period, "MMM yyyy");
        const entries = allLossEntries.filter((e) =>
          e.categoryId === cat.id && (viewMode === "month" ? e.date === key : e.date.startsWith(key))
        );
        const shutdown = entries
          .filter((e) => e.lossType === "shutdown")
          .reduce((s, e) => s + (e.amount ?? 0), 0);
        const slowdown = entries
          .filter((e) => e.lossType === "slowdown")
          .reduce((s, e) => s + (e.amount ?? 0), 0);
        return { label, shutdown, slowdown, total: shutdown + slowdown };
      });
      return { categoryId: cat.id, categoryName: cat.name, rows };
    });
  }, [viewMode, rangeStart, rangeEnd, categories, allLossEntries]);

  const periodLabel = useMemo(() => {
    if (viewMode === "day") return format(parseISO(selectedDay), "dd MMMM yyyy");
    if (viewMode === "month") return `${MONTHS[selectedMonth]} ${selectedYear}`;
    return String(selectedYear);
  }, [viewMode, selectedDay, selectedMonth, selectedYear]);

  return (
    <div className="space-y-3 p-4">
      {/* Header & Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Table Report</h1>
          <p className="text-sm text-muted-foreground">{periodLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex rounded-md border border-input overflow-hidden h-9">
            {(["day", "month", "year"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={cn(
                  "px-3 text-xs font-medium transition-colors capitalize",
                  mode !== "day" && "border-l border-input",
                  viewMode === mode
                    ? "bg-foreground text-background"
                    : "bg-transparent text-muted-foreground hover:bg-muted"
                )}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* Navigation */}
          <Button variant="outline" size="icon" className="h-9 w-9" onClick={handlePrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {viewMode === "day" && (
            <input
              type="date"
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
          )}

          {(viewMode === "month" || viewMode === "year") && (
            <>
              {viewMode === "month" && (
                <Select
                  value={String(selectedMonth)}
                  onValueChange={(val) => setSelectedMonth(Number(val))}
                >
                  <SelectTrigger className="w-[140px]">
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
              )}
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
            </>
          )}

          <Button variant="outline" size="icon" className="h-9 w-9" onClick={handleNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary KPI Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Production Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead className="text-right">Value ({productionUnit})</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">BAR (Best Achievable Rate)</TableCell>
                <TableCell className="text-right">{fmtNum(totalBAR)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Production</TableCell>
                <TableCell className="text-right">{fmtNum(totalProduction)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Total Losses</TableCell>
                <TableCell className="text-right text-red-600">{fmtNum(totalLosses)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Grade Slate Losses</TableCell>
                <TableCell className="text-right">{fmtNum(gradeSlateLoss)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Planned (Business) Losses</TableCell>
                <TableCell className="text-right">{fmtNum(plannedLoss)}</TableCell>
              </TableRow>
              <TableRow className="border-t-2 font-bold">
                <TableCell>CTP (Capability to Produce)</TableCell>
                <TableCell className="text-right text-blue-600">{fmtNum(ctp)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Utilization (Production / BAR)</TableCell>
                <TableCell className="text-right">
                  <Badge variant={totalBAR > 0 && (totalProduction / totalBAR) >= 0.8 ? "default" : "destructive"}>
                    {totalBAR > 0 ? ((totalProduction / totalBAR) * 100).toFixed(1) : "0.0"}%
                  </Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">CTP Utilization (Production / CTP)</TableCell>
                <TableCell className="text-right">
                  <Badge variant={ctp > 0 && (totalProduction / ctp) >= 0.8 ? "default" : "destructive"}>
                    {ctp > 0 ? ((totalProduction / ctp) * 100).toFixed(1) : "0.0"}%
                  </Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Losses by Category */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Losses by Category</CardTitle>
        </CardHeader>
        <CardContent>
          {categorySummary.every((r) => r.total === 0) ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No loss data for this period.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Shutdown</TableHead>
                  <TableHead className="text-right">Slowdown</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">% of Losses</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categorySummary
                  .filter((r) => r.total > 0)
                  .sort((a, b) => b.total - a.total)
                  .map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.name}</TableCell>
                      <TableCell className="text-right">{fmtNum(row.shutdown)}</TableCell>
                      <TableCell className="text-right">{fmtNum(row.slowdown)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmtNum(row.total)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={totalLosses > 0 && row.total / totalLosses > 0.25 ? "destructive" : "secondary"}>
                          {totalLosses > 0 ? ((row.total / totalLosses) * 100).toFixed(1) : "0.0"}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                <TableRow className="font-bold border-t-2">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">
                    {fmtNum(categorySummary.reduce((s, r) => s + r.shutdown, 0))}
                  </TableCell>
                  <TableCell className="text-right">
                    {fmtNum(categorySummary.reduce((s, r) => s + r.slowdown, 0))}
                  </TableCell>
                  <TableCell className="text-right">{fmtNum(totalLosses)}</TableCell>
                  <TableCell className="text-right"><Badge>100%</Badge></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Losses by Subcategory */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Losses by Subcategory</CardTitle>
        </CardHeader>
        <CardContent>
          {subcategorySummary.every((g) => g.subcategories.every((s) => s.total === 0)) ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No subcategory loss data for this period.
            </p>
          ) : (
            <div className="space-y-4">
              {subcategorySummary
                .filter((g) => g.subcategories.some((s) => s.total > 0))
                .map((group) => (
                  <div key={group.categoryId}>
                    <h4 className="font-semibold text-sm mb-2">{group.categoryName}</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Subcategory</TableHead>
                          <TableHead className="text-right">Shutdown</TableHead>
                          <TableHead className="text-right">Slowdown</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.subcategories
                          .filter((s) => s.total > 0)
                          .sort((a, b) => b.total - a.total)
                          .map((sub) => (
                            <TableRow key={sub.id}>
                              <TableCell className="pl-6">{sub.name}</TableCell>
                              <TableCell className="text-right">{fmtNum(sub.shutdown)}</TableCell>
                              <TableCell className="text-right">{fmtNum(sub.slowdown)}</TableCell>
                              <TableCell className="text-right font-medium">{fmtNum(sub.total)}</TableCell>
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

      {/* Period Breakdown Table (month/year views only) */}
      {viewMode !== "day" && periodBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {viewMode === "month" ? "Daily" : "Monthly"} Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{viewMode === "month" ? "Day" : "Month"}</TableHead>
                  <TableHead className="text-right">BAR</TableHead>
                  <TableHead className="text-right">Production</TableHead>
                  <TableHead className="text-right">CTP</TableHead>
                  <TableHead className="text-right">Shutdown</TableHead>
                  <TableHead className="text-right">Slowdown</TableHead>
                  <TableHead className="text-right">Total Loss</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {periodBreakdown.map((row) => (
                  <TableRow key={row.label}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    <TableCell className="text-right">{fmtNum(row.bar)}</TableCell>
                    <TableCell className="text-right">{fmtNum(row.production)}</TableCell>
                    <TableCell className="text-right text-blue-600">{fmtNum(row.ctp)}</TableCell>
                    <TableCell className="text-right">{fmtNum(row.shutdown)}</TableCell>
                    <TableCell className="text-right">{fmtNum(row.slowdown)}</TableCell>
                    <TableCell className="text-right font-semibold">{fmtNum(row.totalLoss)}</TableCell>
                  </TableRow>
                ))}
                {/* Totals row */}
                <TableRow className="font-bold border-t-2">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{fmtNum(totalBAR)}</TableCell>
                  <TableCell className="text-right">{fmtNum(totalProduction)}</TableCell>
                  <TableCell className="text-right text-blue-600">{fmtNum(ctp)}</TableCell>
                  <TableCell className="text-right">
                    {fmtNum(periodBreakdown.reduce((s, r) => s + r.shutdown, 0))}
                  </TableCell>
                  <TableCell className="text-right">
                    {fmtNum(periodBreakdown.reduce((s, r) => s + r.slowdown, 0))}
                  </TableCell>
                  <TableCell className="text-right">{fmtNum(totalLosses)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
