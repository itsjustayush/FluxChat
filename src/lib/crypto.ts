/**
 * WebCrypto AES-256-GCM & Carbon Footprint calculation utilities for FLUX_P2P
 */

export interface EncryptionResult {
  encryptedBuffer: ArrayBuffer;
  iv: Uint8Array;
  key: CryptoKey;
  sha256Hex: string;
}

/**
 * Generate a new AES-256-GCM CryptoKey
 */
export async function generateKey(): Promise<CryptoKey> {
  return await window.crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256,
    },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt file buffer with AES-256-GCM
 */
export async function encryptFileBuffer(
  buffer: ArrayBuffer,
  key?: CryptoKey
): Promise<EncryptionResult> {
  const activeKey = key || (await generateKey());
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for AES-GCM

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    activeKey,
    buffer
  );

  const sha256Hex = await calculateSHA256(buffer);

  return {
    encryptedBuffer,
    iv,
    key: activeKey,
    sha256Hex,
  };
}

/**
 * Decrypt file buffer with AES-256-GCM
 */
export async function decryptFileBuffer(
  encryptedBuffer: ArrayBuffer,
  key: CryptoKey,
  iv: Uint8Array
): Promise<ArrayBuffer> {
  return await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv,
    },
    key,
    encryptedBuffer
  );
}

/**
 * Calculate SHA-256 checksum hex string for any buffer
 */
export async function calculateSHA256(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return hashHex;
}

/**
 * Calculate Carbon Footprint for P2P data transfer vs traditional cloud storage
 * Benchmark:
 * - Centralized cloud storage & transfer: ~0.06 g CO2e / MB
 * - Direct Ephemeral P2P WebRTC data channel: ~0.005 g CO2e / MB
 */
export function calculateCarbonMetrics(bytes: number) {
  const sizeInMB = bytes / (1024 * 1024);
  const p2pCarbonGrams = sizeInMB * 0.005;
  const cloudCarbonGrams = sizeInMB * 0.06;
  const savedGrams = cloudCarbonGrams - p2pCarbonGrams;
  const savingsPercent = 91.6;

  return {
    p2pCarbonGrams: parseFloat(p2pCarbonGrams.toFixed(3)),
    cloudCarbonGrams: parseFloat(cloudCarbonGrams.toFixed(3)),
    savedGrams: parseFloat(savedGrams.toFixed(3)),
    savingsPercent,
    formattedP2p: p2pCarbonGrams < 0.01 ? '< 0.01 g CO2e' : `${p2pCarbonGrams.toFixed(2)} g CO2e`,
  };
}

/**
 * Helper to format readable file sizes
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Derive label for file type e.g. ZIP_ARC, IMG_DATA, MOV_STREAM, DOC_BYTE
 */
export function getFileTypeLabel(fileType: string, fileName: string): string {
  const ext = fileName.split('.').pop()?.toUpperCase() || '';
  if (fileType.includes('image') || ['PNG', 'JPG', 'JPEG', 'WEBP', 'SVG'].includes(ext)) return 'IMG_DATA';
  if (fileType.includes('video') || ['MP4', 'MOV', 'WEBM', 'MKV'].includes(ext)) return 'MOV_STREAM';
  if (fileType.includes('zip') || fileType.includes('archive') || ['ZIP', 'RAR', '7Z', 'TAR', 'GZ'].includes(ext)) return 'ZIP_ARC';
  if (fileType.includes('pdf') || fileType.includes('word') || ['PDF', 'DOC', 'DOCX', 'TXT', 'MD'].includes(ext)) return 'DOC_BYTE';
  if (fileType.includes('json') || fileType.includes('code') || ['JSON', 'TS', 'JS', 'PY', 'HTML'].includes(ext)) return 'JSON_DATA';
  return `${ext || 'DATA'}_FILE`;
}
