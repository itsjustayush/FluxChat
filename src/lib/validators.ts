/**
 * Validation and Error Handling Layer
 * Centralized validation schemas and error handling utilities
 */

export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface ValidationError {
  code: string;
  message: string;
  severity: ErrorSeverity;
  timestamp: number;
  context?: Record<string, any>;
}

export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  errors: ValidationError[];
}

export class ValidationException extends Error {
  constructor(
    public code: string,
    public severity: ErrorSeverity = 'error',
    message?: string,
    public context?: Record<string, any>
  ) {
    super(message || code);
    this.name = 'ValidationException';
  }
}

/**
 * Validation schemas
 */
export const Validators = {
  /**
   * Validate room ID format
   */
  roomId: (id: string): ValidationResult<string> => {
    const errors: ValidationError[] = [];

    if (!id || typeof id !== 'string') {
      errors.push({
        code: 'INVALID_ROOM_ID_TYPE',
        message: 'Room ID must be a non-empty string',
        severity: 'error',
        timestamp: Date.now(),
      });
    } else if (id.length < 3 || id.length > 128) {
      errors.push({
        code: 'INVALID_ROOM_ID_LENGTH',
        message: 'Room ID must be between 3 and 128 characters',
        severity: 'error',
        timestamp: Date.now(),
        context: { length: id.length },
      });
    } else if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      errors.push({
        code: 'INVALID_ROOM_ID_FORMAT',
        message: 'Room ID can only contain alphanumeric characters, hyphens, and underscores',
        severity: 'error',
        timestamp: Date.now(),
      });
    }

    return {
      valid: errors.length === 0,
      data: errors.length === 0 ? id : undefined,
      errors,
    };
  },

  /**
   * Validate peer ID format
   */
  peerId: (id: string): ValidationResult<string> => {
    const errors: ValidationError[] = [];

    if (!id || typeof id !== 'string') {
      errors.push({
        code: 'INVALID_PEER_ID_TYPE',
        message: 'Peer ID must be a non-empty string',
        severity: 'error',
        timestamp: Date.now(),
      });
    } else if (id.length < 3 || id.length > 64) {
      errors.push({
        code: 'INVALID_PEER_ID_LENGTH',
        message: 'Peer ID must be between 3 and 64 characters',
        severity: 'error',
        timestamp: Date.now(),
        context: { length: id.length },
      });
    } else if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      errors.push({
        code: 'INVALID_PEER_ID_FORMAT',
        message: 'Peer ID can only contain alphanumeric characters, hyphens, and underscores',
        severity: 'error',
        timestamp: Date.now(),
      });
    }

    return {
      valid: errors.length === 0,
      data: errors.length === 0 ? id : undefined,
      errors,
    };
  },

  /**
   * Validate offer/answer SDP
   */
  sdp: (sdp: string, type: 'offer' | 'answer'): ValidationResult<string> => {
    const errors: ValidationError[] = [];

    if (!sdp || typeof sdp !== 'string') {
      errors.push({
        code: 'INVALID_SDP_TYPE',
        message: `SDP ${type} must be a non-empty string`,
        severity: 'error',
        timestamp: Date.now(),
      });
      return { valid: false, errors };
    }

    if (!sdp.includes('v=0')) {
      errors.push({
        code: 'INVALID_SDP_VERSION',
        message: 'SDP must start with v=0',
        severity: 'error',
        timestamp: Date.now(),
      });
    }

    if (!sdp.includes(`${type} `) && !sdp.includes('a=') ) {
      errors.push({
        code: 'INVALID_SDP_CONTENT',
        message: `SDP does not appear to be a valid ${type}`,
        severity: 'warning',
        timestamp: Date.now(),
      });
    }

    if (sdp.length > 10000) {
      errors.push({
        code: 'SDP_TOO_LARGE',
        message: 'SDP exceeds maximum size of 10KB',
        severity: 'warning',
        timestamp: Date.now(),
        context: { size: sdp.length },
      });
    }

    return {
      valid: errors.length === 0,
      data: errors.length === 0 ? sdp : undefined,
      errors,
    };
  },

  /**
   * Validate ICE candidate
   */
  iceCandidate: (candidate: RTCIceCandidateInit): ValidationResult<RTCIceCandidateInit> => {
    const errors: ValidationError[] = [];

    if (!candidate) {
      errors.push({
        code: 'INVALID_ICE_CANDIDATE_TYPE',
        message: 'ICE candidate must be an object',
        severity: 'error',
        timestamp: Date.now(),
      });
      return { valid: false, errors };
    }

    // Either candidate line or special end-of-candidates
    if (!candidate.candidate) {
      errors.push({
        code: 'MISSING_ICE_CANDIDATE_LINE',
        message: 'ICE candidate must have a candidate property',
        severity: 'error',
        timestamp: Date.now(),
      });
    }

    if (typeof candidate.sdpMLineIndex !== 'number' && candidate.candidate !== '') {
      errors.push({
        code: 'MISSING_ICE_MLINE_INDEX',
        message: 'ICE candidate must have a valid sdpMLineIndex',
        severity: 'warning',
        timestamp: Date.now(),
      });
    }

    return {
      valid: errors.length === 0,
      data: errors.length === 0 ? candidate : undefined,
      errors,
    };
  },

  /**
   * Validate file metadata
   */
  fileMetadata: (
    filename: string,
    size: number,
    mimeType: string
  ): ValidationResult<{ filename: string; size: number; mimeType: string }> => {
    const errors: ValidationError[] = [];

    // Filename validation
    if (!filename || typeof filename !== 'string') {
      errors.push({
        code: 'INVALID_FILENAME_TYPE',
        message: 'Filename must be a non-empty string',
        severity: 'error',
        timestamp: Date.now(),
      });
    } else if (filename.length > 256) {
      errors.push({
        code: 'FILENAME_TOO_LONG',
        message: 'Filename cannot exceed 256 characters',
        severity: 'error',
        timestamp: Date.now(),
        context: { length: filename.length },
      });
    } else if (/[<>:"|?*\0]/.test(filename)) {
      errors.push({
        code: 'INVALID_FILENAME_CHARACTERS',
        message: 'Filename contains invalid characters',
        severity: 'error',
        timestamp: Date.now(),
      });
    }

    // Size validation
    if (typeof size !== 'number' || size < 0) {
      errors.push({
        code: 'INVALID_FILE_SIZE_TYPE',
        message: 'File size must be a non-negative number',
        severity: 'error',
        timestamp: Date.now(),
      });
    } else if (size === 0) {
      errors.push({
        code: 'EMPTY_FILE',
        message: 'File size cannot be zero',
        severity: 'warning',
        timestamp: Date.now(),
      });
    } else if (size > 500 * 1024 * 1024) {
      errors.push({
        code: 'FILE_TOO_LARGE',
        message: 'File size exceeds maximum limit of 500MB',
        severity: 'error',
        timestamp: Date.now(),
        context: { size, maxSize: 500 * 1024 * 1024 },
      });
    }

    // MIME type validation
    if (!mimeType || typeof mimeType !== 'string') {
      errors.push({
        code: 'INVALID_MIME_TYPE',
        message: 'MIME type must be a non-empty string',
        severity: 'warning',
        timestamp: Date.now(),
      });
    } else if (!/^[a-z]+\/[a-z0-9+\-\.]+$/i.test(mimeType)) {
      errors.push({
        code: 'INVALID_MIME_TYPE_FORMAT',
        message: 'MIME type format is invalid',
        severity: 'warning',
        timestamp: Date.now(),
      });
    }

    return {
      valid: errors.filter((e) => e.severity === 'error').length === 0,
      data: errors.length === 0 ? { filename, size, mimeType } : undefined,
      errors,
    };
  },

  /**
   * Validate URL
   */
  url: (url: string): ValidationResult<string> => {
    const errors: ValidationError[] = [];

    if (!url || typeof url !== 'string') {
      errors.push({
        code: 'INVALID_URL_TYPE',
        message: 'URL must be a non-empty string',
        severity: 'error',
        timestamp: Date.now(),
      });
      return { valid: false, errors };
    }

    try {
      new URL(url);
    } catch {
      errors.push({
        code: 'INVALID_URL_FORMAT',
        message: 'URL format is invalid',
        severity: 'error',
        timestamp: Date.now(),
      });
    }

    return {
      valid: errors.length === 0,
      data: errors.length === 0 ? url : undefined,
      errors,
    };
  },
};

/**
 * Error handler with retry logic
 */
export class ErrorHandler {
  private static readonly ERROR_RETRY_MAP: Record<string, number> = {
    ERR_ICE_FAILED: 3,
    ERR_PEER_DISCONNECTED: 5,
    ERR_DATACHANNEL: 2,
    NETWORK_ERROR: 4,
    TIMEOUT_ERROR: 3,
  };

  public static shouldRetry(code: string, attempt: number): boolean {
    const maxAttempts = this.ERROR_RETRY_MAP[code] ?? 0;
    return attempt < maxAttempts;
  }

  public static getBackoffDelay(attempt: number, baseDelay: number = 1000): number {
    // Exponential backoff with jitter
    const delay = baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * delay * 0.1;
    return delay + jitter;
  }

  public static categorizeError(error: any): {
    code: string;
    severity: ErrorSeverity;
    message: string;
  } {
    if (error instanceof ValidationException) {
      return {
        code: error.code,
        severity: error.severity,
        message: error.message,
      };
    }

    const message = String(error?.message || error);

    // Network errors
    if (message.includes('network') || message.includes('connection')) {
      return {
        code: 'NETWORK_ERROR',
        severity: 'error',
        message: `Network error: ${message}`,
      };
    }

    // Timeout errors
    if (message.includes('timeout') || message.includes('timeout')) {
      return {
        code: 'TIMEOUT_ERROR',
        severity: 'warning',
        message: `Timeout: ${message}`,
      };
    }

    // ICE errors
    if (message.includes('ice') || message.includes('candidate')) {
      return {
        code: 'ERR_ICE_FAILED',
        severity: 'error',
        message: `ICE error: ${message}`,
      };
    }

    // Default
    return {
      code: 'UNKNOWN_ERROR',
      severity: 'error',
      message: `Unknown error: ${message}`,
    };
  }
}
