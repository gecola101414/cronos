import React, { useRef, useState } from 'react';
import { ProjectDocument, Team, Worker } from '../types';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale/it';

const currencyFormatter = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const numberFormatter = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const decimalFormatter = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 4, maximumFractionDigits: 4 });

declare const jspdf: any;
declare const html2canvas: any;

interface MeasurementsViewProps {
  documents: ProjectDocument[];
  projectName?: string;
  teams: Team[];
  workers: Worker[];
}

const MeasurementsView: React.FC<MeasurementsViewProps> = ({ documents, projectName, teams, workers }) => {
  const detailsRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  
  // Signature state
  const [signatureDate, setSignatureDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [companyName, setCompanyName] = useState("Nome Impresa S.r.l.");
  const [directorName, setDirectorName] = useState("Arch. Mario Rossi");

  const allDates = documents
    .flatMap(doc => doc.workGroups)
    .flatMap(group => group.items)
    .flatMap(item => item.measurements || [])
    .map(m => parseISO(m.date));
  
  const latestDate = allDates.length > 0
    ? new Date(Math.max(...allDates.map(d => d.getTime())))
    : null;
    
  const grandTotal = documents.reduce((acc, doc) => acc + doc.totalValue, 0);
  
  // Create a list of groups that also knows which parent document it belongs to, for ratio calculations
  const allGroupsWithContext = documents.flatMap(doc => 
    doc.workGroups
      .filter(group => group.items.some(item => item.measurements && item.measurements.length > 0))
      .map(group => ({
        group,
        parentDoc: doc
      }))
  );
    
  const totalAdvancementValue = allGroupsWithContext.reduce((acc, { group }) => {
    const measuredValue = group.items.reduce((itemAcc, item) => {
        const itemMeasuredValue = (item.measurements || []).reduce((mAcc, m) => mAcc + (m.quantity * item.unitPrice), 0);
        return itemAcc + itemMeasuredValue;
    }, 0);
    return acc + measuredValue;
  }, 0);

  const totalProgressPercent = grandTotal > 0 ? (totalAdvancementValue / grandTotal) * 100 : 0;
  const totalInternalIncidence = grandTotal > 0 ? totalAdvancementValue / grandTotal : 0;

  const handleSavePdf = async () => {
    const { jsPDF } = jspdf;
    
    if (!detailsRef.current || !summaryRef.current) return;

    setIsGeneratingPdf(true);
    
    // Helper to capture an element to a canvas
    const captureElementToCanvas = async (element: HTMLElement) => {
        // Create a clone to render cleaner without UI interference
        const clone = element.cloneNode(true) as HTMLElement;
        clone.style.background = 'white';
        clone.style.width = '1000px'; // Fixed width for consistent scaling
        clone.style.padding = '0';
        
        // Remove input borders/bg for printing
        const inputs = clone.querySelectorAll('input');
        inputs.forEach(input => {
            const val = input.value;
            const span = document.createElement('span');
            span.innerText = val;
            span.style.fontWeight = 'bold';
            input.parentNode?.replaceChild(span, input);
        });

        const wrapper = document.createElement('div');
        wrapper.style.position = 'absolute';
        wrapper.style.left = '-9999px';
        wrapper.style.top = '0';
        wrapper.appendChild(clone);
        document.body.appendChild(wrapper);

        const canvas = await html2canvas(clone, { 
            scale: 2, 
            useCORS: true,
            windowWidth: 1000
        });
        
        document.body.removeChild(wrapper);
        return canvas;
    };

    try {
        // 1. Setup PDF
        const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        const pageWidth = pdf.internal.pageSize.getWidth(); // 210mm
        const pageHeight = pdf.internal.pageSize.getHeight(); // 297mm
        
        // Margins
        const marginTop = 25;
        const marginBottom = 20;
        const marginLeft = 15;
        const marginRight = 15;
        
        const contentWidth = pageWidth - marginLeft - marginRight;
        const contentHeight = pageHeight - marginTop - marginBottom;

        // 2. Capture Contents
        const canvasDetails = await captureElementToCanvas(detailsRef.current);
        const canvasSummary = await captureElementToCanvas(summaryRef.current);

        // Combine logic: We want Details then Summary on a new page
        const canvases = [canvasDetails, canvasSummary];
        
        // Calculate total pages for "Page X of Y"
        const pages: string[] = []; // Store data URLs for pages

        for (const sourceCanvas of canvases) {
            const imgWidth = sourceCanvas.width;
            const imgHeight = sourceCanvas.height;
            const pageHeightInImgPixels = imgWidth * (contentHeight / contentWidth);
            
            let heightLeft = imgHeight;
            let currentY = 0;

            while (heightLeft > 0) {
                const sliceHeight = Math.min(heightLeft, pageHeightInImgPixels);
                const sliceCanvas = document.createElement('canvas');
                sliceCanvas.width = imgWidth;
                sliceCanvas.height = sliceHeight;
                
                const ctx = sliceCanvas.getContext('2d');
                if(ctx) {
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, imgWidth, sliceHeight);
                    ctx.drawImage(sourceCanvas, 0, currentY, imgWidth, sliceHeight, 0, 0, imgWidth, sliceHeight);
                }
                pages.push(sliceCanvas.toDataURL('image/png'));
                
                heightLeft -= sliceHeight;
                currentY += sliceHeight;
            }
        }

        const totalPages = pages.length;

        // 4. Render Pages to PDF
        for (let i = 0; i < totalPages; i++) {
            if (i > 0) pdf.addPage();
            
            const imgData = pages[i];
            // Get dimensions of the image to preserve aspect ratio if it's partial page
            const imgProps = pdf.getImageProperties(imgData);
            const pdfImgHeight = (imgProps.height * contentWidth) / imgProps.width;

            pdf.addImage(imgData, 'PNG', marginLeft, marginTop, contentWidth, pdfImgHeight);

            // -- HEADER --
            pdf.setFontSize(10);
            pdf.setTextColor(100, 100, 100);
            const headerText = `${projectName || "Progetto Senza Nome"} - Brogliaccio Contabilità`;
            pdf.text(headerText, marginLeft, 15);
            
            pdf.setDrawColor(200, 200, 200);
            pdf.line(marginLeft, 17, pageWidth - marginRight, 17);

            // -- FOOTER --
            const pageStr = `Pag. ${String(i + 1).padStart(2, '0')} di ${String(totalPages).padStart(2, '0')}`;
            pdf.setFontSize(9);
            pdf.setTextColor(150, 150, 150);
            pdf.text(pageStr, pageWidth - marginRight - 20, pageHeight - 10);
            
            const dateStr = format(new Date(), 'dd/MM/yyyy');
            pdf.text(`Stampato il: ${dateStr}`, marginLeft, pageHeight - 10);
        }

        const fileName = `${(projectName || "Brogliaccio").replace(/[^a-z0-9]/gi, '_')}_contabilita.pdf`;
        pdf.save(fileName);

    } catch (error) {
        console.error("Error generating PDF:", error);
        alert("Si è verificato un errore durante la generazione del PDF.");
    } finally {
        setIsGeneratingPdf(false);
    }
  };

  // Using calculated height to force scrolling within the component, keeping the header fixed relative to the view
  return (
    <div className="flex flex-col h-[calc(100vh-10rem)]">
       {/* Fixed Header */}
       <div className="flex-shrink-0 bg-gray-100 dark:bg-gray-900 px-4 md:px-6 py-4 border-b border-gray-200 dark:border-gray-700 no-print shadow-sm z-30">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                        {projectName || "Nuovo Progetto"} <span className="font-normal text-gray-500 text-lg">- Brogliaccio Contabilità</span>
                    </h1>
                    {latestDate && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Aggiornato al {format(latestDate, 'dd MMMM yyyy', { locale: it })}
                        </p>
                    )}
                </div>
                {latestDate && (
                    <button
                        onClick={handleSavePdf}
                        disabled={isGeneratingPdf}
                        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 flex items-center space-x-2 transition-colors disabled:bg-indigo-400 shadow-sm"
                    >
                        {isGeneratingPdf ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span>Elaborazione...</span>
                            </>
                        ) : (
                            <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clipRule="evenodd" />
                                </svg>
                                <span>Stampa PDF</span>
                            </>
                        )}
                    </button>
                )}
            </div>
       </div>
       
       {/* Scrollable Content */}
       <div className="flex-grow overflow-y-auto p-4 md:p-6 space-y-8">
         <div ref={detailsRef}>
            {documents.map((doc, docIndex) => {
                const docTotalMeasured = doc.workGroups.reduce((groupAcc, group) => {
                    return groupAcc + group.items.reduce((itemAcc, item) => {
                        const itemMeasuredValue = (item.measurements || []).reduce((mAcc, m) => mAcc + (m.quantity * item.unitPrice), 0);
                        return itemAcc + itemMeasuredValue;
                    }, 0);
                }, 0);

                if(docTotalMeasured === 0) {
                    return null;
                }

                return (
                <div key={docIndex} className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-xl shadow-md mb-8 break-inside-avoid">
                    <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4 border-b pb-2 border-gray-300 dark:border-gray-600">
                    Corpo d'Opera: <span className="text-indigo-600 dark:text-indigo-400">{doc.fileName}</span>
                    </h2>
                    
                    <div className="space-y-6">
                    {doc.workGroups.map((group, groupIndex) => {
                        const groupTotalMeasured = group.items.reduce((itemAcc, item) => {
                            const itemMeasuredValue = (item.measurements || []).reduce((mAcc, m) => mAcc + (m.quantity * item.unitPrice), 0);
                            return itemAcc + itemMeasuredValue;
                        }, 0);

                        if (groupTotalMeasured === 0) {
                            return null;
                        }

                        return (
                        <div key={groupIndex} className="break-inside-avoid">
                            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-3 bg-gray-200 dark:bg-gray-700 p-2 rounded-md flex justify-between items-center">
                            <div>
                                <span>{group.name}</span>
                                <span className="block text-sm font-normal text-gray-500 dark:text-gray-400 mt-1">
                                    Inizio Attività: {format(parseISO(group.officialStartDate || group.startDate), 'dd MMMM yyyy', { locale: it })}
                                </span>
                            </div>
                            <span className="font-normal text-base text-indigo-600 dark:text-indigo-400 self-center">
                                {currencyFormatter.format(groupTotalMeasured)}
                            </span>
                            </h3>
                            <div className="space-y-4">
                            {group.items.map((item, itemIndex) => {
                                if (!item.measurements || item.measurements.length === 0) {
                                return null;
                                }
                                
                                const itemTotalQuantity = item.measurements.reduce((acc, m) => acc + m.quantity, 0);
                                const itemTotalMeasured = itemTotalQuantity * item.unitPrice;

                                return (
                                <div key={itemIndex} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden break-inside-avoid">
                                    <table className="w-full text-sm table-fixed">
                                        <colgroup>
                                            <col className="w-[15%]" />
                                            <col className="w-[35%]" />
                                            <col className="w-[50%]" />
                                        </colgroup>
                                        <tbody>
                                            <tr className="bg-gray-100 dark:bg-gray-700/50">
                                                <td className="p-3 font-semibold text-gray-800 dark:text-gray-200 align-top">{item.articleCode}</td>
                                                <td className="p-3 text-gray-600 dark:text-gray-400 text-justify align-top">{item.description}</td>
                                                <td></td>
                                            </tr>
                                        </tbody>
                                    </table>
                                    <div className="overflow-auto relative">
                                    <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400 table-fixed">
                                        <thead className="text-xs text-gray-700 uppercase bg-gray-100 dark:bg-gray-700 dark:text-gray-400">
                                        <tr>
                                            <th scope="col" className="px-4 py-2 w-[12%]">Data</th>
                                            <th scope="col" className="px-4 py-2 w-[28%]">Nota</th>
                                            <th scope="col" className="px-4 py-2 w-[20%] text-center">Squadra/Op.</th>
                                            <th scope="col" className="px-4 py-2 w-[10%] text-right">Q.tà</th>
                                            <th scope="col" className="px-4 py-2 w-[15%] text-right">P. Unit.</th>
                                            <th scope="col" className="px-4 py-2 w-[15%] text-right">Importo</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {item.measurements.map((m, mIndex) => {
                                            const team = teams.find(t => t.id === m.teamId);
                                            const assignedWorkers = workers.filter(w => m.workerIds?.includes(w.id));

                                            return (
                                            <tr key={mIndex} className="border-b dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600/30">
                                            <td className="px-4 py-2 align-top">{format(parseISO(m.date), 'dd/MM/yyyy')}</td>
                                            <td className="px-4 py-2 text-justify break-words align-top text-xs italic">{m.note}</td>
                                            <td className="px-4 py-2 align-top">
                                                {team ? (
                                                    <div className="flex flex-col items-center">
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mb-1" style={{ backgroundColor: `${team.color}20`, color: team.color }}>
                                                            {team.name}
                                                        </span>
                                                        {assignedWorkers.length > 0 && (
                                                            <div className="flex flex-wrap justify-center gap-1">
                                                                {assignedWorkers.map(w => (
                                                                    <span key={w.id} className="text-[10px] bg-gray-100 dark:bg-gray-700 px-1 rounded text-gray-600 dark:text-gray-300">
                                                                        {w.name.split(' ')[0]}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="text-center text-xs text-gray-400">-</div>
                                                )}
                                            </td>
                                            <td className="px-4 py-2 text-right align-top font-medium">{numberFormatter.format(m.quantity)} <span className="text-xs text-gray-500">{item.unit}</span></td>
                                            <td className="px-4 py-2 text-right align-top">{currencyFormatter.format(item.unitPrice)}</td>
                                            <td className="px-4 py-2 text-right font-semibold text-gray-800 dark:text-gray-200 align-top">{currencyFormatter.format(m.quantity * item.unitPrice)}</td>
                                            </tr>
                                        )})}
                                        </tbody>
                                        <tfoot>
                                            <tr className="font-semibold text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-700">
                                                <td colSpan={3} className="px-4 py-2 text-right">Sommano {item.unit}</td>
                                                <td className="px-4 py-2 text-right border-t-2 border-gray-600 dark:border-gray-400">
                                                    {numberFormatter.format(itemTotalQuantity)}
                                                </td>
                                                <td className="px-4 py-2 text-right">
                                                    {currencyFormatter.format(item.unitPrice)}
                                                </td>
                                                <td className="px-4 py-2 text-right border-t-2 border-gray-600 dark:border-gray-400">
                                                    {currencyFormatter.format(itemTotalMeasured)}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                    </div>
                                </div>
                                )
                            })}
                            </div>
                        </div>
                        )
                    })}
                    <div className="mt-6 pt-4 border-t-2 border-indigo-500">
                        <div className="flex justify-end items-center">
                        <span className="text-lg font-bold text-gray-900 dark:text-white">Totale Misurato {doc.fileName}</span>
                        <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400 ml-4">{currencyFormatter.format(docTotalMeasured)}</span>
                        </div>
                    </div>
                    </div>
                </div>
                )
            })}
         </div>
        
        {allGroupsWithContext.length > 0 && (
            <div ref={summaryRef} className="mt-8 bg-white dark:bg-gray-800 p-8 rounded-xl shadow-xl break-before-page">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-6 border-b pb-4 border-gray-300 dark:border-gray-600">
                    Riepilogo Generale SAL
                </h2>

                <table className="w-full text-sm text-left text-gray-600 dark:text-gray-300 mb-8">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-100 dark:bg-gray-700 dark:text-gray-400 border-b border-gray-300 dark:border-gray-600">
                        <tr>
                            <th scope="col" className="px-4 py-3 w-[40%]">Elemento (Avanzamento %)</th>
                            <th scope="col" className="px-4 py-3 w-[20%] text-right">Valore Misurato</th>
                            <th scope="col" className="px-4 py-3 w-[20%] text-right">Incidenza intr.</th>
                            <th scope="col" className="px-4 py-3 w-[20%] text-right">Incidenza Totale</th>
                        </tr>
                    </thead>
                    <tbody>
                        {/* 1. Project Summary Row */}
                        <tr className="bg-indigo-50 dark:bg-indigo-900/20 font-bold text-indigo-900 dark:text-indigo-100 border-b-2 border-indigo-200 dark:border-indigo-800">
                            <td className="px-4 py-4">
                                {projectName || "Intero Progetto"} ({numberFormatter.format(totalProgressPercent)} %)
                            </td>
                            <td className="px-4 py-4 text-right">{currencyFormatter.format(totalAdvancementValue)}</td>
                            <td className="px-4 py-4 text-right">{decimalFormatter.format(totalInternalIncidence)}</td>
                            <td className="px-4 py-4 text-right">{decimalFormatter.format(totalInternalIncidence)}</td>
                        </tr>

                        {/* 2. Documents and WBS */}
                        {documents.map((doc) => {
                            const docMeasuredValue = doc.workGroups.reduce((acc, group) => {
                                return acc + group.items.reduce((iAcc, item) => {
                                    return iAcc + (item.measurements || []).reduce((mAcc, m) => mAcc + (m.quantity * item.unitPrice), 0);
                                }, 0);
                            }, 0);
                            
                            if (docMeasuredValue === 0 && doc.totalValue === 0) return null;

                            const docProgress = doc.totalValue > 0 ? (docMeasuredValue / doc.totalValue) * 100 : 0;
                            const docInternalIncidence = doc.totalValue > 0 ? docMeasuredValue / doc.totalValue : 0;
                            const docTotalIncidence = grandTotal > 0 ? docMeasuredValue / grandTotal : 0;

                            return (
                                <React.Fragment key={doc.fileName}>
                                    {/* Document Row */}
                                    <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 font-semibold">
                                        <td className="px-4 py-3 pl-8 text-gray-800 dark:text-white">
                                            {doc.fileName} ({numberFormatter.format(docProgress)} %)
                                        </td>
                                        <td className="px-4 py-3 text-right">{currencyFormatter.format(docMeasuredValue)}</td>
                                        <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{decimalFormatter.format(docInternalIncidence)}</td>
                                        <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{decimalFormatter.format(docTotalIncidence)}</td>
                                    </tr>

                                    {/* WBS Rows */}
                                    {doc.workGroups.map((group) => {
                                        const groupMeasuredValue = group.items.reduce((itemAcc, item) => {
                                            const itemMeasuredValue = (item.measurements || []).reduce((mAcc, m) => mAcc + (m.quantity * item.unitPrice), 0);
                                            return itemAcc + itemMeasuredValue;
                                        }, 0);
                                        
                                        if (groupMeasuredValue === 0) return null;

                                        const groupProgress = group.value > 0 ? (groupMeasuredValue / group.value) * 100 : 0;
                                        const groupInternalIncidence = group.value > 0 ? groupMeasuredValue / group.value : 0;
                                        const groupTotalIncidence = grandTotal > 0 ? groupMeasuredValue / grandTotal : 0;

                                        return (
                                            <tr key={group.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                                <td className="px-4 py-2 pl-12 text-gray-600 dark:text-gray-300 italic">
                                                    {group.name} ({numberFormatter.format(groupProgress)} %)
                                                </td>
                                                <td className="px-4 py-2 text-right">{currencyFormatter.format(groupMeasuredValue)}</td>
                                                <td className="px-4 py-2 text-right text-gray-500 font-mono text-xs">{decimalFormatter.format(groupInternalIncidence)}</td>
                                                <td className="px-4 py-2 text-right text-gray-500 font-mono text-xs">{decimalFormatter.format(groupTotalIncidence)}</td>
                                            </tr>
                                        );
                                    })}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                    <tfoot className="font-bold text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-700 border-t-2 border-gray-300 dark:border-gray-600">
                        <tr>
                            <td className="px-4 py-3 text-right">TOTALE GENERALE</td>
                            <td className="px-4 py-3 text-right">{currencyFormatter.format(totalAdvancementValue)}</td>
                            <td className="px-4 py-3"></td>
                            <td className="px-4 py-3"></td>
                        </tr>
                    </tfoot>
                </table>

                {/* Signatures Section */}
                <div className="mt-16 pt-8 border-t-2 border-gray-200 dark:border-gray-700 page-break-inside-avoid">
                    <div className="flex justify-between items-start">
                        <div className="w-1/3 text-center">
                            <p className="mb-2 font-semibold text-gray-600 dark:text-gray-300">Data</p>
                            <input 
                                type="date" 
                                value={signatureDate}
                                onChange={e => setSignatureDate(e.target.value)}
                                className="border-b border-gray-400 bg-transparent text-center w-full pb-1 focus:outline-none focus:border-indigo-500 font-medium text-gray-800 dark:text-white"
                            />
                        </div>
                         <div className="w-1/3 text-center px-4">
                            <p className="mb-2 font-semibold text-gray-600 dark:text-gray-300">Firma Impresa</p>
                            <input 
                                type="text" 
                                value={companyName}
                                onChange={e => setCompanyName(e.target.value)}
                                className="border-b border-gray-400 bg-transparent text-center w-full pb-1 focus:outline-none focus:border-indigo-500 font-medium text-gray-800 dark:text-white mb-8"
                            />
                             <div className="border-b border-gray-300 w-3/4 mx-auto"></div>
                        </div>
                         <div className="w-1/3 text-center">
                            <p className="mb-2 font-semibold text-gray-600 dark:text-gray-300">Direzione Lavori</p>
                            <input 
                                type="text" 
                                value={directorName}
                                onChange={e => setDirectorName(e.target.value)}
                                className="border-b border-gray-400 bg-transparent text-center w-full pb-1 focus:outline-none focus:border-indigo-500 font-medium text-gray-800 dark:text-white mb-8"
                            />
                            <div className="border-b border-gray-300 w-3/4 mx-auto"></div>
                        </div>
                    </div>
                </div>
            </div>
        )}
       </div>
    </div>
  );
};

export default MeasurementsView;