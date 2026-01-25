import React from 'react';
import { Risk } from '../types';

interface RiskAnalysisPanelProps {
  risks: Risk[] | null;
  isLoading: boolean;
  onClose: () => void;
}

const getRiskColor = (level: 'Alto' | 'Medio' | 'Basso'): string => {
  switch (level) {
    case 'Alto':
      return 'border-red-500 bg-red-50 dark:bg-red-900/20';
    case 'Medio':
      return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20';
    case 'Basso':
      return 'border-green-500 bg-green-50 dark:bg-green-900/20';
    default:
      return 'border-gray-300 bg-gray-50 dark:bg-gray-700';
  }
};

const RiskTag: React.FC<{ label: string, value: string, level: 'Alto' | 'Medio' | 'Basso' }> = ({ label, value, level }) => {
    const colorClasses: Record<string, string> = {
        'Alto': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
        'Medio': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
        'Basso': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    }
    return (
        <div className="flex items-center">
            <span className="font-semibold text-gray-600 dark:text-gray-400 mr-2">{label}:</span>
            <span className={`px-2 py-0.5 text-xs font-bold rounded-full ${colorClasses[level]}`}>{value}</span>
        </div>
    );
};


const RiskAnalysisPanel: React.FC<RiskAnalysisPanelProps> = ({ risks, isLoading, onClose }) => {
  if (!risks && !isLoading) {
    return null; // Don't render anything if analysis hasn't been run
  }

  return (
    <div className="my-8 bg-white dark:bg-gray-800 shadow-xl rounded-2xl overflow-hidden animate-fade-in">
      <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center space-x-3">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Valutazione dei Rischi (AI)</h3>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-6">
        {isLoading && (
          <div className="flex flex-col items-center justify-center my-6 text-center">
            <div className="w-12 h-12 border-4 border-dashed rounded-full animate-spin border-yellow-500"></div>
            <p className="mt-4 text-md font-semibold text-gray-700 dark:text-gray-300">Valutazione dei rischi potenziali...</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">Gemini sta analizzando i dati del tuo progetto.</p>
          </div>
        )}

        {!isLoading && risks && (
          <>
            {risks.length === 0 ? (
               <div className="text-center py-6">
                <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h4 className="mt-2 text-lg font-semibold text-gray-800 dark:text-gray-200">Nessun Rischio Rilevante Trovato</h4>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">L'analisi AI non ha identificato rischi ad alta priorità basandosi sul piano di progetto attuale. Ottimo lavoro!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {risks.map((r, index) => (
                  <div key={index} className={`p-4 border-l-4 rounded-r-lg ${getRiskColor(r.impact)}`}>
                    <p className="font-bold text-gray-800 dark:text-gray-100">{r.risk}</p>
                    <div className="flex space-x-4 my-2 text-sm">
                       <RiskTag label="Impatto" value={r.impact} level={r.impact} />
                       <RiskTag label="Probabilità" value={r.likelihood} level={r.likelihood} />
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
                        <span className="font-semibold">Suggerimento:</span> {r.suggestion}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default RiskAnalysisPanel;