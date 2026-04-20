/**
 * TimelineRoadmap.tsx — Animated learning roadmap with dynamic recalculation.
 *
 * Phase 6.3.2 feature: each step now has a "✓ Mark Complete" button.
 * Clicking it:
 *   1. POSTs to /api/complete-step (webhook → updates PostgreSQL skill vector)
 *   2. Calls `onStepCompleted(to_node)` so App.tsx can re-call /api/find-path
 *      from the user's new skill position → live roadmap update.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  DollarSign,
  Clock,
  ArrowDown,
  Flag,
  CheckCircle2,
  Award,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────
interface PathStep {
  from_node: string;
  to_node: string;
  course: string;
  weight: number;
  cost: number;
  hours: number;
}

interface PathData {
  start_skill: string;
  target_skill: string;
  total_heuristic_cost: number;
  path_nodes: string[];
  steps: PathStep[];
}

interface TimelineRoadmapProps {
  pathData: PathData;
  /** Called after a step is marked complete so App can re-fetch the path. */
  onStepCompleted: (completedSkill: string) => void;
  /** True while App is fetching the recalculated path */
  isRecalculating?: boolean;
}

// ─── Framer Motion variants ───────────────────────────────────────────────────
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.15 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
};

// ─── Component ────────────────────────────────────────────────────────────────
const TimelineRoadmap: React.FC<TimelineRoadmapProps> = ({
  pathData,
  onStepCompleted,
  isRecalculating = false,
}) => {
  const { userId } = useAuth();
  const [completingIndex, setCompletingIndex] = useState<number | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [stepError, setStepError] = useState<string | null>(null);

  const totalCost = pathData.steps.reduce((sum, s) => sum + s.cost, 0);
  const totalHours = pathData.steps.reduce((sum, s) => sum + s.hours, 0);

  /**
   * Marks a step complete:
   * 1. Sends POST /api/complete-step to update the user's skill vector in PG.
   * 2. Notifies parent (App.tsx) to trigger path recalculation.
   */
  const handleMarkComplete = async (step: PathStep, index: number) => {
    setCompletingIndex(index);
    setStepError(null);

    try {
      await client.post('/api/complete-step', {
        user_id: userId ?? 'anonymous',
        skill_name: step.to_node,
      });

      // Locally mark as done immediately for snappy UX
      setCompletedSteps((prev) => new Set(prev).add(step.to_node));

      // Trigger dynamic recalculation from the newly acquired skill node
      onStepCompleted(step.to_node);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setStepError(detail || `Failed to record completion of "${step.to_node}". Please retry.`);
    } finally {
      setCompletingIndex(null);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto mt-8">

      {/* ── Header summary card ── */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="p-5 mb-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl shadow-lg text-white"
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Flag className="w-5 h-5" /> Your Learning Roadmap
          </h2>

          {/* Recalculating spinner */}
          <AnimatePresence>
            {isRecalculating && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex items-center gap-1.5 text-xs bg-white/20 px-3 py-1.5 rounded-full"
              >
                <RefreshCw className="w-3 h-3 animate-spin" />
                Recalculating…
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="text-blue-100 text-sm mb-4">
          Path to <span className="font-semibold">{pathData.target_skill}</span>
          {' '}from <span className="font-semibold">{pathData.start_skill}</span>
        </p>

        <div className="flex flex-wrap gap-6">
          <div className="flex items-center gap-2 text-sm">
            <DollarSign className="w-4 h-4 text-green-300" />
            <span>Est. Cost: <strong>${totalCost.toFixed(0)}</strong></span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4 text-amber-300" />
            <span>Est. Time: <strong>{totalHours.toFixed(0)} hrs</strong></span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <BookOpen className="w-4 h-4 text-purple-300" />
            <span>Steps: <strong>{pathData.steps.length}</strong></span>
          </div>
        </div>
      </motion.div>

      {/* ── Step error banner ── */}
      <AnimatePresence>
        {stepError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm rounded-lg border border-red-100 dark:border-red-800"
          >
            {stepError}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Timeline steps ── */}
      <motion.div
        key={pathData.start_skill + pathData.target_skill}  // re-animate when path changes
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative"
      >
        {/* Vertical connector line */}
        <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-400 to-indigo-400 opacity-30" />

        {pathData.steps.map((step, index) => {
          const isDone = completedSteps.has(step.to_node);
          const isCompleting = completingIndex === index;

          return (
            <motion.div
              key={`${step.from_node}-${step.to_node}-${index}`}
              variants={itemVariants}
              className="relative mb-6 pl-14"
            >
              {/* Step indicator circle */}
              <div
                className={`absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-full shadow-lg text-white font-bold text-sm z-10 transition-all duration-300 ${
                  isDone
                    ? 'bg-gradient-to-br from-green-500 to-emerald-600 shadow-green-500/30'
                    : 'bg-gradient-to-br from-blue-500 to-indigo-600 shadow-blue-500/30'
                }`}
              >
                {isDone ? <CheckCircle2 className="w-5 h-5" /> : index + 1}
              </div>

              {/* From → To nodes label */}
              <div className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-1 flex items-center gap-1">
                <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded">
                  {step.from_node}
                </span>
                <span>→</span>
                <span
                  className={`px-2 py-0.5 rounded font-semibold ${
                    isDone
                      ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-300'
                      : 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300'
                  }`}
                >
                  {step.to_node}
                </span>
              </div>

              {/* Course card */}
              <div
                className={`bg-white dark:bg-gray-800 rounded-xl border p-4 shadow-sm hover:shadow-md transition-all ${
                  isDone
                    ? 'border-green-200 dark:border-green-800 opacity-75'
                    : 'border-gray-100 dark:border-gray-700'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex-shrink-0 mt-0.5 p-2 rounded-lg ${
                      isDone
                        ? 'bg-green-50 dark:bg-green-900/30'
                        : 'bg-blue-50 dark:bg-blue-900/30'
                    }`}
                  >
                    {isDone ? (
                      <Award className="w-4 h-4 text-green-500" />
                    ) : (
                      <BookOpen className="w-4 h-4 text-blue-500" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3
                      className={`font-semibold text-sm ${
                        isDone
                          ? 'line-through text-gray-400 dark:text-gray-500'
                          : 'text-gray-800 dark:text-gray-100'
                      }`}
                    >
                      {step.course}
                    </h3>

                    <div className="flex flex-wrap gap-3 mt-2">
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 px-2 py-1 rounded-full">
                        <DollarSign className="w-3 h-3 text-green-500" />
                        ${step.cost.toFixed(0)}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 px-2 py-1 rounded-full">
                        <Clock className="w-3 h-3 text-amber-500" />
                        {step.hours.toFixed(0)} hrs
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 px-2 py-1 rounded-full">
                        ⚖️ Score: {step.weight.toFixed(2)}
                      </span>
                    </div>

                    {/* ── Mark Complete button (Phase 6.3.2) ── */}
                    {!isDone && (
                      <div className="mt-3">
                        <button
                          onClick={() => handleMarkComplete(step, index)}
                          disabled={isCompleting || isRecalculating}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                          {isCompleting ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Recording…
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3 h-3" />
                              Mark Complete
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {isDone && (
                      <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Completed — roadmap updated!
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Connector arrow */}
              {index < pathData.steps.length - 1 && (
                <div className="flex justify-start pl-1 my-1">
                  <ArrowDown className="w-4 h-4 text-gray-300 dark:text-gray-600 ml-2" />
                </div>
              )}
            </motion.div>
          );
        })}

        {/* Goal reached */}
        <motion.div variants={itemVariants} className="relative mb-6 pl-14">
          <div className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg shadow-green-500/30 text-white z-10">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="flex items-center h-10">
            <span className="text-sm font-semibold text-green-600 dark:text-green-400">
              🎉 Goal: {pathData.target_skill}
            </span>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default TimelineRoadmap;
