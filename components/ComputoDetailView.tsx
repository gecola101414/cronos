import React, { useRef, useState, useMemo } from 'react';
import { ProjectDocument } from '../types';
import { format } from 'date-fns';
import { it } from 'date-fns/locale/it';

const currencyFormatter = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const numberFormatter = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

declare const jspdf: any;
declare const html2canvas: any;

interface ComputoDetailViewProps {
    documents: ProjectDocument[];
}

const ComputoDetailView: React.FC<ComputoDetailViewProps> = ({ documents }) => {
  const reportRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('all');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const handleSavePdf = async () => {
    const { jsPDF } = jspdf;
    const reportElement = reportRef.current;
    if (!reportElement) return;

    setIsGeneratingPdf(true);

    try {
      const canvas = await html2canvas(reportElement, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'landscape', 
        unit: 'mm',
        format: 'a4',
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgProps = pdf.getImageProperties(imgData);
      const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = position - pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfHeight;
      }
      
      const fileName = `Computo_Metrico_Aggiornato_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);

    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Si è verificato un errore durante la generazione del PDF.");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const formatVariationHeader = (header: string) => {
      if (!isNaN(Number(header))) {
          return `Variante n. ${header}`;
      }
      return header;
  };

  const toggleGroupCollapse = (groupKey: string) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }));
  };

  const toggleAllGroups = (collapse: boolean) => {
    const newCollapsed: Record<string, boolean> = {};
    documents.forEach((doc, docIdx) => {
      doc.workGroups.forEach((wg, wgIdx) => {
        newCollapsed[`${docIdx}-${wgIdx}`] = collapse;
      });
    });
    setCollapsedGroups(newCollapsed);
  };

  // Statistiche totali computo
  const totalStats = useMemo(() => {
    let totalItems = 0;
    let totalValue = 0;
    let totalLabor = 0;
    let totalGroups = 0;

    documents.forEach(doc => {
      totalGroups += doc.workGroups.length;
      doc.workGroups.forEach(g => {
        totalItems += g.items.length;
        g.items.forEach(i => {
          const varQty = (i.variations || []).reduce((acc, v) => v.type === 'increase' ? acc + v.quantity : acc - v.quantity, 0);
          const itemTotal = (i.quantity + varQty) * i.unitPrice;
          totalValue += itemTotal;
          totalLabor += itemTotal * ((i.laborRate || 0) / 100);
        });
      });
    });

    return { totalItems, totalValue, totalLabor, totalGroups };
  }, [documents]);

  const allAvailableGroups = useMemo(() => {
    const groups: { id: string; name: string }[] = [];
    documents.forEach(doc => {
      doc.workGroups.forEach(g => {
        if (!groups.some(existing => existing.name === g.name)) {
          groups.push({ id: g.id, name: g.name });
        }
      });
    });
    return groups;
  }, [documents]);

  return (
    <div className="flex flex-col h-full flex-1 min-h-0 overflow-hidden">
       {/* BARRA SUPERIORE COMPATTA E CONTROLLI (Sticky / Fixed) */}
       <div className="flex-shrink-0 bg-white dark:bg-gray-800 px-3 md:px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 shadow-xs z-20">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-sm md:text-base font-black text-gray-900 dark:text-white uppercase tracking-tight flex items-center gap-2 truncate">
              <span>📋 Computo Metrico</span>
            </h1>
            <span className="px-2 py-0.5 text-[11px] font-bold bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 rounded-full whitespace-nowrap">
              {totalStats.totalGroups} Categorie
            </span>
            <span className="px-2 py-0.5 text-[11px] font-bold bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 rounded-full whitespace-nowrap">
              {totalStats.totalItems} Voci
            </span>
          </div>

          <div className="flex items-center gap-3 flex-wrap ml-auto">
            <div className="hidden sm:flex items-center gap-3 text-xs font-bold text-gray-600 dark:text-gray-300">
              <span>Totale: <strong className="text-gray-900 dark:text-white font-mono">{currencyFormatter.format(totalStats.totalValue)}</strong></span>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <span>M.O.: <strong className="text-blue-600 font-mono">{currencyFormatter.format(totalStats.totalLabor)}</strong></span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => toggleAllGroups(false)}
                className="px-2.5 py-1 text-xs font-bold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 rounded-md transition-colors"
                title="Espandi tutti i gruppi"
              >
                Espandi
              </button>
              <button
                onClick={() => toggleAllGroups(true)}
                className="px-2.5 py-1 text-xs font-bold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 rounded-md transition-colors"
                title="Comprimi tutti i gruppi"
              >
                Comprimi
              </button>
              <button
                onClick={handleSavePdf}
                disabled={isGeneratingPdf}
                className="px-3 py-1 text-xs font-bold text-white bg-indigo-600 rounded-md hover:bg-indigo-700 flex items-center space-x-1.5 transition-colors disabled:bg-indigo-400 shadow-xs"
              >
                {isGeneratingPdf ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-1.5 h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>PDF...</span>
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clipRule="evenodd" />
                    </svg>
                    <span>Salva PDF</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* FILTRO E RICERCA COMPATTO */}
        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700/60 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap flex-1 min-w-[260px]">
            <div className="relative flex-1 min-w-[180px]">
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="🔍 Cerca codice articolo o descrizione voce..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            <select
              value={selectedGroupFilter}
              onChange={e => setSelectedGroupFilter(e.target.value)}
              className="py-1.5 px-2.5 text-xs bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 rounded-lg font-semibold text-gray-800 dark:text-gray-100 outline-none"
            >
              <option value="all">📁 Tutti i Gruppi / Categorie ({allAvailableGroups.length})</option>
              {allAvailableGroups.map(g => (
                <option key={g.id} value={g.name}>{g.name}</option>
              ))}
            </select>
          </div>
        </div>
       </div>

       {/* CORPO DEL COMPUTO A TUTTA PAGINA CON SCROLL FLUIDO */}
       <div className="flex-grow overflow-y-auto p-3 md:p-4 space-y-4 min-h-0">
        <div ref={reportRef} className="space-y-4">
        {documents.map((doc, docIndex) => {
            const variationHeaders = Array.from(new Set<string>(
                doc.workGroups.flatMap(wg => 
                    wg.items.flatMap(i => i.variations?.map(v => v.number) || [])
                )
            )).sort();

            const docTotalNewValue = doc.workGroups.reduce((acc, group) => {
                const groupVal = group.items.reduce((iAcc, item) => {
                    const varQty = (item.variations || []).reduce((vAcc, v) => v.type === 'increase' ? vAcc + v.quantity : vAcc - v.quantity, 0);
                    return iAcc + ((item.quantity + varQty) * item.unitPrice);
                }, 0);
                return acc + groupVal;
            }, 0);

            const docTotalItems = doc.workGroups.reduce((acc, g) => acc + g.items.length, 0);

            let itemCounter = 1;

            return (
              <div key={docIndex} className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl shadow-md mb-6 overflow-hidden border border-gray-200 dark:border-gray-700">
                <div className="flex flex-col sm:flex-row justify-between sm:items-end border-b pb-3 border-gray-300 dark:border-gray-600 mb-6 gap-2">
                    <div>
                      <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                        <span>Corpo d'Opera:</span>
                        <span className="text-indigo-600 dark:text-indigo-400 font-black">{doc.fileName}</span>
                      </h2>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {doc.workGroups.length} gruppi di lavorazione strutturati • {docTotalItems} voci complessive
                      </p>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Nuovo Importo Totale Computo</p>
                        <p className="text-2xl font-black text-gray-900 dark:text-white font-mono">{currencyFormatter.format(docTotalNewValue)}</p>
                    </div>
                </div>
                
                <div className="space-y-6">
                  {doc.workGroups.map((group, groupIndex) => {
                    const groupKey = `${docIndex}-${groupIndex}`;
                    const isCollapsed = Boolean(collapsedGroups[groupKey]);

                    // Filtro per gruppo selezionato
                    if (selectedGroupFilter !== 'all' && group.name !== selectedGroupFilter) {
                      return null;
                    }

                    // Filtro di ricerca per voce
                    const filteredItems = group.items.filter(item => {
                      if (!searchTerm.trim()) return true;
                      const q = searchTerm.toLowerCase();
                      const fullCode = `${item.originalIndex ? `n. cm. ${item.originalIndex} - n.${item.originalIndex} - ` : ''}${item.articleCode}`.toLowerCase();
                      return fullCode.includes(q) || item.articleCode.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
                    });

                    if (searchTerm.trim() && filteredItems.length === 0) {
                      return null;
                    }

                    const groupTotalNewValue = group.items.reduce((iAcc, item) => {
                        const varQty = (item.variations || []).reduce((vAcc, v) => v.type === 'increase' ? vAcc + v.quantity : vAcc - v.quantity, 0);
                        return iAcc + ((item.quantity + varQty) * item.unitPrice);
                    }, 0);

                    return (
                    <div key={groupIndex} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-xs transition-all">
                      {/* INTESTAZIONE GRUPPO CLICCABILE PER ESPANDERE / COMPRIMERE */}
                      <div 
                        onClick={() => toggleGroupCollapse(groupKey)}
                        className={`p-3.5 flex justify-between items-center cursor-pointer select-none transition-colors ${
                          group.isSecurityCost 
                            ? 'bg-orange-50 dark:bg-orange-950/40 text-orange-900 dark:text-orange-100 hover:bg-orange-100/80 border-b border-orange-200 dark:border-orange-800' 
                            : 'bg-gray-100 dark:bg-gray-700/70 text-gray-800 dark:text-gray-100 hover:bg-gray-200/70 border-b border-gray-200 dark:border-gray-600'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="text-gray-400 font-mono text-sm transform transition-transform duration-200">
                              {isCollapsed ? '▶' : '▼'}
                            </span>
                            <span className="font-black text-sm uppercase tracking-wide">{group.name}</span>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white/80 dark:bg-gray-800/80 text-gray-600 dark:text-gray-300 shadow-2xs">
                              {group.items.length} {group.items.length === 1 ? 'voce' : 'voci'}
                            </span>
                            {group.isSecurityCost ? (
                                <span className="text-[10px] font-black px-2 py-0.5 bg-orange-600 text-white rounded-full uppercase tracking-wider" title="Configurato nel Cronoprogramma: Oneri di Sicurezza non soggetti a ribasso">SICUREZZA</span>
                            ) : group.accountingType === 'body' ? (
                                <span className="text-[10px] font-black px-2 py-0.5 bg-purple-600 text-white rounded-full uppercase tracking-wider" title="Configurato nel Cronoprogramma: Lavori a Corpo">A CORPO</span>
                            ) : (
                                <span className="text-[10px] font-black px-2 py-0.5 bg-blue-600 text-white rounded-full uppercase tracking-wider" title="Configurato nel Cronoprogramma: Lavori a Misura">A MISURA</span>
                            )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-sm text-indigo-600 dark:text-indigo-400 font-mono">
                            {currencyFormatter.format(groupTotalNewValue)}
                          </span>
                        </div>
                      </div>

                      {/* TABELLA VOCI DEL GRUPPO (NESSUN LIMITE ARTIFICIALE DI ALTEZZA) */}
                      {!isCollapsed && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs text-left text-gray-500 dark:text-gray-400 border-collapse">
                            <thead className="text-[11px] text-gray-700 dark:text-gray-300 uppercase bg-gray-50 dark:bg-gray-700/50 sticky top-0 z-10 border-b border-gray-200 dark:border-gray-600">
                              <tr>
                                <th scope="col" className="px-3 py-2.5 w-20 text-center font-bold">N. CM.</th>
                                <th scope="col" className="px-3 py-2.5 w-36 font-bold">Codice Art.</th>
                                <th scope="col" className="px-3 py-2.5 min-w-[220px] font-bold">Descrizione della Lavorazione / Fornitura</th>
                                <th scope="col" className="px-2 py-2.5 w-14 text-center font-bold">U.M.</th>
                                <th scope="col" className="px-3 py-2.5 w-24 text-right font-bold">P. Unitario</th>
                                <th scope="col" className="px-3 py-2.5 w-24 text-right bg-yellow-50 dark:bg-yellow-900/10 font-bold">Q.tà Computo</th>
                                {variationHeaders.map(vh => (
                                    <th key={vh} scope="col" className="px-3 py-2.5 w-24 text-right text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/10 whitespace-nowrap font-bold">
                                        {formatVariationHeader(vh)}
                                    </th>
                                ))}
                                <th scope="col" className="px-3 py-2.5 w-24 text-right font-black bg-green-50 dark:bg-green-900/10 text-green-800 dark:text-green-300">Nuova Q.tà</th>
                                <th scope="col" className="px-3 py-2.5 w-28 text-right font-black bg-green-50 dark:bg-green-900/10 text-green-800 dark:text-green-300">Nuovo Totale</th>
                                <th scope="col" className="px-2 py-2.5 w-20 text-right bg-blue-50 dark:bg-blue-900/10 font-bold" title="Incidenza Manodopera">Inc. M.O. %</th>
                                <th scope="col" className="px-3 py-2.5 w-24 text-right bg-blue-50 dark:bg-blue-900/10 font-bold" title="Costo Manodopera">Costo M.O.</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                              {filteredItems.map((item, itemIndex) => {
                                  const varTotal = (item.variations || []).reduce((acc, v) => v.type === 'increase' ? acc + v.quantity : acc - v.quantity, 0);
                                  const newQuantity = item.quantity + varTotal;
                                  const newTotal = newQuantity * item.unitPrice;
                                  const laborCost = newTotal * (item.laborRate ? item.laborRate / 100 : 0);
                                  const ordIdx = item.originalIndex || itemCounter++;

                                  return (
                                    <tr key={item.articleCode || itemIndex} className="bg-white dark:bg-gray-800 hover:bg-indigo-50/30 dark:hover:bg-gray-700/60 transition-colors">
                                      <td className="px-3 py-2.5 text-center text-xs font-mono text-gray-500 dark:text-gray-300 align-top font-bold whitespace-nowrap">
                                        {`N. CM. ${ordIdx}`}
                                      </td>
                                      <td className="px-3 py-2.5 font-mono font-bold text-indigo-700 dark:text-indigo-300 align-top text-xs whitespace-nowrap">
                                        {`N. CM. ${ordIdx} - ${item.articleCode}`}
                                      </td>
                                      <td className="px-3 py-2.5 align-top text-justify text-gray-800 dark:text-gray-200 leading-relaxed">
                                        {item.description}
                                      </td>
                                      <td className="px-2 py-2.5 align-top text-center font-bold text-gray-600 dark:text-gray-300">
                                        {item.unit}
                                      </td>
                                      <td className="px-3 py-2.5 align-top text-right font-mono font-medium text-gray-700 dark:text-gray-200 whitespace-nowrap">
                                        {currencyFormatter.format(item.unitPrice)}
                                      </td>
                                      <td className="px-3 py-2.5 align-top text-right bg-yellow-50/40 dark:bg-yellow-900/10 font-mono font-bold text-gray-900 dark:text-white whitespace-nowrap">
                                        {numberFormatter.format(item.quantity)}
                                      </td>
                                      {variationHeaders.map(vh => {
                                          const variation = item.variations?.find(v => v.number === vh);
                                          return (
                                              <td key={vh} className="px-3 py-2.5 align-top text-right font-mono text-xs bg-indigo-50/40 dark:bg-indigo-900/10 whitespace-nowrap">
                                                  {variation ? (
                                                      <span className={variation.type === 'increase' ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                                                          {variation.type === 'increase' ? '+' : '-'}{numberFormatter.format(variation.quantity)}
                                                      </span>
                                                  ) : '-'}
                                              </td>
                                          );
                                      })}
                                      <td className="px-3 py-2.5 align-top text-right font-black font-mono bg-green-50/40 dark:bg-green-900/10 text-emerald-800 dark:text-emerald-300 whitespace-nowrap">
                                        {numberFormatter.format(newQuantity)}
                                      </td>
                                      <td className="px-3 py-2.5 align-top text-right font-black font-mono text-gray-900 dark:text-white bg-green-50/40 dark:bg-green-900/10 whitespace-nowrap">
                                        {currencyFormatter.format(newTotal)}
                                      </td>
                                      <td className="px-2 py-2.5 align-top text-right text-xs font-mono text-blue-600 bg-blue-50/20 whitespace-nowrap">
                                        {item.laborRate ? `${item.laborRate.toFixed(2)}%` : '-'}
                                      </td>
                                      <td className="px-3 py-2.5 align-top text-right text-xs font-mono text-blue-700 dark:text-blue-300 bg-blue-50/20 whitespace-nowrap">
                                        {currencyFormatter.format(laborCost)}
                                      </td>
                                    </tr>
                                  );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )})}
                </div>
              </div>
            );
        })}
        </div>
      </div>
    </div>
  );
};

export default ComputoDetailView;
