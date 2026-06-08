import React, { useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Search, Target, Loader2, X, AlertCircle } from 'lucide-react';
import client from '../api/client';

interface TargetSelectionFormProps {
  onPathFound: (pathData: any) => void;
  startSkill: string;
  resumeSkills: string[];
}

const TargetSelectionForm: React.FC<TargetSelectionFormProps> = ({
  onPathFound,
  startSkill,
  resumeSkills,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [isFinding, setIsFinding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [recentRoles, setRecentRoles] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('recentRoles') || '[]');
    } catch {
      return [];
    }
  });
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSearch = useCallback(async (value: string) => {
    setQuery(value);
    setError(null);

    if (!value || value.length < 2) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    setIsSearching(true);
    setShowDropdown(true);

    try {
      const response = await client.get('/api/search-roles', { params: { q: value } });
      const roles = response.data?.roles ?? response.data ?? [];
      setResults(roles);
    } catch (err: any) {
      console.error('Role search failed:', err);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const selectRole = useCallback((role: string) => {
    setSelectedRole(role);
    setQuery(role);
    setShowDropdown(false);
    setError(null);
    setRecentRoles(prev => {
      const updated = [role, ...prev.filter(r => r !== role)].slice(0, 5);
      localStorage.setItem('recentRoles', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const handleFindPath = useCallback(async () => {
    if (!selectedRole) return;

    setIsFinding(true);
    setError(null);

    try {
      const response = await client.get('/api/find-path', {
        params: {
          start: startSkill,
          target: selectedRole,
          additional_skills: resumeSkills?.join(','),
        },
      });
      onPathFound(response.data);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(detail || 'Failed to find a path. Please try a different role.');
    } finally {
      setIsFinding(false);
    }
  }, [selectedRole, startSkill, resumeSkills, onPathFound]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowDropdown(false);
    }
    if (e.key === 'Enter' && results.length > 0 && !isSearching) {
      selectRole(results[0]);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
    >
      <div className="bg-clay-50 rounded-xl p-5 border border-clay-200">
        <h4 className="text-xs font-semibold text-clay-500 uppercase tracking-[0.1em] mb-3">
          Set Your Career Target
        </h4>

        <div className="relative">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-clay-400 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (!e.target.value) setSelectedRole(null);
                setError(null);
                handleSearch(e.target.value);
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (query.length >= 2 && results.length > 0) {
                  setShowDropdown(true);
                }
              }}
              onBlur={() => {
                setTimeout(() => setShowDropdown(false), 200);
              }}
              placeholder="e.g., Data Scientist, Product Manager..."
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-clay-300 bg-white text-ink text-sm placeholder-clay-400 focus:outline-none focus:ring-2 focus:ring-rust-500 focus:border-rust-500 transition-all"
              role="combobox"
              aria-expanded={showDropdown}
              aria-autocomplete="list"
              aria-controls="role-search-results"
            />
            {isSearching && (
              <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-clay-400 animate-spin" />
            )}
            {selectedRole && !isSearching && (
              <button
                onClick={() => {
                  setSelectedRole(null);
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-clay-400 hover:text-clay-600"
                aria-label="Clear selected role"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {showDropdown && (results.length > 0 || isSearching) && (
            <ul
              id="role-search-results"
              role="listbox"
              className="role-search-dropdown absolute z-20 mt-2 w-full bg-white border border-clay-200 rounded-xl shadow-lg shadow-clay-900/10 overflow-hidden max-h-64 overflow-y-auto"
            >
              {isSearching ? (
                <li className="px-4 py-3 text-sm text-clay-400 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Searching&hellip;
                </li>
              ) : (
                results.map((role, idx) => (
                  <li
                    key={idx}
                    role="option"
                    aria-selected={selectedRole === role}
                    onMouseDown={() => selectRole(role)}
                    className={`px-4 py-2.5 text-sm cursor-pointer flex items-center justify-between transition-colors ${
                      selectedRole === role
                        ? 'bg-rust-50 text-rust-700'
                        : 'text-ink hover:bg-clay-50'
                    }`}
                  >
                    <span>{role}</span>
                    {selectedRole === role && (
                      <CheckCircle className="w-4 h-4 text-rust-500" />
                    )}
                  </li>
                ))
              )}
            </ul>
          )}

          {!query && recentRoles.length > 0 && !selectedRole && (
            <div className="mt-3">
              <p className="text-xs text-clay-400 mb-2">Recent targets:</p>
              <div className="flex flex-wrap gap-1.5">
                {recentRoles.map((role, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => selectRole(role)}
                    className="px-2.5 py-1 text-xs font-medium bg-white border border-clay-200 text-clay-600 rounded-md hover:border-rust-300 hover:text-rust-600 transition-colors"
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            role="alert"
            className="mt-3 p-3 bg-rust-50 border border-rust-200 rounded-lg text-rust-700 text-sm flex items-start gap-2"
          >
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {error}
          </motion.div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-clay-400 font-[450]">
            Starting from: <span className="font-semibold text-clay-600">{startSkill}</span>
          </p>

          <button
            onClick={handleFindPath}
            disabled={!selectedRole || isFinding}
            className={`
              flex items-center gap-2 px-5 py-2 rounded-lg font-semibold text-sm text-white transition-all
              ${!selectedRole || isFinding
                ? 'bg-clay-300 cursor-not-allowed'
                : 'bg-gradient-to-br from-gold-500 to-gold-700 hover:from-gold-600 hover:to-gold-800 shadow-md shadow-gold-500/20 active:scale-[0.97]'
              }
            `}
          >
            {isFinding ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Mapping&hellip;
              </>
            ) : (
              <>
                <Target className="w-4 h-4" />
                Find My Path
              </>
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
};

const CheckCircle: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

export default TargetSelectionForm;
