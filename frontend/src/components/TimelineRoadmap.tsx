import React from 'react';
import { motion } from 'framer-motion';
import { BookOpen, DollarSign, Clock, ArrowDown, Flag, CheckCircle2 } from 'lucide-react';

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
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.2 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } }
};

const TimelineRoadmap: React.FC<TimelineRoadmapProps> = ({ pathData }) => {
  const totalCost = pathData.steps.reduce((sum, s) => sum + s.cost, 0);
  const totalHours = pathData.steps.reduce((sum, s) => sum + s.hours, 0);

  return (
    <div className="w-full max-w-2xl mx-auto mt-8">
      {/* Header summary card */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="p-5 mb-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl shadow-lg text-white"
      >
        <h2 className="text-xl font-bold mb-1 flex items-center gap-2">
          <Flag className="w-5 h-5" /> Your Learning Roadmap
        </h2>
        <p className="text-blue-100 text-sm mb-4">
          Path to <span className="font-semibold">{pathData.target_skill}</span>
        </p>
        <div className="flex gap-6">
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

      {/* Timeline steps */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative"
      >
        {/* Vertical line */}
        <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-400 to-indigo-400 opacity-30" />

        {pathData.steps.map((step, index) => (
          <motion.div key={index} variants={itemVariants} className="relative mb-6 pl-14">
            {/* Step indicator circle */}
            <div className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30 text-white font-bold text-sm z-10">
              {index + 1}
            </div>

            {/* From → To nodes label */}
            <div className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-1 flex items-center gap-1">
              <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded">{step.from_node}</span>
              <span>→</span>
              <span className="bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 px-2 py-0.5 rounded font-semibold">{step.to_node}</span>
            </div>

            {/* Course card */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5 p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                  <BookOpen className="w-4 h-4 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-800 dark:text-gray-100 text-sm">{step.course}</h3>
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
        ))}

        {/* Goal reached */}
        <motion.div variants={itemVariants} className="relative mb-6 pl-14">
          <div className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg shadow-green-500/30 text-white z-10">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="flex items-center h-10">
            <span className="text-sm font-semibold text-green-600 dark:text-green-400">
              🎉 Goal Reached: {pathData.target_skill}
            </span>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default TimelineRoadmap;
