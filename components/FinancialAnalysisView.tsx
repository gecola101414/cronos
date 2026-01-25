
import React, { useMemo, useState } from 'react';
import { ProjectDocument, Expense } from '../types';
import { format, parseISO, differenceInDays, addDays, startOfMonth, endOfMonth, eachMonthOfInterval, isSameMonth } from 'date-fns';
import { it } from 'date-fns/locale/it';

interface FinancialAnalysisViewProps {
  documents: ProjectDocument[];
  expenses: Expense[];
}

const currencyFormatter = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

const FinancialAnalysisView: React.FC<FinancialAnalysisViewProps> = ({ documents, expenses }) => {
  const [tooltip, setTooltip] = useState<{x: number, y: number, data: any} | null>(null);

  // 1. Calculate Time Range
  const { startDate, endDate, totalDuration } = useMemo(() => {
    const allDates = [
        ...documents.flatMap(d => d.workGroups).flatMap(g => [parseISO(g.startDate), parseISO(g.endDate)]),
        ...expenses.map(e => parseISO(e.date))
    ].filter(d => !isNaN(d.getTime()));

    if (allDates.length === 0) return { startDate: new Date(), endDate: new Date(), totalDuration: 1 };

    const min = new Date(Math.min(...allDates.map(d => d.getTime())));
    const max = new Date(Math.max(...allDates.map(d => d.getTime())));
    // Add buffer
    const start = startOfMonth(min);
    const end = endOfMonth(max);
    
    return { startDate: start, endDate: end, totalDuration: differenceInDays(end, start) };
  }, [documents, expenses]);

  // 2. Generate Data Points (Monthly granularity for smoothness)
  const chartData = useMemo(() => {
    const months = eachMonthOfInterval({ start: startDate, end: endDate });
    const today = new Date();
    let cumPV = 0; // Cumulative Planned Value
    let cumEV = 0; // Cumulative Earned Value
    let cumAC = 0; // Cumulative Actual Cost

    const totalProjectValue = documents.reduce((acc, doc) => acc + doc.totalValue, 0);

    return months.map(monthDate => {
        const monthEnd = endOfMonth(monthDate);
        
        // Calculate PV (Planned Value) - Baseline
        documents.forEach(doc => {
            doc.workGroups.forEach(group => {
                const gStart = parseISO(group.startDate);
                const gEnd = parseISO(group.endDate);
                const gValue = group.value;
                
                if (monthEnd >= gStart) {
                    if (monthEnd >= gEnd) {
                        // Task finished before this month end
                        // We calculate increment only if not already added fully in previous steps
                        // But here we are recalculating cumulatives from scratch for simplicity or summing up daily slices
                        // Simpler approach: Calculate overlapping percentage
                    }
                }
            });
        });

        // Simplified Cumulative Logic: Iterate all tasks/expenses for this snapshot
        let currentMonthPV = 0;
        let currentMonthEV = 0;
        let currentMonthAC = 0;

        // PV Calculation
        documents.forEach(doc => {
            doc.workGroups.forEach(group => {
                const gStart = parseISO(group.startDate);
                const gEnd = parseISO(group.endDate);
                
                // Overlap calculation
                const latest = new Date(Math.min(monthEnd.getTime(), gEnd.getTime()));
                const earliest = new Date(Math.max(gStart.getTime(), startDate.getTime())); // Clip to chart start
                
                if (latest >= gStart) { // If task has started by month end
                     const totalDays = Math.max(1, differenceInDays(gEnd, gStart) + 1);
                     const daysDone = Math.max(0, differenceInDays(latest, gStart) + 1);
                     const percentComplete = Math.min(1, daysDone / totalDays);
                     currentMonthPV += group.value * percentComplete;
                }
            });
        });

        // EV Calculation (Based on Measurements)
        documents.forEach(doc => {
            doc.workGroups.forEach(group => {
                group.items.forEach(item => {
                    if (item.measurements) {
                        item.measurements.forEach(m => {
                            if (parseISO(m.date) <= monthEnd) {
                                currentMonthEV += m.quantity * item.unitPrice;
                            }
                        });
                    }
                });
            });
        });

        // AC Calculation (Expenses)
        expenses.forEach(e => {
            if (parseISO(e.date) <= monthEnd) {
                currentMonthAC += e.amount;
            }
        });

        return {
            date: monthEnd,
            label: format(monthDate, 'MMM yy', { locale: it }),
            pv: currentMonthPV,
            ev: monthEnd <= today ? currentMonthEV : null, // Stop drawing line in future
            ac: monthEnd <= today ? currentMonthAC : null
        };
    });
  }, [documents, expenses, startDate, endDate]);

  // 3. Determine Scales
  const maxMoney = useMemo(() => {
      return Math.max(
          ...chartData.map(d => Math.max(d.pv, d.ev || 0, d.ac || 0))
      ) * 1.1; // 10% buffer
  }, [chartData]);

  // 4. SVG Helpers
  const width = 1000;
  const height = 400;
  const padding = { top: 20, right: 30, bottom: 30, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const getX = (index: number) => padding.left + (index / (chartData.length - 1)) * chartWidth;
  const getY = (value: number) => height - padding.bottom - (value / maxMoney) * chartHeight;

  const makePath = (key: 'pv' | 'ev' | 'ac') => {
      const points = chartData
          .map((d, i) => {
              const val = d[key];
              if (val === null) return null;
              return `${getX(i)},${getY(val)}`;
          })
          .filter(p => p !== null);
      
      if (points.length === 0) return '';
      return `M ${points.join(' L ')}`;
  };

  // 5. KPI Calculation (Current Status)
  const currentStatus = useMemo(() => {
      const lastKnown = chartData.filter(d => d.ev !== null).pop();
      if (!lastKnown) return null;

      const cv = (lastKnown.ev || 0) - (lastKnown.ac || 0); // Cost Variance
      const sv = (lastKnown.ev || 0) - lastKnown.pv; // Schedule Variance
      const cpi = (lastKnown.ac || 0) > 0 ? (lastKnown.ev || 0) / (lastKnown.ac || 0) : 1;
      const spi = lastKnown.pv > 0 ? (lastKnown.ev || 0) / lastKnown.pv : 1;

      return { cv, sv, cpi, spi, date: lastKnown.date };
  }, [chartData]);

  return (
    <div className="p-4 md:p-6 space-y-6">
        {/* Header KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-md border-l-4 border-blue-500">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">Budget Pianificato (PV)</p>
                <p className="text-2xl font-bold text-gray-800 dark:text-white">
                    {chartData.length > 0 ? currencyFormatter.format(chartData[chartData.length-1].pv) : '€ 0'}
                </p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-md border-l-4 border-green-500">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">Valore Prodotto (EV)</p>
                <p className="text-2xl font-bold text-gray-800 dark:text-white">
                    {currentStatus ? currencyFormatter.format(chartData.find(d => d.date === currentStatus.date)?.ev || 0) : '€ 0'}
                </p>
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-md border-l-4 border-red-500">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">Costo Reale (AC)</p>
                <p className="text-2xl font-bold text-gray-800 dark:text-white">
                    {currentStatus ? currencyFormatter.format(chartData.find(d => d.date === currentStatus.date)?.ac || 0) : '€ 0'}
                </p>
            </div>
            {currentStatus && (
                <div className={`bg-white dark:bg-gray-800 p-4 rounded-xl shadow-md border-l-4 ${currentStatus.cpi >= 1 ? 'border-indigo-500' : 'border-orange-500'}`}>
                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">Efficienza (CPI)</p>
                    <div className="flex items-end justify-between">
                        <p className={`text-2xl font-bold ${currentStatus.cpi >= 1 ? 'text-indigo-600' : 'text-orange-600'}`}>
                            {currentStatus.cpi.toFixed(2)}
                        </p>
                        <span className="text-xs text-gray-400">{currentStatus.cpi >= 1 ? 'Sotto Budget' : 'Sopra Budget'}</span>
                    </div>
                </div>
            )}
        </div>

        {/* Main Chart */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-lg">
            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-6">Curve di Analisi Finanziaria (S-Curve)</h3>
            
            <div className="relative w-full overflow-hidden" style={{ paddingTop: '40%' }}>
                <div className="absolute inset-0">
                    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
                        {/* Grid Lines */}
                        {Array.from({ length: 5 }).map((_, i) => {
                            const y = padding.top + (i * chartHeight) / 4;
                            return (
                                <g key={i}>
                                    <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#e5e7eb" strokeDasharray="4 4" />
                                    <text x={padding.left - 10} y={y + 4} textAnchor="end" className="text-[10px] fill-gray-400">
                                        {currencyFormatter.format(maxMoney - (i * maxMoney) / 4)}
                                    </text>
                                </g>
                            )
                        })}

                        {/* X Axis Labels */}
                        {chartData.map((d, i) => {
                            if (i % Math.ceil(chartData.length / 10) !== 0) return null; // Show limited labels
                            return (
                                <text key={i} x={getX(i)} y={height - 5} textAnchor="middle" className="text-[10px] fill-gray-500 uppercase">
                                    {d.label}
                                </text>
                            );
                        })}

                        {/* Paths */}
                        <path d={makePath('pv')} fill="none" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" />
                        {/* Area under PV for visual weight */}
                        <path d={`${makePath('pv')} L ${getX(chartData.length - 1)} ${height - padding.bottom} L ${padding.left} ${height - padding.bottom} Z`} fill="url(#gradientBlue)" opacity="0.1" />

                        <path d={makePath('ac')} fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" />
                        <path d={makePath('ev')} fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" />

                        {/* Data Points & Tooltips */}
                        {chartData.map((d, i) => (
                            <g key={i}>
                                {/* PV Point */}
                                <circle 
                                    cx={getX(i)} cy={getY(d.pv)} r="4" className="fill-blue-500 hover:r-6 transition-all cursor-pointer" 
                                    onMouseEnter={() => setTooltip({x: getX(i), y: getY(d.pv), data: {label: 'Pianificato', val: d.pv, date: d.label}})}
                                    onMouseLeave={() => setTooltip(null)}
                                />
                                
                                {/* EV Point */}
                                {d.ev !== null && (
                                    <circle 
                                        cx={getX(i)} cy={getY(d.ev)} r="4" className="fill-green-500 hover:r-6 transition-all cursor-pointer"
                                        onMouseEnter={() => setTooltip({x: getX(i), y: getY(d.ev!), data: {label: 'Prodotto', val: d.ev, date: d.label}})}
                                        onMouseLeave={() => setTooltip(null)}
                                    />
                                )}

                                {/* AC Point */}
                                {d.ac !== null && (
                                    <circle 
                                        cx={getX(i)} cy={getY(d.ac)} r="4" className="fill-red-500 hover:r-6 transition-all cursor-pointer"
                                        onMouseEnter={() => setTooltip({x: getX(i), y: getY(d.ac!), data: {label: 'Costo', val: d.ac, date: d.label}})}
                                        onMouseLeave={() => setTooltip(null)}
                                    />
                                )}
                            </g>
                        ))}

                        {/* Gradients */}
                        <defs>
                            <linearGradient id="gradientBlue" x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stopColor="#3b82f6" />
                                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                            </linearGradient>
                        </defs>
                    </svg>

                    {/* Tooltip DOM Overlay */}
                    {tooltip && (
                        <div 
                            className="absolute bg-gray-900 text-white text-xs rounded p-2 shadow-lg pointer-events-none transform -translate-x-1/2 -translate-y-full -mt-2 z-10"
                            style={{ left: `${(tooltip.x / width) * 100}%`, top: `${(tooltip.y / height) * 100}%` }}
                        >
                            <p className="font-bold">{tooltip.data.date}</p>
                            <p>{tooltip.data.label}: {currencyFormatter.format(tooltip.data.val)}</p>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex justify-center space-x-6 mt-4">
                <div className="flex items-center">
                    <span className="w-3 h-3 rounded-full bg-blue-500 mr-2"></span>
                    <span className="text-sm text-gray-600 dark:text-gray-300">Pianificato (PV)</span>
                </div>
                <div className="flex items-center">
                    <span className="w-3 h-3 rounded-full bg-green-500 mr-2"></span>
                    <span className="text-sm text-gray-600 dark:text-gray-300">Prodotto (EV)</span>
                </div>
                <div className="flex items-center">
                    <span className="w-3 h-3 rounded-full bg-red-500 mr-2"></span>
                    <span className="text-sm text-gray-600 dark:text-gray-300">Costi (AC)</span>
                </div>
            </div>
        </div>
    </div>
  );
};

export default FinancialAnalysisView;
