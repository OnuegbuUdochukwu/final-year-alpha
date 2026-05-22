/**
 * TargetSelectionForm.tsx — Goal selector with Dynamic Role Search Hub.
 *
 * Calls GET /api/search-roles?query=... to search for roles dynamically.
 * Falls back to LLM validation for unknown roles.
 * Then calls GET /api/generate?target_role=... to fetch the pre-built roadmap.
 *
 * The Budget and Time sliders are preserved for future filtering features.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { Target, DollarSign, Clock, ArrowRight, Loader2, AlertCircle, Search, Sparkles } from 'lucide-react';
import client from '../api/client';

// ─── Form Types ──────────────────────────────────────────────────────────────
interface FormValues {
  targetRole: string;
  maxBudget: number;
  maxHours: number;
}

interface RoleOption {
  id: string;
  name: string;
}

// ─── Component Props ─────────────────────────────────────────────────────────
interface TargetSelectionFormProps {
  onPathFound: (pathData: any) => void;
  /** The skill node to use as path start (e.g. top NLP skill or last completed skill). */
  startSkill?: string;
}

// ─── Component ───────────────────────────────────────────────────────────────
const TargetSelectionForm: React.FC<TargetSelectionFormProps> = ({
  onPathFound,
  startSkill = 'Foundation',
}) => {
  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      targetRole: '',
      maxBudget: 200,
      maxHours: 40,
    },
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Combobox State ──────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<RoleOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<RoleOption | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const comboboxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Debounced Search ────────────────────────────────────────────────────
  const searchRoles = useCallback(async (query: string) => {
    if (query.trim().length < 1) {
      setSearchResults([]);
      setIsOpen(false);
      return;
    }

    setIsSearching(true);
    try {
      const response = await client.get('/api/search-roles', {
        params: { query: query.trim() },
      });
      const results: RoleOption[] = response.data || [];
      setSearchResults(results);
      setIsOpen(results.length > 0 || query.trim().length >= 2);
      setHighlightedIndex(-1);
    } catch (err) {
      console.error('[RoleSearch] Search failed:', err);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleInputChange = useCallback((value: string) => {
    setSearchQuery(value);
    setSelectedRole(null);
    setValue('targetRole', '');

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      searchRoles(value);
    }, 300);
  }, [searchRoles, setValue]);

  // ─── Selection Handler ───────────────────────────────────────────────────
  const handleSelectRole = useCallback((role: RoleOption) => {
    setSelectedRole(role);
    setSearchQuery(role.name);
    setValue('targetRole', role.name);
    setIsOpen(false);
    setSearchResults([]);
    setHighlightedIndex(-1);
  }, [setValue]);

  // ─── Keyboard Navigation ─────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' && searchResults.length > 0) {
        setIsOpen(true);
        setHighlightedIndex(0);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev < searchResults.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev > 0 ? prev - 1 : searchResults.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < searchResults.length) {
          handleSelectRole(searchResults[highlightedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
    }
  }, [isOpen, searchResults, highlightedIndex, handleSelectRole]);

  // ─── Click Outside ───────────────────────────────────────────────────────
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (comboboxRef.current && !comboboxRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ─── Cleanup debounce on unmount ─────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const onSubmit = useCallback(async (data: FormValues) => {
    setIsLoading(true);
    setError(null);

    if (!data.targetRole) {
      setError('Please search for and select a target job role.');
      setIsLoading(false);
      return;
    }

    try {
      // 1. Fetch data
      const response = await client.get('/api/generate', {
        params: { target_role: data.targetRole },
      });

      // 2. Extract payload safely
      const payload = response.data || response;

      // 3. Log it
      console.log("RAW API PAYLOAD:", payload);

      if (!payload.nodes || payload.nodes.length === 0) {
        setError(`No roadmap data found for "${data.targetRole}". Try a different role.`);
        return;
      }

      // Notify parent with the raw nodes
      onPathFound({
        nodes: payload.nodes,
        edges: payload.edges || [],
        target_role: data.targetRole,
        target_skill: data.targetRole,
        start_skill: startSkill,
        steps: []
      });
    } catch (error: any) {
      console.error("API RENDER ERROR:", error);
      const detail = error.response?.data?.detail;
      setError(detail || 'Failed to generate roadmap. Please check the service is running.');
    } finally {
      setIsLoading(false);
    }
  }, [onPathFound, startSkill]);

  return (
    <div className="w-full max-w-2xl mx-auto p-6 mt-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2 flex items-center">
          <Target className="w-6 h-6 mr-2 text-blue-500" />
          Set Your Goal
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          Search for any tech role — our AI will learn new roles in real-time.
        </p>
        {startSkill !== 'Foundation' && (
          <div className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-full">
            🚀 Starting from: <span className="font-bold">{startSkill}</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

        {/* Dynamic Role Search Combobox */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Target Job Role
          </label>
          <div ref={comboboxRef} className="relative">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                {isSearching ? (
                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                ) : (
                  <Search className="w-4 h-4 text-gray-400" />
                )}
              </div>
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  if (searchResults.length > 0) setIsOpen(true);
                  else if (searchQuery.length === 0) searchRoles('');
                }}
                placeholder="Search roles... e.g. Machine Learning Engineer"
                className="block w-full pl-10 pr-10 py-2.5 text-base border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-all placeholder:text-gray-400 dark:placeholder:text-gray-500"
                role="combobox"
                aria-expanded={isOpen}
                aria-haspopup="listbox"
                aria-autocomplete="list"
                autoComplete="off"
                id="role-search-input"
              />
              {selectedRole && (
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                </div>
              )}
            </div>

            {/* Dropdown Results */}
            {isOpen && (
              <div
                className="role-search-dropdown absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl max-h-60 overflow-y-auto"
                role="listbox"
                id="role-search-listbox"
              >
                {searchResults.length > 0 ? (
                  searchResults.map((role, index) => (
                    <button
                      key={role.id}
                      type="button"
                      role="option"
                      aria-selected={highlightedIndex === index}
                      className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between transition-colors cursor-pointer ${
                        highlightedIndex === index
                          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                          : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      } ${
                        index === 0 ? 'rounded-t-lg' : ''
                      } ${
                        index === searchResults.length - 1 ? 'rounded-b-lg' : ''
                      }`}
                      onClick={() => handleSelectRole(role)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                    >
                      <span className="font-medium">{role.name}</span>
                      {highlightedIndex === index && (
                        <span className="text-xs text-blue-500 dark:text-blue-400">↵ Select</span>
                      )}
                    </button>
                  ))
                ) : isSearching ? (
                  <div className="px-4 py-6 text-center">
                    <Loader2 className="w-5 h-5 text-blue-500 animate-spin mx-auto mb-2" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">Searching roles...</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">AI is validating new roles</p>
                  </div>
                ) : (
                  <div className="px-4 py-4 text-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400">No roles found for "{searchQuery}"</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Try a different search term</p>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Hidden Controller to keep react-hook-form wired */}
          <Controller
            name="targetRole"
            control={control}
            rules={{ required: 'Please select a target role' }}
            render={() => <></>}
          />
          {errors.targetRole && (
            <span className="text-red-500 text-xs mt-1 block">{errors.targetRole.message || 'This field is required'}</span>
          )}
        </div>

        {/* Budget Slider — KEEP EXACTLY AS IS */}
        <div>
          <div className="flex justify-between mb-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
              <DollarSign className="w-4 h-4 mr-1 text-green-500" />
              Maximum Budget
            </label>
            <Controller
              name="maxBudget"
              control={control}
              render={({ field }) => (
                <span className="text-sm font-bold text-blue-600 dark:text-blue-400">${field.value}</span>
              )}
            />
          </div>
          <Controller
            name="maxBudget"
            control={control}
            render={({ field }) => (
              <input
                type="range"
                min="0"
                max="2000"
                step="50"
                {...field}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-blue-600"
              />
            )}
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>$0 (no limit)</span>
            <span>$2000+</span>
          </div>
        </div>

        {/* Time Cap Slider — KEEP EXACTLY AS IS */}
        <div>
          <div className="flex justify-between mb-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center">
              <Clock className="w-4 h-4 mr-1 text-amber-500" />
              Maximum Time
            </label>
            <Controller
              name="maxHours"
              control={control}
              render={({ field }) => (
                <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{field.value} hrs</span>
              )}
            />
          </div>
          <Controller
            name="maxHours"
            control={control}
            render={({ field }) => (
              <input
                type="range"
                min="0"
                max="200"
                step="5"
                {...field}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700 accent-amber-500"
              />
            )}
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1">
            <span>0 hrs (no limit)</span>
            <span>200+ hrs</span>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm rounded-lg border border-red-100 dark:border-red-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <div className="pt-4 flex justify-end">
          <button
            type="submit"
            disabled={isLoading}
            className={`
              flex items-center space-x-2 px-8 py-3 rounded-lg font-medium text-white transition-all w-full justify-center
              ${isLoading
                ? 'bg-blue-300 dark:bg-blue-800/50 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md transform hover:-translate-y-0.5'
              }
            `}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Generating Roadmap…</span>
              </>
            ) : (
              <>
                <span>Generate Learning Path</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default TargetSelectionForm;
