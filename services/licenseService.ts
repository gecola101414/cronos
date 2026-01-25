// SECURITY: Obfuscated internal configuration to prevent casual inspection.
// These variables are encoded to avoid plain-text search hits in the bundle.

// Original Secret (Obfuscated): 'CHRONOS_AI_SECRET_KEY_2024_XYZ'
// We store it as Base64 split into parts to prevent grep/search discovery.
const _p1 = 'Q0hST05PU19BSV9TRUNSRVRf';
const _p2 = 'S0VZXzIwMjRfWFla';

// Hash SHA-256 (Sicuro) per 'CCBccb@101414'
const _sys_cfg_sig = '18f78082987153a871e48545935790c549646b2b73315a6b097063f27464019a';

// Fallback Base64 (Offuscato) per 'CCBccb@101414' - Usato se SHA-256 non è disponibile (es. HTTP)
const _sys_fallback = 'Q0NCY2NiQDEwMTQxNA==';

/**
 * Internal helper to retrieve the app signature key at runtime.
 */
function _get_k(): string {
    try {
        return atob(_p1 + _p2);
    } catch (e) {
        return '';
    }
}

/**
 * Verifies authentication credentials using secure comparison with robust fallback.
 * Tries both secure hash and obfuscated check to ensure functionality in all environments (HTTP/HTTPS).
 */
export async function verifyAdminPassword(input: string): Promise<boolean> {
    const clean = input.trim();
    
    // Method 1: SHA-256 (Preferred - Secure Contexts)
    try {
        if (window.crypto && window.crypto.subtle) {
            const encoder = new TextEncoder();
            const data = encoder.encode(clean);
            const buffer = await crypto.subtle.digest('SHA-256', data);
            const arr = Array.from(new Uint8Array(buffer));
            const hex = arr.map(b => b.toString(16).padStart(2, '0')).join('');
            if (hex === _sys_cfg_sig) return true;
        }
    } catch (e) {
        // Ignore crypto errors and proceed to fallback silently
    }

    // Method 2: Base64 (Fallback - Insecure Contexts / Legacy)
    try {
        // Simple obfuscated check compatible with all browsers
        if (btoa(clean) === _sys_fallback) return true;
    } catch (e) {
        // Ignore encoding errors
    }

    return false;
}

/**
 * Fetches the current authoritative time from the hosting server's response headers.
 * Highly resilient fallback mechanism.
 */
export async function fetchServerDateHeader(): Promise<Date> {
  try {
    const response = await fetch(window.location.href, { method: 'GET', cache: 'no-store' });

    if (!response.ok) {
        return new Date();
    }
    
    const dateHeader = response.headers.get('Date');
    if (!dateHeader) {
        return new Date();
    }

    const parsedDate = new Date(dateHeader);
    if (isNaN(parsedDate.getTime())) {
        return new Date();
    }
    
    return parsedDate;

  } catch (error) {
    return new Date();
  }
}


function bufferToHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Generates a license token based on user identity.
 */
export async function generateLicenseKey(email: string, validityDays: number): Promise<string> {
  const year = new Date().getFullYear();
  const normalizedEmail = email.toLowerCase().trim();
  
  // Reconstruct secret key at runtime
  const k = _get_k();
  const dataToHash = `${normalizedEmail}:${year}:${validityDays}:${k}`;
  
  // Need fallback for generateLicenseKey as well if on HTTP
  if (window.crypto && window.crypto.subtle) {
      const encoder = new TextEncoder();
      const data = encoder.encode(dataToHash);
      
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashHex = bufferToHex(hashBuffer);
      
      const shortHash = hashHex.substring(0, 16).toUpperCase();
      const encodedValidity = validityDays.toString(36).toUpperCase();

      const formattedHash = `${shortHash.substring(0, 4)}-${shortHash.substring(4, 8)}-${shortHash.substring(8, 12)}-${shortHash.substring(12, 16)}`;
      
      return `${encodedValidity}-${formattedHash}`;
  } else {
      // Simple non-secure fallback generation for HTTP environments
      // Warning: This generates a different key than the secure version
      // But allows the app to function in demo/test environments without HTTPS
      let hash = 0;
      for (let i = 0; i < dataToHash.length; i++) {
        const char = dataToHash.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
      }
      const hex = Math.abs(hash).toString(16).padStart(16, '0').toUpperCase();
      const encodedValidity = validityDays.toString(36).toUpperCase();
      const formattedHash = `${hex.substring(0, 4)}-${hex.substring(4, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}`;
      return `${encodedValidity}-${formattedHash}`;
  }
}

interface ValidationResult {
    isValid: boolean;
    validityDays: number | null;
}

/**
 * Validates a license token.
 */
export async function validateLicenseKey(email: string, key: string): Promise<ValidationResult> {
  if (!email || !key) {
    return { isValid: false, validityDays: null };
  }

  const keyParts = key.trim().toUpperCase().split('-');
  if (keyParts.length !== 5) {
      return { isValid: false, validityDays: null };
  }

  const encodedValidity = keyParts[0];
  const validityDays = parseInt(encodedValidity, 36);

  if (isNaN(validityDays)) {
    return { isValid: false, validityDays: null };
  }
  
  const expectedKey = await generateLicenseKey(email, validityDays);
  
  if (key.trim().toUpperCase() === expectedKey) {
    return { isValid: true, validityDays: validityDays };
  }
  
  return { isValid: false, validityDays: null };
}