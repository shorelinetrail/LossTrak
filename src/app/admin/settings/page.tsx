"use client";

import { useEffect, useState } from "react";
import { getBarRate, getProductionUnit, setConfig } from "@/lib/store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function SettingsPage() {
  const [barRate, setBarRate] = useState<number>(0);
  const [productionUnit, setProductionUnit] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const currentBar = getBarRate();
    const currentUnit = getProductionUnit();
    setBarRate(currentBar);
    setProductionUnit(currentUnit);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (barRate <= 0) {
        toast.error("BAR must be a positive number.");
        setIsSaving(false);
        return;
      }
      if (!productionUnit.trim()) {
        toast.error("Production unit cannot be empty.");
        setIsSaving(false);
        return;
      }

      setConfig("bar_rate", barRate);
      setConfig("production_unit", productionUnit.trim());
      toast.success("Settings saved successfully.");
    } catch {
      toast.error("Failed to save settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="container mx-auto max-w-2xl py-4 px-4">
      <h1 className="text-lg font-semibold">Settings</h1>
      <p className="text-sm text-muted-foreground mt-0.5 mb-4">
        Configure application-wide production parameters.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Production Configuration</CardTitle>
          <CardDescription>
            Set the Best Achievable Rate and production unit for loss tracking
            calculations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="bar-rate">Best Achievable Rate (BAR)</Label>
            <Input
              id="bar-rate"
              type="number"
              min={0}
              step="any"
              placeholder="e.g. 120"
              value={barRate || ""}
              onChange={(e) => setBarRate(parseFloat(e.target.value) || 0)}
            />
            <p className="text-sm text-muted-foreground">
              The maximum production rate achievable under ideal conditions. Used
              to calculate production losses.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="production-unit">Production Unit</Label>
            <Input
              id="production-unit"
              type="text"
              placeholder='e.g. "tonnes", "barrels", "units"'
              value={productionUnit}
              onChange={(e) => setProductionUnit(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              The unit of measurement for production output (e.g., tonnes,
              barrels, litres).
            </p>
          </div>

          <div className="flex justify-end pt-1">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
