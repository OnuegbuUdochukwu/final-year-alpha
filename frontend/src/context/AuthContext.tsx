/**
 * AuthContext.tsx — JWT authentication context for the AI Career Pathfinder.
 *
 * Provides { token, userId, login, logout } via React context.
 * `login()` POSTs credentials to /login, stores the returned JWT in
 * localStorage, and decodes the payload to expose `userId` (the `sub` claim).
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import axios from 'axios';

const GATEWAY_BASE_URL = import.meta.env.VITE_GATEWAY_URL || 'http://localhost:8080';

// ─── Types ────────────────────────────────────────────────────────────────────
interface AuthContextValue {
  token: string | null;
  userId: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Decodes a JWT payload without verifying the signature (client-side only). */
function decodeToken(token: string): { sub?: string } | null {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextValue>({
  token: null,
  userId: null,
  login: async () => {},
  logout: () => {},
});

// ─── Provider ─────────────────────────────────────────────────────────────────
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem('auth_token')
  );
  const [userId, setUserId] = useState<string | null>(() => {
    const stored = localStorage.getItem('auth_token');
    return stored ? (decodeToken(stored)?.sub ?? null) : null;
  });

  // Listen for the auth:expired event emitted by the Axios response interceptor.
  useEffect(() => {
    const handler = () => {
      setToken(null);
      setUserId(null);
    };
    window.addEventListener('auth:expired', handler);
    return () => window.removeEventListener('auth:expired', handler);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const response = await axios.post(`${GATEWAY_BASE_URL}/login`, {
      username,
      password,
    });
    const { access_token } = response.data as { access_token: string };
    localStorage.setItem('auth_token', access_token);
    setToken(access_token);
    const decoded = decodeToken(access_token);
    setUserId(decoded?.sub ?? username);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('auth_token');
    setToken(null);
    setUserId(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, userId, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// ─── Hook ─────────────────────────────────────────────────────────────────────
export const useAuth = () => useContext(AuthContext);
