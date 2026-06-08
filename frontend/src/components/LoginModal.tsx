/**
 * LoginModal.tsx — Full-screen login gate.
 *
 * Shown whenever there is no valid JWT in AuthContext.
 * Calls AuthContext.login() and disappears on success.
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, LogIn, BrainCircuit, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const LoginModal: React.FC = () => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      await login(username, password);
    } catch (err: any) {
      if (err.response) {
        const detail = err.response?.data?.detail;
        setError(detail || 'Invalid username or password.');
      } else if (err.request) {
        setError('Network error: Could not reach the API. This is likely a CORS issue or incorrect VITE_GATEWAY_URL.');
      } else {
        setError('An unexpected error occurred.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Sign in"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="w-full max-w-sm mx-4"
      >
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl shadow-black/20 border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="bg-gradient-to-br from-brand-600 to-violet-700 px-8 py-8 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.1),transparent_60%)]" />
            <div className="relative">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-sm mb-4 shadow-lg shadow-black/10">
                <BrainCircuit className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-extrabold text-white tracking-tight">
                AI Career Pathfinder
              </h1>
              <p className="text-brand-200 text-sm mt-1">Sign in to access your roadmap</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="px-8 py-7 space-y-5">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                role="alert"
                className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </motion.div>
            )}

            <div>
              <label
                htmlFor="login-username"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                Username
              </label>
              <input
                id="login-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                placeholder="student"
                className="block w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
              >
                Password
              </label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="block w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all"
              />
            </div>

            <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
              Demo credentials: <span className="font-mono font-semibold">student / fyp2024</span>
            </p>

            <button
              type="submit"
              disabled={isLoading || !username || !password}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-brand-600 to-violet-600 hover:from-brand-700 hover:to-violet-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-brand-500/25 transition-all hover:shadow-xl hover:shadow-brand-500/30 active:scale-[0.98]"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Sign In
                </>
              )}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

export default LoginModal;
