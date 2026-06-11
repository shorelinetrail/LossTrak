"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatAmount, ReportKpis } from "@/lib/reports/aggregate";

export function KpiCards({
  kpis,
  productionUnit,
  loading,
}: {
  kpis: ReportKpis;
  productionUnit: string;
  loading?: boolean;
}) {
  const cards = [
    {
      title: "Total Production",
      icon: <TrendingUp className="h-4 w-4 text-muted-foreground" />,
      value: formatAmount(kpis.totalProduction),
      sub: productionUnit,
    },
    {
      title: "Total BAR",
      icon: <BarChart3 className="h-4 w-4 text-muted-foreground" />,
      value: formatAmount(kpis.totalBAR),
      sub: productionUnit,
    },
    {
      title: "Total Losses",
      icon: <TrendingDown className="h-4 w-4 text-muted-foreground" />,
      value: formatAmount(kpis.totalLosses),
      sub: productionUnit,
    },
  ];

  return (
    <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0">
            <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
            {card.icon}
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              <div className="text-xl font-bold">{card.value}</div>
            )}
            <p className="text-xs text-muted-foreground">{card.sub}</p>
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0">
          <CardTitle className="text-sm font-medium">Utilization %</CardTitle>
          {kpis.utilization >= 80 ? (
            <TrendingUp className="h-4 w-4 text-green-500" />
          ) : (
            <TrendingDown className="h-4 w-4 text-red-500" />
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-7 w-24" />
          ) : (
            <div
              className={cn(
                "text-xl font-bold",
                kpis.utilization >= 80 ? "text-green-600" : "text-red-600"
              )}
            >
              {kpis.utilization.toFixed(1)}%
            </div>
          )}
          <p className="text-xs text-muted-foreground">Production / BAR</p>
        </CardContent>
      </Card>
    </div>
  );
}
