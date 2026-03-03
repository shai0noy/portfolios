// Utility for encrypting/decrypting secrets using the Web Crypto API
// This creates an encryption key derived from the user's Google Sheet ID 
// to ensure the secret can only be read within the context of their specific sheet.

const FIXED_SALT = "portfolios_app_static_salt_for_key_derivation";

/**
 * Encrypts a secret using AES-GCM and a key derived from the seed.
 * 
 * @param secret The plaintext string you want to encrypt.
 * @param keySeed The account-based secret to derive from (e.g. Google Sheet ID).
 * @returns The base64-encoded encrypted string (including the IV).
 */
export async function encryptSecret(secret: string, keySeed: string): Promise<string> {
    const enc = new TextEncoder();
    
    // Import the seed material
    const keyMaterial = await window.crypto.subtle.importKey(
        "raw",
        enc.encode(keySeed),
        { name: "PBKDF2" },
        false,
        ["deriveBits", "deriveKey"]
    );
    
    // Derive a 256-bit AES-GCM key from the seed using PBKDF2
    const key = await window.crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: enc.encode(FIXED_SALT),
            iterations: 100000,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt"]
    );
    
    // Create an initialization vector (12 bytes is recommended for AES-GCM)
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    // Encrypt the payload
    const encryptedBytes = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        enc.encode(secret)
    );
    
    // Combine IV (first 12 bytes) and Encrypted Payload (the rest)
    const combinedBytes = new Uint8Array(iv.byteLength + encryptedBytes.byteLength);
    combinedBytes.set(iv, 0);
    combinedBytes.set(new Uint8Array(encryptedBytes), iv.byteLength);
    
    // Base64 encode the combined buffer
    let binaryStr = '';
    for (let i = 0; i < combinedBytes.length; i++) {
        binaryStr += String.fromCharCode(combinedBytes[i]);
    }
    return btoa(binaryStr);
}

/**
 * Decrypts a base64-encoded string previously encrypted by encryptSecret.
 * 
 * @param encryptedBase64 The combined Base64 string from encryptSecret.
 * @param keySeed The account-based secret to derive from (e.g. Google Sheet ID).
 * @returns The plaintext string, or the original base64 if it fails.
 */
export async function decryptSecret(encryptedBase64: string, keySeed: string): Promise<string> {
    if (!encryptedBase64 || encryptedBase64.trim() === '') return '';
    try {
        const enc = new TextEncoder();
        const dec = new TextDecoder();
        
        // Base64 decode to binary string, then into Uint8Array
        const binaryStr = atob(encryptedBase64);
        const combinedBytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
            combinedBytes[i] = binaryStr.charCodeAt(i);
        }
        
        // Extract the IV and encrypted payload
        const iv = combinedBytes.slice(0, 12);
        const encryptedData = combinedBytes.slice(12);

        // Import the seed material
        const keyMaterial = await window.crypto.subtle.importKey(
            "raw",
            enc.encode(keySeed),
            { name: "PBKDF2" },
            false,
            ["deriveBits", "deriveKey"]
        );
        
        // Derive the identical AES-GCM key used for encryption
        const key = await window.crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: enc.encode(FIXED_SALT),
                iterations: 100000,
                hash: "SHA-256"
            },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            false,
            ["decrypt"]
        );

        // Decrypt the data
        const decryptedBytes = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            key,
            encryptedData
        );
        
        return dec.decode(decryptedBytes);
    } catch (e) {
        console.error("Crypto decryption failed, falling back to treating as plaintext", e);
        // Fallback for unencrypted historical data or errors
        return encryptedBase64;
    }
}
