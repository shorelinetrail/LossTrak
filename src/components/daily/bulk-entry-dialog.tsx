"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { format, eachDayOfInterval } from "date-fns";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import {
  createDailyLog,
  updateDailyLog,
  createLossEntry,
} from "@/lib/store";
import type {
  LossCategory,
  LossSubcategory,
  DailyLog,
  LossType,
} from "@/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, Trash2, AlertTriangle, ArrowLeft } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────

interface BulkLossRow {
  categoryId: string;
  subcategoryId: string;
  lossType: LossType;
  amount: string;
  comments: string;
}

interface BulkDayRow {
  date: string; // YYYY-MM-DD
  production: string;
  comments: string;
  existingLog: DailyLog | null;
  losses: BulkLossRow[];
}

interface BulkEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  plantId: string;
  bar: number;
  productionUnit: string;
  categories: LossCategory[];
  subcategories: LossSubcategory[];
  existingLogs: DailyLog[];
}

// ─── Component ──────────────────────────────────────────────────

export function BulkEntryDialog({
  open,
  onOpenChange,
  onSaved,
  plantId,
  bar,
  productionUnit,
  categories,
  subcategories,
  existingLogs,
}: BulkEntryDialogProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [rows, setRows] = useState<BulkDayRow[]>([]);
  const [conflictMode, setConflictMode] = useState<"skip" | "overwrite">("skip");
  const [sameProduction, setSameProduction] = useState(false);
  const [sameLosses, setSameLosses] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  const existingCount = rows.filter((r) => r.existingLog).length;

  // Pre-index existing logs by date
  const existingMap = useMemo(
    () => new Map(existingLogs.map((l) => [l.date, l])),
    [existingLogs]
  );

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setStep(1);
      setDateRange(undefined);
      setRows([]);
      setConflictMode("skip");
      setSameProduction(false);
      setSameLosses(false);
      setSaving(false);
      setSavedCount(0);
    }
  }, [open]);

  // ── Step 1 → Step 2 transition (synchronous — no DB call) ───

  const handleContinue = useCallback(() => {
    if (!dateRange?.from || !dateRange?.to) return;

    const days = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
    if (days.length > 31) {
      toast.error("Please select 31 days or fewer.");
      return;
    }

    setRows(
      days.map((d) => {
        const dateStr = format(d, "yyyy-MM-dd");
        const existing = existingMap.get(dateStr) ?? null;
        return {
          date: dateStr,
          production: existing ? String(existing.production) : "",
          comments: existing ? existing.comments : "",
          existingLog: existing,
          losses: [],
        };
      })
    );
    setStep(2);
  }, [dateRange, existingMap]);

  // ── Row update helpers ────────────────────────────────────────

  const updateRow = useCallback(
    (index: number, patch: Partial<BulkDayRow>) => {
      setRows((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], ...patch };

        // Replicate from row 0 based on toggles
        if (index === 0) {
          const source = next[0];
          for (let i = 1; i < next.length; i++) {
            if (sameProduction && (patch.production !== undefined || patch.comments !== undefined)) {
              next[i] = {
                ...next[i],
                production: source.production,
                comments: source.comments,
              };
            }
            if (sameLosses && patch.losses !== undefined) {
              next[i] = {
                ...next[i],
                losses: source.losses.map((l) => ({ ...l })),
              };
            }
          }
        }
        return next;
      });
    },
    [sameProduction, sameLosses]
  );

  const addLoss = useCallback(
    (rowIndex: number) => {
      const newLoss: BulkLossRow = {
        categoryId: "",
        subcategoryId: "",
        lossType: "shutdown",
        amount: "",
        comments: "",
      };
      updateRow(rowIndex, {
        losses: [...(rows[rowIndex]?.losses ?? []), newLoss],
      });
    },
    [rows, updateRow]
  );

  const updateLoss = useCallback(
    (rowIndex: number, lossIndex: number, patch: Partial<BulkLossRow>) => {
      const currentLosses = [...(rows[rowIndex]?.losses ?? [])];
      currentLosses[lossIndex] = { ...currentLosses[lossIndex], ...patch };

      // Reset subcategory if category changed
      if (patch.categoryId !== undefined) {
        currentLosses[lossIndex].subcategoryId = "";
      }

      updateRow(rowIndex, { losses: currentLosses });
    },
    [rows, updateRow]
  );

  const removeLoss = useCallback(
    (rowIndex: number, lossIndex: number) => {
      const currentLosses = [...(rows[rowIndex]?.losses ?? [])];
      currentLosses.splice(lossIndex, 1);
      updateRow(rowIndex, { losses: currentLosses });
    },
    [rows, updateRow]
  );

  // ── Toggle handlers ───────────────────────────────────────────

  const handleSameProductionChange = useCallback(
    (checked: boolean) => {
      setSameProduction(checked);
      if (checked && rows.length > 1) {
        setRows((prev) => {
          const source = prev[0];
          return prev.map((row, i) =>
            i === 0
              ? row
              : { ...row, production: source.production, comments: source.comments }
          );
        });
      }
    },
    [rows.length]
  );

  const handleSameLossesChange = useCallback(
    (checked: boolean) => {
      setSameLosses(checked);
      if (checked && rows.length > 1) {
        setRows((prev) => {
          const source = prev[0];
          return prev.map((row, i) =>
            i === 0
              ? row
              : { ...row, losses: source.losses.map((l) => ({ ...l })) }
          );
        });
      }
    },
    [rows.length]
  );

  // ── Save ──────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    for (const row of rows) {
      if (row.existingLog && conflictMode === "skip") continue;
      const prod = parseFloat(row.production);
      if (isNaN(prod) || prod < 0) {
        toast.error(`Invalid production for ${format(new Date(row.date + "T00:00:00"), "MMM d")}.`);
        return;
      }
    }

    setSaving(true);
    setSavedCount(0);
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let lossCount = 0;

    // Each day saves independently so one failure doesn't abort the rest;
    // failed dates are reported explicitly at the end.
    const failedDates: string[] = [];

    for (const row of rows) {
      const prod = parseFloat(row.production);

      if (row.existingLog && conflictMode === "skip") {
        skipped++;
        setSavedCount((c) => c + 1);
        continue;
      }

      try {
        let dailyLogId: string;

        if (row.existingLog) {
          await updateDailyLog(row.date, {
            production: prod,
            comments: row.comments,
          });
          dailyLogId = row.existingLog.id;
          updated++;
        } else {
          const log = await createDailyLog({
            plantId,
            date: row.date,
            production: prod,
            bar,
            comments: row.comments,
            status: "open",
          });
          dailyLogId = log.id;
          created++;
        }

        for (const loss of row.losses) {
          const amt = parseFloat(loss.amount);
          if (!loss.categoryId || !loss.subcategoryId || isNaN(amt) || amt <= 0)
            continue;
          await createLossEntry({
            dailyLogId,
            plantId,
            date: row.date,
            categoryId: loss.categoryId,
            subcategoryId: loss.subcategoryId,
            detailCodeId: "",
            lossType: loss.lossType,
            amount: amt,
            comments: loss.comments,
          });
          lossCount++;
        }
      } catch (err) {
        console.error(`Bulk save error for ${row.date}:`, err);
        failedDates.push(row.date);
      }

      setSavedCount((c) => c + 1);
    }

    const parts: string[] = [];
    if (created) parts.push(`${created} day${created > 1 ? "s" : ""} created`);
    if (updated) parts.push(`${updated} updated`);
    if (skipped) parts.push(`${skipped} skipped`);
    if (lossCount) parts.push(`${lossCount} loss entr${lossCount > 1 ? "ies" : "y"}`);

    if (failedDates.length > 0) {
      toast.error(
        `Failed to save ${failedDates.length} day${failedDates.length > 1 ? "s" : ""}: ${failedDates
          .map((d) => format(new Date(d + "T00:00:00"), "MMM d"))
          .join(", ")}. ${parts.length > 0 ? `Saved: ${parts.join(", ")}.` : ""}`,
        { duration: 10000 }
      );
      onSaved();
    } else {
      toast.success(parts.join(", ") || "No changes made.");
      onSaved();
      onOpenChange(false);
    }
    setSaving(false);
  }, [rows, conflictMode, bar, plantId, onSaved, onOpenChange]);

  // ── Date range summary ────────────────────────────────────────

  const rangeSummary =
    dateRange?.from && dateRange?.to
      ? `${format(dateRange.from, "MMM d")} – ${format(dateRange.to, "MMM d, yyyy")} (${eachDayOfInterval({ start: dateRange.from, end: dateRange.to }).length} days)`
      : null;

  // ── Render ────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] !flex !flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-base">Bulk Entry</DialogTitle>
          <DialogDescription className="text-xs">
            {step === 1
              ? "Select a date range to enter production and losses."
              : `Entering data for ${rows.length} day${rows.length > 1 ? "s" : ""}.`}
          </DialogDescription>
        </DialogHeader>

        {/* ── Step 1: Date Range ─────────────────────────── */}
        {step === 1 && (
          <>
            <div className="flex flex-col items-center gap-3 py-2">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={2}
                initialFocus
              />
              {rangeSummary && (
                <p className="text-sm text-muted-foreground">{rangeSummary}</p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!dateRange?.from || !dateRange?.to}
                onClick={handleContinue}
              >
                Continue
              </Button>
            </DialogFooter>
          </>
        )}

        {/* ── Step 2: Day Entry Grid ─────────────────────── */}
        {step === 2 && (
          <div className="flex flex-col min-h-0 flex-1 gap-3">
            {/* Controls bar */}
            <div className="flex items-center gap-3 flex-wrap text-xs border-b pb-2">
              <button
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setStep(1)}
              >
                <ArrowLeft className="h-3 w-3" />
                Back
              </button>

              <div className="flex items-center gap-2">
                <Switch
                  id="same-prod"
                  size="sm"
                  checked={sameProduction}
                  onCheckedChange={handleSameProductionChange}
                />
                <Label htmlFor="same-prod" className="text-xs cursor-pointer">
                  Same production
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="same-losses"
                  size="sm"
                  checked={sameLosses}
                  onCheckedChange={handleSameLossesChange}
                />
                <Label htmlFor="same-losses" className="text-xs cursor-pointer">
                  Same losses
                </Label>
              </div>

              {existingCount > 0 && (
                <div className="flex items-center gap-2 ml-auto">
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                  <span className="text-muted-foreground">
                    {existingCount} existing day{existingCount > 1 ? "s" : ""}:
                  </span>
                  <select
                    className="text-xs border rounded px-1.5 py-0.5 bg-background"
                    value={conflictMode}
                    onChange={(e) =>
                      setConflictMode(e.target.value as "skip" | "overwrite")
                    }
                  >
                    <option value="skip">Skip</option>
                    <option value="overwrite">Overwrite</option>
                  </select>
                </div>
              )}
            </div>

            {/* Scrollable day rows */}
            <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
              <div className="space-y-3 py-1">
                {rows.map((row, ri) => {
                  const prodDisabled = sameProduction && ri > 0;
                  const lossDisabled = sameLosses && ri > 0;
                  const isSkipped =
                    row.existingLog !== null && conflictMode === "skip";

                  return (
                    <div
                      key={row.date}
                      className={`rounded-md border p-2.5 space-y-2 ${
                        isSkipped
                          ? "opacity-40 pointer-events-none"
                          : ""
                      }`}
                    >
                      {/* Day header row */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium w-[80px] shrink-0">
                          {format(new Date(row.date + "T00:00:00"), "EEE, MMM d")}
                        </span>
                        {row.existingLog && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-300"
                          >
                            Existing
                          </Badge>
                        )}
                        <div className="flex items-center gap-1.5 flex-1 min-w-0">
                          <Label className="text-[10px] text-muted-foreground shrink-0">
                            Production
                          </Label>
                          <Input
                            type="number"
                            placeholder={productionUnit}
                            className={`h-7 text-xs w-[110px] ${prodDisabled ? "opacity-60" : ""}`}
                            value={row.production}
                            onChange={(e) =>
                              updateRow(
                                sameProduction ? 0 : ri,
                                { production: e.target.value }
                              )
                            }
                            disabled={prodDisabled || isSkipped}
                          />
                          <Label className="text-[10px] text-muted-foreground shrink-0">
                            Notes
                          </Label>
                          <Input
                            placeholder="Comments..."
                            className={`h-7 text-xs flex-1 min-w-0 ${prodDisabled ? "opacity-60" : ""}`}
                            value={row.comments}
                            onChange={(e) =>
                              updateRow(
                                sameProduction ? 0 : ri,
                                { comments: e.target.value }
                              )
                            }
                            disabled={prodDisabled || isSkipped}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`h-7 px-1.5 text-xs shrink-0 ${lossDisabled ? "opacity-60" : ""}`}
                            onClick={() => addLoss(sameLosses ? 0 : ri)}
                            disabled={lossDisabled || isSkipped}
                          >
                            <Plus className="h-3 w-3 mr-0.5" />
                            Loss
                          </Button>
                        </div>
                      </div>

                      {/* Loss entry rows */}
                      {row.losses.map((loss, li) => {
                        const cat = categories.find(
                          (c) => c.id === loss.categoryId
                        );
                        const filteredSubs = subcategories.filter(
                          (s) => s.categoryId === loss.categoryId && s.isActive
                        );
                        const allowedTypes = cat?.allowedLossTypes ?? [
                          "shutdown",
                          "slowdown",
                        ];

                        return (
                          <div
                            key={li}
                            className={`flex items-center gap-1.5 pl-[80px] flex-wrap ${lossDisabled ? "opacity-60" : ""}`}
                          >
                            {/* Category */}
                            <Select
                              value={loss.categoryId}
                              onValueChange={(v) =>
                                updateLoss(sameLosses ? 0 : ri, li, {
                                  categoryId: v,
                                })
                              }
                              disabled={lossDisabled || isSkipped}
                            >
                              <SelectTrigger className="!h-7 text-xs w-[130px]">
                                <SelectValue placeholder="Category" />
                              </SelectTrigger>
                              <SelectContent>
                                {categories
                                  .filter((c) => c.isActive)
                                  .map((c) => (
                                    <SelectItem
                                      key={c.id}
                                      value={c.id}
                                      className="text-xs"
                                    >
                                      {c.name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>

                            {/* Subcategory */}
                            <Select
                              value={loss.subcategoryId}
                              onValueChange={(v) =>
                                updateLoss(sameLosses ? 0 : ri, li, {
                                  subcategoryId: v,
                                })
                              }
                              disabled={
                                !loss.categoryId || lossDisabled || isSkipped
                              }
                            >
                              <SelectTrigger className="!h-7 text-xs w-[130px]">
                                <SelectValue placeholder="Subcategory" />
                              </SelectTrigger>
                              <SelectContent>
                                {filteredSubs.map((s) => (
                                  <SelectItem
                                    key={s.id}
                                    value={s.id}
                                    className="text-xs"
                                  >
                                    {s.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            {/* Loss type */}
                            <div className="flex h-7">
                              {(["shutdown", "slowdown"] as const).map(
                                (lt) => (
                                  <Button
                                    key={lt}
                                    variant={
                                      loss.lossType === lt
                                        ? "default"
                                        : "outline"
                                    }
                                    size="sm"
                                    className={`h-7 px-2 text-[10px] ${
                                      lt === "shutdown"
                                        ? "rounded-r-none"
                                        : "rounded-l-none border-l-0"
                                    }`}
                                    onClick={() =>
                                      updateLoss(sameLosses ? 0 : ri, li, {
                                        lossType: lt,
                                      })
                                    }
                                    disabled={
                                      !allowedTypes.includes(lt) ||
                                      lossDisabled ||
                                      isSkipped
                                    }
                                  >
                                    {lt === "shutdown" ? "SD" : "SL"}
                                  </Button>
                                )
                              )}
                            </div>

                            {/* Amount */}
                            <Input
                              type="number"
                              placeholder={productionUnit}
                              className="h-7 text-xs w-[90px]"
                              value={loss.amount}
                              onChange={(e) =>
                                updateLoss(sameLosses ? 0 : ri, li, {
                                  amount: e.target.value,
                                })
                              }
                              disabled={lossDisabled || isSkipped}
                            />

                            {/* Assign all remaining */}
                            {(() => {
                              const prod = parseFloat(row.production) || 0;
                              const delta = bar - prod;
                              const otherTotal = row.losses
                                .filter((_, idx) => idx !== li)
                                .reduce((sum, l) => sum + (parseFloat(l.amount) || 0), 0);
                              const remaining = Math.round((delta - otherTotal) * 100) / 100;
                              return !isSkipped && !lossDisabled && remaining > 0.01 ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 px-2 text-[10px] font-medium text-muted-foreground shrink-0"
                                      onClick={() =>
                                        updateLoss(sameLosses ? 0 : ri, li, {
                                          amount: String(remaining),
                                        })
                                      }
                                    >
                                      = All
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <p>Assign all remaining ({remaining.toLocaleString()} {productionUnit})</p>
                                  </TooltipContent>
                                </Tooltip>
                              ) : null;
                            })()}

                            {/* Remove */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive shrink-0"
                              onClick={() =>
                                removeLoss(sameLosses ? 0 : ri, li)
                              }
                              disabled={lossDisabled || isSkipped}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <DialogFooter className="border-t pt-3">
              {saving && (
                <span className="text-xs text-muted-foreground mr-auto">
                  Saving {savedCount} of {rows.length}...
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
