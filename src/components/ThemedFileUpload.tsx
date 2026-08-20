import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, FileUp, LoaderCircle, UploadCloud, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';

interface ThemedFileUploadProps {
  onFiles: (files: File[]) => void;
  isProcessing?: boolean;
  disabled?: boolean;
  maxFileSize?: number;
  className?: string;
}

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

function UploadIllustration({ progress, processing }: { progress: number; processing: boolean }) {
  return (
    <motion.div animate={processing ? { scale: [1, 1.04, 1] } : { y: [0, -4, 0] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }} className="relative grid h-20 w-20 place-items-center">
      <svg aria-label={processing ? `Preparing upload: ${progress}%` : 'Upload file'} className="absolute inset-0 h-full w-full" fill="none" viewBox="0 0 100 100" role="img">
        <circle cx="50" cy="50" r="44" stroke="rgba(214,255,98,.22)" strokeDasharray="4 5" strokeWidth="1.5" />
        <motion.circle cx="50" cy="50" r="44" stroke="#d6ff62" strokeDasharray="4 5" strokeLinecap="round" strokeWidth="1.5" animate={{ rotate: 360 }} transition={{ duration: 12, repeat: Infinity, ease: 'linear' }} style={{ transformOrigin: '50% 50%' }} />
        {processing && <circle cx="50" cy="50" r="36" stroke="#d6ff62" strokeDasharray={`${(progress / 100) * 226} 226`} strokeLinecap="round" strokeWidth="3" transform="rotate(-90 50 50)" />}
      </svg>
      <span className="relative grid h-12 w-12 place-items-center rounded-2xl border border-[#d6ff62]/30 bg-[#d6ff62]/[.1] text-[#d6ff62] shadow-[0_0_28px_rgba(214,255,98,.12)]">
        {processing ? <LoaderCircle size={23} className="animate-spin" /> : <UploadCloud size={23} />}
      </span>
    </motion.div>
  );
}

export function ThemedFileUpload({ onFiles, isProcessing = false, disabled = false, maxFileSize = 500 * 1024 * 1024, className = '' }: ThemedFileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);

  const acceptFiles = useCallback((files: File[]) => {
    const candidate = files.filter(Boolean);
    if (!candidate.length) return;
    const oversized = candidate.find((file) => file.size > maxFileSize);
    if (oversized) {
      setError(`${oversized.name} exceeds ${formatBytes(maxFileSize)}.`);
      return;
    }
    setError(null);
    setLastFile(candidate[0]);
    setProgress(8);
    onFiles(candidate);
  }, [maxFileSize, onFiles]);

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);
    if (!isProcessing && !disabled) acceptFiles(Array.from(event.dataTransfer.files));
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    acceptFiles(Array.from(event.target.files || []));
    event.target.value = '';
  };

  return (
    <div className={`relative ${className}`}>
      <input ref={inputRef} type="file" multiple className="sr-only" onChange={handleInput} disabled={disabled || isProcessing} />
      <motion.div
        role="button"
        tabIndex={disabled || isProcessing ? -1 : 0}
        aria-disabled={disabled || isProcessing}
        aria-label="Upload files"
        onClick={() => !disabled && !isProcessing && inputRef.current?.click()}
        onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && !disabled && !isProcessing) inputRef.current?.click(); }}
        onDragEnter={(event) => { event.preventDefault(); event.stopPropagation(); if (!disabled && !isProcessing) setIsDragging(true); }}
        onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); if (!disabled && !isProcessing) setIsDragging(true); }}
        onDragLeave={(event) => { event.preventDefault(); event.stopPropagation(); setIsDragging(false); }}
        onDrop={handleDrop}
        animate={{ borderColor: isDragging ? 'rgba(214,255,98,.85)' : 'rgba(214,255,98,.25)' }}
        className={`group relative flex min-h-[236px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[1.75rem] border border-dashed bg-white/[.035] px-6 py-8 text-center transition-colors hover:bg-[#d6ff62]/[.06] ${isDragging ? 'bg-[#d6ff62]/[.1]' : ''} ${disabled || isProcessing ? 'cursor-wait opacity-70' : ''}`}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(214,255,98,.12),transparent_55%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        <UploadIllustration progress={progress} processing={isProcessing} />
        <div className="relative mt-3">
          <div className="text-base font-medium tracking-[-.03em] text-white">{isDragging ? 'Release to add files' : isProcessing ? 'Preparing chunked direct transfer…' : 'Drop files or browse'}</div>
          <div className="mt-2 font-mono text-[10px] uppercase tracking-[.16em] text-white/40">WebRTC DTLS · memory only · up to {formatBytes(maxFileSize)}</div>
        </div>
        <AnimatePresence mode="wait">
          {lastFile && !isProcessing && !error && <motion.div key="success" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="relative mt-4 inline-flex items-center gap-2 rounded-full border border-[#d6ff62]/20 bg-[#d6ff62]/[.08] px-3 py-1.5 font-mono text-[10px] text-[#d6ff62]"><CheckCircle2 size={13} /> {lastFile.name}</motion.div>}
          {error && <motion.div key="error" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="relative mt-4 inline-flex items-center gap-2 rounded-full border border-[#ff8e8e]/30 bg-[#ff8e8e]/[.08] px-3 py-1.5 font-mono text-[10px] text-[#ffb2b2]"><AlertCircle size={13} /> {error}<button type="button" onClick={(event) => { event.stopPropagation(); setError(null); }} aria-label="Dismiss upload error"><X size={13} /></button></motion.div>}
        </AnimatePresence>
        <span className="relative mt-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[.06] px-4 py-2 font-mono text-[10px] uppercase tracking-[.14em] text-white/65 transition-colors group-hover:border-[#d6ff62]/35 group-hover:text-[#d6ff62]"><FileUp size={13} /> Select files</span>
      </motion.div>
    </div>
  );
}
