import { gdriveWebService } from './gdriveWebService';

export const hymnalApi = {
  getSettings: async () => {
    try {
      const data = await gdriveWebService.downloadJsonFile('settings.json');
      if (data && data.albums) {
        return data;
      }
      throw new Error('No settings');
    } catch (e) {
      return { 
        albums: [
          { id: 'hymnal', name: '새찬송가', type: 'system' },
          { id: 'misc', name: '기타앨범', type: 'system' }
        ] 
      };
    }
  },
  
  saveSettings: async (settings: any) => {
    try {
      await gdriveWebService.uploadJsonFile('settings.json', settings);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  getSongs: async () => {
    let baseSongs = [];
    try {
      // 1. settings.json에서 등록된 앨범 리스트를 먼저 조회
      const settings = await hymnalApi.getSettings();
      const activeAlbums = settings.albums || [];

      // 2. music_data.json (찬송가 등 기본 DB) 다운로드
      let data = null;
      try {
        data = await gdriveWebService.downloadJsonFile('music_data.json');
      } catch (err) {
        console.warn('[hymnalApi] Failed to download music_data.json, will use default', err);
      }
      
      if (data && data.length > 0) {
        baseSongs = data;
      } else {
        try {
          const defaultResponse = await fetch('/data/hymnal_default.json');
          if (defaultResponse.ok) {
            baseSongs = await defaultResponse.json();
          }
        } catch (err) {}
      }

      // 3. 찬송가(hymnal) 데이터만 정적으로 확보 (커스텀/기타파일 등은 실시간 드라이브 연동하므로 제외)
      const hymnalSongs = baseSongs.filter((s: any) => s.albumId === 'hymnal');

      // 찬송가 드라이브 폴더 'CEUM_Album_새찬송가' 실시간 스캔 및 이미지 파일 ID 매핑
      let hymnalDriveFiles: any[] = [];
      try {
        hymnalDriveFiles = await gdriveWebService.listFolderFiles('CEUM_Album_새찬송가');
      } catch (driveErr) {
        console.warn('[hymnalApi] Failed to scan CEUM_Album_새찬송가 folder', driveErr);
      }

      // 찬송가 정적 곡 목록에 실시간 스캔된 구글 파일 ID를 매핑 (찬송가 악보 정상 노출 및 PDF 빌드 정상화 보장)
      // O(N^2) 정규식 반복문에서 발생하는 엄청난 랙(PC 버벅임, 아이패드 멈춤/팅김 현상)을 해결하기 위해
      // 미리 파일 번호를 파싱하여 O(1) 맵으로 만듦
      const hymnalFileMap = new Map<number, string>();
      hymnalDriveFiles.forEach((file: any) => {
        const numMatch = file.name.match(/\d+/);
        if (numMatch) {
          const fileNum = parseInt(numMatch[0], 10);
          hymnalFileMap.set(fileNum, file.id);
        }
      });

      const mappedHymnalSongs = hymnalSongs.map((song: any) => {
        return {
          ...song,
          fileId: hymnalFileMap.get(song.number)
        };
      });

      // 4. 활성화된 앨범 중 'hymnal'을 제외한 모든 앨범의 구글 드라이브 실시간 스캔 병렬 처리
      const nonHymnalAlbums = activeAlbums.filter((a: any) => a.id !== 'hymnal');
      
      const scanPromises = nonHymnalAlbums.map(async (album: any) => {
        const folderName = album.id === 'misc' ? 'CEUM_ccm_data' : `CEUM_Album_${album.name}`;
        try {
          const files = await gdriveWebService.listFolderFiles(folderName);
          return files.map((file: any, index: number) => {
            const title = file.name.replace(/\.[^/.]+$/, ""); // 확장자 제거
            const songId = `${album.id}-${file.id}`;
            const existingSong = baseSongs.find((s: any) => s.id === songId);
            return {
              id: songId,
              title: existingSong?.title || title,
              lyrics: existingSong?.lyrics || '',
              number: existingSong?.number || index + 1,
              code: existingSong?.code || '',
              meter: existingSong?.meter || '',
              category: existingSong?.category || '',
              youtubeVideos: existingSong?.youtubeVideos || [],
              albumId: album.id,
              type: 'image',
              fileId: file.id,
              searchTokens: [existingSong?.title || title]
            };
          });
        } catch (e) {
          console.warn(`[hymnalApi] Failed to scan album folder: ${folderName}`, e);
          return [];
        }
      });

      const scannedAlbumSongs = await Promise.all(scanPromises);
      const combinedScanned = scannedAlbumSongs.flat();

      // 5. 매핑 완료된 찬송가 데이터와 드라이브 실시간 스캔 곡 데이터를 병합
      return [...mappedHymnalSongs, ...combinedScanned];
    } catch (e) {
      console.error('[hymnalApi] Failed in getSongs real-time merge process', e);
      return [];
    }
  },

  addAlbum: async (album: any) => {
    const settings = await hymnalApi.getSettings();
    const newAlbum = { ...album, id: `album-${Date.now()}`, type: 'custom' };
    settings.albums = settings.albums || [];
    settings.albums.push(newAlbum);
    const saveResult = await hymnalApi.saveSettings(settings);
    if (!saveResult.success) return saveResult;
    return { success: true, album: newAlbum };
  },

  updateAlbum: async (album: any) => {
    const settings = await hymnalApi.getSettings();
    const idx = settings.albums.findIndex((a: any) => a.id === album.id);
    if (idx !== -1) {
      settings.albums[idx] = album;
      const saveResult = await hymnalApi.saveSettings(settings);
      if (!saveResult.success) return saveResult;
      return { success: true };
    }
    return { success: false, error: '앨범을 찾을 수 없습니다.' };
  },

  deleteAlbum: async (id: string) => {
    try {
      const settings = await hymnalApi.getSettings();
      const targetAlbum = settings.albums.find((a: any) => a.id === id);
      
      settings.albums = settings.albums.filter((a: any) => a.id !== id);
      const saveResult = await hymnalApi.saveSettings(settings);
      if (!saveResult.success) return saveResult;

      // 구글 드라이브에서 실제 폴더 및 하위 파일 영구 삭제 (복구 불가)
      if (targetAlbum && targetAlbum.id !== 'hymnal' && targetAlbum.id !== 'misc') {
        const folderName = `CEUM_Album_${targetAlbum.name}`;
        const folderId = await gdriveWebService.getFolderId(folderName);
        if (folderId) {
          await window.gapi.client.drive.files.delete({
            fileId: folderId
          });
          console.log(`[hymnalApi] Successfully deleted physical Drive folder: ${folderName}`);
        }
      }
      return { success: true };
    } catch (e: any) {
      console.error('[hymnalApi] deleteAlbum failed:', e);
      return { success: false, error: e.message };
    }
  },

  updateSong: async (song: any) => {
    let baseSongs: any[] = [];
    try {
      baseSongs = await gdriveWebService.downloadJsonFile('music_data.json') || [];
    } catch(e) {}

    const idx = baseSongs.findIndex((s: any) => s.id === song.id);
    if (idx !== -1) {
      baseSongs[idx] = { ...baseSongs[idx], ...song };
    } else {
      baseSongs.push(song);
    }
    
    try {
      await gdriveWebService.uploadJsonFile('music_data.json', baseSongs);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  deleteSong: async (songId: string, shouldDeleteOriginal?: boolean, fileId?: string) => {
    try {
      let baseSongs: any[] = [];
      try {
        baseSongs = await gdriveWebService.downloadJsonFile('music_data.json') || [];
      } catch(e) {}

      const songToDelete = baseSongs.find((s: any) => s.id === songId);
      const targetFileId = fileId || songToDelete?.fileId;

      const newSongs = baseSongs.filter((s: any) => s.id !== songId);
      await gdriveWebService.uploadJsonFile('music_data.json', newSongs);

      if (shouldDeleteOriginal && targetFileId) {
        try {
          await window.gapi.client.drive.files.delete({ fileId: targetFileId });
        } catch (e) {
          console.warn('[hymnalApi] 구글 드라이브 파일 삭제 실패:', e);
        }
      }

      if (targetFileId) {
        try {
          const { imageCache } = await import('../utils/imageCache');
          await imageCache.removeImage(targetFileId);
        } catch (e) {
          console.warn('[hymnalApi] 로컬 캐시 삭제 실패:', e);
        }
      }

      const baseData = await gdriveWebService.downloadJsonFile('music_data.json') || [];
      const updatedBaseData = baseData.filter((s: any) => s.id !== songId);
      await gdriveWebService.uploadJsonFile('music_data.json', updatedBaseData);

      return { success: true };
    } catch (e: any) {
      console.error('[hymnalApi] deleteSong error:', e);
      return { success: false, error: e.message };
    }
  },

  getSavedContis: async () => {
    try {
      const data = await gdriveWebService.downloadJsonFile('saved_contis.json');
      return data || [];
    } catch (e) {
      return [];
    }
  },

  saveConti: async (conti: any) => {
    try {
      const contis = await hymnalApi.getSavedContis();
      const idx = contis.findIndex((c: any) => c.id === conti.id);
      if (idx !== -1) {
        contis[idx] = { ...contis[idx], ...conti, updatedAt: new Date().toISOString() };
      } else {
        contis.push({ ...conti, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      }
      await gdriveWebService.uploadJsonFile('saved_contis.json', contis);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  deleteSavedConti: async (id: string) => {
    try {
      let contis = await hymnalApi.getSavedContis();
      contis = contis.filter((c: any) => c.id !== id);
      await gdriveWebService.uploadJsonFile('saved_contis.json', contis);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  resolveImagePath: (fileId: string) => {
    return `https://drive.google.com/uc?id=${fileId}`;
  },

  resizeWindow: (width: number, height: number) => {
    console.log(`[WebApp] resizeWindow ignored.`);
  },

  openExternal: (url: string) => {
    window.open(url, '_blank');
  },

  writeClipboard: (text: string) => {
    navigator.clipboard.writeText(text).catch(err => console.error(err));
  },

  processImages: async (args: any) => {
    return { processed: 0 };
  },

  // PDF 생성 진행 콜백 보관
  pdfProgressCallback: null as ((data: any) => void) | null,

  onProgress: (callback: any) => {
    return () => {};
  },

  onPDFProgress: (callback: (data: any) => void) => {
    hymnalApi.pdfProgressCallback = callback;
    return () => {
      hymnalApi.pdfProgressCallback = null;
    };
  },

  generatePDF: async ({ title, type, items, songs, footer }: { title: string, type: 'leader' | 'congregation', items: any[], songs?: any[], footer?: string }) => {
    try {
      const finalSongs = (songs && songs.length > 0) ? songs : await hymnalApi.getSongs();
      const progress = (msg: string, percent: number) => {
        if (hymnalApi.pdfProgressCallback) {
          hymnalApi.pdfProgressCallback({ msg, percent });
        }
      };

      // 1. PDF Blob 생성 (jsPDF 기반 동적 렌더링)
      const { generateMobilePDF } = await import('../utils/pdfGenerator');
      const pdfBlob = await generateMobilePDF(title, type, items, finalSongs, progress, footer);

      // 2. 구글 드라이브 업로드
      progress('구글 드라이브 업로드 중...', 90);
      const now = new Date();
      const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      const typeStr = type === 'leader' ? '인도자' : '회중';
      const fileName = `[모바일]_${title}_${typeStr}_${dateStr}.pdf`;

      const uploadResult = await gdriveWebService.uploadPdfFile(fileName, pdfBlob);
      
      progress('생성 완료!', 100);
      return { success: true, url: uploadResult.webViewLink, fileId: uploadResult.id };
    } catch (e: any) {
      console.error('[hymnalApi] generatePDF error:', e);
      return { success: false, message: e.message || 'PDF 생성 실패' };
    }
  },

  selectFileForConti: () => {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e: any) => {
        if (e.target.files && e.target.files.length > 0) {
          resolve(e.target.files[0]);
        } else {
          resolve(null);
        }
      };
      input.click();
    });
  },

  selectFolderForAlbum: (): Promise<File[]> => {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.webkitdirectory = true;
      (input as any).directory = true;
      input.multiple = true;
      input.onchange = (e: any) => {
        resolve(e.target.files ? Array.from(e.target.files) : []);
      };
      input.click();
    });
  },

  selectMultipleFiles: (): Promise<File[]> => {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.onchange = (e: any) => {
        resolve(e.target.files ? Array.from(e.target.files) : []);
      };
      input.click();
    });
  },

  batchUploadImagesToGDrive: async (
    files: File[], 
    albumName: string, 
    onProgress: (processed: number, total: number) => void
  ) => {
    const { compressImageToWebP, uploadImageToGDrive } = await import('../utils/imageProcessor');
    const folderId = await gdriveWebService.getOrCreateFolder(`CEUM_Album_${albumName}`);

    const uploadedSongs: any[] = [];
    let processedCount = 0;
    const CHUNK_SIZE = 5;

    for (let i = 0; i < files.length; i += CHUNK_SIZE) {
      const chunk = files.slice(i, i + CHUNK_SIZE);
      await Promise.all(chunk.map(async (file) => {
        const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(file.name);
        if (!isImage) {
          processedCount++;
          onProgress(processedCount, files.length);
          return;
        }
        try {
          const compressedBlob = await compressImageToWebP(file, 0.75);
          const fileName = file.name.replace(/\.[^/.]+$/, "");
          const fileId = await uploadImageToGDrive(compressedBlob, `${fileName}.webp`, folderId);

          const numMatch = fileName.match(/\d+/);
          const number = numMatch ? parseInt(numMatch[0], 10) : uploadedSongs.length + 1;

          uploadedSongs.push({
            id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            title: fileName,
            number: number,
            albumId: albumName === '새찬송가' ? 'hymnal' : albumName,
            type: 'image',
            fileId: fileId,
            searchTokens: [fileName]
          });
        } catch (err) {
          console.error(`Failed to upload ${file.name}`, err);
        }
        processedCount++;
        onProgress(processedCount, files.length);
      }));
    }
    return uploadedSongs;
  },

  uploadSingleImagesToGDrive: async (
    files: File[], 
    onProgress: (processed: number, total: number) => void
  ) => {
    const { compressImageToWebP, uploadImageToGDrive } = await import('../utils/imageProcessor');
    const uploadedSongs: any[] = [];
    let processedCount = 0;
    const CHUNK_SIZE = 5;

    for (let i = 0; i < files.length; i += CHUNK_SIZE) {
      const chunk = files.slice(i, i + CHUNK_SIZE);
      await Promise.all(chunk.map(async (file) => {
        const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(file.name);
        if (!isImage) {
          processedCount++;
          onProgress(processedCount, files.length);
          return;
        }
        try {
          const compressedBlob = await compressImageToWebP(file, 0.75);
          const fileName = file.name.replace(/\.[^/.]+$/, "");
          const fileId = await uploadImageToGDrive(compressedBlob, `${fileName}.webp`);

          uploadedSongs.push({
            id: `misc-${fileId}`,
            title: fileName,
            albumId: 'misc',
            type: 'image',
            fileId: fileId,
            searchTokens: [fileName]
          });
        } catch (err) {
          console.error(`Failed to upload ${file.name}`, err);
        }
        processedCount++;
        onProgress(processedCount, files.length);
      }));
    }
    return uploadedSongs;
  },
};
