
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ProjectDocument, ContractConfig, SalEntry, WorkGroup, PriceDepreciation } from '../types';
import { format as dfFormat, parseISO as dfParseISO, parse as dfParse, startOfDay, isAfter, endOfDay, isValid } from 'date-fns';
import { it } from 'date-fns/locale/it';
import { EuropeanDateInput } from './EuropeanDateInput';
import { createCurrencyFormatter, createNumberFormatter, createPercentFormatter, formatItalianNumber } from '../utils/formatters';

// Helper sicuro anti-RangeError per qualsiasi stringa data (ISO yyyy-MM-dd, europeo dd/MM/yyyy, Date o valori vuoti/non validi)
const parseISO = (val: any): Date => {
  if (val instanceof Date) {
    return isValid(val) ? val : new Date();
  }
  if (!val || typeof val !== 'string') {
    return new Date();
  }
  const trimmed = val.trim();
  if (!trimmed || trimmed.startsWith('0000')) {
    return new Date(2000, 0, 1);
  }
  try {
    const iso = dfParseISO(trimmed);
    if (isValid(iso)) return iso;
  } catch (e) {}

  const euFormats = ['dd/MM/yyyy', 'dd-MM-yyyy', 'yyyy-MM-dd', 'dd/MM/yy', 'd/M/yyyy'];
  for (const fmt of euFormats) {
    try {
      const parsed = dfParse(trimmed, fmt, new Date());
      if (isValid(parsed)) return parsed;
    } catch (e) {}
  }

  try {
    const native = new Date(trimmed);
    if (isValid(native)) return native;
  } catch (e) {}

  return new Date();
};

const format = (dateVal: any, pattern: string, options?: any): string => {
  try {
    const d = dateVal instanceof Date ? (isValid(dateVal) ? dateVal : parseISO('')) : parseISO(dateVal);
    if (!isValid(d)) return '-';
    return options ? dfFormat(d, pattern, options) : dfFormat(d, pattern);
  } catch (e) {
    return '-';
  }
};

const normalizeIsoDateString = (val?: string | null): string => {
  if (!val || typeof val !== 'string' || !val.trim()) {
    return dfFormat(new Date(), 'yyyy-MM-dd');
  }
  const d = parseISO(val);
  return isValid(d) ? dfFormat(d, 'yyyy-MM-dd') : dfFormat(new Date(), 'yyyy-MM-dd');
};


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

const currencyFormatter = createCurrencyFormatter(2, 2);
const numberFormatter = createNumberFormatter(2, 2);
const percentFormatter = createPercentFormatter(2, 2);
const formatPct = (val: number, decimals: number = 2): string => formatItalianNumber(val, decimals, decimals);

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

// Convertitore importo numerico in lettere secondo lo standard ministeriale ("diciottomilacento/00")
const intToItalianWords = (n: number): string => {
    if (n === 0) return 'zero';
    const ones = ['', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci', 'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove'];
    const tens = ['', '', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta'];

    const convertUnder1000 = (num: number): string => {
        if (num === 0) return '';
        let res = '';
        const h = Math.floor(num / 100);
        const rem = num % 100;
        const t = Math.floor(rem / 10);
        const u = rem % 10;

        if (h > 0) {
            res += (h === 1 ? 'cento' : ones[h] + 'cento');
            if (t === 8) res = res.slice(0, -1); // centottanta
        }
        if (rem > 0) {
            if (rem < 20) {
                res += ones[rem];
            } else {
                let tenWord = tens[t];
                if (u === 1 || u === 8) tenWord = tenWord.slice(0, -1); // ventuno, ventotto
                res += tenWord + (u === 3 ? 'tré' : ones[u]);
            }
        }
        return res;
    };

    let result = '';
    const millions = Math.floor(n / 1000000);
    const thousands = Math.floor((n % 1000000) / 1000);
    const rest = n % 1000;

    if (millions > 0) {
        result += (millions === 1 ? 'unmilione' : convertUnder1000(millions) + 'milioni');
    }
    if (thousands > 0) {
        result += (thousands === 1 ? 'mille' : convertUnder1000(thousands) + 'mila');
    }
    if (rest > 0) {
        result += convertUnder1000(rest);
    }
    return result;
};

const numberToItalianWords = (amount: number): string => {
    const absVal = Math.abs(round2(amount));
    const intPart = Math.floor(absVal);
    const cents = Math.round((absVal - intPart) * 100);
    const centsStr = cents.toString().padStart(2, '0');
    return `${amount < 0 ? 'meno ' : ''}${intToItalianWords(intPart)}/${centsStr}`;
};

interface AccountingEntry {
    id: string; 
    progressiveIndex: number; 
    librettoPage: number;
    registerOrderIndex?: number;
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
    progressiveIndex: number; // Num. ord. misura progressivo (N. LB.)
    librettoPage: number;     // Pagina del Libretto Unico
    registerOrderIndex: number; // Num. ord. Registro di Contabilità (RC / N. RG.)
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

interface SummarySalBreakdown {
    salNumber: number;
    salLabel: string;
    salDate?: string;
    prevSalDate?: string;
    quantity: number;
    amount: number;
    count: number;
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
    salBreakdown: SummarySalBreakdown[];
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
      contractLaborAmount: 0,
      municipalityName: 'STAZIONE APPALTANTE',
      provinceName: '',
      clientName: '',
      locationCity: '',
      contractRepertory: '',
      directorOfWorks: '',
      rupName: '',
      studioHeader: 'Ufficio di Direzione dei Lavori e Contabilità',
      inailPolicy: '',
      anticipationGrantedAmount: 0,
      roundCertificateTo100: false
  });

  useEffect(() => {
      onUpdateContractConfig(localConfig);
  }, [localConfig, onUpdateContractConfig]);

  const [activeSalId, setActiveSalId] = useState<string | null>(null);
  const [registerScope, setRegisterScope] = useState<'continuous' | 'sal'>('continuous');

  useEffect(() => {
      if (!activeSalId && sals.length > 0) {
          const sorted = [...sals].sort((a,b) => b.number - a.number);
          setActiveSalId(sorted[0].id);
      }
  }, [sals, activeSalId]);

  const [filters, setFilters] = useState({ code: '', wbs: '', description: '', dateFrom: '', dateTo: '' });
  const [activePopover, setActivePopover] = useState<string | null>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [summaryMode, setSummaryMode] = useState<'analytical' | 'synthetic'>('analytical');
  const [summaryGrouping, setSummaryGrouping] = useState<'standard_llpp' | 'grouped_by_wbs' | 'flat'>('standard_llpp');
  const [summarySalScope, setSummarySalScope] = useState<'cumulative' | 'current_sal'>('cumulative');
  const [deprModalItemSearch, setDeprModalItemSearch] = useState('');
  const [deprModalCategoryFilter, setDeprModalCategoryFilter] = useState('all');

  // Stato per il Modale di Emissione / Modifica Data SAL con Calendario di Supporto
  const [isSalModalOpen, setIsSalModalOpen] = useState(false);
  const [editingSalModalId, setEditingSalModalId] = useState<string | null>(null);
  const [salModalDate, setSalModalDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [salModalError, setSalModalError] = useState<string | null>(null);

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
            `-${formatPct(discountPct, 2)}%`,
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
                      const normD = normalizeIsoDateString(m.date);
                      if (!byDate[normD]) byDate[normD] = { totalValue: 0, ids: [], createdAt: 0 };
                      byDate[normD].totalValue += m.monetaryValue;
                      byDate[normD].ids.push(m.id);
                      const ts = m.createdAt || (mIdx + 1);
                      if (ts > byDate[normD].createdAt) byDate[normD].createdAt = ts;
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
                                  date: normalizeIsoDateString(m.date),
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
          const dateDiff = a.date.localeCompare(b.date);
          if (dateDiff !== 0) return dateDiff;
          const catRank = (e: AccountingEntry) => e.isSecurityCost ? 2 : (e.accountingType === 'body' ? 1 : 0);
          const rankDiff = catRank(a) - catRank(b);
          if (rankDiff !== 0) return rankDiff;
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
                      { header: 'N. ord. (LB)', dataKey: 'idx' },
                      { header: 'Data', dataKey: 'date' },
                      { header: 'WBS\nN. ord. (CM) - Codice', dataKey: 'code' },
                      { header: 'Descrizione e Note', dataKey: 'desc' },
                      { header: 'U.M.', dataKey: 'um' },
                      { header: 'Quantità', dataKey: 'qty' }
                  ];
                  const tempColumnStyles = {
                      idx: { halign: 'center', cellWidth: 18, fontStyle: 'bold' },
                      date: { halign: 'center', cellWidth: 22 },
                      code: { fontStyle: 'bold', cellWidth: 36 },
                      desc: { cellWidth: 72, halign: 'justify' },
                      um: { halign: 'center', cellWidth: 14 },
                      qty: { halign: 'right', cellWidth: 24 }
                  };
                  const tempRows = entries.map((e, i) => {
                      const cleanCode = (e.accountingType !== 'body' && e.originalIndex && e.originalIndex > 0)
                          ? `${e.originalIndex} - ${e.articleCode}`
                          : e.articleCode;
                      return {
                          idx: `${i + 1}`,
                          date: format(parseISO(e.date), 'dd/MM/yyyy'),
                          code: `${e.groupName}\n${cleanCode}`,
                          desc: `${e.description}${e.measurementNote ? '\nNote: ' + e.measurementNote : ''}`,
                          um: e.unit,
                          qty: e.accountingType === 'body' ? percentFormatter.format(e.quantity) : numberFormatter.format(e.quantity)
                      };
                  });
                  (tempDoc as any).autoTable({
                      columns: tempColumns,
                      body: tempRows,
                      startY: 32,
                      margin: { top: 32, bottom: 25, left: 12, right: 12 },
                      styles: { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak', font: 'helvetica', lineColor: [30, 64, 175], lineWidth: 0.2 },
                      headStyles: { fillColor: [219, 234, 254], textColor: [30, 58, 138], fontStyle: 'bold', halign: 'center', lineColor: [30, 64, 175], lineWidth: 0.35 },
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
              registerOrderIndex: actualIndex,
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
          bodyGroupsTotalValue,
          bodyPercentage,
          security, 
          worksBase: worksBaseTotal, 
          discount, 
          netWorksAfterDiscount,
          totalNet,
          entries: relevantEntries
      };
  };

  const salReferenceDate = useMemo(() => {
      if (activeSalId && activeSalId !== '__ALL__') {
          const sal = sals.find(s => s.id === activeSalId);
          return sal && sal.date ? normalizeIsoDateString(sal.date) : format(new Date(), 'yyyy-MM-dd');
      }
      const latestEntryDate = accountingRegistry.length > 0 ? accountingRegistry[accountingRegistry.length - 1].date : null;
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      if (latestEntryDate && latestEntryDate.localeCompare(todayStr) > 0) return latestEntryDate;
      return latestEntryDate || todayStr;
  }, [activeSalId, sals, accountingRegistry]);

  const effectiveCertSalObj = useMemo(() => {
      if (sals.length === 0) return null;
      if (activeSalId && activeSalId !== '__ALL__') {
          return sals.find(s => s.id === activeSalId) || null;
      }
      return [...sals].sort((a, b) => b.number - a.number)[0];
  }, [sals, activeSalId]);

  const effectiveCertSalDate = useMemo(() => {
      return effectiveCertSalObj ? normalizeIsoDateString(effectiveCertSalObj.date) : salReferenceDate;
  }, [effectiveCertSalObj, salReferenceDate]);

  const currentSalData = useMemo(() => calculateTotalsAtDate(salReferenceDate), [salReferenceDate, accountingRegistry, localConfig, documents]);
  const filteredRegistry = currentSalData.entries;

  const effectiveRegisterSalObj = (activeSalId && activeSalId !== '__ALL__')
      ? sals.find(s => s.id === activeSalId) || null
      : null;

  const activeRegisterEntries = useMemo(() => {
      const cutoffDate = (registerScope === 'sal' && effectiveRegisterSalObj)
          ? normalizeIsoDateString(effectiveRegisterSalObj.date)
          : '9999-12-31';
      const eligible = accountingRegistry.filter(e => e.date.localeCompare(cutoffDate) <= 0);
      let running = 0;
      return eligible.map((entry, idx) => {
          running = round2(running + entry.debit);
          return {
              ...entry,
              registerOrderIndex: idx + 1,
              runningProgressive: running
          };
      });
  }, [accountingRegistry, registerScope, effectiveRegisterSalObj]);

  const salCumulativeValuesMap = useMemo(() => {
      const map = new Map<string, number>();
      sals.forEach(sal => {
          const totals = calculateTotalsAtDate(sal.date);
          map.set(sal.id, totals.totalNet); 
      });
      return map;
  }, [sals, accountingRegistry, localConfig, documents]);

  const previousSalObject = useMemo(() => {
      if (!effectiveCertSalObj || sals.length === 0) return null;
      const sortedSals = [...sals].sort((a, b) => a.number - b.number);
      const activeIndex = sortedSals.findIndex(s => s.id === effectiveCertSalObj.id);
      if (activeIndex > 0) return sortedSals[activeIndex - 1];
      return null;
  }, [effectiveCertSalObj, sals]);

  const previousSalDate = useMemo(() => {
      if (!previousSalObject) return '0000-01-01';
      return normalizeIsoDateString(previousSalObject.date);
  }, [previousSalObject]);

  // Calcolo della catena storica di tutti i Certificati di Pagamento (SAL 1 .. SAL N) secondo lo standard LL.PP. / GeCoLa
  const allSalCertificates = useMemo(() => {
      const sortedAsc = [...sals].sort((a, b) => a.number - b.number);
      let runningPreviousCertifiedTotal = 0;

      return sortedAsc.map((s) => {
          const totals = calculateTotalsAtDate(s.date);
          const sommanoSoggettiARitenute = totals.netWorksAfterDiscount;
          const sommanoNonSoggettiARitenute = totals.security;
          const totalNetWorksAndSecurity = totals.totalNet;

          // Detrazioni cumulative a tutto il SAL s.number (standard LL.PP.)
          const cumRetention = round2(totalNetWorksAndSecurity * (localConfig.withholdingTaxPercent / 100));
          const cumAdvanceRecovery = round2(totalNetWorksAndSecurity * ((localConfig.advancePaymentPercent || 0) / 100));
          const prevCertsAmount = runningPreviousCertifiedTotal;
          const sommanoDetrazioni = round2(cumRetention + cumAdvanceRecovery + prevCertsAmount);

          const rawCreditoImpresa = Math.max(0, round2(totalNetWorksAndSecurity - sommanoDetrazioni));
          const creditoImpresa = localConfig.roundCertificateTo100
              ? Math.floor(rawCreditoImpresa / 100) * 100
              : rawCreditoImpresa;

          const vatAmount = round2(creditoImpresa * (localConfig.vatPercent / 100));
          const totalPayable = round2(creditoImpresa + vatAmount);

          runningPreviousCertifiedTotal = round2(runningPreviousCertifiedTotal + creditoImpresa);

          return {
              salId: s.id,
              number: s.number,
              salNumber: s.number,
              date: normalizeIsoDateString(s.date),
              sommanoSoggettiARitenute,
              sommanoNonSoggettiARitenute,
              totalNetWorksAndSecurity,
              cumRetention,
              cumAdvanceRecovery,
              prevCertsAmount,
              sommanoDetrazioni,
              rawCreditoImpresa,
              creditoImpresa,
              netCertificateAmount: creditoImpresa,
              vatAmount,
              totalPayable,
              cumulativeCertifiedAfterThis: runningPreviousCertifiedTotal
          };
      });
  }, [sals, accountingRegistry, localConfig, documents]);

  const paymentCertData = useMemo(() => {
      const certTotals = effectiveCertSalObj ? calculateTotalsAtDate(effectiveCertSalDate) : currentSalData;
      const currentNet = certTotals.totalNet;
      let previousNet = 0;
      if (previousSalObject) previousNet = salCumulativeValuesMap.get(previousSalObject.id) || 0;
      const rataAcconto = round2(currentNet - previousNet); 
      const retentionAmount = round2(rataAcconto * (localConfig.withholdingTaxPercent / 100));
      const advancePercent = localConfig.advancePaymentPercent || 0;
      const recoveryAmount = round2(rataAcconto * (advancePercent / 100));

      const currentSalNum = effectiveCertSalObj ? effectiveCertSalObj.number : 1;
      const previousCertificates = effectiveCertSalObj
          ? allSalCertificates.filter(c => c.number < effectiveCertSalObj.number)
          : [];
      const previousCertificatesTotal = round2(previousCertificates.reduce((acc, c) => acc + c.creditoImpresa, 0));
      const anticipationGranted = round2(localConfig.anticipationGrantedAmount || 0);

      // Calcolo secondo il prospetto cumulativo LL.PP.
      const sommanoSoggettiARitenute = certTotals.netWorksAfterDiscount;
      const sommanoNonSoggettiARitenute = certTotals.security;
      const cumRetentionAmount = round2(currentNet * (localConfig.withholdingTaxPercent / 100));
      const cumRecoveryAmount = round2(currentNet * (advancePercent / 100));
      const sommanoDetrazioni = round2(cumRetentionAmount + cumRecoveryAmount + previousCertificatesTotal);

      const rawTaxableCertified = round2(currentNet - sommanoDetrazioni);
      const taxableCertified = localConfig.roundCertificateTo100
          ? Math.floor(Math.max(0, rawTaxableCertified) / 100) * 100
          : rawTaxableCertified;
      const vatAmount = round2(taxableCertified * (localConfig.vatPercent / 100));
      const totalPayable = round2(taxableCertified + vatAmount);
      const diconsiText = numberToItalianWords(taxableCertified);

      return {
          currentSalNum,
          currentNet,
          previousNet,
          rataAcconto,
          retentionAmount,
          recoveryAmount,
          sommanoSoggettiARitenute,
          sommanoNonSoggettiARitenute,
          cumRetentionAmount,
          cumRecoveryAmount,
          previousCertificates,
          previousCertificatesTotal,
          anticipationGranted,
          sommanoDetrazioni,
          rawTaxableCertified,
          taxableCertified,
          vatAmount,
          totalPayable,
          diconsiText
      };
  }, [currentSalData, effectiveCertSalObj, effectiveCertSalDate, previousSalObject, salCumulativeValuesMap, localConfig, allSalCertificates]);

  // Generatore unificato delle righe cronologiche del Registro di Contabilità (condiviso al 100% tra Vista UI e Stampa PDF)
  const buildRegisterTimelineData = (visibleEntries: AccountingEntry[]) => {
      const fmtNum = (n: number) => numberFormatter.format(round2(n));
      const rows: any[] = [];
      let runningDebit = 0;
      let grandPaymentTotal = 0;

      const sortedCerts = (registerScope === 'sal' && effectiveRegisterSalObj)
          ? allSalCertificates.filter(c => c.number <= effectiveRegisterSalObj.number)
          : allSalCertificates;

      const getCatKey = (e: AccountingEntry) => e.isSecurityCost ? 'security' : (e.accountingType === 'body' ? 'body' : 'measure');
      const getCatTitle = (catKey: string) => {
          if (catKey === 'security') return 'COSTI SICUREZZA (SPECIALI)';
          if (catKey === 'body') {
              return `LAVORI A CORPO${currentSalData.bodyGroupsTotalValue > 0 ? `\n(Progetto euro ${fmtNum(currentSalData.bodyGroupsTotalValue)} - 100%)` : ''}`;
          }
          return 'LAVORI A MISURA';
      };

      const pushSegmentEntries = (segEntries: AccountingEntry[]) => {
          let currentCat: string | null = null;
          let segmentSum = 0;

          segEntries.forEach(e => {
              const cat = getCatKey(e);
              if (cat !== currentCat) {
                  currentCat = cat;
                  rows.push({
                      colOrd: '',
                      desc: getCatTitle(cat),
                      libNr: '', libPg: '', qtyPos: '', qtyNeg: '', price: '', debit: '', payment: '',
                      isSectionHeader: true,
                      rawCumulativeAmount: runningDebit
                  });
              }

              runningDebit = round2(runningDebit + e.debit);
              segmentSum = round2(segmentSum + e.debit);

              const codeLine = (e.accountingType !== 'body' && e.originalIndex && e.originalIndex > 0)
                  ? `N. CM. ${e.originalIndex} - ${e.articleCode}`
                  : e.articleCode;
              const dims = (e.accountingType !== 'body' && (e.factor !== undefined || e.length !== undefined || e.width !== undefined || e.height !== undefined))
                  ? ` ([${[
                      e.factor !== undefined ? `F:${numberFormatter.format(e.factor)}` : null,
                      e.length !== undefined ? `L:${numberFormatter.format(e.length)}` : null,
                      e.width !== undefined ? `l:${numberFormatter.format(e.width)}` : null,
                      e.height !== undefined ? `H:${numberFormatter.format(e.height)}` : null
                  ].filter(Boolean).join(' × ')}])`
                  : '';
              const qtyVal = e.accountingType === 'body' ? e.quantity * 100 : e.quantity;
              const posStr = qtyVal >= 0 ? numberFormatter.format(qtyVal) : '';
              const negStr = qtyVal < 0 ? numberFormatter.format(Math.abs(qtyVal)) : '';

              rows.push({
                  colOrd: `N. RG. ${e.registerOrderIndex}\n${codeLine}\n${format(parseISO(e.date), 'dd/MM/yyyy')}`,
                  desc: `${e.description}${e.measurementNote ? '\n' + e.measurementNote : ''}${dims}\nSOMMANO ${e.accountingType === 'body' ? '%' : e.unit}`,
                  libNr: `${e.progressiveIndex}`,
                  libPg: `${e.librettoPage}`,
                  qtyPos: posStr,
                  qtyNeg: negStr,
                  price: fmtNum(e.unitPrice),
                  debit: fmtNum(e.debit),
                  payment: '',
                  rawCumulativeAmount: runningDebit,
                  entry: e
              });
          });

          return segmentSum;
      };

      let certsIncludedCount = 0;

      if (sortedCerts.length > 0) {
          let remaining = [...visibleEntries];
          sortedCerts.forEach((cert, idx) => {
              const segEntries = remaining.filter(e => e.date.localeCompare(cert.date) <= 0);
              remaining = remaining.filter(e => e.date.localeCompare(cert.date) > 0);

              if (segEntries.length === 0 && runningDebit === 0) {
                  return;
              }

              if (idx > 0 && segEntries.length > 0) {
                  rows.push({
                      colOrd: '',
                      desc: `PROSECUZIONE CONTABILITÀ DOPO IL CERTIFICATO N. ${sortedCerts[idx - 1].number} (misure dal ${format(parseISO(segEntries[0].date), 'dd/MM/yyyy')})`,
                      libNr: '', libPg: '', qtyPos: '', qtyNeg: '', price: '', debit: '', payment: '',
                      isSectionHeader: true,
                      rawCumulativeAmount: runningDebit
                  });
              }

              pushSegmentEntries(segEntries);

              const hasFutureAfterThis = remaining.length > 0 || idx < sortedCerts.length - 1;
              rows.push({
                  colOrd: '',
                  desc: hasFutureAfterThis
                      ? `T O T A L E   a tutto il ${format(parseISO(cert.date), 'dd/MM/yyyy')} (S.A.L. n. ${cert.number})   euro`
                      : `T O T A L E   euro\n\nLavori a tutto il ${format(parseISO(cert.date), 'dd/MM/yyyy')} (S.A.L. n. ${cert.number})\n${localConfig.locationCity || 'Sede Lavori'}, ${format(parseISO(cert.date), 'dd/MM/yyyy')}\nL'Impresa: ${localConfig.contractorName || '____________________'}   |   Il Direttore dei Lavori: ${localConfig.directorOfWorks || '____________________'}`,
                  libNr: '', libPg: '', qtyPos: '', qtyNeg: '', price: '',
                  debit: fmtNum(runningDebit),
                  payment: '',
                  isSubtotalRow: true,
                  rawCumulativeAmount: runningDebit
              });

              certsIncludedCount++;
              grandPaymentTotal = round2(grandPaymentTotal + cert.creditoImpresa);
              rows.push({
                  colOrd: '',
                  desc: `In data ${format(parseISO(cert.date), 'dd/MM/yyyy')} è stato emesso il CERTIFICATO DI PAGAMENTO n. ${cert.number} per un importo di euro\n   Il Direttore dei Lavori: ${localConfig.directorOfWorks || '____________________'}`,
                  libNr: '', libPg: '', qtyPos: '', qtyNeg: '', price: '', debit: '',
                  payment: fmtNum(cert.creditoImpresa),
                  isCertNoteRow: true,
                  rawCumulativeAmount: runningDebit
              });
          });

          if (remaining.length > 0) {
              const lastCert = sortedCerts[sortedCerts.length - 1];
              rows.push({
                  colOrd: '',
                  desc: `PROSECUZIONE CONTABILITÀ OLTRE IL CERTIFICATO N. ${lastCert.number} (misure dal ${format(parseISO(remaining[0].date), 'dd/MM/yyyy')})`,
                  libNr: '', libPg: '', qtyPos: '', qtyNeg: '', price: '', debit: '', payment: '',
                  isSectionHeader: true,
                  rawCumulativeAmount: runningDebit
              });

              pushSegmentEntries(remaining);

              const lastDateStr = remaining[remaining.length - 1].date;
              rows.push({
                  colOrd: '',
                  desc: `T O T A L E   P R O G R E S S I V O   euro\n\nLavori contabilizzati a tutto il ${format(parseISO(lastDateStr), 'dd/MM/yyyy')}\n${localConfig.locationCity || 'Sede Lavori'}, ${format(parseISO(lastDateStr), 'dd/MM/yyyy')}\nL'Impresa: ${localConfig.contractorName || '____________________'}   |   Il Direttore dei Lavori: ${localConfig.directorOfWorks || '____________________'}`,
                  libNr: '', libPg: '', qtyPos: '', qtyNeg: '', price: '',
                  debit: fmtNum(runningDebit),
                  payment: '',
                  isSubtotalRow: true,
                  rawCumulativeAmount: runningDebit
              });
          }
      } else if (visibleEntries.length > 0) {
          pushSegmentEntries(visibleEntries);
          rows.push({
              colOrd: '',
              desc: `T O T A L E   euro\n\nLavori a tutto il ${format(parseISO(salReferenceDate), 'dd/MM/yyyy')} (S.A.L. n. 1 - Bozza)\n${localConfig.locationCity || 'Sede Lavori'}, ${format(parseISO(salReferenceDate), 'dd/MM/yyyy')}\nL'Impresa: ${localConfig.contractorName || '____________________'}   |   Il Direttore dei Lavori: ${localConfig.directorOfWorks || '____________________'}`,
              libNr: '', libPg: '', qtyPos: '', qtyNeg: '', price: '',
              debit: fmtNum(runningDebit),
              payment: '',
              isSubtotalRow: true,
              rawCumulativeAmount: runningDebit
          });

          certsIncludedCount = 1;
          grandPaymentTotal = round2(paymentCertData.taxableCertified);
          rows.push({
              colOrd: '',
              desc: `In data ${format(parseISO(salReferenceDate), 'dd/MM/yyyy')} è stato emesso il CERTIFICATO DI PAGAMENTO n. 1 per un importo di euro\n   Il Direttore dei Lavori: ${localConfig.directorOfWorks || '____________________'}`,
              libNr: '', libPg: '', qtyPos: '', qtyNeg: '', price: '', debit: '',
              payment: fmtNum(grandPaymentTotal),
              isCertNoteRow: true,
              rawCumulativeAmount: runningDebit
          });
      }

      return {
          rows,
          grandTotal: runningDebit,
          grandPaymentTotal,
          certsIncludedCount
      };
  };

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

  // Informazioni cronologiche sulle misure registrate a Libretto (Prima misura, Ultima misura, Date distinte)
  const measurementDatesMeta = useMemo(() => {
      if (accountingRegistry.length === 0) {
          return {
              earliestDate: null as string | null,
              latestDate: null as string | null,
              totalMeasurements: 0,
              byDate: [] as { date: string; count: number; totalDebit: number }[]
          };
      }
      const dateMap = new Map<string, { count: number; totalDebit: number }>();
      let minD = accountingRegistry[0].date;
      let maxD = accountingRegistry[0].date;
      accountingRegistry.forEach(e => {
          if (e.date.localeCompare(minD) < 0) minD = e.date;
          if (e.date.localeCompare(maxD) > 0) maxD = e.date;
          const cur = dateMap.get(e.date) || { count: 0, totalDebit: 0 };
          cur.count += 1;
          cur.totalDebit = round2(cur.totalDebit + e.debit);
          dateMap.set(e.date, cur);
      });
      const byDate = Array.from(dateMap.entries())
          .map(([date, info]) => ({ date, count: info.count, totalDebit: info.totalDebit }))
          .sort((a, b) => a.date.localeCompare(b.date));
      return {
          earliestDate: minD,
          latestDate: maxD,
          totalMeasurements: accountingRegistry.length,
          byDate
      };
  }, [accountingRegistry]);

  // Funzione che determina in quale SAL ricade una determinata data di misura:
  // - SAL N. 1: tutte le misure con data <= Data SAL 1
  // - SAL N. k (k > 1): tutte le misure con data > Data SAL (k-1) e <= Data SAL k
  const getSalAssignmentForDate = useMemo(() => {
      const sortedAsc = [...sals].sort((a, b) => a.number - b.number);
      return (dateStr: string): { salNumber: number; salLabel: string; salDate?: string; prevSalDate?: string; isOutOfBounds: boolean } => {
          if (sortedAsc.length === 0) {
              return { salNumber: 1, salLabel: 'SAL N. 1', isOutOfBounds: false };
          }
          for (let i = 0; i < sortedAsc.length; i++) {
              const s = sortedAsc[i];
              const prevS = i > 0 ? sortedAsc[i - 1] : undefined;
              if (dateStr.localeCompare(s.date) <= 0) {
                  return {
                      salNumber: s.number,
                      salLabel: `SAL N. ${s.number}`,
                      salDate: s.date,
                      prevSalDate: prevS?.date,
                      isOutOfBounds: false
                  };
              }
          }
          const lastSal = sortedAsc[sortedAsc.length - 1];
          return {
              salNumber: lastSal.number + 1,
              salLabel: `Oltre SAL N. ${lastSal.number}`,
              prevSalDate: lastSal.date,
              isOutOfBounds: true
          };
      };
  }, [sals]);

  const accountingSummary = useMemo(() => {
      const summaryMap = new Map<string, SummaryEntry>();
      const sortedSalsAsc = [...sals].sort((a, b) => a.number - b.number);
      const activeSalObj = sals.find(s => s.id === activeSalId);
      const currentSalNumber = activeSalObj?.number ?? (sortedSalsAsc.length > 0 ? sortedSalsAsc[sortedSalsAsc.length - 1].number : 1);

      // Popoliamo esclusivamente le voci effettivamente misurate e contabilizzate a libretto fino a salReferenceDate
      accountingRegistry
        .filter(e => {
            if (e.date.localeCompare(salReferenceDate) > 0) return false;
            if (summarySalScope === 'current_sal' && activeSalId && previousSalObject) {
                return e.date.localeCompare(previousSalDate) > 0;
            }
            return true;
        })
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
                  salBreakdown: [],
                  residualQuantity: 0,
                  residualAmount: 0
              });
          }
          const current = summaryMap.get(entry.articleCode)!;
          const isCurrentPeriod = entry.date.localeCompare(previousSalDate) > 0;
          const salAssign = getSalAssignmentForDate(entry.date);
          const isPreviousSal = !isCurrentPeriod && currentSalNumber > 1;

          const lineAmount = round2(entry.quantity * entry.unitPrice);
          const lineItem: SummaryMeasurementLine = {
              id: entry.id,
              progressiveIndex: entry.progressiveIndex,
              librettoPage: entry.librettoPage,
              registerOrderIndex: entry.registerOrderIndex || entry.progressiveIndex,
              date: entry.date,
              salNumber: salAssign.salNumber,
              salLabel: salAssign.salLabel,
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

          // Calcolo ripartizione della voce sui singoli SAL
          const breakdownMap = new Map<number, SummarySalBreakdown>();
          item.allLines.forEach(l => {
              const sNum = l.salNumber || 1;
              const sObj = sortedSalsAsc.find(s => s.number === sNum);
              const sIdx = sortedSalsAsc.findIndex(s => s.number === sNum);
              const prevSObj = sIdx > 0 ? sortedSalsAsc[sIdx - 1] : undefined;
              const existing = breakdownMap.get(sNum) || {
                  salNumber: sNum,
                  salLabel: l.salLabel || `SAL N. ${sNum}`,
                  salDate: sObj?.date,
                  prevSalDate: prevSObj?.date,
                  quantity: 0,
                  amount: 0,
                  count: 0
              };
              existing.quantity = Math.round((existing.quantity + l.quantity) * 1000) / 1000;
              existing.amount = round2(existing.amount + l.amount);
              existing.count += 1;
              breakdownMap.set(sNum, existing);
          });
          const salBreakdown = Array.from(breakdownMap.values()).sort((a, b) => a.salNumber - b.salNumber);

          return {
              ...item,
              estimatedQuantity: estimated,
              progressPercent,
              salBreakdown,
              residualQuantity,
              residualAmount
          };
      }).filter(item => item.allLines.length > 0).sort((a, b) => {
          if (a.originalIndex !== undefined && b.originalIndex !== undefined && a.originalIndex !== b.originalIndex) {
              return a.originalIndex - b.originalIndex;
          }
          return a.articleCode.localeCompare(b.articleCode);
      });
  }, [accountingRegistry, salReferenceDate, previousSalDate, previousSalObject, summarySalScope, boqTotals, sals, activeSalId, getSalAssignmentForDate]);

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

  // Apertura modale creazione Nuovo SAL con proposta intelligente ma data 100% manuale
  const handleAddNewSal = () => {
      const sortedAsc = [...sals].sort((a, b) => a.number - b.number);
      const prevSal = sortedAsc.length > 0 ? sortedAsc[sortedAsc.length - 1] : null;
      const latestMeas = measurementDatesMeta.latestDate;
      const todayStr = format(new Date(), 'yyyy-MM-dd');

      let suggestedDate = latestMeas || todayStr;
      if (prevSal && suggestedDate.localeCompare(prevSal.date) <= 0) {
          // Se l'ultima misura o oggi è <= alla data dell'ultimo SAL, proponiamo il giorno successivo all'ultimo SAL (o oggi se > prevSal.date)
          if (todayStr.localeCompare(prevSal.date) > 0) {
              suggestedDate = todayStr;
          } else {
              const nextDay = new Date(parseISO(prevSal.date).getTime() + 86400000);
              suggestedDate = format(nextDay, 'yyyy-MM-dd');
          }
      }

      setEditingSalModalId(null);
      setSalModalDate(suggestedDate);
      setSalModalError(null);
      setIsSalModalOpen(true);
  };

  // Apertura modale modifica data di un SAL esistente (accetta sia oggetto SalEntry sia ID stringa)
  const handleOpenEditSalDateModal = (salOrId: SalEntry | string) => {
      const sal = typeof salOrId === 'string' ? sals.find(s => s.id === salOrId) : salOrId;
      if (!sal) return;
      if (sal.isLocked) {
          alert("Questo SAL è bloccato (🔒). Sbloccalo prima di modificarne la data.");
          return;
      }
      setEditingSalModalId(sal.id);
      setSalModalDate(normalizeIsoDateString(sal.date));
      setSalModalError(null);
      setIsSalModalOpen(true);
  };

  // Conferma creazione o aggiornamento data SAL dal modale con calendario
  const handleConfirmSalModal = (e: React.FormEvent) => {
      e.preventDefault();
      setSalModalError(null);

      if (!salModalDate) {
          setSalModalError("Seleziona una data valida per il SAL.");
          return;
      }

      const sortedAsc = [...sals].sort((a, b) => a.number - b.number);

      if (editingSalModalId) {
          const targetIdx = sortedAsc.findIndex(s => s.id === editingSalModalId);
          if (targetIdx === -1) return;
          const prevSal = targetIdx > 0 ? sortedAsc[targetIdx - 1] : null;
          const nextSal = targetIdx < sortedAsc.length - 1 ? sortedAsc[targetIdx + 1] : null;

          if (prevSal && salModalDate.localeCompare(prevSal.date) <= 0) {
              setSalModalError(`La data del SAL N. ${sortedAsc[targetIdx].number} deve essere successiva alla data del SAL N. ${prevSal.number} (${format(parseISO(prevSal.date), 'dd/MM/yyyy')}).`);
              return;
          }
          if (nextSal && salModalDate.localeCompare(nextSal.date) >= 0) {
              setSalModalError(`La data del SAL N. ${sortedAsc[targetIdx].number} deve essere antecedente alla data del SAL N. ${nextSal.number} (${format(parseISO(nextSal.date), 'dd/MM/yyyy')}).`);
              return;
          }

          handleUpdateSalDate(editingSalModalId, salModalDate);
          setIsSalModalOpen(false);
          setEditingSalModalId(null);
      } else {
          const nextNumber = sortedAsc.length > 0 ? sortedAsc[sortedAsc.length - 1].number + 1 : 1;
          const prevSal = sortedAsc.length > 0 ? sortedAsc[sortedAsc.length - 1] : null;

          if (prevSal && salModalDate.localeCompare(prevSal.date) <= 0) {
              setSalModalError(`La data del nuovo SAL N. ${nextNumber} deve essere strettamente successiva alla data del SAL N. ${prevSal.number} (${format(parseISO(prevSal.date), 'dd/MM/yyyy')}).`);
              return;
          }

          const totalsAtDate = calculateTotalsAtDate(salModalDate);
          const newSal: SalEntry = {
              id: crypto.randomUUID(),
              number: nextNumber,
              date: salModalDate,
              description: `SAL N. ${nextNumber} a tutto il ${format(parseISO(salModalDate), 'dd/MM/yyyy')}`,
              totalAmount: totalsAtDate.totalNet,
              isLocked: false
          };
          onUpdateSals([...sals, newSal]);
          setActiveSalId(newSal.id);
          setIsSalModalOpen(false);
      }
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
      if (!newDate) return;
      const sortedAsc = [...sals].sort((a, b) => a.number - b.number);
      const targetIdx = sortedAsc.findIndex(s => s.id === id);
      if (targetIdx !== -1) {
          const prevSal = targetIdx > 0 ? sortedAsc[targetIdx - 1] : null;
          const nextSal = targetIdx < sortedAsc.length - 1 ? sortedAsc[targetIdx + 1] : null;
          if (prevSal && newDate.localeCompare(prevSal.date) <= 0) {
              alert(`La data del SAL N. ${sortedAsc[targetIdx].number} deve essere successiva a quella del SAL N. ${prevSal.number} (${format(parseISO(prevSal.date), 'dd/MM/yyyy')}).`);
              return;
          }
          if (nextSal && newDate.localeCompare(nextSal.date) >= 0) {
              alert(`La data del SAL N. ${sortedAsc[targetIdx].number} deve essere antecedente a quella del SAL N. ${nextSal.number} (${format(parseISO(nextSal.date), 'dd/MM/yyyy')}).`);
              return;
          }
      }
      const totalsAtDate = calculateTotalsAtDate(newDate);
      onUpdateSals(sals.map(s => s.id === id ? {
          ...s,
          date: newDate,
          totalAmount: totalsAtDate.totalNet,
          description: `SAL N. ${s.number} a tutto il ${format(parseISO(newDate), 'dd/MM/yyyy')}`
      } : s));
  };

  const handleToggleSalLock = (id: string) => {
      onUpdateSals(sals.map(s => s.id === id ? { ...s, isLocked: !s.isLocked } : s));
  };

  // Generatore PDF Vettoriale Certificato di Pagamento conforme allo standard Ministeriale LL.PP. / GeCoLa
  const generatePaymentCertVectorPdf = () => {
    setIsGeneratingPdf(true);
    try {
      const doc = new jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth(); // 210
      const salNum = paymentCertData.currentSalNum;
      const salDateStr = format(parseISO(effectiveCertSalDate), 'dd/MM/yyyy');
      const fmtNum = (n: number) => numberFormatter.format(round2(n));

      const muniName = localConfig.municipalityName || 'STAZIONE APPALTANTE';
      const provName = localConfig.provinceName || '';
      const clientName = localConfig.clientName || localConfig.municipalityName || 'Amministrazione Committente';
      const contractorName = localConfig.contractorName || 'Impresa Appaltatrice';
      const city = localConfig.locationCity || 'Sede Lavori';
      const director = localConfig.directorOfWorks || 'Il Direttore dei Lavori';
      const rup = localConfig.rupName || 'Il Responsabile del Procedimento';
      const contractDateFormatted = localConfig.contractDate ? format(parseISO(localConfig.contractDate), 'dd/MM/yyyy') : '___/___/______';
      const repertoryInfo = localConfig.contractRepertory || (localConfig.contractCode ? `CIG/CUP ${localConfig.contractCode}` : 'repertorio agli atti');

      // 1. Stemma / Intestazione Ente
      doc.setDrawColor(30, 64, 175);
      doc.setLineWidth(0.5);
      doc.rect(18, 12, 16, 18);
      doc.line(26, 12, 26, 30);
      doc.line(18, 21, 34, 21);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.setTextColor(30, 58, 138);
      doc.text(muniName, 40, 19);
      if (provName) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.setTextColor(30, 41, 59);
        doc.text(provName, 40, 25);
      }

      // 2. Oggetto, Committente, Impresa
      doc.setFontSize(8.5);
      doc.setTextColor(20, 20, 20);
      doc.setFont('helvetica', 'bold');
      doc.text('OGGETTO:', 38, 36, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      const objLines = doc.splitTextToSize(projectName || 'Lavori in appalto', 150);
      doc.text(objLines, 41, 36);

      const yAfterObj = 36 + Math.max(1, objLines.length) * 4.2 + 2;
      doc.setFont('helvetica', 'bold');
      doc.text('COMMITTENTE:', 38, yAfterObj, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.text(clientName, 41, yAfterObj);

      doc.setFont('helvetica', 'bold');
      doc.text('IMPRESA:', 38, yAfterObj + 5, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.text(contractorName, 41, yAfterObj + 5);

      // 3. Titolo Certificato di Pagamento
      const titleY = yAfterObj + 15;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14.5);
      doc.setTextColor(30, 58, 138);
      doc.text(`CERTIFICATO DI PAGAMENTO N. ${salNum}`, pageWidth / 2 + 5, titleY, { align: 'center' });
      doc.setFontSize(10.5);
      doc.setTextColor(20, 20, 20);
      doc.text(`PER IL PAGAMENTO DELLA RATA N. ${salNum} DI euro ${fmtNum(paymentCertData.taxableCertified)}`, pageWidth / 2 + 5, titleY + 5.5, { align: 'center' });

      // 4. Layout a 2 Colonne GeCoLa Azzurrino
      const leftX = 12;
      const leftW = 56;
      const topTableY = titleY + 11;
      const bottomBoxY = 278;

      // Testalino CERTIFICATI PRECEDENTI in azzurrino GeCoLa
      doc.setFillColor(219, 234, 254);
      doc.setDrawColor(30, 64, 175);
      doc.setLineWidth(0.5);
      doc.rect(leftX, topTableY, leftW, bottomBoxY - topTableY);
      doc.rect(leftX, topTableY, leftW, 6, 'FD');

      doc.setFillColor(239, 246, 255);
      doc.rect(leftX, topTableY + 6, leftW, 5, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(30, 58, 138);
      doc.text('CERTIFICATI PRECEDENTI', leftX + leftW / 2, topTableY + 4.3, { align: 'center' });

      const col1W = 7;
      const col2W = 22;
      doc.line(leftX + col1W, topTableY + 6, leftX + col1W, topTableY + 135);
      doc.line(leftX + col1W + col2W, topTableY + 6, leftX + col1W + col2W, topTableY + 141);

      doc.setFontSize(7.5);
      doc.text('n.', leftX + col1W / 2, topTableY + 9.6, { align: 'center' });
      doc.text('data', leftX + col1W + col2W / 2, topTableY + 9.6, { align: 'center' });
      doc.text('importo', leftX + col1W + col2W + (leftW - col1W - col2W) / 2, topTableY + 9.6, { align: 'center' });

      // 25 righe numerate (1..25) con i certificati precedenti compilati
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(20, 20, 20);
      doc.setFontSize(7.2);
      const maxCertRows = 25;
      const rowH = 4.8;
      for (let r = 1; r <= maxCertRows; r++) {
        const ry = topTableY + 11 + r * rowH;
        doc.setTextColor(60, 60, 60);
        doc.text(`${r}`, leftX + col1W - 1.2, ry - 1, { align: 'right' });
        const foundPrev = paymentCertData.previousCertificates.find(c => c.number === r);
        if (foundPrev) {
          doc.setTextColor(10, 10, 10);
          doc.text(format(parseISO(foundPrev.date), 'dd/MM/yyyy'), leftX + col1W + col2W / 2, ry - 1, { align: 'center' });
          doc.text(fmtNum(foundPrev.creditoImpresa), leftX + leftW - 1.5, ry - 1, { align: 'right' });
        }
      }

      const totRowY = topTableY + 135;
      doc.setDrawColor(30, 64, 175);
      doc.line(leftX, totRowY, leftX + leftW, totRowY);
      doc.line(leftX, totRowY + 6, leftX + leftW, totRowY + 6);
      doc.line(leftX, totRowY + 12, leftX + leftW, totRowY + 12);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(20, 20, 20);
      doc.text('TOTALE', leftX + col1W + col2W - 1.5, totRowY + 4.2, { align: 'right' });
      doc.text(fmtNum(paymentCertData.previousCertificatesTotal), leftX + leftW - 1.5, totRowY + 4.2, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.text('anticipazione', leftX + col1W + col2W - 1.5, totRowY + 10.2, { align: 'right' });
      doc.text(fmtNum(localConfig.anticipationGrantedAmount || 0), leftX + leftW - 1.5, totRowY + 10.2, { align: 'right' });

      // ASSICURAZIONE OPERAI
      const assY = totRowY + 20;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(30, 58, 138);
      doc.text('ASSICURAZIONE OPERAI', leftX + leftW / 2, assY, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(20, 20, 20);
      const inailText = `L'Impresa ha assicurato gli operai con Polizza continuativa presso l'INAIL ${localConfig.inailPolicy || `di ${city}`}`;
      const inailLines = doc.splitTextToSize(inailText, leftW - 4);
      doc.text(inailLines, leftX + 2, assY + 7);
      doc.line(leftX + 2, assY + 20, leftX + leftW - 2, assY + 20);

      // Firma Direttore dei Lavori nella colonna sinistra
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.text('Il Direttore dei Lavori', leftX + leftW / 2, bottomBoxY - 18, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      doc.text(director, leftX + leftW / 2, bottomBoxY - 14, { align: 'center' });

      // 5. Colonna Destra (x = 73..198)
      const rightX = 73;
      const rightEnd = 198;
      const valColW = 34;
      const valColX = rightEnd - valColW;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(20, 20, 20);
      doc.text('IL SOTTOSCRITTO,', rightX, topTableY + 4);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      const preambleText = `VISTO: il Contratto in data ${contractDateFormatted} ${repertoryInfo} con il quale fu affidata alla predetta impresa l'esecuzione dei suindicati lavori;\nRISULTANDO dalla contabilità sino ad oggi che l'ammontare dei lavori eseguiti e delle spese fatte è quello in seguito riportato:`;
      const preambleLines = doc.splitTextToSize(preambleText, rightEnd - rightX);
      doc.text(preambleLines, rightX, topTableY + 11);

      // Tabella importi colonna destra (stile GeCoLa Azzurrino)
      let curY = topTableY + 30;
      doc.setDrawColor(30, 64, 175);
      doc.setLineWidth(0.4);

      // Blocco 1: Lavori e somministrazioni (Misura + Corpo - Ribasso)
      const box1StartY = curY;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.8);
      doc.text('Lavori a misura eseguiti', valColX - 3, curY + 4.5, { align: 'right' });
      doc.text(fmtNum(paymentCertData.sommanoSoggettiARitenute > 0 ? calculateTotalsAtDate(effectiveCertSalDate).measureTotal : 0), rightEnd - 2, curY + 4.5, { align: 'right' });
      curY += 5.5;

      const certTotalsSnapshot = calculateTotalsAtDate(effectiveCertSalDate);
      if (certTotalsSnapshot.bodyTotal > 0) {
        doc.text('Lavori a corpo eseguiti', valColX - 3, curY + 4.5, { align: 'right' });
        doc.text(fmtNum(certTotalsSnapshot.bodyTotal), rightEnd - 2, curY + 4.5, { align: 'right' });
        curY += 5.5;
      }

      if (localConfig.discountPercent > 0) {
        doc.text(`Ribasso d'asta del ${numberFormatter.format(localConfig.discountPercent)}% su euro ${fmtNum(certTotalsSnapshot.worksBase)}`, valColX - 3, curY + 4.5, { align: 'right' });
        doc.text(`-${fmtNum(certTotalsSnapshot.discount)}`, rightEnd - 2, curY + 4.5, { align: 'right' });
        curY += 5.5;
      } else {
        curY += 4;
      }

      doc.rect(valColX, box1StartY, valColW, curY - box1StartY);

      // Riga SOMMANO importi soggetti a ritenute euro
      doc.setFillColor(239, 246, 255);
      doc.rect(valColX, curY, valColW, 6.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.text('SOMMANO importi soggetti a ritenute euro', valColX - 3, curY + 4.5, { align: 'right' });
      doc.text(fmtNum(paymentCertData.sommanoSoggettiARitenute), rightEnd - 2, curY + 4.5, { align: 'right' });
      curY += 6.5;

      // Blocco 2: IMPORTI NON SOGGETTI A RITENUTE (Oneri Sicurezza)
      const box2StartY = curY;
      doc.setFont('helvetica', 'normal');
      doc.text('IMPORTI NON SOGGETTI A RITENUTE (Oneri Sicurezza)', valColX - 3, curY + 5, { align: 'right' });
      if (paymentCertData.sommanoNonSoggettiARitenute > 0) {
        doc.text(fmtNum(paymentCertData.sommanoNonSoggettiARitenute), rightEnd - 2, curY + 5, { align: 'right' });
      }
      curY += 10;
      doc.rect(valColX, box2StartY, valColW, curY - box2StartY);

      // Riga SOMMANO importi NON soggetti a ritenute euro
      doc.setFillColor(239, 246, 255);
      doc.rect(valColX, curY, valColW, 6.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.text('SOMMANO importi NON soggetti a ritenute euro', valColX - 3, curY + 4.5, { align: 'right' });
      doc.text(fmtNum(paymentCertData.sommanoNonSoggettiARitenute), rightEnd - 2, curY + 4.5, { align: 'right' });
      curY += 6.5;

      // Header DETRAZIONI nella colonna valori in azzurrino GeCoLa
      doc.setFillColor(219, 234, 254);
      doc.rect(valColX, curY, valColW, 6, 'FD');
      doc.setTextColor(30, 58, 138);
      doc.text('DETRAZIONI', valColX + valColW / 2, curY + 4.2, { align: 'center' });
      doc.setTextColor(20, 20, 20);
      curY += 6;

      // Blocco Detrazioni
      const box3StartY = curY;
      doc.setFont('helvetica', 'normal');
      doc.text(`Ritenuta per infortuni ${localConfig.withholdingTaxPercent}%`, valColX - 3, curY + 5.5, { align: 'right' });
      doc.text(fmtNum(paymentCertData.cumRetentionAmount), rightEnd - 2, curY + 5.5, { align: 'right' });
      curY += 5.5;

      if ((localConfig.advancePaymentPercent || 0) > 0) {
        doc.text(`Recupero anticipazione ${localConfig.advancePaymentPercent}%`, valColX - 3, curY + 5.5, { align: 'right' });
        doc.text(fmtNum(paymentCertData.cumRecoveryAmount), rightEnd - 2, curY + 5.5, { align: 'right' });
        curY += 5.5;
      }

      curY += 12;
      doc.text('Ammontare dei certificati precedenti euro', valColX - 3, curY + 4.5, { align: 'right' });
      doc.text(fmtNum(paymentCertData.previousCertificatesTotal), rightEnd - 2, curY + 4.5, { align: 'right' });
      curY += 6;
      doc.rect(valColX, box3StartY, valColW, curY - box3StartY);

      // SOMMANO LE DETRAZIONI euro
      doc.setFont('helvetica', 'bold');
      doc.text('SOMMANO LE DETRAZIONI euro', valColX - 3, curY + 4.5, { align: 'right' });
      doc.rect(valColX, curY, valColW, 6.5);
      doc.text(fmtNum(paymentCertData.sommanoDetrazioni), rightEnd - 2, curY + 4.5, { align: 'right' });
      curY += 6.5;

      // CREDITO Impresa
      doc.text(
        localConfig.roundCertificateTo100 ? 'CREDITO Impresa arrotondato a 100 euro' : 'CREDITO Impresa (Rata netta certificata) euro',
        valColX - 3,
        curY + 4.8,
        { align: 'right' }
      );
      doc.rect(valColX, curY, valColW, 7);
      doc.text(fmtNum(paymentCertData.taxableCertified), rightEnd - 2, curY + 4.8, { align: 'right' });
      curY += 7;

      // I.V.A.
      doc.setFont('helvetica', 'normal');
      doc.text(`per I.V.A. al ${localConfig.vatPercent}%`, valColX - 3, curY + 4.5, { align: 'right' });
      doc.rect(valColX, curY, valColW, 6.5);
      doc.text(fmtNum(paymentCertData.vatAmount), rightEnd - 2, curY + 4.5, { align: 'right' });
      curY += 6.5;

      // TOTALE GENERALE euro
      doc.setFont('helvetica', 'bold');
      doc.text('T O T A L E   G E N E R A L E   euro', valColX - 3, curY + 5, { align: 'right' });
      doc.rect(valColX, curY, valColW, 7.5);
      doc.text(fmtNum(paymentCertData.totalPayable), rightEnd - 2, curY + 5, { align: 'right' });
      curY += 15;

      // CERTIFICA
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.text('C E R T I F I C A', (rightX + rightEnd) / 2, curY, { align: 'center' });
      curY += 8;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const certBody = `CHE ai termini del capitolato speciale d'appalto si può pagare all'impresa la rata di euro ${fmtNum(paymentCertData.taxableCertified)} oltre IVA, se dovuta, come per legge.\nDiconsi: (euro ${paymentCertData.diconsiText}).`;
      const certLines = doc.splitTextToSize(certBody, rightEnd - rightX);
      doc.text(certLines, rightX, curY);
      curY += certLines.length * 4.5 + 10;

      // Data e Firma RUP
      doc.text(`${city}, ${salDateStr}`, rightX, curY);
      doc.text('Il Responsabile del Procedimento', rightEnd - 28, curY + 6, { align: 'center' });
      doc.setFont('helvetica', 'bold');
      doc.text(rup, rightEnd - 28, curY + 10.5, { align: 'center' });

      doc.save(`${projectName?.replace(/[^a-z0-9]/gi, '_') || 'Progetto'}_Certificato_Pagamento_SAL_${salNum}.pdf`);
    } catch (err) {
      console.error(err);
      alert("Errore durante la generazione del PDF del Certificato di Pagamento.");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Disegna il Frontespizio Standard GeCoLa (con banda azzurrina GeCoLa laterale, Stemma, Oggetto, Committente, Impresa e Firme)
  const drawGeCoLaCoverPage = (
    doc: any,
    pageWidth: number,
    pageHeight: number,
    docTitleMain: string,
    docTitleSub: string,
    accentSubtitle: string,
    signerRole: string,
    signerName: string
  ) => {
    const margin = 12;
    const boxW = pageWidth - margin * 2;
    const boxH = pageHeight - margin * 2;
    const headerH = 38;
    const footerH = 14;
    const accentColW = 42;

    doc.setDrawColor(30, 64, 175);
    doc.setLineWidth(0.35);
    doc.rect(margin, margin, boxW, boxH);

    // Fascia Azzurrina GeCoLa Sinistra (tra header e footer)
    const bodyTop = margin + headerH;
    const bodyH = boxH - headerH - footerH;
    doc.setFillColor(219, 234, 254);
    doc.rect(margin, bodyTop, accentColW, bodyH, 'FD');

    // Linee divisorie orizzontali Header e Footer (testalino superiore & testalino inferiore in azzurrino chiaro)
    doc.setFillColor(239, 246, 255);
    doc.rect(margin, margin + boxH - footerH, boxW, footerH, 'FD');
    doc.line(margin, bodyTop, margin + boxW, bodyTop);
    doc.line(margin + accentColW, margin + boxH - footerH, margin + accentColW, margin + boxH);

    // Stemma + Nome Ente nell'Header
    doc.setLineWidth(0.5);
    doc.rect(margin + 10, margin + 7, 18, 22);
    doc.line(margin + 19, margin + 7, margin + 19, margin + 29);
    doc.line(margin + 10, margin + 18, margin + 28, margin + 18);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(30, 58, 138);
    doc.text(localConfig.municipalityName || 'STAZIONE APPALTANTE', margin + 44, margin + 18);
    if (localConfig.provinceName) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(12);
      doc.text(localConfig.provinceName, margin + 44, margin + 25);
    }

    // "pag. 1" in alto a destra nel corpo
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(30, 58, 138);
    doc.text('pag. 1', margin + boxW - 4, bodyTop + 5, { align: 'right' });

    // Titolo Principale Blu GeCoLa
    const rightX = margin + accentColW + 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(29, 78, 216);
    doc.text(docTitleMain, rightX, bodyTop + 30);
    if (docTitleSub) {
      doc.setFontSize(17);
      doc.text(docTitleSub, rightX, bodyTop + 39);
    }

    // Etichette nella colonna azzurrina e valori a destra
    const yObj = bodyTop + 54;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 58, 138);
    doc.text('OGGETTO:', margin + accentColW - 2, yObj, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(20, 20, 20);
    const objLines = doc.splitTextToSize(projectName || 'Lavori in appalto', boxW - accentColW - 10);
    doc.text(objLines, rightX, yObj);

    const yComm = yObj + Math.max(2, objLines.length) * 5 + 8;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 58, 138);
    doc.text('COMMITTENTE:', margin + accentColW - 2, yComm, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(20, 20, 20);
    doc.text(localConfig.clientName || localConfig.municipalityName || 'Amministrazione Committente', rightX, yComm);

    const yImp = yComm + 12;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 58, 138);
    doc.text('IMPRESA:', margin + accentColW - 2, yImp, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(20, 20, 20);
    doc.text(localConfig.contractorName || 'Impresa Appaltatrice', rightX, yImp);

    // Sottotitolo Blu GeCoLa
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(30, 58, 138);
    doc.text(accentSubtitle, rightX, yImp + 16);

    // Blocco Firma in basso a destra
    const sigY = margin + boxH - footerH - 26;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    doc.text(signerRole, margin + boxW - 45, sigY, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.text(signerName, margin + boxW - 45, sigY + 5, { align: 'center' });

    // Footer Studio Tecnico
    const footY = margin + boxH - footerH;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(30, 58, 138);
    doc.text('DIREZIONE LAVORI', margin + accentColW / 2, footY + 8, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 58, 138);
    doc.text(localConfig.studioHeader || 'Ufficio di Direzione dei Lavori e Contabilità', rightX, footY + 6);
    doc.setFontSize(7.5);
    doc.text(
      `Contratto: ${localConfig.contractCode ? `CIG/CUP ${localConfig.contractCode}` : 'Agli atti'} • Data stampa: ${format(new Date(), 'dd/MM/yyyy')}`,
      rightX,
      footY + 11
    );
  };

  const generateAccountingPdf = (type: 'libretto' | 'register' | 'summary') => {
    setIsGeneratingPdf(true);
    try {
      const orientation = type === 'register' ? 'landscape' : 'portrait';
      const doc = new jspdf.jsPDF({ orientation, unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const sal = (activeSalId && activeSalId !== '__ALL__') ? sals.find(s => s.id === activeSalId) : undefined;
      const salNum = sal?.number || (sals.length > 0 ? Math.max(...sals.map(s => s.number)) : 1);
      const fmtNum = (n: number) => numberFormatter.format(round2(n));

      const titles = {
        libretto: 'Libretto delle Misure',
        register: 'Registro di Contabilità',
        summary: 'Sommario del Registro di Contabilità'
      };

      // Pagina 1: Frontespizio Standard GeCoLa
      if (type === 'summary') {
        drawGeCoLaCoverPage(
          doc,
          pageWidth,
          pageHeight,
          'SOMMARIO',
          "REGISTRO DI CONTABILITA'",
          `Sommario Registro di Contabilità al S.A.L. n. ${salNum}`,
          'IL DIRETTORE DEI LAVORI',
          localConfig.directorOfWorks || 'Il Direttore dei Lavori'
        );
      } else if (type === 'register') {
        const regSubtitle = (registerScope === 'continuous' || activeSalId === '__ALL__')
          ? `Registro Continuo Cronologico (aggiornato al ${format(parseISO(salReferenceDate), 'dd/MM/yyyy')})`
          : `Registro di Contabilità a tutto il S.A.L. n. ${salNum} (${format(parseISO(salReferenceDate), 'dd/MM/yyyy')})`;
        drawGeCoLaCoverPage(
          doc,
          pageWidth,
          pageHeight,
          "REGISTRO DI CONTABILITA'",
          '',
          regSubtitle,
          'IL RESPONSABILE DEL PROCEDIMENTO',
          localConfig.rupName || 'Il Responsabile del Procedimento'
        );
      } else {
        drawGeCoLaCoverPage(
          doc,
          pageWidth,
          pageHeight,
          'LIBRETTO DELLE MISURE',
          '',
          `Libretto Unico delle Misure a tutto il S.A.L. n. ${salNum} (${format(parseISO(salReferenceDate), 'dd/MM/yyyy')})`,
          'IL DIRETTORE DEI LAVORI',
          localConfig.directorOfWorks || 'Il Direttore dei Lavori'
        );
      }

      doc.addPage();

      let columns: any[] = [];
      let rows: any[] = [];
      let columnStyles: any = {};
      let grandTotal = 0;
      let grandPaymentTotal = 0;

      if (type === 'libretto') {
        // IMPORTANTE: Manteniamo identiche le geometrie di autoTable per il Libretto Unico per preservare la corrispondenza 1:1 Pag. X di Y
        columns = [
          { header: 'N. ord. (LB)', dataKey: 'idx' },
          { header: 'Data', dataKey: 'date' },
          { header: 'WBS\nN. ord. (CM) - Codice', dataKey: 'code' },
          { header: 'Descrizione e Note', dataKey: 'desc' },
          { header: 'U.M.', dataKey: 'um' },
          { header: 'Quantità', dataKey: 'qty' }
        ];
        columnStyles = {
          idx: { halign: 'center', cellWidth: 18, fontStyle: 'bold' },
          date: { halign: 'center', cellWidth: 22 },
          code: { fontStyle: 'bold', cellWidth: 36 },
          desc: { cellWidth: 72, halign: 'justify' },
          um: { halign: 'center', cellWidth: 14 },
          qty: { halign: 'right', cellWidth: 24 }
        };
        rows = filteredLibretto.filter(applyFilters).map(e => {
          const cleanCode = (e.accountingType !== 'body' && e.originalIndex && e.originalIndex > 0)
            ? `${e.originalIndex} - ${e.articleCode}`
            : e.articleCode;
          return {
            idx: `${e.progressiveIndex}`,
            date: format(parseISO(e.date), 'dd/MM/yyyy'),
            code: `${e.groupName}\n${cleanCode}`,
            desc: `${e.description}${e.measurementNote ? '\nNote: ' + e.measurementNote : ''}`,
            um: e.unit,
            qty: e.accountingType === 'body' ? percentFormatter.format(e.quantity) : numberFormatter.format(e.quantity),
            rawCumulativeAmount: 0
          };
        });
      } else if (type === 'register') {
        // REGISTRO DI CONTABILITÀ STANDARD GECOLA LL.PP.
        columns = [
          { header: 'Num.Ord.\nTARIFFA\nD A T A', dataKey: 'colOrd' },
          { header: 'INDICAZIONE DEI LAVORI\nE DELLE\nSOMMINISTRAZIONI', dataKey: 'desc' },
          { header: 'libretto\nNr', dataKey: 'libNr' },
          { header: 'libretto\nPg', dataKey: 'libPg' },
          { header: 'Quantità/Perc.\nPositivi', dataKey: 'qtyPos' },
          { header: 'Quantità/Perc.\nNegativi', dataKey: 'qtyNeg' },
          { header: 'PREZZO\nunitario', dataKey: 'price' },
          { header: 'I M P O R T I\nDebito', dataKey: 'debit' },
          { header: 'I M P O R T I\nPagamento', dataKey: 'payment' }
        ];
        columnStyles = {
          colOrd: { halign: 'left', cellWidth: 28, fontSize: 7 },
          desc: { cellWidth: 123, halign: 'justify', fontSize: 7.5 },
          libNr: { halign: 'center', cellWidth: 11, fontStyle: 'bold' },
          libPg: { halign: 'center', cellWidth: 11 },
          qtyPos: { halign: 'right', cellWidth: 20 },
          qtyNeg: { halign: 'right', cellWidth: 18 },
          price: { halign: 'right', cellWidth: 20 },
          debit: { halign: 'right', cellWidth: 21, fontStyle: 'bold' },
          payment: { halign: 'right', cellWidth: 21, fontStyle: 'bold' }
        };

        const visibleEntries = activeRegisterEntries.filter(applyFilters);
        const timeline = buildRegisterTimelineData(visibleEntries);
        rows = timeline.rows;
        grandTotal = timeline.grandTotal;
        grandPaymentTotal = timeline.grandPaymentTotal;
      } else if (type === 'summary') {
        // SOMMARIO DEL REGISTRO DI CONTABILITÀ STANDARD GECOLA LL.PP.
        columns = [
          { header: 'Num.Ord.\nTARIFFA', dataKey: 'colOrd' },
          { header: 'INDICAZIONE DEI LAVORI\nE DELLE\nSOMMINISTRAZIONI', dataKey: 'desc' },
          { header: 'rif.\nSAL', dataKey: 'refSal' },
          { header: 'rif.\nRC / LB', dataKey: 'refRc' },
          { header: 'Quantità', dataKey: 'qty' },
          { header: 'IMPORTI\nunitario', dataKey: 'price' },
          { header: 'IMPORTI\nTOTALE', dataKey: 'amount' }
        ];
        columnStyles = {
          colOrd: { halign: 'left', cellWidth: 23, fontSize: 7, fontStyle: 'bold' },
          desc: { cellWidth: 79, halign: 'justify', fontSize: 7.5 },
          refSal: { halign: 'center', cellWidth: 10, fontStyle: 'bold' },
          refRc: { halign: 'center', cellWidth: 16, fontSize: 6.8 },
          qty: { halign: 'right', cellWidth: 18 },
          price: { halign: 'right', cellWidth: 19 },
          amount: { halign: 'right', cellWidth: 21, fontStyle: 'bold' }
        };

        const visibleItems = accountingSummary.filter(applyFilters);
        let runningSum = 0;
        rows = [];
        let globalSmIdx = 0;

        const pushSummarySection = (sectionTitle: string, sectionItems: SummaryEntry[], isBodySection: boolean = false) => {
          if (sectionItems.length === 0) return;
          rows.push({
            colOrd: '',
            desc: sectionTitle,
            refSal: '',
            refRc: '',
            qty: '',
            price: '',
            amount: '',
            isSectionHeader: true,
            rawCumulativeAmount: runningSum
          });

          let sectionSubtotal = 0;
          sectionItems.forEach((item) => {
            globalSmIdx++;
            const fmtQty = (q: number) => item.accountingType === 'body' ? numberFormatter.format(q * 100) : numberFormatter.format(q);
            const allLines = item.allLines || [...item.previousLines, ...item.currentLines];
            const formattedItemCode = formatCodeWithComputoIndex(item.articleCode, item.originalIndex, item.accountingType);

            // 1. Riga Intestazione Voce (senza dati ridondanti a destra)
            rows.push({
              colOrd: `${globalSmIdx}\n${formattedItemCode}`,
              desc: item.description,
              refSal: '',
              refRc: '',
              qty: '',
              price: '',
              amount: '',
              rawCumulativeAmount: runningSum
            });

            // 2. Righe Misure con SAL | RC | Quantità | TOTALE riga
            if (summaryMode === 'analytical') {
              allLines.forEach(line => {
                rows.push({
                  colOrd: '',
                  desc: line.measurementNote && line.measurementNote !== item.description ? `   ${line.measurementNote}` : '',
                  refSal: `${line.salNumber || 1}`,
                  refRc: `${line.registerOrderIndex}\n(LB.${line.progressiveIndex}/P.${line.librettoPage})`,
                  qty: fmtQty(line.quantity),
                  price: '',
                  amount: fmtNum(line.amount),
                  rawCumulativeAmount: runningSum
                });
              });
            }

            // 3. Riga SOMMANO al S.A.L. n. X
            runningSum = round2(runningSum + item.totalAmount);
            sectionSubtotal = round2(sectionSubtotal + item.totalAmount);
            const salBreakdownNote = (item.salBreakdown && item.salBreakdown.length > 1)
              ? `\n[${item.salBreakdown.map(sb => `${sb.salLabel}: ${fmtQty(sb.quantity)} ${item.unit} = € ${fmtNum(sb.amount)}`).join(' | ')}]`
              : '';
            const bodyAliquotaPct = (isBodySection && currentSalData.bodyGroupsTotalValue > 0)
              ? `\n(${formatPct((item.totalAmount / currentSalData.bodyGroupsTotalValue) * 100, 3)}%)`
              : '';
            const bodyPriceAliquotaPct = (isBodySection && currentSalData.bodyGroupsTotalValue > 0)
              ? `\n(${formatPct((item.unitPrice / currentSalData.bodyGroupsTotalValue) * 100, 3)}%)`
              : '';

            rows.push({
              colOrd: '',
              desc: `SOMMANO al S.A.L. n. ${salNum} ${item.accountingType === 'body' ? '%' : item.unit}${isBodySection ? '\naliquote' : ''}${salBreakdownNote}`,
              refSal: summaryMode === 'synthetic' ? item.salBreakdown.map(s => s.salNumber).join(',') : '',
              refRc: summaryMode === 'synthetic' ? allLines.map(l => l.registerOrderIndex).join(',') : '',
              qty: fmtQty(item.totalQuantity),
              price: `${fmtNum(item.unitPrice)}${bodyPriceAliquotaPct}`,
              amount: `${fmtNum(item.totalAmount)}${bodyAliquotaPct}`,
              isSommanoRow: true,
              rawCumulativeAmount: runningSum
            });
          });

          const sectionAliquota = (isBodySection && currentSalData.bodyGroupsTotalValue > 0)
            ? `\n(${formatPct((sectionSubtotal / currentSalData.bodyGroupsTotalValue) * 100, 3)}%)`
            : '';
          rows.push({
            colOrd: '',
            desc: isBodySection ? `Parziale LAVORI A CORPO euro\naliquota` : `Parziale ${sectionTitle.split('\n')[0]} euro`,
            refSal: '',
            refRc: '',
            qty: '',
            price: '',
            amount: `${fmtNum(sectionSubtotal)}${sectionAliquota}`,
            isSubtotalRow: true,
            rawCumulativeAmount: runningSum
          });
        };

        const measureItems = visibleItems.filter(i => i.accountingType === 'measure' && !i.isSecurityCost);
        const bodyItems = visibleItems.filter(i => i.accountingType === 'body' && !i.isSecurityCost);
        const securityItems = visibleItems.filter(i => i.isSecurityCost);

        pushSummarySection('LAVORI A MISURA', measureItems, false);
        pushSummarySection(
          `LAVORI A CORPO${currentSalData.bodyGroupsTotalValue > 0 ? `\n(Progetto euro ${fmtNum(currentSalData.bodyGroupsTotalValue)} - 100%)` : ''}`,
          bodyItems,
          true
        );
        pushSummarySection('COSTI SICUREZZA (SPECIALI)', securityItems, false);

        grandTotal = runningSum;

        if (grandTotal > 0) {
          rows.push({
            colOrd: '',
            desc: `T O T A L E   euro\n\n${localConfig.locationCity || 'Sede Lavori'}, ${format(parseISO(salReferenceDate), 'dd/MM/yyyy')}\n\nIl Direttore dei Lavori\n${localConfig.directorOfWorks || '____________________'}`,
            refSal: '',
            refRc: '',
            qty: '',
            price: '',
            amount: fmtNum(grandTotal),
            isSubtotalRow: true,
            rawCumulativeAmount: grandTotal
          });
        }
      }

      // Render Tabella AutoTable (Tema GeCoLa Azzurrino ovunque, geometria invariata per Libretto)
      (doc as any).autoTable({
        columns: columns,
        body: rows,
        startY: 32,
        margin: { top: 32, bottom: 25, left: 12, right: 12 },
        styles: {
          fontSize: 7.5,
          cellPadding: 2,
          overflow: 'linebreak',
          font: type === 'libretto' ? 'helvetica' : 'times',
          lineColor: [30, 64, 175],
          lineWidth: 0.2
        },
        headStyles: {
          fillColor: [219, 234, 254],
          textColor: [30, 58, 138],
          fontStyle: 'bold',
          halign: 'center',
          lineColor: [30, 64, 175],
          lineWidth: 0.35
        },
        columnStyles: columnStyles,
        didParseCell: (data: any) => {
          if (data.section === 'body' && data.row.raw) {
            if (data.row.raw.isSectionHeader) {
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.halign = 'center';
              data.cell.styles.fillColor = [224, 242, 254];
              data.cell.styles.textColor = [30, 58, 138];
            } else if (data.row.raw.isCertNoteRow) {
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.fillColor = [239, 246, 255];
              data.cell.styles.textColor = [30, 58, 138];
            } else if (data.row.raw.isSommanoRow) {
              data.cell.styles.fontStyle = 'bold';
              if (data.column.dataKey === 'desc') {
                data.cell.styles.halign = 'right';
              }
            } else if (data.row.raw.isSubtotalRow) {
              data.cell.styles.fontStyle = 'bold';
              data.cell.styles.fillColor = [239, 246, 255];
              if (data.column.dataKey === 'desc') {
                data.cell.styles.halign = 'right';
              }
            }
          }
        },
        didDrawPage: () => {
          // Intestazione superiore (testalino GeCoLa)
          doc.setFontSize(8.5);
          doc.setFont('times', 'bold');
          doc.setTextColor(30, 58, 138);
          doc.text(localConfig.studioHeader || `${projectName || 'Progetto'}`, 12, 13);
          doc.setFont('times', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(30, 41, 59);
          doc.text(`${titles[type]} - S.A.L. n. ${salNum} a tutto il ${format(parseISO(salReferenceDate), 'dd/MM/yyyy')}`, 12, 18);

          doc.setDrawColor(30, 64, 175);
          doc.setLineWidth(0.5);
          doc.line(12, 20.5, pageWidth - 12, 20.5);

          // Piè di pagina istituzionale GeCoLa
          doc.setFontSize(7.5);
          doc.setTextColor(40, 40, 40);
          doc.text(`COMMITTENTE: ${localConfig.clientName || localConfig.municipalityName || projectName || ''}`, 12, pageHeight - 10);
          doc.text(`${titles[type].toUpperCase()} N. ${salNum}`, 12, pageHeight - 6);
          if (type === 'register') {
            doc.text("L'IMPRESA", pageWidth * 0.35, pageHeight - 6, { align: 'center' });
            doc.text('IL RESPONSABILE DEL PROCEDIMENTO', pageWidth * 0.65, pageHeight - 6, { align: 'center' });
          }
        }
      });

      // Post-Processing: R I P O R T O / A R I P O R T A R E e Paginazione
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
        const docPage = p + 1; // pagina 1 è il Frontespizio
        if (docPage > totalDocPages) break;
        doc.setPage(docPage);

        if (tablePagesCount > 1 && type !== 'libretto') {
          // R I P O R T O a inizio pagina in azzurrino GeCoLa
          if (p > 1) {
            const prevCum = getPageCumulative(p - 1);
            doc.setFillColor(219, 234, 254);
            doc.setDrawColor(30, 64, 175);
            doc.setLineWidth(0.35);
            doc.rect(12, 23, pageWidth - 24, 6.5, 'FD');

            doc.setFont('times', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(30, 58, 138);
            doc.text('R I P O R T O', pageWidth / 2, 27.3, { align: 'center' });

            doc.setFontSize(8.5);
            doc.setTextColor(15, 23, 42);
            doc.text(fmtNum(prevCum), pageWidth - 15, 27.3, { align: 'right' });
          }

          // A   R I P O R T A R E a fine pagina in azzurrino GeCoLa
          if (p < tablePagesCount) {
            const currCum = getPageCumulative(p);
            doc.setFillColor(219, 234, 254);
            doc.setDrawColor(30, 64, 175);
            doc.setLineWidth(0.35);
            doc.rect(12, pageHeight - 21, pageWidth - 24, 6.5, 'FD');

            doc.setFont('times', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(30, 58, 138);
            doc.text('A   R I P O R T A R E', pageWidth / 2, pageHeight - 16.7, { align: 'center' });

            doc.setFontSize(8.5);
            doc.setTextColor(15, 23, 42);
            doc.text(fmtNum(currCum), pageWidth - 15, pageHeight - 16.7, { align: 'right' });
          }
        }

        // Ultima pagina del Registro: A R I P O R T A R E con Debito e Pagamento in azzurrino GeCoLa
        if (p === tablePagesCount && type === 'register' && grandTotal > 0) {
          doc.setFillColor(219, 234, 254);
          doc.setDrawColor(30, 64, 175);
          doc.setLineWidth(0.4);
          doc.rect(12, pageHeight - 21, pageWidth - 24, 6.5, 'FD');

          doc.setFont('times', 'bold');
          doc.setFontSize(8);
          doc.setTextColor(30, 58, 138);
          doc.text('A   R I P O R T A R E', pageWidth / 2, pageHeight - 16.7, { align: 'center' });

          doc.setFontSize(8.5);
          doc.setTextColor(15, 23, 42);
          doc.text(fmtNum(grandTotal), pageWidth - 35, pageHeight - 16.7, { align: 'right' });
          if (grandPaymentTotal > 0) {
            doc.text(fmtNum(grandPaymentTotal), pageWidth - 14, pageHeight - 16.7, { align: 'right' });
          }
        }

        // Paginazione: per il Libretto Unico manteniamo "Pag. p di tablePagesCount" a fondo pagina per corrispondenza 1:1
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(30, 58, 138);
        if (type === 'libretto') {
          doc.text(`Pag. ${p} di ${tablePagesCount}`, pageWidth - 12, pageHeight - 8, { align: 'right' });
        } else {
          doc.text(`pag. ${p + 1}`, pageWidth - 12, 18, { align: 'right' });
          doc.text(`Pag. ${p} di ${tablePagesCount}`, pageWidth - 12, pageHeight - 6, { align: 'right' });
        }
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
          subtitle: (registerScope === 'continuous' || activeSalId === '__ALL__')
              ? `Registro Continuo Cronologico (tutte le misure${sals.length > 0 ? ` • ${sals.length} Certificati emessi` : ''})`
              : `Situazione progressiva a tutto il ${format(parseISO(salReferenceDate), 'dd/MM/yyyy')} (SAL N. ${sals.find(s => s.id === activeSalId)?.number || 'Bozza'})`,
          badge: 'Documento Contabile Progressivo'
      },
      summary: {
          title: 'Sommario del Registro di Contabilità',
          subtitle: `Riepilogo progressivo per articolo a tutto il SAL N. ${(activeSalId && activeSalId !== '__ALL__' ? sals.find(s => s.id === activeSalId)?.number : (sals.length > 0 ? Math.max(...sals.map(s => s.number)) : 'Bozza'))} (${format(parseISO(salReferenceDate), 'dd/MM/yyyy')})`,
          badge: 'Sommario Progressivo'
      },
      sal_technical: {
          title: 'Stato Avanzamento Lavori (Riepilogo)',
          subtitle: (activeSalId && activeSalId !== '__ALL__') ? `SAL N. ${sals.find(s => s.id === activeSalId)?.number} al ${format(parseISO(salReferenceDate), 'dd/MM/yyyy')}` : 'Visualizzazione completa',
          badge: 'Quadro Tecnico Contabile'
      },
      payment_cert: {
          title: 'Certificato di Pagamento',
          subtitle: `Rata di Acconto N. ${paymentCertData.currentSalNum} al ${format(parseISO(effectiveCertSalDate), 'dd/MM/yyyy')}`,
          badge: 'Liquidazione Rata'
      },
      depreciation: {
          title: 'Deprezzamento di Prezzo (Determina del RUP)',
          subtitle: 'Atti autorizzativi di riduzione prezzi e gestione quote ex art. 114 D.Lgs. 36/2023',
          badge: 'Atti Amministrativi RUP'
      },
      settings: {
          title: 'Impostazioni Contratto & Gestione SAL',
          subtitle: (activeSalId && activeSalId !== '__ALL__') ? `SAL attivo: N. ${sals.find(s => s.id === activeSalId)?.number} (${format(parseISO(salReferenceDate), 'dd/MM/yyyy')})` : 'Configurazione parametri contrattuali',
          badge: 'Configurazione Contabile'
      }
  };

  const currentMeta = tabMeta[activeTab];

  return (
    <div className="h-full flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* Barra superiore compatta unificata */}
        <div className="flex flex-wrap justify-between items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/90 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div className="flex items-center gap-3 min-w-0">
                <h2 className="text-sm md:text-base font-black text-gray-800 dark:text-white uppercase tracking-tight truncate">
                    {currentMeta.title}
                </h2>
                <span className="hidden sm:inline-block text-gray-300 dark:text-gray-600">|</span>
                <span className="text-xs font-bold text-[#1e3a8a] dark:text-sky-300 truncate">
                    {currentMeta.subtitle}
                </span>
                <span className="hidden xl:inline-block text-[10px] font-black text-[#1e3a8a]/80 dark:text-sky-300 uppercase bg-[#dbeafe] dark:bg-sky-900/50 border border-[#93c5fd] dark:border-sky-700 px-2 py-0.5 rounded">
                    {currentMeta.badge}
                </span>
            </div>
            
            <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
                {measurementDatesMeta.latestDate && (
                    <span
                        className="hidden lg:inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[#eff6ff] dark:bg-sky-950/50 border border-[#93c5fd] dark:border-sky-700 text-[11px] font-semibold text-[#1e3a8a] dark:text-sky-200"
                        title="Data dell'ultima misura registrata nel Libretto delle Misure"
                    >
                        <span>📏 Ultima misura:</span>
                        <strong className="font-mono">{format(parseISO(measurementDatesMeta.latestDate), 'dd/MM/yyyy')}</strong>
                    </span>
                )}
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">SAL:</span>
                <select 
                    value={activeSalId || ''} 
                    onChange={e => setActiveSalId(e.target.value || null)}
                    className="py-1 px-2.5 bg-white dark:bg-gray-700 border border-[#93c5fd] dark:border-gray-600 rounded-md text-xs font-bold text-[#1e3a8a] dark:text-sky-300 focus:ring-2 focus:ring-sky-500 outline-none"
                >
                    {sals.length === 0 && <option value="">-- Nessun SAL --</option>}
                    {sals.length > 0 && <option value="__ALL__">Tutte le misure (Registro Continuo)</option>}
                    {[...sals].sort((a,b) => b.number - a.number).map(sal => (
                        <option key={sal.id} value={sal.id}>
                            SAL N. {sal.number} (fino al {format(parseISO(sal.date), 'dd/MM/yyyy')}) {sal.isLocked ? '🔒' : ''}
                        </option>
                    ))}
                </select>
                {activeSalId && activeSalId !== '__ALL__' && (() => {
                    const activeSalObj = sals.find(s => s.id === activeSalId);
                    if (!activeSalObj) return null;
                    return (
                        <button
                            onClick={() => handleOpenEditSalDateModal(activeSalObj.id)}
                            disabled={activeSalObj.isLocked}
                            className="px-2 py-1 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 rounded-md hover:bg-indigo-100 disabled:opacity-40 text-xs font-bold flex items-center gap-1 transition-colors"
                            title={activeSalObj.isLocked ? "SAL bloccato: sbloccalo in Impostazioni per modificare la data" : "Modifica manualmente la data di chiusura del SAL con calendario"}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                            <span className="hidden xl:inline">Data SAL</span>
                        </button>
                    );
                })()}
                <button
                    onClick={handleAddNewSal}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-bold flex items-center gap-1 shadow-xs transition-colors"
                    title="Crea Nuovo SAL scegliendo manualmente la data di chiusura con calendario"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                    <span>Nuovo SAL</span>
                </button>
                {['libretto', 'register', 'summary', 'sal_technical', 'payment_cert'].includes(activeTab) && (
                    <button 
                        onClick={() => { 
                            if (activeTab === 'sal_technical' && certificateRef.current) generatePdfWithCover('Stato Avanzamento Lavori', certificateRef.current); 
                            else if (activeTab === 'payment_cert') generatePaymentCertVectorPdf(); 
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
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2-2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                                Dati Generali Contratto &amp; Intestazione Standard GeCoLa
                            </h3>
                            <div className="space-y-3 text-xs">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block font-medium text-gray-700 dark:text-gray-300">Ente / Stazione Appaltante</label>
                                        <input type="text" placeholder="es. Comune di MILANO" value={localConfig.municipalityName || ''} onChange={e => setLocalConfig({...localConfig, municipalityName: e.target.value})} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 dark:text-white" />
                                    </div>
                                    <div>
                                        <label className="block font-medium text-gray-700 dark:text-gray-300">Provincia</label>
                                        <input type="text" placeholder="es. Provincia di Milano" value={localConfig.provinceName || ''} onChange={e => setLocalConfig({...localConfig, provinceName: e.target.value})} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 dark:text-white" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block font-medium text-gray-700 dark:text-gray-300">Committente</label>
                                        <input type="text" placeholder="es. Sviluppo Milanese s.r.l." value={localConfig.clientName || ''} onChange={e => setLocalConfig({...localConfig, clientName: e.target.value})} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 dark:text-white" />
                                    </div>
                                    <div>
                                        <label className="block font-medium text-gray-700 dark:text-gray-300">Impresa Appaltatrice</label>
                                        <input type="text" value={localConfig.contractorName || ''} onChange={e => setLocalConfig({...localConfig, contractorName: e.target.value})} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 dark:text-white" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    <div>
                                        <label className="block font-medium text-gray-700 dark:text-gray-300">CIG / CUP</label>
                                        <input type="text" value={localConfig.contractCode || ''} onChange={e => setLocalConfig({...localConfig, contractCode: e.target.value})} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 dark:text-white" />
                                    </div>
                                    <div>
                                        <label className="block font-medium text-gray-700 dark:text-gray-300">Data Contratto</label>
                                        <EuropeanDateInput value={localConfig.contractDate || ''} onChange={val => setLocalConfig({...localConfig, contractDate: val})} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 dark:text-white" />
                                    </div>
                                    <div>
                                        <label className="block font-medium text-gray-700 dark:text-gray-300">Luogo / Città Atti</label>
                                        <input type="text" placeholder="es. Milano" value={localConfig.locationCity || ''} onChange={e => setLocalConfig({...localConfig, locationCity: e.target.value})} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 dark:text-white" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block font-medium text-gray-700 dark:text-gray-300">Estremi Repertorio e Registrazione Contratto</label>
                                    <input type="text" placeholder="es. repertorio n. 432 registrato a Milano in data 20/11/2008 al n. 2243" value={localConfig.contractRepertory || ''} onChange={e => setLocalConfig({...localConfig, contractRepertory: e.target.value})} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 dark:text-white" />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block font-medium text-gray-700 dark:text-gray-300">Direttore dei Lavori</label>
                                        <input type="text" placeholder="es. Ing. Valerio Direttorio" value={localConfig.directorOfWorks || ''} onChange={e => setLocalConfig({...localConfig, directorOfWorks: e.target.value})} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 dark:text-white" />
                                    </div>
                                    <div>
                                        <label className="block font-medium text-gray-700 dark:text-gray-300">Responsabile del Procedimento (RUP)</label>
                                        <input type="text" placeholder="es. Ing. Ivo Responsabile" value={localConfig.rupName || ''} onChange={e => setLocalConfig({...localConfig, rupName: e.target.value})} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 dark:text-white" />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block font-medium text-gray-700 dark:text-gray-300">Intestazione Studio / Ufficio Tecnico</label>
                                        <input type="text" placeholder="es. Studio Tecnico Associato..." value={localConfig.studioHeader || ''} onChange={e => setLocalConfig({...localConfig, studioHeader: e.target.value})} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 dark:text-white" />
                                    </div>
                                    <div>
                                        <label className="block font-medium text-gray-700 dark:text-gray-300">Polizza INAIL Operai (Sede e N.)</label>
                                        <input type="text" placeholder="es. Milano pos. n. 12345678" value={localConfig.inailPolicy || ''} onChange={e => setLocalConfig({...localConfig, inailPolicy: e.target.value})} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 dark:text-white" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-gray-50 dark:bg-gray-700/30 p-5 rounded-xl border border-gray-200 dark:border-gray-600">
                            <h3 className="text-base font-bold text-gray-800 dark:text-gray-200 mb-4 border-b pb-2 dark:border-gray-600 flex items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v.01" /></svg>
                                Parametri Economici Contratto
                            </h3>
                            <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
                                <div><label className="block font-medium text-gray-700 dark:text-gray-300">Ribasso d'Asta (%)</label><input type="number" step="0.01" value={localConfig.discountPercent} onChange={e => setLocalConfig({...localConfig, discountPercent: parseFloat(e.target.value) || 0})} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 text-right font-semibold" /></div>
                                <div><label className="block font-medium text-gray-700 dark:text-gray-300">Ritenuta Infortuni / Garanzia (%)</label><input type="number" step="0.1" value={localConfig.withholdingTaxPercent} onChange={e => setLocalConfig({...localConfig, withholdingTaxPercent: parseFloat(e.target.value) || 0})} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 text-right font-semibold" /></div>
                                <div><label className="block font-medium text-gray-700 dark:text-gray-300">Recupero Anticipazione (%)</label><input type="number" step="0.1" value={localConfig.advancePaymentPercent ?? 20} onChange={e => setLocalConfig({...localConfig, advancePaymentPercent: parseFloat(e.target.value) || 0})} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 text-right font-semibold" /></div>
                                <div><label className="block font-medium text-gray-700 dark:text-gray-300">Aliquota I.V.A. (%)</label><input type="number" step="1" value={localConfig.vatPercent} onChange={e => setLocalConfig({...localConfig, vatPercent: parseFloat(e.target.value) || 0})} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 text-right font-semibold" /></div>
                                <div>
                                    <label className="block font-medium text-gray-700 dark:text-gray-300">Anticipazione Erogata (€)</label>
                                    <input type="number" step="0.01" value={localConfig.anticipationGrantedAmount ?? 0} onChange={e => setLocalConfig({...localConfig, anticipationGrantedAmount: parseFloat(e.target.value) || 0})} className="mt-1 w-full p-2 border rounded-md dark:bg-gray-600 dark:border-gray-500 text-right font-semibold" />
                                </div>
                                <div className="flex items-end pb-1">
                                    <label className="inline-flex items-center gap-2 cursor-pointer select-none text-gray-700 dark:text-gray-200 font-semibold">
                                        <input type="checkbox" checked={!!localConfig.roundCertificateTo100} onChange={e => setLocalConfig({...localConfig, roundCertificateTo100: e.target.checked})} className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4" />
                                        <span>Arrotonda rata Certificato a 100 €</span>
                                    </label>
                                </div>
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

                    {/* SEZIONE GESTIONE STATI AVANZAMENTO LAVORI (SAL) E CALENDARIO COMPETENZE */}
                    <div className="mt-6 bg-gray-50 dark:bg-gray-700/30 p-5 rounded-xl border border-gray-200 dark:border-gray-600">
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 border-b pb-3 dark:border-gray-600">
                            <div>
                                <h3 className="text-base font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                    Cronologia Stati di Avanzamento Lavori (SAL) e Date di Competenza
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    Nel <strong>SAL N. 1</strong> confluiscono tutte le misure con data uguale o inferiore alla data del SAL 1. Nei <strong>SAL successivi</strong> confluiscono tutte le misure con data maggiore dell'ultimo SAL precedente fino alla data del SAL scelto.
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {measurementDatesMeta.latestDate && (
                                    <div className="px-3 py-1.5 rounded-lg bg-[#eff6ff] dark:bg-sky-950/50 border border-[#93c5fd] dark:border-sky-700 text-xs">
                                        <span className="text-[#1e40af] dark:text-sky-300 font-medium">Data Ultima Misura a Libretto: </span>
                                        <strong className="font-mono text-[#1e3a8a] dark:text-sky-100">{format(parseISO(measurementDatesMeta.latestDate), 'dd/MM/yyyy')}</strong>
                                    </div>
                                )}
                                <button
                                    onClick={handleAddNewSal}
                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                                    Nuovo SAL con Calendario
                                </button>
                            </div>
                        </div>

                        {sals.length === 0 ? (
                            <div className="p-6 text-center bg-white dark:bg-gray-800 rounded-lg border border-dashed border-gray-300 dark:border-gray-600">
                                <p className="text-sm text-gray-600 dark:text-gray-300 font-semibold">Nessuno Stato di Avanzamento Lavori (SAL) ancora emesso.</p>
                                <p className="text-xs text-gray-500 mt-1 mb-3">
                                    Clicca su &ldquo;Nuovo SAL con Calendario&rdquo; per impostare manualmente la data del primo SAL avendo come riferimento la data dell'ultima misura registrata ({measurementDatesMeta.latestDate ? format(parseISO(measurementDatesMeta.latestDate), 'dd/MM/yyyy') : 'nessuna misura'}).
                                </p>
                                <button
                                    onClick={handleAddNewSal}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold"
                                >
                                    Emetti SAL N. 1
                                </button>
                            </div>
                        ) : (
                            <div className="overflow-x-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                                <table className="w-full text-xs text-left border-collapse">
                                    <thead className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 uppercase text-[11px] font-bold border-b border-gray-200 dark:border-gray-600">
                                        <tr>
                                            <th className="p-2.5 border-r dark:border-gray-600">Stato Avanzamento</th>
                                            <th className="p-2.5 border-r dark:border-gray-600">Intervallo Date Misure Incluse</th>
                                            <th className="p-2.5 border-r dark:border-gray-600">Data Chiusura SAL</th>
                                            <th className="p-2.5 text-center border-r dark:border-gray-600">N. Misure</th>
                                            <th className="p-2.5 text-right border-r dark:border-gray-600">Importo Competenza SAL</th>
                                            <th className="p-2.5 text-right border-r dark:border-gray-600">Progressivo Cumulato</th>
                                            <th className="p-2.5 text-center">Azioni</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                        {[...sals].sort((a, b) => a.number - b.number).map((s, idx, arr) => {
                                            const prevSal = idx > 0 ? arr[idx - 1] : null;
                                            const periodMeasureLines = accountingRegistry.filter(e =>
                                                prevSal ? (e.date > prevSal.date && e.date <= s.date) : (e.date <= s.date)
                                            );
                                            const periodAmount = round2(periodMeasureLines.reduce((acc, e) => acc + e.debit, 0));
                                            const cumAmount = round2(accountingRegistry.filter(e => e.date <= s.date).reduce((acc, e) => acc + e.debit, 0));

                                            return (
                                                <tr key={s.id} className={s.id === activeSalId ? 'bg-indigo-50/60 dark:bg-indigo-950/30' : ''}>
                                                    <td className="p-2.5 font-bold text-indigo-700 dark:text-indigo-300 border-r dark:border-gray-700">
                                                        <div className="flex items-center gap-1.5">
                                                            <span>SAL N. {s.number}</span>
                                                            {s.id === activeSalId && (
                                                                <span className="px-1.5 py-0.5 text-[9px] bg-indigo-600 text-white rounded uppercase font-black">Attivo</span>
                                                            )}
                                                            {s.isLocked && <span title="SAL Bloccato">🔒</span>}
                                                        </div>
                                                    </td>
                                                    <td className="p-2.5 font-mono text-[11px] text-gray-600 dark:text-gray-300 border-r dark:border-gray-700">
                                                        {prevSal
                                                            ? ` Misure > ${format(parseISO(prevSal.date), 'dd/MM/yyyy')} e ≤ ${format(parseISO(s.date), 'dd/MM/yyyy')}`
                                                            : ` Tutte le misure ≤ ${format(parseISO(s.date), 'dd/MM/yyyy')}`}
                                                    </td>
                                                    <td className="p-2.5 border-r dark:border-gray-700">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-mono font-bold text-gray-900 dark:text-white">{format(parseISO(s.date), 'dd/MM/yyyy')}</span>
                                                            {!s.isLocked && (
                                                                <button
                                                                    onClick={() => handleOpenEditSalDateModal(s.id)}
                                                                    className="px-2 py-0.5 text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded hover:bg-indigo-200 transition-colors"
                                                                >
                                                                    📅 Cambia data
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="p-2.5 text-center font-mono font-bold border-r dark:border-gray-700">
                                                        {periodMeasureLines.length}
                                                    </td>
                                                    <td className="p-2.5 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400 border-r dark:border-gray-700">
                                                        {currencyFormatter.format(periodAmount)}
                                                    </td>
                                                    <td className="p-2.5 text-right font-mono font-black text-indigo-700 dark:text-indigo-300 border-r dark:border-gray-700">
                                                        {currencyFormatter.format(cumAmount)}
                                                    </td>
                                                    <td className="p-2.5 text-center">
                                                        <div className="inline-flex items-center gap-1.5">
                                                            <button
                                                                onClick={() => setActiveSalId(s.id)}
                                                                className="px-2 py-1 rounded text-[10px] font-bold bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-gray-700 dark:text-gray-200"
                                                            >
                                                                Seleziona
                                                            </button>
                                                            <button
                                                                onClick={() => handleToggleSalLock(s.id)}
                                                                className={`px-2 py-1 rounded text-[10px] font-bold ${s.isLocked ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-700'}`}
                                                                title={s.isLocked ? 'Sblocca SAL' : 'Blocca SAL'}
                                                            >
                                                                {s.isLocked ? 'Sblocca' : 'Blocca'}
                                                            </button>
                                                            {idx === arr.length - 1 && !s.isLocked && (
                                                                <button
                                                                    onClick={() => handleDeleteSal(s.id)}
                                                                    className="px-2 py-1 rounded text-[10px] font-bold bg-red-100 text-red-700 hover:bg-red-200"
                                                                    title="Elimina ultimo SAL"
                                                                >
                                                                    Elimina
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
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
                    <div ref={contentRef} className="bg-white dark:bg-gray-800 rounded-lg shadow-xs border-2 border-[#1e40af] flex-grow overflow-auto min-h-0">
                          <table className="w-full text-xs text-left border-collapse">
                            <thead className="bg-[#dbeafe] dark:bg-sky-950/80 text-[#1e3a8a] dark:text-sky-100 font-bold border-b-2 border-[#1e40af] sticky top-0 z-10 shadow-xs">
                                <tr>
                                    <th className="p-2.5 w-20 text-center border-r border-[#1e40af] align-top text-[#1e3a8a] dark:text-sky-200">N. ord. (LB)</th>
                                    <th className="p-2.5 w-24 border-r border-[#1e40af] align-top">Data</th>
                                    <th className="p-2.5 w-48 border-r border-[#1e40af] align-top">
                                        <div className="uppercase text-[11px] text-[#1e3a8a] dark:text-sky-100">WBS</div>
                                        <div className="text-[10px] font-bold text-[#1d4ed8] dark:text-sky-300 mt-0.5">N. ord. (CM) - Codice</div>
                                    </th>
                                    <th className="p-2.5 border-r border-[#1e40af] align-top">Descrizione &amp; Note</th>
                                    <th className="p-2.5 w-12 text-center border-r border-[#1e40af] bg-[#eff6ff] dark:bg-sky-900/40 align-top">U.M.</th>
                                    <th className="p-2.5 w-24 text-right bg-[#bfdbfe] dark:bg-sky-900/60 align-top">Quantità</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {filteredLibretto.filter(applyFilters).map((entry) => {
                                    const cleanCode = (entry.accountingType !== 'body' && entry.originalIndex && entry.originalIndex > 0)
                                        ? `${entry.originalIndex} - ${entry.articleCode}`
                                        : entry.articleCode;
                                    return (
                                        <tr key={entry.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${entry.accountingType === 'body' ? 'bg-purple-50/50' : ''}`}>
                                            <td className="p-2.5 text-center font-mono font-bold text-indigo-700 dark:text-indigo-400 border-r dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800 align-top whitespace-nowrap">{entry.progressiveIndex}</td>
                                            <td className="p-2.5 border-r dark:border-gray-600 align-top">{format(parseISO(entry.date), 'dd/MM/yy')}</td>
                                            <td className="p-2.5 border-r dark:border-gray-600 align-top">
                                                <div className="text-[11px] uppercase font-bold text-gray-800 dark:text-gray-200 leading-tight">{entry.groupName}</div>
                                                <div className="font-mono text-xs font-bold text-indigo-700 dark:text-indigo-300 mt-0.5">{cleanCode}</div>
                                            </td>
                                            <td className="p-2.5 border-r dark:border-gray-600 text-justify align-top">
                                                <div className="text-xs mb-0.5 text-justify leading-relaxed">{entry.description}</div>
                                                <div className="italic text-indigo-700 dark:text-indigo-400 text-justify">{entry.measurementNote || '-'}</div>
                                            </td>
                                            <td className="p-2.5 text-center border-r dark:border-gray-600">{entry.unit}</td>
                                            <td className="p-2.5 text-right font-bold font-mono bg-indigo-50/30 dark:bg-indigo-900/10">{entry.accountingType === 'body' ? percentFormatter.format(entry.quantity) : numberFormatter.format(entry.quantity)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                         </table>
                    </div>
                </div>
            )}
            
            {activeTab === 'register' && (
                <div className="flex-grow p-2 overflow-hidden flex flex-col min-h-0 gap-2">
                    {/* Barra di filtro e info Standard GeCoLa */}
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-[#eff6ff] dark:bg-gray-800/80 rounded-lg border border-[#93c5fd] dark:border-gray-700 flex-shrink-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 rounded bg-[#dbeafe] dark:bg-sky-950/60 text-[#1e3a8a] dark:text-sky-200 border border-[#60a5fa] dark:border-sky-700 text-[10px] font-black uppercase tracking-wider">
                                Standard GeCoLa / Lavori Pubblici
                            </span>
                            {sals.length > 0 && activeSalId !== '__ALL__' && (
                                <div className="inline-flex rounded-md bg-white dark:bg-gray-700 p-0.5 border border-[#93c5fd] dark:border-gray-600">
                                    <button
                                        type="button"
                                        onClick={() => setRegisterScope('continuous')}
                                        className={`px-2 py-0.5 text-[11px] font-bold rounded transition-colors ${registerScope === 'continuous' ? 'bg-[#1e40af] text-white' : 'text-[#1e3a8a] dark:text-gray-300 hover:bg-sky-50'}`}
                                        title="Mostra tutte le misure cronologiche con i Certificati di Pagamento inseriti nella rispettiva posizione di calendario"
                                    >
                                        Registro Continuo
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setRegisterScope('sal')}
                                        className={`px-2 py-0.5 text-[11px] font-bold rounded transition-colors ${registerScope === 'sal' ? 'bg-[#1e40af] text-white' : 'text-[#1e3a8a] dark:text-gray-300 hover:bg-sky-50'}`}
                                        title="Limita la vista alla data di chiusura del SAL selezionato"
                                    >
                                        Fino al SAL N. {sals.find(s => s.id === activeSalId)?.number || 1}
                                    </button>
                                </div>
                            )}
                            <input
                                type="text"
                                value={filters.code}
                                onChange={e => setFilters(prev => ({ ...prev, code: e.target.value }))}
                                placeholder="Filtra codice tariffa..."
                                className="px-2.5 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:ring-1 focus:ring-sky-500 outline-none w-40"
                            />
                            <input
                                type="text"
                                value={filters.description}
                                onChange={e => setFilters(prev => ({ ...prev, description: e.target.value }))}
                                placeholder="Filtra indicazione lavori..."
                                className="px-2.5 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:ring-1 focus:ring-sky-500 outline-none w-48"
                            />
                        </div>
                        {(() => {
                            const visibleEntries = activeRegisterEntries.filter(applyFilters);
                            const timeline = buildRegisterTimelineData(visibleEntries);
                            return (
                                <div className="flex items-center gap-3 text-xs flex-wrap">
                                    <span className="text-[#1e3a8a]/80 dark:text-gray-300 font-medium">
                                        {registerScope === 'continuous' || activeSalId === '__ALL__'
                                            ? `Registro cronologico continuo (${timeline.certsIncludedCount} cert.)`
                                            : `A tutto il S.A.L. n. ${sals.find(s => s.id === activeSalId)?.number || '1'} (${format(parseISO(salReferenceDate), 'dd/MM/yyyy')})`}
                                    </span>
                                    <span className="font-mono font-bold text-sm text-[#1e3a8a] dark:text-sky-300">
                                        Debito: {currencyFormatter.format(timeline.grandTotal)}
                                    </span>
                                    {timeline.grandPaymentTotal > 0 && (
                                        <span className="font-mono font-bold text-sm text-sky-700 dark:text-sky-400">
                                            • Pagamento Cert.: {currencyFormatter.format(timeline.grandPaymentTotal)}
                                        </span>
                                    )}
                                </div>
                            );
                        })()}
                    </div>

                    <div ref={contentRef} className="bg-white dark:bg-gray-800 rounded-lg shadow-xs border-2 border-[#1e40af] flex-grow overflow-auto min-h-0" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
                        <table className="w-full text-xs text-left text-gray-900 dark:text-gray-100 border-collapse">
                            <thead className="text-[11px] text-[#1e3a8a] dark:text-sky-100 bg-[#dbeafe] dark:bg-sky-950/90 sticky top-0 z-10 border-b-2 border-[#1e40af]">
                                <tr>
                                    <th rowSpan={2} className="px-2 py-1.5 w-28 text-center border-r border-[#1e40af] font-bold leading-tight">
                                        <div>Num.Ord.</div>
                                        <div className="border-t border-[#1e40af]/40 my-0.5 pt-0.5">TARIFFA</div>
                                        <div className="border-t border-[#1e40af]/40 pt-0.5 tracking-widest">D A T A</div>
                                    </th>
                                    <th rowSpan={2} className="px-3 py-1.5 border-r border-[#1e40af] text-center font-bold uppercase">
                                        INDICAZIONE DEI LAVORI E DELLE SOMMINISTRAZIONI
                                    </th>
                                    <th colSpan={2} className="px-1.5 py-1 text-center border-r border-b border-[#1e40af] font-bold lowercase">
                                        libretto
                                    </th>
                                    <th colSpan={2} className="px-1.5 py-1 text-center border-r border-b border-[#1e40af] font-bold">
                                        Quantità/Percentuali
                                    </th>
                                    <th rowSpan={2} className="px-2 py-1.5 w-24 text-center border-r border-[#1e40af] font-bold leading-tight">
                                        <div>PREZZO</div>
                                        <div className="font-normal">unitario</div>
                                    </th>
                                    <th colSpan={2} className="px-2 py-1 text-center border-b border-[#1e40af] font-bold tracking-widest">
                                        I M P O R T I
                                    </th>
                                </tr>
                                <tr>
                                    <th className="px-1.5 py-1 w-14 text-center border-r border-[#1e40af] font-bold">Nr</th>
                                    <th className="px-1.5 py-1 w-14 text-center border-r border-[#1e40af] font-bold">Pg</th>
                                    <th className="px-2 py-1 w-24 text-right border-r border-[#1e40af] font-bold">Positivi</th>
                                    <th className="px-2 py-1 w-24 text-right border-r border-[#1e40af] font-bold">Negativi</th>
                                    <th className="px-2.5 py-1 w-28 text-right border-r border-[#1e40af] font-bold">Debito</th>
                                    <th className="px-2.5 py-1 w-28 text-right font-bold">Pagamento</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#1e40af]/35">
                                {(() => {
                                    const visibleEntries = activeRegisterEntries.filter(applyFilters);
                                    const timeline = buildRegisterTimelineData(visibleEntries);

                                    if (timeline.rows.length === 0) {
                                        return (
                                            <tr>
                                                <td colSpan={9} className="p-8 text-center text-gray-500 italic">
                                                    Nessuna misurazione contabilizzata nel periodo selezionato.
                                                </td>
                                            </tr>
                                        );
                                    }

                                    return timeline.rows.map((row, rIdx) => {
                                        if (row.isSectionHeader) {
                                            return (
                                                <tr key={`reg-sec-${rIdx}`} className="bg-[#e0f2fe] dark:bg-sky-950/50 font-bold text-[#1e3a8a] dark:text-sky-100 border-y border-[#1e40af]">
                                                    <td className="px-2 py-1.5 border-r border-[#1e40af]"></td>
                                                    <td className="px-3 py-1.5 text-center border-r border-[#1e40af] whitespace-pre-line">
                                                        {row.desc}
                                                    </td>
                                                    <td className="border-r border-[#1e40af]"></td>
                                                    <td className="border-r border-[#1e40af]"></td>
                                                    <td className="border-r border-[#1e40af]"></td>
                                                    <td className="border-r border-[#1e40af]"></td>
                                                    <td className="border-r border-[#1e40af]"></td>
                                                    <td className="border-r border-[#1e40af]"></td>
                                                    <td></td>
                                                </tr>
                                            );
                                        }

                                        if (row.isCertNoteRow) {
                                            return (
                                                <tr key={`reg-cert-${rIdx}`} className="bg-[#eff6ff] dark:bg-sky-900/40 font-bold border-y border-[#1e40af] text-[#1e3a8a] dark:text-sky-100">
                                                    <td className="border-r border-[#1e40af]"></td>
                                                    <td className="px-3 py-2 text-justify border-r border-[#1e40af] whitespace-pre-line">
                                                        {row.desc}
                                                    </td>
                                                    <td className="border-r border-[#1e40af]"></td>
                                                    <td className="border-r border-[#1e40af]"></td>
                                                    <td className="border-r border-[#1e40af]"></td>
                                                    <td className="border-r border-[#1e40af]"></td>
                                                    <td className="border-r border-[#1e40af]"></td>
                                                    <td className="border-r border-[#1e40af]"></td>
                                                    <td className="px-2.5 py-2 text-right font-mono font-black text-[#1e40af] dark:text-sky-200 align-bottom">
                                                        {row.payment}
                                                    </td>
                                                </tr>
                                            );
                                        }

                                        if (row.isSubtotalRow) {
                                            return (
                                                <tr key={`reg-sub-${rIdx}`} className="bg-[#eff6ff] dark:bg-gray-700/60 font-bold border-y-2 border-[#1e40af]">
                                                    <td className="border-r border-[#1e40af]"></td>
                                                    <td className="px-3 py-2 text-right border-r border-[#1e40af] whitespace-pre-line text-[#1e3a8a] dark:text-sky-100">
                                                        {row.desc}
                                                    </td>
                                                    <td className="border-r border-[#1e40af]"></td>
                                                    <td className="border-r border-[#1e40af]"></td>
                                                    <td className="border-r border-[#1e40af]"></td>
                                                    <td className="border-r border-[#1e40af]"></td>
                                                    <td className="border-r border-[#1e40af]"></td>
                                                    <td className="px-2.5 py-2 text-right font-mono text-sm font-black border-r border-[#1e40af] text-[#1e3a8a] dark:text-white align-top">
                                                        {row.debit}
                                                    </td>
                                                    <td className="px-2.5 py-2 text-right font-mono"></td>
                                                </tr>
                                            );
                                        }

                                        const entry = row.entry!;
                                        const fmtQ = entry.accountingType === 'body' ? percentFormatter.format(entry.quantity) : numberFormatter.format(entry.quantity);
                                        const isPos = entry.quantity >= 0;
                                        const hasDims = entry.accountingType !== 'body' && (entry.factor !== undefined || entry.length !== undefined || entry.width !== undefined || entry.height !== undefined);
                                        const tariffaStr = formatCodeWithComputoIndex(entry.articleCode, entry.originalIndex, entry.accountingType);

                                        return (
                                            <tr key={entry.id} className="hover:bg-[#eff6ff]/70 dark:hover:bg-gray-700/40 transition-colors">
                                                <td className="px-2 py-2 text-center font-mono border-r border-[#1e40af] align-top whitespace-nowrap leading-snug">
                                                    <div className="font-bold text-gray-900 dark:text-white">{entry.registerOrderIndex}</div>
                                                    <div className="text-[10px] font-bold text-[#1e3a8a] dark:text-sky-300">{tariffaStr}</div>
                                                    <div className="text-[11px] text-gray-700 dark:text-gray-300 mt-0.5">{format(parseISO(entry.date), 'dd/MM/yyyy')}</div>
                                                </td>
                                                <td className="px-3 py-2 border-r border-[#1e40af] align-top text-justify">
                                                    <div className="text-justify leading-relaxed">{entry.description}</div>
                                                    {entry.measurementNote && entry.measurementNote !== entry.description && (
                                                        <div className="italic text-gray-700 dark:text-gray-300 text-[11px] mt-1 pl-3 text-justify">
                                                            {entry.measurementNote}
                                                        </div>
                                                    )}
                                                    {hasDims && (
                                                        <div className="font-mono text-[10px] text-gray-500 mt-0.5 pl-3">
                                                            ({[
                                                                entry.factor !== undefined ? `F:${numberFormatter.format(entry.factor)}` : null,
                                                                entry.length !== undefined ? `L:${numberFormatter.format(entry.length)}` : null,
                                                                entry.width !== undefined ? `l:${numberFormatter.format(entry.width)}` : null,
                                                                entry.height !== undefined ? `H/P:${numberFormatter.format(entry.height)}` : null
                                                            ].filter(Boolean).join(' × ')})
                                                        </div>
                                                    )}
                                                    <div className="text-right font-bold text-[11px] mt-1.5 text-gray-900 dark:text-white">
                                                        SOMMANO {entry.accountingType === 'body' ? '%' : entry.unit}
                                                    </div>
                                                </td>
                                                <td className="px-1.5 py-2 text-center font-mono border-r border-[#1e40af] align-top">
                                                    <div className="font-bold text-[11px] text-[#1e40af] dark:text-sky-300" title="N. ord. Libretto Unico">N.LB.{entry.progressiveIndex}</div>
                                                </td>
                                                <td className="px-1.5 py-2 text-center font-mono font-bold border-r border-[#1e40af] align-top">
                                                    {entry.librettoPage}
                                                </td>
                                                <td className="px-2 py-2 text-right font-mono border-r border-[#1e40af] align-bottom font-bold">
                                                    {isPos ? (
                                                        <div>
                                                            <div className="font-normal text-gray-600 dark:text-gray-400">{fmtQ}</div>
                                                            <div className="border-t border-gray-300 dark:border-gray-600 mt-1 pt-0.5">{fmtQ}</div>
                                                        </div>
                                                    ) : ''}
                                                </td>
                                                <td className="px-2 py-2 text-right font-mono border-r border-[#1e40af] align-bottom font-bold text-red-600">
                                                    {!isPos ? (
                                                        <div>
                                                            <div className="font-normal">{fmtQ}</div>
                                                            <div className="border-t border-red-300 mt-1 pt-0.5">{fmtQ}</div>
                                                        </div>
                                                    ) : ''}
                                                </td>
                                                <td className="px-2 py-2 text-right font-mono border-r border-[#1e40af] align-bottom">
                                                    {entry.isDepreciated && (
                                                        <span className="block text-[9px] font-sans font-black text-sky-700 dark:text-sky-300">⚖️ Det. RUP</span>
                                                    )}
                                                    {numberFormatter.format(entry.unitPrice)}
                                                </td>
                                                <td className="px-2.5 py-2 text-right font-mono font-bold border-r border-[#1e40af] align-bottom text-gray-900 dark:text-white">
                                                    {numberFormatter.format(entry.debit)}
                                                </td>
                                                <td className="px-2.5 py-2 text-right font-mono align-bottom"></td>
                                            </tr>
                                        );
                                    });
                                })()}
                            </tbody>
                            <tfoot>
                                {(() => {
                                    const visibleEntries = activeRegisterEntries.filter(applyFilters);
                                    const timeline = buildRegisterTimelineData(visibleEntries);

                                    return (
                                        <tr className="bg-[#dbeafe] dark:bg-sky-950/90 font-bold border-t-2 border-[#1e40af] text-[#1e3a8a] dark:text-sky-100">
                                            <td colSpan={7} className="px-3 py-2 text-center uppercase tracking-widest text-xs border-r border-[#1e40af]">
                                                A   R I P O R T A R E
                                            </td>
                                            <td className="px-2.5 py-2 text-right font-mono text-sm font-black border-r border-[#1e40af]">
                                                {numberFormatter.format(timeline.grandTotal)}
                                            </td>
                                            <td className="px-2.5 py-2 text-right font-mono text-sm font-black">
                                                {numberFormatter.format(timeline.grandPaymentTotal)}
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
                    {/* Quadro Sintetico Competenze SAL nel Sommario */}
                    {sals.length > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-indigo-50/70 dark:bg-indigo-950/30 rounded-lg border border-indigo-200 dark:border-indigo-800/70 flex-shrink-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[11px] font-black uppercase tracking-wider text-indigo-800 dark:text-indigo-300 mr-1">
                                    Riferimento SAL nel Sommario:
                                </span>
                                {[...sals].sort((a, b) => a.number - b.number).map((s, idx, arr) => {
                                    const prevSal = idx > 0 ? arr[idx - 1] : null;
                                    const salLines = accountingRegistry.filter(e =>
                                        prevSal ? (e.date > prevSal.date && e.date <= s.date) : (e.date <= s.date)
                                    );
                                    const salAmt = round2(salLines.reduce((acc, e) => acc + e.debit, 0));
                                    const isActive = s.id === activeSalId;
                                    const isIncludedInProgressive = activeSalId
                                        ? s.number <= (sals.find(x => x.id === activeSalId)?.number || 999)
                                        : true;

                                    return (
                                        <button
                                            key={s.id}
                                            onClick={() => setActiveSalId(s.id)}
                                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono transition-all border ${
                                                isActive
                                                    ? 'bg-indigo-600 text-white border-indigo-700 font-bold shadow-xs'
                                                    : isIncludedInProgressive
                                                        ? 'bg-white dark:bg-gray-800 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700 hover:bg-indigo-100/60'
                                                        : 'bg-gray-100 dark:bg-gray-800/50 text-gray-400 border-gray-200 dark:border-gray-700 opacity-60'
                                            }`}
                                            title={prevSal
                                                ? `SAL N. ${s.number}: misure dal giorno successivo al ${format(parseISO(prevSal.date), 'dd/MM/yyyy')} fino al ${format(parseISO(s.date), 'dd/MM/yyyy')}`
                                                : `SAL N. ${s.number}: tutte le misure fino al ${format(parseISO(s.date), 'dd/MM/yyyy')}`}
                                        >
                                            <span className="font-bold">SAL N. {s.number}</span>
                                            <span className="text-[10px] opacity-85">
                                                ({prevSal ? `>${format(parseISO(prevSal.date), 'dd/MM/yy')} ` : '≤'}{format(parseISO(s.date), 'dd/MM/yy')})
                                            </span>
                                            <span className={`px-1 py-0.2 rounded text-[10px] font-bold ${isActive ? 'bg-indigo-800 text-white' : 'bg-indigo-50 dark:bg-indigo-900/50 text-indigo-800 dark:text-indigo-200'}`}>
                                                {currencyFormatter.format(salAmt)}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Selettore vista Progressiva a tutto il SAL vs Solo Competenza del SAL attivo */}
                            <div className="inline-flex rounded-md bg-white dark:bg-gray-800 p-0.5 border border-indigo-200 dark:border-indigo-700">
                                <button
                                    onClick={() => setSummarySalScope('cumulative')}
                                    className={`px-2 py-0.5 text-[11px] font-bold rounded transition-colors ${summarySalScope === 'cumulative' ? 'bg-indigo-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                                    title="Mostra tutte le lavorazioni contabilizzate fino al SAL selezionato con il dettaglio di appartenenza a ciascun SAL"
                                >
                                    Progressivo a tutto il SAL N. {sals.find(s => s.id === activeSalId)?.number || 'Corrente'}
                                </button>
                                <button
                                    onClick={() => setSummarySalScope('current_sal')}
                                    className={`px-2 py-0.5 text-[11px] font-bold rounded transition-colors ${summarySalScope === 'current_sal' ? 'bg-emerald-600 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                                    title="Mostra esclusivamente le misure ricadenti nella finestra temporale del SAL selezionato"
                                >
                                    Solo Competenza SAL N. {sals.find(s => s.id === activeSalId)?.number || 'Corrente'}
                                </button>
                            </div>
                        </div>
                    )}

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

                            {/* Raggruppamento: Standard GeCoLa vs Gruppi WBS vs Elenco Singolo */}
                            <div className="inline-flex rounded-md bg-white dark:bg-gray-700 p-0.5 border border-gray-200 dark:border-gray-600">
                                <button
                                    onClick={() => setSummaryGrouping('standard_llpp')}
                                    className={`px-2.5 py-1 text-xs font-bold rounded transition-colors ${summaryGrouping === 'standard_llpp' ? 'bg-[#1e40af] text-white shadow-xs' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'}`}
                                    title="Impaginazione Ufficiale Standard GeCoLa LL.PP. (Lavori a Misura, Lavori a Corpo, Costi Sicurezza con colonne SAL e RC)"
                                >
                                    🏛️ Standard GeCoLa (SAL / RC)
                                </button>
                                <button
                                    onClick={() => setSummaryGrouping('grouped_by_wbs')}
                                    className={`px-2.5 py-1 text-xs font-bold rounded transition-colors ${summaryGrouping === 'grouped_by_wbs' ? 'bg-violet-600 text-white shadow-xs' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'}`}
                                    title="Struttura il sommario raggruppato per Gruppi di Lavoro / Categorie WBS"
                                >
                                    📁 Per Gruppi WBS
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
                                    <div className="flex items-center gap-1.5 bg-[#eff6ff] dark:bg-sky-950/40 px-2 py-1 rounded-md border border-[#93c5fd] dark:border-sky-800">
                                        <span className="font-semibold text-[#1e3a8a] dark:text-gray-300">
                                            {summarySalScope === 'current_sal'
                                                ? `Competenza SAL N. ${sals.find(s => s.id === activeSalId)?.number || '1'}:`
                                                : `Contabilizzato a tutto il SAL N. ${sals.find(s => s.id === activeSalId)?.number || '1'}:`}
                                        </span>
                                        <span className="font-mono font-black text-[#1e40af] dark:text-sky-300">{currencyFormatter.format(totProg)}</span>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>

                    <div ref={contentRef} className="bg-white dark:bg-gray-800 rounded-lg shadow-xs border border-gray-200 dark:border-gray-700 flex-grow overflow-auto min-h-0">
                        {summaryGrouping === 'standard_llpp' ? (
                            /* VISUALIZZAZIONE UFFICIALE STANDARD GECOLA LL.PP. */
                            <div className="border-2 border-[#1e40af]" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
                                <table className="w-full text-xs text-left text-gray-900 dark:text-gray-100 border-collapse">
                                    <thead className="text-[11px] text-[#1e3a8a] dark:text-sky-100 bg-[#dbeafe] dark:bg-sky-950/90 sticky top-0 z-10 border-b-2 border-[#1e40af]">
                                        <tr>
                                            <th rowSpan={2} className="px-2 py-1.5 w-32 text-center border-r border-[#1e40af] font-bold leading-tight">
                                                <div>Num.Ord.</div>
                                                <div className="border-t border-[#1e40af]/40 mt-0.5 pt-0.5">TARIFFA</div>
                                            </th>
                                            <th rowSpan={2} className="px-3 py-1.5 border-r border-[#1e40af] text-center font-bold uppercase">
                                                INDICAZIONE DEI LAVORI E DELLE SOMMINISTRAZIONI
                                            </th>
                                            <th colSpan={2} className="px-1.5 py-1 text-center border-r border-b border-[#1e40af] font-bold lowercase">
                                                riferimenti
                                            </th>
                                            <th rowSpan={2} className="px-2.5 py-1.5 w-28 text-right border-r border-[#1e40af] font-bold">
                                                Quantità
                                            </th>
                                            <th colSpan={2} className="px-2 py-1 text-center border-b border-[#1e40af] font-bold uppercase">
                                                IMPORTI
                                            </th>
                                        </tr>
                                        <tr>
                                            <th className="px-1.5 py-1 w-14 text-center border-r border-[#1e40af] font-bold">SAL</th>
                                            <th className="px-1.5 py-1 w-24 text-center border-r border-[#1e40af] font-bold" title="Numero d'ordine Registro di Contabilità (RC) e riferimento Libretto">RC</th>
                                            <th className="px-2.5 py-1 w-28 text-right border-r border-[#1e40af] font-bold">unitario</th>
                                            <th className="px-2.5 py-1 w-32 text-right font-bold">TOTALE</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#1e40af]/35">
                                        {(() => {
                                            const visibleItems = accountingSummary.filter(applyFilters);
                                            const measureItems = visibleItems.filter(i => i.accountingType === 'measure' && !i.isSecurityCost);
                                            const bodyItems = visibleItems.filter(i => i.accountingType === 'body' && !i.isSecurityCost);
                                            const securityItems = visibleItems.filter(i => i.isSecurityCost);
                                            const activeSalNum = (activeSalId && activeSalId !== '__ALL__' ? sals.find(s => s.id === activeSalId)?.number : undefined) || (sals.length || 1);
                                            let ordCounter = 0;

                                            const renderSummarySection = (title: string, sectionItems: SummaryEntry[], isBody: boolean) => {
                                                if (sectionItems.length === 0) return null;
                                                const sectionSubtotal = round2(sectionItems.reduce((acc, i) => acc + i.totalAmount, 0));
                                                const sectionAliquota = (isBody && currentSalData.bodyGroupsTotalValue > 0)
                                                    ? formatPct((sectionSubtotal / currentSalData.bodyGroupsTotalValue) * 100, 3)
                                                    : null;

                                                return (
                                                    <React.Fragment key={title}>
                                                        <tr className="bg-[#e0f2fe] dark:bg-sky-950/50 font-bold text-[#1e3a8a] dark:text-sky-100 border-y border-[#1e40af]">
                                                            <td className="border-r border-[#1e40af]"></td>
                                                            <td className="px-3 py-1.5 text-center border-r border-[#1e40af] whitespace-pre-line">
                                                                {title}
                                                            </td>
                                                            <td className="border-r border-[#1e40af]"></td>
                                                            <td className="border-r border-[#1e40af]"></td>
                                                            <td className="border-r border-[#1e40af]"></td>
                                                            <td className="border-r border-[#1e40af]"></td>
                                                            <td></td>
                                                        </tr>
                                                        {sectionItems.map(item => {
                                                            ordCounter++;
                                                            const allLines = item.allLines || [...item.previousLines, ...item.currentLines];
                                                            const fmtQty = (q: number) => item.accountingType === 'body' ? percentFormatter.format(q) : numberFormatter.format(q);
                                                            const tariffaStr = formatCodeWithComputoIndex(item.articleCode, item.originalIndex, item.accountingType);
                                                            const itemPriceAliquota = (isBody && currentSalData.bodyGroupsTotalValue > 0)
                                                                ? formatPct((item.unitPrice / currentSalData.bodyGroupsTotalValue) * 100, 3)
                                                                : null;
                                                            const itemTotalAliquota = (isBody && currentSalData.bodyGroupsTotalValue > 0)
                                                                ? formatPct((item.totalAmount / currentSalData.bodyGroupsTotalValue) * 100, 3)
                                                                : null;

                                                            return (
                                                                <React.Fragment key={item.articleCode}>
                                                                    {/* Riga intestazione voce: solo Num.Ord./TARIFFA e Descrizione giustificata */}
                                                                    <tr className="bg-white dark:bg-gray-800">
                                                                        <td className="px-2 py-2 text-center font-mono border-r border-[#1e40af] align-top whitespace-nowrap">
                                                                            <div className="font-bold text-gray-900 dark:text-white">{ordCounter}</div>
                                                                            <div className="text-[10px] font-bold text-[#1e3a8a] dark:text-sky-300 mt-0.5">{tariffaStr}</div>
                                                                        </td>
                                                                        <td className="px-3 py-2 border-r border-[#1e40af] align-top text-justify leading-relaxed">
                                                                            {item.description}
                                                                        </td>
                                                                        <td className="border-r border-[#1e40af]"></td>
                                                                        <td className="border-r border-[#1e40af]"></td>
                                                                        <td className="border-r border-[#1e40af]"></td>
                                                                        <td className="border-r border-[#1e40af]"></td>
                                                                        <td></td>
                                                                    </tr>

                                                                    {/* Righe singole misurazioni con SAL | RC | Quantità | TOTALE riga */}
                                                                    {summaryMode === 'analytical' && allLines.map(line => (
                                                                        <tr key={`gecola-sum-${line.id}`} className="bg-white dark:bg-gray-800/80 hover:bg-[#eff6ff] dark:hover:bg-gray-700/30 text-[11px]">
                                                                            <td className="border-r border-[#1e40af]"></td>
                                                                            <td className="px-3 py-1 border-r border-[#1e40af] italic text-gray-600 dark:text-gray-300 pl-6 text-justify">
                                                                                {line.measurementNote && line.measurementNote !== item.description ? line.measurementNote : ''}
                                                                            </td>
                                                                            <td className="px-1.5 py-1 text-center font-mono font-bold border-r border-[#1e40af]">
                                                                                {line.salNumber || 1}
                                                                            </td>
                                                                            <td className="px-1.5 py-1 text-center font-mono border-r border-[#1e40af]" title={`Registro N. RG. ${line.registerOrderIndex} — ${formatLibrettoRef(line.progressiveIndex, line.librettoPage)}`}>
                                                                                <span className="font-bold">{line.registerOrderIndex}</span>
                                                                                <span className="block text-[9px] text-gray-500">
                                                                                    (LB.{line.progressiveIndex}/P.{line.librettoPage})
                                                                                </span>
                                                                            </td>
                                                                            <td className="px-2.5 py-1 text-right font-mono border-r border-[#1e40af]">
                                                                                {fmtQty(line.quantity)}
                                                                            </td>
                                                                            <td className="border-r border-[#1e40af]"></td>
                                                                            <td className="px-2.5 py-1 text-right font-mono">
                                                                                {numberFormatter.format(line.amount)}
                                                                            </td>
                                                                        </tr>
                                                                    ))}

                                                                    {/* Riga SOMMANO al S.A.L. n. X */}
                                                                    <tr className="bg-[#eff6ff] dark:bg-gray-700/40 font-bold border-b border-[#1e40af]">
                                                                        <td className="border-r border-[#1e40af]"></td>
                                                                        <td className="px-3 py-1.5 text-right border-r border-[#1e40af]">
                                                                            <div>
                                                                                SOMMANO al S.A.L. n. {activeSalNum} <span className="ml-1">{item.accountingType === 'body' ? '%' : item.unit}</span>
                                                                            </div>
                                                                            {isBody && <div className="text-[10px] font-normal italic">aliquote</div>}
                                                                            {item.salBreakdown && item.salBreakdown.length > 1 && (
                                                                                <div className="flex flex-wrap justify-end gap-1 mt-1 font-normal">
                                                                                    {item.salBreakdown.map(sb => (
                                                                                        <span key={sb.salNumber} className="px-1.5 py-0.2 rounded bg-white dark:bg-gray-800 border border-[#1e40af]/40 text-[10px] font-mono text-[#1e3a8a] dark:text-sky-300">
                                                                                            {sb.salLabel}: {fmtQty(sb.quantity)} {item.unit} ({currencyFormatter.format(sb.amount)})
                                                                                        </span>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-1.5 py-1.5 text-center font-mono text-[10px] border-r border-[#1e40af]">
                                                                            {summaryMode === 'synthetic' ? item.salBreakdown.map(s => s.salNumber).join(',') : ''}
                                                                        </td>
                                                                        <td className="px-1.5 py-1.5 text-center font-mono text-[10px] border-r border-[#1e40af]">
                                                                            {summaryMode === 'synthetic' ? allLines.map(l => l.registerOrderIndex).join(',') : ''}
                                                                        </td>
                                                                        <td className="px-2.5 py-1.5 text-right font-mono border-r border-[#1e40af] align-top">
                                                                            <div className="border-t border-gray-400 pt-0.5">{fmtQty(item.totalQuantity)}</div>
                                                                        </td>
                                                                        <td className="px-2.5 py-1.5 text-right font-mono border-r border-[#1e40af] align-top">
                                                                            <div>{numberFormatter.format(item.unitPrice)}</div>
                                                                            {itemPriceAliquota && <div className="text-[10px] font-normal">({itemPriceAliquota}%)</div>}
                                                                        </td>
                                                                        <td className="px-2.5 py-1.5 text-right font-mono align-top">
                                                                            <div className="border-t border-gray-400 pt-0.5">{numberFormatter.format(item.totalAmount)}</div>
                                                                            {itemTotalAliquota && <div className="text-[10px] font-normal">({itemTotalAliquota}%)</div>}
                                                                        </td>
                                                                    </tr>
                                                                </React.Fragment>
                                                            );
                                                        })}

                                                        {/* Subtotale Sezione */}
                                                        <tr className="bg-[#e0f2fe] dark:bg-sky-950/60 font-bold border-y border-[#1e40af]">
                                                            <td className="border-r border-[#1e40af]"></td>
                                                            <td className="px-3 py-1.5 text-right border-r border-[#1e40af] text-[#1e3a8a] dark:text-sky-100">
                                                                <div>{isBody ? 'Parziale LAVORI A CORPO euro' : `Parziale ${title.split('\n')[0]} euro`}</div>
                                                                {sectionAliquota && <div className="text-[10px] font-normal italic">aliquota</div>}
                                                            </td>
                                                            <td className="border-r border-[#1e40af]"></td>
                                                            <td className="border-r border-[#1e40af]"></td>
                                                            <td className="border-r border-[#1e40af]"></td>
                                                            <td className="border-r border-[#1e40af]"></td>
                                                            <td className="px-2.5 py-1.5 text-right font-mono text-[#1e3a8a] dark:text-sky-100">
                                                                <div>{numberFormatter.format(sectionSubtotal)}</div>
                                                                {sectionAliquota && <div className="text-[10px]">({sectionAliquota}%)</div>}
                                                            </td>
                                                        </tr>
                                                    </React.Fragment>
                                                );
                                            };

                                            const grandTotal = round2(visibleItems.reduce((acc, i) => acc + i.totalAmount, 0));

                                            return (
                                                <>
                                                    {renderSummarySection('LAVORI A MISURA', measureItems, false)}
                                                    {renderSummarySection(
                                                        `LAVORI A CORPO${currentSalData.bodyGroupsTotalValue > 0 ? `\n(Progetto euro ${numberFormatter.format(currentSalData.bodyGroupsTotalValue)} - 100%)` : ''}`,
                                                        bodyItems,
                                                        true
                                                    )}
                                                    {renderSummarySection('COSTI SICUREZZA (SPECIALI)', securityItems, false)}

                                                    {grandTotal > 0 && (
                                                        <tr className="bg-[#dbeafe] dark:bg-sky-950/80 font-bold border-t-2 border-[#1e40af]">
                                                            <td className="border-r border-[#1e40af]"></td>
                                                            <td className="px-4 py-4 border-r border-[#1e40af]">
                                                                <div className="text-right tracking-widest text-sm font-black text-[#1e3a8a] dark:text-sky-100">T O T A L E   euro</div>
                                                                <div className="mt-4 text-left font-normal text-xs">
                                                                    {localConfig.locationCity || 'Sede Lavori'}, {format(parseISO(salReferenceDate), 'dd/MM/yyyy')}
                                                                </div>
                                                                <div className="mt-4 text-center font-normal text-xs">
                                                                    <div>Il Direttore dei Lavori</div>
                                                                    <div className="font-bold mt-1">{localConfig.directorOfWorks || '____________________'}</div>
                                                                </div>
                                                            </td>
                                                            <td className="border-r border-[#1e40af]"></td>
                                                            <td className="border-r border-[#1e40af]"></td>
                                                            <td className="border-r border-[#1e40af]"></td>
                                                            <td className="border-r border-[#1e40af]"></td>
                                                            <td className="px-2.5 py-4 text-right font-mono text-sm font-black align-top text-[#1e3a8a] dark:text-white">
                                                                {numberFormatter.format(grandTotal)}
                                                            </td>
                                                        </tr>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </tbody>
                                </table>
                            </div>
                        ) : summaryGrouping === 'grouped_by_wbs' ? (
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
                                                Nessuna voce misurata presente nel periodo SAL selezionato.
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
                                                        <span className="text-indigo-600 dark:text-indigo-400">Contabilizzato: <strong className="font-bold">{currencyFormatter.format(groupTotAccounted)}</strong> ({formatItalianNumber(groupProgress, 1, 1)}%)</span>
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
                                                            <th className="px-2.5 py-1.5 w-56 border-r border-gray-200 dark:border-gray-700">Rif. Misure (N. LB. / Pag. / SAL)</th>
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
                                                                            {summaryMode === 'synthetic' && item.salBreakdown && item.salBreakdown.length > 0 && (
                                                                                <div className="flex flex-wrap items-center gap-1.5 mt-1.5 pt-1 border-t border-dashed border-gray-200 dark:border-gray-700">
                                                                                    <span className="text-[10px] font-bold uppercase text-gray-400">Riep. SAL:</span>
                                                                                    {item.salBreakdown.map(sb => (
                                                                                        <span key={sb.salNumber} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-[10px] font-mono text-indigo-700 dark:text-indigo-300">
                                                                                            <strong>{sb.salLabel}:</strong> {fmtQty(sb.quantity)} {item.unit} ({currencyFormatter.format(sb.amount)})
                                                                                        </span>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </td>
                                                                        <td className="px-2.5 py-2 border-r border-gray-200 dark:border-gray-700 align-top">
                                                                            {summaryMode === 'synthetic' && hasMeasures && (
                                                                                <div className="flex flex-wrap gap-1">
                                                                                    {allLines.map(line => (
                                                                                        <span
                                                                                            key={line.id}
                                                                                            title={`Data: ${format(parseISO(line.date), 'dd/MM/yyyy')} (${line.salLabel || 'SAL N. 1'}) - Q.tà: ${fmtQty(line.quantity)} - ${line.measurementNote}`}
                                                                                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600 whitespace-nowrap"
                                                                                        >
                                                                                            <strong>{formatLibrettoRef(line.progressiveIndex, line.librettoPage)}</strong>
                                                                                            <span className="px-1 rounded bg-indigo-600 text-white text-[9px] font-bold">{line.salLabel || 'SAL N. 1'}</span>
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
                                                                                const isCurrentSalLine = activeSalId
                                                                                    ? line.salNumber === (sals.find(s => s.id === activeSalId)?.number || 1)
                                                                                    : true;
                                                                                return (
                                                                                    <tr key={`sum-line-${line.id}`} className="bg-gray-50/40 dark:bg-gray-800/40 text-gray-600 dark:text-gray-400 text-[11px]">
                                                                                        <td className="px-2 py-1 border-r border-gray-200 dark:border-gray-700 text-center">
                                                                                            <span className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-mono font-bold ${isCurrentSalLine ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
                                                                                                {line.salLabel || 'SAL N. 1'}
                                                                                            </span>
                                                                                        </td>
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
                                                                                            <div className="inline-flex items-center gap-1 justify-center">
                                                                                                <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 font-mono font-bold text-[10px] whitespace-nowrap">
                                                                                                    {formatLibrettoRef(line.progressiveIndex, line.librettoPage)}
                                                                                                </span>
                                                                                                <span className={`px-1 py-0.2 rounded text-[9px] font-mono font-bold ${isCurrentSalLine ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200' : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>
                                                                                                    {line.salLabel || 'SAL N. 1'}
                                                                                                </span>
                                                                                            </div>
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
                                                                                <td className="px-3 py-1 border-r border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300">
                                                                                    <div className="uppercase">SOMMANO {item.unit}</div>
                                                                                    {item.salBreakdown && item.salBreakdown.length > 0 && (
                                                                                        <div className="flex flex-wrap items-center gap-1.5 mt-1 font-normal">
                                                                                            <span className="text-[9px] font-bold uppercase text-gray-400">Rif. SAL:</span>
                                                                                            {item.salBreakdown.map(sb => (
                                                                                                <span key={sb.salNumber} className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-700 text-[10px] font-mono text-indigo-700 dark:text-indigo-300">
                                                                                                    <strong>{sb.salLabel}:</strong> {fmtQty(sb.quantity)} {item.unit} ({currencyFormatter.format(sb.amount)})
                                                                                                </span>
                                                                                            ))}
                                                                                        </div>
                                                                                    )}
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
                                        <th className="px-3 py-2.5 w-60 border-r border-gray-200 dark:border-gray-600">Rif. Misure (N. LB. / Pag. / SAL)</th>
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
                                                        {summaryMode === 'synthetic' && item.salBreakdown && item.salBreakdown.length > 0 && (
                                                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5 pt-1 border-t border-dashed border-gray-200 dark:border-gray-700 font-normal">
                                                                <span className="text-[10px] font-bold uppercase text-gray-400">Riep. SAL:</span>
                                                                {item.salBreakdown.map(sb => (
                                                                    <span key={sb.salNumber} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-[10px] font-mono text-indigo-700 dark:text-indigo-300">
                                                                        <strong>{sb.salLabel}:</strong> {fmtQty(sb.quantity)} {item.unit} ({currencyFormatter.format(sb.amount)})
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 border-r border-gray-200 dark:border-gray-700 align-top">
                                                        {summaryMode === 'synthetic' && (
                                                            <div className="flex flex-wrap gap-1">
                                                                {allLines.map(line => (
                                                                    <span
                                                                        key={line.id}
                                                                        title={`Data: ${format(parseISO(line.date), 'dd/MM/yyyy')} (${line.salLabel || 'SAL N. 1'}) - Q.tà: ${fmtQty(line.quantity)} - ${line.measurementNote}`}
                                                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600 whitespace-nowrap"
                                                                    >
                                                                        <strong>{formatLibrettoRef(line.progressiveIndex, line.librettoPage)}</strong>
                                                                        <span className="px-1 rounded bg-indigo-600 text-white text-[9px] font-bold">{line.salLabel || 'SAL N. 1'}</span>
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
                                                            const isCurrentSalLine = activeSalId
                                                                ? line.salNumber === (sals.find(s => s.id === activeSalId)?.number || 1)
                                                                : true;

                                                            return (
                                                                <tr 
                                                                    key={`sum-line-${line.id}`} 
                                                                    className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/30 text-gray-700 dark:text-gray-300 text-xs"
                                                                >
                                                                    <td className="px-2.5 py-1.5 border-r border-gray-200 dark:border-gray-700 text-center">
                                                                        <span className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-mono font-bold ${isCurrentSalLine ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'}`}>
                                                                            {line.salLabel || 'SAL N. 1'}
                                                                        </span>
                                                                    </td>
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
                                                                            <span className={`px-1 py-0.2 rounded text-[9px] font-mono font-bold ${isCurrentSalLine ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200' : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>
                                                                                {line.salLabel || 'SAL N. 1'}
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
                                                            <td className="px-3 py-1.5 border-r border-gray-200 dark:border-gray-600 text-[11px] text-gray-700 dark:text-gray-200">
                                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                                    {item.salBreakdown && item.salBreakdown.length > 0 ? (
                                                                        <div className="flex flex-wrap items-center gap-1.5 font-normal">
                                                                            <span className="text-[9px] font-bold uppercase text-gray-400">Quote SAL:</span>
                                                                            {item.salBreakdown.map(sb => (
                                                                                <span key={sb.salNumber} className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-700 text-[10px] font-mono text-indigo-700 dark:text-indigo-300">
                                                                                    <strong>{sb.salLabel}:</strong> {fmtQty(sb.quantity)} {item.unit} ({currencyFormatter.format(sb.amount)})
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    ) : <span />}
                                                                    <span className="uppercase tracking-wider font-bold">SOMMANO {item.unit}</span>
                                                                </div>
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
                                                    {summarySalScope === 'current_sal'
                                                        ? `IMPORTO COMPETENZA DEL SOLO SAL N. ${sals.find(s => s.id === activeSalId)?.number || 'CORRENTE'}`
                                                        : `IMPORTO TOTALE PROGRESSIVO A TUTTO IL SAL N. ${sals.find(s => s.id === activeSalId)?.number || 'CORRENTE'}`}
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
                <div className="flex-grow overflow-auto bg-gray-200 dark:bg-gray-900 p-3 md:p-6 flex justify-center min-h-0">
                    <div
                        ref={certificateRef}
                        className="bg-white text-gray-900 w-[210mm] min-h-[297mm] px-[12mm] py-[12mm] shadow-2xl text-[11px] relative h-fit border border-gray-300"
                        style={{ fontFamily: "'Arial', 'Helvetica', sans-serif" }}
                    >
                        {/* INTESTAZIONE ISTITUZIONALE CON STEMMA */}
                        <div className="flex items-start gap-4 mb-4">
                            {/* Stemma Araldico SVG */}
                            <div className="w-16 h-20 flex-shrink-0 flex items-center justify-center">
                                <svg viewBox="0 0 80 96" className="w-14 h-18 text-gray-800">
                                    {/* Corona turrita */}
                                    <path d="M18 18 L22 8 L28 14 L34 8 L40 14 L46 8 L52 14 L58 8 L62 18 Z" fill="none" stroke="currentColor" strokeWidth="2.2" />
                                    {/* Scudo */}
                                    <path d="M20 22 H60 V50 C60 68 40 80 40 80 C40 80 20 68 20 50 Z" fill="none" stroke="currentColor" strokeWidth="2.5" />
                                    {/* Croce nello scudo */}
                                    <path d="M40 22 V79 M20 46 H60" stroke="currentColor" strokeWidth="5" />
                                    {/* Rami d'alloro e quercia */}
                                    <path d="M14 45 C10 64 24 82 40 88 C56 82 70 64 66 45" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2" />
                                </svg>
                            </div>
                            <div className="pt-1">
                                <div className="text-xl font-black tracking-wider text-gray-900">
                                    {localConfig.municipalityName || 'Comune / Stazione Appaltante'}
                                </div>
                                <div className="text-sm text-gray-800 font-normal">
                                    {localConfig.provinceName || 'Provincia / Ente Appaltante'}
                                </div>
                            </div>
                        </div>

                        {/* OGGETTO / COMMITTENTE / IMPRESA */}
                        <div className="space-y-1.5 mb-4 text-[11px]">
                            <div className="grid grid-cols-[110px_1fr] gap-2">
                                <div className="text-right font-bold uppercase">OGGETTO:</div>
                                <div className="text-justify leading-snug">{projectName || 'Lavori di realizzazione opera pubblica'}</div>
                            </div>
                            <div className="grid grid-cols-[110px_1fr] gap-2">
                                <div className="text-right font-bold uppercase">COMMITTENTE:</div>
                                <div>{localConfig.clientName || localConfig.municipalityName || '-'}</div>
                            </div>
                            <div className="grid grid-cols-[110px_1fr] gap-2">
                                <div className="text-right font-bold uppercase">IMPRESA:</div>
                                <div className="font-semibold">{localConfig.contractorName || '-'}</div>
                            </div>
                        </div>

                        {/* TITOLO CENTRALE CERTIFICATO */}
                        <div className="mb-4 pl-[118px]">
                            <div className="text-lg font-black uppercase tracking-wide text-gray-900 leading-tight">
                                CERTIFICATO DI PAGAMENTO N. {paymentCertData.currentSalNum}
                            </div>
                            <div className="text-xs font-bold uppercase text-gray-900">
                                PER IL PAGAMENTO DELLA RATA N. {paymentCertData.currentSalNum} DI euro {numberFormatter.format(paymentCertData.taxableCertified)}
                            </div>
                        </div>

                        {/* CORPO A DUE COLONNE: SINISTRA (CERTIFICATI PRECEDENTI + INAIL + DL) / DESTRA (QUADRO CONTABILE + CERTIFICA + RUP) */}
                        <div className="grid grid-cols-[62mm_1fr] gap-3 items-stretch">
                            {/* COLONNA SINISTRA RIQUADRATA AZZURRO GEGOLA */}
                            <div className="border-2 border-[#1e40af] flex flex-col justify-between text-[10px]">
                                <div>
                                    <div className="text-center font-bold uppercase py-1 border-b border-[#1e40af] text-[#1e3a8a] bg-[#dbeafe]">
                                        CERTIFICATI PRECEDENTI
                                    </div>
                                    <table className="w-full border-collapse text-[10px]">
                                        <thead>
                                            <tr className="border-b border-[#1e40af] text-[#1e3a8a] bg-[#eff6ff]">
                                                <th className="w-7 py-0.5 text-center border-r border-[#1e40af] font-bold">n.</th>
                                                <th className="w-20 py-0.5 text-center border-r border-[#1e40af] font-bold">data</th>
                                                <th className="py-0.5 pr-1.5 text-right font-bold">importo</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Array.from({ length: Math.max(25, paymentCertData.previousCertificates.length) }, (_, idx) => {
                                                const cert = paymentCertData.previousCertificates[idx];
                                                return (
                                                    <tr key={idx} className="leading-[13.5px]">
                                                        <td className="text-right pr-1 border-r border-[#1e40af] text-gray-700 font-mono">
                                                            {idx + 1}
                                                        </td>
                                                        <td className="text-center border-r border-[#1e40af] font-mono">
                                                            {cert ? format(parseISO(cert.date), 'dd/MM/yyyy') : ''}
                                                        </td>
                                                        <td className="text-right pr-1.5 font-mono">
                                                            {cert ? numberFormatter.format(cert.netCertificateAmount) : ''}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>

                                    {/* TOTALE E ANTICIPAZIONE */}
                                    <div className="border-t border-[#1e40af] grid grid-cols-[108px_1fr] items-center py-0.5 font-bold bg-[#eff6ff]">
                                        <div className="text-right pr-2 border-r border-[#1e40af]">TOTALE</div>
                                        <div className="text-right pr-1.5 font-mono">{numberFormatter.format(paymentCertData.previousCertificatesTotal)}</div>
                                    </div>
                                    <div className="border-t border-b border-[#1e40af] grid grid-cols-[108px_1fr] items-center py-0.5">
                                        <div className="text-right pr-2 border-r border-[#1e40af]">anticipazione</div>
                                        <div className="text-right pr-1.5 font-mono">{numberFormatter.format(paymentCertData.anticipationGranted)}</div>
                                    </div>
                                </div>

                                {/* ASSICURAZIONE OPERAI E FIRMA DIRETTORE DEI LAVORI */}
                                <div className="p-2 flex-grow flex flex-col justify-between">
                                    <div>
                                        <div className="text-center font-bold uppercase underline mb-2 text-[#1e3a8a]">
                                            ASSICURAZIONE OPERAI
                                        </div>
                                        <p className="text-[9.5px] leading-snug">
                                            L'Impresa ha assicurato gli operai con Polizza continuativa presso l'INAIL di
                                        </p>
                                        <div className="border-b border-gray-800 mt-2 pb-0.5 font-semibold text-[10px] min-h-[16px]">
                                            {localConfig.inailPolicy || ''}
                                        </div>
                                    </div>

                                    <div className="text-center mt-8 mb-4">
                                        <div className="font-semibold">Il Direttore dei Lavori</div>
                                        <div className="mt-1 font-bold">{localConfig.directorOfWorks || ''}</div>
                                    </div>
                                </div>
                            </div>

                            {/* COLONNA DESTRA: PREMESSA, TABELLA CONTABILE, CERTIFICAZIONE E RUP */}
                            <div className="flex flex-col justify-between text-[10.5px]">
                                <div>
                                    <div className="font-bold uppercase mb-2">IL SOTTOSCRITTO,</div>
                                    <p className="text-justify leading-snug mb-1">
                                        <strong>VISTO:</strong> il Contratto in data {localConfig.contractDate ? format(parseISO(localConfig.contractDate), 'dd/MM/yyyy') : '__/__/____'} {localConfig.contractRepertory || `CIG/CUP ${localConfig.contractCode || 'n.d.'}`} con il quale fu affidata alla predetta impresa l'esecuzione dei suindicati lavori;
                                    </p>
                                    <p className="text-justify leading-snug mb-3">
                                        <strong>RISULTANDO</strong> dalla contabilità sino ad oggi che l'ammontare dei lavori eseguiti e delle spese fatte è quello in seguito riportato:
                                    </p>

                                    {/* TABELLA CONTABILE DESTRA CON COLONNA IMPORTI INRIQUADRATA */}
                                    <div className="grid grid-cols-[1fr_36mm] items-stretch">
                                        {/* Etichette */}
                                        <div className="pr-2 flex flex-col">
                                            <div className="h-14 pt-1 text-right">
                                                <div>Lavori e somministrazioni</div>
                                                {localConfig.discountPercent > 0 && (
                                                    <div className="text-[9.5px] text-gray-600">
                                                        (al netto del ribasso del {numberFormatter.format(localConfig.discountPercent)}%)
                                                    </div>
                                                )}
                                            </div>
                                            <div className="h-6 flex items-center justify-end font-bold">
                                                SOMMANO importi soggetti a ritenute euro
                                            </div>
                                            <div className="h-10 pt-1 text-right">
                                                <div className="uppercase text-[10px]">IMPORTI NON SOGGETTI A RITENUTE</div>
                                                {paymentCertData.sommanoNonSoggettiARitenute > 0 && (
                                                    <div className="text-[9.5px] text-gray-600">Oneri di sicurezza non soggetti a ribasso</div>
                                                )}
                                            </div>
                                            <div className="h-6 flex items-center justify-end font-bold">
                                                SOMMANO importi NON soggetti a ritenute euro
                                            </div>
                                            <div className="h-6 flex items-center justify-end"></div>
                                            <div className="h-24 pt-1 text-right flex flex-col justify-between pb-1">
                                                <div className="space-y-0.5">
                                                    <div>Ritenuta per infortuni {numberFormatter.format(localConfig.withholdingTaxPercent)}%</div>
                                                    {(localConfig.advancePaymentPercent || 0) > 0 && (
                                                        <div>Recupero anticipazione {numberFormatter.format(localConfig.advancePaymentPercent || 0)}%</div>
                                                    )}
                                                </div>
                                                <div>Ammontare dei certificati precedenti euro</div>
                                            </div>
                                            <div className="h-6 flex items-center justify-end font-bold">
                                                SOMMANO LE DETRAZIONI euro
                                            </div>
                                            <div className="h-6 flex items-center justify-end font-bold">
                                                CREDITO Impresa {localConfig.roundCertificateTo100 ? 'arrotondato a 100 euro' : 'euro'}
                                            </div>
                                            <div className="h-6 flex items-center justify-end">
                                                per I.V.A. al {numberFormatter.format(localConfig.vatPercent)}%
                                            </div>
                                            <div className="h-7 flex items-center justify-end font-black tracking-widest">
                                                T O T A L E &nbsp; G E N E R A L E &nbsp; euro
                                            </div>
                                        </div>

                                        {/* Colonna Valori Riquadrata Azzurro GeCoLa */}
                                        <div className="border-2 border-[#1e40af] flex flex-col font-mono text-[10.5px]">
                                            <div className="h-14 pt-1 pr-1.5 text-right border-b border-[#1e40af]">
                                                <div>{numberFormatter.format(paymentCertData.sommanoSoggettiARitenute)}</div>
                                            </div>
                                            <div className="h-6 pr-1.5 flex items-center justify-end font-bold border-b border-[#1e40af] bg-[#eff6ff]">
                                                {numberFormatter.format(paymentCertData.sommanoSoggettiARitenute)}
                                            </div>
                                            <div className="h-10 pt-1 pr-1.5 text-right border-b border-[#1e40af]">
                                                {paymentCertData.sommanoNonSoggettiARitenute > 0 ? numberFormatter.format(paymentCertData.sommanoNonSoggettiARitenute) : ''}
                                            </div>
                                            <div className="h-6 pr-1.5 flex items-center justify-end font-bold border-b border-[#1e40af] bg-[#eff6ff]">
                                                {numberFormatter.format(paymentCertData.sommanoNonSoggettiARitenute)}
                                            </div>
                                            <div className="h-6 flex items-center justify-center font-sans font-bold text-[10px] border-b border-[#1e40af] bg-[#dbeafe] text-[#1e3a8a]">
                                                DETRAZIONI
                                            </div>
                                            <div className="h-24 pt-1 pr-1.5 text-right border-b border-[#1e40af] flex flex-col justify-between pb-1">
                                                <div className="space-y-0.5">
                                                    <div>{numberFormatter.format(paymentCertData.cumRetentionAmount)}</div>
                                                    {(localConfig.advancePaymentPercent || 0) > 0 && (
                                                        <div>{numberFormatter.format(paymentCertData.cumRecoveryAmount)}</div>
                                                    )}
                                                </div>
                                                <div>{numberFormatter.format(paymentCertData.previousCertificatesTotal)}</div>
                                            </div>
                                            <div className="h-6 pr-1.5 flex items-center justify-end font-bold border-b border-[#1e40af] bg-[#eff6ff]">
                                                {numberFormatter.format(paymentCertData.sommanoDetrazioni)}
                                            </div>
                                            <div className="h-6 pr-1.5 flex items-center justify-end font-bold border-b border-[#1e40af]">
                                                {numberFormatter.format(paymentCertData.taxableCertified)}
                                            </div>
                                            <div className="h-6 pr-1.5 flex items-center justify-end border-b border-[#1e40af]">
                                                {localConfig.vatPercent > 0 ? numberFormatter.format(paymentCertData.vatAmount) : ''}
                                            </div>
                                            <div className="h-7 pr-1.5 flex items-center justify-end font-bold bg-[#dbeafe] text-[#1e3a8a]">
                                                {numberFormatter.format(paymentCertData.totalPayable)}
                                            </div>
                                        </div>
                                    </div>

                                    {/* FORMULA C E R T I F I C A */}
                                    <div className="text-center font-bold text-sm tracking-[0.25em] my-3">
                                        C E R T I F I C A
                                    </div>
                                    <p className="text-justify leading-snug">
                                        CHE ai termini dell'articolo 23 del capitolato speciale d'appalto si può pagare all'impresa la rata di euro <strong>{numberFormatter.format(paymentCertData.taxableCertified)}</strong> oltre IVA, se dovuta, come per legge.
                                    </p>
                                    <p className="mt-1">
                                        Diconsi: <strong>(euro {paymentCertData.diconsiText})</strong>.
                                    </p>
                                </div>

                                {/* DATA E FIRMA RUP */}
                                <div className="mt-6 mb-4">
                                    <div>
                                        {localConfig.locationCity || 'Milano'}, {format(parseISO(salReferenceDate), 'dd/MM/yyyy')}
                                    </div>
                                    <div className="text-right pr-6 mt-4">
                                        <div className="inline-block text-center">
                                            <div className="font-semibold">Il Responsabile del Procedimento</div>
                                            <div className="font-bold mt-1">{localConfig.rupName || ''}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
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
                                  <span className="ml-1 text-xs font-bold text-red-600">(-{formatItalianNumber(discountPct, 1, 1)}%)</span>
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
                                  {remainingQty > 0 ? `Disponibile: ${numberFormatter.format(remainingQty)} ${item?.unit || 'cad'}` : 'Quota interamente utilizzata'} ({formatItalianNumber(pctUsed, 0, 0)}%)
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
                      <div className="flex-shrink-0 p-4 md:px-6 md:py-4 bg-gradient-to-r from-sky-700 via-blue-700 to-indigo-700 text-white flex justify-between items-center shadow-sm">
                        <div className="min-w-0 pr-4">
                          <h3 className="text-base md:text-lg font-black uppercase tracking-tight flex items-center gap-2 truncate">
                            <span className="p-1 rounded-md bg-white/20">⚖️</span>
                            <span>{editingDeprId ? 'Modifica Atto di Deprezzamento Prezzo' : 'Nuovo Deprezzamento di Prezzo (Determina del RUP)'}</span>
                          </h3>
                          <p className="text-[11px] md:text-xs text-sky-100 mt-0.5 truncate">
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
                                          ? `Riduzione: -${formatItalianNumber(discountPct, 2, 2)}% (-€ ${numberFormatter.format(unitReduction)} / ${itm?.unit})`
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

            {/* MODALE CREAZIONE / MODIFICA DATA SAL MANUALE CON CALENDARIO E RIFERIMENTO ULTIMA MISURA */}
            {isSalModalOpen && (() => {
              const sortedSals = [...sals].sort((a, b) => a.number - b.number);
              const editingSal = editingSalModalId ? sortedSals.find(s => s.id === editingSalModalId) : null;
              const targetSalNumber = editingSal
                ? editingSal.number
                : (sortedSals.length > 0 ? sortedSals[sortedSals.length - 1].number + 1 : 1);

              const prevSal = editingSal
                ? sortedSals.find(s => s.number === editingSal.number - 1) || null
                : (sortedSals.length > 0 ? sortedSals[sortedSals.length - 1] : null);
              const nextSal = editingSal
                ? sortedSals.find(s => s.number === editingSal.number + 1) || null
                : null;

              // Misure che rientrano in questo SAL in base alla data selezionata (salModalDate)
              const includedMeasures = salModalDate
                ? accountingRegistry.filter(e =>
                    prevSal ? (e.date > prevSal.date && e.date <= salModalDate) : (e.date <= salModalDate)
                  )
                : [];
              const includedGrossAmount = round2(includedMeasures.reduce((acc, e) => acc + e.debit, 0));

              // Misure successive alla data selezionata (che andranno nei SAL successivi)
              const futureMeasures = salModalDate
                ? accountingRegistry.filter(e => e.date > salModalDate)
                : [];

              return (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
                  <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
                    <div className="p-4 bg-gradient-to-r from-indigo-700 to-indigo-900 text-white flex justify-between items-center">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 bg-white/20 rounded">
                          {editingSal ? `Modifica Data SAL N. ${targetSalNumber}` : `Emissione Nuovo SAL N. ${targetSalNumber}`}
                        </span>
                        <h3 className="text-base font-black mt-1">
                          {editingSal
                            ? `Imposta Data di Chiusura del SAL N. ${targetSalNumber}`
                            : `Definisci Data di Chiusura per il SAL N. ${targetSalNumber}`}
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsSalModalOpen(false)}
                        className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>

                    <form onSubmit={handleConfirmSalModal} className="p-5 space-y-4 overflow-y-auto">
                      {/* Box informativo regola di competenza */}
                      <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-900 dark:text-indigo-200 leading-relaxed">
                        {prevSal ? (
                          <>
                            <strong>Regola di competenza SAL N. {targetSalNumber}:</strong> Confluiranno in questo SAL tutte le misure con data <strong>maggiore del {format(parseISO(prevSal.date), 'dd/MM/yyyy')}</strong> (data del SAL N. {prevSal.number}) e <strong>uguale o inferiore</strong> alla data del SAL N. {targetSalNumber} che imposti qui sotto.
                          </>
                        ) : (
                          <>
                            <strong>Regola di competenza Primo SAL (SAL N. 1):</strong> Confluiranno nel SAL N. 1 tutte le misure con data <strong>uguale o inferiore</strong> alla data del SAL scelta qui sotto. Le misure con data successiva confluiranno automaticamente nei SAL successivi.
                          </>
                        )}
                      </div>

                      {/* Box Data Ultima Misura registrata con pulsante rapido */}
                      <div className="p-3.5 rounded-xl bg-[#eff6ff] dark:bg-sky-950/40 border border-[#93c5fd] dark:border-sky-700/80 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <span className="text-[10px] font-black uppercase tracking-wider text-[#1e40af] dark:text-sky-300 block">
                            📏 Riferimento Libretto delle Misure
                          </span>
                          {measurementDatesMeta.latestDate ? (
                            <div className="text-xs text-[#1e3a8a] dark:text-sky-100 mt-0.5">
                              Data dell&apos;ultima misura registrata:{' '}
                              <strong className="font-mono text-sm font-black underline decoration-[#1e40af]">
                                {format(parseISO(measurementDatesMeta.latestDate), 'dd/MM/yyyy')}
                              </strong>
                              {measurementDatesMeta.earliestDate && measurementDatesMeta.earliestDate !== measurementDatesMeta.latestDate && (
                                <span className="block text-[11px] text-[#1e40af] dark:text-sky-300">
                                  (Prima misura: {format(parseISO(measurementDatesMeta.earliestDate), 'dd/MM/yyyy')} • Totale misure: {measurementDatesMeta.totalMeasurements})
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="text-xs text-[#1e40af] dark:text-sky-300 mt-0.5">
                              Nessuna misura ancora presente nel Libretto delle Misure. Puoi comunque scegliere liberamente la data del SAL.
                            </div>
                          )}
                        </div>
                        {measurementDatesMeta.latestDate && (
                          <button
                            type="button"
                            onClick={() => {
                              setSalModalDate(measurementDatesMeta.latestDate!);
                              setSalModalError(null);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-[#1e40af] hover:bg-[#1e3a8a] text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
                          >
                            <span>Usa data ultima misura ({format(parseISO(measurementDatesMeta.latestDate), 'dd/MM/yyyy')})</span>
                          </button>
                        )}
                      </div>

                      {/* Input Manuale Data + Calendario di supporto */}
                      <div>
                        <label className="block text-xs font-black uppercase tracking-wider text-gray-700 dark:text-gray-200 mb-1.5">
                          Data del SAL N. {targetSalNumber} ( Inserimento manuale GG/MM/AAAA o Calendario 📅 )
                        </label>
                        <div className="flex items-center gap-2">
                          <div className="flex-grow">
                            <EuropeanDateInput
                              value={salModalDate}
                              onChange={(val) => {
                                setSalModalDate(val);
                                setSalModalError(null);
                              }}
                              min={prevSal ? prevSal.date : undefined}
                              max={nextSal ? nextSal.date : undefined}
                              className="w-full p-2.5 border-2 border-indigo-400 dark:border-indigo-500 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                              required
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSalModalDate(format(new Date(), 'yyyy-MM-dd'));
                              setSalModalError(null);
                            }}
                            className="px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 text-xs font-bold text-gray-700 dark:text-gray-200 whitespace-nowrap"
                          >
                            Data Odierna
                          </button>
                        </div>
                        {prevSal && (
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                            Vincolo cronologico: la data deve essere successiva al SAL N. {prevSal.number} ({format(parseISO(prevSal.date), 'dd/MM/yyyy')}).
                          </p>
                        )}
                      </div>

                      {/* Elenco rapido date delle misure presenti nel libretto (cliccabili) */}
                      {measurementDatesMeta.byDate.length > 0 && (
                        <div>
                          <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                            Date delle misure presenti a Libretto (clicca per selezionare come data di taglio SAL):
                          </span>
                          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700">
                            {measurementDatesMeta.byDate.map((info) => {
                              const d = info.date;
                              const isBeforeOrEqualPrev = prevSal ? d <= prevSal.date : false;
                              const isSelected = d === salModalDate;
                              return (
                                <button
                                  key={d}
                                  type="button"
                                  disabled={isBeforeOrEqualPrev}
                                  onClick={() => {
                                    setSalModalDate(d);
                                    setSalModalError(null);
                                  }}
                                  className={`px-2 py-1 rounded-lg text-[11px] font-mono border transition-all flex items-center gap-1 ${
                                    isSelected
                                      ? 'bg-indigo-600 text-white border-indigo-700 font-bold shadow-xs'
                                      : isBeforeOrEqualPrev
                                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-700 opacity-50 cursor-not-allowed'
                                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:border-indigo-400'
                                  }`}
                                  title={isBeforeOrEqualPrev ? `Già contabilizzata in SAL precedente (≤ ${format(parseISO(prevSal!.date), 'dd/MM/yyyy')})` : `Imposta data SAL al ${format(parseISO(d), 'dd/MM/yyyy')}`}
                                >
                                  <span>{format(parseISO(d), 'dd/MM/yyyy')}</span>
                                  <span className={`px-1 rounded text-[9px] ${isSelected ? 'bg-indigo-800 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                                    {info.count} mis.
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Anteprima in tempo reale delle misure che finiscono nel SAL */}
                      <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                        <div>
                          <span className="text-[10px] font-bold uppercase text-emerald-800 dark:text-emerald-300 block">
                            Misure incluse nel SAL N. {targetSalNumber}
                          </span>
                          <span className="font-mono font-black text-base text-emerald-700 dark:text-emerald-300">
                            {includedMeasures.length} {includedMeasures.length === 1 ? 'misura' : 'misure'}
                          </span>
                          <span className="block text-[11px] font-mono font-bold text-emerald-800 dark:text-emerald-200">
                            Importo lordo: {currencyFormatter.format(includedGrossAmount)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400 block">
                            Misure con data successiva (&gt; SAL N. {targetSalNumber})
                          </span>
                          <span className="font-mono font-bold text-sm text-gray-700 dark:text-gray-300">
                            {futureMeasures.length} {futureMeasures.length === 1 ? 'misura' : 'misure'}
                          </span>
                          <span className="block text-[10px] text-gray-500 dark:text-gray-400">
                            (Andranno nel SAL N. {targetSalNumber + 1} e successivi)
                          </span>
                        </div>
                      </div>

                      {salModalError && (
                        <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-300 dark:border-red-700 text-xs font-bold text-red-700 dark:text-red-300">
                          ⚠️ {salModalError}
                        </div>
                      )}

                      <div className="flex justify-end items-center gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                        <button
                          type="button"
                          onClick={() => setIsSalModalOpen(false)}
                          className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          Annulla
                        </button>
                        <button
                          type="submit"
                          className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-all"
                        >
                          {editingSal ? `Aggiorna Data SAL N. ${targetSalNumber}` : `Conferma ed Emetti SAL N. ${targetSalNumber}`}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              );
            })()}
        </div>
    </div>
  );
};

export default AccountingView;
