/**
 * ResumeUpload.tsx — Drag-and-drop resume uploader.
 *
 * Wired to the real /api/parse-resume endpoint on the API Gateway.
 * The JWT is injected automatically by the Axios client interceptor.
 */

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
  topSkill: string | null;  // passed back in so TargetSelectionForm can use the real start node
}

const ResumeUpload: React.FC<ResumeUploadProps> = ({ onPathFound, onSkillsParsed, topSkill }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

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
      // Build multipart form-data — the NLP service expects the field named "file"
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
      transition={{ duration: 0.4 }}
      className="w-full max-w-2xl mx-auto"
    >
      <div className="p-6 bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 shadow-lg shadow-brand-500/20 mb-4">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-1.5">
            {data?.current_skills_json?.skills ? 'Your Skill Profile' : 'Upload Your Resume'}
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm max-w-md mx-auto">
            We'll analyze your current skills to build your personalized career pathway.
          </p>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-2 border-brand-200 dark:border-brand-800 border-t-brand-500 animate-spin" />
            </div>
            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Loading your saved profile...</p>
          </div>
        ) : !data || !data.current_skills_json || !data.current_skills_json.skills ? (
          <>
            <div
              {...getRootProps()}
              className={`
                relative p-10 border-2 border-dashed rounded-xl text-center cursor-pointer transition-all duration-200 group
                ${isDragActive
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20 scale-[1.01]'
                  : 'border-gray-300 dark:border-gray-600 hover:border-brand-400 hover:bg-gray-50/50 dark:hover:bg-gray-800/50'
                }
              `}
            >
              <input {...getInputProps()} aria-label="Upload resume file" />

              <div className="flex flex-col items-center justify-center space-y-4">
                <div className={`p-3 rounded-xl transition-colors ${isDragActive ? 'bg-brand-100 dark:bg-brand-900/30' : 'bg-gray-50 dark:bg-gray-800 group-hover:bg-brand-50 dark:group-hover:bg-brand-900/10'}`}>
                  {file ? (
                    <FileText className="w-8 h-8 text-brand-500" />
                  ) : (
                    <UploadCloud className={`w-8 h-8 ${isDragActive ? 'text-brand-500' : 'text-gray-400'}`} />
                  )}
                </div>

                <div>
                  {file ? (
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-brand-500" />
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{file.name}</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                        {isDragActive ? 'Drop your resume here' : 'Drag & drop your resume, or click to browse'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        PDF or DOCX &mdash; Max 5MB
                      </p>
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
                className="mt-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm rounded-lg border border-red-100 dark:border-red-800 flex items-center gap-2"
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
                  flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium text-white transition-all
                  ${!file || isUploading
                    ? 'bg-brand-300 dark:bg-brand-800/50 cursor-not-allowed'
                    : 'bg-brand-600 hover:bg-brand-700 active:scale-[0.97] shadow-md shadow-brand-500/20 hover:shadow-lg hover:shadow-brand-500/25'
                  }
                `}
              >
                {isUploading ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    <span>Parsing&hellip;</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4" />
                    Analyze Profile
                  </>
                )}
              </button>
            </div>
          </>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            <div className="flex items-center justify-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-900/30 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-emerald-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">
                  Profile Analyzed Successfully
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{data.current_skills_json.skills.length} skills detected</p>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800/50 p-5 rounded-xl border border-gray-100 dark:border-gray-800">
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wider">
                Extracted Skills
              </h4>
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
                      <div className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full text-sm font-medium text-gray-700 dark:text-gray-200 shadow-sm flex items-center gap-2 hover:border-brand-300 dark:hover:border-brand-700 transition-colors">
                        <span>{skillObj.name}</span>
                        <div className="w-1 h-1 rounded-full bg-brand-400" />
                        <span className="text-xs text-gray-400 font-normal">{confidence}%</span>
                      </div>
                      <div className="absolute -bottom-1 left-3 right-3 h-0.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-brand-400 to-violet-500 transition-all"
                          style={{ width: `${confidence}%` }}
                        />
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

            <div className="mt-6 flex justify-center">
              <button
                onClick={() => setData(null)}
                className="text-sm text-gray-400 hover:text-brand-500 transition-colors"
              >
                Upload a different resume
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

export default ResumeUpload;
