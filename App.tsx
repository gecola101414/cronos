
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { fetchServerDateHeader } from './services/licenseService';
import { saveToGoogleDrive } from './services/googleDriveService';
import { WorkGroup, ProjectDocument, WorkItem, Risk, Expense, Dependency, Team, Worker, SavedProject, ContractConfig, SalEntry } from './types';
import GanttChart from './components/GanttChart';
import Loader from './components/Loader';
import Header from './components/Header';
import ProjectSummary from './components/ProjectSummary';
import ComputoDetailView from './components/ComputoDetailView';
import { format, addDays, differenceInDays, parseISO, parse } from 'date-fns';
import { it } from 'date-fns/locale/it';
import Login from './components/Registration';
import ShareModal from './components/ShareModal';
import LicenseGeneratorModal from './components/LicenseGeneratorModal';
import TaskModal from './components/TaskModal';
import MeasurementsView from './components/MeasurementsView';
import CostsView from './components/CostsView';
import { recalculateSchedule } from './services/scheduleService';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import TeamManagementView from './components/TeamManagementView';
import ReportsView from './components/ReportsView';
import PortfolioView from './components/PortfolioView';
import UserManualView from './components/UserManualView';
import AccountingView from './components/AccountingView';

export type View = 'dashboard' | 'timeline' | 'summary' | 'measurements' | 'sal-report' | 'costs' | 'teams' | 'reports' | 'help' | 'accounting';

const colorPalette = [
  '#4A90E2', '#50E3C2', '#F5A623', '#F8E71C', '#D0021B',
  '#9013FE', '#B8E986', '#7ED321', '#BD10E0', '#417505',
  '#E67E22', '#1ABC9C', '#3498DB', '#9B59B6', '#E74C3C',
];

function isNewProjectFile(data: any): data is { id?: string, projectDocuments: ProjectDocument[], expenses: Expense[], projectName?: string, teams?: Team[], workers?: Worker[], lastSavedTime?: string, contractConfig?: ContractConfig, sals?: SalEntry[] } {
    return data && typeof data === 'object' && 'projectDocuments' in data && Array.isArray(data.projectDocuments);
}

/**
 * Checks if the JSON is a raw list of groups like the user provided.
 */
function isRawJsonComputo(data: any): data is any[] {
    return Array.isArray(data) && data.length > 0 && data[0].groupName !== undefined;
}

const sanitizeDocuments = (documents: ProjectDocument[]): ProjectDocument[] => {
  return documents.map((doc, index) => ({
    ...doc,
    isVisible: doc.isVisible ?? true, 
    isFrozen: doc.isFrozen ?? false, 
    isLocked: doc.isLocked ?? false, 
    dependencies: doc.dependencies ?? [],
    salMarkers: index === 0 ? (doc.salMarkers ?? []) : undefined,
    workGroups: doc.workGroups.map(wg => ({
      ...wg,
      progress: wg.progress ?? 0,
      isSecurityCost: wg.isSecurityCost ?? false,
      accountingType: wg.accountingType ?? 'measure',
      items: wg.items.map(item => ({
        ...item,
        measurements: item.measurements?.map(m => ({
            ...m,
            id: m.id || crypto.randomUUID() 
        })) ?? [],
        annotations: item.annotations || [],
        variations: item.variations || [],
        laborRate: item.laborRate || 0,
        laborValue: item.laborValue || 0
      }))
    }))
  }));
};

const sanitizeExpenses = (expenses: any[]): Expense[] => {
  return expenses.map(e => ({
    ...e,
    insertionDate: e.insertionDate || new Date(e.date).toISOString()
  }));
};

const App: React.FC = () => {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [remainingDays, setRemainingDays] = useState<number | null>(null);
  const [serverDate, setServerDate] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true); 
  const [error, setError] = useState<string | null>(null);
  const [sessionSecondsRemaining, setSessionSecondsRemaining] = useState<number>(3600);
  const [isSessionExpired, setIsSessionExpired] = useState<boolean>(false);
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projectDocuments, setProjectDocuments] = useState<ProjectDocument[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [projectName, setProjectName] = useState<string>("Nuovo Cantiere");
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [contractConfig, setContractConfig] = useState<ContractConfig | undefined>(undefined);
  const [sals, setSals] = useState<SalEntry[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [isShareMode, setIsShareMode] = useState<boolean>(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isGeneratorModalOpen, setIsGeneratorModalOpen] = useState(false);
  const [shareableLink, setShareableLink] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedTask, setSelectedTask] = useState<WorkGroup | null>(null);
  const [isCurrentTaskLocked, setIsCurrentTaskLocked] = useState<boolean>(false);
  const [isEconomicViewVisible, setIsEconomicViewVisible] = useState<boolean>(false);
  
  useEffect(() => {
      const loadedProjects = localStorage.getItem('chronos_projects');
      if (loadedProjects) { try { const parsed = JSON.parse(loadedProjects); if (Array.isArray(parsed)) setSavedProjects(parsed); } catch (e) { console.error(e); } }
      const loadedResources = localStorage.getItem('chronos_global_resources');
      if (loadedResources) { try { const parsed = JSON.parse(loadedResources); if (parsed.teams) setTeams(parsed.teams); if (parsed.workers) setWorkers(parsed.workers); } catch (e) { console.error(e); } }
  }, []);

  useEffect(() => { if (teams.length > 0 || workers.length > 0) { localStorage.setItem('chronos_global_resources', JSON.stringify({ teams, workers })); } }, [teams, workers]);

  const saveCurrentProject = useCallback(() => {
      if (!currentProjectId || currentProjectId === 'shared-view' || isDemoMode) return;
      const existingProject = savedProjects.find(p => p.id === currentProjectId);
      const projectData: SavedProject = { id: currentProjectId, name: projectName, location: existingProject?.location, status: existingProject?.status || 'active', lastModified: new Date().toISOString(), contractConfig, data: { projectDocuments, expenses, teams, workers, sals } };
      setSavedProjects(prev => { const filtered = prev.filter(p => p.id !== currentProjectId); const updated = [...filtered, projectData].sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()); localStorage.setItem('chronos_projects', JSON.stringify(updated)); return updated; });
  }, [currentProjectId, projectName, projectDocuments, expenses, teams, workers, savedProjects, contractConfig, sals, isDemoMode]);

  const handleUpdateSavedProject = useCallback((projectId: string, name: string, location: string) => { setSavedProjects(prev => { const updated = prev.map(p => p.id === projectId ? { ...p, name, location, lastModified: new Date().toISOString() } : p); localStorage.setItem('chronos_projects', JSON.stringify(updated)); return updated; }); }, []);

  useEffect(() => { if (currentProjectId && !isShareMode && !isDemoMode && !isSessionExpired) { const timer = setTimeout(() => saveCurrentProject(), 2000); return () => clearTimeout(timer); } }, [projectDocuments, expenses, projectName, currentProjectId, isShareMode, isDemoMode, isSessionExpired, saveCurrentProject, teams, workers, contractConfig, sals]);

  const calculateRemainingDays = useCallback((activationDateStr: string | null, validityDaysStr: string | null, now: Date) => { if (!activationDateStr || !validityDaysStr) { setRemainingDays(null); return; } const validityDays = parseInt(validityDaysStr, 10); if (validityDays === 9999) { setRemainingDays(9999); return; } const expiryDate = addDays(new Date(activationDateStr), validityDays); setRemainingDays(Math.max(0, differenceInDays(expiryDate, now) + 1)); }, []);
  const handleReset = useCallback(() => { localStorage.removeItem('isChronosAILoggedIn'); localStorage.removeItem('isChronosAIAdmin'); localStorage.removeItem('activationDate'); localStorage.removeItem('licenseValidity'); localStorage.removeItem('chronosAIUserEmail'); window.location.href = window.location.origin + window.location.pathname; }, []);

  useEffect(() => {
    const checkActivation = async () => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('mode') === 'view') {
            const data = params.get('data');
            if (data) {
                try {
                    const parsedData = JSON.parse(atob(data));
                    if (isNewProjectFile(parsedData)) {
                       setProjectDocuments(sanitizeDocuments(parsedData.projectDocuments));
                       setExpenses(sanitizeExpenses(parsedData.expenses || []));
                       setTeams(parsedData.teams || []);
                       setWorkers(parsedData.workers || []);
                       setSals(parsedData.sals || []);
                       setProjectName(parsedData.projectName || "Progetto Condiviso");
                       if(parsedData.contractConfig) setContractConfig(parsedData.contractConfig);
                    }
                    setIsShareMode(true); setIsLoggedIn(true); setActiveView('timeline'); setCurrentProjectId('shared-view'); 
                } catch (e) { setError("Link di condivisione non valido."); }
            }
            setIsLoading(false); return;
        }
        if (localStorage.getItem('isChronosAILoggedIn') !== 'true') { setIsLoading(false); return; }
        setIsLoggedIn(true);
        try {
            const date = await fetchServerDateHeader(); setServerDate(date);
            const adminStatus = localStorage.getItem('isChronosAIAdmin');
            const storedEmail = localStorage.getItem('chronosAIUserEmail');
            if (storedEmail) setUserEmail(storedEmail);
            if (adminStatus === 'true') setIsAdmin(true);
        } catch (err: any) { setError("Errore licenza."); handleReset(); } finally { setIsLoading(false); }
    };
    checkActivation();
  }, [handleReset]);

  useEffect(() => { if (isLoggedIn && serverDate) { calculateRemainingDays(localStorage.getItem('activationDate'), localStorage.getItem('licenseValidity'), serverDate); } }, [isLoggedIn, serverDate, calculateRemainingDays]);

  useEffect(() => {
    if (isDemoMode || isAdmin || isShareMode || isSessionExpired) return;
    if (sessionSecondsRemaining <= 0) { setIsSessionExpired(true); return; }
    const timerId = setInterval(() => setSessionSecondsRemaining(prev => prev - 1), 1000);
    return () => clearInterval(timerId);
  }, [isAdmin, isShareMode, isDemoMode, sessionSecondsRemaining, isSessionExpired]);

  const handleLoginSuccess = async (email: string, isAdminUser: boolean = false, validityDays: number) => {
    let serverTime = await fetchServerDateHeader(); setServerDate(serverTime);
    localStorage.setItem('isChronosAILoggedIn', 'true');
    localStorage.setItem('activationDate', serverTime.toISOString());
    localStorage.setItem('licenseValidity', validityDays.toString());
    localStorage.setItem('chronosAIUserEmail', email);
    setIsLoggedIn(true); setUserEmail(email);
    if (isAdminUser) { localStorage.setItem('isChronosAIAdmin', 'true'); setIsAdmin(true); }
  };

  const handleEnterDemoMode = () => {
    setIsDemoMode(true); setIsLoggedIn(true); setUserEmail('Utente Demo');
    setProjectName("Progetto Demo"); setRemainingDays(9999); setServerDate(new Date()); setCurrentProjectId('demo-project'); setActiveView('dashboard');
  };

  const effectiveIsViewOnly = isShareMode || isSessionExpired;
  const handleRenameDocument = (fileName: string, newName: string) => setProjectDocuments(prev => prev.map(doc => doc.fileName === fileName ? { ...doc, fileName: newName } : doc));
  const handleDeleteDocument = (fileName: string) => { if (window.confirm(`Eliminare "${fileName}"?`)) setProjectDocuments(prev => prev.filter(doc => doc.fileName !== fileName)); };
  const handleToggleGroupSecurity = useCallback((groupId: string) => { if (effectiveIsViewOnly) return; setProjectDocuments(prev => prev.map(doc => ({ ...doc, workGroups: doc.workGroups.map(wg => wg.id === groupId ? { ...wg, isSecurityCost: !wg.isSecurityCost } : wg) }))); }, [effectiveIsViewOnly]);

  const handleFileUpload = useCallback(async (file: File) => {
    setIsLoading(true); setError(null);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      try {
        const jsonData = JSON.parse(content);
        
        // 1. CHRONOS FULL PROJECT FILE
        if (isNewProjectFile(jsonData)) {
            setProjectDocuments(sanitizeDocuments(jsonData.projectDocuments));
            setExpenses(sanitizeExpenses(jsonData.expenses || []));
            setProjectName(jsonData.projectName || file.name.replace('.json', ''));
            if (jsonData.lastSavedTime) setLastSavedTime(jsonData.lastSavedTime);
            if (jsonData.contractConfig) setContractConfig(jsonData.contractConfig);
            if (jsonData.sals) setSals(jsonData.sals);
            if (jsonData.teams) setTeams(prev => { const map = new Map(prev.map(t => [t.id, t])); jsonData.teams?.forEach((t:any) => map.set(t.id, t)); return Array.from(map.values()); });
            if (jsonData.workers) setWorkers(prev => { const map = new Map(prev.map(w => [w.id, w])); jsonData.workers?.forEach((w:any) => map.set(w.id, w)); return Array.from(map.values()); });
            setCurrentProjectId(jsonData.id || crypto.randomUUID());
        } 
        // 2. RAW JSON COMPUTO (ARRAY OF GROUPS LIKE THE ONE PROVIDED BY USER)
        else if (isRawJsonComputo(jsonData)) {
            let currentDate = new Date();
            const mappedGroups: WorkGroup[] = jsonData.map((g, idx) => {
                const totalValue = g.items.reduce((acc: number, item: any) => acc + (item.total || 0), 0);
                const duration = Math.max(5, Math.ceil(totalValue / 1500)); // Stima durata basata su importo
                const startDate = new Date(currentDate);
                const endDate = addDays(startDate, duration - 1);
                currentDate = addDays(endDate, 2); // Buffer di 2 giorni per la prossima attività
                
                return {
                    id: crypto.randomUUID(),
                    name: g.groupName,
                    duration,
                    value: totalValue,
                    color: colorPalette[idx % colorPalette.length],
                    startDate: format(startDate, 'yyyy-MM-dd'),
                    endDate: format(endDate, 'yyyy-MM-dd'),
                    progress: 0,
                    accountingType: g.groupName.startsWith('S.') ? 'measure' : 'measure',
                    isSecurityCost: g.groupName.startsWith('S.'),
                    items: g.items.map((i: any) => ({
                        articleCode: i.tariffCode || `VOCE.${idx}`,
                        description: i.description || '',
                        quantity: i.quantity || 0,
                        unit: i.unit || 'n',
                        unitPrice: i.price || i.unitPrice || 0,
                        total: i.total || 0,
                        laborRate: i.laborRate || 0,
                        laborValue: i.laborAmount || i.laborValue || 0,
                        measurements: [],
                        annotations: [],
                        variations: []
                    }))
                };
            });

            const newDoc: ProjectDocument = {
                fileName: file.name,
                workGroups: mappedGroups,
                totalValue: mappedGroups.reduce((acc, g) => acc + g.value, 0),
                isVisible: true,
                isFrozen: false,
                isLocked: false
            };

            setProjectDocuments(sanitizeDocuments([newDoc]));
            setExpenses([]);
            setProjectName(file.name.replace('.json', ''));
            setCurrentProjectId(crypto.randomUUID());
        } else {
            alert("Il file JSON non è in un formato compatibile con Chronos.");
        }
        
        setActiveView('dashboard');
      } catch (err: any) { 
          alert(`Errore: Il file selezionate non è un JSON valido.`); 
      } finally { 
          setIsLoading(false); 
          if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  }, []);
  
  const handleToggleDocumentVisibility = (fn: string) => setProjectDocuments(prev => prev.map(doc => doc.fileName === fn ? { ...doc, isVisible: !(doc.isVisible ?? true) } : doc));
  const handleToggleDocumentFreeze = (fn: string) => setProjectDocuments(prev => prev.map(doc => doc.fileName === fn ? { ...doc, isFrozen: !(doc.isFrozen ?? false) } : doc));
  const handleToggleDocumentLock = (fn: string) => setProjectDocuments(prev => prev.map(doc => doc.fileName === fn ? { ...doc, isLocked: !(doc.isLocked ?? false) } : doc));

  const handleWorkGroupsUpdate = useCallback((updater: React.SetStateAction<WorkGroup[]>, updatedGroupId?: string) => {
    if (effectiveIsViewOnly) return;
    setProjectDocuments(prevDocs => {
      const allCurrentGroups = prevDocs.flatMap(doc => doc.workGroups);
      const tempUpdatedGroups = typeof updater === 'function' ? updater(allCurrentGroups) : updater;
      let finalUpdatedGroups = tempUpdatedGroups;
      if (updatedGroupId) {
        const allDeps = prevDocs.flatMap(doc => doc.dependencies || []);
        if (allDeps.length > 0) finalUpdatedGroups = recalculateSchedule(tempUpdatedGroups, allDeps, updatedGroupId);
      }
      const map = new Map(finalUpdatedGroups.map(g => [g.id, g]));
      return prevDocs.map(doc => ({ ...doc, workGroups: doc.workGroups.map(group => map.get(group.id) || group) }));
    });
  }, [effectiveIsViewOnly]);
  
  const handleDependenciesChange = useCallback((updater: (prev: Dependency[]) => Dependency[]) => {
      if (effectiveIsViewOnly) return;
      setProjectDocuments(prevDocs => {
          if (prevDocs.length === 0) return prevDocs;
          const newDocs = [...prevDocs];
          const masterDoc = { ...newDocs.find(d => d.isVisible) || newDocs[0] };
          masterDoc.dependencies = updater(masterDoc.dependencies ?? []);
          const idx = newDocs.findIndex(d => d.fileName === masterDoc.fileName);
          newDocs[idx !== -1 ? idx : 0] = masterDoc;
          return newDocs;
      });
  }, [effectiveIsViewOnly]);

  const handleSetSalMarkers = useCallback((updater: React.SetStateAction<number[]>) => {
    if (effectiveIsViewOnly) return;
    setProjectDocuments(prevDocs => {
      if (prevDocs.length === 0) return prevDocs;
      const newDocs = [...prevDocs]; const first = { ...newDocs[0] };
      first.salMarkers = typeof updater === 'function' ? updater(first.salMarkers ?? []) : updater;
      newDocs[0] = first; return newDocs;
    });
  }, [effectiveIsViewOnly]);

  const handleOpenShareModal = () => { setShareableLink(`${window.location.origin}${window.location.pathname}?mode=view&data=${btoa(JSON.stringify({ projectDocuments, expenses, projectName, teams, workers, contractConfig, sals }))}`); setIsShareModalOpen(true); };
  
  const handleExport = async () => {
    const projectData = { id: currentProjectId, projectDocuments, expenses, projectName, teams, workers, contractConfig, sals, lastSavedTime: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a');
    link.href = url; link.download = `${projectName.replace(/[^a-z0-9]/gi, '_')}.json`;
    link.click(); URL.revokeObjectURL(url);
  };

  const handleSaveToDrive = async () => { alert("Google Drive non disponibile in Intranet."); };

  const handleOpenTaskModal = (group: WorkGroup) => { const doc = projectDocuments.find(d => d.workGroups.some(wg => wg.id === group.id)); setIsCurrentTaskLocked(doc?.isLocked ?? false); setSelectedTask(group); };
  const handleAddExpense = useCallback((exp: any) => setExpenses(prev => [...prev, { ...exp, id: crypto.randomUUID(), insertionDate: new Date().toISOString() }].sort((a, b) => new Date(b.insertionDate).getTime() - new Date(a.insertionDate).getTime())), []);
  const handleUpdateExpense = useCallback((updated: Expense) => setExpenses(prev => prev.map(e => e.id === updated.id ? updated : e)), []);
  const handleDeleteExpense = useCallback((id: string) => setExpenses(prev => prev.filter(e => e.id !== id)), []);
  const handleUpdateExpenseSupplyDate = useCallback((id: string, sd: string) => setExpenses(prev => prev.map(e => e.id === id ? { ...e, expectedSupplyDate: sd } : e)), []);

  const handleAddTeam = (t: Team) => setTeams(prev => [...prev, t]);
  const handleUpdateTeam = (t: Team) => setTeams(prev => prev.map(i => i.id === t.id ? t : i));
  const handleDeleteTeam = (id: string) => { setTeams(prev => prev.filter(t => t.id !== id)); setWorkers(prev => prev.map(w => w.teamId === id ? { ...w, teamId: undefined } : w)); };
  const handleAddWorker = (w: Worker) => setWorkers(prev => [...prev, w]);
  const handleUpdateWorker = (w: Worker) => setWorkers(prev => prev.map(i => i.id === w.id ? w : i));
  const handleDeleteWorker = (id: string) => setWorkers(prev => prev.filter(w => w.id !== id));

  const handleOpenProject = (p: SavedProject) => { setProjectDocuments(p.data.projectDocuments); setExpenses(p.data.expenses); setProjectName(p.name); setLastSavedTime(p.lastModified); if(p.contractConfig) setContractConfig(p.contractConfig); if(p.data.sals) setSals(p.data.sals); setCurrentProjectId(p.id); setActiveView('dashboard'); };
  
  const handleCreateProject = () => { 
      if (fileInputRef.current) {
          fileInputRef.current.value = '';
          fileInputRef.current.click();
      }
  };

  const handleDeleteProject = (id: string) => setSavedProjects(prev => { const updated = prev.filter(p => p.id !== id); localStorage.setItem('chronos_projects', JSON.stringify(updated)); return updated; });
  const handleArchiveProject = (id: string) => setSavedProjects(prev => { const updated = prev.map(p => p.id === id ? { ...p, status: 'archived' as const, lastModified: new Date().toISOString() } : p); localStorage.setItem('chronos_projects', JSON.stringify(updated)); return updated; });
  const handleRestoreProject = (id: string) => setSavedProjects(prev => { const updated = prev.map(p => p.id === id ? { ...p, status: 'active' as const, lastModified: new Date().toISOString() } : p); localStorage.setItem('chronos_projects', JSON.stringify(updated)); return updated; });
  const handleExitProject = () => { saveCurrentProject(); setCurrentProjectId(null); setIsDemoMode(false); setLastSavedTime(null); };

  const isProjectLoaded = currentProjectId !== null && (projectDocuments.length > 0 || expenses.length > 0);
  const projectSummaryStats = useMemo(() => {
    if (!isProjectLoaded) return null;
    const grandTotal = projectDocuments.reduce((acc, doc) => acc + doc.workGroups.reduce((gAcc, g) => gAcc + g.items.reduce((iAcc, i) => iAcc + ((i.quantity + (i.variations || []).reduce((vAcc, v) => v.type === 'increase' ? vAcc + v.quantity : vAcc - v.quantity, 0)) * i.unitPrice), 0), 0), 0);
    const earnedValue = projectDocuments.filter(d => !d.isFrozen).reduce((acc, d) => acc + d.workGroups.reduce((gAcc, g) => gAcc + g.items.reduce((iAcc, i) => iAcc + (i.measurements || []).reduce((mAcc, m) => mAcc + (m.quantity * i.unitPrice), 0), 0), 0), 0);
    return { grandTotal, earnedValue, overallProgress: grandTotal > 0 ? (earnedValue / grandTotal) * 100 : 0, totalCosts: expenses.reduce((acc, e) => acc + e.amount, 0) };
  }, [projectDocuments, expenses, isProjectLoaded]);

  if (isLoading && !isLoggedIn) return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900"><Loader /></div>
  if (!isLoggedIn) return <Login onLoginSuccess={handleLoginSuccess} onEnterDemoMode={handleEnterDemoMode} />;

  const renderContent = () => {
    if (!currentProjectId && !isShareMode) {
      return <PortfolioView projects={savedProjects} globalTeams={teams} globalWorkers={workers} onOpenProject={handleOpenProject} onCreateProject={handleCreateProject} onDeleteProject={handleDeleteProject} onArchiveProject={handleArchiveProject} onRestoreProject={handleRestoreProject} onLoadDemo={handleEnterDemoMode} onUpdateProjectMeta={handleUpdateSavedProject} onLogout={handleReset} />;
    }

    switch(activeView) {
      case 'dashboard': return <Dashboard projectSummary={projectSummaryStats} onViewChange={setActiveView} documentCount={projectDocuments.length} onImport={handleCreateProject} isProjectLoaded={isProjectLoaded} isDemoMode={isDemoMode} />;
      case 'timeline': return <GanttChart workGroups={projectDocuments.flatMap(d => d.workGroups)} dependencies={projectDocuments.flatMap(d => d.dependencies || [])} expenses={expenses} setWorkGroups={handleWorkGroupsUpdate} onDependenciesChange={handleDependenciesChange} isViewOnly={effectiveIsViewOnly} onBarDoubleClick={handleOpenTaskModal} isEconomicViewVisible={isEconomicViewVisible} onToggleEconomicView={() => setIsEconomicViewVisible(prev => !prev)} onUpdateExpenseSupplyDate={handleUpdateExpenseSupplyDate} projectName={projectName} />;
      case 'summary': return <ComputoDetailView documents={projectDocuments.filter(d => d.isVisible ?? true)} onToggleGroupSecurity={handleToggleGroupSecurity} />;
      case 'measurements': return <MeasurementsView documents={projectDocuments.filter(d => d.isVisible ?? true)} projectName={projectName} teams={teams} workers={workers} />;
      case 'costs': return <CostsView expenses={expenses} workGroups={projectDocuments.flatMap(d => d.workGroups)} onAddExpense={handleAddExpense} onUpdateExpense={handleUpdateExpense} onDeleteExpense={handleDeleteExpense} isViewOnly={effectiveIsViewOnly} earnedValue={projectSummaryStats?.earnedValue ?? 0} />;
      case 'teams': return <TeamManagementView teams={teams} workers={workers} onAddTeam={handleAddTeam} onUpdateTeam={handleUpdateTeam} onDeleteTeam={handleDeleteTeam} onAddWorker={handleAddWorker} onUpdateWorker={handleUpdateWorker} onDeleteWorker={handleDeleteWorker} isViewOnly={effectiveIsViewOnly} />;
      case 'reports': return <ReportsView documents={projectDocuments} teams={teams} workers={workers} />;
      case 'accounting': return <AccountingView documents={projectDocuments} projectName={projectName} contractConfig={contractConfig} onUpdateContractConfig={setContractConfig} sals={sals} onUpdateSals={setSals} onToggleGroupSecurity={handleToggleGroupSecurity} />;
      case 'help': return <UserManualView />;
      default: return null;
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-sans">
      <input type="file" ref={fileInputRef} onChange={e => e.target.files && handleFileUpload(e.target.files[0])} accept=".json" className="hidden" />
      <div className="flex h-screen">
          {currentProjectId || isShareMode ? (
            <>
              <Sidebar activeView={activeView} onViewChange={setActiveView} isProjectLoaded={isProjectLoaded} onLogout={handleReset} isViewOnly={effectiveIsViewOnly} onExitProject={handleExitProject} />
              <div className="flex-1 flex flex-col ml-64">
                <Header userEmail={userEmail} remainingDays={remainingDays} serverDate={serverDate} onImport={handleCreateProject} onExport={handleExport} onSaveToDrive={handleSaveToDrive} onShare={handleOpenShareModal} isProjectLoaded={isProjectLoaded} isAdmin={isAdmin} onGenerateLicense={() => setIsGeneratorModalOpen(true)} isViewOnly={effectiveIsViewOnly} isShareMode={isShareMode} isDemoMode={isDemoMode} isSessionExpired={isSessionExpired} sessionSecondsRemaining={sessionSecondsRemaining} projectName={projectName} onUpdateProjectName={setProjectName} lastSavedTime={lastSavedTime} />
                <main className="flex-grow p-4 md:p-6 overflow-y-auto">
                  <div className="max-w-7xl mx-auto">
                    {(activeView === 'timeline' || activeView === 'summary') && isProjectLoaded && <ProjectSummary documents={projectDocuments} isViewOnly={effectiveIsViewOnly} salMarkers={projectDocuments[0]?.salMarkers ?? []} onSalMarkersChange={handleSetSalMarkers} onToggleDocumentVisibility={handleToggleDocumentVisibility} onToggleDocumentFreeze={handleToggleDocumentFreeze} onToggleDocumentLock={handleToggleDocumentLock} onRenameDocument={handleRenameDocument} onDeleteDocument={handleDeleteDocument} />}
                      <div className="bg-white dark:bg-gray-800 shadow-xl rounded-2xl overflow-hidden min-h-[400px] flex flex-col mt-6">{renderContent()}</div>
                  </div>
                </main>
              </div>
            </>
          ) : (
            <div className="w-full">{renderContent()}</div>
          )}
      </div>
      <TaskModal isOpen={!!selectedTask} onClose={() => setSelectedTask(null)} group={selectedTask} allWorkGroups={projectDocuments.flatMap(d => d.workGroups)} dependencies={projectDocuments.flatMap(d => d.dependencies || [])} setWorkGroups={handleWorkGroupsUpdate} onDependenciesChange={handleDependenciesChange} isViewOnly={effectiveIsViewOnly} isLocked={isCurrentTaskLocked} teams={teams} workers={workers} />
      <ShareModal isOpen={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} link={shareableLink} />
      {isAdmin && <LicenseGeneratorModal isOpen={isGeneratorModalOpen} onClose={() => setIsGeneratorModalOpen(false)} />}
    </div>
  );
};

export default App;
