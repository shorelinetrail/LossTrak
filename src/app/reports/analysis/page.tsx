"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePlant } from "@/components/plant-context";
import { getDetailCodes, getLossEntriesByDateRange } from "@/lib/store";
import { LossDetailCode, LossEntry } from "@/types";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  Area,
} from "recharts";
import * as XLSX from "xlsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  ChevronDown,
  Download,
  FileSpreadsheet,
  Filter,
  X,
} from "lucide-react";
import {
  differenceInCalendarDays,
  eachDayOfInterval,
  eachMonthOfInterval,
  format,
  parseISO,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subDays,
  subMonths,
} from "date-fns";
import { cn } from "@/lib/utils";
import {
  CHART_COLORS,
  categoryColor,
  computeKpis,
  formatAmount,
} from "@/lib/reports/aggregate";
import { useReportData } from "@/lib/reports/use-report-data";
import { KpiCards } from "@/components/reports/kpi-cards";
import { ChartCard } from "@/components/reports/chart-card";
import {
  PngExportButton,
  useChartPngExport,
} from "@/components/reports/chart-png-export";

type Preset = "7d" | "30d" | "90d" | "mtd" | "qtd" | "ytd" | "12m" | "custom";
type GroupBy = "category" | "subcategory" | "detail";
type LossTypeFilter = "all" | "shutdown" | "slowdown";
type TrendStyle = "bar" | "area";

const PRESETS: { value: Preset; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "mtd", label: "Month to date" },
  { value: "qtd", label: "Quarter to date" },
  { value: "ytd", label: "Year to date" },
  { value: "12m", label: "Last 12 months" },
  { value: "custom", label: "Custom range" },
];

const PARETO_MAX_BARS = 12;

interface ParetoRow {
  key: string;
  name: string;
  total: number;
  cumulativePct: number;
  color: string;
  isOther?: boolean;
}

export default function AnalysisPage() {
  const { selectedPlantId } = usePlant();

  const [preset, setPreset] = useState<Preset>("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [compare, setCompare] = useState(false);
  const [lossTypeFilter, setLossTypeFilter] = useState<LossTypeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<Set<string>>(new Set());
  const [groupBy, setGroupBy] = useState<GroupBy>("category");
  const [trendStyle, setTrendStyle] = useState<TrendStyle>("bar");
  const [selectedGroup, setSelectedGroup] = useState<ParetoRow | null>(null);

  const [detailCodes, setDetailCodes] = useState<LossDetailCode[]>([]);
  const [prevEntries, setPrevEntries] = useState<LossEntry[]>([]);

  // ── Date range ────────────────────────────────────────────────
  const { rangeStart, rangeEnd } = useMemo(() => {
    const today = new Date();
    switch (preset) {
      case "7d":
        return { rangeStart: subDays(today, 6), rangeEnd: today };
      case "90d":
        return { rangeStart: subDays(today, 89), rangeEnd: today };
      case "mtd":
        return { rangeStart: startOfMonth(today), rangeEnd: today };
      case "qtd":
        return { rangeStart: startOfQuarter(today), rangeEnd: today };
      case "ytd":
        return { rangeStart: startOfYear(today), rangeEnd: today };
      case "12m":
        return { rangeStart: startOfMonth(subMonths(today, 11)), rangeEnd: today };
      case "custom": {
        const start = customStart ? parseISO(customStart) : subDays(today, 29);
        const end = customEnd ? parseISO(customEnd) : today;
        return start <= end
          ? { rangeStart: start, rangeEnd: end }
          : { rangeStart: end, rangeEnd: start };
      }
      case "30d":
      default:
        return { rangeStart: subDays(today, 29), rangeEnd: today };
    }
  }, [preset, customStart, customEnd]);

  const { logs, entries, categories, subcategories, productionUnit, loading } =
    useReportData(selectedPlantId, rangeStart, rangeEnd);

  useEffect(() => {
    getDetailCodes()
      .then(setDetailCodes)
      .catch(() => {});
  }, []);

  // ── Previous period (comparison) ──────────────────────────────
  const rangeDays = differenceInCalendarDays(rangeEnd, rangeStart) + 1;
  const prevEnd = useMemo(() => subDays(rangeStart, 1), [rangeStart]);
  const prevStart = useMemo(
    () => subDays(prevEnd, rangeDays - 1),
    [prevEnd, rangeDays]
  );

  useEffect(() => {
    if (!compare || !selectedPlantId) {
      setPrevEntries([]);
      return;
    }
    let cancelled = false;
    const startStr = format(prevStart, "yyyy-MM-dd");
    const endStr = format(prevEnd, "yyyy-MM-dd");
    (async () => {
      try {
        const pe = await getLossEntriesByDateRange(selectedPlantId, startStr, endStr);
        if (!cancelled) setPrevEntries(pe);
      } catch (err) {
        console.error("Failed to load comparison period:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [compare, selectedPlantId, prevStart, prevEnd]);

  // ── Name lookups ──────────────────────────────────────────────
  const catName = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [categories]);
  const subName = useMemo(() => {
    const m = new Map<string, string>();
    subcategories.forEach((s) => m.set(s.id, s.name));
    return m;
  }, [subcategories]);
  const dcName = useMemo(() => {
    const m = new Map<string, string>();
    detailCodes.forEach((d) => m.set(d.id, d.name));
    return m;
  }, [detailCodes]);

  // ── Filtering ─────────────────────────────────────────────────
  const filterEntries = useCallback(
    (list: LossEntry[]) =>
      list.filter((e) => {
        if (lossTypeFilter !== "all" && e.lossType !== lossTypeFilter) return false;
        if (categoryFilter.size > 0 && !categoryFilter.has(e.categoryId)) return false;
        return true;
      }),
    [lossTypeFilter, categoryFilter]
  );

  const filteredEntries = useMemo(
    () => filterEntries(entries),
    [entries, filterEntries]
  );
  const filteredPrevEntries = useMemo(
    () => filterEntries(prevEntries),
    [prevEntries, filterEntries]
  );

  const kpis = useMemo(
    () => computeKpis(logs, filteredEntries),
    [logs, filteredEntries]
  );

  // ── Pareto data ───────────────────────────────────────────────
  const groupKeyAndName = useCallback(
    (e: LossEntry): { key: string; name: string } => {
      const cat = catName.get(e.categoryId) ?? "Unspecified";
      if (groupBy === "category") {
        return { key: e.categoryId || "none", name: cat };
      }
      const sub = subName.get(e.subcategoryId) ?? "Unspecified";
      if (groupBy === "subcategory") {
        return {
          key: e.subcategoryId || `none-${e.categoryId}`,
          name: `${cat} / ${sub}`,
        };
      }
      const dc = e.detailCodeId ? dcName.get(e.detailCodeId) : undefined;
      return {
        key: e.detailCodeId || `nodc-${e.subcategoryId || e.categoryId}`,
        name: dc ? `${sub} / ${dc}` : `${sub} / (no detail code)`,
      };
    },
    [groupBy, catName, subName, dcName]
  );

  const paretoRows = useMemo<ParetoRow[]>(() => {
    const totals = new Map<string, { name: string; total: number; categoryId: string }>();
    for (const e of filteredEntries) {
      if ((e.amount ?? 0) <= 0) continue;
      const { key, name } = groupKeyAndName(e);
      const existing = totals.get(key);
      if (existing) existing.total += e.amount;
      else totals.set(key, { name, total: e.amount, categoryId: e.categoryId });
    }
    const sorted = [...totals.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.total - a.total);

    const top = sorted.slice(0, PARETO_MAX_BARS);
    const rest = sorted.slice(PARETO_MAX_BARS);
    const grandTotal = sorted.reduce((s, r) => s + r.total, 0);

    const rows: ParetoRow[] = top.map((r) => ({
      key: r.key,
      name: r.name,
      total: r.total,
      cumulativePct: 0,
      color:
        groupBy === "category"
          ? categoryColor(categories, r.categoryId)
          : CHART_COLORS[1],
    }));
    if (rest.length > 0) {
      rows.push({
        key: "__other__",
        name: `Other (${rest.length})`,
        total: rest.reduce((s, r) => s + r.total, 0),
        cumulativePct: 0,
        color: "#9ca3af",
        isOther: true,
      });
    }
    let running = 0;
    for (const row of rows) {
      running += row.total;
      row.cumulativePct = grandTotal > 0 ? (running / grandTotal) * 100 : 0;
    }
    return rows;
  }, [filteredEntries, groupKeyAndName, groupBy, categories]);

  // ── Trend data ────────────────────────────────────────────────
  const bucketByDay = rangeDays <= 92;
  const trendData = useMemo(() => {
    const buckets = bucketByDay
      ? eachDayOfInterval({ start: rangeStart, end: rangeEnd }).map((d) => ({
          label: format(d, rangeDays <= 31 ? "dd" : "dd MMM"),
          prefix: format(d, "yyyy-MM-dd"),
        }))
      : eachMonthOfInterval({ start: rangeStart, end: rangeEnd }).map((m) => ({
          label: format(m, "MMM yy"),
          prefix: format(m, "yyyy-MM"),
        }));

    // Previous-period totals aligned by bucket position.
    const prevBuckets = bucketByDay
      ? eachDayOfInterval({ start: prevStart, end: prevEnd }).map((d) =>
          format(d, "yyyy-MM-dd")
        )
      : eachMonthOfInterval({ start: prevStart, end: prevEnd }).map((m) =>
          format(m, "yyyy-MM")
        );

    return buckets.map((bucket, i) => {
      const bucketEntries = filteredEntries.filter((e) =>
        e.date.startsWith(bucket.prefix)
      );
      const point: Record<string, string | number> = { label: bucket.label };
      categories.forEach((cat) => {
        point[cat.name] = bucketEntries
          .filter((e) => e.categoryId === cat.id)
          .reduce((s, e) => s + (e.amount ?? 0), 0);
      });
      if (compare) {
        const prevPrefix = prevBuckets[i];
        point["Previous period"] = prevPrefix
          ? filteredPrevEntries
              .filter((e) => e.date.startsWith(prevPrefix))
              .reduce((s, e) => s + (e.amount ?? 0), 0)
          : 0;
      }
      return point;
    });
  }, [
    filteredEntries,
    filteredPrevEntries,
    categories,
    compare,
    bucketByDay,
    rangeStart,
    rangeEnd,
    prevStart,
    prevEnd,
    rangeDays,
  ]);

  const visibleCategories = useMemo(
    () =>
      categories.filter(
        (c) => categoryFilter.size === 0 || categoryFilter.has(c.id)
      ),
    [categories, categoryFilter]
  );

  // ── Drill-down ────────────────────────────────────────────────
  const drillEntries = useMemo(() => {
    if (!selectedGroup || selectedGroup.isOther) return [];
    return filteredEntries
      .filter((e) => groupKeyAndName(e).key === selectedGroup.key)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [selectedGroup, filteredEntries, groupKeyAndName]);

  // Reset drill-down when its context changes
  useEffect(() => {
    setSelectedGroup(null);
  }, [groupBy, preset, customStart, customEnd, lossTypeFilter, categoryFilter]);

  // ── Exports ───────────────────────────────────────────────────
  const periodSlug = `${format(rangeStart, "yyyyMMdd")}-${format(rangeEnd, "yyyyMMdd")}`;
  const { ref: paretoRef, exportPng: exportParetoPng } = useChartPngExport(
    `losstrak-pareto-${periodSlug}`
  );
  const { ref: trendRef, exportPng: exportTrendPng } = useChartPngExport(
    `losstrak-trend-${periodSlug}`
  );

  const handleCsvExport = useCallback(() => {
    const lines = [
      ["Group", `Losses (${productionUnit})`, "Cumulative %"],
      ...paretoRows.map((r) => [
        r.name,
        String(Math.round(r.total * 10) / 10),
        r.cumulativePct.toFixed(1),
      ]),
    ]
      .map((cells) =>
        cells.map((c) => `"${String(c).replaceAll(`"`, `""`)}"`).join(",")
      )
      .join("\n");
    const blob = new Blob([lines], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `losstrak-pareto-${periodSlug}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }, [paretoRows, productionUnit, periodSlug]);

  const handleExcelExport = useCallback(() => {
    const wb = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      [
        "Date",
        "Category",
        "Subcategory",
        "Detail Code",
        "Type",
        `Amount (${productionUnit})`,
        "Duration (hrs)",
        "Comments",
      ],
      ...[...filteredEntries]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((e) => [
          e.date,
          catName.get(e.categoryId) ?? "",
          subName.get(e.subcategoryId) ?? "",
          e.detailCodeId ? dcName.get(e.detailCodeId) ?? "" : "",
          e.lossType,
          e.amount,
          e.durationHours ?? "",
          e.comments,
        ]),
    ]);
    XLSX.utils.book_append_sheet(wb, sheet, "Loss Entries");
    XLSX.writeFile(wb, `losstrak-entries-${periodSlug}.xlsx`);
  }, [filteredEntries, catName, subName, dcName, productionUnit, periodSlug]);

  if (!selectedPlantId) {
    return (
      <div className="container mx-auto max-w-5xl py-3 px-4">
        <p className="text-sm text-muted-foreground">
          Select a plant from the top bar to continue.
        </p>
      </div>
    );
  }

  const periodLabel = `${format(rangeStart, "d MMM yyyy")} – ${format(rangeEnd, "d MMM yyyy")}`;
  const hasFilters = lossTypeFilter !== "all" || categoryFilter.size > 0;

  return (
    <div className="space-y-3 p-4">
      {/* Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Analysis</h1>
          <p className="text-sm text-muted-foreground">
            {periodLabel}
            {compare && (
              <span className="text-muted-foreground/70">
                {" "}
                vs {format(prevStart, "d MMM")} – {format(prevEnd, "d MMM yyyy")}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleCsvExport}>
            <Download className="h-3.5 w-3.5 mr-1" />
            Pareto CSV
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleExcelExport}>
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />
            Entries Excel
          </Button>
        </div>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />

            <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
              <SelectTrigger className="!h-8 text-xs w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value} className="text-xs">
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {preset === "custom" && (
              <>
                <input
                  type="date"
                  value={customStart}
                  max={customEnd || undefined}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                />
                <span className="text-xs text-muted-foreground">to</span>
                <input
                  type="date"
                  value={customEnd}
                  min={customStart || undefined}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                />
              </>
            )}

            {/* Category filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs">
                  Categories
                  {categoryFilter.size > 0 && (
                    <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">
                      {categoryFilter.size}
                    </Badge>
                  )}
                  <ChevronDown className="h-3 w-3 ml-1 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuLabel className="text-xs">
                  Filter categories
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {categories.map((cat) => (
                  <DropdownMenuCheckboxItem
                    key={cat.id}
                    className="text-xs"
                    checked={categoryFilter.size === 0 || categoryFilter.has(cat.id)}
                    onCheckedChange={(checked) => {
                      setCategoryFilter((prev) => {
                        // Empty set means "all" — first uncheck switches to explicit selection.
                        const base =
                          prev.size === 0
                            ? new Set(categories.map((c) => c.id))
                            : new Set(prev);
                        if (checked) base.add(cat.id);
                        else base.delete(cat.id);
                        return base.size === categories.length ? new Set() : base;
                      });
                    }}
                  >
                    <span
                      className="mr-1.5 h-2 w-2 rounded-full inline-block"
                      style={{ backgroundColor: categoryColor(categories, cat.id) }}
                    />
                    {cat.name}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Loss type */}
            <Select
              value={lossTypeFilter}
              onValueChange={(v) => setLossTypeFilter(v as LossTypeFilter)}
            >
              <SelectTrigger className="!h-8 text-xs w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All types</SelectItem>
                <SelectItem value="shutdown" className="text-xs">Shutdown</SelectItem>
                <SelectItem value="slowdown" className="text-xs">Slowdown</SelectItem>
              </SelectContent>
            </Select>

            {/* Group by */}
            <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
              <SelectTrigger className="!h-8 text-xs w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="category" className="text-xs">By category</SelectItem>
                <SelectItem value="subcategory" className="text-xs">By subcategory</SelectItem>
                <SelectItem value="detail" className="text-xs">By detail code</SelectItem>
              </SelectContent>
            </Select>

            {/* Compare toggle */}
            <div className="flex items-center gap-1.5 ml-1">
              <Switch id="compare" checked={compare} onCheckedChange={setCompare} />
              <Label htmlFor="compare" className="text-xs text-muted-foreground">
                vs previous period
              </Label>
            </div>

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs px-2"
                onClick={() => {
                  setLossTypeFilter("all");
                  setCategoryFilter(new Set());
                }}
              >
                <X className="h-3 w-3 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <KpiCards kpis={kpis} productionUnit={productionUnit} loading={loading} />

      {/* Pareto */}
      <ChartCard
        title={`Pareto of Losses — ${
          groupBy === "category"
            ? "by Category"
            : groupBy === "subcategory"
              ? "by Subcategory"
              : "by Detail Code"
        }`}
        loading={loading}
        empty={paretoRows.length === 0}
        emptyMessage="No losses match the current filters."
        height={340}
        actions={<PngExportButton onExport={exportParetoPng} />}
      >
        <div ref={paretoRef}>
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={paretoRows} margin={{ bottom: 50 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="name"
                fontSize={11}
                interval={0}
                angle={-30}
                textAnchor="end"
                height={70}
              />
              <YAxis
                yAxisId="left"
                fontSize={11}
                label={{
                  value: productionUnit,
                  angle: -90,
                  position: "insideLeft",
                  fontSize: 11,
                }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 100]}
                fontSize={11}
                tickFormatter={(v) => `${v}%`}
              />
              <RechartsTooltip
                formatter={(value, name) =>
                  name === "Cumulative %"
                    ? [`${Number(value ?? 0).toFixed(1)}%`, name]
                    : [`${formatAmount(Number(value ?? 0))} ${productionUnit}`, "Losses"]
                }
              />
              <Legend />
              <ReferenceLine
                yAxisId="right"
                y={80}
                stroke="#9ca3af"
                strokeDasharray="4 4"
              />
              <Bar
                yAxisId="left"
                dataKey="total"
                name="Losses"
                cursor="pointer"
                onClick={(data) => {
                  const row = (data as { payload?: ParetoRow }).payload;
                  if (row && !row.isOther) {
                    setSelectedGroup((prev) =>
                      prev?.key === row.key ? null : row
                    );
                  }
                }}
              >
                {paretoRows.map((row) => (
                  <Cell
                    key={row.key}
                    fill={row.color}
                    opacity={
                      selectedGroup && selectedGroup.key !== row.key ? 0.35 : 1
                    }
                  />
                ))}
              </Bar>
              <Line
                yAxisId="right"
                dataKey="cumulativePct"
                name="Cumulative %"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {/* Drill-down */}
      {selectedGroup && (
        <Card>
          <CardContent className="px-3 py-2">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{selectedGroup.name}</span>
                <Badge variant="secondary" className="text-[10px]">
                  {drillEntries.length} entr{drillEntries.length === 1 ? "y" : "ies"} ·{" "}
                  {formatAmount(selectedGroup.total)} {productionUnit}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSelectedGroup(null)}
              >
                <X className="h-3 w-3 mr-1" />
                Close
              </Button>
            </div>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Subcategory</TableHead>
                    <TableHead className="text-xs">Detail</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs text-right">
                      Amount ({productionUnit})
                    </TableHead>
                    <TableHead className="text-xs text-right">Hrs</TableHead>
                    <TableHead className="text-xs">Comments</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drillEntries.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-xs py-1.5 whitespace-nowrap">
                        {format(parseISO(e.date), "EEE, d MMM yyyy")}
                      </TableCell>
                      <TableCell className="text-xs py-1.5">
                        {subName.get(e.subcategoryId) ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs py-1.5">
                        {e.detailCodeId ? dcName.get(e.detailCodeId) ?? "—" : "—"}
                      </TableCell>
                      <TableCell className="text-xs py-1.5">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {e.lossType === "shutdown" ? "SD" : "SL"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs py-1.5 text-right tabular-nums">
                        {formatAmount(e.amount)}
                      </TableCell>
                      <TableCell className="text-xs py-1.5 text-right tabular-nums">
                        {e.durationHours != null ? formatAmount(e.durationHours) : "—"}
                      </TableCell>
                      <TableCell className="text-xs py-1.5 max-w-[280px] truncate">
                        {e.comments || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trend */}
      <ChartCard
        title={`Loss Trend — ${bucketByDay ? "Daily" : "Monthly"}`}
        loading={loading}
        empty={filteredEntries.length === 0 && !compare}
        emptyMessage="No losses match the current filters."
        height={320}
        actions={
          <div className="flex items-center gap-1">
            <div className="flex rounded-md border border-input overflow-hidden h-7 mr-1">
              {(["bar", "area"] as TrendStyle[]).map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => setTrendStyle(style)}
                  className={cn(
                    "px-2 text-[10px] font-medium transition-colors",
                    style === "area" && "border-l border-input",
                    trendStyle === style
                      ? "bg-foreground text-background"
                      : "bg-transparent text-muted-foreground hover:bg-muted"
                  )}
                >
                  {style === "bar" ? "Bars" : "Area"}
                </button>
              ))}
            </div>
            <PngExportButton onExport={exportTrendPng} />
          </div>
        }
      >
        <div ref={trendRef}>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis
                fontSize={11}
                label={{
                  value: productionUnit,
                  angle: -90,
                  position: "insideLeft",
                  fontSize: 11,
                }}
              />
              <RechartsTooltip
                formatter={(value, name) => [
                  `${formatAmount(Number(value ?? 0))} ${productionUnit}`,
                  name,
                ]}
              />
              <Legend />
              {visibleCategories.map((cat) =>
                trendStyle === "bar" ? (
                  <Bar
                    key={cat.id}
                    dataKey={cat.name}
                    stackId="losses"
                    fill={categoryColor(categories, cat.id)}
                  />
                ) : (
                  <Area
                    key={cat.id}
                    dataKey={cat.name}
                    stackId="losses"
                    type="monotone"
                    stroke={categoryColor(categories, cat.id)}
                    fill={categoryColor(categories, cat.id)}
                    fillOpacity={0.55}
                  />
                )
              )}
              {compare && (
                <Line
                  dataKey="Previous period"
                  stroke="#6b7280"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </div>
  );
}
