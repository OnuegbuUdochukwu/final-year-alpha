/**
 * ResumeUpload.tsx — Drag-and-drop resume uploader.
 *
 * Wired to the real /api/parse-resume endpoint on the API Gateway.
 * The JWT is injected automatically by the Axios client interceptor.
 */

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud, FileText, CheckCircle, Loader2 } from 'lucide-react';
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
  const [parsedSkills, setParsedSkills] = useState<ParsedSkill[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setError(null);
      setParsedSkills(null);
    }
  }, []);

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

      // The NLP service returns: { skills: [{ name, confidence }] }
      const skills: ParsedSkill[] = response.data.skills ?? [];

      // Sort by confidence descending so the top skill is always first
      skills.sort((a, b) => b.confidence - a.confidence);

      setParsedSkills(skills);
      onSkillsParsed(skills);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(detail || 'Failed to parse resume. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">
          Upload Your Resume
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          We'll analyze your current skills to build your personalized career pathway.
        </p>
      </div>

      {!parsedSkills ? (
        <>
          <div
            {...getRootProps()}
            className={`
              relative p-10 border-2 border-dashed rounded-xl text-center cursor-pointer transition-all duration-200
              ${isDragActive
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }
            `}
          >
            <input {...getInputProps()} />

            <div className="flex flex-col items-center justify-center space-y-4">
              {file ? (
                <FileText className="w-12 h-12 text-blue-500" />
              ) : (
                <UploadCloud className="w-12 h-12 text-gray-400" />
              )}

              <div className="space-y-1">
                {file ? (
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    {file.name}
                  </p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                      <span className="text-blue-500 hover:text-blue-600">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      PDF or DOCX (MAX. 5MB)
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm rounded-lg border border-red-100 dark:border-red-800">
              {error}
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <button
              onClick={handleUpload}
              disabled={!file || isUploading}
              className={`
                flex items-center space-x-2 px-6 py-2.5 rounded-lg font-medium text-white transition-all
                ${!file || isUploading
                  ? 'bg-blue-300 dark:bg-blue-800/50 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 active:transform active:scale-95 shadow-md shadow-blue-500/20'
                }
              `}
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Parsing…</span>
                </>
              ) : (
                <span>Analyze Profile</span>
              )}
            </button>
          </div>
        </>
      ) : (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-center space-x-3 mb-6">
            <CheckCircle className="w-8 h-8 text-green-500" />
            <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">
              Profile Analyzed Successfully
            </h3>
          </div>

          <div className="bg-gray-50 dark:bg-gray-900/50 p-6 rounded-xl border border-gray-100 dark:border-gray-800">
            <h4 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-4 uppercase tracking-wider">
              Extracted Skills
            </h4>
            <div className="flex flex-wrap gap-2">
              {parsedSkills.map((skill, index) => (
                <div
                  key={index}
                  className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full text-sm font-medium text-gray-700 dark:text-gray-200 shadow-sm flex items-center space-x-2"
                >
                  <span>{skill.name}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                  <span className="text-xs text-gray-400">{(skill.confidence * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>

          <SkillRadar skills={parsedSkills} />

          {/* Pass the top skill as start node for path generation */}
          <TargetSelectionForm onPathFound={onPathFound} startSkill={topSkill ?? 'Foundation'} />

          <div className="mt-8 flex justify-center">
            <button
              onClick={() => setParsedSkills(null)}
              className="text-sm text-gray-500 hover:text-blue-500 transition-colors underline"
            >
              Upload a different resume
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResumeUpload;
