"use client";

import { useEffect, useState } from "react";
import { getBarRate, getProductionUnit, getOperatingHours, setPlantConfig } from "@/lib/store";
import { usePlant } from "@/components/plant-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function SettingsPage() {
  const { selectedPlantId, selectedPlant } = usePlant();
  const [barRate, setBarRate] = useState<number>(0);
  const [productionUnit, setProductionUnit] = useState<string>("");
  const [operatingHours, setOperatingHours] = useState<number>(24);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!selectedPlantId) return;
    async function load() {
      const [currentBar, currentUnit, currentHours] = await Promise.all([
        getBarRate(selectedPlantId!),
        getProductionUnit(selectedPlantId!),
        getOperatingHours(selectedPlantId!),
      ]);
      setBarRate(currentBar);
      setProductionUnit(currentUnit);
      setOperatingHours(currentHours);
    }
    load();
  }, [selectedPlantId]);

  if (!selectedPlantId) {
    return (
      <div className="container mx-auto max-w-2xl py-4 px-4">
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Please select a plant to configure settings.
        </p>
      </div>
    );
  }

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
      if (operatingHours <= 0 || operatingHours > 24) {
        toast.error("Operating hours must be between 0 and 24.");
        setIsSaving(false);
        return;
      }

      await setPlantConfig(selectedPlantId, "bar_rate", barRate);
      await setPlantConfig(selectedPlantId, "production_unit", productionUnit.trim());
      await setPlantConfig(selectedPlantId, "operating_hours", operatingHours);
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
        Configure production parameters for {selectedPlant?.name ?? "selected plant"}.
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

          <div className="space-y-1">
            <Label htmlFor="operating-hours">Operating Hours per Day</Label>
            <Input
              id="operating-hours"
              type="number"
              min={0.5}
              max={24}
              step="any"
              placeholder="e.g. 24"
              value={operatingHours || ""}
              onChange={(e) => setOperatingHours(parseFloat(e.target.value) || 0)}
            />
            <p className="text-sm text-muted-foreground">
              Hours of operation per day. Used to convert between hours and{" "}
              {productionUnit || "production units"} on loss entries (hourly rate
              = BAR / operating hours).
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
