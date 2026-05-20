/**
 * TargetSelectionForm.tsx — Goal selector.
 *
 * Calls GET /api/generate?target_role=... to fetch the pre-built roadmap
 * from Neo4j. Passes the raw nodes array to the parent.
 *
 * The Budget and Time sliders are preserved for future filtering features.
 */

import React, { useState, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { Target, DollarSign, Clock, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import client from '../api/client';

// ─── Form Types ──────────────────────────────────────────────────────────────
interface FormValues {
  targetRole: string;
  maxBudget: number;
  maxHours: number;
}

// ─── Available Roles (must match seeded Neo4j role keys) ─────────────────────
const JOB_ROLES = [
  { value: 'frontend', label: 'Frontend Developer' },
  { value: 'backend', label: 'Backend Developer' },
  { value: 'devops', label: 'DevOps Engineer' },
  { value: 'full-stack', label: 'Full-Stack Developer' },
  { value: 'data-analyst', label: 'Data Analyst' },
  { value: 'cyber-security', label: 'Cyber Security' },
  { value: 'android', label: 'Android Developer' },
];

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
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      targetRole: 'frontend',
      maxBudget: 200,
      maxHours: 40,
    },
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = useCallback(async (data: FormValues) => {
    setIsLoading(true);
    setError(null);

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
          Where do you want to go, and what are your constraints?
        </p>
        {startSkill !== 'Foundation' && (
          <div className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-full">
            🚀 Starting from: <span className="font-bold">{startSkill}</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

        {/* Target Role Dropdown */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Target Job Role
          </label>
          <div className="relative">
            <Controller
              name="targetRole"
              control={control}
              rules={{ required: true }}
              render={({ field }) => (
                <select
                  {...field}
                  className="block w-full pl-3 pr-10 py-2.5 text-base border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 appearance-none border"
                >
                  {JOB_ROLES.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              )}
            />
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
          {errors.targetRole && (
            <span className="text-red-500 text-xs mt-1">This field is required</span>
          )}
        </div>

        {/* Budget Slider */}
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

        {/* Time Cap Slider */}
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
