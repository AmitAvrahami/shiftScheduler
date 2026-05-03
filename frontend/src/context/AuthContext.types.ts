import { createContext } from 'react';
import type { User } from '../types/auth';

export interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login(body: { email: string; password: string }): Promise<void>;
  logout(): void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
