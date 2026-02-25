"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getBarRate,
  getProductionUnit,
  getCategories,
  getSubcategories,
  getDetailCodes,
  getDailyLog,
  createDailyLog,
  updateDailyLog,
  getLossEntries,
  createLossEntry,
  updateLossEntry,
  deleteLossEntry,
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
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Lock,
  Unlock,
} from "lucide-react";
import { format, parseISO, addDays, subDays, isToday } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LossContextPanel } from "@/components/daily/loss-context-panel";

export default function DailyPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);

  const [bar, setBar] = useState<number>(0);
  const [productionUnit, setProductionUnit] = useState<string>("units");
  const [categories, setCategories] = useState<LossCategory[]>([]);
  const [subcategories, setSubcategories] = useState<LossSubcategory[]>([]);
  const [detailCodes, setDetailCodes] = useState<LossDetailCode[]>([]);

  const [dailyLog, setDailyLog] = useState<DailyLog | null>(null);
  const [lossEntries, setLossEntries] = useState<LossEntry[]>([]);
  const [recentHistory, setRecentHistory] = useState<DaySnapshot[]>([]);

  const [productionInput, setProductionInput] = useState<string>("");
  const [dayComments, setDayComments] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  const dateKey = useMemo(
    () => format(selectedDate, "yyyy-MM-dd"),
    [selectedDate]
  );

  const isClosed = dailyLog?.status === "closed";

  // Load config data on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const [barVal, unit, cats, subs, codes] = await Promise.all([
          getBarRate(),
          getProductionUnit(),
          getCategories(),
          getSubcategories(),
          getDetailCodes(),
        ]);
        setBar(barVal);
        setProductionUnit(unit);
        setCategories(cats);
        setSubcategories(subs);
        setDetailCodes(codes);
      } catch {
        toast.error("Failed to load configuration data.");
      }
    };
    loadConfig();
  }, []);

  // Load daily log, entries, and recent history when date changes
  useEffect(() => {
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
        // Load recent history (30 days before selected date, panel slices locally)
        const history = getRecentHistory(dateKey, 30);
        setRecentHistory(history);
      } catch {
        toast.error("Failed to load daily data.");
      } finally {
        setLoading(false);
      }
    };
    loadDailyData();
  }, [dateKey]);

  // Computed values
  const production = dailyLog?.production ?? 0;
  const delta = bar - production; // positive = loss day, negative = gain day
  const isGainDay = delta < 0;
  const absDelta = Math.abs(delta);
  const totalAccounted = useMemo(
    () => lossEntries.reduce((sum, e) => sum + (e.amount ?? 0), 0),
    [lossEntries]
  );
  const remaining = Math.round((absDelta - totalAccounted) * 100) / 100;
  const isBalanced = Math.abs(remaining) < 0.01;

  // Start accounting for a new day
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
    } catch {
      toast.error("Failed to create daily log.");
    } finally {
      setSaving(false);
    }
  }, [productionInput, dateKey, bar]);

  // Update production total
  const handleUpdateProduction = useCallback(
    async (value: string) => {
      setProductionInput(value);
      const prod = parseFloat(value);
      if (!dailyLog || isNaN(prod) || prod < 0) return;
      try {
        const updated = await updateDailyLog(dateKey, { production: prod });
        setDailyLog(updated);
      } catch {
        toast.error("Failed to update production.");
      }
    },
    [dailyLog, dateKey]
  );

  // Update day comments
  const handleDayCommentsChange = useCallback(
    async (value: string) => {
      setDayComments(value);
      if (!dailyLog) return;
      try {
        await updateDailyLog(dateKey, { comments: value });
      } catch {
        // Silently handle - auto-save
      }
    },
    [dailyLog, dateKey]
  );

  // Add a new loss entry
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
    } catch {
      toast.error("Failed to add loss entry.");
    }
  }, [dailyLog, dateKey]);

  // Update a loss entry field
  const handleUpdateLossEntry = useCallback(
    async (entryId: string, field: string, value: string | number) => {
      setLossEntries((prev) =>
        prev.map((e) => {
          if (e.id !== entryId) return e;
          const updated = { ...e, [field]: value };
          // Reset subcategory and detail code when category changes
          if (field === "categoryId") {
            updated.subcategoryId = "";
            updated.detailCodeId = "";
          }
          // Reset detail code when subcategory changes
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
      } catch {
        toast.error("Failed to save loss entry.");
      }
    },
    []
  );

  // Delete a loss entry
  const handleDeleteLossEntry = useCallback(async (entryId: string) => {
    try {
      await deleteLossEntry(entryId);
      setLossEntries((prev) => prev.filter((e) => e.id !== entryId));
      toast.success("Loss entry removed.");
    } catch {
      toast.error("Failed to delete loss entry.");
    }
  }, []);

  // Close the day
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
    } catch {
      toast.error("Failed to close day.");
    } finally {
      setSaving(false);
    }
  }, [dailyLog, isBalanced, dateKey, dayComments]);

  // Reopen a closed day for editing
  const handleReopenDay = useCallback(async () => {
    if (!dailyLog || dailyLog.status !== "closed") return;
    try {
      setSaving(true);
      const updated = await updateDailyLog(dateKey, { status: "open" });
      setDailyLog(updated);
      toast.success("Day reopened for editing.");
    } catch {
      toast.error("Failed to reopen day.");
    } finally {
      setSaving(false);
    }
  }, [dailyLog, dateKey]);

  // Carry forward entries from a previous day (copies structure, zeroes amounts)
  const handleCarryForward = useCallback(
    async (previousEntries: LossEntry[]) => {
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
            amount: 0, // zero - engineer fills in today's values
            comments: prev.comments,
          });
          newEntries.push(entry);
        }
        setLossEntries((existing) => [...existing, ...newEntries]);
        toast.success(
          `Carried forward ${newEntries.length} loss ${newEntries.length === 1 ? "entry" : "entries"} from previous day. Adjust amounts for today.`
        );
      } catch {
        toast.error("Failed to carry forward entries.");
      }
    },
    [dailyLog, isClosed, dateKey]
  );

  // Get subcategories for a given category
  const getSubcategoriesForCategory = useCallback(
    (categoryId: string): LossSubcategory[] => {
      return subcategories.filter((s) => s.categoryId === categoryId);
    },
    [subcategories]
  );

  // Get detail codes for a given subcategory
  const getDetailCodesForSubcategory = useCallback(
    (subcategoryId: string): LossDetailCode[] => {
      return detailCodes.filter((d) => d.subcategoryId === subcategoryId);
    },
    [detailCodes]
  );

  // Get allowed loss types for a category
  const getAllowedLossTypes = useCallback(
    (categoryId: string): LossType[] => {
      const category = categories.find((c) => c.id === categoryId);
      if (!category) return ["shutdown", "slowdown"] as LossType[];
      return (category.allowedLossTypes ?? ["shutdown", "slowdown"]) as LossType[];
    },
    [categories]
  );

  // Handle date selection
  const handleDateSelect = useCallback((date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      setCalendarOpen(false);
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-muted-foreground text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl py-4 px-4 space-y-3">
      {/* Header with Date Picker */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">
          Daily Loss Accounting
        </h1>
        <div className="flex items-center gap-1">
          {isClosed && (
            <Badge variant="secondary" className="gap-1 mr-1">
              <Lock className="h-3 w-3" />
              Closed
            </Badge>
          )}
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

      {/* No daily log yet - show initial form */}
      {!dailyLog && (
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

      {/* Daily log exists - show full interface */}
      {dailyLog && (
        <>
          {/* KPI Summary Cards - sticky so always visible */}
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
          </div>

          {/* Loss Context Panel - recent history for reference */}
          <LossContextPanel
            history={recentHistory}
            categories={categories}
            subcategories={subcategories}
            productionUnit={productionUnit}
            todayDelta={delta}
            onCarryForward={handleCarryForward}
            disabled={isClosed || !dailyLog}
          />

          {/* Production Edit (when not closed) */}
          {!isClosed && (
            <Card>
              <CardContent>
                <div className="flex items-center gap-3">
                  <div className="flex-1 max-w-xs space-y-1">
                    <Label htmlFor="production-edit" className="text-xs">
                      Production ({productionUnit})
                    </Label>
                    <Input
                      id="production-edit"
                      type="number"
                      min="0"
                      step="any"
                      value={productionInput}
                      onChange={(e) => handleUpdateProduction(e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Loss / Gain Entries */}
          <Card>
            <CardContent>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">
                  {isGainDay ? "Gain" : "Loss"} Entries ({lossEntries.length})
                </span>
                {!isClosed && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={handleAddLossEntry}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add {isGainDay ? "Gain" : "Loss"}
                  </Button>
                )}
              </div>
              <div className="space-y-3">
              {lossEntries.length === 0 && (
                <div className="text-center py-4 text-muted-foreground">
                  <p>No {isGainDay ? "gain" : "loss"} entries yet.</p>
                  {!isClosed && (
                    <p className="text-sm mt-1">
                      Click &quot;Add {isGainDay ? "Gain" : "Loss"}&quot; to start accounting for the
                      {isGainDay ? " gain" : " delta"}.
                    </p>
                  )}
                </div>
              )}

              {lossEntries.map((entry, index) => {
                const filteredSubcategories = getSubcategoriesForCategory(
                  entry.categoryId
                );
                const filteredDetailCodes = entry.subcategoryId
                  ? getDetailCodesForSubcategory(entry.subcategoryId)
                  : [];
                const allowedTypes = getAllowedLossTypes(entry.categoryId);
                const hasDetailCodes = filteredDetailCodes.length > 0;

                return (
                  <div
                    key={entry.id}
                    className={cn(
                      "p-3 rounded-lg border bg-card space-y-2",
                      isClosed && "opacity-80"
                    )}
                  >
                    {/* Row number (mobile) */}
                    <div className="md:hidden flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        Entry #{index + 1}
                      </span>
                      {!isClosed && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteLossEntry(entry.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                      {/* Category */}
                      <div className="md:col-span-3 space-y-1">
                        <Label className="text-xs">Category</Label>
                        <Select
                          value={entry.categoryId}
                          onValueChange={(v) =>
                            handleUpdateLossEntry(entry.id, "categoryId", v)
                          }
                          disabled={isClosed}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.map((cat) => (
                              <SelectItem key={cat.id} value={cat.id}>
                                {cat.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Subcategory */}
                      <div className="md:col-span-3 space-y-1">
                        <Label className="text-xs">Subcategory</Label>
                        <Select
                          value={entry.subcategoryId}
                          onValueChange={(v) =>
                            handleUpdateLossEntry(entry.id, "subcategoryId", v)
                          }
                          disabled={isClosed || !entry.categoryId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select subcategory" />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredSubcategories.map((sub) => (
                              <SelectItem key={sub.id} value={sub.id}>
                                {sub.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Loss Type */}
                      <div className="md:col-span-2 space-y-1">
                        <Label className="text-xs">Loss Type</Label>
                        <Select
                          value={entry.lossType}
                          onValueChange={(v) =>
                            handleUpdateLossEntry(entry.id, "lossType", v)
                          }
                          disabled={isClosed}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Type" />
                          </SelectTrigger>
                          <SelectContent>
                            {allowedTypes.map((type) => (
                              <SelectItem key={type} value={type}>
                                {type.charAt(0).toUpperCase() + type.slice(1)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Amount */}
                      <div className="md:col-span-1 space-y-1">
                        <Label className="text-xs">
                          Amount
                        </Label>
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          placeholder="0"
                          value={entry.amount || ""}
                          onChange={(e) =>
                            handleUpdateLossEntry(
                              entry.id,
                              "amount",
                              parseFloat(e.target.value) || 0
                            )
                          }
                          disabled={isClosed}
                        />
                      </div>

                      {/* Comments */}
                      <div className="md:col-span-2 space-y-1">
                        <Label className="text-xs">Comments</Label>
                        <Input
                          placeholder="Notes..."
                          value={entry.comments ?? ""}
                          onChange={(e) =>
                            handleUpdateLossEntry(
                              entry.id,
                              "comments",
                              e.target.value
                            )
                          }
                          disabled={isClosed}
                        />
                      </div>

                      {/* Delete button (desktop) */}
                      <div className="hidden md:flex md:col-span-1 items-end justify-center pb-0.5">
                        {!isClosed && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDeleteLossEntry(entry.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Detail Code - only shown when subcategory has detail codes configured */}
                    {hasDetailCodes && (
                      <div className="md:ml-[calc(50%+0.25rem)] md:max-w-[calc(50%-0.5rem)]">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Detail Code</Label>
                          <Select
                            value={entry.detailCodeId || ""}
                            onValueChange={(v) =>
                              handleUpdateLossEntry(entry.id, "detailCodeId", v)
                            }
                            disabled={isClosed}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Select detail (optional)" />
                            </SelectTrigger>
                            <SelectContent>
                              {filteredDetailCodes.map((dc) => (
                                <SelectItem key={dc.id} value={dc.id}>
                                  {dc.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {lossEntries.length > 0 && !isClosed && (
                <div className="flex justify-center pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handleAddLossEntry}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Another Loss
                  </Button>
                </div>
              )}
              </div>
            </CardContent>
          </Card>

          {/* Day Comments */}
          <Card>
            <CardContent>
              <Label className="text-xs text-muted-foreground">Day Comments</Label>
              <Textarea
                placeholder="Overall notes for this day..."
                value={dayComments}
                onChange={(e) => handleDayCommentsChange(e.target.value)}
                disabled={isClosed}
                rows={2}
                className="mt-1"
              />
            </CardContent>
          </Card>

          {/* Close Day Action */}
          {!isClosed && (
            <Card>
              <CardContent>
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
                  <div className="text-center sm:text-left">
                    <p className="text-sm font-medium">
                      {isBalanced
                        ? `All ${isGainDay ? "gains" : "losses"} accounted for. Ready to close.`
                        : `${Math.abs(remaining).toLocaleString()} ${productionUnit} remaining.`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {isBalanced
                        ? "Closing locks all entries from further edits."
                        : `All ${isGainDay ? "gains" : "losses"} must be accounted for first.`}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleCloseDay}
                    disabled={!isBalanced || saving}
                    className={cn(
                      "min-w-[120px]",
                      isBalanced &&
                        "bg-green-600 hover:bg-green-700 text-white"
                    )}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                    Close Day
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Closed Day Banner */}
          {isClosed && (
            <Card className="border-muted bg-muted/30">
              <CardContent>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Lock className="h-4 w-4" />
                    <p className="text-sm font-medium">
                      Day closed — read-only.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handleReopenDay}
                    disabled={saving}
                  >
                    <Unlock className="h-3.5 w-3.5 mr-1" />
                    Reopen
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
