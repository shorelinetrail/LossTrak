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
import { usePlant } from "@/components/plant-context";

import { LossCategory, LossSubcategory, LossType } from "@/types";
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

interface ColumnDef {
  subcategoryName: string;
  lossType: LossType;
  /** resolved after matching against configured subcategories */
  subcategoryId?: string;
  categoryId?: string;
}

interface ParsedEntry {
  date: string; // YYYY-MM-DD
  subcategoryName: string;
  lossType: LossType;
  amount: number;
  subcategoryId?: string;
  categoryId?: string;
  error?: string;
}

interface ImportResult {
  date: string;
  entriesCreated: number;
  status: "created" | "updated";
  message?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Parse DD/MM/YYYY or DD/MM/YYYY HH:mm into YYYY-MM-DD */
function parseDate(raw: string): string | null {
  if (!raw) return null;
  const s = raw.toString().trim();

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // DD/MM/YYYY or DD/MM/YYYY HH:mm(:ss)
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    return `${m[3]}-${mm}-${dd}`;
  }

  // Excel serial date number
  const num = Number(s);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + num * 86400000);
    const y = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }

  return null;
}

/** Normalize header text for matching */
function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function HistoricalUploadPage() {
  const { selectedPlantId } = usePlant();
  const [categories, setCategories] = useState<LossCategory[]>([]);
  const [subcategories, setSubcategories] = useState<LossSubcategory[]>([]);
  const [bar, setBar] = useState(0);
  const [productionUnit, setProductionUnit] = useState("units");
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);

  // Parsed state
  const [columns, setColumns] = useState<ColumnDef[]>([]);
  const [entries, setEntries] = useState<ParsedEntry[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedPlantId) return;
    const load = async () => {
      setCategories(await getCategories());
      setSubcategories(await getSubcategories(selectedPlantId));
      setBar(await getBarRate(selectedPlantId));
      setProductionUnit(await getProductionUnit(selectedPlantId));
    };
    load();
  }, [selectedPlantId]);

  // Build subcategory lookup (case-insensitive name → subcategory)
  const subcatLookup = useMemo(() => {
    const m: Record<string, LossSubcategory> = {};
    subcategories.forEach((s) => {
      m[s.name.toLowerCase()] = s;
    });
    return m;
  }, [subcategories]);

  /* ---------------------------------------------------------------- */
  /*  Parse uploaded file                                              */
  /* ---------------------------------------------------------------- */

  const processWorkbook = useCallback(
    (wb: XLSX.WorkBook) => {
      const sheet = wb.Sheets[wb.SheetNames[0]];
      // Read as array of arrays, raw values
      const raw: (string | number | null)[][] = XLSX.utils.sheet_to_json(
        sheet,
        { header: 1, defval: null, raw: true }
      );

      if (raw.length < 3) {
        setParseErrors(["File must have at least 3 rows (header rows + data)"]);
        return;
      }

      const errors: string[] = [];

      // --- Discover the header rows ---
      // Row with subcategory names (merged cells create blanks between)
      // Row with "Shut Down" / "Slow Down" labels
      // Find the "Shut Down" / "Slow Down" row
      let headerRowIdx = -1;
      let subHeaderRowIdx = -1;

      for (let i = 0; i < Math.min(raw.length, 5); i++) {
        const row = raw[i];
        const cells = row.map((c) => (c ? norm(String(c)) : ""));
        if (
          cells.some(
            (c) =>
              c === "shut down" ||
              c === "shutdown" ||
              c === "slow down" ||
              c === "slowdown"
          )
        ) {
          subHeaderRowIdx = i;
          headerRowIdx = i - 1;
          break;
        }
      }

      if (subHeaderRowIdx === -1) {
        setParseErrors([
          'Could not find the "Shut Down" / "Slow Down" header row. Make sure the sheet contains these column labels.',
        ]);
        return;
      }

      const headerRow = raw[headerRowIdx] ?? [];
      const subHeaderRow = raw[subHeaderRowIdx];

      // --- Build column definitions ---
      // Start from column 1 (column 0 is dates)
      const cols: ColumnDef[] = [];
      let currentSubcatName = "";

      for (let c = 1; c < subHeaderRow.length; c++) {
        // Check for subcategory name in the header row
        const hdrCell = headerRow[c];
        if (hdrCell && String(hdrCell).trim()) {
          currentSubcatName = String(hdrCell).trim();
        }

        // Check for loss type in sub-header row
        const subCell = subHeaderRow[c];
        if (!subCell) continue;
        const subNorm = norm(String(subCell));
        let lossType: LossType | null = null;
        if (subNorm === "shut down" || subNorm === "shutdown") {
          lossType = "shutdown";
        } else if (subNorm === "slow down" || subNorm === "slowdown") {
          lossType = "slowdown";
        }

        if (!lossType || !currentSubcatName) continue;

        // Try to resolve subcategory
        const sub = subcatLookup[currentSubcatName.toLowerCase()];
        if (!sub) {
          errors.push(`Unknown subcategory: "${currentSubcatName}"`);
        }

        cols.push({
          subcategoryName: currentSubcatName,
          lossType,
          subcategoryId: sub?.id,
          categoryId: sub?.categoryId,
        });
      }

      if (cols.length === 0) {
        setParseErrors([
          "No valid columns found. Ensure subcategory names are in the header row above the Shut Down / Slow Down labels.",
          ...errors,
        ]);
        return;
      }

      // --- Parse data rows ---
      const dataStartIdx = subHeaderRowIdx + 1;
      const parsedEntries: ParsedEntry[] = [];

      // Re-scan to build a column-index → colDef map
      const colIndexMap: { colIdx: number; def: ColumnDef }[] = [];
      let curName = "";
      for (let c = 1; c < subHeaderRow.length; c++) {
        const hdr = headerRow[c];
        if (hdr && String(hdr).trim()) curName = String(hdr).trim();
        const subCell = subHeaderRow[c];
        if (!subCell) continue;
        const subNorm2 = norm(String(subCell));
        let lt: LossType | null = null;
        if (subNorm2 === "shut down" || subNorm2 === "shutdown") lt = "shutdown";
        else if (subNorm2 === "slow down" || subNorm2 === "slowdown")
          lt = "slowdown";
        if (!lt || !curName) continue;
        const sub = subcatLookup[curName.toLowerCase()];
        colIndexMap.push({
          colIdx: c,
          def: {
            subcategoryName: curName,
            lossType: lt,
            subcategoryId: sub?.id,
            categoryId: sub?.categoryId,
          },
        });
      }

      for (let r = dataStartIdx; r < raw.length; r++) {
        const row = raw[r];
        if (!row || !row[0]) continue;

        const dateStr = parseDate(String(row[0]));
        if (!dateStr) {
          errors.push(`Row ${r + 1}: invalid date "${row[0]}"`);
          continue;
        }

        for (const { colIdx, def } of colIndexMap) {
          const cell = row[colIdx];
          if (cell === null || cell === undefined || cell === "") continue;
          const amount = typeof cell === "number" ? cell : parseFloat(String(cell));
          if (isNaN(amount) || amount <= 0) continue;

          parsedEntries.push({
            date: dateStr,
            subcategoryName: def.subcategoryName,
            lossType: def.lossType,
            amount: Math.round(amount * 100) / 100,
            subcategoryId: def.subcategoryId,
            categoryId: def.categoryId,
            error: def.subcategoryId
              ? undefined
              : `Unknown subcategory "${def.subcategoryName}"`,
          });
        }
      }

      // Deduplicate errors
      const uniqueErrors = [...new Set(errors)];

      setColumns(cols);
      setEntries(parsedEntries);
      setParseErrors(uniqueErrors);
      setResults(null);
    },
    [subcatLookup]
  );

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
          setParseErrors(["Failed to read file. Ensure it is a valid .xlsx or .csv file."]);
        }
      };
      reader.readAsArrayBuffer(file);
      e.target.value = "";
    },
    [processWorkbook]
  );

  /* ---------------------------------------------------------------- */
  /*  Derived data                                                     */
  /* ---------------------------------------------------------------- */

  const validEntries = entries.filter((e) => !e.error);
  const errorEntries = entries.filter((e) => e.error);

  const dateGroups = useMemo(() => {
    const groups: Record<string, ParsedEntry[]> = {};
    for (const entry of validEntries) {
      if (!groups[entry.date]) groups[entry.date] = [];
      groups[entry.date].push(entry);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [validEntries]);

  // Unique subcategories found
  const uniqueSubcats = useMemo(() => {
    const seen = new Set<string>();
    const result: ColumnDef[] = [];
    for (const col of columns) {
      const key = `${col.subcategoryName}/${col.lossType}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(col);
      }
    }
    return result;
  }, [columns]);

  /* ---------------------------------------------------------------- */
  /*  Import                                                           */
  /* ---------------------------------------------------------------- */

  const handleImport = useCallback(async () => {
    if (validEntries.length === 0) {
      toast.error("No valid entries to import.");
      return;
    }

    setImporting(true);
    const importResults: ImportResult[] = [];

    try {
      for (const [date, dayEntries] of dateGroups) {
        let log = await getDailyLog(selectedPlantId!, date);
        let status: ImportResult["status"] = "created";

        if (log) {
          status = "updated";
        } else {
          log = await createDailyLog({
            plantId: selectedPlantId!,
            date,
            production: 0,
            bar,
            comments: "",
            status: "open",
          });
        }

        const existingEntries = await getLossEntries(date);
        let entriesCreated = 0;

        for (const entry of dayEntries) {
          if (!entry.subcategoryId || !entry.categoryId || !log) continue;

          // Duplicate check
          const isDuplicate = existingEntries.some(
            (e) =>
              e.categoryId === entry.categoryId &&
              e.subcategoryId === entry.subcategoryId &&
              e.amount === entry.amount &&
              e.lossType === entry.lossType
          );
          if (isDuplicate) continue;

          await createLossEntry({
            plantId: selectedPlantId!,
            dailyLogId: log.id,
            date,
            categoryId: entry.categoryId,
            subcategoryId: entry.subcategoryId,
            detailCodeId: "",
            lossType: entry.lossType,
            amount: entry.amount,
            comments: "",
          });
          entriesCreated++;
        }

        importResults.push({
          date,
          entriesCreated,
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
  }, [validEntries, dateGroups, bar]);

  /* ---------------------------------------------------------------- */
  /*  Template download                                                */
  /* ---------------------------------------------------------------- */

  const handleDownloadTemplate = useCallback(() => {
    const wb = XLSX.utils.book_new();

    // Group subcategories by category for ordering
    const activeSubs = subcategories.filter((s) => s.isActive);

    // Build header rows
    const headerRow1: string[] = [""];
    const headerRow2: string[] = [""];

    for (const sub of activeSubs) {
      const cat = categories.find((c) => c.id === sub.categoryId);
      if (!cat) continue;
      const hasShutdown = cat.allowedLossTypes.includes("shutdown");
      const hasSlowdown = cat.allowedLossTypes.includes("slowdown");

      if (hasShutdown) {
        headerRow1.push(sub.name);
        headerRow2.push("Shut Down");
      }
      if (hasSlowdown) {
        headerRow1.push(hasShutdown ? "" : sub.name);
        headerRow2.push("Slow Down");
      }
    }

    // Build date rows (last 30 days)
    const dataRows: (string | number | null)[][] = [];
    const today = new Date();
    for (let i = 30; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const yyyy = d.getFullYear();
      const row: (string | null)[] = [`${dd}/${mm}/${yyyy} 00:00`];
      for (let c = 1; c < headerRow1.length; c++) row.push(null);
      dataRows.push(row);
    }

    const sheetData = [headerRow1, headerRow2, ...dataRows];
    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // Merge subcategory header cells that span Shut Down + Slow Down
    const merges: XLSX.Range[] = [];
    let c = 1;
    for (const sub of activeSubs) {
      const cat = categories.find((ca) => ca.id === sub.categoryId);
      if (!cat) continue;
      const hasShutdown = cat.allowedLossTypes.includes("shutdown");
      const hasSlowdown = cat.allowedLossTypes.includes("slowdown");
      const span = (hasShutdown ? 1 : 0) + (hasSlowdown ? 1 : 0);
      if (span > 1) {
        merges.push({ s: { r: 0, c }, e: { r: 0, c: c + span - 1 } });
      }
      c += span;
    }
    ws["!merges"] = merges;

    // Column widths
    const colWidths = [{ wch: 20 }];
    for (let i = 1; i < headerRow1.length; i++) colWidths.push({ wch: 12 });
    ws["!cols"] = colWidths;

    XLSX.utils.book_append_sheet(wb, ws, "Losses");
    XLSX.writeFile(wb, "losstrak-historical-template.xlsx");
  }, [categories, subcategories]);

  /* ---------------------------------------------------------------- */
  /*  Reset                                                            */
  /* ---------------------------------------------------------------- */

  const handleClear = useCallback(() => {
    setColumns([]);
    setEntries([]);
    setParseErrors([]);
    setResults(null);
    setFileName(null);
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  if (!selectedPlantId) {
    return (
      <div className="container mx-auto max-w-5xl py-4 px-4">
        <h1 className="text-lg font-semibold tracking-tight">Historical Upload</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Please select a plant to upload data.
        </p>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl py-4 px-4 space-y-3">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold tracking-tight">
          Historical Upload
        </h1>
        <span className="text-xs text-muted-foreground">
          BAR: {bar.toLocaleString()} {productionUnit} &middot;{" "}
          {subcategories.filter((s) => s.isActive).length} subcategories
        </span>
      </div>

      {/* Format info + Upload */}
      <Card>
        <CardContent className="space-y-2">
          <div className="flex items-start gap-2 rounded bg-muted/50 p-2 text-[11px] text-muted-foreground leading-relaxed">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-foreground text-xs mb-1">
                Pivot-table format
              </p>
              <p>
                Upload an Excel file (.xlsx) where subcategory names are column
                headers, each with &ldquo;Shut Down&rdquo; and &ldquo;Slow
                Down&rdquo; sub-columns. Dates go in the first column
                (DD/MM/YYYY). Values are loss amounts.
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

      {/* Column mapping */}
      {uniqueSubcats.length > 0 && (
        <Card>
          <CardContent className="space-y-2">
            <span className="text-sm font-medium">
              Detected Columns ({uniqueSubcats.length})
            </span>
            <div className="flex flex-wrap gap-1.5">
              {uniqueSubcats.map((col, i) => (
                <Badge
                  key={i}
                  variant={col.subcategoryId ? "secondary" : "destructive"}
                  className="text-[10px] h-5 gap-1"
                >
                  {col.subcategoryName}
                  <span className="opacity-60">
                    {col.lossType === "shutdown" ? "SD" : "SL"}
                  </span>
                  {col.subcategoryId ? (
                    <CheckCircle2 className="h-2.5 w-2.5 text-green-600" />
                  ) : (
                    <AlertCircle className="h-2.5 w-2.5" />
                  )}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Validation summary */}
      {entries.length > 0 && (
        <Card>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Validation</span>
              <div className="flex items-center gap-1.5">
                {validEntries.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="gap-1 h-5 text-[10px]"
                  >
                    <CheckCircle2 className="h-2.5 w-2.5 text-green-600" />
                    {validEntries.length} valid
                  </Badge>
                )}
                {errorEntries.length > 0 && (
                  <Badge
                    variant="destructive"
                    className="gap-1 h-5 text-[10px]"
                  >
                    <AlertCircle className="h-2.5 w-2.5" />
                    {errorEntries.length} errors
                  </Badge>
                )}
              </div>
            </div>

            {/* Date summary table */}
            {dateGroups.length > 0 && (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[11px] h-7 py-0">
                        Date
                      </TableHead>
                      <TableHead className="text-[11px] h-7 py-0">
                        Entries
                      </TableHead>
                      <TableHead className="text-[11px] h-7 py-0">
                        Total Loss
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dateGroups.map(([date, dayEntries]) => {
                      const total = dayEntries.reduce(
                        (s, e) => s + e.amount,
                        0
                      );
                      return (
                        <TableRow key={date}>
                          <TableCell className="text-[11px] py-1 font-medium">
                            {date}
                          </TableCell>
                          <TableCell className="text-[11px] py-1">
                            {dayEntries.length}
                          </TableCell>
                          <TableCell className="text-[11px] py-1 tabular-nums">
                            {total.toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            })}{" "}
                            <span className="text-muted-foreground">
                              {productionUnit}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Import button */}
            {validEntries.length > 0 && !results && (
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
                  Import {validEntries.length} Entries
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
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px] h-7 py-0">Date</TableHead>
                    <TableHead className="text-[11px] h-7 py-0">
                      Created
                    </TableHead>
                    <TableHead className="text-[11px] h-7 py-0">
                      Status
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r) => (
                    <TableRow key={r.date}>
                      <TableCell className="text-[11px] py-1 font-medium">
                        {r.date}
                      </TableCell>
                      <TableCell className="text-[11px] py-1">
                        {r.entriesCreated}
                      </TableCell>
                      <TableCell className="text-[11px] py-1">
                        <Badge
                          variant={
                            r.status === "created" ? "default" : "secondary"
                          }
                          className="text-[10px] h-4"
                        >
                          {r.status === "created" ? "New" : "Updated"}
                        </Badge>
                        {r.message && (
                          <span className="ml-1.5 text-[11px] text-muted-foreground">
                            {r.message}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
