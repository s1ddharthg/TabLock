/**
 * Crypto utility for TabLocker extension.
 * PBKDF2-SHA256: 100,000 iterations, 16-byte random salt, 256-bit key.
 * Passwords are never stored in plaintext.
 */

function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

async function pbkdf2(password, salt) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  return new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 },
    key, 256
  ));
}

/**
 * Hash a password with a fresh random salt.
 * @returns {Promise<{hash: string, salt: string}>}
 */
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { hash: toHex(await pbkdf2(password, salt)), salt: toHex(salt) };
}

/**
 * Verify a password against a stored PBKDF2 hash + salt.
 * @returns {Promise<boolean>}
 */
async function verifyPassword(password, storedHash, storedSalt) {
  return toHex(await pbkdf2(password, fromHex(storedSalt))) === storedHash;
}

if (typeof globalThis !== 'undefined') {
  globalThis.CryptoUtils = { hashPassword, verifyPassword };
}
