"use client";

import { useTheme } from "next-themes";
import { Sun, Moon, Monitor, Building2, ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSyncExternalStore } from "react";
import { usePlant } from "@/components/plant-context";

function subscribe() {
  return () => {};
}

function useMounted() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
}

export function TopBar() {
  const { setTheme, theme } = useTheme();
  const mounted = useMounted();
  const {
    sites,
    plants,
    selectedPlantId,
    selectedPlant,
    selectedSite,
    setSelectedPlantId,
    isLoading,
  } = usePlant();

  return (
    <header className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-background px-4">
      {/* Plant selector */}
      <div>
        {mounted && !isLoading && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 px-2">
                <Building2 className="h-3.5 w-3.5" />
                {selectedSite && selectedPlant
                  ? `${selectedSite.name} / ${selectedPlant.name}`
                  : "Select plant..."}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {sites.map((site) => {
                const sitePlants = plants.filter((p) => p.siteId === site.id);
                if (sitePlants.length === 0) return null;
                return (
                  <div key={site.id}>
                    <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground tracking-wider">
                      {site.name}
                    </DropdownMenuLabel>
                    {sitePlants.map((plant) => (
                      <DropdownMenuItem
                        key={plant.id}
                        onClick={() => setSelectedPlantId(plant.id)}
                        className="text-xs"
                      >
                        {selectedPlantId === plant.id && (
                          <Check className="mr-1.5 h-3 w-3" />
                        )}
                        {selectedPlantId !== plant.id && (
                          <span className="mr-1.5 w-3" />
                        )}
                        {plant.name}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                  </div>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Theme toggle */}
      <div className="flex items-center gap-2">
        {mounted && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                {theme === "dark" ? (
                  <Moon className="h-4 w-4" />
                ) : theme === "light" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Monitor className="h-4 w-4" />
                )}
                <span className="sr-only">Toggle theme</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setTheme("light")}>
                <Sun className="mr-2 h-4 w-4" />
                Light
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("dark")}>
                <Moon className="mr-2 h-4 w-4" />
                Dark
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("system")}>
                <Monitor className="mr-2 h-4 w-4" />
                System
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
