
import React, { useState } from 'react';
import { validateLicenseKey, verifyAdminPassword } from '../services/licenseService';

interface LoginProps {
  onLoginSuccess: (email: string, isAdmin: boolean, validityDays: number) => Promise<void>;
  onEnterDemoMode: () => void;
}

const ADMIN_EMAIL = 'gecolakey@gmail.com';

const Login: React.FC<LoginProps> = ({ onLoginSuccess, onEnterDemoMode }) => {
  const [email, setEmail] = useState('');
  const [credential, setCredential] = useState('');
  const [showCredential, setShowCredential] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isEmailAdmin = email.toLowerCase().trim() === ADMIN_EMAIL;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    // Give a small delay for better UX
    await new Promise(res => setTimeout(res, 500));
    
    const trimmedEmail = email.trim().toLowerCase();

    if (trimmedEmail === 'caramella@libero.it') {
        setError('La licenza per questo account è scaduta. Contattare il supporto per il rinnovo.');
        setIsLoading(false);
        return;
    }

    try {
        if (isEmailAdmin) {
            // Admin login with secure password verification (HASH)
            const isValidPassword = await verifyAdminPassword(credential);
            
            if (isValidPassword) {
                await onLoginSuccess(trimmedEmail, true, 9999); // Admin gets a perpetual license
            } else {
                throw new Error('Email o password non corretti.');
            }
        } else {
            // Regular user license key validation
            const result = await validateLicenseKey(trimmedEmail, credential);

            if (result.isValid && result.validityDays !== null) {
                await onLoginSuccess(trimmedEmail, false, result.validityDays);
            } else {
                throw new Error('L\'email o la chiave di licenza non sono valide. Riprova.');
            }
        }
    } catch (err: any) {
        setError(err.message || "Si è verificato un errore sconosciuto.");
        setIsLoading(false); // Only set loading false on error; success will unmount the component
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center space-x-3 mb-8">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-indigo-600 dark:text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <div>
                <h1 className="text-4xl font-bold leading-tight text-gray-900 dark:text-white">
                Chronos AI
                </h1>
                <p className="text-md text-gray-500 dark:text-gray-400">Project Scheduler Login</p>
            </div>
        </div>

        <div className="bg-white dark:bg-gray-800 shadow-2xl rounded-2xl p-8">
          <p className="text-center text-gray-600 dark:text-gray-300 mb-6">
            Inserisci le tue credenziali per accedere.
          </p>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                placeholder="you@example.com"
              />
            </div>

            <div>
                <label htmlFor="credential" className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  {isEmailAdmin ? 'Password' : 'Password / Chiave di Licenza'}
                </label>
                <div className="mt-1 relative">
                    <input
                        id="credential"
                        name="credential"
                        type={showCredential ? 'text' : 'password'}
                        required
                        value={credential}
                        onChange={(e) => setCredential(e.target.value)}
                        className="block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        placeholder={isEmailAdmin ? '••••••••' : 'XXXX-XXXX-XXXX-XXXX-XXXX'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCredential(!showCredential)}
                      className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 dark:text-gray-400"
                      aria-label={showCredential ? 'Hide credential' : 'Show credential'}
                    >
                      {showCredential ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a10.05 10.05 0 013.4-5.275M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5C7.523 5 3.732 7.943 2.458 12a10.05 10.05 0 003.4 5.275" /></svg>
                      )}
                    </button>
                </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-500 rounded-md">
                <p className="text-sm text-red-700 dark:text-red-300 text-center">{error}</p>
              </div>
            )}
            
            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400 dark:disabled:bg-indigo-800 transition-colors"
              >
                {isLoading ? (
                    <div className="w-5 h-5 border-2 border-dashed rounded-full animate-spin border-white"></div>
                ) : (
                    'Accedi / Attiva'
                )}
              </button>
            </div>
          </form>
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={onEnterDemoMode}
              className="font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors"
            >
              Prova la demo gratuita
            </button>
          </div>
        </div>
        <p className="mt-8 text-center text-xs text-gray-500 dark:text-gray-400">
          Distribuito da AETERNA S.r.l - Milano
        </p>
      </div>
    </div>
  );
};

export default Login;
