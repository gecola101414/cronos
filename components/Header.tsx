
import React, { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale/it';

interface HeaderProps {
  userEmail: string;
  remainingDays: number | null;
  serverDate: Date | null;
  onImport: () => void;
  onExport: () => void;
  onSaveToDrive?: () => void;
  onShare: () => void;
  onExportPdf?: () => void;
  isProjectLoaded: boolean;
  isAdmin: boolean;
  onGenerateLicense: () => void;
  isViewOnly: boolean;
  isShareMode: boolean;
  isDemoMode: boolean;
  isSessionExpired: boolean;
  sessionSecondsRemaining: number;
  projectName?: string;
  onUpdateProjectName?: (name: string) => void;
  lastSavedTime: string | null;
}

const NavButton: React.FC<{
    onClick?: () => void;
    disabled?: boolean;
    isDanger?: boolean;
    children: React.ReactNode;
    title?: string;
}> = ({ onClick, disabled, isDanger, children, title }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={`flex items-center space-x-1.5 px-3 py-2 text-sm rounded-md transition-colors
      ${
        isDanger 
          ? 'font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
          : 'font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}
      ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
    `}
  >
    {children}
  </button>
);


const Header: React.FC<HeaderProps> = ({ 
    userEmail, 
    remainingDays, 
    serverDate,
    onImport,
    onExport,
    onSaveToDrive,
    onShare,
    isProjectLoaded,
    isAdmin,
    onGenerateLicense,
    isViewOnly,
    isShareMode,
    isDemoMode,
    isSessionExpired,
    sessionSecondsRemaining,
    projectName,
    onUpdateProjectName,
    lastSavedTime,
    onExportPdf
}) => {
  const [tempProjectName, setTempProjectName] = useState(projectName || "Nuovo Progetto");
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (projectName) setTempProjectName(projectName);
  }, [projectName]);

  const handleNameBlur = () => {
      if (onUpdateProjectName && tempProjectName.trim() !== "") {
          onUpdateProjectName(tempProjectName);
      } else {
          setTempProjectName(projectName || "Nuovo Progetto");
      }
  };

  const handlePenClick = () => {
      nameInputRef.current?.focus();
  };

  const getLicenseText = () => {
    if (isDemoMode) return 'Modalità Demo';
    if (remainingDays === null) return null;
    if (remainingDays === 9999) return 'Licenza a vita';
    if (remainingDays > 0) return `${remainingDays} giorni rimanenti`;
    return 'Licenza scaduta';
  };

  const formattedTime = new Date(sessionSecondsRemaining * 1000).toISOString().substr(14, 5);

  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-30 no-print border-b border-gray-200 dark:border-gray-700 h-20 flex-shrink-0">
      <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8 flex justify-between items-center">
        <div className="flex items-center space-x-4 flex-wrap">
            <div className="mr-4 flex flex-col justify-center group relative">
                <div className="flex items-center">
                    {isProjectLoaded && !isViewOnly ? (
                        <>
                        <input 
                            ref={nameInputRef}
                            type="text" 
                            value={tempProjectName}
                            onChange={(e) => setTempProjectName(e.target.value)}
                            onBlur={handleNameBlur}
                            className="font-bold text-lg text-gray-800 dark:text-gray-100 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-indigo-500 focus:outline-none transition-colors w-64 truncate"
                            title="Clicca per rinominare il progetto"
                        />
                        <button 
                            onClick={handlePenClick}
                            className="ml-2 text-gray-400 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Modifica nome progetto"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                        </button>
                        </>
                    ) : (
                        <h1 className="font-bold text-lg text-gray-800 dark:text-gray-100 truncate w-64" title={tempProjectName}>{tempProjectName}</h1>
                    )}
                </div>
                {lastSavedTime && (
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 italic">
                        Ultimo salvataggio: {format(new Date(lastSavedTime), 'dd/MM/yyyy HH:mm')}
                    </p>
                )}
            </div>

            <div className="h-8 w-px bg-gray-200 dark:bg-gray-700 mx-2 hidden sm:block"></div>

            {!isViewOnly && (
                <NavButton
                  onClick={onImport}
                  disabled={isDemoMode}
                  title={isDemoMode ? "L'importazione non è disponibile in modalità demo" : "Importa file di progetto (.json)"}
                >
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    <span className="hidden md:inline">Importa</span>
                </NavButton>
            )}
            {onExportPdf && (
                <NavButton onClick={onExportPdf} disabled={!isProjectLoaded} title="Esporta il progetto corrente in formato PDF">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    <span className="hidden md:inline">PDF</span>
                </NavButton>
            )}
            {onExportPdf && (
                <NavButton onClick={onExportPdf} disabled={!isProjectLoaded} title="Esporta il progetto corrente in formato PDF">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    <span className="hidden md:inline">PDF</span>
                </NavButton>
            )}
            <NavButton onClick={onExport} disabled={!isProjectLoaded} title="Esporta il progetto corrente in formato JSON">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                <span className="hidden md:inline">Salva con Nome</span>
            </NavButton>
            {onSaveToDrive && !isViewOnly && (
                <NavButton onClick={onSaveToDrive} disabled={!isProjectLoaded || isDemoMode} title="Salva su Google Drive">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12.01 1.985C8.825 1.985 5.86 3.165 3.58 5.115L6.69 10.515C7.94 8.795 9.87 7.745 12.01 7.745C15.53 7.745 18.57 9.855 19.95 12.925L23.06 7.525C20.91 4.195 16.74 1.985 12.01 1.985ZM9.49 11.995L6.37 17.395C7.88 18.995 9.9 19.995 12.14 19.995C15.35 19.995 18.17 18.215 19.7 15.545L16.59 10.145C15.75 11.235 14.07 11.995 12.14 11.995C11.16 11.995 10.26 11.665 9.49 11.995ZM4.91 6.895L1.8 12.295C2.33 15.635 4.5 18.395 7.42 19.995L10.53 14.595C7.8 13.995 5.76 11.755 4.91 6.895Z" />
                    </svg>
                    <span className="hidden md:inline">Drive</span>
                </NavButton>
            )}
             <NavButton onClick={onShare} disabled={!isProjectLoaded || isViewOnly} title="Genera un link di condivisione in sola lettura">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12s-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.368a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" /></svg>
                <span className="hidden md:inline">Condividi</span>
            </NavButton>
            {isAdmin && !isViewOnly && (
                <NavButton onClick={onGenerateLicense} title="Genera una nuova chiave di licenza">
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 8a6 6 0 11-12 0 6 6 0 0112 0zM7 8a1 1 0 11-2 0 1 1 0 012 0zm5 0a1 1 0 11-2 0 1 1 0 012 0zm5 0a1 1 0 11-2 0 1 1 0 012 0z" clipRule="evenodd" />
                    </svg>
                    <span className="hidden md:inline">Licenza</span>
                </NavButton>
            )}
        </div>

        {userEmail && (
          <div className="text-right flex items-center space-x-4">
            {!isAdmin && !isShareMode && (
                 <div className={`text-center rounded-md p-1 transition-colors ${isSessionExpired || sessionSecondsRemaining <= 10 ? 'bg-red-100 dark:bg-red-900/40' : 'bg-gray-100 dark:bg-gray-700/40'}`}>
                    <p className={`text-sm font-bold tracking-wider ${isSessionExpired || sessionSecondsRemaining <= 10 ? 'text-red-600 dark:text-red-400 animate-pulse' : 'text-gray-700 dark:text-gray-200'}`} aria-live="polite" aria-atomic="true">
                        {isSessionExpired ? 'Sessione Scaduta' : `Sessione: ${formattedTime}`}
                    </p>
                 </div>
            )}
             <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate" title={userEmail}>
                {userEmail}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold">
                {getLicenseText()}
                </p>
                {serverDate && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {format(serverDate, 'dd MMMM yyyy HH:mm', { locale: it })}
                </p>
                )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
