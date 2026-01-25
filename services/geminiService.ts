import { GoogleGenAI, Type, GroundingChunk } from "@google/genai";
import { WorkGroup, WorkItem, ProjectDocument, Risk, Expense } from '../types';

if (!process.env.API_KEY) {
  console.warn("API_KEY environment variable not set. AI features will not work.");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

const colorPalette = [
  '#4A90E2', '#50E3C2', '#F5A623', '#F8E71C', '#D0021B',
  '#9013FE', '#B8E986', '#7ED321', '#BD10E0', '#417505',
  '#E67E22', '#1ABC9C', '#3498DB', '#9B59B6', '#E74C3C',
];

const RESPONSE_SCHEMA = {
  type: Type.ARRAY,
  description: "Una lista di tutti i gruppi di lavoro trovati nel documento.",
  items: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: "Il nome del gruppo, preso dalla riga con le parentesi." },
      items: {
        type: Type.ARRAY,
        description: "Una lista di tutte le voci di lavoro estratte per questo gruppo.",
        items: {
          type: Type.OBJECT,
          properties: {
            articleCode: { type: Type.STRING, description: "Il codice articolo dalla riga di tariffa." },
            description: { type: Type.STRING },
            quantity: { type: Type.NUMBER },
            unit: { type: Type.STRING },
            unitPrice: { type: Type.NUMBER },
            total: { type: Type.NUMBER }
          },
          required: ["articleCode", "description", "quantity", "unit", "unitPrice", "total"]
        }
      }
    },
    required: ["name", "items"]
  }
};

/**
 * Processes the raw JSON array returned by the Gemini API into a structured array of WorkGroup objects.
 * Includes data validation and calculation of derived properties like duration and value.
 * @param result The raw array parsed from the Gemini API response.
 * @returns An array of processed WorkGroup objects, ready for the application state.
 */
function processApiResponse(result: any): Omit<WorkGroup, 'startDate' | 'endDate' | 'progress'>[] {
  if (!Array.isArray(result)) {
      throw new Error("AI analysis did not return a valid array of work groups.");
  }
  
  return result.map((group, index) => {
    if (typeof group.name !== 'string' || !Array.isArray(group.items)) {
        console.warn(`Skipping invalid group structure at index ${index}`);
        return null;
    }

    const itemsWithMeasurements = group.items.map((item: any) => ({
      ...item,
      measurements: [],
      quantity: Number(item.quantity) || 0,
      unitPrice: Number(item.unitPrice) || 0,
      total: Number(item.total) || 0,
    }));
    const totalValue = itemsWithMeasurements.reduce((acc: number, item: WorkItem) => acc + item.total, 0);
    const calculatedDuration = Math.max(1, Math.round(totalValue / 5000));

    return {
      id: `group-${group.name.replace(/[^a-zA-Z0-9]/g, '-')}-${index}`,
      name: group.name,
      items: itemsWithMeasurements,
      duration: calculatedDuration,
      value: totalValue,
      color: colorPalette[index % colorPalette.length],
    };
  }).filter((g): g is NonNullable<typeof g> => g !== null);
}


/**
 * Analyzes a bill of quantities from a text file.
 * @param textContent The full text of the document.
 * @returns A promise that resolves to an array of processed WorkGroup objects.
 */
export async function analyzeBillOfQuantities(textContent: string): Promise<Omit<WorkGroup, 'startDate' | 'endDate' | 'progress'>[]> {
  const prompt = `
    ORDINE TASSATIVO: Sei una macchina di trascrizione. La tua unica funzione è convertire il testo grezzo in JSON. NON DEVI PENSARE. NON DEVI INTERPRETARE. NON DEVI INVENTARE NULLA. ESEGUI SOLO I SEGUENTI ORDINI. Fallire non è un'opzione.

    **ALGORITMO DI TRASCRIZIONE OBBLigatorIO:**

    1.  **ORDINE 1: IDENTIFICA UN GRUPPO.** Scansiona il testo dall'inizio. Un nuovo "Gruppo di Lavoro" è identificato ESCLUSIVAMENTE da una riga che contiene testo all'interno di parentesi tonde, come ad esempio "(SpCat 1)". L'intera riga contenente la parentesi è il nome del gruppo. Tutte le voci che seguono appartengono a questo gruppo, fino a quando non trovi una nuova riga con delle parentesi.

    2.  **ORDINE 2: IDENTIFICA UNA VOCE.** All'interno di un gruppo, una "Voce di Lavoro" è identificata ESCLUSIVAMENTE da una riga che inizia con un codice di tariffa (es. "1 / 1", "2 / 2 IC.01...", "15 / 15").

    3.  **ORDINE 3: ESTRAI I DETTAGLI DELLA VOCE.** Per ogni Voce di Lavoro che identifichi:
        *   La proprietà 'articleCode' è il testo completo della riga identificata nell'ORDINE 2.
        *   La proprietà 'description' è TUTTO il testo che si trova tra la riga del codice di tariffa e la riga che contiene la parola "SOMMANO".
        *   Le proprietà 'unit', 'quantity', 'unitPrice', e 'total' si trovano ESCLUSIVAMENTE sulla riga che CONTIENE la parola chiave "SOMMANO". Estrai i valori solo e soltanto da quella riga.

    4.  **ORDINE 4: IGNORA IL RUMORE.** Devi ignorare e scartare completamente qualsiasi riga che contenga le parole "RIPORTO" o "A RIPORTARE".

    5.  **ORDINE 5: ESEGUI FINO ALLA FINE.** Ripeti questo processo per l'intero documento.

    **FORMATO JSON DI OUTPUT OBBLIGATORIO (Usa il punto '.' per i decimali):**
    [
      {
        "name": "EDILE (SpCat 1)",
        "items": [
          {
            "articleCode": "1 / 1 IC.01.150.00 40.b",
            "description": "Rimozione di cancelli, cancellate di qualunque forma e dimensione: - con carico e trasporto ad impianti di stoccaggio, di recupero o a discarica. cancello carraio cancello pedonale cancello locale tecnico impianti",
            "unit": "m²",
            "quantity": 16.09,
            "unitPrice": 6.68,
            "total": 107.48
          }
        ]
      }
    ]
    ---
    TESTO GREZZO DA TRASCRIVERE:
    ${textContent}
    ---
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA
      }
    });

    const jsonText = response.text;
    const result = JSON.parse(jsonText);
    return processApiResponse(result);

  } catch (error) {
    console.error("Error during AI analysis:", error);
    throw new Error("The document could not be analyzed. The AI service might be temporarily unavailable or the document format has issues.");
  }
}

/**
 * Analyzes a bill of quantities from a Primus PDF file.
 * @param pdfBase64 The base64-encoded string of the PDF file.
 * @returns A promise that resolves to an array of processed WorkGroup objects.
 */
export async function analyzePrimusPdf(pdfBase64: string): Promise<Omit<WorkGroup, 'startDate' | 'endDate' | 'progress'>[]> {
    const prompt = `
    ORDINE TASSATIVO: Sei una macchina di trascrizione specializzata nell'analizzare file PDF di computi metrici generati dal software PRIMUS. La tua unica funzione è estrarre i dati e convertirli nel formato JSON specificato. NON DEVI PENSARE. NON DEVI INTERPRETARE. NON DEVI INVENTARE NULLA. ESEGUI SOLO I SEGUENTI ORDINI. Fallire non è un'opzione. Il file PDF da analizzare è fornito come input.

    **ALGORITMO DI TRASCRIZIONE OBBLigatorIO:**

    1.  **ORDINE 1: IDENTIFICA UN GRUPPO.** Scansiona il documento. Un nuovo "Gruppo di Lavoro" è identificato ESCLUSIVAMENTE da una riga che contiene testo all'interno di parentesi tonde, come ad esempio "(SpCat 1)". L'intera riga contenente la parentesi è il nome del gruppo. Tutte le voci che seguono appartengono a questo gruppo, fino a quando non trovi una nuova riga con delle parentesi.

    2.  **ORDINE 2: IDENTIFICA UNA VOCE.** All'interno di un gruppo, una "Voce di Lavoro" è identificata ESCLUSIVAMENTE da una riga che inizia con un codice di tariffa (es. "1 / 1", "2 / 2 IC.01...", "15 / 15").

    3.  **ORDINE 3: ESTRAI I DETTAGLI DELLA VOCE.** Per ogni Voce di Lavoro che identifichi:
        *   La proprietà 'articleCode' è il testo completo della riga identificata nell'ORDINE 2.
        *   La proprietà 'description' è TUTTO il testo che si trova tra la riga del codice di tariffa e la riga che contiene la parola "SOMMANO".
        *   Le proprietà 'unit', 'quantity', 'unitPrice', e 'total' si trovano ESCLUSIVAMENTE sulla riga che CONTIENE la parola chiave "SOMMANO". Estrai i valori solo e soltanto da quella riga.

    4.  **ORDINE 4: IGNORA IL RUMORE.** Devi ignorare e scartare completamente qualsiasi riga che contenga le parole "RIPORTO" o "A RIPORTARE".

    5.  **ORDINE 5: ESEGUI FINO ALLA FINE.** Ripeti questo processo per l'intero documento PDF.

    **FORMATO JSON DI OUTPUT OBBLIGATORIO (Usa il punto '.' per i decimali):**
    [
      {
        "name": "EDILE (SpCat 1)",
        "items": [
          {
            "articleCode": "1 / 1 IC.01.150.00 40.b",
            "description": "Rimozione di cancelli, cancellate di qualunque forma e dimensione: - con carico e trasporto ad impianti di stoccaggio, di recupero o a discarica. cancello carraio cancello pedonale cancello locale tecnico impianti",
            "unit": "m²",
            "quantity": 16.09,
            "unitPrice": 6.68,
            "total": 107.48
          }
        ]
      }
    ]
  `;
  try {
     const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: { 
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA
      }
    });

    const jsonText = response.text;
    const result = JSON.parse(jsonText);
    return processApiResponse(result);

  } catch (error) {
    console.error("Error during AI PDF analysis:", error);
    throw new Error("The PDF document could not be analyzed. The AI service might be temporarily unavailable or the document format has issues.");
  }
}


export async function getProjectInsight(projectDocuments: ProjectDocument[], expenses: Expense[], question: string): Promise<string> {
  const projectContext = JSON.stringify(projectDocuments, null, 2);
  const expensesContext = JSON.stringify(expenses, null, 2);

  const prompt = `
    Sei un assistente di project management estremamente competente e amichevole. Il tuo compito è rispondere a domande su un progetto di costruzione basandoti sui dati forniti. Analizza sia i dati del cronoprogramma/computo sia i dati delle spese. Sii conciso, preciso e usa un tono professionale ma accessibile. Formatta i numeri e le valute in modo chiaro (es. € 1.234,56).

    **CONTESTO DATI PROGETTO (Cronoprogramma e Computo):**
    \`\`\`json
    ${projectContext}
    \`\`\`

    **CONTESTO DATI ECONOMICI (Spese Sostenute):**
    \`\`\`json
    ${expensesContext}
    \`\`\`

    **DOMANDA DELL'UTENTE:**
    "${question}"

    **RISPOSTA:**
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Error getting project insight:", error);
    return "Mi dispiace, ma non sono riuscito a elaborare la tua richiesta in questo momento. Potrebbe esserci un problema con il servizio AI.";
  }
}

export async function getRiskAnalysis(projectDocuments: ProjectDocument[]): Promise<Risk[]> {
  const context = JSON.stringify(projectDocuments, null, 2);

  const prompt = `
    COMPITO: Analizza il cronoprogramma di costruzione e il computo metrico forniti (in formato JSON) per identificare potenziali rischi. La tua risposta DEVE essere in italiano.
    RUOLO: Sei un esperto senior project manager e analista dei rischi per grandi progetti di costruzione.
    
    ISTRUZIONI:
    1.  Esamina attentamente tutti i dati del progetto, inclusi i gruppi di lavoro, le loro durate, i valori, le date di inizio/fine e l'avanzamento.
    2.  Identifica i rischi potenziali. Considera fattori come:
        *   **Compressione della Schedulazione:** Lavorazioni con alto valore economico ma durate molto brevi.
        *   **Colli di Bottiglia:** Lavorazioni critiche da cui potrebbero dipendere molte attività successive (anche se non esplicitamente definite).
        *   **Superamento dei Costi:** Gruppi di alto valore soggetti a fluttuazioni di prezzo.
        *   **Attività senza Margine (Zero-Float):** Lavorazioni consecutive senza alcun tempo di buffer tra di loro.
        *   **Lavori Incompleti:** Gruppi di lavoro che sono iniziati (hanno misurazioni) ma hanno un basso avanzamento rispetto al tempo trascorso.
    3.  Per ogni rischio identificato, fornisci una descrizione concisa, valuta il suo potenziale impatto e la probabilità, e suggerisci una strategia pratica di mitigazione.
    4.  Restituisci SOLO un array JSON di oggetti di rischio. Non includere alcun altro testo, spiegazione o markdown. La tua risposta deve essere esclusivamente il JSON.

    DATI DEL PROGETTO:
    \`\`\`json
    ${context}
    \`\`\`
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          description: "Una lista di potenziali rischi di progetto.",
          items: {
            type: Type.OBJECT,
            properties: {
              risk: { type: Type.STRING, description: "Una descrizione concisa del rischio identificato." },
              impact: { type: Type.STRING, enum: ['Alto', 'Medio', 'Basso'], description: "Il potenziale impatto del rischio se si verifica." },
              likelihood: { type: Type.STRING, enum: ['Alto', 'Medio', 'Basso'], description: "La probabilità che il rischio si verifichi." },
              suggestion: { type: Type.STRING, description: "Un suggerimento pratico per mitigare o gestire il rischio." }
            },
            required: ["risk", "impact", "likelihood", "suggestion"]
          }
        }
      }
    });

    const jsonText = response.text;
    const result = JSON.parse(jsonText) as Risk[];
    return result;

  } catch (error) {
    console.error("Error during AI risk analysis:", error);
    throw new Error("The risk analysis could not be completed. The AI service might be temporarily unavailable or there was an issue processing the project data.");
  }
}

export interface GeoInsightResult {
  text: string;
  groundingChunks: GroundingChunk[] | undefined;
}

export async function getGeographicInsight(
  question: string,
  projectLocation: string,
  userLocation: { latitude: number; longitude: number }
): Promise<GeoInsightResult> {
  
  const fullQuestion = `${question} (Il progetto si trova a: "${projectLocation}")`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: fullQuestion,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            latLng: userLocation
          }
        }
      },
    });
    
    return {
      text: response.text,
      groundingChunks: response.candidates?.[0]?.groundingMetadata?.groundingChunks
    };

  } catch (error) {
    console.error("Error getting geographic insight:", error);
    throw new Error("The geographic query could not be completed. The AI service might be temporarily unavailable.");
  }
}