
import React, { useState } from 'react';
import { Team, Worker } from '../types';

interface TeamManagementViewProps {
  teams: Team[];
  workers: Worker[];
  onAddTeam: (team: Team) => void;
  onUpdateTeam: (team: Team) => void;
  onDeleteTeam: (teamId: string) => void;
  onAddWorker: (worker: Worker) => void;
  onUpdateWorker: (worker: Worker) => void;
  onDeleteWorker: (workerId: string) => void;
  isViewOnly: boolean;
}

const predefinedColors = [
  '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#6B7280'
];

const commonConstructionRoles = [
  "Capocantiere",
  "Caposquadra",
  "Direttore Tecnico",
  "Muratore Specializzato",
  "Muratore",
  "Manovale",
  "Carpentiere Edile",
  "Carpentiere in Ferro",
  "Ferraiolo",
  "Gruista",
  "Escavatorista",
  "Elettricista",
  "Idraulico",
  "Imbianchino / Decoratore",
  "Cartongessista",
  "Piastrellista",
  "Pavimentista",
  "Lattoniere",
  "Impermeabilizzatore",
  "Fabbro",
  "Serramentista",
  "Autista",
  "Magazziniere di Cantiere",
  "Responsabile Sicurezza (RSPP)",
  "Addetto Ponteggi"
];

const TeamManagementView: React.FC<TeamManagementViewProps> = ({
  teams, workers, onAddTeam, onUpdateTeam, onDeleteTeam, onAddWorker, onUpdateWorker, onDeleteWorker, isViewOnly
}) => {
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  
  // Team Form State
  const [isTeamFormOpen, setIsTeamFormOpen] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamColor, setTeamColor] = useState(predefinedColors[0]);

  // Team Editing State
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editTeamName, setEditTeamName] = useState('');

  // Worker Form State
  const [isWorkerFormOpen, setIsWorkerFormOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [workerName, setWorkerName] = useState('');
  const [workerRole, setWorkerRole] = useState('');
  const [workerStatus, setWorkerStatus] = useState<'active' | 'inactive'>('active');

  const handleCreateTeam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;
    const newTeam: Team = {
      id: crypto.randomUUID(),
      name: teamName,
      color: teamColor
    };
    onAddTeam(newTeam);
    setTeamName('');
    setIsTeamFormOpen(false);
  };

  const startEditingTeam = (e: React.MouseEvent, team: Team) => {
      e.stopPropagation();
      e.preventDefault();
      setEditingTeamId(team.id);
      setEditTeamName(team.name);
  };

  const saveEditTeam = (e: React.MouseEvent | React.FormEvent, team: Team) => {
      e.stopPropagation();
      e.preventDefault();
      if (editTeamName.trim()) {
          onUpdateTeam({ ...team, name: editTeamName });
      }
      setEditingTeamId(null);
  };

  const cancelEditTeam = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setEditingTeamId(null);
  };

  const handleDeleteTeamClick = (team: Team) => {
    if (isViewOnly) return;
    const assignedWorkers = workers.filter(w => w.teamId === team.id).length;
    
    let confirmMessage = '';
    if (assignedWorkers > 0) {
        confirmMessage = `ATTENZIONE: La squadra "${team.name}" ha ${assignedWorkers} operai assegnati.\n\nEliminandola, gli operai verranno impostati come "Non assegnati".\n\nVuoi procedere?`;
    } else {
        confirmMessage = `Eliminare la squadra "${team.name}"?`;
    }

    if (window.confirm(confirmMessage)) {
        onDeleteTeam(team.id);
        if (selectedTeamId === team.id) {
            setSelectedTeamId(null);
        }
    }
  };

  const handleWorkerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerName.trim()) return;

    if (editingWorker) {
      onUpdateWorker({
        ...editingWorker,
        name: workerName,
        role: workerRole,
        status: workerStatus,
        teamId: selectedTeamId || editingWorker.teamId // Keep existing if no team selected in view, or assign to current view
      });
    } else {
      const newWorker: Worker = {
        id: crypto.randomUUID(),
        name: workerName,
        role: workerRole,
        status: workerStatus,
        teamId: selectedTeamId || undefined
      };
      onAddWorker(newWorker);
    }
    closeWorkerForm();
  };

  const openWorkerForm = (worker?: Worker) => {
    if (worker) {
      setEditingWorker(worker);
      setWorkerName(worker.name);
      setWorkerRole(worker.role);
      setWorkerStatus(worker.status);
    } else {
      setEditingWorker(null);
      setWorkerName('');
      setWorkerRole('');
      setWorkerStatus('active');
    }
    setIsWorkerFormOpen(true);
  };

  const closeWorkerForm = () => {
    setIsWorkerFormOpen(false);
    setEditingWorker(null);
  };

  const handleMoveWorker = (worker: Worker, newTeamId: string) => {
      onUpdateWorker({ ...worker, teamId: newTeamId === 'unassigned' ? undefined : newTeamId });
  };

  const filteredWorkers = selectedTeamId 
    ? workers.filter(w => w.teamId === selectedTeamId)
    : workers;

  return (
    <div className="p-4 md:p-6 h-[calc(100vh-120px)] flex flex-col md:flex-row gap-6">
      
      {/* LEFT COLUMN: TEAMS */}
      <div className="w-full md:w-1/3 bg-white dark:bg-gray-800 rounded-xl shadow-md flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-800 dark:text-white">Squadre</h2>
          {!isViewOnly && (
            <button 
                onClick={() => setIsTeamFormOpen(true)}
                className="p-2 bg-indigo-100 text-indigo-600 rounded-lg hover:bg-indigo-200 dark:bg-indigo-900/40 dark:text-indigo-300"
                title="Crea Nuova Squadra"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
            </button>
          )}
        </div>
        
        {isTeamFormOpen && (
             <div className="p-4 bg-gray-50 dark:bg-gray-700/30 border-b border-gray-200 dark:border-gray-700 animate-fade-in">
                <form onSubmit={handleCreateTeam} className="space-y-3">
                    <input 
                        type="text" 
                        placeholder="Nome Squadra (es. Squadra Rossa)" 
                        value={teamName}
                        onChange={e => setTeamName(e.target.value)}
                        className="w-full p-2 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        autoFocus
                    />
                    <div className="flex gap-2">
                        {predefinedColors.map(c => (
                            <button 
                                key={c}
                                type="button"
                                onClick={() => setTeamColor(c)}
                                className={`w-6 h-6 rounded-full transition-transform ${teamColor === c ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110' : ''}`}
                                style={{ backgroundColor: c }}
                            />
                        ))}
                    </div>
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setIsTeamFormOpen(false)} className="px-3 py-1 text-xs text-gray-600 bg-gray-200 rounded hover:bg-gray-300">Annulla</button>
                        <button type="submit" className="px-3 py-1 text-xs text-white bg-indigo-600 rounded hover:bg-indigo-700">Salva</button>
                    </div>
                </form>
             </div>
        )}

        <div className="flex-grow overflow-y-auto p-2 space-y-2">
             <button
                onClick={() => setSelectedTeamId(null)}
                className={`w-full text-left p-3 rounded-lg transition-colors flex justify-between items-center ${selectedTeamId === null ? 'bg-indigo-50 dark:bg-indigo-900/20 border-l-4 border-indigo-500' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`}
             >
                 <span className="font-medium text-gray-700 dark:text-gray-200">Tutti gli Operai</span>
                 <span className="bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 text-xs px-2 py-0.5 rounded-full">{workers.length}</span>
             </button>
             {teams.map(team => {
                 const memberCount = workers.filter(w => w.teamId === team.id).length;
                 const isEditing = editingTeamId === team.id;

                 return (
                    <div key={team.id} className={`group w-full p-3 rounded-lg transition-colors flex justify-between items-center cursor-pointer ${selectedTeamId === team.id ? 'bg-indigo-50 dark:bg-indigo-900/20 border-l-4' : 'hover:bg-gray-50 dark:hover:bg-gray-700'}`} 
                        style={{ borderLeftColor: selectedTeamId === team.id ? team.color : 'transparent' }}
                        onClick={() => !isEditing && setSelectedTeamId(team.id)}
                    >
                        <div className="flex items-center gap-3 flex-1">
                            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: team.color }}></div>
                            {isEditing ? (
                                <form onSubmit={(e) => saveEditTeam(e, team)} className="flex items-center gap-2 w-full" onClick={e => e.stopPropagation()}>
                                    <input 
                                        type="text"
                                        value={editTeamName}
                                        onChange={e => setEditTeamName(e.target.value)}
                                        className="w-full p-1 text-sm border rounded dark:bg-gray-600 dark:border-gray-500 dark:text-white"
                                        autoFocus
                                    />
                                    <button type="submit" className="text-green-600 hover:text-green-700"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg></button>
                                    <button onClick={cancelEditTeam} className="text-gray-500 hover:text-gray-700"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button>
                                </form>
                            ) : (
                                <span className="font-medium text-gray-800 dark:text-gray-100">{team.name}</span>
                            )}
                        </div>
                         
                         {!isEditing && (
                             <div className="flex items-center gap-1">
                                 <span className="bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 text-xs px-2 py-0.5 rounded-full mr-1">{memberCount}</span>
                                 {!isViewOnly && (
                                    <>
                                        <button 
                                            onClick={(e) => startEditingTeam(e, team)}
                                            className="text-gray-400 hover:text-indigo-500 p-1.5 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                                            title="Rinomina Squadra"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                            </svg>
                                        </button>
                                        <button 
                                            onClick={(e) => { 
                                                e.preventDefault();
                                                e.stopPropagation(); 
                                                handleDeleteTeamClick(team); 
                                            }}
                                            className="text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-1.5 rounded-full transition-colors opacity-0 group-hover:opacity-100 z-10"
                                            title="Elimina Squadra"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
                                            </svg>
                                        </button>
                                    </>
                                 )}
                             </div>
                         )}
                    </div>
                 );
             })}
        </div>
      </div>

      {/* RIGHT COLUMN: WORKERS */}
      <div className="w-full md:w-2/3 bg-white dark:bg-gray-800 rounded-xl shadow-md flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
             <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-gray-800 dark:text-white">
                    {selectedTeamId ? `Operai: ${teams.find(t => t.id === selectedTeamId)?.name}` : 'Tutti gli Operai'}
                </h2>
                {!selectedTeamId && (
                    <span className="text-xs text-gray-500">(Elenco completo)</span>
                )}
             </div>
            {!isViewOnly && (
                <button 
                    onClick={() => openWorkerForm()}
                    className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium shadow-md transition-all hover:scale-105"
                >
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" />
                     </svg>
                     Nuovo Operaio
                </button>
            )}
        </div>

        {isWorkerFormOpen && (
            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border-b border-gray-200 dark:border-gray-700 animate-fade-in">
                <h3 className="text-sm font-bold text-indigo-800 dark:text-indigo-200 mb-3">{editingWorker ? 'Modifica Operaio' : 'Nuovo Operaio'}</h3>
                <form onSubmit={handleWorkerSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-3">
                     <div className="md:col-span-2">
                        <input 
                            type="text" 
                            placeholder="Nome e Cognome" 
                            value={workerName}
                            onChange={e => setWorkerName(e.target.value)}
                            className="w-full p-2 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                            autoFocus
                            required
                        />
                     </div>
                    <div>
                        <input 
                            list="roles-list"
                            type="text" 
                            placeholder="Ruolo (es. Muratore)" 
                            value={workerRole}
                            onChange={e => setWorkerRole(e.target.value)}
                            className="w-full p-2 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                        />
                        <datalist id="roles-list">
                            {commonConstructionRoles.map(role => (
                                <option key={role} value={role} />
                            ))}
                        </datalist>
                    </div>
                    <select 
                        value={workerStatus} 
                        onChange={e => setWorkerStatus(e.target.value as any)}
                        className="p-2 text-sm border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    >
                        <option value="active">Attivo</option>
                        <option value="inactive">Non attivo</option>
                    </select>
                    <div className="md:col-span-4 flex justify-end gap-2 pt-2">
                        <button type="button" onClick={closeWorkerForm} className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-700 dark:text-white dark:border-gray-600">Annulla</button>
                        <button type="submit" className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">Salva</button>
                    </div>
                </form>
            </div>
        )}

        <div className="flex-grow overflow-y-auto">
            <table className="w-full text-left text-sm text-gray-600 dark:text-gray-300">
                <thead className="bg-gray-100 dark:bg-gray-700 uppercase text-xs font-medium text-gray-500 dark:text-gray-400 sticky top-0 z-10">
                    <tr>
                        <th className="px-4 py-3">Nome</th>
                        <th className="px-4 py-3">Ruolo</th>
                        <th className="px-4 py-3">Squadra</th>
                        <th className="px-4 py-3 text-center">Stato</th>
                        {!isViewOnly && <th className="px-4 py-3 text-right">Azioni</th>}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {filteredWorkers.length === 0 ? (
                        <tr>
                            <td colSpan={5} className="px-4 py-8 text-center text-gray-500 italic">
                                Nessun operaio trovato in questa lista.
                            </td>
                        </tr>
                    ) : (
                        filteredWorkers.map(worker => {
                            const team = teams.find(t => t.id === worker.teamId);
                            return (
                                <tr key={worker.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group">
                                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                                        </svg>
                                        {worker.name}
                                    </td>
                                    <td className="px-4 py-3">{worker.role || '-'}</td>
                                    <td className="px-4 py-3">
                                        {isViewOnly ? (
                                             <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: team ? `${team.color}20` : '#f3f4f6', color: team ? team.color : '#6b7280' }}>
                                                {team ? team.name : 'Non assegnato'}
                                            </span>
                                        ) : (
                                            <select 
                                                value={worker.teamId || 'unassigned'} 
                                                onChange={(e) => handleMoveWorker(worker, e.target.value)}
                                                className="text-xs border-none bg-transparent focus:ring-0 cursor-pointer py-0 pl-0 pr-6 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                                                style={{ color: team ? team.color : '#6b7280', fontWeight: 500 }}
                                            >
                                                <option value="unassigned">Non assegnato</option>
                                                {teams.map(t => (
                                                    <option key={t.id} value={t.id} className="text-gray-900">{t.name}</option>
                                                ))}
                                            </select>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className={`inline-flex w-2.5 h-2.5 rounded-full ${worker.status === 'active' ? 'bg-green-500 shadow-sm shadow-green-200' : 'bg-gray-300'}`} title={worker.status === 'active' ? 'Attivo' : 'Non attivo'}></span>
                                    </td>
                                    {!isViewOnly && (
                                        <td className="px-4 py-3 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => openWorkerForm(worker)} className="text-blue-600 hover:text-blue-800 mx-1 p-1 hover:bg-blue-50 rounded"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg></button>
                                            <button onClick={() => onDeleteWorker(worker.id)} className="text-red-600 hover:text-red-800 mx-1 p-1 hover:bg-red-50 rounded"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg></button>
                                        </td>
                                    )}
                                </tr>
                            );
                        })
                    )}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};

export default TeamManagementView;
