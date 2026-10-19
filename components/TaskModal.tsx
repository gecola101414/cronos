import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { WorkGroup, WorkItem, Measurement, Dependency, DependencyType, Team, Worker, Annotation, Variation, ProjectDocument } from '../types';
import { format, parseISO, addDays, parse, isValid } from 'date-fns';

import { EuropeanDateInput } from './EuropeanDateInput';


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
  initialTab?: 'measurements' | 'planning' | 'dependencies';
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
    date?: string;
    quantity: string;
    note: string;
    factor: string;
    length: string;
    width: string;
    height: string;
    sourceBoqId?: string;
}

export interface SingleBoqMeasure {
  id: string;
  articleCode: string;
  index: number;
  description: string;
  factor?: number;
  length?: number;
  width?: number;
  height?: number;
  expectedQuantity: number;
  measuredQuantity: number;
  missingToClose: number;
  isClosed: boolean;
}

const currencyFormatter = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
const numberFormatter = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 3 });

const DAILY_RATE_PER_PERSON = 240;
const ITALIAN_HOLIDAYS = ['01-01', '06-01', '25-04', '01-05', '02-06', '15-08', '01-11', '08-12', '25-12', '26-12'];

// Helper per ricavare la quantità di una riga di computo
const getBoqRowQuantity = (l: any): number => {
    if (l.quantity !== undefined && l.quantity !== null && l.quantity !== 0) return Number(l.quantity);
    if (l.quantita !== undefined && l.quantita !== null && l.quantita !== 0) return Number(l.quantita);
    if (l.total !== undefined && l.total !== null && l.total !== 0) return Number(l.total);
    if (l.totale !== undefined && l.totale !== null && l.totale !== 0) return Number(l.totale);
    const f = parseFloat(l.multiplier || l.factor || l.parti || 1) || 1;
    const len = parseFloat(l.length || l.lunghezza || 1) || 1;
    const w = parseFloat(l.width || l.larghezza || 1) || 1;
    const h = parseFloat(l.height || l.altezza || l.profondita || l.peso || 1) || 1;
    return f * len * w * h;
};

// Helper per estrarre tutte le singole misure di computo per ciascuna voce
export const getSingleBoqMeasuresForItem = (item: ExtendedWorkItem): SingleBoqMeasure[] => {
  const varTotal = (item.variations || []).reduce((acc, v) => v.type === 'increase' ? acc + v.quantity : acc - v.quantity, 0);
  
  if (item.originalMeasurements && item.originalMeasurements.length > 0) {
    return item.originalMeasurements.map((b: any, bIdx: number) => {
      const boqId = b.id || `boq_${item.articleCode}_${bIdx}`;
      const boqDesc = b.description || b.note || b.designazioneLavori || `Misura #${bIdx + 1}`;
      const expectedQty = Math.round(getBoqRowQuantity(b) * 1000) / 1000;
      
      const measuredQty = Math.round(((item.measurements || []).reduce((acc, m) => {
        if (m.sourceBoqId === boqId || (!m.sourceBoqId && m.note && m.note.trim() === boqDesc.trim())) return acc + m.quantity;
        return acc;
      }, 0)) * 1000) / 1000;

      const missingToClose = Math.max(0, Math.round((expectedQty - measuredQty) * 1000) / 1000);
      const isClosed = measuredQty >= (expectedQty - 0.001);

      return {
        id: boqId,
        articleCode: item.articleCode,
        index: bIdx + 1,
        description: boqDesc,
        factor: b.multiplier || b.factor || b.parti,
        length: b.length || b.lunghezza,
        width: b.width || b.larghezza,
        height: b.height || b.altezza || b.profondita || b.peso,
        expectedQuantity: expectedQty,
        measuredQuantity: measuredQty,
        missingToClose,
        isClosed
      };
    });
  } else {
    const expectedQty = Math.round((item.quantity + varTotal) * 1000) / 1000;
    const measuredQty = Math.round(((item.measurements || []).reduce((acc, m) => acc + m.quantity, 0)) * 1000) / 1000;
    const missingToClose = Math.max(0, Math.round((expectedQty - measuredQty) * 1000) / 1000);
    const isClosed = measuredQty >= (expectedQty - 0.001);

    return [{
      id: `${item.articleCode}_main`,
      articleCode: item.articleCode,
      index: 1,
      description: item.description || 'Misura integrale di computo',
      expectedQuantity: expectedQty,
      measuredQuantity: measuredQty,
      missingToClose,
      isClosed
    }];
  }
};

const TaskModal: React.FC<TaskModalProps> = ({ 
  isOpen, onClose, group, allWorkGroups, allDocuments, dependencies, 
  setWorkGroups, onDependenciesChange, isViewOnly, isLocked, teams, workers, initialTab = 'measurements' 
}) => {
  const [activeTab, setActiveTab] = useState<'measurements' | 'planning' | 'dependencies'>('measurements');
  const [activeGroup, setActiveGroup] = useState<ExtendedWorkGroup | null>(null);
  
  const [newMeasurements, setNewMeasurements] = useState<Record<string, MeasurementInputState>>({});
  const [deductionModes, setDeductionModes] = useState<Record<string, boolean>>({}); 
  const [isCustomNoteMode, setIsCustomNoteMode] = useState<Record<string, boolean>>({});
  
  const [isDirty, setIsDirty] = useState(false);
  const [expandedVariations, setExpandedVariations] = useState<Set<string>>(new Set());

  // Stato per modifica inline delle misurazioni prima del salvataggio
  const [editingMeasurementId, setEditingMeasurementId] = useState<string | null>(null);
  const [editMeasureDraft, setEditMeasureDraft] = useState<{
    articleCode: string;
    date: string;
    note: string;
    factor: string;
    length: string;
    width: string;
    height: string;
    quantity: string;
    sourceBoqId?: string;
  } | null>(null);

  // Stato per modali di conferma (Salvataggio e Chiusura con modifiche non salvate)
  const [showSaveConfirmModal, setShowSaveConfirmModal] = useState(false);
  const [showCloseConfirmModal, setShowCloseConfirmModal] = useState(false);
  const [validationNotice, setValidationNotice] = useState<string | null>(null);

  const [newVariation, setNewVariation] = useState<{ number: string, quantity: string, type: 'increase' | 'decrease' }>({
      number: '', quantity: '', type: 'increase'
  });

  const [newDependency, setNewDependency] = useState<{ targetId: string; type: DependencyType; lag: string, direction: 'predecessor' | 'successor' }>({
    targetId: '', type: 'FS', lag: '0', direction: 'predecessor'
  });

  const isHolidayLocal = (date: Date): boolean => {
      const dayMonth = format(date, 'dd-MM');
      return ITALIAN_HOLIDAYS.includes(dayMonth) || [0, 6].includes(date.getDay());
  };

  const calculateEndDateLocal = (startDate: Date, workingDays: number): Date => {
      let currentDate = new Date(startDate);
      let daysCounted = 0;
      if (workingDays <= 0) return startDate;
      while (daysCounted < workingDays) {
        if (!isHolidayLocal(currentDate)) daysCounted++;
        if (daysCounted < workingDays) currentDate = addDays(currentDate, 1);
      }
      return currentDate;
  };

  // Lista delle voci di computo del progetto non ancora in questo gruppo
  const availableComputoItems = useMemo(() => {
    const map = new Map<string, {
      articleCode: string;
      description: string;
      unit: string;
      unitPrice: number;
      quantity: number;
      total: number;
      originalIndex?: number;
      originalMeasurements?: any[];
      groupName: string;
      docName: string;
    }>();

    allDocuments.forEach(doc => {
      doc.workGroups.forEach(wg => {
        wg.items.forEach(item => {
          if (!activeGroup?.items.some(i => i.articleCode === item.articleCode)) {
            if (!map.has(item.articleCode)) {
              map.set(item.articleCode, {
                articleCode: item.articleCode,
                description: item.description,
                unit: item.unit,
                unitPrice: item.unitPrice,
                quantity: item.quantity,
                total: item.total,
                originalIndex: item.originalIndex,
                originalMeasurements: item.originalMeasurements,
                groupName: wg.name,
                docName: doc.fileName
              });
            }
          }
        });
      });
    });

    return Array.from(map.values()).sort((a, b) => (a.originalIndex || 9999) - (b.originalIndex || 9999));
  }, [allDocuments, activeGroup]);

  useEffect(() => {
    if (isOpen && group) {
        setActiveTab(initialTab || 'measurements');
        setExpandedVariations(new Set()); 
        setIsCustomNoteMode({});
        setEditingMeasurementId(null);
        setEditMeasureDraft(null);
        setShowSaveConfirmModal(false);
        setShowCloseConfirmModal(false);
        setValidationNotice(null);

        let migratedGroup = { ...group } as ExtendedWorkGroup;
        if (!migratedGroup.accountingType) migratedGroup.accountingType = 'measure';

        const itemsWithFlags = migratedGroup.items.map(item => {
            const rawMeasurements = (item.measurements || []).map(m => ({
              ...m,
              _isCommitted: true,
              id: m.id || crypto.randomUUID()
            }));
            // Assicura la coerenza del flag isReversed se esiste già una riga di storno collegata
            const syncedMeasurements = rawMeasurements.map(m => {
              const reversingRow = rawMeasurements.find(other => other.reversesMeasurementId === m.id);
              if (reversingRow) {
                return { ...m, isReversed: true, reversedById: reversingRow.id };
              }
              return m;
            });
            return {
              ...item,
              measurements: syncedMeasurements,
              annotations: item.annotations || [],
              variations: item.variations || [],
              originalMeasurements: item.originalMeasurements || []
            };
        });

        migratedGroup.items = itemsWithFlags;
        setActiveGroup(migratedGroup);
        setIsDirty(false);

        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const initialMeasurements: Record<string, MeasurementInputState> = {};
        const initialDeductions: Record<string, boolean> = {};
        
        migratedGroup.items.forEach(item => {
            // Data congruente: tra ultima misura attiva (non stornata) e oggi
            const activeItemMeasures = (item.measurements || []).filter(m => !m.isReversed && !m.reversesMeasurementId && m.quantity > 0);
            const latestItemDate = activeItemMeasures.length > 0 
              ? activeItemMeasures.reduce((max, m) => m.date > max ? m.date : max, activeItemMeasures[0].date)
              : null;
            const wbsStart = group.officialStartDate || group.startDate;
            const defaultDate = latestItemDate && latestItemDate <= todayStr ? latestItemDate : (wbsStart <= todayStr ? wbsStart : todayStr);

            // I campi sono liberi: la quantità è vuota e il residuo viene suggerito in grigio nel placeholder
            initialMeasurements[item.articleCode] = { 
              date: defaultDate,
              quantity: '', 
              note: '', 
              factor: '', 
              length: '', 
              width: '', 
              height: '',
              sourceBoqId: undefined
            };
            initialDeductions[item.articleCode] = false;
        });
        
        setNewMeasurements(initialMeasurements);
        setDeductionModes(initialDeductions);
    }
  }, [isOpen, group, initialTab]);
  
  const handleAttemptClose = useCallback(() => {
    if (isDirty && !(isViewOnly || isLocked)) { 
      setShowCloseConfirmModal(true);
    } else {
      onClose();
    }
  }, [isDirty, isViewOnly, isLocked, onClose]);

  const toggleDeductionMode = (articleCode: string) => { 
    setDeductionModes(prev => ({ ...prev, [articleCode]: !prev[articleCode] })); 
  };

  const handleMeasurementChange = (articleCode: string, field: keyof MeasurementInputState, value: string) => {
    if (isViewOnly || isLocked) return;
    setIsDirty(true);
    setNewMeasurements(prev => ({ ...prev, [articleCode]: { ...prev[articleCode], [field]: value } }));
  };

  const handleItemDateChange = (articleCode: string, dateVal: string) => {
    if (isViewOnly || isLocked) return;
    setIsDirty(true);
    setNewMeasurements(prev => ({
      ...prev,
      [articleCode]: {
        ...(prev[articleCode] || { note: '', factor: '', length: '', width: '', height: '', quantity: '' }),
        date: dateVal
      }
    }));
  };

  const calculateAnalyticQuantity = (input: { factor?: string; length?: string; width?: string; height?: string } | undefined): number | null => {
      if (!input) return null;
      const f = parseFloat(input.factor?.replace(',', '.') || '') || null;
      const l = parseFloat(input.length?.replace(',', '.') || '') || null;
      const w = parseFloat(input.width?.replace(',', '.') || '') || null;
      const h = parseFloat(input.height?.replace(',', '.') || '') || null;
      if (f !== null || l !== null || w !== null || h !== null) {
          return Math.round(((f || 1) * (l || 1) * (w || 1) * (h || 1)) * 1000) / 1000;
      }
      return null;
  };

  const toggleVariations = (articleCode: string) => { 
    setExpandedVariations(prev => { 
      const next = new Set(prev); 
      if (next.has(articleCode)) next.delete(articleCode); else next.add(articleCode); 
      return next; 
    }); 
  };

  // Calcolo dell'inizio lavori del progetto o gruppo per la massima libertà ma rispetto del calendario
  const projectInizioLavori = useMemo(() => {
    let earliest = activeGroup?.officialStartDate || activeGroup?.startDate || format(new Date(), 'yyyy-MM-dd');
    if (allWorkGroups && allWorkGroups.length > 0) {
      allWorkGroups.forEach(g => {
        const gStart = g.officialStartDate || g.startDate;
        if (gStart && gStart < earliest) earliest = gStart;
      });
    }
    const today = format(new Date(), 'yyyy-MM-dd');
    return earliest <= today ? earliest : today;
  }, [allWorkGroups, activeGroup]);

  // QUANDO L'UTENTE SCEGLIE LA MISURA DAL MENU A TENDINA DELLA CASELLA
  const handleSelectComputoMeasure = (articleCode: string, boqMeasureId: string) => {
    const item = activeGroup?.items.find(i => i.articleCode === articleCode);
    if (!item) return;

    const singleMeasures = getSingleBoqMeasuresForItem(item);
    const sm = singleMeasures.find(m => m.id === boqMeasureId);
    if (!sm) return;

    const existingInputDate = newMeasurements[articleCode]?.date;
    const activeItemMeasures = (item.measurements || []).filter(m => !m.isReversed && !m.reversesMeasurementId && m.quantity > 0);
    const latestItemMeasureDate = activeItemMeasures.length > 0
      ? activeItemMeasures.reduce((max, m) => m.date > max ? m.date : max, activeItemMeasures[0].date)
      : null;

    const wbsStart = activeGroup.officialStartDate || activeGroup.startDate || projectInizioLavori;
    const inizioLavoriVoice = projectInizioLavori < wbsStart ? projectInizioLavori : wbsStart;
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    
    const targetDate = existingInputDate 
      ? existingInputDate 
      : (latestItemMeasureDate && latestItemMeasureDate <= todayStr 
          ? latestItemMeasureDate 
          : (inizioLavoriVoice <= todayStr ? inizioLavoriVoice : todayStr));

    setNewMeasurements(prev => ({
      ...prev,
      [articleCode]: {
        ...(prev[articleCode] || {}),
        date: targetDate,
        note: sm.description,
        factor: '',
        length: '',
        width: '',
        height: '',
        quantity: '',
        sourceBoqId: sm.id
      }
    }));

    setIsDirty(true);
  };

  // Chiudi immediatamente con il residuo disponibile
  const handleCloseWithResidual = (articleCode: string, residual: number) => {
    if (isViewOnly || isLocked || residual <= 0) return;
    setNewMeasurements(prev => ({
      ...prev,
      [articleCode]: {
        ...(prev[articleCode] || { note: '', factor: '', length: '', width: '', height: '' }),
        quantity: residual.toString()
      }
    }));
    setIsDirty(true);
  };

  // Aggiungi una voce dal Computo a questo gruppo
  const handleAddVoiceFromComputo = (computoItem: typeof availableComputoItems[0]) => {
    if (isViewOnly || isLocked || !activeGroup) return;

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const wbsStart = activeGroup.officialStartDate || activeGroup.startDate;
    const defaultDate = wbsStart <= todayStr ? wbsStart : todayStr;

    const newItem: ExtendedWorkItem = {
      articleCode: computoItem.articleCode,
      description: computoItem.description,
      quantity: computoItem.quantity,
      unit: computoItem.unit,
      unitPrice: computoItem.unitPrice,
      total: computoItem.quantity * computoItem.unitPrice,
      originalIndex: computoItem.originalIndex,
      originalMeasurements: computoItem.originalMeasurements || [],
      measurements: [],
      variations: [],
      annotations: []
    };

    const updatedItems = [...activeGroup.items, newItem];
    const newGroupTotal = updatedItems.reduce((acc, i) => acc + (i.quantity * i.unitPrice), 0);

    setActiveGroup({
      ...activeGroup,
      value: newGroupTotal,
      items: updatedItems
    });

    setNewMeasurements(prev => ({
      ...prev,
      [computoItem.articleCode]: {
        date: defaultDate,
        quantity: '',
        note: '',
        factor: '',
        length: '',
        width: '',
        height: '',
        sourceBoqId: undefined
      }
    }));

    setIsDirty(true);
  };

  const handleAddVariation = (articleCode: string) => {
      if (!newVariation.number || !newVariation.quantity) return;
      const qty = parseFloat(newVariation.quantity.replace(',', '.'));
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const variation: Variation = { id: crypto.randomUUID(), date: todayStr, number: newVariation.number, quantity: qty, type: newVariation.type };
      
      setActiveGroup(prev => {
          if (!prev) return null;
          const updatedItems = prev.items.map(i => i.articleCode === articleCode ? { ...i, variations: [...(i.variations || []), variation] } : i);
          return { ...prev, items: updatedItems };
      });
      setNewVariation({ number: '', quantity: '', type: 'increase' });
      setIsDirty(true);
      toggleVariations(articleCode); 
  };

  // Aggiungi misurazione a Libretto con rispetto del calendario e blocco sul residuo
  const handleAddMeasurement = (itemArticleCode: string) => {
    if (!activeGroup || isViewOnly || isLocked) return;
    const measurementInput = newMeasurements[itemArticleCode];
    const item = activeGroup.items.find(i => i.articleCode === itemArticleCode);
    if (!item) return;

    const varTotal = (item.variations || []).reduce((acc, v) => v.type === 'increase' ? acc + v.quantity : acc - v.quantity, 0);
    const measuredTotal = (item.measurements || []).reduce((acc, m) => acc + m.quantity, 0);
    const itemResidual = Math.max(0, Math.round(((item.quantity + varTotal) - measuredTotal) * 1000) / 1000);

    // Verifica rigorosa: la misura deve sempre agganciarsi al computo del progettista
    const singleMeasures = getSingleBoqMeasuresForItem(item);
    const openBoqMeasures = singleMeasures.filter(sm => sm.missingToClose > 0.0001);

    if (openBoqMeasures.length > 0 && !measurementInput?.sourceBoqId) {
      setValidationNotice('⛔ MISURA OBBLIGATORIA DAL COMPUTO: Seleziona prima una misura dal menu a tendina della voce per registrarla a libretto.');
      return;
    }

    const linkedBoq = measurementInput?.sourceBoqId 
      ? singleMeasures.find(sm => sm.id === measurementInput.sourceBoqId)
      : (openBoqMeasures.length > 0 ? openBoqMeasures[0] : null);

    const maxAllowed = linkedBoq ? Math.min(linkedBoq.missingToClose, itemResidual) : itemResidual;

    const analyticQty = calculateAnalyticQuantity(measurementInput);
    let quantity: number;

    if (analyticQty !== null) {
        quantity = analyticQty;
    } else {
        let quantityStr = (measurementInput?.quantity || '').replace(',', '.');
        quantity = quantityStr.trim() === '' ? maxAllowed : (parseFloat(quantityStr) || 0);
    }
    
    // PATTO DI FERRO: "se la supero mi blocca e la chiude con il residuo"
    if (quantity > (maxAllowed + 0.001) && quantity > 0) { 
      setValidationNotice(`⚠️ Quantità (${numberFormatter.format(quantity)} ${item.unit}) superiore al residuo disponibile: è stata allineata automaticamente al residuo massimo (${numberFormatter.format(maxAllowed)} ${item.unit}).`);
      quantity = maxAllowed;
    }
    
    if (deductionModes[itemArticleCode]) quantity = -Math.abs(quantity);
    if (quantity === 0) return; 

    // Calcolo data congruente (considerando solo le misure attive non stornate)
    const activeMeasuresForCurrent = (linkedBoq
      ? (item.measurements || []).filter(m => m.sourceBoqId === linkedBoq.id)
      : (item.measurements || [])
    ).filter(m => !m.isReversed && !m.reversesMeasurementId && m.quantity > 0);

    const latestRelevantDate = activeMeasuresForCurrent.length > 0 
      ? activeMeasuresForCurrent.reduce((max, m) => m.date > max ? m.date : max, activeMeasuresForCurrent[0].date)
      : null;

    const wbsStart = activeGroup.officialStartDate || activeGroup.startDate || projectInizioLavori;
    const inizioLavoriVoice = projectInizioLavori < wbsStart ? projectInizioLavori : wbsStart;
    const todayStr = format(new Date(), 'yyyy-MM-dd');

    let minAllowedDate = latestRelevantDate || inizioLavoriVoice;
    if (minAllowedDate > todayStr) minAllowedDate = todayStr;

    let measureDate = measurementInput?.date || (latestRelevantDate && latestRelevantDate <= todayStr ? latestRelevantDate : (inizioLavoriVoice <= todayStr ? inizioLavoriVoice : todayStr));
    
    if (measureDate < minAllowedDate) {
      setValidationNotice(`⛔ DATA NON CONGRUENTE: La data (${format(parseISO(measureDate), 'dd/MM/yyyy')}) non può essere anteriore a ${format(parseISO(minAllowedDate), 'dd/MM/yyyy')}.`);
      return;
    }
    if (measureDate > todayStr) {
      setValidationNotice(`⛔ DATA NON CONGRUENTE: La data (${format(parseISO(measureDate), 'dd/MM/yyyy')}) non può essere successiva a oggi (${format(parseISO(todayStr), 'dd/MM/yyyy')}).`);
      return;
    }

    const newMeasurement: ExtendedMeasurement = { 
        id: crypto.randomUUID(), 
        date: measureDate, 
        quantity: quantity, 
        note: measurementInput?.note || linkedBoq?.description || 'Misura', 
        teamId: undefined, 
        workerIds: undefined, 
        _isCommitted: false, 
        factor: measurementInput?.factor ? parseFloat(measurementInput.factor.replace(',', '.')) : undefined, 
        length: measurementInput?.length ? parseFloat(measurementInput.length.replace(',', '.')) : undefined, 
        width: measurementInput?.width ? parseFloat(measurementInput.width.replace(',', '.')) : undefined, 
        height: measurementInput?.height ? parseFloat(measurementInput.height.replace(',', '.')) : undefined,
        sourceBoqId: linkedBoq?.id
    };

    setActiveGroup(prev => { 
        if (!prev) return null; 
        return { ...prev, items: prev.items.map(i => i.articleCode === itemArticleCode ? { ...i, measurements: [...(i.measurements || []), newMeasurement] } : i) }; 
    });

    // Per la misura successiva, la data riparte da quella appena caricata (fino a oggi)
    setNewMeasurements(prev => ({ 
      ...prev, 
      [itemArticleCode]: { 
        date: measureDate, 
        quantity: '', 
        note: '', 
        factor: '', 
        length: '', 
        width: '', 
        height: '', 
        sourceBoqId: undefined 
      } 
    }));
    setIsDirty(true);
  };

  // STORNO CONTABILE: genera la riga negativa di storno, nasconde l'icona storno dalla voce originale
  // e precompila il rigo di inserimento per permettere di ricaricare la voce modificata/completa prima del salvataggio
  const handleReverseMeasurement = (e: React.MouseEvent, itemArticleCode: string, mIndex: number) => {
    e.preventDefault(); e.stopPropagation();
    if (isViewOnly || isLocked || !activeGroup) return;
    const item = activeGroup.items.find(i => i.articleCode === itemArticleCode);
    const m = item?.measurements?.[mIndex];
    if (!m || m.quantity < 0) return;

    // Impedisce storni multipli sulla stessa misurazione
    const alreadyReversed = Boolean(
      m.isReversed ||
      m.reversedById ||
      (item?.measurements || []).some(other => other.reversesMeasurementId === m.id)
    );
    if (alreadyReversed) return;

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const revId = crypto.randomUUID();
    const rev: ExtendedMeasurement = {
      id: revId,
      date: todayStr,
      quantity: -m.quantity,
      note: `STORNO: ${m.note || ''}`,
      factor: m.factor,
      length: m.length,
      width: m.width,
      height: m.height,
      sourceBoqId: m.sourceBoqId,
      reversesMeasurementId: m.id,
      _isCommitted: false
    };

    setActiveGroup(prev => {
      if (!prev) return null;
      return {
        ...prev,
        items: prev.items.map(i => {
          if (i.articleCode !== itemArticleCode) return i;
          const updatedMeasurements = (i.measurements || []).map((existing, idx) =>
            idx === mIndex ? { ...existing, isReversed: true, reversedById: revId } : existing
          );
          return { ...i, measurements: [...updatedMeasurements, rev] };
        })
      };
    });

    // Precompila il rigo inferiore con i dati della misura stornata per agevolare il ricaricamento modificato
    setNewMeasurements(prev => ({
      ...prev,
      [itemArticleCode]: {
        date: m.date && m.date <= todayStr ? m.date : todayStr,
        note: m.note || '',
        factor: m.factor !== undefined ? String(m.factor) : '',
        length: m.length !== undefined ? String(m.length) : '',
        width: m.width !== undefined ? String(m.width) : '',
        height: m.height !== undefined ? String(m.height) : '',
        quantity: String(Math.abs(m.quantity)),
        sourceBoqId: m.sourceBoqId
      }
    }));

    setIsDirty(true);
  };

  // ANNULLA STORNO: rimuove la voce di storno generata e ripristina l'icona Storno sulla voce originale
  const handleUndoReverseMeasurement = (e: React.MouseEvent, itemArticleCode: string, stornoMeasurement: ExtendedMeasurement, stornoIndex: number) => {
    e.preventDefault(); e.stopPropagation();
    if (isViewOnly || isLocked || !activeGroup) return;

    setActiveGroup(prev => {
      if (!prev) return null;
      return {
        ...prev,
        items: prev.items.map(i => {
          if (i.articleCode !== itemArticleCode) return i;
          const remaining = (i.measurements || []).filter((_, idx) => idx !== stornoIndex);
          let restoredLegacy = false;
          const updated = remaining.map(m => {
            if (
              (stornoMeasurement.reversesMeasurementId && m.id === stornoMeasurement.reversesMeasurementId) ||
              (m.reversedById && m.reversedById === stornoMeasurement.id)
            ) {
              return { ...m, isReversed: false, reversedById: undefined };
            }
            // Fallback per eventuali storni creati prima del tracciamento ID
            if (
              !stornoMeasurement.reversesMeasurementId &&
              !restoredLegacy &&
              m.quantity === Math.abs(stornoMeasurement.quantity) &&
              m.sourceBoqId === stornoMeasurement.sourceBoqId &&
              m.isReversed
            ) {
              restoredLegacy = true;
              return { ...m, isReversed: false, reversedById: undefined };
            }
            return m;
          });
          return { ...i, measurements: updated };
        })
      };
    });

    if (editingMeasurementId === stornoMeasurement.id) {
      setEditingMeasurementId(null);
      setEditMeasureDraft(null);
    }
    setIsDirty(true);
  };

  // AVVIA MODIFICA INLINE DI UNA MISURAZIONE PRIMA DEL SALVATAGGIO
  const handleStartEditMeasurement = (articleCode: string, m: ExtendedMeasurement) => {
    if (isViewOnly || isLocked) return;
    setEditingMeasurementId(m.id);
    setEditMeasureDraft({
      articleCode,
      date: m.date,
      note: m.note || '',
      factor: m.factor !== undefined ? String(m.factor) : '',
      length: m.length !== undefined ? String(m.length) : '',
      width: m.width !== undefined ? String(m.width) : '',
      height: m.height !== undefined ? String(m.height) : '',
      quantity: String(Math.abs(m.quantity)),
      sourceBoqId: m.sourceBoqId
    });
  };

  // SALVA MODIFICA INLINE DELLA RIGA DI MISURAZIONE
  const handleCommitEditMeasurement = (item: ExtendedWorkItem, m: ExtendedMeasurement) => {
    if (!editMeasureDraft || !activeGroup) return;

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const isStornoRow = Boolean(m.reversesMeasurementId || (m.quantity < 0 && m.note?.toUpperCase().startsWith('STORNO')));

    if (isStornoRow) {
      // Per una riga di storno consente di aggiornare data e nota prima del salvataggio
      const validDate = editMeasureDraft.date <= todayStr ? editMeasureDraft.date : todayStr;
      setActiveGroup(prev => {
        if (!prev) return null;
        return {
          ...prev,
          items: prev.items.map(i =>
            i.articleCode === item.articleCode
              ? {
                  ...i,
                  measurements: (i.measurements || []).map(row =>
                    row.id === m.id
                      ? { ...row, date: validDate, note: editMeasureDraft.note.startsWith('STORNO') ? editMeasureDraft.note : `STORNO: ${editMeasureDraft.note}` }
                      : row
                  )
                }
              : i
          )
        };
      });
      setEditingMeasurementId(null);
      setEditMeasureDraft(null);
      setIsDirty(true);
      return;
    }

    // Calcolo residuo escludendo la quantità corrente della riga in modifica
    const varTotal = (item.variations || []).reduce((acc, v) => v.type === 'increase' ? acc + v.quantity : acc - v.quantity, 0);
    const otherMeasuredTotal = (item.measurements || [])
      .filter(row => row.id !== m.id)
      .reduce((acc, row) => acc + row.quantity, 0);
    const itemResidualForEdit = Math.max(0, Math.round(((item.quantity + varTotal) - otherMeasuredTotal) * 1000) / 1000);

    const singleMeasures = getSingleBoqMeasuresForItem({
      ...item,
      measurements: (item.measurements || []).filter(row => row.id !== m.id)
    });
    const linkedBoq = editMeasureDraft.sourceBoqId
      ? singleMeasures.find(sm => sm.id === editMeasureDraft.sourceBoqId)
      : null;
    const maxAllowed = linkedBoq ? Math.min(linkedBoq.missingToClose, itemResidualForEdit) : itemResidualForEdit;

    const analyticQty = calculateAnalyticQuantity(editMeasureDraft);
    let newQty = analyticQty !== null
      ? analyticQty
      : (parseFloat(editMeasureDraft.quantity.replace(',', '.')) || 0);

    if (newQty > (maxAllowed + 0.001) && newQty > 0) {
      setValidationNotice(`⚠️ Quantità modificata (${numberFormatter.format(newQty)} ${item.unit}) superiore al residuo massimo disponibile (${numberFormatter.format(maxAllowed)} ${item.unit}): impostata al residuo.`);
      newQty = maxAllowed;
    }

    if (newQty <= 0) {
      setValidationNotice('⛔ Inserisci una quantità valida maggiore di zero oppure elimina la riga.');
      return;
    }

    const validDate = editMeasureDraft.date <= todayStr ? editMeasureDraft.date : todayStr;

    setActiveGroup(prev => {
      if (!prev) return null;
      return {
        ...prev,
        items: prev.items.map(i =>
          i.articleCode === item.articleCode
            ? {
                ...i,
                measurements: (i.measurements || []).map(row =>
                  row.id === m.id
                    ? {
                        ...row,
                        date: validDate,
                        note: editMeasureDraft.note || linkedBoq?.description || row.note,
                        factor: editMeasureDraft.factor ? parseFloat(editMeasureDraft.factor.replace(',', '.')) : undefined,
                        length: editMeasureDraft.length ? parseFloat(editMeasureDraft.length.replace(',', '.')) : undefined,
                        width: editMeasureDraft.width ? parseFloat(editMeasureDraft.width.replace(',', '.')) : undefined,
                        height: editMeasureDraft.height ? parseFloat(editMeasureDraft.height.replace(',', '.')) : undefined,
                        quantity: m.quantity < 0 ? -Math.abs(newQty) : newQty,
                        sourceBoqId: editMeasureDraft.sourceBoqId || row.sourceBoqId
                      }
                    : row
                )
              }
            : i
        )
      };
    });

    setEditingMeasurementId(null);
    setEditMeasureDraft(null);
    setIsDirty(true);
  };

  // Richiede sempre conferma prima di salvare
  const handleRequestSaveChanges = () => {
    if (!activeGroup || isViewOnly || isLocked) return;
    // Se c'è una modifica inline aperta, la chiude/applica prima di mostrare la conferma
    if (editingMeasurementId && editMeasureDraft) {
      const targetItem = activeGroup.items.find(i => i.articleCode === editMeasureDraft.articleCode);
      const targetMeasure = targetItem?.measurements?.find(m => m.id === editingMeasurementId);
      if (targetItem && targetMeasure) {
        handleCommitEditMeasurement(targetItem, targetMeasure);
      }
    }
    setShowSaveConfirmModal(true);
  };

  const executeSaveChanges = () => { 
      if (!activeGroup || isViewOnly || isLocked) return; 
      
      const totalMeasuredVal = activeGroup.items.reduce((total, i) => 
          total + ((i.measurements || []).reduce((acc, m) => acc + m.quantity, 0) * i.unitPrice), 0);
      
      const groupTotalVal = activeGroup.items.reduce((acc, i) => {
          const varTotal = (i.variations || []).reduce((vAcc, v) => v.type === 'increase' ? vAcc + v.quantity : vAcc - v.quantity, 0);
          return acc + ((i.quantity + varTotal) * i.unitPrice);
      }, 0);

      const teamSize = activeGroup.teamSize || 2;
      const residualValue = Math.max(0, groupTotalVal - totalMeasuredVal);
      const remainingWorkingDays = Math.ceil(residualValue / (DAILY_RATE_PER_PERSON * teamSize));
      
      let baselineStr = activeGroup.startDate;
      const allMeasures = activeGroup.items.flatMap(i => i.measurements || []);
      if (allMeasures.length > 0) {
          baselineStr = allMeasures.reduce((max, m) => m.date > max ? m.date : max, allMeasures[0].date);
      }
      
      const baselineDate = parseISO(baselineStr);
      const calculatedEndDate = calculateEndDateLocal(baselineDate, remainingWorkingDays);
      const calculatedProgress = groupTotalVal > 0 ? Math.min(100, (totalMeasuredVal / groupTotalVal) * 100) : 0;

      const cleanGroup: WorkGroup = { 
          ...activeGroup, 
          value: groupTotalVal,
          progress: calculatedProgress, 
          endDate: format(calculatedEndDate, 'yyyy-MM-dd'),
          items: activeGroup.items.map(item => ({ 
              ...item, 
              measurements: item.measurements?.map(m => { const { _isCommitted, ...rest } = m; return rest; }) 
          })) 
      }; 
      setShowSaveConfirmModal(false);
      setWorkGroups(prev => prev.map(g => g.id === activeGroup.id ? cleanGroup : g)); 
      onClose(); 
  };

  const handleConfigChange = (field: keyof WorkGroup, value: any) => {
      if (isLocked || isViewOnly) return;
      setActiveGroup(prev => {
          if (!prev) return null;
          const updated = { ...prev, [field]: value };
          return updated;
      });
      setIsDirty(true);
  };

  if (!isOpen || !activeGroup) return null;

  const totalMeasuredValue = activeGroup.items.reduce((total, i) => total + ((i.measurements || []).reduce((acc, m) => acc + m.quantity, 0) * i.unitPrice), 0);
  const groupTotalValue = activeGroup.items.reduce((acc, i) => {
      const varTotal = (i.variations || []).reduce((vAcc, v) => v.type === 'increase' ? vAcc + v.quantity : vAcc - v.quantity, 0);
      return acc + ((i.quantity + varTotal) * i.unitPrice);
  }, 0);
  const currentProgress = groupTotalValue > 0 ? (totalMeasuredValue / groupTotalValue) * 100 : 0;
  const groupResidualValue = Math.max(0, groupTotalValue - totalMeasuredValue);

  // Statistiche modifiche della sessione corrente per il messaggio di conferma salvataggio
  const uncommittedMeasurementsCount = activeGroup.items.reduce(
    (acc, i) => acc + (i.measurements || []).filter(m => !m._isCommitted && !m.reversesMeasurementId && m.quantity > 0).length,
    0
  );
  const uncommittedStorniCount = activeGroup.items.reduce(
    (acc, i) => acc + (i.measurements || []).filter(m => !m._isCommitted && (m.reversesMeasurementId || m.quantity < 0)).length,
    0
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={handleAttemptClose}>
      <div className="relative w-full max-w-6xl h-[95vh] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700 animate-fade-in" onClick={e => e.stopPropagation()}>
        
        {/* Header superiore WBS e stato contabile */}
        <div className="flex-shrink-0 bg-white dark:bg-gray-800 z-10">
            <div className={`w-full py-2 px-5 flex items-center justify-between border-b shadow-sm ${activeGroup.isSecurityCost ? 'bg-orange-50 dark:bg-orange-950/40 text-orange-900 dark:text-orange-200 border-orange-200 dark:border-orange-800' : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 border-indigo-200 dark:border-indigo-800'}`}>
                <div className="flex items-center gap-3">
                    <span className="text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-md bg-white/80 dark:bg-gray-800/80 shadow-sm border border-black/5">
                      {activeGroup.accountingType === 'body' ? 'LAVORI A CORPO' : 'LAVORI A MISURA'}
                    </span>
                    {activeGroup.isSecurityCost ? (
                      <span className="text-xs font-black px-2.5 py-1 bg-orange-600 text-white rounded-md uppercase tracking-wider shadow-sm">
                        🛡️ ONERI SICUREZZA (No Ribasso)
                      </span>
                    ) : (
                      <span className="text-xs font-semibold px-2 py-0.5 text-gray-600 dark:text-gray-300">
                        Lavori Ordinari (Con Ribasso)
                      </span>
                    )}
                </div>
                <div className="flex items-center gap-3 text-xs font-mono font-bold">
                    <span className="text-gray-500">Inizio Cronoprogramma:</span>
                    <span className="bg-white/80 dark:bg-gray-800/80 px-2 py-0.5 rounded border flex items-center gap-1">
                      🔒 {format(parse(activeGroup.startDate, 'yyyy-MM-dd', new Date()), 'dd/MM/yyyy')}
                    </span>
                </div>
            </div>

            <div className="flex flex-col border-b border-gray-200 dark:border-gray-700 p-4">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                         <div className="flex items-center gap-2">
                           <h3 className="text-xl font-black text-gray-900 dark:text-white truncate">{activeGroup.name}</h3>
                           <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">WBS Gruppo</span>
                         </div>
                    </div>

                    <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700/50 p-2 rounded-xl border border-gray-200 dark:border-gray-600">
                        <div className="text-right">
                          <span className="text-[10px] text-gray-400 uppercase font-bold block">Contabilizzato</span>
                          <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">{currencyFormatter.format(totalMeasuredValue)}</span>
                        </div>
                        <div className="w-px h-7 bg-gray-300 dark:bg-gray-600"></div>
                        <div className="text-right">
                          <span className="text-[10px] text-gray-400 uppercase font-bold block">Residuo di Gruppo</span>
                          <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">{currencyFormatter.format(groupResidualValue)}</span>
                        </div>
                        <div className="w-px h-7 bg-gray-300 dark:bg-gray-600"></div>
                        <div className="text-center px-1">
                          <span className="text-[10px] text-gray-400 uppercase font-bold block">Avanzamento</span>
                          <span className="text-sm font-black text-gray-900 dark:text-white">{numberFormatter.format(currentProgress)}%</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="border-b border-gray-200 dark:border-gray-700 px-4 bg-gray-50/50 dark:bg-gray-900/20">
                <nav className="-mb-px flex space-x-6">
                    <button 
                      onClick={() => setActiveTab('measurements')} 
                      className={`py-3 px-2 border-b-2 font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-all ${activeTab === 'measurements' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                    >
                      <span>📋 Libretto delle Misure ({activeGroup.items.length} voci)</span>
                    </button>
                    <button 
                      onClick={() => setActiveTab('planning')} 
                      className={`py-3 px-2 border-b-2 font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-all ${activeTab === 'planning' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                    >
                      <span>⚙️ Impostazioni Gruppo (Data Inizio, Misura/Corpo, Sicurezza)</span>
                    </button>
                    <button 
                      onClick={() => setActiveTab('dependencies')} 
                      className={`py-3 px-2 border-b-2 font-black text-xs uppercase tracking-wider flex items-center gap-2 transition-all ${activeTab === 'dependencies' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                    >
                      <span>🔗 Dipendenze Gantt</span>
                    </button>
                </nav>
            </div>
        </div>

        {/* Corpo principale */}
        <div className="flex-grow p-4 flex flex-col overflow-hidden relative bg-gray-50/30 dark:bg-gray-900/30">
          
          {validationNotice && (
            <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-950/60 border border-amber-400 dark:border-amber-700 text-amber-900 dark:text-amber-200 rounded-xl text-xs font-bold flex items-center justify-between shadow-sm animate-fade-in">
              <span>{validationNotice}</span>
              <button
                type="button"
                onClick={() => setValidationNotice(null)}
                className="ml-3 px-2 py-0.5 bg-amber-200/70 dark:bg-amber-800 hover:bg-amber-300 rounded text-[10px] font-black uppercase"
              >
                Chiudi
              </button>
            </div>
          )}

          {/* TAB 1: LIBRETTO CONTABILITÀ - VOCI UNA DOPO L'ALTRA */}
          {activeTab === 'measurements' && (
            <div className="flex-grow flex flex-col overflow-hidden space-y-4">
                
                {/* Elenco voci del gruppo una dopo l'altra */}
                <div className="flex-grow overflow-y-auto pr-1 space-y-4">
                  {activeGroup.items.length === 0 ? (
                    <div className="p-8 text-center bg-white dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700 space-y-3">
                      <div className="text-3xl">📦</div>
                      <h4 className="text-sm font-black text-gray-800 dark:text-white uppercase">Nessuna voce in questa lavorazione</h4>
                    </div>
                  ) : (
                    activeGroup.items.map((item, index) => {
                      const varTotal = (item.variations || []).reduce((acc, v) => v.type === 'increase' ? acc + v.quantity : acc - v.quantity, 0);
                      const measuredTotal = (item.measurements || []).reduce((acc, m) => acc + m.quantity, 0);
                      const contractQty = item.quantity + varTotal;
                      const residual = Math.max(0, Math.round((contractQty - measuredTotal) * 1000) / 1000);
                      const progressPercent = contractQty > 0 ? Math.min(100, (measuredTotal / contractQty) * 100) : 0;
                      
                      // Righe del computo metrico del progettista per questa voce
                      const boqMeasures = getSingleBoqMeasuresForItem(item);
                      // REGOLA: "se una misura è zero non la devi piu far vedere nel menu a tendina"
                      const openBoqMeasures = boqMeasures.filter(bm => bm.missingToClose > 0.0001);

                      const measurementInput = newMeasurements[item.articleCode];
                      const analyticQty = calculateAnalyticQuantity(measurementInput);
                      
                      // Se è associata una specifica riga di computo
                      const linkedBoq = measurementInput?.sourceBoqId 
                        ? boqMeasures.find(bm => bm.id === measurementInput.sourceBoqId)
                        : null;
                      const maxAllowed = linkedBoq ? Math.min(linkedBoq.missingToClose, residual) : residual;

                      const inputVal = measurementInput?.quantity;
                      let previewQty = 0;
                      if (analyticQty !== null) {
                          previewQty = analyticQty;
                      } else if (inputVal !== undefined && inputVal.trim() !== '') {
                          previewQty = parseFloat(inputVal.replace(',', '.')) || 0;
                      }

                      // Verifica se supera il residuo (solo se inserito > 0)
                      const isExceeded = previewQty > (maxAllowed + 0.001);
                      const previewVal = (previewQty > 0 ? previewQty : 0) * item.unitPrice;

                      // CONGRUITA CALENDARIO PER OGNI VOCE O MISURA (considerando solo le misure attive non stornate)
                      const activeItemMeasures = (item.measurements || []).filter(m => !m.isReversed && !m.reversesMeasurementId && m.quantity > 0);
                      const latestItemMeasureDate = activeItemMeasures.length > 0 
                        ? activeItemMeasures.reduce((max, m) => m.date > max ? m.date : max, activeItemMeasures[0].date)
                        : null;

                      const wbsStart = activeGroup.officialStartDate || activeGroup.startDate || projectInizioLavori;
                      const inizioLavoriVoice = projectInizioLavori < wbsStart ? projectInizioLavori : wbsStart;
                      const todayStr = format(new Date(), 'yyyy-MM-dd');
                      
                      let itemMinDate = latestItemMeasureDate || inizioLavoriVoice;
                      if (itemMinDate > todayStr) itemMinDate = todayStr;
                      const itemMaxDate = todayStr;

                      const currentItemDate = measurementInput?.date 
                        ? (measurementInput.date < itemMinDate ? itemMinDate : (measurementInput.date > itemMaxDate ? itemMaxDate : measurementInput.date))
                        : (latestItemMeasureDate && latestItemMeasureDate <= todayStr ? latestItemMeasureDate : (inizioLavoriVoice <= todayStr ? inizioLavoriVoice : todayStr));

                      return (
                        <div key={item.articleCode} className="p-4 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 shadow-sm space-y-3">
                          
                          {/* Intestazione voce singola */}
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-gray-100 dark:border-gray-700">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <span className="text-base font-black px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 rounded-lg border border-indigo-200 dark:border-indigo-800">
                                #{item.originalIndex || (index + 1)}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs font-mono font-black text-gray-900 dark:text-white uppercase bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                                    {item.articleCode}
                                  </span>
                                  <span className="text-xs text-gray-500 font-bold">
                                    Tariffa: <strong className="text-indigo-600 dark:text-indigo-400">{currencyFormatter.format(item.unitPrice)}</strong> / {item.unit}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-700 dark:text-gray-300 mt-1 leading-snug line-clamp-2">
                                  {item.description}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-700/40 p-2.5 rounded-xl border border-gray-200 dark:border-gray-600 flex-shrink-0">
                              <div className="text-right">
                                <span className="text-[9px] text-gray-400 uppercase font-bold block">Computo</span>
                                <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                                  {numberFormatter.format(contractQty)} {item.unit}
                                </span>
                              </div>
                              <div className="w-px h-6 bg-gray-300 dark:bg-gray-600"></div>
                              <div className="text-right">
                                <span className="text-[9px] text-gray-400 uppercase font-bold block">Contabilizzato</span>
                                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                                  {numberFormatter.format(measuredTotal)} {item.unit} ({progressPercent.toFixed(0)}%)
                                </span>
                              </div>
                              <div className="w-px h-6 bg-gray-300 dark:bg-gray-600"></div>
                              <div className="text-right">
                                <span className="text-[9px] text-gray-400 uppercase font-bold block">Residuo</span>
                                <span className={`text-xs font-black ${residual > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}`}>
                                  {numberFormatter.format(residual)} {item.unit}
                                </span>
                              </div>

                              <button 
                                onClick={() => toggleVariations(item.articleCode)}
                                className={`p-1.5 rounded-lg border text-[10px] font-bold transition-colors ${expandedVariations.has(item.articleCode) ? 'bg-orange-50 border-orange-300 text-orange-700' : 'bg-white dark:bg-gray-800 text-gray-500 hover:text-gray-800'}`}
                              >
                                Perizie ({item.variations?.length || 0})
                              </button>
                            </div>
                          </div>

                          {/* Varianti e perizie (se espanse) */}
                          {expandedVariations.has(item.articleCode) && (
                              <div className="p-3 bg-orange-50/80 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-xl space-y-2">
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-[10px] font-black text-orange-800 dark:text-orange-400 uppercase tracking-wider">
                                      Perizie e Variazioni Contrattuali
                                    </h4>
                                  </div>
                                  <div className="space-y-1">
                                      {item.variations?.map(v => (
                                          <div key={v.id} className="flex justify-between items-center text-xs bg-white dark:bg-gray-800 p-2 rounded-lg shadow-sm border border-orange-100 dark:border-orange-900">
                                              <span><strong>{v.number}</strong> in data {format(parseISO(v.date), 'dd/MM/yyyy')}</span>
                                              <span className={v.type === 'increase' ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                                                {v.type === 'increase' ? '+' : '-'}{numberFormatter.format(v.quantity)} {item.unit}
                                              </span>
                                          </div>
                                      ))}
                                  </div>
                                  {!isLocked && !isViewOnly && (
                                      <div className="flex gap-2">
                                          <input type="text" placeholder="N. Perizia" value={newVariation.number} onChange={e => setNewVariation(p => ({ ...p, number: e.target.value }))} className="w-1/3 p-1.5 text-xs border rounded-lg dark:bg-gray-800" />
                                          <select value={newVariation.type} onChange={e => setNewVariation(p => ({ ...p, type: e.target.value as any }))} className="w-1/4 p-1.5 text-xs border rounded-lg dark:bg-gray-800"><option value="increase">Aumento (+)</option><option value="decrease">Diminuzione (-)</option></select>
                                          <input type="text" placeholder={`Q.tà (${item.unit})`} value={newVariation.quantity} onChange={e => setNewVariation(p => ({ ...p, quantity: e.target.value }))} className="w-1/4 p-1.5 text-xs border rounded-lg dark:bg-gray-800" />
                                          <button onClick={() => handleAddVariation(item.articleCode)} className="flex-grow bg-orange-600 text-white text-xs font-bold rounded-lg hover:bg-orange-700 px-3">+</button>
                                      </div>
                                  )}
                              </div>
                          )}

                          {/* Avviso in caso di eccedenza residuo */}
                          {isExceeded && (
                            <div className="p-2 bg-red-100 dark:bg-red-950/70 border border-red-400 text-red-800 dark:text-red-200 text-xs font-bold rounded-lg flex items-center justify-between animate-fade-in">
                              <span>⛔ Quantità superiore al residuo massimo consentito ({numberFormatter.format(maxAllowed)} {item.unit})!</span>
                              <button
                                type="button"
                                onClick={() => handleCloseWithResidual(item.articleCode, maxAllowed)}
                                className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-[10px] font-black uppercase tracking-wider"
                              >
                                Chiudi con Residuo ({numberFormatter.format(maxAllowed)})
                              </button>
                            </div>
                          )}

                          {/* TABELLA LIBRETTO MISURE CON RIGO DI INSERIMENTO INTEGRATO E PERFETTAMENTE ALLINEATO */}
                          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-gray-50/50 dark:bg-gray-900/20 shadow-sm">
                              <table className="w-full text-xs text-left table-fixed">
                              <thead className="text-gray-600 bg-gray-100 dark:bg-gray-700/80 dark:text-gray-300 sticky top-0 z-10 shadow-sm text-[11px] uppercase font-bold">
                                  <tr>
                                    <th className="px-2 py-1.5 w-[11%]">Data</th>
                                    <th className="px-2 py-1.5 w-[23%]">Rilievo a Libretto</th>
                                    <th className="px-1 py-1.5 w-[5%] text-center">U.M.</th>
                                    <th className="px-1 py-1.5 w-[6%] text-center">Parti</th>
                                    <th className="px-1 py-1.5 w-[6%] text-center">Lung.</th>
                                    <th className="px-1 py-1.5 w-[6%] text-center">Larg.</th>
                                    <th className="px-1 py-1.5 w-[6%] text-center">Alt/P</th>
                                    <th className="px-2 py-1.5 w-[11%] text-right">Quantità</th>
                                    <th className="px-2 py-1.5 w-[13%] text-right">Importo</th>
                                    <th className="px-1 py-1.5 w-[13%] text-center">Azioni</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                  {(!item.measurements || item.measurements.length === 0) ? (
                                    <tr>
                                      <td colSpan={10} className="px-3 py-3 text-center text-gray-400 italic">
                                        Nessuna misurazione ancora registrata per questa voce.
                                      </td>
                                    </tr>
                                  ) : (
                                    item.measurements.map((m, mIdx) => {
                                      const isNeg = m.quantity < 0; 
                                      const isCom = m._isCommitted ?? false;
                                      const isStornoRow = Boolean(m.reversesMeasurementId || (isNeg && m.note?.toUpperCase().startsWith('STORNO')));
                                      const isAlreadyReversed = Boolean(
                                        m.isReversed ||
                                        m.reversedById ||
                                        (item.measurements || []).some(other => other.reversesMeasurementId === m.id)
                                      );
                                      const isEditingThisRow = editingMeasurementId === m.id && editMeasureDraft !== null;
                                      const matchedBoq = boqMeasures.find(sm => sm.id === m.sourceBoqId);

                                      if (isEditingThisRow && editMeasureDraft) {
                                        const draftAnalyticQty = calculateAnalyticQuantity(editMeasureDraft);
                                        const draftQtyNum = draftAnalyticQty !== null
                                          ? draftAnalyticQty
                                          : (parseFloat(editMeasureDraft.quantity.replace(',', '.')) || 0);
                                        const signedDraftQty = isNeg ? -Math.abs(draftQtyNum) : draftQtyNum;

                                        return (
                                          <tr key={m.id || mIdx} className="bg-amber-50/70 dark:bg-amber-950/30 border-l-4 border-amber-500">
                                            <td className="p-1 align-middle">
                                              <EuropeanDateInput
                                                value={editMeasureDraft.date}
                                                min={inizioLavoriVoice}
                                                max={itemMaxDate}
                                                onChange={val => setEditMeasureDraft(prev => prev ? { ...prev, date: val } : null)}
                                                className="w-full p-1 text-[11px] font-mono font-bold bg-white dark:bg-gray-700 border border-amber-400 rounded text-gray-900 dark:text-white"
                                              />
                                            </td>
                                            <td className="p-1 align-middle">
                                              <input
                                                type="text"
                                                value={editMeasureDraft.note}
                                                onChange={e => setEditMeasureDraft(prev => prev ? { ...prev, note: e.target.value } : null)}
                                                className="w-full p-1 text-xs bg-white dark:bg-gray-700 border border-amber-400 rounded text-gray-900 dark:text-white"
                                                placeholder="Descrizione / nota..."
                                              />
                                            </td>
                                            <td className="p-1 text-center text-gray-400">{item.unit}</td>
                                            <td className="p-1 align-middle">
                                              <input
                                                type="text"
                                                disabled={isStornoRow}
                                                value={editMeasureDraft.factor}
                                                onChange={e => setEditMeasureDraft(prev => prev ? { ...prev, factor: e.target.value } : null)}
                                                className="w-full p-1 text-center text-xs bg-white dark:bg-gray-700 border border-amber-400 rounded disabled:opacity-50"
                                                placeholder="-"
                                              />
                                            </td>
                                            <td className="p-1 align-middle">
                                              <input
                                                type="text"
                                                disabled={isStornoRow}
                                                value={editMeasureDraft.length}
                                                onChange={e => setEditMeasureDraft(prev => prev ? { ...prev, length: e.target.value } : null)}
                                                className="w-full p-1 text-center text-xs bg-white dark:bg-gray-700 border border-amber-400 rounded disabled:opacity-50"
                                                placeholder="-"
                                              />
                                            </td>
                                            <td className="p-1 align-middle">
                                              <input
                                                type="text"
                                                disabled={isStornoRow}
                                                value={editMeasureDraft.width}
                                                onChange={e => setEditMeasureDraft(prev => prev ? { ...prev, width: e.target.value } : null)}
                                                className="w-full p-1 text-center text-xs bg-white dark:bg-gray-700 border border-amber-400 rounded disabled:opacity-50"
                                                placeholder="-"
                                              />
                                            </td>
                                            <td className="p-1 align-middle">
                                              <input
                                                type="text"
                                                disabled={isStornoRow}
                                                value={editMeasureDraft.height}
                                                onChange={e => setEditMeasureDraft(prev => prev ? { ...prev, height: e.target.value } : null)}
                                                className="w-full p-1 text-center text-xs bg-white dark:bg-gray-700 border border-amber-400 rounded disabled:opacity-50"
                                                placeholder="-"
                                              />
                                            </td>
                                            <td className="p-1 align-middle">
                                              <input
                                                type="text"
                                                disabled={isStornoRow || draftAnalyticQty !== null}
                                                value={draftAnalyticQty !== null ? numberFormatter.format(draftAnalyticQty) : editMeasureDraft.quantity}
                                                onChange={e => setEditMeasureDraft(prev => prev ? { ...prev, quantity: e.target.value } : null)}
                                                className="w-full p-1 text-right font-bold text-xs bg-white dark:bg-gray-700 border border-amber-400 rounded disabled:opacity-60"
                                              />
                                            </td>
                                            <td className="px-2 py-1.5 text-right font-semibold text-indigo-600 dark:text-indigo-400">
                                              {currencyFormatter.format(signedDraftQty * item.unitPrice)}
                                            </td>
                                            <td className="p-1 text-center align-middle">
                                              <div className="flex items-center justify-center gap-1">
                                                <button
                                                  type="button"
                                                  onClick={() => handleCommitEditMeasurement(item, m)}
                                                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-black"
                                                  title="Conferma modifica riga"
                                                >
                                                  ✓ Ok
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => { setEditingMeasurementId(null); setEditMeasureDraft(null); }}
                                                  className="px-1.5 py-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 text-gray-700 dark:text-gray-200 rounded text-[10px] font-bold"
                                                  title="Annulla modifica"
                                                >
                                                  ✕
                                                </button>
                                              </div>
                                            </td>
                                          </tr>
                                        );
                                      }

                                      return (
                                          <tr key={m.id || mIdx} className={`bg-white dark:bg-gray-800 ${isNeg ? 'text-red-600 dark:text-red-400 bg-red-50/20 dark:bg-red-950/10' : isAlreadyReversed ? 'text-gray-400 dark:text-gray-500 line-through decoration-gray-300' : 'text-gray-800 dark:text-gray-200'}`}>
                                            <td className="px-2 py-1.5 font-mono">{format(parseISO(m.date), 'dd/MM/yyyy')}</td>
                                            <td className="px-2 py-1.5 truncate italic" title={m.note}>
                                              {matchedBoq && (
                                                <span className="mr-1.5 px-1 py-0.2 bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded font-mono font-bold text-[9px] not-italic">
                                                  #{matchedBoq.index}
                                                </span>
                                              )}
                                              {!isCom && !isStornoRow && (
                                                <span className="mr-1.5 px-1 py-0.2 bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 rounded font-bold text-[9px] not-italic">
                                                  Da salvare
                                                </span>
                                              )}
                                              {m.note}
                                            </td>
                                            <td className="px-1 py-1.5 text-center text-gray-400">{item.unit}</td>
                                            <td className="px-1 py-1.5 text-center text-gray-400">{m.factor || '-'}</td>
                                            <td className="px-1 py-1.5 text-center text-gray-400">{m.length || '-'}</td>
                                            <td className="px-1 py-1.5 text-center text-gray-400">{m.width || '-'}</td>
                                            <td className="px-1 py-1.5 text-center text-gray-400">{m.height || '-'}</td>
                                            <td className={`px-2 py-1.5 text-right font-bold ${isNeg ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
                                              {numberFormatter.format(m.quantity)}
                                            </td>
                                            <td className="px-2 py-1.5 text-right font-semibold text-indigo-600 dark:text-indigo-400">
                                              {currencyFormatter.format(m.quantity * item.unitPrice)}
                                            </td>
                                            <td className="px-1 py-1.5 text-center">
                                              {!(isViewOnly || isLocked) && (
                                                isStornoRow ? (
                                                  <div className="flex items-center justify-center gap-1">
                                                    {!isCom && (
                                                      <button
                                                        type="button"
                                                        onClick={() => handleStartEditMeasurement(item.articleCode, m)}
                                                        className="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 p-1 text-[10px] font-bold"
                                                        title="Modifica data o nota dello storno prima di salvare"
                                                      >
                                                        ✏️
                                                      </button>
                                                    )}
                                                    <button
                                                      type="button"
                                                      onClick={(e) => handleUndoReverseMeasurement(e, item.articleCode, m, mIdx)}
                                                      className="px-1.5 py-0.5 bg-red-100 hover:bg-red-200 dark:bg-red-900/50 dark:hover:bg-red-800 text-red-700 dark:text-red-200 rounded font-bold text-[10px] transition-colors whitespace-nowrap"
                                                      title="Annulla questo storno e ripristina l'icona Storno sulla voce originale"
                                                    >
                                                      ↶ Annulla Storno
                                                    </button>
                                                  </div>
                                                ) : !isNeg ? (
                                                  isCom ? (
                                                    isAlreadyReversed ? (
                                                      <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 italic select-none" title="Misurazione già stornata">
                                                        Stornata
                                                      </span>
                                                    ) : (
                                                      <button
                                                        type="button"
                                                        onClick={(e) => handleReverseMeasurement(e, item.articleCode, mIdx)}
                                                        className="text-orange-500 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/40 px-1.5 py-0.5 rounded font-bold text-[10px] transition-colors"
                                                        title="Storna questa misurazione per azzerarla e ricaricarla corretta"
                                                      >
                                                        ↩ Storno
                                                      </button>
                                                    )
                                                  ) : (
                                                    <div className="flex items-center justify-center gap-1">
                                                      <button
                                                        type="button"
                                                        onClick={() => handleStartEditMeasurement(item.articleCode, m)}
                                                        className="px-1.5 py-0.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900 text-indigo-600 dark:text-indigo-300 rounded font-bold text-[10px] transition-colors"
                                                        title="Modifica questa misurazione prima di salvare"
                                                      >
                                                        ✏️ Modifica
                                                      </button>
                                                      <button
                                                        type="button"
                                                        onClick={() => {
                                                          setActiveGroup(p => p ? ({
                                                            ...p,
                                                            items: p.items.map(i => i.articleCode === item.articleCode ? ({
                                                              ...i,
                                                              measurements: i.measurements?.filter((_, idx) => idx !== mIdx)
                                                            }) : i)
                                                          }) : null);
                                                          setIsDirty(true);
                                                        }}
                                                        className="text-gray-400 hover:text-red-500 p-1"
                                                        title="Elimina riga non ancora salvata"
                                                      >
                                                        🗑️
                                                      </button>
                                                    </div>
                                                  )
                                                ) : null
                                              )}
                                            </td>
                                          </tr>
                                      );
                                    })
                                  )}
                              </tbody>

                              {/* RIGO DELLA MISURAZIONE PERFETTAMENTE ALLINEATO CON LA TABELLA SUPERIORE */}
                              {!(isViewOnly || isLocked) && (
                                <tfoot className="border-t-2 border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20">
                                  <tr>
                                    {/* 1. DATA (CONGRUENTE: DALL'INIZIO LAVORI/PRECEDENTE MISURA FINO A OGGI) */}
                                    <td className="p-1 align-middle">
                                      <EuropeanDateInput 
                                        value={currentItemDate} 
                                        min={itemMinDate}
                                        max={itemMaxDate}
                                        onChange={val => handleItemDateChange(item.articleCode, val)}
                                        className="w-full p-1 text-[11px] font-mono font-bold bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded text-indigo-700 dark:text-indigo-300 shadow-sm"
                                        title={`Data consentita tra ${format(parseISO(itemMinDate), 'dd/MM/yyyy')} (inizio lavori/precedente misura) e oggi ${format(parseISO(itemMaxDate), 'dd/MM/yyyy')}`}
                                      />
                                      <div className="text-[9px] text-gray-500 dark:text-gray-400 font-mono text-center truncate mt-0.5" title={`Valida da ${format(parseISO(itemMinDate), 'dd/MM/yyyy')} a ${format(parseISO(itemMaxDate), 'dd/MM/yyyy')}`}>
                                        {format(parseISO(itemMinDate), 'dd/MM')} ➜ {format(parseISO(itemMaxDate), 'dd/MM')}
                                      </div>
                                    </td>

                                    {/* 2. RILIEVO A LIBRETTO - MENU A TENDINA OBBLIGATORIO DAL COMPUTO */}
                                    <td className="p-1 align-middle">
                                      {openBoqMeasures.length > 0 ? (
                                        <div className="space-y-1">
                                          <select
                                            value={(newMeasurements[item.articleCode] as any)?.sourceBoqId || ''}
                                            onChange={(e) => {
                                              const val = e.target.value;
                                              if (!val) {
                                                handleMeasurementChange(item.articleCode, 'note', '');
                                                handleMeasurementChange(item.articleCode, 'sourceBoqId', '');
                                                return;
                                              }
                                              handleSelectComputoMeasure(item.articleCode, val);
                                            }}
                                            className="w-full p-1 text-xs font-semibold bg-white dark:bg-gray-700 border border-indigo-300 dark:border-indigo-600 rounded text-gray-800 dark:text-gray-100 cursor-pointer truncate shadow-sm focus:ring-1 focus:ring-indigo-500"
                                            title="Seleziona la misura dal computo metrico"
                                          >
                                            <option value="">-- Scegli misura da computo ({openBoqMeasures.length} aperte) --</option>
                                            {openBoqMeasures.map((bm) => (
                                              <option key={bm.id} value={bm.id}>
                                                #{bm.index}. {bm.description} [Residuo: {numberFormatter.format(bm.missingToClose)} {item.unit}]
                                              </option>
                                            ))}
                                          </select>

                                          {/* Se è selezionata una misura dal computo, permette di precisare eventuali dettagli */}
                                          {(newMeasurements[item.articleCode] as any)?.sourceBoqId && (
                                            <input 
                                              type="text" 
                                              value={(newMeasurements[item.articleCode] || { note: '' }).note} 
                                              placeholder="Dettaglio o nota opzionale..." 
                                              onChange={e => handleMeasurementChange(item.articleCode, 'note', e.target.value)} 
                                              className="w-full p-1 text-[11px] border border-gray-200 dark:border-gray-600 rounded bg-indigo-50/40 dark:bg-indigo-950/30 text-gray-800 dark:text-gray-200 font-medium" 
                                              title="Dettaglio opzionale legato alla misura di computo"
                                            />
                                          )}
                                        </div>
                                      ) : (
                                        <div className="p-1.5 text-center text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 rounded border border-emerald-200 dark:border-emerald-800">
                                          ✅ Tutte le misure di computo sono chiuse (100%)
                                        </div>
                                      )}
                                    </td>

                                    {/* 3. U.M. */}
                                    <td className="p-1 text-center text-gray-500 font-bold align-middle text-xs">
                                      {item.unit}
                                    </td>

                                    {/* 4. PARTI (CAMPO LIBERO) */}
                                    <td className="p-1 align-middle">
                                      <input 
                                        type="text" 
                                        placeholder="-" 
                                        className="w-full p-1 text-center text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700" 
                                        value={(newMeasurements[item.articleCode] as any)?.factor || ''} 
                                        onChange={e => handleMeasurementChange(item.articleCode, 'factor', e.target.value)} 
                                        title="Parti uguali"
                                      />
                                    </td>

                                    {/* 5. LUNG. (CAMPO LIBERO) */}
                                    <td className="p-1 align-middle">
                                      <input 
                                        type="text" 
                                        placeholder="-" 
                                        className="w-full p-1 text-center text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700" 
                                        value={(newMeasurements[item.articleCode] as any)?.length || ''} 
                                        onChange={e => handleMeasurementChange(item.articleCode, 'length', e.target.value)} 
                                        title="Lunghezza"
                                      />
                                    </td>

                                    {/* 6. LARG. (CAMPO LIBERO) */}
                                    <td className="p-1 align-middle">
                                      <input 
                                        type="text" 
                                        placeholder="-" 
                                        className="w-full p-1 text-center text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700" 
                                        value={(newMeasurements[item.articleCode] as any)?.width || ''} 
                                        onChange={e => handleMeasurementChange(item.articleCode, 'width', e.target.value)} 
                                        title="Larghezza"
                                      />
                                    </td>

                                    {/* 7. ALT/P (CAMPO LIBERO) */}
                                    <td className="p-1 align-middle">
                                      <input 
                                        type="text" 
                                        placeholder="-" 
                                        className="w-full p-1 text-center text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700" 
                                        value={(newMeasurements[item.articleCode] as any)?.height || ''} 
                                        onChange={e => handleMeasurementChange(item.articleCode, 'height', e.target.value)} 
                                        title="Altezza / Profondità"
                                      />
                                    </td>

                                    {/* 8. QUANTITÀ: CAMPO LIBERO CON RESIDUO MASSIMO SUGGERITO IN GRIGIO */}
                                    <td className="p-1 align-middle">
                                      <div className="flex items-center gap-0.5">
                                        <button 
                                          type="button"
                                          onClick={() => toggleDeductionMode(item.articleCode)} 
                                          className={`text-[9px] font-bold px-1 py-0.5 rounded transition-colors ${deductionModes[item.articleCode] ? 'bg-red-500 text-white' : 'text-gray-400 hover:text-gray-600'}`} 
                                          title="Detrazione negativa (-)"
                                        >
                                          {deductionModes[item.articleCode] ? '-' : '±'}
                                        </button>
                                        <input 
                                          type="text" 
                                          value={analyticQty !== null ? numberFormatter.format(analyticQty) : (newMeasurements[item.articleCode] || { quantity: '' }).quantity} 
                                          onChange={e => handleMeasurementChange(item.articleCode, 'quantity', e.target.value)} 
                                          readOnly={analyticQty !== null}
                                          className={`w-full p-1 text-xs border rounded text-right font-black placeholder:text-gray-400 dark:placeholder:text-gray-500 placeholder:font-normal ${
                                            isExceeded 
                                              ? 'bg-red-100 border-red-500 text-red-700 ring-2 ring-red-400' 
                                              : analyticQty !== null 
                                                ? 'bg-gray-100 text-indigo-600' 
                                                : deductionModes[item.articleCode] 
                                                  ? 'text-red-600 bg-red-50' 
                                                  : 'text-gray-900 bg-white dark:bg-gray-700 dark:text-white border-gray-300 dark:border-gray-600'
                                          }`} 
                                          placeholder={numberFormatter.format(maxAllowed)} 
                                          title={`Massimo residuo suggerito: ${numberFormatter.format(maxAllowed)} ${item.unit}`}
                                        />
                                      </div>
                                    </td>

                                    {/* 9. IMPORTO PREVISTO */}
                                    <td className="px-2 py-1 text-right font-semibold text-indigo-600 dark:text-indigo-400 align-middle truncate text-xs">
                                      {currencyFormatter.format(previewVal)}
                                    </td>

                                    {/* 10. AZIONI */}
                                    <td className="p-1 text-center align-middle">
                                      <button 
                                        type="button"
                                        onClick={() => handleAddMeasurement(item.articleCode)} 
                                        className={`w-full py-1 rounded text-xs font-black shadow-sm transition-all flex items-center justify-center ${
                                          isExceeded 
                                            ? 'bg-red-600 hover:bg-red-700 text-white' 
                                            : 'bg-indigo-600 hover:bg-indigo-700 text-white active:scale-95'
                                        }`}
                                        title={isExceeded ? "Blocca e chiudi con il residuo" : "Registra a libretto"}
                                      >
                                        {isExceeded ? 'Chiudi' : '+'}
                                      </button>
                                    </td>
                                  </tr>
                                </tfoot>
                              )}
                              </table>
                          </div>

                        </div>
                      );
                    })
                  )}

                  {/* Semplice selettore in calce per aggiungere una nuova voce dal computo se necessario */}
                  {!isViewOnly && !isLocked && availableComputoItems.length > 0 && (
                    <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-gray-500">
                        ➕ Aggiungi un'altra voce dal Computo a questa lavorazione:
                      </span>
                      <select 
                        value="" 
                        onChange={(e) => {
                          const selected = availableComputoItems.find(i => i.articleCode === e.target.value);
                          if (selected) handleAddVoiceFromComputo(selected);
                        }}
                        className="p-1.5 text-xs font-medium border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                      >
                        <option value="">-- Seleziona voce da aggiungere ({availableComputoItems.length} disponibili) --</option>
                        {availableComputoItems.map(cItem => (
                          <option key={cItem.articleCode} value={cItem.articleCode}>
                            {cItem.articleCode} - {cItem.description.slice(0, 50)}... ({cItem.quantity} {cItem.unit})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
            </div>
          )}
          
          {/* TAB 2: IMPOSTAZIONI GRUPPO (DATA INIZIO BLOCCATA, A MISURA/CORPO, SICUREZZA, SQUADRA) */}
          {activeTab === 'planning' && (
            <div className="flex-grow overflow-y-auto pr-2 space-y-6">
                <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/40 dark:to-blue-950/30 p-5 rounded-2xl border border-indigo-100 dark:border-indigo-900 shadow-sm flex items-start gap-4">
                  <div className="p-3 bg-indigo-600 text-white rounded-xl shadow-md">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-base font-black text-gray-900 dark:text-white uppercase tracking-tight">Parametri di Gruppo & Collocazione Contabile (SAL)</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">
                      La <strong>data di inizio</strong> è stabilita dal Cronoprogramma e non è modificabile manualmente da qui. Le altre <strong>tre opzioni</strong> (Tipologia A Misura/A Corpo, Oneri di Sicurezza, Squadra) sono sempre modificabili in modo flessibile per impostare la corretta collocazione nel SAL (D.Lgs. 36/2023).
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white dark:bg-gray-800 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
                  {/* 1. DATA DI INIZIO (MODIFICABILE DA IMPOSTAZIONI, MAI DOPO OGGI) */}
                  <div className="space-y-6">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400">1. Data Inizio Lavorazioni (Gruppo)</span>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
                          📅 Scelta da Impostazioni
                        </span>
                      </div>
                      <div className="relative">
                        <EuropeanDateInput 
                          value={activeGroup.officialStartDate || activeGroup.startDate || format(new Date(), 'yyyy-MM-dd')} 
                          max={format(new Date(), 'yyyy-MM-dd')}
                          disabled={isViewOnly || isLocked}
                          onChange={val => {
                            const todayStr = format(new Date(), 'yyyy-MM-dd');
                            if (val && val <= todayStr) {
                              handleConfigChange('officialStartDate', val);
                              handleConfigChange('startDate', val);
                            }
                          }}
                          className="block w-full p-3 bg-white dark:bg-gray-700 border-2 border-indigo-400 dark:border-indigo-600 rounded-xl shadow-sm font-mono font-bold text-indigo-700 dark:text-indigo-300 text-lg cursor-pointer pr-10"
                        />
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5 italic">
                        * Caricata e gestita dal pulsante di impostazione di ogni gruppo. Mai successiva alla data odierna.
                      </p>
                    </div>

                    <div>
                      <span className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 block mb-1.5">4. Dimensione Squadra (Operai in Cantiere)</span>
                      <div className="flex items-center gap-3">
                        <input 
                          type="number" 
                          min="1" 
                          max="50"
                          value={activeGroup.teamSize || 2} 
                          onChange={e => handleConfigChange('teamSize', Math.max(1, parseInt(e.target.value) || 1))}
                          className="block w-28 p-3 bg-white dark:bg-gray-700 border-2 border-indigo-400 dark:border-indigo-600 rounded-xl shadow-sm font-black text-indigo-700 dark:text-indigo-300 text-lg text-center"
                        />
                        <div className="text-xs text-gray-600 dark:text-gray-300">
                          <span className="font-bold">Produttività:</span> € 240/giorno per operaio.
                          <p className="text-[10px] text-gray-500 italic">Ricalcola automaticamente la durata residua del gruppo.</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 2 & 3. TIPOLOGIA CONTABILE E SICUREZZA */}
                  <div className="space-y-6">
                    {/* 2. TIPOLOGIA CONTABILE */}
                    <div>
                      <span className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 block mb-2">2. Tipologia Contabile (SAL)</span>
                      <div className="grid grid-cols-2 gap-3 p-1 bg-gray-100 dark:bg-gray-700/60 rounded-xl border border-gray-200 dark:border-gray-600">
                        <button 
                          type="button"
                          onClick={() => handleConfigChange('accountingType', 'measure')} 
                          className={`py-3 px-3 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex flex-col items-center justify-center gap-1 ${activeGroup.accountingType === 'measure' ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-md ring-2 ring-blue-500' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                        >
                          <span>A MISURA</span>
                          <span className="text-[9px] font-normal normal-case opacity-75">Quantità analitiche</span>
                        </button>
                        <button 
                          type="button"
                          onClick={() => handleConfigChange('accountingType', 'body')} 
                          className={`py-3 px-3 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex flex-col items-center justify-center gap-1 ${activeGroup.accountingType === 'body' ? 'bg-white dark:bg-gray-800 text-purple-600 dark:text-purple-400 shadow-md ring-2 ring-purple-500' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                        >
                          <span>A CORPO</span>
                          <span className="text-[9px] font-normal normal-case opacity-75">Aliquota percentuale (%)</span>
                        </button>
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2">
                        Nel SAL colloca le voci nel prospetto <strong>{activeGroup.accountingType === 'body' ? 'Lavori a Corpo' : 'Lavori a Misura'}</strong>.
                      </p>
                    </div>

                    {/* 3. LAVORAZIONE DI SICUREZZA */}
                    <div>
                      <span className="text-xs font-black uppercase tracking-wider text-gray-500 dark:text-gray-400 block mb-2">3. Regime Economico (Ribasso d'Asta)</span>
                      <button 
                        type="button"
                        onClick={() => handleConfigChange('isSecurityCost', !activeGroup.isSecurityCost)}
                        className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all shadow-sm ${activeGroup.isSecurityCost ? 'bg-orange-50 dark:bg-orange-950/40 border-orange-500 text-orange-900 dark:text-orange-200' : 'bg-gray-50 dark:bg-gray-700/40 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300'}`}
                      >
                        <div className="text-left">
                          <span className="text-xs font-black uppercase block">
                            {activeGroup.isSecurityCost ? '🛡️ Oneri di Sicurezza (Non Soggetti a Ribasso)' : '🏗️ Lavori Ordinari (Soggetti a Ribasso d\'Asta)'}
                          </span>
                          <span className="text-[11px] opacity-80 font-normal">
                            {activeGroup.isSecurityCost ? 'L\'importo non subisce il ribasso contrattuale nel SAL.' : 'L\'importo subisce il ribasso d\'asta contrattuale nel SAL.'}
                          </span>
                        </div>
                        <div className={`w-12 h-6 rounded-full relative transition-colors flex-shrink-0 ml-3 ${activeGroup.isSecurityCost ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-500'}`}>
                          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${activeGroup.isSecurityCost ? 'right-1' : 'left-1'}`} />
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
            </div>
          )}

          {/* TAB 3: DIPENDENZE / LEGAMI */}
          {activeTab === 'dependencies' && (
             <div className="flex-grow overflow-y-auto pr-2 space-y-6">
                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <h4 className="text-xs font-black uppercase text-gray-500 mb-3">Predecessori (Attività che bloccano questa)</h4>
                        <div className="space-y-2">
                            {dependencies.filter(d => d.to === activeGroup.id).map(dep => { 
                                const p = allWorkGroups.find(w => w.id === dep.from); 
                                return (
                                    <div key={dep.id} className="flex justify-between items-center p-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-sm">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-gray-800 dark:text-white uppercase">{p?.name}</span>
                                            <span className="text-[10px] text-indigo-500 font-bold">{dep.type} + {dep.lag} giorni</span>
                                        </div>
                                        <button onClick={() => onDependenciesChange(prev => prev.filter(d => d.id !== dep.id))} className="text-red-500 hover:bg-red-50 p-1 rounded-full transition-colors">✕</button>
                                    </div>
                                )
                            })}
                            {dependencies.filter(d => d.to === activeGroup.id).length === 0 && <p className="text-xs text-gray-400 italic">Nessun legame in entrata.</p>}
                        </div>
                    </div>
                    <div>
                        <h4 className="text-xs font-black uppercase text-gray-500 mb-3">Successori (Attività bloccate da questa)</h4>
                        <div className="space-y-2">
                            {dependencies.filter(d => d.from === activeGroup.id).map(dep => { 
                                const s = allWorkGroups.find(w => w.id === dep.to); 
                                return (
                                    <div key={dep.id} className="flex justify-between items-center p-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-sm">
                                        <div className="flex flex-col">
                                            <span className="text-xs font-bold text-gray-800 dark:text-white uppercase">{s?.name}</span>
                                            <span className="text-[10px] text-indigo-500 font-bold">{dep.type} + {dep.lag} giorni</span>
                                        </div>
                                        <button onClick={() => onDependenciesChange(prev => prev.filter(d => d.id !== dep.id))} className="text-red-500 hover:bg-red-50 p-1 rounded-full transition-colors">✕</button>
                                    </div>
                                )
                            })}
                            {dependencies.filter(d => d.from === activeGroup.id).length === 0 && <p className="text-xs text-gray-400 italic">Nessun legame in uscita.</p>}
                        </div>
                    </div>
                </div>
                
                {!isLocked && (
                    <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
                        <h4 className="text-xs font-black uppercase text-indigo-600 mb-4">Crea Nuovo Legame</h4>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end bg-indigo-50/50 dark:bg-indigo-900/10 p-4 rounded-xl">
                            <div className="md:col-span-1">
                                <span className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Direzione</span>
                                <select value={newDependency.direction} onChange={e => setNewDependency(p => ({ ...p, direction: e.target.value as any }))} className="w-full p-2 text-xs border rounded bg-white dark:bg-gray-800">
                                    <option value="predecessor">È Predecessore di...</option>
                                    <option value="successor">È Successore di...</option>
                                </select>
                            </div>
                            <div className="md:col-span-1">
                                <span className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Tipo Legame</span>
                                <select value={newDependency.type} onChange={e => setNewDependency(p => ({ ...p, type: e.target.value as any }))} className="w-full p-2 text-xs border rounded bg-white dark:bg-gray-800">
                                    <option value="FS">Fine-Inizio (FS)</option>
                                    <option value="SS">Inizio-Inizio (SS)</option>
                                    <option value="FF">Fine-Fine (FF)</option>
                                    <option value="SF">Inizio-Fine (SF)</option>
                                </select>
                            </div>
                            <div className="md:col-span-1">
                                <span className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Attività Target</span>
                                <select value={newDependency.targetId} onChange={e => setNewDependency(p => ({ ...p, targetId: e.target.value }))} className="w-full p-2 text-xs border rounded bg-white dark:bg-gray-800">
                                    <option value="">Scegli...</option>
                                    {allWorkGroups.filter(wg => wg.id !== activeGroup.id).map(wg => <option key={wg.id} value={wg.id}>{wg.name}</option>)}
                                </select>
                            </div>
                            <button onClick={() => { if (!newDependency.targetId) return; onDependenciesChange(p => [...p, { id: crypto.randomUUID(), from: newDependency.direction === 'successor' ? activeGroup.id : newDependency.targetId, to: newDependency.direction === 'successor' ? newDependency.targetId : activeGroup.id, type: newDependency.type, lag: parseInt(newDependency.lag) || 0 }]); setNewDependency(p => ({ ...p, targetId: '' })); }} className="px-4 py-2 text-xs font-black text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm uppercase tracking-widest">Collega</button>
                        </div>
                    </div>
                )}
             </div>
          )}
        </div>

        {/* Footer azioni */}
        <div className="flex-shrink-0 flex items-center justify-between p-3.5 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 rounded-b-2xl">
          <button type="button" onClick={handleAttemptClose} className="px-6 py-2.5 text-xs font-black uppercase tracking-widest text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors">
            Annulla
          </button>
          {!(isViewOnly || isLocked) && (
            <button 
              type="button" 
              onClick={handleRequestSaveChanges} 
              className="px-8 py-2.5 text-xs font-black uppercase tracking-widest text-white bg-indigo-600 rounded-xl shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 transition-all active:scale-95 flex items-center gap-2"
            >
              <span>💾 Salva e Applica Modifiche</span>
            </button>
          )}
        </div>

        {/* MODALE DI CONFERMA SALVATAGGIO */}
        {showSaveConfirmModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={() => setShowSaveConfirmModal(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 max-w-md w-full p-6 space-y-4 animate-fade-in" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 text-xl">
                  💾
                </div>
                <div>
                  <h4 className="text-base font-black text-gray-900 dark:text-white uppercase tracking-tight">
                    Conferma Salvataggio Contabilità
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {activeGroup.name}
                  </p>
                </div>
              </div>

              <div className="p-3.5 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Nuove misurazioni inserite:</span>
                  <span className="font-black text-indigo-600 dark:text-indigo-400">{uncommittedMeasurementsCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Storni effettuati nella sessione:</span>
                  <span className="font-black text-red-600 dark:text-red-400">{uncommittedStorniCount}</span>
                </div>
                <div className="border-t border-gray-200 dark:border-gray-600 pt-2 flex justify-between">
                  <span className="text-gray-600 dark:text-gray-300 font-bold">Totale Contabilizzato Gruppo:</span>
                  <span className="font-black text-gray-900 dark:text-white">{currencyFormatter.format(totalMeasuredValue)} ({numberFormatter.format(currentProgress)}%)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-300 font-bold">Residuo di Gruppo:</span>
                  <span className="font-black text-emerald-600 dark:text-emerald-400">{currencyFormatter.format(groupResidualValue)}</span>
                </div>
              </div>

              <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                Confermi il salvataggio delle modifiche a libretto? Una volta confermato, le righe registrate diventeranno consolidate in contabilità.
              </p>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSaveConfirmModal(false)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-xl transition-colors"
                >
                  Torna alle Modifiche
                </button>
                <button
                  type="button"
                  onClick={executeSaveChanges}
                  className="px-5 py-2 text-xs font-black uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition-all active:scale-95"
                >
                  ✓ Conferma e Salva
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODALE DI CONFERMA USCITA CON MODIFICHE NON SALVATE */}
        {showCloseConfirmModal && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4" onClick={() => setShowCloseConfirmModal(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 max-w-sm w-full p-6 space-y-4 animate-fade-in" onClick={e => e.stopPropagation()}>
              <h4 className="text-base font-black text-gray-900 dark:text-white uppercase tracking-tight">
                Modifiche non salvate
              </h4>
              <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                Ci sono modifiche o storni non ancora salvati. Vuoi uscire senza salvare e perdere le modifiche effettuate?
              </p>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCloseConfirmModal(false)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 rounded-xl"
                >
                  Resta e Modifica
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCloseConfirmModal(false); onClose(); }}
                  className="px-4 py-2 text-xs font-black uppercase text-white bg-red-600 hover:bg-red-700 rounded-xl"
                >
                  Esci senza Salvare
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskModal;
