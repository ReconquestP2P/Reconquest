import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

interface User {
  id: number;
  username: string;
  email: string;
  role: 'borrower' | 'lender';
  firstName?: string;
  lastName?: string;
  profilePicture?: string;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (usernameOrEmail: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check if user is logged in on app start
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        // For now, just set loading to false since we don't have auth endpoints yet
        // TODO: Implement proper auth endpoints
        setIsLoading(false);
      } catch (error) {
        console.error('Auth check failed:', error);
        setIsLoading(false);
      }
    };

    checkAuthStatus();
  }, []);

  const login = async (usernameOrEmail: string, password: string): Promise<boolean> => {
    try {
      // Determine if input is email or username
      const isEmail = usernameOrEmail.includes('@');
      const loginData = isEmail 
        ? { email: usernameOrEmail, password }
        : { username: usernameOrEmail, password };

      console.log('Login data being sent:', loginData);

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(loginData),
      });

      if (response.ok) {
        const userData = await response.json();
        console.log('Login response:', userData);
        setUser(userData.user); // The API returns { success, message, user }
        return true;
      }
      
      // Handle specific error responses
      const errorData = await response.json();
      console.error('Login failed with status:', response.status, errorData);
      
      // Throw specific error for email verification
      if (response.status === 403 && errorData.emailVerificationRequired) {
        throw new Error(`EMAIL_VERIFICATION_REQUIRED: ${errorData.message}`);
      }
      
      // Throw generic error for other cases
      throw new Error(errorData.message || 'Login failed');
    } catch (error) {
      console.error('Login failed:', error);
      throw error; // Re-throw to be handled by the calling component
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setUser(null);
    }
  };

  const value = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}