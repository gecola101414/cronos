
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { WorkGroup, WorkItem, Measurement, Dependency, DependencyType, Team, Worker, Annotation, Variation, ProjectDocument } from '../types';
import { format, parseISO, addDays, startOfDay, isAfter } from 'date-fns';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: WorkGroup | null;
  allWorkGroups: WorkGroup[];
  allDocuments: ProjectDocument[];
  dependencies: Dependency[];
  setWorkGroups: (updater: React.SetStateAction<WorkGroup[]>) => void;
  onDependenciesChange: (updater: (prev: Dependency[]) => Dependency[]) => void;
  isViewOnly?: boolean;
  isLocked?: boolean;
  teams: Team[];
  workers: Worker[];
}

interface ExtendedMeasurement extends Measurement {
    _isCommitted?: boolean; 
}

interface ExtendedWorkItem extends Omit<WorkItem, 'measurements'> {
    measurements?: ExtendedMeasurement[];
    annotations?: Annotation[];
    variations?: Variation[];
    originalMeasurements?: any[]; 
}

interface ExtendedWorkGroup extends Omit<WorkGroup, 'items'> {
    items: ExtendedWorkItem[];
}

interface MeasurementInputState {
    quantity: string;
    note: string;
    factor: string;
    length: string;
    width: string;
    height: string;
}

const currencyFormatter = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const numberFormatter = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 3 });

const dependencyTypeLabels: Record<DependencyType, string> = {
    FS: 'Fine-Inizio (FS)',
    SS: 'Inizio-Inizio (SS)',
    FF: 'Fine-Fine (FF)',
    SF: 'Inizio-Fine (SF)',
};

const TaskModal: React.FC<TaskModalProps> = ({ isOpen, onClose, group, allWorkGroups, allDocuments, dependencies, setWorkGroups, onDependenciesChange, isViewOnly, isLocked, teams, workers }) => {
  const [activeTab, setActiveTab] = useState('measurements');
  const [activeGroup, setActiveGroup] = useState<ExtendedWorkGroup | null>(null);
  
  const [stickyDate, setStickyDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [globalTeamId, setGlobalTeamId] = useState<string>('');
  const [globalWorkerIds, setGlobalWorkerIds] = useState<string[]>([]);

  const [newMeasurements, setNewMeasurements] = useState<Record<string, MeasurementInputState>>({});
  const [deductionModes, setDeductionModes] = useState<Record<string, boolean>>({}); 
  
  const [activeFocus, setActiveFocus] = useState<{ itemCode: string, field: keyof MeasurementInputState } | null>(null);
  const activeFocusRef = useRef<{ itemCode: string, field: keyof MeasurementInputState } | null>(null);

  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [expandedDiaries, setExpandedDiaries] = useState<Set<string>>(new Set());
  
  // --- BOQ PICKER STATE ---
  const [activeBoqPickerItem, setActiveBoqPickerItem] = useState<string | null>(null);
  const [selectedBoqIds, setSelectedBoqIds] = useState<Record<string, Set<string>>>({});
  const [pickerCoords, setPickerCoords] = useState({ top: 0, left: 0 });

  const [newDependency, setNewDependency] = useState<{ targetId: string; type: DependencyType; lag: string, direction: 'predecessor' | 'successor' }>({
    targetId: '',
    type: 'FS',
    lag: '0',
    direction: 'predecessor'
  });

  useEffect(() => { activeFocusRef.current = activeFocus; }, [activeFocus]);

  useEffect(() => {
    if (isOpen && group) {
        setActiveTab('measurements');
        let migratedGroup = { ...group } as ExtendedWorkGroup;
        if (!migratedGroup.accountingType) migratedGroup.accountingType = 'measure';

        const itemsWithFlags = migratedGroup.items.map(item => ({
            ...item,
            measurements: item.measurements?.map(m => ({ ...m, _isCommitted: true, id: m.id || crypto.randomUUID() })) || [],
            annotations: item.annotations || [],
            variations: item.variations || [],
            originalMeasurements: item.originalMeasurements || []
        }));

        migratedGroup.items = itemsWithFlags;
        setActiveGroup(migratedGroup);
        setIsDirty(false);

        const initialMeasurements: Record<string, MeasurementInputState> = {};
        const initialDeductions: Record<string, boolean> = {};
        
        migratedGroup.items.forEach(item => {
            initialMeasurements[item.articleCode] = { quantity: '', note: '', factor: '', length: '', width: '', height: '' };
            initialDeductions[item.articleCode] = false;
        });
        
        setNewMeasurements(initialMeasurements);
        setDeductionModes(initialDeductions);
        
        const allDates = itemsWithFlags.flatMap(i => i.measurements || []).map(m => m.date).sort();
        let defaultDate = allDates.length > 0 ? allDates[allDates.length - 1] : (migratedGroup.officialStartDate || migratedGroup.startDate);
        setStickyDate(defaultDate);
        
        setGlobalTeamId(''); setGlobalWorkerIds([]); setActiveFocus(null);
        setActiveBoqPickerItem(null); setSelectedBoqIds({});
    }
  }, [isOpen, group]);
  
  const handleAttemptClose = useCallback(() => {
    if (isDirty && !(isViewOnly || isLocked)) { if (window.confirm('Hai delle modifiche non salvate. Sei sicuro di voler uscire?')) onClose(); } else onClose();
  }, [isDirty, isViewOnly, isLocked, onClose]);

  const toggleDeductionMode = (articleCode: string) => { setDeductionModes(prev => ({ ...prev, [articleCode]: !prev[articleCode] })); };

  const handleMeasurementChange = (articleCode: string, field: keyof MeasurementInputState, value: string) => {
    if (isViewOnly || isLocked) return;
    setIsDirty(true);
    setNewMeasurements(prev => {
        const currentItemState = { ...prev[articleCode], [field]: value };
        return { ...prev, [articleCode]: currentItemState };
    });
  };

  const toggleDiary = (articleCode: string) => { setExpandedDiaries(prev => { const next = new Set(prev); if (next.has(articleCode)) next.delete(articleCode); else next.add(articleCode); return next; }); };

  // --- BOQ PICKER TOGGLE ---
  const toggleBoqPicker = (articleCode: string, e: React.MouseEvent) => {
      if (activeBoqPickerItem === articleCode) {
          setActiveBoqPickerItem(null);
      } else {
          const rect = e.currentTarget.getBoundingClientRect();
          setPickerCoords({
              top: rect.top,
              left: Math.max(10, rect.left - 500)
          });
          setActiveBoqPickerItem(articleCode);
          if (!selectedBoqIds[articleCode]) setSelectedBoqIds(prev => ({ ...prev, [articleCode]: new Set() }));
      }
  };

  const toggleBoqLineSelection = (articleCode: string, boqId: string) => {
      setSelectedBoqIds(prev => {
          const nextSet = new Set(prev[articleCode]);
          if (nextSet.has(boqId)) nextSet.delete(boqId);
          else nextSet.add(boqId);
          return { ...prev, [articleCode]: nextSet };
      });
  };

  // Helper per estrarre la quantità corretta da una riga di computo
  const getBoqRowQuantity = (l: any): number => {
      // Priorità al Totale riga, poi Quantità, poi calcolo dai fattori
      if (l.total !== undefined && l.total !== 0) return l.total;
      if (l.quantity !== undefined && l.quantity !== 0) return l.quantity;
      if (l.multiplier || l.length || l.width || l.height) {
          return (l.multiplier || 1) * (l.length || 1) * (l.width || 1) * (l.height || 1);
      }
      return 0;
  };

  const importSelectedBoqLines = (articleCode: string) => {
      const item = activeGroup?.items.find(i => i.articleCode === articleCode);
      if (!item || !item.originalMeasurements) return;
      
      const selectedIds = selectedBoqIds[articleCode];
      if (!selectedIds || selectedIds.size === 0) return;

      const linesToImport = item.originalMeasurements.filter(m => selectedIds.has(m.id));
      
      // Calcolo residuo
      const variationsTotal = (item.variations || []).reduce((acc, v) => v.type === 'increase' ? acc + v.quantity : acc - v.quantity, 0);
      const effectiveTotalQuantity = item.quantity + variationsTotal;
      const measuredTotal = (item.measurements || []).reduce((acc, m) => acc + m.quantity, 0);
      const residual = Math.round((effectiveTotalQuantity - measuredTotal) * 1000) / 1000;

      const totalToImport = linesToImport.reduce((acc, l) => acc + getBoqRowQuantity(l), 0);

      if (totalToImport > (residual + 0.001) && totalToImport > 0) {
          alert(`ECCEDENZA: L'importazione (${numberFormatter.format(totalToImport)}) supera il residuo di progetto (${numberFormatter.format(residual)}).`);
          return;
      }

      const today = startOfDay(new Date());
      const selected = startOfDay(parseISO(stickyDate));
      if (isAfter(selected, today)) { alert("ERRORE: Impossibile registrare misurazioni nel futuro."); return; }

      const newBatch: ExtendedMeasurement[] = linesToImport.map(l => ({
          id: crypto.randomUUID(),
          date: stickyDate,
          quantity: getBoqRowQuantity(l),
          note: l.description || 'Da Computo',
          factor: l.multiplier,
          length: l.length,
          width: l.width,
          height: l.height,
          teamId: globalTeamId || undefined,
          workerIds: globalWorkerIds.length > 0 ? globalWorkerIds : undefined,
          _isCommitted: false
      }));

      setActiveGroup(prev => {
          if (!prev) return null;
          const updatedItems = prev.items.map(i => i.articleCode === articleCode ? { ...i, measurements: [...(i.measurements || []), ...newBatch] } : i);
          const newTotalMeasuredValue = updatedItems.reduce((total, i) => total + ((i.measurements || []).reduce((acc, m) => acc + m.quantity, 0) * i.unitPrice), 0);
          return { ...prev, items: updatedItems, progress: prev.value > 0 ? (newTotalMeasuredValue / prev.value) * 100 : 0 };
      });

      setSelectedBoqIds(prev => ({ ...prev, [articleCode]: new Set() }));
      setActiveBoqPickerItem(null);
      setIsDirty(true);
  };

  const handleAddMeasurement = (itemArticleCode: string) => {
    if (!activeGroup || isViewOnly || isLocked) return;
    const today = startOfDay(new Date()); const selected = startOfDay(parseISO(stickyDate));
    if (isAfter(selected, today)) { alert("IMPEDIMENTO: Data futura non ammessa."); return; }

    const measurementInput = newMeasurements[itemArticleCode];
    const itemToUpdate = activeGroup.items.find(item => item.articleCode === itemArticleCode);
    if (!itemToUpdate) return;
    
    const variationsTotal = (itemToUpdate.variations || []).reduce((acc, v) => v.type === 'increase' ? acc + v.quantity : acc - v.quantity, 0);
    const effectiveTotalQuantity = itemToUpdate.quantity + variationsTotal;
    const measuredTotal = (itemToUpdate.measurements || []).reduce((acc, m) => acc + m.quantity, 0);
    const residual = Math.round((effectiveTotalQuantity - measuredTotal) * 1000) / 1000;

    let quantityStr = measurementInput.quantity.replace(',', '.');
    let quantity = quantityStr.trim() === '' ? residual : (parseFloat(quantityStr) || 0);

    if (quantity > (residual + 0.001) && quantity > 0) {
        alert(`ATTENZIONE: Quantità (${numberFormatter.format(quantity)}) superiore al residuo (${numberFormatter.format(residual)}).`);
        return;
    }

    if (deductionModes[itemArticleCode]) quantity = -Math.abs(quantity);
    if (quantity === 0) return; 

    const newMeasurement: ExtendedMeasurement = {
        id: crypto.randomUUID(), date: stickyDate, quantity: quantity, note: measurementInput.note || 'Misura',
        teamId: globalTeamId || undefined, workerIds: globalWorkerIds.length > 0 ? globalWorkerIds : undefined,
        _isCommitted: false, factor: measurementInput.factor ? parseFloat(measurementInput.factor) : undefined,
        length: measurementInput.length ? parseFloat(measurementInput.length) : undefined,
        width: measurementInput.width ? parseFloat(measurementInput.width) : undefined,
        height: measurementInput.height ? parseFloat(measurementInput.height) : undefined
    };

    setActiveGroup(prev => {
        if (!prev) return null;
        const updatedItems = prev.items.map(item => item.articleCode === itemArticleCode ? { ...item, measurements: [...(item.measurements || []), newMeasurement] } : item);
        const newTotalMeasuredValue = updatedItems.reduce((total, item) => total + ((item.measurements || []).reduce((acc, m) => acc + m.quantity, 0) * item.unitPrice), 0);
        return { ...prev, items: updatedItems, progress: prev.value > 0 ? (newTotalMeasuredValue / prev.value) * 100 : 0 };
    });
    setNewMeasurements(prev => ({ ...prev, [itemArticleCode]: { quantity: '', note: '', factor: '', length: '', width: '', height: '' } }));
    setIsDirty(true);
  };

  const handleDeleteMeasurement = (itemArticleCode: string, measurementIndex: number) => { 
      if (isViewOnly || isLocked) return; 
      setActiveGroup(prev => { 
          if (!prev) return null; 
          const updatedItems = prev.items.map(item => { if (item.articleCode === itemArticleCode && item.measurements) { const newMeasurements = [...item.measurements]; newMeasurements.splice(measurementIndex, 1); return { ...item, measurements: newMeasurements }; } return item; }); 
          const newTotalMeasuredValue = updatedItems.reduce((total, i) => total + ((i.measurements || []).reduce((acc, m) => acc + m.quantity, 0) * i.unitPrice), 0);
          return { ...prev, items: updatedItems, progress: prev.value > 0 ? (newTotalMeasuredValue / prev.value) * 100 : 0 }; 
      }); 
      setIsDirty(true); 
  };
  
  const handleReverseMeasurement = (e: React.MouseEvent, itemArticleCode: string, measurementIndex: number) => {
    e.preventDefault(); e.stopPropagation();
    if (isViewOnly || isLocked || !activeGroup) return;
    const today = startOfDay(new Date()); const selected = startOfDay(parseISO(stickyDate));
    if (isAfter(selected, today)) { alert("IMPEDIMENTO: Data futura non ammessa."); return; }
    const targetItemIndex = activeGroup.items.findIndex(i => i.articleCode === itemArticleCode);
    if (targetItemIndex === -1) return;
    const targetMeasurement = activeGroup.items[targetItemIndex].measurements?.[measurementIndex];
    if (!targetMeasurement || targetMeasurement.quantity < 0) return;
    const reversalMeasurement: ExtendedMeasurement = { id: crypto.randomUUID(), date: stickyDate || format(new Date(), 'yyyy-MM-dd'), quantity: -targetMeasurement.quantity, note: `STORNO: ${targetMeasurement.note || ''}`, teamId: targetMeasurement.teamId, workerIds: targetMeasurement.workerIds, _isCommitted: false };
    const newGroup = { ...activeGroup }; newGroup.items = [...newGroup.items];
    newGroup.items[targetItemIndex] = { ...newGroup.items[targetItemIndex], measurements: [...(newGroup.items[targetItemIndex].measurements || []), reversalMeasurement] };
    const newTotalMeasuredValue = newGroup.items.reduce((total, i) => total + ((i.measurements || []).reduce((acc, m) => acc + m.quantity, 0) * i.unitPrice), 0);
    newGroup.progress = newGroup.value > 0 ? (newTotalMeasuredValue / newGroup.value) * 100 : 0;
    setActiveGroup(newGroup); setIsDirty(true);
  };
  
  const handleAddDependency = () => { 
      if (!activeGroup || !newDependency.targetId || isViewOnly || isLocked) return;
      const newDep: Omit<Dependency, 'id'> = { from: newDependency.direction === 'successor' ? activeGroup.id : newDependency.targetId, to: newDependency.direction === 'successor' ? newDependency.targetId : activeGroup.id, type: newDependency.type, lag: parseInt(newDependency.lag) || 0 };
      onDependenciesChange(prev => [...prev, { ...newDep, id: crypto.randomUUID() }]);
      setNewDependency(prev => ({ ...prev, targetId: '' }));
  };

  const handleDeleteDependency = (id: string) => { if (isViewOnly || isLocked) return; onDependenciesChange(prev => prev.filter(d => d.id !== id)); };
  
  const handleSaveChanges = () => { 
      if (!activeGroup || isViewOnly || isLocked) return; 
      const cleanGroup: WorkGroup = { ...activeGroup, accountingType: activeGroup.accountingType, items: activeGroup.items.map(item => ({ ...item, measurements: item.measurements?.map(m => { const { _isCommitted, ...rest } = m; return rest; }) })) }; 
      setWorkGroups(prevGroups => prevGroups.map(g => g.id === activeGroup.id ? cleanGroup : g)); 
      onClose(); 
  };

  if (!isOpen || !activeGroup) return null;

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
            <div className={`w-full py-2 px-4 flex items-center justify-center font-bold text-sm tracking-wide uppercase border-b-2 shadow-sm ${activeGroup.isSecurityCost ? 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-200 dark:border-orange-700' : 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-200 dark:border-green-700'}`}>
                <span>LAVORI {activeGroup.accountingType === 'body' ? 'A CORPO' : 'A MISURA'} {activeGroup.isSecurityCost ? '- ONERI SICUREZZA' : '(SOGGETTI A RIBASSO)'}</span>
            </div>
            <div className="flex flex-col border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-start justify-between p-3 pb-1">
                    <div className="flex-1 mr-4 flex flex-col sm:flex-row sm:items-center sm:gap-4">
                        <h3 className="text-xl font-bold text-blue-600 dark:text-blue-400 truncate">{activeGroup.name}</h3>
                        <div className="flex items-center space-x-4 text-xs bg-gray-50 dark:bg-gray-700/50 px-3 py-1 rounded-full">
                            <div><span className="text-gray-500 dark:text-gray-400 mr-1">Avanzamento:</span><span className="font-bold text-indigo-600 dark:text-indigo-400">{currencyFormatter.format(totalMeasuredValue)} ({calculatedProgress.toFixed(1)}%)</span></div>
                            <div className="w-px h-3 bg-gray-300 dark:bg-gray-600"></div>
                            <div><span className="text-gray-500 dark:text-gray-400 mr-1">Totale WBS:</span><span className="font-bold text-gray-700 dark:text-gray-200">{currencyFormatter.format(activeGroup.value)}</span></div>
                        </div>
                    </div>
                    <button type="button" className="text-gray-400 bg-transparent hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-sm p-1.5 ml-auto" onClick={handleAttemptClose}><svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path></svg></button>
                </div>
            </div>
            <div className="border-b border-gray-200 dark:border-gray-700 px-4">
                <nav className="-mb-px flex space-x-6">
                    <button onClick={() => setActiveTab('measurements')} className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'measurements' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Misurazioni</button>
                    <button onClick={() => setActiveTab('dependencies')} className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'dependencies' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Dipendenze</button>
                </nav>
            </div>
        </div>
        
        {/* Content Body */}
        <div className="flex-grow p-4 flex flex-col overflow-hidden relative">
          {activeTab === 'measurements' && (
            <div className="flex-grow overflow-y-auto pr-2 -mr-2 space-y-4">
                {activeGroup.items.map((item, index) => {
                    const variationsTotal = (item.variations || []).reduce((acc, v) => v.type === 'increase' ? acc + v.quantity : acc - v.quantity, 0);
                    const effectiveTotalQuantity = item.quantity + variationsTotal;
                    const measuredTotal = (item.measurements || []).reduce((acc, m) => acc + m.quantity, 0);
                    const residual = Math.max(0, Math.round((effectiveTotalQuantity - measuredTotal) * 1000) / 1000);
                    const hasOriginalMeasures = item.originalMeasurements && item.originalMeasurements.length > 0;
                    
                    const inputVal = newMeasurements[item.articleCode]?.quantity;
                    const previewQty = (inputVal === '' || inputVal === undefined) ? residual : parseFloat(inputVal.replace(',', '.')) || 0;
                    const previewTotalAmount = previewQty * item.unitPrice;

                    return (
                    <div key={index} ref={el => { itemRefs.current[item.articleCode] = el; }} className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 shadow-sm scroll-mt-20">
                        <table className="w-full text-sm mb-2 table-fixed">
                            <colgroup><col className="w-[15%]" /><col className="w-[35%]" /><col className="w-[50%]" /></colgroup>
                            <tbody>
                                <tr>
                                    <td className="font-semibold text-gray-900 dark:text-white align-top text-xs"><div className="flex items-center gap-1"><span className="text-gray-400 font-normal">#{index + 1}</span><span>{item.articleCode}</span></div><button onClick={() => toggleDiary(item.articleCode)} className={`mt-1 flex items-center gap-1 text-[10px] font-medium transition-colors group ${expandedDiaries.has(item.articleCode) ? 'text-indigo-600' : 'text-gray-400 hover:text-indigo-600'}`} title="Annotazioni"><svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg><span>Note ({item.annotations?.length || 0})</span></button></td>
                                    <td className="text-gray-700 dark:text-gray-300 text-justify align-top pr-4 text-xs leading-tight"><div title={item.description} className="line-clamp-8">{item.description}</div></td>
                                    <td className="align-top text-right text-xs relative">
                                        <div className="flex justify-end items-start gap-2">
                                            <div className="grid grid-cols-[auto_auto] gap-x-3 items-baseline text-right text-[11px]">
                                                <span className="text-gray-500 dark:text-gray-400">P. Unitario:</span><span className="font-bold text-indigo-600 dark:text-indigo-400">{currencyFormatter.format(item.unitPrice)}</span>
                                                <span className="text-gray-500 dark:text-gray-400">Progetto:</span>
                                                <div className="flex items-center justify-end flex-wrap gap-1">{variationsTotal !== 0 && <span className="text-gray-400 line-through decoration-red-500 decoration-1 mr-1">{numberFormatter.format(item.quantity)}</span>}<span className="font-bold text-gray-700 dark:text-gray-300">{numberFormatter.format(effectiveTotalQuantity)} {item.unit}</span></div>
                                                <span className="text-gray-500 dark:text-gray-400">Misurato:</span><span className={(measuredTotal / (effectiveTotalQuantity || 1)) >= 1 ? 'text-green-600 dark:text-green-500 font-bold' : 'text-gray-700 dark:text-gray-300 font-bold'}>{numberFormatter.format(measuredTotal)} {item.unit}</span>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                        
                        <div className="mb-3 max-h-96 overflow-y-auto border border-gray-100 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-900/20">
                            <table className="w-full text-xs text-left table-fixed">
                            <thead className="text-gray-700 bg-gray-100 dark:bg-gray-700 dark:text-gray-400 sticky top-0 z-10">
                                <tr><th className="px-2 py-1 w-[10%]">Data</th><th className="px-2 py-1 w-[18%]">Nota</th><th className="px-2 py-1 w-[10%] text-center text-gray-500">U.M.</th><th className="px-1 py-1 w-[5%] text-center text-gray-500">Fatt.</th><th className="px-1 py-1 w-[5%] text-center text-gray-500">Lung.</th><th className="px-1 py-1 w-[5%] text-center text-gray-500">Larg.</th><th className="px-1 py-1 w-[5%] text-center text-gray-500">H/P</th><th className="px-2 py-1 w-[10%] text-right">Quantità</th><th className="px-2 py-1 w-[10%] text-right text-gray-500">P. Unit.</th><th className="px-2 py-1 w-[15%] text-right">Valore</th><th className="px-1 py-1 w-[7%]"></th></tr>
                            </thead>
                            <tbody>
                                {item.measurements?.map((m, mIndex) => {
                                const isNegative = m.quantity < 0; const isCommitted = m._isCommitted ?? false;
                                return (
                                    <tr key={mIndex} className={`border-b dark:border-gray-600 bg-white dark:bg-gray-800 ${isNegative ? 'text-red-600 dark:text-red-400' : ''}`}>
                                    <td className="px-2 py-1">{format(parseISO(m.date), 'dd/MM/yy')}</td>
                                    <td className="px-2 py-1 truncate font-medium" title={m.note}>{m.note}</td>
                                    <td className="px-2 py-1 text-center text-xs text-gray-500">{item.unit}</td>
                                    <td className="px-1 py-1 text-center text-gray-400">{m.factor || '-'}</td><td className="px-1 py-1 text-center text-gray-400">{m.length || '-'}</td><td className="px-1 py-1 text-center text-gray-400">{m.width || '-'}</td><td className="px-1 py-1 text-center text-gray-400">{m.height || '-'}</td>
                                    <td className={`px-2 py-1 text-right font-medium ${isNegative ? 'font-bold' : ''}`}>{numberFormatter.format(m.quantity)}</td>
                                    <td className="px-2 py-1 text-right text-gray-400 font-mono">{currencyFormatter.format(item.unitPrice)}</td>
                                    <td className="px-2 py-1 text-right">{currencyFormatter.format(m.quantity * item.unitPrice)}</td>
                                    <td className="px-1 py-1 text-center">{!(isViewOnly || isLocked) && !isNegative && (isCommitted ? (<button onClick={(e) => handleReverseMeasurement(e, item.articleCode, mIndex)} className="text-orange-400 hover:text-orange-600 px-1 py-1 rounded cursor-pointer" title="Storno"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg></button>) : (<button onClick={() => handleDeleteMeasurement(item.articleCode, mIndex)} className="text-gray-400 hover:text-red-500 transition-colors px-1 py-0.5" title="Elimina"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>))}</td>
                                    </tr>
                                );})}
                            </tbody>
                            {(!(isViewOnly || isLocked)) && (
                                <tfoot className="bg-indigo-50/80 dark:bg-indigo-900/30 font-medium text-indigo-900 dark:text-indigo-100 sticky bottom-0 z-10">
                                    <tr className="border-t border-indigo-100 dark:border-gray-600">
                                        <td className="px-2 py-1.5 text-gray-500 italic">{stickyDate ? format(parseISO(stickyDate), 'dd/MM/yy') : '-'}</td>
                                        <td className="px-1 py-1">
                                            <div className="flex items-center gap-1">
                                                <button type="button" onClick={() => toggleDeductionMode(item.articleCode)} className={`h-6 px-1.5 flex items-center justify-center rounded-md text-white font-bold text-xs shadow-sm transition-colors flex-shrink-0 ${deductionModes[item.articleCode] ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-400 hover:bg-gray-500'}`}>{deductionModes[item.articleCode] ? '-' : '+/-'}</button>
                                                <input type="text" value={(newMeasurements[item.articleCode] || { note: '' }).note} placeholder="Nota..." onChange={e => handleMeasurementChange(item.articleCode, 'note', e.target.value)} className="w-full p-1 text-xs border rounded dark:bg-gray-700" />
                                            </div>
                                        </td>
                                        <td className="px-1 py-1 text-center">
                                            {hasOriginalMeasures && (
                                                <div className="relative">
                                                    <button 
                                                        onClick={(e) => toggleBoqPicker(item.articleCode, e)}
                                                        className={`w-8 h-6 flex items-center justify-center rounded border transition-colors ${activeBoqPickerItem === item.articleCode ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50'}`}
                                                        title="Seleziona misure da computo"
                                                    >
                                                        <span className="text-xs">📋</span>
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                        {['factor', 'length', 'width', 'height'].map(f => (
                                            <td key={f} className="px-0.5 py-1">
                                                <input type="text" className="w-full p-1 text-center text-xs border rounded dark:bg-gray-700" value={(newMeasurements[item.articleCode] || {} as any)[f] || ''} onChange={e => handleMeasurementChange(item.articleCode, f as any, e.target.value)} />
                                            </td>
                                        ))}
                                        <td className="px-1 py-1 relative">
                                            <input type="text" value={(newMeasurements[item.articleCode] || { quantity: '' }).quantity} onChange={e => handleMeasurementChange(item.articleCode, 'quantity', e.target.value)} className={`w-full p-1 text-xs border rounded text-right font-mono font-bold ${deductionModes[item.articleCode] ? 'text-red-600 border-red-300 bg-red-50' : 'text-gray-900 border-gray-300 bg-white'}`} placeholder={numberFormatter.format(residual)} />
                                        </td>
                                        <td className="px-2 py-1 text-right text-gray-500 font-mono text-[10px]">{currencyFormatter.format(item.unitPrice)}</td>
                                        <td className="px-2 py-1 text-right font-bold text-xs text-indigo-800 dark:text-indigo-200">
                                            {currencyFormatter.format(previewTotalAmount)}
                                        </td>
                                        <td className="px-1 py-1 text-center"><button onClick={() => handleAddMeasurement(item.articleCode)} className="flex items-center justify-center w-6 h-6 bg-indigo-600 text-white rounded hover:bg-indigo-700 shadow-sm" title="Aggiungi"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg></button></td>
                                    </tr>
                                </tfoot>
                            )}
                            </table>
                        </div>
                    </div>
                )})}
            </div>
          )}
          {activeTab === 'dependencies' && (
             <div className="flex-grow overflow-y-auto pr-2 -mr-2 space-y-6">
                <div className="grid grid-cols-2 gap-6"><div><h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Predecessori</h4>{predecessors.length > 0 ? (<ul className="space-y-2">{predecessors.map(dep => { const pred = allWorkGroups.find(wg => wg.id === dep.from); return (<li key={dep.id} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700/50 rounded-md text-sm"><div><p className="font-medium text-gray-900 dark:text-gray-100">{pred?.name || 'Unknown Task'}</p><p className="text-gray-500 dark:text-gray-400">{dependencyTypeLabels[dep.type]} {dep.lag !== 0 ? `(${dep.lag > 0 ? '+' : ''}${dep.lag}d)` : ''}</p></div>{!isLocked && <button onClick={() => handleDeleteDependency(dep.id)} className="text-gray-400 hover:text-red-500 p-1 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>}</li>)})}</ul>) : <p className="text-sm text-gray-500 italic">Nessun predecessore.</p>}</div><div><h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Successori</h4>{successors.length > 0 ? (<ul className="space-y-2">{successors.map(dep => { const succ = allWorkGroups.find(wg => wg.id === dep.to); return (<li key={dep.id} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700/50 rounded-md text-sm"><div><p className="font-medium text-gray-900 dark:text-gray-100">{succ?.name || 'Unknown Task'}</p><p className="text-gray-500 dark:text-gray-400">{dependencyTypeLabels[dep.type]} {dep.lag !== 0 ? `(${dep.lag > 0 ? '+' : ''}${dep.lag}d)` : ''}</p></div>{!isLocked && <button onClick={() => handleDeleteDependency(dep.id)} className="text-gray-400 hover:text-red-500 p-1 rounded-full"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>}</li>)})}</ul>) : <p className="text-sm text-gray-500 italic">Nessun successore.</p>}</div></div>{!isLocked && (<div className="pt-4 border-t border-gray-200 dark:border-gray-700"><h4 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Aggiungi Dipendenza</h4><div className="grid grid-cols-4 gap-4 items-end p-2 bg-gray-50 dark:bg-gray-900/50 rounded-md"><select value={newDependency.direction} onChange={e => setNewDependency(p => ({ ...p, direction: e.target.value as any }))} className="p-2 text-sm bg-white dark:bg-gray-700 border rounded-md"><option value="predecessor">Predecessore</option><option value="successor">Successore</option></select><select value={newDependency.targetId} onChange={e => setNewDependency(p => ({ ...p, targetId: e.target.value }))} className="p-2 text-sm bg-white dark:bg-gray-700 border rounded-md col-span-2"><option value="">Seleziona attività...</option>{availableTasksForDependency.map(wg => <option key={wg.id} value={wg.id}>{wg.name}</option>)}</select><button onClick={handleAddDependency} disabled={!newDependency.targetId} className="px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-gray-400">Aggiungi</button></div></div>)}
            </div>
          )}
        </div>

        {/* --- FIXED MINI-COMPUTO ANALITICO PICKER --- */}
        {activeBoqPickerItem && (
            <div 
                className="fixed bg-white dark:bg-gray-800 shadow-2xl rounded-xl border border-gray-300 dark:border-gray-600 z-[100] animate-fade-in flex flex-col"
                style={{
                    top: Math.min(pickerCoords.top, window.innerHeight - 450),
                    left: pickerCoords.left,
                    width: '600px',
                    maxHeight: '420px'
                }}
            >
                <div className="flex justify-between items-center p-3 bg-gray-100 dark:bg-gray-700 rounded-t-xl border-b border-gray-300 dark:border-gray-600">
                    <div>
                        <h5 className="text-xs font-bold uppercase text-indigo-700 dark:text-indigo-300">Richiama Misure da Computo</h5>
                        <p className="text-[10px] text-gray-500">Seleziona le righe analitiche da importare</p>
                    </div>
                    <button onClick={() => setActiveBoqPickerItem(null)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-gray-500">✕</button>
                </div>

                <div className="flex-grow overflow-y-auto">
                    <table className="w-full text-[11px] text-left border-collapse">
                        <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10 shadow-sm">
                            <tr className="text-gray-500 uppercase font-bold border-b border-gray-200 dark:border-gray-700">
                                <th className="px-3 py-2 w-10 text-center">Sel.</th>
                                <th className="px-2 py-2">Descrizione Parti / Note</th>
                                <th className="px-2 py-2 w-12 text-center">Parti</th>
                                <th className="px-2 py-2 w-12 text-center">Lung.</th>
                                <th className="px-2 py-2 w-12 text-center">Larg.</th>
                                <th className="px-2 py-2 w-12 text-center">H/P</th>
                                <th className="px-3 py-2 w-20 text-right">Quantità</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {activeGroup.items.find(i => i.articleCode === activeBoqPickerItem)?.originalMeasurements?.map(boq => {
                                const isSel = selectedBoqIds[activeBoqPickerItem]?.has(boq.id);
                                const rowQty = getBoqRowQuantity(boq);
                                return (
                                    <tr 
                                        key={boq.id} 
                                        onClick={() => toggleBoqLineSelection(activeBoqPickerItem, boq.id)}
                                        className={`cursor-pointer transition-colors ${isSel ? 'bg-indigo-50 dark:bg-indigo-900/40' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                                    >
                                        <td className="px-3 py-2 text-center">
                                            <input type="checkbox" checked={isSel} readOnly className="h-3 w-3 text-indigo-600 rounded border-gray-300" />
                                        </td>
                                        <td className="px-2 py-2 font-medium text-gray-700 dark:text-gray-200 italic">{boq.description || 'Riga computo'}</td>
                                        <td className="px-2 py-2 text-center text-gray-500 font-mono">{boq.multiplier || '-'}</td>
                                        <td className="px-2 py-2 text-center text-gray-500 font-mono">{boq.length || '-'}</td>
                                        <td className="px-2 py-2 text-center text-gray-500 font-mono">{boq.width || '-'}</td>
                                        <td className="px-2 py-2 text-center text-gray-500 font-mono">{boq.height || '-'}</td>
                                        <td className="px-3 py-2 text-right font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                                            {numberFormatter.format(rowQty)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-b-xl border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
                    <span className="text-[10px] font-bold text-gray-500 uppercase">
                        Righe: <span className="text-indigo-600">{selectedBoqIds[activeBoqPickerItem]?.size || 0}</span>
                    </span>
                    <div className="flex gap-2">
                        <button onClick={() => setActiveBoqPickerItem(null)} className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200 rounded-md">Annulla</button>
                        <button 
                            onClick={() => importSelectedBoqLines(activeBoqPickerItem)}
                            disabled={!selectedBoqIds[activeBoqPickerItem]?.size}
                            className="px-4 py-1.5 bg-indigo-600 text-white rounded-md text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 shadow-md"
                        >
                            Importa Selezionate
                        </button>
                    </div>
                </div>
            </div>
        )}

        <div className="flex-shrink-0 flex items-center justify-between p-3 border-t border-gray-200 dark:border-gray-700">
          <button type="button" onClick={handleAttemptClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200 dark:border-gray-500 dark:hover:bg-gray-50">Esci</button>
          {!(isViewOnly || isLocked) && <button type="button" onClick={handleSaveChanges} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 disabled:bg-gray-400 dark:disabled:bg-gray-600" disabled={isViewOnly || isLocked}>Salva e Chiudi</button>}
        </div>
      </div>
    </div>
  );
};

export default TaskModal;
