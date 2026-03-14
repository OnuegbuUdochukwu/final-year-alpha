import React from 'react';
import { motion } from 'framer-motion';
import { Briefcase, Plus, Sparkles } from 'lucide-react';

interface PathStep {
  to_node: string;
  course: string;
}

interface PredictedResumeProps {
  currentSkills: { name: string; confidence: number }[];
  pathData: {
    target_skill: string;
    steps: PathStep[];
  };
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
};

const chipVariants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.3 } }
};

const PredictedResume: React.FC<PredictedResumeProps> = ({ currentSkills, pathData }) => {
  const newSkills = pathData.steps.map(s => s.to_node);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-2xl mx-auto mt-8 mb-12"
    >
      <div className="p-5 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg">
            <Briefcase className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Your Future Resume</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">After completing this learning path</p>
          </div>
        </div>

        {/* Two-column layout: Before / After */}
        <div className="grid grid-cols-2 gap-4">
          {/* Current Skills (Before) */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Current Skills
              </span>
            </div>
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="flex flex-wrap gap-2"
            >
              {currentSkills.map((skill, i) => (
                <motion.span
                  key={i}
                  variants={chipVariants}
                  className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600"
                >
                  {skill.name}
                </motion.span>
              ))}
            </motion.div>
          </div>

          {/* New Skills (After, with + indicator) */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-3 h-3 text-indigo-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-500">
                Skills You'll Gain
              </span>
            </div>
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="flex flex-wrap gap-2"
            >
              {newSkills.map((skill, i) => (
                <motion.span
                  key={i}
                  variants={chipVariants}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700"
                >
                  <Plus className="w-3 h-3" />
                  {skill}
                </motion.span>
              ))}
            </motion.div>
          </div>
        </div>

        {/* Target Role badge */}
        <div className="mt-6 pt-5 border-t border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400">Target Role</span>
            <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-full shadow-sm shadow-indigo-500/30">
              🎯 {pathData.target_skill}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default PredictedResume;
