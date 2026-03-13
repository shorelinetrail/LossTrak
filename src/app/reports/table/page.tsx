"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
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
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  eachDayOfInterval,
  eachMonthOfInterval,
  parseISO,
  isValid,
  getMonth,
  getYear,
} from "date-fns";
import { cn } from "@/lib/utils";

type ViewMode = "day" | "month" | "year";

type SectionKey = "summary" | "category" | "subcategory" | "breakdown";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const GRADE_SLATE_NAME = "Grade Slate";
const PLANNED_CATEGORY_NAME = "Business";

function fmtNum(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function fmtPct(numerator: number, denominator: number) {
  if (denominator <= 0) return "0.0%";
  return ((numerator / denominator) * 100).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}

function CollapsibleCard({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{title}</CardTitle>
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </CardHeader>
      {open && <CardContent>{children}</CardContent>}
    </Card>
  );
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

  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    summary: true,
    category: true,
    subcategory: true,
    breakdown: true,
  });

  const toggleSection = useCallback((key: SectionKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const yearOptions = useMemo(() => {
    const currentYear = getYear(new Date());
    return Array.from({ length: 10 }, (_, i) => currentYear - i);
  }, []);

  // Safely parse the selected day, falling back to today
  const safeSelectedDay = useMemo(() => {
    const parsed = parseISO(selectedDay);
    return isValid(parsed) ? parsed : new Date();
  }, [selectedDay]);

  const { rangeStart, rangeEnd } = useMemo(() => {
    if (viewMode === "day") {
      return { rangeStart: safeSelectedDay, rangeEnd: safeSelectedDay };
    }
    if (viewMode === "month") {
      const anchor = new Date(selectedYear, selectedMonth, 1);
      return { rangeStart: startOfMonth(anchor), rangeEnd: endOfMonth(anchor) };
    }
    const anchor = new Date(selectedYear, 0, 1);
    return { rangeStart: startOfYear(anchor), rangeEnd: endOfYear(anchor) };
  }, [viewMode, safeSelectedDay, selectedMonth, selectedYear]);

  const handlePrev = () => {
    if (viewMode === "day") {
      const d = new Date(safeSelectedDay);
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
      const d = new Date(safeSelectedDay);
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
          bar, production, shutdown, slowdown,
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
        bar, production, shutdown, slowdown,
        totalLoss: shutdown + slowdown,
        ctp: bar - gs - pl,
      };
    });
  }, [viewMode, rangeStart, rangeEnd, dailyLogs, allLossEntries, gradeSlateId, plannedCategoryId]);

  const periodLabel = useMemo(() => {
    if (viewMode === "day") return format(safeSelectedDay, "dd MMMM yyyy");
    if (viewMode === "month") return `${MONTHS[selectedMonth]} ${selectedYear}`;
    return String(selectedYear);
  }, [viewMode, safeSelectedDay, selectedMonth, selectedYear]);

  const handleDateChange = (value: string) => {
    if (value && isValid(parseISO(value))) {
      setSelectedDay(value);
    }
  };

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

          <Button variant="outline" size="icon" className="h-9 w-9" onClick={handlePrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {viewMode === "day" && (
            <input
              type="date"
              value={selectedDay}
              onChange={(e) => handleDateChange(e.target.value)}
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

      {/* Section toggles */}
      <div className="flex flex-wrap gap-1.5">
        {([
          ["summary", "Production Summary"],
          ["category", "Losses by Category"],
          ["subcategory", "Losses by Subcategory"],
          ["breakdown", viewMode === "month" ? "Daily Breakdown" : viewMode === "year" ? "Monthly Breakdown" : ""],
        ] as [SectionKey, string][])
          .filter(([, label]) => label !== "")
          .map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleSection(key)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium border transition-colors",
                openSections[key]
                  ? "bg-foreground text-background border-foreground"
                  : "bg-transparent text-muted-foreground border-input hover:bg-muted"
              )}
            >
              {label}
            </button>
          ))}
      </div>

      {/* Production Summary */}
      {openSections.summary && (
        <CollapsibleCard
          title="Production Summary"
          open={openSections.summary}
          onToggle={() => toggleSection("summary")}
        >
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
                    {fmtPct(totalProduction, totalBAR)}
                  </Badge>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">CTP Utilization (Production / CTP)</TableCell>
                <TableCell className="text-right">
                  <Badge variant={ctp > 0 && (totalProduction / ctp) >= 0.8 ? "default" : "destructive"}>
                    {fmtPct(totalProduction, ctp)}
                  </Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CollapsibleCard>
      )}

      {/* Losses by Category */}
      {openSections.category && (
        <CollapsibleCard
          title="Losses by Category"
          open={openSections.category}
          onToggle={() => toggleSection("category")}
        >
          {categorySummary.every((r) => r.total === 0) ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No loss data for this period.
            </p>
          ) : (
            <Table>
              <colgroup>
                <col className="w-[40%]" />
                <col className="w-[15%]" />
                <col className="w-[15%]" />
                <col className="w-[15%]" />
                <col className="w-[15%]" />
              </colgroup>
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
                          {fmtPct(row.total, totalLosses)}
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
                  <TableCell className="text-right"><Badge>100.0%</Badge></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CollapsibleCard>
      )}

      {/* Losses by Subcategory */}
      {openSections.subcategory && (
        <CollapsibleCard
          title="Losses by Subcategory"
          open={openSections.subcategory}
          onToggle={() => toggleSection("subcategory")}
        >
          {subcategorySummary.every((g) => g.subcategories.every((s) => s.total === 0)) ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No subcategory loss data for this period.
            </p>
          ) : (
            <Table>
              <colgroup>
                <col className="w-[40%]" />
                <col className="w-[15%]" />
                <col className="w-[15%]" />
                <col className="w-[15%]" />
                <col className="w-[15%]" />
              </colgroup>
              <TableHeader>
                <TableRow>
                  <TableHead>Subcategory</TableHead>
                  <TableHead className="text-right">Shutdown</TableHead>
                  <TableHead className="text-right">Slowdown</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">% of Losses</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subcategorySummary
                  .filter((g) => g.subcategories.some((s) => s.total > 0))
                  .flatMap((group) => [
                    <TableRow key={`cat-${group.categoryId}`} className="bg-muted/50">
                      <TableCell colSpan={5} className="font-semibold text-sm py-2">
                        {group.categoryName}
                      </TableCell>
                    </TableRow>,
                    ...group.subcategories
                      .filter((s) => s.total > 0)
                      .sort((a, b) => b.total - a.total)
                      .map((sub) => (
                        <TableRow key={sub.id}>
                          <TableCell className="pl-6">{sub.name}</TableCell>
                          <TableCell className="text-right">{fmtNum(sub.shutdown)}</TableCell>
                          <TableCell className="text-right">{fmtNum(sub.slowdown)}</TableCell>
                          <TableCell className="text-right font-medium">{fmtNum(sub.total)}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline">
                              {fmtPct(sub.total, totalLosses)}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      )),
                  ])}
              </TableBody>
            </Table>
          )}
        </CollapsibleCard>
      )}

      {/* Period Breakdown (month/year views only) */}
      {viewMode !== "day" && openSections.breakdown && periodBreakdown.length > 0 && (
        <CollapsibleCard
          title={`${viewMode === "month" ? "Daily" : "Monthly"} Breakdown`}
          open={openSections.breakdown}
          onToggle={() => toggleSection("breakdown")}
        >
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky top-0 bg-card">{viewMode === "month" ? "Day" : "Month"}</TableHead>
                  <TableHead className="sticky top-0 bg-card text-right">BAR</TableHead>
                  <TableHead className="sticky top-0 bg-card text-right">Production</TableHead>
                  <TableHead className="sticky top-0 bg-card text-right">CTP</TableHead>
                  <TableHead className="sticky top-0 bg-card text-right">Shutdown</TableHead>
                  <TableHead className="sticky top-0 bg-card text-right">Slowdown</TableHead>
                  <TableHead className="sticky top-0 bg-card text-right">Total Loss</TableHead>
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
          </div>
        </CollapsibleCard>
      )}
    </div>
  );
}
