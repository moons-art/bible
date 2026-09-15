import { createContext, useContext } from 'react';
import type { BibleVersion } from '../types/bible';

export type CopyMode = 'default' | 'niv+krv' | 'all';

export interface BibleContextType {
  versions: BibleVersion[];
  selectedVersionIds: string[];
  lineHeight: number;
  setLineHeight: (val: number) => void;
  copyMode: CopyMode;
  showVersionInCopy: boolean;
  addVersion: (version: BibleVersion) => void;
  removeVersion: (id: string) => void;
  renameVersion: (id: string, newName: string) => void;
  clearAllVersions: () => void;
  toggleVersion: (id: string) => void;
  setCopyMode: (mode: CopyMode) => void;
  setShowVersionInCopy: (show: boolean) => void;
  verseData: Record<string, { note?: string; crossRef?: string; sermon?: string }>;
  setVerseData: React.Dispatch<React.SetStateAction<Record<string, { note?: string; crossRef?: string; sermon?: string }>>>;
  showAnnotations: boolean;
  setShowAnnotations: (show: boolean) => void;
}

export const BibleContext = createContext<BibleContextType | undefined>(undefined);

export const useBible = () => {
  const context = useContext(BibleContext);
  if (!context) throw new Error("useBible must be used within a BibleProvider");
  return context;
};
