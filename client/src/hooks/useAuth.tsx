import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

interface User {
  id: number;
  username: string;
  email: string;
  role: 'borrower' | 'lender' | 'admin';
  firstName?: string;
  lastName?: string;
  profilePicture?: string;
  createdAt: string;
}

interface LoginResult {
  success: boolean;
  requiresOtp?: boolean;
  email?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  token: string | null;
  login: (usernameOrEmail: string, password: string) => Promise<LoginResult>;
  verifyAdminOtp: (email: string, otpCode: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  // Check if user is logged in on app start
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        // Check for stored token
        const storedToken = localStorage.getItem('auth_token');
        if (storedToken) {
          setToken(storedToken);
          // Verify token with backend
          const response = await fetch('/api/auth/me', {
            headers: {
              'Authorization': `Bearer ${storedToken}`
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            setUser(data.user);
          } else {
            // Token is invalid, remove it
            localStorage.removeItem('auth_token');
            setToken(null);
          }
        }
        setIsLoading(false);
      } catch (error) {
        console.error('Auth check failed:', error);
        localStorage.removeItem('auth_token');
        setToken(null);
        setIsLoading(false);
      }
    };

    checkAuthStatus();
  }, []);

  const login = async (usernameOrEmail: string, password: string): Promise<LoginResult> => {
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
        
        // Check if admin OTP is required
        if (userData.requiresOtp) {
          return { 
            success: true, 
            requiresOtp: true, 
            email: userData.email 
          };
        }
        
        // Store token and set user
        if (userData.token) {
          localStorage.setItem('auth_token', userData.token);
          setToken(userData.token);
        }
        setUser(userData.user); // The API returns { success, message, user, token }
        return { success: true };
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

  const verifyAdminOtp = async (email: string, otpCode: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/admin-verify-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, otpCode }),
      });

      if (response.ok) {
        const userData = await response.json();
        console.log('Admin OTP verification response:', userData);
        
        // Store token and set user
        if (userData.token) {
          localStorage.setItem('auth_token', userData.token);
          setToken(userData.token);
        }
        setUser(userData.user);
        return true;
      }
      
      const errorData = await response.json();
      throw new Error(errorData.message || 'Verification failed');
    } catch (error) {
      console.error('Admin OTP verification failed:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      if (token) {
        await fetch('/api/auth/logout', { 
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      }
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      // Clear token and user state
      localStorage.removeItem('auth_token');
      setToken(null);
      setUser(null);
    }
  };

  const value = {
    user,
    isAuthenticated: !!user,
    isLoading,
    token,
    login,
    verifyAdminOtp,
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