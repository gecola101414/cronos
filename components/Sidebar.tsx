import React, { useState, useEffect } from 'react';
import { View } from '../App';
import { AccountingTab } from './AccountingView';

interface SidebarProps {
  activeView: View;
  onViewChange: (view: View) => void;
  accountingTab?: AccountingTab;
  onAccountingTabChange?: (tab: AccountingTab) => void;
  isProjectLoaded: boolean;
  onLogout: () => void;
  isViewOnly: boolean;
  onExitProject?: () => void;
}

const ACCOUNTING_SUBITEMS: { id: AccountingTab; label: string }[] = [
  { id: 'libretto', label: 'Libretto Misure' },
  { id: 'register', label: 'Registro Contabilità' },
  { id: 'summary', label: 'Sommario Registro' },
  { id: 'sal_technical', label: 'Riepilogo SAL' },
  { id: 'payment_cert', label: 'Certificato Pagamento' },
  { id: 'settings', label: 'Impostazioni & SAL' },
];

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
  children?: React.ReactNode;
  rightAdornment?: React.ReactNode;
  onClickOverride?: () => void;
}> = ({
  viewName,
  label,
  icon,
  activeView,
  onViewChange,
  disabled,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragging,
  children,
  rightAdornment,
  onClickOverride,
}) => {
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
        onClick={() => (onClickOverride ? onClickOverride() : onViewChange(viewName))}
        disabled={disabled}
        className={`flex items-center p-2.5 my-0.5 w-full text-sm font-medium rounded-lg transition-colors
          ${
            isActive
              ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 shadow-sm font-semibold'
              : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
          }
        `}
      >
        <div className="w-5 h-5 mr-3 flex-shrink-0">{icon}</div>
        <span className="truncate">{label}</span>
        {rightAdornment ? (
          <div className="ml-auto flex items-center">{rightAdornment}</div>
        ) : (
          !disabled && (
            <div className="ml-auto text-gray-300 dark:text-gray-600 opacity-0 hover:opacity-100 group-hover:opacity-50">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </div>
          )
        )}
      </button>
      {children}
    </li>
  );
};

const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onViewChange,
  accountingTab = 'libretto',
  onAccountingTabChange,
  isProjectLoaded,
  onLogout,
  isViewOnly,
  onExitProject,
}) => {
  // Default order definition without 'costs', 'teams', 'reports'
  const DEFAULT_ORDER: View[] = [
    'dashboard',
    'timeline',
    'accounting',
    'summary',
    'measurements',
    'help',
  ];

  const [menuOrder, setMenuOrder] = useState<View[]>(DEFAULT_ORDER);
  const [draggedItem, setDraggedItem] = useState<View | null>(null);
  const [isAccountingExpanded, setIsAccountingExpanded] = useState<boolean>(true);

  useEffect(() => {
    if (activeView === 'accounting') {
      setIsAccountingExpanded(true);
    }
  }, [activeView]);

  // Load order from localStorage on mount
  useEffect(() => {
    const savedOrder = localStorage.getItem('chronos_sidebar_order');
    if (savedOrder) {
      try {
        const parsedOrder = JSON.parse(savedOrder) as View[];
        const mergedOrder = [...parsedOrder];
        DEFAULT_ORDER.forEach((item) => {
          if (!mergedOrder.includes(item)) {
            mergedOrder.push(item);
          }
        });
        const finalOrder = mergedOrder.filter((item) => DEFAULT_ORDER.includes(item));
        setMenuOrder(finalOrder);
      } catch (e) {
        console.error('Failed to load menu order', e);
        setMenuOrder(DEFAULT_ORDER);
      }
    }
  }, []);

  const handleReorder = (newOrder: View[]) => {
    setMenuOrder(newOrder);
    localStorage.setItem('chronos_sidebar_order', JSON.stringify(newOrder));
  };

  const handleDragStart = (e: React.DragEvent<HTMLLIElement>, view: View) => {
    setDraggedItem(view);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent<HTMLLIElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent<HTMLLIElement>, targetView: View) => {
    e.preventDefault();

    if (!draggedItem || draggedItem === targetView) return;

    const currentOrder = [...menuOrder];
    const draggedIdx = currentOrder.indexOf(draggedItem);
    const targetIdx = currentOrder.indexOf(targetView);

    if (draggedIdx > -1 && targetIdx > -1) {
      currentOrder.splice(draggedIdx, 1);
      currentOrder.splice(targetIdx, 0, draggedItem);
      handleReorder(currentOrder);
    }
    setDraggedItem(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
  };

  const allNavItems: Record<string, { label: string; icon: React.ReactNode; disabled: boolean }> = {
    dashboard: {
      label: 'Dashboard',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
      ),
      disabled: false,
    },
    timeline: {
      label: 'Cronoprogramma',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      disabled: !isProjectLoaded,
    },
    accounting: {
      label: 'Contabilità D.L.',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      ),
      disabled: !isProjectLoaded,
    },
    summary: {
      label: 'Computo Metrico',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      disabled: !isProjectLoaded,
    },
    measurements: {
      label: 'Brogliaccio SAL',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
      disabled: !isProjectLoaded,
    },
    help: {
      label: 'Manuale Utente',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
        </svg>
      ),
      disabled: false,
    },
  };

  return (
    <aside className="fixed top-0 left-0 z-40 w-64 h-screen bg-white dark:bg-gray-800 shadow-lg flex flex-col no-print">
      <div className="flex items-center justify-center h-16 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <div className="flex items-center space-x-3">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-9 w-9 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <div>
            <h1 className="text-xl font-bold leading-tight text-gray-900 dark:text-white">
              Chronos AI
            </h1>
            <span className="text-[11px] font-medium text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full">
              Gemini 3
            </span>
          </div>
        </div>
      </div>
      <nav className="flex-grow px-3 py-3 overflow-y-auto">
        <ul>
          {onExitProject && (
            <li className="mb-3 border-b border-gray-200 dark:border-gray-700 pb-3">
              <button
                onClick={onExitProject}
                className="flex items-center p-2.5 w-full text-sm font-bold rounded-lg text-indigo-700 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-300 dark:hover:bg-indigo-900/40 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 mr-3" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
                </svg>
                <span>I Miei Cantieri</span>
              </button>
            </li>
          )}
          {menuOrder.map((viewName) => {
            const item = allNavItems[viewName];
            if (!item) return null;

            if (isViewOnly && !['timeline', 'dashboard', 'help'].includes(viewName)) {
              return null;
            }

            if (viewName === 'accounting') {
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
                  onClickOverride={() => {
                    if (activeView !== 'accounting') {
                      onViewChange('accounting');
                      setIsAccountingExpanded(true);
                    } else {
                      setIsAccountingExpanded((prev) => !prev);
                    }
                  }}
                  rightAdornment={
                    !item.disabled ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className={`h-4 w-4 transition-transform duration-200 ${isAccountingExpanded ? 'rotate-180 text-indigo-600 dark:text-indigo-400' : 'text-gray-400'}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    ) : undefined
                  }
                >
                  {!item.disabled && isAccountingExpanded && (
                    <ul className="ml-5 pl-2.5 mt-1 mb-2 border-l-2 border-indigo-100 dark:border-indigo-900/60 space-y-0.5">
                      {ACCOUNTING_SUBITEMS.map((sub) => {
                        const isSubActive = activeView === 'accounting' && accountingTab === sub.id;
                        return (
                          <li key={sub.id}>
                            <button
                              type="button"
                              onClick={() => {
                                onViewChange('accounting');
                                onAccountingTabChange?.(sub.id);
                              }}
                              className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors flex items-center gap-2 ${
                                isSubActive
                                  ? 'bg-indigo-600 text-white font-bold shadow-xs'
                                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/60 font-medium'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                  isSubActive ? 'bg-white' : 'bg-gray-400 dark:bg-gray-500'
                                }`}
                              />
                              <span className="truncate">{sub.label}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </NavItem>
              );
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
        <div className="p-3 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          <button
            onClick={onLogout}
            className="flex items-center p-2.5 w-full text-sm font-medium rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 mr-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Logout</span>
          </button>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;

