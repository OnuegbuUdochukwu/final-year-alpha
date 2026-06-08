/**
 * App.tsx — Root application shell.
 *
 * Orchestrates the full user journey:
 *   1. LoginModal gate (shows if no JWT present)
 *   2. Resume upload → NLP parse → SkillRadar
 *   3. Target selection → A* pathfinding → TimelineRoadmap
 *   4. Mark step complete → webhook → Dynamic path recalculation (Phase 6.3.2)
 *   5. Future resume preview
 *
 * State flow:
 *   parsedSkills → topSkill → pathData (recalculates on each step completion)
 */

import { useState, useCallback, useRef } from 'react';
import { LogOut, FileText, Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from './context/AuthContext';
import LoginModal from './components/LoginModal';
import ResumeUpload from './components/ResumeUpload';
import TimelineRoadmap from './components/TimelineRoadmap';
import PredictedResume from './components/PredictedResume';
import ResumeBuilder from './components/ResumeBuilder';
import client from './api/client';
import './App.css';

interface ParsedSkill {
  name: string;
  confidence: number;
}

function App() {
  const { token, userId, logout } = useAuth();
  const mainRef = useRef<HTMLDivElement>(null);

  // Core data state
  const [pathData, setPathData] = useState<any>(null);
  const [parsedSkills, setParsedSkills] = useState<ParsedSkill[]>([]);

  // Resume builder visibility
  const [showResumeBuilder, setShowResumeBuilder] = useState(false);

  // Dynamic recalculation state (Phase 6.3.2)
  const [currentStart, setCurrentStart] = useState<string>('Foundation');
  const [currentTarget, setCurrentTarget] = useState<string | null>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);

  /**
   * Called by ResumeUpload after a successful parse.
   * Derives `topSkill` as the highest-confidence skill (already sorted by server).
   */
  const handleSkillsParsed = useCallback((skills: ParsedSkill[]) => {
    setParsedSkills(skills);
    if (skills.length > 0) {
      setCurrentStart(skills[0].name);
    }
  }, []);

  /**
   * Called by TargetSelectionForm after the first path is generated.
   * Stores the target so we can re-use it during recalculation.
   */
  const handlePathFound = useCallback((data: any) => {
    console.log("Roadmap API Response:", data);
    setPathData(data);
    setCurrentTarget(data.target_skill || data.target_role);
  }, []);

  /**
   * Phase 6.3.2 — Dynamic Path Recalculation.
   *
   * Called by TimelineRoadmap after a step is marked complete.
   * Updates `currentStart` to the newly acquired skill and re-fetches the
   * optimal path from the graph service.
   */
  const handleStepCompleted = useCallback(async (completedSkill: string) => {
    // Update our local "current position" reference
    setCurrentStart(completedSkill);

    // If we don't yet know the target, nothing more to do
    if (!currentTarget) return;

    setIsRecalculating(true);
    try {
      const response = await client.get('/api/find-path', {
        params: {
          start: completedSkill,
          target: currentTarget,
          // Re-use any previous constraints — for now we leave them open
        },
      });
      setPathData(response.data);
    } catch (err: any) {
      // Surface errors gracefully — the TimelineRoadmap will handle them
      console.error('Recalculation error:', err.response?.data?.detail ?? err.message);
    } finally {
      setIsRecalculating(false);
    }
  }, [currentTarget]);

  return (
    <>
      {/* ── Skip to content ─────────────────────────────────────────────── */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-brand-600 focus:text-white focus:rounded-lg focus:shadow-lg"
      >
        Skip to main content
      </a>

      {/* ── Background decoration ──────────────────────────────────────── */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-brand-200/30 dark:bg-brand-800/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-violet-200/20 dark:bg-violet-800/15 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-100/10 dark:bg-brand-900/10 rounded-full blur-3xl" />
      </div>

      {/* ── Auth gate ─────────────────────────────────────────────────────── */}
      {!token && <LoginModal />}

      {/* ── App shell ─────────────────────────────────────────────────────── */}
      <div
        ref={mainRef}
        id="main-content"
        className="min-h-screen bg-gray-50/80 dark:bg-gray-950/90 flex flex-col items-center py-10 px-4 sm:px-6 lg:px-8"
      >
        <div className="w-full max-w-2xl">

          {/* ── Header ── */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="text-center mb-12 relative"
          >
            {/* Logout button (top-right when logged in) */}
            {token && (
              <button
                onClick={logout}
                className="absolute right-0 top-0 flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-400 transition-colors"
                aria-label="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out {userId ? `(${userId})` : ''}
              </button>
            )}

            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-violet-600 shadow-lg shadow-brand-500/25 mb-5">
              <Sparkles className="w-6 h-6 text-white" />
            </div>

            <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-3">
              AI Career Pathfinder
            </h1>
            <p className="max-w-xl mx-auto text-base text-gray-500 dark:text-gray-400 leading-relaxed">
              Upload your resume to discover skill gaps, generate a personalized learning roadmap, and track your progress with live path updates.
            </p>

            {/* Progress indicator dots */}
            <div className="flex items-center justify-center gap-1.5 mt-6">
              <span className={`w-2 h-2 rounded-full transition-colors ${parsedSkills.length > 0 ? 'bg-brand-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
              <span className={`w-2 h-2 rounded-full transition-colors ${pathData ? 'bg-brand-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
              <span className="w-12 h-px bg-gray-200 dark:bg-gray-700" />
              <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                {!parsedSkills.length ? 'Upload' : !pathData ? 'Set Goal' : 'Learn'}
              </span>
            </div>
          </motion.div>

          {/* ── Main flow ── */}
          <ResumeUpload
            onPathFound={handlePathFound}
            onSkillsParsed={handleSkillsParsed}
            topSkill={currentStart !== 'Foundation' ? currentStart : null}
          />

          {/* Timeline + Predicted Resume + Resume Builder appear after a path is generated */}
          {pathData && (
            <>
              <TimelineRoadmap
                pathData={pathData}
                onStepCompleted={handleStepCompleted}
                isRecalculating={isRecalculating}
                knownSkills={pathData.knownSkills}
              />
              <PredictedResume currentSkills={parsedSkills} pathData={pathData} />

              {/* ── Build Resume CTA ── */}
              {token && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.2 }}
                  className="flex justify-center mt-6 mb-12"
                >
                  <button
                    type="button"
                    onClick={() => setShowResumeBuilder(true)}
                    className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl bg-gradient-to-r from-brand-600 to-violet-600 hover:from-brand-700 hover:to-violet-700 text-white font-semibold text-sm shadow-lg shadow-brand-500/25 transition-all hover:scale-[1.02] active:scale-100 hover:shadow-xl hover:shadow-brand-500/30"
                  >
                    <FileText className="w-4 h-4" />
                    Build &amp; Download Resume
                  </button>
                </motion.div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Resume Builder Modal ────────────────────────────────────────── */}
      <AnimatePresence>
        {showResumeBuilder && token && (
          <ResumeBuilder
            token={token}
            cvSkills={parsedSkills.map(s => s.name)}
            targetRole={pathData?.target_skill ?? ''}
            courses={(pathData?.nodes ?? []).map((node: any) => ({
              name: node.label,
              provider: '',
            }))}
            onClose={() => setShowResumeBuilder(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

export default App;
