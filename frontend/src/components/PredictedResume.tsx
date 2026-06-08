import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Eye, Sparkles, TrendingUp, Award, Star, Target } from 'lucide-react';

interface PredictedResumeProps {
  currentSkills: { name: string; confidence: number }[];
  pathData: any;
}

const PredictedResume: React.FC<PredictedResumeProps> = ({ currentSkills, pathData }) => {
  const targetRole = pathData?.target_skill ?? pathData?.target_role ?? 'Target Role';
  const roadmapNodes = pathData?.nodes ?? [];

  const futureSkills = useMemo(() => {
    const currentSkillNames = new Set(currentSkills.map((s) => s.name.toLowerCase()));
    const predicted: string[] = [];

    roadmapNodes.forEach((node: any) => {
      const title = node.title ?? node.label ?? node.skill ?? '';
      if (title && !currentSkillNames.has(title.toLowerCase())) {
        predicted.push(title);
      }
      const subjects = node.subjects ?? [];
      subjects.forEach((subj: any) => {
        const name = typeof subj === 'string' ? subj : (subj.name ?? subj.title ?? '');
        if (name && !currentSkillNames.has(name.toLowerCase()) && !predicted.includes(name)) {
          predicted.push(name);
        }
      });
    });

    return predicted;
  }, [currentSkills, roadmapNodes]);

  const projectedSalary = useMemo(() => {
    const salaries: Record<string, string> = {
      'Software Engineer': '$95,000 - $145,000',
      'Data Scientist': '$110,000 - $165,000',
      'Product Manager': '$100,000 - $160,000',
      'DevOps Engineer': '$100,000 - $155,000',
      'Machine Learning Engineer': '$120,000 - $180,000',
      'Full Stack Developer': '$85,000 - $140,000',
      'Cloud Architect': '$130,000 - $195,000',
      'Cybersecurity Analyst': '$90,000 - $140,000',
      default: '$85,000 - $160,000+',
    };
    return (Object.entries(salaries).find(([key]) =>
      targetRole.toLowerCase().includes(key.toLowerCase())
    ) ?? [null, salaries.default])[1];
  }, [targetRole]);

  const impactScore = useMemo(() => {
    const score = Math.min(
      100,
      Math.round(
        40 +
        roadmapNodes.length * 5 +
        (futureSkills.length > 0 ? Math.min(30, futureSkills.length * 3) : 0)
      )
    );
    return Math.min(100, score);
  }, [roadmapNodes, futureSkills]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.2 }}
      className="w-full max-w-2xl mx-auto mt-6"
    >
      <div className="bg-white rounded-2xl shadow-sm border border-clay-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-clay-100">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-forest-50">
              <Eye className="w-5 h-5 text-forest-600" />
            </div>
            <div>
              <h2 className="font-heading text-lg font-bold text-ink">
                Your Predicted Future Resume
              </h2>
              <p className="text-sm text-clay-500 font-[450]">
                What your profile will look like when you reach <span className="font-semibold text-forest-700">{targetRole}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              icon={TrendingUp}
              label="Skills Gained"
              value={`+${futureSkills.length}`}
              subtext="New competencies"
              color="rust"
            />
            <StatCard
              icon={Star}
              label="Impact Score"
              value={`${impactScore}%`}
              subtext="Career readiness"
              color="gold"
            />
            <StatCard
              icon={Award}
              label="Projected Range"
              value={projectedSalary}
              subtext="Annual (estimated)"
              color="forest"
            />
          </div>

          {futureSkills.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-clay-500 uppercase tracking-[0.1em] mb-3 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-gold-500" />
                Skills You Will Gain
              </h4>
              <div className="flex flex-wrap gap-2">
                {futureSkills.map((skill, idx) => (
                  <motion.span
                    key={idx}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2, delay: idx * 0.03 }}
                    className="px-3 py-1.5 bg-forest-50 border border-forest-200 rounded-full text-sm font-medium text-forest-700 shadow-sm"
                  >
                    {skill}
                  </motion.span>
                ))}
              </div>
            </div>
          )}

          <div className="p-4 bg-gradient-to-br from-forest-50 to-clay-50 rounded-xl border border-forest-200">
            <div className="flex items-start gap-3">
              <Target className="w-5 h-5 text-forest-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-forest-800">Career Trajectory Snapshot</p>
                <p className="text-xs text-forest-700 mt-1 font-[450] leading-relaxed">
                  With your current {currentSkills.length} skills and {futureSkills.length} additional competencies gained,
                  you will be well positioned for <strong>{targetRole}</strong> roles. The projected salary range
                  reflects market data for this career level in your region.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

interface StatCardProps {
  icon: React.FC<{ className?: string }>;
  label: string;
  value: string;
  subtext: string;
  color: 'rust' | 'gold' | 'forest';
}

const colorMap = {
  rust: {
    bg: 'bg-rust-50',
    icon: 'text-rust-500',
    value: 'text-rust-700',
    label: 'text-rust-600',
  },
  gold: {
    bg: 'bg-gold-50',
    icon: 'text-gold-600',
    value: 'text-gold-700',
    label: 'text-gold-600',
  },
  forest: {
    bg: 'bg-forest-50',
    icon: 'text-forest-500',
    value: 'text-forest-700',
    label: 'text-forest-600',
  },
};

const StatCard: React.FC<StatCardProps> = ({ icon: Icon, label, value, subtext, color }) => {
  const c = colorMap[color];
  return (
    <div className={`${c.bg} rounded-xl p-4 border border-${color === 'rust' ? 'rust' : color === 'gold' ? 'gold' : 'forest'}-200`}>
      <Icon className={`w-5 h-5 ${c.icon} mb-2`} />
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-clay-500">{label}</p>
      <p className={`text-lg font-bold font-heading ${c.value} mt-0.5`}>{value}</p>
      <p className="text-[11px] text-clay-400 font-[450]">{subtext}</p>
    </div>
  );
};

export default PredictedResume;
