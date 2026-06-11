"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import {
  getCategories,
  getDailyLogsByDateRange,
  getLossEntriesByDateRange,
  getProductionUnit,
  getSubcategories,
} from "@/lib/store";
import { DailyLog, LossCategory, LossEntry, LossSubcategory } from "@/types";

export interface ReportData {
  logs: DailyLog[];
  entries: LossEntry[];
  categories: LossCategory[];
  subcategories: LossSubcategory[];
  productionUnit: string;
  loading: boolean;
  error: string | null;
}

/**
 * Loads everything a report needs for a plant + date range.
 * Reference data (categories, unit) is fetched once per plant;
 * logs and entries re-fetch when the range changes.
 */
export function useReportData(
  plantId: string | null,
  rangeStart: Date,
  rangeEnd: Date
): ReportData {
  const [categories, setCategories] = useState<LossCategory[]>([]);
  const [subcategories, setSubcategories] = useState<LossSubcategory[]>([]);
  const [productionUnit, setProductionUnit] = useState<string>("tonnes");
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [entries, setEntries] = useState<LossEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!plantId) return;
    let cancelled = false;
    (async () => {
      try {
        const [unit, cats, subs] = await Promise.all([
          getProductionUnit(plantId),
          getCategories(),
          getSubcategories(plantId),
        ]);
        if (cancelled) return;
        if (unit) setProductionUnit(unit);
        setCategories(cats);
        setSubcategories(subs);
      } catch (err) {
        console.error("Failed to load report reference data:", err);
        if (!cancelled) setError("Failed to load categories.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plantId]);

  const startStr = format(rangeStart, "yyyy-MM-dd");
  const endStr = format(rangeEnd, "yyyy-MM-dd");

  useEffect(() => {
    if (!plantId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [rangeLogs, rangeEntries] = await Promise.all([
          getDailyLogsByDateRange(plantId, startStr, endStr),
          getLossEntriesByDateRange(plantId, startStr, endStr),
        ]);
        if (cancelled) return;
        setLogs(rangeLogs);
        setEntries(rangeEntries);
        setError(null);
      } catch (err) {
        console.error("Failed to load report data:", err);
        if (!cancelled) setError("Failed to load report data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plantId, startStr, endStr]);

  return { logs, entries, categories, subcategories, productionUnit, loading, error };
}
