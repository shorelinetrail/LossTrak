"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  getSites,
  getPlants,
  getSelectedPlantId,
  setSelectedPlantId as persistSelectedPlantId,
} from "@/lib/store";
import type { Site, Plant } from "@/types";

interface PlantContextValue {
  sites: Site[];
  plants: Plant[];
  selectedSiteId: string | null;
  selectedPlantId: string | null;
  selectedPlant: Plant | null;
  selectedSite: Site | null;
  setSelectedPlantId: (plantId: string) => void;
  refreshSitesAndPlants: () => Promise<void>;
  isLoading: boolean;
}

const PlantContext = createContext<PlantContextValue | null>(null);

export function PlantProvider({ children }: { children: React.ReactNode }) {
  const [sites, setSites] = useState<Site[]>([]);
  const [plants, setPlants] = useState<Plant[]>([]);
  const [selectedPlantId, setSelectedPlantIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [sitesData, plantsData, savedPlantId] = await Promise.all([
        getSites(),
        getPlants(),
        getSelectedPlantId(),
      ]);
      setSites(sitesData);
      setPlants(plantsData);

      // Use saved selection, or fall back to first plant
      if (savedPlantId && plantsData.some((p) => p.id === savedPlantId)) {
        setSelectedPlantIdState(savedPlantId);
      } else if (plantsData.length > 0) {
        setSelectedPlantIdState(plantsData[0].id);
        await persistSelectedPlantId(plantsData[0].id);
      }
    } catch (err) {
      console.error("Failed to load sites/plants:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const setSelectedPlantId = useCallback((plantId: string) => {
    setSelectedPlantIdState(plantId);
    persistSelectedPlantId(plantId).catch(console.error);
  }, []);

  const refreshSitesAndPlants = useCallback(async () => {
    const [sitesData, plantsData] = await Promise.all([getSites(), getPlants()]);
    setSites(sitesData);
    setPlants(plantsData);
  }, []);

  const selectedPlant = plants.find((p) => p.id === selectedPlantId) ?? null;
  const selectedSite = selectedPlant
    ? sites.find((s) => s.id === selectedPlant.siteId) ?? null
    : null;
  const selectedSiteId = selectedSite?.id ?? null;

  return (
    <PlantContext.Provider
      value={{
        sites,
        plants,
        selectedSiteId,
        selectedPlantId,
        selectedPlant,
        selectedSite,
        setSelectedPlantId,
        refreshSitesAndPlants,
        isLoading,
      }}
    >
      {children}
    </PlantContext.Provider>
  );
}

export function usePlant(): PlantContextValue {
  const ctx = useContext(PlantContext);
  if (!ctx) throw new Error("usePlant must be used inside <PlantProvider>");
  return ctx;
}
