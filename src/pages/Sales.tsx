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
import { collection, addDoc, serverTimestamp, runTransaction, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { toast } from 'sonner';
import { Invoice, InvoiceItem, Party, Product, InvoiceType, PaymentMode } from '@/src/types';
import { cn } from '@/lib/utils';
import { convertToNumeric } from '@/src/lib/mappingService';
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
  const [selectedPartyId, setSelectedPartyId] = useState('walk-in');
  const [invoiceType, setInvoiceType] = useState<InvoiceType>('sale');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [paidAmount, setPaidAmount] = useState(0);
  const [notes, setNotes] = useState('');
  const [quickAmount, setQuickAmount] = useState(0);
  const [billImageUrl, setBillImageUrl] = useState<string | null>(null);

  const [isSendOpen, setIsSendOpen] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isViewBillOpen, setIsViewBillOpen] = useState(false);
  const [isAddBillDialogOpen, setIsAddBillDialogOpen] = useState(false);
  const [tempBillUrl, setTempBillUrl] = useState<string | null>(null);
  const [sendInvoice, setSendInvoice] = useState(true);
  const [sendLanguage, setSendLanguage] = useState<'en' | 'mr'>(currentBusiness?.language || 'en');

  const currency = profile?.currency || '₹';
  const businessId = profile?.currentBusinessId;
  const invSettings = currentBusiness?.inventorySettings;

  // Track raw string inputs for alphanumeric fields
  const [rawInputs, setRawInputs] = useState<Record<string, { qty: string; price: string }>>({});
  const [rawQuickAmount, setRawQuickAmount] = useState('');

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
        // 1. PERFORM ALL READS FIRST
        let partyDoc = null;
        if (selectedPartyId !== 'walk-in') {
          const partyRef = doc(db, 'parties', selectedPartyId);
          partyDoc = await transaction.get(partyRef);
        }
        
        const productDocs = [];
        for (const item of invoiceItems) {
          const productRef = doc(db, 'products', item.productId);
          const pDoc = await transaction.get(productRef);
          productDocs.push({ ref: productRef, doc: pDoc, item });
        }

        // 2. CALCULATE AND PREPARE DATA
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
          billImageUrl,
          createdAt: serverTimestamp(),
        };

        // 3. PERFORM ALL WRITES
        
        // Create Invoice
        const invoiceRef = doc(collection(db, 'invoices'));
        transaction.set(invoiceRef, invoiceData);

        // Update Party Balance
        if (selectedPartyId !== 'walk-in' && partyDoc && partyDoc.exists()) {
          const partyRef = doc(db, 'parties', selectedPartyId);
          const currentBalance = partyDoc.data().balance || 0;
          const balanceChange = totals.grandTotal - paidAmount;
          transaction.update(partyRef, { balance: currentBalance + balanceChange });
        }

        // Update Product Stock (Increase)
        for (const { ref, doc: pDoc, item } of productDocs) {
          if (pDoc.exists()) {
            const currentStock = pDoc.data().stockQuantity || 0;
            transaction.update(ref, { stockQuantity: currentStock - item.quantity });
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
    const party = parties.find(p => p.id === invoice.partyId) || { name: 'Walk-in Customer', phone: '' };
    const upiLink = currentBusiness?.upiId 
      ? `upi://pay?pa=${currentBusiness.upiId}&pn=${encodeURIComponent(currentBusiness.name)}&am=${invoice.grandTotal - invoice.paidAmount}&cu=INR`
      : '';

    const messages = {
      en: {
        greeting: `Hello ${party.name},`,
        thanks: `Thank you for your business with ${currentBusiness?.name}.`,
        invoice: `Invoice: ${invoice.invoiceNumber}`,
        date: `Date: ${new Date(invoice.date).toLocaleDateString()}`,
        total: `Total Amount: ${currency}${invoice.grandTotal}`,
        paid: `Paid: ${currency}${invoice.paidAmount}`,
        balance: `Balance: ${currency}${invoice.grandTotal - invoice.paidAmount}`,
        upi: `You can pay the balance using this UPI link: ${upiLink}\nOr pay to UPI ID: ${currentBusiness?.upiId}`,
        regards: `Regards,\n${currentBusiness?.name}`
      },
      mr: {
        greeting: `नमस्कार ${party.name},`,
        thanks: `${currentBusiness?.name} सोबत व्यवसाय केल्याबद्दल धन्यवाद.`,
        invoice: `बीजक क्रमांक: ${invoice.invoiceNumber}`,
        date: `दिनांक: ${new Date(invoice.date).toLocaleDateString()}`,
        total: `एकूण रक्कम: ${currency}${invoice.grandTotal}`,
        paid: `भरलेली रक्कम: ${currency}${invoice.paidAmount}`,
        balance: `शिल्लक: ${currency}${invoice.grandTotal - invoice.paidAmount}`,
        upi: `तुम्ही या UPI लिंकद्वारे शिल्लक रक्कम भरू शकता: ${upiLink}\nकिंवा या UPI आयडीवर पाठवा: ${currentBusiness?.upiId}`,
        regards: `आपला,\n${currentBusiness?.name}`
      }
    };

    const m = messages[sendLanguage];
    let message = `${m.greeting}\n\n${m.thanks}\n\n${m.invoice}\n${m.date}\n${m.total}\n${m.paid}\n${m.balance}`;
    
    if (upiLink && (invoice.grandTotal - invoice.paidAmount) > 0) {
      message += `\n\n${m.upi}`;
    }
    
    if (sendInvoice) {
      message += `\n\nDownload Invoice: ${window.location.origin}/invoice/${invoice.id}`;
    }

    message += `\n\n${m.regards}`;
    
    window.open(`https://wa.me/${party.phone}?text=${encodeURIComponent(message)}`, '_blank');
    setIsSendOpen(false);
  };

  const handleUpdateBill = async () => {
    if (!selectedInvoice || !tempBillUrl) return;

    try {
      const invoiceRef = doc(db, 'invoices', selectedInvoice.id);
      await runTransaction(db, async (transaction) => {
        transaction.update(invoiceRef, { billImageUrl: tempBillUrl });
      });
      toast.success('Document updated successfully');
      setIsAddBillDialogOpen(false);
      setTempBillUrl(null);
    } catch (error) {
      toast.error('Failed to update document');
    }
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
      doc.text('INVOICE', 140, 22);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(`Invoice No: ${invoice.invoiceNumber}`, 140, 30);
      doc.text(`Date: ${new Date(invoice.date).toLocaleDateString()}`, 140, 35);
      
      // Bill To
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Bill To:', 14, 55);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(party?.name || 'Walk-in Customer', 14, 62);
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
        head: [['Item', 'Qty', 'Price', 'GST', 'Total']],
        body: tableData,
        theme: template === 'compact' ? 'plain' : 'grid',
        headStyles: { fillColor: pdfThemeColor }
      });
      
      // Totals
      const finalY = (doc as any).lastAutoTable.finalY + 10;
      doc.text(`Sub Total: ${pdfCurrency}${invoice.subTotal}`, 140, finalY);
      doc.text(`Tax Total: ${pdfCurrency}${invoice.taxTotal}`, 140, finalY + 5);
      doc.text(`Discount: -${pdfCurrency}${invoice.discountTotal}`, 140, finalY + 10);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(`Grand Total: ${pdfCurrency}${invoice.grandTotal}`, 140, finalY + 20);
      
      // Footer
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text('Thank you for your business!', 14, finalY + 40);
      
      doc.save(`Invoice_${invoice.invoiceNumber}.pdf`);
      toast.success('PDF downloaded successfully');
    } catch (error) {
      console.error('PDF Generation Error:', error);
      toast.error('Failed to generate PDF. Please try again.');
    }
  };

  const resetForm = () => {
    setSelectedPartyId('walk-in');
    setInvoiceItems([]);
    setPaidAmount(0);
    setNotes('');
    setQuickAmount(0);
    setBillImageUrl(null);
    setRawInputs({});
    setRawQuickAmount('');
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
                    type={invSettings?.enableAlphanumericCodes ? "text" : "number"}
                    placeholder="Enter total amount" 
                    value={rawQuickAmount || quickAmount}
                    disabled={invoiceItems.length > 0}
                    onChange={(e) => {
                      const val = e.target.value;
                      const numericVal = convertToNumeric(val, invSettings);
                      setRawQuickAmount(val);
                      setQuickAmount(numericVal);
                    }}
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
                        <TableHead className="text-[10px] uppercase font-bold w-[120px]">Qty</TableHead>
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

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-text-muted">Document (Photo/Browse)</label>
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
                        onClick={() => document.getElementById('sale-doc-upload')?.click()}
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
                            <img src={billImageUrl} alt="Doc Preview" className="max-h-32 rounded shadow-sm" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded">
                              <CheckCircle2 className="text-white w-8 h-8" />
                            </div>
                          </div>
                        ) : (
                          <>
                            <Camera className="w-6 h-6 text-text-muted mb-1" />
                            <span className="text-[10px] text-text-muted font-bold uppercase text-center">Capture Document</span>
                          </>
                        )}
                        <input 
                          id="sale-doc-upload" 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onloadend = () => setBillImageUrl(reader.result as string);
                              reader.readAsDataURL(file);
                            }
                          }} 
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
              <div className="flex gap-2">
                <Button variant="secondary" onClick={handleCreateInvoice} className="gap-2">
                  <Plus className="w-4 h-4" /> Add Sale
                </Button>
                <Button onClick={handleCreateInvoice} className="gap-2">
                  <Calculator className="w-4 h-4" /> Generate Invoice
                </Button>
              </div>
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
                        {inv.partyId === 'walk-in' ? 'WC' : parties.find(p => p.id === inv.partyId)?.name.substring(0, 2).toUpperCase() || '??'}
                      </div>
                      <span className="text-sm font-medium">
                        {inv.partyId === 'walk-in' ? 'Walk-in Customer' : parties.find(p => p.id === inv.partyId)?.name || 'Unknown Party'}
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
                          <DropdownMenuItem onClick={() => {
                            setSelectedInvoice(inv);
                            setSendLanguage(currentBusiness?.language || 'en');
                            setIsSendOpen(true);
                          }} className="text-success">
                            <MessageSquare className="mr-2 h-4 w-4" /> WhatsApp
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDeleteInvoice(inv)} className="text-danger">
                            <Trash2 className="mr-2 h-4 w-4" /> Delete
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            setSelectedInvoice(inv);
                            setTempBillUrl(inv.billImageUrl || null);
                            setIsAddBillDialogOpen(true);
                          }}>
                            <Camera className="mr-2 h-4 w-4" /> {inv.billImageUrl ? 'Update Document' : 'Add Document'}
                          </DropdownMenuItem>
                          {inv.billImageUrl && (
                            <DropdownMenuItem onClick={() => {
                              setSelectedInvoice(inv);
                              setIsViewBillOpen(true);
                            }}>
                              <Eye className="mr-2 h-4 w-4" /> View Document
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Dialog open={isSendOpen} onOpenChange={setIsSendOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Send Receipt via WhatsApp</DialogTitle>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-text-muted">Select Language</label>
                <div className="flex gap-2">
                  <Button 
                    variant={sendLanguage === 'en' ? 'default' : 'outline'} 
                    className="flex-1"
                    onClick={() => setSendLanguage('en')}
                  >
                    English
                  </Button>
                  <Button 
                    variant={sendLanguage === 'mr' ? 'default' : 'outline'} 
                    className="flex-1"
                    onClick={() => setSendLanguage('mr')}
                  >
                    Marathi (मराठी)
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-border-main">
                <div className="space-y-0.5">
                  <div className="text-sm font-bold">Include Invoice Link</div>
                  <div className="text-xs text-text-muted">Send a link to download the PDF invoice</div>
                </div>
                <input 
                  type="checkbox" 
                  checked={sendInvoice} 
                  onChange={(e) => setSendInvoice(e.target.checked)}
                  className="w-5 h-5 accent-primary"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsSendOpen(false)}>Cancel</Button>
              <Button onClick={() => selectedInvoice && sendWhatsAppReceipt(selectedInvoice)} className="gap-2">
                <MessageSquare className="w-4 h-4" /> Send on WhatsApp
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Bill Dialog */}
        <Dialog open={isViewBillOpen} onOpenChange={setIsViewBillOpen}>
          <DialogContent className="sm:max-w-[700px] p-0 overflow-hidden bg-white">
            <DialogHeader className="p-4 border-b">
              <DialogTitle className="flex justify-between items-center text-black">
                <span>Invoice Document - {selectedInvoice?.invoiceNumber}</span>
                <Button variant="ghost" size="icon-sm" onClick={() => setIsViewBillOpen(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </DialogTitle>
            </DialogHeader>
            <div className="p-4 flex items-center justify-center bg-slate-50 min-h-[400px]">
              {selectedInvoice?.billImageUrl ? (
                <img 
                  src={selectedInvoice.billImageUrl} 
                  alt="Invoice Document" 
                  className="max-w-full max-h-[70vh] rounded shadow-lg object-contain"
                />
              ) : (
                <div className="text-center p-12">
                  <ImageIcon className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500">No document image associated with this invoice.</p>
                </div>
              )}
            </div>
            <DialogFooter className="p-4 border-t bg-white">
              <Button variant="outline" onClick={() => setIsViewBillOpen(false)}>Close</Button>
              {selectedInvoice?.billImageUrl && (
                <Button onClick={() => {
                  const link = document.createElement('a');
                  link.href = selectedInvoice.billImageUrl!;
                  link.download = `Doc_${selectedInvoice.invoiceNumber}.jpg`;
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
              <DialogTitle>{selectedInvoice?.billImageUrl ? 'Update' : 'Add'} Document for {selectedInvoice?.invoiceNumber}</DialogTitle>
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
                  onClick={() => document.getElementById('doc-upload-existing-sales')?.click()}
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
                    <img src={tempBillUrl} alt="Document Preview" className="max-h-56 rounded shadow-md" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded">
                      <Button variant="destructive" size="sm" onClick={(e) => { e.stopPropagation(); setTempBillUrl(null); }}>
                        <Trash2 className="w-4 h-4 mr-2" /> Remove
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center">
                    <Camera className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-500 font-medium">Capture or Upload Document</p>
                    <p className="text-xs text-slate-400 mt-1">Image size will be optimized</p>
                  </div>
                )}
                <input 
                  id="doc-upload-existing-sales" 
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
                <Plus className="w-4 h-4" /> Save Document
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
    </div>
  );
}
