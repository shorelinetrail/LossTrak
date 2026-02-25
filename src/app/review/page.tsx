"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ExternalLink, Filter, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getDailyLogs,
  getAllLossEntries,
  getProductionUnit,
} from "@/lib/store";
import { DailyLog, LossEntry } from "@/types";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type StatusFilter = "all" | "open" | "closed";

interface LogWithDetails extends DailyLog {
  accounted: number;
  remaining: number;
}

export default function ReviewPage() {
  const [logs, setLogs] = useState<LogWithDetails[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [productionUnit, setProductionUnit] = useState<string>("units");

  useEffect(() => {
    const dailyLogs = getDailyLogs();
    const lossEntries = getAllLossEntries();
    const unit = getProductionUnit();
    setProductionUnit(unit);

    const enrichedLogs: LogWithDetails[] = dailyLogs.map((log) => {
      const entriesForDay = lossEntries.filter(
        (entry: LossEntry) => entry.date === log.date
      );
      const accounted = entriesForDay.reduce(
        (sum: number, entry: LossEntry) => sum + entry.amount,
        0
      );
      const remaining = log.delta - accounted;

      return {
        ...log,
        accounted,
        remaining,
      };
    });

    enrichedLogs.sort(
      (a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime()
    );

    setLogs(enrichedLogs);
  }, []);

  const filteredLogs = useMemo(() => {
    let filtered = logs;

    if (statusFilter === "open") {
      filtered = filtered.filter((log) => log.status === "open");
    } else if (statusFilter === "closed") {
      filtered = filtered.filter((log) => log.status === "closed");
    }

    if (startDate) {
      filtered = filtered.filter((log) => log.date >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter((log) => log.date <= endDate);
    }

    return filtered;
  }, [logs, statusFilter, startDate, endDate]);

  const stats = useMemo(() => {
    const totalDays = logs.length;
    const daysClosed = logs.filter((log) => log.status === "closed").length;
    const daysOpen = logs.filter((log) => log.status === "open").length;
    const averageProduction =
      totalDays > 0
        ? logs.reduce((sum, log) => sum + log.production, 0) / totalDays
        : 0;

    return { totalDays, daysClosed, daysOpen, averageProduction };
  }, [logs]);

  return (
    <div className="container mx-auto py-4 px-4 space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5" />
        <h1 className="text-lg font-semibold">Review / History</h1>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Total Days Logged
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{stats.totalDays}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Days Closed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-green-600">
              {stats.daysClosed}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Days Open
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-yellow-600">
              {stats.daysOpen}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Average Production
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">
              {stats.averageProduction.toFixed(1)}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                {productionUnit}
              </span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-3 pb-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">Filters</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 flex-1">
              <div className="w-full sm:w-[180px]">
                <Select
                  value={statusFilter}
                  onValueChange={(value: StatusFilter) =>
                    setStatusFilter(value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground whitespace-nowrap">
                  From
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={cn(
                    "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  )}
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground whitespace-nowrap">
                  To
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={cn(
                    "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors",
                    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  )}
                />
              </div>

              {(startDate || endDate || statusFilter !== "all") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStatusFilter("all");
                    setStartDate("");
                    setEndDate("");
                  }}
                >
                  Clear Filters
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-3 pb-3">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No daily logs found</p>
              <p className="text-sm mt-1">
                {logs.length === 0
                  ? "Start by adding a daily log from the Daily Entry page."
                  : "No logs match the current filters."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs h-8">Date</TableHead>
                    <TableHead className="text-xs h-8 text-right">Production</TableHead>
                    <TableHead className="text-xs h-8 text-right">BAR</TableHead>
                    <TableHead className="text-xs h-8 text-right">Delta</TableHead>
                    <TableHead className="text-xs h-8 text-right">Accounted</TableHead>
                    <TableHead className="text-xs h-8 text-right">Remaining</TableHead>
                    <TableHead className="text-xs h-8 text-center">Status</TableHead>
                    <TableHead className="text-xs h-8 text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                      <TableRow key={log.date}>
                        <TableCell className="text-xs py-1.5 font-medium">
                          {format(parseISO(log.date), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="text-xs py-1.5 text-right tabular-nums">
                          {log.production.toFixed(1)}
                        </TableCell>
                        <TableCell className="text-xs py-1.5 text-right tabular-nums">
                          {log.bar.toFixed(1)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-xs py-1.5 text-right font-medium tabular-nums",
                            log.delta > 0 ? "text-orange-600" : "text-muted-foreground"
                          )}
                        >
                          {log.delta.toFixed(1)}
                        </TableCell>
                        <TableCell className="text-xs py-1.5 text-right tabular-nums">
                          {log.accounted.toFixed(1)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-xs py-1.5 text-right font-medium tabular-nums",
                            log.remaining > 0
                              ? "text-yellow-600"
                              : log.remaining < 0
                              ? "text-red-600"
                              : "text-green-600"
                          )}
                        >
                          {log.remaining.toFixed(1)}
                        </TableCell>
                        <TableCell className="text-xs py-1.5 text-center">
                          <Badge
                            variant={
                              log.status === "closed" ? "default" : "secondary"
                            }
                            className={cn(
                              log.status === "closed"
                                ? "bg-green-100 text-green-800 hover:bg-green-100"
                                : "bg-yellow-100 text-yellow-800 hover:bg-yellow-100"
                            )}
                          >
                            {log.status === "closed" ? "Closed" : "Open"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs py-1.5 text-center">
                          <Link href={`/daily?date=${log.date}`}>
                            <Button variant="ghost" size="sm" className="h-6 text-xs px-2">
                              <ExternalLink className="h-3 w-3 mr-1" />
                              View
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {filteredLogs.length > 0 && (
            <div className="mt-4 text-sm text-muted-foreground text-right">
              Showing {filteredLogs.length} of {logs.length} log
              {logs.length !== 1 ? "s" : ""}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
