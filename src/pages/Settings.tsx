/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useAuth } from '@/src/contexts/AuthContext';
import { db } from '@/src/lib/firebase';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { toast } from 'sonner';
import { User, Building2, Coins, MapPin, Phone, FileText, QrCode, Languages, Layout, Copy } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export default function Settings() {
  const { user, profile, currentBusiness } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleUpdateBusiness = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !profile || !currentBusiness) return;

    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const currency = formData.get('currency') as string;
    const gstNumber = formData.get('gstNumber') as string;
    const address = formData.get('address') as string;
    const phone = formData.get('phone') as string;
    const upiId = formData.get('upiId') as string;
    const invoiceTemplate = formData.get('invoiceTemplate') as any;
    const language = formData.get('language') as any;

    try {
      const updatedBusinesses = profile.businesses.map(b => 
        b.id === currentBusiness.id 
          ? { ...b, name, currency, gstNumber, address, phone, upiId, invoiceTemplate, language }
          : b
      );

      await updateDoc(doc(db, 'users', user.uid), {
        businesses: updatedBusinesses
      });

      // Also update global businesses collection
      await updateDoc(doc(db, 'businesses', currentBusiness.id), {
        name,
        currency,
        gstNumber,
        address,
        phone,
        upiId,
        invoiceTemplate,
        language,
        updatedAt: new Date().toISOString()
      }).catch(err => {
        // If it doesn't exist in global collection yet (old business), create it
        if (err.code === 'not-found') {
          setDoc(doc(db, 'businesses', currentBusiness.id), {
            ...currentBusiness,
            name, currency, gstNumber, address, phone, upiId, invoiceTemplate, language,
            ownerId: user.uid,
            createdAt: new Date().toISOString()
          });
        }
      });

      toast.success('Business settings updated');
    } catch (error) {
      console.error(error);
      toast.error('Failed to update settings');
    } finally {
      setLoading(false);
    }
  };

  const upiLink = currentBusiness?.upiId 
    ? `upi://pay?pa=${currentBusiness.upiId}&pn=${encodeURIComponent(currentBusiness.name)}&cu=INR`
    : '';

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground">Manage your business profile, tax details, and UPI payments.</p>
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        <div className="md:col-span-2">
          <div className="panel-card">
            <div className="text-base font-bold mb-6 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              Business Profile & GST
            </div>
            <form onSubmit={handleUpdateBusiness} className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-[13px] font-semibold">Business Name *</Label>
                  <Input 
                    id="name" 
                    name="name" 
                    defaultValue={currentBusiness?.name} 
                    required 
                    className="border-border-main"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gstNumber" className="text-[13px] font-semibold">GST Number</Label>
                  <Input 
                    id="gstNumber" 
                    name="gstNumber" 
                    defaultValue={currentBusiness?.gstNumber} 
                    placeholder="27AAAAA0000A1Z5"
                    className="border-border-main"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phone" className="text-[13px] font-semibold">Business Phone</Label>
                  <Input 
                    id="phone" 
                    name="phone" 
                    defaultValue={currentBusiness?.phone} 
                    placeholder="9876543210"
                    className="border-border-main"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="currency" className="text-[13px] font-semibold">Currency Symbol</Label>
                  <Select name="currency" defaultValue={currentBusiness?.currency || '₹'}>
                    <SelectTrigger className="border-border-main">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="₹">INR (₹)</SelectItem>
                      <SelectItem value="$">USD ($)</SelectItem>
                      <SelectItem value="€">EUR (€)</SelectItem>
                      <SelectItem value="£">GBP (£)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="upiId" className="text-[13px] font-semibold">UPI ID (for QR Code)</Label>
                <Input 
                  id="upiId" 
                  name="upiId" 
                  defaultValue={currentBusiness?.upiId} 
                  placeholder="yourname@upi"
                  className="border-border-main"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address" className="text-[13px] font-semibold">Business Address</Label>
                <Input 
                  id="address" 
                  name="address" 
                  defaultValue={currentBusiness?.address} 
                  placeholder="Full business address for invoices"
                  className="border-border-main"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="invoiceTemplate" className="text-[13px] font-semibold">Invoice Template</Label>
                  <Select name="invoiceTemplate" defaultValue={currentBusiness?.invoiceTemplate || 'classic'}>
                    <SelectTrigger className="border-border-main">
                      <SelectValue placeholder="Select template" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="classic">Classic (Standard)</SelectItem>
                      <SelectItem value="modern">Modern (Stylish)</SelectItem>
                      <SelectItem value="compact">Compact (Small)</SelectItem>
                      <SelectItem value="professional">Professional (Business)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="language" className="text-[13px] font-semibold">Communication Language</Label>
                  <Select name="language" defaultValue={currentBusiness?.language || 'en'}>
                    <SelectTrigger className="border-border-main">
                      <SelectValue placeholder="Select language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="mr">Marathi (मराठी)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="pt-4">
                <Button type="submit" className="w-full md:w-auto px-8 bg-primary hover:bg-primary/90" disabled={loading}>
                  {loading ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>

        <div className="space-y-6">
          <div className="panel-card">
            <div className="text-base font-bold mb-6 flex items-center gap-2">
              <QrCode className="w-5 h-5 text-primary" />
              UPI QR Code
            </div>
            <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-lg border border-border-main">
              {upiLink ? (
                <>
                  <div className="bg-white p-4 rounded-xl shadow-sm mb-4">
                    <QRCodeSVG value={upiLink} size={150} />
                  </div>
                  <div className="text-center">
                    <div className="text-xs font-bold text-text-muted uppercase mb-1">Your UPI ID</div>
                    <div className="text-sm font-mono font-bold text-primary">{currentBusiness?.upiId}</div>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <QrCode className="w-12 h-12 mx-auto mb-2 text-slate-200" />
                  <p className="text-xs text-text-muted">Enter UPI ID to generate QR code</p>
                </div>
              )}
            </div>
          </div>

          <div className="panel-card">
            <div className="text-base font-bold mb-6 flex items-center gap-2">
              <User className="w-5 h-5 text-primary" />
              Account Info
            </div>
            <div className="space-y-4">
              <div className="p-4 bg-slate-50 rounded-lg border border-border-main">
                <div className="text-[11px] text-text-muted uppercase font-bold mb-1">Email Address</div>
                <div className="text-sm font-medium">{user?.email}</div>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg border border-border-main">
                <div className="text-[11px] text-text-muted uppercase font-bold mb-1">Business ID</div>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-mono text-text-muted break-all">{currentBusiness?.id}</div>
                  <Button 
                    variant="ghost" 
                    size="icon-sm" 
                    onClick={() => {
                      if (currentBusiness?.id) {
                        navigator.clipboard.writeText(currentBusiness.id);
                        toast.success('Business ID copied to clipboard');
                      }
                    }}
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
