/**
 * Crypto utility for TabLocker extension.
 * Uses the Web Crypto API (available in service workers and extension pages)
 * to hash passwords with SHA-256. Passwords are never stored in plaintext.
 */

/**
 * Hash a password string using SHA-256.
 * @param {string} password - The plaintext password to hash.
 * @returns {Promise<string>} The hex-encoded SHA-256 hash.
 */
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Verify a plaintext password against a stored hash.
 * @param {string} password - The plaintext password to verify.
 * @param {string} storedHash - The stored SHA-256 hash to compare against.
 * @returns {Promise<boolean>} True if the password matches the hash.
 */
async function verifyPassword(password, storedHash) {
  const hash = await hashPassword(password);
  return hash === storedHash;
}

// Export for use via importScripts in service worker
// and via <script> tags in extension pages
if (typeof globalThis !== 'undefined') {
  globalThis.CryptoUtils = { hashPassword, verifyPassword };
}
