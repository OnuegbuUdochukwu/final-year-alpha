import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Download,
  X,
  Loader2,
  AlertCircle,
  ChevronDown,
  FileText,
  File,
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

interface EduEntry {
  id: string;
  degree: string;
  school: string;
  location: string;
  dates: string;
}

interface ExperienceEntry {
  id: string;
  title: string;
  company: string;
  location: string;
  dates: string;
  duties: string[];
}

interface ContactState {
  email: string;
  phone: string;
  location: string;
  linkedin: string;
}

interface ResumeState {
  name: string;
  title: string;
  contact: ContactState;
  summary: string;
  education: EduEntry[];
  experience: ExperienceEntry[];
  skills: string[];
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
  as?: 'div' | 'p' | 'h1' | 'h2' | 'h3' | 'span' | 'li';
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
      ref={ref as any}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={`editable-block outline-none focus:ring-1 focus:ring-blue-100 rounded-sm px-0.5 transition-colors ${className}`}
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
  const newRoadmapSkills = courses.map(c => c.name).filter(Boolean);
  const newSkillSet = new Set(newRoadmapSkills);

  const allSkills = [
    ...cvSkills,
    ...newRoadmapSkills.filter(s => !cvSkills.includes(s)),
  ];

  const [fullResumeData, setFullResumeData] = useState<ResumeState>({
    name: '',
    title: targetRole || '',
    contact: { email: '', phone: '', location: '', linkedin: '' },
    summary: '',
    education: [],
    experience: [],
    skills: [],
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [biographyLoading, setBiographyLoading] = useState(true);

  // ── Biography pre-fill ────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBiographyLoading(true);
      try {
        const bio: any = await getUserBiography(token);
        if (cancelled) return;
        
        // Use empty object as fallback to prevent optional chaining crashes
        const biographyObj = bio.biography || bio || {};
        const contactObj = biographyObj.contact || {};

        setFullResumeData(prev => ({
          ...prev,
          name: biographyObj.name || prev.name,
          title: biographyObj.title || prev.title,
          contact: {
            email: contactObj.email || prev.contact.email,
            phone: contactObj.phone || prev.contact.phone,
            location: contactObj.location || prev.contact.location,
            linkedin: contactObj.linkedin || prev.contact.linkedin,
          },
          summary: biographyObj.summary || prev.summary,
          education: biographyObj.education && biographyObj.education.length > 0 
            ? biographyObj.education.map((e: any) => ({ ...e, id: uid('edu') })) 
            : prev.education,
          experience: biographyObj.experience && biographyObj.experience.length > 0
            ? biographyObj.experience.map((e: any) => ({ ...e, id: uid('exp') }))
            : prev.experience,
          skills: biographyObj.skills || prev.skills,
        }));
      } catch {
        // Graceful fallback
      } finally {
        if (!cancelled) setBiographyLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // ── Simple field updaters ─────────────────────────────────────────────────
  const set = useCallback(<K extends keyof ResumeState>(field: K, value: ResumeState[K]) => {
    setFullResumeData(prev => ({ ...prev, [field]: value }));
  }, []);


  const updateExp = useCallback((id: string, field: keyof ExperienceEntry, value: string) => {
    setFullResumeData(prev => ({
      ...prev,
      experience: prev.experience.map(e => e.id === id ? { ...e, [field]: value } : e),
    }));
  }, []);

  const updateDuty = useCallback((expId: string, dutyIndex: number, value: string) => {
    setFullResumeData(prev => ({
      ...prev,
      experience: prev.experience.map(e => {
        if (e.id !== expId) return e;
        const newDuties = [...e.duties];
        newDuties[dutyIndex] = value;
        return { ...e, duties: newDuties };
      })
    }));
  }, []);

  const updateEdu = useCallback((id: string, field: keyof EduEntry, value: string) => {
    setFullResumeData(prev => ({
      ...prev,
      education: prev.education.map(e => e.id === id ? { ...e, [field]: value } : e),
    }));
  }, []);

  // ── Utility: Decode HTML Entities ─────────────────────────────────────────
  const decodeHTMLEntities = (text?: string | null): string => {
    if (!text) return "";
    return text
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, "\"")
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  };

  // ── Download ──────────────────────────────────────────────────────────────
  const handleDownload = useCallback(async (format: 'pdf' | 'docx') => {
    setIsGenerating(true);
    setError(null);
    setShowDownloadMenu(false);
    try {
      await downloadResume(token, {
        name: decodeHTMLEntities(fullResumeData.name),
        title: decodeHTMLEntities(fullResumeData.title),
        email: decodeHTMLEntities(fullResumeData.contact.email),
        location: decodeHTMLEntities(fullResumeData.contact.location),
        linkedin: decodeHTMLEntities(fullResumeData.contact.linkedin),
        phone: decodeHTMLEntities(fullResumeData.contact.phone),
        summary: decodeHTMLEntities(fullResumeData.summary),
        education: fullResumeData.education
          .map(e => `${decodeHTMLEntities(e.dates)}, ${decodeHTMLEntities(e.degree)}, ${decodeHTMLEntities(e.school)}, ${decodeHTMLEntities(e.location)}`)
          .join('\n\n'),
        experience: fullResumeData.experience.map(e => ({
          title: decodeHTMLEntities(e.title),
          company: decodeHTMLEntities(e.company),
          location: decodeHTMLEntities(e.location),
          dates: decodeHTMLEntities(e.dates),
          duties: e.duties.map(d => decodeHTMLEntities(d))
        })),
        cv_skills: cvSkills.map(s => decodeHTMLEntities(s)),
        gained_skills: newRoadmapSkills.map(s => decodeHTMLEntities(s)),
        target_role: decodeHTMLEntities(targetRole),
        courses: courses.map(c => ({
          ...c,
          name: decodeHTMLEntities(c.name),
          provider: decodeHTMLEntities(c.provider)
        })),
        format,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to generate ${format.toUpperCase()}.`);
    } finally {
      setIsGenerating(false);
    }
  }, [token, fullResumeData, cvSkills, newRoadmapSkills, targetRole, courses]);

  console.log("Canvas Received Data:", fullResumeData);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-100 overflow-y-auto" role="dialog" aria-modal="true">
      {/* ── Top bar ── */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200 shadow-sm shrink-0">
        <div>
          <h2 className="font-semibold text-lg text-gray-900 leading-tight">Resume Canvas</h2>
          <p className="text-xs text-gray-500 mt-1">Single-Column ATS Format · Click any text to edit</p>
        </div>
        <div className="flex items-center gap-3 relative">
          <div className="relative">
            <button
              onClick={() => setShowDownloadMenu(!showDownloadMenu)}
              disabled={isGenerating}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-all"
            >
              {isGenerating ? <><Loader2 className="w-4 h-4 animate-spin" />Generating…</> : <><Download className="w-4 h-4" />Download <ChevronDown className="w-4 h-4 ml-1" /></>}
            </button>
            <AnimatePresence>
              {showDownloadMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-gray-100 overflow-hidden z-50"
                >
                  <button
                    onClick={() => handleDownload('pdf')}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 hover:text-indigo-600 transition-colors"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Download as PDF</span>
                  </button>
                  <div className="h-px bg-gray-100"></div>
                  <button
                    onClick={() => handleDownload('docx')}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 hover:text-indigo-600 transition-colors"
                  >
                    <File className="w-4 h-4" />
                    <span>Download as DOCX</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button onClick={onClose} className="p-2.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="flex items-center justify-center gap-2 px-5 py-3 bg-red-50 text-red-700 text-sm border-b border-red-200">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Canvas ── */}
      <div className="flex-1 py-10 px-4">
        {biographyLoading ? (
          <div className="max-w-4xl mx-auto bg-white shadow-2xl p-12 aspect-[8.5/11] flex flex-col justify-center items-center">
            <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-4" />
            <p className="text-gray-500">Loading parsed resume structure...</p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto bg-white shadow-2xl p-12 aspect-[8.5/11] text-gray-900 font-sans flex flex-col gap-6">
            
            {/* Header */}
            <div>
              <Editable as="h1" value={fullResumeData.name} placeholder="Name" onSave={v => set('name', v)} className="text-3xl font-bold text-center" />
              <Editable as="h2" value={fullResumeData.title} placeholder="Title" onSave={v => set('title', v)} className="text-xl text-center mt-1" />
              
              {/* Contact Line */}
              <p className="text-sm text-center mt-1" contentEditable={true} suppressContentEditableWarning={true}>
                {[
                  fullResumeData?.contact?.email,
                  fullResumeData?.contact?.linkedin,
                  fullResumeData?.contact?.phone,
                  fullResumeData?.contact?.location
                ].filter(item => item && item.trim() !== "").join(" | ")}
              </p>
            </div>

            {/* Professional Summary */}
            <div>
              <h3 className="text-lg font-bold border-b border-gray-300 pb-1 mb-2">Professional Summary</h3>
              <Editable as="p" multiline value={fullResumeData.summary} placeholder="Summary" onSave={v => set('summary', v)} className="text-sm leading-relaxed" />
            </div>

            {/* Work Experience */}
            {fullResumeData.experience.length > 0 && (
              <div>
                <h3 className="text-lg font-bold border-b border-gray-300 pb-1 mb-2 mt-4">Work Experience</h3>
                {fullResumeData.experience.map(exp => (
                  <div key={exp.id} className="mb-4">
                    <div className="text-sm font-bold mt-3 flex flex-wrap gap-1">
                      <Editable as="span" value={exp.title} placeholder="Title" onSave={v => updateExp(exp.id, 'title', v)} />,
                      <Editable as="span" value={exp.company} placeholder="Company" onSave={v => updateExp(exp.id, 'company', v)} />,
                      <Editable as="span" value={exp.location} placeholder="Location" onSave={v => updateExp(exp.id, 'location', v)} />,
                      <Editable as="span" value={exp.dates} placeholder="Dates" onSave={v => updateExp(exp.id, 'dates', v)} />
                    </div>
                    {exp.duties.length > 0 && (
                      <ul className="mt-1">
                        {exp.duties.map((duty, idx) => (
                          <Editable key={idx} as="li" multiline value={duty} placeholder="Duty" onSave={v => updateDuty(exp.id, idx, v)} className="text-sm list-disc ml-5 mt-1" />
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Education */}
            {fullResumeData.education.length > 0 && (
              <div>
                <h3 className="text-lg font-bold border-b border-gray-300 pb-1 mb-2 mt-4">Education</h3>
                {fullResumeData.education.map(edu => (
                  <div key={edu.id} className="text-sm font-bold mt-3 flex flex-wrap gap-1">
                    <Editable as="span" value={edu.degree} placeholder="Degree" onSave={v => updateEdu(edu.id, 'degree', v)} />,
                    <Editable as="span" value={edu.school} placeholder="School" onSave={v => updateEdu(edu.id, 'school', v)} />,
                    <Editable as="span" value={edu.location} placeholder="Location" onSave={v => updateEdu(edu.id, 'location', v)} />,
                    <Editable as="span" value={edu.dates} placeholder="Dates" onSave={v => updateEdu(edu.id, 'dates', v)} />
                  </div>
                ))}
              </div>
            )}

            {/* Skills */}
            <div>
              <h3 className="text-lg font-bold border-b border-gray-300 pb-1 mb-2 mt-4">Skills</h3>
              <div className="flex flex-wrap gap-2 mt-2">
                {allSkills.map(skill => {
                  const isNew = newSkillSet.has(skill);
                  return (
                    <span
                      key={skill}
                      className={
                        isNew
                          ? "text-green-700 font-bold bg-green-50 px-2 py-0.5 rounded text-sm"
                          : "text-gray-700 bg-gray-100 px-2 py-0.5 rounded text-sm"
                      }
                    >
                      {skill}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResumeBuilder;
