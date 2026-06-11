"use client";

import React, { useCallback, useMemo, useState } from "react";
import { format, parseISO, getDay } from "date-fns";
import {
  ArrowDownToLine,
  ArrowUpDown,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Copy,
  Flame,
  History,
  Lightbulb,
  Search,
  X,
} from "lucide-react";
import { DaySnapshot } from "@/lib/store";
import { LossCategory, LossSubcategory, LossEntry } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────

type TimeRange = 7 | 14 | 30;
type LossTypeFilter = "all" | "shutdown" | "slowdown";

interface Insight {
  id: string;
  type: "streak" | "pattern" | "similar";
  title: string;
  detail: string;
  entries: LossEntry[];
}

interface SelectedCell {
  categoryId: string;
  date: string;
}

interface LossContextPanelProps {
  /** Up to 30 days of history, most-recent-first */
  history: DaySnapshot[];
  categories: LossCategory[];
  subcategories: LossSubcategory[];
  productionUnit: string;
  todayDelta?: number;
  onCarryForward: (entries: LossEntry[], withAmounts?: boolean) => void;
  disabled?: boolean;
  defaultExpanded?: boolean;
}

// ─── Helpers ───────────────────────────────────────────────

function heatColor(value: number, max: number): string {
  if (value === 0 || max === 0) return "";
  const intensity = Math.min(value / max, 1);
  if (intensity < 0.25)
    return "bg-orange-100 dark:bg-orange-950/40 text-orange-900 dark:text-orange-200";
  if (intensity < 0.5)
    return "bg-orange-200 dark:bg-orange-900/50 text-orange-900 dark:text-orange-200";
  if (intensity < 0.75)
    return "bg-orange-300 dark:bg-orange-800/60 text-orange-950 dark:text-orange-100";
  return "bg-orange-400 dark:bg-orange-700/70 text-orange-950 dark:text-orange-50";
}

function Sparkline({
  values,
  className,
}: {
  values: number[];
  className?: string;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const w = 48;
  const h = 16;
  const points = values
    .map(
      (v, i) =>
        `${(i / (values.length - 1)) * w},${h - (v / max) * (h - 2) - 1}`
    )
    .join(" ");
  return (
    <svg width={w} height={h} className={cn("inline-block", className)}>
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Main Component ────────────────────────────────────────

export function LossContextPanel({
  history,
  categories,
  subcategories,
  productionUnit,
  todayDelta,
  onCarryForward,
  disabled = false,
  defaultExpanded = false,
}: LossContextPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [timeRange, setTimeRange] = useState<TimeRange>(7);
  const [lossTypeFilter, setLossTypeFilter] = useState<LossTypeFilter>("all");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set()
  );
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [insightsExpanded, setInsightsExpanded] = useState(true);
  const [sortByTotal, setSortByTotal] = useState(false);

  // Slice history to selected time range (history is most-recent-first)
  const rangedHistory = useMemo(
    () => history.slice(0, timeRange),
    [history, timeRange]
  );

  // Apply loss type filter to entries within history
  const filteredHistory = useMemo(() => {
    if (lossTypeFilter === "all") return rangedHistory;
    return rangedHistory.map((day) => ({
      ...day,
      entries: day.entries.filter((e) => e.lossType === lossTypeFilter),
    }));
  }, [rangedHistory, lossTypeFilter]);

  // Display order: oldest first (left to right)
  const displayHistory = useMemo(
    () => [...filteredHistory].reverse(),
    [filteredHistory]
  );

  const categoryMap = useMemo(() => {
    const m: Record<string, LossCategory> = {};
    categories.forEach((c) => (m[c.id] = c));
    return m;
  }, [categories]);

  const subcategoryMap = useMemo(() => {
    const m: Record<string, LossSubcategory> = {};
    subcategories.forEach((s) => (m[s.id] = s));
    return m;
  }, [subcategories]);

  // ─── Insights ──────────────────────────────────────────

  const insights = useMemo(() => {
    const result: Insight[] = [];

    // 1. Streak insights (categories with 3+ consecutive days)
    for (const cat of categories) {
      let days = 0;
      const amounts: number[] = [];
      for (const day of filteredHistory) {
        const total = day.entries
          .filter((e) => e.categoryId === cat.id)
          .reduce((s, e) => s + e.amount, 0);
        if (total > 0) {
          days++;
          amounts.push(total);
        } else break;
      }
      if (days < 3) continue;

      // Find which subcategory is driving it
      let driverName = "";
      const catSubs = subcategories.filter((s) => s.categoryId === cat.id);
      let maxSubDays = 0;
      for (const sub of catSubs) {
        let subDays = 0;
        for (const day of filteredHistory) {
          const t = day.entries
            .filter((e) => e.subcategoryId === sub.id)
            .reduce((s, e) => s + e.amount, 0);
          if (t > 0) subDays++;
          else break;
        }
        if (subDays > maxSubDays) {
          maxSubDays = subDays;
          driverName = sub.name;
        }
      }

      const avg = Math.round(
        amounts.reduce((s, a) => s + a, 0) / amounts.length
      );
      const latest = amounts[0];
      const trendWord =
        latest > avg * 1.1
          ? "trending up"
          : latest < avg * 0.9
            ? "trending down"
            : "stable";
      const driver =
        driverName && maxSubDays >= 2 ? ` (${driverName} driving)` : "";

      result.push({
        id: `streak-${cat.id}`,
        type: "streak",
        title: `${cat.name}: ${days} consecutive days${driver}`,
        detail: `Avg ${avg} ${productionUnit}, yesterday ${latest} ${productionUnit}. ${trendWord.charAt(0).toUpperCase() + trendWord.slice(1)}.`,
        entries:
          filteredHistory[0]?.entries.filter((e) => e.categoryId === cat.id) ??
          [],
      });
    }

    // 2. Weekly pattern detection
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dowCounts: Record<
      string,
      Record<number, { count: number; amounts: number[] }>
    > = {};
    for (const day of filteredHistory) {
      const dow = getDay(parseISO(day.date));
      for (const cat of categories) {
        const total = day.entries
          .filter((e) => e.categoryId === cat.id)
          .reduce((s, e) => s + e.amount, 0);
        if (total > 0) {
          if (!dowCounts[cat.id]) dowCounts[cat.id] = {};
          if (!dowCounts[cat.id][dow])
            dowCounts[cat.id][dow] = { count: 0, amounts: [] };
          dowCounts[cat.id][dow].count++;
          dowCounts[cat.id][dow].amounts.push(total);
        }
      }
    }
    for (const [catId, dows] of Object.entries(dowCounts)) {
      for (const [dow, data] of Object.entries(dows)) {
        if (data.count < 2) continue;
        const cat = categoryMap[catId];
        if (!cat) continue;
        // Only flag if the category doesn't appear every day (that's not a weekly pattern)
        const totalAppearances = filteredHistory.filter((d) =>
          d.entries.some((e) => e.categoryId === catId)
        ).length;
        if (totalAppearances >= filteredHistory.length * 0.8) continue;

        const avgAmount = Math.round(
          data.amounts.reduce((s, a) => s + a, 0) / data.amounts.length
        );
        result.push({
          id: `pattern-${catId}-${dow}`,
          type: "pattern",
          title: `${cat.name}: recurring on ${dayNames[Number(dow)]}s`,
          detail: `Appeared ${data.count} ${dayNames[Number(dow)]}s, avg ${avgAmount} ${productionUnit}.`,
          entries: [],
        });
      }
    }

    // 3. Similar day finder
    if (todayDelta !== undefined && todayDelta > 0) {
      const closedDays = filteredHistory.filter(
        (d) => d.status === "closed" && d.delta > 0
      );
      if (closedDays.length > 0) {
        const sorted = closedDays
          .map((d) => ({ ...d, diff: Math.abs(d.delta - todayDelta) }))
          .sort((a, b) => a.diff - b.diff);
        const best = sorted[0];
        if (best.diff < todayDelta * 0.3) {
          const catSummary = categories
            .map((cat) => {
              const total = best.entries
                .filter((e) => e.categoryId === cat.id)
                .reduce((s, e) => s + e.amount, 0);
              return total > 0 ? `${cat.name} ${total}` : null;
            })
            .filter(Boolean)
            .join(", ");
          result.push({
            id: `similar-${best.date}`,
            type: "similar",
            title: `Similar day: ${format(parseISO(best.date), "MMM d")} (delta ${best.delta})`,
            detail: `Your delta today: ${todayDelta}. That day: ${catSummary}.`,
            entries: best.entries,
          });
        }
      }
    }

    return result;
  }, [
    categories,
    subcategories,
    filteredHistory,
    categoryMap,
    productionUnit,
    todayDelta,
  ]);

  // ─── Heatmap Data ──────────────────────────────────────

  const heatmapData = useMemo(() => {
    const rows = categories.map((cat) => {
      const catSubs = subcategories.filter((s) => s.categoryId === cat.id);
      const cells = displayHistory.map((day) => {
        const catEntries = day.entries.filter((e) => e.categoryId === cat.id);
        const total = catEntries.reduce((sum, e) => sum + e.amount, 0);
        const subBreakdown = catSubs
          .map((sub) => ({
            name: sub.name,
            amount: catEntries
              .filter((e) => e.subcategoryId === sub.id)
              .reduce((sum, e) => sum + e.amount, 0),
          }))
          .filter((b) => b.amount > 0);
        // Collect non-empty comments for this cell
        const comments = catEntries
          .filter((e) => e.comments && e.comments.trim().length > 0)
          .map((e) => ({
            sub: subcategoryMap[e.subcategoryId]?.name ?? "",
            text: e.comments,
          }));
        return { date: day.date, total, subBreakdown, comments };
      });

      const subcategoryRows = catSubs
        .map((sub) => {
          const subCells = displayHistory.map((day) => ({
            date: day.date,
            total: day.entries
              .filter(
                (e) =>
                  e.categoryId === cat.id && e.subcategoryId === sub.id
              )
              .reduce((sum, e) => sum + e.amount, 0),
          }));
          return {
            subcategory: sub,
            cells: subCells,
            rowTotal: subCells.reduce((s, c) => s + c.total, 0),
          };
        })
        .filter((r) => r.rowTotal > 0);

      const sparkValues = cells.map((c) => c.total);
      return { category: cat, cells, subcategoryRows, sparkValues };
    });
    const globalMax = rows.reduce(
      (max, row) => row.cells.reduce((m, c) => Math.max(m, c.total), max),
      0
    );
    return { rows, globalMax };
  }, [categories, subcategories, subcategoryMap, displayHistory]);

  // ─── Sorted rows for rendering
  const sortedRows = useMemo(() => {
    if (!sortByTotal) return heatmapData.rows;
    return [...heatmapData.rows].sort((a, b) => {
      const totalA = a.cells.reduce((s, c) => s + c.total, 0);
      const totalB = b.cells.reduce((s, c) => s + c.total, 0);
      return totalB - totalA;
    });
  }, [heatmapData.rows, sortByTotal]);

  // ─── Selected Cell Entries ─────────────────────────────

  const selectedCellEntries = useMemo(() => {
    if (!selectedCell) return [];
    const day = displayHistory.find((d) => d.date === selectedCell.date);
    if (!day) return [];
    return day.entries.filter(
      (e) => e.categoryId === selectedCell.categoryId
    );
  }, [selectedCell, displayHistory]);

  // ─── Handlers ──────────────────────────────────────────

  const toggleCategory = useCallback((catId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  }, []);

  const handleCellClick = useCallback(
    (categoryId: string, date: string) => {
      setSelectedCell((prev) =>
        prev?.categoryId === categoryId && prev?.date === date
          ? null
          : { categoryId, date }
      );
    },
    []
  );

  if (history.length === 0) return null;

  // ─── Render ────────────────────────────────────────────

  return (
    <Card>
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">Loss Context</CardTitle>
          </div>
          <div className="flex items-center gap-1">
            {expanded && (
              <>
                {([7, 14, 30] as TimeRange[]).map((range) => (
                  <Button
                    key={range}
                    variant={timeRange === range ? "secondary" : "ghost"}
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => {
                      setTimeRange(range);
                      setSelectedCell(null);
                    }}
                  >
                    {range}d
                  </Button>
                ))}
                <div className="w-px h-4 bg-border mx-1" />
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setExpanded(!expanded)}
              aria-label={expanded ? "Collapse" : "Expand"}
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-2">
          {/* ── Insights Bar ─────────────────────────────── */}
          {insights.length > 0 && (
            <div>
              <button
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-2"
                onClick={() => setInsightsExpanded(!insightsExpanded)}
              >
                <Lightbulb className="h-3.5 w-3.5" />
                Insights ({insights.length})
                {insightsExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </button>
              {insightsExpanded && (
                <div className="space-y-1.5">
                  {insights.map((insight) => (
                    <div
                      key={insight.id}
                      className={cn(
                        "flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
                        insight.type === "streak" &&
                          "border-orange-200 bg-orange-50 dark:border-orange-900/40 dark:bg-orange-950/20",
                        insight.type === "pattern" &&
                          "border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/20",
                        insight.type === "similar" &&
                          "border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-950/20"
                      )}
                    >
                      <span className="mt-0.5 shrink-0">
                        {insight.type === "streak" && (
                          <Flame className="h-3.5 w-3.5 text-orange-500" />
                        )}
                        {insight.type === "pattern" && (
                          <CalendarDays className="h-3.5 w-3.5 text-blue-500" />
                        )}
                        {insight.type === "similar" && (
                          <Search className="h-3.5 w-3.5 text-green-600" />
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{insight.title}</p>
                        <p className="text-muted-foreground">
                          {insight.detail}
                        </p>
                      </div>
                      {!disabled && insight.entries.length > 0 && (
                        <span className="flex gap-0.5 shrink-0">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[10px] px-2"
                                onClick={() => onCarryForward(insight.entries)}
                              >
                                <Copy className="h-3 w-3 mr-1" />
                                Copy
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              Copy structure only (amounts zeroed)
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[10px] px-1.5"
                                onClick={() => onCarryForward(insight.entries, true)}
                              >
                                <ArrowDownToLine className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              Copy with amounts
                            </TooltipContent>
                          </Tooltip>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Loss Type Filter + Sort ──────────────────── */}
          <div className="flex items-center gap-1">
            {(["all", "shutdown", "slowdown"] as LossTypeFilter[]).map(
              (filter) => (
                <Button
                  key={filter}
                  variant={lossTypeFilter === filter ? "secondary" : "ghost"}
                  size="sm"
                  className="h-6 px-2 text-xs capitalize"
                  onClick={() => {
                    setLossTypeFilter(filter);
                    setSelectedCell(null);
                  }}
                >
                  {filter === "all" ? "All Types" : filter}
                </Button>
              )
            )}
            <div className="w-px h-4 bg-border mx-1" />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={sortByTotal ? "secondary" : "ghost"}
                  size="sm"
                  className="h-6 px-2 text-xs gap-1"
                  onClick={() => setSortByTotal((v) => !v)}
                >
                  <ArrowUpDown className="h-3 w-3" />
                  {sortByTotal ? "By total" : "By order"}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {sortByTotal
                  ? "Sorted by total loss (biggest first). Click for display order."
                  : "Sorted by display order. Click to sort by total loss."}
              </TooltipContent>
            </Tooltip>
          </div>

          {/* ── Heatmap Grid ─────────────────────────────── */}
          {displayHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground py-3">
              No data for the selected range.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left py-1.5 pr-2 font-medium text-muted-foreground whitespace-nowrap">
                      Category
                    </th>
                    {displayHistory.map((day) => (
                      <th
                        key={day.date}
                        className="text-center py-1.5 px-1 font-medium text-muted-foreground min-w-[48px]"
                      >
                        <div>{format(parseISO(day.date), "EEE")}</div>
                        <div className="text-[10px]">
                          {format(parseISO(day.date), "d MMM")}
                        </div>
                      </th>
                    ))}
                    <th className="text-right py-1.5 pl-2 font-medium text-muted-foreground">
                      &Sigma;
                    </th>
                    <th className="py-1.5 pl-2 font-medium text-muted-foreground w-[48px]">
                      Trend
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map(
                    ({ category, cells, subcategoryRows, sparkValues }) => {
                      const rowTotal = cells.reduce(
                        (s, c) => s + c.total,
                        0
                      );
                      if (rowTotal === 0) return null;
                      const isExp = expandedCategories.has(category.id);
                      return (
                        <React.Fragment key={category.id}>
                          <tr>
                            <td
                              className="py-1 pr-2 font-medium whitespace-nowrap cursor-pointer select-none"
                              onClick={
                                subcategoryRows.length > 0
                                  ? () => toggleCategory(category.id)
                                  : undefined
                              }
                            >
                              <span className="inline-flex items-center gap-1">
                                {subcategoryRows.length > 0 &&
                                  (isExp ? (
                                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                  ))}
                                {category.name}
                              </span>
                            </td>
                            {cells.map((cell) => (
                              <td key={cell.date} className="py-1 px-1">
                                <div
                                  className={cn(
                                    "relative rounded px-1.5 py-1 text-center tabular-nums transition-colors cursor-pointer",
                                    cell.total > 0
                                      ? heatColor(
                                          cell.total,
                                          heatmapData.globalMax
                                        )
                                      : "text-muted-foreground/30",
                                    selectedCell?.categoryId ===
                                      category.id &&
                                      selectedCell?.date === cell.date &&
                                      "ring-2 ring-primary ring-offset-1"
                                  )}
                                  onClick={() =>
                                    cell.total > 0 &&
                                    handleCellClick(
                                      category.id,
                                      cell.date
                                    )
                                  }
                                >
                                  {cell.total > 0
                                    ? cell.total.toLocaleString()
                                    : "\u2014"}
                                  {cell.comments.length > 0 && (
                                    <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-blue-500" />
                                  )}
                                </div>
                              </td>
                            ))}
                            <td className="py-1 pl-2 text-right font-medium tabular-nums">
                              {rowTotal.toLocaleString()}
                            </td>
                            <td className="py-1 pl-2">
                              <Sparkline
                                values={sparkValues}
                                className="text-muted-foreground"
                              />
                            </td>
                          </tr>
                          {/* Expanded subcategory rows */}
                          {isExp &&
                            subcategoryRows.map(
                              ({
                                subcategory,
                                cells: subCells,
                                rowTotal: subTotal,
                              }) => (
                                <tr
                                  key={subcategory.id}
                                  className="text-muted-foreground"
                                >
                                  <td className="py-0.5 pr-2 whitespace-nowrap pl-5 text-[11px]">
                                    {subcategory.name}
                                  </td>
                                  {subCells.map((cell) => (
                                    <td
                                      key={cell.date}
                                      className="py-0.5 px-1"
                                    >
                                      <div
                                        className={cn(
                                          "rounded px-1.5 py-0.5 text-center tabular-nums text-[11px]",
                                          cell.total > 0
                                            ? heatColor(
                                                cell.total,
                                                heatmapData.globalMax
                                              )
                                            : "text-muted-foreground/20"
                                        )}
                                      >
                                        {cell.total > 0
                                          ? cell.total.toLocaleString()
                                          : "\u2014"}
                                      </div>
                                    </td>
                                  ))}
                                  <td className="py-0.5 pl-2 text-right tabular-nums text-[11px]">
                                    {subTotal.toLocaleString()}
                                  </td>
                                  <td />
                                </tr>
                              )
                            )}
                        </React.Fragment>
                      );
                    }
                  )}
                  {/* Daily total row */}
                  <tr className="border-t font-medium">
                    <td className="py-1.5 pr-2">Daily Total</td>
                    {displayHistory.map((day) => {
                      const dayTotal = day.entries.reduce(
                        (s, e) => s + e.amount,
                        0
                      );
                      return (
                        <td
                          key={day.date}
                          className="py-1.5 px-1 text-center tabular-nums"
                        >
                          {dayTotal > 0 ? dayTotal.toLocaleString() : "\u2014"}
                        </td>
                      );
                    })}
                    <td className="py-1.5 pl-2 text-right tabular-nums">
                      {displayHistory
                        .reduce(
                          (s, d) =>
                            s +
                            d.entries.reduce(
                              (se, e) => se + e.amount,
                              0
                            ),
                          0
                        )
                        .toLocaleString()}
                    </td>
                    <td />
                  </tr>
                  {/* Production row */}
                  <tr className="text-muted-foreground">
                    <td className="py-1 pr-2 text-[11px]">Production</td>
                    {displayHistory.map((day) => (
                      <td
                        key={day.date}
                        className="py-1 px-1 text-center tabular-nums text-[11px]"
                      >
                        {day.production.toLocaleString()}
                      </td>
                    ))}
                    <td />
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* ── Cell Detail Drawer ───────────────────────── */}
          {selectedCell && selectedCellEntries.length > 0 && (
            <div className="rounded-md border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium">
                  {categoryMap[selectedCell.categoryId]?.name} &mdash;{" "}
                  {format(parseISO(selectedCell.date), "EEEE, MMM d")}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0"
                  onClick={() => setSelectedCell(null)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <div className="space-y-1">
                {selectedCellEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 text-xs bg-background rounded-md px-3 py-2 border"
                  >
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0 capitalize shrink-0"
                    >
                      {entry.lossType}
                    </Badge>
                    <span className="font-medium shrink-0">
                      {subcategoryMap[entry.subcategoryId]?.name ?? "\u2014"}
                    </span>
                    <span className="font-medium tabular-nums shrink-0">
                      {entry.amount.toLocaleString()} {productionUnit}
                    </span>
                    {entry.comments && (
                      <span className="flex-1 text-muted-foreground truncate min-w-0">
                        {entry.comments}
                      </span>
                    )}
                    {!disabled && (
                      <span className="flex gap-0.5 shrink-0">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0"
                              onClick={() => onCarryForward([entry])}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="text-xs">
                            Copy structure only
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0"
                              onClick={() => onCarryForward([entry], true)}
                            >
                              <ArrowDownToLine className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="text-xs">
                            Copy with amount
                          </TooltipContent>
                        </Tooltip>
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {!disabled && selectedCellEntries.length > 1 && (
                <div className="flex justify-end gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs gap-1"
                    onClick={() => onCarryForward(selectedCellEntries)}
                  >
                    <Copy className="h-3 w-3" />
                    Copy all
                  </Button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs gap-1"
                        onClick={() => onCarryForward(selectedCellEntries, true)}
                      >
                        <ArrowDownToLine className="h-3 w-3" />
                        With amounts
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      Copy all entries with their amounts
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
