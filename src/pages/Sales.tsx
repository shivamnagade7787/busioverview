/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { useBusiness } from '@/src/contexts/BusinessContext';
import { useAuth } from '@/src/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { 
  Plus, 
  Search, 
  FileText, 
  Printer, 
  Share2, 
  Trash2, 
  Calculator,
  Calendar,
  User,
  Package,
  ArrowRight,
  MoreVertical,
  Edit2,
  MessageSquare,
  QrCode,
  Download
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
import { collection, addDoc, serverTimestamp, runTransaction, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { toast } from 'sonner';
import { Invoice, InvoiceItem, Party, Product, InvoiceType, PaymentMode } from '@/src/types';
import { cn } from '@/lib/utils';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';

export default function Sales() {
  const { invoices, parties, products, loading } = useBusiness();
  const { user, profile, currentBusiness } = useAuth();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // New Invoice State
  const [selectedPartyId, setSelectedPartyId] = useState('');
  const [invoiceType, setInvoiceType] = useState<InvoiceType>('sale');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [paidAmount, setPaidAmount] = useState(0);
  const [notes, setNotes] = useState('');
  const [quickAmount, setQuickAmount] = useState(0);

  const currency = profile?.currency || '₹';
  const businessId = profile?.currentBusinessId;

  const totals = useMemo(() => {
    if (invoiceItems.length === 0 && quickAmount > 0) {
      return { subTotal: quickAmount, taxTotal: 0, discountTotal: 0, grandTotal: quickAmount };
    }
    const subTotal = invoiceItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const discountTotal = invoiceItems.reduce((acc, item) => acc + (item.discount || 0), 0);
    const taxTotal = invoiceItems.reduce((acc, item) => acc + (item.total * (item.gstRate / 100)), 0);
    const grandTotal = subTotal - discountTotal + taxTotal;
    return { subTotal, taxTotal, discountTotal, grandTotal };
  }, [invoiceItems, quickAmount]);

  const handleAddItem = (product: Product) => {
    const existingItem = invoiceItems.find(item => item.productId === product.id);
    if (existingItem) {
      setInvoiceItems(invoiceItems.map(item => 
        item.productId === product.id 
          ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.price }
          : item
      ));
    } else {
      setInvoiceItems([...invoiceItems, {
        productId: product.id,
        name: product.name,
        quantity: 1,
        price: product.salePrice,
        gstRate: product.gstRate || 0,
        discount: 0,
        total: product.salePrice
      }]);
    }
    setQuickAmount(0);
  };

  const handleRemoveItem = (productId: string) => {
    setInvoiceItems(invoiceItems.filter(item => item.productId !== productId));
  };

  const handleCreateInvoice = async () => {
    if (!user || !businessId || !selectedPartyId) {
      toast.error('Please select a party');
      return;
    }

    if (invoiceItems.length === 0 && quickAmount <= 0) {
      toast.error('Please add items or enter a quick amount');
      return;
    }

    try {
      await runTransaction(db, async (transaction) => {
        const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
        const invoiceData = {
          userId: user.uid,
          businessId: businessId,
          partyId: selectedPartyId,
          invoiceNumber,
          date: invoiceDate,
          type: invoiceType,
          items: invoiceItems,
          subTotal: totals.subTotal,
          taxTotal: totals.taxTotal,
          discountTotal: totals.discountTotal,
          grandTotal: totals.grandTotal,
          paidAmount,
          paymentStatus: paidAmount >= totals.grandTotal ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
          paymentMode,
          notes,
          createdAt: serverTimestamp(),
        };

        // 1. Create Invoice
        const invoiceRef = doc(collection(db, 'invoices'));
        transaction.set(invoiceRef, invoiceData);

        // 2. Update Party Balance
        const partyRef = doc(db, 'parties', selectedPartyId);
        const partyDoc = await transaction.get(partyRef);
        if (partyDoc.exists()) {
          const currentBalance = partyDoc.data().balance || 0;
          const balanceChange = totals.grandTotal - paidAmount;
          transaction.update(partyRef, { balance: currentBalance + balanceChange });
        }

        // 3. Update Product Stock (only if items exist)
        for (const item of invoiceItems) {
          const productRef = doc(db, 'products', item.productId);
          const productDoc = await transaction.get(productRef);
          if (productDoc.exists()) {
            const currentStock = productDoc.data().stockQuantity || 0;
            transaction.update(productRef, { stockQuantity: currentStock - item.quantity });
          }
        }
      });

      toast.success('Invoice created successfully');
      setIsAddOpen(false);
      resetForm();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'invoices');
    }
  };

  const handleDeleteInvoice = async (invoice: Invoice) => {
    if (!confirm('Are you sure you want to delete this invoice? This will NOT revert stock or party balance automatically.')) return;
    try {
      await deleteDoc(doc(db, 'invoices', invoice.id));
      toast.success('Invoice deleted');
    } catch (error) {
      toast.error('Failed to delete invoice');
    }
  };

  const sendWhatsAppReceipt = (invoice: Invoice) => {
    const party = parties.find(p => p.id === invoice.partyId);
    if (!party) return;

    const upiLink = currentBusiness?.upiId 
      ? `upi://pay?pa=${currentBusiness.upiId}&pn=${encodeURIComponent(currentBusiness.name)}&am=${invoice.grandTotal}&cu=INR`
      : '';

    let message = `Hello ${party.name},\n\nThank you for your business with ${currentBusiness?.name}.\n\nInvoice: ${invoice.invoiceNumber}\nDate: ${new Date(invoice.date).toLocaleDateString()}\nTotal Amount: ${currency}${invoice.grandTotal}\nPaid: ${currency}${invoice.paidAmount}\nBalance: ${currency}${invoice.grandTotal - invoice.paidAmount}`;
    
    if (upiLink) {
      message += `\n\nYou can pay the balance using this UPI link: ${upiLink}\nOr pay to UPI ID: ${currentBusiness?.upiId}`;
    }
    
    message += `\n\nRegards,\n${currentBusiness?.name}`;
    
    window.open(`https://wa.me/${party.phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const generatePDF = (invoice: Invoice) => {
    const doc = new jsPDF();
    const party = parties.find(p => p.id === invoice.partyId);
    
    // Header
    doc.setFontSize(20);
    doc.text(currentBusiness?.name || 'Vyapar-X', 14, 22);
    doc.setFontSize(10);
    doc.text(currentBusiness?.address || '', 14, 30);
    doc.text(`GST: ${currentBusiness?.gstNumber || 'N/A'}`, 14, 35);
    
    // Invoice Info
    doc.setFontSize(12);
    doc.text('INVOICE', 140, 22);
    doc.setFontSize(10);
    doc.text(`Invoice No: ${invoice.invoiceNumber}`, 140, 30);
    doc.text(`Date: ${new Date(invoice.date).toLocaleDateString()}`, 140, 35);
    
    // Bill To
    doc.setFontSize(12);
    doc.text('Bill To:', 14, 55);
    doc.setFontSize(10);
    doc.text(party?.name || 'Walk-in Customer', 14, 62);
    doc.text(party?.address || '', 14, 67);
    doc.text(`Phone: ${party?.phone || 'N/A'}`, 14, 72);
    
    // Table
    const tableData = invoice.items.map(item => [
      item.name,
      item.quantity,
      `${currency}${item.price}`,
      `${item.gstRate}%`,
      `${currency}${item.total}`
    ]);
    
    (doc as any).autoTable({
      startY: 85,
      head: [['Item', 'Qty', 'Price', 'GST', 'Total']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] }
    });
    
    // Totals
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.text(`Sub Total: ${currency}${invoice.subTotal}`, 140, finalY);
    doc.text(`Tax Total: ${currency}${invoice.taxTotal}`, 140, finalY + 5);
    doc.text(`Discount: -${currency}${invoice.discountTotal}`, 140, finalY + 10);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Grand Total: ${currency}${invoice.grandTotal}`, 140, finalY + 20);
    
    // Footer
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Thank you for your business!', 14, finalY + 40);
    
    doc.save(`Invoice_${invoice.invoiceNumber}.pdf`);
  };

  const resetForm = () => {
    setSelectedPartyId('');
    setInvoiceItems([]);
    setPaidAmount(0);
    setNotes('');
    setQuickAmount(0);
  };

  if (loading) return <div className="flex items-center justify-center h-full">Loading sales...</div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Sales</h2>
          <p className="text-muted-foreground">Create invoices, estimates, and track your revenue.</p>
        </div>
        
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger render={
            <Button className="gap-2">
              <Plus className="w-4 h-4" /> Create Invoice
            </Button>
          } />
          <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New Sales Invoice</DialogTitle>
            </DialogHeader>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-4">
              {/* Left Column: Party & Details */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-text-muted">Select Customer</label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={selectedPartyId}
                    onChange={(e) => setSelectedPartyId(e.target.value)}
                  >
                    <option value="">Choose a party...</option>
                    <option value="walk-in">Walk-in Customer</option>
                    {parties.filter(p => p.type === 'customer').map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.phone})</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-text-muted">Invoice Date</label>
                    <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-text-muted">Type</label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                      value={invoiceType}
                      onChange={(e) => setInvoiceType(e.target.value as InvoiceType)}
                    >
                      <option value="sale">Sale Invoice</option>
                      <option value="estimate">Estimate</option>
                      <option value="proforma">Proforma</option>
                    </select>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-text-muted">Quick Amount (No Items)</label>
                  <Input 
                    type="number" 
                    placeholder="Enter total amount" 
                    value={quickAmount}
                    disabled={invoiceItems.length > 0}
                    onChange={(e) => setQuickAmount(parseFloat(e.target.value) || 0)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-text-muted">Add Items</label>
                  <div className="border rounded-lg p-2 max-h-[200px] overflow-y-auto space-y-1">
                    {products.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleAddItem(p)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 rounded-md flex justify-between items-center"
                      >
                        <span>{p.name}</span>
                        <span className="font-bold">{currency}{p.salePrice}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Middle Column: Items Table */}
              <div className="md:col-span-2 space-y-4">
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="text-[10px] uppercase font-bold">Item</TableHead>
                        <TableHead className="text-[10px] uppercase font-bold w-[80px]">Qty</TableHead>
                        <TableHead className="text-[10px] uppercase font-bold text-right">Price</TableHead>
                        <TableHead className="text-[10px] uppercase font-bold text-right">Total</TableHead>
                        <TableHead className="w-[40px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoiceItems.map((item) => (
                        <TableRow key={item.productId}>
                          <TableCell className="text-xs font-medium">{item.name}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              className="h-7 text-xs px-2"
                              value={item.quantity}
                              onChange={(e) => {
                                const qty = parseFloat(e.target.value) || 0;
                                setInvoiceItems(invoiceItems.map(i => 
                                  i.productId === item.productId ? { ...i, quantity: qty, total: qty * i.price } : i
                                ));
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-right text-xs">{currency}{item.price}</TableCell>
                          <TableCell className="text-right text-xs font-bold">{currency}{item.total}</TableCell>
                          <TableCell>
                            <button onClick={() => handleRemoveItem(item.productId)} className="text-danger">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {invoiceItems.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="h-24 text-center text-text-muted text-xs">
                            {quickAmount > 0 ? `Quick Amount: ${currency}${quickAmount}` : 'No items added yet.'}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase text-text-muted">Payment Mode</label>
                      <div className="flex gap-2">
                        {['cash', 'bank', 'upi'].map(mode => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setPaymentMode(mode as PaymentMode)}
                            className={cn(
                              "flex-1 py-1.5 text-[10px] font-bold uppercase rounded border transition-all",
                              paymentMode === mode ? "bg-primary text-white border-primary" : "border-border-main text-text-muted"
                            )}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase text-text-muted">Paid Amount</label>
                      <Input
                        type="number"
                        value={paidAmount}
                        onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)}
                        className="font-bold text-success"
                      />
                    </div>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-lg space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-text-muted">Sub Total</span>
                      <span>{currency}{(totals.subTotal || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-text-muted">Tax (GST)</span>
                      <span>{currency}{(totals.taxTotal || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-text-muted">Discount</span>
                      <span className="text-danger">-{currency}{(totals.discountTotal || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-base font-bold pt-2 border-t">
                      <span>Grand Total</span>
                      <span className="text-primary">{currency}{(totals.grandTotal || 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="border-t pt-4">
              <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateInvoice} className="gap-2">
                <Calculator className="w-4 h-4" /> Generate Invoice
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="panel-card">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="relative flex-1 md:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <Input
              placeholder="Search invoices..."
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
                <TableHead className="font-bold uppercase text-[11px] tracking-wider text-text-muted">Invoice Info</TableHead>
                <TableHead className="font-bold uppercase text-[11px] tracking-wider text-text-muted">Customer</TableHead>
                <TableHead className="font-bold uppercase text-[11px] tracking-wider text-text-muted">Status</TableHead>
                <TableHead className="font-bold uppercase text-[11px] tracking-wider text-text-muted text-right">Total</TableHead>
                <TableHead className="w-[120px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.filter(inv => inv.type === 'sale').map((inv) => (
                <TableRow key={inv.id} className="border-border-main hover:bg-slate-50/50 transition-colors">
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-bold text-text-main">{inv.invoiceNumber}</span>
                      <span className="text-[11px] text-text-muted flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {new Date(inv.date).toLocaleDateString()}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-slate-100 rounded-full flex items-center justify-center text-[10px] font-bold text-primary">
                        {parties.find(p => p.id === inv.partyId)?.name.substring(0, 2).toUpperCase() || '??'}
                      </div>
                      <span className="text-sm font-medium">
                        {parties.find(p => p.id === inv.partyId)?.name || 'Unknown Party'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={cn(
                      "status-pill",
                      inv.paymentStatus === 'paid' ? "bg-green-100 text-green-700" : 
                      inv.paymentStatus === 'partial' ? "bg-amber-100 text-amber-700" : 
                      "bg-red-100 text-red-700"
                    )}>
                      {inv.paymentStatus}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="font-bold text-text-main">
                      {currency}{(inv.grandTotal || 0).toLocaleString()}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger render={
                          <Button variant="ghost" size="icon-sm">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        } />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => generatePDF(inv)}>
                            <Download className="mr-2 h-4 w-4" /> Download PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => sendWhatsAppReceipt(inv)} className="text-success">
                            <MessageSquare className="mr-2 h-4 w-4" /> WhatsApp
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDeleteInvoice(inv)} className="text-danger">
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
