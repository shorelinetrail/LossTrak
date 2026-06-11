"use client";

import { useCallback, useRef } from "react";
import { toPng } from "html-to-image";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { ImageDown } from "lucide-react";
import { toast } from "sonner";

/**
 * Wraps chart content and renders a small button that downloads the wrapped
 * area as a PNG (for pasting into reports/presentations).
 */
export function useChartPngExport(filename: string) {
  const ref = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  const exportPng = useCallback(async () => {
    if (!ref.current) return;
    try {
      const dataUrl = await toPng(ref.current, {
        backgroundColor: resolvedTheme === "dark" ? "#0a0a0a" : "#ffffff",
        pixelRatio: 2,
      });
      const link = document.createElement("a");
      link.download = `${filename}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("PNG export failed:", err);
      toast.error("Could not export the chart image.");
    }
  }, [filename, resolvedTheme]);

  return { ref, exportPng };
}

export function PngExportButton({ onExport }: { onExport: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 text-xs px-2 text-muted-foreground"
      onClick={onExport}
    >
      <ImageDown className="h-3.5 w-3.5 mr-1" />
      PNG
    </Button>
  );
}
