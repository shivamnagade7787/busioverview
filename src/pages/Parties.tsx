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
  Phone, 
  MapPin, 
  MoreVertical, 
  MessageSquare,
  ArrowUpRight,
  ArrowDownRight,
  UserPlus,
  Filter,
  Trash2,
  Edit2,
  History,
  CreditCard,
  Wallet,
  QrCode,
  Share2
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
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
import { collection, addDoc, serverTimestamp, updateDoc, doc, deleteDoc, increment } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { toast } from 'sonner';
import { Party, PartyType, LedgerEntry } from '@/src/types';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';

export default function Parties() {
  const { parties, ledger, loading } = useBusiness();
  const { user, profile, currentBusiness } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);
  const [isQROpen, setIsQROpen] = useState(false);
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  const [partyType, setPartyType] = useState<PartyType>('customer');
  
  const [newParty, setNewParty] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    gstNumber: '',
    balance: 0
  });

  const [ledgerEntry, setLedgerEntry] = useState({
    type: 'credit' as 'credit' | 'debit',
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    description: ''
  });

  const currency = profile?.currency || '₹';
  const businessId = profile?.currentBusinessId;

  const filteredParties = parties.filter(p => 
    p.type === partyType &&
    (p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.phone.includes(searchTerm))
  );

  const totalReceivable = parties
    .filter(p => p.type === 'customer' && p.balance > 0)
    .reduce((acc, p) => acc + p.balance, 0);

  const totalPayable = parties
    .filter(p => p.type === 'supplier' && p.balance < 0)
    .reduce((acc, p) => acc + Math.abs(p.balance), 0);

  const handleAddParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !businessId) return;

    try {
      const partyData = {
        ...newParty,
        userId: user.uid,
        businessId: businessId,
        type: partyType,
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'parties'), partyData);
      toast.success(`${partyType === 'customer' ? 'Customer' : 'Supplier'} added successfully`);
      setIsAddOpen(false);
      setNewParty({ name: '', phone: '', email: '', address: '', gstNumber: '', balance: 0 });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'parties');
    }
  };

  const handleEditParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedParty) return;

    try {
      await updateDoc(doc(db, 'parties', selectedParty.id), {
        name: newParty.name,
        phone: newParty.phone,
        email: newParty.email,
        address: newParty.address,
        gstNumber: newParty.gstNumber
      });
      toast.success('Party updated successfully');
      setIsEditOpen(false);
      setSelectedParty(null);
    } catch (error) {
      toast.error('Failed to update party');
    }
  };

  const handleDeleteParty = async (id: string) => {
    if (!confirm('Are you sure you want to delete this party?')) return;
    try {
      await deleteDoc(doc(db, 'parties', id));
      toast.success('Party deleted');
    } catch (error) {
      toast.error('Failed to delete party');
    }
  };

  const handleAddLedgerEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !businessId || !selectedParty) return;

    try {
      const entryData = {
        ...ledgerEntry,
        userId: user.uid,
        businessId: businessId,
        partyId: selectedParty.id,
        createdAt: serverTimestamp(),
      };

      await addDoc(collection(db, 'ledger'), entryData);
      
      // Update party balance
      const balanceChange = ledgerEntry.type === 'credit' ? ledgerEntry.amount : -ledgerEntry.amount;
      await updateDoc(doc(db, 'parties', selectedParty.id), {
        balance: increment(balanceChange)
      });

      toast.success('Ledger entry added');
      setLedgerEntry({
        type: 'credit',
        amount: 0,
        date: new Date().toISOString().split('T')[0],
        description: ''
      });
    } catch (error) {
      toast.error('Failed to add ledger entry');
    }
  };

  const sendWhatsApp = (party: Party) => {
    const upiLink = currentBusiness?.upiId 
      ? `upi://pay?pa=${currentBusiness.upiId}&pn=${encodeURIComponent(currentBusiness.name)}&cu=INR&am=${Math.abs(party.balance)}`
      : '';
    
    const qrCodeLink = upiLink 
      ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiLink)}`
      : '';
    
    const language = currentBusiness?.language || 'en';
    
    const messages = {
      en: {
        reminder: `Hello ${party.name}, this is a reminder regarding your outstanding balance of ${currency}${Math.abs(party.balance)} with ${currentBusiness?.name}.`,
        upi: `You can pay using this UPI link: ${upiLink}\nOr pay to UPI ID: ${currentBusiness?.upiId}`,
        qr: `Scan this QR code to pay: ${qrCodeLink}`,
        footer: `Please settle it at your earliest convenience. Thank you!`
      },
      mr: {
        reminder: `नमस्कार ${party.name}, ${currentBusiness?.name} कडील तुमची ${currency}${Math.abs(party.balance)} ची थकबाकी भरण्याबाबत ही आठवण आहे.`,
        upi: `तुम्ही या UPI लिंकद्वारे पैसे भरू शकता: ${upiLink}\nकिंवा या UPI आयडीवर पाठवा: ${currentBusiness?.upiId}`,
        qr: `पैसे भरण्यासाठी हा QR कोड स्कॅन करा: ${qrCodeLink}`,
        footer: `कृपया लवकरात लवकर थकबाकी भरा. धन्यवाद!`
      }
    };

    const m = messages[language as keyof typeof messages] || messages.en;
    let message = m.reminder;
    
    if (upiLink && party.balance > 0) {
      message += `\n\n${m.upi}`;
      if (qrCodeLink) {
        message += `\n\n${m.qr}`;
      }
    }
    
    message += `\n\n${m.footer}`;
    
    window.open(`https://wa.me/${party.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const shareQR = async (party: Party) => {
    if (!currentBusiness?.upiId) {
      toast.error('Please setup UPI ID in Business Settings first');
      return;
    }

    try {
      // Find the SVG element in the hidden div
      const svg = document.getElementById('qr-source');
      if (!svg) throw new Error('QR Source not found');

      const svgData = new XMLSerializer().serializeToString(svg);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      img.onload = async () => {
        canvas.width = img.width + 40;
        canvas.height = img.height + 150;
        if (ctx) {
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          
          // Draw text header
          ctx.fillStyle = 'black';
          ctx.font = 'bold 24px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(currentBusiness?.name || 'Business Buddy', canvas.width / 2, 40);
          
          ctx.font = 'bold 36px sans-serif';
          ctx.fillStyle = '#2563eb'; // Primary color
          ctx.fillText(`${currency}${Math.abs(party.balance).toLocaleString()}`, canvas.width / 2, 90);
          
          ctx.font = '16px sans-serif';
          ctx.fillStyle = '#64748b';
          ctx.fillText(`Request from ${party.name}`, canvas.width / 2, 120);

          // Draw the QR code
          ctx.drawImage(img, 20, 140);

          // Draw footer
          ctx.font = 'bold 14px monospace';
          ctx.fillStyle = '#64748b';
          ctx.fillText(`UPI ID: ${currentBusiness?.upiId}`, canvas.width / 2, canvas.height - 20);

          canvas.toBlob(async (blob) => {
            if (!blob) return;
            const file = new File([blob], `payment_qr_${party.name}.png`, { type: 'image/png' });
            
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
              await navigator.share({
                files: [file],
                title: `Payment QR for ${party.name}`,
                text: `Hello ${party.name}, please settle your balance of ${currency}${Math.abs(party.balance)}.`
              });
            } else {
              // If sharing files is not supported, at least offer to download or send text
              sendWhatsApp(party);
            }
          }, 'image/png');
        }
        URL.revokeObjectURL(url);
      };
      img.src = url;
    } catch (error) {
      console.error('Error sharing QR:', error);
      sendWhatsApp(party);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full">Loading parties...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Parties</h2>
          <p className="text-muted-foreground">Manage your customers and suppliers in one place.</p>
        </div>
        
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger render={
            <Button className="gap-2">
              <Plus className="w-4 h-4" /> Add Party
            </Button>
          } />
          <DialogContent className="sm:max-w-[500px]">
            <form onSubmit={handleAddParty}>
              <DialogHeader>
                <DialogTitle>Add New {partyType === 'customer' ? 'Customer' : 'Supplier'}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-text-muted">Party Type</label>
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                      <button
                        type="button"
                        onClick={() => setPartyType('customer')}
                        className={cn(
                          "flex-1 py-1.5 text-xs font-bold rounded-md transition-all",
                          partyType === 'customer' ? "bg-white shadow-sm text-primary" : "text-text-muted"
                        )}
                      >
                        Customer
                      </button>
                      <button
                        type="button"
                        onClick={() => setPartyType('supplier')}
                        className={cn(
                          "flex-1 py-1.5 text-xs font-bold rounded-md transition-all",
                          partyType === 'supplier' ? "bg-white shadow-sm text-primary" : "text-text-muted"
                        )}
                      >
                        Supplier
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-text-muted">Opening Balance</label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={newParty.balance}
                      onChange={(e) => setNewParty({ ...newParty, balance: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-text-muted">Party Name *</label>
                  <Input
                    required
                    placeholder="Enter name"
                    value={newParty.name}
                    onChange={(e) => setNewParty({ ...newParty, name: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-text-muted">Phone Number *</label>
                    <Input
                      required
                      placeholder="9876543210"
                      value={newParty.phone}
                      onChange={(e) => setNewParty({ ...newParty, phone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-text-muted">GST Number (Optional)</label>
                    <Input
                      placeholder="27AAAAA0000A1Z5"
                      value={newParty.gstNumber}
                      onChange={(e) => setNewParty({ ...newParty, gstNumber: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-text-muted">Address</label>
                  <Input
                    placeholder="Full address"
                    value={newParty.address}
                    onChange={(e) => setNewParty({ ...newParty, address: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" className="w-full">Save Party</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <div className="stat-card">
          <div className="text-[12px] text-text-muted uppercase tracking-wider font-bold mb-2">Total Receivable</div>
          <div className="text-2xl font-bold text-success">{currency}{(totalReceivable || 0).toLocaleString()}</div>
          <div className="text-[11px] mt-2 text-text-muted">From {parties.filter(p => p.type === 'customer' && p.balance > 0).length} customers</div>
        </div>
        <div className="stat-card">
          <div className="text-[12px] text-text-muted uppercase tracking-wider font-bold mb-2">Total Payable</div>
          <div className="text-2xl font-bold text-danger">{currency}{(totalPayable || 0).toLocaleString()}</div>
          <div className="text-[11px] mt-2 text-text-muted">To {parties.filter(p => p.type === 'supplier' && p.balance < 0).length} suppliers</div>
        </div>
        <div className="stat-card">
          <div className="text-[12px] text-text-muted uppercase tracking-wider font-bold mb-2">Net Balance</div>
          <div className={cn("text-2xl font-bold", (totalReceivable - totalPayable) >= 0 ? "text-primary" : "text-danger")}>
            {currency}{((totalReceivable - totalPayable) || 0).toLocaleString()}
          </div>
          <div className="text-[11px] mt-2 text-text-muted">Overall credit position</div>
        </div>
      </div>

      <div className="panel-card">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <Tabs value={partyType} onValueChange={(v) => setPartyType(v as PartyType)} className="w-full md:w-auto">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="customer">Customers</TabsTrigger>
              <TabsTrigger value="supplier">Suppliers</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative flex-1 md:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <Input
              placeholder={`Search ${partyType}s...`}
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
                <TableHead className="font-bold uppercase text-[11px] tracking-wider text-text-muted">Party Name</TableHead>
                <TableHead className="font-bold uppercase text-[11px] tracking-wider text-text-muted">Contact</TableHead>
                <TableHead className="font-bold uppercase text-[11px] tracking-wider text-text-muted">GSTIN</TableHead>
                <TableHead className="font-bold uppercase text-[11px] tracking-wider text-text-muted text-right">Balance</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredParties.map((party) => (
                <TableRow key={party.id} className="border-border-main hover:bg-slate-50/50 transition-colors">
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-bold text-text-main">{party.name}</span>
                      <span className="text-[11px] text-text-muted flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {party.address || 'No address'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-primary" /> {party.phone}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-mono text-text-muted">{party.gstNumber || '-'}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end">
                      <span className={cn(
                        "font-bold text-base",
                        party.balance > 0 ? "text-success" : party.balance < 0 ? "text-danger" : "text-text-main"
                      )}>
                        {currency}{(Math.abs(party.balance) || 0).toLocaleString()}
                      </span>
                      <span className="text-[10px] uppercase font-bold tracking-tighter">
                        {party.balance > 0 ? "Receivable" : party.balance < 0 ? "Payable" : "Settled"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger render={
                          <Button variant="ghost" size="icon-sm">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        } />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => {
                            setSelectedParty(party);
                            setIsLedgerOpen(true);
                          }}>
                            <History className="mr-2 h-4 w-4" /> Ledger
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            setSelectedParty(party);
                            setNewParty({ ...party });
                            setIsEditOpen(true);
                          }}>
                            <Edit2 className="mr-2 h-4 w-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => sendWhatsApp(party)} className="text-success">
                            <MessageSquare className="mr-2 h-4 w-4" /> WhatsApp Message
                          </DropdownMenuItem>
                          {party.balance > 0 && currentBusiness?.upiId && (
                            <DropdownMenuItem onClick={() => {
                              setSelectedParty(party);
                              setIsQROpen(true);
                            }} className="text-primary">
                              <QrCode className="mr-2 h-4 w-4" /> Payment QR
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleDeleteParty(party.id)} className="text-danger">
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

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <form onSubmit={handleEditParty}>
            <DialogHeader>
              <DialogTitle>Edit {partyType === 'customer' ? 'Customer' : 'Supplier'}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-text-muted">Party Name *</label>
                <Input
                  required
                  value={newParty.name}
                  onChange={(e) => setNewParty({ ...newParty, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-text-muted">Phone Number *</label>
                  <Input
                    required
                    value={newParty.phone}
                    onChange={(e) => setNewParty({ ...newParty, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-text-muted">GST Number</label>
                  <Input
                    value={newParty.gstNumber}
                    onChange={(e) => setNewParty({ ...newParty, gstNumber: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-text-muted">Address</label>
                <Input
                  value={newParty.address}
                  onChange={(e) => setNewParty({ ...newParty, address: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" className="w-full">Update Party</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Payment QR Dialog */}
      <Dialog open={isQROpen} onOpenChange={setIsQROpen}>
        <DialogContent className="sm:max-w-[400px] text-center">
          <DialogHeader>
            <DialogTitle className="text-center">Collect Payment</DialogTitle>
          </DialogHeader>
          
          {selectedParty && (
            <div className="flex flex-col items-center gap-6 py-6">
              <div className="text-center">
                <div className="text-sm font-bold text-text-muted uppercase mb-1">Receivable Amount</div>
                <div className="text-3xl font-extrabold text-primary">{currency}{Math.abs(selectedParty.balance).toLocaleString()}</div>
                <div className="text-xs text-text-muted mt-1">From: {selectedParty.name}</div>
              </div>

              <div className="bg-white p-4 rounded-xl border-4 border-slate-100 shadow-sm relative group">
                <QRCodeSVG 
                  value={`upi://pay?pa=${currentBusiness?.upiId}&pn=${encodeURIComponent(currentBusiness?.name || '')}&cu=INR&am=${Math.abs(selectedParty.balance)}`}
                  size={200}
                  level="H"
                  includeMargin={true}
                />
                
                {/* Hidden canvas for sharing */}
                <div className="hidden">
                  <div id="share-content" className="p-8 bg-white text-center" style={{ width: '400px' }}>
                    <div className="text-xl font-bold mb-4">{currentBusiness?.name}</div>
                    <div className="text-3xl font-extrabold text-primary mb-2">{currency}{Math.abs(selectedParty.balance).toLocaleString()}</div>
                    <div className="text-sm text-text-muted mb-6">Payment request for {selectedParty.name}</div>
                    <div className="flex justify-center mb-6">
                      {/* We'll use a hidden actual canvas for html2canvas or similar if needed, but for now let's use a simpler approach */}
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-sm font-mono bg-slate-50 px-3 py-1.5 rounded border border-border-main text-text-muted">
                UPI ID: {currentBusiness?.upiId}
              </div>

              <div className="grid grid-cols-1 gap-3 w-full mt-4">
                <Button 
                  className="w-full gap-2 bg-success hover:bg-success/90" 
                  onClick={() => {
                    shareQR(selectedParty);
                    setIsQROpen(false);
                  }}
                >
                  <Share2 className="w-4 h-4" /> Share on WhatsApp
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => setIsQROpen(false)}
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Hidden constant QR for canvas generation */}
      <div className="fixed -left-[9999px] -top-[9999px]">
        {selectedParty && (
          <div id="qr-to-canvas" style={{ padding: '20px', background: 'white' }}>
             <QRCodeSVG 
                id="qr-source"
                value={`upi://pay?pa=${currentBusiness?.upiId}&pn=${encodeURIComponent(currentBusiness?.name || '')}&cu=INR&am=${Math.abs(selectedParty.balance)}`}
                size={400}
                level="H"
                includeMargin={true}
              />
          </div>
        )}
      </div>

      {/* Ledger Dialog */}
      <Dialog open={isLedgerOpen} onOpenChange={setIsLedgerOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ledger: {selectedParty?.name}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="p-3 bg-slate-50 rounded-lg border border-border-main">
                <div className="text-[10px] text-text-muted uppercase font-bold">Current Balance</div>
                <div className={cn("text-lg font-bold", (selectedParty?.balance || 0) >= 0 ? "text-success" : "text-danger")}>
                  {currency}{(Math.abs(selectedParty?.balance || 0)).toLocaleString()}
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-border-main">
                <div className="text-[10px] text-text-muted uppercase font-bold">Total Credit</div>
                <div className="text-lg font-bold text-success">
                  {currency}{ledger.filter(l => l.partyId === selectedParty?.id && l.type === 'credit').reduce((acc, l) => acc + l.amount, 0).toLocaleString()}
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg border border-border-main">
                <div className="text-[10px] text-text-muted uppercase font-bold">Total Debit</div>
                <div className="text-lg font-bold text-danger">
                  {currency}{ledger.filter(l => l.partyId === selectedParty?.id && l.type === 'debit').reduce((acc, l) => acc + l.amount, 0).toLocaleString()}
                </div>
              </div>
            </div>

            <form onSubmit={handleAddLedgerEntry} className="p-4 bg-slate-50 rounded-xl border border-border-main space-y-4">
              <div className="text-sm font-bold">Add Credit/Debit Entry</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-text-muted">Type</label>
                  <select 
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
                    value={ledgerEntry.type}
                    onChange={(e) => setLedgerEntry({ ...ledgerEntry, type: e.target.value as 'credit' | 'debit' })}
                  >
                    <option value="credit">Credit (+)</option>
                    <option value="debit">Debit (-)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-text-muted">Amount</label>
                  <Input 
                    type="number" 
                    required 
                    value={ledgerEntry.amount}
                    onChange={(e) => setLedgerEntry({ ...ledgerEntry, amount: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-text-muted">Date</label>
                  <Input 
                    type="date" 
                    required 
                    value={ledgerEntry.date}
                    onChange={(e) => setLedgerEntry({ ...ledgerEntry, date: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-text-muted">Description</label>
                  <Input 
                    placeholder="Notes" 
                    value={ledgerEntry.description}
                    onChange={(e) => setLedgerEntry({ ...ledgerEntry, description: e.target.value })}
                  />
                </div>
              </div>
              <Button type="submit" className="w-full">Add Entry</Button>
            </form>

            <div className="space-y-2">
              <div className="text-sm font-bold">Recent History</div>
              <div className="rounded-lg border border-border-main overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="text-[10px] font-bold uppercase">Date</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase">Description</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase text-right">Credit</TableHead>
                      <TableHead className="text-[10px] font-bold uppercase text-right">Debit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledger.filter(l => l.partyId === selectedParty?.id).map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="text-xs">{new Date(entry.date).toLocaleDateString()}</TableCell>
                        <TableCell className="text-xs">{entry.description || '-'}</TableCell>
                        <TableCell className="text-right text-xs font-bold text-success">
                          {entry.type === 'credit' ? `${currency}${entry.amount.toLocaleString()}` : '-'}
                        </TableCell>
                        <TableCell className="text-right text-xs font-bold text-danger">
                          {entry.type === 'debit' ? `${currency}${entry.amount.toLocaleString()}` : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
