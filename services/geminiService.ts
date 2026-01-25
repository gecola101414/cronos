
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export interface GeoInsightResult {
  text: string;
  groundingChunks: any[];
}

export async function analyzeBillOfQuantities(textContent: string): Promise<any[]> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analizza questo computo metrico e raggruppa le voci in gruppi di lavorazione logici (WBS). 
    Per ogni gruppo stima una durata in giorni basata sull'importo e la complessità.
    Restituisci un array di oggetti con questo schema:
    {
      "groupName": "Nome del Gruppo",
      "items": [
        {
          "tariffCode": "Codice Tariffa",
          "description": "Descrizione estesa",
          "price": 100.50,
          "quantity": 10,
          "unit": "m2",
          "total": 1005.00,
          "laborRate": 30.5
        }
      ]
    }
    Contenuto del file:
    ${textContent.substring(0, 30000)}`,
    config: {
      responseMimeType: "application/json",
    },
  });

  try {
    const data = JSON.parse(response.text || '[]');
    return data;
  } catch (e) {
    console.error("Errore parsing AI:", e);
    return [];
  }
}

export async function analyzePrimusPdf(pdfBase64: string): Promise<any[]> {
  // Nota: richiede estrazione testo lato client o invio file a Gemini
  throw new Error("Analisi PDF non supportata direttamente in questa build. Copia il testo o usa file .txt/.json");
}

export async function getProjectInsight(projectDocuments: any[], expenses: any[], question: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Sei un assistente esperto in direzione lavori. Progetto: ${JSON.stringify(projectDocuments)}. Spese: ${JSON.stringify(expenses)}. Domanda: ${question}`,
  });
  return response.text || "Non sono riuscito a elaborare una risposta.";
}

export async function getRiskAnalysis(projectDocuments: any[]): Promise<any[]> {
  return [];
}

export async function getGeographicInsight(question: string, projectLocation: string, userLocation: any): Promise<GeoInsightResult> {
  return { text: "Ricerca geografica AI disattivata.", groundingChunks: [] };
}
