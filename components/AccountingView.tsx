
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ProjectDocument, ContractConfig, SalEntry, WorkGroup, PriceDepreciation } from '../types';
import { format, parseISO, startOfDay, isAfter, endOfDay, isValid } from 'date-fns';
import { it } from 'date-fns/locale/it';
import { EuropeanDateInput } from './EuropeanDateInput';


declare const jspdf: any;
declare const html2canvas: any;

export type AccountingTab = 'libretto' | 'register' | 'summary' | 'sal_technical' | 'payment_cert' | 'depreciation' | 'settings';

interface AccountingViewProps {
  documents: ProjectDocument[];
  projectName?: string;
  contractConfig?: ContractConfig;
  onUpdateContractConfig: (config: ContractConfig) => void;
  sals?: SalEntry[];
  onUpdateSals: (sals: SalEntry[]) => void;
  onToggleGroupSecurity?: (groupId: string) => void; 
  activeTab?: AccountingTab;
  onTabChange?: (tab: AccountingTab) => void;
  priceDepreciations?: PriceDepreciation[];
  onUpdatePriceDepreciations?: (depreciations: PriceDepreciation[]) => void;
}

const currencyFormatter = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const numberFormatter = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percentFormatter = new Intl.NumberFormat('it-IT', { style: 'percent', minimumFractionDigits: 2 });

const round2 = (num: number): number => {
    return Math.round((num + Number.EPSILON) * 100) / 100;
};

const formatCodeWithComputoIndex = (articleCode: string, originalIndex?: number, accountingType?: 'measure' | 'body'): string => {
    if (accountingType === 'body' || !originalIndex || originalIndex <= 0) return articleCode;
    return `N. CM. ${originalIndex} - ${articleCode}`;
};

const formatLibrettoRef = (progressiveIndex: number, librettoPage: number = 1, multiline: boolean = false): string => {
    return multiline
        ? `N. LB. ${progressiveIndex}\nPag. ${librettoPage}`
        : `N. LB. ${progressiveIndex} - Pag. ${librettoPage}`;
};

interface AccountingEntry {
    id: string; 
    progressiveIndex: number; 
    librettoPage: number;
    date: string;
    articleCode: string;
    originalIndex?: number; 
    description: string; 
    measurementNote: string; 
    unit: string;
    quantity: number;
    unitPrice: number;
    debit: number; 
    progressive: number; 
    groupName: string; 
    docName: string;
    cumulativePercentage?: number; 
    factor?: number;
    length?: number;
    width?: number;
    height?: number;
    isSecurityCost: boolean; 
    accountingType: 'measure' | 'body';
    createdAt?: number;
    depreciationId?: string;
    isDepreciated?: boolean;
}

interface SummaryMeasurementLine {
    id: string;
    progressiveIndex: number; // Num. ord. misura progressivo
    librettoPage: number;     // Pagina del Libretto Unico
    date: string;
    salNumber?: number;
    salLabel?: string;
    isPreviousSal: boolean;
    measurementNote: string;
    factor?: number;
    length?: number;
    width?: number;
    height?: number;
    quantity: number;
    unitPrice: number;
    amount: number;
}

interface SummaryEntry {
    articleCode: string;
    originalIndex?: number;
    wbsName: string;
    groupName?: string;
    description: string;
    unit: string;
    unitPrice: number;
    estimatedQuantity: number; 
    previousQuantity: number;
    previousAmount: number;
    currentQuantity: number;
    currentAmount: number;
    totalQuantity: number; 
    totalAmount: number;
    progressPercent: number; 
    accountingType: 'measure' | 'body';
    isSecurityCost: boolean;
    previousLines: SummaryMeasurementLine[];
    currentLines: SummaryMeasurementLine[];
    allLines: SummaryMeasurementLine[];
    residualQuantity?: number;
    residualAmount?: number;
}

const useOnClickOutside = (ref: React.RefObject<HTMLElement>, handler: (event: MouseEvent | TouchEvent) => void) => {
  useEffect(() => {
    const listener = (event: MouseEvent | TouchEvent) => {
      if (!ref.current || ref.current.contains(event.target as Node)) {
        return;
      }
      handler(event);
    };
    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);
    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, [ref, handler]);
};

const FilterIcon: React.FC<{ isActive: boolean, onClick: (e: React.MouseEvent) => void }> = ({ isActive, onClick }) => (
    <button onClick={onClick} className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors ${isActive ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30' : 'text-gray-400'}`} title="Filtra">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" /></svg>
    </button>
);

const TextFilterPopover: React.FC<{ value: string, onChange: (val: string) => void, onClose: () => void, placeholder?: string }> = ({ value, onChange, onClose, placeholder }) => {
    const ref = useRef<HTMLDivElement>(null);
    useOnClickOutside(ref, onClose);
    return (
        <div ref={ref} className="absolute top-full mt-1 left-0 z-50 w-64 bg-white dark:bg-gray-800 shadow-xl rounded-lg border border-gray-200 dark:border-gray-700 p-3 animate-fade-in">
            <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder || "Cerca..."} className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none text-gray-900 dark:text-white" autoFocus />
            <div className="flex justify-end mt-2 pt-2 border-t border-gray-100 dark:border-gray-700"><button onClick={() => { onChange(''); onClose(); }} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mr-2">Pulisci</button><button onClick={onClose} className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700">Chiudi</button></div>
        </div>
    );
};

const DateFilterPopover: React.FC<{ dateFrom: string, dateTo: string, onChange: (from: string, to: string) => void, onClose: () => void }> = ({ dateFrom, dateTo, onChange, onClose }) => {
    const ref = useRef<HTMLDivElement>(null);
    useOnClickOutside(ref, onClose);
    return (
        <div ref={ref} className="absolute top-full mt-1 left-0 z-50 w-64 bg-white dark:bg-gray-800 shadow-xl rounded-lg border border-gray-200 dark:border-gray-700 p-3 animate-fade-in">
            <div className="space-y-2">
                <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Dal:</label>
                    <EuropeanDateInput value={dateFrom} onChange={val => onChange(val, dateTo)} className="w-full p-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
                <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Al:</label>
                    <EuropeanDateInput value={dateTo} onChange={val => onChange(dateFrom, val)} className="w-full p-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500 outline-none" />
                </div>
            </div>
            <div className="flex justify-end mt-3 pt-2 border-t border-gray-100 dark:border-gray-700"><button onClick={() => { onChange('', ''); onClose(); }} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mr-2">Pulisci</button><button onClick={onClose} className="text-xs bg-indigo-600 text-white px-2 py-1 rounded hover:bg-indigo-700">Applica</button></div>
        </div>
    );
};

const AccountingView: React.FC<AccountingViewProps> = ({ 
    documents, 
    projectName, 
    contractConfig, 
    onUpdateContractConfig, 
    sals = [], 
    onUpdateSals,
    onToggleGroupSecurity,
    activeTab: externalActiveTab,
    onTabChange,
    priceDepreciations = [],
    onUpdatePriceDepreciations
}) => {
  const [internalTab, setInternalTab] = useState<AccountingTab>('libretto');
  const activeTab = externalActiveTab ?? internalTab;
  const setActiveTab = (tab: AccountingTab) => {
      setInternalTab(tab);
      onTabChange?.(tab);
  };
  
  const [localConfig, setLocalConfig] = useState<ContractConfig>(contractConfig || { 
      discountPercent: 0, 
      withholdingTaxPercent: 0.5, 
      vatPercent: 22, 
      contractorName: '', 
      contractCode: '',
      contractDate: '',
      advancePaymentPercent: 20, 
      excludeLaborFromDiscount: false,
      contractLaborAmount: 0
  });

  useEffect(() => {
      onUpdateContractConfig(localConfig);
  }, [localConfig, onUpdateContractConfig]);

  const [activeSalId, setActiveSalId] = useState<string | null>(null); 
  
  useEffect(() => {
      if (!activeSalId && sals.length > 0) {
          const sorted = [...sals].sort((a,b) => b.number - a.number);
          setActiveSalId(sorted[0].id);
      }
  }, [sals, activeSalId]);

  const salReferenceDate = useMemo(() => {
      if (activeSalId) {
          const sal = sals.find(s => s.id === activeSalId);
          return sal ? sal.date : format(new Date(), 'yyyy-MM-dd');
      }
      return format(new Date(), 'yyyy-MM-dd');
  }, [activeSalId, sals]);

  const [filters, setFilters] = useState({ code: '', wbs: '', description: '', dateFrom: '', dateTo: '' });
  const [activePopover, setActivePopover] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [summaryMode, setSummaryMode] = useState<'analytical' | 'synthetic'>('analytical');
  const [summaryGrouping, setSummaryGrouping] = useState<'grouped_by_wbs' | 'flat'>('grouped_by_wbs');
  const [deprModalItemSearch, setDeprModalItemSearch] = useState('');
  const [deprModalCategoryFilter, setDeprModalCategoryFilter] = useState('all');

  // Stato per la gestione dei Deprezzamenti Prezzo (Determina del RUP)
  const [isDeprModalOpen, setIsDeprModalOpen] = useState(false);
  const [editingDeprId, setEditingDeprId] = useState<string | null>(null);
  const [deprSearchQuery, setDeprSearchQuery] = useState('');
  const [formNotice, setFormNotice] = useState<string | null>(null);

  const [deprForm, setDeprForm] = useState<{
    articleCode: string;
    determinaNumber: string;
    determinaDate: string;
    reason: string;
    depreciatedUnitPrice: string;
    maxDepreciatedQuantity: string;
  }>({
    articleCode: '',
    determinaNumber: '',
    determinaDate: format(new Date(), 'yyyy-MM-dd'),
    reason: '',
    depreciatedUnitPrice: '',
    maxDepreciatedQuantity: ''
  });

  // Elenco completo e univoco di tutte le voci di computo presenti nel progetto
  const allComputoItems = useMemo(() => {
    const list: {
      articleCode: string;
      description: string;
      unit: string;
      unitPrice: number;
      totalQuantity: number;
      groupName: string;
      originalIndex?: number;
    }[] = [];
    const seen = new Set<string>();

    documents.forEach(doc => {
      doc.workGroups.forEach(wg => {
        wg.items.forEach(it => {
          if (!seen.has(it.articleCode)) {
            seen.add(it.articleCode);
            list.push({
              articleCode: it.articleCode,
              description: it.description,
              unit: it.unit,
              unitPrice: it.unitPrice,
              totalQuantity: it.quantity,
              groupName: wg.name,
              originalIndex: it.originalIndex
            });
          }
        });
      });
    });

    return list.sort((a, b) => {
      if (a.originalIndex !== undefined && b.originalIndex !== undefined && a.originalIndex !== b.originalIndex) {
        return a.originalIndex - b.originalIndex;
      }
      return a.articleCode.localeCompare(b.articleCode);
    });
  }, [documents]);

  // Categorie uniche estratte dal computo per i filtri di selezione
  const computoCategories = useMemo(() => {
    const map = new Map<string, number>();
    allComputoItems.forEach(item => {
      const grp = item.groupName || 'Altre Lavorazioni';
      map.set(grp, (map.get(grp) || 0) + 1);
    });
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }));
  }, [allComputoItems]);

  // Voci di computo filtrate per la selezione nel modale di deprezzamento
  const filteredDeprModalItems = useMemo(() => {
    return allComputoItems.filter(item => {
      if (deprModalCategoryFilter !== 'all' && item.groupName !== deprModalCategoryFilter) {
        return false;
      }
      if (deprModalItemSearch.trim()) {
        const q = deprModalItemSearch.toLowerCase();
        const formattedCode = formatCodeWithComputoIndex(item.articleCode, item.originalIndex).toLowerCase();
        const codeMatch = formattedCode.includes(q) || item.articleCode.toLowerCase().includes(q);
        const descMatch = item.description.toLowerCase().includes(q);
        const groupMatch = (item.groupName || '').toLowerCase().includes(q);
        return codeMatch || descMatch || groupMatch;
      }
      return true;
    });
  }, [allComputoItems, deprModalCategoryFilter, deprModalItemSearch]);

  // Calcolo dell'utilizzo di ciascun deprezzamento a registro/libretto
  const getDeprUsage = (deprId: string) => {
    let usedQty = 0;
    let occurrences = 0;
    documents.forEach(doc => {
      doc.workGroups.forEach(wg => {
        wg.items.forEach(it => {
          (it.measurements || []).forEach(m => {
            if (m.depreciationId === deprId) {
              usedQty += m.quantity;
              occurrences++;
            }
          });
        });
      });
    });
    return {
      usedQty: Math.max(0, Math.round(usedQty * 1000) / 1000),
      occurrences
    };
  };

  const handleOpenNewDeprModal = () => {
    setEditingDeprId(null);
    setFormNotice(null);
    setDeprModalItemSearch('');
    setDeprModalCategoryFilter('all');
    const firstItem = allComputoItems.length > 0 ? allComputoItems[0] : null;
    setDeprForm({
      articleCode: firstItem ? firstItem.articleCode : '',
      determinaNumber: '',
      determinaDate: format(new Date(), 'yyyy-MM-dd'),
      reason: '',
      depreciatedUnitPrice: '',
      maxDepreciatedQuantity: firstItem ? firstItem.totalQuantity.toString() : ''
    });
    setIsDeprModalOpen(true);
  };

  const handleEditDepr = (depr: PriceDepreciation) => {
    setEditingDeprId(depr.id);
    setFormNotice(null);
    setDeprModalItemSearch('');
    setDeprModalCategoryFilter('all');
    setDeprForm({
      articleCode: depr.articleCode,
      determinaNumber: depr.determinaNumber,
      determinaDate: depr.determinaDate,
      reason: depr.reason,
      depreciatedUnitPrice: depr.depreciatedUnitPrice.toString(),
      maxDepreciatedQuantity: depr.maxDepreciatedQuantity.toString()
    });
    setIsDeprModalOpen(true);
  };

  const handleSaveDepreciation = (e: React.FormEvent) => {
    e.preventDefault();
    setFormNotice(null);

    if (!deprForm.articleCode) {
      setFormNotice('Seleziona una voce dal computo metrico.');
      return;
    }
    if (!deprForm.determinaNumber.trim()) {
      setFormNotice('Inserisci il numero o estremi della Determina del RUP.');
      return;
    }
    if (!deprForm.determinaDate) {
      setFormNotice('Inserisci la data della Determina del RUP.');
      return;
    }
    if (!deprForm.reason.trim()) {
      setFormNotice('Specifica la motivazione tecnica del RUP per il deprezzamento.');
      return;
    }

    const selectedItem = allComputoItems.find(i => i.articleCode === deprForm.articleCode);
    if (!selectedItem) {
      setFormNotice('Voce di computo selezionata non trovata.');
      return;
    }

    const deprPrice = parseFloat(deprForm.depreciatedUnitPrice.replace(',', '.'));
    if (isNaN(deprPrice) || deprPrice <= 0) {
      setFormNotice('Inserisci un prezzo deprezzato valido maggiore di zero.');
      return;
    }
    if (deprPrice >= selectedItem.unitPrice) {
      setFormNotice(`Il prezzo deprezzato (€ ${numberFormatter.format(deprPrice)}) deve essere inferiore al prezzo contrattuale (€ ${numberFormatter.format(selectedItem.unitPrice)}).`);
      return;
    }

    const maxQty = parseFloat(deprForm.maxDepreciatedQuantity.replace(',', '.'));
    if (isNaN(maxQty) || maxQty <= 0) {
      setFormNotice('Inserisci una quantità massima deprezzata valida maggiore di zero.');
      return;
    }

    const newDepr: PriceDepreciation = {
      id: editingDeprId || crypto.randomUUID(),
      articleCode: selectedItem.articleCode,
      itemDescription: selectedItem.description,
      unit: selectedItem.unit,
      determinaNumber: deprForm.determinaNumber.trim(),
      determinaDate: deprForm.determinaDate,
      reason: deprForm.reason.trim(),
      contractUnitPrice: selectedItem.unitPrice,
      originalUnitPrice: selectedItem.unitPrice,
      depreciatedUnitPrice: deprPrice,
      maxDepreciatedQuantity: maxQty,
      createdAt: new Date().toISOString()
    };

    let updated: PriceDepreciation[];
    if (editingDeprId) {
      updated = priceDepreciations.map(d => d.id === editingDeprId ? newDepr : d);
    } else {
      updated = [...priceDepreciations, newDepr];
    }

    onUpdatePriceDepreciations?.(updated);
    setIsDeprModalOpen(false);
    setEditingDeprId(null);
  };

  const handleDeleteDepreciation = (depr: PriceDepreciation) => {
    const { usedQty, occurrences } = getDeprUsage(depr.id);
    if (usedQty > 0 || occurrences > 0) {
      alert(`⚠️ Impossibile eliminare: questa Determina del RUP è già stata applicata in contabilità su ${occurrences} misurazione/i per complessivi ${numberFormatter.format(usedQty)}. È necessario stornare o eliminare prima le relative misure.`);
      return;
    }
    if (confirm(`Sei sicuro di voler eliminare la Determina del RUP ${depr.determinaNumber} per la voce ${depr.articleCode}?`)) {
      const updated = priceDepreciations.filter(d => d.id !== depr.id);
      onUpdatePriceDepreciations?.(updated);
    }
  };

  const handlePrintDeprActPdf = (depr: PriceDepreciation) => {
    try {
      const { jsPDF } = jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const item = allComputoItems.find(i => i.articleCode === depr.articleCode);
      const { usedQty } = getDeprUsage(depr.id);
      const remainingQty = Math.max(0, Math.round((depr.maxDepreciatedQuantity - usedQty) * 1000) / 1000);
      const origPrice = depr.originalUnitPrice ?? depr.contractUnitPrice ?? item?.unitPrice ?? 0;
      const unitSaving = origPrice - depr.depreciatedUnitPrice;
      const totalSaving = depr.maxDepreciatedQuantity * unitSaving;
      const discountPct = origPrice > 0 ? (unitSaving / origPrice) * 100 : 0;

      // Intestazione Formale
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(30, 41, 59);
      doc.text("VERBALE DI DEPREZZAMENTO E DETERMINAZIONE NUOVO PREZZO", pageWidth / 2, 22, { align: 'center' });
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text("Art. 114 D.Lgs. 36/2023 - Accettazione di lavorazioni/provviste con riduzione del prezzo", pageWidth / 2, 28, { align: 'center' });

      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.4);
      doc.line(15, 32, pageWidth - 15, 32);

      // Info Quadro
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.text("OGGETTO LAVORI:", 15, 39);
      doc.setFont('helvetica', 'normal');
      doc.text(projectName || "Lavori di Appalto", 55, 39);

      doc.setFont('helvetica', 'bold');
      doc.text("PROVVEDIMENTO RUP:", 15, 45);
      doc.setFont('helvetica', 'normal');
      doc.text(`Determina N. ${depr.determinaNumber} del ${format(parseISO(depr.determinaDate), 'dd/MM/yyyy')}`, 55, 45);

      doc.setFont('helvetica', 'bold');
      doc.text("IMPRESA APPALTATRICE:", 15, 51);
      doc.setFont('helvetica', 'normal');
      doc.text(localConfig.contractorName || "Impresa Appaltatrice", 55, 51);

      if ((doc as any).autoTable) {
        (doc as any).autoTable({
          startY: 56,
          margin: { left: 15, right: 15 },
          head: [['Voce di Computo', 'U.M.', 'Tariffa Contratto', 'Tariffa Deprezzata', 'Ribasso %', 'Q.tà Autorizzata', 'Economia Ente (€)']],
          body: [[
            `${formatCodeWithComputoIndex(depr.articleCode, item?.originalIndex)}\n${item?.description || ''}`,
            item?.unit || 'cad',
            currencyFormatter.format(origPrice),
            currencyFormatter.format(depr.depreciatedUnitPrice),
            `-${discountPct.toFixed(2)}%`,
            numberFormatter.format(depr.maxDepreciatedQuantity),
            currencyFormatter.format(totalSaving)
          ]],
          headStyles: { fillColor: [49, 46, 129], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
          bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59] },
          columnStyles: {
            0: { cellWidth: 70, halign: 'justify' },
            1: { halign: 'center', cellWidth: 12 },
            2: { halign: 'right', cellWidth: 22 },
            3: { halign: 'right', cellWidth: 22, fontStyle: 'bold', textColor: [180, 83, 9] },
            4: { halign: 'center', cellWidth: 18, fontStyle: 'bold', textColor: [185, 28, 28] },
            5: { halign: 'right', cellWidth: 18, fontStyle: 'bold' },
            6: { halign: 'right', cellWidth: 22, fontStyle: 'bold', textColor: [4, 120, 87] }
          }
        });

        const finalY = (doc as any).lastAutoTable.finalY || 100;

        // Motivazione RUP Box
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(203, 213, 225);
        doc.rect(15, finalY + 6, pageWidth - 30, 28, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(71, 85, 105);
        doc.text("MOTIVAZIONE TECNICA E GIURIDICA DEL RUP (Art. 114 D.Lgs. 36/2023):", 18, finalY + 12);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(30, 41, 59);
        const splitReason = doc.splitTextToSize(depr.reason, pageWidth - 36);
        doc.text(splitReason, 18, finalY + 17);

        // Stato di Contabilizzazione Box
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(15, 23, 42);
        doc.text("STATO ATTUALE DI CONTABILIZZAZIONE:", 15, finalY + 41);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(`- Quantità autorizzata con Determina RUP: ${numberFormatter.format(depr.maxDepreciatedQuantity)} ${item?.unit || ''}`, 20, finalY + 47);
        doc.text(`- Quantità già allibata a Registro Contabilità: ${numberFormatter.format(usedQty)} ${item?.unit || ''}`, 20, finalY + 52);
        doc.text(`- Quantità residua ancora applicabile: ${numberFormatter.format(remainingQty)} ${item?.unit || ''}`, 20, finalY + 57);

        // Signatures
        const sigY = finalY + 75;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text("L'Impresa Appaltatrice", 25, sigY);
        doc.text("Il Direttore dei Lavori", pageWidth / 2, sigY, { align: 'center' });
        doc.text("Il Responsabile Unico del Progetto", pageWidth - 25, sigY, { align: 'right' });

        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        doc.setTextColor(120);
        doc.text("(per presa visione ed accettazione)", 25, sigY + 4);

        doc.setDrawColor(150);
        doc.line(20, sigY + 18, 55, sigY + 18);
        doc.line(pageWidth / 2 - 20, sigY + 18, pageWidth / 2 + 20, sigY + 18);
        doc.line(pageWidth - 55, sigY + 18, pageWidth - 15, sigY + 18);
      }

      doc.save(`Determina_Deprezzamento_${depr.determinaNumber.replace(/[^a-z0-9]/gi, '_')}.pdf`);
    } catch (err) {
      console.error(err);
      alert("Errore nella generazione del verbale di deprezzamento.");
    }
  };

  const contentRef = useRef<HTMLDivElement>(null);
  const certificateRef = useRef<HTMLDivElement>(null);

  // Quadro economico del progetto (Totale Lavori di Computo vs Oneri Sicurezza)
  const projectTotals = useMemo(() => {
      let works = 0;
      let security = 0;
      documents.forEach(doc => {
          doc.workGroups.forEach(wg => {
              const val = wg.items.reduce((acc, i) => acc + (i.quantity * i.unitPrice), 0);
              if (wg.isSecurityCost) {
                  security += val;
              } else {
                  works += val;
              }
          });
      });
      return { works, security, total: works + security };
  }, [documents]);

  const boqTotals = useMemo(() => {
      const map = new Map<string, number>();
      documents.forEach(doc => {
          doc.workGroups.forEach(wg => {
              wg.items.forEach(item => {
                  const current = map.get(item.articleCode) || 0;
                  map.set(item.articleCode, current + item.quantity);
              });
          });
      });
      return map;
  }, [documents]);

  const { accountingRegistry, globalMeasurementMap } = useMemo(() => {
      let entries: AccountingEntry[] = [];
      let tempIndexCounter = 1;

      documents.forEach(doc => {
          if (doc.isFrozen) return; 
          doc.workGroups.forEach(group => {
              const isBody = group.accountingType === 'body';
              const isSecurity = group.isSecurityCost || false;

              if (isBody) {
                  const groupMeasurements = group.items.flatMap(item => (item.measurements || []).map(m => ({
                      ...m,
                      monetaryValue: m.quantity * item.unitPrice
                  })));

                  const byDate: Record<string, { totalValue: number, ids: string[], createdAt: number }> = {};
                  groupMeasurements.forEach((m, mIdx) => {
                      if (!byDate[m.date]) byDate[m.date] = { totalValue: 0, ids: [], createdAt: 0 };
                      byDate[m.date].totalValue += m.monetaryValue;
                      byDate[m.date].ids.push(m.id);
                      const ts = m.createdAt || (mIdx + 1);
                      if (ts > byDate[m.date].createdAt) byDate[m.date].createdAt = ts;
                  });

                  Object.entries(byDate).forEach(([date, data]) => {
                      const dailyPercentage = group.value > 0 ? data.totalValue / group.value : 0;

                      entries.push({
                          id: `${group.id}-${date}`, 
                          progressiveIndex: tempIndexCounter++, 
                          librettoPage: 1,
                          date: date,
                          articleCode: `A.CORPO.${group.id.substring(0,5)}`.toUpperCase(), 
                          description: group.name, 
                          measurementNote: 'Avanzamento a corpo calcolato su percentuale',
                          unit: '%',
                          quantity: dailyPercentage, 
                          unitPrice: group.value, 
                          debit: data.totalValue, 
                          progressive: 0,
                          groupName: group.name,
                          docName: doc.fileName,
                          isSecurityCost: isSecurity,
                          accountingType: 'body',
                          createdAt: data.createdAt
                      });
                  });

              } else {
                  group.items.forEach(item => {
                      if (item.measurements) {
                          item.measurements.forEach((m, mIdx) => {
                              const effectivePrice = m.appliedUnitPrice !== undefined ? m.appliedUnitPrice : item.unitPrice;
                              const debit = m.quantity * effectivePrice;

                              entries.push({
                                  id: m.id,
                                  progressiveIndex: tempIndexCounter++, 
                                  librettoPage: 1,
                                  date: m.date,
                                  articleCode: item.articleCode,
                                  originalIndex: item.originalIndex, 
                                  description: item.description,
                                  measurementNote: m.note,
                                  unit: item.unit,
                                  quantity: m.quantity,
                                  unitPrice: effectivePrice,
                                  debit: debit,
                                  progressive: 0, 
                                  groupName: group.name,
                                  docName: doc.fileName,
                                  factor: m.factor, length: m.length, width: m.width, height: m.height,
                                  isSecurityCost: isSecurity,
                                  accountingType: 'measure',
                                  createdAt: m.createdAt || (mIdx + 1),
                                  depreciationId: m.depreciationId,
                                  isDepreciated: m.isDepreciated
                              });
                          });
                      }
                  });
              }
          });
      });

      entries.sort((a, b) => { 
          const dateA = new Date(a.date).getTime(); 
          const dateB = new Date(b.date).getTime(); 
          if (dateA !== dateB) return dateA - dateB; 
          return (a.createdAt || 0) - (b.createdAt || 0);
      });

      const map = new Map<string, number>();
      let runningTotal = 0;

      // Calcolo esatto della pagina PDF del Libretto delle Misure per ogni numero d'ordine
      let exactPageByRowIndex: number[] = [];
      try {
          if (typeof jspdf !== 'undefined' && jspdf.jsPDF && entries.length > 0) {
              const tempDoc = new jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
              if ((tempDoc as any).autoTable) {
                  const tempColumns = [
                      { header: 'N. LB.', dataKey: 'idx' },
                      { header: 'Data', dataKey: 'date' },
                      { header: 'Codice', dataKey: 'code' },
                      { header: 'Descrizione e Note', dataKey: 'desc' },
                      { header: 'U.M.', dataKey: 'um' },
                      { header: 'Quantità', dataKey: 'qty' }
                  ];
                  const tempColumnStyles = {
                      idx: { halign: 'center', cellWidth: 18, fontStyle: 'bold' },
                      date: { halign: 'center', cellWidth: 22 },
                      code: { fontStyle: 'bold', cellWidth: 28 },
                      desc: { cellWidth: 80, halign: 'justify' },
                      um: { halign: 'center', cellWidth: 14 },
                      qty: { halign: 'right', cellWidth: 24 }
                  };
                  const tempRows = entries.map((e, i) => ({
                      idx: `N. LB. ${i + 1}`,
                      date: format(parseISO(e.date), 'dd/MM/yyyy'),
                      code: formatCodeWithComputoIndex(e.articleCode, e.originalIndex, e.accountingType),
                      desc: `${e.description}${e.measurementNote ? '\nNote: ' + e.measurementNote : ''}`,
                      um: e.unit,
                      qty: e.accountingType === 'body' ? percentFormatter.format(e.quantity) : numberFormatter.format(e.quantity)
                  }));
                  (tempDoc as any).autoTable({
                      columns: tempColumns,
                      body: tempRows,
                      startY: 32,
                      margin: { top: 32, bottom: 25, left: 12, right: 12 },
                      styles: { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak', font: 'helvetica' },
                      headStyles: { fillColor: [45, 55, 72], textColor: 255, fontStyle: 'bold', halign: 'center' },
                      columnStyles: tempColumnStyles
                  });
                  const autoTableRows = (tempDoc as any).lastAutoTable?.rows || [];
                  exactPageByRowIndex = autoTableRows.map((r: any) => r.pageNumber || 1);
              }
          }
      } catch (e) {
          // Fallback al calcolo geometrico in caso di assenza di jspdf
      }

      let currentLibrettoPage = 1;
      let currentPageHeightMm = 0;
      const MAX_LIBRETTO_PAGE_HEIGHT_MM = 220;

      const computedEntries = entries.map((entry, idx) => { 
          const actualIndex = idx + 1;
          map.set(entry.id, actualIndex);
          runningTotal += entry.debit; 

          const fullDescText = `${entry.description || ''}${entry.measurementNote ? '\nNote: ' + entry.measurementNote : ''}`;
          const estimatedLines = fullDescText
              .split('\n')
              .reduce((acc, line) => acc + Math.max(1, Math.ceil(line.length / 55)), 0);
          const estimatedRowHeightMm = Math.max(7.5, estimatedLines * 3.2 + 4.5);

          if (currentPageHeightMm + estimatedRowHeightMm > MAX_LIBRETTO_PAGE_HEIGHT_MM && currentPageHeightMm > 0) {
              currentLibrettoPage++;
              currentPageHeightMm = estimatedRowHeightMm;
          } else {
              currentPageHeightMm += estimatedRowHeightMm;
          }

          const finalPage = exactPageByRowIndex[idx] || currentLibrettoPage;

          return {
              ...entry,
              progressiveIndex: actualIndex,
              librettoPage: finalPage,
              progressive: runningTotal
          }; 
      });

      return { accountingRegistry: computedEntries, globalMeasurementMap: map };
  }, [documents]);

  const calculateTotalsAtDate = (targetDate: string) => {
      const relevantEntries = accountingRegistry.filter(entry => 
          entry.date.localeCompare(targetDate) <= 0
      );
      
      // Separazione entries per tipologia
      const securityEntries = relevantEntries.filter(e => e.isSecurityCost);
      const measureEntries = relevantEntries.filter(e => e.accountingType === 'measure' && !e.isSecurityCost);
      const bodyEntries = relevantEntries.filter(e => e.accountingType === 'body' && !e.isSecurityCost);
      
      // Totali per contabilità
      const security = round2(securityEntries.reduce((acc, curr) => acc + curr.debit, 0));
      const measureTotal = round2(measureEntries.reduce((acc, curr) => acc + curr.debit, 0));
      const bodyTotal = round2(bodyEntries.reduce((acc, curr) => acc + curr.debit, 0));
      
      // In contabilità la manodopera è trattata ordinariamente nei lavori
      // I lavori soggetti a ribasso sono la somma di Lavori a Misura e Lavori a Corpo
      const worksBaseTotal = round2(measureTotal + bodyTotal);
      const discount = round2(worksBaseTotal * (localConfig.discountPercent / 100));
      const netWorksAfterDiscount = round2(worksBaseTotal - discount);
      
      // Totale Netto Finale Pagamento SAL (Lavori al netto del ribasso + Oneri Sicurezza non soggetti a ribasso)
      const totalNet = round2(netWorksAfterDiscount + security);

      const bodyGroupsTotalValue = documents.flatMap(d => d.workGroups)
          .filter(g => g.accountingType === 'body' && !g.isSecurityCost)
          .reduce((acc, g) => acc + g.value, 0);
      const bodyPercentage = bodyGroupsTotalValue > 0 ? (bodyTotal / bodyGroupsTotalValue) * 100 : 0;

      return { 
          totalGross: round2(worksBaseTotal + security), 
          measureTotal, 
          bodyTotal, 
          bodyPercentage,
          security, 
          worksBase: worksBaseTotal, 
          discount, 
          netWorksAfterDiscount,
          totalNet,
          entries: relevantEntries
      };
  };

  const currentSalData = useMemo(() => calculateTotalsAtDate(salReferenceDate), [salReferenceDate, accountingRegistry, localConfig, documents]);
  const filteredRegistry = currentSalData.entries;

  const activeRegisterEntries = useMemo(() => {
      let running = 0;
      return filteredRegistry.map((entry, idx) => {
          running = round2(running + entry.debit);
          return {
              ...entry,
              registerOrderIndex: idx + 1,
              runningProgressive: running
          };
      });
  }, [filteredRegistry]);

  const salCumulativeValuesMap = useMemo(() => {
      const map = new Map<string, number>();
      sals.forEach(sal => {
          const totals = calculateTotalsAtDate(sal.date);
          map.set(sal.id, totals.totalNet); 
      });
      return map;
  }, [sals, accountingRegistry, localConfig, documents]);

  const previousSalObject = useMemo(() => {
      if (!activeSalId || sals.length === 0) return null;
      const sortedSals = [...sals].sort((a, b) => a.number - b.number);
      const activeIndex = sortedSals.findIndex(s => s.id === activeSalId);
      if (activeIndex > 0) return sortedSals[activeIndex - 1];
      return null;
  }, [activeSalId, sals]);

  const previousSalDate = useMemo(() => {
      if (!previousSalObject) return '0000-01-01';
      return previousSalObject.date;
  }, [previousSalObject]);

  const paymentCertData = useMemo(() => {
      const currentNet = currentSalData.totalNet;
      let previousNet = 0;
      if (previousSalObject) previousNet = salCumulativeValuesMap.get(previousSalObject.id) || 0;
      const rataAcconto = round2(currentNet - previousNet); 
      const retentionAmount = round2(rataAcconto * (localConfig.withholdingTaxPercent / 100));
      const advancePercent = localConfig.advancePaymentPercent || 0;
      const recoveryAmount = round2(rataAcconto * (advancePercent / 100));
      const taxableCertified = round2(rataAcconto - retentionAmount - recoveryAmount);
      const vatAmount = round2(taxableCertified * (localConfig.vatPercent / 100));
      const totalPayable = round2(taxableCertified + vatAmount);
      return { currentNet, previousNet, rataAcconto, retentionAmount, recoveryAmount, taxableCertified, vatAmount, totalPayable };
  }, [currentSalData, previousSalObject, salCumulativeValuesMap, localConfig]);

  const filteredLibretto = useMemo(() => {
      const runningQuantities = new Map<string, number>();
      // Libretto delle Misure Unico progressivo a tutto il SAL selezionato
      return accountingRegistry
        .filter(e => e.date.localeCompare(salReferenceDate) <= 0)
        .map(entry => {
          let currentTotal = 0;
          let estimatedTotal = 0;
          if (entry.accountingType === 'body') {
              currentTotal = (runningQuantities.get(entry.articleCode) || 0) + entry.quantity; 
              estimatedTotal = 1; 
          } else {
              currentTotal = (runningQuantities.get(entry.articleCode) || 0) + entry.quantity;
              estimatedTotal = boqTotals.get(entry.articleCode) || 0;
          }
          runningQuantities.set(entry.articleCode, currentTotal);
          return { ...entry, cumulativePercentage: estimatedTotal > 0 ? (currentTotal / estimatedTotal) * 100 : 0 };
        });
  }, [accountingRegistry, salReferenceDate, boqTotals]);

  const accountingSummary = useMemo(() => {
      const summaryMap = new Map<string, SummaryEntry>();
      const sortedSalsAsc = [...sals].sort((a, b) => a.number - b.number);
      const activeSalObj = sals.find(s => s.id === activeSalId);
      const currentSalNumber = activeSalObj?.number ?? (sortedSalsAsc.length > 0 ? sortedSalsAsc[sortedSalsAsc.length - 1].number : 1);

      // Popoliamo esclusivamente le voci effettivamente misurate e contabilizzate a libretto fino a salReferenceDate
      accountingRegistry
        .filter(e => e.date.localeCompare(salReferenceDate) <= 0)
        .forEach(entry => {
          if (!summaryMap.has(entry.articleCode)) {
              summaryMap.set(entry.articleCode, { 
                  articleCode: entry.articleCode, 
                  originalIndex: entry.originalIndex,
                  wbsName: entry.groupName, 
                  groupName: entry.groupName,
                  description: entry.accountingType === 'body' ? entry.groupName : entry.description, 
                  unit: entry.unit, 
                  unitPrice: entry.unitPrice, 
                  estimatedQuantity: entry.accountingType === 'body' ? 1 : (boqTotals.get(entry.articleCode) || 0), 
                  previousQuantity: 0,
                  previousAmount: 0,
                  currentQuantity: 0,
                  currentAmount: 0,
                  totalQuantity: 0, 
                  totalAmount: 0, 
                  progressPercent: 0, 
                  accountingType: entry.accountingType,
                  isSecurityCost: entry.isSecurityCost,
                  previousLines: [],
                  currentLines: [],
                  allLines: [],
                  residualQuantity: 0,
                  residualAmount: 0
              });
          }
          const current = summaryMap.get(entry.articleCode)!;
          const isCurrentPeriod = entry.date.localeCompare(previousSalDate) > 0;
          
          let salLabel: string | undefined = undefined;
          let isPreviousSal = false;

          if (currentSalNumber === 1) {
              salLabel = undefined;
              isPreviousSal = false;
          } else {
              if (!isCurrentPeriod) {
                  const matchingSal = sortedSalsAsc.find(s => entry.date.localeCompare(s.date) <= 0);
                  const salNum = matchingSal?.number || 1;
                  salLabel = `SAL ${salNum}`;
                  isPreviousSal = true;
              } else {
                  salLabel = undefined;
                  isPreviousSal = false;
              }
          }

          const lineAmount = round2(entry.quantity * entry.unitPrice);
          const lineItem: SummaryMeasurementLine = {
              id: entry.id,
              progressiveIndex: entry.progressiveIndex,
              librettoPage: entry.librettoPage,
              date: entry.date,
              salNumber: isPreviousSal ? sortedSalsAsc.find(s => entry.date.localeCompare(s.date) <= 0)?.number : undefined,
              salLabel,
              isPreviousSal,
              measurementNote: entry.measurementNote || entry.description,
              factor: entry.factor,
              length: entry.length,
              width: entry.width,
              height: entry.height,
              quantity: entry.quantity,
              unitPrice: entry.unitPrice,
              amount: lineAmount
          };

          if (isCurrentPeriod) {
              current.currentQuantity += entry.quantity;
              current.currentAmount = round2(current.currentAmount + lineAmount);
              current.currentLines.push(lineItem);
          } else {
              current.previousQuantity += entry.quantity;
              current.previousAmount = round2(current.previousAmount + lineAmount);
              current.previousLines.push(lineItem);
          }
          current.allLines.push(lineItem);
          
          current.totalQuantity = current.previousQuantity + current.currentQuantity;
          current.totalAmount = round2(current.previousAmount + current.currentAmount);
      });

      return Array.from(summaryMap.values()).map(item => {
          const estimated = item.accountingType === 'body' ? 1 : (boqTotals.get(item.articleCode) || item.estimatedQuantity || 0);
          const progressPercent = estimated > 0 ? (item.totalQuantity / estimated) * 100 : 0;
          const residualQuantity = Math.max(0, Math.round((estimated - item.totalQuantity) * 1000) / 1000);
          const residualAmount = Math.max(0, Math.round((estimated * item.unitPrice - item.totalAmount) * 100) / 100);
          return {
              ...item,
              estimatedQuantity: estimated,
              progressPercent,
              residualQuantity,
              residualAmount
          };
      }).filter(item => item.allLines.length > 0).sort((a, b) => {
          if (a.originalIndex !== undefined && b.originalIndex !== undefined && a.originalIndex !== b.originalIndex) {
              return a.originalIndex - b.originalIndex;
          }
          return a.articleCode.localeCompare(b.articleCode);
      });
  }, [accountingRegistry, salReferenceDate, previousSalDate, boqTotals, sals, activeSalId]);

  const applyFilters = (entry: any) => {
      const formattedCode = formatCodeWithComputoIndex(entry.articleCode, entry.originalIndex, entry.accountingType);
      const codeMatch = formattedCode.toLowerCase().includes(filters.code.toLowerCase()) || entry.articleCode.toLowerCase().includes(filters.code.toLowerCase());
      const wbsMatch = (entry.groupName || entry.wbsName).toLowerCase().includes(filters.wbs.toLowerCase());
      const descMatch = (entry.description + (entry.measurementNote || '')).toLowerCase().includes(filters.description.toLowerCase());
      let dateMatch = true;
      if (entry.date) {
          const d = parseISO(entry.date);
          if (filters.dateFrom && d < startOfDay(parseISO(filters.dateFrom))) dateMatch = false;
          if (filters.dateTo && d > endOfDay(parseISO(filters.dateTo))) dateMatch = false;
      }
      return codeMatch && wbsMatch && descMatch && dateMatch;
  };

  const handleAddNewSal = () => {
      const nextNumber = sals.length > 0 ? Math.max(...sals.map(s => s.number)) + 1 : 1;
      const newSal: SalEntry = {
          id: crypto.randomUUID(),
          number: nextNumber,
          date: format(new Date(), 'yyyy-MM-dd'),
          description: `SAL N. ${nextNumber} a tutto il ${format(new Date(), 'dd/MM/yyyy')}`,
          totalAmount: 0, 
          isLocked: false
      };
      onUpdateSals([...sals, newSal]);
      setActiveSalId(newSal.id);
  };

  const handleDeleteSal = (id: string) => {
      const sorted = [...sals].sort((a,b) => a.number - b.number);
      const isLast = sorted[sorted.length - 1].id === id;
      if (!isLast) { alert("Puoi eliminare solo l'ultimo SAL della serie cronologica."); return; }
      if (confirm("Eliminare definitivamente questo SAL?")) {
          const updated = sals.filter(s => s.id !== id);
          onUpdateSals(updated);
          if (updated.length > 0) setActiveSalId(updated[updated.length - 1].id); else setActiveSalId(null);
      }
  };

  const handleUpdateSalDate = (id: string, newDate: string) => {
      onUpdateSals(sals.map(s => s.id === id ? { ...s, date: newDate, description: `SAL N. ${s.number} a tutto il ${format(parseISO(newDate), 'dd/MM/yyyy')}` } : s));
  };

  const handleToggleSalLock = (id: string) => {
      onUpdateSals(sals.map(s => s.id === id ? { ...s, isLocked: !s.isLocked } : s));
  };

  const generateAccountingPdf = (type: 'libretto' | 'register' | 'summary') => {
    setIsGeneratingPdf(true);
    try {
      const orientation = type === 'register' ? 'landscape' : 'portrait';
      const doc = new jspdf.jsPDF({ orientation, unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Cover Page
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.text(projectName || 'Progetto', pageWidth / 2, 55, { align: 'center' });
      
      doc.setFontSize(16);
      const titles = {
        libretto: 'Libretto delle Misure',
        register: 'Registro di Contabilità',
        summary: 'Sommario del Registro'
      };
      doc.text(titles[type], pageWidth / 2, 75, { align: 'center' });
      
      const sal = sals.find(s => s.id === activeSalId);
      if (sal) {
        doc.setFontSize(13);
        doc.setFont('helvetica', 'normal');
        doc.text(`Stato Avanzamento Lavori N. ${sal.number}`, pageWidth / 2, 95, { align: 'center' });
        doc.text(`Situazione contabile a tutto il ${format(parseISO(sal.date), 'dd/MM/yyyy')}`, pageWidth / 2, 105, { align: 'center' });
      }

      if (localConfig.contractorName) {
        doc.setFontSize(11);
        doc.text(`Impresa Appaltatrice: ${localConfig.contractorName}`, pageWidth / 2, 125, { align: 'center' });
      }
      
      if (localConfig.contractCode) {
        doc.text(`CIG/CUP: ${localConfig.contractCode}`, pageWidth / 2, 135, { align: 'center' });
      }

      doc.setFontSize(9);
      doc.setTextColor(120);
      doc.text("Generato con Chronos AI - D.Lgs. 36/2023", pageWidth / 2, pageHeight - 18, { align: 'center' });

      doc.addPage();

      let columns: any[] = [];
      let rows: any[] = [];
      let columnStyles: any = {};
      let grandTotal = 0;

      if (type === 'libretto') {
        columns = [
          { header: 'N. LB.', dataKey: 'idx' },
          { header: 'Data', dataKey: 'date' },
          { header: 'Codice', dataKey: 'code' },
          { header: 'Descrizione e Note', dataKey: 'desc' },
          { header: 'U.M.', dataKey: 'um' },
          { header: 'Quantità', dataKey: 'qty' }
        ];
        columnStyles = {
          idx: { halign: 'center', cellWidth: 18, fontStyle: 'bold' },
          date: { halign: 'center', cellWidth: 22 },
          code: { fontStyle: 'bold', cellWidth: 28 },
          desc: { cellWidth: 80, halign: 'justify' },
          um: { halign: 'center', cellWidth: 14 },
          qty: { halign: 'right', cellWidth: 24 }
        };
        rows = filteredLibretto.filter(applyFilters).map(e => ({
          idx: `N. LB. ${e.progressiveIndex}`,
          date: format(parseISO(e.date), 'dd/MM/yyyy'),
          code: formatCodeWithComputoIndex(e.articleCode, e.originalIndex, e.accountingType),
          desc: `${e.description}${e.measurementNote ? '\nNote: ' + e.measurementNote : ''}`,
          um: e.unit,
          qty: e.accountingType === 'body' ? percentFormatter.format(e.quantity) : numberFormatter.format(e.quantity),
          rawCumulativeAmount: 0
        }));
      } else if (type === 'register') {
        columns = [
          { header: 'N. RG.', dataKey: 'regIdx' },
          { header: 'Data', dataKey: 'date' },
          { header: 'Rif. (N. LB. / Pag.)', dataKey: 'libIdx' },
          { header: 'Codice Articolo', dataKey: 'code' },
          { header: 'Designazione dei Lavori e delle Provviste', dataKey: 'desc' },
          { header: 'U.M.', dataKey: 'um' },
          { header: 'Quantità', dataKey: 'qty' },
          { header: 'Prezzo Unit.', dataKey: 'price' },
          { header: 'Importo Debito', dataKey: 'amount' },
          { header: 'Totale Prog.', dataKey: 'prog' }
        ];
        columnStyles = {
          regIdx: { halign: 'center', cellWidth: 16, fontStyle: 'bold' },
          date: { halign: 'center', cellWidth: 20 },
          libIdx: { halign: 'center', cellWidth: 24, fontStyle: 'bold' },
          code: { fontStyle: 'bold', cellWidth: 28 },
          desc: { cellWidth: 81, halign: 'justify' },
          um: { halign: 'center', cellWidth: 12 },
          qty: { halign: 'right', cellWidth: 20 },
          price: { halign: 'right', cellWidth: 24 },
          amount: { halign: 'right', cellWidth: 24, fontStyle: 'bold' },
          prog: { halign: 'right', cellWidth: 24, fontStyle: 'bold' }
        };
        const visibleEntries = activeRegisterEntries.filter(applyFilters);
        grandTotal = visibleEntries.length > 0 ? visibleEntries[visibleEntries.length - 1].runningProgressive : 0;

        rows = visibleEntries.map(e => {
          const fmtQty = e.accountingType === 'body' ? percentFormatter.format(e.quantity) : numberFormatter.format(e.quantity);
          const dims = (e.accountingType !== 'body' && (e.factor !== undefined || e.length !== undefined || e.width !== undefined || e.height !== undefined))
            ? `\n([${[
                e.factor !== undefined ? `F:${numberFormatter.format(e.factor)}` : null,
                e.length !== undefined ? `L:${numberFormatter.format(e.length)}` : null,
                e.width !== undefined ? `l:${numberFormatter.format(e.width)}` : null,
                e.height !== undefined ? `H:${numberFormatter.format(e.height)}` : null
              ].filter(Boolean).join(' × ')}])`
            : '';

          return {
            regIdx: `N. RG. ${e.registerOrderIndex}`,
            date: format(parseISO(e.date), 'dd/MM/yyyy'),
            libIdx: formatLibrettoRef(e.progressiveIndex, e.librettoPage, true),
            code: formatCodeWithComputoIndex(e.articleCode, e.originalIndex, e.accountingType),
            desc: `${e.description}${e.measurementNote ? '\nNote: ' + e.measurementNote : ''}${dims}`,
            um: e.unit,
            qty: fmtQty,
            price: currencyFormatter.format(e.unitPrice),
            amount: currencyFormatter.format(e.debit),
            prog: currencyFormatter.format(e.runningProgressive),
            rawCumulativeAmount: e.runningProgressive
          };
        });
      } else if (type === 'summary') {
        columns = [
          { header: 'N. SM. / Rif. (N. LB.-Pag.)', dataKey: 'idx' },
          { header: 'Data / WBS', dataKey: 'date' },
          { header: 'Codice Articolo / Designazione Lavori', dataKey: 'desc' },
          { header: 'U.M.', dataKey: 'um' },
          { header: 'Quantità', dataKey: 'qty' },
          { header: 'Prezzo Unit.', dataKey: 'price' },
          { header: 'Importo Tot.', dataKey: 'amount' }
        ];
        columnStyles = {
          idx: { halign: 'center', cellWidth: 24, fontStyle: 'bold' },
          date: { halign: 'center', cellWidth: 22 },
          desc: { cellWidth: 66, halign: 'justify' },
          um: { halign: 'center', cellWidth: 12 },
          qty: { halign: 'right', cellWidth: 18 },
          price: { halign: 'right', cellWidth: 20 },
          amount: { halign: 'right', cellWidth: 24, fontStyle: 'bold' }
        };

        const visibleItems = accountingSummary.filter(applyFilters);
        let runningSum = 0;
        rows = [];

        visibleItems.forEach((item, artIdx) => {
          const fmtQty = (q: number) => item.accountingType === 'body' ? percentFormatter.format(q) : numberFormatter.format(q);
          const allLines = item.allLines || [...item.previousLines, ...item.currentLines];
          const formattedItemCode = formatCodeWithComputoIndex(item.articleCode, item.originalIndex, item.accountingType);

          if (summaryMode === 'analytical') {
            // Riga Intestazione Articolo (senza dati ridondanti a destra, riportati nelle righe sottostanti e nel SOMMANO)
            rows.push({
              idx: `N. SM. ${artIdx + 1}`,
              date: item.wbsName,
              desc: `${formattedItemCode}\n${item.description}`,
              um: '',
              qty: '',
              price: '',
              amount: '',
              rawCumulativeAmount: runningSum
            });

            // Righe Misure associate
            allLines.forEach(line => {
              const dims = (item.accountingType !== 'body' && (line.factor !== undefined || line.length !== undefined || line.width !== undefined || line.height !== undefined))
                ? ` ([${[
                    line.factor !== undefined ? `F:${numberFormatter.format(line.factor)}` : null,
                    line.length !== undefined ? `L:${numberFormatter.format(line.length)}` : null,
                    line.width !== undefined ? `l:${numberFormatter.format(line.width)}` : null,
                    line.height !== undefined ? `H:${numberFormatter.format(line.height)}` : null
                  ].filter(Boolean).join(' × ')}])`
                : '';

              rows.push({
                idx: formatLibrettoRef(line.progressiveIndex, line.librettoPage, true),
                date: format(parseISO(line.date), 'dd/MM/yyyy'),
                desc: `   ${line.measurementNote}${dims}`,
                um: item.unit,
                qty: fmtQty(line.quantity),
                price: '',
                amount: '',
                rawCumulativeAmount: runningSum
              });
            });

            // Riga SOMMANO
            runningSum = round2(runningSum + item.totalAmount);
            rows.push({
              idx: '',
              date: '',
              desc: `SOMMANO (${formattedItemCode})`,
              um: item.unit,
              qty: fmtQty(item.totalQuantity),
              price: currencyFormatter.format(item.unitPrice),
              amount: currencyFormatter.format(item.totalAmount),
              rawCumulativeAmount: runningSum
            });
          } else {
            // Sintetico
            runningSum = round2(runningSum + item.totalAmount);
            const libRefs = allLines.map(l => formatLibrettoRef(l.progressiveIndex, l.librettoPage, false)).join(', ');
            rows.push({
              idx: `N. SM. ${artIdx + 1}`,
              date: libRefs,
              desc: `[${item.wbsName}] ${formattedItemCode} - ${item.description}`,
              um: item.unit,
              qty: fmtQty(item.totalQuantity),
              price: currencyFormatter.format(item.unitPrice),
              amount: currencyFormatter.format(item.totalAmount),
              rawCumulativeAmount: runningSum
            });
          }
        });
        grandTotal = runningSum;
      }

      // AutoTable render with margins dedicated for Riporto / A Riporto
      (doc as any).autoTable({
        columns: columns,
        body: rows,
        startY: 32,
        margin: { top: 32, bottom: 25, left: 12, right: 12 },
        styles: { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak', font: 'helvetica' },
        headStyles: { fillColor: [45, 55, 72], textColor: 255, fontStyle: 'bold', halign: 'center' },
        columnStyles: columnStyles,
        alternateRowStyles: { fillColor: [248, 250, 252] },
        didDrawPage: (data: any) => {
          // Intestazione in cima ad ogni pagina
          doc.setFontSize(8.5);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(40);
          doc.text(`${projectName || 'Progetto'}`, 12, 14);
          doc.setFont('helvetica', 'normal');
          doc.text(`${titles[type]} - Situazione al ${format(parseISO(salReferenceDate), 'dd/MM/yyyy')} (SAL N. ${sal?.number || 'Bozza'})`, 12, 19);
          
          doc.setDrawColor(200, 200, 200);
          doc.setLineWidth(0.4);
          doc.line(12, 21.5, pageWidth - 12, 21.5);

          // Data stampa in fondo alla pagina
          doc.setFontSize(7.5);
          doc.setTextColor(120);
          doc.text(`Data stampa: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 12, pageHeight - 8);
          doc.text(`Doc: ${titles[type]}`, pageWidth / 2, pageHeight - 8, { align: 'center' });
        }
      });

      // Post-Processing: Riporto e A Riporto pagina per pagina
      const totalDocPages = (doc as any).internal.getNumberOfPages();
      const lastTable = (doc as any).lastAutoTable;
      const tablePagesCount = lastTable ? lastTable.pageCount : (totalDocPages - 1);

      const getPageCumulative = (tablePageNum: number) => {
        const pageRows = (lastTable?.rows || []).filter((r: any) => r.pageNumber === tablePageNum);
        const rev = [...pageRows].reverse();
        const found = rev.find((r: any) => r.raw && typeof r.raw.rawCumulativeAmount === 'number');
        return found ? found.raw.rawCumulativeAmount : grandTotal;
      };

      for (let p = 1; p <= tablePagesCount; p++) {
        const docPage = p + 1; // pagina 1 è la copertina
        if (docPage > totalDocPages) break;
        doc.setPage(docPage);

        if (tablePagesCount > 1) {
          // RIPORTO a inizio pagina (dalla seconda pagina del documento)
          if (p > 1) {
            const prevCum = getPageCumulative(p - 1);
            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(203, 213, 225);
            doc.setLineWidth(0.3);
            doc.rect(12, 23.5, pageWidth - 24, 6.5, 'FD');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(71, 85, 105);
            doc.text('RIPORTO DALLA PAGINA PRECEDENTE', 16, 27.8);

            doc.setFontSize(8.5);
            doc.setTextColor(15, 23, 42);
            doc.text(currencyFormatter.format(prevCum), pageWidth - 16, 27.8, { align: 'right' });
          }

          // A RIPORTO a fine pagina (fino alla penultima pagina)
          if (p < tablePagesCount) {
            const currCum = getPageCumulative(p);
            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(203, 213, 225);
            doc.setLineWidth(0.3);
            doc.rect(12, pageHeight - 23.5, pageWidth - 24, 6.5, 'FD');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(71, 85, 105);
            doc.text('A RIPORTO ALLA PAGINA SUCCESSIVA', 16, pageHeight - 19.2);

            doc.setFontSize(8.5);
            doc.setTextColor(15, 23, 42);
            doc.text(currencyFormatter.format(currCum), pageWidth - 16, pageHeight - 19.2, { align: 'right' });
          }
        }

        // Ultima pagina: TOTALE PROGRESSIVO GENERALE
        if (p === tablePagesCount && grandTotal > 0) {
          doc.setFillColor(238, 242, 255);
          doc.setDrawColor(99, 102, 241);
          doc.setLineWidth(0.4);
          doc.rect(12, pageHeight - 23.5, pageWidth - 24, 7, 'FD');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(8.5);
          doc.setTextColor(49, 46, 129);
          doc.text(`TOTALE PROGRESSIVO GENERALE A TUTTO IL SAL N. ${sal?.number || 'CORRENTE'}`, 16, pageHeight - 19);

          doc.setFontSize(9.5);
          doc.text(currencyFormatter.format(grandTotal), pageWidth - 16, pageHeight - 19, { align: 'right' });
        }

        // Paginazione a fondo pagina (corrispondenza esatta Pagina / Numero d'Ordine)
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(30, 41, 59);
        doc.text(`Pag. ${p} di ${tablePagesCount}`, pageWidth - 12, pageHeight - 8, { align: 'right' });
      }

      doc.save(`${projectName?.replace(/[^a-z0-9]/gi, '_') || 'document'}_${titles[type].replace(/[^a-z0-9]/gi, '_')}.pdf`);
    } catch (err) {
      console.error(err);
      alert("Errore durante la generazione del PDF professionale.");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const generatePdfWithCover = async (title: string, contentElement: HTMLElement) => {
    setIsGeneratingPdf(true);
    let originalOverflow = ''; // Declare outside try block
    try {
      originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'visible';

      const canvas = await html2canvas(contentElement, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');

      const pdf = new jspdf.jsPDF({ orientation: 'portrait', unit: 'px', format: 'a4' });
      const imgWidth = pdf.internal.pageSize.getWidth();
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      // Add Cover Page
      pdf.setFontSize(24);
      pdf.text(title, pdf.internal.pageSize.getWidth() / 2, pdf.internal.pageSize.getHeight() / 2, { align: 'center' });
      pdf.addPage();

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdf.internal.pageSize.getHeight();

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pdf.internal.pageSize.getHeight();
      }

      pdf.save(`${projectName?.replace(/[^a-z0-9]/gi, '_') || 'document'}_${title.replace(/[^a-z0-9]/gi, '_')}.pdf`);
    } catch (error) {
      console.error("Errore durante la generazione del PDF:", error);
      alert("Errore durante la generazione del PDF.");
    } finally {
      document.body.style.overflow = originalOverflow;
      setIsGeneratingPdf(false);
    }
  };

  const tabMeta: Record<AccountingTab, { title: string; subtitle: string; badge: string }> = {
      libretto: {
          title: 'Libretto delle Misure',
          subtitle: `Periodo: ${previousSalObject ? `dal ${format(parseISO(previousSalDate), 'dd/MM/yyyy')}` : "dall'inizio lavori"} al ${format(parseISO(salReferenceDate), 'dd/MM/yyyy')}`,
          badge: 'D.Lgs 36/2023 - Art. 114'
      },
      register: {
          title: 'Registro di Contabilità',
          subtitle: `Situazione progressiva a tutto il ${format(parseISO(salReferenceDate), 'dd/MM/yyyy')} (SAL N. ${sals.find(s => s.id === activeSalId)?.number || 'Bozza'})`,
          badge: 'Documento Fiscale - Registro Progressivo'
      },
      summary: {
          title: 'Sommario del Registro di Contabilità',
          subtitle: `Riepilogo progressivo per articolo a tutto il SAL N. ${sals.find(s => s.id === activeSalId)?.number || 'Bozza'} (${format(parseISO(salReferenceDate), 'dd/MM/yyyy')})`,
          badge: 'Sommario Progressivo'
      },
      sal_technical: {
          title: 'Stato Avanzamento Lavori (Riepilogo)',
          subtitle: activeSalId ? `SAL N. ${sals.find(s => s.id === activeSalId)?.number} al ${format(parseISO(salReferenceDate), 'dd/MM/yyyy')}` : 'Visualizzazione completa',
          badge: 'Quadro Tecnico Contabile'
      },
      payment_cert: {
          title: 'Certificato di Pagamento',
          subtitle: activeSalId ? `Rata di Acconto N. ${sals.find(s => s.id === activeSalId)?.number} al ${format(parseISO(salReferenceDate), 'dd/MM/yyyy')}` : 'Bozza Certificato',
          badge: 'Liquidazione Rata'
      },
      depreciation: {
          title: 'Deprezzamento di Prezzo (Determina del RUP)',
          subtitle: 'Atti autorizzativi di riduzione prezzi e gestione quote ex art. 114 D.Lgs. 36/2023',
          badge: 'Atti Amministrativi RUP'
      },
      settings: {
          title: 'Impostazioni Contratto & Gestione SAL',
          subtitle: activeSalId ? `SAL attivo: N. ${sals.find(s => s.id === activeSalId)?.number} (${format(parseISO(salReferenceDate), 'dd/MM/yyyy')})` : 'Configurazione parametri contrattuali',
          badge: 'Configurazione Contabile'
      }
  };

  const currentMeta = tabMeta[activeTab];

  return (
    <div className="h-full flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Barra superiore compatta unificata (senza fascia menu contabilità) per massimizzare lo spazio verticale */}
        <div className="flex flex-wrap justify-between items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/90 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
                <h2 className="text-sm md:text-base font-black text-gray-800 dark:text-white uppercase tracking-tight truncate">
                    {currentMeta.title}
                </h2>
                <span className="hidden sm:inline-block text-gray-300 dark:text-gray-600">|</span>
                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 truncate">
                    {currentMeta.subtitle}
                </span>
                <span className="hidden xl:inline-block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase bg-gray-200/70 dark:bg-gray-700 px-2 py-0.5 rounded">
                    {currentMeta.badge}
                </span>
            </div>
            
            <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">SAL:</span>
                <select 
                    value={activeSalId || ''} 
                    onChange={e => setActiveSalId(e.target.value || null)}
                    className="py-1 px-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-xs font-bold text-indigo-700 dark:text-indigo-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                    {sals.length === 0 && <option value="">-- Nessun SAL --</option>}
                    {[...sals].sort((a,b) => b.number - a.number).map(sal => (
                        <option key={sal.id} value={sal.id}>
                            SAL N. {sal.number} ({format(parseISO(sal.date), 'dd/MM/yy')}) {sal.isLocked ? '🔒' : ''}
                        </option>
                    ))}
                </select>
                <button
                    onClick={handleAddNewSal}
                    className="px-2 py-1 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 rounded-md hover:bg-emerald-200 text-xs font-bold flex items-center gap-1 transition-colors"
                    title="Crea Nuovo SAL"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                    <span className="hidden md:inline">Nuovo SAL</span>
                </button>
                {['libretto', 'register', 'summary', 'sal_technical', 'payment_cert'].includes(activeTab) && (
                    <button 
                        onClick={() => { 
                            if (activeTab === 'sal_technical' && certificateRef.current) generatePdfWithCover('Stato Avanzamento Lavori', certificateRef.current); 
                            else if (activeTab === 'payment_cert' && certificateRef.current) generatePdfWithCover('Certificato di Pagamento', certificateRef.current); 
                            else if (['libretto', 'register', 'summary'].includes(activeTab)) generateAccountingPdf(activeTab as any);
                        }} 
                        disabled={isGeneratingPdf} 
                        className="bg-indigo-600 text-white px-2.5 py-1 rounded-md text-xs font-bold shadow-xs hover:bg-indigo-700 disabled:bg-gray-400 flex items-center gap-1.5 transition-colors"
                    >
                        {isGeneratingPdf ? 'Generazione...' : 'Scarica PDF'} 
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    </button>
                )}
            </div>
        </div>

        <div className="flex-grow bg-white dark:bg-gray-800 overflow-hidden flex flex-col relative min-h-0">
            {activeTab === 'settings' && (
                <div className="p-4 md:p-6 max-w-6xl mx-auto w-full overflow-y-auto flex-grow">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-gray-50 dark:bg-gray-700/30 p-5 rounded-xl border border-gray-200 dark:border-gray-600">
                            <h3 className="text-base font-bold text-gray-800 dark:text-gray-200 mb-4 border-b pb-2 dark:border-gray-600 flex items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2-2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                                Dati Generali Contratto
                            </h3>
                            <div className="space-y-4">
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Impresa Appaltatrice</label><input type="text" value={localConfig.contractorName || ''} onChange={e => setLocalConfig({...localConfig, contractorName: e.target.value})} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 dark:text-white" /></div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">CIG/CUP</label><input type="text" value={localConfig.contractCode || ''} onChange={e => setLocalConfig({...localConfig, contractCode: e.target.value})} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 dark:text-white" /></div>
                                    <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Data Contratto</label><EuropeanDateInput value={localConfig.contractDate || ''} onChange={val => setLocalConfig({...localConfig, contractDate: val})} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 dark:text-white" /></div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-gray-50 dark:bg-gray-700/30 p-5 rounded-xl border border-gray-200 dark:border-gray-600">
                            <h3 className="text-base font-bold text-gray-800 dark:text-gray-200 mb-4 border-b pb-2 dark:border-gray-600 flex items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v.01" /></svg>
                                Parametri Economici Contratto
                            </h3>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Ribasso d'Asta (%)</label><input type="number" step="0.01" value={localConfig.discountPercent} onChange={e => setLocalConfig({...localConfig, discountPercent: parseFloat(e.target.value) || 0})} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 text-right font-semibold" /></div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Ritenuta Garanzia (%)</label><input type="number" step="0.1" value={localConfig.withholdingTaxPercent} onChange={e => setLocalConfig({...localConfig, withholdingTaxPercent: parseFloat(e.target.value) || 0})} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 text-right font-semibold" /></div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Recupero Anticipazione (%)</label><input type="number" step="0.1" value={localConfig.advancePaymentPercent ?? 20} onChange={e => setLocalConfig({...localConfig, advancePaymentPercent: parseFloat(e.target.value) || 0})} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 text-right font-semibold" /></div>
                                <div><label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Aliquota I.V.A. (%)</label><input type="number" step="1" value={localConfig.vatPercent} onChange={e => setLocalConfig({...localConfig, vatPercent: parseFloat(e.target.value) || 0})} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 text-right font-semibold" /></div>
                            </div>

                            <div className="mt-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600">
                                <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Quadro Economico di Progetto</p>
                                <div className="space-y-1.5 text-xs">
                                    <div className="flex justify-between">
                                        <span className="text-gray-600 dark:text-gray-300">Totale Lavori di Computo:</span>
                                        <span className="font-bold text-gray-900 dark:text-white">{currencyFormatter.format(projectTotals.works)}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600 dark:text-gray-300">Oneri Sicurezza (non soggetti a ribasso):</span>
                                        <span className="font-bold text-orange-600">{currencyFormatter.format(projectTotals.security)}</span>
                                    </div>
                                    <div className="flex justify-between pt-1 border-t border-gray-200 dark:border-gray-700 font-bold">
                                        <span className="text-gray-800 dark:text-gray-200">Importo Complessivo Appalto:</span>
                                        <span className="text-indigo-600 dark:text-indigo-400">{currencyFormatter.format(projectTotals.total)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'sal_technical' && (
                <div className="flex-grow overflow-auto bg-gray-100 dark:bg-gray-900 p-3 md:p-5 flex justify-center min-h-0">
                    <div ref={certificateRef} className="bg-white text-gray-900 w-[210mm] min-h-[297mm] p-[15mm] shadow-2xl text-[12px] relative h-fit" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
                        <div className="text-center mb-6 border-b-2 border-black pb-2"><h1 className="text-xl font-bold uppercase tracking-widest mb-1">Stato Avanzamento Lavori</h1><h2 className="text-lg">Riepilogo Tecnico Contabile N. {sals.find(s => s.id === activeSalId)?.number || '(Bozza)'}</h2></div>
                        <div className="grid grid-cols-2 gap-4 mb-6 text-[12px]"><div><p className="font-bold uppercase mb-1">Lavori</p><p className="border-b border-gray-300 pb-1 mb-2">{projectName}</p></div><div><p className="font-bold uppercase mb-1">Data</p><p className="border-b border-gray-300 pb-1 mb-2">{format(parseISO(salReferenceDate), 'dd/MM/yyyy')}</p></div></div>
                        
                        <table className="w-full mb-6 border-collapse border border-black text-[12px]">
                            <thead><tr className="bg-gray-200 uppercase"><th className="border border-black p-1.5 text-left font-bold">Descrizione</th><th className="border border-black p-1.5 text-right w-28 font-bold">Parziali/Calcoli</th><th className="border border-black p-1.5 text-right w-28 font-bold">Totali/Netti</th></tr></thead>
                            <tbody>
                                <tr><td className="border border-black p-1.5 font-bold bg-gray-100" colSpan={3}>A) LAVORI A MISURA</td></tr>
                                <tr><td className="border border-black p-1.5 pl-4">Totale Lavori a Misura eseguiti (a tariffa contrattuale)</td><td className="border border-black p-1.5 text-right font-medium">{currencyFormatter.format(currentSalData.measureTotal)}</td><td className="border border-black p-1.5 text-right font-bold bg-gray-50">{currencyFormatter.format(currentSalData.measureTotal)}</td></tr>
                                
                                <tr><td className="border border-black p-1.5 font-bold bg-gray-100" colSpan={3}>B) LAVORI A CORPO</td></tr>
                                <tr><td className="border border-black p-1.5 pl-4">Totale Lavori a Corpo maturati ({numberFormatter.format(currentSalData.bodyPercentage)}% su WBS a corpo)</td><td className="border border-black p-1.5 text-right font-medium">{currencyFormatter.format(currentSalData.bodyTotal)}</td><td className="border border-black p-1.5 text-right font-bold bg-gray-50">{currencyFormatter.format(currentSalData.bodyTotal)}</td></tr>

                                <tr><td className="border border-black p-1.5 font-bold bg-gray-100" colSpan={3}>C) ONERI DELLA SICUREZZA</td></tr>
                                <tr><td className="border border-black p-1.5 pl-4">Totale Oneri Sicurezza maturati (non soggetti a ribasso d'asta)</td><td className="border border-black p-1.5 bg-gray-50"></td><td className="border border-black p-1.5 text-right font-bold text-orange-700 bg-orange-50">{currencyFormatter.format(currentSalData.security)}</td></tr>
                                
                                <tr><td className="border border-black p-1.5 font-bold bg-gray-100" colSpan={3}>D) RIEPILOGO GENERALE E APPLICAZIONE DEL RIBASSO</td></tr>
                                <tr><td className="border border-black p-1.5 pl-4 font-semibold">Sommano Lavori soggetti a ribasso d'asta (A + B)</td><td className="border border-black p-1.5 text-right font-bold">{currencyFormatter.format(currentSalData.worksBase)}</td><td className="border border-black p-1.5 bg-gray-50"></td></tr>
                                <tr><td className="border border-black p-1.5 pl-6 italic">- Ribasso d'Asta contrattuale del {localConfig.discountPercent}%</td><td className="border border-black p-1.5 text-right text-red-600 font-medium">- {currencyFormatter.format(currentSalData.discount)}</td><td className="border border-black p-1.5 bg-gray-50"></td></tr>
                                <tr className="font-bold bg-blue-50/50"><td className="border border-black p-1.5 pl-4 uppercase">= Importo Netto Lavori (A + B al netto del ribasso)</td><td className="border border-black p-1.5 text-right font-bold text-blue-800">{currencyFormatter.format(currentSalData.netWorksAfterDiscount)}</td><td className="border border-black p-1.5 text-right font-bold text-blue-900 bg-blue-50">{currencyFormatter.format(currentSalData.netWorksAfterDiscount)}</td></tr>
                                <tr><td className="border border-black p-1.5 pl-4">+ Oneri di Sicurezza (C, non soggetti a ribasso)</td><td className="border border-black p-1.5 text-right">{currencyFormatter.format(currentSalData.security)}</td><td className="border border-black p-1.5 text-right font-bold text-orange-700 bg-orange-50">{currencyFormatter.format(currentSalData.security)}</td></tr>

                                <tr><td className="border border-black p-1.5 font-bold bg-gray-100" colSpan={3}>E) TOTALE GENERALE NETTO</td></tr>
                                <tr className="font-bold text-sm"><td className="border border-black p-2 uppercase">TOTALE NETTO SAL CUMULATIVO (Lavori netti + Oneri Sicurezza)</td><td className="border border-black p-2 bg-gray-50"></td><td className="border border-black p-2 text-right bg-green-100 border-green-600 border-2 text-green-900 text-sm font-black">{currencyFormatter.format(currentSalData.totalNet)}</td></tr>
                            </tbody>
                        </table>
                        <div className="p-3 border border-dashed border-gray-400 bg-gray-50 text-[10px] text-gray-700 leading-relaxed rounded">
                            <strong>Note di contabilità (D.Lgs. 36/2023):</strong> La contabilità dei lavori riflette le quantità regolarmente eseguite e registrate nel Libretto delle Misure e nel Registro di Contabilità. Il ribasso d'asta contrattuale si applica sull'intero importo delle lavorazioni a misura e a corpo. In contabilità la manodopera è contabilizzata ordinariamente nell'ambito dei prezzi di elenco dei lavori. Gli Oneri della Sicurezza sono liquidati integralmente senza applicazione del ribasso.
                        </div>
                    </div>
                </div>
            )}
            
            {activeTab === 'libretto' && (
                <div className="flex-grow p-2 overflow-hidden flex flex-col min-h-0">
                    <div ref={contentRef} className="bg-white dark:bg-gray-800 rounded-lg shadow-xs border border-gray-200 dark:border-gray-700 flex-grow overflow-auto min-h-0">
                          <table className="w-full text-xs text-left border-collapse">
                            <thead className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold border-b dark:border-gray-600 sticky top-0 z-10 shadow-xs">
                                <tr><th className="p-2.5 w-24 text-center border-r dark:border-gray-600 align-top text-indigo-600 dark:text-indigo-400">N. LB.</th><th className="p-2.5 w-24 border-r dark:border-gray-600 align-top">Data</th><th className="p-2.5 w-32 border-r dark:border-gray-600 align-top">WBS</th><th className="p-2.5 w-36 border-r dark:border-gray-600 align-top">Codice</th><th className="p-2.5 border-r dark:border-gray-600 align-top">Descrizione & Note</th><th className="p-2.5 w-12 text-center border-r dark:border-gray-600 bg-gray-50 dark:bg-gray-700 align-top">U.M.</th><th className="p-2.5 w-24 text-right bg-indigo-50 dark:bg-indigo-900/30 align-top">Quantità</th></tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {filteredLibretto.filter(applyFilters).map((entry) => (
                                    <tr key={entry.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${entry.accountingType === 'body' ? 'bg-purple-50/50' : ''}`}>
                                        <td className="p-2.5 text-center font-mono font-bold text-indigo-700 dark:text-indigo-400 border-r dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800 align-top whitespace-nowrap">N. LB. {entry.progressiveIndex}</td>
                                        <td className="p-2.5 border-r dark:border-gray-600 align-top">{format(parseISO(entry.date), 'dd/MM/yy')}</td>
                                        <td className="p-2.5 border-r dark:border-gray-600 align-top text-xs uppercase font-semibold">{entry.groupName}</td>
                                        <td className="p-2.5 border-r dark:border-gray-600 align-top font-mono text-xs font-bold text-indigo-700 dark:text-indigo-300">
                                            {formatCodeWithComputoIndex(entry.articleCode, entry.originalIndex, entry.accountingType)}
                                        </td>
                                        <td className="p-2.5 border-r dark:border-gray-600 text-justify align-top">
                                            <div className="text-xs mb-0.5 text-justify leading-relaxed">{entry.description}</div>
                                            <div className="italic text-indigo-700 dark:text-indigo-400 text-justify">{entry.measurementNote || '-'}</div>
                                        </td>
                                        <td className="p-2.5 text-center border-r dark:border-gray-600">{entry.unit}</td>
                                        <td className="p-2.5 text-right font-bold font-mono bg-indigo-50/30 dark:bg-indigo-900/10">{entry.accountingType === 'body' ? percentFormatter.format(entry.quantity) : numberFormatter.format(entry.quantity)}</td>
                                    </tr>
                                ))}
                            </tbody>
                         </table>
                    </div>
                </div>
            )}
            
            {activeTab === 'register' && (
                <div className="flex-grow p-2 overflow-hidden flex flex-col min-h-0 gap-2">
                    {/* Barra di filtro pulita stile Computo */}
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-gray-50 dark:bg-gray-800/80 rounded-lg border border-gray-200 dark:border-gray-700 flex-shrink-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <input
                                type="text"
                                value={filters.code}
                                onChange={e => setFilters(prev => ({ ...prev, code: e.target.value }))}
                                placeholder="Filtra codice articolo..."
                                className="px-2.5 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:ring-1 focus:ring-indigo-500 outline-none w-44"
                            />
                            <input
                                type="text"
                                value={filters.description}
                                onChange={e => setFilters(prev => ({ ...prev, description: e.target.value }))}
                                placeholder="Filtra descrizione / nota..."
                                className="px-2.5 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:ring-1 focus:ring-indigo-500 outline-none w-52"
                            />
                        </div>
                        {(() => {
                            const visibleEntries = activeRegisterEntries.filter(applyFilters);
                            const totalProg = visibleEntries.length > 0 ? visibleEntries[visibleEntries.length - 1].runningProgressive : 0;
                            return (
                                <div className="flex items-center gap-2 text-xs">
                                    <span className="text-gray-500 dark:text-gray-400 font-medium">Totale Progressivo Registro a tutto il SAL N. {sals.find(s => s.id === activeSalId)?.number || 'Corrente'}:</span>
                                    <span className="font-mono font-bold text-sm text-indigo-700 dark:text-indigo-300">{currencyFormatter.format(totalProg)}</span>
                                </div>
                            );
                        })()}
                    </div>

                    <div ref={contentRef} className="bg-white dark:bg-gray-800 rounded-lg shadow-xs border border-gray-200 dark:border-gray-700 flex-grow overflow-auto min-h-0">
                        <table className="w-full text-xs text-left text-gray-700 dark:text-gray-200 border-collapse">
                            <thead className="text-[11px] text-gray-600 dark:text-gray-300 uppercase bg-gray-100 dark:bg-gray-700 sticky top-0 z-10 border-b border-gray-300 dark:border-gray-600">
                                <tr>
                                    <th className="px-2 py-2 w-24 text-center border-r border-gray-200 dark:border-gray-600">N. RG.</th>
                                    <th className="px-2 py-2 w-24 text-center border-r border-gray-200 dark:border-gray-600">Data</th>
                                    <th className="px-2.5 py-2 w-36 text-center border-r border-gray-200 dark:border-gray-600">Rif. (N. LB. / Pag.)</th>
                                    <th className="px-2.5 py-2 w-36 border-r border-gray-200 dark:border-gray-600">Codice Art.</th>
                                    <th className="px-3 py-2 border-r border-gray-200 dark:border-gray-600">Designazione dei Lavori e delle Provviste</th>
                                    <th className="px-2 py-2 w-12 text-center border-r border-gray-200 dark:border-gray-600">U.M.</th>
                                    <th className="px-2.5 py-2 text-right w-24 border-r border-gray-200 dark:border-gray-600 font-bold">Quantità</th>
                                    <th className="px-2.5 py-2 text-right w-24 border-r border-gray-200 dark:border-gray-600">Prezzo Unit.</th>
                                    <th className="px-3 py-2 text-right w-28 border-r border-gray-200 dark:border-gray-600 font-bold">Importo</th>
                                    <th className="px-3 py-2 text-right w-32 font-black bg-indigo-50/50 dark:bg-indigo-900/20">Totale Prog.</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {activeRegisterEntries.filter(applyFilters).map((entry) => {
                                    const fmtQty = entry.accountingType === 'body' ? percentFormatter.format(entry.quantity) : numberFormatter.format(entry.quantity);
                                    const hasDims = entry.accountingType !== 'body' && (entry.factor !== undefined || entry.length !== undefined || entry.width !== undefined || entry.height !== undefined);

                                    return (
                                        <tr 
                                            key={entry.id} 
                                            className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/40 text-gray-700 dark:text-gray-300 transition-colors"
                                        >
                                            <td className="px-2 py-2 text-center font-mono font-bold text-gray-700 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700 align-top whitespace-nowrap">
                                                N. RG. {entry.registerOrderIndex}
                                            </td>
                                            <td className="px-2 py-2 text-center font-mono text-[11px] text-gray-600 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700 align-top">
                                                {format(parseISO(entry.date), 'dd/MM/yyyy')}
                                            </td>
                                            <td className="px-2.5 py-2 text-center border-r border-gray-200 dark:border-gray-700 align-top">
                                                <span className="inline-block px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-mono font-bold text-[10px] border border-gray-300 dark:border-gray-600 whitespace-nowrap">
                                                    {formatLibrettoRef(entry.progressiveIndex, entry.librettoPage)}
                                                </span>
                                            </td>
                                            <td className="px-2.5 py-2 font-mono font-bold text-indigo-700 dark:text-indigo-300 border-r border-gray-200 dark:border-gray-700 align-top">
                                                <div>{formatCodeWithComputoIndex(entry.articleCode, entry.originalIndex, entry.accountingType)}</div>
                                                <div className="text-[10px] font-sans font-normal text-gray-400 uppercase mt-0.5">{entry.groupName}</div>
                                            </td>
                                            <td className="px-3 py-2 text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700 align-top text-justify">
                                                <div className="font-semibold text-justify leading-relaxed">{entry.description}</div>
                                                {entry.measurementNote && (
                                                    <div className="italic text-gray-600 dark:text-gray-300 text-[11px] mt-0.5 text-justify">
                                                        {entry.measurementNote}
                                                    </div>
                                                )}
                                                {hasDims && (
                                                    <div className="font-mono text-[10px] text-gray-400 mt-0.5">
                                                        ({[
                                                            entry.factor !== undefined ? `F:${numberFormatter.format(entry.factor)}` : null,
                                                            entry.length !== undefined ? `L:${numberFormatter.format(entry.length)}` : null,
                                                            entry.width !== undefined ? `l:${numberFormatter.format(entry.width)}` : null,
                                                            entry.height !== undefined ? `H/P:${numberFormatter.format(entry.height)}` : null
                                                        ].filter(Boolean).join(' × ')})
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-2 py-2 text-center font-mono text-gray-600 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700 align-top">
                                                {entry.unit}
                                            </td>
                                            <td className="px-2.5 py-2 text-right font-mono font-bold text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700 align-top">
                                                {fmtQty}
                                            </td>
                                            <td className="px-2.5 py-2 text-right font-mono text-gray-700 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700 align-top">
                                                {entry.isDepreciated && (
                                                    <span className="block text-[9px] font-sans font-black text-amber-600 dark:text-amber-400" title="Prezzo unitario deprezzato autorizzato con Determina RUP">
                                                        ⚖️ Det. RUP
                                                    </span>
                                                )}
                                                {currencyFormatter.format(entry.unitPrice)}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono font-bold text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700 align-top">
                                                {currencyFormatter.format(entry.debit)}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono font-black text-indigo-700 dark:text-indigo-300 bg-indigo-50/40 dark:bg-indigo-900/20 align-top">
                                                {currencyFormatter.format(entry.runningProgressive)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                {(() => {
                                    const visibleEntries = activeRegisterEntries.filter(applyFilters);
                                    const totalProg = visibleEntries.length > 0 ? visibleEntries[visibleEntries.length - 1].runningProgressive : 0;
                                    return (
                                        <tr className="bg-gray-100 dark:bg-gray-700 font-bold border-t-2 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">
                                            <td colSpan={9} className="px-3 py-2.5 text-right uppercase tracking-wider text-xs border-r border-gray-200 dark:border-gray-600">
                                                IMPORTO TOTALE PROGRESSIVO DEL REGISTRO A TUTTO IL SAL N. {sals.find(s => s.id === activeSalId)?.number || 'CORRENTE'}
                                            </td>
                                            <td className="px-3 py-2.5 text-right font-mono text-sm font-black text-indigo-700 dark:text-indigo-300 bg-indigo-100/50 dark:bg-indigo-900/40">
                                                {currencyFormatter.format(totalProg)}
                                            </td>
                                        </tr>
                                    );
                                })()}
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'summary' && (
                <div className="flex-grow p-2 overflow-hidden flex flex-col min-h-0 gap-2">
                    {/* Barra strumenti pulita Sommario del Registro */}
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/80 rounded-lg border border-gray-200 dark:border-gray-700 flex-shrink-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            {/* Modalità Analitico / Sintetico */}
                            <div className="inline-flex rounded-md bg-white dark:bg-gray-700 p-0.5 border border-gray-200 dark:border-gray-600">
                                <button
                                    onClick={() => setSummaryMode('analytical')}
                                    className={`px-2.5 py-1 text-xs font-bold rounded transition-colors ${summaryMode === 'analytical' ? 'bg-indigo-600 text-white shadow-xs' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'}`}
                                >
                                    Sommario Analitico (Dettaglio Misure)
                                </button>
                                <button
                                    onClick={() => setSummaryMode('synthetic')}
                                    className={`px-2.5 py-1 text-xs font-bold rounded transition-colors ${summaryMode === 'synthetic' ? 'bg-indigo-600 text-white shadow-xs' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'}`}
                                >
                                    Sommario Sintetico (Totali Voci)
                                </button>
                            </div>

                            {/* Raggruppamento per Gruppi / Categorie */}
                            <div className="inline-flex rounded-md bg-white dark:bg-gray-700 p-0.5 border border-gray-200 dark:border-gray-600">
                                <button
                                    onClick={() => setSummaryGrouping('grouped_by_wbs')}
                                    className={`px-2.5 py-1 text-xs font-bold rounded transition-colors ${summaryGrouping === 'grouped_by_wbs' ? 'bg-violet-600 text-white shadow-xs' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'}`}
                                    title="Struttura il sommario raggruppato per Gruppi di Lavoro / Categorie WBS"
                                >
                                    📁 Strutturato per Gruppi
                                </button>
                                <button
                                    onClick={() => setSummaryGrouping('flat')}
                                    className={`px-2.5 py-1 text-xs font-bold rounded transition-colors ${summaryGrouping === 'flat' ? 'bg-violet-600 text-white shadow-xs' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'}`}
                                    title="Elenco continuo tabellare unico"
                                >
                                    📄 Elenco Singolo
                                </button>
                            </div>

                            <input
                                type="text"
                                value={filters.code}
                                onChange={e => setFilters(prev => ({ ...prev, code: e.target.value }))}
                                placeholder="Filtra codice articolo..."
                                className="px-2.5 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:ring-1 focus:ring-indigo-500 outline-none w-36"
                            />
                            <input
                                type="text"
                                value={filters.description}
                                onChange={e => setFilters(prev => ({ ...prev, description: e.target.value }))}
                                placeholder="Filtra descrizione..."
                                className="px-2.5 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:ring-1 focus:ring-indigo-500 outline-none w-40"
                            />
                        </div>

                        {(() => {
                            const visibleItems = accountingSummary.filter(applyFilters);
                            const totProg = round2(visibleItems.reduce((acc, i) => acc + i.totalAmount, 0));
                            return (
                                <div className="flex items-center gap-3 text-xs flex-wrap">
                                    <span className="text-gray-500 dark:text-gray-400">
                                        Voci misurate: <strong className="text-gray-800 dark:text-gray-100 font-bold">{visibleItems.length}</strong>
                                    </span>
                                    <div className="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-1 rounded-md border border-indigo-200 dark:border-indigo-800">
                                        <span className="font-semibold text-gray-700 dark:text-gray-300">Contabilizzato SAL N. {sals.find(s => s.id === activeSalId)?.number || '1'}:</span>
                                        <span className="font-mono font-black text-indigo-700 dark:text-indigo-300">{currencyFormatter.format(totProg)}</span>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>

                    <div ref={contentRef} className="bg-white dark:bg-gray-800 rounded-lg shadow-xs border border-gray-200 dark:border-gray-700 flex-grow overflow-auto min-h-0">
                        {summaryGrouping === 'grouped_by_wbs' ? (
                            /* VISUALIZZAZIONE STRUTTURATA PER GRUPPI / CATEGORIE */
                            <div className="divide-y divide-gray-200 dark:divide-gray-700">
                                {(() => {
                                    const filteredItems = accountingSummary.filter(applyFilters);
                                    // Raggruppamento per groupName / wbsName
                                    const grouped = new Map<string, SummaryEntry[]>();
                                    filteredItems.forEach(item => {
                                        const grp = item.groupName || item.wbsName || 'Altre Lavorazioni';
                                        if (!grouped.has(grp)) grouped.set(grp, []);
                                        grouped.get(grp)!.push(item);
                                    });

                                    if (grouped.size === 0) {
                                        return (
                                            <div className="p-8 text-center text-gray-500 text-xs">
                                                Nessuna voce misurata presente con i filtri attivi.
                                            </div>
                                        );
                                    }

                                    let globalCounter = 0;

                                    return Array.from(grouped.entries()).map(([groupName, groupItems]) => {
                                        const groupTotComputo = round2(groupItems.reduce((acc, i) => acc + (i.estimatedQuantity * i.unitPrice), 0));
                                        const groupTotAccounted = round2(groupItems.reduce((acc, i) => acc + i.totalAmount, 0));
                                        const groupTotResidual = Math.max(0, round2(groupTotComputo - groupTotAccounted));
                                        const groupProgress = groupTotComputo > 0 ? (groupTotAccounted / groupTotComputo) * 100 : 0;

                                        return (
                                            <div key={groupName} className="mb-4 last:mb-0">
                                                {/* INTESTAZIONE GRUPPO / WBS */}
                                                <div className="bg-gradient-to-r from-gray-100 to-indigo-50/50 dark:from-gray-700 dark:to-indigo-950/30 px-3 py-2 border-b border-gray-300 dark:border-gray-600 flex flex-wrap items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="p-1 rounded bg-indigo-600 text-white text-xs">📁</span>
                                                        <h3 className="font-black text-xs md:text-sm text-gray-900 dark:text-white uppercase tracking-tight">
                                                            {groupName}
                                                        </h3>
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200">
                                                            {groupItems.length} {groupItems.length === 1 ? 'voce' : 'voci'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-[11px] font-mono flex-wrap">
                                                        <span className="text-gray-500">Computo: <strong className="text-gray-800 dark:text-gray-200">{currencyFormatter.format(groupTotComputo)}</strong></span>
                                                        <span className="text-indigo-600 dark:text-indigo-400">Contabilizzato: <strong className="font-bold">{currencyFormatter.format(groupTotAccounted)}</strong> ({groupProgress.toFixed(1)}%)</span>
                                                        <span className="text-emerald-600 dark:text-emerald-400">Residuo: <strong>{currencyFormatter.format(groupTotResidual)}</strong></span>
                                                    </div>
                                                </div>

                                                {/* TABELLA DELLE VOCI DEL GRUPPO */}
                                                <table className="w-full text-xs text-left text-gray-700 dark:text-gray-200 border-collapse">
                                                    <thead className="text-[10px] text-gray-600 dark:text-gray-300 uppercase bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                                                        <tr>
                                                            <th className="px-2 py-1.5 w-20 text-center border-r border-gray-200 dark:border-gray-700">N. SM.</th>
                                                            <th className="px-2.5 py-1.5 w-36 border-r border-gray-200 dark:border-gray-700">Articolo Elenco</th>
                                                            <th className="px-3 py-1.5 border-r border-gray-200 dark:border-gray-700">Designazione dei Lavori</th>
                                                            <th className="px-2.5 py-1.5 w-48 border-r border-gray-200 dark:border-gray-700">Rif. Misure (N. LB. / Pag.)</th>
                                                            <th className="px-2 py-1.5 w-12 text-center border-r border-gray-200 dark:border-gray-700">U.M.</th>
                                                            <th className="px-2.5 py-1.5 text-right w-24 border-r border-gray-200 dark:border-gray-700">Q.tà Contab.</th>
                                                            <th className="px-2.5 py-1.5 text-right w-24 border-r border-gray-200 dark:border-gray-700">Prezzo Unit.</th>
                                                            <th className="px-3 py-1.5 text-right w-28 font-bold">Importo Contab.</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                        {groupItems.map(item => {
                                                            globalCounter++;
                                                            const idx = globalCounter;
                                                            const fmtQty = (q: number) => item.accountingType === 'body' ? percentFormatter.format(q) : numberFormatter.format(q);
                                                            const allLines = item.allLines || [...item.previousLines, ...item.currentLines];
                                                            const hasMeasures = allLines.length > 0;

                                                            return (
                                                                <React.Fragment key={item.articleCode}>
                                                                    <tr className="bg-white dark:bg-gray-800 hover:bg-gray-50/80 dark:hover:bg-gray-700/30 transition-colors">
                                                                        <td className="px-2 py-2 text-center font-mono font-bold text-gray-600 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700 align-top whitespace-nowrap">
                                                                            N. SM. {idx}
                                                                        </td>
                                                                        <td className="px-2.5 py-2 font-mono font-bold text-indigo-700 dark:text-indigo-300 border-r border-gray-200 dark:border-gray-700 align-top">
                                                                            <div>{formatCodeWithComputoIndex(item.articleCode, item.originalIndex, item.accountingType)}</div>
                                                                            {item.isSecurityCost && (
                                                                                <span className="inline-block mt-0.5 px-1 py-0.2 bg-red-100 text-red-800 rounded text-[9px] font-sans font-bold">Oneri Sicurezza</span>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-3 py-2 text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700 align-top font-medium text-justify">
                                                                            <div className="text-justify leading-relaxed">{item.description}</div>
                                                                        </td>
                                                                        <td className="px-2.5 py-2 border-r border-gray-200 dark:border-gray-700 align-top">
                                                                            {summaryMode === 'synthetic' && hasMeasures && (
                                                                                <div className="flex flex-wrap gap-1">
                                                                                    {allLines.map(line => (
                                                                                        <span
                                                                                            key={line.id}
                                                                                            title={`Data: ${format(parseISO(line.date), 'dd/MM/yyyy')} - Q.tà: ${fmtQty(line.quantity)} - ${line.measurementNote}`}
                                                                                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600 whitespace-nowrap"
                                                                                        >
                                                                                            <strong>{formatLibrettoRef(line.progressiveIndex, line.librettoPage)}</strong>
                                                                                        </span>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-2 py-2 text-center font-mono text-gray-600 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700 align-top">
                                                                            {summaryMode === 'synthetic' ? item.unit : ''}
                                                                        </td>
                                                                        <td className="px-2.5 py-2 text-right font-mono font-bold text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700 align-top">
                                                                            {summaryMode === 'synthetic' ? fmtQty(item.totalQuantity) : ''}
                                                                        </td>
                                                                        <td className="px-2.5 py-2 text-right font-mono text-gray-600 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700 align-top">
                                                                            {summaryMode === 'synthetic' ? currencyFormatter.format(item.unitPrice) : ''}
                                                                        </td>
                                                                        <td className="px-3 py-2 text-right font-mono font-bold text-gray-900 dark:text-white bg-gray-50/50 dark:bg-gray-700/20 align-top">
                                                                            {summaryMode === 'synthetic' ? currencyFormatter.format(item.totalAmount) : ''}
                                                                        </td>
                                                                    </tr>

                                                                    {/* Dettaglio righe di misura se analitico */}
                                                                    {summaryMode === 'analytical' && hasMeasures && (
                                                                        <>
                                                                            {allLines.map(line => {
                                                                                const hasDims = item.accountingType !== 'body' && (line.factor !== undefined || line.length !== undefined || line.width !== undefined || line.height !== undefined);
                                                                                return (
                                                                                    <tr key={`sum-line-${line.id}`} className="bg-gray-50/40 dark:bg-gray-800/40 text-gray-600 dark:text-gray-400 text-[11px]">
                                                                                        <td className="px-2 py-1 border-r border-gray-200 dark:border-gray-700 text-center"></td>
                                                                                        <td className="px-2.5 py-1 border-r border-gray-200 dark:border-gray-700 font-mono">
                                                                                            {format(parseISO(line.date), 'dd/MM/yyyy')}
                                                                                        </td>
                                                                                        <td className="px-3 py-1 border-r border-gray-200 dark:border-gray-700 italic pl-6 text-justify">
                                                                                            {line.measurementNote}
                                                                                            {hasDims && (
                                                                                                <span className="ml-2 not-italic font-mono text-[10px] text-gray-400">
                                                                                                    ({[
                                                                                                        line.factor !== undefined ? `F:${numberFormatter.format(line.factor)}` : null,
                                                                                                        line.length !== undefined ? `L:${numberFormatter.format(line.length)}` : null,
                                                                                                        line.width !== undefined ? `l:${numberFormatter.format(line.width)}` : null,
                                                                                                        line.height !== undefined ? `H/P:${numberFormatter.format(line.height)}` : null
                                                                                                    ].filter(Boolean).join(' × ')})
                                                                                                </span>
                                                                                            )}
                                                                                        </td>
                                                                                        <td className="px-2.5 py-1 border-r border-gray-200 dark:border-gray-700 text-center">
                                                                                            <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 font-mono font-bold text-[10px] whitespace-nowrap">
                                                                                                {formatLibrettoRef(line.progressiveIndex, line.librettoPage)}
                                                                                            </span>
                                                                                        </td>
                                                                                        <td className="px-2 py-1 text-center font-mono border-r border-gray-200 dark:border-gray-700 text-[10px]">
                                                                                            {item.unit}
                                                                                        </td>
                                                                                        <td className="px-2.5 py-1 text-right font-mono font-semibold text-gray-700 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700">
                                                                                            {fmtQty(line.quantity)}
                                                                                        </td>
                                                                                        <td className="px-2.5 py-1 border-r border-gray-200 dark:border-gray-700"></td>
                                                                                        <td className="px-3 py-1"></td>
                                                                                    </tr>
                                                                                );
                                                                            })}
                                                                            <tr className="bg-gray-100/60 dark:bg-gray-700/40 text-[11px] font-bold border-t border-b border-gray-200 dark:border-gray-600">
                                                                                <td colSpan={2} className="px-2 py-1 border-r border-gray-200 dark:border-gray-700"></td>
                                                                                <td className="px-3 py-1 border-r border-gray-200 dark:border-gray-700 uppercase text-gray-600 dark:text-gray-300">
                                                                                    SOMMANO {item.unit}
                                                                                </td>
                                                                                <td className="px-2.5 py-1 border-r border-gray-200 dark:border-gray-700 text-center font-mono text-[10px] text-gray-400">
                                                                                    {formatCodeWithComputoIndex(item.articleCode, item.originalIndex, item.accountingType)}
                                                                                </td>
                                                                                <td className="px-2 py-1 text-center font-mono border-r border-gray-200 dark:border-gray-700">
                                                                                    {item.unit}
                                                                                </td>
                                                                                <td className="px-2.5 py-1 text-right font-mono text-indigo-700 dark:text-indigo-300 border-r border-gray-200 dark:border-gray-700 font-black">
                                                                                    {fmtQty(item.totalQuantity)}
                                                                                </td>
                                                                                <td className="px-2.5 py-1 text-right font-mono text-gray-600 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700">
                                                                                    {currencyFormatter.format(item.unitPrice)}
                                                                                </td>
                                                                                <td className="px-3 py-1 text-right font-mono font-black text-indigo-700 dark:text-indigo-300 bg-indigo-50/50 dark:bg-indigo-950/30">
                                                                                    {currencyFormatter.format(item.totalAmount)}
                                                                                </td>
                                                                            </tr>
                                                                        </>
                                                                    )}
                                                                </React.Fragment>
                                                            );
                                                        })}
                                                    </tbody>
                                                    <tfoot>
                                                        <tr className="bg-gray-100 dark:bg-gray-700/80 font-bold border-t border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200">
                                                            <td colSpan={5} className="px-3 py-1.5 text-right uppercase text-[11px] border-r border-gray-200 dark:border-gray-600">
                                                                Subtotale {groupName}
                                                            </td>
                                                            <td colSpan={2} className="px-2.5 py-1.5 text-right text-[11px] border-r border-gray-200 dark:border-gray-600 font-mono">
                                                                Residuo: {currencyFormatter.format(groupTotResidual)}
                                                            </td>
                                                            <td className="px-3 py-1.5 text-right font-mono font-black text-indigo-700 dark:text-indigo-300 bg-indigo-100/40 dark:bg-indigo-950/40">
                                                                {currencyFormatter.format(groupTotAccounted)}
                                                            </td>
                                                        </tr>
                                                    </tfoot>
                                                </table>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        ) : (
                            /* VISUALIZZAZIONE TABELLARE CONTINUA SINGOLA */
                            <table className="w-full text-xs text-left text-gray-700 dark:text-gray-200 border-collapse">
                                <thead className="text-[11px] text-gray-600 dark:text-gray-300 uppercase bg-gray-100 dark:bg-gray-700 sticky top-0 z-10 border-b border-gray-300 dark:border-gray-600">
                                    <tr>
                                        <th className="px-2.5 py-2.5 w-20 text-center border-r border-gray-200 dark:border-gray-600">N. SM.</th>
                                        <th className="px-3 py-2.5 w-40 border-r border-gray-200 dark:border-gray-600">Articolo di Elenco</th>
                                        <th className="px-3 py-2.5 border-r border-gray-200 dark:border-gray-600">Designazione dei Lavori</th>
                                        <th className="px-3 py-2.5 w-56 border-r border-gray-200 dark:border-gray-600">Rif. Misure (N. LB. / Pag.)</th>
                                        <th className="px-2 py-2.5 w-14 text-center border-r border-gray-200 dark:border-gray-600">U.M.</th>
                                        <th className="px-3 py-2.5 text-right w-28 border-r border-gray-200 dark:border-gray-600 font-bold">Quantità Tot.</th>
                                        <th className="px-3 py-2.5 text-right w-28 border-r border-gray-200 dark:border-gray-600">Prezzo Unit.</th>
                                        <th className="px-3 py-2.5 text-right w-32 font-bold">Importo Totale</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {accountingSummary.filter(applyFilters).map((item, idx) => {
                                        const fmtQty = (q: number) => item.accountingType === 'body' ? percentFormatter.format(q) : numberFormatter.format(q);
                                        const allLines = item.allLines || [...item.previousLines, ...item.currentLines];

                                        return (
                                            <React.Fragment key={item.articleCode}>
                                                <tr className="bg-gray-50/90 dark:bg-gray-700/40 border-t-2 border-gray-300 dark:border-gray-600">
                                                    <td className="px-2.5 py-2 text-center font-mono font-bold text-gray-700 dark:text-gray-200 border-r border-gray-200 dark:border-gray-700 align-top whitespace-nowrap">
                                                        N. SM. {idx + 1}
                                                    </td>
                                                    <td className="px-3 py-2 font-mono font-bold text-indigo-700 dark:text-indigo-300 border-r border-gray-200 dark:border-gray-700 align-top">
                                                        <div>{formatCodeWithComputoIndex(item.articleCode, item.originalIndex, item.accountingType)}</div>
                                                        <div className="text-[10px] font-sans font-normal text-gray-400 uppercase mt-0.5">{item.wbsName}</div>
                                                    </td>
                                                    <td className="px-3 py-2 text-gray-900 dark:text-gray-100 border-r border-gray-200 dark:border-gray-700 align-top font-semibold text-justify">
                                                        <div className="text-justify leading-relaxed">{item.description}</div>
                                                    </td>
                                                    <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700 align-top">
                                                        {summaryMode === 'synthetic' && (
                                                            <div className="flex flex-wrap gap-1">
                                                                {allLines.map(line => (
                                                                    <span
                                                                        key={line.id}
                                                                        title={`Data: ${format(parseISO(line.date), 'dd/MM/yyyy')} - Q.tà: ${fmtQty(line.quantity)} - ${line.measurementNote}`}
                                                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600 whitespace-nowrap"
                                                                    >
                                                                        <strong>{formatLibrettoRef(line.progressiveIndex, line.librettoPage)}</strong>
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-2 py-2 text-center font-mono text-gray-600 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700 align-top">
                                                        {summaryMode === 'synthetic' ? item.unit : ''}
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-mono font-bold text-gray-900 dark:text-white border-r border-gray-200 dark:border-gray-700 align-top">
                                                        {summaryMode === 'synthetic' ? fmtQty(item.totalQuantity) : ''}
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-mono text-gray-600 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700 align-top">
                                                        {summaryMode === 'synthetic' ? currencyFormatter.format(item.unitPrice) : ''}
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-mono font-bold text-gray-900 dark:text-white bg-gray-50/60 dark:bg-gray-700/30 align-top">
                                                        {summaryMode === 'synthetic' ? currencyFormatter.format(item.totalAmount) : ''}
                                                    </td>
                                                </tr>

                                                {summaryMode === 'analytical' && (
                                                    <>
                                                        {allLines.map(line => {
                                                            const hasDims = item.accountingType !== 'body' && (line.factor !== undefined || line.length !== undefined || line.width !== undefined || line.height !== undefined);

                                                            return (
                                                                <tr 
                                                                    key={`sum-line-${line.id}`} 
                                                                    className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/30 text-gray-700 dark:text-gray-300 text-xs"
                                                                >
                                                                    <td className="px-2.5 py-1.5 border-r border-gray-200 dark:border-gray-700 text-center text-gray-400"></td>
                                                                    <td className="px-3 py-1.5 border-r border-gray-200 dark:border-gray-700 font-mono text-[11px] text-gray-600 dark:text-gray-300">
                                                                        {format(parseISO(line.date), 'dd/MM/yyyy')}
                                                                    </td>
                                                                    <td className="px-3 py-1.5 border-r border-gray-200 dark:border-gray-700 pl-6 italic text-gray-600 dark:text-gray-300 text-justify">
                                                                        {line.measurementNote}
                                                                        {hasDims && (
                                                                            <span className="ml-2 not-italic font-mono text-[10px] text-gray-400">
                                                                                ({[
                                                                                    line.factor !== undefined ? `F:${numberFormatter.format(line.factor)}` : null,
                                                                                    line.length !== undefined ? `L:${numberFormatter.format(line.length)}` : null,
                                                                                    line.width !== undefined ? `l:${numberFormatter.format(line.width)}` : null,
                                                                                    line.height !== undefined ? `H/P:${numberFormatter.format(line.height)}` : null
                                                                                ].filter(Boolean).join(' × ')})
                                                                            </span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-3 py-1.5 border-r border-gray-200 dark:border-gray-700 text-center">
                                                                        <div className="inline-flex items-center gap-1 justify-center">
                                                                            <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-mono font-bold text-[10px] border border-gray-300 dark:border-gray-600 whitespace-nowrap">
                                                                                {formatLibrettoRef(line.progressiveIndex, line.librettoPage)}
                                                                            </span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-2 py-1.5 text-center font-mono text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700 text-[11px]">
                                                                        {item.unit}
                                                                    </td>
                                                                    <td className="px-3 py-1.5 text-right font-mono font-semibold text-gray-800 dark:text-gray-200 border-r border-gray-200 dark:border-gray-700">
                                                                        {fmtQty(line.quantity)}
                                                                    </td>
                                                                    <td className="px-3 py-1.5 border-r border-gray-200 dark:border-gray-700"></td>
                                                                    <td className="px-3 py-1.5"></td>
                                                                </tr>
                                                            );
                                                        })}

                                                        <tr className="bg-gray-100/70 dark:bg-gray-700/50 font-bold border-t border-b-2 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">
                                                            <td className="px-2.5 py-1.5 border-r border-gray-200 dark:border-gray-600"></td>
                                                            <td className="px-3 py-1.5 border-r border-gray-200 dark:border-gray-600 font-mono text-center text-[10px] text-gray-500 dark:text-gray-400">
                                                                {allLines.length} {allLines.length === 1 ? 'misura' : 'misure'}
                                                            </td>
                                                            <td className="px-3 py-1.5 border-r border-gray-200 dark:border-gray-600 text-right uppercase tracking-wider text-[11px] text-gray-700 dark:text-gray-200">
                                                                SOMMANO {item.unit}
                                                            </td>
                                                            <td className="px-3 py-1.5 border-r border-gray-200 dark:border-gray-600 text-center font-mono text-[10px] text-gray-400">
                                                                {formatCodeWithComputoIndex(item.articleCode, item.originalIndex, item.accountingType)}
                                                            </td>
                                                            <td className="px-2 py-1.5 text-center border-r border-gray-200 dark:border-gray-600 font-mono">
                                                                {item.unit}
                                                            </td>
                                                            <td className="px-3 py-1.5 text-right border-r border-gray-200 dark:border-gray-600 font-mono font-black text-indigo-700 dark:text-indigo-300">
                                                                {fmtQty(item.totalQuantity)}
                                                            </td>
                                                            <td className="px-3 py-1.5 text-right border-r border-gray-200 dark:border-gray-600 font-mono text-gray-700 dark:text-gray-200">
                                                                {currencyFormatter.format(item.unitPrice)}
                                                            </td>
                                                            <td className="px-3 py-1.5 text-right font-mono font-black text-gray-900 dark:text-white bg-indigo-50/40 dark:bg-indigo-900/20">
                                                                {currencyFormatter.format(item.totalAmount)}
                                                            </td>
                                                        </tr>
                                                    </>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    {(() => {
                                        const visibleItems = accountingSummary.filter(applyFilters);
                                        const totProg = round2(visibleItems.reduce((acc, i) => acc + i.totalAmount, 0));
                                        return (
                                            <tr className="bg-gray-100 dark:bg-gray-700 font-bold border-t-2 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white">
                                                <td colSpan={7} className="px-3 py-2.5 text-right uppercase tracking-wider text-xs border-r border-gray-200 dark:border-gray-600">
                                                    IMPORTO TOTALE PROGRESSIVO A TUTTO IL SAL N. {sals.find(s => s.id === activeSalId)?.number || 'CORRENTE'}
                                                </td>
                                                <td className="px-3 py-2.5 text-right font-mono text-sm font-black text-indigo-700 dark:text-indigo-300 bg-indigo-100/50 dark:bg-indigo-900/40">
                                                    {currencyFormatter.format(totProg)}
                                                </td>
                                            </tr>
                                        );
                                    })()}
                                </tfoot>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'payment_cert' && (
                <div className="flex-grow overflow-auto bg-gray-100 dark:bg-gray-900 p-3 md:p-5 flex justify-center min-h-0">
                    <div ref={certificateRef} className="bg-white text-gray-900 w-[210mm] min-h-[297mm] p-[20mm] shadow-2xl text-[12px] relative h-fit" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
                        <div className="text-center mb-8 border-b-2 border-black pb-4"><h1 className="text-xl font-bold uppercase tracking-widest mb-1">Certificato di Pagamento</h1><h2 className="text-lg">Rata di Acconto N. {sals.find(s => s.id === activeSalId)?.number || '(Bozza)'}</h2></div>
                        <table className="w-full mb-8 border-collapse border border-black text-[12px]">
                            <thead><tr className="bg-gray-200 uppercase"><th className="border border-black p-2 text-left font-bold">Descrizione</th><th className="border border-black p-2 text-right w-32 font-bold">Importi</th></tr></thead>
                            <tbody>
                                <tr><td className="border border-black p-2 font-bold">1. Totale Netto Lavori (da SAL Cumulativo)</td><td className="border border-black p-2 text-right font-bold">{currencyFormatter.format(paymentCertData.currentNet)}</td></tr>
                                {previousSalObject && (<tr><td className="border border-black p-2 pl-4 text-gray-600">Dedurre SAL precedente n. {previousSalObject.number} (Netto Cumulativo)</td><td className="border border-black p-2 text-right text-red-600">- {currencyFormatter.format(paymentCertData.previousNet)}</td></tr>)}
                                <tr className="bg-gray-50"><td className="border border-black p-2 font-bold">2. Rata di Acconto Lorda (Delta SAL)</td><td className="border border-black p-2 text-right font-bold">{currencyFormatter.format(paymentCertData.rataAcconto)}</td></tr>
                                <tr><td className="border border-black p-2 pl-4">Ritenuta a garanzia ({localConfig.withholdingTaxPercent}%)</td><td className="border border-black p-2 text-right text-red-600">- {currencyFormatter.format(paymentCertData.retentionAmount)}</td></tr>
                                <tr><td className="border border-black p-2 pl-4">Recupero Anticipazione ({localConfig.advancePaymentPercent}%)</td><td className="border border-black p-2 text-right text-red-600">- {currencyFormatter.format(paymentCertData.recoveryAmount)}</td></tr>
                                <tr className="bg-gray-100 font-bold uppercase"><td className="border border-black p-2">3. Imponibile Certificato</td><td className="border border-black p-2 text-right">{currencyFormatter.format(paymentCertData.taxableCertified)}</td></tr>
                                <tr><td className="border border-black p-2 pl-4">I.V.A. ({localConfig.vatPercent}%)</td><td className="border border-black p-2 text-right">{currencyFormatter.format(paymentCertData.vatAmount)}</td></tr>
                                <tr className="bg-gray-200 text-base font-bold uppercase"><td className="border border-black p-3">TOTALE DA PAGARE</td><td className="border border-black p-3 text-right">{currencyFormatter.format(paymentCertData.totalPayable)}</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'depreciation' && (
              <div className="flex-grow p-3 md:p-5 overflow-y-auto flex flex-col min-h-0 space-y-4">
                {/* 1. KPI Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="p-3 bg-gradient-to-br from-indigo-50 to-indigo-100/60 dark:from-indigo-950/40 dark:to-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-indigo-700 dark:text-indigo-300 tracking-wider">Determine RUP</span>
                      <span className="text-base">⚖️</span>
                    </div>
                    <div className="text-2xl font-black text-gray-900 dark:text-white mt-1">
                      {priceDepreciations.length}
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                      {priceDepreciations.filter(d => {
                        const { usedQty } = getDeprUsage(d.id);
                        return (d.maxDepreciatedQuantity - usedQty) > 0.0001;
                      }).length} attive con residuo disponibile
                    </div>
                  </div>

                  <div className="p-3 bg-gradient-to-br from-emerald-50 to-emerald-100/60 dark:from-emerald-950/40 dark:to-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-300 tracking-wider">Risparmio Maturato</span>
                      <span className="text-base">📉</span>
                    </div>
                    <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-1 font-mono">
                      {currencyFormatter.format(
                        priceDepreciations.reduce((acc, d) => {
                          const { usedQty } = getDeprUsage(d.id);
                          const orig = d.originalUnitPrice ?? d.contractUnitPrice ?? 0;
                          return acc + (usedQty * (orig - d.depreciatedUnitPrice));
                        }, 0)
                      )}
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                      Minore spesa effettiva a registro contabilità
                    </div>
                  </div>

                  <div className="p-3 bg-gradient-to-br from-amber-50 to-amber-100/60 dark:from-amber-950/40 dark:to-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-amber-700 dark:text-amber-300 tracking-wider">Risparmio Previsto (Max)</span>
                      <span className="text-base">💰</span>
                    </div>
                    <div className="text-2xl font-black text-amber-800 dark:text-amber-300 mt-1 font-mono">
                      {currencyFormatter.format(
                        priceDepreciations.reduce((acc, d) => {
                          const orig = d.originalUnitPrice ?? d.contractUnitPrice ?? 0;
                          return acc + (d.maxDepreciatedQuantity * (orig - d.depreciatedUnitPrice));
                        }, 0)
                      )}
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                      Economia potenziale deliberata dal RUP
                    </div>
                  </div>

                  <div className="p-3 bg-gradient-to-br from-purple-50 to-purple-100/60 dark:from-purple-950/40 dark:to-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-purple-700 dark:text-purple-300 tracking-wider">Misure Allibate</span>
                      <span className="text-base">📊</span>
                    </div>
                    <div className="text-2xl font-black text-purple-800 dark:text-purple-300 mt-1 font-mono">
                      {priceDepreciations.reduce((acc, d) => acc + getDeprUsage(d.id).occurrences, 0)}
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                      Righe a libretto a prezzo deprezzato
                    </div>
                  </div>
                </div>

                {/* 2. Barra Azioni & Ricerca */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs">
                  <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                    <div className="relative flex-1 max-w-md">
                      <input
                        type="text"
                        value={deprSearchQuery}
                        onChange={e => setDeprSearchQuery(e.target.value)}
                        placeholder="Cerca per codice articolo, determina, motivazione..."
                        className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-700/60 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 outline-none"
                      />
                      <svg className="w-4 h-4 text-gray-400 absolute left-2.5 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <span className="text-xs text-gray-400 hidden md:inline">
                      {priceDepreciations.length} atti registrati
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleOpenNewDeprModal}
                      className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                      <span>Nuovo Deprezzamento (Determina RUP)</span>
                    </button>
                  </div>
                </div>

                {/* 3. Elenco Atti di Deprezzamento */}
                {priceDepreciations.length === 0 ? (
                  <div className="p-12 text-center bg-white dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700 space-y-4">
                    <div className="w-16 h-16 mx-auto bg-amber-50 dark:bg-amber-950/40 rounded-full flex items-center justify-center text-3xl">
                      ⚖️
                    </div>
                    <div className="max-w-md mx-auto space-y-2">
                      <h3 className="text-base font-bold text-gray-900 dark:text-white">Nessun atto di deprezzamento registrato</h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                        Ai sensi dell'art. 114 del D.Lgs. 36/2023, quando una fornitura o lavorazione presenta parziali difformità o vizi tollerabili senza pregiudizio all'opera, il RUP può autorizzarne l'accettazione con motivata Determina e contestuale riduzione del prezzo.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenNewDeprModal}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-2 shadow-sm"
                    >
                      <span>Crea Primo Deprezzamento</span>
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {priceDepreciations
                      .filter(d => {
                        if (!deprSearchQuery) return true;
                        const q = deprSearchQuery.toLowerCase();
                        const item = allComputoItems.find(i => i.articleCode === d.articleCode);
                        return (
                          d.articleCode.toLowerCase().includes(q) ||
                          d.determinaNumber.toLowerCase().includes(q) ||
                          d.reason.toLowerCase().includes(q) ||
                          (item?.description && item.description.toLowerCase().includes(q))
                        );
                      })
                      .map((depr) => {
                        const item = allComputoItems.find(i => i.articleCode === depr.articleCode);
                        const { usedQty, occurrences } = getDeprUsage(depr.id);
                        const remainingQty = Math.max(0, Math.round((depr.maxDepreciatedQuantity - usedQty) * 1000) / 1000);
                        const pctUsed = depr.maxDepreciatedQuantity > 0 ? Math.min(100, (usedQty / depr.maxDepreciatedQuantity) * 100) : 0;
                        const origPrice = depr.originalUnitPrice ?? depr.contractUnitPrice ?? item?.unitPrice ?? 0;
                        const unitSaving = origPrice - depr.depreciatedUnitPrice;
                        const actualSaving = usedQty * unitSaving;
                        const maxPotentialSaving = depr.maxDepreciatedQuantity * unitSaving;
                        const discountPct = origPrice > 0 ? (unitSaving / origPrice) * 100 : 0;

                        return (
                          <div
                            key={depr.id}
                            className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-xs hover:shadow-md transition-shadow space-y-3"
                          >
                            {/* Card Top: Estremi Determina & Azioni */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-100 dark:border-gray-700">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-950/70 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-700 text-xs font-black uppercase">
                                  ⚖️ Det. RUP N. {depr.determinaNumber}
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-400 font-bold">
                                  del {format(parseISO(depr.determinaDate), 'dd/MM/yyyy')}
                                </span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                  Art. {formatCodeWithComputoIndex(depr.articleCode, item?.originalIndex)}
                                </span>
                                {item?.groupName && (
                                  <span className="text-[10px] font-medium text-gray-500 uppercase bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                                    {item.groupName}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                                <button
                                  type="button"
                                  onClick={() => handlePrintDeprActPdf(depr)}
                                  className="px-2.5 py-1 text-xs font-bold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg flex items-center gap-1 transition-colors"
                                  title="Stampa Verbale Determina RUP in PDF"
                                >
                                  📄 <span className="hidden sm:inline">Verbale PDF</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleEditDepr(depr)}
                                  className="px-2.5 py-1 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg border border-indigo-200 dark:border-indigo-800 transition-colors"
                                  title="Modifica Determina"
                                >
                                  ✏️ Modifica
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDepreciation(depr)}
                                  className="px-2.5 py-1 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-lg border border-red-200 dark:border-red-800 transition-colors"
                                  title="Elimina Determina"
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>

                            {/* Descrizione voce */}
                            <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed font-medium text-justify">
                              {item?.description || 'Descrizione voce non disponibile'}
                            </p>

                            {/* Motivazione Determina RUP */}
                            <div className="p-2.5 bg-amber-50/60 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-900/60 text-xs text-justify">
                              <span className="font-bold text-amber-900 dark:text-amber-200 uppercase text-[10px] block mb-0.5">
                                Motivazione del RUP (Determina):
                              </span>
                              <span className="text-gray-700 dark:text-gray-300 italic">
                                "{depr.reason}"
                              </span>
                            </div>

                            {/* Confronto Prezzi & Quantità */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-gray-50 dark:bg-gray-700/30 p-3 rounded-lg border border-gray-200 dark:border-gray-700 text-xs">
                              <div>
                                <span className="text-[10px] text-gray-400 uppercase font-bold block">Prezzo Contratto</span>
                                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                  {currencyFormatter.format(origPrice)} / {item?.unit || 'cad'}
                                </span>
                              </div>

                              <div>
                                <span className="text-[10px] text-amber-700 dark:text-amber-400 uppercase font-black block">Nuovo Prezzo Deprezzato</span>
                                <span className="text-sm font-black text-amber-900 dark:text-amber-200">
                                  {currencyFormatter.format(depr.depreciatedUnitPrice)} / {item?.unit || 'cad'}
                                  <span className="ml-1 text-xs font-bold text-red-600">(-{discountPct.toFixed(1)}%)</span>
                                </span>
                              </div>

                              <div>
                                <span className="text-[10px] text-gray-400 uppercase font-bold block">Quantità Autorizzata</span>
                                <span className="text-sm font-bold text-gray-900 dark:text-white">
                                  {numberFormatter.format(depr.maxDepreciatedQuantity)} {item?.unit || 'cad'}
                                </span>
                                <span className="block text-[10px] text-gray-500">
                                  (Residuo: <strong className="text-emerald-600 dark:text-emerald-400">{numberFormatter.format(remainingQty)}</strong>)
                                </span>
                              </div>

                              <div>
                                <span className="text-[10px] text-emerald-700 dark:text-emerald-400 uppercase font-black block">Risparmio Conseguito</span>
                                <span className="text-sm font-mono font-black text-emerald-700 dark:text-emerald-400">
                                  {currencyFormatter.format(actualSaving)}
                                </span>
                                <span className="block text-[10px] text-gray-500">
                                  su max {currencyFormatter.format(maxPotentialSaving)}
                                </span>
                              </div>
                            </div>

                            {/* Barra di Avanzamento Utilizzo Quota Deprezzata */}
                            <div className="space-y-1">
                              <div className="flex justify-between items-center text-[10px] font-bold">
                                <span className="text-gray-600 dark:text-gray-400">
                                  Contabilizzato a prezzo deprezzato: {numberFormatter.format(usedQty)} di {numberFormatter.format(depr.maxDepreciatedQuantity)} {item?.unit || 'cad'} ({occurrences} misure)
                                </span>
                                <span className={remainingQty > 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-purple-600 dark:text-purple-400'}>
                                  {remainingQty > 0 ? `Disponibile: ${numberFormatter.format(remainingQty)} ${item?.unit || 'cad'}` : 'Quota interamente utilizzata'} ({pctUsed.toFixed(0)}%)
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 dark:bg-gray-700 h-2 rounded-full overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-300 ${remainingQty > 0 ? 'bg-amber-500' : 'bg-purple-600'}`}
                                  style={{ width: `${pctUsed}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}

                {/* MODALE INSERIMENTO / MODIFICA DETERMINA DEPREZZAMENTO (AMPIO E STRUTTURATO) */}
                {isDeprModalOpen && (
                  <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-hidden animate-fade-in">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-5xl h-[92vh] max-h-[900px] shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
                      {/* 1. TESTATA FISSA DEL MODALE */}
                      <div className="flex-shrink-0 p-4 md:px-6 md:py-4 bg-gradient-to-r from-amber-600 via-amber-700 to-indigo-700 text-white flex justify-between items-center shadow-sm">
                        <div className="min-w-0 pr-4">
                          <h3 className="text-base md:text-lg font-black uppercase tracking-tight flex items-center gap-2 truncate">
                            <span className="p-1 rounded-md bg-white/20">⚖️</span>
                            <span>{editingDeprId ? 'Modifica Atto di Deprezzamento Prezzo' : 'Nuovo Deprezzamento di Prezzo (Determina del RUP)'}</span>
                          </h3>
                          <p className="text-[11px] md:text-xs text-amber-100 mt-0.5 truncate">
                            Accettazione fornitura o lavorazione con riduzione del prezzo contrattuale (ex art. 114 D.Lgs. 36/2023)
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsDeprModalOpen(false)}
                          className="flex-shrink-0 text-white/80 hover:text-white hover:bg-white/10 rounded-full w-8 h-8 flex items-center justify-center text-lg transition-colors"
                          title="Chiudi"
                        >
                          ✕
                        </button>
                      </div>

                      {/* 2. FORM PRINCIPALE CON BODY SCROLLABILE E FOOTER BLOCCATO */}
                      <form onSubmit={handleSaveDepreciation} className="flex-1 flex flex-col min-h-0 overflow-hidden">
                        {/* CORPO DEL FORM SCROLLABILE */}
                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 min-h-0">
                          {formNotice && (
                            <div className="p-3 bg-red-50 dark:bg-red-950/60 border border-red-300 dark:border-red-800 text-red-800 dark:text-red-200 text-xs rounded-xl font-bold flex items-center gap-2">
                              <span>⚠️</span>
                              <span>{formNotice}</span>
                            </div>
                          )}

                          {/* 1. ESPLORATORE E SELEZIONE DELLA VOCE DAL COMPUTO METRICO */}
                          <div className="space-y-3 bg-gray-50/80 dark:bg-gray-900/40 p-4 rounded-2xl border border-gray-200 dark:border-gray-700">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div>
                                <label className="block text-xs font-black uppercase text-gray-800 dark:text-gray-200">
                                  1. Seleziona la Voce di Computo da Deprezzare:
                                </label>
                                <span className="text-[11px] text-gray-500 dark:text-gray-400">
                                  Sfoglia l'intero computo strutturato per categoria o cerca per codice/descrizione
                                </span>
                              </div>

                              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300">
                                {filteredDeprModalItems.length} di {allComputoItems.length} voci disponibili
                              </span>
                            </div>

                            {/* BARRA RICERCA E FILTRO CATEGORIA */}
                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                              <div className="sm:col-span-7 relative">
                                <input
                                  type="text"
                                  value={deprModalItemSearch}
                                  onChange={e => setDeprModalItemSearch(e.target.value)}
                                  placeholder="🔍 Cerca codice (es. OP.01), descrizione (es. intonaco, scavo)..."
                                  className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                                <svg className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                              </div>

                              <div className="sm:col-span-5">
                                <select
                                  value={deprModalCategoryFilter}
                                  onChange={e => setDeprModalCategoryFilter(e.target.value)}
                                  className="w-full px-3 py-2 text-xs font-semibold bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                                >
                                  <option value="all">📁 Tutte le Categorie ({allComputoItems.length} voci)</option>
                                  {computoCategories.map(cat => (
                                    <option key={cat.name} value={cat.name}>
                                      📁 {cat.name} ({cat.count} voci)
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {/* TABELLA SCROLLABILE DELLE VOCI DI COMPUTO */}
                            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-800 shadow-2xs">
                              <div className="max-h-60 overflow-y-auto">
                                <table className="w-full text-xs text-left border-collapse">
                                  <thead className="text-[10px] uppercase font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700/80 sticky top-0 z-10 border-b border-gray-200 dark:border-gray-600">
                                    <tr>
                                      <th className="px-3 py-2 w-32 border-r border-gray-200 dark:border-gray-600">Codice</th>
                                      <th className="px-3 py-2 w-44 border-r border-gray-200 dark:border-gray-600">Gruppo / Categoria</th>
                                      <th className="px-3 py-2 border-r border-gray-200 dark:border-gray-600">Descrizione Lavorazione</th>
                                      <th className="px-2 py-2 w-14 text-center border-r border-gray-200 dark:border-gray-600">U.M.</th>
                                      <th className="px-3 py-2 w-28 text-right border-r border-gray-200 dark:border-gray-600">Prezzo Contr.</th>
                                      <th className="px-3 py-2 w-24 text-right border-r border-gray-200 dark:border-gray-600">Q.tà Computo</th>
                                      <th className="px-2.5 py-2 w-24 text-center">Selezione</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {filteredDeprModalItems.length === 0 ? (
                                      <tr>
                                        <td colSpan={7} className="p-6 text-center text-gray-500 dark:text-gray-400">
                                          Nessuna voce trovata con i filtri impostati. Prova a modificare i termini di ricerca o la categoria.
                                        </td>
                                      </tr>
                                    ) : (
                                      filteredDeprModalItems.map(itm => {
                                        const isSelected = deprForm.articleCode === itm.articleCode;
                                        return (
                                          <tr
                                            key={itm.articleCode}
                                            onClick={() => {
                                              if (editingDeprId) return;
                                              setDeprForm(prev => ({
                                                ...prev,
                                                articleCode: itm.articleCode,
                                                maxDepreciatedQuantity: itm.totalQuantity.toString()
                                              }));
                                            }}
                                            className={`transition-colors cursor-pointer text-xs ${
                                              isSelected
                                                ? 'bg-indigo-50 dark:bg-indigo-950/60 font-semibold text-indigo-950 dark:text-indigo-100'
                                                : 'hover:bg-gray-50 dark:hover:bg-gray-700/40 text-gray-700 dark:text-gray-300'
                                            }`}
                                          >
                                            <td className="px-3 py-2 font-mono font-bold text-indigo-700 dark:text-indigo-300 border-r border-gray-200 dark:border-gray-700 align-top">
                                              {formatCodeWithComputoIndex(itm.articleCode, itm.originalIndex)}
                                            </td>
                                            <td className="px-3 py-2 text-[11px] text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700 align-top uppercase truncate max-w-[170px]" title={itm.groupName}>
                                              {itm.groupName}
                                            </td>
                                            <td className="px-3 py-2 text-gray-800 dark:text-gray-200 border-r border-gray-200 dark:border-gray-700 align-top leading-relaxed text-justify">
                                              {itm.description}
                                            </td>
                                            <td className="px-2 py-2 text-center font-mono text-gray-600 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700 align-top">
                                              {itm.unit}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono font-bold text-gray-800 dark:text-gray-200 border-r border-gray-200 dark:border-gray-700 align-top">
                                              {currencyFormatter.format(itm.unitPrice)}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono font-bold text-gray-700 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700 align-top">
                                              {numberFormatter.format(itm.totalQuantity)}
                                            </td>
                                            <td className="px-2.5 py-2 text-center align-top">
                                              {isSelected ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-600 text-white shadow-2xs">
                                                  ✓ Attiva
                                                </span>
                                              ) : (
                                                <button
                                                  type="button"
                                                  disabled={Boolean(editingDeprId)}
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setDeprForm(prev => ({
                                                      ...prev,
                                                      articleCode: itm.articleCode,
                                                      maxDepreciatedQuantity: itm.totalQuantity.toString()
                                                    }));
                                                  }}
                                                  className="px-2 py-0.5 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 rounded transition-colors"
                                                >
                                                  Seleziona
                                                </button>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            {/* SCHEDA RIASSUNTIVA VOCE SELEZIONATA */}
                            {(() => {
                              const itm = allComputoItems.find(i => i.articleCode === deprForm.articleCode);
                              if (!itm) return null;
                              return (
                                <div className="p-3.5 bg-gradient-to-r from-indigo-50 to-amber-50/50 dark:from-indigo-950/40 dark:to-amber-950/20 rounded-xl border border-indigo-200 dark:border-indigo-800 text-xs space-y-2">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono font-black text-sm text-indigo-700 dark:text-indigo-300 bg-white dark:bg-gray-800 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-700">
                                        {formatCodeWithComputoIndex(itm.articleCode, itm.originalIndex)}
                                      </span>
                                      <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                                        {itm.groupName}
                                      </span>
                                    </div>
                                    <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1">
                                      <span>✓</span> Voce pronta per la Determina di Deprezzamento
                                    </span>
                                  </div>

                                  <p className="text-gray-800 dark:text-gray-200 text-xs leading-relaxed font-medium bg-white/70 dark:bg-gray-800/70 p-2.5 rounded-lg border border-indigo-100 dark:border-indigo-900/40 text-justify">
                                    {itm.description}
                                  </p>

                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1 text-xs">
                                    <div className="bg-white/80 dark:bg-gray-800/80 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
                                      <span className="text-[10px] text-gray-400 uppercase font-bold block">Prezzo Contrattuale</span>
                                      <span className="font-mono font-black text-indigo-700 dark:text-indigo-300 text-sm">
                                        {currencyFormatter.format(itm.unitPrice)} <span className="text-xs font-normal text-gray-500">/ {itm.unit}</span>
                                      </span>
                                    </div>
                                    <div className="bg-white/80 dark:bg-gray-800/80 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
                                      <span className="text-[10px] text-gray-400 uppercase font-bold block">Q.tà a Computo</span>
                                      <span className="font-mono font-black text-gray-800 dark:text-gray-100 text-sm">
                                        {numberFormatter.format(itm.totalQuantity)} <span className="text-xs font-normal text-gray-500">{itm.unit}</span>
                                      </span>
                                    </div>
                                    <div className="bg-white/80 dark:bg-gray-800/80 p-2 rounded-lg border border-gray-200 dark:border-gray-700 col-span-2 sm:col-span-1">
                                      <span className="text-[10px] text-gray-400 uppercase font-bold block">Importo Totale Contratto</span>
                                      <span className="font-mono font-black text-gray-800 dark:text-gray-100 text-sm">
                                        {currencyFormatter.format(itm.totalQuantity * itm.unitPrice)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>

                          {/* 2. ESTREMI DETERMINA DEL RUP */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-black uppercase text-gray-700 dark:text-gray-300 mb-1.5">
                                2. Numero / Identificativo Determina RUP:
                              </label>
                              <input
                                type="text"
                                required
                                value={deprForm.determinaNumber}
                                onChange={e => setDeprForm({ ...deprForm, determinaNumber: e.target.value })}
                                placeholder="Es. Det. RUP n. 45/2024"
                                className="w-full p-2.5 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-black uppercase text-gray-700 dark:text-gray-300 mb-1.5">
                                Data Determina RUP:
                              </label>
                              <EuropeanDateInput
                                value={deprForm.determinaDate}
                                onChange={val => setDeprForm({ ...deprForm, determinaDate: val })}
                                className="w-full p-2.5 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                              />
                            </div>
                          </div>

                          {/* 3. MOTIVAZIONE TECNICA DEL PROVVEDIMENTO RUP */}
                          <div>
                            <label className="block text-xs font-black uppercase text-gray-700 dark:text-gray-300 mb-1.5">
                              3. Motivazione del Provvedimento RUP:
                            </label>
                            <textarea
                              required
                              rows={3}
                              value={deprForm.reason}
                              onChange={e => setDeprForm({ ...deprForm, reason: e.target.value })}
                              placeholder="Es. Fornitura con caratteristiche parzialmente difformi rispetto alle specifiche di progetto ma tecnicamente accettabili senza pregiudizio statico o funzionale dell'opera, autorizzata con riduzione di prezzo concordata..."
                              className="w-full p-2.5 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                          </div>

                          {/* 4. NUOVO PREZZO E QUANTITÀ MASSIMA */}
                          {(() => {
                            const itm = allComputoItems.find(i => i.articleCode === deprForm.articleCode);
                            const origPrice = itm?.unitPrice || 0;
                            const deprPrice = parseFloat(deprForm.depreciatedUnitPrice.replace(',', '.')) || 0;
                            const maxQty = parseFloat(deprForm.maxDepreciatedQuantity.replace(',', '.')) || 0;
                            const unitReduction = Math.max(0, origPrice - deprPrice);
                            const discountPct = origPrice > 0 ? (unitReduction / origPrice) * 100 : 0;
                            const totalOrig = maxQty * origPrice;
                            const totalDepr = maxQty * deprPrice;
                            const totalSavings = Math.max(0, totalOrig - totalDepr);

                            return (
                              <div className="space-y-4 pt-2 border-t border-gray-200 dark:border-gray-700">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  <div>
                                    <label className="block text-xs font-black uppercase text-amber-800 dark:text-amber-300 mb-1.5">
                                      4. Nuovo Prezzo Deprezzato (€ / {itm?.unit || 'cad'}):
                                    </label>
                                    <input
                                      type="text"
                                      required
                                      value={deprForm.depreciatedUnitPrice}
                                      onChange={e => setDeprForm({ ...deprForm, depreciatedUnitPrice: e.target.value })}
                                      placeholder="Es. 85.50"
                                      className="w-full p-2.5 text-xs font-mono font-black text-amber-900 dark:text-amber-100 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none"
                                    />
                                    {deprPrice > 0 && origPrice > 0 && (
                                      <span className={`block text-[11px] font-bold mt-1.5 ${deprPrice < origPrice ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600'}`}>
                                        {deprPrice < origPrice 
                                          ? `Riduzione: -${discountPct.toFixed(2)}% (-€ ${numberFormatter.format(unitReduction)} / ${itm?.unit})`
                                          : 'Attenzione: deve essere inferiore al prezzo contrattuale!'}
                                      </span>
                                    )}
                                  </div>

                                  <div>
                                    <label className="block text-xs font-black uppercase text-gray-700 dark:text-gray-300 mb-1.5">
                                      5. Quantità Massima Deprezzata ({itm?.unit || 'cad'}):
                                    </label>
                                    <input
                                      type="text"
                                      required
                                      value={deprForm.maxDepreciatedQuantity}
                                      onChange={e => setDeprForm({ ...deprForm, maxDepreciatedQuantity: e.target.value })}
                                      placeholder={itm ? `Max: ${numberFormatter.format(itm.totalQuantity)}` : 'Quantità...'}
                                      className="w-full p-2.5 text-xs font-mono font-bold bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                    />
                                    <span className="block text-[10px] text-gray-400 mt-1">
                                      Limite massimo di quantità che sarà possibile contabilizzare a questo prezzo scontato
                                    </span>
                                  </div>
                                </div>

                                {/* Quadro Economico Provvedimento */}
                                {deprPrice > 0 && maxQty > 0 && (
                                  <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200 dark:border-emerald-800 text-xs space-y-2">
                                    <span className="font-black text-emerald-900 dark:text-emerald-200 uppercase text-[11px] block">
                                      Quadro Economico del Deprezzamento:
                                    </span>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                                      <div className="bg-white/80 dark:bg-gray-800/80 p-2.5 rounded-xl border border-emerald-100 dark:border-emerald-900/60">
                                        <span className="text-[10px] text-gray-500 uppercase font-bold block">Prezzo Originario</span>
                                        <span className="font-mono font-bold text-gray-700 dark:text-gray-200">{currencyFormatter.format(totalOrig)}</span>
                                      </div>
                                      <div className="bg-white/80 dark:bg-gray-800/80 p-2.5 rounded-xl border border-amber-200 dark:border-amber-800">
                                        <span className="text-[10px] text-amber-700 dark:text-amber-400 uppercase font-bold block">Nuovo Valore Deprezzato</span>
                                        <span className="font-mono font-bold text-amber-800 dark:text-amber-300">{currencyFormatter.format(totalDepr)}</span>
                                      </div>
                                      <div className="bg-emerald-100/80 dark:bg-emerald-900/60 p-2.5 rounded-xl border border-emerald-300 dark:border-emerald-700">
                                        <span className="text-[10px] text-emerald-800 dark:text-emerald-300 uppercase font-black block">Risparmio Stazione Appaltante</span>
                                        <span className="font-mono font-black text-emerald-700 dark:text-emerald-300 text-sm">{currencyFormatter.format(totalSavings)}</span>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>

                        {/* 3. FOOTER FISSO DEL MODALE (SEMPRE VISIBILE IN BASSO) */}
                        <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-850 flex justify-end items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setIsDeprModalOpen(false)}
                            className="px-4 py-2 text-xs font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors"
                          >
                            Annulla
                          </button>
                          <button
                            type="submit"
                            className="px-6 py-2.5 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-lg shadow-indigo-600/30 transition-all active:scale-95 flex items-center gap-2 uppercase tracking-wider"
                          >
                            <span>Salva Atto di Deprezzamento</span>
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            )}
        </div>
    </div>
  );
};

export default AccountingView;
