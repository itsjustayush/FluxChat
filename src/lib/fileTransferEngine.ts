/**
 * File Transfer Engine
 * Handles chunked file transfers with adaptive chunk sizing, resume capability, and integrity verification
 */

export interface TransferMetadata {
  fileId: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  totalChunks: number;
  createdAt: number;
  checksum?: string;
}

export interface ChunkMetadata {
  fileId: string;
  chunkIndex: number;
  chunkSize: number;
  data: Uint8Array;
  checksum: string;
}

export interface TransferProgress {
  fileId: string;
  bytesTransferred: number;
  totalBytes: number;
  chunksCompleted: number;
  totalChunks: number;
  speed: number; // bytes per second
  eta: number; // milliseconds
  state: 'pending' | 'transferring' | 'paused' | 'completed' | 'failed';
}

export type TransferCallback = (progress: TransferProgress) => void;
export type ChunkCallback = (chunk: ChunkMetadata) => void;

/**
 * Adaptive chunk size strategy
 */
export class AdaptiveChunkSizer {
  private initialChunkSize: number;
  private minChunkSize: number;
  private maxChunkSize: number;
  private currentChunkSize: number;
  private successfulChunks = 0;
  private failedChunks = 0;

  constructor(
    initialSize: number = 64 * 1024, // 64KB
    minSize: number = 16 * 1024, // 16KB
    maxSize: number = 1024 * 1024 // 1MB
  ) {
    this.initialChunkSize = initialSize;
    this.minChunkSize = minSize;
    this.maxChunkSize = maxSize;
    this.currentChunkSize = initialSize;
  }

  /**
   * Get next chunk size based on recent history
   */
  public getChunkSize(): number {
    return this.currentChunkSize;
  }

  /**
   * Record successful chunk transfer
   */
  public recordSuccess(): void {
    this.successfulChunks++;
    this.failedChunks = 0;

    // Increase chunk size after 10 consecutive successes
    if (this.successfulChunks >= 10) {
      this.currentChunkSize = Math.min(
        this.currentChunkSize * 1.5,
        this.maxChunkSize
      );
      this.successfulChunks = 0;
    }
  }

  /**
   * Record failed chunk transfer
   */
  public recordFailure(): void {
    this.failedChunks++;
    this.successfulChunks = 0;

    // Reduce chunk size on failure
    if (this.failedChunks >= 2) {
      this.currentChunkSize = Math.max(
        this.currentChunkSize * 0.7,
        this.minChunkSize
      );
      this.failedChunks = 0;
    }
  }

  /**
   * Reset to initial size
   */
  public reset(): void {
    this.currentChunkSize = this.initialChunkSize;
    this.successfulChunks = 0;
    this.failedChunks = 0;
  }
}

/**
 * Simple CRC32 checksum for integrity verification
 */
export class ChecksumCalculator {
  private static readonly POLY = 0xedb88320;
  private static TABLE: Uint32Array | null = null;

  private static initTable(): Uint32Array {
    if (this.TABLE) return this.TABLE;

    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let crc = i;
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ ((crc & 1) ? this.POLY : 0);
      }
      table[i] = crc >>> 0;
    }
    this.TABLE = table;
    return table;
  }

  public static calculate(data: Uint8Array): string {
    const table = this.initTable();
    let crc = 0xffffffff;

    for (let i = 0; i < data.length; i++) {
      crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    }

    return (crc ^ 0xffffffff).toString(16).padStart(8, '0');
  }
}

/**
 * File Transfer Engine
 */
export class FileTransferEngine {
  private metadata: Map<string, TransferMetadata> = new Map();
  private progress: Map<string, TransferProgress> = new Map();
  private receivedChunks: Map<string, Set<number>> = new Map();
  private transferCallbacks: Map<string, Set<TransferCallback>> = new Map();
  private chunkCallbacks: Set<ChunkCallback> = new Set();
  private chunkSizer: AdaptiveChunkSizer;
  private startTimes: Map<string, number> = new Map();

  constructor() {
    this.chunkSizer = new AdaptiveChunkSizer();
  }

  /**
   * Initiate file transfer
   */
  public initiateTransfer(
    file: File | { name: string; size: number; type: string }
  ): TransferMetadata {
    const fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const metadata: TransferMetadata = {
      fileId,
      filename: file.name,
      fileSize: file.size,
      mimeType: file.type,
      totalChunks: Math.ceil(
        file.size / this.chunkSizer.getChunkSize()
      ),
      createdAt: Date.now(),
    };

    this.metadata.set(fileId, metadata);
    this.receivedChunks.set(fileId, new Set());
    this.startTimes.set(fileId, Date.now());

    this.progress.set(fileId, {
      fileId,
      bytesTransferred: 0,
      totalBytes: file.size,
      chunksCompleted: 0,
      totalChunks: metadata.totalChunks,
      speed: 0,
      eta: 0,
      state: 'pending',
    });

    console.log(
      `[FileTransferEngine] Initiated transfer of ${file.name} (${this.formatBytes(file.size)})`
    );

    return metadata;
  }

  /**
   * Generate chunks from file
   */
  public async *generateChunks(file: File): AsyncGenerator<ChunkMetadata> {
    const fileId = this.metadata.has(/* need to track */ '')
      ? Array.from(this.metadata.keys()).pop()
      : '';

    if (!fileId || !this.metadata.has(fileId)) {
      throw new Error('File transfer not initiated');
    }

    const metadata = this.metadata.get(fileId)!;
    const chunkSize = this.chunkSizer.getChunkSize();
    const fileBuffer = await file.arrayBuffer();
    const uint8View = new Uint8Array(fileBuffer);

    for (let i = 0; i < metadata.totalChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, uint8View.length);
      const chunkData = uint8View.slice(start, end);
      const checksum = ChecksumCalculator.calculate(chunkData);

      const chunk: ChunkMetadata = {
        fileId,
        chunkIndex: i,
        chunkSize: chunkData.length,
        data: chunkData,
        checksum,
      };

      yield chunk;
    }
  }

  /**
   * Receive and validate chunk
   */
  public receiveChunk(chunk: ChunkMetadata): boolean {
    const metadata = this.metadata.get(chunk.fileId);
    if (!metadata) {
      console.warn(`[FileTransferEngine] Received chunk for unknown transfer ${chunk.fileId}`);
      return false;
    }

    // Verify checksum
    const calculatedChecksum = ChecksumCalculator.calculate(chunk.data);
    if (calculatedChecksum !== chunk.checksum) {
      console.warn(
        `[FileTransferEngine] Checksum mismatch for chunk ${chunk.chunkIndex}: expected ${chunk.checksum}, got ${calculatedChecksum}`
      );
      return false;
    }

    const received = this.receivedChunks.get(chunk.fileId)!;
    if (received.has(chunk.chunkIndex)) {
      return true; // Already received
    }

    received.add(chunk.chunkIndex);

    // Update progress
    this.updateProgress(chunk.fileId);

    return true;
  }

  /**
   * Update transfer progress
   */
  private updateProgress(fileId: string): void {
    const metadata = this.metadata.get(fileId);
    const received = this.receivedChunks.get(fileId);

    if (!metadata || !received) return;

    const progress = this.progress.get(fileId)!;
    const chunkSize = this.chunkSizer.getChunkSize();

    progress.chunksCompleted = received.size;
    progress.bytesTransferred = Math.min(
      received.size * chunkSize,
      metadata.fileSize
    );

    const elapsed = Date.now() - (this.startTimes.get(fileId) || Date.now());
    progress.speed = elapsed > 0 ? progress.bytesTransferred / (elapsed / 1000) : 0;

    const remainingBytes = metadata.fileSize - progress.bytesTransferred;
    progress.eta = progress.speed > 0 ? remainingBytes / progress.speed * 1000 : 0;

    if (progress.bytesTransferred >= metadata.fileSize) {
      progress.state = 'completed';
      this.chunkSizer.recordSuccess();
    } else if (progress.state === 'pending') {
      progress.state = 'transferring';
    }

    // Notify listeners
    const callbacks = this.transferCallbacks.get(fileId);
    if (callbacks) {
      callbacks.forEach((cb) => cb(progress));
    }
  }

  /**
   * Check if transfer is complete
   */
  public isComplete(fileId: string): boolean {
    const metadata = this.metadata.get(fileId);
    const received = this.receivedChunks.get(fileId);

    if (!metadata || !received) return false;

    return received.size === metadata.totalChunks;
  }

  /**
   * Get missing chunks for resume
   */
  public getMissingChunks(fileId: string): number[] {
    const metadata = this.metadata.get(fileId);
    const received = this.receivedChunks.get(fileId);

    if (!metadata || !received) return [];

    const missing: number[] = [];
    for (let i = 0; i < metadata.totalChunks; i++) {
      if (!received.has(i)) {
        missing.push(i);
      }
    }

    return missing;
  }

  /**
   * Get current progress
   */
  public getProgress(fileId: string): TransferProgress | undefined {
    return this.progress.get(fileId);
  }

  /**
   * Register progress listener
   */
  public onProgress(fileId: string, callback: TransferCallback): () => void {
    if (!this.transferCallbacks.has(fileId)) {
      this.transferCallbacks.set(fileId, new Set());
    }
    this.transferCallbacks.get(fileId)!.add(callback);

    return () => {
      this.transferCallbacks.get(fileId)?.delete(callback);
    };
  }

  /**
   * Register chunk listener
   */
  public onChunk(callback: ChunkCallback): () => void {
    this.chunkCallbacks.add(callback);
    return () => {
      this.chunkCallbacks.delete(callback);
    };
  }

  /**
   * Cancel transfer
   */
  public cancelTransfer(fileId: string): void {
    const progress = this.progress.get(fileId);
    if (progress) {
      progress.state = 'failed';
    }

    this.metadata.delete(fileId);
    this.receivedChunks.delete(fileId);
    this.transferCallbacks.delete(fileId);
    this.startTimes.delete(fileId);

    console.log(`[FileTransferEngine] Cancelled transfer ${fileId}`);
  }

  /**
   * Pause transfer
   */
  public pauseTransfer(fileId: string): void {
    const progress = this.progress.get(fileId);
    if (progress && progress.state === 'transferring') {
      progress.state = 'paused';
    }
  }

  /**
   * Resume transfer
   */
  public resumeTransfer(fileId: string): void {
    const progress = this.progress.get(fileId);
    if (progress && progress.state === 'paused') {
      progress.state = 'transferring';
    }
  }

  /**
   * Utility: Format bytes
   */
  private formatBytes(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (
      (bytes / Math.pow(k, i)).toFixed(decimals) + ' ' + sizes[i]
    );
  }

  /**
   * Cleanup transfer
   */
  public cleanup(fileId: string): void {
    this.metadata.delete(fileId);
    this.receivedChunks.delete(fileId);
    this.transferCallbacks.delete(fileId);
    this.startTimes.delete(fileId);
    this.progress.delete(fileId);
  }
}

// Singleton instance
let instance: FileTransferEngine | null = null;

export function getFileTransferEngine(): FileTransferEngine {
  if (!instance) {
    instance = new FileTransferEngine();
  }
  return instance;
}
