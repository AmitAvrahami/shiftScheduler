declare global {
  namespace Express {
    interface Request {
      user?: {
        _id: string;
        email: string;
        role: 'employee' | 'manager' | 'admin';
      };
    }
  }
}

export {};
