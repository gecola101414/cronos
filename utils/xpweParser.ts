import { ProjectDocument, WorkGroup, WorkItem, ContractConfig } from '../types';
import { addDays, format } from 'date-fns';

const COLOR_PALETTE = [
  '#4A90E2', '#50E3C2', '#F5A623', '#F8E71C', '#D0021B',
  '#9013FE', '#B8E986', '#7ED321', '#BD10E0', '#417505',
  '#E67E22', '#1ABC9C', '#3498DB', '#9B59B6', '#E74C3C',
];

const getChildText = (parent: Element | Document | null, tagNames: string[]): string => {
  if (!parent) return '';
  for (const tag of tagNames) {
    const el = parent.getElementsByTagName(tag)[0];
    if (el && el.textContent) {
      const txt = el.textContent.trim();
      if (txt) return txt;
    }
  }
  return '';
};

const parseItalianOrStandardFloat = (raw: string): number => {
  if (!raw) return 0;
  let cleaned = raw.trim().replace(/\s+/g, '');
  if (!cleaned) return 0;
  if (cleaned.includes(',') && cleaned.includes('.')) {
    // es. 1.234,56
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(',', '.');
  }
  const num = parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
};

export interface ParsedXpweResult {
  document: ProjectDocument;
  projectTitle: string;
  contractConfig: Partial<ContractConfig>;
}

export const parseXpweXmlToProject = (xmlText: string, fallbackName: string): ParsedXpweResult => {
  const trimmed = xmlText.trim();
  if (!trimmed.startsWith('<')) {
    throw new Error('Formato non valido: per la conversione è supportata esclusivamente la versione salvata in formato XML con estensione .xpwe.');
  }

  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(trimmed, 'text/xml');
  const parserError = xmlDoc.getElementsByTagName('parsererror')[0];
  if (parserError) {
    throw new Error('File .xpwe XML non leggibile o danneggiato.');
  }

  const root = xmlDoc.documentElement;
  if (!root || (!root.tagName.toLowerCase().includes('pwe') && xmlDoc.getElementsByTagName('EPItem').length === 0 && xmlDoc.getElementsByTagName('PweElencoPrezzi').length === 0)) {
    throw new Error('Struttura .xpwe non riconosciuta. Esportare o salvare il file con estensione .xpwe.');
  }

  // 1. Dati Generali
  const datiGen = xmlDoc.getElementsByTagName('PweDatiGenerali')[0] || root;
  const projectTitle =
    getChildText(datiGen, ['Oggetto', 'Titolo', 'Descrizione', 'DesSintetica']) || fallbackName;
  const municipalityName = getChildText(datiGen, ['Comune', 'Ente', 'StazioneAppaltante']);
  const provinceName = getChildText(datiGen, ['Provincia']);
  const clientName = getChildText(datiGen, ['Committente']);
  const contractorName = getChildText(datiGen, ['Impresa']);
  const directorOfWorks = getChildText(datiGen, ['DirettoreLavori', 'Progettista']);

  // 2. Categorie / Capitoli
  const categoryMap = new Map<string, { code: string; name: string; isSecurity: boolean }>();
  const categoryTags = ['SCItem', 'CapItem', 'SbCapItem', 'PweSuperCapitolo', 'PweCapitolo', 'PweSottoCapitolo'];
  categoryTags.forEach(tag => {
    const els = Array.from(xmlDoc.getElementsByTagName(tag));
    els.forEach(el => {
      const id = el.getAttribute('ID') || getChildText(el, ['ID', 'Codice']);
      const name = getChildText(el, ['DesSintetica', 'Descrizione', 'DesEstesa', 'Nome']);
      const code = getChildText(el, ['Codice']) || id;
      if (id && name) {
        const isSecurity = name.toLowerCase().includes('sicurezza') || code.toUpperCase().startsWith('S.');
        categoryMap.set(`${tag}:${id}`, { code, name, isSecurity });
        if (!categoryMap.has(id)) {
          categoryMap.set(id, { code, name, isSecurity });
        }
      }
    });
  });

  // 3. Elenco Prezzi (EPItem)
  interface EpEntry {
    id: string;
    tariffCode: string;
    description: string;
    unit: string;
    unitPrice: number;
    laborRate: number;
    categoryKey: string;
  }
  const epMap = new Map<string, EpEntry>();
  const epItems = Array.from(xmlDoc.getElementsByTagName('EPItem'));
  epItems.forEach((ep, idx) => {
    const id = ep.getAttribute('ID') || getChildText(ep, ['ID']) || `EP_${idx + 1}`;
    const tariffCode = getChildText(ep, ['Tariffa', 'Codice', 'Articolo']) || `VOCE.${idx + 1}`;
    const descEstesa = getChildText(ep, ['DesEstesa']);
    const descRidotta = getChildText(ep, ['DesRidotta', 'DesBreve', 'Descrizione']);
    const description = descEstesa || descRidotta || tariffCode;
    const unit = getChildText(ep, ['UnMisura', 'UM', 'Unit']) || 'cad';
    const unitPrice = parseItalianOrStandardFloat(getChildText(ep, ['Prezzo1', 'Prezzo', 'PrezzoUnitario']));
    const laborRate = parseItalianOrStandardFloat(getChildText(ep, ['IncManodopera', 'Manodopera', 'IncMO']));
    const categoryKey =
      getChildText(ep, ['IDSbCap', 'IDCap', 'IDSCap']) ||
      getChildText(ep, ['Categoria', 'WBS']);

    epMap.set(id, {
      id,
      tariffCode,
      description,
      unit,
      unitPrice,
      laborRate,
      categoryKey
    });
  });

  // 4. Voci di Computo / Misurazioni (VCItem)
  const vcItems = Array.from(xmlDoc.getElementsByTagName('VCItem'));
  const groupedItems = new Map<string, { groupName: string; isSecurity: boolean; items: WorkItem[] }>();
  let globalCounter = 1;

  const ensureGroup = (catKey: string, fallbackCatName?: string) => {
    const mappedCat = categoryMap.get(catKey);
    const groupName = mappedCat?.name || fallbackCatName || 'Lavorazioni Principali';
    const isSecurity = mappedCat?.isSecurity || groupName.toLowerCase().includes('sicurezza');
    if (!groupedItems.has(groupName)) {
      groupedItems.set(groupName, { groupName, isSecurity, items: [] });
    }
    return groupedItems.get(groupName)!;
  };

  if (vcItems.length > 0) {
    vcItems.forEach((vc) => {
      const idEp = getChildText(vc, ['IDEP', 'IDElencoPrezzi']);
      const ep = epMap.get(idEp);
      if (!ep) return;

      const sbCap = getChildText(vc, ['IDSbCap']);
      const cap = getChildText(vc, ['IDCap']);
      const sCap = getChildText(vc, ['IDSCap']);
      const catKey = (sbCap && categoryMap.has(`SbCapItem:${sbCap}`) ? `SbCapItem:${sbCap}` : '') ||
        (cap && categoryMap.has(`CapItem:${cap}`) ? `CapItem:${cap}` : '') ||
        (sCap && categoryMap.has(`SCItem:${sCap}`) ? `SCItem:${sCap}` : '') ||
        sbCap || cap || sCap || ep.categoryKey;

      let qty = parseItalianOrStandardFloat(getChildText(vc, ['Quantita', 'QtaTot']));
      if (qty === 0) {
        const rgItems = Array.from(vc.getElementsByTagName('RGItem'));
        if (rgItems.length > 0) {
          qty = rgItems.reduce((acc, rg) => {
            const p = parseItalianOrStandardFloat(getChildText(rg, ['PartiUguali'])) || 1;
            const l = parseItalianOrStandardFloat(getChildText(rg, ['Lunghezza'])) || 1;
            const w = parseItalianOrStandardFloat(getChildText(rg, ['Larghezza'])) || 1;
            const h = parseItalianOrStandardFloat(getChildText(rg, ['H_Peso', 'Altezza'])) || 1;
            const hasAny =
              getChildText(rg, ['PartiUguali']) ||
              getChildText(rg, ['Lunghezza']) ||
              getChildText(rg, ['Larghezza']) ||
              getChildText(rg, ['H_Peso', 'Altezza']);
            const rowQty = hasAny ? p * l * w * h : 0;
            const flags = getChildText(rg, ['Flags']);
            return flags === '2' ? acc - rowQty : acc + rowQty;
          }, 0);
        }
      }

      const grp = ensureGroup(catKey);
      const existing = grp.items.find(i => i.articleCode === ep.tariffCode);
      if (existing) {
        existing.quantity = Math.round((existing.quantity + qty) * 1000) / 1000;
        existing.total = existing.quantity * existing.unitPrice;
        existing.laborValue = existing.total * ((existing.laborRate || 0) / 100);
      } else {
        const total = qty * ep.unitPrice;
        grp.items.push({
          articleCode: ep.tariffCode,
          description: ep.description,
          quantity: Math.round(qty * 1000) / 1000,
          unit: ep.unit,
          unitPrice: ep.unitPrice,
          total,
          laborRate: ep.laborRate,
          laborValue: total * (ep.laborRate / 100),
          measurements: [],
          annotations: [],
          variations: [],
          originalMeasurements: [],
          originalIndex: globalCounter++
        });
      }
    });
  }

  // Fallback se ci sono voci di Elenco Prezzi senza VCItem
  if (groupedItems.size === 0 && epMap.size > 0) {
    epMap.forEach((ep) => {
      const grp = ensureGroup(ep.categoryKey, 'Elenco Prezzi Importato');
      grp.items.push({
        articleCode: ep.tariffCode,
        description: ep.description,
        quantity: 0,
        unit: ep.unit,
        unitPrice: ep.unitPrice,
        total: 0,
        laborRate: ep.laborRate,
        laborValue: 0,
        measurements: [],
        annotations: [],
        variations: [],
        originalMeasurements: [],
        originalIndex: globalCounter++
      });
    });
  }

  if (groupedItems.size === 0) {
    throw new Error('Nessuna voce di computo trovata nel file .xpwe selezionato.');
  }

  let currentDate = new Date();
  const workGroups: WorkGroup[] = Array.from(groupedItems.values()).map((grp, idx) => {
    const totalValue = grp.items.reduce((acc, i) => acc + i.total, 0);
    const teamSize = 2;
    const workingDays = Math.max(3, Math.ceil(totalValue / (240 * teamSize)));
    const startDate = new Date(currentDate);
    const endDate = addDays(startDate, workingDays - 1);
    currentDate = addDays(endDate, 1);

    return {
      id: crypto.randomUUID(),
      name: grp.groupName,
      duration: workingDays,
      teamSize,
      value: totalValue,
      color: COLOR_PALETTE[idx % COLOR_PALETTE.length],
      startDate: format(startDate, 'yyyy-MM-dd'),
      endDate: format(endDate, 'yyyy-MM-dd'),
      progress: 0,
      accountingType: 'measure',
      isSecurityCost: grp.isSecurity,
      items: grp.items
    };
  });

  const document: ProjectDocument = {
    fileName: fallbackName,
    workGroups,
    totalValue: workGroups.reduce((acc, g) => acc + g.value, 0),
    isVisible: true,
    isFrozen: false,
    isLocked: false
  };

  return {
    document,
    projectTitle,
    contractConfig: {
      municipalityName: municipalityName || undefined,
      provinceName: provinceName || undefined,
      clientName: clientName || undefined,
      contractorName: contractorName || undefined,
      directorOfWorks: directorOfWorks || undefined,
      discountPercent: 0,
      withholdingTaxPercent: 0.5,
      vatPercent: 22,
      advancePaymentPercent: 20,
      excludeLaborFromDiscount: false
    }
  };
};
