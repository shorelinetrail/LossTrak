"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CategorySummaryRow,
  formatAmount,
  SubcategorySummaryGroup,
} from "@/lib/reports/aggregate";

export function CategorySummaryTable({
  rows,
  totalLosses,
  loading,
  emptyMessage = "No loss data for this period.",
}: {
  rows: CategorySummaryRow[];
  totalLosses: number;
  loading?: boolean;
  emptyMessage?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Losses per Category</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <TableSkeleton />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {emptyMessage}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Shutdown</TableHead>
                <TableHead className="text-right">Slowdown</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">% of Total Losses</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: row.color }}
                      />
                      <span className="font-medium">{row.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatAmount(row.shutdown)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatAmount(row.slowdown)}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatAmount(row.total)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={row.pctOfTotal > 25 ? "destructive" : "secondary"}>
                      {row.pctOfTotal.toFixed(1)}%
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="font-bold border-t-2">
                <TableCell>Total</TableCell>
                <TableCell className="text-right">
                  {formatAmount(rows.reduce((s, r) => s + r.shutdown, 0))}
                </TableCell>
                <TableCell className="text-right">
                  {formatAmount(rows.reduce((s, r) => s + r.slowdown, 0))}
                </TableCell>
                <TableCell className="text-right">
                  {formatAmount(totalLosses)}
                </TableCell>
                <TableCell className="text-right">
                  <Badge>100%</Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function SubcategorySummaryTable({
  groups,
  loading,
  emptyMessage = "No subcategory loss data for this period.",
}: {
  groups: SubcategorySummaryGroup[];
  loading?: boolean;
  emptyMessage?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Losses per Subcategory</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <TableSkeleton />
        ) : groups.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {emptyMessage}
          </p>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.categoryId}>
                <div className="flex items-center gap-1.5 mb-2">
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: group.categoryColor }}
                  />
                  <h4 className="font-semibold text-sm">{group.categoryName}</h4>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Subcategory</TableHead>
                      <TableHead className="text-right">Shutdown</TableHead>
                      <TableHead className="text-right">Slowdown</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">% of Total Losses</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.subcategories.map((sub, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="pl-6">{sub.name}</TableCell>
                        <TableCell className="text-right">
                          {formatAmount(sub.shutdown)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatAmount(sub.slowdown)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatAmount(sub.total)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline">{sub.pctOfTotal.toFixed(1)}%</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-2 py-1">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}
