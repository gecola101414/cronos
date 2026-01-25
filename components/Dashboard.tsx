import React from 'react';
import { Risk } from '../types';
import { View } from '../App';

interface DashboardProps {
  projectSummary: {
    grandTotal: number;
    earnedValue: number;
    overallProgress: number;
    totalCosts: number;
  } | null;
  risks: Risk[] | null;
  onViewChange: (view: View) => void;
  documentCount: number;
  onImport: () => void;
  isProjectLoaded: boolean;
  isDemoMode: boolean;
}

const currencyFormatter = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

const StatCard: React.FC<{ title: string; value: string; icon: React.ReactNode; color: string; }> = ({ title, value, icon, color }) => (
    <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-md flex items-center space-x-4">
        <div className={`p-3 rounded-full ${color}`}>
            {icon}
        </div>
        <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{title}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
        </div>
    </div>
);

const ProgressDonut: React.FC<{ progress: number }> = ({ progress }) => {
    const sqSize = 120;
    const strokeWidth = 10;
    const radius = (sqSize - strokeWidth) / 2;
    const viewBox = `0 0 ${sqSize} ${sqSize}`;
    const dashArray = radius * Math.PI * 2;
    const dashOffset = dashArray - dashArray * progress / 100;

    return (
        <div className="relative flex items-center justify-center" style={{ width: sqSize, height: sqSize }}>
            <svg width={sqSize} height={sqSize} viewBox={viewBox}>
                <circle
                    className="text-gray-200 dark:text-gray-700"
                    cx={sqSize / 2}
                    cy={sqSize / 2}
                    r={radius}
                    strokeWidth={`${strokeWidth}px`}
                    stroke="currentColor"
                    fill="none"
                />
                <circle
                    className="text-indigo-600 dark:text-indigo-400"
                    cx={sqSize / 2}
                    cy={sqSize / 2}
                    r={radius}
                    strokeWidth={`${strokeWidth}px`}
                    stroke="currentColor"
                    fill="none"
                    strokeLinecap="round"
                    style={{
                        strokeDasharray: dashArray,
                        strokeDashoffset: dashOffset,
                        transition: 'stroke-dashoffset 0.5s ease-out'
                    }}
                    transform={`rotate(-90 ${sqSize / 2} ${sqSize / 2})`}
                />
            </svg>
            <span className="absolute text-2xl font-bold text-indigo-700 dark:text-indigo-300">
                {progress.toFixed(1)}%
            </span>
        </div>
    );
};


const QuickActionButton: React.FC<{ title: string; description: string; icon: React.ReactNode; onClick: () => void; }> = ({ title, description, icon, onClick }) => (
    <button onClick={onClick} className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-lg text-left hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors flex items-start space-x-4">
        <div className="flex-shrink-0 text-indigo-600 dark:text-indigo-400 mt-1">{icon}</div>
        <div>
            <p className="font-semibold text-gray-800 dark:text-gray-100">{title}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
        </div>
    </button>
);

const WelcomeScreen: React.FC<{ onImport: () => void; isDemoMode: boolean; }> = ({ onImport, isDemoMode }) => (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-20 w-20 text-indigo-300 dark:text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12.083l-2.25 2.25m0 0l-2.25-2.25m2.25 2.25V13.5A2.25 2.25 0 018.25 11.25h-1.5a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-1.5a2.25 2.25 0 00-2.25 2.25v1.5A2.25 2.25 0 0017.25 10.5h1.5a2.25 2.25 0 002.25-2.25v-1.5m-3.75 4.5V13.5A2.25 2.25 0 0113.5 11.25h1.5a2.25 2.25 0 012.25 2.25v1.5" />
        </svg>
        <h3 className="mt-4 text-2xl font-bold text-gray-800 dark:text-gray-200">Benvenuto in Chronos AI</h3>
        <p className="mt-2 max-w-lg mx-auto text-gray-600 dark:text-gray-400">
            Il tuo assistente intelligente per la pianificazione di progetti. Per iniziare, importa un computo metrico o un file di progetto.
        </p>
        <button
            onClick={onImport}
            disabled={isDemoMode}
            title={isDemoMode ? "L'importazione non è disponibile in modalità demo" : "Importa file"}
            className="mt-6 flex items-center space-x-2 px-6 py-3 text-sm font-medium text-white bg-indigo-600 rounded-lg shadow-md hover:bg-indigo-700 transition-colors disabled:bg-indigo-400 disabled:cursor-not-allowed"
        >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            <span>Importa Progetto</span>
        </button>
    </div>
);


const Dashboard: React.FC<DashboardProps> = ({ projectSummary, onViewChange, documentCount, onImport, isProjectLoaded, isDemoMode }) => {
  
  if (!isProjectLoaded) {
    return <WelcomeScreen onImport={onImport} isDemoMode={isDemoMode} />;
  }
  
  const profitLoss = (projectSummary?.earnedValue || 0) - (projectSummary?.totalCosts || 0);

  return (
    <div className="space-y-6 p-4 md:p-0">
        {/* KPI Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard title="SAL Reale" value={currencyFormatter.format(projectSummary?.earnedValue || 0)} icon={<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.201m5.94 2.201l-2.201 5.94" /></svg>} color="bg-green-100 dark:bg-green-900/40 text-green-600" />
            <StatCard title="Valore Totale" value={currencyFormatter.format(projectSummary?.grandTotal || 0)} icon={<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9A2.25 2.25 0 0018.75 6.75h-1.5a2.25 2.25 0 00-2.25 2.25v3.518c.24.08.45.19.64.314a1.5 1.5 0 01.86 1.354v1.13c0 .597-.333 1.11-.833 1.354-.15.072-.31.13-.48.175V18a2.25 2.25 0 002.25 2.25h1.5A2.25 2.25 0 0021 18v-6zm-9-3.75h.008v.008H12V8.25z" /></svg>} color="bg-blue-100 dark:bg-blue-900/40 text-blue-600" />
            <StatCard title="Costi Totali" value={currencyFormatter.format(projectSummary?.totalCosts || 0)} icon={<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} color="bg-red-100 dark:bg-red-900/40 text-red-600" />
            <StatCard title="Profitto/Perdita" value={currencyFormatter.format(profitLoss)} icon={<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>} color={profitLoss >= 0 ? "bg-purple-100 dark:bg-purple-900/40 text-purple-600" : "bg-red-100 dark:bg-red-900/40 text-red-600"} />
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
             {/* Progress & Quick Actions */}
             <div className="lg:col-span-2 bg-white dark:bg-gray-800 p-5 rounded-xl shadow-md">
                 <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Panoramica e Azioni Rapide</h3>
                 <div className="flex flex-col md:flex-row items-center gap-6">
                    <div className="flex-shrink-0">
                        <p className="text-center text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Avanzamento Progetto</p>
                        <ProgressDonut progress={projectSummary?.overallProgress || 0} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
                        <QuickActionButton title="Vai alla Timeline" description="Visualizza e modifica il cronoprogramma." icon={<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>} onClick={() => onViewChange('timeline')} />
                        <QuickActionButton title="Aggiungi Spesa" description="Registra un nuovo costo di progetto." icon={<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} onClick={() => onViewChange('costs')} />
                        <QuickActionButton title="Genera Brogliaccio" description="Crea il report delle misurazioni." icon={<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>} onClick={() => onViewChange('measurements')} />
                        <QuickActionButton title="Visualizza Computo" description="Esamina i dettagli di tutti i documenti." icon={<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>} onClick={() => onViewChange('summary')} />
                    </div>
                 </div>
             </div>
             
             <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-md">
                <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-4">Informazioni Progetto</h3>
                <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">Documenti Caricati:</span>
                        <span className="font-semibold text-gray-800 dark:text-gray-100">{documentCount}</span>
                    </div>
                     <div className="flex justify-between">
                        <span className="text-gray-500 dark:text-gray-400">WBS Totali:</span>
                        <span className="font-semibold text-gray-800 dark:text-gray-100">{projectSummary ? documentCount * 10 : 0}</span>
                    </div>
                </div>
             </div>
        </div>
    </div>
  );
};

export default Dashboard;
