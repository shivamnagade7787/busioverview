/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { useBusiness } from '@/src/contexts/BusinessContext';
import { useAuth } from '@/src/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Plus, 
  IndianRupee, 
  Building2, 
  ArrowUpRight, 
  ArrowDownRight,
  Wallet,
  History,
  CreditCard,
  Trash2,
  Edit2,
  MoreVertical
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
import { cn } from '@/lib/utils';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';

export default function CashBank() {
  const { bankAccounts, invoices, expenses, loading } = useBusiness();
  const { user, profile } = useAuth();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  
  const [newAccount, setNewAccount] = useState({
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    balance: 0
  });

  const currency = profile?.currency || '₹';
  const businessId = profile?.currentBusinessId;

  const cashInHand = useMemo(() => {
    const salesCash = invoices
      .filter(i => i.type === 'sale' && i.paymentMode === 'cash')
      .reduce((acc, i) => acc + i.paidAmount, 0);
    
    const purchaseCash = invoices
      .filter(i => i.type === 'purchase' && i.paymentMode === 'cash')
      .reduce((acc, i) => acc + i.paidAmount, 0);
    
    const expenseCash = expenses
      .filter(e => e.paymentMode === 'cash')
      .reduce((acc, e) => acc + e.amount, 0);
    
    return salesCash - purchaseCash - expenseCash;
  }, [invoices, expenses]);

  const totalBankBalance = bankAccounts.reduce((acc, b) => acc + b.balance, 0);

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !businessId) return;

    try {
      const accountData = {
        ...newAccount,
        userId: user.uid,
        businessId: businessId,
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'bank_accounts'), accountData);
      toast.success('Bank account added successfully');
      setIsAddOpen(false);
      setNewAccount({ bankName: '', accountNumber: '', ifscCode: '', balance: 0 });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'bank_accounts');
    }
  };

  const handleEditAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) return;

    try {
      await updateDoc(doc(db, 'bank_accounts', selectedAccount.id), {
        ...newAccount
      });
      toast.success('Account updated successfully');
      setIsEditOpen(false);
      setSelectedAccount(null);
    } catch (error) {
      toast.error('Failed to update account');
    }
  };

  const handleDeleteAccount = async (id: string) => {
    if (!confirm('Are you sure you want to delete this bank account?')) return;
    try {
      await deleteDoc(doc(db, 'bank_accounts', id));
      toast.success('Account deleted');
    } catch (error) {
      toast.error('Failed to delete account');
    }
  };

  if (loading) return <div className="flex items-center justify-center h-full">Loading cash & bank...</div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Cash & Bank</h2>
          <p className="text-muted-foreground">Monitor your liquidity across cash and bank accounts.</p>
        </div>
        
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger render={
            <Button className="gap-2">
              <Plus className="w-4 h-4" /> Add Bank Account
            </Button>
          } />
          <DialogContent className="sm:max-w-[450px]">
            <form onSubmit={handleAddAccount}>
              <DialogHeader>
                <DialogTitle>Add New Bank Account</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-text-muted">Bank Name *</label>
                  <Input
                    required
                    placeholder="e.g. HDFC Bank"
                    value={newAccount.bankName}
                    onChange={(e) => setNewAccount({ ...newAccount, bankName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-text-muted">Account Number</label>
                  <Input
                    placeholder="XXXX XXXX XXXX"
                    value={newAccount.accountNumber}
                    onChange={(e) => setNewAccount({ ...newAccount, accountNumber: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-text-muted">IFSC Code</label>
                    <Input
                      placeholder="HDFC0001234"
                      value={newAccount.ifscCode}
                      onChange={(e) => setNewAccount({ ...newAccount, ifscCode: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-text-muted">Opening Balance *</label>
                    <Input
                      required
                      type="number"
                      value={newAccount.balance}
                      onChange={(e) => setNewAccount({ ...newAccount, balance: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" className="w-full">Save Account</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="stat-card bg-primary text-white border-none">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-[12px] opacity-80 uppercase tracking-wider font-bold mb-2">Cash in Hand</div>
              <div className="text-4xl font-bold">{currency}{(cashInHand || 0).toLocaleString()}</div>
            </div>
            <div className="p-3 bg-white/20 rounded-xl">
              <Wallet className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-6 flex items-center gap-2 text-xs font-medium bg-white/10 p-2 rounded-lg">
            <History className="w-3.5 h-3.5" /> Tracked from all cash transactions
          </div>
        </div>

        <div className="stat-card bg-slate-900 text-white border-none">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-[12px] opacity-80 uppercase tracking-wider font-bold mb-2">Bank Balance</div>
              <div className="text-4xl font-bold">{currency}{(totalBankBalance || 0).toLocaleString()}</div>
            </div>
            <div className="p-3 bg-white/20 rounded-xl">
              <Building2 className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-6 flex items-center gap-2 text-xs font-medium bg-white/10 p-2 rounded-lg">
            <CreditCard className="w-3.5 h-3.5" /> Across {bankAccounts.length} linked accounts
          </div>
        </div>
      </div>

      <div className="panel-card">
        <div className="text-base font-bold mb-6">Bank Accounts</div>
        <div className="grid gap-4 md:grid-cols-3">
          {bankAccounts.map((account) => (
            <div key={account.id} className="p-4 rounded-xl border border-border-main hover:border-primary/50 transition-all group relative">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-primary">
                  <Building2 className="w-5 h-5" />
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-text-muted uppercase font-bold">Balance</div>
                  <div className="text-lg font-bold text-text-main">{currency}{(account.balance || 0).toLocaleString()}</div>
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-sm font-bold text-text-main">{account.bankName}</div>
                <div className="text-xs text-text-muted font-mono">{account.accountNumber || 'No A/C Number'}</div>
                <div className="text-[10px] text-text-muted uppercase font-bold pt-2">IFSC: {account.ifscCode || 'N/A'}</div>
              </div>
              
              <div className="absolute top-2 right-2">
                <DropdownMenu>
                  <DropdownMenuTrigger render={
                    <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  } />
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => {
                      setSelectedAccount(account);
                      setNewAccount({ ...account });
                      setIsEditOpen(true);
                    }}>
                      <Edit2 className="mr-2 h-4 w-4" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleDeleteAccount(account.id)} className="text-danger">
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
          {bankAccounts.length === 0 && (
            <div className="col-span-3 py-12 text-center border-2 border-dashed border-border-main rounded-xl text-text-muted">
              <Building2 className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p>No bank accounts added yet.</p>
            </div>
          )}
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <form onSubmit={handleEditAccount}>
            <DialogHeader>
              <DialogTitle>Edit Bank Account</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-text-muted">Bank Name *</label>
                <Input
                  required
                  value={newAccount.bankName}
                  onChange={(e) => setNewAccount({ ...newAccount, bankName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-text-muted">Account Number</label>
                <Input
                  value={newAccount.accountNumber}
                  onChange={(e) => setNewAccount({ ...newAccount, accountNumber: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-text-muted">IFSC Code</label>
                  <Input
                    value={newAccount.ifscCode}
                    onChange={(e) => setNewAccount({ ...newAccount, ifscCode: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-text-muted">Balance *</label>
                  <Input
                    required
                    type="number"
                    value={newAccount.balance}
                    onChange={(e) => setNewAccount({ ...newAccount, balance: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" className="w-full">Update Account</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
