"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getBarRate,
  getProductionUnit,
  getDailyLog,
  createDailyLog,
  updateDailyLog,
} from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Download,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ParsedRow {
  row: number;
  date: string; // YYYY-MM-DD
  production: number;
  error?: string;
}

interface ImportResult {
  date: string;
  production: number;
  status: "created" | "updated" | "skipped";
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function parseDate(raw: string | number): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // DD/MM/YYYY or DD/MM/YYYY HH:mm
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    return `${m[3]}-${mm}-${dd}`;
  }

  // Excel serial date
  const num = Number(s);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    const epoch = new Date(1899, 11, 30);
    const date = new Date(epoch.getTime() + num * 86400000);
    const y = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ProductionUploadPage() {
  const [bar, setBar] = useState(0);
  const [productionUnit, setProductionUnit] = useState("units");
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setBar(await getBarRate());
      setProductionUnit(await getProductionUnit());
    };
    load();
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Parse                                                            */
  /* ---------------------------------------------------------------- */

  const processWorkbook = useCallback((wb: XLSX.WorkBook) => {
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: null,
      raw: true,
    });

    if (raw.length < 2) {
      setParseErrors(["File must have at least 2 rows (header + data)"]);
      return;
    }

    const errors: string[] = [];
    const parsed: ParsedRow[] = [];

    // Find the production column — scan header row for a "production" label
    const headerRow = raw[0].map((c) =>
      c ? String(c).trim().toLowerCase() : ""
    );
    let prodColIdx = headerRow.findIndex(
      (h) => h === "production" || h === "prod" || h === "actual"
    );
    // Fallback: assume column B (index 1)
    if (prodColIdx === -1) prodColIdx = 1;

    // Determine if first row is a header
    const firstDateCell = raw[0]?.[0];
    const isHeader = firstDateCell
      ? parseDate(String(firstDateCell)) === null
      : true;
    const startIdx = isHeader ? 1 : 0;

    for (let r = startIdx; r < raw.length; r++) {
      const row = raw[r];
      if (!row || (!row[0] && !row[prodColIdx])) continue;

      const dateStr = parseDate(row[0] as string | number);
      if (!dateStr) {
        if (row[0]) errors.push(`Row ${r + 1}: invalid date "${row[0]}"`);
        continue;
      }

      const prodCell = row[prodColIdx];
      if (prodCell === null || prodCell === undefined || prodCell === "") continue;

      const production =
        typeof prodCell === "number" ? prodCell : parseFloat(String(prodCell));
      if (isNaN(production) || production < 0) {
        errors.push(`Row ${r + 1}: invalid production value "${prodCell}"`);
        continue;
      }

      parsed.push({
        row: r + 1,
        date: dateStr,
        production: Math.round(production * 100) / 100,
      });
    }

    setRows(parsed);
    setParseErrors([...new Set(errors)]);
    setResults(null);
  }, []);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setFileName(file.name);

      const reader = new FileReader();
      reader.onload = (event) => {
        const data = event.target?.result;
        if (!data) return;
        try {
          const wb = XLSX.read(data, { type: "array" });
          processWorkbook(wb);
        } catch {
          setParseErrors([
            "Failed to read file. Ensure it is a valid .xlsx or .csv file.",
          ]);
        }
      };
      reader.readAsArrayBuffer(file);
      e.target.value = "";
    },
    [processWorkbook]
  );

  /* ---------------------------------------------------------------- */
  /*  Derived                                                          */
  /* ---------------------------------------------------------------- */

  const validRows = rows.filter((r) => !r.error);

  const summary = useMemo(() => {
    if (validRows.length === 0) return null;
    const productions = validRows.map((r) => r.production);
    return {
      days: validRows.length,
      min: Math.min(...productions),
      max: Math.max(...productions),
      avg: Math.round(productions.reduce((a, b) => a + b, 0) / productions.length),
      dateRange: `${validRows[0].date} to ${validRows[validRows.length - 1].date}`,
    };
  }, [validRows]);

  /* ---------------------------------------------------------------- */
  /*  Import                                                           */
  /* ---------------------------------------------------------------- */

  const handleImport = useCallback(async () => {
    if (validRows.length === 0) {
      toast.error("No valid rows to import.");
      return;
    }

    setImporting(true);
    const importResults: ImportResult[] = [];

    try {
      for (const row of validRows) {
        const existing = await getDailyLog(row.date);

        if (existing) {
          if (existing.production === row.production) {
            importResults.push({
              date: row.date,
              production: row.production,
              status: "skipped",
            });
          } else {
            await updateDailyLog(row.date, { production: row.production });
            importResults.push({
              date: row.date,
              production: row.production,
              status: "updated",
            });
          }
        } else {
          await createDailyLog({
            date: row.date,
            production: row.production,
            bar,
            comments: "",
            status: "open",
          });
          importResults.push({
            date: row.date,
            production: row.production,
            status: "created",
          });
        }
      }

      setResults(importResults);
      const created = importResults.filter((r) => r.status === "created").length;
      const updated = importResults.filter((r) => r.status === "updated").length;
      toast.success(
        `Done: ${created} created, ${updated} updated, ${importResults.length - created - updated} unchanged.`
      );
    } catch {
      toast.error("Import failed. Check the data and try again.");
    } finally {
      setImporting(false);
    }
  }, [validRows, bar]);

  /* ---------------------------------------------------------------- */
  /*  Template download                                                */
  /* ---------------------------------------------------------------- */

  const handleDownloadTemplate = useCallback(() => {
    const wb = XLSX.utils.book_new();
    const headerRow = ["Date", "Production"];
    const dataRows: (string | null)[][] = [];

    const today = new Date();
    for (let i = 30; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      dataRows.push([`${dd}/${mm}/${yyyy} 00:00`, null]);
    }

    const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
    ws["!cols"] = [{ wch: 20 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws, "Production");
    XLSX.writeFile(wb, "losstrak-production-template.xlsx");
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Clear                                                            */
  /* ---------------------------------------------------------------- */

  const handleClear = useCallback(() => {
    setRows([]);
    setParseErrors([]);
    setResults(null);
    setFileName(null);
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="container mx-auto max-w-3xl py-4 px-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold tracking-tight">
          Production Upload
        </h1>
        <span className="text-xs text-muted-foreground">
          BAR: {bar.toLocaleString()} {productionUnit}
        </span>
      </div>

      {/* Info + Upload */}
      <Card>
        <CardContent className="space-y-2">
          <div className="flex items-start gap-2 rounded bg-muted/50 p-2 text-[11px] text-muted-foreground leading-relaxed">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-foreground text-xs mb-1">
                Production data
              </p>
              <p>
                Upload an Excel file with dates in column A (DD/MM/YYYY) and
                production values in column B. Existing daily logs will be
                updated; new ones will be created.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                asChild
              >
                <span>
                  <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />
                  {fileName ? "Change File" : "Upload File"}
                </span>
              </Button>
            </label>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={handleDownloadTemplate}
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              Download Template
            </Button>
            {fileName && (
              <>
                <span className="text-xs text-muted-foreground">{fileName}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleClear}
                >
                  Clear
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Parse errors */}
      {parseErrors.length > 0 && (
        <Card>
          <CardContent className="space-y-1">
            <div className="flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 text-destructive" />
              <span className="text-xs font-medium">Parse Warnings</span>
            </div>
            {parseErrors.map((err, i) => (
              <div
                key={i}
                className="text-[11px] rounded border border-destructive/30 bg-destructive/5 px-2 py-1"
              >
                {err}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Validation */}
      {validRows.length > 0 && (
        <Card>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Preview</span>
              <Badge variant="secondary" className="gap-1 h-5 text-[10px]">
                <CheckCircle2 className="h-2.5 w-2.5 text-green-600" />
                {validRows.length} days
              </Badge>
            </div>

            {summary && (
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: "Range", value: summary.dateRange },
                  {
                    label: "Min",
                    value: `${summary.min.toLocaleString()} ${productionUnit}`,
                  },
                  {
                    label: "Max",
                    value: `${summary.max.toLocaleString()} ${productionUnit}`,
                  },
                  {
                    label: "Avg",
                    value: `${summary.avg.toLocaleString()} ${productionUnit}`,
                  },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded bg-muted/50 px-2 py-1.5"
                  >
                    <div className="text-[10px] text-muted-foreground">
                      {s.label}
                    </div>
                    <div className="text-xs font-medium tabular-nums">
                      {s.value}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Scrollable preview table */}
            <div className="rounded-md border overflow-hidden max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px] h-7 py-0 sticky top-0 bg-background">
                      Date
                    </TableHead>
                    <TableHead className="text-[11px] h-7 py-0 sticky top-0 bg-background">
                      Production
                    </TableHead>
                    <TableHead className="text-[11px] h-7 py-0 sticky top-0 bg-background">
                      Delta
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {validRows.map((row) => {
                    const delta = bar - row.production;
                    return (
                      <TableRow key={row.date}>
                        <TableCell className="text-[11px] py-1 font-medium">
                          {row.date}
                        </TableCell>
                        <TableCell className="text-[11px] py-1 tabular-nums">
                          {row.production.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-[11px] py-1 tabular-nums">
                          <span
                            className={cn(
                              delta > 0
                                ? "text-orange-600"
                                : "text-green-600"
                            )}
                          >
                            {delta > 0 ? `-${delta.toLocaleString()}` : "0"}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Import button */}
            {!results && (
              <div className="flex justify-end">
                <Button
                  onClick={handleImport}
                  disabled={importing}
                  size="sm"
                  className="gap-1 h-7 text-xs"
                >
                  {importing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  Import {validRows.length} Days
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {results && (
        <Card>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">Import Complete</span>
            </div>
            <div className="flex gap-2">
              {["created", "updated", "skipped"].map((status) => {
                const count = results.filter((r) => r.status === status).length;
                if (count === 0) return null;
                return (
                  <Badge
                    key={status}
                    variant={status === "created" ? "default" : "secondary"}
                    className="text-[10px] h-5"
                  >
                    {count} {status}
                  </Badge>
                );
              })}
            </div>
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={handleClear}
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
