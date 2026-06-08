import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Download,
  X,
  FileText,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
} from 'lucide-react';

interface ResumeBuilderProps {
  token: string;
  cvSkills: string[];
  targetRole: string;
  courses: { name: string; provider: string }[];
  onClose: () => void;
}

interface ResumeEntry {
  id: string;
  type: 'summary' | 'experience' | 'education' | 'skill' | 'project' | 'certification';
  content: string;
  date?: string;
  subtitle?: string;
}

const ResumeBuilder: React.FC<ResumeBuilderProps> = ({
  token,
  cvSkills,
  targetRole,
  courses,
  onClose,
}) => {
  const [entries, setEntries] = useState<ResumeEntry[]>(() => {
    const initial: ResumeEntry[] = [];

    initial.push({
      id: 'summary-1',
      type: 'summary',
      content: `Results-driven professional seeking a ${targetRole} position, leveraging expertise in ${cvSkills.slice(0, 3).join(', ')} to drive impactful outcomes.`,
    });

    initial.push({
      id: 'education-1',
      type: 'education',
      content: 'Bachelor of Science in Computer Science',
      subtitle: 'University of Nigeria, Nsukka',
      date: '2020 - 2024',
    });

    cvSkills.slice(0, 8).forEach((skill, idx) => {
      initial.push({
        id: `skill-${idx}`,
        type: 'skill',
        content: skill,
      });
    });

    courses.slice(0, 3).forEach((course, idx) => {
      initial.push({
        id: `cert-${idx}`,
        type: 'certification',
        content: course.name,
        subtitle: course.provider || 'Online Learning Platform',
        date: 'In Progress',
      });
    });

    return initial;
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>('all');
  const resumeRef = useRef<HTMLDivElement>(null);

  const addEntry = (type: ResumeEntry['type']) => {
    const newEntry: ResumeEntry = {
      id: `${type}-${Date.now()}`,
      type,
      content: '',
      subtitle: '',
      date: '',
    };
    setEntries(prev => [...prev, newEntry]);
  };

  const updateEntry = (id: string, field: keyof ResumeEntry, value: string) => {
    setEntries(prev =>
      prev.map(entry =>
        entry.id === id ? { ...entry, [field]: value } : entry
      )
    );
  };

  const removeEntry = (id: string) => {
    setEntries(prev => prev.filter(entry => entry.id !== id));
  };

  const generateResumeDOCX = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/generate-resume', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          target_role: targetRole,
          skills: cvSkills,
          courses: courses.map(c => c.name),
          sections: entries.map(e => ({
            type: e.type,
            content: e.content,
            subtitle: e.subtitle,
            date: e.date,
          })),
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.detail || `Server error: ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${targetRole.replace(/\s+/g, '_')}_Resume.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Failed to generate resume.');
    } finally {
      setIsGenerating(false);
    }
  };

  const moveEntry = (idx: number, direction: 'up' | 'down') => {
    setEntries(prev => {
      const items = [...prev];
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= items.length) return prev;
      [items[idx], items[targetIdx]] = [items[targetIdx], items[idx]];
      return items;
    });
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSection(prev => (prev === sectionId ? null : sectionId));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Resume Builder"
    >
      <div className="fixed inset-0 bg-clay-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 bg-noise pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="relative w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col"
      >
        <div className="bg-white rounded-2xl shadow-2xl shadow-clay-900/20 border border-clay-200 overflow-hidden flex flex-col max-h-[85vh]">
          <div className="flex items-center justify-between px-6 py-4 border-b border-clay-100">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-rust-50">
                <FileText className="w-5 h-5 text-rust-500" />
              </div>
              <div>
                <h2 className="font-heading text-lg font-bold text-ink">Resume Builder</h2>
                <p className="text-xs text-clay-500 font-[450]">
                  Customize your resume for <span className="font-semibold text-rust-600">{targetRole}</span>
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-clay-400 hover:text-clay-600 hover:bg-clay-50 transition-all"
              aria-label="Close resume builder"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-6 py-4 border-b border-clay-100 flex items-center gap-2 flex-wrap">
            <button
              onClick={() => addEntry('experience')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rust-600 bg-rust-50 border border-rust-200 hover:bg-rust-100 transition-all"
            >
              <Plus className="w-3 h-3" />
              Experience
            </button>
            <button
              onClick={() => addEntry('project')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-forest-600 bg-forest-50 border border-forest-200 hover:bg-forest-100 transition-all"
            >
              <Plus className="w-3 h-3" />
              Project
            </button>
          </div>

          <div
            ref={resumeRef}
            className="flex-1 overflow-y-auto px-6 py-5 space-y-3 scrollbar-thin"
          >
            {entries.map((entry, idx) => (
              <ResumeEntryEditor
                key={entry.id}
                entry={entry}
                index={idx}
                total={entries.length}
                onUpdate={updateEntry}
                onRemove={removeEntry}
                onMove={moveEntry}
                expanded={expandedSection === 'all' || expandedSection === entry.id}
                onToggleExpand={() => toggleSection(entry.id)}
              />
            ))}

            {entries.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-clay-400">
                <FileText className="w-10 h-10 mb-3" />
                <p className="text-sm font-medium">Your resume is empty</p>
                <p className="text-xs font-[450]">Add sections above to build your resume</p>
              </div>
            )}
          </div>

          {error && (
            <div className="px-6 py-3 border-t border-clay-100">
              <div className="flex items-center gap-2 p-3 bg-rust-50 border border-rust-200 rounded-lg text-rust-700 text-sm" role="alert">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between px-6 py-4 border-t border-clay-100 bg-clay-50">
            <p className="text-xs text-clay-400 font-[450]">
              {entries.length} section{entries.length !== 1 ? 's' : ''}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={generateResumeDOCX}
                disabled={isGenerating || entries.length === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm text-white bg-gradient-to-br from-rust-500 to-rust-700 hover:from-rust-600 hover:to-rust-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-rust-500/20 transition-all active:scale-[0.97]"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating&hellip;
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Download .DOCX
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

interface ResumeEntryEditorProps {
  entry: ResumeEntry;
  index: number;
  total: number;
  onUpdate: (id: string, field: keyof ResumeEntry, value: string) => void;
  onRemove: (id: string) => void;
  onMove: (index: number, direction: 'up' | 'down') => void;
  expanded: boolean;
  onToggleExpand: () => void;
}

const typeLabels: Record<string, string> = {
  summary: 'Professional Summary',
  experience: 'Experience',
  education: 'Education',
  skill: 'Skill',
  project: 'Project',
  certification: 'Certification',
};

const ResumeEntryEditor: React.FC<ResumeEntryEditorProps> = ({
  entry,
  index,
  total,
  onUpdate,
  onRemove,
  onMove,
  expanded,
  onToggleExpand,
}) => {
  const inputClass = "w-full px-3 py-2 rounded-lg border border-clay-300 bg-white text-ink text-sm placeholder-clay-400 focus:outline-none focus:ring-2 focus:ring-rust-500 focus:border-rust-500 transition-all";

  return (
    <div className="border border-clay-200 rounded-xl overflow-hidden bg-white">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-clay-50 border-b border-clay-100">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onMove(index, 'up')}
            disabled={index === 0}
            className="p-1 rounded text-clay-400 hover:text-clay-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Move up"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onMove(index, 'down')}
            disabled={index === total - 1}
            className="p-1 rounded text-clay-400 hover:text-clay-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            aria-label="Move down"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>

        <span className="text-xs font-semibold text-clay-500 uppercase tracking-[0.1em] min-w-[120px]">
          {typeLabels[entry.type] || entry.type}
        </span>

        <button
          onClick={onToggleExpand}
          className="ml-auto p-1 rounded text-clay-400 hover:text-clay-600 transition-colors"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        <button
          onClick={() => onRemove(entry.id)}
          className="p-1 rounded text-clay-400 hover:text-rust-500 transition-colors"
          aria-label="Remove entry"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="p-4 space-y-3">
          {entry.type === 'summary' && (
            <textarea
              value={entry.content}
              onChange={(e) => onUpdate(entry.id, 'content', e.target.value)}
              rows={4}
              className={`${inputClass} resize-none`}
              placeholder="Write your professional summary..."
            />
          )}

          {entry.type === 'experience' && (
            <>
              <input
                type="text"
                value={entry.content}
                onChange={(e) => onUpdate(entry.id, 'content', e.target.value)}
                className={inputClass}
                placeholder="Job Title"
              />
              <input
                type="text"
                value={entry.subtitle || ''}
                onChange={(e) => onUpdate(entry.id, 'subtitle', e.target.value)}
                className={inputClass}
                placeholder="Company Name"
              />
              <input
                type="text"
                value={entry.date || ''}
                onChange={(e) => onUpdate(entry.id, 'date', e.target.value)}
                className={inputClass}
                placeholder="e.g., Jan 2022 - Present"
              />
            </>
          )}

          {entry.type === 'education' && (
            <>
              <input
                type="text"
                value={entry.content}
                onChange={(e) => onUpdate(entry.id, 'content', e.target.value)}
                className={inputClass}
                placeholder="Degree"
              />
              <input
                type="text"
                value={entry.subtitle || ''}
                onChange={(e) => onUpdate(entry.id, 'subtitle', e.target.value)}
                className={inputClass}
                placeholder="School"
              />
              <input
                type="text"
                value={entry.date || ''}
                onChange={(e) => onUpdate(entry.id, 'date', e.target.value)}
                className={inputClass}
                placeholder="e.g., 2020 - 2024"
              />
            </>
          )}

          {entry.type === 'skill' && (
            <input
              type="text"
              value={entry.content}
              onChange={(e) => onUpdate(entry.id, 'content', e.target.value)}
              className={inputClass}
              placeholder="Skill name"
            />
          )}

          {entry.type === 'project' && (
            <>
              <input
                type="text"
                value={entry.content}
                onChange={(e) => onUpdate(entry.id, 'content', e.target.value)}
                className={inputClass}
                placeholder="Project Name"
              />
              <textarea
                value={entry.subtitle || ''}
                onChange={(e) => onUpdate(entry.id, 'subtitle', e.target.value)}
                rows={3}
                className={`${inputClass} resize-none`}
                placeholder="Project description..."
              />
              <input
                type="text"
                value={entry.date || ''}
                onChange={(e) => onUpdate(entry.id, 'date', e.target.value)}
                className={inputClass}
                placeholder="e.g., 2023"
              />
            </>
          )}

          {entry.type === 'certification' && (
            <>
              <input
                type="text"
                value={entry.content}
                onChange={(e) => onUpdate(entry.id, 'content', e.target.value)}
                className={inputClass}
                placeholder="Certification Name"
              />
              <input
                type="text"
                value={entry.subtitle || ''}
                onChange={(e) => onUpdate(entry.id, 'subtitle', e.target.value)}
                className={inputClass}
                placeholder="Issuing Organization"
              />
              <input
                type="text"
                value={entry.date || ''}
                onChange={(e) => onUpdate(entry.id, 'date', e.target.value)}
                className={inputClass}
                placeholder="e.g., 2024"
              />
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ResumeBuilder;
