
import React, { useState, useMemo, DragEvent } from 'react';
import { SavedProject, Team, Worker } from '../types';
import { format } from 'date-fns';
import { it } from 'date-fns/locale/it';

interface PortfolioViewProps {
  projects: SavedProject[];
  globalTeams: Team[];
  globalWorkers: Worker[];
  onOpenProject: (project: SavedProject) => void;
  onCreateProject: () => void;
  onDeleteProject: (projectId: string) => void;
  onArchiveProject: (projectId: string) => void;
  onRestoreProject: (projectId: string) => void;
  onLoadDemo: () => void;
  onUpdateProjectMeta: (projectId: string, name: string, location: string) => void;
  onLogout: () => void;
}

const currencyFormatter = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

// --- UNIQUE BRANDING GENERATOR ---
const GRADIENTS = [
    ['#3B82F6', '#1D4ED8'], ['#10B981', '#047857'], ['#F59E0B', '#B45309'], ['#EF4444', '#B91C1C'],
    ['#8B5CF6', '#6D28D9'], ['#EC4899', '#BE185D'], ['#06B6D4', '#0E7490'], ['#6366F1', '#4338CA'],
    ['#F97316', '#C2410C'], ['#14B8A6', '#0F766E'], ['#84CC16', '#4D7C0F'], ['#64748B', '#334155'],
];

const ICONS = [
    "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2-2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
    "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
    "M20 22V10h-2v12H6v-6h4V4H8V2h10v2h-2v6h4v2h-2v10h2z M4 22h16", 
    "M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.7-3.7a6 6 0 01-8.5 8.5l-2.8 2.8a1 1 0 01-1.4 0L7 15l-4 4-1.5-1.5 4-4 1.7-1.7a1 1 0 010-1.4l2.8-2.8a6 6 0 018.5-8.5l-3.7 3.7z",
    "M12 4a7 7 0 00-7 7v3a1 1 0 001 1h12a1 1 0 001-1v-3a7 7 0 00-7-7z M5 11v2 M19 11v2",
    "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7",
    "M2 22h20V10l-5 5-5-5-5 5-5-5v12z M6 12h2v2H6z M16 12h2v2h-2z", 
    "M4 10c0-2 3-3 8-3s8 1 8 3v8H4v-8z M4 18v3 M20 18v3 M8 18v3 M16 18v3",
    "M4 4h16v16H4V4zm0 4h16M4 12h16M4 16h16 M8 4v4 M16 4v4 M12 8v4 M8 12v4 M16 12v4 M12 16v4",
    "M2 12h4l2-4h6l2 4h4v6H2z M5 18v2h2v-2 M17 18v2h2v-2",
];

const getProjectInitials = (name: string) => {
    const parts = name.split(' ').filter(p => p.length > 0);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
};

const getTheme = (id: string) => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
    hash = Math.abs(hash);
    return { gradient: GRADIENTS[hash % GRADIENTS.length], icon: ICONS[hash % ICONS.length], patternRotation: (hash % 360), patternScale: 0.5 + ((hash % 10) / 10) };
};

const ProjectUniqueSymbol: React.FC<{ project: SavedProject }> = ({ project }) => {
    const theme = getTheme(project.id);
    const initials = getProjectInitials(project.name);
    return (
        <div className="w-full h-full relative overflow-hidden border-r border-gray-200 dark:border-gray-700 flex items-center justify-center">
            <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})` }} />
            <svg className="absolute inset-0 w-full h-full opacity-20 mix-blend-overlay pointer-events-none">
                <defs>
                    <pattern id={`pat-${project.id}`} x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform={`rotate(${theme.patternRotation}) scale(${theme.patternScale})`}>
                        <path d="M0 40L40 0H20L0 20M40 40V20L20 40" stroke="white" strokeWidth="2" fill="none"/>
                    </pattern>
                </defs>
                <rect x="0" y="0" width="100%" height="100%" fill={`url(#pat-${project.id})`} />
            </svg>
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="0.5" className="absolute w-32 h-32 opacity-20 -right-4 -bottom-4 transform rotate-12"><path strokeLinecap="round" strokeLinejoin="round" d={theme.icon} /></svg>
            <div className="relative z-10 text-center">
                <div className="w-16 h-16 mx-auto bg-white/20 backdrop-blur-sm rounded-2xl border border-white/30 flex items-center justify-center shadow-inner mb-2"><svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" className="w-9 h-9"><path strokeLinecap="round" strokeLinejoin="round" d={theme.icon} /></svg></div>
                <h1 className="text-4xl font-black text-white tracking-tighter drop-shadow-md opacity-90">{initials}</h1>
            </div>
        </div>
    );
};

const ProgressDonutSmall: React.FC<{ progress: number, size?: number }> = ({ progress, size = 60 }) => {
    const strokeWidth = 6; const radius = (size - strokeWidth) / 2; const viewBox = `0 0 ${size} ${size}`; const dashArray = radius * Math.PI * 2; const dashOffset = dashArray - dashArray * progress / 100;
    return (
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={viewBox}><circle className="text-gray-200 dark:text-gray-700" cx={size / 2} cy={size / 2} r={radius} strokeWidth={`${strokeWidth}px`} stroke="currentColor" fill="none" /><circle className="text-indigo-600 dark:text-indigo-400" cx={size / 2} cy={size / 2} r={radius} strokeWidth={`${strokeWidth}px`} stroke="currentColor" fill="none" strokeLinecap="round" style={{ strokeDasharray: dashArray, strokeDashoffset: dashOffset, transition: 'stroke-dashoffset 0.5s ease-out' }} transform={`rotate(-90 ${size / 2} ${size / 2})`} /></svg>
            <span className="absolute text-xs font-bold text-gray-700 dark:text-gray-200">{progress.toFixed(0)}%</span>
        </div>
    );
};

const PortfolioView: React.FC<PortfolioViewProps> = ({ 
    projects, globalTeams, globalWorkers, 
    onOpenProject, onCreateProject, onDeleteProject, onArchiveProject, onRestoreProject,
    onLoadDemo, onUpdateProjectMeta, onLogout
}) => {
  const [activeTab, setActiveTab] = useState<'active' | 'archived'>('active');
  const [editingProject, setEditingProject] = useState<SavedProject | null>(null);
  const [editForm, setEditForm] = useState({ name: '', location: '' });
  const [confirmationModal, setConfirmationModal] = useState<{ isOpen: boolean, projectId: string | null, projectName: string | null }>({ isOpen: false, projectId: null, projectName: null });
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null);
  const [isDragOverTrash, setIsDragOverTrash] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' = 'success') => { setToast({ message, type }); setTimeout(() => setToast(null), 3000); };
  const displayedProjects = useMemo(() => projects.filter(p => (p.status || 'active') === activeTab), [projects, activeTab]);
  const handleDragStart = (e: DragEvent<HTMLDivElement>, projectId: string) => { setDraggedProjectId(projectId); e.dataTransfer.setData('text/plain', projectId); e.dataTransfer.effectAllowed = 'move'; };
  const handleDragEnd = () => { setDraggedProjectId(null); setIsDragOverTrash(false); };
  const handleTrashDragOver = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); if (!isDragOverTrash) setIsDragOverTrash(true); };
  const handleTrashDragLeave = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragOverTrash(false); };
  const handleTrashDrop = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); const projectId = e.dataTransfer.getData('text/plain'); const project = projects.find(p => p.id === projectId); setIsDragOverTrash(false); setDraggedProjectId(null); if (project) setConfirmationModal({ isOpen: true, projectId: project.id, projectName: project.name }); };
  const handleEditClick = (e: React.MouseEvent, project: SavedProject) => { e.stopPropagation(); e.preventDefault(); setEditingProject(project); setEditForm({ name: project.name, location: project.location || '' }); };
  const handleSaveEdit = (e: React.FormEvent) => { e.preventDefault(); if (editingProject && editForm.name.trim()) { onUpdateProjectMeta(editingProject.id, editForm.name, editForm.location); setEditingProject(null); showToast("Modifiche salvate", 'success'); } };
  const confirmDelete = () => { if (confirmationModal.projectId) { onDeleteProject(confirmationModal.projectId); setConfirmationModal({ isOpen: false, projectId: null, projectName: null }); showToast("Cantiere eliminato definitivamente", 'info'); } };
  const confirmArchive = () => { if (confirmationModal.projectId) { onArchiveProject(confirmationModal.projectId); setConfirmationModal({ isOpen: false, projectId: null, projectName: null }); showToast("Cantiere spostato in Archivio Storico", 'info'); } };
  const handleRestoreAndOpen = (e: React.MouseEvent | null, project: SavedProject) => { if (e) { e.stopPropagation(); e.preventDefault(); } onRestoreProject(project.id); onOpenProject({ ...project, status: 'active' }); showToast("Cantiere ripristinato e aperto", 'success'); }

  const getProjectStats = (project: SavedProject) => {
      let totalValue = 0; let totalMeasured = 0;
      project.data.projectDocuments.forEach(doc => {
          doc.workGroups.forEach(wg => {
              wg.items.forEach(item => {
                  const varTotal = (item.variations || []).reduce((acc, v) => v.type === 'increase' ? acc + v.quantity : acc - v.quantity, 0);
                  totalValue += (item.quantity + varTotal) * item.unitPrice;
                  totalMeasured += (item.measurements || []).reduce((acc, m) => acc + (m.quantity * item.unitPrice), 0);
              });
          });
      });
      return { totalValue, totalMeasured, progress: totalValue > 0 ? (totalMeasured / totalValue) * 100 : 0 };
  };

  return (
    <div className="min-h-screen relative flex flex-col bg-gray-100 dark:bg-gray-900">
      <div className="absolute inset-0 z-0" style={{ backgroundImage: `url('https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=2070&auto=format&fit=crop')`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
      <div className="absolute inset-0 z-0 bg-gray-100/90 dark:bg-gray-900/95 backdrop-blur-[3px]" />
      <div className="relative z-10 flex flex-col h-screen overflow-hidden">
        <header className="flex-shrink-0 p-6 md:p-8 pb-0 flex justify-between items-center max-w-7xl mx-auto w-full">
            <div><h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-1">Portfolio Cantieri</h1><p className="text-gray-500 dark:text-gray-400 text-sm">Panoramica tecnica ed economica</p></div>
            <div className="flex space-x-4 bg-white/50 dark:bg-gray-800/50 p-1 rounded-xl backdrop-blur-sm">
                <button onClick={() => setActiveTab('active')} className={`p-2 rounded-lg transition-all ${activeTab === 'active' ? 'bg-white dark:bg-gray-700 text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg></button>
                <button onClick={() => setActiveTab('archived')} className={`p-2 rounded-lg transition-all ${activeTab === 'archived' ? 'bg-white dark:bg-gray-700 text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg></button>
            </div>
        </header>
        <main className="flex-grow overflow-y-auto p-6 md:p-8 max-w-7xl mx-auto w-full no-scrollbar">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6 pb-24">
                {activeTab === 'active' && (
                    <button onClick={onCreateProject} className="group flex flex-col items-center justify-center h-48 border-2 border-dashed border-gray-300 dark:border-gray-600 bg-white/40 dark:bg-gray-800/40 backdrop-blur-sm rounded-2xl hover:border-indigo-500 hover:bg-indigo-50/60 dark:hover:bg-indigo-900/20 transition-all duration-200">
                        <div className="w-14 h-14 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 rounded-full flex items-center justify-center mb-3 group-hover:scale-110 transition-transform"><svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg></div>
                        <span className="text-base font-bold text-gray-700 dark:text-gray-300">Nuovo Cantiere</span>
                    </button>
                )}
                {displayedProjects.map((project) => {
                    const stats = getProjectStats(project); const isDragged = draggedProjectId === project.id;
                    return (
                        <div key={project.id} draggable onDragStart={(e) => handleDragStart(e, project.id)} onDragEnd={handleDragEnd} onClick={() => activeTab === 'active' ? onOpenProject(project) : handleRestoreAndOpen(null, project)} className={`bg-white dark:bg-gray-800 rounded-2xl shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden h-48 flex relative group cursor-pointer border border-gray-200 dark:border-gray-700 ${isDragged ? 'opacity-40 scale-95' : 'hover:-translate-y-1'}`}>
                            <div className="w-1/3 h-full relative"><ProjectUniqueSymbol project={project} /></div>
                            <div className="w-2/3 p-4 pl-5 flex flex-col bg-white dark:bg-gray-800 relative">
                                <div className="flex-1 flex flex-col">
                                    <div className="flex justify-between items-start mb-1"><h3 className="font-bold text-gray-900 dark:text-gray-100 text-lg leading-tight line-clamp-2 pr-4">{project.name}</h3><button onClick={(e) => handleEditClick(e, project)} className="text-gray-400 hover:text-indigo-600 p-1 absolute top-3 right-3 opacity-0 group-hover:opacity-100"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button></div>
                                    {project.location ? (<p className="text-sm text-gray-500 dark:text-gray-400 flex items-center truncate mb-1"><svg className="w-3 h-3 mr-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>{project.location}</p>) : <p className="text-xs text-gray-400 italic mb-1">Località non impostata</p>}
                                    <div className="mt-1"><span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Totale Progetto</span><p className="text-base font-bold text-gray-800 dark:text-gray-100">{currencyFormatter.format(stats.totalValue)}</p></div>
                                </div>
                                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                                    <div className="flex flex-col"><span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">SAL Maturato</span><span className="text-base font-bold text-green-600 dark:text-green-400">{currencyFormatter.format(stats.totalMeasured)}</span></div>
                                    <div className="flex flex-col items-center -my-1"><ProgressDonutSmall progress={stats.progress} size={42} /></div>
                                </div>
                                {activeTab === 'archived' && <div className="absolute inset-x-0 bottom-0 bg-green-600 text-white text-center text-xs py-1 font-bold opacity-0 group-hover:opacity-100 transition-opacity">⟲ Ripristina</div>}
                            </div>
                        </div>
                    );
                })}
            </div>
        </main>
        <div onDragOver={handleTrashDragOver} onDragLeave={handleTrashDragLeave} onDrop={handleTrashDrop} className={`fixed bottom-8 right-8 z-50 transition-all duration-300 flex flex-col items-center justify-center rounded-full shadow-2xl border-4 border-white dark:border-gray-800 ${draggedProjectId ? 'translate-y-0 opacity-100' : 'translate-y-32 opacity-0'} ${isDragOverTrash ? 'w-32 h-32 bg-red-600 scale-110' : 'w-24 h-24 bg-red-500'}`}><svg className={`text-white transition-all duration-300 ${isDragOverTrash ? 'w-12 h-12 animate-bounce' : 'w-8 h-8'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></div>
        <button onClick={onLogout} className="fixed bottom-8 left-8 z-50 w-12 h-12 bg-white dark:bg-gray-800 text-red-500 rounded-full shadow-lg border border-red-100 dark:border-gray-700 flex items-center justify-center hover:scale-110 hover:bg-red-50 transition-all"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg></button>
      </div>
      {editingProject && (<div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onClick={() => setEditingProject(null)}><div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}><h3 className="font-bold mb-4 text-gray-900 dark:text-white">Modifica Progetto</h3><form onSubmit={handleSaveEdit}><input className="w-full p-2 mb-3 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" value={editForm.name} onChange={e => setEditForm(p => ({...p, name: e.target.value}))} placeholder="Nome" required /><input className="w-full p-2 mb-4 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" value={editForm.location} onChange={e => setEditForm(p => ({...p, location: e.target.value}))} placeholder="Località" /><div className="flex justify-end gap-2"><button type="button" onClick={() => setEditingProject(null)} className="px-4 py-2 text-gray-600">Annulla</button><button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded">Salva</button></div></form></div></div>)}
      {confirmationModal.isOpen && (<div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"><div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-sm text-center"><h3 className="font-bold text-lg mb-2 text-gray-900 dark:text-white">Conferma Azione</h3><p className="text-gray-500 mb-6">Su "{confirmationModal.projectName}"</p><div className="space-y-2">{activeTab === 'active' && <button onClick={confirmArchive} className="w-full py-2 bg-gray-100 text-gray-800 rounded hover:bg-gray-200">Archivia (Consigliato)</button>}<button onClick={confirmDelete} className="w-full py-2 bg-red-600 text-white rounded hover:bg-red-700">Elimina Definitivamente</button><button onClick={() => setConfirmationModal({isOpen: false, projectId: null, projectName: null})} className="w-full py-2 text-gray-500">Annulla</button></div></div></div>)}
      {toast && <div className={`fixed bottom-8 left-1/2 transform -translate-x-1/2 z-[80] px-4 py-2 rounded-full shadow-xl text-sm font-bold text-white animate-fade-in ${toast.type === 'success' ? 'bg-green-600' : 'bg-indigo-600'}`}>{toast.message}</div>}
    </div>
  );
};

export default PortfolioView;
