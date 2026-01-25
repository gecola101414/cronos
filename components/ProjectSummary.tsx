
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
}

const currencyFormatter = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

const ProjectSummary: React.FC<ProjectSummaryProps> = ({ 
    documents, 
    isViewOnly, 
    salMarkers, 
    onSalMarkersChange, 
    onToggleDocumentVisibility,
    onToggleDocumentFreeze,
    onToggleDocumentLock,
    onRenameDocument,
    onDeleteDocument
}) => {
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [draggingMarkerIndex, setDraggingMarkerIndex] = useState<number | null>(null);
  const [editingDocName, setEditingDocName] = useState<string | null>(null);
  const [tempName, setTempName] = useState<string>('');

  const { grandTotal, earnedValue, overallProgress } = useMemo(() => {
    // Calculate Grand Total including Variations
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
                 // Group Value should now reflect updated quantity for progress calculation ratio if we used item progress,
                 // but here we calculate EV from measurements directly.
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

  const startEditing = (fileName: string) => {
      setEditingDocName(fileName);
      setTempName(fileName);
  }

  const saveEditing = (oldName: string) => {
      if (onRenameDocument && tempName.trim() !== "" && tempName !== oldName) {
          onRenameDocument(oldName, tempName);
      }
      setEditingDocName(null);
  }

  const cancelEditing = () => {
      setEditingDocName(null);
      setTempName('');
  }
  
  return (
    <>
      <div className="bg-white dark:bg-gray-800 shadow-lg rounded-xl p-6">
        <div className="flex justify-between items-start sm:items-center flex-col sm:flex-row gap-4 mb-4">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Corpi d'Opera</h2>
        </div>
        
        <div className="space-y-3 mb-4">
          {documents.map((doc, index) => {
            // Calculate Doc Value including Variations for display
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
                        <input 
                            type="text" 
                            value={tempName} 
                            onChange={(e) => setTempName(e.target.value)}
                            className="text-sm p-1 border border-indigo-300 rounded focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-gray-900"
                            autoFocus
                            onKeyDown={(e) => {
                                if(e.key === 'Enter') saveEditing(doc.fileName);
                                if(e.key === 'Escape') cancelEditing();
                            }}
                        />
                        <button onClick={() => saveEditing(doc.fileName)} className="text-green-600 hover:text-green-800">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                        </button>
                        <button onClick={cancelEditing} className="text-red-600 hover:text-red-800">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        </button>
                    </div>
                ) : (
                    <>
                        <span className="font-medium text-gray-800 dark:text-gray-200 truncate" title={doc.fileName}>{doc.fileName}</span>
                        {!isViewOnly && (
                            <div className="flex items-center space-x-1 opacity-100">
                                {onRenameDocument && (
                                    <button 
                                        onClick={() => startEditing(doc.fileName)}
                                        className="text-gray-400 hover:text-indigo-600 p-1 transition-colors"
                                        title="Modifica nome"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                    </button>
                                )}
                                {onDeleteDocument && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDeleteDocument(doc.fileName);
                                        }}
                                        className="text-gray-400 hover:text-red-600 p-1 transition-colors z-10 relative"
                                        title="Elimina Corpo d'Opera"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    </button>
                                )}
                            </div>
                        )}
                    </>
                )}
              </div>
              <div className="flex items-center space-x-2 sm:space-x-4 flex-shrink-0 ml-4">
                 <span className="hidden sm:inline font-semibold text-gray-700 dark:text-gray-300">{currencyFormatter.format(docEffectiveValue)}</span>
                 {!isViewOnly && (
                    <>
                        <button
                            onClick={() => onToggleDocumentVisibility(doc.fileName)}
                            className={`transition-colors ${doc.isVisible ?? true ? 'text-yellow-500 hover:text-yellow-600 dark:text-yellow-400 dark:hover:text-yellow-300' : 'text-gray-400 hover:text-gray-500 dark:hover:text-gray-300'}`}
                            title={doc.isVisible ?? true ? "Nascondi dal cronoprogramma" : "Mostra nel cronoprogramma"}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                               <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.121-3.536a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 11.464A1 1 0 106.465 10.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zM10 16a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1z" />
                            </svg>
                        </button>
                         <button
                            onClick={() => onToggleDocumentFreeze(doc.fileName)}
                            className={`transition-colors ${doc.isFrozen ? 'text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300' : 'text-gray-400 hover:text-gray-500 dark:hover:text-gray-300'}`}
                            title={doc.isFrozen ? "Scongela (includi nel SAL)" : "Congela (escludi dal SAL)"}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.36 14.64a1 1 0 010-1.41L9 9.58V4a1 1 0 112 0v5.58l3.64-3.63a1 1 0 111.41 1.41L11.42 11l3.63 3.64a1 1 0 11-1.41 1.41L10 12.42l-3.64 3.63a1 1 0 01-1.41-1.41zM3.5 10a1 1 0 011-1h11a1 1 0 110 2H4.5a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
                        </button>
                         <button
                            onClick={() => onToggleDocumentLock(doc.fileName)}
                            className={`transition-colors ${doc.isLocked ? 'text-orange-500 hover:text-orange-600 dark:text-orange-400 dark:hover:text-orange-300' : 'text-gray-400 hover:text-gray-500 dark:hover:text-gray-300'}`}
                            title={doc.isLocked ? "Sblocca modifiche" : "Blocca modifiche (sola lettura)"}
                        >
                            {doc.isLocked ? (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2V7a5 5 0 00-5-5zm0 2a3 3 0 013 3v2H7V7a3 3 0 013-3z" /></svg>
                            )}
                        </button>
                    </>
                 )}
              </div>
            </div>
          )})}
        </div>

        {documents.length > 0 && (
          <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Barra di Avanzamento e SAL</span>
                  <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">{overallProgress.toFixed(2)}%</span>
                </div>
                <div 
                  ref={progressBarRef}
                  onDoubleClick={handleBarDoubleClick}
                  className="relative w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 cursor-copy"
                  title="Doppio click per aggiungere un marcatore SAL"
                >
                    <div className="bg-indigo-600 h-2.5 rounded-full" style={{ width: `${overallProgress}%` }}></div>
                    {salMarkers.map((marker, index) => (
                      <div 
                          key={index} 
                          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                          style={{ left: `${marker}%` }}
                      >
                          <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 text-center bg-blue-600 text-white text-xs rounded shadow-lg whitespace-nowrap select-none pointer-events-none">
                              <span className="font-bold">{index + 1}° SAL</span>
                              <div className="font-normal text-blue-200">{currencyFormatter.format(grandTotal * (marker / 100))}</div>
                          </div>
                          <div 
                              onMouseDown={e => handleMarkerMouseDown(e, index)}
                              className={`w-3 h-3 ${isViewOnly ? 'cursor-default' : 'cursor-ew-resize'} bg-red-500 border-2 border-white dark:border-gray-800 rounded-full shadow-md`}
                          />
                      </div>
                  ))}
                </div>
              </div>
          </div>
        )}
      </div>
    </>
  );
};

export default ProjectSummary;
