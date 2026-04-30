export interface User {
  _id: string;
  name: string;
  email: string;
  role: 'employee' | 'manager' | 'admin';
  isActive: boolean;
  isFixedMorningEmployee: boolean;
  avatarUrl?: string;
}

export interface AuthResponse {
  success: boolean;
  token: string;
  user: User;
}
