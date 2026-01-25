
import React, { useState, useEffect } from 'react';
import { generateLicenseKey } from '../services/licenseService';

interface LicenseGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const LicenseGeneratorModal: React.FC<LicenseGeneratorModalProps> = ({ isOpen, onClose }) => {
  const [email, setEmail] = useState('');
  const [validityDays, setValidityDays] = useState(30);
  const [generatedKey, setGeneratedKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copyButtonText, setCopyButtonText] = useState('Copy');

  // Effect 1: Reset form state ONLY when the modal is opened (isOpen changes to true)
  useEffect(() => {
    if (isOpen) {
      setEmail('');
      setValidityDays(30);
      setGeneratedKey('');
      setIsLoading(false);
      setCopyButtonText('Copy');
    }
  }, [isOpen]);

  // Effect 2: Handle Escape key listener. This can re-run if onClose changes without affecting form state.
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, onClose]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || validityDays < 0) return;

    setIsLoading(true);
    setGeneratedKey('');
    try {
      const key = await generateLicenseKey(email, validityDays);
      setGeneratedKey(key);
    } catch (error) {
      console.error("Failed to generate key:", error);
      setGeneratedKey("Error generating key.");
    } finally {
      setIsLoading(false);
      setCopyButtonText('Copy');
    }
  };

  const handleCopy = () => {
    if (!generatedKey) return;
    navigator.clipboard.writeText(generatedKey).then(() => {
      setCopyButtonText('Copied!');
      setTimeout(() => setCopyButtonText('Copy'), 2000);
    }).catch(err => {
      console.error('Failed to copy key:', err);
    });
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 transition-opacity"
      aria-labelledby="generator-modal-title"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg p-6 bg-white dark:bg-gray-800 rounded-lg shadow-xl transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white" id="generator-modal-title">
              Generatore Chiavi di Licenza
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Crea una nuova chiave per un cliente.</p>
          </div>
          <button
            type="button"
            className="text-gray-400 bg-transparent hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-gray-900 dark:hover:text-white rounded-lg text-sm p-1.5 ml-auto inline-flex items-center"
            onClick={onClose}
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path></svg>
          </button>
        </div>
        
        <form onSubmit={handleGenerate} className="mt-4 space-y-4">
            <div>
              <label htmlFor="customer-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Email / Username Cliente
              </label>
              <input
                id="customer-email"
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="cliente@esempio.com o Nome Cliente"
                className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>
            
             <div>
              <label htmlFor="validity-days" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Validità (giorni)
              </label>
              <input
                id="validity-days"
                type="number"
                required
                min="0"
                value={validityDays}
                onChange={(e) => setValidityDays(parseInt(e.target.value, 10))}
                className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Usa 9999 per una licenza perpetua.</p>
            </div>


            <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400 dark:disabled:bg-indigo-800 transition-colors"
              >
                {isLoading ? (
                    <div className="w-5 h-5 border-2 border-dashed rounded-full animate-spin border-white"></div>
                ) : (
                    'Genera Chiave'
                )}
              </button>
        </form>

        {generatedKey && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
             <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Chiave Generata
            </label>
            <div className="flex space-x-2">
                <input
                type="text"
                readOnly
                value={generatedKey}
                className="flex-1 px-3 py-2 font-mono text-sm bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 select-all"
                />
                <button
                onClick={handleCopy}
                className="px-4 py-2 text-sm font-semibold text-white bg-purple-600 rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 w-24 transition-colors"
                >
                {copyButtonText}
                </button>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-600 rounded-md hover:bg-gray-200 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};

export default LicenseGeneratorModal;
