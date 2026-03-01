'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await fetch('/api/setup-coordinator', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              authUserId: user.id,
              email: user.email,
              fullName: email.split('@')[0],
            }),
          });
        }
        router.push('/dashboard');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push('/dashboard');
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoMode = () => {
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-kept-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-kept-sage tracking-tight">Kept</h1>
          <p className="text-kept-gray mt-2 text-sm">
            Behavioral health referral closure platform
          </p>
        </div>

        <Card className="border-0 shadow-lg">
          <CardHeader className="pb-4">
            <h2 className="text-lg font-semibold text-kept-dark">
              {isSignUp ? 'Create your account' : 'Sign in to your practice'}
            </h2>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAuth} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-kept-dark text-sm font-medium">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="coordinator@practice.com"
                  className="border-kept-sage/20 focus:ring-kept-sage focus:border-kept-sage"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-kept-dark text-sm font-medium">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="border-kept-sage/20 focus:ring-kept-sage focus:border-kept-sage"
                  required
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-kept-sage hover:bg-kept-sage/90 text-white font-medium"
              >
                {loading ? 'Please wait...' : isSignUp ? 'Create Account' : 'Sign In'}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <button
                onClick={() => setIsSignUp(!isSignUp)}
                className="text-sm text-kept-sage hover:underline"
              >
                {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
              </button>
            </div>

            <div className="relative mt-6 mb-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-kept-sage/10" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-kept-gray">or</span>
              </div>
            </div>

            <Button
              onClick={handleDemoMode}
              variant="outline"
              className="w-full border-kept-sage/30 text-kept-sage hover:bg-kept-sage-light/50"
            >
              Enter Demo Mode
            </Button>
            <p className="text-xs text-kept-gray text-center mt-2">
              Skip login and explore with seed data
            </p>
          </CardContent>
        </Card>

        <p className="text-xs text-center text-kept-gray mt-6">
          Kept closes the gap between referral and first appointment.
        </p>
      </div>
    </div>
  );
}
