import React from 'react';

const Loader: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center my-12 text-center">
      <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-indigo-600 dark:border-indigo-400"></div>
      <p className="mt-4 text-lg font-semibold text-gray-700 dark:text-gray-300">Analyzing Document...</p>
      <p className="text-sm text-gray-500 dark:text-gray-400">Gemini 3 is creating your dynamic schedule. This may take a moment.</p>
    </div>
  );
};

export default Loader;