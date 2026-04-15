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
  Receipt, 
  Trash2, 
  Calendar,
  Tag,
  ArrowRight,
  TrendingDown,
  MoreVertical,
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
import { collection, addDoc, serverTimestamp, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { toast } from 'sonner';
import { Expense, PaymentMode } from '@/src/types';
import { cn } from '@/lib/utils';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';

const EXPENSE_CATEGORIES = [
  'Rent',
  'Salary',
  'Electricity',
  'Internet',
  'Marketing',
  'Office Supplies',
  'Travel',
  'Maintenance',
  'Others'
];

export default function Expenses() {
  const { expenses, loading } = useBusiness();
  const { user, profile } = useAuth();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [newExpense, setNewExpense] = useState({
    category: 'Others',
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    paymentMode: 'cash' as PaymentMode,
    notes: ''
  });

  const currency = profile?.currency || '₹';
  const businessId = profile?.currentBusinessId;

  const totalExpenses = expenses.reduce((acc, e) => acc + e.amount, 0);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !businessId) return;

    try {
      const expenseData = {
        ...newExpense,
        userId: user.uid,
        businessId: businessId,
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'expenses'), expenseData);
      toast.success('Expense recorded successfully');
      setIsAddOpen(false);
      setNewExpense({
        category: 'Others',
        amount: 0,
        date: new Date().toISOString().split('T')[0],
        paymentMode: 'cash',
        notes: ''
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'expenses');
    }
  };

  const handleEditExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExpense) return;

    try {
      await updateDoc(doc(db, 'expenses', selectedExpense.id), {
        ...newExpense
      });
      toast.success('Expense updated successfully');
      setIsEditOpen(false);
      setSelectedExpense(null);
    } catch (error) {
      toast.error('Failed to update expense');
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('Are you sure you want to delete this expense?')) return;
    try {
      await deleteDoc(doc(db, 'expenses', id));
      toast.success('Expense deleted');
    } catch (error) {
      toast.error('Failed to delete expense');
    }
  };

  if (loading) return <div className="flex items-center justify-center h-full">Loading expenses...</div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Expenses</h2>
          <p className="text-muted-foreground">Track your business spending and control costs.</p>
        </div>
        
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger render={
            <Button className="gap-2">
              <Plus className="w-4 h-4" /> Record Expense
            </Button>
          } />
          <DialogContent className="sm:max-w-[450px]">
            <form onSubmit={handleAddExpense}>
              <DialogHeader>
                <DialogTitle>New Expense Entry</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-text-muted">Category</label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={newExpense.category}
                    onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                  >
                    {EXPENSE_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-text-muted">Amount *</label>
                    <Input
                      required
                      type="number"
                      value={newExpense.amount}
                      onChange={(e) => setNewExpense({ ...newExpense, amount: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-text-muted">Date</label>
                    <Input type="date" value={newExpense.date} onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-text-muted">Payment Mode</label>
                  <div className="flex gap-2">
                    {['cash', 'bank', 'upi'].map(mode => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setNewExpense({ ...newExpense, paymentMode: mode as PaymentMode })}
                        className={cn(
                          "flex-1 py-1.5 text-[10px] font-bold uppercase rounded border transition-all",
                          newExpense.paymentMode === mode ? "bg-primary text-white border-primary" : "border-border-main text-text-muted"
                        )}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-text-muted">Notes</label>
                  <Input
                    placeholder="e.g. Monthly office rent"
                    value={newExpense.notes}
                    onChange={(e) => setNewExpense({ ...newExpense, notes: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" className="w-full">Save Expense</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <div className="stat-card">
          <div className="text-[12px] text-text-muted uppercase tracking-wider font-bold mb-2">Total Expenses</div>
          <div className="text-2xl font-bold text-danger">{currency}{(totalExpenses || 0).toLocaleString()}</div>
          <div className="text-[11px] mt-2 text-text-muted flex items-center gap-1">
            <TrendingDown className="w-3 h-3" /> Money going out
          </div>
        </div>
        <div className="stat-card">
          <div className="text-[12px] text-text-muted uppercase tracking-wider font-bold mb-2">Top Category</div>
          <div className="text-2xl font-bold text-text-main">
            {expenses.length > 0 
              ? Object.entries(expenses.reduce((acc, e) => ({ ...acc, [e.category]: (acc[e.category] || 0) + e.amount }), {} as any))
                  .sort((a: any, b: any) => b[1] - a[1])[0][0]
              : 'N/A'}
          </div>
          <div className="text-[11px] mt-2 text-text-muted">Highest spending area</div>
        </div>
        <div className="stat-card">
          <div className="text-[12px] text-text-muted uppercase tracking-wider font-bold mb-2">Entries</div>
          <div className="text-2xl font-bold text-primary">{expenses.length}</div>
          <div className="text-[11px] mt-2 text-text-muted">Total recorded expenses</div>
        </div>
      </div>

      <div className="panel-card">
        <div className="rounded-xl border border-border-main overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow className="hover:bg-transparent border-border-main">
                <TableHead className="font-bold uppercase text-[11px] tracking-wider text-text-muted">Date</TableHead>
                <TableHead className="font-bold uppercase text-[11px] tracking-wider text-text-muted">Category</TableHead>
                <TableHead className="font-bold uppercase text-[11px] tracking-wider text-text-muted">Notes</TableHead>
                <TableHead className="font-bold uppercase text-[11px] tracking-wider text-text-muted">Mode</TableHead>
                <TableHead className="font-bold uppercase text-[11px] tracking-wider text-text-muted text-right">Amount</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((e) => (
                <TableRow key={e.id} className="border-border-main hover:bg-slate-50/50 transition-colors">
                  <TableCell className="text-sm">{new Date(e.date).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-[11px] font-bold uppercase">
                      {e.category}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-text-muted truncate max-w-[200px]">{e.notes || '-'}</TableCell>
                  <TableCell>
                    <span className="text-[10px] uppercase font-bold text-text-muted">{e.paymentMode}</span>
                  </TableCell>
                  <TableCell className="text-right font-bold text-danger">
                    {currency}{(e.amount || 0).toLocaleString()}
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
                          setSelectedExpense(e);
                          setNewExpense({ ...e });
                          setIsEditOpen(true);
                        }}>
                          <Edit2 className="mr-2 h-4 w-4" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDeleteExpense(e.id)} className="text-danger">
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
        <DialogContent className="sm:max-w-[450px]">
          <form onSubmit={handleEditExpense}>
            <DialogHeader>
              <DialogTitle>Edit Expense</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-text-muted">Category</label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={newExpense.category}
                  onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                >
                  {EXPENSE_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-text-muted">Amount *</label>
                  <Input
                    required
                    type="number"
                    value={newExpense.amount}
                    onChange={(e) => setNewExpense({ ...newExpense, amount: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-text-muted">Date</label>
                  <Input type="date" value={newExpense.date} onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-text-muted">Payment Mode</label>
                <div className="flex gap-2">
                  {['cash', 'bank', 'upi'].map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setNewExpense({ ...newExpense, paymentMode: mode as PaymentMode })}
                      className={cn(
                        "flex-1 py-1.5 text-[10px] font-bold uppercase rounded border transition-all",
                        newExpense.paymentMode === mode ? "bg-primary text-white border-primary" : "border-border-main text-text-muted"
                      )}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-text-muted">Notes</label>
                <Input
                  value={newExpense.notes}
                  onChange={(e) => setNewExpense({ ...newExpense, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" className="w-full">Update Expense</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
