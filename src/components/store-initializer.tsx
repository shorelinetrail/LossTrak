"use client";

import { useEffect } from "react";
import { initializeStore } from "@/lib/store";

export function StoreInitializer() {
  useEffect(() => {
    initializeStore();
  }, []);
  return null;
}
