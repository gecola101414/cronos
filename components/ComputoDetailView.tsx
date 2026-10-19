
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

  return (
    <div className="p-4 md:p-6 space-y-8">
       <div className="flex justify-end -mb-4">
        <button
          onClick={handleSavePdf}
          disabled={isGeneratingPdf}
          className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 flex items-center space-x-2 transition-colors disabled:bg-indigo-400"
        >
          {isGeneratingPdf ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Generando...</span>
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clipRule="evenodd" />
              </svg>
              <span>Salva PDF</span>
            </>
          )}
        </button>
       </div>
      <div ref={reportRef}>
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

            let itemCounter = 1;

            return (
              <div key={docIndex} className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-xl shadow-md mb-6 overflow-x-auto">
                <div className="flex justify-between items-end border-b pb-2 border-gray-300 dark:border-gray-600 mb-4">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                    File: <span className="text-indigo-600 dark:text-indigo-400">{doc.fileName}</span>
                    </h2>
                    <div className="text-right">
                        <p className="text-xs text-gray-500 uppercase font-bold">Nuovo Importo Totale</p>
                        <p className="text-xl font-bold text-gray-900 dark:text-white">{currencyFormatter.format(docTotalNewValue)}</p>
                    </div>
                </div>
                
                <div className="space-y-6">
                  {doc.workGroups.map((group, groupIndex) => {
                    const groupTotalNewValue = group.items.reduce((iAcc, item) => {
                        const varQty = (item.variations || []).reduce((vAcc, v) => v.type === 'increase' ? vAcc + v.quantity : vAcc - v.quantity, 0);
                        return iAcc + ((item.quantity + varQty) * item.unitPrice);
                    }, 0);

                    return (
                    <div key={groupIndex}>
                      <h3 className={`text-lg font-semibold mb-3 p-2.5 rounded-md flex justify-between items-center ${group.isSecurityCost ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-100 border border-orange-300 dark:border-orange-700' : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200'}`}>
                        <div className="flex items-center gap-2.5">
                            <span className="font-bold">{group.name}</span>
                            {group.isSecurityCost ? (
                                <span className="text-[10px] font-black px-2 py-0.5 bg-orange-600 text-white rounded-full uppercase tracking-wider" title="Configurato nel Cronoprogramma: Oneri di Sicurezza non soggetti a ribasso">SICUREZZA</span>
                            ) : group.accountingType === 'body' ? (
                                <span className="text-[10px] font-black px-2 py-0.5 bg-purple-600 text-white rounded-full uppercase tracking-wider" title="Configurato nel Cronoprogramma: Lavori a Corpo">A CORPO</span>
                            ) : (
                                <span className="text-[10px] font-black px-2 py-0.5 bg-blue-600 text-white rounded-full uppercase tracking-wider" title="Configurato nel Cronoprogramma: Lavori a Misura">A MISURA</span>
                            )}
                        </div>
                        <span className="font-bold text-base text-indigo-600 dark:text-indigo-400">
                          {currencyFormatter.format(groupTotalNewValue)}
                        </span>
                      </h3>
                      <div className="overflow-auto relative max-h-96">
                        <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                          <thead className="text-xs text-gray-700 uppercase bg-gray-100 dark:bg-gray-700 dark:text-gray-400 sticky top-0 z-10">
                            <tr>
                              <th scope="col" className="px-4 py-3 w-10 text-center">N.</th>
                              <th scope="col" className="px-4 py-3 w-24">Art.</th>
                              <th scope="col" className="px-4 py-3 min-w-[200px]">Descrizione</th>
                              <th scope="col" className="px-4 py-3 w-24 text-center">U.M.</th>
                              <th scope="col" className="px-4 py-3 w-24 text-right">P. Unit.</th>
                              <th scope="col" className="px-4 py-3 w-24 text-right bg-yellow-50 dark:bg-yellow-900/10">Q.tà Orig.</th>
                              {variationHeaders.map(vh => (
                                  <th key={vh} scope="col" className="px-4 py-3 w-24 text-right text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/10 whitespace-nowrap">
                                      {formatVariationHeader(vh)}
                                  </th>
                              ))}
                              <th scope="col" className="px-4 py-3 w-24 text-right font-bold bg-green-50 dark:bg-green-900/10">Nuova Q.tà</th>
                              <th scope="col" className="px-4 py-3 w-32 text-right font-bold bg-green-50 dark:bg-green-900/10">Nuovo Totale</th>
                              <th scope="col" className="px-4 py-3 w-24 text-right bg-blue-50 dark:bg-blue-900/10" title="Incidenza Manodopera">Inc. M.O. %</th>
                              <th scope="col" className="px-4 py-3 w-24 text-right bg-blue-50 dark:bg-blue-900/10" title="Costo Manodopera">Costo M.O.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.items.map((item, itemIndex) => {
                                const varTotal = (item.variations || []).reduce((acc, v) => v.type === 'increase' ? acc + v.quantity : acc - v.quantity, 0);
                                const newQuantity = item.quantity + varTotal;
                                const newTotal = newQuantity * item.unitPrice;
                                const laborCost = newTotal * (item.laborRate ? item.laborRate / 100 : 0);

                                return (
                                  <tr key={itemIndex} className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
                                    <td className="px-4 py-3 text-center text-xs text-gray-400 align-top">{itemCounter++}</td>
                                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white align-top font-mono text-xs">{item.articleCode}</td>
                                    <td className="px-4 py-3 align-top text-justify">{item.description}</td>
                                    <td className="px-4 py-3 align-top text-center">{item.unit}</td>
                                    <td className="px-4 py-3 align-top text-right">{currencyFormatter.format(item.unitPrice)}</td>
                                    <td className="px-4 py-3 align-top text-right bg-yellow-50/50 dark:bg-yellow-900/5">{numberFormatter.format(item.quantity)}</td>
                                    {variationHeaders.map(vh => {
                                        const variation = item.variations?.find(v => v.number === vh);
                                        return (
                                            <td key={vh} className="px-4 py-3 align-top text-right font-mono text-xs bg-indigo-50/50 dark:bg-indigo-900/5">
                                                {variation ? (
                                                    <span className={variation.type === 'increase' ? 'text-green-600' : 'text-red-600'}>
                                                        {variation.type === 'increase' ? '+' : '-'}{numberFormatter.format(variation.quantity)}
                                                    </span>
                                                ) : '-'}
                                            </td>
                                        );
                                    })}
                                    <td className="px-4 py-3 align-top text-right font-bold bg-green-50/50 dark:bg-green-900/5">{numberFormatter.format(newQuantity)}</td>
                                    <td className="px-4 py-3 align-top text-right font-bold text-gray-900 dark:text-white bg-green-50/50 dark:bg-green-900/5">{currencyFormatter.format(newTotal)}</td>
                                    <td className="px-4 py-3 align-top text-right text-xs text-blue-600 bg-blue-50/30">{item.laborRate ? `${item.laborRate.toFixed(2)}%` : '-'}</td>
                                    <td className="px-4 py-3 align-top text-right text-xs text-blue-600 bg-blue-50/30">{currencyFormatter.format(laborCost)}</td>
                                  </tr>
                                );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )})}
                </div>
              </div>
            );
        })}
      </div>
    </div>
  );
};

export default ComputoDetailView;
