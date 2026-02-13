
import React, { useState, useMemo, useRef, useCallback } from 'react';
import { ProjectDocument } from '../types';

interface ProjectSummaryProps {
  documents: ProjectDocument[];
  isViewOnly?: boolean;
  salMarkers: number[];
  onSalMarkersChange: (updater: React.SetStateAction<number[]>) => void;
  onToggleDocumentVisibility: (fileName: string) => void;
  onToggleDocumentFreeze: (fileName: string) => void;
  onToggleDocumentLock: (fileName: string) => void;
  onRenameDocument?: (fileName: string, newName: string) => void;
  onDeleteDocument?: (fileName: string) => void;
  hideList?: boolean; // Nuova prop per il Patto d'Acciaio
}

const currencyFormatter = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const numberFormatter = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ProjectSummary: React.FC<ProjectSummaryProps> = ({ 
    documents, 
    isViewOnly, 
    salMarkers, 
    onSalMarkersChange, 
    onToggleDocumentVisibility,
    onToggleDocumentFreeze,
    onToggleDocumentLock,
    onRenameDocument,
    onDeleteDocument,
    hideList = false
}) => {
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [draggingMarkerIndex, setDraggingMarkerIndex] = useState<number | null>(null);
  const [editingDocName, setEditingDocName] = useState<string | null>(null);
  const [tempName, setTempName] = useState<string>('');

  const { grandTotal, earnedValue, overallProgress } = useMemo(() => {
    const total = documents.reduce((acc, doc) => {
        const docTotal = doc.workGroups.reduce((gAcc, group) => {
            const groupTotal = group.items.reduce((iAcc, item) => {
                const varTotal = (item.variations || []).reduce((vAcc, v) => v.type === 'increase' ? vAcc + v.quantity : vAcc - v.quantity, 0);
                return iAcc + ((item.quantity + varTotal) * item.unitPrice);
            }, 0);
            return gAcc + groupTotal;
        }, 0);
        return acc + docTotal;
    }, 0);

    const ev = documents
        .filter(doc => !(doc.isFrozen ?? false))
        .reduce((acc, doc) => 
            acc + doc.workGroups.reduce((groupAcc, group) => {
                 const groupMeasuredValue = group.items.reduce((iAcc, item) => {
                     return iAcc + (item.measurements || []).reduce((mAcc, m) => mAcc + (m.quantity * item.unitPrice), 0);
                 }, 0);
                 return groupAcc + groupMeasuredValue;
            }, 0), 0);

    const progress = total > 0 ? (ev / total) * 100 : 0;
    return { grandTotal: total, earnedValue: ev, overallProgress: progress };
  }, [documents]);
  
  const handleBarDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isViewOnly || !progressBarRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = (x / rect.width) * 100;
    onSalMarkersChange(prev => [...prev, Math.max(0, Math.min(100, percentage))].sort((a,b) => a-b));
  };

  const handleMarkerMouseDown = (e: React.MouseEvent, index: number) => {
    if (isViewOnly) return;
    e.stopPropagation();
    setDraggingMarkerIndex(index);
  };
  
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (draggingMarkerIndex === null || !progressBarRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const newPercentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
    onSalMarkersChange(prev => {
      const newMarkers = [...prev];
      newMarkers[draggingMarkerIndex] = newPercentage;
      return newMarkers;
    });
  }, [draggingMarkerIndex, onSalMarkersChange]);
  
  const handleMouseUp = useCallback(() => {
    if (draggingMarkerIndex !== null) {
      onSalMarkersChange(prev => [...prev].sort((a, b) => a - b));
    }
    setDraggingMarkerIndex(null);
  }, [draggingMarkerIndex, onSalMarkersChange]);

  React.useEffect(() => {
    if (draggingMarkerIndex !== null) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingMarkerIndex, handleMouseMove, handleMouseUp]);

  const docHasVariations = (doc: ProjectDocument) => {
      return doc.workGroups.some(wg => wg.items.some(i => i.variations && i.variations.length > 0));
  };

  return (
    <div className={`bg-white dark:bg-gray-800 shadow-lg rounded-xl ${hideList ? 'p-4' : 'p-6'}`}>
        {!hideList && (
          <>
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">Corpi d'Opera</h2>
            <div className="space-y-3 mb-4">
              {documents.map((doc, index) => {
                const hasVar = docHasVariations(doc);
                const docEffectiveValue = doc.workGroups.reduce((gAcc, group) => {
                    const groupTotal = group.items.reduce((iAcc, item) => {
                        const varTotal = (item.variations || []).reduce((vAcc, v) => v.type === 'increase' ? vAcc + v.quantity : vAcc - v.quantity, 0);
                        return iAcc + ((item.quantity + varTotal) * item.unitPrice);
                    }, 0);
                    return gAcc + groupTotal;
                }, 0);

                return (
                <div key={index} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg group">
                  <div className="flex items-center space-x-3 overflow-hidden flex-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500 dark:text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    
                    {editingDocName === doc.fileName ? (
                        <div className="flex items-center space-x-2">
                            <input type="text" value={tempName} onChange={(e) => setTempName(e.target.value)} className="text-sm p-1 border border-indigo-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-gray-900" autoFocus onKeyDown={(e) => { if(e.key === 'Enter') { if (onRenameDocument && tempName.trim() !== "" && tempName !== doc.fileName) onRenameDocument(doc.fileName, tempName); setEditingDocName(null); } if(e.key === 'Escape') setEditingDocName(null); }} />
                        </div>
                    ) : (
                        <>
                            <span className="font-medium text-gray-800 dark:text-gray-200 truncate flex items-center gap-2">
                                {doc.fileName}
                                {hasVar && (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                )}
                            </span>
                            {!isViewOnly && (
                                <div className="flex items-center space-x-1">
                                    <button onClick={() => { setEditingDocName(doc.fileName); setTempName(doc.fileName); }} className="text-gray-400 hover:text-indigo-600 p-1 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                                    {onDeleteDocument && <button onClick={(e) => { e.stopPropagation(); onDeleteDocument(doc.fileName); }} className="text-gray-400 hover:text-red-600 p-1 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>}
                                </div>
                            )}
                        </>
                    )}
                  </div>
                  <div className="flex items-center space-x-2 sm:space-x-4 flex-shrink-0 ml-4">
                     <span className="hidden sm:inline font-semibold text-gray-700 dark:text-gray-300">{currencyFormatter.format(docEffectiveValue)}</span>
                     {!isViewOnly && (
                        <>
                            <button onClick={() => onToggleDocumentVisibility(doc.fileName)} className={`transition-colors ${doc.isVisible ?? true ? 'text-yellow-500 hover:text-yellow-600' : 'text-gray-400'}`} title="Visibilità"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.121-3.536a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 11.464A1 1 0 106.465 10.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zM10 16a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1z" /></svg></button>
                            <button onClick={() => onToggleDocumentFreeze(doc.fileName)} className={`transition-colors ${doc.isFrozen ? 'text-blue-500' : 'text-gray-400'}`} title="Congela"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.36 14.64a1 1 0 010-1.41L9 9.58V4a1 1 0 112 0v5.58l3.64-3.63a1 1 0 111.41 1.41L11.42 11l3.63 3.64a1 1 0 11-1.41 1.41L10 12.42l-3.64 3.63a1 1 0 01-1.41-1.41zM3.5 10a1 1 0 011-1h11a1 1 0 110 2H4.5a1 1 0 01-1-1z" clipRule="evenodd" /></svg></button>
                            <button onClick={() => onToggleDocumentLock(doc.fileName)} className={`transition-colors ${doc.isLocked ? 'text-orange-500' : 'text-gray-400'}`} title="Blocca">{doc.isLocked ? <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg> : <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2V7a5 5 0 00-5-5zm0 2a3 3 0 013 3v2H7V7a3 3 0 013-3z" /></svg>}</button>
                        </>
                     )}
                  </div>
                </div>
              )})}
            </div>
          </>
        )}
        {documents.length > 0 && (
          <div className={`${!hideList ? 'pt-4 border-t border-gray-200 dark:border-gray-700' : ''}`}>
            <div className="flex justify-between items-center mb-1"><span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Avanzamento Progetto (Obiettivi SAL)</span><span className="text-sm font-black text-indigo-600 dark:text-indigo-400">{numberFormatter.format(overallProgress)}%</span></div>
            <div ref={progressBarRef} onDoubleClick={handleBarDoubleClick} className="relative w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 cursor-copy overflow-visible">
              <div className="bg-indigo-600 h-full rounded-full transition-all duration-500 shadow-sm" style={{ width: `${overallProgress}%` }}></div>
              {salMarkers.map((marker, idx) => (
                <div key={idx} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 group" style={{ left: `${marker}%` }}>
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2 px-2 py-1 bg-indigo-600 text-white text-[10px] font-bold rounded shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none">
                    <span>{idx + 1}° SAL</span>
                    <div className="text-indigo-200 font-medium">{currencyFormatter.format(grandTotal * (marker / 100))}</div>
                  </div>
                  <div onMouseDown={e => handleMarkerMouseDown(e, idx)} className={`w-4 h-4 ${isViewOnly ? '' : 'cursor-ew-resize'} bg-red-500 border-2 border-white rounded-full shadow-md hover:scale-125 transition-transform`} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
  );
};

export default ProjectSummary;
