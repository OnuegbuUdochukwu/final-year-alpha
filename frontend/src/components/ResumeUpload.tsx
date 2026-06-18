import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion } from 'framer-motion';
import { UploadCloud, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import SkillRadar from './SkillRadar';
import TargetSelectionForm from './TargetSelectionForm';
import client from '../api/client';

interface ParsedSkill {
  name: string;
  confidence: number;
}

interface ResumeUploadProps {
  onPathFound: (pathData: any) => void;
  onSkillsParsed: (skills: ParsedSkill[]) => void;
  topSkill: string | null;
}
const loadingSteps = [
  "Uploading document securely...",
  "Converting PDF layout to Markdown...",
  "Running intelligent LLM extraction...",
  "Categorizing skills and experience...",
  "Reconciling data and filling gaps...",
  "Finalizing your customized canvas..."
];

const ResumeUpload: React.FC<ResumeUploadProps> = ({ onPathFound, onSkillsParsed, topSkill }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isUploading) {
      setCurrentStep(0);
      interval = setInterval(() => {
        setCurrentStep((prev) => {
          if (prev < loadingSteps.length - 1) return prev + 1;
          return prev;
        });
      }, 6000);
    } else {
      setCurrentStep(0);
    }
    return () => clearInterval(interval);
  }, [isUploading]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setError(null);
      setData(null);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchBaselineData = async () => {
      try {
        const response = await client.get('/api/user/profile');
        if (isMounted && response.data?.current_skills_json) {
          setData(response.data);
          if (response.data.current_skills_json.skills) {
            onSkillsParsed(response.data.current_skills_json.skills);
          }
        }
      } catch (err) {
        console.error("Failed to fetch baseline resume data:", err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchBaselineData();
    return () => { isMounted = false; };
  }, [onSkillsParsed]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    maxFiles: 1,
  });

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await client.post('/api/parse-resume', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setData({ current_skills_json: response.data });
      const skills = response.data.skills ?? [];
      onSkillsParsed(skills);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(detail || 'Failed to parse resume. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="w-full max-w-2xl mx-auto"
    >
      <div className="bg-white rounded-2xl shadow-sm border border-clay-200">
        <div className="px-6 py-5 border-b border-clay-100">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-rust-50">
              <FileText className="w-5 h-5 text-rust-500" />
            </div>
            <div>
              <h2 className="font-heading text-lg font-bold text-ink">
                {data?.current_skills_json?.skills ? 'Your Skill Profile' : 'Upload Your Resume'}
              </h2>
              <p className="text-sm text-clay-500 font-[450]">
                {data?.current_skills_json?.skills
                  ? 'Review your parsed skills and set a career goal'
                  : 'We\'ll analyze your skills to build your personalized pathway'
                }
              </p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="w-10 h-10 rounded-full border-2 border-clay-300 border-t-rust-500 animate-spin" />
              <p className="text-sm font-medium text-clay-500">Loading your saved profile...</p>
            </div>
          ) : !data || !data.current_skills_json || !data.current_skills_json.skills ? (
            <>
              <div
                {...getRootProps()}
                className={`
                  relative p-10 border-2 border-dashed rounded-xl text-center cursor-pointer transition-all duration-200 group
                  ${isDragActive
                    ? 'border-rust-500 bg-rust-50 scale-[1.01]'
                    : 'border-clay-300 hover:border-rust-400 hover:bg-rust-50/50'
                  }
                `}
              >
                <input {...getInputProps()} aria-label="Upload resume file" />

                <div className="flex flex-col items-center gap-4">
                  <div className={`p-3 rounded-xl transition-colors ${
                    isDragActive
                      ? 'bg-rust-100'
                      : 'bg-clay-50 group-hover:bg-rust-50'
                  }`}>
                    {file ? (
                      <FileText className="w-8 h-8 text-rust-500" />
                    ) : (
                      <UploadCloud className={`w-8 h-8 ${isDragActive ? 'text-rust-500' : 'text-clay-400'}`} />
                    )}
                  </div>

                  <div>
                    {file ? (
                      <p className="text-sm font-medium text-ink flex items-center gap-2">
                        <FileText className="w-4 h-4 text-rust-500" />
                        {file.name}
                      </p>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-clay-700">
                          {isDragActive ? 'Drop your resume here' : 'Drag & drop your resume, or click to browse'}
                        </p>
                        <p className="text-xs text-clay-400 mt-1">PDF or DOCX &mdash; Max 5MB</p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  role="alert"
                  className="mt-4 p-3 bg-rust-50 border border-rust-200 rounded-lg text-rust-700 text-sm flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </motion.div>
              )}

              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleUpload}
                  disabled={!file || isUploading}
                  className={`
                    flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-sm text-white transition-all
                    ${!file || isUploading
                      ? 'bg-clay-300 cursor-not-allowed'
                      : 'bg-gradient-to-br from-rust-500 to-rust-700 hover:from-rust-600 hover:to-rust-800 shadow-md shadow-rust-500/20 active:scale-[0.97]'
                    }
                  `}
                >
                  {isUploading ? (
                    <>
                      <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      {loadingSteps[currentStep]}
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-4 h-4" />
                      Analyze Profile
                    </>
                  )}
                </button>
              </div>

              {/* Segmented Progress Bar */}
              {isUploading && (
                <div className="flex flex-col gap-2 w-full mt-4">
                  <div className="flex justify-between items-center text-xs font-medium text-clay-500">
                    <span>Step {currentStep + 1} of {loadingSteps.length}</span>
                    <span>{Math.round(((currentStep + 1) / loadingSteps.length) * 100)}%</span>
                  </div>
                  <div className="flex gap-1 h-1.5 w-full">
                    {loadingSteps.map((_, index) => (
                      <div
                        key={index}
                        className={`flex-1 rounded-full transition-all duration-500 ease-in-out ${
                          index <= currentStep ? 'bg-rust-500' : 'bg-clay-200'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              <div className="flex items-center gap-4 mb-6 p-4 bg-forest-50 rounded-xl border border-forest-200">
                <div className="w-10 h-10 rounded-full bg-forest-100 flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="w-5 h-5 text-forest-500" />
                </div>
                <div>
                  <h3 className="font-heading font-bold text-forest-800">Profile Analyzed</h3>
                  <p className="text-xs text-forest-600">{data.current_skills_json.skills.length} skills detected from your resume</p>
                </div>
              </div>

              <div className="mb-5">
                <h4 className="text-xs font-semibold text-clay-500 uppercase tracking-[0.1em] mb-3">Extracted Skills</h4>
                <div className="flex flex-wrap gap-2">
                  {data.current_skills_json.skills.map((skillObj: any, index: number) => {
                    const confidence = Math.round((skillObj.confidence || 0.95) * 100);
                    return (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.2, delay: index * 0.03 }}
                        className="group relative"
                      >
                        <div className="px-3 py-1.5 bg-white border border-clay-200 rounded-full text-sm font-medium text-ink shadow-sm flex items-center gap-2 hover:border-rust-300 transition-colors">
                          <span>{skillObj.name}</span>
                          <span className="w-1 h-1 rounded-full bg-rust-400" />
                          <span className="text-xs text-clay-400 font-normal">{confidence}%</span>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>

              <SkillRadar data={data} />

              <TargetSelectionForm
                onPathFound={onPathFound}
                startSkill={topSkill ?? 'Foundation'}
                resumeSkills={data.current_skills_json?.normalized_skills || []}
              />

              <div className="mt-5 text-center">
                <button
                  onClick={() => setData(null)}
                  className="text-sm text-clay-400 hover:text-rust-500 transition-colors font-medium"
                >
                  Upload a different resume
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default ResumeUpload;
