import React from 'react';
import { motion } from 'framer-motion';
import { Briefcase, Plus, Sparkles, ArrowRight } from 'lucide-react';

interface SkillNode {
  id: string;
  label: string;
}

interface PredictedResumeProps {
  currentSkills: { name: string; confidence: number }[];
  pathData: {
    target_skill?: string;
    target_role?: string;
    missing_skills?: string[];
    nodes?: SkillNode[];
    milestones?: { skills: string[] }[];
  };
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } }
};

const chipVariants = {
  hidden: { opacity: 0, scale: 0.85 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.25 } }
};

const PredictedResume: React.FC<PredictedResumeProps> = ({ currentSkills, pathData }) => {
  const targetRole = pathData.target_role || pathData.target_skill || 'Target Role';

  let newSkills: string[] = [];
  if (pathData.missing_skills && pathData.missing_skills.length > 0) {
    newSkills = pathData.missing_skills;
  } else if (pathData.milestones && pathData.milestones.length > 0) {
    const allSkills = pathData.milestones.flatMap(m => m.skills || []);
    newSkills = Array.from(new Set(allSkills));
  } else if (pathData.nodes) {
    newSkills = pathData.nodes.map(s => s.label);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-2xl mx-auto mt-8 mb-12"
    >
      <div className="p-5 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-brand-50 dark:bg-brand-900/30">
            <Briefcase className="w-5 h-5 text-brand-600 dark:text-brand-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">Your Future Resume</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">After completing this learning path</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Current Skills
              </span>
              <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500">
                ({currentSkills.length})
              </span>
            </div>
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="flex flex-wrap gap-1.5"
            >
              {currentSkills.length > 0 ? currentSkills.map((skill, i) => (
                <motion.span
                  key={i}
                  variants={chipVariants}
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 shadow-sm"
                >
                  {skill.name}
                </motion.span>
              )) : (
                <p className="text-xs text-gray-400 dark:text-gray-500 italic">No skills detected yet</p>
              )}
            </motion.div>
          </div>

          <div className="p-4 bg-brand-50/50 dark:bg-brand-900/20 rounded-xl border border-brand-100 dark:border-brand-800/40">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-3.5 h-3.5 text-brand-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">
                Skills You'll Gain
              </span>
              <span className="text-[10px] font-medium text-brand-400 dark:text-brand-500">
                ({newSkills.length})
              </span>
            </div>
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="flex flex-wrap gap-1.5"
            >
              {newSkills.length > 0 ? newSkills.map((skill, i) => (
                <motion.span
                  key={i}
                  variants={chipVariants}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-white dark:bg-gray-800 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-700 shadow-sm"
                >
                  <Plus className="w-2.5 h-2.5" />
                  {skill}
                </motion.span>
              )) : (
                <p className="text-xs text-gray-400 dark:text-gray-500 italic">Select a target role to see skills</p>
              )}
            </motion.div>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowRight className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-500 dark:text-gray-400">Target Role</span>
            </div>
            <span className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-brand-600 to-violet-600 text-white text-sm font-semibold rounded-full shadow-sm shadow-brand-500/25">
              <Briefcase className="w-3.5 h-3.5" />
              {targetRole.replace(/-/g, ' ')}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default PredictedResume;
