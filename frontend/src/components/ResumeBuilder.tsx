import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download,
  X,
  FileText,
  Plus,
  Trash2,
  Loader2,
  AlertCircle,
  Sparkles,
  Briefcase,
  BookOpen,
  Info,
} from 'lucide-react';
import { getUserBiography, downloadResume } from '../api/resumeApi';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ResumeBuilderProps {
  token: string;
  cvSkills: string[];
  targetRole: string;
  courses: { name: string; provider: string }[];
  onClose: () => void;
}

interface ExperienceEntry {
  id: string;
  title: string;
  company: string;
  date: string;
  description: string;
}

interface ProjectEntry {
  id: string;
  name: string;
  description: string;
  date: string;
}

interface CertEntry {
  id: string;
  name: string;
  provider: string;
  date: string;
}

interface ResumeState {
  name: string;
  title: string;
  email: string;
  location: string;
  linkedin: string;
  summary: string;
  education: string;
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  certifications: CertEntry[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * An inline contentEditable element.
 * Uses a ref to avoid re-render loops while keeping state in sync.
 * Saves to parent state on blur.
 */
const Editable = React.memo(function Editable({
  as: Tag = 'div',
  value,
  placeholder,
  onSave,
  className = '',
  multiline = false,
}: {
  as?: 'div' | 'p' | 'h1' | 'h2' | 'h3' | 'span';
  value: string;
  placeholder: string;
  onSave: (v: string) => void;
  className?: string;
  multiline?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.innerText !== value) {
      ref.current.innerText = value;
    }
  }, [value]);

  const handleBlur = useCallback(() => {
    onSave(ref.current?.innerText ?? '');
  }, [onSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!multiline && e.key === 'Enter') {
        e.preventDefault();
        (e.currentTarget as HTMLElement).blur();
      }
    },
    [multiline]
  );

  return (
    <Tag
      ref={ref as React.RefObject<HTMLDivElement>}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={`editable-block outline-none focus:ring-2 focus:ring-indigo-200 focus:bg-indigo-50/30 rounded px-0.5 transition-colors ${className}`}
      aria-label={placeholder}
    />
  );
});

// ─── Section header on the paper ─────────────────────────────────────────────

const PaperSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-6">
    <div className="flex items-center gap-2 mb-2">
      <h3 className="text-[9px] font-black uppercase tracking-[0.18em] text-indigo-600 whitespace-nowrap">
        {title}
      </h3>
      <div className="flex-1 h-px bg-indigo-200" />
    </div>
    {children}
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const ResumeBuilder: React.FC<ResumeBuilderProps> = ({
  token,
  cvSkills,
  targetRole,
  courses,
  onClose,
}) => {
  // Plan A: every roadmap course name is treated as a new skill to highlight
  const newRoadmapSkills = courses.map(c => c.name).filter(Boolean);
  const newSkillSet = new Set(newRoadmapSkills);

  const allSkills = [
    ...cvSkills,
    ...newRoadmapSkills.filter(s => !cvSkills.includes(s)),
  ];

  const [resume, setResume] = useState<ResumeState>({
    name: 'Your Full Name',
    title: targetRole || 'Professional',
    email: 'email@example.com',
    location: 'City, Country',
    linkedin: 'linkedin.com/in/yourprofile',
    summary: `Results-driven professional seeking a ${targetRole} position, leveraging expertise in ${
      cvSkills.slice(0, 3).join(', ') || 'various skills'
    } to drive impactful outcomes.`,
    education: 'Bachelor of Science in Computer Science\nUniversity of Nigeria, Nsukka\n2020 – 2024',
    experience: [],
    projects: [],
    certifications: courses.slice(0, 3).map((c, i) => ({
      id: `cert-init-${i}`,
      name: c.name,
      provider: c.provider || 'Online Learning Platform',
      date: 'In Progress',
    })),
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [biographyLoading, setBiographyLoading] = useState(true);

  // ── Biography pre-fill ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBiographyLoading(true);
      try {
        const bio = await getUserBiography(token);
        if (cancelled) return;
        setResume(prev => ({
          ...prev,
          summary: bio.summary || prev.summary,
          education: bio.education || prev.education,
        }));
      } catch {
        // Graceful: keep placeholder text
      } finally {
        if (!cancelled) setBiographyLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // ── Simple field updaters ─────────────────────────────────────────────────
  const set = useCallback(<K extends keyof ResumeState>(field: K, value: ResumeState[K]) => {
    setResume(prev => ({ ...prev, [field]: value }));
  }, []);

  // ── Experience ────────────────────────────────────────────────────────────
  const addExperience = useCallback(() => {
    setResume(prev => ({
      ...prev,
      experience: [
        ...prev.experience,
        { id: uid('exp'), title: 'Job Title', company: 'Company Name', date: '2023 – Present', description: 'Describe your responsibilities and achievements.' },
      ],
    }));
  }, []);

  const updateExp = useCallback((id: string, field: keyof ExperienceEntry, value: string) => {
    setResume(prev => ({
      ...prev,
      experience: prev.experience.map(e => e.id === id ? { ...e, [field]: value } : e),
    }));
  }, []);

  const removeExp = useCallback((id: string) => {
    setResume(prev => ({ ...prev, experience: prev.experience.filter(e => e.id !== id) }));
  }, []);

  // ── Projects ──────────────────────────────────────────────────────────────
  const addProject = useCallback(() => {
    setResume(prev => ({
      ...prev,
      projects: [
        ...prev.projects,
        { id: uid('proj'), name: 'Project Name', description: 'Brief description and impact.', date: '2024' },
      ],
    }));
  }, []);

  const updateProj = useCallback((id: string, field: keyof ProjectEntry, value: string) => {
    setResume(prev => ({
      ...prev,
      projects: prev.projects.map(p => p.id === id ? { ...p, [field]: value } : p),
    }));
  }, []);

  const removeProj = useCallback((id: string) => {
    setResume(prev => ({ ...prev, projects: prev.projects.filter(p => p.id !== id) }));
  }, []);

  // ── Certifications ────────────────────────────────────────────────────────
  const updateCert = useCallback((id: string, field: keyof CertEntry, value: string) => {
    setResume(prev => ({
      ...prev,
      certifications: prev.certifications.map(c => c.id === id ? { ...c, [field]: value } : c),
    }));
  }, []);

  const removeCert = useCallback((id: string) => {
    setResume(prev => ({ ...prev, certifications: prev.certifications.filter(c => c.id !== id) }));
  }, []);

  // ── Download ──────────────────────────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    try {
      await downloadResume(token, {
        name: resume.name,
        title: resume.title,
        email: resume.email,
        location: resume.location,
        linkedin: resume.linkedin,
        summary: resume.summary,
        education: resume.education,
        cv_skills: cvSkills,
        gained_skills: newRoadmapSkills,
        target_role: targetRole,
        courses: courses,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to generate PDF.');
    } finally {
      setIsGenerating(false);
    }
  }, [token, resume, cvSkills, newRoadmapSkills, targetRole, courses]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Resume Canvas"
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 10 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-6xl h-[92vh] flex flex-col bg-gray-100 rounded-2xl shadow-2xl border border-gray-200 overflow-hidden"
      >

        {/* ── Top bar ── */}
        <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-indigo-50 border border-indigo-100">
              <FileText className="w-4 h-4 text-indigo-500" />
            </div>
            <div>
              <h2 className="font-semibold text-base text-gray-900 leading-tight">Resume Canvas</h2>
              <p className="text-[11px] text-gray-400">Click any text to edit directly · Changes auto-save on blur</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="resume-download-btn"
              onClick={handleDownload}
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow transition-all active:scale-[0.97]"
            >
              {isGenerating
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating…</>
                : <><Download className="w-3.5 h-3.5" />Download PDF</>
              }
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-all"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Error banner ── */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden shrink-0"
            >
              <div className="flex items-center gap-2 px-5 py-2.5 bg-red-50 border-b border-red-200 text-red-700 text-sm" role="alert">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
                <button onClick={() => setError(null)} className="ml-auto p-1 rounded hover:bg-red-100" aria-label="Dismiss">
                  <X className="w-3 h-3" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Body ── */}
        <div className="flex flex-1 min-h-0">

          {/* ── Left sidebar ── */}
          <aside className="w-52 shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-y-auto py-4 px-3 gap-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-2 mb-1">Add Section</p>

            <button
              onClick={addExperience}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-all text-left group"
            >
              <Briefcase className="w-3.5 h-3.5 text-gray-400 group-hover:text-indigo-500 transition-colors" />
              <Plus className="w-2.5 h-2.5 text-gray-300" />
              Experience
            </button>

            <button
              onClick={addProject}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-all text-left group"
            >
              <BookOpen className="w-3.5 h-3.5 text-gray-400 group-hover:text-indigo-500 transition-colors" />
              <Plus className="w-2.5 h-2.5 text-gray-300" />
              Project
            </button>

            <div className="h-px bg-gray-100 my-2" />

            {/* Skills Legend */}
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-2 mb-2">Skills Legend</p>
            <div className="px-2 space-y-2">
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-sm bg-gray-200 border border-gray-300 shrink-0" />
                <span className="text-[11px] text-gray-600">Original CV skills</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-sm bg-green-200 border border-green-300 shrink-0" />
                <span className="text-[11px] text-gray-600">New from OCPR roadmap</span>
              </div>
            </div>

            <div className="h-px bg-gray-100 my-2" />

            <div className="px-2 mt-1">
              <div className="flex items-start gap-1.5 p-2 rounded-lg bg-gray-50 border border-gray-100">
                <Info className="w-3 h-3 text-gray-400 mt-0.5 shrink-0" />
                <p className="text-[10.5px] text-gray-500 leading-snug">
                  Click any text on the paper to edit. Blur (click away) to save.
                </p>
              </div>
            </div>
          </aside>

          {/* ── Canvas ── */}
          <main className="flex-1 overflow-y-auto bg-gray-100 flex justify-center py-8 px-6">
            {/*
              Paper: max-w-4xl bg-white shadow-2xl p-10 text-gray-800
              Intentionally matches the spec: aspect-ratio simulated via min-h.
            */}
            <div
              id="resume-canvas"
              className="w-full max-w-4xl bg-white shadow-2xl p-10 text-gray-800 min-h-[900px] rounded"
              style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}
            >

              {/* ── Header ── */}
              <div className="border-b-2 border-indigo-600 pb-5 mb-7">
                <Editable
                  as="h1"
                  value={resume.name}
                  placeholder="Your Full Name"
                  onSave={v => set('name', v)}
                  className="text-3xl font-bold text-gray-900 tracking-tight"
                />
                <Editable
                  value={resume.title}
                  placeholder="Professional Title"
                  onSave={v => set('title', v)}
                  className="text-base font-semibold text-indigo-600 mt-1"
                />
                <div className="flex flex-wrap gap-x-6 mt-2 text-xs text-gray-500">
                  <Editable value={resume.email} placeholder="email@example.com" onSave={v => set('email', v)} />
                  <Editable value={resume.location} placeholder="City, Country" onSave={v => set('location', v)} />
                  <Editable value={resume.linkedin} placeholder="linkedin.com/in/..." onSave={v => set('linkedin', v)} />
                </div>
              </div>

              {/* ── Summary ── */}
              <PaperSection title="Professional Summary">
                {biographyLoading ? (
                  <div className="space-y-2">
                    <div className="skeleton h-3 rounded w-full" />
                    <div className="skeleton h-3 rounded w-5/6" />
                    <div className="skeleton h-3 rounded w-4/6" />
                  </div>
                ) : (
                  <Editable
                    as="p"
                    value={resume.summary}
                    placeholder="Write your professional summary..."
                    onSave={v => set('summary', v)}
                    multiline
                    className="text-sm text-gray-700 leading-relaxed min-h-[48px]"
                  />
                )}
              </PaperSection>

              {/* ── Education ── */}
              <PaperSection title="Education">
                {biographyLoading ? (
                  <div className="space-y-2">
                    <div className="skeleton h-3 rounded w-3/4" />
                    <div className="skeleton h-3 rounded w-1/2" />
                  </div>
                ) : (
                  <Editable
                    as="p"
                    value={resume.education}
                    placeholder="Degree · Institution · Year"
                    onSave={v => set('education', v)}
                    multiline
                    className="text-sm text-gray-700 leading-relaxed min-h-[36px] whitespace-pre-wrap"
                  />
                )}
              </PaperSection>

              {/* ── Experience ── */}
              {resume.experience.length > 0 && (
                <PaperSection title="Experience">
                  <div className="space-y-5">
                    {resume.experience.map(exp => (
                      <div key={exp.id} className="relative group">
                        <button
                          onClick={() => removeExp(exp.id)}
                          className="absolute -right-5 top-0 opacity-0 group-hover:opacity-100 p-1 rounded text-gray-300 hover:text-red-400 transition-all"
                          aria-label="Remove experience"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <div className="flex justify-between items-start gap-4">
                          <Editable
                            value={exp.title}
                            placeholder="Job Title"
                            onSave={v => updateExp(exp.id, 'title', v)}
                            className="text-sm font-bold text-gray-900 flex-1"
                          />
                          <Editable
                            value={exp.date}
                            placeholder="2023 – Present"
                            onSave={v => updateExp(exp.id, 'date', v)}
                            className="text-xs text-gray-500 text-right shrink-0"
                          />
                        </div>
                        <Editable
                          value={exp.company}
                          placeholder="Company Name"
                          onSave={v => updateExp(exp.id, 'company', v)}
                          className="text-xs font-semibold text-indigo-600 mt-0.5"
                        />
                        <Editable
                          as="p"
                          value={exp.description}
                          placeholder="Describe your responsibilities..."
                          onSave={v => updateExp(exp.id, 'description', v)}
                          multiline
                          className="text-xs text-gray-600 leading-relaxed mt-1.5 min-h-[32px]"
                        />
                      </div>
                    ))}
                  </div>
                </PaperSection>
              )}

              {/* ── Projects ── */}
              {resume.projects.length > 0 && (
                <PaperSection title="Projects">
                  <div className="space-y-4">
                    {resume.projects.map(proj => (
                      <div key={proj.id} className="relative group">
                        <button
                          onClick={() => removeProj(proj.id)}
                          className="absolute -right-5 top-0 opacity-0 group-hover:opacity-100 p-1 rounded text-gray-300 hover:text-red-400 transition-all"
                          aria-label="Remove project"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <div className="flex justify-between items-start gap-4">
                          <Editable
                            value={proj.name}
                            placeholder="Project Name"
                            onSave={v => updateProj(proj.id, 'name', v)}
                            className="text-sm font-bold text-gray-900 flex-1"
                          />
                          <Editable
                            value={proj.date}
                            placeholder="2024"
                            onSave={v => updateProj(proj.id, 'date', v)}
                            className="text-xs text-gray-500 text-right shrink-0"
                          />
                        </div>
                        <Editable
                          as="p"
                          value={proj.description}
                          placeholder="Brief project description and impact..."
                          onSave={v => updateProj(proj.id, 'description', v)}
                          multiline
                          className="text-xs text-gray-600 leading-relaxed mt-1 min-h-[28px]"
                        />
                      </div>
                    ))}
                  </div>
                </PaperSection>
              )}

              {/* ── Skills ── */}
              <PaperSection title="Skills">
                <div className="flex flex-wrap gap-1.5">
                  {allSkills.map(skill => {
                    const isNew = newSkillSet.has(skill);
                    return (
                      <span
                        key={skill}
                        className={
                          isNew
                            ? 'inline-flex items-center gap-1 bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-semibold border border-green-300'
                            : 'inline-block bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs font-medium border border-gray-200'
                        }
                      >
                        {isNew && <Sparkles className="w-2.5 h-2.5" />}
                        {skill}
                      </span>
                    );
                  })}
                  {allSkills.length === 0 && (
                    <p className="text-xs text-gray-400 italic">No skills yet — upload your CV first.</p>
                  )}
                </div>
              </PaperSection>

              {/* ── Certifications ── */}
              {resume.certifications.length > 0 && (
                <PaperSection title="Certifications & Training">
                  <ul className="space-y-2">
                    {resume.certifications.map(cert => (
                      <li key={cert.id} className="relative group flex justify-between items-start gap-4">
                        <button
                          onClick={() => removeCert(cert.id)}
                          className="absolute -right-5 top-0 opacity-0 group-hover:opacity-100 p-1 rounded text-gray-300 hover:text-red-400 transition-all"
                          aria-label="Remove certification"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <div className="flex-1">
                          <Editable
                            value={cert.name}
                            placeholder="Certification Name"
                            onSave={v => updateCert(cert.id, 'name', v)}
                            className="text-sm font-semibold text-gray-800"
                          />
                          <Editable
                            value={cert.provider}
                            placeholder="Issuing Organization"
                            onSave={v => updateCert(cert.id, 'provider', v)}
                            className="text-xs text-indigo-500 mt-0.5"
                          />
                        </div>
                        <Editable
                          value={cert.date}
                          placeholder="Year"
                          onSave={v => updateCert(cert.id, 'date', v)}
                          className="text-xs text-gray-400 shrink-0 text-right"
                        />
                      </li>
                    ))}
                  </ul>
                </PaperSection>
              )}

              {/* Footer */}
              <div className="mt-10 pt-4 border-t border-gray-100 text-center">
                <p className="text-[9px] text-gray-300 tracking-wide">Generated by AI Career Pathfinder</p>
              </div>
            </div>
          </main>
        </div>
      </motion.div>
    </div>
  );
};

export default ResumeBuilder;
