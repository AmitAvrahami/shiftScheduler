import { useEffect, useState } from 'react';
import { authApi } from '../lib/api';
import type { User } from '../types/auth';
import { AuthContext } from './AuthContext.types';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(() => !!localStorage.getItem('token'));

  useEffect(() => {
    if (!token) return;
    
    authApi
      .me()
      .then((res) => setUser(res.user))
      .catch(() => {
        localStorage.removeItem('token');
        setToken(null);
      })
      .finally(() => setIsLoading(false));
  }, [token]);

  async function login(body: { email: string; password: string }) {
    const res = await authApi.login(body);
    localStorage.setItem('token', res.token);
    setToken(res.token);
    setUser(res.user);
  }

  function logout() {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
