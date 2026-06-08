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
  ShieldCheck,
  Target,
} from 'lucide-react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

interface Milestone {
  milestone_name: string;
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
  isRecalculating?: boolean;
  onStepCompleted?: (completedSkill: string) => Promise<void> | void;
  knownSkills?: string[];
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
};

const isSkillKnown = (skillName: string, knownSet: Set<string>): boolean =>
  knownSet.has(skillName.trim().toLowerCase());

const isMilestoneMastered = (milestone: Milestone, knownSet: Set<string>): boolean =>
  milestone.skills.length > 0 && milestone.skills.every(s => isSkillKnown(s, knownSet));

const TimelineRoadmap: React.FC<TimelineRoadmapProps> = ({
  pathData,
  isRecalculating = false,
  onStepCompleted,
  knownSkills = [],
}) => {
  const { userId } = useAuth();

  const knownSkillsNormalized = useMemo(
    () => new Set(knownSkills.map(s => s.trim().toLowerCase())),
    [knownSkills]
  );

  const [completedSkills, setCompletedSkills] = React.useState<Set<string>>(
    () => new Set(knownSkills.map(s => s.trim().toLowerCase()))
  );
  const [expandedMilestones, setExpandedMilestones] = useState<Set<number>>(new Set());
  const [flaggedMilestones, setFlaggedMilestones] = useState<Set<string>>(new Set());
  const [loadingSkill, setLoadingSkill] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);

  React.useEffect(() => {
    if (knownSkills.length > 0) {
      setCompletedSkills(prev => {
        const next = new Set(prev);
        knownSkills.forEach(s => next.add(s.trim().toLowerCase()));
        return next;
      });
    }
  }, [knownSkills]);

  const milestones = pathData.milestones || [];

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
      const detail = err.response?.data?.detail;
      setStepError(detail || `Failed to flag "${milestoneTitle}".`);
    }
  };

  const handleToggleSkill = async (skillName: string) => {
    const normalizedName = skillName.trim().toLowerCase();
    const isDone = completedSkills.has(normalizedName);

    if (isDone) {
      setCompletedSkills(prev => {
        const next = new Set(prev);
        next.delete(normalizedName);
        return next;
      });
      return;
    }

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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-2xl mx-auto mt-8"
    >
      <div className="p-5 mb-6 bg-gradient-to-br from-gray-900 to-gray-950 dark:from-gray-950 dark:to-black border border-gray-800 rounded-xl shadow-sm text-white">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Flag className="w-5 h-5 text-brand-400" /> Your Learning Roadmap
          </h2>

          <AnimatePresence>
            {isRecalculating && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex items-center gap-1.5 text-xs bg-gray-800/50 px-3 py-1.5 rounded-full"
              >
                <RefreshCw className="w-3 h-3 animate-spin text-brand-400" />
                Updating&hellip;
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="text-gray-400 text-sm mb-4">
          Target Role:{' '}
          <span className="font-semibold text-brand-300 capitalize">
            {pathData.target_role.replace('-', ' ')}
          </span>
        </p>

        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-1.5 text-xs bg-gray-800/60 px-2.5 py-1.5 rounded-lg border border-gray-700/50">
            <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-gray-400">Cost:</span>
            <strong className="text-gray-200">$0 (Open Source)</strong>
          </div>
          <div className="flex items-center gap-1.5 text-xs bg-gray-800/60 px-2.5 py-1.5 rounded-lg border border-gray-700/50">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-gray-400">Time:</span>
            <strong className="text-gray-200">{remainingHours} hrs</strong>
          </div>
          <div className="flex items-center gap-1.5 text-xs bg-gray-800/60 px-2.5 py-1.5 rounded-lg border border-gray-700/50">
            <BookOpen className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-gray-400">Steps:</span>
            <strong className="text-gray-200">{remainingMilestones.length} / {milestones.length}</strong>
          </div>
          <div className="flex items-center gap-1.5 text-xs bg-gray-800/60 px-2.5 py-1.5 rounded-lg border border-gray-700/50">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-gray-400">Done:</span>
            <strong className="text-emerald-400">{completedSkills.size}</strong>
          </div>
          {masteredCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs bg-emerald-900/20 px-2.5 py-1.5 rounded-lg border border-emerald-700/30">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Mastered:</span>
              <strong className="text-emerald-300">{masteredCount}</strong>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {stepError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            role="alert"
            className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm rounded-lg border border-red-100 dark:border-red-800 flex items-center gap-2"
          >
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {stepError}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative">
        <div className="absolute left-[17px] top-2 bottom-2 w-0.5 bg-gray-200 dark:bg-gray-800 rounded-full" />

        <motion.div
          key={pathData.target_role}
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-3 relative"
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
                className={`ml-9 bg-white dark:bg-gray-900 border ${
                  mastered
                    ? 'border-emerald-200 dark:border-emerald-800/40 opacity-60'
                    : isMilestoneComplete
                      ? 'border-emerald-300 dark:border-emerald-700/40'
                      : 'border-gray-200 dark:border-gray-800'
                } rounded-xl overflow-hidden shadow-sm transition-colors`}
              >
                <button
                  onClick={() => toggleMilestone(idx)}
                  className="w-full flex items-center justify-between p-4 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0 ${
                        mastered
                          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                          : isMilestoneComplete
                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500 dark:text-emerald-400'
                            : 'bg-brand-100 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400'
                      }`}
                    >
                      {mastered ? (
                        <ShieldCheck className="w-4 h-5" />
                      ) : isMilestoneComplete ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : (
                        <Target className="w-4 h-4" />
                      )}
                    </div>
                    <div className="text-left min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3
                          className={`text-sm font-semibold truncate ${
                            mastered
                              ? 'text-emerald-600 dark:text-emerald-400 line-through'
                              : isMilestoneComplete
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-gray-800 dark:text-gray-100'
                          }`}
                        >
                          {milestone.milestone_name}
                        </h3>
                        {mastered && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700/40 flex-shrink-0">
                            <ShieldCheck className="w-2.5 h-2.5" /> Mastered
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {mastered
                          ? 'All skills already known'
                          : `${completedInMilestone} / ${milestone.skills.length} skills`
                        }
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFlagMilestone(milestone.milestone_name);
                      }}
                      disabled={flaggedMilestones.has(milestone.milestone_name)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        flaggedMilestones.has(milestone.milestone_name)
                          ? 'text-red-500 bg-red-50 dark:bg-red-900/20 cursor-not-allowed'
                          : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-red-500'
                      }`}
                      title="Flag as irrelevant"
                      aria-label={`Flag ${milestone.milestone_name} as irrelevant`}
                    >
                      <AlertTriangle className="w-4 h-4" />
                    </button>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-t border-gray-100 dark:border-gray-800"
                    >
                      <div className="p-4 space-y-4">
                        <div className="text-sm text-gray-600 dark:text-gray-300">
                          <p className="mb-3 leading-relaxed">{milestone.description}</p>
                          <div className="flex flex-col gap-2">
                            <div className="flex items-start gap-2 text-brand-600 dark:text-brand-400">
                              <BookOpen className="w-4 h-4 mt-0.5 flex-shrink-0" />
                              <span>
                                <strong className="text-gray-700 dark:text-gray-200">Resource:</strong>{' '}
                                {milestone.resource || 'See recommended community documentation'}
                              </span>
                            </div>
                            <div className="flex items-start gap-2 text-emerald-600 dark:text-emerald-400">
                              <Flag className="w-4 h-4 mt-0.5 flex-shrink-0" />
                              <span>
                                <strong className="text-gray-700 dark:text-gray-200">Project:</strong>{' '}
                                {milestone.project || 'Build a capstone implementation highlighting these skills'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                            Skills to Master
                          </h4>
                          <div className="space-y-1">
                            {milestone.skills.map((skillName) => {
                              const isDone = isSkillKnown(skillName, completedSkills);
                              const isPreMastered = isSkillKnown(skillName, knownSkillsNormalized);
                              const isLoading = loadingSkill === skillName;

                              return (
                                <label
                                  key={skillName}
                                  className={`flex items-start gap-3 p-2.5 rounded-lg transition-all cursor-pointer ${
                                    isPreMastered
                                      ? 'opacity-50 cursor-default'
                                      : isDone
                                        ? 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                                        : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                                  }`}
                                >
                                  <div className="relative flex items-center justify-center mt-0.5 flex-shrink-0">
                                    <input
                                      type="checkbox"
                                      checked={isDone}
                                      onChange={() => handleToggleSkill(skillName)}
                                      disabled={isLoading || isPreMastered}
                                      className="peer sr-only"
                                      aria-label={`Mark ${skillName} as ${isDone ? 'incomplete' : 'complete'}`}
                                    />
                                    <div
                                      className={`w-5 h-5 rounded flex items-center justify-center transition-all ${
                                        isPreMastered
                                          ? 'bg-emerald-500 border-emerald-500 text-white'
                                          : isDone
                                            ? 'bg-brand-500 border-brand-500 text-white'
                                            : 'bg-white dark:bg-gray-900 border-2 border-gray-300 dark:border-gray-600 peer-hover:border-brand-400 dark:peer-hover:border-brand-500'
                                      }`}
                                    >
                                      {isLoading ? (
                                        <Loader2 className="w-3 h-3 animate-spin text-white" />
                                      ) : isPreMastered ? (
                                        <ShieldCheck className="w-3.5 h-3.5" />
                                      ) : isDone ? (
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                      ) : null}
                                    </div>
                                  </div>
                                  <span
                                    className={`text-sm font-medium pt-0.5 ${
                                      isPreMastered
                                        ? 'text-emerald-500 dark:text-emerald-400 line-through'
                                        : isDone
                                          ? 'text-gray-400 dark:text-gray-500 line-through'
                                          : 'text-gray-700 dark:text-gray-200'
                                    }`}
                                  >
                                    {skillName}
                                  </span>
                                  {isPreMastered && (
                                    <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded mt-0.5">
                                      Known
                                    </span>
                                  )}
                                </label>
                              );
                            })}
                          </div>
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
    </motion.div>
  );
};

export default TimelineRoadmap;
