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
import { motion } from 'framer-motion';
import { Target, DollarSign, Clock, ArrowRight, AlertCircle, Search, Sparkles } from 'lucide-react';
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
  /** Skills extracted from the user's resume */
  resumeSkills?: string[];
}

// ─── Component ───────────────────────────────────────────────────────────────
const TargetSelectionForm: React.FC<TargetSelectionFormProps> = ({
  onPathFound,
  startSkill = 'Foundation',
  resumeSkills = [],
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
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<RoleOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<RoleOption | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [isCustomSelection, setIsCustomSelection] = useState(false);

  const comboboxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Whether we should show the "AI Discovery" custom option
  const showCustomOption = !isSearching && searchResults.length === 0 && searchQuery.trim().length >= 3;
  // Total items in the dropdown (real results + possibly the custom option)
  const totalDropdownItems = searchResults.length + (showCustomOption ? 1 : 0);

  // ─── Debounced Search ────────────────────────────────────────────────────
  const searchRoles = useCallback(async (query: string) => {
    if (query.trim().length < 3) {
      setSearchResults([]);
      setIsOpen(false);
      setSearchError(null);
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    try {
      const response = await client.get('/api/search-roles', {
        params: { query: query.trim() },
      });
      // Handle both formats: array (success) and {"roles": []} (crash-proof fallback)
      const raw = response.data;
      const results: RoleOption[] = Array.isArray(raw) ? raw : (raw?.roles ?? []);
      setSearchResults(results);
      setSearchError(null);
      setIsOpen(results.length > 0 || query.trim().length >= 3);
      setHighlightedIndex(-1);
    } catch (err) {
      console.error('[RoleSearch] Search failed:', err);
      setSearchResults([]);
      setSearchError("Server unreachable");
      setIsOpen(true);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleInputChange = useCallback((value: string) => {
    console.log("onChange:", value, "length:", value.length);
    setSearchQuery(value);
    setSelectedRole(null);
    setIsCustomSelection(false);
    setValue('targetRole', '');

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      searchRoles(value);
    }, 300);
  }, [searchRoles, setValue]);

  // ─── Selection Handler ───────────────────────────────────────────────────
  const handleSelectRole = useCallback((role: RoleOption, isCustom: boolean = false) => {
    setSelectedRole(role);
    setIsCustomSelection(isCustom);
    setSearchQuery(role.name);
    setValue('targetRole', role.name);
    setIsOpen(false);
    setSearchResults([]);
    setHighlightedIndex(-1);
  }, [setValue]);

  // ─── Custom Role Selection (AI Discovery) ─────────────────────────────
  const handleSelectCustomRole = useCallback(() => {
    const customRole: RoleOption = {
      id: 'custom',
      name: searchQuery.trim(),
    };
    handleSelectRole(customRole, true);
  }, [searchQuery, handleSelectRole]);

  // ─── Keyboard Navigation ─────────────────────────────────────────────────
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' && totalDropdownItems > 0) {
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
          prev < totalDropdownItems - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev > 0 ? prev - 1 : totalDropdownItems - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < searchResults.length) {
          handleSelectRole(searchResults[highlightedIndex]);
        } else if (showCustomOption && highlightedIndex === searchResults.length) {
          // The custom option is the last item (after all real results)
          handleSelectCustomRole();
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
    }
  }, [isOpen, searchResults, totalDropdownItems, highlightedIndex, handleSelectRole, handleSelectCustomRole, showCustomOption]);

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
      // 1. Fetch high-level LLM roadmap milestones
      const roadmapResponse = await client.get('/api/generate-roadmap', {
        params: { target_role: data.targetRole, skills: resumeSkills.join(', ') },
      });
      const roadmapPayload = roadmapResponse.data || roadmapResponse;

      if (!roadmapPayload.milestones || roadmapPayload.milestones.length === 0) {
        setError(`No roadmap data found for "${data.targetRole}". Try a different role.`);
        return;
      }

      // 2. Fetch A* Path Nodes & Optimize (Gap Analysis)
      let pathNodes = [];
      try {
        const pathResponse = await client.get('/api/find-path', {
          params: { 
            target: data.targetRole, 
            start: startSkill,
            known_skills: resumeSkills.join(',') 
          },
        });
        const pathPayload = pathResponse.data || pathResponse;
        pathNodes = pathPayload.path_nodes || [];
      } catch (pathErr) {
        console.warn("Gap Analysis / Pathfinder failed, falling back to basic roadmap.", pathErr);
      }

      // 3. Notify parent with merged data
      onPathFound({
        milestones: roadmapPayload.milestones,
        target_role: data.targetRole,
        start_skill: startSkill,
        nodes: pathNodes,
        knownSkills: resumeSkills
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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="w-full max-w-2xl mx-auto mt-8"
    >
      <div className="p-6 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-1.5 flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-brand-50 dark:bg-brand-900/30">
              <Target className="w-5 h-5 text-brand-500" />
            </div>
            Set Your Goal
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Search for any tech role — our AI will learn new roles in real-time.
          </p>
          {startSkill !== 'Foundation' && (
            <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/30 px-3 py-1.5 rounded-full">
              <span className="text-brand-500">Starting from:</span>
              <span className="font-bold">{startSkill}</span>
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
                    <div className="w-4 h-4 rounded-full border-2 border-brand-200 border-t-brand-500 animate-spin" />
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
                  className="block w-full pl-10 pr-10 py-2.5 text-base border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 sm:text-sm rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-all placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  role="combobox"
                  aria-expanded={isOpen}
                  aria-haspopup="listbox"
                  aria-autocomplete="list"
                  autoComplete="off"
                  id="role-search-input"
                />
                {selectedRole && (
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                    <Sparkles className={`w-4 h-4 ${isCustomSelection ? 'text-violet-500' : 'text-amber-500'}`} />
                  </div>
                )}
              </div>

              {isOpen && (
                <div
                  className="role-search-dropdown absolute z-50 w-full mt-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl max-h-60 overflow-y-auto"
                  role="listbox"
                  id="role-search-listbox"
                >
                  {searchError ? (
                    <div className="px-4 py-4 text-center">
                      <AlertCircle className="w-5 h-5 text-red-500 mx-auto mb-1" />
                      <p className="text-sm text-red-500 dark:text-red-400 font-medium">{searchError}</p>
                    </div>
                  ) : searchResults.length > 0 ? (
                    searchResults.map((role, index) => (
                      <button
                        key={role.id}
                        type="button"
                        role="option"
                        aria-selected={highlightedIndex === index}
                        className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between transition-colors cursor-pointer ${
                          highlightedIndex === index
                            ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300'
                            : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                        }`}
                        onClick={() => handleSelectRole(role)}
                        onMouseEnter={() => setHighlightedIndex(index)}
                      >
                        <span className="font-medium">{role.name}</span>
                        {highlightedIndex === index && (
                          <span className="text-xs text-brand-500 dark:text-brand-400 font-medium">↵ Select</span>
                        )}
                      </button>
                    ))
                  ) : isSearching ? (
                    <div className="px-4 py-6 text-center">
                      <div className="w-6 h-6 rounded-full border-2 border-brand-200 border-t-brand-500 animate-spin mx-auto mb-2" />
                      <p className="text-sm text-gray-500 dark:text-gray-400">Searching roles...</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">AI is validating new roles</p>
                    </div>
                  ) : showCustomOption ? (
                    <button
                      type="button"
                      role="option"
                      aria-selected={highlightedIndex === 0}
                      className={`w-full text-left px-4 py-3 text-sm flex items-center gap-3 transition-colors cursor-pointer ${
                        highlightedIndex === 0
                          ? 'bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
                          : 'text-gray-600 dark:text-gray-300 hover:bg-violet-50/50 dark:hover:bg-violet-900/20'
                      }`}
                      onClick={handleSelectCustomRole}
                      onMouseEnter={() => setHighlightedIndex(0)}
                    >
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-brand-600 flex items-center justify-center shadow-sm">
                        <Sparkles className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">
                          Search for: &ldquo;{searchQuery.trim()}&rdquo;
                        </p>
                        <p className="text-xs text-violet-500 dark:text-violet-400 mt-0.5">
                          AI Discovery — our model will validate &amp; learn this role
                        </p>
                      </div>
                      {highlightedIndex === 0 && (
                        <span className="flex-shrink-0 text-xs text-violet-500 dark:text-violet-400 font-medium">↵ Select</span>
                      )}
                    </button>
                  ) : searchQuery.trim().length > 0 ? (
                    <div className="px-4 py-4 text-center">
                      <p className="text-sm text-gray-500 dark:text-gray-400">Type at least 3 characters to search</p>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
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

          {/* Budget Slider */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-emerald-500" />
                Maximum Budget
              </label>
              <Controller
                name="maxBudget"
                control={control}
                render={({ field }) => (
                  <span className="text-sm font-bold text-brand-600 dark:text-brand-400">${field.value}</span>
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
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-brand-500"
                />
              )}
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>$0 (no limit)</span>
              <span>$2000+</span>
            </div>
          </div>

          {/* Time Cap Slider */}
          <div>
            <div className="flex justify-between mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-amber-500" />
                Maximum Time
              </label>
              <Controller
                name="maxHours"
                control={control}
                render={({ field }) => (
                  <span className="text-sm font-bold text-brand-600 dark:text-brand-400">{field.value} hrs</span>
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
                  className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-brand-500"
                />
              )}
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>0 hrs (no limit)</span>
              <span>200+ hrs</span>
            </div>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              role="alert"
              className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm rounded-lg border border-red-100 dark:border-red-800 flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </motion.div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading}
              className={`
                flex items-center justify-center gap-2 px-8 py-3 rounded-lg font-semibold text-white transition-all w-full
                ${isLoading
                  ? 'bg-brand-300 dark:bg-brand-800/50 cursor-not-allowed'
                  : 'bg-gradient-to-r from-brand-600 to-violet-600 hover:from-brand-700 hover:to-violet-700 shadow-md shadow-brand-500/20 hover:shadow-lg hover:shadow-brand-500/30 active:scale-[0.98]'
                }
              `}
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  <span>Generating Roadmap...</span>
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
    </motion.div>
  );
};

export default TargetSelectionForm;
