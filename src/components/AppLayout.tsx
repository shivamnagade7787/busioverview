/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Receipt, 
  Package, 
  BarChart3, 
  Settings, 
  LogOut,
  Menu,
  ShoppingCart,
  IndianRupee,
  FileText,
  Plus,
  Moon,
  Sun,
  ChevronRight,
  Building2,
  Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/src/contexts/AuthContext';
import { useBusiness } from '@/src/contexts/BusinessContext';
import { auth, db } from '@/src/lib/firebase';
import { signOut } from 'firebase/auth';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuGroup,
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { doc, updateDoc, arrayUnion, arrayRemove, getDoc, setDoc } from 'firebase/firestore';
import { toast } from 'sonner';

const navItems = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Parties', href: '/parties', icon: Users },
  { name: 'Sales', href: '/sales', icon: FileText },
  { name: 'Purchases', href: '/purchases', icon: ShoppingCart },
  { name: 'Inventory', href: '/inventory', icon: Package },
  { name: 'Expenses', href: '/expenses', icon: Receipt },
  { name: 'Cash & Bank', href: '/cash-bank', icon: IndianRupee },
  { name: 'Reports', href: '/reports', icon: BarChart3 },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, currentBusiness, switchBusiness, updateDarkMode } = useAuth();
  const { products } = useBusiness();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [shownReminders, setShownReminders] = useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (!products) return;

    const interval = setInterval(() => {
      const now = new Date();
      products.forEach(product => {
        if (product.reminderEnabled && product.reminderDate) {
          const reminderTime = new Date(product.reminderDate);
          const diff = now.getTime() - reminderTime.getTime();
          
          // If reminder time has passed and we haven't shown it in this session
          if (diff >= 0 && !shownReminders.has(product.id)) {
            toast.info(`${product.name} need to check`, {
              duration: 10000,
              description: `Reminder scheduled for ${new Date(product.reminderDate).toLocaleString()}`
            });
            setShownReminders(prev => new Set(prev).add(product.id));
          }
        }
      });
    }, 10000); // Check every 10 seconds

    return () => clearInterval(interval);
  }, [products, shownReminders]);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const handleAddBusiness = async () => {
    if (!user || !profile) return;
    if (profile.businesses.length >= 3) {
      toast.error('Maximum 3 businesses allowed');
      return;
    }

    const businessName = prompt('Enter Business Name:');
    if (!businessName) return;

    const newBusiness = {
      id: `biz_${Date.now()}`,
      name: businessName,
      currency: '₹',
    };

    try {
      const businessId = `biz_${Date.now()}`;
      const newBusiness = {
        id: businessId,
        name: businessName,
        currency: '₹',
      };

      // Save to global businesses collection for multi-device access
      await setDoc(doc(db, 'businesses', businessId), {
        ...newBusiness,
        ownerId: user.uid,
        createdAt: new Date().toISOString()
      });

      await updateDoc(doc(db, 'users', user.uid), {
        businesses: arrayUnion(newBusiness),
        businessIds: arrayUnion(newBusiness.id),
        currentBusinessId: newBusiness.id
      });
      toast.success('New business added');
    } catch (error) {
      toast.error('Failed to add business');
    }
  };

  const handleJoinBusiness = async () => {
    if (!user || !profile) return;
    
    const businessId = prompt('Enter Business ID to join:');
    if (!businessId) return;

    if (profile.businesses.find(b => b.id === businessId)) {
      toast.error('You are already a member of this business');
      return;
    }

    try {
      const bizDoc = await getDoc(doc(db, 'businesses', businessId));
      if (!bizDoc.exists()) {
        toast.error('Business not found. Please check the ID.');
        return;
      }

      const bizData = bizDoc.data();
      const businessToJoin = {
        id: bizData.id,
        name: bizData.name,
        currency: bizData.currency || '₹',
      };

      await updateDoc(doc(db, 'users', user.uid), {
        businesses: arrayUnion(businessToJoin),
        businessIds: arrayUnion(businessToJoin.id),
        currentBusinessId: businessToJoin.id
      });
      
      toast.success(`Joined ${bizData.name} successfully!`);
    } catch (error) {
      console.error(error);
      toast.error('Failed to join business');
    }
  };

  const handleDeleteBusiness = async (businessId: string) => {
    if (!user || !profile) return;
    if (profile.businesses.length <= 1) {
      toast.error('Cannot delete the only business');
      return;
    }

    if (!confirm('Are you sure you want to permanently delete this business? All data for this business will be inaccessible.')) return;

    const businessToDelete = profile.businesses.find(b => b.id === businessId);
    if (!businessToDelete) return;

    try {
      const remainingBusinesses = profile.businesses.filter(b => b.id !== businessId);
      const remainingBusinessIds = profile.businessIds.filter(id => id !== businessId);
      await updateDoc(doc(db, 'users', user.uid), {
        businesses: remainingBusinesses,
        businessIds: remainingBusinessIds,
        currentBusinessId: remainingBusinesses[0].id
      });
      toast.success('Business deleted');
    } catch (error) {
      toast.error('Failed to delete business');
    }
  };

  const NavContent = ({ isMobile = false }) => (
    <div className={cn(
      "flex flex-col h-full bg-sidebar-bg border-r border-border-main transition-all duration-300",
      !isMobile && !isSidebarExpanded ? "w-[60px]" : "w-[240px]"
    )}>
      <div className={cn("p-4 flex items-center", !isMobile && !isSidebarExpanded ? "justify-center" : "justify-between")}>
        {(!isMobile && !isSidebarExpanded) ? (
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white font-bold">V</div>
        ) : (
          <h1 className="text-xl font-extrabold tracking-tight text-primary truncate">
            {currentBusiness?.name || 'VYAPAAR-X'}
          </h1>
        )}
      </div>
      
      <nav className="flex-1 space-y-1 overflow-y-auto py-4">
        {navItems.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all border-l-4",
                isActive 
                  ? "bg-primary-light text-primary border-primary" 
                  : "text-text-muted border-transparent hover:bg-slate-50 hover:text-text-main",
                !isMobile && !isSidebarExpanded && "justify-center px-0 border-l-0"
              )}
              onClick={() => setIsMobileOpen(false)}
              title={item.name}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {(isMobile || isSidebarExpanded) && <span>{item.name}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border-main">
        <Button 
          variant="ghost" 
          className={cn(
            "w-full text-text-muted hover:text-text-main hover:bg-slate-50 gap-3",
            !isMobile && !isSidebarExpanded ? "justify-center px-0" : "justify-start"
          )}
          onClick={handleLogout}
          title="Logout"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {(isMobile || isSidebarExpanded) && <span>Logout</span>}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background text-text-main">
      {/* Desktop Sidebar */}
      <aside 
        className="hidden md:flex flex-col z-20"
        onMouseEnter={() => setIsSidebarExpanded(true)}
        onMouseLeave={() => setIsSidebarExpanded(false)}
      >
        <NavContent />
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-border-main px-4 md:px-8 flex items-center justify-between shadow-sm z-10">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setIsMobileOpen(true)}>
              <Menu className="w-6 h-6" />
            </Button>
            <div className="bg-slate-50 dark:bg-slate-800 px-3 py-1.5 border border-border-main rounded-md text-[13px] font-semibold flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              <span className="truncate max-w-[150px]">{currentBusiness?.name || 'Business Manager'}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <div className="text-sm font-semibold">{profile?.email?.split('@')[0] || 'User'}</div>
              <div className="text-[11px] text-text-muted uppercase tracking-wider font-bold">Admin</div>
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger render={
                <Button variant="ghost" className="relative h-9 w-9 rounded-full p-0 overflow-hidden border border-border-main">
                  <div className="w-full h-full bg-primary flex items-center justify-center text-white font-bold text-sm">
                    {currentBusiness?.name?.substring(0, 2).toUpperCase() || 'AD'}
                  </div>
                </Button>
              } />
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  
                  <DropdownMenuItem onClick={() => updateDarkMode(!profile?.darkMode)}>
                    {profile?.darkMode ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
                    <span>{profile?.darkMode ? 'Light Mode' : 'Dark Mode'}</span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                
                <DropdownMenuSeparator />
                
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-[10px] uppercase text-text-muted">Switch Business</DropdownMenuLabel>
                  {(profile?.businesses || []).map(biz => (
                    <div key={biz.id} className="flex items-center group">
                      <DropdownMenuItem 
                        className={cn("flex-1", biz.id === profile?.currentBusinessId && "bg-primary-light text-primary")}
                        onClick={() => switchBusiness(biz.id)}
                      >
                        <Building2 className="mr-2 h-4 w-4" />
                        <span className="truncate">{biz.name}</span>
                      </DropdownMenuItem>
                      {(profile?.businesses || []).length > 1 && (
                        <Button 
                          variant="ghost" 
                          size="icon-sm" 
                          className="opacity-0 group-hover:opacity-100 text-danger hover:bg-danger/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteBusiness(biz.id);
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                  
                  {profile && (profile.businesses || []).length < 3 && (
                    <>
                      <DropdownMenuItem onClick={handleAddBusiness} className="text-primary font-bold">
                        <Plus className="mr-2 h-4 w-4" />
                        <span>Add New Business</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleJoinBusiness} className="text-primary font-bold">
                        <Plus className="mr-2 h-4 w-4" />
                        <span>Join Existing Business</span>
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuGroup>
                
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Logout</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
              <SheetContent side="left" className="p-0 w-[240px] bg-sidebar-bg border-r border-border-main">
                <NavContent isMobile />
              </SheetContent>
            </Sheet>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-50 dark:bg-slate-950">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
