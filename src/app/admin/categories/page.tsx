"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getAllCategories,
  getAllSubcategories,
  createCategory,
  updateCategory,
  deleteCategory,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
} from "@/lib/store";
import { LossCategory, LossSubcategory, LossType } from "@/types";
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
import { Plus, Pencil, Trash2, Tags, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function CategoriesPage() {
  const [categories, setCategories] = useState<LossCategory[]>([]);
  const [subcategories, setSubcategories] = useState<LossSubcategory[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

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

  const loadData = useCallback(() => {
    const allCategories = getAllCategories();
    const allSubcategories = getAllSubcategories();
    setCategories(allCategories);
    setSubcategories(allSubcategories);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  // --- Category Actions ---

  const handleAddCategory = () => {
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

    createCategory({
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
    loadData();
  };

  const handleEditCategoryOpen = (category: LossCategory) => {
    setEditingCategory(category);
    setEditCategoryName(category.name);
    setEditCategoryShutdown(category.allowedLossTypes.includes("shutdown"));
    setEditCategorySlowdown(category.allowedLossTypes.includes("slowdown"));
    setEditCategoryOrder(category.displayOrder);
    setEditCategoryOpen(true);
  };

  const handleEditCategorySave = () => {
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

    updateCategory(editingCategory.id, {
      name: editCategoryName.trim(),
      allowedLossTypes: allowedTypes,
      displayOrder: editCategoryOrder,
    });

    toast.success(`Category "${editCategoryName.trim()}" updated.`);
    setEditCategoryOpen(false);
    setEditingCategory(null);
    loadData();
  };

  const handleToggleCategoryActive = (category: LossCategory) => {
    updateCategory(category.id, { isActive: !category.isActive });
    toast.success(
      `Category "${category.name}" ${category.isActive ? "deactivated" : "activated"}.`
    );
    loadData();
  };

  const handleDeleteCategory = (category: LossCategory) => {
    const catSubcategories = getSubcategoriesForCategory(category.id);
    if (catSubcategories.length > 0) {
      toast.error(
        "Cannot delete a category that has subcategories. Remove all subcategories first."
      );
      return;
    }
    deleteCategory(category.id);
    toast.success(`Category "${category.name}" deleted.`);
    loadData();
  };

  // --- Subcategory Actions ---

  const handleOpenAddSubcategory = (categoryId: string) => {
    setAddSubcategoryParentId(categoryId);
    setNewSubcategoryName("");
    setNewSubcategoryOrder(0);
    setAddSubcategoryOpen(true);
  };

  const handleAddSubcategory = () => {
    if (!newSubcategoryName.trim()) {
      toast.error("Subcategory name is required.");
      return;
    }

    createSubcategory({
      categoryId: addSubcategoryParentId,
      name: newSubcategoryName.trim(),
      displayOrder: newSubcategoryOrder,
      isActive: true,
    });

    toast.success(`Subcategory "${newSubcategoryName.trim()}" created.`);
    setNewSubcategoryName("");
    setNewSubcategoryOrder(0);
    setAddSubcategoryOpen(false);
    loadData();
  };

  const handleEditSubcategoryOpen = (subcategory: LossSubcategory) => {
    setEditingSubcategory(subcategory);
    setEditSubcategoryName(subcategory.name);
    setEditSubcategoryOrder(subcategory.displayOrder);
    setEditSubcategoryOpen(true);
  };

  const handleEditSubcategorySave = () => {
    if (!editingSubcategory) return;

    if (!editSubcategoryName.trim()) {
      toast.error("Subcategory name is required.");
      return;
    }

    updateSubcategory(editingSubcategory.id, {
      name: editSubcategoryName.trim(),
      displayOrder: editSubcategoryOrder,
    });

    toast.success(`Subcategory "${editSubcategoryName.trim()}" updated.`);
    setEditSubcategoryOpen(false);
    setEditingSubcategory(null);
    loadData();
  };

  const handleToggleSubcategoryActive = (subcategory: LossSubcategory) => {
    updateSubcategory(subcategory.id, { isActive: !subcategory.isActive });
    toast.success(
      `Subcategory "${subcategory.name}" ${subcategory.isActive ? "deactivated" : "activated"}.`
    );
    loadData();
  };

  const handleDeleteSubcategory = (subcategory: LossSubcategory) => {
    deleteSubcategory(subcategory.id);
    toast.success(`Subcategory "${subcategory.name}" deleted.`);
    loadData();
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
                      {catSubcategories.map((subcategory) => (
                        <div
                          key={subcategory.id}
                          className={cn(
                            "flex items-center justify-between rounded-md border px-3 py-1.5",
                            !subcategory.isActive && "opacity-50"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {subcategory.name}
                            </span>
                            {!subcategory.isActive && (
                              <Badge variant="secondary" className="text-xs">
                                Inactive
                              </Badge>
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
                      ))}
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
    </div>
  );
}
