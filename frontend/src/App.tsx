import { useState, useCallback } from 'react';
import { LogOut, FileText, Compass } from 'lucide-react';
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

  const [pathData, setPathData] = useState<any>(null);
  const [parsedSkills, setParsedSkills] = useState<ParsedSkill[]>([]);

  const [showResumeBuilder, setShowResumeBuilder] = useState(false);

  const [currentStart, setCurrentStart] = useState<string>('Foundation');
  const [currentTarget, setCurrentTarget] = useState<string | null>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);

  const handleSkillsParsed = useCallback((skills: ParsedSkill[]) => {
    setParsedSkills(skills);
    if (skills.length > 0) {
      setCurrentStart(skills[0].name);
    }
  }, []);

  const handlePathFound = useCallback((data: any) => {
    console.log("Roadmap API Response:", data);
    setPathData(data);
    setCurrentTarget(data.target_skill || data.target_role);
  }, []);

  const handleStepCompleted = useCallback(async (completedSkill: string) => {
    setCurrentStart(completedSkill);

    if (!currentTarget) return;

    setIsRecalculating(true);
    try {
      const response = await client.get('/api/find-path', {
        params: {
          start: completedSkill,
          target: currentTarget,
        },
      });
      setPathData(response.data);
    } catch (err: any) {
      console.error('Recalculation error:', err.response?.data?.detail ?? err.message);
    } finally {
      setIsRecalculating(false);
    }
  }, [currentTarget]);

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-rust-500 focus:text-white focus:rounded-lg focus:shadow-lg"
      >
        Skip to main content
      </a>

      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none bg-noise" />

      {!token && <LoginModal />}

      <div className="min-h-screen flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-2xl">
          <motion.header
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-14 relative"
          >
            {token && (
              <button
                onClick={logout}
                className="absolute right-0 top-0 flex items-center gap-1.5 text-xs text-clay-500 hover:text-rust-500 transition-colors font-medium"
                aria-label="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out{userId ? ` (${userId})` : ''}
              </button>
            )}

            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-rust-500 to-gold-600 shadow-lg shadow-rust-500/20 mb-5">
              <Compass className="w-7 h-7 text-white" />
            </div>

            <h1 className="heading text-4xl md:text-5xl text-ink dark:text-clay-50 mb-3">
              AI Career Pathfinder
            </h1>
            <p className="max-w-xl mx-auto text-base text-clay-600 dark:text-clay-400 leading-relaxed font-[450]">
              Upload your resume, discover skill gaps, and follow a personalized roadmap to your next career milestone.
            </p>

            <div className="flex items-center justify-center gap-3 mt-7">
              <span
                className={`w-2 h-2 rounded-full transition-colors duration-500 ${
                  parsedSkills.length > 0 ? 'bg-rust-500' : 'bg-clay-300 dark:bg-clay-700'
                }`}
              />
              <span
                className={`w-2 h-2 rounded-full transition-colors duration-500 ${
                  pathData ? 'bg-rust-500' : 'bg-clay-300 dark:bg-clay-700'
                }`}
              />
              <span className="w-8 h-px bg-clay-300 dark:bg-clay-700" />
              <span className="text-[11px] font-semibold text-clay-400 dark:text-clay-500 uppercase tracking-[0.15em]">
                {!parsedSkills.length ? 'Analyze' : !pathData ? 'Plan' : 'Grow'}
              </span>
            </div>
          </motion.header>

          <ResumeUpload
            onPathFound={handlePathFound}
            onSkillsParsed={handleSkillsParsed}
            topSkill={currentStart !== 'Foundation' ? currentStart : null}
          />

          {pathData && (
            <>
              <TimelineRoadmap
                pathData={pathData}
                onStepCompleted={handleStepCompleted}
                isRecalculating={isRecalculating}
                knownSkills={pathData.knownSkills}
              />
              <PredictedResume currentSkills={parsedSkills} pathData={pathData} />

              {token && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.15 }}
                  className="flex justify-center mt-8 mb-16"
                >
                  <button
                    type="button"
                    onClick={() => setShowResumeBuilder(true)}
                    className="inline-flex items-center gap-2.5 px-7 py-3.5 rounded-xl bg-gradient-to-br from-rust-500 to-rust-700 hover:from-rust-600 hover:to-rust-800 text-white font-semibold text-sm shadow-lg shadow-rust-500/25 transition-all hover:shadow-xl hover:shadow-rust-500/30 active:scale-[0.97]"
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
