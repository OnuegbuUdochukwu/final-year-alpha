import React, { useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Map,
  CheckCircle2,
  Circle,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  GraduationCap,
  Code2,
} from 'lucide-react';
import Congratulations from './Congratulations';

interface TimelineRoadmapProps {
  pathData: any;
  targetRole?: string;
  onStepCompleted: (skill: string) => void;
  isRecalculating: boolean;
  knownSkills: string[];
}

const normalizeString = (str: string) => {
  if (!str) return "";
  return str.toLowerCase().trim();
};

const TimelineRoadmap: React.FC<TimelineRoadmapProps> = ({
  pathData,
  targetRole = 'Career Goal',
  onStepCompleted,
  isRecalculating,
  knownSkills = [],
}) => {
  const roadmapNodes: RoadmapNode[] = useMemo(() => {
    // Map over the detailed JIT milestones instead of raw A* steps
    const milestones = pathData?.milestones ?? [];
    
    return milestones.map((milestone: any, idx: number) => {
      // Visual Pruning: check if user possesses the skills listed in this milestone
      const milestoneSkills = milestone.skills ?? [];
      const userSkillsNormalized = knownSkills.map((s: string) => normalizeString(s));
      
      // Mark complete if they have at least one of the core skills for this block
      const hasSkill = milestoneSkills.some((s: string) => 
        userSkillsNormalized.includes(normalizeString(s))
      );

      return {
        id: idx,
        label: milestone.milestone_name ?? `Milestone ${idx + 1}`,
        description: milestone.description ?? '',
        resources: milestone.resource ? [{ title: milestone.resource, url: '' }] : [],
        milestones: [], // The component structure calls the card a "node", so we leave sub-milestones empty
        durationWeeks: milestone.estimated_time ?? '',
        difficulty: milestone.difficulty ?? 'intermediate',
        isCompleted: hasSkill,
        year: '',
        subjects: milestoneSkills.map((s: string) => ({ name: s })),
        project: milestone.project ?? '',
      };
    });
  }, [pathData, knownSkills]);

  const [checkedCounts, setCheckedCounts] = useState<Record<number, number>>({});
  
  const handleCheckedCountChange = useCallback((id: number, count: number) => {
    setCheckedCounts(prev => {
      if (prev[id] === count) return prev;
      return { ...prev, [id]: count };
    });
  }, []);

  const totalRequiredSkills = useMemo(() => {
    return pathData?.milestones?.reduce((acc: number, curr: any) => acc + (curr.skills?.length || 0), 0) || 0;
  }, [pathData]);

  const totalCheckedSkills = Object.values(checkedCounts).reduce((a, b) => a + b, 0);
  const isRoadmapComplete = totalRequiredSkills > 0 && totalCheckedSkills >= totalRequiredSkills;

  const handleToggleComplete = useCallback((nodeId: number) => {
    const node = roadmapNodes[nodeId];
    const skill = node?.label ?? `step_${nodeId}`;
    onStepCompleted(skill);
  }, [roadmapNodes, onStepCompleted]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.1 }}
      className="w-full max-w-2xl mx-auto mt-8"
    >
      <div className="bg-white rounded-2xl shadow-sm border border-clay-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-clay-100">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gold-50">
              <Map className="w-5 h-5 text-gold-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-heading text-lg font-bold text-ink">
                Your Learning Roadmap
              </h2>
              <p className="text-sm text-clay-500 font-[450] truncate">
                Pathway to <span className="font-semibold text-gold-700">{targetRole}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="relative">
            <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-clay-200 rounded-full" />

            <div className="space-y-4">
              {roadmapNodes.map((node) => (
                <RoadmapStep
                  key={node.id}
                  node={node}
                  onToggleComplete={() => handleToggleComplete(node.id)}
                  isRecalculating={isRecalculating}
                  knownSkills={knownSkills}
                  onCheckedCountChange={handleCheckedCountChange}
                />
              ))}
            </div>
          </div>

          {isRoadmapComplete && (
            <Congratulations targetRole={pathData?.target_role ?? pathData?.target_skill ?? targetRole} />
          )}
        </div>
      </div>
    </motion.div>
  );
};

interface RoadmapNode {
  id: number;
  label: string;
  description: string;
  resources: any[];
  milestones: any[];
  durationWeeks: string | number;
  difficulty: string;
  isCompleted: boolean;
  year: string;
  subjects: any[];
  project: string;
}

interface RoadmapStepProps {
  node: RoadmapNode;
  onToggleComplete: () => void;
  isRecalculating: boolean;
  knownSkills: string[];
  onCheckedCountChange: (id: number, count: number) => void;
}

const difficultyColors: Record<string, string> = {
  beginner: 'text-forest-600 bg-forest-50 border-forest-200',
  intermediate: 'text-gold-700 bg-gold-50 border-gold-200',
  advanced: 'text-rust-600 bg-rust-50 border-rust-200',
  expert: 'text-rust-700 bg-rust-100 border-rust-300',
};

const RoadmapStep: React.FC<RoadmapStepProps> = ({
  node,
  onToggleComplete,
  isRecalculating,
  knownSkills,
  onCheckedCountChange,
}) => {
  const [expanded, setExpanded] = useState(false);

  const initialChecked = useMemo(() => {
    const knownSkillsNormalized = knownSkills.map(ks => normalizeString(ks));
    return (node.subjects || [])
      .map((subj: any) => typeof subj === 'string' ? subj : (subj?.name ?? subj?.title ?? ''))
      .filter((name: string) => name && knownSkillsNormalized.includes(normalizeString(name)));
  }, [node.subjects, knownSkills]);

  const [checkedSkills, setCheckedSkills] = useState<string[]>(initialChecked);

  React.useEffect(() => {
    onCheckedCountChange(node.id, checkedSkills.length);
  }, [node.id, checkedSkills.length, onCheckedCountChange]);

  const handleCheckboxToggle = (name: string) => {
    if (!name) return;
    setCheckedSkills(prev => 
      prev.includes(name) ? prev.filter(s => s !== name) : [...prev, name]
    );
  };

  const handleCompleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isFullyCompleted) {
      setCheckedSkills([]);
    } else {
      // Safe fallback to extract string array
      const allSkills = (node.subjects || [])
        .map((subj: any) => typeof subj === 'string' ? subj : (subj?.name ?? subj?.title ?? ''))
        .filter(Boolean); // guarantees no undefined/null/empty strings
      
      setCheckedSkills(allSkills);
      onToggleComplete();
    }
  };

  const totalSkills = node.subjects?.length || 0;
  const isFullyCompleted = totalSkills > 0 && checkedSkills.length === totalSkills;

  const diffKey = node.difficulty?.toLowerCase() ?? 'intermediate';
  const diffStyle = difficultyColors[diffKey] || difficultyColors.intermediate;

  return (
    <div className="relative pl-10">
      <div className="absolute left-[7px] top-1">
        {isFullyCompleted ? (
          <div className="w-[17px] h-[17px] rounded-full bg-rust-500 flex items-center justify-center">
            <CheckCircle2 className="w-[11px] h-[11px] text-white" />
          </div>
        ) : (
          <div className="w-[17px] h-[17px] rounded-full border-2 border-clay-300 bg-white flex items-center justify-center">
            <Circle className="w-[7px] h-[7px] text-clay-300" />
          </div>
        )}
      </div>

      <div
        className={`rounded-xl border transition-all duration-200 ${
          node.isCompleted
            ? 'border-forest-200 bg-forest-50/50'
            : 'border-clay-200 bg-white hover:border-rust-200 hover:shadow-sm'
        }`}
      >
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3
                  className={`text-sm font-bold font-heading ${
                    isFullyCompleted ? 'text-forest-700' : 'text-ink'
                  }`}
                >
                  {node.label}
                </h3>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${diffStyle}`}>
                  {node.difficulty}
                </span>
              </div>
              {node.description && (
                <p className="text-xs text-clay-500 mt-1 font-[450] leading-relaxed">
                  {node.description}
                </p>
              )}
              {node.durationWeeks && (
                <p className="text-xs text-clay-400 mt-1.5 font-semibold flex items-center gap-1">
                  <GraduationCap className="w-3 h-3" />
                  {node.durationWeeks} {typeof node.durationWeeks === 'number' ? 'weeks' : ''}
                </p>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={handleCompleteClick}
                disabled={isRecalculating}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all active:scale-[0.95] disabled:opacity-50 disabled:cursor-wait ${
                  isFullyCompleted 
                    ? 'bg-forest-500 hover:bg-forest-600 shadow-md shadow-forest-500/20' 
                    : 'bg-gradient-to-br from-rust-500 to-rust-600 hover:from-rust-600 hover:to-rust-700'
                }`}
              >
                {isRecalculating ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3 h-3" />
                )}
                <span className="hidden sm:inline">{isFullyCompleted ? 'Completed' : 'Complete'}</span>
              </button>
              <button
                onClick={() => setExpanded(!expanded)}
                className="p-1 text-clay-400 hover:text-clay-600 transition-colors"
                aria-label={expanded ? 'Collapse details' : 'Expand details'}
              >
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-clay-100 px-4 py-3 space-y-3"
          >
            {node.subjects && node.subjects.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-clay-500 uppercase tracking-[0.1em] mb-1.5">
                  Skills to Master
                </p>
                <div className="space-y-1.5">
                  {node.subjects.map((subj: any, idx: number) => {
                    const name = typeof subj === 'string' ? subj : (subj?.name ?? subj?.title ?? '');
                    if (!name) return null;
                    const checkedSkillsNormalized = checkedSkills.map(s => normalizeString(s));
                    const isChecked = checkedSkillsNormalized.includes(normalizeString(name));
                    return (
                      <label
                        key={idx}
                        className="flex items-start gap-2 cursor-pointer group"
                      >
                        <div className="relative flex items-center justify-center mt-0.5">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleCheckboxToggle(name)}
                            className="w-3.5 h-3.5 rounded border-clay-300 text-rust-500 focus:ring-rust-500 transition-colors cursor-pointer"
                          />
                        </div>
                        <span className={`text-xs transition-colors ${isChecked ? 'text-clay-400 line-through' : 'text-clay-700 group-hover:text-ink'}`}>
                          {name}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {node.resources && node.resources.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-clay-500 uppercase tracking-[0.1em] mb-1.5">
                  Resources
                </p>
                <div className="space-y-1">
                  {node.resources.map((res: any, idx: number) => {
                    const title = res.title ?? res.name ?? `Resource ${idx + 1}`;
                    const url = res.url ?? res.link ?? '';
                    return (
                      <div key={idx} className="flex items-center gap-2 text-xs text-clay-600">
                        <ArrowRight className="w-3 h-3 text-rust-400 flex-shrink-0" />
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-rust-500 transition-colors underline underline-offset-2 decoration-clay-300 hover:decoration-rust-400"
                          >
                            {title}
                          </a>
                        ) : (
                          <span>{title}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {node.project && (
              <div>
                <p className="text-[11px] font-semibold text-clay-500 uppercase tracking-[0.1em] mb-1.5">
                  Hands-On Project
                </p>
                <div className="flex items-start gap-2 bg-clay-50 p-3 rounded-lg border border-clay-200">
                  <Code2 className="w-4 h-4 text-rust-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-clay-700 leading-relaxed">
                    {node.project}
                  </p>
                </div>
              </div>
            )}

            {node.milestones && node.milestones.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold text-clay-500 uppercase tracking-[0.1em] mb-1.5">
                  Milestones
                </p>
                <ul className="space-y-1">
                  {node.milestones.map((ms: any, idx: number) => {
                    const text = ms.text ?? ms.title ?? ms.description ?? `Milestone ${idx + 1}`;
                    return (
                      <li key={idx} className="flex items-start gap-2 text-xs text-clay-600">
                        <span className="w-1 h-1 rounded-full bg-gold-400 flex-shrink-0 mt-1.5" />
                        <span>{text}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default TimelineRoadmap;
