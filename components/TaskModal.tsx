
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { WorkGroup, WorkItem, Measurement, Dependency, DependencyType, Team, Worker, Annotation, Variation } from '../types';
import { format, parseISO, addDays } from 'date-fns';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: WorkGroup | null;
  allWorkGroups: WorkGroup[];
  dependencies: Dependency[];
  setWorkGroups: (updater: React.SetStateAction<WorkGroup[]>) => void;
  onDependenciesChange: (updater: (prev: Dependency[]) => Dependency[]) => void;
  isViewOnly?: boolean;
  isLocked?: boolean;
  teams: Team[];
  workers: Worker[];
}

// Extended type to track UI state locally without changing global types
interface ExtendedMeasurement extends Measurement {
    _isCommitted?: boolean; // True if loaded from saved state, False if just added
}

interface ExtendedWorkItem extends Omit<WorkItem, 'measurements'> {
    measurements?: ExtendedMeasurement[];
    annotations?: Annotation[];
    variations?: Variation[];
}

interface ExtendedWorkGroup extends Omit<WorkGroup, 'items'> {
    items: ExtendedWorkItem[];
}

// Local state for the input fields
interface MeasurementInputState {
    quantity: string;
    note: string;
    factor: string;
    length: string;
    width: string;
    height: string;
}

const currencyFormatter = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const numberFormatter = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dependencyTypeLabels: Record<DependencyType, string> = {
    FS: 'Fine-Inizio (FS)',
    SS: 'Inizio-Inizio (SS)',
    FF: 'Fine-Fine (FF)',
    SF: 'Inizio-Fine (SF)',
};

const TaskModal: React.FC<TaskModalProps> = ({ isOpen, onClose, group, allWorkGroups, dependencies, setWorkGroups, onDependenciesChange, isViewOnly, isLocked, teams, workers }) => {
  const [activeTab, setActiveTab] = useState('measurements');
  const [activeGroup, setActiveGroup] = useState<ExtendedWorkGroup | null>(null);
  
  // Global Context State (Header)
  const [stickyDate, setStickyDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [globalTeamId, setGlobalTeamId] = useState<string>('');
  const [globalWorkerIds, setGlobalWorkerIds] = useState<string[]>([]);

  // Input State
  const [newMeasurements, setNewMeasurements] = useState<Record<string, MeasurementInputState>>({});
  const [deductionModes, setDeductionModes] = useState<Record<string, boolean>>({}); 
  const [newAnnotations, setNewAnnotations] = useState<Record<string, string>>({}); 
  
  const [activeFocus, setActiveFocus] = useState<{ itemCode: string, field: keyof MeasurementInputState } | null>(null);
  const activeFocusRef = useRef<{ itemCode: string, field: keyof MeasurementInputState } | null>(null);

  const quantityInputsRef = useRef<Record<string, HTMLInputElement | null>>({});
  const noteInputsRef = useRef<Record<string, HTMLInputElement | null>>({}); 
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [expandedDiaries, setExpandedDiaries] = useState<Set<string>>(new Set());
  
  // Configuration Lock State
  const [isOptionsLocked, setIsOptionsLocked] = useState(true);
  
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false); 

  // Variation Modal State
  const [variationItemCode, setVariationItemCode] = useState<string | null>(null);

  // Dependency state
  const [newDependency, setNewDependency] = useState<{ targetId: string; type: DependencyType; lag: string, direction: 'predecessor' | 'successor' }>({
    targetId: '',
    type: 'FS',
    lag: '0',
    direction: 'predecessor'
  });

  // Variation Form State
  const [variationForm, setVariationForm] = useState<{ quantity: string; number: string; type: 'increase' | 'decrease'; note: string }>({ quantity: '', number: '', type: 'increase', note: '' });

  useEffect(() => {
      activeFocusRef.current = activeFocus;
  }, [activeFocus]);

  useEffect(() => {
    if (isOpen && group) {
        setActiveTab('measurements');
        let migratedGroup = { ...group } as ExtendedWorkGroup;
        
        // Ensure new fields are present
        if (!migratedGroup.accountingType) migratedGroup.accountingType = 'measure';
        if (migratedGroup.isSecurityCost === undefined) migratedGroup.isSecurityCost = false;

        let migrationHappened = false;

        // 1. Data Migration (Legacy Fix)
        const itemsWithMigratedMeasurements = migratedGroup.items.map(item => {
            const officialStartMeasurement = item.measurements?.find(m => m.note === 'Inizio ufficiale lavori.');
            if (officialStartMeasurement && !migratedGroup.officialStartDate) {
                migratedGroup.officialStartDate = officialStartMeasurement.date;
                migratedGroup.startDate = officialStartMeasurement.date;
                const newEndDate = addDays(parseISO(officialStartMeasurement.date), migratedGroup.duration - 1);
                migratedGroup.endDate = format(newEndDate, 'yyyy-MM-dd');
                migrationHappened = true;
                return {
                    ...item,
                    measurements: item.measurements?.filter(m => m.note !== 'Inizio ufficiale lavori.')
                };
            }
            return item;
        });

        // 2. Flag existing measurements as "Committed"
        const itemsWithFlags = (migrationHappened ? itemsWithMigratedMeasurements : migratedGroup.items).map(item => ({
            ...item,
            measurements: item.measurements?.map(m => ({ 
                ...m, 
                _isCommitted: true,
                id: m.id || crypto.randomUUID() 
            })) || [],
            annotations: item.annotations || [],
            variations: item.variations || []
        }));

        migratedGroup.items = itemsWithFlags;
        
        setActiveGroup(migratedGroup);
        setIsDirty(false);
        setIsOptionsLocked(true); 

        const initialMeasurements: Record<string, MeasurementInputState> = {};
        const initialAnnotations: Record<string, string> = {};
        const initialDeductions: Record<string, boolean> = {};
        
        migratedGroup.items.forEach(item => {
            initialMeasurements[item.articleCode] = { 
                quantity: '', 
                note: '',
                factor: '',
                length: '',
                width: '',
                height: ''
            };
            initialAnnotations[item.articleCode] = '';
            initialDeductions[item.articleCode] = false;
        });
        
        setNewMeasurements(initialMeasurements);
        setNewAnnotations(initialAnnotations);
        setDeductionModes(initialDeductions);
        
        setVariationForm({ quantity: '', number: '', type: 'increase', note: '' });

        // LOGICA DATA DEFAULT
        const allDates = itemsWithFlags
            .flatMap(i => i.measurements || [])
            .map(m => m.date)
            .sort();
        
        let defaultDate = '';
        if (allDates.length > 0) {
            defaultDate = allDates[allDates.length - 1];
        } else {
            defaultDate = migratedGroup.officialStartDate || migratedGroup.startDate;
        }

        setStickyDate(defaultDate);
        
        setGlobalTeamId(''); 
        setGlobalWorkerIds([]); 
        setIsVoiceEnabled(false);
        setActiveFocus(null);
        
        setNewDependency({ targetId: '', type: 'FS', lag: '0', direction: 'predecessor' });
    }
  }, [isOpen, group]);
  
  const handleInputFocus = (itemCode: string, field: keyof MeasurementInputState) => {
      setActiveFocus({ itemCode, field });
  };
  
  const handleInputBlur = () => {
      setActiveFocus(null);
  };

  const handleAttemptClose = useCallback(() => {
    if (isDirty && !(isViewOnly || isLocked)) {
        if (window.confirm('Hai delle modifiche non salvate che andranno perse. Sei sicuro di voler uscire?')) {
            onClose();
        }
    } else {
        onClose();
    }
  }, [isDirty, isViewOnly, isLocked, onClose]);

  const handleTeamChange = (newTeamId: string) => { setGlobalTeamId(newTeamId); setGlobalWorkerIds([]); };

  const toggleDeductionMode = (articleCode: string) => {
      setDeductionModes(prev => ({ ...prev, [articleCode]: !prev[articleCode] }));
  };

  const handleMeasurementChange = (articleCode: string, field: keyof MeasurementInputState, value: string) => {
    if (isViewOnly || isLocked) return;
    setIsDirty(true);
    setNewMeasurements(prev => {
        const currentItemState = { ...prev[articleCode], [field]: value };
        return { ...prev, [articleCode]: currentItemState };
    });
  };

  const toggleDiary = (articleCode: string) => { setExpandedDiaries(prev => { const next = new Set(prev); if (next.has(articleCode)) next.delete(articleCode); else next.add(articleCode); return next; }); };
  const openVariationModal = (articleCode: string) => { setVariationItemCode(articleCode); setVariationForm({ quantity: '', number: '', type: 'increase', note: '' }); };
  const closeVariationModal = () => { setVariationItemCode(null); };
  const handleVariationFormChange = (field: string, value: any) => { setVariationForm(prev => ({ ...prev, [field]: value })); };
  
  const handleAddVariation = () => { 
      if (!activeGroup || !variationItemCode) return;
      const qty = parseFloat(variationForm.quantity);
      if (isNaN(qty) || qty <= 0 || !variationForm.number) { alert("Dati non validi"); return; }
      
      const newVariation: Variation = {
          id: crypto.randomUUID(),
          number: variationForm.number,
          date: stickyDate,
          type: variationForm.type,
          quantity: qty,
          note: variationForm.note
      };

      setActiveGroup(prev => {
          if (!prev) return null;
          const updatedItems = prev.items.map(item => item.articleCode === variationItemCode ? { ...item, variations: [...(item.variations || []), newVariation] } : item);
          return { ...prev, items: updatedItems };
      });
      setVariationItemCode(null);
      setIsDirty(true);
  };

  const handleOfficializeStart = () => { 
      if (!activeGroup || isViewOnly || isLocked) return;
      setActiveGroup(prev => prev ? ({ ...prev, officialStartDate: stickyDate }) : null);
      setIsDirty(true);
  };

  const handleAddMeasurement = (itemArticleCode: string) => {
    if (!activeGroup || isViewOnly || isLocked) return;
    const measurementInput = newMeasurements[itemArticleCode];
    const itemToUpdate = activeGroup.items.find(item => item.articleCode === itemArticleCode);
    if (!itemToUpdate) return;
    
    // Auto-fill logic: if input is empty, use residual quantity
    let quantityStr = measurementInput.quantity.replace(',', '.');
    let quantity = 0;

    if (quantityStr.trim() === '') {
        // Calculate Residual: (Original + Variations) - Already Measured
        const variationsTotal = (itemToUpdate.variations || []).reduce((acc, v) => v.type === 'increase' ? acc + v.quantity : acc - v.quantity, 0);
        const effectiveTotalQuantity = itemToUpdate.quantity + variationsTotal;
        const measuredTotal = (itemToUpdate.measurements || []).reduce((acc, m) => acc + m.quantity, 0);
        quantity = effectiveTotalQuantity - measuredTotal;
        
        // Round to 3 decimals to avoid floating point errors
        quantity = Math.round(quantity * 1000) / 1000;
    } else {
        quantity = parseFloat(quantityStr) || 0;
    }

    if (deductionModes[itemArticleCode]) quantity = -Math.abs(quantity);

    if (quantity === 0) return; // Prevent adding 0 measurements

    const newMeasurement: ExtendedMeasurement = {
        id: crypto.randomUUID(), 
        date: stickyDate,
        quantity: quantity,
        note: measurementInput.note || 'Misura',
        teamId: globalTeamId || undefined,
        workerIds: globalWorkerIds.length > 0 ? globalWorkerIds : undefined,
        _isCommitted: false,
        factor: measurementInput.factor ? parseFloat(measurementInput.factor) : undefined,
        length: measurementInput.length ? parseFloat(measurementInput.length) : undefined,
        width: measurementInput.width ? parseFloat(measurementInput.width) : undefined,
        height: measurementInput.height ? parseFloat(measurementInput.height) : undefined
    };

    setActiveGroup(prev => {
        if (!prev) return null;
        const updatedItems = prev.items.map(item => item.articleCode === itemArticleCode ? { ...item, measurements: [...(item.measurements || []), newMeasurement] } : item);
        
        // Calculate new progress based on VALUE PRODUCED (works for both Measure and Body)
        const newTotalMeasuredValue = updatedItems.reduce((total, item) => total + ((item.measurements || []).reduce((acc, m) => acc + m.quantity, 0) * item.unitPrice), 0);
        const newProgress = prev.value > 0 ? (newTotalMeasuredValue / prev.value) * 100 : 0;
        
        let updatedGroup = { ...prev, items: updatedItems, progress: newProgress };
        if (!updatedGroup.officialStartDate) updatedGroup.officialStartDate = stickyDate;
        return updatedGroup;
    });
    setNewMeasurements(prev => ({ ...prev, [itemArticleCode]: { quantity: '', note: '', factor: '', length: '', width: '', height: '' } }));
    setIsDirty(true);
  };

  const handleDeleteMeasurement = (itemArticleCode: string, measurementIndex: number) => { 
      if (isViewOnly || isLocked) return; 
      setActiveGroup(prev => { 
          if (!prev) return null; 
          const updatedItems = prev.items.map(item => { 
              if (item.articleCode === itemArticleCode && item.measurements) { 
                  const newMeasurements = [...item.measurements]; 
                  newMeasurements.splice(measurementIndex, 1); 
                  return { ...item, measurements: newMeasurements }; 
              } 
              return item; 
          }); 
          const newTotalMeasuredValue = updatedItems.reduce((total, i) => total + ((i.measurements || []).reduce((acc, m) => acc + m.quantity, 0) * i.unitPrice), 0);
          const newProgress = prev.value > 0 ? (newTotalMeasuredValue / prev.value) * 100 : 0;
          return { ...prev, items: updatedItems, progress: newProgress }; 
      }); 
      setIsDirty(true); 
  };
  
  const handleReverseMeasurement = (e: React.MouseEvent, itemArticleCode: string, measurementIndex: number) => {
    e.preventDefault(); e.stopPropagation();
    if (isViewOnly || isLocked || !activeGroup) return;
    const targetItemIndex = activeGroup.items.findIndex(i => i.articleCode === itemArticleCode);
    if (targetItemIndex === -1) return;
    const targetMeasurement = activeGroup.items[targetItemIndex].measurements?.[measurementIndex];
    if (!targetMeasurement || targetMeasurement.quantity < 0) return;
    
    const reversalMeasurement: ExtendedMeasurement = {
        id: crypto.randomUUID(), 
        date: stickyDate || format(new Date(), 'yyyy-MM-dd'),
        quantity: -targetMeasurement.quantity,
        note: `STORNO: ${targetMeasurement.note || ''}`,
        teamId: targetMeasurement.teamId,
        workerIds: targetMeasurement.workerIds,
        _isCommitted: false
    };

    const newGroup = { ...activeGroup };
    newGroup.items = [...newGroup.items];
    newGroup.items[targetItemIndex] = { ...newGroup.items[targetItemIndex], measurements: [...(newGroup.items[targetItemIndex].measurements || []), reversalMeasurement] };
    
    const newTotalMeasuredValue = newGroup.items.reduce((total, i) => total + ((i.measurements || []).reduce((acc, m) => acc + m.quantity, 0) * i.unitPrice), 0);
    newGroup.progress = newGroup.value > 0 ? (newTotalMeasuredValue / newGroup.value) * 100 : 0;
    
    setActiveGroup(newGroup); setIsDirty(true);
  };
  
  const handleAddDependency = () => { 
      if (!activeGroup || !newDependency.targetId || isViewOnly || isLocked) return;
      const newDep: Omit<Dependency, 'id'> = {
          from: newDependency.direction === 'successor' ? activeGroup.id : newDependency.targetId,
          to: newDependency.direction === 'successor' ? newDependency.targetId : activeGroup.id,
          type: newDependency.type,
          lag: parseInt(newDependency.lag) || 0
      };
      onDependenciesChange(prev => [...prev, { ...newDep, id: crypto.randomUUID() }]);
      setNewDependency(prev => ({ ...prev, targetId: '' }));
  };

  const handleDeleteDependency = (id: string) => {
      if (isViewOnly || isLocked) return;
      onDependenciesChange(prev => prev.filter(d => d.id !== id));
  };
  
  const handleSaveChanges = () => { 
      if (!activeGroup || isViewOnly || isLocked) return; 
      const cleanGroup: WorkGroup = { 
          ...activeGroup, 
          // Ensure accounting type is preserved
          accountingType: activeGroup.accountingType,
          items: activeGroup.items.map(item => ({ 
              ...item, 
              measurements: item.measurements?.map(m => { const { _isCommitted, ...rest } = m; return rest; }) 
          })) 
      }; 
      setWorkGroups(prevGroups => prevGroups.map(g => g.id === activeGroup.id ? cleanGroup : g)); 
      onClose(); 
  };

  const handleAccountingTypeChange = (type: 'measure' | 'body') => {
      if (isViewOnly || isLocked || !activeGroup || isOptionsLocked) return;
      setActiveGroup(prev => prev ? ({ ...prev, accountingType: type }) : null);
      setIsDirty(true);
  };

  const handleSecurityToggle = () => {
      if (isViewOnly || isLocked || !activeGroup || isOptionsLocked) return;
      setActiveGroup(prev => prev ? ({ ...prev, isSecurityCost: !prev.isSecurityCost }) : null);
      setIsDirty(true);
  };

  const handleToggleOptionsLock = () => { 
      if (isOptionsLocked) { if (window.confirm("Attenzione: Modificare la natura contabile di una lavorazione in corso può causare incongruenze nei SAL. Sei sicuro di voler sbloccare?")) setIsOptionsLocked(false); } 
      else setIsOptionsLocked(true); 
  };

  const modalVariationItem = variationItemCode ? activeGroup?.items.find(i => i.articleCode === variationItemCode) : null;
  if (!isOpen || !activeGroup) return null;

  // Recalculate totals for display based on measured value (Price * Qty)
  const totalMeasuredValue = activeGroup.items.reduce((total, item) => total + ((item.measurements || []).reduce((acc, m) => acc + m.quantity, 0) * item.unitPrice), 0);
  const calculatedProgress = activeGroup.value > 0 ? (totalMeasuredValue / activeGroup.value) * 100 : 0;
  
  const predecessors = dependencies.filter(d => d.to === activeGroup.id);
  const successors = dependencies.filter(d => d.from === activeGroup.id);
  const availableTasksForDependency = allWorkGroups.filter(wg => wg.id !== activeGroup.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60" onClick={handleAttemptClose}>
      <div className="relative w-full max-w-6xl h-[95vh] bg-white dark:bg-gray-800 rounded-lg shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex-shrink-0 bg-white dark:bg-gray-800 z-10 rounded-t-lg">
            {/* Banner - Updated to show Summary */}
            <div className={`w-full py-2 px-4 flex items-center justify-center font-bold text-sm tracking-wide uppercase border-b-2 shadow-sm ${activeGroup.isSecurityCost ? 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-200 dark:border-orange-700' : 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-200 dark:border-green-700'}`}>
                <span>LAVORI {activeGroup.accountingType === 'body' ? 'A CORPO' : 'A MISURA'} {activeGroup.isSecurityCost ? '- ONERI SICUREZZA (NON SOGGETTI A RIBASSO)' : '(SOGGETTI A RIBASSO)'}</span>
            </div>

            {/* Title & Stats */}
            <div className="flex flex-col border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-start justify-between p-3 pb-1">
                    <div className="flex-1 mr-4 flex flex-col sm:flex-row sm:items-center sm:gap-4">
                        <h3 className="text-xl font-bold text-blue-600 dark:text-blue-400 truncate">{activeGroup.name}</h3>
                        <div className="flex items-center space-x-4 text-xs bg-gray-50 dark:bg-gray-700/50 px-3 py-1 rounded-full">
                            <div><span className="text-gray-500 dark:text-gray-400 mr-1">Avanzamento:</span><span className="font-bold text-indigo-600 dark:text-indigo-400">{currencyFormatter.format(totalMeasuredValue)} ({calculatedProgress.toFixed(1)}%)</span></div>
                            <div className="w-px h-3 bg-gray-300 dark:bg-gray-600"></div>
                            <div><span className="text-gray-500 dark:text-gray-400 mr-1">Totale:</span><span className="font-bold text-gray-700 dark:text-gray-200">{currencyFormatter.format(activeGroup.value)}</span></div>
                        </div>
                    </div>
                    <button type="button" className="text-gray-400 bg-transparent hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-sm p-1.5 ml-auto" onClick={handleAttemptClose}><svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path></svg></button>
                </div>
                
                {/* Configuration Toggles */}
                <div className="flex items-center gap-4 px-3 pb-3">
                    <div className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide mr-2">Configurazione:</div>
                    <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                        <button onClick={() => handleAccountingTypeChange('measure')} disabled={isOptionsLocked || isViewOnly || isLocked} className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-all ${activeGroup.accountingType === 'measure' ? 'bg-white dark:bg-gray-600 text-indigo-600 dark:text-indigo-300 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'} ${isOptionsLocked ? 'opacity-60 cursor-not-allowed' : ''}`}>A Misura</button>
                        <button onClick={() => handleAccountingTypeChange('body')} disabled={isOptionsLocked || isViewOnly || isLocked} className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-all ${activeGroup.accountingType === 'body' ? 'bg-white dark:bg-gray-600 text-purple-600 dark:text-purple-300 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'} ${isOptionsLocked ? 'opacity-60 cursor-not-allowed' : ''}`}>A Corpo</button>
                    </div>
                    
                    <button 
                        onClick={handleSecurityToggle} 
                        disabled={isOptionsLocked || isViewOnly || isLocked} 
                        className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-md transition-all ${activeGroup.isSecurityCost ? 'bg-orange-100 text-orange-700 border border-orange-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'} ${isOptionsLocked ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                        {activeGroup.isSecurityCost ? 'Sicurezza ON' : 'Sicurezza OFF'}
                    </button>

                    <button onClick={handleToggleOptionsLock} disabled={isViewOnly || isLocked} className={`p-1.5 rounded-full transition-colors ${isOptionsLocked ? 'text-red-600 bg-red-100 hover:bg-red-200' : 'text-gray-400 hover:text-gray-600 bg-gray-100'}`}>
                        {isOptionsLocked ? (
                            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                        ) : (
                            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2V7a5 5 0 00-5-5zm0 2a3 3 0 013 3v2H7V7a3 3 0 013-3z" /></svg>
                        )}
                    </button>
                </div>
            </div>

            {/* Toolbar */}
            {activeTab === 'measurements' && !(isViewOnly || isLocked) && (
                <div className="bg-indigo-50 dark:bg-indigo-900/20 px-4 py-2 border-b border-indigo-100 dark:border-gray-700 shadow-inner flex items-center gap-4 overflow-x-auto no-scrollbar">
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <svg className="h-4 w-4 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        <input type="date" value={stickyDate} onChange={e => setStickyDate(e.target.value)} className="p-1 h-8 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded" />
                        {!activeGroup.officialStartDate && <button onClick={handleOfficializeStart} className="h-8 px-3 bg-green-600 text-white rounded hover:bg-green-700 text-xs font-bold shadow-sm">START</button>}
                    </div>
                    <div className="h-6 w-px bg-indigo-200 dark:bg-gray-600 mx-2"></div>
                    <select value={globalTeamId} onChange={e => handleTeamChange(e.target.value)} className="p-1 h-8 text-sm bg-white border border-gray-300 rounded"><option value="">- Squadra -</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                </div>
            )}
            
            {/* Tabs */}
            <div className="border-b border-gray-200 dark:border-gray-700 px-4">
                <nav className="-mb-px flex space-x-6">
                    <button onClick={() => setActiveTab('measurements')} className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'measurements' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Misurazioni</button>
                    <button onClick={() => setActiveTab('dependencies')} className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'dependencies' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Dipendenze</button>
                </nav>
            </div>
        </div>
        
        {/* Content Body */}
        <div className="flex-grow p-4 flex flex-col overflow-hidden relative">
          
          {/* VIEW: MEASUREMENTS */}
          {activeTab === 'measurements' && (
            <div className="flex-grow overflow-y-auto pr-2 -mr-2 space-y-4">
                {activeGroup.items.map((item, index) => {
                    const variationsTotal = (item.variations || []).reduce((acc, v) => v.type === 'increase' ? acc + v.quantity : acc - v.quantity, 0);
                    const effectiveTotalQuantity = item.quantity + variationsTotal;
                    const measuredTotal = (item.measurements || []).reduce((acc, m) => acc + m.quantity, 0);
                    
                    return (
                    <div key={index} ref={el => { itemRefs.current[item.articleCode] = el; }} className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 shadow-sm">
                        {/* ... Item Header Table ... */}
                        <table className="w-full text-sm mb-2 table-fixed">
                            <colgroup><col className="w-[15%]" /><col className="w-[35%]" /><col className="w-[50%]" /></colgroup>
                            <tbody>
                                <tr>
                                    <td className="font-semibold text-gray-900 dark:text-white align-top text-xs"><div className="flex items-center gap-1"><span className="text-gray-400 font-normal">#{index + 1}</span><span>{item.articleCode}</span></div><button onClick={() => toggleDiary(item.articleCode)} className={`mt-1 flex items-center gap-1 text-[10px] font-medium transition-colors group ${expandedDiaries.has(item.articleCode) ? 'text-indigo-600' : 'text-gray-400 hover:text-indigo-600'}`} title="Annotazioni"><svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg><span>Note ({item.annotations?.length || 0})</span></button></td>
                                    <td className="text-gray-700 dark:text-gray-300 text-justify align-top pr-4 text-xs leading-tight"><div title={item.description} className="line-clamp-8">{item.description}</div></td>
                                    <td className="align-top text-right text-xs relative">
                                        <div className="flex justify-end items-start gap-2">
                                            <div className="grid grid-cols-[auto_auto] gap-x-2 items-baseline text-right text-xs">
                                                <span className="text-gray-500 dark:text-gray-400">Progetto:</span>
                                                <div className="flex items-center justify-end flex-wrap gap-1">{variationsTotal !== 0 && <span className="text-gray-400 line-through decoration-red-500 decoration-2 mr-1">{numberFormatter.format(item.quantity)}</span>}<span className={`font-bold ${variationsTotal !== 0 ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>{numberFormatter.format(effectiveTotalQuantity)} {item.unit}</span>{item.variations?.map(v => <button key={v.id} onClick={(e) => { e.stopPropagation(); alert(`VARIANTE: ${v.number}\nNota: ${v.note}`); }} className={`text-[9px] px-1 rounded border cursor-pointer align-middle ${v.type === 'increase' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>{v.number}</button>)}</div>
                                                <span className="text-gray-500 dark:text-gray-400">Misurato:</span><span className={(measuredTotal / effectiveTotalQuantity) >= 1 ? 'text-green-600 dark:text-green-500 font-bold' : 'text-gray-700 dark:text-gray-300 font-bold'}>{numberFormatter.format(measuredTotal)} {item.unit}</span>
                                            </div>
                                            {!isViewOnly && !isLocked && <button onClick={() => openVariationModal(item.articleCode)} className={`p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${item.variations && item.variations.length > 0 ? 'text-white bg-indigo-500 hover:bg-indigo-600' : 'text-gray-400'}`} title="Gestione Varianti"><span className="font-serif font-bold text-lg leading-none">Δ</span></button>}
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                        {/* ... Measurements Table ... */}
                        {(!(isViewOnly || isLocked) || (item.measurements && item.measurements.length > 0)) && (
                        <div className="mb-3 max-h-60 overflow-y-auto border border-gray-100 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-900/20">
                            <table className="w-full text-xs text-left table-fixed">
                            <thead className="text-gray-700 bg-gray-100 dark:bg-gray-700 dark:text-gray-400 sticky top-0 z-10">
                                <tr><th className="px-2 py-1 w-[12%]">Data</th><th className="px-2 py-1 w-[20%]">Nota</th><th className="px-2 py-1 w-[15%]">Squadra (Operai)</th><th className="px-1 py-1 w-[5%] text-center">U.M.</th><th className="px-1 py-1 w-[5%] text-center text-gray-500">Fatt.</th><th className="px-1 py-1 w-[5%] text-center text-gray-500">Lung.</th><th className="px-1 py-1 w-[5%] text-center text-gray-500">Larg.</th><th className="px-1 py-1 w-[5%] text-center text-gray-500">H/P</th><th className="px-2 py-1 w-[8%] text-right">Quantità</th><th className="px-2 py-1 w-[8%] text-right">P. Unit.</th><th className="px-2 py-1 w-[10%] text-right">Valore</th><th className="px-1 py-1 w-[6%]"></th></tr>
                            </thead>
                            <tbody>
                                {item.measurements?.map((m, mIndex) => {
                                const mTeam = teams.find(t => t.id === m.teamId); const assignedWorkers = workers.filter(w => m.workerIds?.includes(w.id)); const isNegative = m.quantity < 0; const isCommitted = m._isCommitted ?? false;
                                return (
                                    <tr key={mIndex} className={`border-b dark:border-gray-600 bg-white dark:bg-gray-800 ${isNegative ? 'text-red-600 dark:text-red-400' : ''}`}>
                                    <td className="px-2 py-1">{format(parseISO(m.date), 'dd/MM/yy')}</td>
                                    <td className="px-2 py-1 text-justify break-words truncate font-medium" title={m.note}>{m.note}</td>
                                    <td className="px-2 py-1 text-xs align-middle">{mTeam && <span className="font-bold mr-1" style={{color: mTeam.color}}>{mTeam.name}</span>}{assignedWorkers.length > 0 && <span className="text-gray-500 truncate">({assignedWorkers.map(w => w.name.split(' ')[0]).join(', ')})</span>}</td>
                                    <td className="px-2 py-1 text-center text-xs text-gray-500">{item.unit}</td>
                                    <td className="px-1 py-1 text-center text-gray-400">{m.factor || '-'}</td><td className="px-1 py-1 text-center text-gray-400">{m.length || '-'}</td><td className="px-1 py-1 text-center text-gray-400">{m.width || '-'}</td><td className="px-1 py-1 text-center text-gray-400">{m.height || '-'}</td>
                                    <td className={`px-2 py-1 text-right font-medium ${isNegative ? 'font-bold' : ''}`}>{numberFormatter.format(m.quantity)}</td>
                                    <td className="px-2 py-1 text-right text-gray-500">{currencyFormatter.format(item.unitPrice)}</td>
                                    <td className="px-2 py-1 text-right">{currencyFormatter.format(m.quantity * item.unitPrice)}</td>
                                    <td className="px-1 py-1 text-center">{!(isViewOnly || isLocked) && !isNegative && (isCommitted ? (<button onClick={(e) => handleReverseMeasurement(e, item.articleCode, mIndex)} className="text-orange-400 hover:text-orange-600 transition-colors px-1 py-1 rounded hover:bg-orange-50 dark:hover:bg-orange-900/20 cursor-pointer" title="Storno"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg></button>) : (<button onClick={() => handleDeleteMeasurement(item.articleCode, mIndex)} className="text-gray-400 hover:text-red-500 transition-colors px-1 py-0.5" title="Elimina"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>))}</td>
                                    </tr>
                                );})}
                            </tbody>
                            {/* ... Input Row ... */}
                            {(!(isViewOnly || isLocked)) && (
                                <tfoot className="bg-indigo-50/80 dark:bg-indigo-900/30 font-medium text-indigo-900 dark:text-indigo-100 sticky bottom-0 z-10">
                                    <tr className="border-t border-indigo-100 dark:border-gray-600">
                                        <td className="px-2 py-1.5 text-gray-500 dark:text-gray-400 italic">{stickyDate ? format(parseISO(stickyDate), 'dd/MM/yy') : '-'}</td>
                                        <td className="px-1 py-1">
                                            <div className="flex items-center gap-1">
                                                <button type="button" onClick={() => toggleDeductionMode(item.articleCode)} className={`h-6 px-1.5 flex items-center justify-center rounded-md text-white font-bold text-xs shadow-sm transition-colors flex-shrink-0 ${deductionModes[item.articleCode] ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-400 hover:bg-gray-500'}`}>{deductionModes[item.articleCode] ? '-' : '+/-'}</button>
                                                <input 
                                                    ref={el => { noteInputsRef.current[item.articleCode] = el; }}
                                                    type="text" 
                                                    value={(newMeasurements[item.articleCode] || { note: '' }).note} 
                                                    placeholder="Nota..." 
                                                    onChange={e => handleMeasurementChange(item.articleCode, 'note', e.target.value)} 
                                                    onFocus={() => handleInputFocus(item.articleCode, 'note')}
                                                    onBlur={handleInputBlur}
                                                    className={`w-full p-1 text-xs bg-white dark:bg-gray-700 border rounded focus:ring-1 focus:ring-indigo-500 ${activeFocus?.itemCode === item.articleCode && activeFocus?.field === 'note' && isVoiceEnabled ? 'border-red-500 ring-2 ring-red-500 bg-red-50' : 'border-gray-300 dark:border-gray-600'}`}
                                                />
                                            </div>
                                        </td>
                                        <td className="px-2 py-1 text-xs align-middle truncate text-gray-300 dark:text-gray-600 italic"></td>
                                        <td className="px-1 py-1 text-center text-xs font-bold text-gray-500 dark:text-gray-400">{item.unit}</td>
                                        {['factor', 'length', 'width', 'height'].map(f => (
                                            <td key={f} className="px-0.5 py-1 relative">
                                                <input 
                                                    type="text" 
                                                    className={`w-full p-1 text-center text-xs border rounded dark:bg-gray-700 ${activeFocus?.itemCode === item.articleCode && activeFocus?.field === f && isVoiceEnabled ? 'border-red-500 ring-2 ring-red-500 bg-red-50' : 'border-gray-200 dark:border-gray-600'}`} 
                                                    value={(newMeasurements[item.articleCode] || {} as any)[f] || ''} 
                                                    onChange={e => handleMeasurementChange(item.articleCode, f as any, e.target.value)}
                                                    onFocus={() => handleInputFocus(item.articleCode, f as any)}
                                                    onBlur={handleInputBlur}
                                                />
                                            </td>
                                        ))}
                                        <td className="px-1 py-1 relative">
                                            <input 
                                                ref={el => { quantityInputsRef.current[item.articleCode] = el; }} 
                                                type="text" 
                                                value={(newMeasurements[item.articleCode] || { quantity: '' }).quantity} 
                                                onChange={e => handleMeasurementChange(item.articleCode, 'quantity', e.target.value)} 
                                                onFocus={() => handleInputFocus(item.articleCode, 'quantity')}
                                                onBlur={handleInputBlur}
                                                className={`w-full p-1 text-xs border rounded focus:ring-1 focus:border-indigo-500 text-right font-mono font-bold ${deductionModes[item.articleCode] ? 'text-red-600 border-red-300 bg-red-50' : 'text-gray-900 border-gray-300 bg-white dark:bg-gray-700'}`} 
                                                placeholder={numberFormatter.format(effectiveTotalQuantity - ((item.measurements || []).reduce((acc, m) => acc + m.quantity, 0)))} 
                                            />
                                        </td>
                                        <td className="px-2 py-1 text-right text-gray-500 text-xs">{currencyFormatter.format(item.unitPrice)}</td>
                                        <td className="px-2 py-1 text-right font-semibold text-xs">{currencyFormatter.format((((newMeasurements[item.articleCode] || { quantity: '' }).quantity === '' ? (effectiveTotalQuantity - ((item.measurements || []).reduce((acc, m) => acc + m.quantity, 0))) : parseFloat((newMeasurements[item.articleCode] || { quantity: '0' }).quantity))) * item.unitPrice)}</td>
                                        <td className="px-1 py-1 text-center"><button onClick={() => handleAddMeasurement(item.articleCode)} className="flex items-center justify-center w-6 h-6 bg-indigo-600 text-white rounded hover:bg-indigo-700 shadow-sm transition-colors mx-auto" title="Aggiungi"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg></button></td>
                                    </tr>
                                </tfoot>
                            )}
                            </table>
                        </div>
                        )}
                    </div>
                )})}
            </div>
          )}
          {/* ... Dependencies View ... */}
          {activeTab === 'dependencies' && (
             <div className="flex-grow overflow-y-auto pr-2 -mr-2 space-y-6">
                {/* Dependencies code matches previous version */}
                <div className="grid grid-cols-2 gap-6"><div><h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Predecessori</h4>{predecessors.length > 0 ? (<ul className="space-y-2">{predecessors.map(dep => { const pred = allWorkGroups.find(wg => wg.id === dep.from); return (<li key={dep.id} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700/50 rounded-md text-sm"><div><p className="font-medium text-gray-900 dark:text-gray-100">{pred?.name || 'Unknown Task'}</p><p className="text-gray-500 dark:text-gray-400">{dependencyTypeLabels[dep.type]} {dep.lag !== 0 ? `(${dep.lag > 0 ? '+' : ''}${dep.lag}d)` : ''}</p></div>{!isLocked && <button onClick={() => handleDeleteDependency(dep.id)} className="text-gray-400 hover:text-red-500 p-1 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>}</li>)})}</ul>) : <p className="text-sm text-gray-500 italic">Nessun predecessore.</p>}</div><div><h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Successori</h4>{successors.length > 0 ? (<ul className="space-y-2">{successors.map(dep => { const succ = allWorkGroups.find(wg => wg.id === dep.to); return (<li key={dep.id} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700/50 rounded-md text-sm"><div><p className="font-medium text-gray-900 dark:text-gray-100">{succ?.name || 'Unknown Task'}</p><p className="text-gray-500 dark:text-gray-400">{dependencyTypeLabels[dep.type]} {dep.lag !== 0 ? `(${dep.lag > 0 ? '+' : ''}${dep.lag}d)` : ''}</p></div>{!isLocked && <button onClick={() => handleDeleteDependency(dep.id)} className="text-gray-400 hover:text-red-500 p-1 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>}</li>)})}</ul>) : <p className="text-sm text-gray-500 italic">Nessun successore.</p>}</div></div>{!isLocked && (<div className="pt-4 border-t border-gray-200 dark:border-gray-700"><h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Aggiungi Dipendenza</h4><div className="grid grid-cols-4 gap-4 items-end p-2 bg-gray-50 dark:bg-gray-900/50 rounded-md"><select value={newDependency.direction} onChange={e => setNewDependency(p => ({ ...p, direction: e.target.value as any }))} className="p-2 text-sm bg-white dark:bg-gray-700 border rounded-md"><option value="predecessor">Predecessore</option><option value="successor">Successore</option></select><select value={newDependency.targetId} onChange={e => setNewDependency(p => ({ ...p, targetId: e.target.value }))} className="p-2 text-sm bg-white dark:bg-gray-700 border rounded-md col-span-2"><option value="">Seleziona attività...</option>{availableTasksForDependency.map(wg => <option key={wg.id} value={wg.id}>{wg.name}</option>)}</select><button onClick={handleAddDependency} disabled={!newDependency.targetId} className="px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-gray-400">Aggiungi</button><select value={newDependency.type} onChange={e => setNewDependency(p => ({ ...p, type: e.target.value as DependencyType }))} className="p-2 text-sm bg-white dark:bg-gray-700 border rounded-md">{Object.entries(dependencyTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><div className="col-span-2"><label className="text-xs text-gray-500">Ritardo (gg)</label><input type="number" value={newDependency.lag} onChange={e => setNewDependency(p => ({ ...p, lag: e.target.value }))} className="w-full mt-1 p-1.5 text-sm bg-white dark:bg-gray-700 border rounded-md" /></div></div></div>)}
            </div>
          )}
        </div>
        <div className="flex-shrink-0 flex items-center justify-between p-3 border-t border-gray-200 dark:border-gray-700">
          <button type="button" onClick={handleAttemptClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-50">Esci</button>
          {!(isViewOnly || isLocked) && <button type="button" onClick={handleSaveChanges} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 disabled:bg-gray-400 dark:disabled:bg-gray-600" disabled={isViewOnly || isLocked}>Salva e Chiudi</button>}
        </div>
      </div>
      {/* Variation Modal Overlay */}
      {variationItemCode && modalVariationItem && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={closeVariationModal}>
              <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-xl shadow-2xl border border-indigo-100 dark:border-gray-600 flex flex-col h-auto max-h-[90vh]" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-between items-center p-5 pb-3 border-b dark:border-gray-700 flex-shrink-0"><h4 className="font-bold text-gray-800 dark:text-white text-lg flex items-center gap-2"><span className="text-indigo-600 font-serif text-2xl">Δ</span>Gestione Varianti</h4><button onClick={closeVariationModal} className="text-gray-400 hover:text-gray-600"><svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path></svg></button></div>
                  <div className="flex-grow overflow-y-auto p-5"><div className="mb-4"><div className="text-xs font-mono text-indigo-600 mb-1">{modalVariationItem.articleCode}</div><div className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3 italic">{modalVariationItem.description}</div></div><div className="mb-2"><h5 className="text-[10px] font-bold text-gray-400 uppercase mb-2 px-1">Storico Modifiche</h5>{modalVariationItem.variations && modalVariationItem.variations.length > 0 ? (<div className="space-y-2">{modalVariationItem.variations.map(v => (<div key={v.id} className="flex justify-between items-center text-sm bg-gray-50 dark:bg-gray-700/50 p-3 rounded border border-gray-200 dark:border-gray-600 shadow-sm"><div className="flex flex-col"><span className="font-bold text-gray-700 dark:text-gray-200">{v.number}</span><span className="text-xs text-gray-400">{format(parseISO(v.date), 'dd/MM/yy')}</span></div><div className="text-right"><span className={`font-mono font-bold block ${v.type === 'increase' ? 'text-green-600' : 'text-red-600'}`}>{v.type === 'increase' ? '+' : '-'}{numberFormatter.format(v.quantity)}</span>{v.note && <span className="text-[10px] text-gray-500 italic max-w-[150px] truncate block">{v.note}</span>}</div></div>))}</div>) : (<p className="text-center text-gray-400 text-sm py-4 bg-gray-50 dark:bg-gray-800/50 rounded border border-dashed border-gray-200 dark:border-gray-700">Nessuna variante registrata.</p>)}</div></div>
                  <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 border-t border-indigo-100 dark:border-indigo-800 flex-shrink-0 rounded-b-xl"><h5 className="text-xs font-bold text-indigo-800 dark:text-indigo-300 uppercase mb-3">Nuova Registrazione</h5><div className="grid grid-cols-2 gap-3 mb-3"><div><label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Riferimento</label><input type="text" className="w-full p-2 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-indigo-500 focus:border-indigo-500" placeholder="Es. Perizia 1" value={variationForm.number} onChange={e => handleVariationFormChange('number', e.target.value)} /></div><div><label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Tipo</label><select className="w-full p-2 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" value={variationForm.type} onChange={e => handleVariationFormChange('type', e.target.value)}><option value="increase">Aumento (+)</option><option value="decrease">Diminuzione (-)</option></select></div></div><div className="mb-3"><label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Quantità</label><input type="number" step="0.01" className="w-full p-2 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono text-right" placeholder="0.00" value={variationForm.quantity} onChange={e => handleVariationFormChange('quantity', e.target.value)} /></div><div className="mb-4"><label className="block text-[10px] text-gray-500 uppercase font-bold mb-1">Nota / Descrizione</label><input type="text" className="w-full p-2 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Dettagli variante..." value={variationForm.note} onChange={e => handleVariationFormChange('note', e.target.value)} /></div><button onClick={handleAddVariation} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg transition-colors shadow-md">Registra Variante</button></div>
              </div>
          </div>
      )}
    </div>
  );
};

export default TaskModal;
