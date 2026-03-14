"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getBarRate,
  getProductionUnit,
  getOperatingHours,
  getCategories,
  getSubcategories,
  getDetailCodes,
  getDailyLog,
  getDailyLogs,
  getAllLossEntries,
  createDailyLog,
  updateDailyLog,
  getLossEntries,
  createLossEntry,
  updateLossEntry,
  deleteLossEntry,
  deleteDailyLog,
  bulkUpdateDayStatus,
  bulkDeleteDailyLogs,
  getRecentHistory,
  type DaySnapshot,
} from "@/lib/store";
import {
  LossCategory,
  LossSubcategory,
  LossDetailCode,
  LossEntry,
  DailyLog,
  LossType,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Lock,
  Unlock,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  X,
  ChevronsUpDown,
  Check,
} from "lucide-react";
import { format, parseISO, addDays, subDays, isToday } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LossContextPanel } from "@/components/daily/loss-context-panel";
import { BulkEntryDialog } from "@/components/daily/bulk-entry-dialog";

// ─── Types ───────────────────────────────────────────────────────

interface LogRow extends DailyLog {
  accounted: number;
  remaining: number;
}

type SortColumn =
  | "date"
  | "production"
  | "bar"
  | "delta"
  | "accounted"
  | "remaining"
  | "status";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "open" | "closed";

// ─── Subcategory Combobox ────────────────────────────────────────

function SubcategoryCombobox({
  value,
  onValueChange,
  subcategories,
  disabled,
}: {
  value: string;
  onValueChange: (v: string) => void;
  subcategories: LossSubcategory[];
  disabled: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const selectedName = subcategories.find((s) => s.id === value)?.name;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "border-input flex items-center justify-between gap-1 rounded-md border bg-transparent px-2 whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50 min-w-[120px]",
            !selectedName && "text-muted-foreground"
          )}
          style={{ height: '1.75rem', fontSize: '0.75rem', lineHeight: '1rem' }}
        >
          <span className="truncate">{selectedName ?? "Subcategory"}</span>
          <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search..." className="h-8 text-xs" />
          <CommandList>
            <CommandEmpty className="py-3 text-xs">No results.</CommandEmpty>
            <CommandGroup>
              {subcategories.map((sub) => (
                <CommandItem
                  key={sub.id}
                  value={sub.name}
                  onSelect={() => {
                    onValueChange(sub.id);
                    setOpen(false);
                  }}
                  className="text-xs"
                >
                  <Check className={cn("mr-1.5 h-3 w-3", value === sub.id ? "opacity-100" : "opacity-0")} />
                  {sub.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────

function defaultDate(): Date {
  const now = new Date();
  // Between midnight and 6 AM, default to yesterday
  if (now.getHours() < 6) {
    return subDays(now, 1);
  }
  return now;
}

// ─── Page ────────────────────────────────────────────────────────

export default function DailyPage() {
  // ── Log table state ──────────────────────────────────────────
  const [allLogs, setAllLogs] = useState<LogRow[]>([]);
  const [allEntriesMap, setAllEntriesMap] = useState<Map<string, number>>(new Map());
  const [sortCol, setSortCol] = useState<SortColumn>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const lastCheckedRef = useRef<string | null>(null);

  // ── Selected-day entry state ─────────────────────────────────
  // null = table view, Date = entry form for that date
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);

  const [bar, setBar] = useState<number>(0);
  const [operatingHours, setOperatingHours] = useState<number>(24);
  const [productionUnit, setProductionUnit] = useState<string>("units");
  const [categories, setCategories] = useState<LossCategory[]>([]);
  const [subcategories, setSubcategories] = useState<LossSubcategory[]>([]);
  const [detailCodes, setDetailCodes] = useState<LossDetailCode[]>([]);

  type AmountUnit = "production" | "hours" | "days";
  const [entryUnits, setEntryUnits] = useState<Record<string, AmountUnit>>({});

  const [dailyLog, setDailyLog] = useState<DailyLog | null>(null);
  const [lossEntries, setLossEntries] = useState<LossEntry[]>([]);
  const [recentHistory, setRecentHistory] = useState<DaySnapshot[]>([]);

  const [productionInput, setProductionInput] = useState<string>("");
  const [dayComments, setDayComments] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  const dateKey = useMemo(
    () => selectedDate ? format(selectedDate, "yyyy-MM-dd") : "",
    [selectedDate]
  );
  const isClosed = dailyLog?.status === "closed";

  // ── Load config + all logs on mount ──────────────────────────
  const loadAllLogs = useCallback(async () => {
    const [dailyLogs, entries] = await Promise.all([
      getDailyLogs(),
      getAllLossEntries(),
    ]);
    const byDate = new Map<string, number>();
    for (const e of entries) {
      byDate.set(e.date, (byDate.get(e.date) ?? 0) + (e.amount ?? 0));
    }
    setAllEntriesMap(byDate);
    setAllLogs(
      dailyLogs.map((log) => {
        const accounted = byDate.get(log.date) ?? 0;
        return { ...log, accounted, remaining: log.delta - accounted };
      })
    );
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const [barVal, unit, opHours, cats, subs, codes] = await Promise.all([
          getBarRate(),
          getProductionUnit(),
          getOperatingHours(),
          getCategories(),
          getSubcategories(),
          getDetailCodes(),
        ]);
        setBar(barVal);
        setProductionUnit(unit);
        setOperatingHours(opHours);
        setCategories(cats);
        setSubcategories(subs);
        setDetailCodes(codes);
        await loadAllLogs();
      } catch (err) {
        console.error("Failed to load config:", err);
        toast.error("Failed to load configuration data.");
      }
    };
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load selected day when date changes ──────────────────────
  useEffect(() => {
    if (!dateKey) {
      setDailyLog(null);
      setLossEntries([]);
      setLoading(false);
      return;
    }
    const loadDailyData = async () => {
      setLoading(true);
      try {
        const log = await getDailyLog(dateKey);
        setDailyLog(log);
        if (log) {
          setProductionInput(String(log.production));
          setDayComments(log.comments ?? "");
          const entries = await getLossEntries(dateKey);
          setLossEntries(entries);
        } else {
          setProductionInput("");
          setDayComments("");
          setLossEntries([]);
        }
        const history = await getRecentHistory(dateKey, 30);
        setRecentHistory(history);
      } catch (err) {
        console.error("Failed to load daily data:", err);
        toast.error("Failed to load daily data.");
      } finally {
        setLoading(false);
      }
    };
    loadDailyData();
  }, [dateKey]);

  // ── Sorted + filtered log table ──────────────────────────────
  const filteredLogs = useMemo(() => {
    let rows = allLogs;
    if (statusFilter !== "all") {
      rows = rows.filter((l) => l.status === statusFilter);
    }
    if (filterStartDate) {
      rows = rows.filter((l) => l.date >= filterStartDate);
    }
    if (filterEndDate) {
      rows = rows.filter((l) => l.date <= filterEndDate);
    }
    const dir = sortDir === "asc" ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      if (typeof av === "string" && typeof bv === "string")
        return av.localeCompare(bv) * dir;
      return ((av as number) - (bv as number)) * dir;
    });
    return rows;
  }, [allLogs, statusFilter, filterStartDate, filterEndDate, sortCol, sortDir]);

  const handleSort = useCallback(
    (col: SortColumn) => {
      if (sortCol === col) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortCol(col);
        setSortDir(col === "date" ? "desc" : "asc");
      }
    },
    [sortCol]
  );

  const hasFilters = statusFilter !== "all" || filterStartDate || filterEndDate;

  // ── Computed values for selected day ─────────────────────────
  const production = dailyLog?.production ?? 0;
  const delta = bar - production;
  const isGainDay = delta < 0;
  const absDelta = Math.abs(delta);
  const totalAccounted = useMemo(
    () => lossEntries.reduce((sum, e) => sum + (e.amount ?? 0), 0),
    [lossEntries]
  );
  const remaining = Math.round((absDelta - totalAccounted) * 100) / 100;
  const isBalanced = Math.abs(remaining) < 0.01;

  // Category colours for allocation bar + entry borders
  const SEGMENT_COLORS = [
    "bg-blue-500",
    "bg-amber-500",
    "bg-rose-500",
    "bg-emerald-500",
    "bg-violet-500",
    "bg-cyan-500",
    "bg-orange-500",
    "bg-pink-500",
  ];
  const BORDER_COLORS = [
    "border-l-blue-500",
    "border-l-amber-500",
    "border-l-rose-500",
    "border-l-emerald-500",
    "border-l-violet-500",
    "border-l-cyan-500",
    "border-l-orange-500",
    "border-l-pink-500",
  ];

  const allocationSegments = useMemo(() => {
    if (absDelta <= 0) return [];
    const byCat = new Map<string, number>();
    for (const e of lossEntries) {
      if (!e.categoryId || e.amount <= 0) continue;
      byCat.set(e.categoryId, (byCat.get(e.categoryId) ?? 0) + e.amount);
    }
    const segments: { categoryId: string; name: string; amount: number; pct: number; color: string }[] = [];
    const ordered = categories.filter((c) => byCat.has(c.id));
    ordered.forEach((cat, i) => {
      const amount = byCat.get(cat.id) ?? 0;
      segments.push({
        categoryId: cat.id,
        name: cat.name,
        amount,
        pct: (amount / absDelta) * 100,
        color: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
      });
    });
    return segments;
  }, [lossEntries, categories, absDelta]); // eslint-disable-line react-hooks/exhaustive-deps

  const accountedPct = absDelta > 0 ? Math.min((totalAccounted / absDelta) * 100, 100) : 0;
  const remainingPct = Math.max(0, 100 - accountedPct);

  // Category dropdown width based on longest name (~7.2px per char at text-xs + padding)
  const categoryMinWidth = useMemo(() => {
    const longest = categories.reduce((max, c) => Math.max(max, c.name.length), 0);
    return Math.max(longest * 7.2 + 40, 100); // 40px for padding + chevron
  }, [categories]);

  // Unit conversion
  const hourlyRate = operatingHours > 0 ? bar / operatingHours : 0;
  const toProductionUnits = useCallback(
    (value: number, unit: AmountUnit): number => {
      if (unit === "hours") return value * hourlyRate;
      if (unit === "days") return value * bar;
      return value;
    },
    [hourlyRate, bar]
  );
  const fromProductionUnits = useCallback(
    (value: number, unit: AmountUnit): number => {
      if (unit === "hours") return hourlyRate > 0 ? value / hourlyRate : 0;
      if (unit === "days") return bar > 0 ? value / bar : 0;
      return value;
    },
    [hourlyRate, bar]
  );

  // ── Refresh log table after mutations ────────────────────────
  const refreshLogTable = useCallback(async () => {
    try {
      await loadAllLogs();
    } catch {
      // best-effort
    }
  }, [loadAllLogs]);

  // ── Handlers ─────────────────────────────────────────────────

  const handleStartAccounting = useCallback(async () => {
    const prod = parseFloat(productionInput);
    if (isNaN(prod) || prod < 0) {
      toast.error("Please enter a valid production total.");
      return;
    }
    try {
      setSaving(true);
      const log = await createDailyLog({
        date: dateKey,
        production: prod,
        bar,
        comments: "",
        status: "open",
      });
      setDailyLog(log);
      setLossEntries([]);
      toast.success("Daily log created. Start adding loss entries.");
      await refreshLogTable();
    } catch (err) {
      console.error("Failed to create daily log:", err);
      toast.error("Failed to create daily log.");
    } finally {
      setSaving(false);
    }
  }, [productionInput, dateKey, bar, refreshLogTable]);

  const handleUpdateProduction = useCallback(
    async (value: string) => {
      setProductionInput(value);
      const prod = parseFloat(value);
      if (!dailyLog || isNaN(prod) || prod < 0) return;
      try {
        const updated = await updateDailyLog(dateKey, { production: prod });
        setDailyLog(updated);
        await refreshLogTable();
      } catch (err) {
        console.error("Failed to update production:", err);
        toast.error("Failed to update production.");
      }
    },
    [dailyLog, dateKey, refreshLogTable]
  );

  const handleDayCommentsChange = useCallback(
    async (value: string) => {
      setDayComments(value);
      if (!dailyLog) return;
      try {
        await updateDailyLog(dateKey, { comments: value });
      } catch {
        // auto-save
      }
    },
    [dailyLog, dateKey]
  );

  const handleAddLossEntry = useCallback(async () => {
    if (!dailyLog) return;
    try {
      const entry = await createLossEntry({
        dailyLogId: dailyLog.id,
        date: dateKey,
        categoryId: "",
        subcategoryId: "",
        detailCodeId: "",
        lossType: "shutdown" as LossType,
        amount: 0,
        comments: "",
      });
      setLossEntries((prev) => [...prev, entry]);
      await refreshLogTable();
    } catch (err) {
      console.error("Failed to add loss entry:", err);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to add loss entry: ${msg}`);
    }
  }, [dailyLog, dateKey, refreshLogTable]);

  const handleUpdateLossEntry = useCallback(
    async (entryId: string, field: string, value: string | number) => {
      setLossEntries((prev) =>
        prev.map((e) => {
          if (e.id !== entryId) return e;
          const updated = { ...e, [field]: value };
          if (field === "categoryId") {
            updated.subcategoryId = "";
            updated.detailCodeId = "";
          }
          if (field === "subcategoryId") {
            updated.detailCodeId = "";
          }
          return updated;
        })
      );
      try {
        const updateData: Record<string, string | number> = { [field]: value };
        if (field === "categoryId") {
          updateData.subcategoryId = "";
          updateData.detailCodeId = "";
        }
        if (field === "subcategoryId") {
          updateData.detailCodeId = "";
        }
        await updateLossEntry(entryId, updateData);
        if (field === "amount") await refreshLogTable();
      } catch (err) {
        console.error("Failed to save loss entry:", err);
        toast.error("Failed to save loss entry.");
      }
    },
    [refreshLogTable]
  );

  const handleDeleteLossEntry = useCallback(
    async (entryId: string) => {
      try {
        await deleteLossEntry(entryId);
        setLossEntries((prev) => prev.filter((e) => e.id !== entryId));
        toast.success("Loss entry removed.");
        await refreshLogTable();
      } catch (err) {
        console.error("Failed to delete loss entry:", err);
        toast.error("Failed to delete loss entry.");
      }
    },
    [refreshLogTable]
  );

  const handleCloseDay = useCallback(async () => {
    if (!dailyLog || !isBalanced) return;
    try {
      setSaving(true);
      const updated = await updateDailyLog(dateKey, {
        status: "closed",
        comments: dayComments,
      });
      setDailyLog(updated);
      toast.success("Day closed successfully.");
      await refreshLogTable();
    } catch (err) {
      console.error("Failed to close day:", err);
      toast.error("Failed to close day.");
    } finally {
      setSaving(false);
    }
  }, [dailyLog, isBalanced, dateKey, dayComments, refreshLogTable]);

  const handleReopenDay = useCallback(async () => {
    if (!dailyLog || dailyLog.status !== "closed") return;
    try {
      setSaving(true);
      const updated = await updateDailyLog(dateKey, { status: "open" });
      setDailyLog(updated);
      toast.success("Day reopened for editing.");
      await refreshLogTable();
    } catch (err) {
      console.error("Failed to reopen day:", err);
      toast.error("Failed to reopen day.");
    } finally {
      setSaving(false);
    }
  }, [dailyLog, dateKey, refreshLogTable]);

  const handleCarryForward = useCallback(
    async (previousEntries: LossEntry[], withAmounts = false) => {
      if (!dailyLog || isClosed) return;
      try {
        const newEntries: LossEntry[] = [];
        for (const prev of previousEntries) {
          const entry = await createLossEntry({
            dailyLogId: dailyLog.id,
            date: dateKey,
            categoryId: prev.categoryId,
            subcategoryId: prev.subcategoryId,
            detailCodeId: prev.detailCodeId ?? "",
            lossType: prev.lossType,
            amount: withAmounts ? prev.amount : 0,
            comments: prev.comments,
          });
          newEntries.push(entry);
        }
        setLossEntries((existing) => [...existing, ...newEntries]);
        const count = newEntries.length;
        const label = count === 1 ? "entry" : "entries";
        toast.success(
          withAmounts
            ? `Copied ${count} ${label} with amounts.`
            : `Carried forward ${count} ${label}. Adjust amounts for today.`
        );
        await refreshLogTable();
      } catch (err) {
        console.error("Failed to carry forward entries:", err);
        toast.error("Failed to carry forward entries.");
      }
    },
    [dailyLog, isClosed, dateKey, refreshLogTable]
  );

  const getSubcategoriesForCategory = useCallback(
    (categoryId: string): LossSubcategory[] => {
      return subcategories.filter((s) => s.categoryId === categoryId);
    },
    [subcategories]
  );

  const getDetailCodesForSubcategory = useCallback(
    (subcategoryId: string): LossDetailCode[] => {
      return detailCodes.filter((d) => d.subcategoryId === subcategoryId);
    },
    [detailCodes]
  );

  const getAllowedLossTypes = useCallback(
    (categoryId: string): LossType[] => {
      const category = categories.find((c) => c.id === categoryId);
      if (!category) return ["shutdown", "slowdown"] as LossType[];
      return (category.allowedLossTypes ?? ["shutdown", "slowdown"]) as LossType[];
    },
    [categories]
  );

  const getCategoryBorderColor = useCallback(
    (categoryId: string): string => {
      const idx = categories.findIndex((c) => c.id === categoryId);
      if (idx < 0) return "border-l-muted-foreground/30";
      return BORDER_COLORS[idx % BORDER_COLORS.length];
    },
    [categories] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleDateSelect = useCallback((date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      setCalendarOpen(false);
    }
  }, []);

  const handleBackToTable = useCallback(() => {
    setSelectedDate(null);
    refreshLogTable();
  }, [refreshLogTable]);

  const handleOpenDate = useCallback((date: Date) => {
    setSelectedDate(date);
  }, []);

  // ── Bulk actions ───────────────────────────────────────────────
  const toggleSelectId = useCallback((id: string, e?: React.MouseEvent) => {
    if (e?.shiftKey && lastCheckedRef.current) {
      // Shift-click: select range between last checked and this one
      const ids = filteredLogs.map((l) => l.id);
      const lastIdx = ids.indexOf(lastCheckedRef.current);
      const curIdx = ids.indexOf(id);
      if (lastIdx !== -1 && curIdx !== -1) {
        const [start, end] = lastIdx < curIdx ? [lastIdx, curIdx] : [curIdx, lastIdx];
        const rangeIds = ids.slice(start, end + 1);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const rid of rangeIds) next.add(rid);
          return next;
        });
        lastCheckedRef.current = id;
        return;
      }
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    lastCheckedRef.current = id;
  }, [filteredLogs]);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === filteredLogs.length) return new Set();
      return new Set(filteredLogs.map((l) => l.id));
    });
  }, [filteredLogs]);

  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;

  const handleBulkClose = useCallback(async () => {
    const ids = Array.from(selectedIdsRef.current);
    if (ids.length === 0) return;
    try {
      await bulkUpdateDayStatus(ids, "closed");
      toast.success(`Closed ${ids.length} day${ids.length > 1 ? "s" : ""}.`);
      setSelectedIds(new Set());
      await refreshLogTable();
    } catch (err) {
      console.error("Bulk close failed:", err);
      toast.error("Failed to close selected days.");
    }
  }, [refreshLogTable]);

  const handleBulkReopen = useCallback(async () => {
    const ids = Array.from(selectedIdsRef.current);
    if (ids.length === 0) return;
    try {
      await bulkUpdateDayStatus(ids, "open");
      toast.success(`Reopened ${ids.length} day${ids.length > 1 ? "s" : ""}.`);
      setSelectedIds(new Set());
      await refreshLogTable();
    } catch (err) {
      console.error("Bulk reopen failed:", err);
      toast.error("Failed to reopen selected days.");
    }
  }, [refreshLogTable]);

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIdsRef.current);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} day${ids.length > 1 ? "s" : ""} and all their loss entries? This cannot be undone.`)) return;
    try {
      await bulkDeleteDailyLogs(ids);
      toast.success(`Deleted ${ids.length} day${ids.length > 1 ? "s" : ""}.`);
      setSelectedIds(new Set());
      await refreshLogTable();
    } catch (err) {
      console.error("Bulk delete failed:", err);
      toast.error("Failed to delete selected days.");
    }
  }, [refreshLogTable]);

  const handleDeleteDay = useCallback(async () => {
    if (!dailyLog) return;
    if (!confirm(`Delete this day (${dateKey}) and all its loss entries? This cannot be undone.`)) return;
    try {
      await deleteDailyLog(dailyLog.id);
      toast.success("Day deleted.");
      setSelectedDate(null);
      await refreshLogTable();
    } catch (err) {
      console.error("Failed to delete day:", err);
      toast.error("Failed to delete day.");
    }
  }, [dailyLog, dateKey, refreshLogTable]);

  // ── Sort icon helper ─────────────────────────────────────────
  const SortIcon = ({ col }: { col: SortColumn }) => {
    if (sortCol !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-30" />;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 ml-1" />
    ) : (
      <ArrowDown className="h-3 w-3 ml-1" />
    );
  };

  // ─── Render ──────────────────────────────────────────────────

  // Table view (no date selected)
  if (!selectedDate) {
    return (
      <div className="container mx-auto max-w-5xl py-3 px-4 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight">
            Daily Loss Accounting
          </h1>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setBulkDialogOpen(true)}
            >
              <CalendarIcon className="h-3 w-3 mr-1" />
              Bulk Entry
            </Button>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs">
                  <Plus className="h-3 w-3 mr-1" />
                  New Day
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  onSelect={(date) => {
                    if (date) {
                      setSelectedDate(date);
                      setCalendarOpen(false);
                    }
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <Button
              variant="default"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setSelectedDate(defaultDate())}
            >
              {new Date().getHours() < 6 ? "Yesterday" : "Today"}
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="px-3 py-2">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as StatusFilter)}
              >
                <SelectTrigger className="h-7 text-xs w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="h-7 rounded-md border border-input bg-transparent px-2 text-xs"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="h-7 rounded-md border border-input bg-transparent px-2 text-xs"
              />
              {hasFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs px-2"
                  onClick={() => {
                    setStatusFilter("all");
                    setFilterStartDate("");
                    setFilterEndDate("");
                  }}
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              )}
              <span className="ml-auto text-[10px] text-muted-foreground">
                {filteredLogs.length} of {allLogs.length} day{allLogs.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Bulk action bar */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 mb-2 px-1 py-1.5 bg-muted/50 rounded-md">
                <span className="text-xs font-medium ml-1">
                  {selectedIds.size} selected
                </span>
                <div className="flex items-center gap-1 ml-auto">
                  <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={handleBulkClose}>
                    <Lock className="h-3 w-3 mr-1" />
                    Close
                  </Button>
                  <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={handleBulkReopen}>
                    <Unlock className="h-3 w-3 mr-1" />
                    Reopen
                  </Button>
                  <Button variant="outline" size="sm" className="h-6 text-xs px-2 text-destructive hover:text-destructive" onClick={handleBulkDelete}>
                    <Trash2 className="h-3 w-3 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            )}

            {/* Table */}
            {filteredLogs.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                {allLogs.length === 0
                  ? "No daily logs yet. Click \"Today\" or \"New Day\" to begin."
                  : "No logs match the current filters."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8 h-8 text-center">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-input accent-primary cursor-pointer"
                          checked={selectedIds.size === filteredLogs.length && filteredLogs.length > 0}
                          ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < filteredLogs.length; }}
                          onChange={toggleSelectAll}
                        />
                      </TableHead>
                      {(
                        [
                          ["date", "Date", "text-left"],
                          ["production", "Production", "text-right"],
                          ["bar", "BAR", "text-right"],
                          ["delta", "Delta", "text-right"],
                          ["accounted", "Accounted", "text-right"],
                          ["remaining", "Remaining", "text-right"],
                          ["status", "Status", "text-center"],
                        ] as [SortColumn, string, string][]
                      ).map(([col, label, align]) => (
                        <TableHead
                          key={col}
                          className={cn(
                            "text-[10px] h-8 cursor-pointer select-none hover:text-foreground",
                            align
                          )}
                          onClick={() => handleSort(col)}
                        >
                          <span className="inline-flex items-center">
                            {label}
                            <SortIcon col={col} />
                          </span>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLogs.map((log) => (
                      <TableRow
                        key={log.date}
                        className={cn("cursor-pointer", selectedIds.has(log.id) && "bg-muted/50")}
                        onClick={() => handleOpenDate(parseISO(log.date))}
                      >
                        <TableCell className="text-center py-1.5" onClick={(e) => {
                          e.stopPropagation();
                          toggleSelectId(log.id, e);
                        }}>
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded border-input accent-primary cursor-pointer"
                            checked={selectedIds.has(log.id)}
                            readOnly
                          />
                        </TableCell>
                        <TableCell className="text-xs py-1.5 font-medium">
                          {format(parseISO(log.date), "EEE, MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="text-xs py-1.5 text-right tabular-nums">
                          {log.production.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs py-1.5 text-right tabular-nums">
                          {log.bar.toLocaleString()}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-xs py-1.5 text-right tabular-nums",
                            log.delta > 0
                              ? "text-orange-600"
                              : log.delta < 0
                                ? "text-green-600"
                                : "text-muted-foreground"
                          )}
                        >
                          {log.delta.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs py-1.5 text-right tabular-nums">
                          {log.accounted.toLocaleString()}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-xs py-1.5 text-right tabular-nums",
                            log.remaining > 0.01
                              ? "text-yellow-600"
                              : log.remaining < -0.01
                                ? "text-red-600"
                                : "text-green-600"
                          )}
                        >
                          {log.remaining.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs py-1.5 text-center">
                          <Badge
                            variant="secondary"
                            className={cn(
                              "text-[10px] px-1.5 py-0",
                              log.status === "closed"
                                ? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400"
                                : "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-400"
                            )}
                          >
                            {log.status === "closed" ? "Closed" : "Open"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <BulkEntryDialog
          open={bulkDialogOpen}
          onOpenChange={setBulkDialogOpen}
          onSaved={refreshLogTable}
          bar={bar}
          productionUnit={productionUnit}
          categories={categories}
          subcategories={subcategories}
          existingLogs={allLogs}
        />
      </div>
    );
  }

  // Entry form view (date selected)
  return (
    <div className="container mx-auto max-w-5xl py-3 px-4 space-y-2">
      {/* Header with back + date nav */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs px-2"
            onClick={handleBackToTable}
          >
            <ChevronLeft className="h-3.5 w-3.5 mr-1" />
            All Days
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setSelectedDate(subDays(selectedDate, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="h-7 px-2.5 text-xs font-normal"
              >
                <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                {format(selectedDate, "EEE, MMM d, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={handleDateSelect}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setSelectedDate(addDays(selectedDate, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs px-2 ml-0.5"
            disabled={isToday(selectedDate)}
            onClick={() => setSelectedDate(new Date())}
          >
            Today
          </Button>
        </div>
      </div>

      {/* No daily log yet */}
      {!loading && !dailyLog && (
        <Card>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              No data for{" "}
              <span className="font-medium text-foreground">
                {format(selectedDate, "MMM d, yyyy")}
              </span>
              . Enter production to begin.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1 space-y-1">
                <Label htmlFor="production-init" className="text-xs">
                  Production ({productionUnit})
                </Label>
                <Input
                  id="production-init"
                  type="number"
                  min="0"
                  step="any"
                  placeholder={`Enter production in ${productionUnit}`}
                  value={productionInput}
                  onChange={(e) => setProductionInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  BAR: {bar.toLocaleString()} {productionUnit}
                </Label>
                <Button
                  size="sm"
                  onClick={handleStartAccounting}
                  disabled={
                    saving || !productionInput || isNaN(parseFloat(productionInput))
                  }
                >
                  Start Accounting
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Daily log exists */}
      {dailyLog && (
        <>
          {/* KPI Summary Cards - sticky */}
          <div className="sticky top-0 z-10 bg-background pt-1 pb-1 -mt-1 -mx-4 px-4 border-b border-transparent [&:not(:first-child)]:border-border/50">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <Card>
                <CardContent className="px-3">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    Production
                  </p>
                  <p className="text-xl font-bold mt-0.5">
                    {production.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{productionUnit}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="px-3">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    BAR
                  </p>
                  <p className="text-xl font-bold mt-0.5">
                    {bar.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{productionUnit}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="px-3">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    {isGainDay ? "Gain" : "Delta"}
                  </p>
                  <p
                    className={cn(
                      "text-xl font-bold mt-0.5",
                      isGainDay ? "text-green-600" : "text-orange-600"
                    )}
                  >
                    {isGainDay ? "+" : ""}
                    {absDelta.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{productionUnit}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="px-3">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    Accounted
                  </p>
                  <p className="text-xl font-bold mt-0.5">
                    {totalAccounted.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{productionUnit}</p>
                </CardContent>
              </Card>
              <Card
                className={cn(
                  "col-span-2 md:col-span-1",
                  isBalanced
                    ? "border-green-500 bg-green-50 dark:bg-green-950/20"
                    : "border-red-500 bg-red-50 dark:bg-red-950/20"
                )}
              >
                <CardContent className="px-3">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                    Remaining
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {isBalanced ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-red-600" />
                    )}
                    <p
                      className={cn(
                        "text-xl font-bold",
                        isBalanced ? "text-green-600" : "text-red-600"
                      )}
                    >
                      {remaining.toLocaleString()}
                    </p>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{productionUnit}</p>
                </CardContent>
              </Card>
            </div>

            {/* Loss Allocation Bar */}
            {absDelta > 0 && (
              <TooltipProvider>
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                      Allocation
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {accountedPct.toFixed(0)}% accounted
                    </span>
                  </div>
                  <div className="relative h-5 w-full rounded-full bg-muted overflow-hidden flex">
                    {allocationSegments.map((seg) => (
                      <Tooltip key={seg.categoryId}>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              seg.color,
                              "h-full transition-all duration-300 ease-out cursor-default",
                              seg.pct < 3 && "min-w-[3px]"
                            )}
                            style={{ width: `${seg.pct}%` }}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p className="font-medium">{seg.name}</p>
                          <p>{seg.amount.toLocaleString()} {productionUnit} ({seg.pct.toFixed(1)}%)</p>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                    {remainingPct > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              "h-full transition-all duration-300 ease-out cursor-default",
                              isBalanced ? "bg-transparent" : "bg-muted-foreground/20 dark:bg-muted-foreground/25"
                            )}
                            style={{ width: `${remainingPct}%` }}
                          />
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p className="font-medium">Unaccounted</p>
                          <p>{Math.abs(remaining).toLocaleString()} {productionUnit} ({remainingPct.toFixed(1)}%)</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  {allocationSegments.length > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                      {allocationSegments.map((seg) => (
                        <div key={seg.categoryId} className="flex items-center gap-1">
                          <div className={cn("h-2 w-2 rounded-full", seg.color)} />
                          <span className="text-[10px] text-muted-foreground">
                            {seg.name}
                          </span>
                        </div>
                      ))}
                      {!isBalanced && (
                        <div className="flex items-center gap-1">
                          <div className={cn("h-2 w-2 rounded-full", remaining > 0 ? "bg-muted-foreground/20 border border-muted-foreground/30" : "bg-destructive/40 border border-destructive/50")} />
                          <span className="text-[10px] text-muted-foreground">
                            {remaining > 0 ? `Unaccounted (${remaining.toLocaleString()} ${productionUnit})` : `Over-accounted (${Math.abs(remaining).toLocaleString()} ${productionUnit})`}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </TooltipProvider>
            )}
          </div>

          {/* Loss Context Panel */}
          <LossContextPanel
            history={recentHistory}
            categories={categories}
            subcategories={subcategories}
            productionUnit={productionUnit}
            todayDelta={delta}
            onCarryForward={handleCarryForward}
            disabled={isClosed || !dailyLog}
          />

          {/* Production Edit */}
          {!isClosed && (
            <div className="flex items-center gap-2">
              <Label htmlFor="production-edit" className="text-xs text-muted-foreground whitespace-nowrap">
                Production ({productionUnit})
              </Label>
              <Input
                id="production-edit"
                type="number"
                min="0"
                step="any"
                className="h-7 text-xs max-w-[160px]"
                value={productionInput}
                onChange={(e) => handleUpdateProduction(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              />
            </div>
          )}

          {/* Loss / Gain Entries */}
          <Card>
            <CardContent className="px-3 py-2">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium">
                  {isGainDay ? "Gain" : "Loss"} Entries ({lossEntries.length})
                </span>
                {!isClosed && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs px-2"
                    onClick={handleAddLossEntry}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                )}
              </div>

              {lossEntries.length === 0 && (
                <div className="text-center py-3 text-sm text-muted-foreground">
                  No {isGainDay ? "gain" : "loss"} entries yet.
                  {!isClosed && (
                    <span className="block text-xs mt-0.5">
                      Click &quot;Add&quot; to start accounting for the
                      {isGainDay ? " gain" : " delta"}.
                    </span>
                  )}
                </div>
              )}

              {lossEntries.length > 0 && (
                <div className="space-y-1.5">
                  {lossEntries.map((entry, index) => {
                    const filteredSubcategories = getSubcategoriesForCategory(entry.categoryId);
                    const filteredDetailCodes = entry.subcategoryId
                      ? getDetailCodesForSubcategory(entry.subcategoryId)
                      : [];
                    const allowedTypes = getAllowedLossTypes(entry.categoryId);
                    const hasDetailCodes = filteredDetailCodes.length > 0;
                    const unit = entryUnits[entry.id] || "production";
                    const unitLabel = unit === "hours" ? "hr" : unit === "days" ? "d" : productionUnit;
                    const displayValue = unit === "production"
                      ? entry.amount || ""
                      : entry.amount ? parseFloat(fromProductionUnits(entry.amount, unit).toFixed(4)) : "";
                    const singleType = allowedTypes.length === 1;

                    return (
                      <div
                        key={entry.id}
                        className={cn(
                          "border-l-2 rounded-sm pl-2.5 pr-1 py-1.5 space-y-1.5",
                          getCategoryBorderColor(entry.categoryId),
                          index > 0 && "mt-1.5",
                          isClosed && "opacity-70"
                        )}
                      >
                        {/* Row 1: What — Category / Subcategory / Detail Code / Delete */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-medium text-muted-foreground shrink-0 w-4">
                            {index + 1}
                          </span>
                          <div className="flex flex-1 items-center gap-1.5">
                            {/* Category + Subcategory side-by-side with no gap */}
                            <div className="flex items-center gap-1.5">
                              <Select value={entry.categoryId} onValueChange={(v) => handleUpdateLossEntry(entry.id, "categoryId", v)} disabled={isClosed}>
                                <SelectTrigger style={{ width: categoryMinWidth, height: '1.75rem', fontSize: '0.75rem', lineHeight: '1rem' }}><SelectValue placeholder="Category" /></SelectTrigger>
                                <SelectContent style={{ fontSize: '0.75rem' }}>{categories.map((cat) => (<SelectItem key={cat.id} value={cat.id} className="text-xs">{cat.name}</SelectItem>))}</SelectContent>
                              </Select>
                              <SubcategoryCombobox
                                value={entry.subcategoryId}
                                onValueChange={(v) => handleUpdateLossEntry(entry.id, "subcategoryId", v)}
                                subcategories={filteredSubcategories}
                                disabled={isClosed || !entry.categoryId}
                              />
                            </div>
                            {hasDetailCodes && (
                              <Select value={entry.detailCodeId || ""} onValueChange={(v) => handleUpdateLossEntry(entry.id, "detailCodeId", v)} disabled={isClosed}>
                                <SelectTrigger style={{ height: '1.75rem', fontSize: '0.75rem', lineHeight: '1rem' }}><SelectValue placeholder="Detail code" /></SelectTrigger>
                                <SelectContent style={{ fontSize: '0.75rem' }}>{filteredDetailCodes.map((dc) => (<SelectItem key={dc.id} value={dc.id} className="text-xs">{dc.name}</SelectItem>))}</SelectContent>
                              </Select>
                            )}
                          </div>
                          {!isClosed && (
                            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 text-destructive/60 hover:text-destructive hover:bg-destructive/10" onClick={() => handleDeleteLossEntry(entry.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>

                        {/* Row 2: How much — Type toggle / Amount / Comments */}
                        <div className="flex items-center gap-1.5 pl-[22px]">
                          {/* Loss type toggle */}
                          {singleType ? (
                            <Badge variant="secondary" className="h-7 text-[10px] px-2 shrink-0">
                              {allowedTypes[0] === "shutdown" ? "SD" : "SL"}
                            </Badge>
                          ) : (
                            <div className="flex shrink-0 rounded-md border border-input overflow-hidden h-7">
                              <button
                                type="button"
                                disabled={isClosed}
                                onClick={() => handleUpdateLossEntry(entry.id, "lossType", "shutdown")}
                                className={cn(
                                  "px-2 text-[10px] font-medium transition-colors",
                                  entry.lossType === "shutdown"
                                    ? "bg-foreground text-background"
                                    : "bg-transparent text-muted-foreground hover:bg-muted"
                                )}
                              >
                                SD
                              </button>
                              <button
                                type="button"
                                disabled={isClosed}
                                onClick={() => handleUpdateLossEntry(entry.id, "lossType", "slowdown")}
                                className={cn(
                                  "px-2 text-[10px] font-medium transition-colors border-l border-input",
                                  entry.lossType === "slowdown"
                                    ? "bg-foreground text-background"
                                    : "bg-transparent text-muted-foreground hover:bg-muted"
                                )}
                              >
                                SL
                              </button>
                            </div>
                          )}

                          {/* Amount with inline unit toggle */}
                          <div className="relative shrink-0 w-[120px] md:w-[140px]">
                            <div className="relative flex items-center">
                              <Input
                                type="number"
                                min="0"
                                step="any"
                                placeholder="0"
                                className="pr-12"
                                style={{ height: '1.75rem', fontSize: '0.75rem', lineHeight: '1rem' }}
                                value={displayValue}
                                onChange={(e) => {
                                  const raw = parseFloat(e.target.value) || 0;
                                  const inProdUnits = toProductionUnits(raw, unit);
                                  handleUpdateLossEntry(entry.id, "amount", Math.round(inProdUnits * 100) / 100);
                                }}
                                disabled={isClosed}
                                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                              />
                              <button
                                type="button"
                                disabled={isClosed}
                                className="absolute right-1 h-5 w-[42px] text-center rounded text-[9px] font-medium text-muted-foreground bg-muted hover:bg-muted-foreground/20 transition-colors"
                                onClick={() => {
                                  const order: AmountUnit[] = ["production", "hours", "days"];
                                  const next = order[(order.indexOf(unit) + 1) % order.length];
                                  setEntryUnits((prev) => ({ ...prev, [entry.id]: next }));
                                }}
                              >
                                {unitLabel}
                              </button>
                            </div>
                            {unit !== "production" && entry.amount > 0 && (
                              <p className="absolute left-0 top-full text-[9px] text-muted-foreground truncate mt-0.5 w-full">
                                = {entry.amount.toLocaleString()} {productionUnit}
                              </p>
                            )}
                          </div>

                          {/* Comments */}
                          <Input
                            placeholder="Notes..."
                            className="flex-1 min-w-0"
                            style={{ height: '1.75rem', fontSize: '0.75rem', lineHeight: '1rem' }}
                            value={entry.comments ?? ""}
                            onChange={(e) => handleUpdateLossEntry(entry.id, "comments", e.target.value)}
                            disabled={isClosed}
                          />
                        </div>
                      </div>
                    );
                  })}

                  {!isClosed && (
                    <div className="flex justify-center pt-1">
                      <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={handleAddLossEntry}>
                        <Plus className="h-3 w-3 mr-1" />
                        Add another
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Day Comments + Close */}
          <Card>
            <CardContent className="px-3 py-2 space-y-2">
              <div>
                <Label className="text-[10px] text-muted-foreground uppercase">Day Comments</Label>
                <Textarea
                  placeholder="Overall notes for this day..."
                  value={dayComments}
                  onChange={(e) => handleDayCommentsChange(e.target.value)}
                  disabled={isClosed}
                  rows={2}
                  className="mt-0.5 text-xs"
                />
              </div>
              {!isClosed && (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {isBalanced
                      ? "Ready to close."
                      : `${Math.abs(remaining).toLocaleString()} ${productionUnit} remaining.`}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={handleDeleteDay}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Delete Day
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleCloseDay}
                      disabled={!isBalanced || saving}
                      className={cn("h-7 text-xs", isBalanced && "bg-green-600 hover:bg-green-700 text-white")}
                    >
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Close Day
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Closed Day Banner */}
          {isClosed && (
            <Card className="border-muted bg-muted/30">
              <CardContent>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Lock className="h-4 w-4" />
                    <p className="text-sm font-medium">Day closed — read-only.</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleReopenDay} disabled={saving}>
                      <Unlock className="h-3.5 w-3.5 mr-1" />
                      Reopen
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleDeleteDay}>
                      <Trash2 className="h-3 w-3 mr-1" />
                      Delete Day
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
