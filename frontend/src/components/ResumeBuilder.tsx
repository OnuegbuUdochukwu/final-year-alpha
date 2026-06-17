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
  User,
  Briefcase,
  GraduationCap,
  Wrench,
  BookOpen,
  Award,
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

interface ResumeHeader {
  name: string;
  title: string;
  email: string;
  location: string;
  linkedin: string;
}

interface ResumeState {
  header: ResumeHeader;
  summary: string;
  education: string;
  experience: ExperienceEntry[];
  projects: ProjectEntry[];
  certifications: CertEntry[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/** A contentEditable <div> that saves on blur and shows placeholder text */
const EditableBlock = React.memo(function EditableBlock({
  value,
  placeholder,
  onSave,
  className = '',
  multiline = false,
  tag: Tag = 'div',
}: {
  value: string;
  placeholder: string;
  onSave: (text: string) => void;
  className?: string;
  multiline?: boolean;
  tag?: 'div' | 'p' | 'h1' | 'h2' | 'h3' | 'span';
}) {
  const ref = useRef<HTMLElement>(null);

  // Sync external value into DOM without triggering re-render loops
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
      ref={ref as any}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={`editable-block outline-none focus:bg-rust-50/40 rounded transition-colors duration-150 ${className}`}
      aria-label={placeholder}
    />
  );
});

// ─── Main Component ───────────────────────────────────────────────────────────

const ResumeBuilder: React.FC<ResumeBuilderProps> = ({
  token,
  cvSkills,
  targetRole,
  courses,
  onClose,
}) => {
  // All roadmap course names treated as new skills to highlight
  const newRoadmapSkills = courses.map(c => c.name).filter(Boolean);

  const [resumeState, setResumeState] = useState<ResumeState>(() => ({
    header: {
      name: 'Your Full Name',
      title: targetRole || 'Professional',
      email: 'email@example.com',
      location: 'City, Country',
      linkedin: 'linkedin.com/in/yourprofile',
    },
    summary: `Results-driven professional seeking a ${targetRole} position, leveraging expertise in ${cvSkills.slice(0, 3).join(', ')} to drive impactful outcomes.`,
    education: 'Bachelor of Science in Computer Science\nUniversity of Nigeria, Nsukka\n2020 – 2024',
    experience: [],
    projects: [],
    certifications: courses.slice(0, 3).map((c, i) => ({
      id: `cert-init-${i}`,
      name: c.name,
      provider: c.provider || 'Online Learning Platform',
      date: 'In Progress',
    })),
  }));

  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [biographyLoading, setBiographyLoading] = useState(true);

  // ── Biography fetch on mount ───────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function loadBio() {
      setBiographyLoading(true);
      try {
        const bio = await getUserBiography(token);
        if (cancelled) return;
        setResumeState(prev => ({
          ...prev,
          summary: bio.summary || prev.summary,
          education: bio.education || prev.education,
        }));
      } catch {
        // Graceful fallback — keep generated placeholder
        console.info('[ResumeBuilder] Biography fetch failed; using placeholder defaults.');
      } finally {
        if (!cancelled) setBiographyLoading(false);
      }
    }
    loadBio();
    return () => { cancelled = true; };
  }, [token]);

  // ── State updaters ────────────────────────────────────────────────────────
  const updateHeader = useCallback((field: keyof ResumeHeader, value: string) => {
    setResumeState(prev => ({ ...prev, header: { ...prev.header, [field]: value } }));
  }, []);

  const updateExperience = useCallback((id: string, field: keyof ExperienceEntry, value: string) => {
    setResumeState(prev => ({
      ...prev,
      experience: prev.experience.map(e => e.id === id ? { ...e, [field]: value } : e),
    }));
  }, []);

  const addExperience = useCallback(() => {
    setResumeState(prev => ({
      ...prev,
      experience: [
        ...prev.experience,
        { id: makeId('exp'), title: 'Job Title', company: 'Company Name', date: '2023 – Present', description: 'Describe your responsibilities and achievements...' },
      ],
    }));
  }, []);

  const removeExperience = useCallback((id: string) => {
    setResumeState(prev => ({ ...prev, experience: prev.experience.filter(e => e.id !== id) }));
  }, []);

  const updateProject = useCallback((id: string, field: keyof ProjectEntry, value: string) => {
    setResumeState(prev => ({
      ...prev,
      projects: prev.projects.map(p => p.id === id ? { ...p, [field]: value } : p),
    }));
  }, []);

  const addProject = useCallback(() => {
    setResumeState(prev => ({
      ...prev,
      projects: [
        ...prev.projects,
        { id: makeId('proj'), name: 'Project Name', description: 'Brief project description and impact...', date: '2024' },
      ],
    }));
  }, []);

  const removeProject = useCallback((id: string) => {
    setResumeState(prev => ({ ...prev, projects: prev.projects.filter(p => p.id !== id) }));
  }, []);

  const updateCert = useCallback((id: string, field: keyof CertEntry, value: string) => {
    setResumeState(prev => ({
      ...prev,
      certifications: prev.certifications.map(c => c.id === id ? { ...c, [field]: value } : c),
    }));
  }, []);

  const removeCert = useCallback((id: string) => {
    setResumeState(prev => ({ ...prev, certifications: prev.certifications.filter(c => c.id !== id) }));
  }, []);

  // ── Download ──────────────────────────────────────────────────────────────
  const handleDownload = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    try {
      await downloadResume(token, {
        name: resumeState.header.name,
        title: resumeState.header.title,
        email: resumeState.header.email,
        location: resumeState.header.location,
        linkedin: resumeState.header.linkedin,
        cv_skills: cvSkills,
        gained_skills: newRoadmapSkills,
        target_role: targetRole,
        courses: courses,
        summary: resumeState.summary,
        education: resumeState.education,
      });
    } catch (err: any) {
      setError(err.message || 'Failed to generate PDF.');
    } finally {
      setIsGenerating(false);
    }
  }, [token, resumeState, cvSkills, newRoadmapSkills, targetRole, courses]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Resume Canvas"
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-clay-900/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal shell */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 12 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-6xl h-[92vh] flex flex-col bg-clay-50 rounded-2xl shadow-2xl shadow-clay-900/30 border border-clay-200 overflow-hidden"
      >
        {/* ── Top bar ── */}
        <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-clay-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded-lg bg-rust-50 border border-rust-100">
              <FileText className="w-4 h-4 text-rust-500" />
            </div>
            <div>
              <h2 className="font-heading text-base font-bold text-ink leading-tight">
                Resume Canvas
              </h2>
              <p className="text-[11px] text-clay-500 font-[450]">
                Click any field on the canvas to edit · Changes auto-save
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Download button */}
            <button
              id="resume-download-btn"
              onClick={handleDownload}
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm text-white bg-gradient-to-br from-rust-500 to-rust-700 hover:from-rust-600 hover:to-rust-800 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-rust-500/25 transition-all active:scale-[0.97]"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  Download PDF
                </>
              )}
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-lg text-clay-400 hover:text-clay-700 hover:bg-clay-100 transition-all"
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
              <div className="flex items-center gap-2 px-5 py-2.5 bg-rust-50 border-b border-rust-200 text-rust-700 text-sm" role="alert">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
                <button onClick={() => setError(null)} className="ml-auto p-1 rounded hover:bg-rust-100">
                  <X className="w-3 h-3" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Body: sidebar + canvas ── */}
        <div className="flex flex-1 min-h-0">

          {/* ── Left sidebar ── */}
          <aside className="w-52 shrink-0 bg-white border-r border-clay-200 flex flex-col overflow-y-auto py-4 px-3 gap-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-clay-400 px-2 mb-1">
              Add Section
            </p>

            <SidebarBtn icon={<Briefcase className="w-3.5 h-3.5" />} label="Experience" onClick={addExperience} />
            <SidebarBtn icon={<BookOpen className="w-3.5 h-3.5" />} label="Project" onClick={addProject} />

            <div className="h-px bg-clay-100 my-2" />

            {/* Skills legend */}
            <p className="text-[10px] font-bold uppercase tracking-widest text-clay-400 px-2 mb-2 mt-1">
              Skills Legend
            </p>
            <div className="px-2 space-y-2">
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-sm bg-clay-200 border border-clay-300 shrink-0" />
                <span className="text-[11px] text-clay-600">Original CV skills</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-sm bg-forest-200 border border-forest-300 shrink-0" />
                <span className="text-[11px] text-clay-600">New from OCPR roadmap</span>
              </div>
            </div>

            <div className="h-px bg-clay-100 my-2" />

            {/* Info tip */}
            <div className="px-2 mt-1">
              <div className="flex items-start gap-1.5 p-2 rounded-lg bg-clay-50 border border-clay-100">
                <Info className="w-3 h-3 text-clay-400 mt-0.5 shrink-0" />
                <p className="text-[10.5px] text-clay-500 leading-snug">
                  Click any text on the canvas to edit it directly. Press Enter or click away to save.
                </p>
              </div>
            </div>
          </aside>

          {/* ── Canvas area ── */}
          <main className="flex-1 overflow-y-auto bg-clay-100/60 flex justify-center py-8 px-6">
            <div
              id="resume-canvas"
              className="w-full max-w-[720px] bg-white rounded shadow-2xl shadow-clay-900/15 border border-clay-200 px-14 py-12 min-h-[900px]"
              style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}
            >
              {/* ── Paper: Header ── */}
              <div className="border-b-2 border-indigo-600 pb-5 mb-7">
                <EditableBlock
                  tag="h1"
                  value={resumeState.header.name}
                  placeholder="Your Full Name"
                  onSave={v => updateHeader('name', v)}
                  className="text-3xl font-bold text-gray-900 tracking-tight"
                />
                <EditableBlock
                  value={resumeState.header.title}
                  placeholder="Professional Title"
                  onSave={v => updateHeader('title', v)}
                  className="text-base font-semibold text-indigo-600 mt-1"
                />
                <div className="flex flex-wrap gap-x-6 mt-2">
                  <EditableBlock
                    value={resumeState.header.email}
                    placeholder="email@example.com"
                    onSave={v => updateHeader('email', v)}
                    className="text-xs text-gray-500"
                  />
                  <EditableBlock
                    value={resumeState.header.location}
                    placeholder="City, Country"
                    onSave={v => updateHeader('location', v)}
                    className="text-xs text-gray-500"
                  />
                  <EditableBlock
                    value={resumeState.header.linkedin}
                    placeholder="linkedin.com/in/..."
                    onSave={v => updateHeader('linkedin', v)}
                    className="text-xs text-gray-500"
                  />
                </div>
              </div>

              {/* ── Paper: Summary ── */}
              <CanvasSection icon={<User className="w-3 h-3" />} title="Professional Summary">
                {biographyLoading ? (
                  <div className="space-y-2">
                    <div className="skeleton h-3 rounded w-full" />
                    <div className="skeleton h-3 rounded w-5/6" />
                    <div className="skeleton h-3 rounded w-4/6" />
                  </div>
                ) : (
                  <EditableBlock
                    value={resumeState.summary}
                    placeholder="Write your professional summary..."
                    onSave={v => setResumeState(prev => ({ ...prev, summary: v }))}
                    multiline
                    className="text-sm text-gray-700 leading-relaxed min-h-[48px]"
                  />
                )}
              </CanvasSection>

              {/* ── Paper: Education ── */}
              <CanvasSection icon={<GraduationCap className="w-3 h-3" />} title="Education">
                {biographyLoading ? (
                  <div className="space-y-2">
                    <div className="skeleton h-3 rounded w-3/4" />
                    <div className="skeleton h-3 rounded w-1/2" />
                  </div>
                ) : (
                  <EditableBlock
                    value={resumeState.education}
                    placeholder="Degree · Institution · Year"
                    onSave={v => setResumeState(prev => ({ ...prev, education: v }))}
                    multiline
                    className="text-sm text-gray-700 leading-relaxed min-h-[36px] whitespace-pre-wrap"
                  />
                )}
              </CanvasSection>

              {/* ── Paper: Experience ── */}
              {resumeState.experience.length > 0 && (
                <CanvasSection icon={<Briefcase className="w-3 h-3" />} title="Experience">
                  <div className="space-y-5">
                    {resumeState.experience.map(exp => (
                      <div key={exp.id} className="relative group">
                        <button
                          onClick={() => removeExperience(exp.id)}
                          className="absolute -right-6 top-0 opacity-0 group-hover:opacity-100 p-1 rounded text-clay-400 hover:text-rust-500 transition-all"
                          aria-label="Remove experience"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <div className="flex justify-between items-start gap-4">
                          <EditableBlock
                            value={exp.title}
                            placeholder="Job Title"
                            onSave={v => updateExperience(exp.id, 'title', v)}
                            className="text-sm font-bold text-gray-900 flex-1"
                          />
                          <EditableBlock
                            value={exp.date}
                            placeholder="2023 – Present"
                            onSave={v => updateExperience(exp.id, 'date', v)}
                            className="text-xs text-gray-500 text-right shrink-0"
                          />
                        </div>
                        <EditableBlock
                          value={exp.company}
                          placeholder="Company Name"
                          onSave={v => updateExperience(exp.id, 'company', v)}
                          className="text-xs font-semibold text-indigo-600 mt-0.5"
                        />
                        <EditableBlock
                          value={exp.description}
                          placeholder="Describe your responsibilities and achievements..."
                          onSave={v => updateExperience(exp.id, 'description', v)}
                          multiline
                          className="text-xs text-gray-600 leading-relaxed mt-1.5 min-h-[36px]"
                        />
                      </div>
                    ))}
                  </div>
                </CanvasSection>
              )}

              {/* ── Paper: Projects ── */}
              {resumeState.projects.length > 0 && (
                <CanvasSection icon={<BookOpen className="w-3 h-3" />} title="Projects">
                  <div className="space-y-4">
                    {resumeState.projects.map(proj => (
                      <div key={proj.id} className="relative group">
                        <button
                          onClick={() => removeProject(proj.id)}
                          className="absolute -right-6 top-0 opacity-0 group-hover:opacity-100 p-1 rounded text-clay-400 hover:text-rust-500 transition-all"
                          aria-label="Remove project"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <div className="flex justify-between items-start gap-4">
                          <EditableBlock
                            value={proj.name}
                            placeholder="Project Name"
                            onSave={v => updateProject(proj.id, 'name', v)}
                            className="text-sm font-bold text-gray-900 flex-1"
                          />
                          <EditableBlock
                            value={proj.date}
                            placeholder="2024"
                            onSave={v => updateProject(proj.id, 'date', v)}
                            className="text-xs text-gray-500 text-right shrink-0"
                          />
                        </div>
                        <EditableBlock
                          value={proj.description}
                          placeholder="Brief project description and impact..."
                          onSave={v => updateProject(proj.id, 'description', v)}
                          multiline
                          className="text-xs text-gray-600 leading-relaxed mt-1 min-h-[28px]"
                        />
                      </div>
                    ))}
                  </div>
                </CanvasSection>
              )}

              {/* ── Paper: Skills ── */}
              <CanvasSection icon={<Wrench className="w-3 h-3" />} title="Skills">
                <div className="flex flex-wrap gap-1.5">
                  {cvSkills.map(skill => (
                    <span
                      key={`cv-${skill}`}
                      className="inline-block px-2.5 py-0.5 text-xs font-medium rounded bg-clay-100 text-clay-700 border border-clay-200"
                    >
                      {skill}
                    </span>
                  ))}
                  {newRoadmapSkills.map(skill => (
                    <span
                      key={`new-${skill}`}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded bg-forest-100 text-forest-800 border border-forest-300"
                    >
                      <Sparkles className="w-2.5 h-2.5" />
                      {skill}
                    </span>
                  ))}
                  {cvSkills.length === 0 && newRoadmapSkills.length === 0 && (
                    <p className="text-xs text-gray-400 italic">No skills added yet</p>
                  )}
                </div>
              </CanvasSection>

              {/* ── Paper: Certifications ── */}
              {resumeState.certifications.length > 0 && (
                <CanvasSection icon={<Award className="w-3 h-3" />} title="Certifications & Training">
                  <div className="space-y-3">
                    {resumeState.certifications.map(cert => (
                      <div key={cert.id} className="relative group flex justify-between items-start gap-4">
                        <button
                          onClick={() => removeCert(cert.id)}
                          className="absolute -right-6 top-0 opacity-0 group-hover:opacity-100 p-1 rounded text-clay-400 hover:text-rust-500 transition-all"
                          aria-label="Remove certification"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <div className="flex-1">
                          <EditableBlock
                            value={cert.name}
                            placeholder="Certification Name"
                            onSave={v => updateCert(cert.id, 'name', v)}
                            className="text-sm font-semibold text-gray-800"
                          />
                          <EditableBlock
                            value={cert.provider}
                            placeholder="Issuing Organization"
                            onSave={v => updateCert(cert.id, 'provider', v)}
                            className="text-xs text-indigo-500 mt-0.5"
                          />
                        </div>
                        <EditableBlock
                          value={cert.date}
                          placeholder="Year"
                          onSave={v => updateCert(cert.id, 'date', v)}
                          className="text-xs text-gray-400 shrink-0 text-right"
                        />
                      </div>
                    ))}
                  </div>
                </CanvasSection>
              )}

              {/* Footer */}
              <div className="mt-10 pt-4 border-t border-gray-100 text-center">
                <p className="text-[9px] text-gray-300 tracking-wide">
                  Generated by AI Career Pathfinder
                </p>
              </div>
            </div>
          </main>
        </div>
      </motion.div>
    </div>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const CanvasSection: React.FC<{
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}> = ({ icon, title, children }) => (
  <div className="mb-7">
    <div className="flex items-center gap-2 mb-3">
      <span className="text-indigo-500">{icon}</span>
      <h3 className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-indigo-600">
        {title}
      </h3>
      <div className="flex-1 h-px bg-indigo-100" />
    </div>
    {children}
  </div>
);

const SidebarBtn: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}> = ({ icon, label, onClick }) => (
  <button
    onClick={onClick}
    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-clay-600 hover:bg-clay-50 hover:text-ink transition-all text-left group"
  >
    <span className="text-clay-400 group-hover:text-rust-500 transition-colors">{icon}</span>
    <Plus className="w-2.5 h-2.5 text-clay-300 group-hover:text-rust-400 transition-colors" />
    {label}
  </button>
);

export default ResumeBuilder;
