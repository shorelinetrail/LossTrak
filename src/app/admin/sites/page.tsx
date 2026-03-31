"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  getSites,
  getPlants,
  createSite,
  updateSite,
  deleteSite,
  createPlant,
  updatePlant,
  deletePlant,
} from "@/lib/store";
import type { Site, Plant } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Pencil,
  Trash2,
  Building2,
  Factory,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { usePlant } from "@/components/plant-context";

export default function SitesPage() {
  const { refreshSitesAndPlants } = usePlant();
  const [sites, setSites] = useState<Site[]>([]);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Dialog state
  const [siteDialogOpen, setSiteDialogOpen] = useState(false);
  const [plantDialogOpen, setPlantDialogOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [editingPlant, setEditingPlant] = useState<Plant | null>(null);
  const [parentSiteId, setParentSiteId] = useState<string>("");

  const [siteName, setSiteName] = useState("");
  const [plantName, setPlantName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [s, p] = await Promise.all([getSites(), getPlants()]);
    setSites(s);
    setPlants(p);
    // Auto-expand all sites
    setExpanded(new Set(s.map((site) => site.id)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Site CRUD ──────────────────────────────────────────────────

  const openAddSite = () => {
    setEditingSite(null);
    setSiteName("");
    setSiteDialogOpen(true);
  };

  const openEditSite = (site: Site) => {
    setEditingSite(site);
    setSiteName(site.name);
    setSiteDialogOpen(true);
  };

  const handleSaveSite = async () => {
    if (!siteName.trim()) {
      toast.error("Site name is required.");
      return;
    }
    setSaving(true);
    try {
      if (editingSite) {
        await updateSite(editingSite.id, { name: siteName.trim() });
        toast.success("Site updated.");
      } else {
        const maxOrder = Math.max(0, ...sites.map((s) => s.displayOrder));
        await createSite({
          name: siteName.trim(),
          displayOrder: maxOrder + 1,
          isActive: true,
        });
        toast.success("Site created.");
      }
      setSiteDialogOpen(false);
      await load();
      await refreshSitesAndPlants();
    } catch (err) {
      console.error(err);
      toast.error("Failed to save site.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSite = async (site: Site) => {
    const sitePlants = plants.filter((p) => p.siteId === site.id);
    if (sitePlants.length > 0) {
      toast.error(`Cannot delete "${site.name}" — it has ${sitePlants.length} plant(s). Remove plants first.`);
      return;
    }
    try {
      await deleteSite(site.id);
      toast.success("Site deleted.");
      await load();
      await refreshSitesAndPlants();
    } catch {
      toast.error("Failed to delete site.");
    }
  };

  // ── Plant CRUD ─────────────────────────────────────────────────

  const openAddPlant = (siteId: string) => {
    setEditingPlant(null);
    setParentSiteId(siteId);
    setPlantName("");
    setPlantDialogOpen(true);
  };

  const openEditPlant = (plant: Plant) => {
    setEditingPlant(plant);
    setParentSiteId(plant.siteId);
    setPlantName(plant.name);
    setPlantDialogOpen(true);
  };

  const handleSavePlant = async () => {
    if (!plantName.trim()) {
      toast.error("Plant name is required.");
      return;
    }
    setSaving(true);
    try {
      if (editingPlant) {
        await updatePlant(editingPlant.id, { name: plantName.trim() });
        toast.success("Plant updated.");
      } else {
        const siblings = plants.filter((p) => p.siteId === parentSiteId);
        const maxOrder = Math.max(0, ...siblings.map((p) => p.displayOrder));
        await createPlant({
          siteId: parentSiteId,
          name: plantName.trim(),
          displayOrder: maxOrder + 1,
          isActive: true,
        });
        toast.success("Plant created.");
      }
      setPlantDialogOpen(false);
      await load();
      await refreshSitesAndPlants();
    } catch (err) {
      console.error(err);
      toast.error("Failed to save plant.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePlant = async (plant: Plant) => {
    try {
      await deletePlant(plant.id);
      toast.success("Plant deleted.");
      await load();
      await refreshSitesAndPlants();
    } catch {
      toast.error("Failed to delete plant.");
    }
  };

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="container mx-auto max-w-3xl py-4 px-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold">Sites & Plants</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage the organizational hierarchy. Each plant has its own subcategories, production config, and daily logs.
          </p>
        </div>
        <Button size="sm" className="h-7 text-xs" onClick={openAddSite}>
          <Plus className="h-3 w-3 mr-1" />
          Add Site
        </Button>
      </div>

      {sites.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No sites configured. Create one to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sites.map((site) => {
            const sitePlants = plants.filter((p) => p.siteId === site.id);
            const isExpanded = expanded.has(site.id);
            return (
              <Card key={site.id}>
                <CardHeader className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleExpand(site.id)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-sm flex-1">{site.name}</CardTitle>
                    <span className="text-xs text-muted-foreground">
                      {sitePlants.length} plant{sitePlants.length !== 1 ? "s" : ""}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => openEditSite(site)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeleteSite(site)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardHeader>
                {isExpanded && (
                  <CardContent className="px-3 pb-3 pt-0">
                    <div className="ml-6 space-y-1">
                      {sitePlants.map((plant) => (
                        <div
                          key={plant.id}
                          className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/50"
                        >
                          <Factory className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm flex-1">{plant.name}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => openEditPlant(plant)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeletePlant(plant)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs ml-1"
                        onClick={() => openAddPlant(site.id)}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Plant
                      </Button>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Site Dialog */}
      <Dialog open={siteDialogOpen} onOpenChange={setSiteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {editingSite ? "Edit Site" : "New Site"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="site-name">Name</Label>
            <Input
              id="site-name"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              placeholder="e.g. Refinery Complex A"
              onKeyDown={(e) => e.key === "Enter" && handleSaveSite()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSiteDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveSite} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Plant Dialog */}
      <Dialog open={plantDialogOpen} onOpenChange={setPlantDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {editingPlant ? "Edit Plant" : "New Plant"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="plant-name">Name</Label>
            <Input
              id="plant-name"
              value={plantName}
              onChange={(e) => setPlantName(e.target.value)}
              placeholder="e.g. Unit 1"
              onKeyDown={(e) => e.key === "Enter" && handleSavePlant()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPlantDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSavePlant} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
