
import React, { useState, useMemo, useRef, useCallback, MouseEvent as ReactMouseEvent, useEffect } from 'react';
import { WorkGroup, Expense, ProjectDocument, Dependency } from '../types';
import { 
  eachDayOfInterval, 
  eachWeekOfInterval, 
  eachMonthOfInterval,
  format, 
  differenceInDays, 
  addDays, 
  parse,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isWeekend,
  isSameDay,
  isSameMonth,
  isSameYear,
  parseISO
} from 'date-fns';
import { it } from 'date-fns/locale/it';

interface GanttChartProps {
  workGroups: WorkGroup[];
  dependencies: Dependency[];
  expenses: Expense[];
  setWorkGroups: (updater: React.SetStateAction<WorkGroup[]>, updatedGroupId?: string) => void;
  onDependenciesChange: (updater: (prev: Dependency[]) => Dependency[]) => void;
  isViewOnly?: boolean;
  onBarDoubleClick: (group: WorkGroup) => void;
  isEconomicViewVisible: boolean;
  onToggleEconomicView: () => void;
  onUpdateExpenseSupplyDate?: (expenseId: string, newDate: string) => void;
  projectName?: string;
  documents: ProjectDocument[];
  salMarkers: number[];
  onSalMarkersChange: (updater: React.SetStateAction<number[]>) => void;
  onAddVariant?: () => void; 
}

type ZoomLevel = 'day' | 'week' | 'month';

const UNIT_CONFIG: Record<ZoomLevel, { width: number; getIntervals: (interval: {start: Date, end: Date}) => Date[], labelFormat: string, subLabelFormat?: string }> = {
  day: { 
    width: 40,
    getIntervals: eachDayOfInterval,
    labelFormat: 'd',
    subLabelFormat: 'EEE'
  },
  week: { 
    width: 70,
    getIntervals: (interval) => eachWeekOfInterval(interval, { weekStartsOn: 1 }),
    labelFormat: "'Sett' w", 
  },
  month: {
    width: 150,
    getIntervals: eachMonthOfInterval,
    labelFormat: 'MMMM'
  }
};

const currencyFormatter = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const numberFormatter = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const DAILY_RATE_PER_PERSON = 240;

const ITALIAN_HOLIDAYS = [
  '01-01', '06-01', '25-04', '01-05', '02-06', '15-08', '01-11', '08-12', '25-12', '26-12'
];

const isHoliday = (date: Date): boolean => {
  const dayMonth = format(date, 'dd-MM');
  return ITALIAN_HOLIDAYS.includes(dayMonth) || isWeekend(date);
};

const calculateEndDateWithHolidays = (startDate: Date, workingDays: number): Date => {
  let currentDate = new Date(startDate);
  let daysCounted = 0;
  if (workingDays <= 0) return startDate;
  while (daysCounted < workingDays) {
    if (!isHoliday(currentDate)) daysCounted++;
    if (daysCounted < workingDays) currentDate = addDays(currentDate, 1);
  }
  return currentDate;
};

const GanttChart: React.FC<GanttChartProps> = ({ 
    workGroups, dependencies, expenses, setWorkGroups, onDependenciesChange, 
    isViewOnly, onBarDoubleClick, isEconomicViewVisible, onToggleEconomicView, 
    onUpdateExpenseSupplyDate, projectName, documents, salMarkers, onSalMarkersChange,
    onAddVariant
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const scrollSyncRef = useRef<HTMLDivElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const horizontalHeaderRef = useRef<HTMLDivElement>(null);
  const hoverScrollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSyncingRef = useRef(false);
  const isMouseDownOnScrollRef = useRef(false);
  const scrollSpeedRef = useRef(4);
  
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ id: string; type: 'move' | 'resize-end'; initialX: number; initialStartDate: Date; initialDuration: number } | null>(null);
  const [draggingMarkerIndex, setDraggingMarkerIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState<ZoomLevel>('week');
  const [simX, setSimX] = useState<number | null>(null);
  const [isSimActive, setIsSimActive] = useState(false); 
  
  const ROW_HEIGHT = 56; 
  const WBS_TABLE_WIDTH = 340;
  const BOTTOM_SPACER = 500;

  const getGroupVariantInfo = useCallback((groupId: string) => {
      const doc = documents.find(d => d.workGroups.some(wg => wg.id === groupId));
      if (!doc) return null;
      const match = doc.fileName.match(/^VAR\s+(\d+)/i);
      if (match) return match[1];
      const docIndex = documents.indexOf(doc);
      return docIndex > 0 ? docIndex.toString() : null;
  }, [documents]);

  const enrichedWorkGroups = useMemo(() => {
      return workGroups.map(g => {
          const teamSize = g.teamSize || 1;
          const earnedValue = g.items.reduce((acc, item) => 
            acc + (item.measurements || []).reduce((mAcc, m) => mAcc + (m.quantity * item.unitPrice), 0)
          , 0);
          
          const residualValue = Math.max(0, g.value - earnedValue);
          const remainingWorkingDays = Math.ceil(residualValue / (DAILY_RATE_PER_PERSON * teamSize));
          
          let baselineStr = g.startDate;
          const allMeasures = g.items.flatMap(i => i.measurements || []);
          if (allMeasures.length > 0) {
              baselineStr = allMeasures.reduce((max, m) => m.date > max ? m.date : max, allMeasures[0].date);
          }
          
          const baselineDate = parseISO(baselineStr);
          const projectedEnd = calculateEndDateWithHolidays(baselineDate, remainingWorkingDays);
          const start = parse(g.startDate, 'yyyy-MM-dd', new Date());

          let totalWorkingDays = 0;
          let temp = new Date(start);
          while (temp <= projectedEnd) {
              if (!isHoliday(temp)) totalWorkingDays++;
              temp = addDays(temp, 1);
          }

          return { 
            ...g, 
            duration: totalWorkingDays || 1, 
            endDate: format(projectedEnd, 'yyyy-MM-dd') 
          };
      });
  }, [workGroups]);

  const totalContentHeight = useMemo(() => {
      return (enrichedWorkGroups.length * ROW_HEIGHT) + BOTTOM_SPACER;
  }, [enrichedWorkGroups.length]);

  const { grandTotal, earnedValue, overallProgress } = useMemo(() => {
    const total = documents.reduce((acc, doc) => acc + doc.workGroups.reduce((gAcc, group) => {
        const groupTotal = group.items.reduce((iAcc, item) => {
            const varTotal = (item.variations || []).reduce((vAcc, v) => v.type === 'increase' ? vAcc + v.quantity : vAcc - v.quantity, 0);
            return iAcc + ((item.quantity + varTotal) * item.unitPrice);
        }, 0);
        return gAcc + groupTotal;
    }, 0), 0);
    const ev = documents.filter(doc => !doc.isFrozen).reduce((acc, doc) => acc + doc.workGroups.reduce((gAcc, g) => gAcc + g.items.reduce((iAcc, i) => iAcc + (i.measurements || []).reduce((mAcc, m) => mAcc + (m.quantity * i.unitPrice), 0), 0), 0), 0);
    return { grandTotal: total, earnedValue: ev, overallProgress: total > 0 ? (ev / total) * 100 : 0 };
  }, [documents]);

  const { chartStart, chartEnd, headerIntervals, monthHeaderIntervals, totalWidth, dayPixelWidth } = useMemo(() => {
    let minDate: Date;
    let maxDate: Date;
    
    if (enrichedWorkGroups.length === 0) {
      minDate = new Date();
      maxDate = addDays(minDate, 30);
    } else {
      const allTaskDates = enrichedWorkGroups.flatMap(g => [parse(g.startDate, 'yyyy-MM-dd', new Date()), parse(g.endDate, 'yyyy-MM-dd', new Date())]);
      minDate = new Date(Math.min(...allTaskDates.map(d => d.getTime())));
      maxDate = new Date(Math.max(...allTaskDates.map(d => d.getTime())));
    }

    if (zoom === 'week') { minDate = startOfWeek(minDate, { weekStartsOn: 1 }); maxDate = endOfWeek(addDays(maxDate, 15), { weekStartsOn: 1 }); }
    else if (zoom === 'month') { minDate = startOfMonth(minDate); maxDate = endOfMonth(addDays(maxDate, 45)); }
    else { maxDate = addDays(maxDate, 15); }

    const intervals = UNIT_CONFIG[zoom].getIntervals({ start: minDate, end: maxDate });
    
    const mHeaderIntervals: { name: string, count: number, date: Date, x: number }[] = [];
    let currentX = 0;
    intervals.forEach(date => {
        const groupName = zoom === 'month' ? format(date, 'yyyy') : format(date, 'MMMM yyyy', { locale: it });
        if (mHeaderIntervals.length > 0 && mHeaderIntervals[mHeaderIntervals.length - 1].name === groupName) {
            mHeaderIntervals[mHeaderIntervals.length - 1].count++;
        } else {
            mHeaderIntervals.push({ name: groupName, count: 1, date: startOfMonth(date), x: currentX });
        }
        currentX += UNIT_CONFIG[zoom].width;
    });

    const totalW = intervals.length * UNIT_CONFIG[zoom].width;
    const totalDaysInView = differenceInDays(maxDate, minDate) || 1;
    return { 
        chartStart: minDate, 
        chartEnd: maxDate, 
        headerIntervals: intervals, 
        monthHeaderIntervals: mHeaderIntervals, 
        totalWidth: totalW, 
        dayPixelWidth: totalW / totalDaysInView 
    };
  }, [enrichedWorkGroups, zoom]);

  const simDate = useMemo(() => {
    if (simX === null) return null;
    return addDays(chartStart, simX / dayPixelWidth);
  }, [simX, chartStart, dayPixelWidth]);

  const isIntervalHighlighted = useCallback((date: Date) => {
    if (!simDate) return false;
    if (zoom === 'day') return isSameDay(date, simDate);
    if (zoom === 'week') {
        const weekStart = startOfWeek(date, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(date, { weekStartsOn: 1 });
        return simDate >= weekStart && simDate <= weekEnd;
    }
    if (zoom === 'month') return isSameMonth(date, simDate);
    return false;
  }, [simDate, zoom]);

  const handleMarkerMouseDown = useCallback((e: React.MouseEvent, index: number) => {
    if (isViewOnly) return;
    e.stopPropagation();
    setDraggingMarkerIndex(index);
  }, [isViewOnly]);

  const handleBarDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isViewOnly || !progressBarRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = (x / rect.width) * 100;
    onSalMarkersChange(prev => [...prev, Math.max(0, Math.min(100, percentage))].sort((a,b) => a-b));
  };

  const centerTaskInView = useCallback((group: WorkGroup) => {
    if (!chartContainerRef.current) return;
    const groupStart = parse(group.startDate, 'yyyy-MM-dd', new Date());
    const left = differenceInDays(groupStart, chartStart) * dayPixelWidth;
    const targetX = Math.max(0, left - 150); 
    const index = enrichedWorkGroups.findIndex(g => g.id === group.id);
    const targetY = Math.max(0, index * ROW_HEIGHT - 20);
    chartContainerRef.current.scrollTo({ left: targetX, top: targetY, behavior: 'smooth' });
    setSelectedGroupId(group.id);
  }, [chartStart, dayPixelWidth, enrichedWorkGroups]);

  const handleStartHoverScroll = (dir: 'left' | 'right') => {
      if (hoverScrollRef.current) return;
      scrollSpeedRef.current = 4;
      hoverScrollRef.current = setInterval(() => {
          if (chartContainerRef.current) {
              if (isMouseDownOnScrollRef.current) {
                  scrollSpeedRef.current = Math.min(scrollSpeedRef.current + 1.2, 55);
              } else {
                  scrollSpeedRef.current = 4;
              }
              const move = dir === 'left' ? -scrollSpeedRef.current : scrollSpeedRef.current;
              chartContainerRef.current.scrollBy({ left: move });
          }
      }, 16);
  };

  const handleStopHoverScroll = () => {
      if (hoverScrollRef.current) {
          clearInterval(hoverScrollRef.current);
          hoverScrollRef.current = null;
      }
      isMouseDownOnScrollRef.current = false;
  };

  const handleMouseMoveGlobal = useCallback((e: globalThis.MouseEvent) => {
    if (dragging) {
        const deltaX = e.clientX - dragging.initialX;
        const dayDelta = Math.round(deltaX / dayPixelWidth);
        setWorkGroups(prevGroups => prevGroups.map(g => {
            if (g.id === dragging.id) {
              if (dragging.type === 'move') {
                const newStartDate = addDays(dragging.initialStartDate, dayDelta);
                return { ...g, startDate: format(newStartDate, 'yyyy-MM-dd') };
              } else {
                const newTeamSize = Math.max(1, Math.round(g.value / (DAILY_RATE_PER_PERSON * Math.max(1, dragging.initialDuration + dayDelta))));
                return { ...g, teamSize: newTeamSize };
              }
            }
            return g;
        }));
    }
    if (draggingMarkerIndex !== null && progressBarRef.current) {
        const rect = progressBarRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const newPercentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
        onSalMarkersChange(prev => {
            const next = [...prev];
            next[draggingMarkerIndex] = newPercentage;
            return next;
        });
    }
  }, [dragging, draggingMarkerIndex, dayPixelWidth, setWorkGroups, onSalMarkersChange]);

  const handleMouseUpGlobal = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setIsSimActive(false);
    setSimX(null);
    setDragging(null);
    if (draggingMarkerIndex !== null) onSalMarkersChange(prev => [...prev].sort((a,b) => a-b));
    setDraggingMarkerIndex(null);
  }, [onSalMarkersChange]);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMoveGlobal);
    document.addEventListener('mouseup', handleMouseUpGlobal);
    return () => {
      document.removeEventListener('mousemove', handleMouseMoveGlobal);
      document.removeEventListener('mouseup', handleMouseUpGlobal);
      if(hoverScrollRef.current) clearInterval(hoverScrollRef.current);
    };
  }, [handleMouseMoveGlobal, handleMouseUpGlobal]);

  const handleSyncScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    const target = e.currentTarget;
    if (target === chartContainerRef.current) {
        if (scrollSyncRef.current) scrollSyncRef.current.scrollTop = target.scrollTop;
        if (horizontalHeaderRef.current) horizontalHeaderRef.current.scrollLeft = target.scrollLeft;
    } else if (target === scrollSyncRef.current) {
        if (chartContainerRef.current) chartContainerRef.current.scrollTop = target.scrollTop;
    }
    window.requestAnimationFrame(() => { isSyncingRef.current = false; });
  };

  const handleGanttMouseMove = (e: React.MouseEvent) => {
      if (!chartContainerRef.current) return;
      if (!isEconomicViewVisible && !isSimActive) {
          if (simX !== null) setSimX(null);
          return;
      }
      const rect = chartContainerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + chartContainerRef.current.scrollLeft;
      setSimX(x);
  };

  const handleGanttMouseDown = (e: React.MouseEvent) => {
      if (e.button === 0) {
          longPressTimerRef.current = setTimeout(() => {
              setIsSimActive(true);
              handleGanttMouseMove(e);
          }, 2000);
      }
  };

  const simulatedProgress = useMemo(() => {
    if (simDate === null || grandTotal === 0) return 0;
    let plannedValue = 0;
    enrichedWorkGroups.forEach(g => {
        const start = parse(g.startDate, 'yyyy-MM-dd', new Date());
        const end = parse(g.endDate, 'yyyy-MM-dd', new Date());
        if (simDate >= end) { plannedValue += g.value; } 
        else if (simDate >= start) {
            const totalDays = differenceInDays(end, start) + 1;
            const elapsedDays = differenceInDays(simDate, start) + 1;
            plannedValue += g.value * (elapsedDays / totalDays);
        }
    });
    return (plannedValue / grandTotal) * 100;
  }, [simDate, enrichedWorkGroups, grandTotal]);

  // FIX: Moved handleTaskMouseDown before return statement to ensure correct scope resolution and avoid hoisting-related issues.
  function handleTaskMouseDown(e: ReactMouseEvent<HTMLDivElement>, id: string, type: 'move' | 'resize-end') {
    if (isViewOnly || e.button !== 0) return;
    const group = enrichedWorkGroups.find(g => g.id === id);
    if (!group) return;

    if (type === 'move' && group.officialStartDate) {
        return;
    }

    e.preventDefault(); e.stopPropagation();
    setSelectedGroupId(id);
    setDragging({ id, type, initialX: e.clientX, initialStartDate: parse(group.startDate, 'yyyy-MM-dd', new Date()), initialDuration: group.duration });
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 relative overflow-hidden min-h-0">
        <div className="flex-shrink-0 z-30 bg-white dark:bg-gray-800 border-b dark:border-gray-700 shadow-md no-print">
            <div className="px-4 py-2 flex items-center justify-between gap-4 border-b dark:border-gray-700">
                <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                        {(['day', 'week', 'month'] as ZoomLevel[]).map(level => (
                            <button key={level} onClick={() => setZoom(level)} className={`px-2 py-0.5 text-[9px] font-black rounded capitalize transition-all ${zoom === level ? 'bg-white dark:bg-gray-900 text-indigo-600 shadow' : 'text-gray-500 hover:text-gray-700'}`}>{level === 'day' ? 'Gior.' : level === 'week' ? 'Sett.' : 'Mese'}</button>
                        ))}
                    </div>
                    <button onClick={onToggleEconomicView} className={`flex items-center space-x-1 px-2.5 py-1.5 rounded text-[9px] font-black transition-colors uppercase ${isEconomicViewVisible ? 'bg-yellow-300 text-yellow-800' : 'bg-gray-100 dark:bg-gray-700 text-gray-500'}`}>Spese</button>
                    {isSimActive && <span className="text-[8px] font-black bg-red-600 text-white px-2 py-1 rounded animate-pulse shadow-sm">SIMULAZIONE ATTIVA</span>}
                </div>

                <div className="flex-grow max-w-2xl px-4 flex flex-col justify-center pt-2">
                    <div className="flex justify-between items-center mb-0.5">
                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">Avanzamento Progetto</span>
                        <div className="flex gap-2">
                           {(isEconomicViewVisible || isSimActive) && <span className="text-[9px] font-black text-red-600 dark:text-red-400 animate-pulse">PREV: {numberFormatter.format(simX !== null ? simulatedProgress : 0)}%</span>}
                           <span className="text-[9px] font-black text-indigo-600 dark:text-indigo-400">REALE: {numberFormatter.format(overallProgress)}%</span>
                        </div>
                    </div>
                    <div ref={progressBarRef} onDoubleClick={handleBarDoubleClick} className="relative w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-visible cursor-crosshair" title="Doppio click per aggiungere un obiettivo SAL">
                        <div className="bg-indigo-600 h-full rounded-full transition-all duration-500 shadow-sm" style={{ width: `${overallProgress}%` }}></div>
                        {simX !== null && (isEconomicViewVisible || isSimActive) && (<div className="absolute top-0 bottom-0 w-0.5 bg-red-600 shadow-[0_0_8px_rgba(220,38,38,0.8)] z-40" style={{ left: `${simulatedProgress}%` }}><div className="absolute -top-1.5 -translate-x-1/2 w-1.5 h-5 bg-red-600 rounded-full border border-white" /></div>)}
                        {salMarkers.map((marker, idx) => (<div key={idx} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2" style={{ left: `${marker}%` }}><div className="absolute -top-7 left-1/2 -translate-x-1/2 px-1.5 py-0.5 bg-red-600 text-white text-[8px] font-black rounded-md shadow-[0_2px_10px_rgba(220,38,38,0.4)] whitespace-nowrap z-[60] border border-white"><span>{idx + 1}° SAL - {currencyFormatter.format(grandTotal * (marker / 100))}</span></div><div onMouseDown={e => handleMarkerMouseDown(e, idx)} className={`w-3 h-3 ${isViewOnly ? '' : 'cursor-ew-resize'} bg-red-500 border border-white rounded-full shadow-md hover:scale-125 transition-transform z-[61]`} /></div>))}
                    </div>
                </div>

                <div className="flex-shrink-0 text-right">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-tighter leading-none">Valore Cantiere</p>
                    <p className="text-[10px] font-black text-blue-600 dark:text-blue-400">{currencyFormatter.format(grandTotal)}</p>
                </div>
            </div>

            <div className="flex bg-gray-50 dark:bg-gray-900 overflow-hidden">
                <div className="flex-shrink-0 border-r dark:border-gray-700 p-2 flex flex-col items-center justify-center gap-1" style={{ width: WBS_TABLE_WIDTH }}>
                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">VARIANTI</span>
                    {!isViewOnly && onAddVariant && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); onAddVariant(); }}
                            className="group flex items-center justify-center w-6 h-6 bg-indigo-600 hover:bg-indigo-700 rounded-full shadow-md transition-all active:scale-90"
                            title="Carica Computo Esterno / Variante"
                        >
                            <span className="text-white text-lg font-bold leading-none">+</span>
                        </button>
                    )}
                </div>
                <div className="flex-grow overflow-hidden relative" ref={horizontalHeaderRef}>
                    <div className="relative h-[60px]" style={{ width: totalWidth }}>
                         {monthHeaderIntervals.map((pos, i) => (
                            <div key={`h-grid-l2-${i}`} className="absolute top-0 bottom-0 border-l-2 border-gray-200 dark:border-gray-700 z-0" style={{ left: pos.x }} />
                         ))}
                         <div className="absolute top-0 left-0 right-0 flex bg-gray-50 dark:bg-gray-900 h-[25px] border-b dark:border-gray-700 z-10">
                            {monthHeaderIntervals.map(({ name, count, date, x }) => {
                                const isHighlighted = simDate && (zoom === 'month' ? isSameYear(date, simDate) : isSameMonth(date, simDate));
                                return (
                                    <div key={name} className={`flex-shrink-0 text-center text-[9px] font-black uppercase flex items-center justify-center border-r dark:border-gray-700 transition-colors ${isHighlighted ? 'bg-yellow-300 text-gray-900' : 'text-gray-400'}`} style={{ width: count * UNIT_CONFIG[zoom].width }}>{name}</div>
                                );
                            })}
                        </div>
                        <div className="absolute top-[25px] left-0 right-0 flex bg-gray-50 dark:bg-gray-900 h-[35px] z-10">
                            {headerIntervals.map((date, i) => {
                                const highlighted = isIntervalHighlighted(date);
                                return (
                                    <div key={i} className={`flex-shrink-0 text-center border-r dark:border-gray-700 pt-0.5 transition-colors ${highlighted ? 'bg-yellow-300' : isHoliday(date) ? 'bg-red-50 dark:bg-red-900/10 opacity-50' : ''}`} style={{ width: UNIT_CONFIG[zoom].width }}>
                                        {UNIT_CONFIG[zoom].subLabelFormat && <div className={`text-[8px] font-bold uppercase leading-none ${highlighted ? 'text-gray-900' : 'text-gray-400'}`}>{format(date, UNIT_CONFIG[zoom].subLabelFormat, { locale: it })}</div>}
                                        <div className={`text-[10px] font-black ${highlighted ? 'text-gray-900' : 'text-gray-700 dark:text-gray-200'}`}>{format(date, UNIT_CONFIG[zoom].labelFormat, { locale: it })}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div className="flex flex-grow overflow-hidden relative group/gantt min-h-0">
            <button 
                onMouseEnter={() => handleStartHoverScroll('left')} 
                onMouseLeave={handleStopHoverScroll}
                onMouseDown={() => { isMouseDownOnScrollRef.current = true; }}
                onMouseUp={() => { isMouseDownOnScrollRef.current = false; }}
                className="absolute left-[340px] top-1/2 -translate-y-1/2 z-[20] p-4 bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl rounded-r-3xl shadow-2xl opacity-0 hover:opacity-100 transition-opacity text-indigo-600 border border-l-0 cursor-pointer active:scale-95"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button 
                onMouseEnter={() => handleStartHoverScroll('right')} 
                onMouseLeave={handleStopHoverScroll}
                onMouseDown={() => { isMouseDownOnScrollRef.current = true; }}
                onMouseUp={() => { isMouseDownOnScrollRef.current = false; }}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-[20] p-4 bg-white/40 dark:bg-gray-800/40 backdrop-blur-xl rounded-l-3xl shadow-2xl opacity-0 hover:opacity-100 transition-opacity text-indigo-600 border border-r-0 cursor-pointer active:scale-95"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M9 5l7 7-7 7" /></svg>
            </button>

            <div className="flex-shrink-0 flex flex-col border-r dark:border-gray-700 shadow-lg z-10 bg-white dark:bg-gray-800 overflow-hidden h-full" style={{ width: WBS_TABLE_WIDTH }}>
                <div className="flex-1 overflow-y-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }} ref={scrollSyncRef} onScroll={handleSyncScroll}>
                    <div className="flex flex-col" style={{ height: totalContentHeight }}>
                        {enrichedWorkGroups.map((group, idx) => {
                            const variantNum = getGroupVariantInfo(group.id);
                            return (
                            <div key={group.id} className={`h-[56px] flex-shrink-0 border-b border-gray-50/50 dark:border-gray-700/30 flex flex-col justify-center px-4 cursor-pointer transition-colors relative ${selectedGroupId === group.id ? 'bg-indigo-50 dark:bg-indigo-900/30 ring-inset ring-2 ring-indigo-500' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}`} onClick={() => { centerTaskInView(group); }}>
                                {variantNum && (
                                    <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-orange-500 shadow-[2px_0_4px_rgba(249,115,22,0.3)]" title={`Variante n. ${variantNum}`} />
                                )}
                                <div className="flex justify-between items-center mb-0.5">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        {!isViewOnly && (<button onClick={(e) => { e.stopPropagation(); onBarDoubleClick(group); }} className="p-1 hover:bg-indigo-100 rounded text-gray-400 hover:text-indigo-600 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" /></svg></button>)}
                                        <span className="text-[11px] font-bold text-gray-800 dark:text-white truncate uppercase max-w-[160px]">
                                            {variantNum ? `VAR ${variantNum}` : `WBS ${idx + 1}`} - {group.name}
                                        </span>
                                    </div>
                                    <span className="text-[10px] font-black bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 px-1.5 rounded">{group.duration}gg</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-mono font-bold text-blue-600">{currencyFormatter.format(group.value)}</span>
                                    <div className="w-12 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${group.progress}%`, backgroundColor: variantNum ? '#F97316' : group.color }}></div></div>
                                </div>
                            </div>
                        )})}
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-auto scrollbar-hide relative h-full min-h-0" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }} ref={chartContainerRef} onScroll={handleSyncScroll} onMouseMove={handleGanttMouseMove} onMouseDown={handleGanttMouseDown} onMouseLeave={() => { if(longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; } setSimX(null); }}>
                <div className="absolute inset-0 pointer-events-none" style={{ width: totalWidth, height: totalContentHeight }}>
                    {headerIntervals.map((_, i) => (
                        <div key={`grid-l1-${i}`} className="absolute top-0 bottom-0 border-l border-gray-100 dark:border-gray-700/20" style={{ left: i * UNIT_CONFIG[zoom].width }} />
                    ))}
                    {monthHeaderIntervals.map((pos, i) => (
                        <div key={`grid-l2-${i}`} className="absolute top-0 bottom-0 border-l-2 border-gray-300 dark:border-gray-600" style={{ left: pos.x }} />
                    ))}
                </div>

                {simX !== null && (isEconomicViewVisible || isSimActive) && (
                    <div className="absolute top-0 w-px border-l-2 border-red-600 shadow-[0_0_12px_rgba(220,38,38,0.6)] z-[70] pointer-events-none" style={{ left: simX, height: totalContentHeight }}>
                        <div className="sticky top-0 z-[80]">
                            <div className="bg-white border-2 border-red-600 text-black text-[10px] font-black px-4 py-2 rounded-b shadow-[0_4px_15px_rgba(0,0,0,0.4)] whitespace-nowrap border-x border-b min-w-[140px] text-center mx-auto" style={{ transform: 'translateX(-50%)' }}>
                                <div className="text-red-600 mb-1 border-b border-gray-100 pb-1">{format(addDays(chartStart, simX / dayPixelWidth), 'dd MMM yyyy', { locale: it })}</div>
                                <div className="text-black text-sm">{currencyFormatter.format(grandTotal * (simulatedProgress / 100))}</div>
                            </div>
                        </div>
                    </div>
                )}
                
                <div className="relative" style={{ width: totalWidth, height: totalContentHeight }}>
                    {enrichedWorkGroups.map((group, index) => {
                        const groupStart = parse(group.startDate, 'yyyy-MM-dd', new Date());
                        const groupEnd = parse(group.endDate, 'yyyy-MM-dd', new Date());
                        const left = differenceInDays(groupStart, chartStart) * dayPixelWidth;
                        const width = (differenceInDays(groupEnd, groupStart) + 1) * dayPixelWidth;
                        const variantNum = getGroupVariantInfo(group.id);
                        
                        const measurementDates = Array.from(new Set(group.items.flatMap(i => i.measurements || []).map(m => m.date)));

                        return (
                            <div key={group.id} className={`absolute border-b border-gray-50/50 dark:border-gray-700/30 transition-colors ${selectedGroupId === group.id ? 'bg-indigo-50/20' : ''}`} style={{top: index * ROW_HEIGHT, height: ROW_HEIGHT, left:0, width:'100%'}}>
                                {/* FIX: Correctly wrap scale class and z-index in strings within the ternary expression to resolve scope and find name errors */}
                                <div className={`absolute h-8 flex items-center my-3 group/task transition-all ${selectedGroupId === group.id ? 'scale-[1.02] z-30' : 'z-10'}`} style={{ left, width }} onDoubleClick={(e) => { e.stopPropagation(); onBarDoubleClick(group); }}>
                                    <div className={`relative flex items-center rounded-lg shadow-sm w-full h-full overflow-hidden ${!isViewOnly && !group.officialStartDate ? 'cursor-pointer' : 'cursor-default'}`} style={{ backgroundColor: variantNum ? '#F97316' : group.color }} onMouseDown={(e) => handleTaskMouseDown(e, group.id, 'move')}>
                                        <div className="absolute left-0 top-0 h-full bg-black/20" style={{ width: `${group.progress}%` }} />
                                        
                                        {measurementDates.map(mDate => {
                                            const mPos = differenceInDays(parseISO(mDate), chartStart) * dayPixelWidth;
                                            const relativeLeft = mPos - left;
                                            if (relativeLeft >= 0 && relativeLeft <= width) {
                                                return <div key={mDate} className="absolute top-0 bottom-0 w-px bg-white z-20 shadow-[0_0_2px_rgba(255,255,255,0.8)]" style={{ left: relativeLeft }} />;
                                            }
                                            return null;
                                        })}

                                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                            <span className="text-[10px] font-black text-white drop-shadow-md">{group.duration}gg</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
        <style dangerouslySetInnerHTML={{ __html: ".scrollbar-hide::-webkit-scrollbar { display: none; }" }} />
    </div>
  );
};

export default GanttChart;
