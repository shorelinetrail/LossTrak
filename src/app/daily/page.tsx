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
import { format, parseISO, addDays, subDays, isToday, startOfMonth, endOfMonth, addMonths, subMonths } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { usePlant } from "@/components/plant-context";
import { LossContextPanel } from "@/components/daily/loss-context-panel";
import { BulkEntryDialog } from "@/components/daily/bulk-entry-dialog";
import {
  ConfirmDialog,
  ConfirmDialogState,
  CONFIRM_DIALOG_CLOSED,
} from "@/components/confirm-dialog";
import { useDebouncedSaves } from "@/lib/use-debounced-saves";

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
  const { selectedPlantId } = usePlant();

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

  // ── Pagination / view mode ─────────────────────────────────
  type ViewMode = "all" | "month";
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()));
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(31);

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
  const [confirmState, setConfirmState] = useState<ConfirmDialogState>(CONFIRM_DIALOG_CLOSED);

  // Typing in production/amount/comment fields debounces the network write
  // so each keystroke no longer hits the database.
  const { schedule: scheduleSave, cancel: cancelSave } = useDebouncedSaves();

  const closeConfirm = useCallback(
    (open: boolean) => setConfirmState((s) => ({ ...s, open })),
    []
  );

  const dateKey = useMemo(
    () => selectedDate ? format(selectedDate, "yyyy-MM-dd") : "",
    [selectedDate]
  );
  const isClosed = dailyLog?.status === "closed";

  // ── Load config + all logs on mount ──────────────────────────
  const loadAllLogs = useCallback(async () => {
    const [dailyLogs, entries] = await Promise.all([
      getDailyLogs(selectedPlantId!),
      getAllLossEntries(selectedPlantId!),
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
  }, [selectedPlantId]);

  useEffect(() => {
    const init = async () => {
      try {
        const [barVal, unit, opHours, cats, subs, codes] = await Promise.all([
          getBarRate(selectedPlantId!),
          getProductionUnit(selectedPlantId!),
          getOperatingHours(selectedPlantId!),
          getCategories(),
          getSubcategories(selectedPlantId!),
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
  }, [selectedPlantId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-create today's daily log if it doesn't exist ───────
  const ensureTodayLog = useCallback(async () => {
    if (!selectedPlantId) return;
    const todayKey = format(new Date(), "yyyy-MM-dd");
    try {
      const existing = await getDailyLog(selectedPlantId, todayKey);
      if (!existing) {
        const currentBar = await getBarRate(selectedPlantId);
        await createDailyLog({
          plantId: selectedPlantId,
          date: todayKey,
          production: 0,
          bar: currentBar,
          comments: "",
          status: "open",
        });
        await loadAllLogs();
      }
    } catch {
      // silently fail — user can create manually
    }
  }, [selectedPlantId, loadAllLogs]);

  useEffect(() => {
    if (!selectedPlantId) return;
    ensureTodayLog();
    // Check again every 10 minutes (catches midnight rollover)
    const interval = setInterval(ensureTodayLog, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [selectedPlantId, ensureTodayLog]);

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
        const log = await getDailyLog(selectedPlantId!, dateKey);
        setDailyLog(log);
        if (log) {
          setProductionInput(String(log.production));
          setDayComments(log.comments ?? "");
          const entries = await getLossEntries(selectedPlantId!, dateKey);
          setLossEntries(entries);
          // Entries saved with a duration default their toggle to hours
          // so the stored duration is what's displayed.
          setEntryUnits(
            Object.fromEntries(
              entries
                .filter((e) => e.durationHours !== null && e.durationHours !== undefined)
                .map((e) => [e.id, "hours" as const])
            )
          );
        } else {
          setProductionInput("");
          setDayComments("");
          setLossEntries([]);
          setEntryUnits({});
        }
        const history = await getRecentHistory(selectedPlantId!, dateKey, 30);
        setRecentHistory(history);
      } catch (err) {
        console.error("Failed to load daily data:", err);
        toast.error("Failed to load daily data.");
      } finally {
        setLoading(false);
      }
    };
    loadDailyData();
  }, [dateKey, selectedPlantId]);

  // ── Sorted + filtered log table ──────────────────────────────
  const filteredLogs = useMemo(() => {
    let rows = allLogs;

    // Month view filter
    if (viewMode === "month") {
      const monthStart = format(viewMonth, "yyyy-MM-dd");
      const monthEnd = format(endOfMonth(viewMonth), "yyyy-MM-dd");
      rows = rows.filter((l) => l.date >= monthStart && l.date <= monthEnd);
    }

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
  }, [allLogs, statusFilter, filterStartDate, filterEndDate, sortCol, sortDir, viewMode, viewMonth]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));
  const paginatedLogs = useMemo(() => {
    const start = page * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, page]);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [statusFilter, filterStartDate, filterEndDate, viewMode, viewMonth, pageSize]);

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
        plantId: selectedPlantId!,
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
  }, [productionInput, dateKey, bar, selectedPlantId, refreshLogTable]);

  const handleUpdateProduction = useCallback(
    (value: string) => {
      setProductionInput(value);
      const prod = parseFloat(value);
      if (!dailyLog || isNaN(prod) || prod < 0) return;
      scheduleSave("production", async () => {
        try {
          const updated = await updateDailyLog(dateKey, { production: prod });
          setDailyLog(updated);
          await refreshLogTable();
        } catch (err) {
          console.error("Failed to update production:", err);
          toast.error("Failed to update production.");
        }
      });
    },
    [dailyLog, dateKey, refreshLogTable, scheduleSave]
  );

  const handleDayCommentsChange = useCallback(
    (value: string) => {
      setDayComments(value);
      if (!dailyLog) return;
      scheduleSave("dayComments", async () => {
        try {
          await updateDailyLog(dateKey, { comments: value });
        } catch {
          // auto-save
        }
      });
    },
    [dailyLog, dateKey, scheduleSave]
  );

  // New rows start as local drafts and are only written to the database
  // once a category is chosen, so abandoned rows never pollute the data.
  const isDraftId = (id: string) => id.startsWith("draft-");
  const persistingDrafts = useRef(new Set<string>());
  const pendingDraftUpdates = useRef(new Map<string, Partial<LossEntry>>());
  const [focusEntryId, setFocusEntryId] = useState<string | null>(null);
  const categoryTriggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const commentsRefs = useRef(new Map<string, HTMLInputElement>());

  // Focus the category selector of a freshly added row (keyboard flow:
  // Enter in comments → new row → pick category without the mouse).
  useEffect(() => {
    if (!focusEntryId) return;
    const el = categoryTriggerRefs.current.get(focusEntryId);
    if (el) {
      el.focus();
      setFocusEntryId(null);
    }
  }, [focusEntryId, lossEntries]);

  const handleAddLossEntry = useCallback(() => {
    if (!dailyLog) return;
    const draft: LossEntry = {
      id: `draft-${crypto.randomUUID()}`,
      plantId: selectedPlantId!,
      dailyLogId: dailyLog.id,
      date: dateKey,
      categoryId: "",
      subcategoryId: "",
      detailCodeId: "",
      lossType: "shutdown" as LossType,
      amount: 0,
      durationHours: null,
      comments: "",
      createdAt: new Date().toISOString(),
    };
    setLossEntries((prev) => [...prev, draft]);
    setFocusEntryId(draft.id);
  }, [dailyLog, dateKey, selectedPlantId]);

  const persistDraft = useCallback(
    async (draft: LossEntry) => {
      try {
        const created = await createLossEntry({
          plantId: draft.plantId,
          dailyLogId: draft.dailyLogId,
          date: draft.date,
          categoryId: draft.categoryId,
          subcategoryId: draft.subcategoryId,
          detailCodeId: draft.detailCodeId,
          lossType: draft.lossType,
          amount: draft.amount,
          durationHours: draft.durationHours,
          comments: draft.comments,
        });
        // Swap the draft id for the database id, keeping any local edits
        // made while the insert was in flight.
        setLossEntries((prev) =>
          prev.map((e) =>
            e.id === draft.id
              ? { ...e, id: created.id, createdAt: created.createdAt }
              : e
          )
        );
        setEntryUnits((prev) => {
          const unit = prev[draft.id];
          if (!unit) return prev;
          const next = { ...prev };
          delete next[draft.id];
          next[created.id] = unit;
          return next;
        });
        const pending = pendingDraftUpdates.current.get(draft.id);
        persistingDrafts.current.delete(draft.id);
        pendingDraftUpdates.current.delete(draft.id);
        if (pending && Object.keys(pending).length > 0) {
          await updateLossEntry(created.id, pending);
        }
        await refreshLogTable();
      } catch (err) {
        persistingDrafts.current.delete(draft.id);
        pendingDraftUpdates.current.delete(draft.id);
        console.error("Failed to add loss entry:", err);
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(`Failed to add loss entry: ${msg}`);
      }
    },
    [refreshLogTable]
  );

  const handleUpdateLossEntry = useCallback(
    (entryId: string, updates: Partial<LossEntry>) => {
      const existing = lossEntries.find((e) => e.id === entryId);
      if (!existing) return;
      const updateData: Partial<LossEntry> = { ...updates };
      if (updateData.categoryId !== undefined) {
        updateData.subcategoryId = "";
        updateData.detailCodeId = "";
      } else if (updateData.subcategoryId !== undefined) {
        updateData.detailCodeId = "";
      }
      const updated = { ...existing, ...updateData };
      setLossEntries((prev) => prev.map((e) => (e.id === entryId ? updated : e)));

      if (isDraftId(entryId)) {
        if (persistingDrafts.current.has(entryId)) {
          // Insert in flight — queue this change to apply once it lands.
          const pending = pendingDraftUpdates.current.get(entryId) ?? {};
          pendingDraftUpdates.current.set(entryId, { ...pending, ...updateData });
        } else if (updated.categoryId) {
          persistingDrafts.current.add(entryId);
          void persistDraft(updated);
        }
        return;
      }

      const persist = async () => {
        try {
          await updateLossEntry(entryId, updateData);
          if (updateData.amount !== undefined) await refreshLogTable();
        } catch (err) {
          console.error("Failed to save loss entry:", err);
          toast.error("Failed to save loss entry.");
        }
      };
      // Typed fields debounce; select/toggle fields save immediately.
      if (updateData.amount !== undefined) {
        scheduleSave(`entry:${entryId}:amount`, persist);
      } else if (updateData.comments !== undefined) {
        scheduleSave(`entry:${entryId}:comments`, persist);
      } else {
        void persist();
      }
    },
    [lossEntries, refreshLogTable, scheduleSave, persistDraft]
  );

  const handleDeleteLossEntry = useCallback(
    async (entryId: string) => {
      if (isDraftId(entryId)) {
        pendingDraftUpdates.current.delete(entryId);
        setLossEntries((prev) => prev.filter((e) => e.id !== entryId));
        return;
      }
      try {
        cancelSave(`entry:${entryId}:`);
        await deleteLossEntry(entryId);
        setLossEntries((prev) => prev.filter((e) => e.id !== entryId));
        toast.success("Loss entry removed.");
        await refreshLogTable();
      } catch (err) {
        console.error("Failed to delete loss entry:", err);
        toast.error("Failed to delete loss entry.");
      }
    },
    [refreshLogTable, cancelSave]
  );

  const handleCloseDay = useCallback(async () => {
    if (!dailyLog || !isBalanced) return;
    const incompleteDrafts = lossEntries.filter(
      (e) => isDraftId(e.id) && e.amount > 0
    );
    if (incompleteDrafts.length > 0) {
      toast.error(
        "Some entries with amounts have no category. Pick a category or remove them before closing."
      );
      return;
    }
    // Empty drafts were never saved — drop them quietly.
    setLossEntries((prev) => prev.filter((e) => !isDraftId(e.id)));
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
  }, [dailyLog, isBalanced, dateKey, dayComments, refreshLogTable, lossEntries]);

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
            plantId: selectedPlantId!,
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
    [dailyLog, isClosed, dateKey, refreshLogTable, selectedPlantId]
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

  const handleBulkDelete = useCallback(() => {
    const ids = Array.from(selectedIdsRef.current);
    if (ids.length === 0) return;
    const label = `${ids.length} day${ids.length > 1 ? "s" : ""}`;
    setConfirmState({
      open: true,
      title: `Delete ${label}?`,
      description: `This permanently deletes ${label} and all their loss entries. This cannot be undone.`,
      onConfirm: async () => {
        try {
          await bulkDeleteDailyLogs(ids);
          toast.success(`Deleted ${label}.`);
          setSelectedIds(new Set());
          await refreshLogTable();
        } catch (err) {
          console.error("Bulk delete failed:", err);
          toast.error("Failed to delete selected days.");
        }
      },
    });
  }, [refreshLogTable]);

  const handleDeleteDay = useCallback(() => {
    if (!dailyLog) return;
    setConfirmState({
      open: true,
      title: `Delete ${dateKey}?`,
      description:
        "This permanently deletes this day and all its loss entries. This cannot be undone.",
      onConfirm: async () => {
        try {
          await deleteDailyLog(dailyLog.id);
          toast.success("Day deleted.");
          setSelectedDate(null);
          await refreshLogTable();
        } catch (err) {
          console.error("Failed to delete day:", err);
          toast.error("Failed to delete day.");
        }
      },
    });
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

  if (!selectedPlantId) {
    return (
      <div className="container mx-auto max-w-5xl py-3 px-4">
        <p className="text-sm text-muted-foreground">Select a plant from the top bar to continue.</p>
      </div>
    );
  }

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

              {/* View mode */}
              <Select
                value={viewMode}
                onValueChange={(v) => {
                  setViewMode(v as ViewMode);
                  if (v === "month") { setFilterStartDate(""); setFilterEndDate(""); }
                }}
              >
                <SelectTrigger className="!h-7 py-0 px-2 text-xs w-[95px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Days</SelectItem>
                  <SelectItem value="month">By Month</SelectItem>
                </SelectContent>
              </Select>

              {/* Month navigation (shown when viewMode === "month") */}
              {viewMode === "month" && (
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => setViewMonth((m) => subMonths(m, 1))}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <span className="text-xs font-medium w-[90px] text-center">
                    {format(viewMonth, "MMM yyyy")}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => setViewMonth((m) => addMonths(m, 1))}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}

              {/* Status filter */}
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as StatusFilter)}
              >
                <SelectTrigger className="!h-7 py-0 px-2 text-xs w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>

              {/* Date range filter (hidden in month mode) */}
              {viewMode !== "month" && (
                <>
                  <input
                    type="date"
                    value={filterStartDate}
                    max={filterEndDate || undefined}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="h-7 rounded-md border border-input bg-transparent px-2 text-xs"
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <input
                    type="date"
                    value={filterEndDate}
                    min={filterStartDate || undefined}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="h-7 rounded-md border border-input bg-transparent px-2 text-xs"
                  />
                </>
              )}
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
                          ["date", "Date", "text-left w-[140px]"],
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
                    {paginatedLogs.map((log) => (
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

            {/* Pagination */}
            {filteredLogs.length > 0 && (
              <div className="flex items-center justify-between pt-2 border-t mt-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">Rows</span>
                  <select
                    className="h-6 rounded border border-input bg-transparent px-1 text-[10px]"
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                  >
                    {[10, 20, 31, 50, 100].map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  <span className="text-[10px] text-muted-foreground">
                    {page * pageSize + 1}–{Math.min((page + 1) * pageSize, filteredLogs.length)} of {filteredLogs.length}
                  </span>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs px-2"
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="h-3 w-3 mr-0.5" />
                      Prev
                    </Button>
                    <span className="text-[10px] text-muted-foreground px-1.5">
                      {page + 1} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs px-2"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                      <ChevronRight className="h-3 w-3 ml-0.5" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <BulkEntryDialog
          open={bulkDialogOpen}
          onOpenChange={setBulkDialogOpen}
          onSaved={refreshLogTable}
          plantId={selectedPlantId!}
          bar={bar}
          productionUnit={productionUnit}
          categories={categories}
          subcategories={subcategories}
          existingLogs={allLogs}
        />
        <ConfirmDialog state={confirmState} onOpenChange={closeConfirm} />
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
            Back
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
                  <div className="flex items-center justify-between mb-1 px-3">
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
            <Card>
              <CardContent className="px-3 py-2">
                <div className="flex items-center gap-3">
                  <Label htmlFor="production-edit" className="text-sm font-medium whitespace-nowrap">
                    Production ({productionUnit})
                  </Label>
                  <Input
                    id="production-edit"
                    type="number"
                    min="0"
                    step="any"
                    className="h-9 text-base font-medium max-w-[200px]"
                    value={productionInput}
                    onChange={(e) => handleUpdateProduction(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  />
                </div>
              </CardContent>
            </Card>
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
                    // Prefer the stored duration over a back-conversion so the
                    // hours the engineer typed are exactly what they see.
                    const displayValue = unit === "production"
                      ? entry.amount || ""
                      : unit === "hours" && entry.durationHours != null
                        ? entry.durationHours
                        : unit === "days" && entry.durationHours != null && operatingHours > 0
                          ? parseFloat((entry.durationHours / operatingHours).toFixed(4))
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
                              <Select value={entry.categoryId} onValueChange={(v) => handleUpdateLossEntry(entry.id, { categoryId: v })} disabled={isClosed}>
                                <SelectTrigger
                                  ref={(el: HTMLButtonElement | null) => {
                                    if (el) categoryTriggerRefs.current.set(entry.id, el);
                                    else categoryTriggerRefs.current.delete(entry.id);
                                  }}
                                  style={{ width: categoryMinWidth, height: '1.75rem', fontSize: '0.75rem', lineHeight: '1rem' }}
                                ><SelectValue placeholder="Category" /></SelectTrigger>
                                <SelectContent style={{ fontSize: '0.75rem' }}>{categories.map((cat) => (<SelectItem key={cat.id} value={cat.id} className="text-xs">{cat.name}</SelectItem>))}</SelectContent>
                              </Select>
                              <SubcategoryCombobox
                                value={entry.subcategoryId}
                                onValueChange={(v) => handleUpdateLossEntry(entry.id, { subcategoryId: v })}
                                subcategories={filteredSubcategories}
                                disabled={isClosed || !entry.categoryId}
                              />
                            </div>
                            {hasDetailCodes && (
                              <Select value={entry.detailCodeId || ""} onValueChange={(v) => handleUpdateLossEntry(entry.id, { detailCodeId: v })} disabled={isClosed}>
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
                                onClick={() => handleUpdateLossEntry(entry.id, { lossType: "shutdown" })}
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
                                onClick={() => handleUpdateLossEntry(entry.id, { lossType: "slowdown" })}
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
                                  // Duration is stored in operating hours, so
                                  // one "day" = one operating day (bar ÷ hourly rate).
                                  handleUpdateLossEntry(entry.id, {
                                    amount: Math.round(inProdUnits * 100) / 100,
                                    durationHours:
                                      unit === "hours"
                                        ? raw
                                        : unit === "days"
                                          ? raw * operatingHours
                                          : null,
                                  });
                                }}
                                disabled={isClosed}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    commentsRefs.current.get(entry.id)?.focus();
                                  }
                                }}
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

                          {/* Assign all remaining */}
                          {!isClosed && remaining > 0.01 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-[10px] font-medium text-muted-foreground shrink-0"
                                  onClick={() => {
                                    const otherTotal = lossEntries
                                      .filter((e) => e.id !== entry.id)
                                      .reduce((sum, e) => sum + (e.amount ?? 0), 0);
                                    const assignAmount = Math.round((absDelta - otherTotal) * 100) / 100;
                                    if (assignAmount > 0) {
                                      handleUpdateLossEntry(entry.id, {
                                        amount: assignAmount,
                                        durationHours:
                                          unit === "hours" || unit === "days"
                                            ? fromProductionUnits(assignAmount, "hours")
                                            : null,
                                      });
                                    }
                                  }}
                                >
                                  = All
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p>Assign all remaining ({remaining.toLocaleString()} {productionUnit})</p>
                              </TooltipContent>
                            </Tooltip>
                          )}

                          {/* Comments — Enter adds the next entry row */}
                          <Input
                            placeholder="Notes... (Enter for next entry)"
                            className="flex-1 min-w-0"
                            style={{ height: '1.75rem', fontSize: '0.75rem', lineHeight: '1rem' }}
                            value={entry.comments ?? ""}
                            ref={(el: HTMLInputElement | null) => {
                              if (el) commentsRefs.current.set(entry.id, el);
                              else commentsRefs.current.delete(entry.id);
                            }}
                            onChange={(e) => handleUpdateLossEntry(entry.id, { comments: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !isClosed) {
                                e.preventDefault();
                                handleAddLossEntry();
                              }
                            }}
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
                <div className="flex items-center justify-end gap-1.5">
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
      <ConfirmDialog state={confirmState} onOpenChange={closeConfirm} />
    </div>
  );
}
