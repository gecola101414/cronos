
import React, { useState, useEffect, useRef } from 'react';
import { View } from '../App';

interface SidebarProps {
  activeView: View;
  onViewChange: (view: View) => void;
  isProjectLoaded: boolean;
  onLogout: () => void;
  isViewOnly: boolean;
  onExitProject?: () => void;
}

const NavItem: React.FC<{
  viewName: View;
  label: string;
  icon: React.ReactNode;
  activeView: View;
  onViewChange: (view: View) => void;
  disabled?: boolean;
  onDragStart: (e: React.DragEvent<HTMLLIElement>, view: View) => void;
  onDragOver: (e: React.DragEvent<HTMLLIElement>) => void;
  onDrop: (e: React.DragEvent<HTMLLIElement>, view: View) => void;
  onDragEnd: (e: React.DragEvent<HTMLLIElement>) => void;
  isDragging: boolean;
}> = ({ viewName, label, icon, activeView, onViewChange, disabled, onDragStart, onDragOver, onDrop, onDragEnd, isDragging }) => {
  const isActive = activeView === viewName;
  return (
    <li 
      draggable={!disabled}
      onDragStart={(e) => !disabled && onDragStart(e, viewName)}
      onDragOver={!disabled ? onDragOver : undefined}
      onDrop={(e) => !disabled && onDrop(e, viewName)}
      onDragEnd={onDragEnd}
      className={`transition-all duration-200 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'} ${isDragging ? 'opacity-50' : 'opacity-100'}`}
    >
      <button
        onClick={() => onViewChange(viewName)}
        disabled={disabled}
        className={`flex items-center p-3 my-1 w-full text-sm font-medium rounded-lg transition-colors
          ${
            isActive
              ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 shadow-sm'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }
        `}
      >
        <div className="w-6 h-6 mr-3">{icon}</div>
        <span>{label}</span>
        {!disabled && (
            <div className="ml-auto text-gray-300 dark:text-gray-600 opacity-0 hover:opacity-100 group-hover:opacity-50">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
            </div>
        )}
      </button>
    </li>
  );
};

const Sidebar: React.FC<SidebarProps> = ({ activeView, onViewChange, isProjectLoaded, onLogout, isViewOnly, onExitProject }) => {
  
  // Default order definition
  const DEFAULT_ORDER: View[] = [
      'dashboard', 
      'timeline', 
      'accounting', 
      'costs', 
      'teams', 
      'reports', 
      'summary', 
      'measurements', 
      'help'
  ];

  const [menuOrder, setMenuOrder] = useState<View[]>(DEFAULT_ORDER);
  const [draggedItem, setDraggedItem] = useState<View | null>(null);

  // Load order from localStorage on mount
  useEffect(() => {
      const savedOrder = localStorage.getItem('chronos_sidebar_order');
      if (savedOrder) {
          try {
              const parsedOrder = JSON.parse(savedOrder) as View[];
              // Smart Merge: Ensure all default items exist, append any new ones that weren't in saved order
              const mergedOrder = [...parsedOrder];
              DEFAULT_ORDER.forEach(item => {
                  if (!mergedOrder.includes(item)) {
                      mergedOrder.push(item);
                  }
              });
              // Remove items that no longer exist in default (cleanup)
              const finalOrder = mergedOrder.filter(item => DEFAULT_ORDER.includes(item));
              
              setMenuOrder(finalOrder);
          } catch (e) {
              console.error("Failed to load menu order", e);
              setMenuOrder(DEFAULT_ORDER);
          }
      }
  }, []);

  // Persist order on change
  const handleReorder = (newOrder: View[]) => {
      setMenuOrder(newOrder);
      localStorage.setItem('chronos_sidebar_order', JSON.stringify(newOrder));
  };

  const handleDragStart = (e: React.DragEvent<HTMLLIElement>, view: View) => {
      setDraggedItem(view);
      e.dataTransfer.effectAllowed = "move";
      // No manual style manipulation here, relying on React state 'draggedItem'
  };

  const handleDragOver = (e: React.DragEvent<HTMLLIElement>) => {
      e.preventDefault(); // Necessary to allow dropping
      e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent<HTMLLIElement>, targetView: View) => {
      e.preventDefault();
      
      if (!draggedItem || draggedItem === targetView) return;

      const currentOrder = [...menuOrder];
      const draggedIdx = currentOrder.indexOf(draggedItem);
      const targetIdx = currentOrder.indexOf(targetView);

      if (draggedIdx > -1 && targetIdx > -1) {
          // Remove dragged item
          currentOrder.splice(draggedIdx, 1);
          // Insert at new position
          currentOrder.splice(targetIdx, 0, draggedItem);
          handleReorder(currentOrder);
      }
      setDraggedItem(null);
  };

  const handleDragEnd = () => {
      setDraggedItem(null);
  }

  const allNavItems = {
    'dashboard': { label: 'Dashboard', icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" /></svg>, disabled: false },
    'timeline': { label: 'Cronoprogramma', icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>, disabled: !isProjectLoaded },
    'accounting': { label: 'Contabilità D.L.', icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>, disabled: !isProjectLoaded },
    'costs': { label: 'Gestione Spese', icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.5 2.5 0 00-1.168-.217c-.317 0-.631.031-.928.09-1.43.278-2.433 1.25-2.433 2.503 0 1.253 1.003 2.226 2.433 2.504.297.058.611.09.928.09.431 0 .84-.08 1.207-.234v1.698c-.221-.07-.412-.164-.567-.267C8.168 15.65 6 14.512 6 12.5S8.168 9.35 8.433 7.418zM12 3a1 1 0 00-1 1v14a1 1 0 001 1h1a1 1 0 001-1V4a1 1 0 00-1-1h-1z" /></svg>, disabled: !isProjectLoaded },
    'teams': { label: 'Squadre & Operai', icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path fillRule="evenodd" d="M8.25 6.75a3.75 3.75 0 117.5 0 3.75 3.75 0 01-7.5 0zM15.75 9.75a3 3 0 116 0 3 3 0 01-6 0zM2.25 9.75a3 3 0 116 0 3 3 0 01-6 0zM6.31 15.117A6.745 6.745 0 0112 12a6.745 6.745 0 016.709 7.498.75.75 0 01-.372.568A12.696 12.696 0 0112 21.75c-2.305 0-4.47-.612-6.337-1.684a.75.75 0 01-.372-.568 6.787 6.787 0 011.019-4.38z" clipRule="evenodd" /><path d="M5.082 14.254a8.287 8.287 0 00-1.308 5.135 9.687 9.687 0 01-1.764-.44l-.115-.04a.563.563 0 01-.373-.487l-.01-.121a3.75 3.75 0 013.57-4.047zM20.226 19.389a8.287 8.287 0 00-1.308-5.135 3.75 3.75 0 013.57 4.047l-.01.121a.563.563 0 01-.373.486l-.115.04c-.567.2-1.156.349-1.764.441z" /></svg>, disabled: !isProjectLoaded },
    'reports': { label: 'Report Risorse', icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M11.25 4.533A9.707 9.707 0 006 3.75a9.753 9.753 0 00-3 3.75C3 7.5 3 11.25 3 11.25S3 13.5 6 13.5a9.75 9.75 0 009-2.25c0-1.38.84-2.494 2.08-2.91.14-.974.22-1.972.22-2.98a9.708 9.708 0 00-3.051-5.827c-1.44 1.73-2.82 3.23-2.999 5.003z" /><path d="M13.483 14.821a9.753 9.753 0 00-9 2.25c0 1.38.84 2.494 2.08 2.91.14.974.22 1.972.22 2.98a9.708 9.708 0 003.051 5.827c1.44-1.73 2.82-3.23 2.999-5.003.437-4.311-1.115-7.677-4.35-8.964z" /><path d="M12.75 9.75a.75.75 0 000 1.5h9a.75.75 0 000-1.5h-9z" /><path d="M12.75 13.5a.75.75 0 000 1.5h5.25a.75.75 0 000-1.5h-5.25z" /></svg>, disabled: !isProjectLoaded },
    'summary': { label: 'Computo Metrico', icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>, disabled: !isProjectLoaded },
    'measurements': { label: 'Brogliaccio SAL', icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>, disabled: !isProjectLoaded },
    'help': { label: 'Manuale Utente', icon: <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>, disabled: false },
  };

  return (
    <aside className="fixed top-0 left-0 z-40 w-64 h-screen bg-white dark:bg-gray-800 shadow-lg flex flex-col no-print">
       <div className="flex items-center justify-center h-20 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center space-x-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <div>
                  <h1 className="text-2xl font-bold leading-tight text-gray-900 dark:text-white">
                  Chronos AI
                  </h1>
                  <span className="text-xs font-medium text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full">
                    Gemini 3
                  </span>
              </div>
          </div>
       </div>
      <nav className="flex-grow px-4 py-4 overflow-y-auto">
        <ul>
          {onExitProject && (
             <li className="mb-4 border-b border-gray-200 dark:border-gray-700 pb-4">
                <button
                    onClick={onExitProject}
                    className="flex items-center p-3 w-full text-sm font-bold rounded-lg text-indigo-700 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-300 dark:hover:bg-indigo-900/40 transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 mr-3" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                    </svg>
                    <span>I Miei Cantieri</span>
                </button>
             </li>
          )}
          {menuOrder.map(viewName => {
              const item = allNavItems[viewName as keyof typeof allNavItems];
              if (!item) return null;
              
              // Skip views that are disabled if ViewOnly mode is active, except help/timeline/dashboard
              if (isViewOnly && !['timeline', 'dashboard', 'help'].includes(viewName)) {
                  return null;
              }

              return (
                <NavItem 
                  key={viewName}
                  viewName={viewName}
                  label={item.label}
                  icon={item.icon}
                  activeView={activeView}
                  onViewChange={onViewChange}
                  disabled={item.disabled}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                  isDragging={draggedItem === viewName}
                />
              );
          })}
        </ul>
      </nav>
      {!isViewOnly && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          <button
              onClick={onLogout}
              className="flex items-center p-3 w-full text-sm font-medium rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              <span>Logout</span>
            </button>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
