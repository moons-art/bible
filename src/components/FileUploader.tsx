import React, { useCallback, useState } from 'react';
import { Upload, AlertCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { BibleParser } from '../services/bibleParser';
import type { BibleVersion } from '../types/bible';

interface FileUploaderProps {
  onUploadSuccess: (version: BibleVersion, rawContent?: string) => void;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ onUploadSuccess }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setIsUploading(true);
    setError(null);

    try {
      const isPdf = file.name.toLowerCase().endsWith('.pdf');
      let version;
      let content;

      if (isPdf) {
        throw new Error("PDF 파싱 기능은 현재 준비 중입니다. 텍스트(.txt) 형식의 성경 파일을 이용해 주세요.");
      } else {
        const buffer = await file.arrayBuffer();
        
        // Try UTF-8 first
        const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
        try {
          content = utf8Decoder.decode(buffer);
        } catch {
          // Fallback to EUC-KR if UTF-8 fails (common for Korean legacy files)
          const eucKrDecoder = new TextDecoder('euc-kr');
          content = eucKrDecoder.decode(buffer);
        }

        version = await BibleParser.parseTxt(file.name.replace(/\.[^/.]+$/, ""), content);
      }
      
      if (version.verses.length === 0) {
        throw new Error("성경 구절을 인식하지 못했습니다. 파일 형식이 '창1:1 본문'과 같은 형태인지 확인해 주세요.");
      }

      onUploadSuccess(version, content);
    } catch (err) {
      setError(err instanceof Error ? err.message : "파일 처리 중 오류가 발생했습니다.");
    } finally {
      setIsUploading(false);
    }
  }, [onUploadSuccess]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="w-full max-w-xl mx-auto space-y-4">
      <motion.div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`
          relative border-2 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center transition-all duration-300
          ${isDragging ? 'border-primary bg-primary/5 scale-[1.02]' : 'border-white/10 bg-white/5 hover:border-white/20'}
          ${isUploading ? 'pointer-events-none opacity-60' : 'cursor-pointer'}
        `}
      >
        <AnimatePresence mode="wait">
          {isUploading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center"
            >
              <Loader2 className="w-12 h-12 text-primary animate-spin mb-4" />
              <p className="text-lg font-medium">성경 데이터를 분석하고 있습니다...</p>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center"
            >
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                <Upload className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2 text-white">성경 번역본 업로드</h3>
              <p className="text-secondary text-center max-w-sm">
                PDF 또는 TXT 파일을 이곳에 드래그하거나 클릭하여 선택하세요.
                (형식: 창1:1 본문...)
              </p>
              <input
                type="file"
                className="absolute inset-0 opacity-0 cursor-pointer"
                accept=".txt,.pdf"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400"
        >
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </motion.div>
      )}
    </div>
  );
};
