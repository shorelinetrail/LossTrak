"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  getAllCategories,
  getAllSubcategories,
  getAllDetailCodes,
  createCategory,
  updateCategory,
  deleteCategory,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
  createDetailCode,
  updateDetailCode,
  deleteDetailCode,
} from "@/lib/store";
import { LossCategory, LossSubcategory, LossDetailCode, LossType } from "@/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Tags, ChevronDown, ChevronRight, Upload, Download, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<LossCategory[]>([]);
  const [subcategories, setSubcategories] = useState<LossSubcategory[]>([]);
  const [detailCodes, setDetailCodes] = useState<LossDetailCode[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedSubcategories, setExpandedSubcategories] = useState<Set<string>>(new Set());

  // Add Category dialog state
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryShutdown, setNewCategoryShutdown] = useState(true);
  const [newCategorySlowdown, setNewCategorySlowdown] = useState(true);
  const [newCategoryOrder, setNewCategoryOrder] = useState(0);

  // Edit Category dialog state
  const [editCategoryOpen, setEditCategoryOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<LossCategory | null>(null);
  const [editCategoryName, setEditCategoryName] = useState("");
  const [editCategoryShutdown, setEditCategoryShutdown] = useState(true);
  const [editCategorySlowdown, setEditCategorySlowdown] = useState(true);
  const [editCategoryOrder, setEditCategoryOrder] = useState(0);

  // Add Subcategory dialog state
  const [addSubcategoryOpen, setAddSubcategoryOpen] = useState(false);
  const [addSubcategoryParentId, setAddSubcategoryParentId] = useState<string>("");
  const [newSubcategoryName, setNewSubcategoryName] = useState("");
  const [newSubcategoryOrder, setNewSubcategoryOrder] = useState(0);

  // Edit Subcategory dialog state
  const [editSubcategoryOpen, setEditSubcategoryOpen] = useState(false);
  const [editingSubcategory, setEditingSubcategory] = useState<LossSubcategory | null>(null);
  const [editSubcategoryName, setEditSubcategoryName] = useState("");
  const [editSubcategoryOrder, setEditSubcategoryOrder] = useState(0);

  // Add Detail Code dialog state
  const [addDetailCodeOpen, setAddDetailCodeOpen] = useState(false);
  const [addDetailCodeParentId, setAddDetailCodeParentId] = useState<string>("");
  const [newDetailCodeName, setNewDetailCodeName] = useState("");
  const [newDetailCodeOrder, setNewDetailCodeOrder] = useState(0);

  // Edit Detail Code dialog state
  const [editDetailCodeOpen, setEditDetailCodeOpen] = useState(false);
  const [editingDetailCode, setEditingDetailCode] = useState<LossDetailCode | null>(null);
  const [editDetailCodeName, setEditDetailCodeName] = useState("");
  const [editDetailCodeOrder, setEditDetailCodeOrder] = useState(0);

  const loadData = useCallback(async () => {
    const allCategories = await getAllCategories();
    const allSubcategories = await getAllSubcategories();
    const allDetailCodes = await getAllDetailCodes();
    setCategories(allCategories);
    setSubcategories(allSubcategories);
    setDetailCodes(allDetailCodes);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Bulk upload state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadCsv, setUploadCsv] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);

  const CATEGORY_TEMPLATE = `category,subcategory,loss_types,display_order
Mechanical,Pump Failure,shutdown;slowdown,1
Mechanical,Bearing Wear,shutdown;slowdown,2
Process,Fouling,slowdown,1
Process,Catalyst Degradation,slowdown,2
External,Feedstock Quality,slowdown,1`;

  const parsedUploadRows = useMemo(() => {
    if (!uploadCsv.trim()) return [];
    const lines = uploadCsv.trim().split("\n");
    if (lines.length < 2) return [];
    const header = lines[0].toLowerCase();
    const hasHeader = header.includes("category") || header.includes("subcategory");
    const dataLines = hasHeader ? lines.slice(1) : lines;
    return dataLines.map((line, idx) => {
      const cols = line.split(",").map((c) => c.trim());
      if (cols.length < 2) return { line: idx + (hasHeader ? 2 : 1), category: "", subcategory: "", lossTypes: "" as string, order: 0, error: "Need at least category and subcategory columns" };
      const [cat, sub, types, orderStr] = cols;
      return {
        line: idx + (hasHeader ? 2 : 1),
        category: cat || "",
        subcategory: sub || "",
        lossTypes: types || "shutdown;slowdown",
        order: parseInt(orderStr) || 0,
        error: !cat ? "Category name required" : !sub ? "Subcategory name required" : undefined,
      };
    });
  }, [uploadCsv]);

  const handleBulkUpload = useCallback(async () => {
    const valid = parsedUploadRows.filter((r) => !r.error);
    if (valid.length === 0) { toast.error("No valid rows to import."); return; }
    setUploading(true);
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];
    try {
      // Group by category
      const grouped = new Map<string, typeof valid>();
      for (const row of valid) {
        const key = row.category.toLowerCase();
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(row);
      }

      for (const [, rows] of grouped) {
        const catName = rows[0].category;
        const typesStr = rows[0].lossTypes;
        const allowedTypes: LossType[] = [];
        if (typesStr.includes("shutdown")) allowedTypes.push("shutdown");
        if (typesStr.includes("slowdown")) allowedTypes.push("slowdown");
        if (allowedTypes.length === 0) allowedTypes.push("shutdown", "slowdown");

        // Check if category already exists
        let existingCat = categories.find((c) => c.name.toLowerCase() === catName.toLowerCase());
        if (!existingCat) {
          existingCat = await createCategory({
            name: catName,
            allowedLossTypes: allowedTypes,
            displayOrder: rows[0].order,
            isActive: true,
          });
          created++;
        }

        // Create subcategories
        for (const row of rows) {
          const existingSub = subcategories.find(
            (s) => s.categoryId === existingCat!.id && s.name.toLowerCase() === row.subcategory.toLowerCase()
          );
          if (existingSub) {
            skipped++;
            continue;
          }
          try {
            await createSubcategory({
              categoryId: existingCat.id,
              name: row.subcategory,
              displayOrder: row.order,
              isActive: true,
            });
            created++;
          } catch (e) {
            errors.push(`L${row.line}: Failed to create "${row.subcategory}"`);
          }
        }
      }

      setUploadResults({ created, skipped, errors });
      await loadData();
      if (created > 0) toast.success(`Created ${created} categories/subcategories.`);
      if (skipped > 0) toast.info(`Skipped ${skipped} existing subcategories.`);
    } catch {
      toast.error("Upload failed.");
    } finally {
      setUploading(false);
    }
  }, [parsedUploadRows, categories, subcategories]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownloadCategoryTemplate = useCallback(() => {
    const header = "category,subcategory,loss_types,display_order";
    const rows: string[] = [header];
    let order = 0;
    for (const cat of categories) {
      const catSubs = subcategories.filter((s) => s.categoryId === cat.id);
      if (catSubs.length === 0) {
        rows.push(`${cat.name},,${cat.allowedLossTypes.join(";")},${++order}`);
      } else {
        for (const sub of catSubs) {
          rows.push(`${cat.name},${sub.name},${cat.allowedLossTypes.join(";")},${++order}`);
        }
      }
    }
    // If no data yet, use sample
    if (categories.length === 0) {
      return downloadCsv(CATEGORY_TEMPLATE, "category-template.csv");
    }
    downloadCsv(rows.join("\n"), "category-template.csv");
  }, [categories, subcategories]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCategoryFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === "string") { setUploadCsv(text); setUploadResults(null); }
    };
    reader.readAsText(file);
    e.target.value = "";
  }, []);

  const toggleExpanded = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const getSubcategoriesForCategory = (categoryId: string) => {
    return subcategories.filter((sc) => sc.categoryId === categoryId);
  };

  const getDetailCodesForSubcategory = (subcategoryId: string) => {
    return detailCodes.filter((dc) => dc.subcategoryId === subcategoryId);
  };

  const toggleSubcategoryExpanded = (subcategoryId: string) => {
    setExpandedSubcategories((prev) => {
      const next = new Set(prev);
      if (next.has(subcategoryId)) {
        next.delete(subcategoryId);
      } else {
        next.add(subcategoryId);
      }
      return next;
    });
  };

  // --- Category Actions ---

  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      toast.error("Category name is required.");
      return;
    }

    const allowedTypes: LossType[] = [];
    if (newCategoryShutdown) allowedTypes.push("shutdown");
    if (newCategorySlowdown) allowedTypes.push("slowdown");

    if (allowedTypes.length === 0) {
      toast.error("At least one loss type must be selected.");
      return;
    }

    await createCategory({
      name: newCategoryName.trim(),
      allowedLossTypes: allowedTypes,
      displayOrder: newCategoryOrder,
      isActive: true,
    });

    toast.success(`Category "${newCategoryName.trim()}" created.`);
    setNewCategoryName("");
    setNewCategoryShutdown(true);
    setNewCategorySlowdown(true);
    setNewCategoryOrder(0);
    setAddCategoryOpen(false);
    await loadData();
  };

  const handleEditCategoryOpen = (category: LossCategory) => {
    setEditingCategory(category);
    setEditCategoryName(category.name);
    setEditCategoryShutdown(category.allowedLossTypes.includes("shutdown"));
    setEditCategorySlowdown(category.allowedLossTypes.includes("slowdown"));
    setEditCategoryOrder(category.displayOrder);
    setEditCategoryOpen(true);
  };

  const handleEditCategorySave = async () => {
    if (!editingCategory) return;

    if (!editCategoryName.trim()) {
      toast.error("Category name is required.");
      return;
    }

    const allowedTypes: LossType[] = [];
    if (editCategoryShutdown) allowedTypes.push("shutdown");
    if (editCategorySlowdown) allowedTypes.push("slowdown");

    if (allowedTypes.length === 0) {
      toast.error("At least one loss type must be selected.");
      return;
    }

    await updateCategory(editingCategory.id, {
      name: editCategoryName.trim(),
      allowedLossTypes: allowedTypes,
      displayOrder: editCategoryOrder,
    });

    toast.success(`Category "${editCategoryName.trim()}" updated.`);
    setEditCategoryOpen(false);
    setEditingCategory(null);
    await loadData();
  };

  const handleToggleCategoryActive = async (category: LossCategory) => {
    await updateCategory(category.id, { isActive: !category.isActive });
    toast.success(
      `Category "${category.name}" ${category.isActive ? "deactivated" : "activated"}.`
    );
    await loadData();
  };

  const handleDeleteCategory = async (category: LossCategory) => {
    const catSubcategories = getSubcategoriesForCategory(category.id);
    if (catSubcategories.length > 0) {
      toast.error(
        "Cannot delete a category that has subcategories. Remove all subcategories first."
      );
      return;
    }
    await deleteCategory(category.id);
    toast.success(`Category "${category.name}" deleted.`);
    await loadData();
  };

  // --- Subcategory Actions ---

  const handleOpenAddSubcategory = (categoryId: string) => {
    setAddSubcategoryParentId(categoryId);
    setNewSubcategoryName("");
    setNewSubcategoryOrder(0);
    setAddSubcategoryOpen(true);
  };

  const handleAddSubcategory = async () => {
    if (!newSubcategoryName.trim()) {
      toast.error("Subcategory name is required.");
      return;
    }

    await createSubcategory({
      categoryId: addSubcategoryParentId,
      name: newSubcategoryName.trim(),
      displayOrder: newSubcategoryOrder,
      isActive: true,
    });

    toast.success(`Subcategory "${newSubcategoryName.trim()}" created.`);
    setNewSubcategoryName("");
    setNewSubcategoryOrder(0);
    setAddSubcategoryOpen(false);
    await loadData();
  };

  const handleEditSubcategoryOpen = (subcategory: LossSubcategory) => {
    setEditingSubcategory(subcategory);
    setEditSubcategoryName(subcategory.name);
    setEditSubcategoryOrder(subcategory.displayOrder);
    setEditSubcategoryOpen(true);
  };

  const handleEditSubcategorySave = async () => {
    if (!editingSubcategory) return;

    if (!editSubcategoryName.trim()) {
      toast.error("Subcategory name is required.");
      return;
    }

    await updateSubcategory(editingSubcategory.id, {
      name: editSubcategoryName.trim(),
      displayOrder: editSubcategoryOrder,
    });

    toast.success(`Subcategory "${editSubcategoryName.trim()}" updated.`);
    setEditSubcategoryOpen(false);
    setEditingSubcategory(null);
    await loadData();
  };

  const handleToggleSubcategoryActive = async (subcategory: LossSubcategory) => {
    await updateSubcategory(subcategory.id, { isActive: !subcategory.isActive });
    toast.success(
      `Subcategory "${subcategory.name}" ${subcategory.isActive ? "deactivated" : "activated"}.`
    );
    await loadData();
  };

  const handleDeleteSubcategory = async (subcategory: LossSubcategory) => {
    const subDetailCodes = getDetailCodesForSubcategory(subcategory.id);
    if (subDetailCodes.length > 0) {
      toast.error(
        "Cannot delete a subcategory that has detail codes. Remove all detail codes first."
      );
      return;
    }
    await deleteSubcategory(subcategory.id);
    toast.success(`Subcategory "${subcategory.name}" deleted.`);
    await loadData();
  };

  // --- Detail Code Actions ---

  const handleOpenAddDetailCode = (subcategoryId: string) => {
    setAddDetailCodeParentId(subcategoryId);
    setNewDetailCodeName("");
    setNewDetailCodeOrder(0);
    setAddDetailCodeOpen(true);
  };

  const handleAddDetailCode = async () => {
    if (!newDetailCodeName.trim()) {
      toast.error("Detail code name is required.");
      return;
    }

    await createDetailCode({
      subcategoryId: addDetailCodeParentId,
      name: newDetailCodeName.trim(),
      displayOrder: newDetailCodeOrder,
      isActive: true,
    });

    toast.success(`Detail code "${newDetailCodeName.trim()}" created.`);
    setNewDetailCodeName("");
    setNewDetailCodeOrder(0);
    setAddDetailCodeOpen(false);
    await loadData();
  };

  const handleEditDetailCodeOpen = (detailCode: LossDetailCode) => {
    setEditingDetailCode(detailCode);
    setEditDetailCodeName(detailCode.name);
    setEditDetailCodeOrder(detailCode.displayOrder);
    setEditDetailCodeOpen(true);
  };

  const handleEditDetailCodeSave = async () => {
    if (!editingDetailCode) return;

    if (!editDetailCodeName.trim()) {
      toast.error("Detail code name is required.");
      return;
    }

    await updateDetailCode(editingDetailCode.id, {
      name: editDetailCodeName.trim(),
      displayOrder: editDetailCodeOrder,
    });

    toast.success(`Detail code "${editDetailCodeName.trim()}" updated.`);
    setEditDetailCodeOpen(false);
    setEditingDetailCode(null);
    await loadData();
  };

  const handleToggleDetailCodeActive = async (detailCode: LossDetailCode) => {
    await updateDetailCode(detailCode.id, { isActive: !detailCode.isActive });
    toast.success(
      `Detail code "${detailCode.name}" ${detailCode.isActive ? "deactivated" : "activated"}.`
    );
    await loadData();
  };

  const handleDeleteDetailCode = async (detailCode: LossDetailCode) => {
    await deleteDetailCode(detailCode.id);
    toast.success(`Detail code "${detailCode.name}" deleted.`);
    await loadData();
  };

  return (
    <div className="container mx-auto max-w-4xl py-4 px-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold">Loss Categories</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage categories and subcategories for classifying production losses.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => { setUploadCsv(""); setUploadResults(null); setUploadOpen(true); }}>
            <Upload className="mr-2 h-4 w-4" />
            Upload CSV
          </Button>
          <Dialog open={addCategoryOpen} onOpenChange={setAddCategoryOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Category
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Category</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="new-cat-name">Name</Label>
                <Input
                  id="new-cat-name"
                  placeholder="e.g. Mechanical Failure"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                />
              </div>
              <div className="space-y-3">
                <Label>Allowed Loss Types</Label>
                <div className="flex items-center justify-between">
                  <Label htmlFor="new-cat-shutdown" className="font-normal">
                    Shutdown
                  </Label>
                  <Switch
                    id="new-cat-shutdown"
                    checked={newCategoryShutdown}
                    onCheckedChange={setNewCategoryShutdown}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="new-cat-slowdown" className="font-normal">
                    Slowdown
                  </Label>
                  <Switch
                    id="new-cat-slowdown"
                    checked={newCategorySlowdown}
                    onCheckedChange={setNewCategorySlowdown}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-cat-order">Display Order</Label>
                <Input
                  id="new-cat-order"
                  type="number"
                  min={0}
                  value={newCategoryOrder}
                  onChange={(e) =>
                    setNewCategoryOrder(parseInt(e.target.value) || 0)
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setAddCategoryOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleAddCategory}>Create Category</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {categories.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Tags className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-lg">
              No categories yet. Add your first category to get started.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {categories
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((category) => {
            const isExpanded = expandedCategories.has(category.id);
            const catSubcategories = getSubcategoriesForCategory(category.id).sort(
              (a, b) => a.displayOrder - b.displayOrder
            );

            return (
              <Card
                key={category.id}
                className={cn(!category.isActive && "opacity-60")}
              >
                <CardHeader className="py-2.5 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleExpanded(category.id)}
                        className="p-0.5 hover:bg-muted rounded"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                      <div>
                        <CardTitle className="text-sm flex items-center gap-2">
                          {category.name}
                          {!category.isActive && (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </CardTitle>
                        <div className="flex gap-1 mt-1">
                          {category.allowedLossTypes.map((type) => (
                            <Badge
                              key={type}
                              variant="outline"
                              className="text-xs capitalize"
                            >
                              {type}
                            </Badge>
                          ))}
                          <span className="text-xs text-muted-foreground ml-2">
                            {catSubcategories.length} subcategor
                            {catSubcategories.length === 1 ? "y" : "ies"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 mr-2">
                        <Label
                          htmlFor={`cat-active-${category.id}`}
                          className="text-sm text-muted-foreground"
                        >
                          Active
                        </Label>
                        <Switch
                          id={`cat-active-${category.id}`}
                          checked={category.isActive}
                          onCheckedChange={() =>
                            handleToggleCategoryActive(category)
                          }
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditCategoryOpen(category)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteCategory(category)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="pt-0">
                    <Separator className="mb-2" />
                    <div className="space-y-1.5">
                      {catSubcategories.length === 0 && (
                        <p className="text-sm text-muted-foreground py-2 pl-4">
                          No subcategories defined.
                        </p>
                      )}
                      {catSubcategories.map((subcategory) => {
                        const subDetailCodes = getDetailCodesForSubcategory(subcategory.id).sort(
                          (a, b) => a.displayOrder - b.displayOrder
                        );
                        const isSubExpanded = expandedSubcategories.has(subcategory.id);

                        return (
                          <div key={subcategory.id} className="space-y-1">
                            <div
                              className={cn(
                                "flex items-center justify-between rounded-md border px-3 py-1.5",
                                !subcategory.isActive && "opacity-50"
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => toggleSubcategoryExpanded(subcategory.id)}
                                  className="p-0.5 hover:bg-muted rounded"
                                >
                                  {isSubExpanded ? (
                                    <ChevronDown className="h-3 w-3" />
                                  ) : (
                                    <ChevronRight className="h-3 w-3" />
                                  )}
                                </button>
                                <span className="text-sm font-medium">
                                  {subcategory.name}
                                </span>
                                {!subcategory.isActive && (
                                  <Badge variant="secondary" className="text-xs">
                                    Inactive
                                  </Badge>
                                )}
                                {subDetailCodes.length > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    {subDetailCodes.length} detail{subDetailCodes.length === 1 ? "" : "s"}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-2 mr-2">
                                  <Label
                                    htmlFor={`sub-active-${subcategory.id}`}
                                    className="text-xs text-muted-foreground"
                                  >
                                    Active
                                  </Label>
                                  <Switch
                                    id={`sub-active-${subcategory.id}`}
                                    checked={subcategory.isActive}
                                    onCheckedChange={() =>
                                      handleToggleSubcategoryActive(subcategory)
                                    }
                                  />
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() =>
                                    handleEditSubcategoryOpen(subcategory)
                                  }
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() =>
                                    handleDeleteSubcategory(subcategory)
                                  }
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                            {isSubExpanded && (
                              <div className="ml-6 space-y-1">
                                {subDetailCodes.length === 0 && (
                                  <p className="text-xs text-muted-foreground py-1 pl-2">
                                    No detail codes defined.
                                  </p>
                                )}
                                {subDetailCodes.map((dc) => (
                                  <div
                                    key={dc.id}
                                    className={cn(
                                      "flex items-center justify-between rounded-md border px-2.5 py-1",
                                      !dc.isActive && "opacity-50"
                                    )}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-medium">{dc.name}</span>
                                      {!dc.isActive && (
                                        <Badge variant="secondary" className="text-[10px] px-1">
                                          Inactive
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <div className="flex items-center gap-1.5 mr-1">
                                        <Label
                                          htmlFor={`dc-active-${dc.id}`}
                                          className="text-[10px] text-muted-foreground"
                                        >
                                          Active
                                        </Label>
                                        <Switch
                                          id={`dc-active-${dc.id}`}
                                          checked={dc.isActive}
                                          onCheckedChange={() =>
                                            handleToggleDetailCodeActive(dc)
                                          }
                                        />
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => handleEditDetailCodeOpen(dc)}
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => handleDeleteDetailCode(dc)}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-xs"
                                  onClick={() => handleOpenAddDetailCode(subcategory.id)}
                                >
                                  <Plus className="mr-1 h-3 w-3" />
                                  Add Detail Code
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenAddSubcategory(category.id)}
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        Add Subcategory
                      </Button>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
      </div>

      {/* Edit Category Dialog */}
      <Dialog open={editCategoryOpen} onOpenChange={setEditCategoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-cat-name">Name</Label>
              <Input
                id="edit-cat-name"
                value={editCategoryName}
                onChange={(e) => setEditCategoryName(e.target.value)}
              />
            </div>
            <div className="space-y-3">
              <Label>Allowed Loss Types</Label>
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-cat-shutdown" className="font-normal">
                  Shutdown
                </Label>
                <Switch
                  id="edit-cat-shutdown"
                  checked={editCategoryShutdown}
                  onCheckedChange={setEditCategoryShutdown}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-cat-slowdown" className="font-normal">
                  Slowdown
                </Label>
                <Switch
                  id="edit-cat-slowdown"
                  checked={editCategorySlowdown}
                  onCheckedChange={setEditCategorySlowdown}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-cat-order">Display Order</Label>
              <Input
                id="edit-cat-order"
                type="number"
                min={0}
                value={editCategoryOrder}
                onChange={(e) =>
                  setEditCategoryOrder(parseInt(e.target.value) || 0)
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditCategoryOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleEditCategorySave}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Subcategory Dialog */}
      <Dialog open={addSubcategoryOpen} onOpenChange={setAddSubcategoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Subcategory</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-sub-name">Name</Label>
              <Input
                id="new-sub-name"
                placeholder="e.g. Pump failure"
                value={newSubcategoryName}
                onChange={(e) => setNewSubcategoryName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-sub-order">Display Order</Label>
              <Input
                id="new-sub-order"
                type="number"
                min={0}
                value={newSubcategoryOrder}
                onChange={(e) =>
                  setNewSubcategoryOrder(parseInt(e.target.value) || 0)
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddSubcategoryOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleAddSubcategory}>Create Subcategory</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Subcategory Dialog */}
      <Dialog open={editSubcategoryOpen} onOpenChange={setEditSubcategoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Subcategory</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-sub-name">Name</Label>
              <Input
                id="edit-sub-name"
                value={editSubcategoryName}
                onChange={(e) => setEditSubcategoryName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-sub-order">Display Order</Label>
              <Input
                id="edit-sub-order"
                type="number"
                min={0}
                value={editSubcategoryOrder}
                onChange={(e) =>
                  setEditSubcategoryOrder(parseInt(e.target.value) || 0)
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditSubcategoryOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleEditSubcategorySave}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Detail Code Dialog */}
      <Dialog open={addDetailCodeOpen} onOpenChange={setAddDetailCodeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Detail Code</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-dc-name">Name</Label>
              <Input
                id="new-dc-name"
                placeholder="e.g. Heat exchanger fouling"
                value={newDetailCodeName}
                onChange={(e) => setNewDetailCodeName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-dc-order">Display Order</Label>
              <Input
                id="new-dc-order"
                type="number"
                min={0}
                value={newDetailCodeOrder}
                onChange={(e) =>
                  setNewDetailCodeOrder(parseInt(e.target.value) || 0)
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddDetailCodeOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleAddDetailCode}>Create Detail Code</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Detail Code Dialog */}
      <Dialog open={editDetailCodeOpen} onOpenChange={setEditDetailCodeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Detail Code</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-dc-name">Name</Label>
              <Input
                id="edit-dc-name"
                value={editDetailCodeName}
                onChange={(e) => setEditDetailCodeName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-dc-order">Display Order</Label>
              <Input
                id="edit-dc-order"
                type="number"
                min={0}
                value={editDetailCodeOrder}
                onChange={(e) =>
                  setEditDetailCodeOrder(parseInt(e.target.value) || 0)
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDetailCodeOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleEditDetailCodeSave}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Upload Categories Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Upload Categories from CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 overflow-y-auto flex-1 min-h-0">
            <p className="text-xs text-muted-foreground">
              Upload a CSV with columns: <span className="font-mono">category, subcategory, loss_types, display_order</span>.
              Existing categories/subcategories are skipped.
            </p>
            <details className="group">
              <summary className="text-xs font-medium cursor-pointer select-none text-muted-foreground hover:text-foreground transition-colors">
                CSV format example
              </summary>
              <div className="mt-1.5 rounded bg-muted/50 p-2 text-[11px] font-mono overflow-x-auto whitespace-pre leading-relaxed">
                {CATEGORY_TEMPLATE}
              </div>
            </details>
            <Textarea
              placeholder="Paste CSV data here..."
              rows={5}
              className="font-mono text-xs"
              value={uploadCsv}
              onChange={(e) => { setUploadCsv(e.target.value); setUploadResults(null); }}
            />
            <div className="flex items-center gap-2">
              <label className="cursor-pointer">
                <input type="file" accept=".csv,.txt" className="hidden" onChange={handleCategoryFileUpload} />
                <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                  <span><FileSpreadsheet className="h-3.5 w-3.5 mr-1" />Upload File</span>
                </Button>
              </label>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleDownloadCategoryTemplate}>
                <Download className="h-3.5 w-3.5 mr-1" />Download Template
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setUploadCsv(CATEGORY_TEMPLATE); setUploadResults(null); }}>
                Load Example
              </Button>
            </div>

            {/* Preview */}
            {parsedUploadRows.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium">Preview</span>
                  {parsedUploadRows.filter((r) => !r.error).length > 0 && (
                    <Badge variant="secondary" className="gap-1 h-5 text-[10px]">
                      <CheckCircle2 className="h-2.5 w-2.5 text-green-600" />
                      {parsedUploadRows.filter((r) => !r.error).length} valid
                    </Badge>
                  )}
                  {parsedUploadRows.filter((r) => r.error).length > 0 && (
                    <Badge variant="destructive" className="gap-1 h-5 text-[10px]">
                      <AlertCircle className="h-2.5 w-2.5" />
                      {parsedUploadRows.filter((r) => r.error).length} errors
                    </Badge>
                  )}
                </div>
                {parsedUploadRows.filter((r) => r.error).length > 0 && (
                  <div className="space-y-0.5">
                    {parsedUploadRows.filter((r) => r.error).map((row) => (
                      <div key={row.line} className="text-[11px] rounded border border-destructive/30 bg-destructive/5 px-2 py-1">
                        <span className="font-medium">L{row.line}:</span> {row.error}
                      </div>
                    ))}
                  </div>
                )}
                <div className="rounded-md border overflow-hidden max-h-[200px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[11px] h-7 py-0">Category</TableHead>
                        <TableHead className="text-[11px] h-7 py-0">Subcategory</TableHead>
                        <TableHead className="text-[11px] h-7 py-0">Types</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedUploadRows.filter((r) => !r.error).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-[11px] py-1">{row.category}</TableCell>
                          <TableCell className="text-[11px] py-1">{row.subcategory}</TableCell>
                          <TableCell className="text-[11px] py-1">{row.lossTypes}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Results */}
            {uploadResults && (
              <div className="rounded-md border p-2 bg-muted/30 text-xs space-y-1">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                  <span className="font-medium">Upload complete</span>
                </div>
                <p>{uploadResults.created} created, {uploadResults.skipped} skipped</p>
                {uploadResults.errors.length > 0 && (
                  <div className="text-destructive">{uploadResults.errors.join(", ")}</div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Close</Button>
            {!uploadResults && parsedUploadRows.filter((r) => !r.error).length > 0 && (
              <Button onClick={handleBulkUpload} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
                Import {parsedUploadRows.filter((r) => !r.error).length} Rows
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
