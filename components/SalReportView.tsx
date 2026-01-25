
import React from 'react';
import { ProjectDocument, WorkItem, WorkGroup } from '../types';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale/it';

const numberFormatter = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const percentFormatter = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3 }); // 3 decimali per precisione percentuale
const currencyFormatter = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

// --- RENDERER PER LAVORI A MISURA (CLASSICO - DETTAGLIO ARTICOLI) ---
const createMeasureRows = (group: WorkGroup, startProgressive: number) => {
  let rows: React.JSX.Element[] = [];
  let currentProgressive = startProgressive;
  
  // Verifica se ci sono misure nel gruppo
  const hasMeasurements = group.items.some(i => i.measurements && i.measurements.length > 0);
  if (!hasMeasurements) return { rows: [], count: 0 };

  // Header del Gruppo (WBS)
  rows.push(
      <tr key={`grp-header-${group.id}`} className="bg-gray-100 dark:bg-gray-700 border-b border-gray-300 dark:border-gray-600 print-row">
          <td colSpan={8} className="p-2 font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wider pl-4">
              {group.name}
          </td>
      </tr>
  );

  group.items.forEach(item => {
      if (!item.measurements || item.measurements.length === 0) return;

      // Header Articolo
      rows.push(
          <tr key={`item-header-${item.articleCode}`} className="bg-gray-50 dark:bg-gray-800/30 border-b dark:border-gray-700 print-row">
              <td colSpan={8} className="p-1 pl-6 font-semibold text-indigo-900 dark:text-indigo-300">
                  {item.articleCode} - {item.description} <span className="font-normal text-gray-600">({item.unit})</span>
              </td>
          </tr>
      );

      let itemTotalQty = 0;

      // Righe Misure
      item.measurements.forEach((m, idx) => {
          itemTotalQty += m.quantity;
          rows.push(
              <tr key={`${item.articleCode}-${idx}`} className="border-b border-gray-200 dark:border-gray-600 print-row hover:bg-gray-50">
                  <td className="p-1 border-r border-gray-300 dark:border-gray-600 text-center text-gray-700">{currentProgressive}</td>
                  <td className="p-1 border-r border-gray-300 dark:border-gray-600 text-center">{format(parseISO(m.date), 'dd/MM/yy')}</td>
                  <td className="p-1 border-r border-gray-300 dark:border-gray-600 pl-8 italic text-gray-800 dark:text-gray-300">{m.note || '-'}</td>
                  <td className="p-1 border-r border-gray-300 dark:border-gray-600 text-center">{m.factor || ''}</td>
                  <td className="p-1 border-r border-gray-300 dark:border-gray-600 text-center">{m.length || ''}</td>
                  <td className="p-1 border-r border-gray-300 dark:border-gray-600 text-center">{m.width || ''}</td>
                  <td className="p-1 border-r border-gray-300 dark:border-gray-600 text-center">{m.height || ''}</td>
                  <td className="p-1 text-right font-medium pr-2 text-gray-900">{numberFormatter.format(m.quantity)}</td>
              </tr>
          );
          currentProgressive++;
      });

      // Totale Articolo
      rows.push(
          <tr key={`item-total-${item.articleCode}`} className="bg-gray-50/80 dark:bg-gray-800/50 border-b border-gray-400 dark:border-gray-500 print-row">
              <td colSpan={7} className="p-1 text-right pr-2 font-semibold text-gray-600">Totale {item.articleCode}</td>
              <td className="p-1 text-right font-bold pr-2 text-black">{numberFormatter.format(itemTotalQty)}</td>
          </tr>
      );
  });

  return { rows, count: currentProgressive - startProgressive };
};

// --- RENDERER PER LAVORI A CORPO (PERCENTUALE SU WBS) ---
const createBodyGroupRows = (group: WorkGroup, startProgressive: number) => {
    // 1. Raccogli tutte le misure di tutti gli articoli di questo gruppo
    const allMeasurements = group.items.flatMap(item => 
        (item.measurements || []).map(m => ({
            date: m.date,
            monetaryValue: m.quantity * item.unitPrice, // Valore economico della singola misura
            note: m.note
        }))
    );

    if (allMeasurements.length === 0) return { rows: [], count: 0 };

    // 2. Raggruppa per data
    const byDate: Record<string, number> = {};
    allMeasurements.forEach(m => {
        if (!byDate[m.date]) byDate[m.date] = 0;
        byDate[m.date] += m.monetaryValue;
    });

    // 3. Ordina le date
    const sortedDates = Object.keys(byDate).sort();
    
    let rows: React.JSX.Element[] = [];
    let currentProgressive = startProgressive;
    let cumulativePercent = 0;

    // Header WBS A Corpo
    rows.push(
        <tr key={`body-header-${group.id}`} className="bg-purple-50 dark:bg-purple-900/40 border-b border-purple-300 dark:border-purple-700 print-row">
            <td colSpan={8} className="p-2 font-bold text-purple-900 dark:text-purple-100 uppercase tracking-wider pl-4">
                {group.name} <span className="font-normal normal-case ml-2">- (Valore Totale WBS: {currencyFormatter.format(group.value)})</span>
            </td>
        </tr>
    );

    sortedDates.forEach(date => {
        const dailyValue = byDate[date];
        // CALCOLO FONDAMENTALE: (Valore Giornaliero / Valore Totale WBS) * 100
        const dailyPercent = group.value > 0 ? (dailyValue / group.value) * 100 : 0;
        cumulativePercent += dailyPercent;

        rows.push(
            <tr key={`body-row-${group.id}-${date}`} className="border-b border-gray-200 dark:border-gray-600 print-row hover:bg-purple-50 dark:hover:bg-purple-900/20">
                <td className="p-2 border-r border-gray-300 dark:border-gray-600 text-center font-bold text-purple-900 dark:text-purple-400">{currentProgressive}</td>
                <td className="p-2 border-r border-gray-300 dark:border-gray-600 text-center font-medium">{format(parseISO(date), 'dd/MM/yy')}</td>
                
                {/* DESCRIZIONE: Nome WBS */}
                <td className="p-2 border-r border-gray-300 dark:border-gray-600 font-bold text-gray-900 dark:text-gray-200">
                    {group.name}
                </td>
                
                {/* Colonne vuote per dimensioni */}
                <td className="p-2 border-r border-gray-300 dark:border-gray-600 bg-gray-50/50"></td>
                <td className="p-2 border-r border-gray-300 dark:border-gray-600 bg-gray-50/50"></td>
                <td className="p-2 border-r border-gray-300 dark:border-gray-600 bg-gray-50/50"></td>
                
                {/* Unità di Misura Forzata a % */}
                <td className="p-2 border-r border-gray-300 dark:border-gray-600 text-center font-bold text-purple-800">%</td>
                
                {/* Quantità = Percentuale calcolata */}
                <td className="p-2 text-right font-bold pr-2 text-purple-900 dark:text-purple-300">
                    {percentFormatter.format(dailyPercent / 100)} {/* Formatter expects 0-1 for % */}
                </td>
            </tr>
        );
        currentProgressive++;
    });

    // Totale WBS A Corpo
    rows.push(
        <tr key={`body-total-${group.id}`} className="bg-purple-100 dark:bg-purple-900/20 border-t-2 border-purple-300 dark:border-purple-600 print-row">
            <td colSpan={7} className="p-2 text-right pr-4 font-bold text-purple-900 dark:text-purple-300">
                Totale Avanzamento % Cumulato
            </td>
            <td className="p-2 text-right font-black pr-2 text-purple-900 dark:text-white bg-purple-200 dark:bg-purple-800">
                {percentFormatter.format(cumulativePercent / 100)}
            </td>
        </tr>
    );

    return { rows, count: currentProgressive - startProgressive };
};

const SalReportView: React.FC<{ documents: ProjectDocument[] }> = ({ documents }) => {
  let progressiveCounter = 1;

  // Array per accumulare le righe delle due sezioni
  const measureSectionRows: React.JSX.Element[] = [];
  const bodySectionRows: React.JSX.Element[] = [];

  // Iteriamo i documenti e i gruppi per popolare le sezioni
  documents.forEach(doc => {
      doc.workGroups.forEach(group => {
          if (group.accountingType === 'body') {
              // LOGICA A CORPO
              const result = createBodyGroupRows(group, progressiveCounter);
              if (result.rows.length > 0) {
                  bodySectionRows.push(...result.rows);
                  progressiveCounter += result.count;
              }
          } else {
              // LOGICA A MISURA
              const result = createMeasureRows(group, progressiveCounter);
              if (result.rows.length > 0) {
                  measureSectionRows.push(...result.rows);
                  progressiveCounter += result.count;
              }
          }
      });
  });

  return (
    <div className="p-4 md:p-8 bg-white dark:bg-gray-900 min-h-screen printable-area" style={{ fontFamily: "'Times New Roman', Times, serif" }}>
      <div className="text-center mb-8 hidden print-block">
        <h1 className="text-2xl font-black uppercase tracking-widest text-gray-900">Libretto delle Misure</h1>
        <p className="text-base text-gray-600">Dettaglio analitico delle lavorazioni</p>
      </div>
      
      <table className="w-full text-[12px] border-collapse border border-black dark:border-gray-600 print-table table-fixed shadow-sm">
        <thead>
          <tr className="bg-gray-200 text-black dark:bg-gray-950 dark:text-white">
            <th className="border-r border-black p-2 w-[5%] text-center font-bold">N.</th>
            <th className="border-r border-black p-2 w-[10%] text-center font-bold">Data</th>
            <th className="border-r border-black p-2 w-[40%] text-left pl-4 font-bold">Descrizione Lavori</th>
            <th className="border-r border-black p-2 w-[5%] text-center font-bold">Fatt.</th>
            <th className="border-r border-black p-2 w-[5%] text-center font-bold">Lung.</th>
            <th className="border-r border-black p-2 w-[5%] text-center font-bold">Larg.</th>
            <th className="border-r border-black p-2 w-[5%] text-center font-bold">Alt/Peso</th>
            <th className="p-2 w-[12%] text-right pr-4 font-bold">Quantità</th>
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-gray-800 text-black dark:text-gray-200">
          
          {/* SEZIONE 1: LAVORI A MISURA */}
          {measureSectionRows.length > 0 && (
              <>
                <tr className="bg-gray-100 dark:bg-indigo-900/60 print-row">
                    <td colSpan={8} className="text-center py-3 border-b border-black dark:border-indigo-700 font-black text-sm tracking-[0.2em] text-black dark:text-indigo-100 uppercase">
                        ★ Lavori a Misura ★
                    </td>
                </tr>
                {measureSectionRows}
              </>
          )}

          {/* Spacer se ci sono entrambe le categorie */}
          {measureSectionRows.length > 0 && bodySectionRows.length > 0 && (
              <tr><td colSpan={8} className="h-8 bg-white dark:bg-gray-900 border-l border-r border-black"></td></tr>
          )}

          {/* SEZIONE 2: LAVORI A CORPO */}
          {bodySectionRows.length > 0 && (
              <>
                <tr className="bg-gray-100 dark:bg-purple-900/60 print-row">
                    <td colSpan={8} className="text-center py-3 border-b border-black dark:border-purple-700 font-black text-sm tracking-[0.2em] text-black dark:text-purple-100 uppercase">
                        ★ Lavori a Corpo (Avanzamento %) ★
                    </td>
                </tr>
                {bodySectionRows}
              </>
          )}

          {measureSectionRows.length === 0 && bodySectionRows.length === 0 && (
              <tr>
                  <td colSpan={8} className="text-center p-12 text-gray-500 italic text-base">
                      Nessuna misurazione registrata nel periodo.
                  </td>
              </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default SalReportView;
