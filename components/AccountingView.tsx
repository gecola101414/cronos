
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { ProjectDocument, ContractConfig, SalEntry, WorkGroup } from '../types';
import { format, parseISO, startOfDay, isAfter, endOfDay, isValid } from 'date-fns';
import { it } from 'date-fns/locale/it';
import { EuropeanDateInput } from './EuropeanDateInput';


declare const jspdf: any;
declare const html2canvas: any;

interface AccountingViewProps {
  documents: ProjectDocument[];
  projectName?: string;
  contractConfig?: ContractConfig;
  onUpdateContractConfig: (config: ContractConfig) => void;
  sals?: SalEntry[];
  onUpdateSals: (sals: SalEntry[]) => void;
  onToggleGroupSecurity?: (groupId: string) => void; 
}

const currencyFormatter = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const numberFormatter = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percentFormatter = new Intl.NumberFormat('it-IT', { style: 'percent', minimumFractionDigits: 2 });

const round2 = (num: number): number => {
    return Math.round((num + Number.EPSILON) * 100) / 100;
};

interface AccountingEntry {
    id: string; 
    progressiveIndex: number; 
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
}

interface SummaryEntry {
    articleCode: string;
    wbsName: string; 
    description: string;
    unit: string;
    unitPrice: number;
    estimatedQuantity: number; 
    previousQuantity: number;
    currentQuantity: number;
    totalQuantity: number; 
    totalAmount: number;
    progressPercent: number; 
    accountingType: 'measure' | 'body';
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
    onToggleGroupSecurity 
}) => {
  const [activeTab, setActiveTab] = useState<'libretto' | 'register' | 'summary' | 'sal_technical' | 'payment_cert' | 'settings'>('libretto');
  
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

                  const byDate: Record<string, { totalValue: number, ids: string[] }> = {};
                  groupMeasurements.forEach(m => {
                      if (!byDate[m.date]) byDate[m.date] = { totalValue: 0, ids: [] };
                      byDate[m.date].totalValue += m.monetaryValue;
                      byDate[m.date].ids.push(m.id);
                  });

                  Object.entries(byDate).forEach(([date, data]) => {
                      const dailyPercentage = group.value > 0 ? data.totalValue / group.value : 0;

                      entries.push({
                          id: `${group.id}-${date}`, 
                          progressiveIndex: tempIndexCounter++, 
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
                          accountingType: 'body'
                      });
                  });

              } else {
                  group.items.forEach(item => {
                      if (item.measurements) {
                          item.measurements.forEach(m => {
                              const debit = m.quantity * item.unitPrice;

                              entries.push({
                                  id: m.id,
                                  progressiveIndex: tempIndexCounter++, 
                                  date: m.date,
                                  articleCode: item.articleCode,
                                  originalIndex: item.originalIndex, 
                                  description: item.description,
                                  measurementNote: m.note,
                                  unit: item.unit,
                                  quantity: m.quantity,
                                  unitPrice: item.unitPrice,
                                  debit: debit,
                                  progressive: 0, 
                                  groupName: group.name,
                                  docName: doc.fileName,
                                  factor: m.factor, length: m.length, width: m.width, height: m.height,
                                  isSecurityCost: isSecurity,
                                  accountingType: 'measure'
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
          return 0;
      });

      const map = new Map<string, number>();
      let runningTotal = 0;
      const computedEntries = entries.map((entry, idx) => { 
          const actualIndex = idx + 1;
          map.set(entry.id, actualIndex);
          runningTotal += entry.debit; 
          return { ...entry, progressiveIndex: actualIndex, progressive: runningTotal }; 
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
      // D.Lgs 36/2023: Il libretto deve mostrare le misure del periodo corrente del SAL
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
        })
        .filter(entry => entry.date.localeCompare(previousSalDate) > 0);
  }, [accountingRegistry, salReferenceDate, previousSalDate, boqTotals]);

  const accountingSummary = useMemo(() => {
      const summaryMap = new Map<string, SummaryEntry>();
      
      // Calcoliamo su tutto lo storico fino al SAL corrente
      accountingRegistry
        .filter(e => e.date.localeCompare(salReferenceDate) <= 0)
        .forEach(entry => {
          if (!summaryMap.has(entry.articleCode)) {
              summaryMap.set(entry.articleCode, { 
                  articleCode: entry.articleCode, 
                  wbsName: entry.groupName, 
                  description: entry.accountingType === 'body' ? entry.groupName : entry.description, 
                  unit: entry.unit, 
                  unitPrice: entry.unitPrice, 
                  estimatedQuantity: 0, 
                  previousQuantity: 0,
                  currentQuantity: 0,
                  totalQuantity: 0, 
                  totalAmount: 0, 
                  progressPercent: 0, 
                  accountingType: entry.accountingType 
              });
          }
          const current = summaryMap.get(entry.articleCode)!;
          const isCurrentPeriod = entry.date.localeCompare(previousSalDate) > 0;
          
          if (isCurrentPeriod) {
              current.currentQuantity += entry.quantity;
          } else {
              current.previousQuantity += entry.quantity;
          }
          
          current.totalQuantity += entry.quantity;
          current.totalAmount += entry.debit;
      });

      return Array.from(summaryMap.values()).map(item => {
          if (item.accountingType === 'body') {
              return { ...item, estimatedQuantity: 1, progressPercent: item.totalQuantity * 100 };
          } else {
              const estimated = boqTotals.get(item.articleCode) || 0;
              return { ...item, estimatedQuantity: estimated, progressPercent: estimated > 0 ? (item.totalQuantity / estimated) * 100 : 0 };
          }
      }).sort((a, b) => a.articleCode.localeCompare(b.articleCode));
  }, [accountingRegistry, salReferenceDate, previousSalDate, boqTotals]);

  const applyFilters = (entry: any) => {
      const codeMatch = entry.articleCode.toLowerCase().includes(filters.code.toLowerCase());
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
      const doc = new jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      // Cover Page
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(24);
      doc.text(projectName || 'Progetto', pageWidth / 2, 60, { align: 'center' });
      
      doc.setFontSize(18);
      const titles = {
        libretto: 'Libretto delle Misure',
        register: 'Registro di Contabilità',
        summary: 'Sommario del Registro'
      };
      doc.text(titles[type], pageWidth / 2, 80, { align: 'center' });
      
      const sal = sals.find(s => s.id === activeSalId);
      if (sal) {
        doc.setFontSize(14);
        doc.setFont('helvetica', 'normal');
        doc.text(`Stato Avanzamento Lavori N. ${sal.number}`, pageWidth / 2, 100, { align: 'center' });
        doc.text(`Situazione contabile a tutto il ${format(parseISO(sal.date), 'dd/MM/yyyy')}`, pageWidth / 2, 110, { align: 'center' });
      }

      if (localConfig.contractorName) {
        doc.setFontSize(12);
        doc.text(`Impresa Appaltatrice: ${localConfig.contractorName}`, pageWidth / 2, 130, { align: 'center' });
      }
      
      if (localConfig.contractCode) {
        doc.text(`CIG/CUP: ${localConfig.contractCode}`, pageWidth / 2, 140, { align: 'center' });
      }

      // Footer cover
      doc.setFontSize(10);
      doc.text("Generato con Chronos AI", pageWidth / 2, pageHeight - 20, { align: 'center' });

      doc.addPage();

      // Table generation
      let columns: any[] = [];
      let rows: any[] = [];

      if (type === 'libretto') {
        columns = [
          { header: 'N.', dataKey: 'idx' },
          { header: 'Data', dataKey: 'date' },
          { header: 'Codice', dataKey: 'code' },
          { header: 'Descrizione e Note', dataKey: 'desc' },
          { header: 'U.M.', dataKey: 'um' },
          { header: 'Quantità', dataKey: 'qty' }
        ];
        rows = filteredLibretto.filter(applyFilters).map(e => ({
          idx: e.progressiveIndex,
          date: format(parseISO(e.date), 'dd/MM/yy'),
          code: e.articleCode,
          desc: `${e.description}${e.measurementNote ? '\nNote: ' + e.measurementNote : ''}`,
          um: e.unit,
          qty: e.accountingType === 'body' ? percentFormatter.format(e.quantity) : numberFormatter.format(e.quantity)
        }));
      } else if (type === 'register') {
        columns = [
          { header: 'N.', dataKey: 'idx' },
          { header: 'Data', dataKey: 'date' },
          { header: 'Descrizione', dataKey: 'desc' },
          { header: 'U.M.', dataKey: 'um' },
          { header: 'Q.tà', dataKey: 'qty' },
          { header: 'Prezzo', dataKey: 'price' },
          { header: 'Importo', dataKey: 'total' }
        ];
        rows = filteredRegistry.filter(applyFilters).map(e => ({
          idx: e.progressiveIndex,
          date: format(parseISO(e.date), 'dd/MM/yy'),
          desc: e.description,
          um: e.unit,
          qty: e.accountingType === 'body' ? percentFormatter.format(e.quantity) : numberFormatter.format(e.quantity),
          price: currencyFormatter.format(e.unitPrice),
          total: currencyFormatter.format(e.debit)
        }));
      } else if (type === 'summary') {
        columns = [
          { header: 'Codice', dataKey: 'code' },
          { header: 'Descrizione', dataKey: 'desc' },
          { header: 'U.M.', dataKey: 'um' },
          { header: 'Prezzo', dataKey: 'price' },
          { header: 'Q.tà Prec.', dataKey: 'qPrev' },
          { header: 'Q.tà Att.', dataKey: 'qCurr' },
          { header: 'Q.tà Tot.', dataKey: 'qTotal' },
          { header: 'Importo', dataKey: 'total' }
        ];
        rows = accountingSummary.filter(applyFilters).map(e => ({
          code: e.articleCode,
          desc: e.description,
          um: e.unit,
          price: currencyFormatter.format(e.unitPrice),
          qPrev: e.accountingType === 'body' ? percentFormatter.format(e.previousQuantity) : numberFormatter.format(e.previousQuantity),
          qCurr: e.accountingType === 'body' ? percentFormatter.format(e.currentQuantity) : numberFormatter.format(e.currentQuantity),
          qTotal: e.accountingType === 'body' ? percentFormatter.format(e.totalQuantity) : numberFormatter.format(e.totalQuantity),
          total: currencyFormatter.format(e.totalAmount)
        }));
      }

      (doc as any).autoTable({
        columns: columns,
        body: rows,
        startY: 25,
        margin: { top: 30, bottom: 20, left: 15, right: 15 },
        styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak', font: 'helvetica' },
        headStyles: { fillColor: [40, 40, 40], textColor: 255, fontStyle: 'bold', halign: 'center' },
        columnStyles: {
          idx: { halign: 'center', cellWidth: 10 },
          date: { halign: 'center', cellWidth: 20 },
          code: { fontStyle: 'bold', cellWidth: 25 },
          um: { halign: 'center', cellWidth: 12 },
          qty: { halign: 'right', cellWidth: 20 },
          price: { halign: 'right', cellWidth: 25 },
          total: { halign: 'right', cellWidth: 30, fontStyle: 'bold' },
          qPrev: { halign: 'right', cellWidth: 18 },
          qCurr: { halign: 'right', cellWidth: 18 },
          qTotal: { halign: 'right', cellWidth: 18, fontStyle: 'bold' }
        },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        didDrawPage: (data: any) => {
          // Header on every page
          doc.setFontSize(9);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(40);
          doc.text(`${projectName}`, 15, 15);
          doc.setFont('helvetica', 'normal');
          doc.text(`${titles[type]} - SAL N. ${sal?.number || ''}`, 15, 20);
          
          doc.setDrawColor(0);
          doc.setLineWidth(0.5);
          doc.line(15, 22, pageWidth - 15, 22);

          // Footer
          const str = "Pagina " + doc.internal.getNumberOfPages();
          doc.setFontSize(8);
          doc.setTextColor(100);
          doc.text(str, pageWidth - 25, pageHeight - 10);
          doc.text(`Data stampa: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 15, pageHeight - 10);
        }
      });

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

  return (
    <div className="p-4 md:p-6 h-[calc(100vh-100px)] flex flex-col">
        <div className="flex justify-between items-center mb-6 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm">
            <div>
                <h2 className="text-xl font-bold text-gray-800 dark:text-white">Contabilità Lavori</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    {activeSalId 
                        ? `Analisi corrente: SAL N. ${sals.find(s => s.id === activeSalId)?.number} al ${format(parseISO(salReferenceDate), 'dd/MM/yyyy')}`
                        : "Nessun SAL selezionato. Visualizzazione completa."
                    }
                </p>
            </div>
            
            <div className="flex items-center space-x-3">
                <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Seleziona SAL:</span>
                <select 
                    value={activeSalId || ''} 
                    onChange={e => setActiveSalId(e.target.value || null)}
                    className="p-2 bg-gray-100 dark:bg-gray-700 border-none rounded-lg text-sm font-bold text-indigo-700 dark:text-indigo-300 focus:ring-2 focus:ring-indigo-500"
                >
                    {sals.length === 0 && <option value="">-- Nessun SAL --</option>}
                    {[...sals].sort((a,b) => b.number - a.number).map(sal => (
                        <option key={sal.id} value={sal.id}>
                            SAL N. {sal.number} ({format(parseISO(sal.date), 'dd/MM/yy')}) {sal.isLocked ? '🔒' : ''}
                        </option>
                    ))}
                </select>
                {activeTab === 'settings' && (
                    <button onClick={handleAddNewSal} className="p-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200" title="Nuovo SAL">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                    </button>
                )}
            </div>
        </div>

        <div className="flex space-x-2 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg overflow-x-auto mb-4 flex-shrink-0">
            {[
                {id: 'libretto', label: 'Libretto Misure'},
                {id: 'register', label: 'Registro Contabilità'},
                {id: 'summary', label: 'Sommario'},
                {id: 'sal_technical', label: 'Riepilogo SAL'},
                {id: 'payment_cert', label: 'Certificato Pagamento'},
                {id: 'settings', label: 'Impostazioni & SAL'}
            ].map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap capitalize ${activeTab === tab.id ? 'bg-white dark:bg-gray-600 shadow text-indigo-600 dark:text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}>{tab.label}</button>
            ))}
        </div>

        <div className="flex-grow bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden flex flex-col relative">
            {['libretto', 'register', 'summary', 'sal_technical', 'payment_cert'].includes(activeTab) && (
                <div className="absolute top-4 right-4 z-20">
                    <button 
                        onClick={() => { 
                            if (activeTab === 'sal_technical' && certificateRef.current) generatePdfWithCover('Stato Avanzamento Lavori', certificateRef.current); 
                            else if (activeTab === 'payment_cert' && certificateRef.current) generatePdfWithCover('Certificato di Pagamento', certificateRef.current); 
                            else if (['libretto', 'register', 'summary'].includes(activeTab)) generateAccountingPdf(activeTab as any);
                        }} 
                        disabled={isGeneratingPdf} 
                        className="bg-indigo-600 text-white px-3 py-1.5 rounded-md text-xs font-bold shadow hover:bg-indigo-700 disabled:bg-gray-400 flex items-center gap-2"
                    >
                        {isGeneratingPdf ? 'Generazione...' : 'Scarica PDF'} 
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    </button>
                </div>
            )}

            {activeTab === 'settings' && (
                <div className="p-8 max-w-5xl mx-auto w-full overflow-y-auto">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="bg-gray-50 dark:bg-gray-700/30 p-6 rounded-xl border border-gray-200 dark:border-gray-600">
                            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4 border-b pb-2 dark:border-gray-600 flex items-center">
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

                        <div className="bg-gray-50 dark:bg-gray-700/30 p-6 rounded-xl border border-gray-200 dark:border-gray-600">
                            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-4 border-b pb-2 dark:border-gray-600 flex items-center">
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
                <div className="flex-grow overflow-auto bg-gray-100 dark:bg-gray-900 p-4 md:p-8 flex justify-center">
                    <div ref={certificateRef} className="bg-white text-gray-900 w-[210mm] min-h-[297mm] p-[15mm] shadow-2xl text-[12px] relative" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
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
                <div className="flex-grow p-4 md:p-6 overflow-hidden flex flex-col">
                    <div className="mb-4 flex justify-between items-end">
                        <div>
                            <h3 className="text-lg font-bold text-gray-800 dark:text-white uppercase tracking-tight">Libretto delle Misure</h3>
                            <p className="text-xs font-bold text-indigo-600 uppercase">
                                Periodo: {previousSalObject ? `dal ${format(parseISO(previousSalDate), 'dd/MM/yyyy')}` : 'dall\'inizio lavori'} al {format(parseISO(salReferenceDate), 'dd/MM/yyyy')}
                            </p>
                        </div>
                        <div className="text-right">
                            <span className="text-[10px] font-black text-gray-400 uppercase">D.Lgs 36/2023 - Art. 114</span>
                        </div>
                    </div>
                    <div ref={contentRef} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex-grow overflow-auto">
                         <table className="w-full text-xs text-left border-collapse">
                            <thead className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold border-b dark:border-gray-600 sticky top-0 z-10 shadow-sm">
                                <tr><th className="p-3 w-16 text-center border-r dark:border-gray-600 align-top">N.</th><th className="p-3 w-24 border-r dark:border-gray-600 align-top">Data</th><th className="p-3 w-16 text-center border-r dark:border-gray-600 align-top text-indigo-600">Num. ord.</th><th className="p-3 w-32 border-r dark:border-gray-600 align-top">WBS</th><th className="p-3 w-32 border-r dark:border-gray-600 align-top">Codice</th><th className="p-3 border-r dark:border-gray-600 align-top">Descrizione & Note</th><th className="p-3 w-12 text-center border-r dark:border-gray-600 bg-gray-50 align-top">U.M.</th><th className="p-3 w-24 text-right bg-indigo-50 align-top">Quantità</th></tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {filteredLibretto.filter(applyFilters).map((entry) => (
                                    <tr key={entry.id} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 ${entry.accountingType === 'body' ? 'bg-purple-50/50' : ''}`}>
                                        <td className="p-3 text-center border-r dark:border-gray-600 bg-gray-50/50 align-top">{entry.progressiveIndex}</td>
                                        <td className="p-3 border-r dark:border-gray-600 align-top">{format(parseISO(entry.date), 'dd/MM/yy')}</td>
                                        <td className="p-3 border-r dark:border-gray-600 align-top text-center font-bold text-indigo-700">{entry.originalIndex || '-'}</td>
                                        <td className="p-3 border-r dark:border-gray-600 align-top text-xs uppercase font-semibold">{entry.groupName}</td>
                                        <td className="p-3 border-r dark:border-gray-600 align-top font-mono text-xs">{entry.articleCode}</td>
                                        <td className="p-3 border-r dark:border-gray-600"><div className="text-xs mb-1">{entry.description}</div><div className="italic text-indigo-700">{entry.measurementNote || '-'}</div></td>
                                        <td className="p-3 text-center border-r dark:border-gray-600">{entry.unit}</td>
                                        <td className="p-3 text-right font-bold font-mono bg-indigo-50/30">{entry.accountingType === 'body' ? percentFormatter.format(entry.quantity) : numberFormatter.format(entry.quantity)}</td>
                                    </tr>
                                ))}
                            </tbody>
                         </table>
                    </div>
                </div>
            )}
            
            {activeTab === 'register' && (
                <div className="flex-grow p-4 md:p-6 overflow-hidden flex flex-col">
                    <div className="mb-4 flex justify-between items-end">
                        <div>
                            <h3 className="text-lg font-bold text-gray-800 dark:text-white uppercase tracking-tight">Registro di Contabilità</h3>
                            <p className="text-xs font-bold text-indigo-600 uppercase">
                                Situazione cumulativa al {format(parseISO(salReferenceDate), 'dd/MM/yyyy')}
                            </p>
                        </div>
                        <div className="text-right">
                            <span className="text-[10px] font-black text-gray-400 uppercase">Documento Fiscale - Registro Cronologico</span>
                        </div>
                    </div>
                    <div ref={contentRef} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex-grow overflow-auto">
                        <table className="w-full text-sm text-left text-gray-600 dark:text-gray-300 border-collapse">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-100 sticky top-0 z-10">
                            <tr><th className="px-4 py-3 w-20 text-center border-r">Rif. M.</th><th className="px-4 py-3 w-24">Data</th><th className="px-4 py-3 w-20 text-center border-r">Num. ord.</th><th className="px-4 py-3 w-32">WBS</th><th className="px-4 py-3">Descrizione</th><th className="px-4 py-3 w-16 text-center">U.M.</th><th className="px-4 py-3 text-right w-24">Q.tà</th><th className="px-4 py-3 text-right w-24">Prezzo</th><th className="px-4 py-3 text-right w-32 font-bold">Importo</th></tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredRegistry.filter(applyFilters).map((entry, idx) => {
                                const isCurrentPeriod = entry.date.localeCompare(previousSalDate) > 0;
                                return (
                                    <tr key={idx} className={`hover:bg-gray-50 ${entry.isSecurityCost ? 'bg-green-50' : entry.accountingType === 'body' ? 'bg-purple-50/50' : ''} ${isCurrentPeriod ? 'border-l-4 border-l-indigo-500' : 'opacity-75'}`}>
                                        <td className="px-4 py-2 text-center font-bold border-r">{entry.progressiveIndex}</td>
                                        <td className="px-4 py-2">{format(parseISO(entry.date), 'dd/MM/yy')}</td>
                                        <td className="px-4 py-2 text-center font-bold text-indigo-700 border-r">{entry.originalIndex || '-'}</td>
                                        <td className="px-4 py-2 text-xs uppercase font-bold">{entry.groupName}</td>
                                        <td className="px-4 py-2 truncate max-w-md">
                                            {entry.description}
                                            {isCurrentPeriod && <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 uppercase tracking-tighter">Nuovo</span>}
                                        </td>
                                        <td className="px-4 py-2 text-center">{entry.unit}</td>
                                        <td className="px-4 py-2 text-right">{entry.accountingType === 'body' ? percentFormatter.format(entry.quantity) : numberFormatter.format(entry.quantity)}</td>
                                        <td className="px-4 py-2 text-right">{currencyFormatter.format(entry.unitPrice)}</td>
                                        <td className="px-4 py-2 text-right font-bold">{currencyFormatter.format(entry.debit)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

            {activeTab === 'summary' && (
                <div className="flex-grow p-4 md:p-6 overflow-hidden flex flex-col">
                    <div className="mb-4 flex justify-between items-end">
                        <div>
                            <h3 className="text-lg font-bold text-gray-800 dark:text-white uppercase tracking-tight">Sommario del Registro</h3>
                            <p className="text-xs font-bold text-indigo-600 uppercase">
                                Riepilogo per articolo - SAL N. {sals.find(s => s.id === activeSalId)?.number || 'Bozza'}
                            </p>
                        </div>
                        <div className="text-right">
                            <span className="text-[10px] font-black text-gray-400 uppercase">Analisi Avanzamento per Categoria</span>
                        </div>
                    </div>
                    <div ref={contentRef} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 flex-grow overflow-auto">
                        <table className="w-full text-sm text-left text-gray-600 dark:text-gray-300 border-collapse">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-100 sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="px-4 py-3 border-r">Codice Articolo</th>
                                <th className="px-4 py-3 border-r">WBS</th>
                                <th className="px-4 py-3">Descrizione</th>
                                <th className="px-4 py-3 w-16 text-center">U.M.</th>
                                <th className="px-4 py-3 text-right w-24">Prezzo</th>
                                <th className="px-4 py-3 text-right w-24 bg-gray-50">Q.tà Prec.</th>
                                <th className="px-4 py-3 text-right w-24 bg-indigo-50">Q.tà Att.</th>
                                <th className="px-4 py-3 text-right w-24 font-bold">Q.tà Tot.</th>
                                <th className="px-4 py-3 text-right w-32 font-bold">Importo</th>
                                <th className="px-4 py-3 text-center w-28">%</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {accountingSummary.filter(applyFilters).map((item, idx) => (
                                <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                                    <td className="px-4 py-2 font-mono text-xs border-r dark:border-gray-700">{item.articleCode}</td>
                                    <td className="px-4 py-2 text-xs uppercase font-bold border-r dark:border-gray-700">{item.wbsName}</td>
                                    <td className="px-4 py-2 truncate max-w-xs">{item.description}</td>
                                    <td className="px-4 py-2 text-center">{item.unit}</td>
                                    <td className="px-4 py-2 text-right">{currencyFormatter.format(item.unitPrice)}</td>
                                    <td className="px-4 py-2 text-right bg-gray-50">{item.accountingType === 'body' ? percentFormatter.format(item.previousQuantity) : numberFormatter.format(item.previousQuantity)}</td>
                                    <td className="px-4 py-2 text-right bg-indigo-50 font-semibold">{item.accountingType === 'body' ? percentFormatter.format(item.currentQuantity) : numberFormatter.format(item.currentQuantity)}</td>
                                    <td className="px-4 py-2 text-right font-bold">{item.accountingType === 'body' ? percentFormatter.format(item.totalQuantity) : numberFormatter.format(item.totalQuantity)}</td>
                                    <td className="px-4 py-2 text-right font-bold">{currencyFormatter.format(item.totalAmount)}</td>
                                    <td className="px-4 py-2 text-center">
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                                                <div className="h-full bg-green-500" style={{ width: `${Math.min(100, item.progressPercent)}%` }}></div>
                                            </div>
                                            <span className="text-[10px] font-bold min-w-[35px]">{item.progressPercent.toFixed(1)}%</span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

            {activeTab === 'payment_cert' && (
                <div className="flex-grow overflow-auto bg-gray-100 dark:bg-gray-900 p-4 md:p-8 flex justify-center">
                    <div ref={certificateRef} className="bg-white text-gray-900 w-[210mm] min-h-[297mm] p-[20mm] shadow-2xl text-[12px] relative" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
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
        </div>
    </div>
  );
};

export default AccountingView;
