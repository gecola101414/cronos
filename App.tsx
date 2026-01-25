
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { analyzeBillOfQuantities, analyzePrimusPdf, getProjectInsight, getRiskAnalysis } from './services/geminiService';
import { fetchServerDateHeader } from './services/licenseService';
import { saveToGoogleDrive } from './services/googleDriveService';
import { WorkGroup, ProjectDocument, WorkItem, Risk, Expense, Dependency, Team, Worker, SavedProject, ContractConfig, SalEntry } from './types';
import GanttChart from './components/GanttChart';
import Loader from './components/Loader';
import Header from './components/Header';
import ProjectSummary from './components/ProjectSummary';
import ComputoDetailView from './components/ComputoDetailView';
import ChatAssistantButton from './components/ChatAssistantButton';
import ChatModal from './components/ChatModal';
import RiskAnalysisPanel from './components/RiskAnalysisPanel';
import { format, addDays, differenceInDays, parseISO, parse } from 'date-fns';
import { it } from 'date-fns/locale/it';
import Login from './components/Registration';
import ShareModal from './components/ShareModal';
import LicenseGeneratorModal from './components/LicenseGeneratorModal';
import TaskModal from './components/TaskModal';
import MeasurementsView from './components/MeasurementsView';
import SalReportView from './components/SalReportView';
import CostsView from './components/CostsView';
import { recalculateSchedule } from './services/scheduleService';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import TeamManagementView from './components/TeamManagementView';
import ReportsView from './components/ReportsView';
import PortfolioView from './components/PortfolioView';
import UserManualView from './components/UserManualView';
import AccountingView from './components/AccountingView';


export type View = 'dashboard' | 'timeline' | 'summary' | 'measurements' | 'sal-report' | 'costs' | 'teams' | 'reports' | 'help' | 'accounting' | 'external-computo';

// AGGIORNATO CON IL NUOVO LINK
const EXTERNAL_COMPUTO_URL = "https://gecola-ai-897330207669.us-west1.run.app/"; 

interface Message {
  sender: 'user' | 'ai';
  text: string;
}

const colorPalette = [
  '#4A90E2', '#50E3C2', '#F5A623', '#F8E71C', '#D0021B',
  '#9013FE', '#B8E986', '#7ED321', '#BD10E0', '#417505',
  '#E67E22', '#1ABC9C', '#3498DB', '#9B59B6', '#E74C3C',
];

interface RawWorkGroup {
  groupName: string;
  items: {
    tariffCode: string;
    description: string;
    price: number | null;
    quantity: number;
    total: number | null;
    unit: string;
    laborRate?: number;
    laborAmount?: number;
  }[];
}

function isRawWorkGroupArray(data: any): data is RawWorkGroup[] {
  if (!Array.isArray(data)) return false;
  if (data.length === 0) return true; // Empty array is valid
  const first = data[0];
  return 'groupName' in first && 'items' in first && Array.isArray(first.items);
}

function isNewProjectFile(data: any): data is { projectDocuments: ProjectDocument[], expenses: Expense[], projectName?: string, teams?: Team[], workers?: Worker[], lastSavedTime?: string, contractConfig?: ContractConfig, sals?: SalEntry[] } {
    return data && typeof data === 'object' && 'projectDocuments' in data && Array.isArray(data.projectDocuments);
}

function isProjectDocumentArray(data: any): data is ProjectDocument[] {
    if (!Array.isArray(data)) return false;
    if (data.length === 0) return true;
    const firstDoc = data[0];
    if (!('fileName' in firstDoc && 'workGroups' in firstDoc && 'totalValue' in firstDoc)) {
        return false;
    }
    if (Array.isArray(firstDoc.workGroups) && firstDoc.workGroups.length > 0) {
        const firstGroup = firstDoc.workGroups[0];
        return 'id' in firstGroup && 'name' in firstGroup && 'startDate' in firstGroup && 'endDate' in firstGroup;
    }
    return true; 
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
      accountingType: wg.accountingType ?? 'measure', // Default to 'measure' if not present
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

const generateDemoExpenses = (workGroups: WorkGroup[]): Expense[] => {
    const expenses: Expense[] = [];
    const now = new Date().toISOString();
    
    const findGroup = (namePart: string) => workGroups.find(wg => wg.name.includes(namePart));

    const edileGroup = findGroup('Opere Edili Interne');
    if (edileGroup) {
        expenses.push({ id: crypto.randomUUID(), date: format(addDays(parseISO(edileGroup.startDate), 2), 'yyyy-MM-dd'), description: 'Fornitura mattoni e cemento', category: 'Materiali', amount: 4850.75, relatedWorkGroupId: edileGroup.id, invoiceNumber: 'FATT-001', insertionDate: now, expectedSupplyDate: format(addDays(parseISO(edileGroup.startDate), 5), 'yyyy-MM-dd') });
        expenses.push({ id: crypto.randomUUID(), date: format(addDays(parseISO(edileGroup.startDate), 5), 'yyyy-MM-dd'), description: 'Salario squadra muratori - Settimana 1', category: 'Personale', amount: 3200.00, relatedWorkGroupId: edileGroup.id, insertionDate: now });
    }

    const impiantiGroup = findGroup('Impianti Tecnologici');
    if (impiantiGroup) {
        expenses.push({ id: crypto.randomUUID(), date: format(addDays(parseISO(impiantiGroup.startDate), 7), 'yyyy-MM-dd'), description: 'Acconto subappalto elettricista Rossi S.R.L', category: 'Subappalti', amount: 10000.00, relatedWorkGroupId: impiantiGroup.id, invoiceNumber: 'ROSSI-01', insertionDate: now });
    }

    const facciataGroup = findGroup('Restauro Facciata Storica');
    if (facciataGroup) {
        expenses.push({ id: crypto.randomUUID(), date: format(addDays(parseISO(facciataGroup.startDate), 1), 'yyyy-MM-dd'), description: 'Noleggio ponteggio - primo mese', category: 'Noleggi', amount: 2500.00, relatedWorkGroupId: facciataGroup.id, invoiceNumber: 'NOLEGGIO-A', insertionDate: now, expectedSupplyDate: format(addDays(parseISO(facciataGroup.startDate), 2), 'yyyy-MM-dd') });
    }
    
    const spaGroup = findGroup('Installazione Aree Umide');
    if (spaGroup) {
        expenses.push({ id: crypto.randomUUID(), date: format(addDays(parseISO(spaGroup.startDate), 10), 'yyyy-MM-dd'), description: 'Fornitura mosaici per bagno turco', category: 'Materiali', amount: 8750.00, relatedWorkGroupId: spaGroup.id, invoiceNumber: 'FATT-002', insertionDate: now, expectedSupplyDate: format(addDays(parseISO(spaGroup.startDate), 15), 'yyyy-MM-dd') });
    }

    expenses.push({ id: crypto.randomUUID(), date: format(addDays(new Date(), 10), 'yyyy-MM-dd'), description: 'Spese amministrative e di cantiere', category: 'Spese Generali', amount: 1230.50, insertionDate: now });
    
    return expenses.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

const generateDemoData = (): { documents: ProjectDocument[], expenses: Expense[], teams: Team[], workers: Worker[] } => {
  let currentDate = new Date();

  const createWorkGroupFromItems = (name: string, duration: number, items: WorkItem[], color: string, isSecurity: boolean = false): WorkGroup => {
    const startDate = new Date(currentDate);
    const endDate = addDays(startDate, duration - 1);
    
    currentDate = addDays(endDate, 2);
    const value = items.reduce((acc, item) => acc + item.total, 0);

    return {
      id: `${name.replace(/[^a-zA-Z0-9]/g, '-')}-${Math.random().toString(36).substring(2, 9)}`,
      name,
      value,
      duration,
      color,
      startDate: format(startDate, 'yyyy-MM-dd'),
      endDate: format(endDate, 'yyyy-MM-dd'),
      progress: 0,
      items,
      isSecurityCost: isSecurity,
      accountingType: 'measure'
    };
  };

  // --- MODULE 1: RISTRUTTURAZIONE CORPO CENTRALE ---
  const module1_wbs1_items: WorkItem[] = [
    { articleCode: 'EDL.01.A', description: 'Demolizione tramezzi interni in laterizio forato, compreso oneri e trasporti.', quantity: 150, unit: 'm²', unitPrice: 25, total: 3750, measurements: [], annotations: [], variations: [], laborRate: 35, laborValue: 1312.5 },
    { articleCode: 'EDL.01.B', description: 'Ricostruzione tramezzi con blocchi di gesso idrofugo spessore 10cm.', quantity: 120, unit: 'm²', unitPrice: 55, total: 6600, measurements: [], annotations: [], variations: [], laborRate: 40, laborValue: 2640 },
  ];
  const module1_wbs2_items: WorkItem[] = [
    { articleCode: 'IMP.02.A', description: 'Realizzazione impianto elettrico completo, comprensivo di 150 punti luce.', quantity: 1, unit: 'corpo', unitPrice: 20000, total: 20000, measurements: [], annotations: [], variations: [], laborRate: 45, laborValue: 9000 },
  ];
  const module1_wbs3_items: WorkItem[] = [
    { articleCode: 'RES.04.B', description: 'Pulitura della facciata storica con sistema di sabbiatura controllata.', quantity: 600, unit: 'm²', unitPrice: 45, total: 27000, measurements: [], annotations: [], variations: [], laborRate: 50, laborValue: 13500 },
  ];
  
  // Security Costs
  const module1_sec_items: WorkItem[] = [
      { articleCode: 'SIC.01', description: 'Oneri per la sicurezza non soggetti a ribasso (DPI, Segnaletica).', quantity: 1, unit: 'corpo', unitPrice: 2500, total: 2500, measurements: [], annotations: [], variations: [] }
  ];

  const module1_workGroups: WorkGroup[] = [
    createWorkGroupFromItems('Opere Edili Interne', 15, module1_wbs1_items, colorPalette[0]),
    createWorkGroupFromItems('Impianti Tecnologici', 25, module1_wbs2_items, colorPalette[1]),
    createWorkGroupFromItems('Restauro Facciata Storica', 40, module1_wbs3_items, colorPalette[3]),
    createWorkGroupFromItems('Oneri Sicurezza', 40, module1_sec_items, '#10B981', true)
  ];
  
  const project1: ProjectDocument = {
    fileName: 'Modulo 1: Ristrutturazione',
    workGroups: module1_workGroups,
    totalValue: module1_workGroups.reduce((acc, wg) => acc + wg.value, 0),
    dependencies: [
        { id: 'dep-1', from: module1_workGroups[0].id, to: module1_workGroups[1].id, type: 'FS', lag: 0 }
    ],
    isVisible: true, isFrozen: false, isLocked: false,
    location: "Cortina d'Ampezzo, Italia",
  };

  currentDate = addDays(currentDate, 7);

  // --- MODULE 2: REALIZZAZIONE NUOVA ALA SPA ---
  const module2_wbs1_items: WorkItem[] = [
    { articleCode: 'STR.01.C', description: 'Realizzazione strutture in elevazione (pilastri, travi, solai) in C.A.', quantity: 1, unit: 'corpo', unitPrice: 47500, total: 47500, measurements: [], annotations: [], variations: [], laborRate: 30, laborValue: 14250 }
  ];
  const module2_wbs2_items: WorkItem[] = [
    { articleCode: 'SPA.02.A', description: 'Costruzione e impermeabilizzazione vasca piscina interna a sfioro.', quantity: 1, unit: 'cad', unitPrice: 45000, total: 45000, measurements: [], annotations: [], variations: [], laborRate: 35, laborValue: 15750 },
  ];
  
  const module2_workGroups: WorkGroup[] = [
    createWorkGroupFromItems('Fondamenta e Strutture C.A.', 35, module2_wbs1_items, colorPalette[4]),
    createWorkGroupFromItems('Installazione Aree Umide', 28, module2_wbs2_items, colorPalette[5]),
  ];

  const project2: ProjectDocument = {
    fileName: 'Modulo 2: Nuova Ala SPA',
    workGroups: module2_workGroups,
    totalValue: module2_workGroups.reduce((acc, wg) => acc + wg.value, 0),
    dependencies: [
        { id: 'dep-2', from: module2_workGroups[0].id, to: module2_workGroups[1].id, type: 'FS', lag: 5 }
    ],
    isVisible: true, isFrozen: false, isLocked: false,
  };

  const allDemoGroups = [...project1.workGroups, ...project2.workGroups];
  const demoExpenses = generateDemoExpenses(allDemoGroups);
  
  const demoTeams: Team[] = [
    { id: 'team-1', name: 'Squadra Edile A', color: '#EF4444' },
    { id: 'team-2', name: 'Squadra Impiantisti', color: '#3B82F6' },
    { id: 'team-3', name: 'Restauratori Esperti', color: '#F59E0B' }
  ];

  const demoWorkers: Worker[] = [
    { id: 'w-1', name: 'Mario Rossi', role: 'Caposquadra', status: 'active', teamId: 'team-1' },
    { id: 'w-2', name: 'Luigi Verdi', role: 'Muratore', status: 'active', teamId: 'team-1' },
    { id: 'w-3', name: 'Giovanni Bianchi', role: 'Elettricista', status: 'active', teamId: 'team-2' },
    { id: 'w-4', name: 'Anna Neri', role: 'Tecnico Specializzato', status: 'active', teamId: 'team-3' },
  ];

  return { 
      documents: sanitizeDocuments([project1, project2]), 
      expenses: demoExpenses,
      teams: demoTeams,
      workers: demoWorkers
  };
};


const App: React.FC = () => {
  // Auth & System State
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
  
  // Portfolio State
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  // Active Project State
  const [projectDocuments, setProjectDocuments] = useState<ProjectDocument[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [projectName, setProjectName] = useState<string>("Nuovo Cantiere");
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  
  // NEW: Contract & SAL Configuration
  const [contractConfig, setContractConfig] = useState<ContractConfig | undefined>(undefined);
  const [sals, setSals] = useState<SalEntry[]>([]);

  // Global Resource State (Shared across projects)
  const [teams, setTeams] = useState<Team[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);

  // UI State
  const [activeView, setActiveView] = useState<View>('dashboard');
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [isChatLoading, setIsChatLoading] = useState<boolean>(false);
  const [isShareMode, setIsShareMode] = useState<boolean>(false);
  const [risks, setRisks] = useState<Risk[] | null>(null);
  const [isAnalyzingRisks, setIsAnalyzingRisks] = useState<boolean>(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isGeneratorModalOpen, setIsGeneratorModalOpen] = useState(false);
  const [shareableLink, setShareableLink] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedTask, setSelectedTask] = useState<WorkGroup | null>(null);
  const [isCurrentTaskLocked, setIsCurrentTaskLocked] = useState<boolean>(false);
  const [isEconomicViewVisible, setIsEconomicViewVisible] = useState<boolean>(false);
  
  // Load Saved Projects from LocalStorage on Mount
  useEffect(() => {
      const loadedProjects = localStorage.getItem('chronos_projects');
      if (loadedProjects) {
          try {
              const parsed = JSON.parse(loadedProjects);
              if (Array.isArray(parsed)) setSavedProjects(parsed);
          } catch (e) {
              console.error("Failed to load saved projects", e);
          }
      }
      
      const loadedResources = localStorage.getItem('chronos_global_resources');
      if (loadedResources) {
          try {
              const parsed = JSON.parse(loadedResources);
              if (parsed.teams) setTeams(parsed.teams);
              if (parsed.workers) setWorkers(parsed.workers);
          } catch (e) {
              console.error("Failed to load global resources", e);
          }
      }
  }, []);

  // Persist Global Resources when changed
  useEffect(() => {
      if (teams.length > 0 || workers.length > 0) {
          localStorage.setItem('chronos_global_resources', JSON.stringify({ teams, workers }));
      }
  }, [teams, workers]);

  // Save Current Project to Portfolio
  const saveCurrentProject = useCallback(() => {
      if (!currentProjectId) return;
      
      // Find existing project to preserve metadata like location/status if not changed here
      const existingProject = savedProjects.find(p => p.id === currentProjectId);

      const projectData: SavedProject = {
          id: currentProjectId,
          name: projectName,
          location: existingProject?.location, 
          status: existingProject?.status || 'active', // Preserve status
          lastModified: new Date().toISOString(),
          contractConfig: contractConfig, 
          data: {
              projectDocuments,
              expenses,
              teams: teams, 
              workers: workers,
              sals: sals // Save SALs
          }
      };

      setSavedProjects(prev => {
          const filtered = prev.filter(p => p.id !== currentProjectId);
          const updated = [...filtered, projectData].sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
          localStorage.setItem('chronos_projects', JSON.stringify(updated));
          return updated;
      });
  }, [currentProjectId, projectName, projectDocuments, expenses, teams, workers, savedProjects, contractConfig, sals]);

  const handleUpdateSavedProject = useCallback((projectId: string, name: string, location: string) => {
      setSavedProjects(prev => {
          const updated = prev.map(p => {
              if (p.id === projectId) {
                  return { ...p, name, location, lastModified: new Date().toISOString() };
              }
              return p;
          });
          localStorage.setItem('chronos_projects', JSON.stringify(updated));
          return updated;
      });
  }, []);

  useEffect(() => {
      if (currentProjectId && !isShareMode && !isDemoMode && !isSessionExpired) {
          const timer = setTimeout(() => {
              saveCurrentProject();
          }, 2000); 
          return () => clearTimeout(timer);
      }
  }, [projectDocuments, expenses, projectName, currentProjectId, isShareMode, isDemoMode, isSessionExpired, saveCurrentProject, teams, workers, contractConfig, sals]);


  // ... (Login and Demo logic unchanged) ...
  const calculateRemainingDays = useCallback((activationDateStr: string | null, validityDaysStr: string | null, now: Date) => {
    if (!activationDateStr || !validityDaysStr) {
      setRemainingDays(null);
      return;
    }
    const validityDays = parseInt(validityDaysStr, 10);
    if (validityDays === 9999) {
      setRemainingDays(9999);
      return;
    }
    const activationDate = new Date(activationDateStr);
    const expiryDate = addDays(activationDate, validityDays);
    const remaining = differenceInDays(expiryDate, now);
    setRemainingDays(Math.max(0, remaining + 1));
  }, []);

  const handleReset = useCallback(() => {
    localStorage.removeItem('isChronosAILoggedIn');
    localStorage.removeItem('isChronosAIAdmin');
    localStorage.removeItem('activationDate');
    localStorage.removeItem('licenseValidity');
    localStorage.removeItem('chronosAIUserEmail');
    window.location.href = window.location.origin + window.location.pathname;
  }, []);

  useEffect(() => {
    const checkActivation = async () => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('mode') === 'view') {
            const data = params.get('data');
            if (data) {
                try {
                    const decodedData = atob(data);
                    const parsedData = JSON.parse(decodedData);
                    if (isNewProjectFile(parsedData)) {
                       setProjectDocuments(sanitizeDocuments(parsedData.projectDocuments));
                       setExpenses(sanitizeExpenses(parsedData.expenses || []));
                       setTeams(parsedData.teams || []);
                       setWorkers(parsedData.workers || []);
                       setSals(parsedData.sals || []);
                       setProjectName(parsedData.projectName || "Progetto Condiviso");
                       if(parsedData.contractConfig) setContractConfig(parsedData.contractConfig);
                    } else if (isProjectDocumentArray(parsedData)) {
                       setProjectDocuments(sanitizeDocuments(parsedData));
                       setExpenses([]);
                       setTeams([]);
                       setWorkers([]);
                       setSals([]);
                       setProjectName("Progetto Condiviso");
                    }
                    setIsShareMode(true);
                    setIsLoggedIn(true);
                    setActiveView('timeline'); 
                    setCurrentProjectId('shared-view'); 
                } catch (e) {
                    console.error("Failed to parse shared project data:", e);
                    setError("The shared project link is corrupted or invalid.");
                }
            }
            setIsLoading(false);
            return;
        }

        const loginStatus = localStorage.getItem('isChronosAILoggedIn');
        if (loginStatus !== 'true') {
            setIsLoading(false);
            return;
        }

        setIsLoggedIn(true);
        try {
            const date = await fetchServerDateHeader();
            setServerDate(date);
            
            const adminStatus = localStorage.getItem('isChronosAIAdmin');
            const storedEmail = localStorage.getItem('chronosAIUserEmail');
            if (storedEmail) setUserEmail(storedEmail);
            if (adminStatus === 'true') setIsAdmin(true);

        } catch (err: any) {
            setError(err.message || "Impossibile verificare la licenza. È richiesta una connessione a Internet attiva.");
            handleReset();
        } finally {
            setIsLoading(false);
        }
    };

    checkActivation();
  }, [handleReset]);

  useEffect(() => {
      if (isLoggedIn && serverDate) {
          const activationDateStr = localStorage.getItem('activationDate');
          const validityDaysStr = localStorage.getItem('licenseValidity');
          calculateRemainingDays(activationDateStr, validityDaysStr, serverDate);
      }
  }, [isLoggedIn, serverDate, calculateRemainingDays]);

  useEffect(() => {
    if (isDemoMode) return;
    if (isAdmin || isShareMode || isSessionExpired) return;
    if (sessionSecondsRemaining <= 0) {
        setIsSessionExpired(true);
        return;
    }
    const timerId = setInterval(() => {
        setSessionSecondsRemaining(prevSeconds => prevSeconds - 1);
    }, 1000);
    return () => clearInterval(timerId);
  }, [isAdmin, isShareMode, isDemoMode, sessionSecondsRemaining, isSessionExpired]);

  const handleLoginSuccess = async (email: string, isAdminUser: boolean = false, validityDays: number) => {
    let serverTime: Date;
    try {
        serverTime = await fetchServerDateHeader();
    } catch(err) {
        console.error("Login failed: could not get server time", err);
        throw new Error("Impossibile connettersi al server per l'attivazione. Controlla la tua connessione a Internet.");
    }

    setServerDate(serverTime);
    const activationDate = serverTime.toISOString();
    
    localStorage.setItem('isChronosAILoggedIn', 'true');
    localStorage.setItem('activationDate', activationDate);
    localStorage.setItem('licenseValidity', validityDays.toString());
    localStorage.setItem('chronosAIUserEmail', email);
    
    setIsLoggedIn(true);
    setUserEmail(email);

    if (isAdminUser) {
      localStorage.setItem('isChronosAIAdmin', 'true');
      setIsAdmin(true);
    }
  };

  const handleEnterDemoMode = () => {
    const demoData = generateDemoData();
    setIsDemoMode(true);
    setIsLoggedIn(true);
    setUserEmail('Utente Demo');
    setProjectDocuments(demoData.documents);
    setExpenses(demoData.expenses);
    setTeams(prev => {
        const map = new Map(prev.map(t => [t.id, t]));
        demoData.teams.forEach(t => map.set(t.id, t));
        return Array.from(map.values());
    });
    setWorkers(prev => {
        const map = new Map(prev.map(w => [w.id, w]));
        demoData.workers.forEach(w => map.set(w.id, w));
        return Array.from(map.values());
    });

    setProjectName("Progetto Demo: Ristrutturazione Bellevue");
    setRemainingDays(9999);
    setServerDate(new Date());
    setCurrentProjectId('demo-project');
    setActiveView('dashboard');
  };

  const effectiveIsViewOnly = isShareMode || isSessionExpired;

  const handleRenameDocument = (fileName: string, newName: string) => {
      setProjectDocuments(prev => prev.map(doc => doc.fileName === fileName ? { ...doc, fileName: newName } : doc));
  };

  const handleDeleteDocument = (fileName: string) => {
      if (window.confirm(`Sei sicuro di voler eliminare il corpo d'opera "${fileName}"? Questa azione è irreversibile.`)) {
          setProjectDocuments(prev => prev.filter(doc => doc.fileName !== fileName));
      }
  };

  // --- NEW HANDLER FOR SECURITY COST TOGGLE ---
  const handleToggleGroupSecurity = useCallback((groupId: string) => {
      if (effectiveIsViewOnly) return;
      setProjectDocuments(prev => prev.map(doc => ({
          ...doc,
          workGroups: doc.workGroups.map(wg => 
              wg.id === groupId ? { ...wg, isSecurityCost: !wg.isSecurityCost } : wg
          )
      })));
  }, [effectiveIsViewOnly]);

  const handleFileUpload = useCallback(async (file: File) => {
    if (isDemoMode) {
      alert("L'importazione di nuovi file non è disponibile in modalità demo.");
      return;
    }
    // License checks... (same as before)
    if (!isAdmin && serverDate) {
      const activationDateStr = localStorage.getItem('activationDate');
      const validityDaysStr = localStorage.getItem('licenseValidity');
      if (!activationDateStr || !validityDaysStr) {
          alert("Dati di licenza non trovati o corrotti. Sarai disconnesso.");
          handleReset();
          return;
      }
      const validityDays = parseInt(validityDaysStr, 10);
      if (validityDays !== 9999) {
          const activationDate = new Date(activationDateStr);
          const expiryDate = addDays(activationDate, validityDays);
          if (serverDate > expiryDate) {
              alert(`La tua licenza è scaduta il ${format(expiryDate, 'dd/MM/yyyy', { locale: it })}. Impossibile caricare il file. Sarai disconnesso.`);
              handleReset();
              return;
          }
      }
    } else if (!isAdmin && !serverDate) {
        alert("Impossibile verificare la validità della licenza. Assicurati di essere connesso e ricarica la pagina.");
        return;
    }
    
    setIsLoading(true);
    setError(null);

    const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, "");

    const processAndAddGroups = (processedGroups: Omit<WorkGroup, 'startDate' | 'endDate' | 'progress'>[], fileName: string) => {
        if (processedGroups.length === 0) {
            alert("L'analisi non ha prodotto risultati. Controlla il formato del file e riprova.");
            return;
        }
        let lastEndDate = new Date();
        if (projectDocuments.length > 0) {
            const allGroups = projectDocuments.flatMap(doc => doc.workGroups);
            if (allGroups.length > 0) {
                const maxDate = new Date(Math.max(...allGroups.map(g => new Date(g.endDate).getTime())));
                lastEndDate = new Date(maxDate);
                lastEndDate.setDate(lastEndDate.getDate() + 1);
            }
        }
        
        let currentStartDate = lastEndDate;
        const finalWorkGroups = processedGroups.map((group) => {
          const startDate = new Date(currentStartDate);
          const endDate = addDays(startDate, group.duration - 1);
          currentStartDate = addDays(endDate, 1);
          
          return {
            ...group,
            id: `doc${projectDocuments.length}-${group.id}`, 
            progress: 0,
            startDate: format(startDate, 'yyyy-MM-dd'),
            endDate: format(endDate, 'yyyy-MM-dd'),
            isSecurityCost: false, // Default to false for new imports
            accountingType: 'measure' as const // Default to measure
          };
        });
        
        const documentTotalValue = finalWorkGroups.reduce((acc, group) => acc + group.value, 0);

        const newDocument: ProjectDocument = {
          fileName: fileName,
          workGroups: finalWorkGroups,
          totalValue: documentTotalValue,
          dependencies: [],
          isVisible: true,
          isFrozen: false,
          isLocked: false,
        };

        setProjectDocuments(prev => [...prev, newDocument]);
        
        setProjectName(prevName => {
            if (prevName === "Nuovo Cantiere" || !prevName) {
                return fileNameWithoutExt;
            }
            return prevName;
        });

        setActiveView('timeline');
    }

    // ... (File Processing Logic - same as before) ...
    if (file.name.toLowerCase().endsWith('.pdf')) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const dataUrl = e.target?.result as string;
            if (!dataUrl) {
                setError('Impossibile leggere il file PDF.');
                setIsLoading(false);
                return;
            }
            const base64String = dataUrl.split(',')[1];
            try {
                const analyzedData = await analyzePrimusPdf(base64String);
                processAndAddGroups(analyzedData, fileNameWithoutExt);
            } catch (err: any) {
                console.error(err);
                setError(`Analisi del PDF fallita: ${err.message}.`);
            } finally {
                setIsLoading(false);
            }
        };
        reader.onerror = () => {
          setError('Errore durante la lettura del file PDF.');
          setIsLoading(false);
        };
        reader.readAsDataURL(file);
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      if (!content) {
        setError('Could not read file content.');
        setIsLoading(false);
        return;
      }
      
      try {
        if (file.name.toLowerCase().endsWith('.json')) {
            const jsonData = JSON.parse(content);
            const isFullReplacement = projectDocuments.length > 0 || expenses.length > 0;
            
            if (isNewProjectFile(jsonData)) {
                if (isFullReplacement && !window.confirm('Importare questo file sostituirà tutti i dati del progetto corrente (incluse le spese). Le squadre globali verranno aggiornate/unite. Continuare?')) {
                    setIsLoading(false); return;
                }
                setProjectDocuments(sanitizeDocuments(jsonData.projectDocuments));
                setExpenses(sanitizeExpenses(jsonData.expenses || []));
                if(jsonData.projectName) setProjectName(jsonData.projectName);
                if (jsonData.lastSavedTime) setLastSavedTime(jsonData.lastSavedTime);
                if (jsonData.contractConfig) setContractConfig(jsonData.contractConfig);
                if (jsonData.sals) setSals(jsonData.sals); // Load SALs

                if (jsonData.teams) {
                    setTeams(prev => {
                        const map = new Map(prev.map(t => [t.id, t]));
                        jsonData.teams?.forEach(t => map.set(t.id, t));
                        return Array.from(map.values());
                    });
                }
                if (jsonData.workers) {
                    setWorkers(prev => {
                        const map = new Map(prev.map(w => [w.id, w]));
                        jsonData.workers?.forEach(w => map.set(w.id, w));
                        return Array.from(map.values());
                    });
                }

            } else if (isProjectDocumentArray(jsonData)) {
                if (isFullReplacement && !window.confirm('Importare questo file (formato legacy) sostituirà i documenti correnti e cancellerà tutte le spese. Continuare?')) {
                    setIsLoading(false); return;
                }
                setProjectDocuments(sanitizeDocuments(jsonData));
                setExpenses([]);
                setSals([]);
            } else if (isRawWorkGroupArray(jsonData)) {
                const processedGroups = jsonData.map((group, index) => {
                    const items: WorkItem[] = group.items.map(item => ({
                        articleCode: item.tariffCode,
                        description: item.description,
                        quantity: item.quantity,
                        unit: item.unit,
                        unitPrice: item.price ?? 0,
                        total: item.total ?? 0,
                        measurements: [],
                        annotations: [],
                        variations: [],
                        laborRate: item.laborRate || 0, // Import Labor Rate
                        laborValue: item.laborAmount || 0 // Import Labor Amount
                    }));
                    const totalValue = items.reduce((acc, item) => acc + item.total, 0);
                    const calculatedDuration = Math.max(1, Math.round(totalValue / 5000));
                    return {
                        id: `group-json-${group.groupName.replace(/[^a-zA-Z0-9]/g, '-')}-${index}`,
                        name: group.groupName,
                        items: items,
                        duration: calculatedDuration,
                        value: totalValue,
                        color: colorPalette[index % colorPalette.length],
                    };
                });
                processAndAddGroups(processedGroups, fileNameWithoutExt);
            } else {
                throw new Error("Invalid JSON format.");
            }
            setActiveView('dashboard');
        } else {
            const analyzedData = await analyzeBillOfQuantities(content);
            processAndAddGroups(analyzedData, fileNameWithoutExt);
        }
      } catch (err: any) {
        console.error(err);
        setError(`Failed to process the document: ${err.message}.`);
      } finally {
        setIsLoading(false);
      }
    };
    reader.onerror = () => {
      setError('Failed to read the file.');
      setIsLoading(false);
    };
    reader.readAsText(file);
  }, [projectDocuments, expenses, isAdmin, serverDate, handleReset, isDemoMode, teams, workers, projectName]);
  
  // ... (Toggle visibility functions, same as before) ...
  const handleToggleDocumentVisibility = (fileNameToToggle: string) => {
    if (effectiveIsViewOnly) return;
    setProjectDocuments(prevDocs =>
      prevDocs.map(doc =>
        doc.fileName === fileNameToToggle
          ? { ...doc, isVisible: !(doc.isVisible ?? true) }
          : doc
      )
    );
  };

  const handleToggleDocumentFreeze = (fileNameToToggle: string) => {
    if (effectiveIsViewOnly) return;
    setProjectDocuments(prevDocs =>
      prevDocs.map(doc =>
        doc.fileName === fileNameToToggle
          ? { ...doc, isFrozen: !(doc.isFrozen ?? false) }
          : doc
      )
    );
  };

  const handleToggleDocumentLock = (fileNameToToggle: string) => {
    if (effectiveIsViewOnly) return;
    setProjectDocuments(prevDocs =>
      prevDocs.map(doc =>
        doc.fileName === fileNameToToggle
          ? { ...doc, isLocked: !(doc.isLocked ?? false) }
          : doc
      )
    );
  };

  const handleWorkGroupsUpdate = useCallback((updater: React.SetStateAction<WorkGroup[]>, updatedGroupId?: string) => {
    if (effectiveIsViewOnly) return;
    setProjectDocuments(prevDocs => {
      const allCurrentGroups = prevDocs.flatMap(doc => doc.workGroups);
      const tempUpdatedGroups = typeof updater === 'function' ? updater(allCurrentGroups) : updater;
      let finalUpdatedGroups = tempUpdatedGroups;
      if (updatedGroupId) {
        const allDependencies = prevDocs.flatMap(doc => doc.dependencies || []);
        if (allDependencies.length > 0) {
            finalUpdatedGroups = recalculateSchedule(tempUpdatedGroups, allDependencies, updatedGroupId);
        }
      }
      const updatedGroupsMap = new Map<string, WorkGroup>();
      finalUpdatedGroups.forEach(group => updatedGroupsMap.set(group.id, group));
      return prevDocs.map(doc => ({
        ...doc,
        workGroups: doc.workGroups.map(group => updatedGroupsMap.get(group.id) || group)
      }));
    });
  }, [effectiveIsViewOnly]);
  
  const handleDependenciesChange = useCallback((updater: (prev: Dependency[]) => Dependency[]) => {
      if (effectiveIsViewOnly) return;
      setProjectDocuments(prevDocs => {
          if (prevDocs.length === 0) return prevDocs;
          const newDocs = [...prevDocs];
          const masterDoc = { ...newDocs.find(d => d.isVisible) || newDocs[0] };
          const currentDeps = masterDoc.dependencies ?? [];
          masterDoc.dependencies = updater(currentDeps);
          const masterDocIndex = newDocs.findIndex(d => d.fileName === masterDoc.fileName);
          if(masterDocIndex !== -1) newDocs[masterDocIndex] = masterDoc;
          else newDocs[0] = masterDoc;
          return newDocs;
      });
  }, [effectiveIsViewOnly]);

  const salMarkers = useMemo(() => projectDocuments[0]?.salMarkers ?? [], [projectDocuments]);

  const handleSetSalMarkers = useCallback((updater: React.SetStateAction<number[]>) => {
    if (effectiveIsViewOnly) return;
    setProjectDocuments(prevDocs => {
      if (prevDocs.length === 0) return prevDocs;
      const newDocs = [...prevDocs];
      const firstDoc = { ...newDocs[0] };
      const currentMarkers = firstDoc.salMarkers ?? [];
      firstDoc.salMarkers = typeof updater === 'function' ? updater(currentMarkers) : updater;
      newDocs[0] = firstDoc;
      return newDocs;
    });
  }, [effectiveIsViewOnly]);

  // ... (Chat, Risk, Share functions - unchanged) ...
  const handleOpenChat = () => {
    if (chatMessages.length === 0) {
      setChatMessages([
        { sender: 'ai', text: 'Ciao! Sono il tuo assistente AI per questo progetto. Chiedimi qualsiasi cosa sui documenti che hai caricato o sulle spese sostenute.' }
      ]);
    }
    setIsChatOpen(true);
  };

  const handleSendMessage = async (message: string) => {
    const newUserMessage: Message = { sender: 'user', text: message };
    setChatMessages(prev => [...prev, newUserMessage]);
    setIsChatLoading(true);
    try {
      const aiResponse = await getProjectInsight(projectDocuments, expenses, message);
      const newAiMessage: Message = { sender: 'ai', text: aiResponse };
      setChatMessages(prev => [...prev, newAiMessage]);
    } catch (err) {
      console.error(err);
      const errorMessage: Message = { sender: 'ai', text: 'Oops! Qualcosa è andato storto. Riprova.' };
      setChatMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleRiskAnalysis = async () => {
    if (projectDocuments.length === 0) return;
    setIsAnalyzingRisks(true);
    setRisks(null);
    setError(null);
    try {
      const analysisResult = await getRiskAnalysis(projectDocuments);
      setRisks(analysisResult);
    } catch (err: any) {
      setError(err.message || "An unknown error occurred during risk analysis.");
      setRisks(null);
    } finally {
      setIsAnalyzingRisks(false);
    }
  };

  const handleOpenShareModal = () => {
    const dataToShare = { projectDocuments, expenses, projectName, teams, workers, contractConfig, sals };
    const data = JSON.stringify(dataToShare);
    const encodedData = btoa(data);
    const url = `${window.location.origin}${window.location.pathname}?mode=view&data=${encodedData}`;
    setShareableLink(url);
    setIsShareModalOpen(true);
  };
  
  const handleExport = async () => {
    if (projectDocuments.length === 0 && expenses.length === 0) return;
    
    const currentTime = new Date().toISOString();
    setLastSavedTime(currentTime);

    const safeName = projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'progetto';
    let defaultFileName = `${safeName}_contabilita_${currentTime.split('T')[0]}.json`;

    const projectData = { 
        projectDocuments, 
        expenses, 
        projectName, 
        teams, 
        workers,
        contractConfig,
        sals,
        lastSavedTime: currentTime 
    };
    const dataStr = JSON.stringify(projectData, null, 2);

    const downloadViaAnchor = (name: string) => {
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    if ('showSaveFilePicker' in window) {
        try {
            const handle = await (window as any).showSaveFilePicker({
                suggestedName: defaultFileName,
                types: [{
                    description: 'JSON File',
                    accept: { 'application/json': ['.json'] },
                }],
            });
            
            const writable = await handle.createWritable();
            await writable.write(dataStr);
            await writable.close();
        } catch (err: any) {
            if (err.name === 'AbortError') return;
            const userFileName = prompt("Impossibile aprire il selettore file. Scegli il nome del file:", defaultFileName);
            if (userFileName) downloadViaAnchor(userFileName);
        }
    } else {
        const userFileName = prompt("Scegli il nome del file per il download:", defaultFileName);
        if (userFileName) downloadViaAnchor(userFileName);
    }
  };

  // --- SAVE TO GOOGLE DRIVE HANDLER ---
  const handleSaveToDrive = async () => {
      const currentTime = new Date().toISOString();
      setLastSavedTime(currentTime);
      const safeName = projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'progetto';
      const fileName = `${safeName}_${currentTime.split('T')[0]}.json`;
      
      const projectData = { 
          projectDocuments, 
          expenses, 
          projectName, 
          teams, 
          workers,
          contractConfig,
          sals,
          lastSavedTime: currentTime 
      };
      const dataStr = JSON.stringify(projectData, null, 2);

      try {
          await saveToGoogleDrive(fileName, dataStr);
      } catch (err: any) {
          console.error("Drive upload failed", err);
          alert("Errore durante il salvataggio su Drive: " + err.message);
      }
  };

  // ... (Other handlers unchanged) ...
  const handleImportClick = () => {
    if (isDemoMode) {
      alert("L'importazione di nuovi file non è disponibile in modalità demo.");
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      Array.from(event.target.files).forEach(file => handleFileUpload(file));
      event.target.value = '';
    }
  };

  const handleOpenTaskModal = (group: WorkGroup) => {
    const parentDoc = projectDocuments.find(doc => doc.workGroups.some(wg => wg.id === group.id));
    setIsCurrentTaskLocked(parentDoc?.isLocked ?? false);
    setSelectedTask(group);
  };

  const handleCloseTaskModal = useCallback(() => {
      setSelectedTask(null);
  }, []);

  const handleAddExpense = useCallback((expense: Omit<Expense, 'id' | 'insertionDate'>) => {
      setExpenses(prev => [...prev, { ...expense, id: crypto.randomUUID(), insertionDate: new Date().toISOString() }].sort((a, b) => new Date(b.insertionDate).getTime() - new Date(a.insertionDate).getTime()));
  }, []);
  
  const handleUpdateExpense = useCallback((updatedExpense: Expense) => {
      setExpenses(prev => prev.map(e => e.id === updatedExpense.id ? updatedExpense : e).sort((a, b) => new Date(b.insertionDate).getTime() - new Date(a.insertionDate).getTime()));
  }, []);

  const handleUpdateExpenseSupplyDate = useCallback((expenseId: string, newSupplyDate: string) => {
    setExpenses(prev => prev.map(e => e.id === expenseId ? { ...e, expectedSupplyDate: newSupplyDate } : e));
  }, []);

  const handleDeleteExpense = useCallback((expenseId: string) => {
      setExpenses(prev => prev.filter(e => e.id !== expenseId));
  }, []);

  const handleAddTeam = useCallback((team: Team) => { setTeams(prev => [...prev, team]); }, []);
  const handleUpdateTeam = useCallback((team: Team) => { setTeams(prev => prev.map(t => t.id === team.id ? team : t)); }, []);
  const handleDeleteTeam = useCallback((teamId: string) => { setTeams(prev => prev.filter(t => t.id !== teamId)); setWorkers(prev => prev.map(w => w.teamId === teamId ? { ...w, teamId: undefined } : w)); }, []);
  const handleAddWorker = useCallback((worker: Worker) => { setWorkers(prev => [...prev, worker]); }, []);
  const handleUpdateWorker = useCallback((worker: Worker) => { setWorkers(prev => prev.map(w => w.id === worker.id ? worker : w)); }, []);
  const handleDeleteWorker = useCallback((workerId: string) => { setWorkers(prev => prev.filter(w => w.id !== workerId)); }, []);

  const handleOpenProject = (project: SavedProject) => {
      setProjectDocuments(project.data.projectDocuments);
      setExpenses(project.data.expenses);
      setProjectName(project.name);
      setLastSavedTime(project.lastModified);
      if(project.contractConfig) setContractConfig(project.contractConfig);
      if(project.data.sals) setSals(project.data.sals);
      
      const projectTeams = project.data.teams || [];
      const projectWorkers = project.data.workers || [];

      setTeams(prevTeams => {
          const teamMap = new Map(prevTeams.map(t => [t.id, t]));
          projectTeams.forEach(t => teamMap.set(t.id, t));
          return Array.from(teamMap.values());
      });

      setWorkers(prevWorkers => {
          const workerMap = new Map(prevWorkers.map(w => [w.id, w]));
          projectWorkers.forEach(w => workerMap.set(w.id, w));
          return Array.from(workerMap.values());
      });
      
      setCurrentProjectId(project.id);
      setActiveView('dashboard');
  };

  const handleCreateProject = () => {
      setProjectDocuments([]);
      setExpenses([]);
      setProjectName("Nuovo Cantiere");
      setLastSavedTime(null);
      setContractConfig(undefined);
      setSals([]);
      const newId = crypto.randomUUID();
      setCurrentProjectId(newId);
      setActiveView('dashboard');
      setTimeout(() => { handleImportClick(); }, 100);
  };

  const handleDeleteProject = (projectId: string) => {
      const projectToDelete = savedProjects.find(p => p.id === projectId);
      if (projectToDelete) {
          try {
              const backupData = { projectDocuments: projectToDelete.data.projectDocuments, expenses: projectToDelete.data.expenses, projectName: projectToDelete.name, teams: projectToDelete.data.teams, workers: projectToDelete.data.workers, contractConfig: projectToDelete.contractConfig, sals: projectToDelete.data.sals };
              const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `BACKUP_ELIMINATO_${projectToDelete.name.replace(/[^a-z0-9]/gi, '_')}.json`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
          } catch (e) { console.error("Backup download failed", e); }
      }
      setSavedProjects(prev => {
          const updated = prev.filter(p => p.id !== projectId);
          localStorage.setItem('chronos_projects', JSON.stringify(updated));
          return updated;
      });
  };

  const handleArchiveProject = (projectId: string) => {
      setSavedProjects(prev => {
          const updated = prev.map(p => p.id === projectId ? { ...p, status: 'archived' as const, lastModified: new Date().toISOString() } : p);
          localStorage.setItem('chronos_projects', JSON.stringify(updated));
          return updated;
      });
  };

  const handleRestoreProject = (projectId: string) => {
      setSavedProjects(prev => {
          const updated = prev.map(p => p.id === projectId ? { ...p, status: 'active' as const, lastModified: new Date().toISOString() } : p);
          localStorage.setItem('chronos_projects', JSON.stringify(updated));
          return updated;
      });
  };

  const handleExitProject = () => {
      saveCurrentProject();
      setCurrentProjectId(null);
      setIsDemoMode(false);
      setLastSavedTime(null);
  };

  // ... (Project Summary Logic - unchanged) ...
  const visibleDocuments = useMemo(() => projectDocuments.filter(doc => doc.isVisible ?? true), [projectDocuments]);
  const allWorkGroups = useMemo(() => visibleDocuments.flatMap(doc => doc.workGroups), [visibleDocuments]);
  const allDependencies = useMemo(() => visibleDocuments.flatMap(doc => doc.dependencies ?? []), [visibleDocuments]);
  const isProjectLoaded = useMemo(() => projectDocuments.length > 0 || expenses.length > 0 || currentProjectId !== null, [projectDocuments, expenses, currentProjectId]);

  const projectSummaryStats = useMemo(() => {
    if (!isProjectLoaded) return null;
    const grandTotal = projectDocuments.reduce((acc, doc) => {
        const docTotal = doc.workGroups.reduce((gAcc, group) => {
            const groupTotal = group.items.reduce((iAcc, item) => {
                const varTotal = (item.variations || []).reduce((vAcc, v) => v.type === 'increase' ? vAcc + v.quantity : vAcc - v.quantity, 0);
                return iAcc + ((item.quantity + varTotal) * item.unitPrice);
            }, 0);
            return gAcc + groupTotal;
        }, 0);
        return acc + docTotal;
    }, 0);

    const earnedValue = projectDocuments
        .filter(doc => !(doc.isFrozen ?? false))
        .reduce((acc, doc) => 
            acc + doc.workGroups.reduce((groupAcc, group) => {
                 const groupMeasuredValue = group.items.reduce((iAcc, item) => {
                     return iAcc + (item.measurements || []).reduce((mAcc, m) => mAcc + (m.quantity * item.unitPrice), 0);
                 }, 0);
                 return groupAcc + groupMeasuredValue;
            }, 0), 0);

    const overallProgress = grandTotal > 0 ? (earnedValue / grandTotal) * 100 : 0;
    const totalCosts = expenses.reduce((acc, expense) => acc + expense.amount, 0);
    return { grandTotal, earnedValue, overallProgress, totalCosts };
  }, [projectDocuments, expenses, isProjectLoaded]);
  
  const shouldShowSummary = useMemo(() => {
    if (!isProjectLoaded) return false;
    if (activeView === 'timeline') return isEconomicViewVisible;
    if (activeView === 'summary') return true;
    return false;
  }, [isProjectLoaded, activeView, isEconomicViewVisible]);

  if (isLoading && !isLoggedIn) return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900"><Loader /></div>
  
  if (!isLoggedIn) {
    // ... (Login view) ...
    return <Login onLoginSuccess={handleLoginSuccess} onEnterDemoMode={handleEnterDemoMode} />;
  }

  if (!currentProjectId && !isShareMode && activeView !== 'external-computo') {
      return <PortfolioView 
                projects={savedProjects} 
                globalTeams={teams}
                globalWorkers={workers}
                onOpenProject={handleOpenProject} 
                onCreateProject={handleCreateProject} 
                onDeleteProject={handleDeleteProject}
                onArchiveProject={handleArchiveProject}
                onRestoreProject={handleRestoreProject}
                onLoadDemo={handleEnterDemoMode}
                onUpdateProjectMeta={handleUpdateSavedProject}
                onLogout={handleReset}
                onOpenExternalComputo={() => setActiveView('external-computo')}
             />;
  }
  
  const renderContent = () => {
    if (isLoading && !isProjectLoaded && activeView !== 'external-computo') return <div className="flex items-center justify-center h-full flex-grow"><Loader /></div>;
    // ... (Switch cases) ...
    switch(activeView) {
      case 'dashboard': return <Dashboard projectSummary={projectSummaryStats} risks={risks} onViewChange={setActiveView} documentCount={projectDocuments.length} onImport={handleImportClick} isProjectLoaded={isProjectLoaded} isDemoMode={isDemoMode} />;
      case 'timeline': return projectDocuments.length > 0 ? <GanttChart workGroups={allWorkGroups} dependencies={allDependencies} expenses={expenses} setWorkGroups={handleWorkGroupsUpdate} onDependenciesChange={handleDependenciesChange} isViewOnly={effectiveIsViewOnly} onBarDoubleClick={handleOpenTaskModal} isEconomicViewVisible={isEconomicViewVisible} onToggleEconomicView={() => setIsEconomicViewVisible(prev => !prev)} onUpdateExpenseSupplyDate={handleUpdateExpenseSupplyDate} projectName={projectName} /> : null;
      case 'summary': return projectDocuments.length > 0 ? <ComputoDetailView documents={visibleDocuments} onToggleGroupSecurity={handleToggleGroupSecurity} /> : null;
      case 'measurements': return projectDocuments.length > 0 ? <MeasurementsView documents={visibleDocuments} projectName={projectName} teams={teams} workers={workers} /> : null;
      case 'costs': return <CostsView expenses={expenses} workGroups={allWorkGroups} onAddExpense={handleAddExpense} onUpdateExpense={handleUpdateExpense} onDeleteExpense={handleDeleteExpense} isViewOnly={effectiveIsViewOnly} earnedValue={projectSummaryStats?.earnedValue ?? 0} />;
      case 'teams': return <TeamManagementView teams={teams} workers={workers} onAddTeam={handleAddTeam} onUpdateTeam={handleUpdateTeam} onDeleteTeam={handleDeleteTeam} onAddWorker={handleAddWorker} onUpdateWorker={handleUpdateWorker} onDeleteWorker={handleDeleteWorker} isViewOnly={effectiveIsViewOnly} />;
      case 'reports': return <ReportsView documents={projectDocuments} teams={teams} workers={workers} />;
      case 'accounting': return <AccountingView documents={projectDocuments} projectName={projectName} contractConfig={contractConfig} onUpdateContractConfig={setContractConfig} sals={sals} onUpdateSals={setSals} onToggleGroupSecurity={handleToggleGroupSecurity} />;
      case 'help': return <UserManualView />;
      case 'external-computo':
        // Generazione Token di Sicurezza per SSO (Single Sign-On)
        // Crea una stringa "CHRONOS_USER:email:data" e la codifica in Base64
        const authToken = btoa(`CHRONOS_ACCESS:${userEmail}:${new Date().toISOString().split('T')[0]}`);
        const secureUrl = `${EXTERNAL_COMPUTO_URL}?auth=${authToken}`;

        return (
            <div className="fixed inset-0 z-50 bg-white flex flex-col">
                {/* Minimal Header for Navigation Back */}
                <div className="bg-gray-900 text-white p-2 flex justify-between items-center shadow-md flex-shrink-0">
                    <div className="flex items-center gap-3">
                         <h1 className="font-bold text-lg px-4">Gecola AI Computo</h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <a
                            href={secureUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded transition-colors text-sm font-bold"
                            title="Apre in una nuova scheda per abilitare il Salva con Nome completo"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            Apri Esterna
                        </a>
                        <button
                            onClick={() => setActiveView('dashboard')}
                            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded transition-colors text-sm font-bold"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                            </svg>
                            Torna a Chronos
                        </button>
                    </div>
                </div>
                <iframe 
                    src={secureUrl} 
                    className="flex-grow w-full border-none" 
                    title="Nuovo Computo"
                    // Reintrodotto sandbox con permessi espliciti per la massima compatibilità standard
                    sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts allow-downloads allow-pointer-lock"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; microphone; camera; display-capture; fullscreen; geolocation;"
                >
                </iframe>
            </div>
        );
      default: return null;
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-sans">
      <input type="file" ref={fileInputRef} onChange={handleFileSelect} multiple accept=".txt,.csv,.md,.json,.pdf" className="hidden" />
      <div className="flex h-screen">
          <Sidebar activeView={activeView} onViewChange={setActiveView} isProjectLoaded={isProjectLoaded} onLogout={handleReset} isViewOnly={effectiveIsViewOnly} onExitProject={handleExitProject} />
          <div className="flex-1 flex flex-col ml-64">
            <Header 
              userEmail={userEmail} remainingDays={remainingDays} serverDate={serverDate} onAnalyzeRisks={handleRiskAnalysis} isAnalyzingRisks={isAnalyzingRisks} onImport={handleImportClick} onExport={handleExport} onSaveToDrive={handleSaveToDrive} onShare={handleOpenShareModal} isProjectLoaded={isProjectLoaded} isAdmin={isAdmin} onGenerateLicense={() => setIsGeneratorModalOpen(true)} isViewOnly={effectiveIsViewOnly} isShareMode={isShareMode} isDemoMode={isDemoMode} isSessionExpired={isSessionExpired} sessionSecondsRemaining={sessionSecondsRemaining} projectName={projectName} onUpdateProjectName={setProjectName} lastSavedTime={lastSavedTime}
            />
            <main className="flex-grow p-4 md:p-6 overflow-y-auto">
              <div className="max-w-7xl mx-auto">
                {isSessionExpired && <div className="mb-6 p-4 bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-400 dark:border-yellow-600 text-yellow-800 dark:text-yellow-200 rounded-lg text-center"><p><span className="font-bold">Sessione Scaduta:</span> Le modifiche sono state disabilitate.</p></div>}
                 {shouldShowSummary && <ProjectSummary documents={projectDocuments} isViewOnly={effectiveIsViewOnly} salMarkers={salMarkers} onSalMarkersChange={handleSetSalMarkers} onToggleDocumentVisibility={handleToggleDocumentVisibility} onToggleDocumentFreeze={handleToggleDocumentFreeze} onToggleDocumentLock={handleToggleDocumentLock} onRenameDocument={handleRenameDocument} onDeleteDocument={handleDeleteDocument} />}
                  <div className="my-6"><RiskAnalysisPanel risks={risks} isLoading={isAnalyzingRisks} onClose={() => setRisks(null)} /></div>
                  <div className="bg-white dark:bg-gray-800 shadow-xl rounded-2xl overflow-hidden min-h-[400px] flex flex-col">{renderContent()}</div>
              </div>
            </main>
          </div>
      </div>
      {!effectiveIsViewOnly && isProjectLoaded && <ChatAssistantButton onClick={handleOpenChat} />}
      <ChatModal isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} messages={chatMessages} onSendMessage={handleSendMessage} isLoading={isChatLoading} />
      <TaskModal isOpen={!!selectedTask} onClose={handleCloseTaskModal} group={selectedTask} allWorkGroups={allWorkGroups} dependencies={allDependencies} setWorkGroups={handleWorkGroupsUpdate} onDependenciesChange={handleDependenciesChange} isViewOnly={effectiveIsViewOnly} isLocked={isCurrentTaskLocked} teams={teams} workers={workers} />
      <ShareModal isOpen={isShareModalOpen} onClose={() => setIsShareModalOpen(false)} link={shareableLink} />
      {isAdmin && <LicenseGeneratorModal isOpen={isGeneratorModalOpen} onClose={() => setIsGeneratorModalOpen(false)} />}
    </div>
  );
};

export default App;
