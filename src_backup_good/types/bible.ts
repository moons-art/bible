export interface Verse {
  bookId: string;
  bookName: string;
  chapter: number;
  verse: number;
  title?: string;
  content: string;
}

export interface BibleVersion {
  id: string;
  name: string;
  verses: Verse[];
  isBuiltIn?: boolean;
  isSystem?: boolean;
  metadata?: {
    uploadedAt: number;
    fileType: 'pdf' | 'txt';
  };
}

export interface BibleBook {
  id: string;
  name: string;
  abbreviation: string;
}
