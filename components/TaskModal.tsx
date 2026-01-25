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

// FORMATTATORI CON SEPARATORI MIGLIAIA (it-IT)
const currencyFormatter = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
const numberFormatter = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 3 });

const TaskModal: React.FC<TaskModalProps> = ({ isOpen, onClose, group, allWorkGroups, allDocuments, dependencies, setWorkGroups, onDependenciesChange, isViewOnly, isLocked, teams, workers }) => {
  const [activeTab, setActiveTab] = useState('measurements');
  const [activeGroup, setActiveGroup] = useState<ExtendedWorkGroup | null>(null);
  
  const [stickyDate, setStickyDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [globalTeamId, setGlobalTeamId] = useState<string>('');
  const [globalWorkerIds, setGlobalWorkerIds] = useState<string[]>([]);

  const [newMeasurements, setNewMeasurements] = useState<Record<string, MeasurementInputState>>({});
  const [deductionModes, setDeductionModes] = useState<Record<string, boolean>>({}); 
  
  const [isDirty, setIsDirty] = useState(false);
  const [expandedVariations, setExpandedVariations] = useState<Set<string>>(new Set());
  
  const [activeBoqPickerItem, setActiveBoqPickerItem] = useState<string | null>(null);
  const [selectedBoqIds, setSelectedBoqIds] = useState<Record<string, Set<string>>>({});
  const [pickerCoords, setPickerCoords] = useState({ top: 0, left: 0 });

  const [newVariation, setNewVariation] = useState<{ number: string, quantity: string, type: 'increase' | 'decrease' }>({
      number: '', quantity: '', type: 'increase'
  });

  const [newDependency, setNewDependency] = useState<{ targetId: string; type: DependencyType; lag: string, direction: 'predecessor' | 'successor' }>({
    targetId: '', type: 'FS', lag: '0', direction: 'predecessor'
  });

  useEffect(() => {
    if (isOpen && group) {
        setActiveTab('measurements');
        setExpandedVariations(new Set()); 
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
        setGlobalTeamId(''); setGlobalWorkerIds([]); setActiveBoqPickerItem(null);
    }
  }, [isOpen, group]);
  
  const handleAttemptClose = useCallback(() => {
    if (isDirty && !(isViewOnly || isLocked)) { if (window.confirm('Modifiche non salvate. Uscire comunque?')) onClose(); } else onClose();
  }, [isDirty, isViewOnly, isLocked, onClose]);

  const toggleDeductionMode = (articleCode: string) => { setDeductionModes(prev => ({ ...prev, [articleCode]: !prev[articleCode] })); };

  const handleMeasurementChange = (articleCode: string, field: keyof MeasurementInputState, value: string) => {
    if (isViewOnly || isLocked) return;
    setIsDirty(true);
    setNewMeasurements(prev => ({ ...prev, [articleCode]: { ...prev[articleCode], [field]: value } }));
  };

  const toggleDiary = (articleCode: string) => { setIsDirty(true); };
  const toggleVariations = (articleCode: string) => { setExpandedVariations(prev => { const next = new Set(prev); if (next.has(articleCode)) next.delete(articleCode); else next.add(articleCode); return next; }); };

  const getBoqRowQuantity = (l: any): number => {
      if (l.quantity !== undefined && l.quantity !== null) return l.quantity;
      if (l.total !== undefined && l.total !== null && l.total !== 0) return l.total;
      return (l.multiplier || 1) * (l.length || 1) * (l.width || 1) * (l.height || 1);
  };

  const toggleBoqPicker = (articleCode: string, e: React.MouseEvent) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setPickerCoords({ top: rect.top, left: Math.max(10, rect.left - 520) });
      setActiveBoqPickerItem(activeBoqPickerItem === articleCode ? null : articleCode);
      if (!selectedBoqIds[articleCode]) setSelectedBoqIds(prev => ({ ...prev, [articleCode]: new Set() }));
  };

  const toggleBoqLineSelection = (articleCode: string, boqId: string) => {
      setSelectedBoqIds(prev => {
          const nextSet = new Set(prev[articleCode]);
          if (nextSet.has(boqId)) nextSet.delete(boqId); else nextSet.add(boqId);
          return { ...prev, [articleCode]: nextSet };
      });
  };

  const importSelectedBoqLines = (articleCode: string) => {
      const item = activeGroup?.items.find(i => i.articleCode === articleCode);
      if (!item || !item.originalMeasurements) return;
      const linesToImport = item.originalMeasurements.filter(m => selectedBoqIds[articleCode]?.has(m.id));
      const totalToImport = linesToImport.reduce((acc, l) => acc + getBoqRowQuantity(l), 0);
      
      const varTotal = (item.variations || []).reduce((acc, v) => v.type === 'increase' ? acc + v.quantity : acc - v.quantity, 0);
      const residual = Math.round((item.quantity + varTotal - (item.measurements || []).reduce((acc, m) => acc + m.quantity, 0)) * 1000) / 1000;

      if (totalToImport > (residual + 0.001) && totalToImport > 0) {
          alert(`ECCEDENZA: Importazione supera residuo.`);
          return;
      }

      const newBatch: ExtendedMeasurement[] = linesToImport.map(l => ({
          id: crypto.randomUUID(), date: stickyDate, quantity: getBoqRowQuantity(l), note: l.description || 'Da Computo',
          factor: l.multiplier, length: l.length, width: l.width, height: l.height,
          teamId: globalTeamId || undefined, workerIds: globalWorkerIds.length > 0 ? globalWorkerIds : undefined, _isCommitted: false
      }));

      setActiveGroup(prev => {
          if (!prev) return null;
          const updatedItems = prev.items.map(i => i.articleCode === articleCode ? { ...i, measurements: [...(i.measurements || []), ...newBatch] } : i);
          return { ...prev, items: updatedItems };
      });
      setActiveBoqPickerItem(null);
      setIsDirty(true);
  };

  const handleAddVariation = (articleCode: string) => {
      if (!newVariation.number || !newVariation.quantity) return;
      const qty = parseFloat(newVariation.quantity.replace(',', '.'));
      const variation: Variation = { id: crypto.randomUUID(), date: stickyDate, number: newVariation.number, quantity: qty, type: newVariation.type };
      
      setActiveGroup(prev => {
          if (!prev) return null;
          const updatedItems = prev.items.map(i => i.articleCode === articleCode ? { ...i, variations: [...(i.variations || []), variation] } : i);
          return { ...prev, items: updatedItems };
      });
      setNewVariation({ number: '', quantity: '', type: 'increase' });
      setIsDirty(true);
      toggleVariations(articleCode); 
  };

  const handleAddMeasurement = (itemArticleCode: string) => {
    if (!activeGroup || isViewOnly || isLocked) return;
    const measurementInput = newMeasurements[itemArticleCode];
    const item = activeGroup.items.find(i => i.articleCode === itemArticleCode);
    if (!item) return;
    const varTotal = (item.variations || []).reduce((acc, v) => v.type === 'increase' ? acc + v.quantity : acc - v.quantity, 0);
    const residual = Math.round((item.quantity + varTotal - (item.measurements || []).reduce((acc, m) => acc + m.quantity, 0)) * 1000) / 1000;
    
    let quantityStr = measurementInput.quantity.replace(',', '.');
    // LOGICA RESIDUO: Se vuoto, usa sempre il residuo calcolato
    let quantity = quantityStr.trim() === '' ? residual : (parseFloat(quantityStr) || 0);
    
    if (quantity > (residual + 0.001) && quantity > 0) { alert(`ATTENZIONE: Quantità superiore al residuo.`); return; }
    if (deductionModes[itemArticleCode]) quantity = -Math.abs(quantity);
    if (quantity === 0) return; 

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
        return { ...prev, items: prev.items.map(i => i.articleCode === itemArticleCode ? { ...i, measurements: [...(i.measurements || []), newMeasurement] } : i) }; 
    });
    setNewMeasurements(prev => ({ ...prev, [itemArticleCode]: { quantity: '', note: '', factor: '', length: '', width: '', height: '' } }));
    setIsDirty(true);
  };

  const handleReverseMeasurement = (e: React.MouseEvent, itemArticleCode: string, mIndex: number) => {
    e.preventDefault(); e.stopPropagation();
    if (isViewOnly || isLocked || !activeGroup) return;
    const item = activeGroup.items.find(i => i.articleCode === itemArticleCode);
    const m = item?.measurements?.[mIndex];
    if (!m || m.quantity < 0) return;
    const rev: ExtendedMeasurement = { id: crypto.randomUUID(), date: stickyDate, quantity: -m.quantity, note: `STORNO: ${m.note || ''}`, teamId: m.teamId, workerIds: m.workerIds, _isCommitted: false };
    setActiveGroup(prev => prev ? ({ ...prev, items: prev.items.map(i => i.articleCode === itemArticleCode ? { ...i, measurements: [...(i.measurements || []), rev] } : i) }) : null);
    setIsDirty(true);
  };

  const handleSaveChanges = () => { 
      if (!activeGroup || isViewOnly || isLocked) return; 
      
      const totalMeasuredValue = activeGroup.items.reduce((total, i) => 
          total + ((i.measurements || []).reduce((acc, m) => acc + m.quantity, 0) * i.unitPrice), 0);
      const calculatedProgress = activeGroup.value > 0 ? Math.min(100, (totalMeasuredValue / activeGroup.value) * 100) : 0;

      const cleanGroup: WorkGroup = { 
          ...activeGroup, 
          progress: calculatedProgress, 
          items: activeGroup.items.map(item => ({ 
              ...item, 
              measurements: item.measurements?.map(m => { const { _isCommitted, ...rest } = m; return rest; }) 
          })) 
      }; 
      setWorkGroups(prev => prev.map(g => g.id === activeGroup.id ? cleanGroup : g)); 
      onClose(); 
  };

  const toggleAccountingType = (type: 'body' | 'measure') => {
      if (isLocked || isViewOnly) return;
      setActiveGroup(prev => prev ? { ...prev, accountingType: type } : null);
      setIsDirty(true);
  };

  const toggleSecurityFlag = () => {
      if (isLocked || isViewOnly) return;
      setActiveGroup(prev => prev ? { ...prev, isSecurityCost: !prev.isSecurityCost } : null);
      setIsDirty(true);
  };

  if (!isOpen || !activeGroup) return null;
  const totalMeasuredValue = activeGroup.items.reduce((total, i) => total + ((i.measurements || []).reduce((acc, m) => acc + m.quantity, 0) * i.unitPrice), 0);
  const currentProgress = activeGroup.value > 0 ? (totalMeasuredValue / activeGroup.value) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60" onClick={handleAttemptClose}>
      <div className="relative w-full max-w-6xl h-[95vh] bg-white dark:bg-gray-800 rounded-lg shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
        
        {/* Banner Configurazione WBS */}
        <div className="flex-shrink-0 bg-white dark:bg-gray-800 z-10 rounded-t-lg">
            <div className={`w-full py-1 px-4 flex items-center justify-between border-b-2 shadow-sm ${activeGroup.isSecurityCost ? 'bg-orange-100 text-orange-800 border-orange-300' : 'bg-green-100 text-green-800 border-green-300'}`}>
                <div className="flex items-center gap-4">
                    <span className="text-xs font-bold uppercase tracking-wider">Configurazione WBS:</span>
                    <div className="flex bg-white/50 rounded-lg p-1">
                        <button onClick={() => toggleAccountingType('measure')} className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all flex items-center gap-1.5 ${activeGroup.accountingType === 'measure' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}>
                           {activeGroup.accountingType === 'measure' && <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>}
                           A MISURA
                        </button>
                        <button onClick={() => toggleAccountingType('body')} className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all flex items-center gap-1.5 ${activeGroup.accountingType === 'body' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-200'}`}>
                           {activeGroup.accountingType === 'body' && <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>}
                           A CORPO
                        </button>
                    </div>
                    <button onClick={toggleSecurityFlag} className={`px-3 py-2 text-[10px] font-bold rounded-md transition-all flex items-center gap-2 shadow-sm ${activeGroup.isSecurityCost ? 'bg-orange-600 text-white hover:bg-orange-700' : 'bg-white/70 text-gray-500 hover:bg-gray-200 border border-gray-300'}`}>
                        <svg className={`w-3.5 h-3.5 ${activeGroup.isSecurityCost ? 'animate-pulse' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                           <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                        {activeGroup.isSecurityCost ? 'ONERI SICUREZZA' : 'LAVORI SOGG. RIBASSO'}
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-medium opacity-70 italic">Stato: {activeGroup.accountingType === 'body' ? 'Contabilità %' : 'Contabilità Analitica'}</span>
                </div>
            </div>

            <div className="flex flex-col border-b border-gray-200 dark:border-gray-700 p-3">
                <div className="flex items-start justify-between">
                    <div className="flex-1 flex flex-col sm:flex-row sm:items-center sm:gap-4">
                        <h3 className="text-xl font-bold text-blue-600 dark:text-blue-400 truncate">{activeGroup.name}</h3>
                        <div className="flex items-center space-x-4 text-xs bg-gray-50 dark:bg-gray-700/50 px-3 py-1 rounded-full">
                            <div title="Valore misurato cumulativo"><span className="text-gray-500 mr-1">Maturato:</span><span className="font-bold text-indigo-600">{currencyFormatter.format(totalMeasuredValue)}</span></div>
                            <div className="w-px h-3 bg-gray-300"></div>
                            <div title="Progresso calcolato per il Gantt"><span className="text-gray-500 mr-1">Avanzamento:</span><span className="font-bold text-gray-900 dark:text-white">{numberFormatter.format(currentProgress)}%</span></div>
                        </div>
                    </div>
                    <button onClick={handleAttemptClose} className="text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 p-1.5 rounded-lg">✕</button>
                </div>
            </div>
            <div className="border-b border-gray-200 dark:border-gray-700 px-4">
                <nav className="-mb-px flex space-x-6">
                    <button onClick={() => setActiveTab('measurements')} className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'measurements' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Libretto Contabilità</button>
                    <button onClick={() => setActiveTab('dependencies')} className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === 'dependencies' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Dipendenze</button>
                </nav>
            </div>
        </div>

        <div className="flex-grow p-4 flex flex-col overflow-hidden relative">
          {activeTab === 'measurements' && (
            <div className="flex-grow overflow-y-auto pr-2 space-y-4">
                {activeGroup.items.map((item, index) => {
                    const varTotal = (item.variations || []).reduce((acc, v) => v.type === 'increase' ? acc + v.quantity : acc - v.quantity, 0);
                    const measuredTotal = (item.measurements || []).reduce((acc, m) => acc + m.quantity, 0);
                    const residual = Math.max(0, Math.round((item.quantity + varTotal - measuredTotal) * 1000) / 1000);
                    const hasOriginalMeasures = item.originalMeasurements && item.originalMeasurements.length > 0;
                    const hasVariations = (item.variations?.length || 0) > 0;
                    
                    const inputVal = newMeasurements[item.articleCode]?.quantity;
                    const previewQty = (inputVal === '' || inputVal === undefined) ? residual : parseFloat(inputVal.replace(',', '.')) || 0;
                    const previewTotalAmount = previewQty * item.unitPrice;
                    return (
                    <div key={index} className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 shadow-sm">
                        <table className="w-full text-sm mb-2 table-fixed">
                            <colgroup><col className="w-[15%]" /><col className="w-[35%]" /><col className="w-[50%]" /></colgroup>
                            <tbody>
                                <tr>
                                    <td className="font-semibold text-gray-900 dark:text-white align-top text-xs">
                                        <div className="flex items-center gap-1">
                                            <span className="text-gray-400 font-normal">#{item.originalIndex || (index + 1)}</span>
                                            <span>{item.articleCode}</span>
                                            {activeGroup.isSecurityCost && <span className="text-[9px] bg-green-100 text-green-700 px-1 rounded font-bold">SIC</span>}
                                        </div>
                                        <div className="flex flex-col gap-1 mt-2">
                                            <button onClick={() => toggleVariations(item.articleCode)} className={`flex items-center gap-1 text-[10px] transition-colors ${expandedVariations.has(item.articleCode) ? 'text-orange-600' : 'text-gray-400 hover:text-orange-600'}`}><svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg><span>Varianti/Perizie ({item.variations?.length || 0})</span></button>
                                        </div>
                                    </td>
                                    <td className="text-gray-700 dark:text-gray-300 text-justify align-top pr-4 text-xs leading-tight line-clamp-8" title={item.description}>{item.description}</td>
                                    <td className="align-top text-right text-[11px]">
                                        <div className="grid grid-cols-[auto_auto] gap-x-3 items-baseline justify-end">
                                            <span className="text-gray-500">P. Unitario:</span><span className="font-bold text-indigo-600">{currencyFormatter.format(item.unitPrice)}</span>
                                            <div className="flex items-center justify-end space-x-1">
                                                {hasVariations && (
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-orange-500 animate-pulse" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                                )}
                                                <span className="text-gray-500 font-bold">Progetto:</span>
                                            </div>
                                            <div className="flex items-center justify-end gap-1">{varTotal !== 0 && <span className="text-gray-400 line-through mr-1">{numberFormatter.format(item.quantity)}</span>}<span className="font-bold text-gray-700 dark:text-gray-200">{numberFormatter.format(item.quantity + varTotal)} {item.unit}</span></div>
                                            <span className="text-gray-500">Misurato:</span><span className="font-bold text-gray-900 dark:text-white">{numberFormatter.format(measuredTotal)} {item.unit}</span>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                        {expandedVariations.has(item.articleCode) && (
                            <div className="mb-3 p-2 bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800 rounded animate-fade-in">
                                <h4 className="text-[10px] font-bold text-orange-800 dark:text-orange-400 uppercase mb-2">Gestione Varianti e Perizie</h4>
                                <div className="space-y-1 mb-2">
                                    {item.variations?.map(v => (
                                        <div key={v.id} className="flex justify-between text-[11px] bg-white dark:bg-gray-700 p-1 rounded shadow-sm">
                                            <span><strong>{v.number}</strong> ({format(parseISO(v.date), 'dd/MM/yy')})</span>
                                            <span className={v.type === 'increase' ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>{v.type === 'increase' ? '+' : '-'}{numberFormatter.format(v.quantity)}</span>
                                        </div>
                                    ))}
                                </div>
                                {!isLocked && !isViewOnly && (
                                    <div className="flex gap-1">
                                        <input type="text" placeholder="N. Perizia" value={newVariation.number} onChange={e => setNewVariation(p => ({ ...p, number: e.target.value }))} className="w-1/3 p-1 text-[11px] border rounded dark:bg-gray-800" />
                                        <select value={newVariation.type} onChange={e => setNewVariation(p => ({ ...p, type: e.target.value as any }))} className="w-1/4 p-1 text-[11px] border rounded dark:bg-gray-800"><option value="increase">Aumento (+)</option><option value="decrease">Diminuz. (-)</option></select>
                                        <input type="text" placeholder="Q.tà" value={newVariation.quantity} onChange={e => setNewVariation(p => ({ ...p, quantity: e.target.value }))} className="w-1/4 p-1 text-[11px] border rounded dark:bg-gray-800" />
                                        <button onClick={() => handleAddVariation(item.articleCode)} className="flex-grow bg-orange-600 text-white text-[11px] font-bold rounded hover:bg-orange-700">+</button>
                                    </div>
                                )}
                            </div>
                        )}
                        <div className="mb-3 max-h-64 overflow-y-auto border border-gray-100 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-900/20">
                            <table className="w-full text-[11px] text-left table-fixed">
                            <thead className="text-gray-700 bg-gray-100 dark:bg-gray-700 dark:text-gray-400 sticky top-0 z-10">
                                <tr><th className="px-2 py-1 w-[10%]">Data</th><th className="px-2 py-1 w-[20%]">Nota / Posizione</th><th className="px-2 py-1 w-[10%] text-center text-gray-500">U.M.</th><th className="px-1 py-1 w-[5%] text-center text-gray-500">Fatt.</th><th className="px-1 py-1 w-[5%] text-center text-gray-500">Lung.</th><th className="px-1 py-1 w-[5%] text-center text-gray-500">Larg.</th><th className="px-1 py-1 w-[5%] text-center text-gray-500">H/P</th><th className="px-2 py-1 w-[10%] text-right font-bold">Quantità</th><th className="px-2 py-1 w-[10%] text-right text-gray-500">P. Unit.</th><th className="px-2 py-1 w-[12%] text-right">Valore</th><th className="px-1 py-1 w-[6%]"></th></tr>
                            </thead>
                            <tbody>
                                {item.measurements?.map((m, mIdx) => {
                                const isNeg = m.quantity < 0; const isCom = m._isCommitted ?? false;
                                return (
                                    <tr key={mIdx} className={`border-b dark:border-gray-600 bg-white dark:bg-gray-800 ${isNeg ? 'text-red-600' : ''}`}>
                                    <td className="px-2 py-1">{format(parseISO(m.date), 'dd/MM/yy')}</td>
                                    <td className="px-2 py-1 truncate italic" title={m.note}>{m.note}</td>
                                    <td className="px-2 py-1 text-center text-gray-400">{item.unit}</td>
                                    <td className="px-1 py-1 text-center text-gray-400">{m.factor || '-'}</td><td className="px-1 py-1 text-center text-gray-400">{m.length || '-'}</td><td className="px-1 py-1 text-center text-gray-400">{m.width || '-'}</td><td className="px-1 py-1 text-center text-gray-400">{m.height || '-'}</td>
                                    <td className={`px-2 py-1 text-right font-bold ${isNeg ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>{numberFormatter.format(m.quantity)}</td>
                                    <td className="px-2 py-1 text-right text-gray-400 font-mono">{currencyFormatter.format(item.unitPrice)}</td>
                                    <td className="px-2 py-1 text-right font-semibold">{currencyFormatter.format(m.quantity * item.unitPrice)}</td>
                                    <td className="px-1 py-1 text-center">{!(isViewOnly || isLocked) && !isNeg && (isCom ? (<button onClick={(e) => handleReverseMeasurement(e, item.articleCode, mIdx)} className="text-orange-400 hover:text-orange-600" title="Storno"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg></button>) : (<button onClick={() => { setActiveGroup(p => p ? ({ ...p, items: p.items.map(i => i.articleCode === item.articleCode ? ({ ...i, measurements: i.measurements?.filter((_, idx) => idx !== mIdx) }) : i) }) : null); setIsDirty(true); }} className="text-gray-400 hover:text-red-500"><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>))}</td>
                                    </tr>
                                );})}
                            </tbody>
                            {(!(isViewOnly || isLocked)) && (
                                <tfoot className="bg-indigo-50/80 dark:bg-indigo-900/30 sticky bottom-0 z-10">
                                    <tr className="border-t border-indigo-100 dark:border-gray-600">
                                        <td className="px-2 py-1.5 text-gray-500 italic">{format(parseISO(stickyDate), 'dd/MM/yy')}</td>
                                        <td className="px-1 py-1">
                                            <div className="flex items-center gap-1">
                                                <button onClick={() => toggleDeductionMode(item.articleCode)} className={`h-6 px-1.5 rounded-md text-white font-bold text-[10px] transition-colors ${deductionModes[item.articleCode] ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-400 hover:bg-gray-500'}`}>{deductionModes[item.articleCode] ? '-' : '±'}</button>
                                                <input type="text" value={(newMeasurements[item.articleCode] || { note: '' }).note} placeholder="Nota..." onChange={e => handleMeasurementChange(item.articleCode, 'note', e.target.value)} className="w-full p-1 text-[10px] border rounded dark:bg-gray-700" />
                                            </div>
                                        </td>
                                        <td className="px-1 py-1 text-center">{hasOriginalMeasures && <button onClick={(e) => toggleBoqPicker(item.articleCode, e)} className="w-8 h-6 flex items-center justify-center rounded border bg-white text-indigo-600 text-[10px] hover:bg-indigo-50 transition-colors">📋</button>}</td>
                                        {['factor', 'length', 'width', 'height'].map(f => (
                                            <td key={f} className="px-0.5 py-1">
                                                <input type="text" className="w-full p-1 text-center text-[10px] border rounded dark:bg-gray-700" value={(newMeasurements[item.articleCode] as any)[f] || ''} onChange={e => handleMeasurementChange(item.articleCode, f as any, e.target.value)} />
                                            </td>
                                        ))}
                                        <td className="px-1 py-1 relative">
                                            <input type="text" value={(newMeasurements[item.articleCode] || { quantity: '' }).quantity} onChange={e => handleMeasurementChange(item.articleCode, 'quantity', e.target.value)} className={`w-full p-1 text-[11px] border rounded text-right font-bold ${deductionModes[item.articleCode] ? 'text-red-600 bg-red-50' : 'text-gray-900 bg-white'}`} placeholder={numberFormatter.format(residual)} />
                                        </td>
                                        <td className="px-2 py-1 text-right text-gray-500 font-mono text-[10px]">{currencyFormatter.format(item.unitPrice)}</td>
                                        <td className="px-2 py-1 text-right font-bold text-[11px] text-indigo-800 dark:text-indigo-200">{currencyFormatter.format(previewTotalAmount)}</td>
                                        <td className="px-1 py-1 text-center"><button onClick={() => handleAddMeasurement(item.articleCode)} className="flex items-center justify-center w-6 h-6 bg-indigo-600 text-white rounded hover:bg-indigo-700 shadow-sm"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg></button></td>
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
             <div className="flex-grow overflow-y-auto pr-2 space-y-6">
                <div className="grid grid-cols-2 gap-6">
                    <div><h4 className="font-semibold text-gray-800 mb-2">Predecessori</h4>{dependencies.filter(d => d.to === activeGroup.id).map(dep => { const p = allWorkGroups.find(w => w.id === dep.from); return (<div key={dep.id} className="flex justify-between items-center p-2 bg-gray-50 rounded text-sm mb-1"><span>{p?.name}</span><button onClick={() => onDependenciesChange(prev => prev.filter(d => d.id !== dep.id))} className="text-red-500 p-1">✕</button></div>)})}</div>
                    <div><h4 className="font-semibold text-gray-800 mb-2">Successori</h4>{dependencies.filter(d => d.from === activeGroup.id).map(dep => { const s = allWorkGroups.find(w => w.id === dep.to); return (<div key={dep.id} className="flex justify-between items-center p-2 bg-gray-50 rounded text-sm mb-1"><span>{s?.name}</span><button onClick={() => onDependenciesChange(prev => prev.filter(d => d.id !== dep.id))} className="text-red-500 p-1">✕</button></div>)})}</div>
                </div>
                {!isLocked && (<div className="pt-4 border-t"><h4 className="font-semibold text-gray-800 mb-2">Aggiungi Dipendenza</h4><div className="grid grid-cols-4 gap-2 items-end"><select value={newDependency.direction} onChange={e => setNewDependency(p => ({ ...p, direction: e.target.value as any }))} className="p-2 text-sm border rounded"><option value="predecessor">Predecessore</option><option value="successor">Successore</option></select><select value={newDependency.targetId} onChange={e => setNewDependency(p => ({ ...p, targetId: e.target.value }))} className="p-2 text-sm border rounded col-span-2"><option value="">Scegli attività...</option>{allWorkGroups.filter(wg => wg.id !== activeGroup.id).map(wg => <option key={wg.id} value={wg.id}>{wg.name}</option>)}</select><button onClick={() => { if (!newDependency.targetId) return; onDependenciesChange(p => [...p, { id: crypto.randomUUID(), from: newDependency.direction === 'successor' ? activeGroup.id : newDependency.targetId, to: newDependency.direction === 'successor' ? newDependency.targetId : activeGroup.id, type: newDependency.type, lag: parseInt(newDependency.lag) || 0 }]); setNewDependency(p => ({ ...p, targetId: '' })); }} className="px-3 py-2 text-sm font-medium text-white bg-indigo-600 rounded">Aggiungi</button></div></div>)}
             </div>
          )}
        </div>
        {activeBoqPickerItem && (
            <div className="fixed bg-white dark:bg-gray-800 shadow-2xl rounded-xl border border-gray-300 dark:border-gray-600 z-[100] flex flex-col" style={{ top: Math.min(pickerCoords.top, window.innerHeight - 450), left: pickerCoords.left, width: '600px', maxHeight: '420px' }}>
                <div className="flex justify-between items-center p-3 bg-gray-100 dark:bg-gray-700 rounded-t-xl border-b">
                    <div><h5 className="text-xs font-bold uppercase text-indigo-700 dark:text-indigo-300">Misure Originali da Computo</h5><p className="text-[10px] text-gray-500">Seleziona righe analitiche da importare nel libretto</p></div>
                    <button onClick={() => setActiveBoqPickerItem(null)} className="p-1 hover:bg-gray-200 rounded">✕</button>
                </div>
                <div className="flex-grow overflow-y-auto">
                    <table className="w-full text-[11px] text-left">
                        <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10 shadow-sm"><tr className="text-gray-500 uppercase font-bold border-b"><th className="px-3 py-2 w-10 text-center">Sel.</th><th className="px-2 py-2">Posizione / Note</th><th className="px-2 py-2 w-12 text-center">Parti</th><th className="px-2 py-2 w-12 text-center">Lung.</th><th className="px-2 py-2 w-12 text-center">Larg.</th><th className="px-2 py-2 w-12 text-center">H/P</th><th className="px-3 py-2 w-20 text-right">Quantità</th></tr></thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                            {activeGroup.items.find(i => i.articleCode === activeBoqPickerItem)?.originalMeasurements?.map(boq => {
                                const isSel = selectedBoqIds[activeBoqPickerItem]?.has(boq.id);
                                return (
                                    <tr key={boq.id} onClick={() => toggleBoqLineSelection(activeBoqPickerItem, boq.id)} className={`cursor-pointer transition-colors ${isSel ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                                        <td className="px-3 py-2 text-center"><input type="checkbox" checked={isSel} readOnly className="h-3 w-3 text-indigo-600 rounded" /></td>
                                        <td className="px-2 py-2 font-medium italic">{boq.description || 'Riga computo'}</td>
                                        <td className="px-2 py-2 text-center text-gray-500">{boq.multiplier || '-'}</td>
                                        <td className="px-2 py-2 text-center text-gray-500">{boq.length || '-'}</td>
                                        <td className="px-2 py-2 text-center text-gray-500">{boq.width || '-'}</td>
                                        <td className="px-2 py-2 text-center text-gray-500">{boq.height || '-'}</td>
                                        <td className="px-3 py-2 text-right font-bold text-indigo-600">{numberFormatter.format(getBoqRowQuantity(boq))}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-b-xl border-t flex justify-between items-center">
                    <span className="text-[10px] font-bold text-gray-500">Righe Selezionate: {selectedBoqIds[activeBoqPickerItem]?.size || 0}</span>
                    <div className="flex gap-2"><button onClick={() => setActiveBoqPickerItem(null)} className="px-3 py-1.5 text-xs font-medium text-gray-600">Annulla</button><button onClick={() => importSelectedBoqLines(activeBoqPickerItem)} disabled={!selectedBoqIds[activeBoqPickerItem]?.size} className="px-4 py-1.5 bg-indigo-600 text-white rounded text-xs font-bold hover:bg-indigo-700 disabled:opacity-50">Importa Selezionate</button></div>
                </div>
            </div>
        )}
        <div className="flex-shrink-0 flex items-center justify-between p-3 border-t border-gray-200 dark:border-gray-700">
          <button type="button" onClick={handleAttemptClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 dark:bg-gray-600 dark:text-gray-200">Esci</button>
          {!(isViewOnly || isLocked) && <button type="button" onClick={handleSaveChanges} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md shadow-sm hover:bg-indigo-700">Salva e Chiudi</button>}
        </div>
      </div>
    </div>
  );
};

export default TaskModal;