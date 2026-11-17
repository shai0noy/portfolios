export function toBase64Url(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function fromBase64Url(base64Url) {
  const padded = base64Url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((base64Url.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function encodeJsonBase64Url(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  return toBase64Url(bytes);
}

export function decodeJsonBase64Url(str) {
  const bytes = fromBase64Url(str);
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function sha256Hex(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function deriveAesKey(secret, usages) {
  if (!secret) {
    throw new Error('Server encryption secret is not configured');
  }
  const secretBytes = new TextEncoder().encode(secret);
  const keyHash = await crypto.subtle.digest('SHA-256', secretBytes);
  return crypto.subtle.importKey('raw', keyHash, { name: 'AES-GCM' }, false, usages);
}

export async function sealJson(payload, secret) {
  const key = await deriveAesKey(secret, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  return toBase64Url(combined);
}

export async function unsealJson(token, secret) {
  const combined = fromBase64Url(token);
  if (combined.length <= 12) {
    throw new Error('Malformed encrypted token');
  }
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const key = await deriveAesKey(secret, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintext));
}
