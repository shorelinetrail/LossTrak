"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getBarRate,
  getProductionUnit,
  getCategories,
  getSubcategories,
  getDailyLog,
  createDailyLog,
  getLossEntries,
  createLossEntry,
  updateDailyLog,
} from "@/lib/store";
import { LossCategory, LossSubcategory, LossEntry } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ParsedRow {
  line: number;
  date: string;
  production: number;
  category: string;
  subcategory: string;
  lossType: string;
  amount: number;
  comments: string;
  error?: string;
}

interface ImportResult {
  date: string;
  entriesCreated: number;
  production: number;
  status: "created" | "updated" | "skipped";
  message?: string;
}

const EXAMPLE_CSV = `date,production,category,subcategory,loss_type,amount,comments
2026-02-20,1100,Process,Fouling,slowdown,50,Feed contamination
2026-02-20,1100,Process,Catalyst,shutdown,30,Regeneration cycle
2026-02-20,1100,Maintenance,Equipment Failure,shutdown,20,Pump #4 seal
2026-02-21,1150,Process,Fouling,slowdown,30,Residual from previous day
2026-02-21,1150,External,Feedstock,slowdown,20,Delayed delivery`;

export default function BulkUploadPage() {
  const [csvText, setCsvText] = useState("");
  const [categories, setCategories] = useState<LossCategory[]>([]);
  const [subcategories, setSubcategories] = useState<LossSubcategory[]>([]);
  const [bar, setBar] = useState(0);
  const [productionUnit, setProductionUnit] = useState("units");
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);

  useEffect(() => {
    setCategories(getCategories());
    setSubcategories(getSubcategories());
    setBar(getBarRate());
    setProductionUnit(getProductionUnit());
  }, []);

  // Build lookup maps (case-insensitive)
  const categoryByName = useMemo(() => {
    const m: Record<string, LossCategory> = {};
    categories.forEach((c) => (m[c.name.toLowerCase()] = c));
    return m;
  }, [categories]);

  const subcategoryByName = useMemo(() => {
    const m: Record<string, LossSubcategory> = {};
    subcategories.forEach((s) => {
      const cat = categories.find((c) => c.id === s.categoryId);
      if (cat) {
        m[`${cat.name.toLowerCase()}/${s.name.toLowerCase()}`] = s;
      }
    });
    return m;
  }, [categories, subcategories]);

  // Parse CSV text
  const parsed = useMemo((): ParsedRow[] => {
    if (!csvText.trim()) return [];
    const lines = csvText.trim().split("\n");
    if (lines.length < 2) return [];

    // Skip header row
    const header = lines[0].toLowerCase();
    const hasHeader =
      header.includes("date") ||
      header.includes("production") ||
      header.includes("category");
    const dataLines = hasHeader ? lines.slice(1) : lines;

    return dataLines.map((line, idx) => {
      const lineNum = hasHeader ? idx + 2 : idx + 1;
      const cols = line.split(",").map((c) => c.trim());
      if (cols.length < 6) {
        return {
          line: lineNum,
          date: "",
          production: 0,
          category: "",
          subcategory: "",
          lossType: "",
          amount: 0,
          comments: "",
          error: `Expected at least 6 columns, got ${cols.length}`,
        };
      }

      const [date, prodStr, catName, subName, lossType, amountStr, ...rest] =
        cols;
      const comments = rest.join(",").trim();
      const errors: string[] = [];

      // Validate date
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        errors.push("Invalid date format (expected YYYY-MM-DD)");
      }

      // Validate production
      const production = parseFloat(prodStr);
      if (isNaN(production) || production < 0) {
        errors.push("Invalid production value");
      }

      // Validate category
      const cat = categoryByName[catName.toLowerCase()];
      if (!cat) {
        errors.push(`Unknown category "${catName}"`);
      }

      // Validate subcategory
      const sub =
        subcategoryByName[
          `${catName.toLowerCase()}/${subName.toLowerCase()}`
        ];
      if (!sub && cat) {
        errors.push(`Unknown subcategory "${subName}" for "${catName}"`);
      }

      // Validate loss type
      const normalizedType = lossType.toLowerCase();
      if (normalizedType !== "shutdown" && normalizedType !== "slowdown") {
        errors.push(`Invalid loss type "${lossType}" (expected shutdown or slowdown)`);
      }

      // Validate amount
      const amount = parseFloat(amountStr);
      if (isNaN(amount) || amount < 0) {
        errors.push("Invalid amount");
      }

      return {
        line: lineNum,
        date,
        production,
        category: catName,
        subcategory: subName,
        lossType: normalizedType,
        amount,
        comments,
        error: errors.length > 0 ? errors.join("; ") : undefined,
      };
    });
  }, [csvText, categoryByName, subcategoryByName]);

  const validRows = parsed.filter((r) => !r.error);
  const errorRows = parsed.filter((r) => r.error);

  // Group by date for summary
  const dateGroups = useMemo(() => {
    const groups: Record<string, ParsedRow[]> = {};
    for (const row of validRows) {
      if (!groups[row.date]) groups[row.date] = [];
      groups[row.date].push(row);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [validRows]);

  // Import handler
  const handleImport = useCallback(async () => {
    if (validRows.length === 0) {
      toast.error("No valid rows to import.");
      return;
    }

    setImporting(true);
    const importResults: ImportResult[] = [];

    try {
      for (const [date, rows] of dateGroups) {
        const production = rows[0].production;

        // Check if daily log exists
        let log = getDailyLog(date);
        let status: ImportResult["status"] = "created";

        if (log) {
          // Update production if different
          if (log.production !== production) {
            updateDailyLog(date, { production });
          }
          status = "updated";
        } else {
          // Create daily log
          log = createDailyLog({
            date,
            production,
            bar,
            comments: "",
            status: "open",
          });
        }

        // Get existing entries for this date
        const existingEntries = getLossEntries(date);
        let entriesCreated = 0;

        for (const row of rows) {
          const cat = categoryByName[row.category.toLowerCase()];
          const sub =
            subcategoryByName[
              `${row.category.toLowerCase()}/${row.subcategory.toLowerCase()}`
            ];
          if (!cat || !sub || !log) continue;

          // Check for duplicate (same category, subcategory, amount)
          const isDuplicate = existingEntries.some(
            (e) =>
              e.categoryId === cat.id &&
              e.subcategoryId === sub.id &&
              e.amount === row.amount &&
              e.lossType === row.lossType
          );

          if (isDuplicate) continue;

          createLossEntry({
            dailyLogId: log.id,
            date,
            categoryId: cat.id,
            subcategoryId: sub.id,
            lossType: row.lossType as "shutdown" | "slowdown",
            amount: row.amount,
            comments: row.comments,
          });
          entriesCreated++;
        }

        importResults.push({
          date,
          entriesCreated,
          production,
          status,
          message:
            entriesCreated === 0
              ? "All entries already exist (skipped duplicates)"
              : undefined,
        });
      }

      setResults(importResults);
      const totalEntries = importResults.reduce(
        (s, r) => s + r.entriesCreated,
        0
      );
      toast.success(
        `Imported ${totalEntries} entries across ${importResults.length} days.`
      );
    } catch {
      toast.error("Import failed. Check the data and try again.");
    } finally {
      setImporting(false);
    }
  }, [validRows, dateGroups, bar, categoryByName, subcategoryByName]);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result;
        if (typeof text === "string") {
          setCsvText(text);
          setResults(null);
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    []
  );

  return (
    <div className="container mx-auto max-w-5xl py-6 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bulk Upload</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Import production data and loss entries for multiple days at once
        </p>
      </div>

      <Separator />

      {/* Format Guide */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">CSV Format</CardTitle>
          <CardDescription>
            Each row represents one loss entry. Rows with the same date share
            the same daily production total. Categories and subcategories must
            match existing names (case-insensitive).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md bg-muted/50 p-3 text-xs font-mono overflow-x-auto whitespace-pre">
            {EXAMPLE_CSV}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>
              <strong>Categories:</strong>{" "}
              {categories.map((c) => c.name).join(", ")}
            </span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            <strong>BAR:</strong> {bar.toLocaleString()} {productionUnit}
          </div>
        </CardContent>
      </Card>

      {/* Input */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Paste or Upload CSV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Paste CSV data here..."
            rows={10}
            className="font-mono text-xs"
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              setResults(null);
            }}
          />
          <div className="flex items-center gap-3">
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".csv,.txt"
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button variant="outline" size="sm" asChild>
                <span>
                  <FileSpreadsheet className="h-4 w-4 mr-1" />
                  Upload CSV File
                </span>
              </Button>
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCsvText(EXAMPLE_CSV);
                setResults(null);
              }}
            >
              Load Example
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Validation */}
      {parsed.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Validation</CardTitle>
              <div className="flex items-center gap-2">
                {validRows.length > 0 && (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                    {validRows.length} valid
                  </Badge>
                )}
                {errorRows.length > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errorRows.length} errors
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Error rows */}
            {errorRows.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-destructive">
                  Rows with errors (will be skipped):
                </p>
                {errorRows.map((row) => (
                  <div
                    key={row.line}
                    className="text-xs rounded border border-destructive/30 bg-destructive/5 px-3 py-1.5"
                  >
                    <span className="font-medium">Line {row.line}:</span>{" "}
                    {row.error}
                  </div>
                ))}
              </div>
            )}

            {/* Date summary */}
            {dateGroups.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Summary by date:
                </p>
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs h-8">Date</TableHead>
                        <TableHead className="text-xs h-8">
                          Production
                        </TableHead>
                        <TableHead className="text-xs h-8">Entries</TableHead>
                        <TableHead className="text-xs h-8">
                          Total Amount
                        </TableHead>
                        <TableHead className="text-xs h-8">Delta</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dateGroups.map(([date, rows]) => {
                        const prod = rows[0].production;
                        const totalAmount = rows.reduce(
                          (s, r) => s + r.amount,
                          0
                        );
                        const delta = bar - prod;
                        const isBalanced =
                          Math.abs(Math.abs(delta) - totalAmount) < 0.01;
                        return (
                          <TableRow key={date}>
                            <TableCell className="text-xs py-1.5 font-medium">
                              {date}
                            </TableCell>
                            <TableCell className="text-xs py-1.5 tabular-nums">
                              {prod.toLocaleString()} {productionUnit}
                            </TableCell>
                            <TableCell className="text-xs py-1.5">
                              {rows.length}
                            </TableCell>
                            <TableCell className="text-xs py-1.5 tabular-nums">
                              {totalAmount.toLocaleString()} {productionUnit}
                            </TableCell>
                            <TableCell className="text-xs py-1.5">
                              <span
                                className={cn(
                                  "tabular-nums",
                                  isBalanced
                                    ? "text-green-600"
                                    : "text-orange-600"
                                )}
                              >
                                {Math.abs(delta).toLocaleString()} (
                                {isBalanced ? "balanced" : "unbalanced"})
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Import button */}
            {validRows.length > 0 && !results && (
              <div className="flex justify-end">
                <Button
                  onClick={handleImport}
                  disabled={importing}
                  className="gap-1"
                >
                  {importing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Import {validRows.length} Entries
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {results && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Import Complete
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs h-8">Date</TableHead>
                    <TableHead className="text-xs h-8">Production</TableHead>
                    <TableHead className="text-xs h-8">
                      Entries Created
                    </TableHead>
                    <TableHead className="text-xs h-8">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r) => (
                    <TableRow key={r.date}>
                      <TableCell className="text-xs py-1.5 font-medium">
                        {r.date}
                      </TableCell>
                      <TableCell className="text-xs py-1.5 tabular-nums">
                        {r.production.toLocaleString()} {productionUnit}
                      </TableCell>
                      <TableCell className="text-xs py-1.5">
                        {r.entriesCreated}
                      </TableCell>
                      <TableCell className="text-xs py-1.5">
                        <Badge
                          variant={
                            r.status === "created" ? "default" : "secondary"
                          }
                          className="text-[10px]"
                        >
                          {r.status === "created"
                            ? "New day"
                            : r.status === "updated"
                              ? "Existing day"
                              : "Skipped"}
                        </Badge>
                        {r.message && (
                          <span className="ml-2 text-muted-foreground">
                            {r.message}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCsvText("");
                  setResults(null);
                }}
              >
                Clear & Upload More
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
