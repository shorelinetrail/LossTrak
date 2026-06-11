"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3 } from "lucide-react";

/**
 * Chart wrapper that handles loading and no-data states so charts never
 * render silently empty axes.
 */
export function ChartCard({
  title,
  loading,
  empty,
  emptyMessage = "No data for this period.",
  height = 300,
  actions,
  children,
}: {
  title: React.ReactNode;
  loading?: boolean;
  empty?: boolean;
  emptyMessage?: string;
  height?: number;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">{title}</CardTitle>
        {actions}
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton style={{ height }} className="w-full" />
        ) : empty ? (
          <div
            style={{ height }}
            className="flex w-full flex-col items-center justify-center gap-2 text-muted-foreground"
          >
            <BarChart3 className="h-8 w-8 opacity-40" />
            <p className="text-sm">{emptyMessage}</p>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
