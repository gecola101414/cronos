
import React, { useState, useMemo } from 'react';
import { ProjectDocument, Team, Worker } from '../types';
import { format, parseISO, startOfWeek, endOfWeek, eachDayOfInterval, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { it } from 'date-fns/locale/it';

const currencyFormatter = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const percentFormatter = new Intl.NumberFormat('it-IT', { style: 'percent', minimumFractionDigits: 1 });

interface ReportsViewProps {
    documents: ProjectDocument[];
    teams: Team[];
    workers: Worker[];
}

type ReportType = 'daily' | 'weekly' | 'monthly' | 'total';

interface ProductivityStat {
    workerId: string;
    workerName: string;
    workerRole: string;
    teamName: string;
    teamColor: string;
    soloValue: number;
    sharedValue: number;
    totalValue: number;
    measurementCount: number;
}

const ReportsView: React.FC<ReportsViewProps> = ({ documents, teams, workers }) => {
    const [reportType, setReportType] = useState<ReportType>('daily');
    const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [selectedWeekDate, setSelectedWeekDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [selectedMonthDate, setSelectedMonthDate] = useState(format(new Date(), 'yyyy-MM'));

    // Flatten all measurements with context
    const allMeasurements = useMemo(() => {
        return documents.flatMap(doc => 
            doc.workGroups.flatMap(group => 
                group.items.flatMap(item => 
                    (item.measurements || []).map(m => ({
                        ...m,
                        itemCode: item.articleCode,
                        itemDescription: item.description,
                        unitPrice: item.unitPrice,
                        unit: item.unit,
                        groupName: group.name,
                        measurementValue: m.quantity * item.unitPrice
                    }))
                )
            )
        );
    }, [documents]);

    // Filter measurements based on selected report type and date range
    const filteredMeasurements = useMemo(() => {
        return allMeasurements.filter(m => {
            const mDate = parseISO(m.date);
            switch (reportType) {
                case 'daily':
                    return m.date === selectedDate;
                case 'weekly':
                    const wStart = startOfWeek(parseISO(selectedWeekDate), { weekStartsOn: 1 });
                    const wEnd = endOfWeek(parseISO(selectedWeekDate), { weekStartsOn: 1 });
                    return isWithinInterval(mDate, { start: wStart, end: wEnd });
                case 'monthly':
                    const mStart = startOfMonth(parseISO(`${selectedMonthDate}-01`));
                    const mEnd = endOfMonth(parseISO(`${selectedMonthDate}-01`));
                    return isWithinInterval(mDate, { start: mStart, end: mEnd });
                case 'total':
                    return true;
                default:
                    return false;
            }
        });
    }, [allMeasurements, reportType, selectedDate, selectedWeekDate, selectedMonthDate]);

    // Calculate Productivity Stats (Solo vs Shared)
    const productivityStats = useMemo(() => {
        const statsMap = new Map<string, ProductivityStat>();
        let totalPeriodValue = 0;

        // Initialize map with all workers to show 0 production ones too
        workers.forEach(w => {
            const team = teams.find(t => t.id === w.teamId);
            statsMap.set(w.id, {
                workerId: w.id,
                workerName: w.name,
                workerRole: w.role,
                teamName: team ? team.name : 'Non Assegnato',
                teamColor: team ? team.color : '#9CA3AF',
                soloValue: 0,
                sharedValue: 0,
                totalValue: 0,
                measurementCount: 0
            });
        });

        filteredMeasurements.forEach(m => {
            const value = m.measurementValue;
            totalPeriodValue += value;
            
            if (m.workerIds && m.workerIds.length > 0) {
                const count = m.workerIds.length;
                const valuePerWorker = value / count;
                
                m.workerIds.forEach(wId => {
                    const stat = statsMap.get(wId);
                    if (stat) {
                        if (count === 1) {
                            stat.soloValue += value;
                        } else {
                            stat.sharedValue += valuePerWorker;
                        }
                        stat.totalValue += valuePerWorker;
                        stat.measurementCount += 1;
                    }
                });
            }
        });

        return {
            stats: Array.from(statsMap.values()).sort((a, b) => b.totalValue - a.totalValue),
            totalPeriodValue
        };
    }, [filteredMeasurements, workers, teams]);

    // --- REPORT HEADER INFO ---
    const reportTitle = useMemo(() => {
        switch (reportType) {
            case 'daily': return `Giornale dei Lavori: ${format(parseISO(selectedDate), 'dd MMMM yyyy', { locale: it })}`;
            case 'weekly': 
                const wStart = startOfWeek(parseISO(selectedWeekDate), { weekStartsOn: 1 });
                const wEnd = endOfWeek(parseISO(selectedWeekDate), { weekStartsOn: 1 });
                return `Report Settimanale: ${format(wStart, 'dd MMM')} - ${format(wEnd, 'dd MMM yyyy', { locale: it })}`;
            case 'monthly': return `Report Mensile: ${format(parseISO(`${selectedMonthDate}-01`), 'MMMM yyyy', { locale: it })}`;
            case 'total': return 'Report Totale Cantiere (Storico Completo)';
        }
    }, [reportType, selectedDate, selectedWeekDate, selectedMonthDate]);

    const printReport = () => {
        window.print();
    };

    return (
        <div className="p-4 md:p-6 h-full flex flex-col">
            {/* Toolbar */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 no-print gap-4">
                <div className="flex items-center space-x-4 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white whitespace-nowrap">Report Risorse</h2>
                    <div className="bg-gray-200 dark:bg-gray-700 rounded-lg p-1 flex flex-shrink-0">
                        {(['daily', 'weekly', 'monthly', 'total'] as ReportType[]).map(type => (
                            <button 
                                key={type}
                                onClick={() => setReportType(type)}
                                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all capitalize ${reportType === type ? 'bg-white dark:bg-gray-600 shadow text-indigo-600 dark:text-white' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
                            >
                                {type === 'daily' ? 'Giornaliera' : type === 'weekly' ? 'Settimana' : type === 'monthly' ? 'Mese' : 'Totale'}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex items-center space-x-3 w-full md:w-auto">
                    {reportType === 'daily' && (
                        <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 w-full md:w-auto" />
                    )}
                    {reportType === 'weekly' && (
                        <input type="date" value={selectedWeekDate} onChange={e => setSelectedWeekDate(e.target.value)} className="px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 w-full md:w-auto" />
                    )}
                    {reportType === 'monthly' && (
                        <input type="month" value={selectedMonthDate} onChange={e => setSelectedMonthDate(e.target.value)} className="px-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 w-full md:w-auto" />
                    )}
                    <button onClick={printReport} className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 flex items-center flex-shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                        Stampa
                    </button>
                </div>
            </div>

            {/* Report Content */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 overflow-y-auto printable-report">
                <div className="border-b-2 border-gray-800 dark:border-gray-200 pb-4 mb-8">
                    <h1 className="text-3xl font-black text-gray-900 dark:text-white uppercase tracking-widest">{reportTitle}</h1>
                    <p className="text-lg text-gray-600 dark:text-gray-300 mt-2">
                        Produzione Totale Periodo: <span className="font-bold text-indigo-600 dark:text-indigo-400 text-2xl ml-2">{currencyFormatter.format(productivityStats.totalPeriodValue)}</span>
                    </p>
                </div>

                {/* 1. WORKER PRODUCTIVITY ANALYSIS (Available in ALL views) */}
                <div className="mb-10 break-inside-avoid">
                    <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4 flex items-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                        Classifica Produttività Operai
                    </h3>
                    <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-100 dark:bg-gray-700 text-xs uppercase font-bold text-gray-600 dark:text-gray-300">
                                <tr>
                                    <th className="px-4 py-3">Operaio</th>
                                    <th className="px-4 py-3">Squadra</th>
                                    <th className="px-4 py-3 text-right text-green-700 dark:text-green-400">Prod. Solo</th>
                                    <th className="px-4 py-3 text-right text-blue-700 dark:text-blue-400">Prod. Team</th>
                                    <th className="px-4 py-3 text-right">Totale</th>
                                    <th className="px-4 py-3 text-right">% su Totale</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700 bg-white dark:bg-gray-800">
                                {productivityStats.stats.filter(s => s.totalValue > 0).map((stat, idx) => {
                                    const percentage = productivityStats.totalPeriodValue > 0 
                                        ? stat.totalValue / productivityStats.totalPeriodValue 
                                        : 0;
                                    return (
                                        <tr key={stat.workerId} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                            <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                                                <div className="flex items-center">
                                                    <span className="w-6 h-6 bg-gray-200 dark:bg-gray-600 rounded-full flex items-center justify-center text-[10px] font-bold mr-2">
                                                        {idx + 1}
                                                    </span>
                                                    <div>
                                                        {stat.workerName}
                                                        <div className="text-xs text-gray-500 font-normal">{stat.workerRole}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: `${stat.teamColor}20`, color: stat.teamColor }}>
                                                    {stat.teamName}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right text-green-700 dark:text-green-400 font-mono">
                                                {currencyFormatter.format(stat.soloValue)}
                                            </td>
                                            <td className="px-4 py-3 text-right text-blue-700 dark:text-blue-400 font-mono">
                                                {currencyFormatter.format(stat.sharedValue)}
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-white font-mono">
                                                {currencyFormatter.format(stat.totalValue)}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex items-center justify-end">
                                                    <span className="text-xs font-semibold mr-2">{percentFormatter.format(percentage)}</span>
                                                    <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                                                        <div className="h-full bg-indigo-500" style={{ width: `${percentage * 100}%` }}></div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {productivityStats.stats.every(s => s.totalValue === 0) && (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-8 text-center text-gray-500 italic">Nessuna produttività registrata in questo periodo.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* 2. DETAILED ACTIVITIES LIST (Only for Daily/Weekly) */}
                {(reportType === 'daily' || reportType === 'weekly') && filteredMeasurements.length > 0 && (
                    <div className="mt-12">
                        <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4 border-b pb-2 border-gray-200 dark:border-gray-700">
                            Dettaglio Attività Svolte
                        </h3>
                        {teams.map(team => {
                            const teamMeasurements = filteredMeasurements.filter(m => m.teamId === team.id);
                            if (teamMeasurements.length === 0) return null;
                            
                            const teamTotal = teamMeasurements.reduce((acc, m) => acc + m.measurementValue, 0);

                            return (
                                <div key={team.id} className="mb-8 break-inside-avoid">
                                    <div className="flex items-center justify-between mb-3 bg-gray-50 dark:bg-gray-700/30 p-3 rounded-lg">
                                        <div className="flex items-center space-x-3">
                                            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: team.color }}></div>
                                            <h4 className="font-bold text-lg text-gray-800 dark:text-gray-200">{team.name}</h4>
                                        </div>
                                        <span className="font-bold text-indigo-600 dark:text-indigo-400">{currencyFormatter.format(teamTotal)}</span>
                                    </div>
                                    <table className="w-full text-sm text-left border-l-2 pl-4" style={{ borderLeftColor: team.color }}>
                                        <thead className="text-xs text-gray-500 uppercase border-b dark:border-gray-700">
                                            <tr>
                                                <th className="py-2 px-2 w-24">Data</th>
                                                <th className="py-2 px-2">Attività</th>
                                                <th className="py-2 px-2">Operai</th>
                                                <th className="py-2 px-2 text-right">Valore</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                            {teamMeasurements.map((m, i) => {
                                                const assignedWorkers = workers.filter(w => m.workerIds?.includes(w.id));
                                                return (
                                                    <tr key={i}>
                                                        <td className="py-2 px-2 text-gray-500">{format(parseISO(m.date), 'dd/MM')}</td>
                                                        <td className="py-2 px-2">
                                                            <div className="font-medium text-gray-800 dark:text-gray-200 truncate max-w-md">{m.itemDescription}</div>
                                                            <div className="text-xs text-gray-500">{numberFormatter.format(m.quantity)} {m.unit}</div>
                                                        </td>
                                                        <td className="py-2 px-2 text-xs text-gray-600 dark:text-gray-400">
                                                            {assignedWorkers.length > 0 ? assignedWorkers.map(w => w.name).join(', ') : '-'}
                                                            {assignedWorkers.length === 1 && <span className="ml-1 text-green-600 font-bold text-[10px] border border-green-200 px-1 rounded">SOLO</span>}
                                                        </td>
                                                        <td className="py-2 px-2 text-right font-medium">{currencyFormatter.format(m.measurementValue)}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Footer Signatures */}
                <div className="mt-16 pt-8 border-t-2 border-gray-300 dark:border-gray-600 grid grid-cols-3 gap-8 text-center page-break-inside-avoid">
                    <div>
                        <p className="text-sm font-bold text-gray-500 uppercase mb-10">Il Capocantiere</p>
                        <div className="border-b border-gray-400 w-3/4 mx-auto"></div>
                    </div>
                    <div>
                        <p className="text-sm font-bold text-gray-500 uppercase mb-10">Direzione Tecnica</p>
                        <div className="border-b border-gray-400 w-3/4 mx-auto"></div>
                    </div>
                    <div>
                        <p className="text-sm font-bold text-gray-500 uppercase mb-10">Amministrazione</p>
                        <div className="border-b border-gray-400 w-3/4 mx-auto"></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const numberFormatter = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default ReportsView;
