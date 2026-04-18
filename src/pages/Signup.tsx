/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '@/src/lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { toast } from 'sonner';

export default function Signup() {
  const navigate = useNavigate();
  const [loading, setLoading] = React.useState(false);

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const businessName = formData.get('businessName') as string;

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const businessId = `biz_${Date.now()}`;
      const initialBusiness = {
        id: businessId,
        name: businessName,
        currency: '₹',
      };

      // Create user profile in Firestore
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        currentBusinessId: businessId,
        businesses: [initialBusiness],
        businessIds: [businessId],
        darkMode: false,
        createdAt: new Date().toISOString()
      });

      toast.success('Account created successfully');
      navigate('/dashboard');
    } catch (error: any) {
      console.error(error);
      if (error.code === 'auth/network-request-failed') {
        toast.error('Network error: Please check your internet connection or disable ad-blockers.');
      } else if (error.code === 'auth/email-already-in-use') {
        toast.error('Email already in use');
      } else {
        toast.error(error.message || 'Failed to create account');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Create an Account</CardTitle>
          <CardDescription className="text-center">
            Start managing your business today.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSignup}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="businessName">Business Name</Label>
              <Input id="businessName" name="businessName" placeholder="My Awesome Shop" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="m@example.com" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required minLength={6} />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating account...' : 'Sign Up'}
            </Button>
            <p className="text-sm text-center text-muted-foreground">
              Already have an account?{' '}
              <Link to="/login" className="text-blue-600 hover:underline">
                Login
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
