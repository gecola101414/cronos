import React, { useEffect, useState } from 'react';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  link: string;
}

const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, link }) => {
  const [copyButtonText, setCopyButtonText] = useState('Copy Link');

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    if (isOpen) {
        window.addEventListener('keydown', handleEsc);
        setCopyButtonText('Copy Link'); // Reset button text when modal opens
    }
    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, onClose]);

  const handleCopy = () => {
    navigator.clipboard.writeText(link).then(() => {
      setCopyButtonText('Copied!');
      setTimeout(() => setCopyButtonText('Copy Link'), 2000);
    }).catch(err => {
      console.error('Failed to copy link:', err);
      alert('Failed to copy link.');
    });
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 transition-opacity"
      aria-labelledby="share-modal-title"
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
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white" id="share-modal-title">
              Share Simulation Link
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">Anyone with this link can view the project and simulate payments.</p>
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
        
        <div className="mt-4">
          <label htmlFor="share-link" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Project Link
          </label>
          <div className="flex space-x-2">
            <input
              id="share-link"
              type="text"
              readOnly
              value={link}
              className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 text-sm"
            />
            <button
              onClick={handleCopy}
              className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 w-28 transition-colors"
            >
              {copyButtonText}
            </button>
          </div>
        </div>

        <div className="mt-6 flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-600 rounded-md hover:bg-gray-200 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareModal;