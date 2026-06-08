import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, LogIn, Compass, AlertCircle } from 'lucide-react';
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
        setError('Network error: Could not reach the API.');
      } else {
        setError('An unexpected error occurred.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Sign in"
    >
      <div className="fixed inset-0 bg-clay-900/60 backdrop-blur-sm" />
      <div className="fixed inset-0 bg-noise pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="relative w-full max-w-sm mx-4"
      >
        <div className="bg-white rounded-2xl shadow-2xl shadow-clay-900/20 border border-clay-200 overflow-hidden">
          <div className="bg-gradient-to-br from-rust-600 to-rust-800 px-8 py-9 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-noise opacity-[0.07]" />
            <div className="relative">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-sm mb-4">
                <Compass className="w-8 h-8 text-white" />
              </div>
              <h1 className="font-heading text-2xl font-bold text-white tracking-tight">
                AI Career Pathfinder
              </h1>
              <p className="text-rust-200 text-sm mt-1.5 font-[450]">Sign in to access your roadmap</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="px-8 py-7 space-y-5">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                role="alert"
                className="flex items-center gap-2 p-3 bg-rust-50 border border-rust-200 rounded-lg text-rust-700 text-sm"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </motion.div>
            )}

            <div>
              <label
                htmlFor="login-username"
                className="block text-sm font-semibold text-clay-700 mb-1.5"
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
                className="block w-full px-4 py-2.5 rounded-lg border border-clay-300 bg-white text-ink text-sm placeholder-clay-400 focus:outline-none focus:ring-2 focus:ring-rust-500 focus:border-rust-500 transition-all"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-sm font-semibold text-clay-700 mb-1.5"
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
                className="block w-full px-4 py-2.5 rounded-lg border border-clay-300 bg-white text-ink text-sm placeholder-clay-400 focus:outline-none focus:ring-2 focus:ring-rust-500 focus:border-rust-500 transition-all"
              />
            </div>

            <p className="text-xs text-clay-400 text-center">
              Demo credentials: <span className="font-mono font-semibold text-clay-600">student / fyp2024</span>
            </p>

            <button
              type="submit"
              disabled={isLoading || !username || !password}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold text-white bg-gradient-to-br from-rust-500 to-rust-700 hover:from-rust-600 hover:to-rust-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-rust-500/25 transition-all active:scale-[0.98]"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in&hellip;
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
