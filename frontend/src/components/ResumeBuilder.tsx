import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, Easing } from "framer-motion";
import {
  FileText, Sparkles, Download, ChevronRight, ChevronLeft,
  Plus, X, RefreshCw, Loader2, Check, AlertCircle
} from "lucide-react";
import {
  getResumeSkills,
  previewResume,
  downloadResume,
  ResumePayload,
  CourseItem,
} from "../api/resumeApi";

interface ResumeBuilderProps {
  token: string;
  cvSkills: string[];
  targetRole?: string;
  courses?: CourseItem[];
  onClose: () => void;
}

type Step = "review" | "preview" | "download";

const slideVariants = {
  enter: (dir: number) => ({
    x: dir > 0 ? 64 : -64,
    opacity: 0,
  }),
  center: { x: 0, opacity: 1, transition: { duration: 0.3, ease: "easeOut" as Easing } },
  exit: (dir: number) => ({
    x: dir > 0 ? -64 : 64,
    opacity: 0,
    transition: { duration: 0.2, ease: "easeIn" as Easing },
  }),
};

const SkillChip: React.FC<{
  label: string;
  variant: "cv" | "gained" | "added";
  onRemove: () => void;
}> = ({ label, variant, onRemove }) => {
  const colours: Record<string, string> = {
    cv:     "bg-brand-50 border-brand-200 text-brand-700 dark:bg-brand-900/30 dark:border-brand-700 dark:text-brand-300",
    gained: "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-700 dark:text-emerald-300",
    added:  "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-300",
  };
  return (
    <motion.span
      layout
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.8, opacity: 0, transition: { duration: 0.15 } }}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border select-none ${colours[variant]}`}
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="ml-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 p-0.5 transition-colors"
      >
        <X className="w-2.5 h-2.5" />
      </button>
    </motion.span>
  );
};

const STEPS: { id: Step; label: string; icon: React.ReactNode }[] = [
  { id: "review",   label: "Review Skills", icon: <Sparkles className="w-4 h-4" /> },
  { id: "preview",  label: "Live Preview",  icon: <FileText  className="w-4 h-4" /> },
  { id: "download", label: "Download",      icon: <Download  className="w-4 h-4" /> },
];

const ResumeBuilder: React.FC<ResumeBuilderProps> = ({
  token,
  cvSkills,
  targetRole = "",
  courses = [],
  onClose,
}) => {
  const [step, setStep] = useState<Step>("review");
  const [direction, setDirection] = useState(1);

  const [cvList,     setCvList]     = useState<string[]>([]);
  const [gainedList, setGainedList] = useState<string[]>([]);
  const [addedList,  setAddedList]  = useState<string[]>([]);
  const [removed,    setRemoved]    = useState<Set<string>>(new Set());

  const [name,     setName]     = useState("");
  const [title,    setTitle]    = useState("");
  const [email,    setEmail]    = useState("");
  const [linkedin, setLinkedin] = useState("");

  const [addInput,    setAddInput]    = useState("");
  const [loading,     setLoading]     = useState(true);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewing,  setPreviewing]  = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [downloadOk,  setDownloadOk]  = useState(false);

  const addInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getResumeSkills(token, cvSkills)
      .then((data) => {
        if (cancelled) return;
        setCvList(data.cv_skills);
        setGainedList(data.gained_skills);
      })
      .catch((e) => {
        if (cancelled) return;
        setCvList(cvSkills);
        setGainedList([]);
        console.warn("Resume skills fetch failed, using props:", e.message);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, cvSkills]);

  const removeSkill = useCallback((skill: string) => {
    setRemoved((prev) => new Set(prev).add(skill));
  }, []);

  const addSkill = useCallback(() => {
    const s = addInput.trim();
    if (!s) return;
    setAddedList((prev) => prev.includes(s) ? prev : [...prev, s]);
    setRemoved((prev) => { const n = new Set(prev); n.delete(s); return n; });
    setAddInput("");
    addInputRef.current?.focus();
  }, [addInput]);

  const visibleCv     = cvList.filter(s => !removed.has(s));
  const visibleGained = gainedList.filter(s => !removed.has(s));
  const visibleAdded  = addedList.filter(s => !removed.has(s));

  const buildPayload = useCallback((): ResumePayload => ({
    name:           name  || undefined,
    title:          title || undefined,
    email:          email || undefined,
    linkedin:       linkedin || undefined,
    cv_skills:      cvList,
    gained_skills:  gainedList,
    user_additions: addedList,
    user_removals:  Array.from(removed),
    target_role:    targetRole,
    courses,
  }), [name, title, email, linkedin, cvList, gainedList, addedList, removed, targetRole, courses]);

  const goTo = useCallback((next: Step, dir: number) => {
    setDirection(dir);
    setError(null);
    setStep(next);
  }, []);

  const handlePreview = useCallback(async () => {
    setPreviewing(true);
    setError(null);
    try {
      const html = await previewResume(token, buildPayload());
      setPreviewHtml(html);
      goTo("preview", 1);
    } catch (e: unknown) {
      setError((e as Error).message ?? "Preview failed.");
    } finally {
      setPreviewing(false);
    }
  }, [token, buildPayload, goTo]);

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    setError(null);
    try {
      await downloadResume(token, buildPayload());
      setDownloadOk(true);
      setTimeout(() => setDownloadOk(false), 3000);
    } catch (e: unknown) {
      setError((e as Error).message ?? "Download failed.");
    } finally {
      setDownloading(false);
    }
  }, [token, buildPayload]);

  const stepIndex = STEPS.findIndex(s => s.id === step);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Resume Builder"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="relative w-full max-w-3xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: "90vh" }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-brand-600 to-violet-600">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-white/15 rounded-lg">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <span className="text-white font-semibold text-base tracking-tight">Resume Builder</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/70 hover:text-white transition-colors rounded-lg p-1 hover:bg-white/10"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center justify-center gap-2 px-6 pt-5 pb-2">
          {STEPS.map((s, i) => {
            const active  = s.id === step;
            const done    = i < stepIndex;
            return (
              <React.Fragment key={s.id}>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200
                  ${active ? "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 shadow-sm" : ""}
                  ${done   ? "text-emerald-600 dark:text-emerald-400" : ""}
                  ${!active && !done ? "text-gray-400 dark:text-gray-600" : ""}
                `}>
                  {done ? <Check className="w-3.5 h-3.5" /> : React.cloneElement(s.icon as React.ReactElement, { className: "w-3.5 h-3.5" })}
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <ChevronRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-700 flex-shrink-0" />
                )}
              </React.Fragment>
            );
          })}
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              role="alert"
              className="mx-6 mt-3 flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-xl text-red-700 dark:text-red-300 text-sm"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-hidden relative" style={{ minHeight: 320 }}>
          <AnimatePresence custom={direction} mode="wait">

            {step === "review" && (
              <motion.div
                key="review"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="absolute inset-0 overflow-y-auto p-6 space-y-6"
              >
                {loading ? (
                  <div className="flex items-center justify-center h-40 gap-3 text-gray-400">
                    <div className="w-5 h-5 rounded-full border-2 border-brand-200 border-t-brand-500 animate-spin" />
                    <span className="text-sm">Loading your skills&hellip;</span>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        { label: "Full Name",   val: name,     setter: setName,     placeholder: "Jane Doe" },
                        { label: "Job Title",   val: title,    setter: setTitle,    placeholder: "Data Scientist" },
                        { label: "Email",       val: email,    setter: setEmail,    placeholder: "jane@example.com" },
                        { label: "LinkedIn",    val: linkedin, setter: setLinkedin, placeholder: "linkedin.com/in/jane" },
                      ].map(({ label, val, setter, placeholder }) => (
                        <div key={label}>
                          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">
                            {label}
                          </label>
                          <input
                            type="text"
                            value={val}
                            onChange={e => setter(e.target.value)}
                            placeholder={placeholder}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder-gray-300 dark:placeholder-gray-600 transition-all"
                          />
                        </div>
                      ))}
                    </div>

                    {[
                      { title: "CV Skills",    list: visibleCv,     variant: "cv"     as const, key: cvList },
                      { title: "Gained Skills",list: visibleGained, variant: "gained" as const, key: gainedList },
                      { title: "Added by You", list: visibleAdded,  variant: "added"  as const, key: addedList },
                    ].map(({ title: sTitle, list, variant }) => list.length > 0 && (
                      <div key={sTitle}>
                        <p className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                          {sTitle} <span className="font-normal text-gray-300 dark:text-gray-600">({list.length})</span>
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          <AnimatePresence>
                            {list.map(skill => (
                              <SkillChip
                                key={skill}
                                label={skill}
                                variant={variant}
                                onRemove={() => removeSkill(skill)}
                              />
                            ))}
                          </AnimatePresence>
                        </div>
                      </div>
                    ))}

                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                        Add a Skill
                      </p>
                      <div className="flex gap-2">
                        <input
                          ref={addInputRef}
                          type="text"
                          value={addInput}
                          onChange={e => setAddInput(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && addSkill()}
                          placeholder="e.g. TensorFlow, Kubernetes&hellip;"
                          className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-400 placeholder-gray-300 dark:placeholder-gray-600"
                        />
                        <button
                          type="button"
                          onClick={addSkill}
                          disabled={!addInput.trim()}
                          className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-sm font-medium flex items-center gap-1.5 transition-colors"
                        >
                          <Plus className="w-4 h-4" /> Add
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </motion.div>
            )}

            {step === "preview" && (
              <motion.div
                key="preview"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="absolute inset-0 flex flex-col p-4 gap-3"
              >
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    Rendered preview
                  </span>
                  <button
                    type="button"
                    onClick={handlePreview}
                    disabled={previewing}
                    className="flex items-center gap-1.5 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${previewing ? "animate-spin" : ""}`} />
                    Re-preview
                  </button>
                </div>
                <div className="flex-1 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden bg-white shadow-inner">
                  {previewHtml ? (
                    <iframe
                      title="Resume Preview"
                      srcDoc={previewHtml}
                      sandbox="allow-same-origin"
                      className="w-full h-full"
                      style={{ minHeight: 400 }}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full gap-2 text-gray-400">
                      <div className="w-4 h-4 rounded-full border-2 border-brand-200 border-t-brand-500 animate-spin" />
                      <span className="text-sm">Generating preview&hellip;</span>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {step === "download" && (
              <motion.div
                key="download"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="absolute inset-0 flex flex-col items-center justify-center gap-6 p-8 text-center"
              >
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-violet-600 flex items-center justify-center shadow-lg shadow-brand-500/30">
                  <FileText className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-1">
                    Your Resume is Ready
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
                    ATS-optimised PDF with your verified and newly gained skills merged in.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading}
                  className="flex items-center gap-2.5 px-8 py-3.5 rounded-xl bg-gradient-to-r from-brand-600 to-violet-600 hover:from-brand-700 hover:to-violet-700 text-white font-semibold text-base shadow-lg shadow-brand-500/30 transition-all disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.98]"
                >
                  {downloading ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Generating PDF&hellip;</>
                  ) : downloadOk ? (
                    <><Check className="w-5 h-5" /> Downloaded!</>
                  ) : (
                    <><Download className="w-5 h-5" /> Download PDF</>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => goTo("review", -1)}
                  className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  &larr; Edit skills again
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-950/50">
          <button
            type="button"
            onClick={() => {
              if (step === "preview")  goTo("review",   -1);
              if (step === "download") goTo("preview",  -1);
            }}
            disabled={step === "review"}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-0 transition-all"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </button>

          {step === "review" && (
            <button
              type="button"
              onClick={handlePreview}
              disabled={previewing || loading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors shadow-md shadow-brand-500/20"
            >
              {previewing
                ? <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Rendering&hellip;</>
                : <>Preview Resume <ChevronRight className="w-4 h-4" /></>
              }
            </button>
          )}

          {step === "preview" && (
            <button
              type="button"
              onClick={() => goTo("download", 1)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition-colors shadow-md shadow-brand-500/20"
            >
              Looks Good <ChevronRight className="w-4 h-4" />
            </button>
          )}

          {step === "download" && (
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-semibold transition-colors"
            >
              Done
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default ResumeBuilder;
