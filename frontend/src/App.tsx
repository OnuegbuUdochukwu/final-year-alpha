import ResumeUpload from './components/ResumeUpload';
import './App.css';

function App() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full flex-1 flex flex-col items-center justify-center">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-4">
            AI Career Pathfinder
          </h1>
          <p className="max-w-xl mx-auto text-lg text-gray-500 dark:text-gray-400">
            Upload your resume to instantly discover your skill gaps and generate a personalized learning roadmap.
          </p>
        </div>

        {/* Main Component */}
        <ResumeUpload />
      </div>
    </div>
  );
}

export default App;
