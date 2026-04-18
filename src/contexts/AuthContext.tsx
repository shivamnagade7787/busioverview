/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db } from '@/src/lib/firebase';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { UserProfile, Business } from '@/src/types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  currentBusiness: Business | null;
  loading: boolean;
  isAuthReady: boolean;
  switchBusiness: (businessId: string) => Promise<void>;
  updateDarkMode: (enabled: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  currentBusiness: null,
  loading: true,
  isAuthReady: false,
  switchBusiness: async () => {},
  updateDarkMode: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsAuthReady(true);
      if (!user) {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (user) {
      const unsubscribeProfile = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as UserProfile;
          const businessIds = data.businessIds || (data.businesses || []).map(b => b.id);
          
          if (!data.businessIds && businessIds.length > 0) {
            updateDoc(doc(db, 'users', user.uid), { businessIds });
          }

          setProfile({
            ...data,
            businesses: data.businesses || [],
            businessIds
          });
        } else {
          setProfile(null);
        }
        setLoading(false);
      }, (error) => {
        console.error("Error fetching user profile:", error);
        setLoading(false);
      });

      return () => unsubscribeProfile();
    }
  }, [user]);

  const currentBusiness = useMemo(() => {
    if (!profile || !profile.businesses) return null;
    return profile.businesses.find(b => b.id === profile.currentBusinessId) || profile.businesses[0] || null;
  }, [profile]);

  const switchBusiness = async (businessId: string) => {
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid), {
      currentBusinessId: businessId
    });
  };

  const updateDarkMode = async (enabled: boolean) => {
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid), {
      darkMode: enabled
    });
  };

  useEffect(() => {
    if (profile?.darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [profile?.darkMode]);

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      currentBusiness, 
      loading, 
      isAuthReady, 
      switchBusiness,
      updateDarkMode
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
