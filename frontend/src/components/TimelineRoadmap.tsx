/**
 * TimelineRoadmap.tsx — Vertical Milestone Checklist.
 *
 * Renders a checklist of chunked skills.
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Flag,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Clock,
  BookOpen
} from 'lucide-react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { topologicalSort, SkillEdge } from '../utils/graph';

// ─── Types ────────────────────────────────────────────────────────────────────
interface SkillNode {
  id: string;
  label: string;
}

interface PathData {
  target_role: string;
  start_skill?: string;
  nodes: SkillNode[];
  edges: SkillEdge[];
}

interface TimelineRoadmapProps {
  pathData: PathData;
  /** True while App is fetching the recalculated path */
  isRecalculating?: boolean;
  /** Called after a step is marked complete so App can re-fetch the path. */
  onStepCompleted?: (completedSkill: string) => Promise<void> | void;
}

interface Milestone {
  id: number;
  title: string;
  skills: SkillNode[];
}

// ─── Utilities ────────────────────────────────────────────────────────────────
/** Chunks a flat array of nodes into groups of `size`. */
function chunkNodes(nodes: SkillNode[], size: number): Milestone[] {
  const chunks: Milestone[] = [];
  for (let i = 0; i < nodes.length; i += size) {
    chunks.push({
      id: i / size + 1,
      title: `Milestone ${i / size + 1}`,
      skills: nodes.slice(i, i + size),
    });
  }
  return chunks;
}

// ─── Framer Motion variants ───────────────────────────────────────────────────
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
};

// ─── Component ────────────────────────────────────────────────────────────────
const TimelineRoadmap: React.FC<TimelineRoadmapProps> = ({
  pathData,
  isRecalculating = false,
  onStepCompleted,
}) => {
  const { userId } = useAuth();
  
  // State for checklist
  const [completedSkills, setCompletedSkills] = useState<Set<string>>(new Set());
  const [expandedMilestones, setExpandedMilestones] = useState<Set<number>>(new Set([1])); // Expand first by default
  const [loadingSkill, setLoadingSkill] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  // Safe fallback if nodes/edges is undefined
  const safeNodes = pathData.nodes || [];
  const safeEdges = pathData.edges || [];

  // Topologically sort nodes before chunking
  const sortedNodes = useMemo(() => topologicalSort(safeNodes, safeEdges), [safeNodes, safeEdges]);

  // Chunk nodes into milestones of 5 skills each
  const milestones = useMemo(() => chunkNodes(sortedNodes, 5), [sortedNodes]);

  const toggleMilestone = (id: number) => {
    setExpandedMilestones(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /**
   * Toggles a skill's completion status.
   * If checking it off, POST to backend to record completion.
   */
  const handleToggleSkill = async (skill: SkillNode) => {
    const isDone = completedSkills.has(skill.id);
    
    if (isDone) {
      // Uncheck locally (optional: you might want an API route for unchecking)
      setCompletedSkills(prev => {
        const next = new Set(prev);
        next.delete(skill.id);
        return next;
      });
      return;
    }

    // Check it off
    setLoadingSkill(skill.id);
    setStepError(null);

    try {
      await client.post('/api/complete-step', {
        user_id: userId ?? 'anonymous',
        skill_name: skill.label,
      });

      setCompletedSkills(prev => new Set(prev).add(skill.id));
      if (onStepCompleted) {
        onStepCompleted(skill.label);
      }
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setStepError(detail || `Failed to record completion of "${skill.label}".`);
    } finally {
      setLoadingSkill(null);
    }
  };

  if (safeNodes.length === 0) return null;

  return (
    <div className="w-full max-w-2xl mx-auto mt-8">

      {/* ── Header summary banner ── */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="p-5 mb-8 bg-gradient-to-r from-slate-800 to-slate-900 border border-slate-700 rounded-xl shadow-lg text-white"
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Flag className="w-5 h-5 text-indigo-400" /> Your Learning Roadmap
          </h2>

          {/* Recalculating spinner */}
          <AnimatePresence>
            {isRecalculating && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex items-center gap-1.5 text-xs bg-slate-700/50 px-3 py-1.5 rounded-full"
              >
                <RefreshCw className="w-3 h-3 animate-spin text-indigo-400" />
                Updating…
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="text-slate-400 text-sm mb-4">
          Target Role: <span className="font-semibold text-indigo-300 capitalize">{pathData.target_role.replace('-', ' ')}</span>
        </p>

        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2 text-sm bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700/50">
            <DollarSign className="w-4 h-4 text-green-400" />
            <span className="text-slate-400">Est. Cost:</span>
            <strong className="text-slate-200">$0 (Open Source)</strong>
          </div>
          <div className="flex items-center gap-2 text-sm bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700/50">
            <Clock className="w-4 h-4 text-amber-400" />
            <span className="text-slate-400">Est. Time:</span>
            <strong className="text-slate-200">{safeNodes.length * 5} hrs</strong>
          </div>
          <div className="flex items-center gap-2 text-sm bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700/50">
            <BookOpen className="w-4 h-4 text-purple-400" />
            <span className="text-slate-400">Steps:</span>
            <strong className="text-slate-200">{safeNodes.length}</strong>
          </div>
          <div className="flex items-center gap-2 text-sm bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700/50">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-slate-400">Completed:</span>
            <strong className="text-emerald-400">{completedSkills.size}</strong>
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
            className="mb-6 p-3 bg-red-900/20 text-red-400 text-sm rounded-lg border border-red-900/50"
          >
            {stepError}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Vertical Milestone Checklist ── */}
      <motion.div
        key={pathData.target_role}
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-4"
      >
        {milestones.map((milestone) => {
          const isExpanded = expandedMilestones.has(milestone.id);
          const completedInMilestone = milestone.skills.filter(s => completedSkills.has(s.id)).length;
          const isMilestoneComplete = completedInMilestone === milestone.skills.length;

          return (
            <motion.div
              key={milestone.id}
              variants={itemVariants}
              className={`bg-slate-800 border ${isMilestoneComplete ? 'border-emerald-500/30' : 'border-slate-700'} rounded-xl overflow-hidden shadow-sm transition-colors`}
            >
              {/* Accordion Header */}
              <button
                onClick={() => toggleMilestone(milestone.id)}
                className="w-full flex items-center justify-between p-4 bg-slate-800 hover:bg-slate-700/50 transition-colors focus:outline-none"
              >
                <div className="flex items-center gap-3">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full ${isMilestoneComplete ? 'bg-emerald-500/20 text-emerald-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
                    {isMilestoneComplete ? <CheckCircle2 className="w-5 h-5" /> : milestone.id}
                  </div>
                  <div className="text-left">
                    <h3 className={`font-semibold ${isMilestoneComplete ? 'text-emerald-400' : 'text-slate-200'}`}>
                      {milestone.title}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {completedInMilestone} / {milestone.skills.length} skills completed
                    </p>
                  </div>
                </div>
                <div className="text-slate-500">
                  {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </div>
              </button>

              {/* Accordion Body (Skills List) */}
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="border-t border-slate-700/50"
                  >
                    <div className="p-2">
                      {milestone.skills.map((skill) => {
                        const isDone = completedSkills.has(skill.id);
                        const isLoading = loadingSkill === skill.id;

                        return (
                          <label
                            key={skill.id}
                            className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all ${isDone ? 'hover:bg-slate-800/80' : 'hover:bg-slate-700/30'}`}
                          >
                            <div className="relative flex items-center justify-center mt-0.5">
                              <input
                                type="checkbox"
                                checked={isDone}
                                onChange={() => handleToggleSkill(skill)}
                                disabled={isLoading}
                                className="peer sr-only"
                              />
                              <div className={`w-5 h-5 rounded flex items-center justify-center transition-all ${
                                isDone 
                                  ? 'bg-indigo-500 border-indigo-500 text-white' 
                                  : 'bg-slate-900 border-2 border-slate-600 peer-hover:border-indigo-400'
                              }`}>
                                {isLoading ? (
                                  <Loader2 className="w-3 h-3 animate-spin text-indigo-200" />
                                ) : isDone ? (
                                  <CheckCircle2 className="w-4 h-4" />
                                ) : null}
                              </div>
                            </div>
                            <span className={`text-sm font-medium pt-0.5 transition-colors ${
                              isDone ? 'text-slate-500 line-through' : 'text-slate-300'
                            }`}>
                              {skill.label}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
};

export default TimelineRoadmap;
