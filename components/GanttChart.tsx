
import React, { useState, useMemo, useRef, useCallback, MouseEvent as ReactMouseEvent, useEffect } from 'react';
import { WorkGroup, Expense, ExpenseCategory, Dependency, DependencyType } from '../types';
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
  parseISO
} from 'date-fns';
import { it } from 'date-fns/locale/it';

declare const jspdf: any;
declare const html2canvas: any;

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
}

type ZoomLevel = 'day' | 'week' | 'month';

interface TooltipData {
  x: number;
  y: number;
  group: WorkGroup;
  totalCost: number;
  margin: number;
}

interface ExpenseTooltipData {
  x: number;
  y: number;
  expense: Expense;
  isSupply?: boolean;
}

interface ExpenseClusterTooltipData {
  x: number;
  y: number;
  expenses: Expense[];
  date: string;
}

type LinkingState = {
  fromId: string;
  fromSide: 'start' | 'end';
  x: number;
  y: number;
};

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
    labelFormat: "'Sett' w", // Week number
  },
  month: {
    width: 150,
    getIntervals: eachMonthOfInterval,
    labelFormat: 'MMMM yyyy'
  }
};

const currencyFormatter = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

const getExpenseSvgIcon = (category: ExpenseCategory, className = "w-5 h-5") => {
    const commonProps = {
        className: className,
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor",
        strokeWidth: 1.5,
    };
    switch (category) {
        case 'Personale': 
            return <svg {...commonProps}><path strokeLinecap="round" strokeLinejoin="round" d="M15 9h-1a2 2 0 100 4h1m-1-4a2 2 0 110-4h1m-1 4v4m-1-4H9m6 8a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
        case 'Materiali': 
            return <svg {...commonProps}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-14L4 7v10l8 4" /></svg>;
        case 'Noleggi': 
            return <svg {...commonProps}><path d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10l2 2h8a1 1 0 001-1z" /><path strokeLinecap="round" strokeLinejoin="round" d="M18 18h1a1 1 0 001-1v-3.354a1.5 1.5 0 00-.9-1.342l-3.286-1.643A1.5 1.5 0 0013 7.354V16" /></svg>;
        case 'Subappalti': 
            return <svg {...commonProps}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
        case 'Spese Generali': 
            return <svg {...commonProps}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924-1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
        default: 
            return <svg {...commonProps}><path strokeLinecap="round" strokeLinejoin="round" d="M14.121 15.536c-1.171 1.952-3.07 1.952-4.242 0-1.172-1.953-1.172-5.119 0-7.072 1.171-1.952 3.07-1.952 4.242 0 1.172 1.953 1.172 5.119 0 7.072zM12 12h.01M12 12v.01" /></svg>;
    }
};

const TruckIcon = ({ className = "w-5 h-5", dragging = false }: { className?: string, dragging?: boolean }) => (
    <svg className={`${className} ${dragging ? 'text-indigo-600 drop-shadow-lg scale-110' : 'text-orange-500'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 18h5M18 18h1a2 2 0 0 0 2-2v-5l-3-4h-4v9h4" />
        <path d="M9 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0" />
        <path d="M19 18a2 2 0 1 1-4 0 2 2 0 0 1 4 0" />
        <path d="M14 9h4l1.5 2H14V9z" />
        <path d="M2 16V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v12" />
        <path d="M2 13h13" />
    </svg>
);

const getExpenseClusterIcon = (count: number) => {
    return (
        <div className="relative w-6 h-6">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <div className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center border-2 border-gray-50 dark:border-gray-800/50">
                {count}
            </div>
        </div>
    );
};


const GanttChart: React.FC<GanttChartProps> = ({ workGroups, dependencies, expenses, setWorkGroups, onDependenciesChange, isViewOnly, onBarDoubleClick, isEconomicViewVisible, onToggleEconomicView, onUpdateExpenseSupplyDate, projectName }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{ id: string; type: 'move' | 'resize-end'; initialX: number; initialStartDate: Date; initialDuration: number } | null>(null);
  const [salLineX, setSalLineX] = useState<number>(300);
  const [isSalDragging, setIsSalDragging] = useState<boolean>(false);
  
  // Fluid drag state
  const [supplyDragging, setSupplyDragging] = useState<{ expenseId: string; initialClientX: number; initialLeft: number } | null>(null);
  const [currentSupplyX, setCurrentSupplyX] = useState<number | null>(null);
  
  const [zoom, setZoom] = useState<ZoomLevel>('week');
  const [tooltipData, setTooltipData] = useState<TooltipData | null>(null);
  const [expenseTooltipData, setExpenseTooltipData] = useState<ExpenseTooltipData | null>(null);
  const [expenseClusterTooltipData, setExpenseClusterTooltipData] = useState<ExpenseClusterTooltipData | null>(null);
  const [linkingState, setLinkingState] = useState<LinkingState | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const taskPositions = useRef<Map<string, { y: number, x: number, width: number }>>(new Map());

  const ROW_HEIGHT = 56; // Increased slightly for better spacing with icons
  const BAR_HEIGHT_CLASS = 'h-8';
  const HEADER_HEIGHT = 70;

  const { chartStart, chartEnd, headerIntervals, totalWidth, dayPixelWidth } = useMemo(() => {
    if (workGroups.length === 0) {
      const start = new Date();
      const end = addDays(start, 30);
       return {
         chartStart: start,
         chartEnd: end,
         headerIntervals: UNIT_CONFIG[zoom].getIntervals({ start, end }),
         totalWidth: 30 * UNIT_CONFIG.day.width,
         dayPixelWidth: UNIT_CONFIG.day.width
       };
    }
    const allTaskDates = workGroups.flatMap(g => [parse(g.startDate, 'yyyy-MM-dd', new Date()), parse(g.endDate, 'yyyy-MM-dd', new Date())]);
    const allExpenseDates = expenses.map(e => parseISO(e.date));
    const allSupplyDates = expenses.filter(e => e.expectedSupplyDate).map(e => parseISO(e.expectedSupplyDate!));

    const allDates = [...allTaskDates, ...allExpenseDates, ...allSupplyDates];

    let minDate = allDates.length > 0 ? new Date(Math.min(...allDates.map(d => d.getTime()))) : new Date();
    let maxDate = allDates.length > 0 ? new Date(Math.max(...allDates.map(d => d.getTime()))) : addDays(new Date(), 30);

    // Adjust dates for week/month view to show full units
    if (zoom === 'week') {
      minDate = startOfWeek(minDate, { weekStartsOn: 1 });
      maxDate = endOfWeek(addDays(maxDate, 10), { weekStartsOn: 1 });
    } else if (zoom === 'month') {
      minDate = startOfMonth(minDate);
      maxDate = endOfMonth(addDays(maxDate, 30));
    } else {
      maxDate = addDays(maxDate, 10);
    }

    const intervals = UNIT_CONFIG[zoom].getIntervals({ start: minDate, end: maxDate });
    const totalW = intervals.length * UNIT_CONFIG[zoom].width;
    const totalDaysInView = differenceInDays(maxDate, minDate) || 1;
    
    return {
      chartStart: minDate,
      chartEnd: maxDate,
      headerIntervals: intervals,
      totalWidth: totalW,
      dayPixelWidth: totalW / totalDaysInView
    };
  }, [workGroups, expenses, zoom]);

  const monthHeaderIntervals = useMemo(() => {
    if (zoom === 'month' || headerIntervals.length === 0) return [];
    
    const groups: { name: string; count: number }[] = [];
    let currentMonth = '';
    
    headerIntervals.forEach(date => {
        const monthName = format(date, 'MMMM yyyy', { locale: it });
        if (monthName !== currentMonth) {
            currentMonth = monthName;
            groups.push({ name: monthName, count: 1 });
        } else {
            groups[groups.length - 1].count++;
        }
    });

    return groups;
  }, [headerIntervals, zoom]);


  const groupTotalCostMap = useMemo(() => {
    const costMap = new Map<string, number>();
    expenses.forEach(expense => {
        if (expense.relatedWorkGroupId) {
            const currentCost = costMap.get(expense.relatedWorkGroupId) || 0;
            costMap.set(expense.relatedWorkGroupId, currentCost + expense.amount);
        }
    });
    return costMap;
  }, [expenses]);

  const groupedExpensesByDateAndGroup = useMemo(() => {
    const map = new Map<string, Expense[]>();
    expenses.forEach(expense => {
        if (expense.relatedWorkGroupId) {
            const key = `${expense.relatedWorkGroupId}-${expense.date}`;
            if (!map.has(key)) {
                map.set(key, []);
            }
            map.get(key)!.push(expense);
        }
    });
    return map;
  }, [expenses]);

  const handleTaskMouseDown = (e: ReactMouseEvent<HTMLDivElement>, id: string, type: 'move' | 'resize-end') => {
    if (isViewOnly) return;
    
    const group = workGroups.find(g => g.id === id);
    if (!group) return;

    if (type === 'move') {
        const hasMeasurements = group.items.some(item => item.measurements && item.measurements.length > 0);
        if (hasMeasurements || group.officialStartDate) {
            return; 
        }
    }

    e.preventDefault();
    e.stopPropagation();

    setDragging({
      id,
      type,
      initialX: e.clientX,
      initialStartDate: parse(group.startDate, 'yyyy-MM-dd', new Date()),
      initialDuration: group.duration
    });
    setTooltipData(null); 
  };
  
  const handleDependencyMouseDown = (e: ReactMouseEvent, fromId: string, fromSide: 'start' | 'end') => {
    e.stopPropagation();
    if(isViewOnly) return;

    const taskPos = taskPositions.current.get(fromId);
    if (taskPos && chartContainerRef.current) {
      const rect = chartContainerRef.current.getBoundingClientRect();
      const scrollLeft = chartContainerRef.current.scrollLeft;
      const scrollTop = chartContainerRef.current.scrollTop;
      
      const startX = taskPos.x + (fromSide === 'end' ? taskPos.width : 0) - scrollLeft;
      const startY = taskPos.y + (ROW_HEIGHT / 2) - scrollTop;
      
      setLinkingState({
        fromId,
        fromSide,
        x: e.clientX - rect.left + scrollLeft,
        y: e.clientY - rect.top + scrollTop,
      });
    }
  };

  const handleSupplyMouseDown = (e: React.MouseEvent, expenseId: string, currentDate: string, leftPos: number) => {
    if (isViewOnly) return;
    e.stopPropagation();
    e.preventDefault();
    
    setSupplyDragging({
        expenseId,
        initialClientX: e.clientX,
        initialLeft: leftPos
    });
    setCurrentSupplyX(leftPos);
  };

  const handleMouseMove = useCallback((e: globalThis.MouseEvent) => {
    if (dragging && !linkingState) {
        if (!chartContainerRef.current) return;
        
        const deltaX = e.clientX - dragging.initialX;
        const dayDelta = Math.round(deltaX / dayPixelWidth);
        
        setWorkGroups(prevGroups => 
          prevGroups.map(g => {
            if (g.id === dragging.id) {
              if (dragging.type === 'move') {
                const newStartDate = addDays(dragging.initialStartDate, dayDelta);
                const newEndDate = addDays(newStartDate, g.duration - 1);
                return { ...g, startDate: format(newStartDate, 'yyyy-MM-dd'), endDate: format(newEndDate, 'yyyy-MM-dd') };
              } else { // resize-end
                const newDuration = Math.max(1, dragging.initialDuration + dayDelta);
                const newEndDate = addDays(parse(g.startDate, 'yyyy-MM-dd', new Date()), newDuration - 1);
                return { ...g, duration: newDuration, endDate: format(newEndDate, 'yyyy-MM-dd') };
              }
            }
            return g;
          })
        );
    } else if (supplyDragging) {
         // Calculate new visual position
         const deltaX = e.clientX - supplyDragging.initialClientX;
         const newX = Math.max(0, supplyDragging.initialLeft + deltaX);
         setCurrentSupplyX(newX);

    } else if (linkingState && chartContainerRef.current) {
        const rect = chartContainerRef.current.getBoundingClientRect();
        setLinkingState(prev => prev ? ({
            ...prev,
            x: e.clientX - rect.left + chartContainerRef.current!.scrollLeft,
            y: e.clientY - rect.top + chartContainerRef.current!.scrollTop
        }) : null);
    }
  }, [dragging, linkingState, setWorkGroups, dayPixelWidth, supplyDragging]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (dragging) {
      setWorkGroups(prevGroups => [...prevGroups], dragging.id);
      setDragging(null);
    }
    
    if (supplyDragging && onUpdateExpenseSupplyDate && currentSupplyX !== null) {
        // Commit change
        const pixelDelta = currentSupplyX - supplyDragging.initialLeft;
        const dayDelta = Math.round(pixelDelta / dayPixelWidth);
        
        if (dayDelta !== 0) {
            // We need to know the original date. We can't easily access expenses list here without ref or prop drill
            // But we can infer the date from the X position relative to chartStart
            const newDate = addDays(chartStart, Math.round(currentSupplyX / dayPixelWidth));
            onUpdateExpenseSupplyDate(supplyDragging.expenseId, format(newDate, 'yyyy-MM-dd'));
        }
        setSupplyDragging(null);
        setCurrentSupplyX(null);
    }

    if (linkingState) {
      const toEl = e.target as HTMLElement;
      const toId = toEl.dataset.taskid;
      const toSide = toEl.dataset.side as 'start' | 'end';

      if (toId && toSide && toId !== linkingState.fromId) {
        let type: DependencyType = 'FS';
        if (linkingState.fromSide === 'start' && toSide === 'start') type = 'SS';
        if (linkingState.fromSide === 'end' && toSide === 'end') type = 'FF';
        if (linkingState.fromSide === 'start' && toSide === 'end') type = 'SF';
        
        const newDep: Omit<Dependency, 'id'> = {
          from: linkingState.fromId,
          to: toId,
          type,
          lag: 0,
        };
        onDependenciesChange(prev => [...prev, { ...newDep, id: crypto.randomUUID() }]);
      }
      setLinkingState(null);
    }
  }, [dragging, linkingState, setWorkGroups, onDependenciesChange, supplyDragging, onUpdateExpenseSupplyDate, dayPixelWidth, currentSupplyX, chartStart]);

  const handleSalMouseDown = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    setIsSalDragging(true);
  }, []);

  const handleSalMouseMove = useCallback((e: globalThis.MouseEvent) => {
    if (!isSalDragging || !chartContainerRef.current) return;
    const rect = chartContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + chartContainerRef.current.scrollLeft;
    setSalLineX(Math.max(0, Math.min(x, totalWidth - 2)));
  }, [isSalDragging, totalWidth]);

  const handleSalMouseUp = useCallback(() => {
    setIsSalDragging(false);
  }, []);

  useEffect(() => {
    const moveListener = (e: MouseEvent) => handleMouseMove(e);
    const upListener = (e: MouseEvent) => handleMouseUp(e);
    const salMoveListener = (e: MouseEvent) => handleSalMouseMove(e);
    const salUpListener = () => handleSalMouseUp();
    
    if (dragging || linkingState || supplyDragging) {
      document.addEventListener('mousemove', moveListener);
      document.addEventListener('mouseup', upListener);
    } else if (isSalDragging) {
      document.addEventListener('mousemove', salMoveListener);
      document.addEventListener('mouseup', salUpListener);
    }
    
    return () => {
      document.removeEventListener('mousemove', moveListener);
      document.removeEventListener('mouseup', upListener);
      document.removeEventListener('mousemove', salMoveListener);
      document.removeEventListener('mouseup', salUpListener);
    };
  }, [dragging, linkingState, handleMouseMove, handleMouseUp, isSalDragging, handleSalMouseMove, handleSalMouseUp, supplyDragging]);
  
  const handleGridDoubleClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!chartContainerRef.current) return;
    const rect = chartContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + chartContainerRef.current.scrollLeft;
    setSalLineX(Math.max(0, Math.min(x, totalWidth - 2)));
  }

  const { salDate, plannedValue, earnedValue } = useMemo(() => {
    const salDayIndex = Math.floor(salLineX / dayPixelWidth);
    const date = addDays(chartStart, salDayIndex);

    const pv = workGroups.reduce((acc, group) => {
      const groupStart = parse(group.startDate, 'yyyy-MM-dd', new Date());
      if (date < groupStart) return acc;
      const daysCompleted = differenceInDays(date, groupStart) + 1;
      const completionRatio = Math.min(1, Math.max(0, daysCompleted / group.duration));
      return acc + (group.value * completionRatio);
    }, 0);

    const ev = workGroups.reduce((totalEv, group) => {
      const groupEvAtSalDate = group.items.reduce((itemEv, item) => {
        const measuredQuantityAtSalDate = (item.measurements || [])
          .filter(m => parse(m.date, 'yyyy-MM-dd', new Date()) <= date)
          .reduce((sum, m) => sum + m.quantity, 0);
        return itemEv + (measuredQuantityAtSalDate * item.unitPrice);
      }, 0);
      return totalEv + groupEvAtSalDate;
    }, 0);

    return { salDate: date, plannedValue: pv, earnedValue: ev };
  }, [salLineX, workGroups, chartStart, dayPixelWidth]);

  const handleBarMouseMove = (e: React.MouseEvent, group: WorkGroup) => {
    if (dragging) return;
    if (!isEconomicViewVisible) return; 
    const totalCost = groupTotalCostMap.get(group.id) || 0;
    const groupEarnedValue = group.value * (group.progress / 100);
    const margin = groupEarnedValue - totalCost;

    setTooltipData({
      x: e.clientX,
      y: e.clientY,
      group: group,
      totalCost,
      margin,
    });
  };

  const handleBarMouseLeave = () => {
    setTooltipData(null);
  };
  
  const handleExpenseMouseEnter = (e: React.MouseEvent, expense: Expense, isSupply: boolean = false) => {
    setExpenseTooltipData({
        x: e.clientX,
        y: e.clientY,
        expense,
        isSupply
    });
  };

  const handleExpenseMouseLeave = () => {
    setExpenseTooltipData(null);
  };

  const handleExpenseClusterMouseEnter = (e: React.MouseEvent, expenses: Expense[]) => {
    setExpenseClusterTooltipData({
        x: e.clientX,
        y: e.clientY,
        expenses,
        date: expenses[0].date,
    });
  };

  const handleExpenseClusterMouseLeave = () => {
    setExpenseClusterTooltipData(null);
  };

  const handleExportPdf = async () => {
    const chartContent = chartContainerRef.current?.firstChild as HTMLElement;
    if (!chartContent) return;

    setIsExporting(true);

    try {
        const { jsPDF } = jspdf;
        
        // 1. CALCULATE DIMENSIONS
        // We need the full scroll width to capture the entire chart
        const captureWidth = chartContent.scrollWidth;
        const captureHeight = chartContent.scrollHeight;

        // 2. CAPTURE WITH HTML2CANVAS
        const canvas = await html2canvas(chartContent, {
            scale: 2, 
            useCORS: true,
            backgroundColor: '#ffffff',
            width: captureWidth,
            height: captureHeight,
            windowWidth: captureWidth, 
            windowHeight: captureHeight,
            
            // 3. THE "NUCLEAR" CLONING STRATEGY
            onclone: (clonedDoc: Document) => {
                
                // A. GLOBAL OVERFLOW OVERRIDE
                // Force everything to be visible so text doesn't get clipped by containers
                const allElements = clonedDoc.querySelectorAll('*');
                allElements.forEach((el) => {
                    const element = el as HTMLElement;
                    element.style.overflow = 'visible';
                    
                    // B. EXCEPTION: PROTECT WBS BARS
                    // These elements MUST contain their background/content, otherwise the bar "explodes"
                    if (element.classList.contains('wbs-visual-bar')) {
                        element.style.overflow = 'hidden';
                        (element.style as any).printColorAdjust = 'exact';
                        (element.style as any).webkitPrintColorAdjust = 'exact';
                    }
                });

                // C. HIDE UNWANTED ELEMENTS
                // Remove SAL line (red vertical) and values (text next to bars)
                const elementsToHide = clonedDoc.querySelectorAll('.sal-line, .pdf-hide-value');
                elementsToHide.forEach((el) => {
                    (el as HTMLElement).style.display = 'none';
                });

                // D. ENSURE TEXT VISIBILITY
                // Force black color for maximum contrast on white background
                clonedDoc.body.style.color = '#000000';
                
                // Clean up label containers specifically
                const labels = clonedDoc.querySelectorAll('.whitespace-nowrap');
                labels.forEach((el) => {
                    const element = el as HTMLElement;
                    element.style.background = 'transparent'; // Remove blur/white bg
                    element.style.boxShadow = 'none';
                    element.style.zIndex = '9999999'; // Float above everything
                    
                    // Force all inner text to black
                    const textNodes = element.querySelectorAll('*');
                    textNodes.forEach(t => (t as HTMLElement).style.color = 'black');
                    element.style.color = 'black';
                });
                
                // E. FLATTEN STICKY HEADERS
                // Sticky elements mess up PDF generation position calculations
                const stickyElements = clonedDoc.querySelectorAll('.sticky, .fixed');
                stickyElements.forEach((el) => {
                    (el as HTMLElement).style.position = 'static';
                });
            }
        });

        const imgData = canvas.toDataURL('image/png');
        
        // 4. CREATE PDF
        const pdf = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4',
        });

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        
        const margin = 10;
        const headerHeight = 35; // Space for title + dates
        const contentWidth = pdfWidth - (margin * 2);
        
        // --- HEADER INFO ---
        pdf.setFontSize(16);
        pdf.setTextColor(40, 40, 40);
        pdf.text("CRONOPROGRAMMA LAVORI", margin, 15);
        
        pdf.setFontSize(12);
        pdf.setTextColor(100, 100, 100);
        pdf.text(projectName || "Progetto Senza Nome", margin, 22);
        
        // Calculate Start/End Dates for Header
        const allDates = workGroups.flatMap(g => [parse(g.startDate, 'yyyy-MM-dd', new Date()), parse(g.endDate, 'yyyy-MM-dd', new Date())]);
        if (allDates.length > 0) {
            const minDate = new Date(Math.min(...allDates.map(d => d.getTime())));
            const maxDate = new Date(Math.max(...allDates.map(d => d.getTime())));
            
            pdf.setFontSize(10);
            pdf.setTextColor(80, 80, 80);
            pdf.text(`Inizio Lavori: ${format(minDate, 'dd/MM/yyyy')}  -  Fine Lavori: ${format(maxDate, 'dd/MM/yyyy')}`, margin, 28);
        }
        
        // Timestamp
        pdf.setFontSize(8);
        pdf.setTextColor(150, 150, 150);
        const dateStr = format(new Date(), 'dd/MM/yyyy HH:mm');
        pdf.text(`Stampato il: ${dateStr}`, pdfWidth - margin - 40, 15);

        pdf.setDrawColor(200, 200, 200);
        pdf.line(margin, 30, pdfWidth - margin, 30);

        // --- ADD IMAGE ---
        const imgProps = pdf.getImageProperties(imgData);
        const pdfImgHeight = (imgProps.height * contentWidth) / imgProps.width;
        
        const maxContentHeight = pdfHeight - headerHeight - 15; 
        
        // Fit logic: If image is too tall, scale it down to fit page
        let finalImgHeight = pdfImgHeight;
        let finalImgWidth = contentWidth;

        if (pdfImgHeight > maxContentHeight) {
             const ratio = maxContentHeight / pdfImgHeight;
             finalImgHeight = maxContentHeight;
             finalImgWidth = contentWidth * ratio;
        }
        
        pdf.addImage(imgData, 'PNG', margin, headerHeight, finalImgWidth, finalImgHeight);

        // --- FOOTER (BRANDING) ---
        const footerY = pdfHeight - 7;
        pdf.setFontSize(8);
        pdf.setTextColor(100, 100, 100);
        pdf.text("CHRONOS AI - 2025", margin, footerY);

        pdf.save(`Cronoprogramma_${(projectName || 'progetto').replace(/[^a-z0-9]/gi, '_')}.pdf`);

    } catch (error) {
        console.error("PDF Generation Error:", error);
        alert("Errore durante la generazione del PDF.");
    } finally {
        setIsExporting(false);
    }
  };

  const ZoomControl = () => (
    <div className="flex space-x-1 bg-gray-200 dark:bg-gray-700 p-1 rounded-lg">
      {(['day', 'week', 'month'] as ZoomLevel[]).map(level => (
        <button
          key={level}
          onClick={() => setZoom(level)}
          className={`px-3 py-1 text-sm font-medium rounded-md capitalize transition-colors ${
            zoom === level 
            ? 'bg-white dark:bg-gray-900 text-indigo-600 dark:text-indigo-400 shadow' 
            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
          }`}
        >
          {level === 'day' ? 'Giorno' : level === 'week' ? 'Settimana' : 'Mese'}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <div className="p-4 md:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Timeline Progetto</h2>
            <ZoomControl />
             <button onClick={onToggleEconomicView} title="Mostra/Nascondi Piano Economico e Riepilogo WBS" className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg transition-colors text-sm font-medium ${isEconomicViewVisible ? 'bg-yellow-300 text-yellow-800' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-yellow-200'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.657a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 14.95a1 1 0 001.414 1.414l.707-.707a1 1 0 00-1.414-1.414l-.707.707zM10 18a1 1 0 01-1-1v-1a1 1 0 112 0v1a1 1 0 01-1 1zM4.343 5.657a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM2 10a1 1 0 01-1-1h-1a1 1 0 110-2h1a1 1 0 011 1zM14.95 14.95a1 1 0 00-1.414 1.414l.707.707a1 1 0 001.414-1.414l-.707-.707z" /><path d="M10 7a3 3 0 100 6 3 3 0 000-6z" /></svg>
                <span>Spese</span>
            </button>
            <button 
                onClick={handleExportPdf}
                disabled={isExporting}
                className="flex items-center space-x-2 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:bg-indigo-400"
                title="Stampa Cronoprogramma in PDF (A4 Orizzontale)"
            >
                {isExporting ? (
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clipRule="evenodd" /></svg>
                )}
                <span>Stampa PDF</span>
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-right p-3 rounded-lg bg-gray-100 dark:bg-gray-800/50 w-full sm:w-auto">
             <div className="p-2 rounded-md bg-green-50 dark:bg-green-900/40">
                <p className="text-sm font-medium text-green-600 dark:text-green-300">SAL Reale al {format(salDate, 'd MMM', { locale: it })}</p>
                <p className="text-2xl font-bold text-green-800 dark:text-green-100">
                  {currencyFormatter.format(earnedValue)}
                </p>
             </div>
             <div className="p-2 rounded-md bg-indigo-50 dark:bg-indigo-900/40">
                <p className="text-sm font-medium text-indigo-600 dark:text-indigo-300">SAL Teorico al {format(salDate, 'd MMM', { locale: it })}</p>
                <p className="text-2xl font-bold text-indigo-800 dark:text-indigo-100">
                  {currencyFormatter.format(plannedValue)}
                </p>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto overflow-y-auto max-h-[70vh] bg-gray-50 dark:bg-gray-800/50 rounded-lg relative" ref={chartContainerRef}>
          <div 
            className="relative" 
            style={{ width: totalWidth, minHeight: workGroups.length * ROW_HEIGHT + HEADER_HEIGHT }}
            onDoubleClick={handleGridDoubleClick}
          >
             <div className="sticky top-0 z-20 h-[70px]">
              {zoom === 'day' || zoom === 'week' ? (
                <>
                  <div className="absolute top-0 left-0 right-0 flex bg-gray-100 dark:bg-gray-700 select-none h-[30px] border-b border-gray-200 dark:border-gray-600">
                    {monthHeaderIntervals.map(({ name, count }) => (
                      <div
                        key={name}
                        className="flex-shrink-0 text-center font-bold text-gray-800 dark:text-gray-200 flex items-center justify-center border-r border-gray-200 dark:border-gray-600 capitalize"
                        style={{ width: count * UNIT_CONFIG[zoom].width }}
                      >
                        {name}
                      </div>
                    ))}
                  </div>
                  <div className="absolute top-[30px] left-0 right-0 flex bg-gray-100 dark:bg-gray-700 select-none h-[40px]">
                    {headerIntervals.map((date, i) => (
                      <div key={i} className="flex-shrink-0 text-center border-r border-gray-200 dark:border-gray-600 pt-1" style={{ width: UNIT_CONFIG[zoom].width }}>
                        {UNIT_CONFIG[zoom].subLabelFormat && <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{format(date, UNIT_CONFIG[zoom].subLabelFormat, { locale: it })}</div>}
                        <div className="text-sm font-bold text-gray-700 dark:text-gray-200">{format(date, UNIT_CONFIG[zoom].labelFormat, { locale: it })}</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="absolute top-0 left-0 right-0 flex bg-gray-100 dark:bg-gray-700 select-none h-full">
                  {headerIntervals.map((date, i) => (
                    <div key={i} className="flex-shrink-0 text-center border-r border-gray-200 dark:border-gray-600 flex items-center justify-center" style={{ width: UNIT_CONFIG[zoom].width }}>
                      <div className="text-sm font-bold text-gray-700 dark:text-gray-200 capitalize">{format(date, UNIT_CONFIG[zoom].labelFormat, { locale: it })}</div>
                    </div>
                  ))}
                </div>
              )}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-red-500 cursor-ew-resize z-30 sal-line"
                style={{ left: salLineX }}
                onMouseDown={handleSalMouseDown}
              >
                <div className="absolute top-[70px] -translate-y-1/2 -ml-3 w-6 h-5 rounded-b-md bg-red-500/70 flex items-center justify-center text-white cursor-ew-resize select-none shadow-lg">
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                     <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                   </svg>
                </div>
              </div>
            </div>
            <svg className="absolute top-0 left-0 w-full h-full pointer-events-none" style={{ top: HEADER_HEIGHT }}>
              {dependencies.map(dep => {
                const fromPos = taskPositions.current.get(dep.from);
                const toPos = taskPositions.current.get(dep.to);
                if (!fromPos || !toPos) return null;
                
                const fromY = fromPos.y + (ROW_HEIGHT / 2);
                const toY = toPos.y + (ROW_HEIGHT / 2);

                const fromX = fromPos.x + (dep.type.startsWith('S') ? 0 : fromPos.width);
                const toX = toPos.x + (dep.type.endsWith('S') ? 0 : toPos.width);

                const path = `M ${fromX} ${fromY} L ${fromX + 10} ${fromY} L ${fromX + 10} ${toY} L ${toX - 10} ${toY} L ${toX} ${toY}`;

                return (
                  <g key={dep.id}>
                    <path d={path} stroke="#4f46e5" strokeWidth="2" fill="none" />
                    <path d={`M ${toX - 5} ${toY - 4} L ${toX} ${toY} L ${toX - 5} ${toY + 4}`} stroke="#4f46e5" strokeWidth="2" fill="none" />
                  </g>
                );
              })}
              {linkingState && (
                <path
                  d={`M ${linkingState.fromSide === 'start' ? taskPositions.current.get(linkingState.fromId)!.x : taskPositions.current.get(linkingState.fromId)!.x + taskPositions.current.get(linkingState.fromId)!.width} ${taskPositions.current.get(linkingState.fromId)!.y + ROW_HEIGHT/2} L ${linkingState.x} ${linkingState.y}`}
                  stroke="#3b82f6"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                  fill="none"
                />
              )}
            </svg>
            <div className="absolute top-[70px] left-0 w-full h-full">
              {headerIntervals.map((_, i) => (
                <div key={i} className="absolute top-0 bottom-0 border-r border-gray-200 dark:border-gray-700" style={{ left: i * UNIT_CONFIG[zoom].width, width: UNIT_CONFIG[zoom].width }}></div>
              ))}
               {workGroups.map((_, i) => (
                <div key={i} className="absolute left-0 right-0 border-b border-gray-200 dark:border-gray-700" style={{ top: (i + 1) * ROW_HEIGHT }}></div>
               ))}
            </div>
            <div className="relative pt-2 pb-4">
              {workGroups.map((group, index) => {
                const groupStart = parse(group.startDate, 'yyyy-MM-dd', new Date());
                const left = differenceInDays(groupStart, chartStart) * dayPixelWidth;
                const width = group.duration * dayPixelWidth;
                taskPositions.current.set(group.id, { y: index * ROW_HEIGHT, x: left, width });
                const hasMeasurements = group.items.some(item => item.measurements && item.measurements.length > 0);
                const progressWidth = width * (group.progress || 0) / 100;
                const isLockedForMove = hasMeasurements || group.officialStartDate;
                const groupEarnedValue = group.value * (group.progress || 0) / 100;
                
                const groupContainerStyle = { 
                  left, 
                  width, 
                  top: index * ROW_HEIGHT,
                  height: ROW_HEIGHT,
                };
                
                return (
                  <div key={group.id} className="absolute" style={{top: index * ROW_HEIGHT, height: ROW_HEIGHT, left:0, width:'100%'}}>
                      {/* Green Line for Expenses - Only if Economic View is Visible. CENTERED. */}
                      {isEconomicViewVisible && (
                          <div className="absolute top-1/2 left-0 right-0 h-px border-t border-green-400/60 dark:border-green-500/60 border-dashed z-20 pointer-events-none w-full transform -translate-y-1/2" />
                      )}

                    <div
                      className={`absolute ${BAR_HEIGHT_CLASS} flex items-center my-2 group/task`}
                      style={{ left, width }}
                      onDoubleClick={() => onBarDoubleClick(group)}
                      onMouseMove={(e) => handleBarMouseMove(e, group)}
                      onMouseLeave={handleBarMouseLeave}
                    >
                      <div
                        className={`relative inset-0 flex items-center justify-start rounded-lg shadow-md ${!isViewOnly ? (isLockedForMove ? 'cursor-default' : 'hover:opacity-90 transition-opacity cursor-move') : ''} overflow-hidden w-full h-full z-10 wbs-visual-bar`}
                        style={{ backgroundColor: group.color }}
                        onMouseDown={(e) => handleTaskMouseDown(e, group.id, 'move')}
                      >
                          <div
                              className="absolute left-0 top-0 h-full bg-black/30 rounded-l-lg"
                              style={{ width: `${group.progress || 0}%` }}
                          >
                          </div>
                          {progressWidth > 40 && (
                              <div
                                  className="absolute top-1/2 -translate-y-1/2 text-white font-bold text-xs pointer-events-none select-none z-10"
                                  style={{ left: Math.max(5, progressWidth - 38) }}
                              >
                                  {(group.progress || 0).toFixed(1)}%
                              </div>
                          )}
                      </div>
                      
                      {!isViewOnly && (
                        <>
                          <div 
                              className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-white dark:bg-gray-300 border-2 border-indigo-500 rounded-full cursor-pointer opacity-0 group-hover/task:opacity-100 transition-opacity z-20"
                              data-taskid={group.id}
                              data-side="start"
                              onMouseDown={(e) => handleDependencyMouseDown(e, group.id, 'start')}
                           />
                           <div 
                              className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-white dark:bg-gray-300 border-2 border-indigo-500 rounded-full cursor-pointer opacity-0 group-hover/task:opacity-100 transition-opacity z-20"
                              data-taskid={group.id}
                              data-side="end"
                              onMouseDown={(e) => handleDependencyMouseDown(e, group.id, 'end')}
                           />
                        </>
                      )}

                      <div className="absolute left-full ml-2 flex items-center h-full whitespace-nowrap z-50 pointer-events-none label-container">
                          <div className="bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm shadow-sm px-2 py-1 rounded-md text-xs z-50 relative">
                              <p className="font-bold text-gray-900 dark:text-gray-100 truncate max-w-[250px]">
                                  {group.name}
                                  <span className="ml-2 font-medium text-indigo-700 dark:text-indigo-400 pdf-hide-value">{(group.progress || 0).toFixed(1)}%</span>
                              </p>
                              <p className="text-gray-700 dark:text-gray-300 leading-tight pdf-hide-value">{currencyFormatter.format(groupEarnedValue)}</p>
                          </div>
                      </div>
                      {!isViewOnly && (
                        <div
                          style={{ backgroundColor: group.color }}
                          className="absolute top-0 right-0 w-4 h-full filter brightness-90 hover:brightness-75 z-20 transition-all flex items-center justify-center rounded-r-lg cursor-ew-resize"
                          onMouseDown={(e) => handleTaskMouseDown(e, group.id, 'resize-end')}
                        >
                           <div className="space-y-1">
                              <div className="h-1 w-1 bg-white/50 rounded-full"></div>
                              <div className="h-1 w-1 bg-white/50 rounded-full"></div>
                              <div className="h-1 w-1 bg-white/50 rounded-full"></div>
                          </div>
                        </div>
                      )}
                    </div>

                    {isEconomicViewVisible && (
                        <>
                        {/* Expenses Icons (Centered on the row, overlapping WBS) */}
                        <div className="absolute top-1/2 w-full h-6 flex items-center pointer-events-none z-30 transform -translate-y-1/2">
                            {Array.from(groupedExpensesByDateAndGroup.entries())
                                .filter(([key]) => key.startsWith(group.id))
                                .map(([key, expenseGroup]) => {
                                    const expenseDate = parseISO(expenseGroup[0].date);
                                    const expenseOffsetDays = differenceInDays(expenseDate, chartStart);
                                    const expenseLeft = expenseOffsetDays * dayPixelWidth; // Relative to chart start, not group start, as parent is full width

                                    return (
                                        <div 
                                            key={key} 
                                            className="absolute w-6 h-6 flex items-center justify-center z-30 pointer-events-auto transform -translate-x-1/2"
                                            style={{ left: expenseLeft }}
                                        >
                                            {expenseGroup.length === 1 ? (
                                                <div
                                                    className="cursor-pointer text-gray-500 bg-white dark:bg-gray-800 rounded-full p-0.5 shadow-sm border border-gray-100 dark:border-gray-700 opacity-100 hover:text-gray-800 dark:hover:text-gray-200 hover:scale-110 transition-all"
                                                    onMouseEnter={e => handleExpenseMouseEnter(e, expenseGroup[0])}
                                                    onMouseLeave={handleExpenseMouseLeave}
                                                >
                                                    {getExpenseSvgIcon(expenseGroup[0].category, "w-4 h-4")}
                                                </div>
                                            ) : (
                                                <div
                                                    className="cursor-pointer text-indigo-500 bg-white dark:bg-gray-800 rounded-full p-0.5 shadow-sm border border-gray-100 dark:border-gray-700 opacity-100 hover:text-indigo-600 dark:hover:text-indigo-400 hover:scale-110 transition-all"
                                                    onMouseEnter={e => handleExpenseClusterMouseEnter(e, expenseGroup)}
                                                    onMouseLeave={handleExpenseClusterMouseLeave}
                                                >
                                                    {getExpenseClusterIcon(expenseGroup.length)}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            }
                        </div>
                        
                        {/* Supply Icons (Draggable, Centered on the row) */}
                        <div className="absolute top-1/2 w-full h-6 flex items-center pointer-events-none z-40 transform -translate-y-1/2">
                           {expenses
                             .filter(e => e.relatedWorkGroupId === group.id && e.expectedSupplyDate)
                             .map(expense => {
                                 const supplyDate = parseISO(expense.expectedSupplyDate!);
                                 const supplyOffsetDays = differenceInDays(supplyDate, chartStart);
                                 const staticLeft = supplyOffsetDays * dayPixelWidth;

                                 const isDragging = supplyDragging?.expenseId === expense.id;
                                 const displayLeft = isDragging && currentSupplyX !== null ? currentSupplyX : staticLeft;

                                 return (
                                     <div
                                        key={`supply-${expense.id}`}
                                        className={`absolute w-7 h-7 flex items-center justify-center z-40 pointer-events-auto cursor-ew-resize transform -translate-x-1/2 transition-transform ${isDragging ? 'scale-125' : 'hover:scale-125'}`}
                                        style={{ left: displayLeft }}
                                        onMouseDown={(e) => handleSupplyMouseDown(e, expense.id, expense.expectedSupplyDate!, staticLeft)}
                                        onMouseEnter={e => handleExpenseMouseEnter(e, expense, true)}
                                        onMouseLeave={handleExpenseMouseLeave}
                                     >
                                        <div className="bg-white dark:bg-gray-800 rounded-full p-1 shadow-sm border border-gray-100 dark:border-gray-700">
                                            <TruckIcon dragging={isDragging} />
                                        </div>
                                     </div>
                                 )
                             })
                           }
                        </div>
                        </>
                    )}
                  </div>
                );
              })}
            </div>
             <div
              className="absolute top-[70px] bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none sal-line"
              style={{ left: salLineX }}
            />
          </div>
        </div>
      </div>
       {tooltipData && (
        <div
          className="fixed z-50 p-3 bg-white dark:bg-gray-900/90 backdrop-blur-sm text-sm rounded-lg shadow-2xl pointer-events-none border border-gray-200 dark:border-gray-700"
          style={{
            left: tooltipData.x + 20,
            top: tooltipData.y + 20,
            transform: 'translate(-50%, 0)',
            minWidth: '240px',
          }}
        >
          <div className="absolute top-2 right-3 text-xl font-bold text-gray-800 dark:text-gray-100 opacity-90">
            {(tooltipData.group.progress || 0).toFixed(1)}%
          </div>
          <h4 className="font-bold text-gray-900 dark:text-white mb-2 pr-16">{tooltipData.group.name}</h4>
          <div className="text-gray-600 dark:text-gray-300 space-y-1">
            <p><strong>Inizio:</strong> {format(parse(tooltipData.group.startDate, 'yyyy-MM-dd', new Date()), 'd MMM yyyy', {locale: it})}</p>
            <p><strong>Fine:</strong> {format(parse(tooltipData.group.endDate, 'yyyy-MM-dd', new Date()), 'd MMM yyyy', {locale: it})}</p>
            <p><strong>Durata:</strong> {tooltipData.group.duration} giorni</p>
             <div className="pt-1 mt-1 border-t border-gray-200 dark:border-gray-700" />
            <p><strong>Valore Progetto:</strong> {currencyFormatter.format(tooltipData.group.value)}</p>
            <p><strong>Avanzamento (SAL):</strong> {currencyFormatter.format(tooltipData.group.value * ((tooltipData.group.progress || 0) / 100))}</p>
            {isEconomicViewVisible && (
              <>
                <p><strong>Costi Sostenuti:</strong> {currencyFormatter.format(tooltipData.totalCost)}</p>
                <p><strong>Margine:</strong> <span className={tooltipData.margin >= 0 ? 'font-bold text-green-600 dark:text-green-400' : 'font-bold text-red-500 dark:text-red-400'}>{currencyFormatter.format(tooltipData.margin)}</span></p>
              </>
            )}
          </div>
        </div>
      )}
       {expenseTooltipData && (
        <div
          className="fixed z-50 p-3 bg-white dark:bg-gray-900/90 backdrop-blur-sm rounded-lg shadow-2xl pointer-events-none border border-gray-200 dark:border-gray-700 w-64"
          style={{
            left: expenseTooltipData.x + 15,
            top: expenseTooltipData.y + 15,
          }}
        >
            <div className="flex items-center mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                {expenseTooltipData.isSupply ? (
                   <>
                      <div className="text-orange-500 mr-2"><TruckIcon /></div>
                      <h5 className="font-bold text-gray-800 dark:text-white">Prevista Fornitura</h5>
                   </>
                ) : (
                    <>
                      <div className="text-gray-600 dark:text-gray-300 mr-2">{getExpenseSvgIcon(expenseTooltipData.expense.category, "w-6 h-6")}</div>
                      <h5 className="font-bold text-gray-800 dark:text-white">{expenseTooltipData.expense.category}</h5>
                    </>
                )}
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-1 truncate" title={expenseTooltipData.expense.description}>
                {expenseTooltipData.expense.description}
            </p>
            <div className="flex justify-between items-baseline">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                {format(parseISO(expenseTooltipData.isSupply && expenseTooltipData.expense.expectedSupplyDate ? expenseTooltipData.expense.expectedSupplyDate : expenseTooltipData.expense.date), 'dd MMM yyyy', { locale: it })}
                </p>
                {!expenseTooltipData.isSupply && (
                  <p className="font-bold text-lg text-gray-900 dark:text-white">
                  {currencyFormatter.format(expenseTooltipData.expense.amount)}
                  </p>
                )}
            </div>
            {expenseTooltipData.isSupply && (
                 <p className="text-[10px] text-gray-400 mt-1 italic text-center">Trascina per spostare</p>
            )}
        </div>
      )}
      {expenseClusterTooltipData && (
        <div
          className="fixed z-50 p-3 bg-white dark:bg-gray-900/90 backdrop-blur-sm rounded-lg shadow-2xl pointer-events-none border border-gray-200 dark:border-gray-700 w-72"
          style={{
            left: expenseClusterTooltipData.x + 15,
            top: expenseClusterTooltipData.y + 15,
          }}
        >
          <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
            <h5 className="font-bold text-gray-800 dark:text-white">Spese Multiple</h5>
            <span className="text-xs text-gray-500 dark:text-gray-400">{format(parseISO(expenseClusterTooltipData.date), 'dd MMM yyyy', { locale: it })}</span>
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto pr-2 -mr-2">
            {expenseClusterTooltipData.expenses.map(exp => (
              <div key={exp.id} className="flex items-start space-x-2 text-sm">
                <div className="flex-shrink-0 text-gray-500 dark:text-gray-400 pt-0.5">{getExpenseSvgIcon(exp.category, "w-4 h-4")}</div>
                <div className="flex-grow">
                  <p className="text-gray-700 dark:text-gray-300 leading-tight">{exp.description}</p>
                  <p className="font-semibold text-gray-800 dark:text-gray-200 text-right">{currencyFormatter.format(exp.amount)}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between items-baseline mt-3 pt-2 border-t border-gray-200 dark:border-gray-700">
            <span className="font-bold text-gray-800 dark:text-white">Totale</span>
            <span className="font-bold text-lg text-gray-900 dark:text-white">
              {currencyFormatter.format(expenseClusterTooltipData.expenses.reduce((sum, exp) => sum + exp.amount, 0))}
            </span>
          </div>
        </div>
      )}
    </>
  );
};

export default GanttChart;
