import { ipcMain, dialog, BrowserWindow, app, shell, clipboard } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import * as XLSX from 'xlsx';

import { GDriveService } from './gdriveService';


export interface HymnalLogic {
  getSavedContis: () => Promise<any[]>;
  saveConti: (conti: any) => Promise<{ success: boolean; error?: string }>;
  deleteSavedConti: (id: string) => Promise<{ success: boolean; error?: string }>;
  getSettings: () => Promise<any>;
  saveSettings: (settings: any) => Promise<{ success: boolean }>;
  getSongs: () => Promise<any[]>;
  selectFolder: () => Promise<string | undefined>;
  addAlbum: (album: any) => Promise<{ success: boolean; album?: any }>;
  updateAlbum: (album: any) => Promise<{ success: boolean; error?: string }>;
  deleteAlbum: (albumId: string) => Promise<{ success: boolean; error?: string }>;
  processImages: (args: { albumId: string, sourcePath: string, isIncremental?: boolean }, onProgress?: (data: any) => void) => Promise<{ success: boolean; count?: number; processed?: number; error?: string }>;
  getAuthUrl: () => Promise<string>;
  waitForAuthCode: () => Promise<any>;
  confirmAuth: (code: string) => Promise<any>;
  syncGDrive: (albumId?: string) => Promise<{ success: boolean; message?: string; [key: string]: any }>;
  updateSong: (song: any) => Promise<{ success: boolean; error?: string }>;
  exportCSV: (args: { mode?: string }) => Promise<{ success: boolean; path?: string; error?: string }>;
  importCSV: () => Promise<{ success: boolean; count?: number; error?: string }>;
  deleteSong: (args: { songId: string, shouldDeleteOriginal: boolean }) => Promise<{ success: boolean; error?: string }>;
  openExternal: (url: string) => void;
  resizeWindow: (width: number, height: number) => void;
  generateMobilePDF: (title: string, type: 'leader' | 'congregation', items: any[], onProgress?: (msg: string, percent: number) => void, footer?: string) => Promise<string>;
  seedInitialData: () => Promise<{ success: boolean; count?: number; error?: string }>;
}

export function createHymnalLogic(win?: BrowserWindow): HymnalLogic {
  const hymnalDir = path.join(app.getPath('userData'), 'hymnal');
  const imagesDir = path.join(hymnalDir, 'hymnal_images');
  const dbPath = path.join(hymnalDir, 'music_data.json');
  
  const gdrive = new GDriveService(app.getPath('userData'));
  const settingsPath = path.join(hymnalDir, 'settings.json');
  const contisPath = path.join(hymnalDir, 'saved_contis.json');

  const sanitizeFilename = (num: number, title: string, id?: string) => {
    const normalizedTitle = (title || '').normalize('NFC');
    const clean = normalizedTitle.replace(/[^가-힣a-zA-Z0-9\s]/g, '').trim().replace(/\s+/g, '_').slice(0, 30);
    const uniqueId = id ? `_${id.slice(-4)}` : '';
    return `${num}_${clean}${uniqueId}.webp`;
  };

  const sanitizeMeter = (val: any): string => {
    if (val === undefined || val === null) return '';
    let str = val.toString().trim();
    if (!str) return '';
    const korDateMatch = str.match(/^(\d{1,2})\s*월\s*(\d{1,2})\s*일$/);
    if (korDateMatch) return `${korDateMatch[1]}/${korDateMatch[2]}`;
    const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const engDateMatch = str.match(/^(\d{1,2})-([a-zA-Z]{3})$/i);
    if (engDateMatch) {
      const month = engDateMatch[2].toLowerCase();
      const monthIdx = months.indexOf(month) + 1;
      if (monthIdx > 0) return `${monthIdx}/${engDateMatch[1]}`;
    }
    const engDateMatchRev = str.match(/^([a-zA-Z]{3})-(\d{1,2})$/i);
    if (engDateMatchRev) {
      const month = engDateMatchRev[1].toLowerCase();
      const monthIdx = months.indexOf(month) + 1;
      if (monthIdx > 0) return `${monthIdx}/${engDateMatchRev[2]}`;
    }
    return str;
  };

  const getSettings = async () => {
    try {
      const data = await fs.readFile(settingsPath, 'utf8');
      const settings = JSON.parse(data);
      if (!settings.albums || settings.albums.length === 0) {
        settings.albums = [
          { id: 'hymnal', name: '찬송가', path: settings.hymnalPath || '', type: 'fixed' },
          { id: 'ccm', name: 'CCM', path: settings.ccmPath || '', type: 'fixed' }
        ];
        delete settings.hymnalPath;
        delete settings.ccmPath;
        await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
      } else {
        // 필수 앨범(hymnal, ccm)이 있는지 확인하고 없으면 추가
        const hasHymnal = settings.albums.some((a: any) => a.id === 'hymnal');
        const hasCCM = settings.albums.some((a: any) => a.id === 'ccm');
        let changed = false;
        if (!hasHymnal) {
           settings.albums.unshift({ id: 'hymnal', name: '찬송가', path: '', type: 'fixed' });
           changed = true;
        }
        if (!hasCCM) {
           settings.albums.splice(hasHymnal ? 1 : 0, 0, { id: 'ccm', name: 'CCM', path: '', type: 'fixed' });
           changed = true;
        }
        if (changed) {
          await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
        }
      }
      return settings;
    } catch {
      return { 
        albums: [
          { id: 'hymnal', name: '찬송가', path: '', type: 'fixed' },
          { id: 'ccm', name: 'CCM', path: '', type: 'fixed' }
        ]
      };
    }
  };

  return {
    async getSavedContis() {
      try {
        const data = await fs.readFile(contisPath, 'utf8');
        return JSON.parse(data);
      } catch { return []; }
    },
    async saveConti(conti) {
      try {
        await fs.mkdir(hymnalDir, { recursive: true });
        let contis = [];
        try {
          const data = await fs.readFile(contisPath, 'utf8');
          contis = JSON.parse(data);
        } catch {}
        const idx = contis.findIndex((c: any) => c.id === conti.id);
        if (idx !== -1) {
          contis[idx] = { ...contis[idx], ...conti, updatedAt: new Date().toISOString() };
        } else {
          contis.push({ ...conti, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        }
        await fs.writeFile(contisPath, JSON.stringify(contis, null, 2), 'utf-8');
        return { success: true };
      } catch (err: any) { return { success: false, error: err.message }; }
    },
    async deleteSavedConti(id) {
       try {
        const data = await fs.readFile(contisPath, 'utf8');
        let contis = JSON.parse(data);
        contis = contis.filter((c: any) => c.id !== id);
        await fs.writeFile(contisPath, JSON.stringify(contis, null, 2), 'utf-8');
        return { success: true };
      } catch (err: any) { return { success: false, error: err.message }; }
    },
    getSettings,
    async saveSettings(settings) {
      await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
      return { success: true };
    },
    async getSongs() {
      try {
        const content = await fs.readFile(dbPath, 'utf8');
        let musicData = JSON.parse(content);
        let changed = false;
        for (let song of musicData) {
          if (song.title) song.title = song.title.normalize('NFC');
          if (song.lyrics) song.lyrics = song.lyrics.normalize('NFC');
          if (song.category) song.category = song.category.normalize('NFC');
          if (song.youtubeUrl && (!song.youtubeVideos || song.youtubeVideos.length === 0)) {
            song.youtubeVideos = [{ name: '기본 영상', url: song.youtubeUrl }];
            changed = true;
          }
          if (song.filename) {
            const expectedName = sanitizeFilename(song.number, song.title, song.id);
            if (song.filename !== expectedName) {
              const oldPath = path.join(imagesDir, song.filename);
              const newPath = path.join(imagesDir, expectedName);
              try {
                if (await fs.stat(oldPath).then(() => true).catch(() => false)) {
                  await fs.rename(oldPath, newPath);
                  song.filename = expectedName;
                  song.filePath = `hymnal_images/${expectedName}`;
                  changed = true;
                } else {
                  song.filename = expectedName;
                  song.filePath = `hymnal_images/${expectedName}`;
                  changed = true;
                }
              } catch (err) {}
            }
          }
        }
        if (changed) await fs.writeFile(dbPath, JSON.stringify(musicData, null, 2), 'utf-8');
        return musicData;
      } catch (err) { return []; }
    },
    async selectFolder() {
      if (!win) return undefined;
      const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
      return result.filePaths[0];
    },
    async addAlbum(album) {
      const settings = await getSettings();
      const newAlbum = { ...album, id: `album-${Date.now()}`, type: 'custom' };
      settings.albums.push(newAlbum);
      await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
      return { success: true, album: newAlbum };
    },
    async updateAlbum(updatedAlbum) {
      const settings = await getSettings();
      const idx = settings.albums.findIndex((a: any) => a.id === updatedAlbum.id);
      if (idx !== -1) {
        settings.albums[idx] = { ...settings.albums[idx], ...updatedAlbum };
        await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
        return { success: true };
      }
      return { success: false, error: 'Album not found' };
    },
    async deleteAlbum(albumId) {
      const settings = await getSettings();
      const albumToDelete = settings.albums.find((a: any) => a.id === albumId);
      if (!albumToDelete || albumToDelete.type === 'fixed') return { success: false, error: 'Cannot delete fixed album' };
      settings.albums = settings.albums.filter((a: any) => a.id !== albumId);
      await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
      try {
        const content = await fs.readFile(dbPath, 'utf8');
        let musicData = JSON.parse(content);
        musicData = musicData.filter((s: any) => !s.id.startsWith(`${albumId}-`));
        await fs.writeFile(dbPath, JSON.stringify(musicData, null, 2), 'utf-8');
      } catch {}
      return { success: true };
    },
    async processImages({ albumId, sourcePath, isIncremental }, onProgress) {
        if (!sourcePath) return { success: false, error: 'Source path is missing' };
        console.log(`[Build] Starting image processing for album: ${albumId}, path: ${sourcePath}`);
        const isHymnal = albumId === 'hymnal';
        try {
          const files = await fs.readdir(sourcePath);
          const imageFiles = files.filter(f => /\.(jpg|jpeg|png|webp|bmp)$/i.test(f));
          const total = imageFiles.length;
          console.log(`[Build] Found ${total} images to process.`);
          
          let processedCount = 0;
          let musicData: any[] = [];
          try {
            const content = await fs.readFile(dbPath, 'utf8');
            musicData = JSON.parse(content);
          } catch (err) { musicData = []; }
          
          let masterData: Record<number, any> = {};
          if (isHymnal) {
            try {
              // 리소스 경로 처리 (개발 vs 배포)
              const xlsxName = 'hymnal_master_data.xlsx';
              const xlsxPath = app.isPackaged 
                ? path.join(process.resourcesPath, xlsxName)
                : path.join(process.cwd(), xlsxName);

              const fileBuf = await fs.readFile(xlsxPath);
              const workbook = XLSX.read(fileBuf, { type: 'buffer' });
              const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
              const sheetData: any[] = XLSX.utils.sheet_to_json(firstSheet);
              sheetData.forEach(row => {
                const num = parseInt(row['장'] || row['번호'] || row['number'] || row['no'] || row['num'], 10);
                if (num) {
                  masterData[num] = { 
                    title: (row['제목'] || row['title'] || '').toString(), 
                    category: (row['분류'] || row['주제'] || row['구분'] || row['category'] || '').toString(),
                    code: (row['코드'] || row['code'] || '').toString(),
                    meter: sanitizeMeter(row['박자'] || row['meter'] || ''),
                    lyrics: (row['가사'] || row['lyrics'] || '').toString()
                  };
                }
              });
            } catch (err) {
              console.log('[Build] Master data XLSX not found at expected path. Skipping enrichment.');
            }
          }
          
          for (const file of imageFiles) {
            try {
              const fileNameOnly = path.parse(file).name;
              // 숫자만 추출 (예: "1_만복의근원" -> 1)
              const songNumber = parseInt(fileNameOnly.match(/\d+/)?.[0] || '0', 10);
              
              // 1. 기존 매칭 확인 (번호 우선 매칭)
              let existingSongIdx = -1;
              if (isHymnal && songNumber > 0) {
                existingSongIdx = musicData.findIndex(s => s.number === songNumber && s.id.startsWith('hymnal-'));
              }
              
              // 2. 파일명 기반 매칭 (번호가 없는 경우 등)
              if (existingSongIdx === -1) {
                existingSongIdx = musicData.findIndex(s => s.originalFilename === file);
              }

              const existingSong = existingSongIdx !== -1 ? musicData[existingSongIdx] : null;
              
              if (existingSong?.isManual && existingSong.filePath) { 
                processedCount++; 
                continue; 
              }
              
              let title = (existingSong?.title || (/[가-힣]/.test(fileNameOnly) ? fileNameOnly.replace(/[0-9]/g, '').trim() : fileNameOnly)).normalize('NFC');
              if (title.startsWith('_')) title = title.substring(1);

              let lyrics = existingSong?.lyrics || '';
              let code = existingSong?.code || '';
              let meter = existingSong?.meter || '';
              let category = existingSong?.category || '';
              
              if (isHymnal && songNumber && masterData[songNumber]) {
                const info = masterData[songNumber];
                title = (info.title || title || fileNameOnly).toString();
                lyrics = (info.lyrics || lyrics).toString().replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                code = (info.code || code).toString();
                meter = (info.meter || meter).toString();
                category = (info.category || category).toString(); 
              }
              
              const songId = existingSong?.id || `${albumId}-${songNumber || Date.now()}-${processedCount}`;
              const newFileName = sanitizeFilename(songNumber, title || fileNameOnly, songId);
              const outputFilePath = path.join(imagesDir, newFileName);
              
              const outputExists = await fs.access(outputFilePath).then(() => true).catch(() => false);
              if (!(isIncremental && outputExists && existingSong?.filePath)) {
                await sharp(path.join(sourcePath, file))
                  .sharpen({ sigma: 1.0 })
                  .webp({ quality: 100, lossless: true })
                  .toFile(outputFilePath);
              }
              
              const newSong = {
                ...(existingSong || {}),
                id: songId, 
                number: songNumber, 
                title: title || fileNameOnly, 
                lyrics, 
                code, 
                meter,
                filename: newFileName, 
                filePath: `hymnal_images/${newFileName}`, 
                originalFilename: file, 
                category, 
                isManual: existingSong?.isManual || false
              };
              
              if (existingSongIdx !== -1) musicData[existingSongIdx] = newSong;
              else musicData.push(newSong);
              
              processedCount++;
              if (processedCount % 10 === 0 || processedCount === total) {
                console.log(`[Build] Progress: ${processedCount}/${total} (${Math.round(processedCount/total*100)}%)`);
              }
              if (onProgress) onProgress({ processed: processedCount, total });
            } catch (err) {
              console.error(`[Build] Failed to process ${file}:`, err);
            }
          }
          
          const sourceFiles = new Set(imageFiles);
          musicData = musicData.filter((song: any) => !song.id.startsWith(`${albumId}-`) || sourceFiles.has(song.originalFilename));
          await fs.writeFile(dbPath, JSON.stringify(musicData, null, 2), 'utf-8');
          
          console.log(`[Build] Successfully processed ${processedCount} images.`);
          return { success: true, count: imageFiles.length, processed: processedCount };
        } catch (err: any) { 
          console.error(`[Build] Critical Error: ${err.message}`);
          return { success: false, error: err.message }; 
        }
    },
    getAuthUrl: () => gdrive.getAuthUrl(),
    waitForAuthCode: () => gdrive.waitForAuthCode(),
    confirmAuth: (code: string) => gdrive.setToken(code),
    async syncGDrive(albumId = 'all', onProgress) {
      try {
        if (!await gdrive.loadSavedCredentials()) return { success: false, message: 'Need Auth' };
        const settings = await getSettings();
        const syncResult = await gdrive.syncFiles(hymnalDir, albumId, settings.albums, onProgress); 
        return { success: true, ...syncResult };
      } catch (err: any) { return { success: false, message: err.message }; }
    },
    async generateGoogleSlides({ title, type, items }, onProgress) {
      try {
        if (!await gdrive.loadSavedCredentials()) return { success: false, message: 'Need Auth' };
        
        // 프론트엔드에서 보낸 filename을 이용해 백엔드의 절대 경로 조립
        const itemsWithPaths = items.map((item: any) => ({
          ...item,
          localFilePath: path.join(imagesDir, item.filename)
        }));

        const url = await gdrive.generateGoogleDocs(title, type, itemsWithPaths, onProgress);
        return { success: true, url };
      } catch (err: any) {
        console.error('[Docs] Error:', err);
        return { success: false, message: err.message };
      }
    },
    async generateMobilePDF(title, type, items, onProgress, footer) {
      try {
        if (!await gdrive.loadSavedCredentials()) throw new Error('Need Auth');
        
        // 이미지 절대 경로 조립
        const itemsWithPaths = items.map((item: any) => ({
          ...item,
          localFilePath: path.join(imagesDir, item.filename)
        }));

        return await gdrive.generateMobilePDF(title, type, itemsWithPaths, onProgress, footer);
      } catch (err: any) {
        console.error('[PDF] Error:', err);
        throw err;
      }
    },
    async updateSong(updatedSong) {
      try {
        const content = await fs.readFile(dbPath, 'utf8');
        let musicData = JSON.parse(content);
        const index = musicData.findIndex((s: any) => s.id === updatedSong.id);
        if (index !== -1) {
          const oldSong = musicData[index];
          if (updatedSong.title !== undefined || updatedSong.number !== undefined) {
            const newTitle = updatedSong.title !== undefined ? updatedSong.title : oldSong.title;
            const newNumber = updatedSong.number !== undefined ? updatedSong.number : oldSong.number;
            const newFileName = sanitizeFilename(newNumber, newTitle, oldSong.id);
            if (oldSong.filename !== newFileName) {
              const oldPath = path.join(imagesDir, oldSong.filename);
              const newPath = path.join(imagesDir, newFileName);
              try {
                if (await fs.stat(oldPath).then(() => true).catch(() => false)) {
                  await fs.rename(oldPath, newPath);
                  updatedSong.filename = newFileName;
                  updatedSong.filePath = `hymnal_images/${newFileName}`;
                } else {
                  updatedSong.filename = newFileName;
                  updatedSong.filePath = `hymnal_images/${newFileName}`;
                }
              } catch (err) {}
            }
          }
          musicData[index] = { ...oldSong, ...updatedSong, isManual: updatedSong.isManual !== undefined ? updatedSong.isManual : true };
          await fs.writeFile(dbPath, JSON.stringify(musicData, null, 2), 'utf-8');
          return { success: true };
        }
        return { success: false, error: 'Song not found' };
      } catch (err: any) { return { success: false, error: err.message }; }
    },
    async exportCSV({ mode }) {
      try {
        const content = await fs.readFile(dbPath, 'utf8');
        const data = JSON.parse(content);
        const settings = await getSettings();
        let filteredData = data;
        let exportName = '전체';
        if (mode && mode !== 'all') {
          filteredData = data.filter((s: any) => s.id.startsWith(mode + '-'));
          const album = settings.albums.find((a: any) => a.id === mode);
          if (album) exportName = album.name;
        }
        const header = ['ID', '번호', '제목', '코드', '박자', '가사', '카테고리', '파일명', '유튜브'].join(',');
        const rows = filteredData.map((s: any) => {
          const fields = [s.id, s.number, s.title, s.code, s.meter, s.lyrics, s.category, s.filename, s.youtubeVideos ? JSON.stringify(s.youtubeVideos) : (s.youtubeUrl ? JSON.stringify([{ name: '기본 영상', url: s.youtubeUrl }]) : '')].map(val => {
            let str = (val === undefined || val === null ? '' : val).toString().normalize('NFC');
            if (str.startsWith('=') || str.startsWith('-') || str.startsWith('+')) str = "'" + str;
            else if (/^\d{1,2}\/\d{1,2}$/.test(str)) str = "'" + str;
            return `"${str.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
          });
          return fields.join(',');
        });
        if (!win) return { success: false, error: 'No window for dialog' };
        const { filePath } = await dialog.showSaveDialog(win, { title: '데이터 내보내기', defaultPath: path.join(app.getPath('downloads'), `찬양데이터_${exportName}_${new Date().toISOString().split('T')[0]}.csv`), filters: [{ name: 'CSV Files', extensions: ['csv'] }] });
        if (!filePath) return { success: false };
        await fs.writeFile(filePath, '\ufeff' + [header, ...rows].join('\n'), 'utf-8');
        return { success: true, path: filePath };
      } catch (err: any) { return { success: false, error: err.message }; }
    },
    async importCSV() {
      if (!win) return { success: false, error: 'No window for dialog' };
      const { filePaths } = await dialog.showOpenDialog(win, { title: '데이터 가져오기', filters: [{ name: 'CSV Files', extensions: ['csv'] }] });
      if (filePaths.length === 0) return { success: false };
      try {
        const csvRaw = await fs.readFile(filePaths[0], 'utf8');
        const rows = csvRaw.split('\n').filter(r => r.trim()).slice(1);
        const importedData = rows.map(row => {
          const parts: string[] = []; let current = ''; let inQuotes = false;
          for (let i = 0; i < row.length; i++) {
            const char = row[i];
            if (char === '"' && row[i+1] === '"') { current += '"'; i++; }
            else if (char === '"') inQuotes = !inQuotes;
            else if (char === ',' && !inQuotes) { parts.push(current); current = ''; }
            else current += char;
          }
          parts.push(current);
          const cleanStr = (s: string | undefined) => s ? s.trim() : '';
          return {
            id: cleanStr(parts[0]), number: parseInt(cleanStr(parts[1]), 10) || 0, title: cleanStr(parts[2]), code: cleanStr(parts[3]), meter: sanitizeMeter(cleanStr(parts[4])),
            lyrics: cleanStr(parts[5]), category: cleanStr(parts[6]), filename: cleanStr(parts[7]),
            youtubeVideos: (() => { const raw = cleanStr(parts[8]); try { if (raw.startsWith('[')) return JSON.parse(raw); if (raw) return [{ name: '기본 영상', url: raw }]; return []; } catch (e) { return []; } })()
          };
        });
        const currentContent = await fs.readFile(dbPath, 'utf8');
        let currentData = JSON.parse(currentContent);
        importedData.forEach(item => {
          const idx = currentData.findIndex((s: any) => s.id === item.id || (s.number === item.number && s.number !== 0));
          if (idx !== -1) currentData[idx] = { ...currentData[idx], ...item };
          else currentData.push(item);
        });
        await fs.writeFile(dbPath, JSON.stringify(currentData, null, 2), 'utf-8');
        return { success: true, count: currentData.length };
      } catch (err: any) { return { success: false, error: err.message }; }
    },
    async deleteSong({ songId, shouldDeleteOriginal }) {
      try {
        const content = await fs.readFile(dbPath, 'utf8');
        let musicData = JSON.parse(content);
        const idx = musicData.findIndex((s: any) => s.id === songId);
        if (idx === -1) return { success: false, error: 'Song not found' };
        const song = musicData[idx];
        const settings = await getSettings();
        const targetAlbum = settings.albums.find((a: any) => songId.startsWith(a.id + '-'));
        const sourceFolder = targetAlbum?.path;
        if (shouldDeleteOriginal && sourceFolder && song.originalFilename) {
          const originalPath = path.join(sourceFolder, song.originalFilename);
          try { await shell.trashItem(originalPath); } catch (err) { try { await fs.unlink(originalPath); } catch (e) {} }
        }
        if (song.filename) {
          try { await fs.unlink(path.join(imagesDir, song.filename)).catch(() => {}); } catch (err) {}
        }
        if (song.filename && targetAlbum) {
          try {
            await gdrive.deleteFileByName(song.filename, targetAlbum.id, settings.albums);
          } catch (err: any) {
            console.error(`[Hymnal] Failed to delete file from GDrive: ${err.message}`);
          }
        }
        musicData.splice(idx, 1);
        await fs.writeFile(dbPath, JSON.stringify(musicData, null, 2), 'utf-8');
        return { success: true };
      } catch (err: any) { return { success: false, error: err.message }; }
    },
    async seedInitialData() {
      try {
        await fs.mkdir(hymnalDir, { recursive: true });
        
        // 데이터가 이미 있는지 확인
        try {
          const content = await fs.readFile(dbPath, 'utf8');
          const existing = JSON.parse(content);
          if (existing && existing.length > 0) return { success: true, count: existing.length };
        } catch {}

        // 엑셀에서 데이터 읽기
        const xlsxName = 'hymnal_master_data.xlsx';
        const xlsxPath = app.isPackaged 
          ? path.join(process.resourcesPath, xlsxName)
          : path.join(process.cwd(), xlsxName);
          
        const fileBuf = await fs.readFile(xlsxPath);
        const workbook = XLSX.read(fileBuf, { type: 'buffer' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const sheetData: any[] = XLSX.utils.sheet_to_json(firstSheet);
        
        const initialSongs = sheetData.map((row, idx) => {
          const num = parseInt(row['장'] || row['번호'] || row['number'] || row['no'] || row['num'], 10);
          const title = (row['제목'] || row['title'] || '').toString();
          return {
            id: `hymnal-${num || (1000 + idx)}`,
            number: num || 0,
            title: title.normalize('NFC'),
            lyrics: (row['가사'] || row['lyrics'] || '').toString().replace(/\r\n/g, '\n').replace(/\r/g, '\n').normalize('NFC'),
            category: (row['분류'] || row['주제'] || row['구분'] || row['category'] || '').toString().normalize('NFC'),
            code: (row['코드'] || row['code'] || '').toString(),
            meter: sanitizeMeter(row['박자'] || row['meter'] || ''),
            filename: '',
            filePath: '',
            isManual: false
          };
        }).filter(s => s.title);

        await fs.writeFile(dbPath, JSON.stringify(initialSongs, null, 2), 'utf-8');
        return { success: true, count: initialSongs.length };
      } catch (err: any) {
        console.error('[Seed] Failed to seed initial hymnal data:', err);
        return { success: false, error: err.message };
      }
    },
    openExternal: (url: string) => shell.openExternal(url),
    resizeWindow: (width: number, height: number) => {
      const targetWin = win || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
      if (targetWin) {
        targetWin.setSize(width, height, true);
      }
    }
  };
}

export function registerHymnalIPC(win: BrowserWindow) {
  const logic = createHymnalLogic(win);

  ipcMain.handle('hymnal:get-saved-contis', () => logic.getSavedContis());
  ipcMain.handle('hymnal:save-conti', (_, conti) => logic.saveConti(conti));
  ipcMain.handle('hymnal:delete-saved-conti', (_, id) => logic.deleteSavedConti(id));
  ipcMain.handle('hymnal:get-settings', () => logic.getSettings());
  ipcMain.handle('hymnal:save-settings', (_, settings) => logic.saveSettings(settings));
  ipcMain.handle('hymnal:get-songs', () => logic.getSongs());
  ipcMain.handle('hymnal:select-folder', () => logic.selectFolder());
  ipcMain.handle('hymnal:add-album', (_, album) => logic.addAlbum(album));
  ipcMain.handle('hymnal:update-album', (_, album) => logic.updateAlbum(album));
  ipcMain.handle('hymnal:delete-album', (_, albumId) => logic.deleteAlbum(albumId));
  ipcMain.handle('hymnal:process-images', (_, args) => logic.processImages(args, (data) => win.webContents.send('hymnal:process-progress', data)));
  ipcMain.handle('hymnal:get-auth-url', () => logic.getAuthUrl());
  ipcMain.handle('hymnal:wait-for-auth-code', () => logic.waitForAuthCode());
  ipcMain.handle('hymnal:confirm-auth', (_, code) => logic.confirmAuth(code));
  ipcMain.handle('hymnal:sync-gdrive', (_, albumId) => logic.syncGDrive(albumId));
  ipcMain.handle('hymnal:generate-slides', (_, args) => logic.generateGoogleSlides(args, (msg, percent) => win.webContents.send('hymnal:slides-progress', { msg, percent })));
  ipcMain.handle('hymnal:generate-pdf', async (_, { title, type, items, footer }) => {
    try {
      const url = await logic.generateMobilePDF(title, type, items, (msg, percent) => {
        win?.webContents.send('hymnal:pdf-progress', { msg, percent });
      }, footer);
      return { success: true, url };
    } catch (err: any) {
      console.error('[PDF] IPC Error:', err);
      return { success: false, message: err.message };
    }
  });
  ipcMain.handle('hymnal:update-song', (_, song) => logic.updateSong(song));
  ipcMain.handle('hymnal:export-csv', (_, args) => logic.exportCSV(args));
  ipcMain.handle('hymnal:import-csv', () => logic.importCSV());
  ipcMain.handle('hymnal:delete-song', (_, args) => logic.deleteSong(args));
  ipcMain.on('hymnal:write-clipboard', (_, text) => {
    clipboard.writeText(text);
  });
  ipcMain.on('hymnal:open-external', (_, url) => logic.openExternal(url));
  ipcMain.on('hymnal:resize-window', (_, { width, height }) => logic.resizeWindow(width, height));
}
