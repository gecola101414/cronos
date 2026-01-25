import React, { useState, useEffect, useMemo } from 'react';
import { ProjectDocument } from '../types';
import { getGeographicInsight, GeoInsightResult } from '../services/geminiService';
import { GroundingChunk } from '@google/genai';

interface MapViewProps {
  documents: ProjectDocument[];
}

const MapView: React.FC<MapViewProps> = ({ documents }) => {
  const [projectLocation, setProjectLocation] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<GeoInsightResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    const location = documents.find(doc => doc.location)?.location || null;
    setProjectLocation(location);
  }, [documents]);
  
  const handleRequestLocation = () => {
    setLocationError(null);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          setLocationError(`Errore nel recuperare la posizione: ${error.message}. Assicurati di aver concesso i permessi.`);
          console.error("Geolocation error:", error);
        }
      );
    } else {
      setLocationError("La geolocalizzazione non è supportata da questo browser.");
    }
  };

  const handleSubmitQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !projectLocation) return;
    
    if (!userLocation) {
        alert("Per favore, consenti l'accesso alla tua posizione per ottenere risultati più pertinenti.");
        handleRequestLocation();
        return;
    }

    setIsLoading(true);
    setAiResponse(null);
    setAiError(null);

    try {
      const result = await getGeographicInsight(query, projectLocation, userLocation);
      setAiResponse(result);
    } catch (err: any) {
      setAiError(err.message || 'Si è verificato un errore sconosciuto.');
    } finally {
      setIsLoading(false);
    }
  };
  
  const mapSrc = useMemo(() => {
    if (!projectLocation) return '';
    const encodedLocation = encodeURIComponent(projectLocation);
    return `https://maps.google.com/maps?q=${encodedLocation}&t=&z=13&ie=UTF8&iwloc=&output=embed`;
  }, [projectLocation]);

  if (!projectLocation) {
    return (
      <div className="flex items-center justify-center h-full p-8 text-center">
        <div>
          <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300">Nessuna Posizione Definita</h3>
          <p className="mt-2 text-gray-500 dark:text-gray-400">Nessun documento in questo progetto ha una posizione specificata. Aggiungi una posizione per visualizzare la mappa.</p>
        </div>
      </div>
    );
  }

  const renderGroundingChunk = (chunk: GroundingChunk, index: number) => {
    if (chunk.maps) {
        return (
            <a href={chunk.maps.uri} target="_blank" rel="noopener noreferrer" key={index} className="block p-3 bg-blue-50 dark:bg-blue-900/40 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors">
                <p className="font-semibold text-blue-800 dark:text-blue-300">{chunk.maps.title}</p>
                {chunk.maps.placeAnswerSources?.reviewSnippets && chunk.maps.placeAnswerSources.reviewSnippets.length > 0 && (
                     <blockquote className="mt-2 text-sm text-gray-600 dark:text-gray-400 border-l-4 border-blue-300 pl-3 italic">
                        "{ (chunk.maps.placeAnswerSources.reviewSnippets[0] as any).content }"
                    </blockquote>
                )}
            </a>
        );
    }
    return null;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-4 md:p-6 h-full">
      <div className="lg:col-span-1 flex flex-col space-y-6">
        {/* AI Assistant Panel */}
        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl shadow-md flex-grow flex flex-col">
           <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-2">Assistente Geografico</h3>
           <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
             Fai una domanda sulla zona del cantiere (a <span className="font-semibold">{projectLocation}</span>).
           </p>

           {(!userLocation && !locationError) && (
             <button onClick={handleRequestLocation} className="mb-4 w-full text-sm text-blue-700 dark:text-blue-300 hover:underline">
                 Attiva la tua posizione per risultati migliori
             </button>
           )}
           {locationError && <p className="mb-4 text-xs text-red-600 dark:text-red-400">{locationError}</p>}
           
           <form onSubmit={handleSubmitQuery} className="flex space-x-2">
             <input
               type="text"
               value={query}
               onChange={(e) => setQuery(e.target.value)}
               placeholder="Es: fornitori edili vicini..."
               className="flex-1 px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
               disabled={isLoading}
             />
             <button
               type="submit"
               className="px-4 py-2 font-semibold text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:bg-indigo-400"
               disabled={isLoading || !query.trim()}
             >
               {isLoading ? '...' : 'Chiedi'}
             </button>
           </form>

           {/* Response Area */}
           <div className="mt-4 flex-grow overflow-y-auto pr-2 -mr-2">
             {isLoading && <p className="text-center text-gray-500 dark:text-gray-400">Ricerca in corso...</p>}
             {aiError && <p className="text-red-600 dark:text-red-400">{aiError}</p>}
             {aiResponse && (
               <div className="space-y-4">
                 <div className="p-3 bg-white dark:bg-gray-700 rounded-lg text-justify">
                   <p className="text-gray-800 dark:text-gray-200">{aiResponse.text}</p>
                 </div>
                 {aiResponse.groundingChunks && aiResponse.groundingChunks.length > 0 && (
                   <div>
                     <h4 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">Risorse da Google Maps:</h4>
                     <div className="space-y-2">
                        {aiResponse.groundingChunks.map(renderGroundingChunk)}
                     </div>
                   </div>
                 )}
               </div>
             )}
           </div>
        </div>
      </div>
      {/* Map Panel */}
      <div className="lg:col-span-2 h-[400px] lg:h-full">
         <iframe
          className="w-full h-full border-0 rounded-xl shadow-lg"
          loading="lazy"
          allowFullScreen
          src={mapSrc}>
        </iframe>
      </div>
    </div>
  );
};

export default MapView;