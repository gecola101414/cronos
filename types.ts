
export interface WorkItem {
  articleCode: string;
  description: string;
  quantity: number; // Original Contract Quantity
  unit: string;
  unitPrice: number;
  total: number;
  measurements?: Measurement[];
  annotations?: Annotation[]; // New: Diary entries
  variations?: Variation[]; // New: Variations (Increases/Decreases)
  laborRate?: number; // NEW: Labor Incidence Percentage (e.g. 3.48)
  laborValue?: number; // NEW: Total Labor Value (e.g. total * laborRate / 100)
}

export interface Variation {
  id: string;
  number: string; // e.g. "Perizia 1", "CPA 2"
  date: string;
  type: 'increase' | 'decrease';
  quantity: number; // Absolute value of the change
  note?: string;
}

export interface Annotation {
  id: string;
  text: string;
  timestamp: string; // ISO format, automatically set
}

export interface Measurement {
  id: string; // UUID v4 unique identifier for strict accounting linkage
  date: string; // ISO format 'yyyy-MM-dd'
  quantity: number;
  note: string; // Acts as 'Descrizione_Lavorazione' / 'Posizione_Rilievo' combination
  teamId?: string; 
  workerIds?: string[]; 
  location?: string; // Specific location field
  // Dimensional factors for detailed accounting
  factor?: number;
  length?: number;
  width?: number;
  height?: number;
  _isCommitted?: boolean;
}

export type AccountingType = 'measure' | 'body'; // 'measure' = A Misura, 'body' = A Corpo

export interface WorkGroup {
  id: string;
  name:string;
  duration: number; // in days
  value: number; // monetary value
  color: string;
  startDate: string; // ISO format 'yyyy-MM-dd'
  endDate: string; // ISO format 'yyyy-MM-dd'
  progress: number; // Percentage, 0-100
  items: WorkItem[];
  officialStartDate?: string; // ISO format 'yyyy-MM-dd'
  isSecurityCost?: boolean; // Flag for "Oneri Sicurezza" (not subject to discount)
  accountingType?: AccountingType; // NEW: Type of accounting (A Misura vs A Corpo)
}

export type DependencyType = 'FS' | 'SS' | 'FF' | 'SF';

export interface Dependency {
  id: string;
  from: string; // predecessor task id
  to: string; // successor task id
  type: DependencyType;
  lag: number; // in days, can be negative for lead time
}

export interface Team {
  id: string;
  name: string;
  color: string;
}

export interface Worker {
  id: string;
  name: string; // Name and Surname
  role: string; // e.g., Caposquadra, Manovale
  status: 'active' | 'inactive';
  teamId?: string; // Current team assignment
}

export interface ProjectDocument {
  fileName: string;
  workGroups: WorkGroup[];
  totalValue: number;
  dependencies?: Dependency[];
  salMarkers?: number[];
  isVisible?: boolean;
  isFrozen?: boolean;
  isLocked?: boolean;
  location?: string;
}

export interface Risk {
  risk: string;
  impact: 'Alto' | 'Medio' | 'Basso';
  likelihood: 'Alto' | 'Medio' | 'Basso';
  suggestion: string;
}

export const expenseCategories = [
  'Personale',
  'Materiali',
  'Noleggi',
  'Subappalti',
  'Spese Generali',
] as const;

export type ExpenseCategory = typeof expenseCategories[number];

export interface Expense {
  id: string;
  date: string; // ISO 'yyyy-MM-dd' - Data del pagamento/fattura
  description: string;
  category: ExpenseCategory;
  amount: number;
  relatedWorkGroupId?: string; // Optional link to a WorkGroup
  invoiceNumber?: string;
  insertionDate: string; // ISO string for when the expense was created
  expectedSupplyDate?: string; // ISO 'yyyy-MM-dd' - Data prevista arrivo merce/servizio
}

export interface ContractConfig {
    discountPercent: number; // Ribasso d'asta %
    withholdingTaxPercent: number; // Ritenuta di garanzia % (es. 0.5%)
    vatPercent: number; // IVA %
    contractCode?: string; // CIG/CUP
    contractorName?: string; // Impresa Appaltatrice
    contractDate?: string; 
    advancePaymentPercent?: number; // Recupero Anticipazione %
    excludeLaborFromDiscount?: boolean; // Scorpora Costo Manodopera dal Ribasso
}

export interface SalEntry {
    id: string;
    number: number; // Progressive number (1, 2, 3...)
    date: string; // ISO Date of the SAL cutoff
    description?: string; // e.g. "SAL n. 1 a tutto il..."
    totalAmount: number; // Calculated gross amount at that time
    isLocked?: boolean; // If true, the SAL is finalized and cannot be edited/deleted
}

export interface SavedProject {
  id: string;
  name: string;
  location?: string;
  lastModified: string;
  status?: 'active' | 'archived';
  contractConfig?: ContractConfig; 
  data: {
    projectDocuments: ProjectDocument[];
    expenses: Expense[];
    teams?: Team[];
    workers?: Worker[];
    sals?: SalEntry[]; // History of SALs
  };
}

export type View = 'dashboard' | 'timeline' | 'summary' | 'measurements' | 'sal-report' | 'costs' | 'teams' | 'reports' | 'help' | 'accounting' | 'external-computo';
