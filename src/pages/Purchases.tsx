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
import autoTable from 'jspdf-autotable';
import { 
  Plus, 
  Search, 
  ShoppingCart, 
  Trash2, 
  Calculator,
  Calendar,
  Package,
  ArrowRight,
  MoreVertical,
  Edit2,
  Download,
  Camera,
  Image as ImageIcon,
  Eye,
  CheckCircle2,
  X
} from 'lucide-react';
import CameraCapture from '@/src/components/CameraCapture';
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
import { collection, addDoc, serverTimestamp, runTransaction, doc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { toast } from 'sonner';
import { Invoice, InvoiceItem, Party, Product, InvoiceType, PaymentMode } from '@/src/types';
import { cn } from '@/lib/utils';
import { convertToNumeric } from '@/src/lib/mappingService';
import { PrivacyValue } from '../components/PrivacyValue';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';

export default function Purchases() {
  const { invoices, parties, products, loading } = useBusiness();
  const { user, profile, currentBusiness } = useAuth();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isViewBillOpen, setIsViewBillOpen] = useState(false);
  const [isAddBillDialogOpen, setIsAddBillDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // New Purchase State
  const [selectedPartyId, setSelectedPartyId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [paidAmount, setPaidAmount] = useState(0);
  const [notes, setNotes] = useState('');
  const [billImageUrl, setBillImageUrl] = useState<string | null>(null);
  const [tempBillUrl, setTempBillUrl] = useState<string | null>(null);

  const currency = profile?.currency || '₹';
  const businessId = profile?.currentBusinessId;
  const invSettings = currentBusiness?.inventorySettings;

  // Track raw string inputs for alphanumeric fields
  const [rawInputs, setRawInputs] = useState<Record<string, { qty: string; price: string }>>({});

  const totals = useMemo(() => {
    const subTotal = invoiceItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const taxTotal = invoiceItems.reduce((acc, item) => acc + (item.total * (item.gstRate / 100)), 0);
    const grandTotal = subTotal + taxTotal;
    return { subTotal, taxTotal, grandTotal };
  }, [invoiceItems]);

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
        price: product.purchasePrice || 0,
        gstRate: product.gstRate || 0,
        discount: 0,
        total: product.purchasePrice || 0
      }]);
    }
  };

  const handleRemoveItem = (productId: string) => {
    setInvoiceItems(invoiceItems.filter(item => item.productId !== productId));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setBillImageUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreatePurchase = async () => {
    if (!user || !businessId || !selectedPartyId || invoiceItems.length === 0) {
      toast.error('Please select a supplier and add at least one item');
      return;
    }

    try {
      await runTransaction(db, async (transaction) => {
        // 1. PERFORM ALL READS FIRST
        const partyRef = doc(db, 'parties', selectedPartyId);
        const partyDoc = await transaction.get(partyRef);
        
        const productDocs = [];
        for (const item of invoiceItems) {
          const productRef = doc(db, 'products', item.productId);
          const pDoc = await transaction.get(productRef);
          productDocs.push({ ref: productRef, doc: pDoc, item });
        }

        // 2. CALCULATE AND PREPARE DATA
        const invoiceNumber = `PUR-${Date.now().toString().slice(-6)}`;
        const invoiceData = {
          userId: user.uid,
          businessId: businessId,
          partyId: selectedPartyId,
          invoiceNumber,
          date: invoiceDate,
          type: 'purchase' as InvoiceType,
          items: invoiceItems,
          subTotal: totals.subTotal,
          taxTotal: totals.taxTotal,
          discountTotal: 0,
          grandTotal: totals.grandTotal,
          paidAmount,
          paymentStatus: paidAmount >= totals.grandTotal ? 'paid' : paidAmount > 0 ? 'partial' : 'unpaid',
          paymentMode,
          notes,
          billImageUrl,
          createdAt: serverTimestamp(),
        };

        // 3. PERFORM ALL WRITES
        
        // Create Purchase Record
        const invoiceRef = doc(collection(db, 'invoices'));
        transaction.set(invoiceRef, invoiceData);

        // Update Party Balance (Supplier balance is negative for payable)
        if (partyDoc.exists()) {
          const currentBalance = partyDoc.data().balance || 0;
          const balanceChange = totals.grandTotal - paidAmount;
          transaction.update(partyRef, { balance: currentBalance - balanceChange });
        }

        // Update Product Stock (Increase)
        for (const { ref, doc: pDoc, item } of productDocs) {
          if (pDoc.exists()) {
            const currentStock = pDoc.data().stockQuantity || 0;
            transaction.update(ref, { stockQuantity: currentStock + item.quantity });
          }
        }
      });

      toast.success('Purchase recorded successfully');
      setIsAddOpen(false);
      resetForm();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'invoices');
    }
  };

  const handleDeletePurchase = async (invoice: Invoice) => {
    if (!confirm('Are you sure you want to delete this purchase? This will NOT revert stock or party balance automatically.')) return;
    try {
      await deleteDoc(doc(db, 'invoices', invoice.id));
      toast.success('Purchase deleted');
    } catch (error) {
      toast.error('Failed to delete purchase');
    }
  };

  const resetForm = () => {
    setSelectedPartyId('');
    setInvoiceItems([]);
    setPaidAmount(0);
    setNotes('');
    setBillImageUrl(null);
    setRawInputs({});
  };

  const handleUpdateBill = async () => {
    if (!selectedInvoice || !tempBillUrl) return;

    try {
      const invoiceRef = doc(db, 'invoices', selectedInvoice.id);
      await transactionUpdateBill(invoiceRef, tempBillUrl);
      toast.success('Bill updated successfully');
      setIsAddBillDialogOpen(false);
      setTempBillUrl(null);
    } catch (error) {
      toast.error('Failed to update bill');
    }
  };

  const transactionUpdateBill = async (invoiceRef: any, url: string) => {
    await runTransaction(db, async (transaction) => {
      transaction.update(invoiceRef, { billImageUrl: url });
    });
  };

  const generatePDF = (invoice: Invoice) => {
    try {
      const doc = new jsPDF();
      const party = parties.find(p => p.id === invoice.partyId);
      const template = currentBusiness?.invoiceTemplate || 'classic';
      
      // Use 'Rs.' for PDF if currency is '₹' to avoid character encoding issues in PDF
      const pdfCurrency = currency === '₹' ? 'Rs.' : currency;
      
      // Theme Colors
      const colors = {
        classic: [79, 70, 229], // Indigo
        modern: [16, 185, 129], // Emerald
        compact: [107, 114, 128], // Gray
        professional: [30, 41, 59] // Slate
      };
      const themeColor = colors[template as keyof typeof colors] || colors.classic;
      const pdfThemeColor = themeColor as [number, number, number];

      // Header
      if (template === 'modern') {
        doc.setFillColor(pdfThemeColor[0], pdfThemeColor[1], pdfThemeColor[2]);
        doc.rect(0, 0, 210, 40, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.text(currentBusiness?.name || 'Business Buddy', 14, 25);
        doc.setFontSize(10);
        doc.text(currentBusiness?.address || '', 14, 33);
        doc.setTextColor(0, 0, 0);
      } else {
        doc.setFontSize(20);
        doc.setTextColor(themeColor[0], themeColor[1], themeColor[2]);
        doc.text(currentBusiness?.name || 'Business Buddy', 14, 22);
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        doc.text(currentBusiness?.address || '', 14, 30);
        doc.text(`GST: ${currentBusiness?.gstNumber || 'N/A'}`, 14, 35);
      }
      
      // Invoice Info
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('PURCHASE BILL', 140, 22);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Bill No: ${invoice.invoiceNumber}`, 140, 30);
      doc.text(`Date: ${new Date(invoice.date).toLocaleDateString()}`, 140, 35);
      
      // Supplier
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Supplier:', 14, 55);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(party?.name || 'Unknown Supplier', 14, 62);
      doc.text(party?.address || '', 14, 67);
      doc.text(`Phone: ${party?.phone || 'N/A'}`, 14, 72);
      
      // Table
      const tableData = invoice.items.map(item => [
        item.name,
        item.quantity,
        `${pdfCurrency}${item.price}`,
        `${item.gstRate}%`,
        `${pdfCurrency}${item.total}`
      ]);
      
      autoTable(doc, {
        startY: 85,
        head: [['Item', 'Qty', 'Cost', 'GST', 'Total']],
        body: tableData,
        theme: template === 'compact' ? 'plain' : 'grid',
        headStyles: { fillColor: pdfThemeColor }
      });
      
      // Totals
      const finalY = (doc as any).lastAutoTable.finalY + 10;
      doc.text(`Sub Total: ${pdfCurrency}${invoice.subTotal}`, 140, finalY);
      doc.text(`Tax Total: ${pdfCurrency}${invoice.taxTotal}`, 140, finalY + 5);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(`Grand Total: ${pdfCurrency}${invoice.grandTotal}`, 140, finalY + 15);
      
      doc.save(`Purchase_${invoice.invoiceNumber}.pdf`);
      toast.success('PDF downloaded successfully');
    } catch (error) {
      console.error('PDF Generation Error:', error);
      toast.error('Failed to generate PDF. Please try again.');
    }
  };

  if (loading) return <div className="flex items-center justify-center h-full">Loading purchases...</div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Purchases</h2>
          <p className="text-muted-foreground">Record stock purchases from suppliers and track payables.</p>
        </div>
        
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger render={
            <Button className="gap-2">
              <Plus className="w-4 h-4" /> Record Purchase
            </Button>
          } />
          <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>New Purchase Bill</DialogTitle>
            </DialogHeader>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-text-muted">Select Supplier</label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={selectedPartyId}
                    onChange={(e) => setSelectedPartyId(e.target.value)}
                  >
                    <option value="">Choose a supplier...</option>
                    {parties.filter(p => p.type === 'supplier').map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.phone})</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-text-muted">Purchase Date</label>
                  <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
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
                        <span className="font-bold">{currency}{p.purchasePrice || 0}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="md:col-span-2 space-y-4">
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead className="text-[10px] uppercase font-bold">Item</TableHead>
                        <TableHead className="text-[10px] uppercase font-bold w-[120px]">Qty</TableHead>
                        <TableHead className="text-[10px] uppercase font-bold text-right">Cost</TableHead>
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
                              type={invSettings?.enableAlphanumericCodes ? "text" : "number"}
                              className="h-7 text-xs px-2"
                              value={rawInputs[item.productId]?.qty ?? item.quantity}
                              onChange={(e) => {
                                const val = e.target.value;
                                const numericVal = convertToNumeric(val, invSettings);
                                
                                setRawInputs(prev => ({
                                  ...prev,
                                  [item.productId]: { ...prev[item.productId], qty: val }
                                }));

                                setInvoiceItems(invoiceItems.map(i => 
                                  i.productId === item.productId ? { ...i, quantity: numericVal, total: numericVal * i.price } : i
                                ));
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type={invSettings?.enableAlphanumericCodes ? "text" : "number"}
                              className="h-7 text-xs px-2 text-right inline-block w-24"
                              value={rawInputs[item.productId]?.price ?? item.price}
                              onChange={(e) => {
                                const val = e.target.value;
                                const numericVal = convertToNumeric(val, invSettings);

                                setRawInputs(prev => ({
                                  ...prev,
                                  [item.productId]: { ...prev[item.productId], price: val }
                                }));

                                setInvoiceItems(invoiceItems.map(i => 
                                  i.productId === item.productId ? { ...i, price: numericVal, total: item.quantity * numericVal } : i
                                ));
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-right text-xs font-bold">{currency}{item.total}</TableCell>
                          <TableCell>
                            <button onClick={() => handleRemoveItem(item.productId)} className="text-danger">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
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

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-text-muted">Bill Receipt (Photo/Browse)</label>
                    <div className="flex gap-2 mb-2">
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm" 
                        className="flex-1 gap-2"
                        onClick={() => setIsCameraOpen(true)}
                      >
                        <Camera className="w-4 h-4" /> Take Photo
                      </Button>
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm" 
                        className="flex-1 gap-2"
                        onClick={() => document.getElementById('bill-upload')?.click()}
                      >
                        <ImageIcon className="w-4 h-4" /> Browse
                      </Button>
                    </div>

                    <div className="flex items-center gap-4">
                      <div 
                        className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-border-main rounded-lg p-4 hover:bg-slate-50 cursor-pointer transition-all relative overflow-hidden"
                        onClick={() => !billImageUrl && setIsCameraOpen(true)}
                      >
                        {billImageUrl ? (
                          <div className="relative group">
                            <img src={billImageUrl} alt="Bill Preview" className="max-h-32 rounded shadow-sm" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded">
                              <CheckCircle2 className="text-white w-8 h-8" />
                            </div>
                          </div>
                        ) : (
                          <>
                            <Camera className="w-6 h-6 text-text-muted mb-1" />
                            <span className="text-[10px] text-text-muted font-bold uppercase text-center">Capture or Upload Bill</span>
                          </>
                        )}
                        <input 
                          id="bill-upload" 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={handleFileChange} 
                        />
                      </div>
                      {billImageUrl && (
                        <Button 
                          variant="ghost" 
                          size="icon-sm" 
                          className="text-danger"
                          onClick={() => setBillImageUrl(null)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
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
              <Button onClick={handleCreatePurchase} className="gap-2">
                <Calculator className="w-4 h-4" /> Record Purchase
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="panel-card">
        <div className="rounded-xl border border-border-main overflow-hidden">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow className="hover:bg-transparent border-border-main">
                <TableHead className="font-bold uppercase text-[11px] tracking-wider text-text-muted">Bill Info</TableHead>
                <TableHead className="font-bold uppercase text-[11px] tracking-wider text-text-muted">Supplier</TableHead>
                <TableHead className="font-bold uppercase text-[11px] tracking-wider text-text-muted">Status</TableHead>
                <TableHead className="font-bold uppercase text-[11px] tracking-wider text-text-muted text-right">Total</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.filter(inv => inv.type === 'purchase').map((inv) => (
                <TableRow key={inv.id} className="border-border-main hover:bg-slate-50/50 transition-colors">
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-bold text-text-main">{inv.invoiceNumber}</span>
                      <span className="text-[11px] text-text-muted">{new Date(inv.date).toLocaleDateString()}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-medium">
                      {parties.find(p => p.id === inv.partyId)?.name || 'Unknown Supplier'}
                    </span>
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
                      <PrivacyValue value={(inv.grandTotal || 0).toLocaleString()} fieldId="totals" prefix={currency} />
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
                        <DropdownMenuItem onClick={() => generatePDF(inv)}>
                          <Download className="mr-2 h-4 w-4" /> Download PDF
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDeletePurchase(inv)} className="text-danger">
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                          setSelectedInvoice(inv);
                          setTempBillUrl(inv.billImageUrl || null);
                          setIsAddBillDialogOpen(true);
                        }}>
                          <Camera className="mr-2 h-4 w-4" /> {inv.billImageUrl ? 'Update Bill' : 'Add Bill'}
                        </DropdownMenuItem>
                        {inv.billImageUrl && (
                          <DropdownMenuItem onClick={() => {
                            setSelectedInvoice(inv);
                            setIsViewBillOpen(true);
                          }}>
                            <Eye className="mr-2 h-4 w-4" /> View Bill
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* View Bill Dialog */}
      <Dialog open={isViewBillOpen} onOpenChange={setIsViewBillOpen}>
        <DialogContent className="sm:max-w-[700px] p-0 overflow-hidden bg-white">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="flex justify-between items-center text-black">
              <span>Purchase Bill - {selectedInvoice?.invoiceNumber}</span>
              <Button variant="ghost" size="icon-sm" onClick={() => setIsViewBillOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="p-4 flex items-center justify-center bg-slate-50 min-h-[400px]">
            {selectedInvoice?.billImageUrl ? (
              <img 
                src={selectedInvoice.billImageUrl} 
                alt="Purchase Bill" 
                className="max-w-full max-h-[70vh] rounded shadow-lg object-contain"
              />
            ) : (
              <div className="text-center p-12">
                <ImageIcon className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">No bill image associated with this purchase.</p>
              </div>
            )}
          </div>
          <DialogFooter className="p-4 border-t bg-white">
            <Button variant="outline" onClick={() => setIsViewBillOpen(false)}>Close</Button>
            {selectedInvoice?.billImageUrl && (
              <Button onClick={() => {
                const link = document.createElement('a');
                link.href = selectedInvoice.billImageUrl!;
                link.download = `Bill_${selectedInvoice.invoiceNumber}.jpg`;
                link.click();
              }} className="gap-2">
                <Download className="w-4 h-4" /> Download Image
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Update Bill Dialog */}
      <Dialog open={isAddBillDialogOpen} onOpenChange={setIsAddBillDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>{selectedInvoice?.billImageUrl ? 'Update' : 'Add'} Bill for {selectedInvoice?.invoiceNumber}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="flex gap-2">
              <Button 
                type="button" 
                variant="outline" 
                className="flex-1 gap-2"
                onClick={() => setIsCameraOpen(true)}
              >
                <Camera className="w-4 h-4" /> Take Photo
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                className="flex-1 gap-2"
                onClick={() => document.getElementById('bill-upload-existing')?.click()}
              >
                <ImageIcon className="w-4 h-4" /> Browse
              </Button>
            </div>

            <div 
              className="w-full flex flex-col items-center justify-center border-2 border-dashed border-border-main rounded-xl p-8 hover:bg-slate-50 cursor-pointer transition-all relative overflow-hidden min-h-[250px]"
              onClick={() => !tempBillUrl && setIsCameraOpen(true)}
            >
              {tempBillUrl ? (
                <div className="relative group w-full flex justify-center">
                  <img src={tempBillUrl} alt="Bill Preview" className="max-h-56 rounded shadow-md" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded">
                    <Button variant="destructive" size="sm" onClick={(e) => { e.stopPropagation(); setTempBillUrl(null); }}>
                      <Trash2 className="w-4 h-4 mr-2" /> Remove
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <Camera className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500 font-medium">Capture or Upload Bill</p>
                  <p className="text-xs text-slate-400 mt-1">Image size will be optimized</p>
                </div>
              )}
              <input 
                id="bill-upload-existing" 
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onloadend = () => setTempBillUrl(reader.result as string);
                    reader.readAsDataURL(file);
                  }
                }} 
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsAddBillDialogOpen(false); setTempBillUrl(null); }}>Cancel</Button>
            <Button onClick={handleUpdateBill} disabled={!tempBillUrl} className="gap-2">
              <Plus className="w-4 h-4" /> Save Bill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CameraCapture 
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={(img) => {
          if (isAddBillDialogOpen) {
            setTempBillUrl(img);
          } else {
            setBillImageUrl(img);
          }
        }}
      />
    </div>
  );
}
