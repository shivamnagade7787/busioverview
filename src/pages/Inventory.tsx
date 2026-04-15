/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useBusiness } from '@/src/contexts/BusinessContext';
import { useAuth } from '@/src/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Plus, 
  Search, 
  Package, 
  AlertTriangle, 
  MoreVertical, 
  Tag,
  BarChart2,
  ArrowUpDown,
  Filter,
  Box,
  Trash2,
  Edit2
} from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter
} from '@/components/ui/dialog';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { collection, addDoc, serverTimestamp, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { toast } from 'sonner';
import { Product } from '@/src/types';
import { cn } from '@/lib/utils';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';

export default function Inventory() {
  const { products, loading } = useBusiness();
  const { user, profile } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  
  const [newProduct, setNewProduct] = useState({
    name: '',
    hsnCode: '',
    gstRate: 18,
    purchasePrice: 0,
    salePrice: 0,
    stockQuantity: 0,
    lowStockAlert: 5,
    category: '',
    unit: 'pcs',
    reminderEnabled: false,
    reminderDate: ''
  });

  const currency = profile?.currency || '₹';
  const businessId = profile?.currentBusinessId;

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const lowStockItems = products.filter(p => p.stockQuantity <= (p.lowStockAlert || 0));
  const totalStockValue = products.reduce((acc, p) => acc + (p.salePrice * p.stockQuantity), 0);

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !businessId) return;

    try {
      const productData = {
        ...newProduct,
        userId: user.uid,
        businessId: businessId,
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'products'), productData);
      toast.success('Product added successfully');
      setIsAddOpen(false);
      setNewProduct({
        name: '',
        hsnCode: '',
        gstRate: 18,
        purchasePrice: 0,
        salePrice: 0,
        stockQuantity: 0,
        lowStockAlert: 5,
        category: '',
        unit: 'pcs',
        reminderEnabled: false,
        reminderDate: ''
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'products');
    }
  };

  const handleEditProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

    try {
      await updateDoc(doc(db, 'products', selectedProduct.id), {
        ...newProduct
      });
      toast.success('Product updated successfully');
      setIsEditOpen(false);
      setSelectedProduct(null);
    } catch (error) {
      toast.error('Failed to update product');
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    try {
      await deleteDoc(doc(db, 'products', id));
      toast.success('Product deleted');
    } catch (error) {
      toast.error('Failed to delete product');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full">Loading inventory...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Inventory</h2>
          <p className="text-muted-foreground">Manage your stock, pricing, and GST details.</p>
        </div>
        
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger render={
            <Button className="gap-2">
              <Plus className="w-4 h-4" /> Add Product
            </Button>
          } />
          <DialogContent className="sm:max-w-[600px]">
            <form onSubmit={handleAddProduct}>
              <DialogHeader>
                <DialogTitle>Add New Product</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-text-muted">Product Name *</label>
                    <Input
                      required
                      placeholder="e.g. Wireless Mouse"
                      value={newProduct.name}
                      onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-text-muted">Category</label>
                    <Input
                      placeholder="e.g. Electronics"
                      value={newProduct.category}
                      onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-text-muted">HSN Code</label>
                    <Input
                      placeholder="8471"
                      value={newProduct.hsnCode}
                      onChange={(e) => setNewProduct({ ...newProduct, hsnCode: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-text-muted">GST Rate (%)</label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                      value={newProduct.gstRate}
                      onChange={(e) => setNewProduct({ ...newProduct, gstRate: parseInt(e.target.value) })}
                    >
                      <option value={0}>0% (Exempt)</option>
                      <option value={5}>5%</option>
                      <option value={12}>12%</option>
                      <option value={18}>18%</option>
                      <option value={28}>28%</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-text-muted">Unit</label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                      value={newProduct.unit}
                      onChange={(e) => setNewProduct({ ...newProduct, unit: e.target.value })}
                    >
                      <option value="pcs">Pieces (pcs)</option>
                      <option value="kg">Kilograms (kg)</option>
                      <option value="mtr">Meters (mtr)</option>
                      <option value="box">Box</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-text-muted">Purchase Price</label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={newProduct.purchasePrice}
                      onChange={(e) => setNewProduct({ ...newProduct, purchasePrice: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-text-muted">Sale Price *</label>
                    <Input
                      required
                      type="number"
                      placeholder="0.00"
                      value={newProduct.salePrice}
                      onChange={(e) => setNewProduct({ ...newProduct, salePrice: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-text-muted">Opening Stock</label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={newProduct.stockQuantity}
                      onChange={(e) => setNewProduct({ ...newProduct, stockQuantity: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-text-muted">Low Stock Alert</label>
                    <Input
                      type="number"
                      placeholder="5"
                      value={newProduct.lowStockAlert}
                      onChange={(e) => setNewProduct({ ...newProduct, lowStockAlert: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                <div className="border-t pt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold">Enable Reminder</label>
                    <input
                      type="checkbox"
                      checked={newProduct.reminderEnabled}
                      onChange={(e) => setNewProduct({ ...newProduct, reminderEnabled: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                  </div>
                  {newProduct.reminderEnabled && (
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase text-text-muted">Reminder Date & Time</label>
                      <Input
                        type="datetime-local"
                        value={newProduct.reminderDate}
                        onChange={(e) => setNewProduct({ ...newProduct, reminderDate: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" className="w-full">Save Product</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <div className="stat-card">
          <div className="text-[12px] text-text-muted uppercase tracking-wider font-bold mb-2">Total Stock Value</div>
          <div className="text-2xl font-bold text-text-main">{currency}{(totalStockValue || 0).toLocaleString()}</div>
          <div className="text-[11px] mt-2 text-text-muted">Based on sale price</div>
        </div>
        <div className="stat-card">
          <div className="text-[12px] text-text-muted uppercase tracking-wider font-bold mb-2">Low Stock Items</div>
          <div className="text-2xl font-bold text-warning">{lowStockItems.length}</div>
          <div className="text-[11px] mt-2 text-text-muted flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Needs reordering
          </div>
        </div>
        <div className="stat-card">
          <div className="text-[12px] text-text-muted uppercase tracking-wider font-bold mb-2">Total Items</div>
          <div className="text-2xl font-bold text-primary">{products.length}</div>
          <div className="text-[11px] mt-2 text-text-muted">Across {new Set(products.map(p => p.category)).size} categories</div>
        </div>
      </div>

      <div className="panel-card">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="relative flex-1 md:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <Input
              placeholder="Search products or categories..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-xl border border-border-main overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow className="hover:bg-transparent border-border-main">
                <TableHead className="font-bold uppercase text-[11px] tracking-wider text-text-muted">Product Details</TableHead>
                <TableHead className="font-bold uppercase text-[11px] tracking-wider text-text-muted">Category</TableHead>
                <TableHead className="font-bold uppercase text-[11px] tracking-wider text-text-muted">Stock</TableHead>
                <TableHead className="font-bold uppercase text-[11px] tracking-wider text-text-muted text-right">Sale Price</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((product) => (
                <TableRow key={product.id} className="border-border-main hover:bg-slate-50/50 transition-colors">
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-bold text-text-main">{product.name}</span>
                      <span className="text-[11px] text-text-muted flex items-center gap-1">
                        <Tag className="w-3 h-3" /> HSN: {product.hsnCode || 'N/A'} • GST: {product.gstRate}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-[11px] font-bold uppercase tracking-tight">
                      {product.category || 'General'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className={cn(
                        "font-bold",
                        product.stockQuantity <= (product.lowStockAlert || 0) ? "text-danger" : "text-text-main"
                      )}>
                        {product.stockQuantity} {product.unit}
                      </span>
                      {product.stockQuantity <= (product.lowStockAlert || 0) && (
                        <span className="text-[10px] text-danger font-bold uppercase">Low Stock</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="font-bold text-text-main">
                      {currency}{(product.salePrice || 0).toLocaleString()}
                    </span>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={
                        <Button variant="ghost" size="icon-sm">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      } />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => {
                          setSelectedProduct(product);
                          setNewProduct({ ...product });
                          setIsEditOpen(true);
                        }}>
                          <Edit2 className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDeleteProduct(product.id)} className="text-danger">
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <form onSubmit={handleEditProduct}>
            <DialogHeader>
              <DialogTitle>Edit Product</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {/* Same fields as Add Product */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-text-muted">Product Name *</label>
                  <Input
                    required
                    value={newProduct.name}
                    onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-text-muted">Category</label>
                  <Input
                    value={newProduct.category}
                    onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                  />
                </div>
              </div>
              {/* ... other fields ... */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-text-muted">HSN Code</label>
                  <Input
                    value={newProduct.hsnCode}
                    onChange={(e) => setNewProduct({ ...newProduct, hsnCode: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-text-muted">GST Rate (%)</label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={newProduct.gstRate}
                    onChange={(e) => setNewProduct({ ...newProduct, gstRate: parseInt(e.target.value) })}
                  >
                    <option value={0}>0% (Exempt)</option>
                    <option value={5}>5%</option>
                    <option value={12}>12%</option>
                    <option value={18}>18%</option>
                    <option value={28}>28%</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-text-muted">Unit</label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={newProduct.unit}
                    onChange={(e) => setNewProduct({ ...newProduct, unit: e.target.value })}
                  >
                    <option value="pcs">Pieces (pcs)</option>
                    <option value="kg">Kilograms (kg)</option>
                    <option value="mtr">Meters (mtr)</option>
                    <option value="box">Box</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-text-muted">Purchase Price</label>
                  <Input
                    type="number"
                    value={newProduct.purchasePrice}
                    onChange={(e) => setNewProduct({ ...newProduct, purchasePrice: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-text-muted">Sale Price *</label>
                  <Input
                    required
                    type="number"
                    value={newProduct.salePrice}
                    onChange={(e) => setNewProduct({ ...newProduct, salePrice: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-text-muted">Stock Quantity</label>
                  <Input
                    type="number"
                    value={newProduct.stockQuantity}
                    onChange={(e) => setNewProduct({ ...newProduct, stockQuantity: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-text-muted">Low Stock Alert</label>
                  <Input
                    type="number"
                    value={newProduct.lowStockAlert}
                    onChange={(e) => setNewProduct({ ...newProduct, lowStockAlert: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" className="w-full">Update Product</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
