"use client";

import React, { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  ArrowDownToLine,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  History,
  TrendingUp,
  TrendingDown,
  Minus,
  Flame,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface LossContextPanelProps {
  history: DaySnapshot[];
  categories: LossCategory[];
  subcategories: LossSubcategory[];
  productionUnit: string;
  onCarryForward: (entries: LossEntry[]) => void;
  disabled?: boolean;
}

// Color scale for heatmap cells
function heatColor(value: number, max: number): string {
  if (value === 0 || max === 0) return "";
  const intensity = Math.min(value / max, 1);
  if (intensity < 0.25) return "bg-orange-100 dark:bg-orange-950/40 text-orange-900 dark:text-orange-200";
  if (intensity < 0.5) return "bg-orange-200 dark:bg-orange-900/50 text-orange-900 dark:text-orange-200";
  if (intensity < 0.75) return "bg-orange-300 dark:bg-orange-800/60 text-orange-950 dark:text-orange-100";
  return "bg-orange-400 dark:bg-orange-700/70 text-orange-950 dark:text-orange-50";
}

export function LossContextPanel({
  history,
  categories,
  subcategories,
  productionUnit,
  onCarryForward,
  disabled = false,
}: LossContextPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const previousDay = history[0] ?? null;
  // Show oldest-first for display (left=oldest, right=most recent)
  const displayHistory = useMemo(() => [...history].reverse(), [history]);

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

  // Heatmap: category totals per day with subcategory breakdown
  const heatmapData = useMemo(() => {
    let globalMax = 0;
    const rows = categories.map((cat) => {
      const catSubs = subcategories.filter((s) => s.categoryId === cat.id);
      const cells = displayHistory.map((day) => {
        const catEntries = day.entries.filter((e) => e.categoryId === cat.id);
        const total = catEntries.reduce((sum, e) => sum + e.amount, 0);
        if (total > globalMax) globalMax = total;
        // Subcategory breakdown for tooltip
        const subBreakdown = catSubs
          .map((sub) => ({
            name: sub.name,
            amount: catEntries
              .filter((e) => e.subcategoryId === sub.id)
              .reduce((sum, e) => sum + e.amount, 0),
          }))
          .filter((b) => b.amount > 0);
        return { date: day.date, total, subBreakdown };
      });
      // Subcategory rows for expandable detail
      const subcategoryRows = catSubs
        .map((sub) => {
          const subCells = displayHistory.map((day) => {
            const total = day.entries
              .filter((e) => e.categoryId === cat.id && e.subcategoryId === sub.id)
              .reduce((sum, e) => sum + e.amount, 0);
            return { date: day.date, total };
          });
          const rowTotal = subCells.reduce((s, c) => s + c.total, 0);
          return { subcategory: sub, cells: subCells, rowTotal };
        })
        .filter((r) => r.rowTotal > 0);
      return { category: cat, cells, subcategoryRows };
    });
    return { rows, globalMax };
  }, [categories, subcategories, displayHistory]);

  // Streak analysis: consecutive days a category appears, avg amount, with subcategory detail
  const streaks = useMemo(() => {
    function computeTrend(amounts: number[]): "up" | "down" | "flat" | null {
      if (amounts.length < 2) return null;
      const recent = amounts[0];
      const prior = amounts[1];
      const diff = recent - prior;
      const pctChange = prior > 0 ? Math.abs(diff / prior) : 0;
      if (pctChange < 0.1) return "flat";
      return diff > 0 ? "up" : "down";
    }

    // history is already most-recent-first
    return categories
      .map((cat) => {
        let consecutiveDays = 0;
        let totalAmount = 0;
        const amounts: number[] = [];

        for (const day of history) {
          const dayTotal = day.entries
            .filter((e) => e.categoryId === cat.id)
            .reduce((sum, e) => sum + e.amount, 0);

          if (dayTotal > 0) {
            consecutiveDays++;
            totalAmount += dayTotal;
            amounts.push(dayTotal);
          } else {
            break; // streak broken
          }
        }

        const avg = consecutiveDays > 0 ? totalAmount / consecutiveDays : 0;
        const trend = computeTrend(amounts);

        // Subcategory-level streaks within this category
        const catSubs = subcategories.filter((s) => s.categoryId === cat.id);
        const subcategoryStreaks = catSubs
          .map((sub) => {
            let subConsecutive = 0;
            let subTotal = 0;
            const subAmounts: number[] = [];

            for (const day of history) {
              const daySubTotal = day.entries
                .filter((e) => e.categoryId === cat.id && e.subcategoryId === sub.id)
                .reduce((sum, e) => sum + e.amount, 0);

              if (daySubTotal > 0) {
                subConsecutive++;
                subTotal += daySubTotal;
                subAmounts.push(daySubTotal);
              } else {
                break;
              }
            }

            return {
              subcategory: sub,
              consecutiveDays: subConsecutive,
              avg: subConsecutive > 0 ? subTotal / subConsecutive : 0,
              latestAmount: subAmounts[0] ?? 0,
              trend: computeTrend(subAmounts),
            };
          })
          .filter((s) => s.consecutiveDays > 0)
          .sort((a, b) => b.consecutiveDays - a.consecutiveDays);

        return {
          category: cat,
          consecutiveDays,
          avg,
          latestAmount: amounts[0] ?? 0,
          trend,
          subcategoryStreaks,
        };
      })
      .filter((s) => s.consecutiveDays > 0)
      .sort((a, b) => b.consecutiveDays - a.consecutiveDays);
  }, [categories, subcategories, history]);

  if (history.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Loss Context</CardTitle>
            <Badge variant="outline" className="text-xs font-normal">
              {history.length} day{history.length !== 1 ? "s" : ""}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          <Tabs defaultValue="previous" className="w-full">
            <TabsList className="w-full grid grid-cols-3 h-8">
              <TabsTrigger value="previous" className="text-xs">
                Previous Day
              </TabsTrigger>
              <TabsTrigger value="heatmap" className="text-xs">
                7-Day Heatmap
              </TabsTrigger>
              <TabsTrigger value="streaks" className="text-xs">
                Running Streaks
              </TabsTrigger>
            </TabsList>

            {/* ── Previous Day Tab ────────────────────────── */}
            <TabsContent value="previous" className="mt-3">
              {previousDay ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      {format(parseISO(previousDay.date), "EEEE, MMM d")}
                      <span className="mx-2">|</span>
                      Prod: {previousDay.production.toLocaleString()}
                      <span className="mx-1">/</span>
                      BAR: {previousDay.bar.toLocaleString()} {productionUnit}
                      <span className="mx-2">|</span>
                      Delta: {previousDay.delta.toLocaleString()}
                    </div>
                    {!disabled && previousDay.entries.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        onClick={() => onCarryForward(previousDay.entries)}
                      >
                        <Copy className="h-3 w-3" />
                        Carry Forward
                      </Button>
                    )}
                  </div>

                  {previousDay.entries.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">
                      No losses recorded for the previous day.
                    </p>
                  ) : (
                    <div className="rounded-md border overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="text-xs h-8">Category</TableHead>
                            <TableHead className="text-xs h-8">Subcategory</TableHead>
                            <TableHead className="text-xs h-8">Type</TableHead>
                            <TableHead className="text-xs h-8 text-right">Amount</TableHead>
                            <TableHead className="text-xs h-8">Comment</TableHead>
                            {!disabled && <TableHead className="text-xs h-8 w-8" />}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {previousDay.entries.map((entry) => (
                            <TableRow key={entry.id} className="hover:bg-muted/40">
                              <TableCell className="text-xs py-1.5">
                                {categoryMap[entry.categoryId]?.name ?? "—"}
                              </TableCell>
                              <TableCell className="text-xs py-1.5">
                                {subcategoryMap[entry.subcategoryId]?.name ?? "—"}
                              </TableCell>
                              <TableCell className="text-xs py-1.5">
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0 capitalize"
                                >
                                  {entry.lossType}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs py-1.5 text-right font-medium tabular-nums">
                                {entry.amount.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-xs py-1.5 text-muted-foreground max-w-[200px] truncate">
                                {entry.comments || "—"}
                              </TableCell>
                              {!disabled && (
                                <TableCell className="text-xs py-1.5 px-1">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0"
                                        onClick={() => onCarryForward([entry])}
                                      >
                                        <ArrowDownToLine className="h-3 w-3" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="left" className="text-xs">
                                      Copy this entry to today
                                    </TooltipContent>
                                  </Tooltip>
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                          <TableRow className="bg-muted/30 hover:bg-muted/30 font-medium">
                            <TableCell colSpan={3} className="text-xs py-1.5">
                              Total
                            </TableCell>
                            <TableCell className="text-xs py-1.5 text-right tabular-nums">
                              {previousDay.entries
                                .reduce((s, e) => s + e.amount, 0)
                                .toLocaleString()}
                            </TableCell>
                            <TableCell />
                            {!disabled && <TableCell />}
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-3">
                  No previous day data available.
                </p>
              )}
            </TabsContent>

            {/* ── 7-Day Heatmap Tab ──────────────────────── */}
            <TabsContent value="heatmap" className="mt-3">
              {displayHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3">
                  No recent data available.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className="text-left py-1.5 pr-3 font-medium text-muted-foreground whitespace-nowrap">
                          Category
                        </th>
                        {displayHistory.map((day) => (
                          <th
                            key={day.date}
                            className="text-center py-1.5 px-1 font-medium text-muted-foreground min-w-[52px]"
                          >
                            <div>{format(parseISO(day.date), "EEE")}</div>
                            <div className="text-[10px]">
                              {format(parseISO(day.date), "d MMM")}
                            </div>
                          </th>
                        ))}
                        <th className="text-right py-1.5 pl-3 font-medium text-muted-foreground">
                          Total
                        </th>
                        {!disabled && (
                          <th className="py-1.5 pl-1 w-6" />
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {heatmapData.rows.map(({ category, cells, subcategoryRows }) => {
                        const rowTotal = cells.reduce(
                          (s, c) => s + c.total,
                          0
                        );
                        if (rowTotal === 0) return null;
                        const isExpanded = expandedCategories.has(category.id);
                        const toggleExpand = () => {
                          setExpandedCategories((prev) => {
                            const next = new Set(prev);
                            if (next.has(category.id)) next.delete(category.id);
                            else next.add(category.id);
                            return next;
                          });
                        };
                        return (
                          <React.Fragment key={category.id}>
                            <tr>
                              <td
                                className="py-1 pr-3 font-medium whitespace-nowrap cursor-pointer select-none"
                                onClick={subcategoryRows.length > 0 ? toggleExpand : undefined}
                              >
                                <span className="inline-flex items-center gap-1">
                                  {subcategoryRows.length > 0 && (
                                    isExpanded
                                      ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                      : <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                  )}
                                  {category.name}
                                </span>
                              </td>
                              {cells.map((cell) => (
                                <td key={cell.date} className="py-1 px-1">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div
                                        className={cn(
                                          "rounded px-1.5 py-1 text-center tabular-nums transition-colors",
                                          cell.total > 0
                                            ? heatColor(
                                                cell.total,
                                                heatmapData.globalMax
                                              )
                                            : "text-muted-foreground/30"
                                        )}
                                      >
                                        {cell.total > 0
                                          ? cell.total.toLocaleString()
                                          : "—"}
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs">
                                      <div className="font-medium">
                                        {category.name} — {format(parseISO(cell.date), "MMM d")}
                                      </div>
                                      <div>{cell.total.toLocaleString()} {productionUnit}</div>
                                      {cell.subBreakdown.length > 0 && (
                                        <div className="mt-1 border-t border-border/40 pt-1 space-y-0.5">
                                          {cell.subBreakdown.map((b) => (
                                            <div key={b.name} className="flex justify-between gap-3">
                                              <span className="text-muted-foreground">{b.name}</span>
                                              <span className="tabular-nums">{b.amount.toLocaleString()}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </TooltipContent>
                                  </Tooltip>
                                </td>
                              ))}
                              <td className="py-1 pl-3 text-right font-medium tabular-nums">
                                {rowTotal.toLocaleString()}
                              </td>
                              {!disabled && (
                                <td className="py-1 pl-1">
                                  {(() => {
                                    // Find entries from the most recent day that has data for this category
                                    const recentDay = [...history].find((d) =>
                                      d.entries.some((e) => e.categoryId === category.id)
                                    );
                                    if (!recentDay) return null;
                                    const catEntries = recentDay.entries.filter(
                                      (e) => e.categoryId === category.id
                                    );
                                    return (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-5 w-5 p-0"
                                            onClick={() => onCarryForward(catEntries)}
                                          >
                                            <ArrowDownToLine className="h-3 w-3" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="left" className="text-xs">
                                          Copy {category.name} entries to today
                                        </TooltipContent>
                                      </Tooltip>
                                    );
                                  })()}
                                </td>
                              )}
                            </tr>
                            {/* Expanded subcategory rows */}
                            {isExpanded && subcategoryRows.map(({ subcategory, cells: subCells, rowTotal: subTotal }) => (
                              <tr key={subcategory.id} className="text-muted-foreground">
                                <td className="py-0.5 pr-3 whitespace-nowrap pl-5 text-[11px]">
                                  {subcategory.name}
                                </td>
                                {subCells.map((cell) => (
                                  <td key={cell.date} className="py-0.5 px-1">
                                    <div
                                      className={cn(
                                        "rounded px-1.5 py-0.5 text-center tabular-nums text-[11px]",
                                        cell.total > 0
                                          ? heatColor(cell.total, heatmapData.globalMax)
                                          : "text-muted-foreground/20"
                                      )}
                                    >
                                      {cell.total > 0 ? cell.total.toLocaleString() : "—"}
                                    </div>
                                  </td>
                                ))}
                                <td className="py-0.5 pl-3 text-right tabular-nums text-[11px]">
                                  {subTotal.toLocaleString()}
                                </td>
                                {!disabled && (
                                  <td className="py-0.5 pl-1">
                                    {(() => {
                                      const recentDay = [...history].find((d) =>
                                        d.entries.some(
                                          (e) => e.categoryId === category.id && e.subcategoryId === subcategory.id
                                        )
                                      );
                                      if (!recentDay) return null;
                                      const subEntries = recentDay.entries.filter(
                                        (e) => e.categoryId === category.id && e.subcategoryId === subcategory.id
                                      );
                                      return (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-4 w-4 p-0"
                                              onClick={() => onCarryForward(subEntries)}
                                            >
                                              <ArrowDownToLine className="h-2.5 w-2.5" />
                                            </Button>
                                          </TooltipTrigger>
                                          <TooltipContent side="left" className="text-xs">
                                            Copy {subcategory.name} entries to today
                                          </TooltipContent>
                                        </Tooltip>
                                      );
                                    })()}
                                  </td>
                                )}
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })}
                      {/* Grand total row */}
                      <tr className="border-t font-medium">
                        <td className="py-1.5 pr-3">Daily Total</td>
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
                              {dayTotal > 0
                                ? dayTotal.toLocaleString()
                                : "—"}
                            </td>
                          );
                        })}
                        <td className="py-1.5 pl-3 text-right tabular-nums">
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
                        {!disabled && <td />}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            {/* ── Running Streaks Tab ─────────────────────── */}
            <TabsContent value="streaks" className="mt-3">
              {streaks.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3">
                  No active loss streaks in recent history.
                </p>
              ) : (
                <div className="space-y-2">
                  {streaks.map(
                    ({ category, consecutiveDays, avg, latestAmount, trend, subcategoryStreaks }) => (
                      <div key={category.id} className="rounded-md border overflow-hidden">
                        <div className="flex items-center gap-3 px-3 py-2">
                          {/* Streak flame indicator */}
                          <div
                            className={cn(
                              "flex items-center gap-1 min-w-[60px]",
                              consecutiveDays >= 5
                                ? "text-red-500"
                                : consecutiveDays >= 3
                                  ? "text-orange-500"
                                  : "text-muted-foreground"
                            )}
                          >
                            <Flame className="h-3.5 w-3.5" />
                            <span className="text-sm font-bold tabular-nums">
                              {consecutiveDays}d
                            </span>
                          </div>

                          {/* Category name */}
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium">
                              {category.name}
                            </span>
                          </div>

                          {/* Trend arrow */}
                          <div className="flex items-center gap-2">
                            {trend === "up" && (
                              <TrendingUp className="h-3.5 w-3.5 text-red-500" />
                            )}
                            {trend === "down" && (
                              <TrendingDown className="h-3.5 w-3.5 text-green-500" />
                            )}
                            {trend === "flat" && (
                              <Minus className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </div>

                          {/* Stats */}
                          <div className="text-right text-xs text-muted-foreground whitespace-nowrap">
                            <span className="font-medium text-foreground tabular-nums">
                              {latestAmount.toLocaleString()}
                            </span>
                            <span className="mx-1">last</span>
                            <span className="text-muted-foreground/70">|</span>
                            <span className="mx-1">avg</span>
                            <span className="font-medium text-foreground tabular-nums">
                              {Math.round(avg).toLocaleString()}
                            </span>
                            <span className="ml-0.5">{productionUnit}</span>
                          </div>
                        </div>

                        {/* Subcategory streaks */}
                        {subcategoryStreaks.length > 0 && (
                          <div className="border-t bg-muted/20 px-3 py-1.5 space-y-1">
                            {subcategoryStreaks.map(({ subcategory, consecutiveDays: subDays, avg: subAvg, latestAmount: subLatest, trend: subTrend }) => (
                              <div key={subcategory.id} className="flex items-center gap-3 pl-4 text-xs text-muted-foreground">
                                <span className="min-w-[60px] tabular-nums font-medium">
                                  {subDays}d
                                </span>
                                <span className="flex-1 min-w-0 truncate">
                                  {subcategory.name}
                                </span>
                                <div className="flex items-center">
                                  {subTrend === "up" && <TrendingUp className="h-3 w-3 text-red-500" />}
                                  {subTrend === "down" && <TrendingDown className="h-3 w-3 text-green-500" />}
                                  {subTrend === "flat" && <Minus className="h-3 w-3 text-muted-foreground" />}
                                </div>
                                <span className="text-right whitespace-nowrap tabular-nums">
                                  {subLatest.toLocaleString()} last | avg {Math.round(subAvg).toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  )}
                  <p className="text-[11px] text-muted-foreground pt-1">
                    Streak = consecutive days with losses in this category leading up to today.
                    Trend compares the two most recent days.
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      )}
    </Card>
  );
}
