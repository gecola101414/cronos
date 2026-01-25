import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Expense, WorkGroup, expenseCategories, ExpenseCategory } from '../types';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay, isWithinInterval, isValid, startOfDay, endOfDay } from 'date-fns';
import { it } from 'date-fns/locale/it';

interface CostsViewProps {
  expenses: Expense[];
  workGroups: WorkGroup[];
  onAddExpense: (expense: Omit<Expense, 'id' | 'insertionDate'>) => void;
  onUpdateExpense: (expense: Expense) => void;
  onDeleteExpense: (id: string) => void;
  isViewOnly: boolean;
  earnedValue: number;
}

const currencyFormatter = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

const emptyExpense: Omit<Expense, 'id' | 'insertionDate'> = {
  date: format(new Date(), 'yyyy-MM-dd'),
  description: '',
  category: 'Materiali',
  amount: 0,
  relatedWorkGroupId: '',
  invoiceNumber: '',
  expectedSupplyDate: ''
};

const initialFilters = {
    description: '',
    category: '',
    relatedWorkGroupId: '',
    dateFrom: '',
    dateTo: '',
    insertionDateFrom: '',
    insertionDateTo: '',
    amountMin: '',
    amountMax: ''
};

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

// ... (Rest of Popover components remain unchanged - TextFilterPopover, SelectFilterPopover, DateRangePopover, AmountRangePopover, DashboardCard, getCategoryColor)

const TextFilterPopover: React.FC<{
    onClose: () => void;
    onApply: (value: string) => void;
    initialValue: string;
}> = ({ onClose, onApply, initialValue }) => {
    const popoverRef = useRef<HTMLDivElement>(null);
    const [value, setValue] = useState(initialValue);
    useOnClickOutside(popoverRef, onClose);

    const handleApply = () => {
        onApply(value);
        onClose();
    };

    const handleClear = () => {
        setValue('');
        onApply('');
        onClose();
    };

    return (
        <div ref={popoverRef} className="absolute top-full mt-2 z-20 bg-white dark:bg-gray-800 shadow-lg rounded-md border border-gray-200 dark:border-gray-700 p-3 w-60">
            <input 
                type="text" 
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder="Cerca..."
                className="w-full p-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md" 
            />
            <div className="flex justify-end space-x-2 mt-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                <button type="button" onClick={handleClear} className="px-3 py-1 text-sm text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-600 rounded-md hover:bg-gray-200 dark:hover:bg-gray-500">Azzera</button>
                <button type="button" onClick={handleApply} className="px-3 py-1 text-sm text-white bg-indigo-600 rounded-md hover:bg-indigo-700">Applica</button>
            </div>
        </div>
    );
};

const SelectFilterPopover: React.FC<{
    onClose: () => void;
    onApply: (value: string) => void;
    initialValue: string;
    options: { value: string; label: string }[];
}> = ({ onClose, onApply, initialValue, options }) => {
    const popoverRef = useRef<HTMLDivElement>(null);
    const [value, setValue] = useState(initialValue);
    useOnClickOutside(popoverRef, onClose);

    const handleApply = () => {
        onApply(value);
        onClose();
    };
    
    const handleClear = () => {
        setValue('');
        onApply('');
        onClose();
    };

    return (
         <div ref={popoverRef} className="absolute top-full mt-2 z-20 bg-white dark:bg-gray-800 shadow-lg rounded-md border border-gray-200 dark:border-gray-700 p-3 w-64">
            <select value={value} onChange={e => setValue(e.target.value)} className="w-full p-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md">
                {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <div className="flex justify-end space-x-2 mt-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                <button type="button" onClick={handleClear} className="px-3 py-1 text-sm text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-600 rounded-md hover:bg-gray-200 dark:hover:bg-gray-500">Azzera</button>
                <button type="button" onClick={handleApply} className="px-3 py-1 text-sm text-white bg-indigo-600 rounded-md hover:bg-indigo-700">Applica</button>
            </div>
        </div>
    );
};

const DateRangePopover: React.FC<{
    onClose: () => void;
    onApply: (range: { from: string, to: string }) => void;
    initialRange: { from: string, to: string };
}> = ({ onClose, onApply, initialRange }) => {
    const popoverRef = useRef<HTMLDivElement>(null);
    const [startDate, setStartDate] = useState<Date | null>(initialRange.from ? parseISO(initialRange.from) : null);
    const [endDate, setEndDate] = useState<Date | null>(initialRange.to ? parseISO(initialRange.to) : null);
    const [hoverDate, setHoverDate] = useState<Date | null>(null);
    const [currentMonth, setCurrentMonth] = useState(initialRange.from ? parseISO(initialRange.from) : new Date());

    useOnClickOutside(popoverRef, onClose);

    const handleDateClick = (day: Date) => {
        if (!startDate || (startDate && endDate)) {
            setStartDate(day);
            setEndDate(null);
        } else if (startDate && !endDate) {
            if (day < startDate) {
                setEndDate(startDate);
                setStartDate(day);
            } else {
                setEndDate(day);
            }
        }
    };

    const handleApply = () => {
        if (startDate === null) {
            const from = format(startOfMonth(currentMonth), 'yyyy-MM-dd');
            const to = format(endOfMonth(currentMonth), 'yyyy-MM-dd');
            onApply({ from, to });
        } else {
            onApply({
                from: startDate ? format(startDate, 'yyyy-MM-dd') : '',
                to: endDate ? format(endDate, 'yyyy-MM-dd') : (startDate ? format(startDate, 'yyyy-MM-dd') : ''),
            });
        }
        onClose();
    };
    
    const handleClear = () => {
        setStartDate(null);
        setEndDate(null);
        onApply({ from: '', to: '' });
        onClose();
    }

    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const startingDayIndex = getDay(monthStart) === 0 ? 6 : getDay(monthStart) - 1;

    return (
        <div ref={popoverRef} className="absolute top-full mt-2 z-20 bg-white dark:bg-gray-800 shadow-lg rounded-md border border-gray-200 dark:border-gray-700 p-4 w-80">
            <div className="flex items-center justify-between mb-2">
                <button type="button" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">&lt;</button>
                <span className="font-semibold capitalize">{format(currentMonth, 'MMMM yyyy', { locale: it })}</span>
                <button type="button" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">&gt;</button>
            </div>
            <div className="grid grid-cols-7 text-center text-xs text-gray-500 dark:text-gray-400 mb-1">
                {['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'].map(d => <div key={d}>{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
                {Array.from({ length: startingDayIndex }).map((_, i) => <div key={`empty-${i}`}></div>)}
                {days.map(day => {
                    const isSelectedStart = startDate && isSameDay(day, startDate);
                    const isSelectedEnd = endDate && isSameDay(day, endDate);
                    const isInRange = startDate && endDate && isWithinInterval(day, { start: startDate, end: endDate });
                    const isHoveringInRange = startDate && !endDate && hoverDate && isWithinInterval(day, { start: startDate, end: hoverDate });

                    return (
                        <button
                            type="button"
                            key={day.toString()}
                            onClick={() => handleDateClick(day)}
                            onMouseEnter={() => setHoverDate(day)}
                            onMouseLeave={() => setHoverDate(null)}
                            className={`p-1 text-center rounded-full text-sm ${
                                isSelectedStart || isSelectedEnd ? 'bg-indigo-600 text-white font-bold' :
                                isInRange || isHoveringInRange ? 'bg-indigo-100 dark:bg-indigo-900/50' :
                                'hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                        >
                            {format(day, 'd')}
                        </button>
                    )
                })}
            </div>
            <div className="flex justify-end space-x-2 mt-4 pt-2 border-t border-gray-200 dark:border-gray-700">
                <button type="button" onClick={handleClear} className="px-3 py-1 text-sm text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-600 rounded-md hover:bg-gray-200 dark:hover:bg-gray-500">Azzera</button>
                <button type="button" onClick={handleApply} className="px-3 py-1 text-sm text-white bg-indigo-600 rounded-md hover:bg-indigo-700">Applica</button>
            </div>
        </div>
    );
};

const AmountRangePopover: React.FC<{
    onClose: () => void;
    onApply: (range: { min: string, max: string }) => void;
    initialRange: { min: string, max: string };
}> = ({ onClose, onApply, initialRange }) => {
    const popoverRef = useRef<HTMLDivElement>(null);
    const [min, setMin] = useState(initialRange.min);
    const [max, setMax] = useState(initialRange.max);
    
    useOnClickOutside(popoverRef, onClose);

    const handleApply = () => {
        onApply({ min, max });
        onClose();
    };
    
    const handleClear = () => {
        setMin('');
        setMax('');
        onApply({ min: '', max: '' });
        onClose();
    };

    return (
        <div ref={popoverRef} className="absolute top-full mt-2 z-20 bg-white dark:bg-gray-800 shadow-lg rounded-md border border-gray-200 dark:border-gray-700 p-4 w-60">
            <div className="space-y-2">
                <div>
                    <label className="text-xs text-gray-500">Minimo</label>
                    <input type="number" value={min} onChange={e => setMin(e.target.value)} placeholder="€ 0.00" className="w-full p-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md" />
                </div>
                 <div>
                    <label className="text-xs text-gray-500">Massimo</label>
                    <input type="number" value={max} onChange={e => setMax(e.target.value)} placeholder="€ 1,000.00" className="w-full p-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md" />
                </div>
            </div>
            <div className="flex justify-end space-x-2 mt-4 pt-2 border-t border-gray-200 dark:border-gray-700">
                <button type="button" onClick={handleClear} className="px-3 py-1 text-sm text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-600 rounded-md hover:bg-gray-200 dark:hover:bg-gray-500">Azzera</button>
                <button type="button" onClick={handleApply} className="px-3 py-1 text-sm text-white bg-indigo-600 rounded-md hover:bg-indigo-700">Applica</button>
            </div>
        </div>
    );
}

const DashboardCard: React.FC<{ title: string; value: string; color: string; icon: React.ReactNode }> = ({ title, value, color, icon }) => (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md flex items-center space-x-4">
        <div className={`p-3 rounded-full ${color}`}>
            {icon}
        </div>
        <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
        </div>
    </div>
);

const getCategoryColor = (category: ExpenseCategory) => {
    switch (category) {
        case 'Personale': return 'bg-blue-500';
        case 'Materiali': return 'bg-green-500';
        case 'Noleggi': return 'bg-yellow-500';
        case 'Subappalti': return 'bg-purple-500';
        case 'Spese Generali': return 'bg-gray-500';
        default: return 'bg-gray-400';
    }
};

const CostsView: React.FC<CostsViewProps> = ({ expenses, workGroups, onAddExpense, onUpdateExpense, onDeleteExpense, isViewOnly, earnedValue }) => {
    const [isFormVisible, setIsFormVisible] = useState(false);
    const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
    const [formData, setFormData] = useState<Partial<Expense>>(emptyExpense);
    const [filters, setFilters] = useState(initialFilters);
    const [activePopover, setActivePopover] = useState<string | null>(null);
    const [donutFilterCategory, setDonutFilterCategory] = useState<ExpenseCategory | null>(null);
    const [donutTooltip, setDonutTooltip] = useState<{ x: number; y: number; category: ExpenseCategory; value: number; percentage: number; } | null>(null);

    const handleDonutClick = (category: ExpenseCategory) => {
        if (isViewOnly) return;
        
        const newCategoryFilter = donutFilterCategory === category ? null : category;
        setDonutFilterCategory(newCategoryFilter);
        
        // Clear the popover filter to avoid confusion
        if (newCategoryFilter && filters.category) {
            setFilters(prev => ({...prev, category: ''}));
        }
    };
    
    const filteredExpenses = useMemo(() => {
        const dateFilterFrom = filters.dateFrom && isValid(parseISO(filters.dateFrom)) ? startOfDay(parseISO(filters.dateFrom)) : null;
        const dateFilterTo = filters.dateTo && isValid(parseISO(filters.dateTo)) ? endOfDay(parseISO(filters.dateTo)) : null;
        const insertionDateFilterFrom = filters.insertionDateFrom && isValid(parseISO(filters.insertionDateFrom)) ? startOfDay(parseISO(filters.insertionDateFrom)) : null;
        const insertionDateFilterTo = filters.insertionDateTo && isValid(parseISO(filters.insertionDateTo)) ? endOfDay(parseISO(filters.insertionDateTo)) : null;

        return expenses.filter(expense => {
            if (donutFilterCategory) {
                if(expense.category !== donutFilterCategory) return false;
            } else {
                if (filters.category && expense.category !== filters.category) return false;
            }

            if (filters.description && !expense.description.toLowerCase().includes(filters.description.toLowerCase())) return false;
            if (filters.relatedWorkGroupId && expense.relatedWorkGroupId !== filters.relatedWorkGroupId) return false;
            
            const expenseDate = parseISO(expense.date);
            if (dateFilterFrom && expenseDate < dateFilterFrom) return false;
            if (dateFilterTo && expenseDate > dateFilterTo) return false;
            
            const expenseInsertionDate = parseISO(expense.insertionDate);
            if (insertionDateFilterFrom && expenseInsertionDate < insertionDateFilterFrom) return false;
            if (insertionDateFilterTo && expenseInsertionDate > insertionDateFilterTo) return false;

            if (filters.amountMin && expense.amount < parseFloat(filters.amountMin)) return false;
            if (filters.amountMax && expense.amount > parseFloat(filters.amountMax)) return false;
            return true;
        });
    }, [expenses, filters, donutFilterCategory]);

    const totalCosts = useMemo(() => filteredExpenses.reduce((sum, e) => sum + e.amount, 0), [filteredExpenses]);
    const profitLoss = earnedValue - totalCosts;

    const costsByCategory = useMemo(() => {
        const source = donutFilterCategory ? filteredExpenses : expenses;
        const breakdown: Record<string, number> = {};
        for (const category of expenseCategories) {
            breakdown[category] = 0;
        }
        source.forEach(e => {
            breakdown[e.category] = (breakdown[e.category] || 0) + e.amount;
        });
        return breakdown;
    }, [expenses, filteredExpenses, donutFilterCategory]);

    const totalCostsForAllExpenses = useMemo(() => expenses.reduce((sum, e) => sum + e.amount, 0), [expenses]);

    const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: name === 'amount' ? parseFloat(value) || 0 : value }));
    };
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.description?.trim() || (formData.amount ?? 0) <= 0) {
            alert('Descrizione e importo sono obbligatori.');
            return;
        }
        if (editingExpense) {
            onUpdateExpense(formData as Expense);
        } else {
            onAddExpense(formData as Omit<Expense, 'id' | 'insertionDate'>);
        }
        setFormData(emptyExpense);
        setEditingExpense(null);
        setIsFormVisible(false);
    };

    const handleEdit = (expense: Expense) => {
        setEditingExpense(expense);
        setFormData(expense);
        setIsFormVisible(true);
        window.scrollTo(0, 0);
    };

    const handleCancelEdit = () => {
        setEditingExpense(null);
        setFormData(emptyExpense);
        setIsFormVisible(false);
    };
    
    const workGroupMap = useMemo(() => {
        const map = new Map<string, string>();
        workGroups.forEach(wg => map.set(wg.id, wg.name));
        return map;
    }, [workGroups]);

    const isFilterActive = (filterName: keyof typeof initialFilters | 'dateRange' | 'insertionDateRange' | 'amountRange') => {
        if (filterName === 'dateRange') return !!filters.dateFrom || !!filters.dateTo;
        if (filterName === 'insertionDateRange') return !!filters.insertionDateFrom || !!filters.insertionDateTo;
        if (filterName === 'amountRange') return !!filters.amountMin || !!filters.amountMax;
        return !!filters[filterName as keyof typeof initialFilters];
    };
    
    const handleHeaderDoubleClick = (filterName: keyof typeof initialFilters | 'dateRange' | 'insertionDateRange' | 'amountRange') => {
       if (filterName === 'dateRange') {
            setFilters(p => ({...p, dateFrom: '', dateTo: ''}));
       } else if (filterName === 'insertionDateRange') {
            setFilters(p => ({...p, insertionDateFrom: '', insertionDateTo: ''}));
       } else if (filterName === 'amountRange') {
            setFilters(p => ({...p, amountMin: '', amountMax: ''}));
       } else {
           setFilters(p => ({...p, [filterName]: ''}));
       }
    }
    
    const categoriesWithCosts = expenseCategories.filter(cat => costsByCategory[cat] > 0);
    const size = 180;
    const strokeWidth = 25;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    let accumulatedAngle = 0;

    const getCategoryStrokeColor = (category: ExpenseCategory) => {
        switch (category) {
            case 'Personale': return 'text-blue-500';
            case 'Materiali': return 'text-green-500';
            case 'Noleggi': return 'text-yellow-500';
            case 'Subappalti': return 'text-purple-500';
            case 'Spese Generali': return 'text-gray-500';
            default: return 'text-gray-400';
        }
    };

    return (
        <div className="p-4 md:p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <DashboardCard title="Costo Totale (Filtrato)" value={currencyFormatter.format(totalCosts)} color="bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v.01" /></svg>} />
                <DashboardCard title="SAL Reale (Valore Prodotto)" value={currencyFormatter.format(earnedValue)} color="bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-300" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>} />
                <DashboardCard title="Profitto/Perdita Stimato" value={currencyFormatter.format(profitLoss)} color={profitLoss >= 0 ? "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300" : "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300"} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>} />
            </div>

            <div>
                 {/* Donut Chart and List code remains same... */}
                  <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-2">Riepilogo Costi per Categoria</h3>
                 {expenses.length === 0 ? (
                    <div className="flex items-center justify-center h-48 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                        <p className="text-gray-500 dark:text-gray-400">Nessuna spesa registrata.</p>
                    </div>
                ) : (
                    <div className="flex flex-col md:flex-row items-center justify-center gap-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                        <div className="relative flex-shrink-0 select-none" style={{ width: size, height: size }}>
                            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                                <circle className="text-gray-200 dark:text-gray-700" cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} />
                                {categoriesWithCosts.map((cat) => {
                                    const percentage = totalCostsForAllExpenses > 0 ? (costsByCategory[cat] / totalCostsForAllExpenses) * 100 : 0;
                                    const segmentLength = (percentage / 100) * circumference;
                                    const rotation = accumulatedAngle;
                                    accumulatedAngle += (percentage / 100) * 360;

                                    return (
                                        <circle
                                            key={cat}
                                            cx={size / 2}
                                            cy={size / 2}
                                            r={radius}
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth={strokeWidth}
                                            strokeDasharray={`${segmentLength} ${circumference}`}
                                            transform={`rotate(${rotation - 90} ${size / 2} ${size / 2})`}
                                            className={`${getCategoryStrokeColor(cat as ExpenseCategory)} cursor-pointer transition-all duration-300 ${donutFilterCategory && donutFilterCategory !== cat ? 'opacity-30' : 'opacity-100'}`}
                                            onDoubleClick={() => handleDonutClick(cat as ExpenseCategory)}
                                            onMouseEnter={(e) => {
                                                setDonutTooltip({
                                                    x: e.clientX,
                                                    y: e.clientY,
                                                    category: cat as ExpenseCategory,
                                                    value: costsByCategory[cat],
                                                    percentage: percentage,
                                                });
                                            }}
                                            onMouseLeave={() => {
                                                setDonutTooltip(null);
                                            }}
                                        />
                                    );
                                })}
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-center cursor-pointer" onClick={() => setDonutFilterCategory(null)}>
                               {donutFilterCategory ? (
                                   <>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">{donutFilterCategory}</span>
                                        <span className="text-2xl font-bold text-gray-800 dark:text-gray-100 leading-tight">
                                            {currencyFormatter.format(costsByCategory[donutFilterCategory])}
                                        </span>
                                   </>
                               ) : (
                                   <>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">Totale Spese</span>
                                        <span className="text-2xl font-bold text-gray-800 dark:text-gray-100 leading-tight">
                                            {currencyFormatter.format(totalCostsForAllExpenses)}
                                        </span>
                                    </>
                               )}
                            </div>
                        </div>
                        <div className="space-y-2 self-center w-full md:w-auto md:max-w-xs select-none">
                            {categoriesWithCosts.map(cat => {
                                const percentage = totalCostsForAllExpenses > 0 ? (costsByCategory[cat] / totalCostsForAllExpenses) * 100 : 0;
                                return (
                                    <div key={cat} onDoubleClick={() => handleDonutClick(cat as ExpenseCategory)} className={`flex items-center justify-between text-sm p-1 rounded-md cursor-pointer transition-all ${donutFilterCategory === cat ? 'bg-indigo-100 dark:bg-indigo-900/50' : ''} ${donutFilterCategory && donutFilterCategory !== cat ? 'opacity-50' : ''}`}>
                                        <div className="flex items-center">
                                            <span className={`w-3 h-3 rounded-full mr-2 ${getCategoryColor(cat as ExpenseCategory)}`}></span>
                                            <span className="text-gray-600 dark:text-gray-300">{cat}</span>
                                        </div>
                                        <div className="text-right ml-4 flex-shrink-0">
                                            <span className="font-semibold text-gray-800 dark:text-gray-100">{currencyFormatter.format(costsByCategory[cat])}</span>
                                            <span className="text-gray-500 dark:text-gray-400 text-xs ml-2">({percentage.toFixed(1)}%)</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                 )}
            </div>
            
            {isFormVisible && !isViewOnly && (
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg animate-fade-in border border-indigo-100 dark:border-indigo-900">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-xl font-bold text-gray-800 dark:text-white flex items-center">
                            {editingExpense ? (
                                <><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg> Modifica Spesa</>
                            ) : (
                                <><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg> Nuova Spesa</>
                            )}
                        </h3>
                        <button onClick={handleCancelEdit} className="text-gray-400 hover:text-gray-600">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                    
                    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                        <div className="space-y-1">
                             <InputField label="Data Pagamento/Acconto" type="date" name="date" value={formData.date || ''} onChange={handleFormChange} />
                        </div>
                        
                        <div className="space-y-1">
                             <InputField label="Data Prevista Fornitura (Opzionale)" type="date" name="expectedSupplyDate" value={formData.expectedSupplyDate || ''} onChange={handleFormChange} />
                             <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">*Apparirà il simbolo camioncino sul Gantt</p>
                        </div>

                        <div className="lg:col-span-2 space-y-1">
                             <InputField label="Descrizione" type="text" name="description" value={formData.description || ''} onChange={handleFormChange} required placeholder="Es. Acconto Fornitura Piastrelle" />
                        </div>

                        <div className="space-y-1">
                             <SelectField label="Categoria" name="category" value={formData.category || 'Materiali'} onChange={handleFormChange} options={expenseCategories.map(c => ({ value: c, label: c }))} />
                        </div>
                        
                        <div className="space-y-1">
                             <InputField label="Importo (€)" type="number" name="amount" value={String(formData.amount || '')} onChange={handleFormChange} required step="0.01" placeholder="0.00" />
                        </div>

                        <div className="space-y-1">
                            <SelectField label="Lavorazione Collegata" name="relatedWorkGroupId" value={formData.relatedWorkGroupId || ''} onChange={handleFormChange} options={[{ value: '', label: 'Nessuna' }, ...workGroups.map(wg => ({ value: wg.id, label: wg.name }))]} />
                        </div>
                         
                        <div className="space-y-1">
                            <InputField label="N. Fattura (Opzionale)" type="text" name="invoiceNumber" value={formData.invoiceNumber || ''} onChange={handleFormChange} />
                        </div>
                        
                        <div className="md:col-span-2 lg:col-span-4 flex justify-end space-x-3 pt-4 border-t border-gray-100 dark:border-gray-700 mt-2">
                            <button type="button" onClick={handleCancelEdit} className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:border-gray-600 dark:hover:bg-gray-600 transition-colors">Annulla</button>
                            <button type="submit" className="px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-md transition-colors">{editingExpense ? 'Salva Modifiche' : 'Salva Spesa'}</button>
                        </div>
                    </form>
                </div>
            )}

            <div className="bg-white dark:bg-gray-800/50 p-4 rounded-lg shadow-md">
                 <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">Elenco Spese</h3>
                    {!isViewOnly && (
                        <button 
                            onClick={() => { setIsFormVisible(prev => !prev); setEditingExpense(null); setFormData(emptyExpense); }} 
                            className={`flex items-center space-x-2 px-4 py-2 text-sm font-medium rounded-md shadow-sm transition-colors ${isFormVisible ? 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                        >
                            {isFormVisible ? ( 
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                    <span>Chiudi</span>
                                </>
                            ) : ( 
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                                    <span>Nuova Spesa</span>
                                </>
                            )}
                        </button>
                    )}
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400 table-auto">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-100 dark:bg-gray-700 dark:text-gray-400 sticky top-0 z-10">
                           <tr>
                                <th scope="col" className="px-2 py-3 w-16">N° Ord.</th>
                                <th scope="col" className="px-2 py-3 w-32 cursor-pointer" onDoubleClick={() => handleHeaderDoubleClick('insertionDateRange')} title="Doppio click per resettare"><div className={`flex items-center space-x-1 relative ${isFilterActive('insertionDateRange') ? 'text-indigo-500 font-bold' : ''}`}><span>Data Ins.</span><button onClick={() => setActivePopover(p => p === 'insertionDate' ? null : 'insertionDate')} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></button>{activePopover === 'insertionDate' && <DateRangePopover onClose={() => setActivePopover(null)} initialRange={{from: filters.insertionDateFrom, to: filters.insertionDateTo}} onApply={range => setFilters(prev => ({...prev, insertionDateFrom: range.from, insertionDateTo: range.to}))} />}</div></th>
                                <th scope="col" className="px-4 py-3 cursor-pointer w-32" onDoubleClick={() => handleHeaderDoubleClick('dateRange')} title="Doppio click per resettare"><div className={`flex items-center space-x-1 relative ${isFilterActive('dateRange') ? 'text-indigo-500 font-bold' : ''}`}><span>Data</span><button onClick={() => setActivePopover(p => p === 'date' ? null : 'date')} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></button>{activePopover === 'date' && <DateRangePopover onClose={() => setActivePopover(null)} initialRange={{from: filters.dateFrom, to: filters.dateTo}} onApply={range => setFilters(prev => ({...prev, dateFrom: range.from, dateTo: range.to}))} />}</div></th>
                                <th scope="col" className="px-4 py-3 cursor-pointer" onDoubleClick={() => handleHeaderDoubleClick('description')} title="Doppio click per resettare"><div className={`flex items-center space-x-1 relative ${isFilterActive('description') ? 'text-indigo-500 font-bold' : ''}`}><span>Descrizione</span><button onClick={() => setActivePopover(p => p === 'description' ? null : 'description')} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg></button>{activePopover === 'description' && <TextFilterPopover onClose={() => setActivePopover(null)} initialValue={filters.description} onApply={value => setFilters(p => ({...p, description: value}))} />}</div></th>
                                <th scope="col" className="px-4 py-3 cursor-pointer w-40" onDoubleClick={() => handleHeaderDoubleClick('category')} title="Doppio click per resettare"><div className={`flex items-center space-x-1 relative ${isFilterActive('category') ? 'text-indigo-500 font-bold' : ''}`}><span>Categoria</span><button onClick={() => setActivePopover(p => p === 'category' ? null : 'category')} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M6 8h12M9 12h6" /></svg></button>{activePopover === 'category' && <SelectFilterPopover onClose={() => setActivePopover(null)} initialValue={filters.category} options={[{value: '', label: 'Tutte'}, ...expenseCategories.map(c => ({value: c, label: c}))]} onApply={value => setFilters(p => ({...p, category: value}))} />}</div></th>
                                <th scope="col" className="px-4 py-3 cursor-pointer w-48" onDoubleClick={() => handleHeaderDoubleClick('relatedWorkGroupId')} title="Doppio click per resettare"><div className={`flex items-center space-x-1 relative ${isFilterActive('relatedWorkGroupId') ? 'text-indigo-500 font-bold' : ''}`}><span>Lavorazione</span><button onClick={() => setActivePopover(p => p === 'workgroup' ? null : 'workgroup')} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg></button>{activePopover === 'workgroup' && <SelectFilterPopover onClose={() => setActivePopover(null)} initialValue={filters.relatedWorkGroupId} options={[{value: '', label: 'Tutte'}, ...workGroups.map(wg => ({value: wg.id, label: wg.name}))]} onApply={value => setFilters(p => ({...p, relatedWorkGroupId: value}))} />}</div></th>
                                <th scope="col" className="px-4 py-3 text-right cursor-pointer w-32" onDoubleClick={() => handleHeaderDoubleClick('amountRange')} title="Doppio click per resettare"><div className={`flex items-center justify-end space-x-1 relative ${isFilterActive('amountRange') ? 'text-indigo-500 font-bold' : ''}`}><span>Importo</span><button onClick={() => setActivePopover(p => p === 'amount' ? null : 'amount')} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg></button>{activePopover === 'amount' && <AmountRangePopover onClose={() => setActivePopover(null)} initialRange={{min: filters.amountMin, max: filters.amountMax}} onApply={range => setFilters(prev => ({...prev, amountMin: range.min, amountMax: range.max}))} />}</div></th>
                                <th scope="col" className="px-4 py-3 w-32 text-center">Prevista Fornitura</th>
                                {!isViewOnly && <th scope="col" className="px-4 py-3 w-16 text-center"><button onClick={() => { setFilters(initialFilters); setDonutFilterCategory(null); }} className="p-1 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200" title="Azzera Tutti i Filtri"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></button></th>}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredExpenses.map((expense) => {
                                const originalIndex = expenses.findIndex(e => e.id === expense.id);
                                const orderNumber = expenses.length - originalIndex;
                                return (
                                <tr key={expense.id} className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600/30">
                                    <td className="px-2 py-2 text-center text-gray-500 dark:text-gray-400">{orderNumber}</td>
                                    <td className="px-2 py-2 text-xs text-center text-gray-500 dark:text-gray-400">{format(parseISO(expense.insertionDate), 'dd/MM/yy HH:mm')}</td>
                                    <td className="px-4 py-2">{format(parseISO(expense.date), 'dd/MM/yyyy', {locale: it})}</td>
                                    <td className="px-4 py-2 font-medium text-gray-900 dark:text-white truncate" title={expense.description}>{expense.description}</td>
                                    <td className="px-4 py-2">{expense.category}</td>
                                    <td className="px-4 py-2 text-xs italic truncate" title={expense.relatedWorkGroupId ? workGroupMap.get(expense.relatedWorkGroupId) : '-'}>{expense.relatedWorkGroupId ? workGroupMap.get(expense.relatedWorkGroupId) : '-'}</td>
                                    <td className="px-4 py-2 text-right font-semibold">{currencyFormatter.format(expense.amount)}</td>
                                    <td className="px-4 py-2 text-center text-xs">
                                        {expense.expectedSupplyDate ? (
                                            <span className="bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 px-2 py-1 rounded-full border border-indigo-200 dark:border-indigo-800">
                                                {format(parseISO(expense.expectedSupplyDate), 'dd/MM/yyyy')} 🚚
                                            </span>
                                        ) : '-'}
                                    </td>
                                    {!isViewOnly && (
                                        <td className="px-4 py-2 flex items-center justify-center space-x-2">
                                            <button onClick={() => handleEdit(expense)} className="text-blue-500 hover:text-blue-700 dark:hover:text-blue-400" title="Modifica"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg></button>
                                            <button onClick={() => window.confirm('Sei sicuro di voler eliminare questa spesa?') && onDeleteExpense(expense.id)} className="text-red-500 hover:text-red-700 dark:hover:text-red-400" title="Elimina"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg></button>
                                        </td>
                                    )}
                                </tr>
                            )})}
                             {filteredExpenses.length === 0 && (
                                <tr>
                                    <td colSpan={isViewOnly ? 8 : 9} className="text-center py-6 text-gray-500 dark:text-gray-400">
                                        Nessuna spesa trovata. Prova a modificare i filtri o ad aggiungerne una nuova.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                         <tfoot>
                            <tr className="font-bold bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white">
                                <td colSpan={6} className="px-4 py-2 text-right">Totale Filtrato</td>
                                <td className="px-4 py-2 text-right">{currencyFormatter.format(totalCosts)}</td>
                                <td colSpan={isViewOnly ? 1 : 2}></td>
                            </tr>
                         </tfoot>
                    </table>
                </div>
            </div>
            {donutTooltip && (
                <div
                    className="fixed z-50 p-3 bg-white dark:bg-gray-900/90 backdrop-blur-sm text-sm rounded-lg shadow-2xl pointer-events-none border border-gray-200 dark:border-gray-700"
                    style={{
                        left: donutTooltip.x + 15,
                        top: donutTooltip.y + 15,
                    }}
                >
                    <div className="flex items-center mb-1">
                        <span className={`w-3 h-3 rounded-full mr-2 ${getCategoryColor(donutTooltip.category)}`}></span>
                        <h5 className="font-bold text-gray-800 dark:text-white">{donutTooltip.category}</h5>
                    </div>
                    <p className="font-semibold text-gray-900 dark:text-white">{currencyFormatter.format(donutTooltip.value)}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">({donutTooltip.percentage.toFixed(1)}% del totale)</p>
                </div>
            )}
        </div>
    );
};

const InputField: React.FC<any> = ({ label, ...props }) => (
    <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
        <input {...props} className="w-full p-2.5 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition-colors" />
    </div>
);

const SelectField: React.FC<any> = ({ label, options, ...props }) => (
    <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
        <select {...props} className="w-full p-2.5 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 transition-colors">
            {options.map((opt: any) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
    </div>
);

export default CostsView;