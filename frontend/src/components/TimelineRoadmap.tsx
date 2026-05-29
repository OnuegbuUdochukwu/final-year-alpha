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
  BookOpen,
  AlertTriangle,
  ShieldCheck
} from 'lucide-react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Milestone {
  title: string;
  description: string;
  skills: string[];
  resource: string;
  project: string;
  estimated_hours?: number;
}

interface SkillNode {
  id: string;
  label: string;
}

interface PathData {
  target_role: string;
  start_skill?: string;
  milestones: Milestone[];
  nodes?: SkillNode[];
}

interface TimelineRoadmapProps {
  pathData: PathData;
  /** True while App is fetching the recalculated path */
  isRecalculating?: boolean;
  /** Called after a step is marked complete so App can re-fetch the path. */
  onStepCompleted?: (completedSkill: string) => Promise<void> | void;
  /** Skills already mastered by the user (from gap analysis/resume). */
  knownSkills?: string[];
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
// ─── Helper: case-insensitive skill check ─────────────────────────────────
/** Returns true if `skillName` exists in the given Set (case-insensitive). */
const isSkillKnown = (skillName: string, knownSet: Set<string>): boolean =>
  knownSet.has(skillName.trim().toLowerCase());

/** Returns true if ALL skills in a milestone are already known. */
const isMilestoneMastered = (milestone: Milestone, knownSet: Set<string>): boolean =>
  milestone.skills.length > 0 && milestone.skills.every(s => isSkillKnown(s, knownSet));

const TimelineRoadmap: React.FC<TimelineRoadmapProps> = ({
  pathData,
  isRecalculating = false,
  onStepCompleted,
  knownSkills = [],
}) => {
  const { userId } = useAuth();

  // Build a normalized (lowercased) Set from the prop for O(1) case-insensitive lookups
  const knownSkillsNormalized = useMemo(
    () => new Set(knownSkills.map(s => s.trim().toLowerCase())),
    [knownSkills]
  );
  
  // State for checklist — initialized with normalized known skills
  const [completedSkills, setCompletedSkills] = React.useState<Set<string>>(
    () => new Set(knownSkills.map(s => s.trim().toLowerCase()))
  );
  const [expandedMilestones, setExpandedMilestones] = useState<Set<number>>(new Set());
  const [flaggedMilestones, setFlaggedMilestones] = useState<Set<string>>(new Set());
  const [loadingSkill, setLoadingSkill] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  // Keep completedSkills in sync if knownSkills prop updates
  React.useEffect(() => {
    if (knownSkills.length > 0) {
      setCompletedSkills(prev => {
        const next = new Set(prev);
        knownSkills.forEach(s => next.add(s.trim().toLowerCase()));
        return next;
      });
    }
  }, [knownSkills]);

  // Safe fallback if milestones is undefined
  const milestones = pathData.milestones || [];

  // ─── Dynamic summary stats (exclude mastered milestones) ──────────────
  const remainingMilestones = milestones.filter(
    (m: Milestone) => !isMilestoneMastered(m, knownSkillsNormalized)
  );
  const masteredCount = milestones.length - remainingMilestones.length;
  const remainingHours = remainingMilestones.reduce(
    (sum: number, m: Milestone) => sum + (m.estimated_hours || 10), 0
  );


  const toggleMilestone = (idx: number) => {
    setExpandedMilestones(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  /**
   * Submits feedback flagging a milestone as irrelevant.
   */
  const handleFlagMilestone = async (milestoneTitle: string) => {
    if (flaggedMilestones.has(milestoneTitle)) return;
    
    try {
      await client.post('/api/feedback/flag-milestone', {
        role_name: pathData.target_role,
        milestone_title: milestoneTitle,
        comment: "User flagged as irrelevant"
      });
      setFlaggedMilestones(prev => new Set(prev).add(milestoneTitle));
    } catch (err: any) {
      console.error("Failed to flag milestone:", err);
      const detail = err.response?.data?.detail;
      setStepError(detail || `Failed to flag "${milestoneTitle}".`);
    }
  };

  /**
   * Toggles a skill's completion status.
   * If checking it off, POST to backend to record completion.
   */
  const handleToggleSkill = async (skillName: string) => {
    const normalizedName = skillName.trim().toLowerCase();
    const isDone = completedSkills.has(normalizedName);
    
    if (isDone) {
      // Uncheck locally (optional: you might want an API route for unchecking)
      setCompletedSkills(prev => {
        const next = new Set(prev);
        next.delete(normalizedName);
        return next;
      });
      return;
    }

    // Check it off
    setLoadingSkill(skillName);
    setStepError(null);

    try {
      await client.post('/api/complete-step', {
        user_id: userId ?? 'anonymous',
        skill_name: skillName,
      });

      setCompletedSkills(prev => new Set(prev).add(normalizedName));
      if (onStepCompleted) {
        onStepCompleted(skillName);
      }
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setStepError(detail || `Failed to record completion of "${skillName}".`);
    } finally {
      setLoadingSkill(null);
    }
  };

  if (milestones.length === 0) return null;

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
            <strong className="text-slate-200">
              {remainingHours} hrs
            </strong>
          </div>
          <div className="flex items-center gap-2 text-sm bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700/50">
            <BookOpen className="w-4 h-4 text-purple-400" />
            <span className="text-slate-400">Remaining:</span>
            <strong className="text-slate-200">{remainingMilestones.length} / {milestones.length}</strong>
          </div>
          <div className="flex items-center gap-2 text-sm bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700/50">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-slate-400">Completed:</span>
            <strong className="text-emerald-400">{completedSkills.size}</strong>
          </div>
          {masteredCount > 0 && (
            <div className="flex items-center gap-2 text-sm bg-emerald-900/20 px-3 py-1.5 rounded-lg border border-emerald-700/30">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="text-emerald-400">Already Mastered:</span>
              <strong className="text-emerald-300">{masteredCount} milestones</strong>
            </div>
          )}
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
        {milestones.map((milestone, idx) => {
          const isExpanded = expandedMilestones.has(idx);
          const completedInMilestone = milestone.skills.filter(s => isSkillKnown(s, completedSkills)).length;
          const isMilestoneComplete = completedInMilestone === milestone.skills.length && milestone.skills.length > 0;
          const mastered = isMilestoneMastered(milestone, knownSkillsNormalized);

          return (
            <motion.div
              key={idx}
              variants={itemVariants}
              className={`bg-slate-800 border ${
                mastered
                  ? 'border-emerald-500/20 opacity-60'
                  : isMilestoneComplete
                    ? 'border-emerald-500/30'
                    : 'border-slate-700'
              } rounded-xl overflow-hidden shadow-sm transition-colors`}
            >
              {/* Accordion Header */}
              <button
                onClick={() => toggleMilestone(idx)}
                className="w-full flex items-center justify-between p-4 bg-slate-800 hover:bg-slate-700/50 transition-colors focus:outline-none"
              >
                <div className="flex items-center gap-3">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                    mastered
                      ? 'bg-emerald-500/30 text-emerald-300'
                      : isMilestoneComplete
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-indigo-500/20 text-indigo-400'
                  }`}>
                    {mastered ? <ShieldCheck className="w-5 h-5" /> : isMilestoneComplete ? <CheckCircle2 className="w-5 h-5" /> : idx + 1}
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <h3 className={`font-semibold ${
                        mastered
                          ? 'text-emerald-300 line-through'
                          : isMilestoneComplete
                            ? 'text-emerald-400'
                            : 'text-slate-200'
                      }`}>
                        {milestone.title}
                      </h3>
                      {mastered && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          <ShieldCheck className="w-3 h-3" /> Mastered
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {mastered
                        ? 'All skills already known — skipped'
                        : `${completedInMilestone} / ${milestone.skills.length} skills completed`
                      }
                    </p>
                  </div>
                </div>
                <div className="text-slate-500 flex items-center gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFlagMilestone(milestone.title);
                    }}
                    disabled={flaggedMilestones.has(milestone.title)}
                    className={`p-1.5 rounded-lg transition-colors ${flaggedMilestones.has(milestone.title) ? 'text-red-400 bg-red-400/10 cursor-not-allowed' : 'hover:bg-slate-700 hover:text-red-400'}`}
                    title="Flag as irrelevant"
                  >
                    <AlertTriangle className="w-4 h-4" />
                  </button>
                  {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </div>
              </button>

              {/* Accordion Body */}
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="border-t border-slate-700/50"
                  >
                    <div className="p-4 space-y-4">
                      {/* Description & Metadata */}
                      <div className="text-sm text-slate-300">
                        <p className="mb-3">{milestone.description}</p>
                        <div className="flex flex-col gap-2">
                          <div className="flex items-start gap-2 text-indigo-300">
                            <BookOpen className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <span><strong>Resource:</strong> {milestone.resource}</span>
                          </div>
                          <div className="flex items-start gap-2 text-emerald-300">
                            <Flag className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <span><strong>Project:</strong> {milestone.project}</span>
                          </div>
                        </div>
                      </div>

                      {/* Skills List */}
                      <div className="pt-2 border-t border-slate-700/50">
                        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Skills to Master</h4>
                        {milestone.skills.map((skillName) => {
                          const isDone = isSkillKnown(skillName, completedSkills);
                          const isPreMastered = isSkillKnown(skillName, knownSkillsNormalized);
                          const isLoading = loadingSkill === skillName;

                          return (
                            <label
                              key={skillName}
                              className={`flex items-start gap-3 p-3 rounded-lg transition-all ${
                                isPreMastered
                                  ? 'opacity-50 cursor-default'
                                  : isDone
                                    ? 'cursor-pointer hover:bg-slate-800/80'
                                    : 'cursor-pointer hover:bg-slate-700/30'
                              }`}
                            >
                              <div className="relative flex items-center justify-center mt-0.5">
                                <input
                                  type="checkbox"
                                  checked={isDone}
                                  onChange={() => handleToggleSkill(skillName)}
                                  disabled={isLoading || isPreMastered}
                                  className="peer sr-only"
                                />
                                <div className={`w-5 h-5 rounded flex items-center justify-center transition-all ${
                                  isPreMastered
                                    ? 'bg-emerald-600 border-emerald-600 text-white'
                                    : isDone 
                                      ? 'bg-indigo-500 border-indigo-500 text-white' 
                                      : 'bg-slate-900 border-2 border-slate-600 peer-hover:border-indigo-400'
                                }`}>
                                  {isLoading ? (
                                    <Loader2 className="w-3 h-3 animate-spin text-indigo-200" />
                                  ) : isPreMastered ? (
                                    <ShieldCheck className="w-4 h-4" />
                                  ) : isDone ? (
                                    <CheckCircle2 className="w-4 h-4" />
                                  ) : null}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 pt-0.5">
                                <span className={`text-sm font-medium transition-colors ${
                                  isPreMastered
                                    ? 'text-emerald-400/70 line-through'
                                    : isDone
                                      ? 'text-slate-500 line-through'
                                      : 'text-slate-300'
                                }`}>
                                  {skillName}
                                </span>
                                {isPreMastered && (
                                  <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/60">
                                    Known
                                  </span>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
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
