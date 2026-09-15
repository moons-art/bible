import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import fsPromises from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import url from 'node:url';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { BrowserWindow, ipcMain, app } from 'electron'; 

const CLIENT_ID = '786503545807-07apkofb1efp1fe443hi1tnjbtfkblst.apps.googleusercontent.com'; 
const CLIENT_SECRET = process.env.CLIENT_SECRET || "";
const REDIRECT_URI = 'http://localhost:5005';

export class GDriveService {
  private oauth2Client: OAuth2Client;
  private tokenPath: string;

  constructor(appDataPath: string) {
    this.oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
    this.tokenPath = path.join(appDataPath, 'gdrive-token.json');
  }

  /**
   * 구글 인증 관련 에러(invalid_grant 등)가 발생했을 때 
   * 기존 토큰 파일을 삭제하여 세션을 초기화합니다.
   */
  private async handleAuthError(err: any) {
    const errorMsg = err.message || '';
    const isAuthError = 
      errorMsg.includes('invalid_grant') || 
      errorMsg.includes('No refresh token is set') ||
      errorMsg.includes('Expired') ||
      (err.code === 400 || err.code === 401);

    if (isAuthError) {
      console.warn('[GDrive] Auth error detected. Clearing tokens...', errorMsg);
      try {
        if (fs.existsSync(this.tokenPath)) {
          fs.unlinkSync(this.tokenPath);
        }
        this.oauth2Client.setCredentials({}); // 메모리 상의 인증 정보도 초기화
      } catch (e) {
        console.error('[GDrive] Failed to clear token file:', e);
      }
      throw new Error('인증 정보가 만료되었습니다. 다시 로그인한 후 시도해 주세요.');
    }
    throw err;
  }

  async getAuthUrl() {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/drive.file']
    });
  }

  async waitForAuthCode(): Promise<string> {
    return new Promise((resolve, reject) => {
      const server = http.createServer(async (req, res) => {
        try {
          const queryObject = url.parse(req.url || '', true).query;
          const code = queryObject.code as string;

          if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
              <html>
                <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #f8fafc;">
                  <div style="background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1);">
                    <h1 style="color: #10b981;">✅ 인증 성공!</h1>
                    <p style="color: #64748b;">인증 코드가 앱으로 전달되었습니다. 이 창을 닫고 앱으로 돌아가세요.</p>
                  </div>
                </body>
              </html>
            `);
            resolve(code);
            server.close();
          }
        } catch (e) {
          reject(e);
          server.close();
        }
      }).on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.error('Auth server port 5005 is already in use');
          reject(new Error('인증 서버 포트(5005)가 이미 사용 중입니다. 다른 작업이 끝날 때까지 기다려 주세요.'));
        } else {
          reject(err);
        }
      }).listen(5005, () => {
        console.log('Auth server listening on port 5005');
      });

      setTimeout(() => {
        server.close();
        reject(new Error('Authentication timed out'));
      }, 300000);
    });
  }

  async setToken(code: string) {
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);
    await fsPromises.writeFile(this.tokenPath, JSON.stringify(tokens));
    return tokens;
  }

  async loadSavedCredentials() {
    try {
      const content = await fsPromises.readFile(this.tokenPath, 'utf8');
      const tokens = JSON.parse(content);
      this.oauth2Client.setCredentials(tokens);
      return true;
    } catch (err) {
      return false;
    }
  }

  async syncFiles(hymnalDirPath: string, albumId: string = 'all', albums: any[] = [], onProgress?: (data: any) => void) {
    try {
      const drive = google.drive({ version: 'v3', auth: this.oauth2Client });
      
      // 1. Base Folder 관리
    let rootFolderId = await this.findFolder(drive, 'CEUM_Hymnal_Data');
    if (!rootFolderId) {
      rootFolderId = await this.createFolder(drive, 'CEUM_Hymnal_Data');
    }

    // 2. music_data.json 업로드 (메타데이터 최신화)
    const dbFilePath = path.join(hymnalDirPath, 'music_data.json');
    if (fs.existsSync(dbFilePath)) {
      console.log('[GDrive] Syncing music_data.json...');
      await this.uploadFile(drive, dbFilePath, 'application/json', rootFolderId);
    }

    // 3. 대상 앨범 정보 및 폴더 확정
    const foldersToProcess: { id: string, albumId: string }[] = [];
    
    // 앨범 목록을 순회하며 동기화 대상 결정
    for (const album of albums) {
      if (albumId === 'all' || albumId === album.id) {
        // 드라이브에 해당 앨범 이름으로 폴더 생성/찾기
        const folderId = await this.getOrCreateFolder(drive, album.name, rootFolderId);
        foldersToProcess.push({ id: folderId, albumId: album.id });
      }
    }

    // 4. 데이터 로드
    const content = await fsPromises.readFile(dbFilePath, 'utf8');
    const musicData = JSON.parse(content);
    const localFilenames = new Set(musicData.map((s: any) => path.basename(s.filename || s.filePath || '')));
    const remoteFilesByAlbum: { [key: string]: any[] } = {};

    // 5. [청소] 각 앨범 폴더의 실태 조사 및 유령 파일 제거
    for (const folder of foldersToProcess) {
      console.log(`[GDrive] Syncing Album: ${folder.albumId} (Folder: ${folder.id})`);
      const resp = await drive.files.list({
        q: `'${folder.id}' in parents and trashed=false`,
        fields: 'files(id, name)',
        pageSize: 1000
      });
      const remoteFiles = resp.data.files || [];
      remoteFilesByAlbum[folder.albumId] = remoteFiles;

      // 드라이브에는 있는데 로컬 DB에는 없는 파일 삭제 (정리)
      for (const file of remoteFiles) {
        if (!localFilenames.has(file.name!)) {
          console.log(`[GDrive] Cleanup: Trashing stale file ${file.name} from Drive.`);
          await drive.files.update({
            fileId: file.id!,
            requestBody: { trashed: true }
          }).catch(() => {});
        }
      }
    }

    // 6. 이미지 파일 동기화 (이미 정리가 끝난 상태에서 부족한 것만 업로드)
    let uploadCount = 0;
    let skipCount = 0;
    let totalCount = 0;
    let processedCount = 0; // 변수 선언 추가

    // 앨범 ID와 폴더 ID를 연결하는 맵 생성 (빠른 조회를 위해)
    const albumFolderMap = new Map(foldersToProcess.map(f => [f.albumId, f.id]));

    for (const song of musicData) {
      if (!song.filePath) continue;
      
      // 곡의 소속 앨범 ID 추출 (id가 "{albumId}-..." 형식)
      const songId = (song.id || '').toLowerCase();
      let targetAlbumId = '';
      
      // 어떤 앨범 소속인지 확인
      for (const album of albums) {
        if (songId.startsWith(`${album.id.toLowerCase()}-`)) {
          targetAlbumId = album.id;
          break;
        }
      }

      // 소속을 알 수 없거나, 현재 동기화 대상이 아니면 건너뜐
      if (!targetAlbumId) continue;
      if (albumId !== 'all' && albumId !== targetAlbumId) continue;

      const targetFolderId = albumFolderMap.get(targetAlbumId);
      if (!targetFolderId) continue;

      totalCount++;
      const fileName = path.basename(song.filePath);
      const localFilePath = path.join(hymnalDirPath, 'hymnal_images', fileName);
      
      // 드라이브에 이미 있는지 확인 (고속 대조)
      const isAlreadyOnDrive = remoteFilesByAlbum[targetAlbumId]?.some(f => f.name === fileName);

      if (fs.existsSync(localFilePath)) {
        if (!isAlreadyOnDrive) {
          try {
            console.log(`[GDrive] [${targetAlbumId}] Uploading: ${fileName} to folder ${targetFolderId}`);
            await this.uploadFile(drive, localFilePath, 'image/webp', targetFolderId);
            uploadCount++;
          } catch (err) {
            console.error(`[GDrive] Failed to upload: ${fileName}`, err);
          }
        } else {
          skipCount++;
        }
      } else {
        console.warn(`[GDrive] Local file missing: ${localFilePath}`);
      }
      
      processedCount++;
      if (onProgress && processedCount % 5 === 0) {
        onProgress({ processed: processedCount, total: musicData.length });
      }
    }
    if (onProgress) onProgress({ processed: musicData.length, total: musicData.length });
    console.log(`[GDrive] Finished! AlbumId: ${albumId}, Uploaded: ${uploadCount}, Skipped: ${skipCount}`);
    
    return {
      uploaded: uploadCount,
      skipped: skipCount,
      total: totalCount
    };
    } catch (err) {
      return await this.handleAuthError(err);
    }
  }

  async deleteFileByName(filename: string, albumId: string, albums: any[]) {
    try {
      const drive = google.drive({ version: 'v3', auth: this.oauth2Client });
      
      let rootFolderId = await this.findFolder(drive, 'CEUM_Hymnal_Data');
      if (!rootFolderId) return;
      
      const targetAlbum = albums.find(a => a.id === albumId);
      if (!targetAlbum) return;
      
      const resAlbum = await drive.files.list({
        q: `name='${targetAlbum.name}' and '${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id)',
      });
      const albumFolderId = resAlbum.data.files?.[0]?.id;
      if (!albumFolderId) return;

      const res = await drive.files.list({
        q: `name='${filename}' and '${albumFolderId}' in parents and trashed=false`,
        fields: 'files(id)'
      });

      const existingFiles = res.data.files || [];
      for (const file of existingFiles) {
        if (file.id) {
          await drive.files.update({
            fileId: file.id,
            requestBody: { trashed: true }
          });
          console.log(`[GDrive] Deleted file ${filename} (ID: ${file.id}) from album ${targetAlbum.name}`);
        }
      }
    } catch (err) {
      console.error('[GDrive] deleteFileByName failed:', err);
    }
  }

  private async getOrCreateFolder(drive: any, name: string, parentId: string) {
    const res = await drive.files.list({
      q: `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
    });
    const existing = res.data.files || [];
    if (existing.length > 0) return existing[0].id;
    return await this.createFolder(drive, name, parentId);
  }

  private async findFolder(drive: any, name: string) {
    const res = await drive.files.list({
      q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
    });
    return res.data.files[0]?.id;
  }

  private async createFolder(drive: any, name: string, parentId?: string) {
    const res = await drive.files.create({
      resource: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : []
      },
      fields: 'id',
    });
    return res.data.id;
  }

  private async uploadFile(drive: any, filePath: string, mimeType: string, parentId: string) {
    const fileName = path.basename(filePath);
    const contentStream = fs.createReadStream(filePath);

    const existingFileRes = await drive.files.list({
      q: `name='${fileName}' and '${parentId}' in parents and trashed=false`,
      fields: 'files(id)',
    });

    const existingFiles = existingFileRes.data.files || [];

    if (existingFiles.length > 0) {
      // 업데이트 (v3에서는 fileId가 필요)
      await drive.files.update({
        fileId: existingFiles[0].id,
        media: {
          mimeType,
          body: contentStream,
        },
      });
    } else {
      // 신규 생성
      await drive.files.create({
        resource: {
          name: fileName,
          parents: [parentId],
        },
        media: {
          mimeType,
          body: contentStream,
        },
        fields: 'id',
      });
    }
  }

  private async downloadFile(drive: any, fileId: string, destPath: string) {
    const dest = fs.createWriteStream(destPath);
    
    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );

    return new Promise((resolve, reject) => {
      res.data
        .on('error', (err: any) => {
          console.error('Drive download stream error:', err);
          reject(err);
        })
        .pipe(dest);
      
      dest.on('finish', () => {
        resolve(true);
      });
      
      dest.on('error', (err: any) => {
        console.error('Local write stream error:', err);
        reject(err);
      });
    });
  }

  /**
   * 구글 독스로 모바일 악보집 생성
   * Slides 대비 세로형 가독성이 압도적이며 모바일에서 스크롤로 보기 편함
   */
  async generateGoogleDocs(title: string, type: 'leader' | 'congregation', items: any[], onProgress?: (msg: string, percent: number) => void) {
    try {
      const docs = google.docs({ version: 'v1', auth: this.oauth2Client });
      const drive = google.drive({ version: 'v3', auth: this.oauth2Client });

    // 1. 임시 폴더 확보
    const parentFolderId = await this.ensureTempFolder(drive);
    const tempFileIds: string[] = [];
    const imageUrls: string[] = [];

    // 2. 이미지 처리 (크롭 & 업로드)
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const progressPercent = Math.round((i / items.length) * 70);
      if (onProgress) onProgress(`악보 최적화 중 (${i + 1}/${items.length})`, progressPercent);

      try {
        // Sharp를 이용한 하드 크롭 (사용자가 설정한 % 좌표를 픽셀로 계산)
        const metadata = await sharp(item.localFilePath).metadata();
        const w = metadata.width || 0;
        const h = metadata.height || 0;
        const crop = item.crop || { top: 0, bottom: 0, left: 0, right: 0 };
        
        const left = Math.floor(w * (crop.left / 100));
        const top = Math.floor(h * (crop.top / 100));
        const width = Math.max(1, Math.floor(w * (1 - (crop.left + crop.right) / 100)));
        const height = Math.max(1, Math.floor(h * (1 - (crop.top + crop.bottom) / 100)));

        const croppedBuffer = await sharp(item.localFilePath)
          .extract({ left, top, width, height })
          .jpeg({ quality: 90 })
          .toBuffer();

        // 공통 업로드 메서드 사용
        const fileName = `cropped_${i}_${Date.now()}.jpg`;
        const { fileId, downloadUrl } = await this.uploadTempPublicImage(drive, croppedBuffer, fileName, parentFolderId);
        
        tempFileIds.push(fileId);
        imageUrls.push(downloadUrl);
      } catch (err) {
        console.error(`[Docs] Image Processing failed for ${item.filename}:`, err);
      }
    }

    // 3. 구글 독스 문서 생성
    if (onProgress) onProgress('문서 생성 중...', 80);
    const docCreateRes = await docs.documents.create({ requestBody: { title } });
    const documentId = docCreateRes.data.documentId!;

    // 4. 문서 레이아웃 최적화 (모바일용 페이지 크기 및 여백 설정)
    // 모바일에서 한눈에 보기 편하도록 가로폭을 줄이고 여백을 최소화합니다.
    const PAGE_W = 400; // 모바일 화면에 적합한 가로폭 (PT)
    const requests: any[] = [];
    
    requests.push({
      updateDocumentStyle: {
        documentStyle: {
          pageSize: {
            width: { magnitude: PAGE_W, unit: 'PT' },
            height: { magnitude: 800, unit: 'PT' } // 충분한 세로 길이
          },
          marginTop: { magnitude: 10, unit: 'PT' },
          marginBottom: { magnitude: 10, unit: 'PT' },
          marginLeft: { magnitude: 10, unit: 'PT' },
          marginRight: { magnitude: 10, unit: 'PT' }
        },
        fields: 'pageSize,marginTop,marginBottom,marginLeft,marginRight'
      }
    });

    // 5. 문서 내용 조립 (역순 조립)
    
    // 역순 루프: 문서의 가장 앞(index 1)에 차례로 밀어넣으면 결과적으로 정순서가 됨
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      const url = imageUrls[i];
      if (!url) continue;

      // 1) 페이지 구분선 (첫 번째 항목 제외)
      if (i < items.length - 1) {
        requests.push({ insertPageBreak: { location: { index: 1 } } });
      }

      // 2) 멘트 삽입 및 스타일링
      if (type === 'leader' && item.memo) {
        requests.push({
          insertText: {
            location: { index: 1 },
            text: `\n${item.memo}\n`
          }
        });
        // 멘트 스타일: 굵게, 큰 글씨, 중앙 정렬
        requests.push({
          updateParagraphStyle: {
            range: { startIndex: 1, endIndex: item.memo.length + 2 },
            paragraphStyle: { alignment: 'CENTER' },
            fields: 'alignment'
          }
        });
        requests.push({
          updateTextStyle: {
            range: { startIndex: 1, endIndex: item.memo.length + 2 },
            textStyle: {
              bold: true,
              fontSize: { magnitude: 16, unit: 'PT' },
              foregroundColor: { color: { rgbColor: { red: 0.1, green: 0.4, blue: 0.8 } } } // 파란색 톤
            },
            fields: 'bold,fontSize,foregroundColor'
          }
        });
      }

      // 3) 이미지 삽입 (페이지 너비에 맞춤)
      requests.push({
        insertInlineImage: {
          uri: url,
          location: { index: 1 },
          objectSize: {
            width: { magnitude: PAGE_W - 20, unit: 'PT' } // 여백 제외 꽉 차게
          }
        }
      });

      // 4) 곡 제목 삽입 및 스타일링
      const titleText = `\n[ ${item.filename.split('_').slice(1).join('_').split('.')[0]} ]\n`;
      requests.push({
        insertText: {
          location: { index: 1 },
          text: titleText
        }
      });
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: 1, endIndex: titleText.length + 1 },
          paragraphStyle: { alignment: 'CENTER' },
          fields: 'alignment'
        }
      });
      requests.push({
        updateTextStyle: {
          range: { startIndex: 1, endIndex: titleText.length + 1 },
          textStyle: {
            bold: true,
            fontSize: { magnitude: 18, unit: 'PT' }
          },
          fields: 'bold,fontSize'
        }
      });
    }

    // 문서 업데이트 실행
    await docs.documents.batchUpdate({
      documentId,
      requestBody: { requests }
    });

    // 5. 문서 전체 공유 권한 설정
    await drive.permissions.create({
      fileId: documentId,
      requestBody: { role: 'reader', type: 'anyone' }
    });

    // 6. 임시 이미지 정리 (백그라운드)
    this.cleanupTempFiles(drive, tempFileIds).catch(console.error);

    if (onProgress) onProgress('완료!', 100);
    return `https://docs.google.com/document/d/${documentId}/edit`;
    } catch (err) {
      return await this.handleAuthError(err);
    }
  }

  private async cleanupTempFiles(drive: any, fileIds: string[]) {
    for (const id of fileIds) {
      try {
        await drive.files.delete({ fileId: id });
      } catch (e) {
        console.warn(`[Cleanup] Failed to delete temp file ${id}:`, e);
      }
    }
  }

  private async ensureTempFolder(drive: any) {
    let folderId = await this.findFolder(drive, 'CEUM_Temp_Assets');
    if (!folderId) folderId = await this.createFolder(drive, 'CEUM_Temp_Assets');
    return folderId;
  }

  /**
   * 임시 이미지를 업로드하고 누구나 볼 수 있도록 권한을 설정한 뒤 다운로드 URL을 반환합니다.
   */
  private async uploadTempPublicImage(drive: any, content: string | Buffer, fileName: string, parentId: string) {
    const media = typeof content === 'string' 
      ? { mimeType: 'image/webp', body: fs.createReadStream(content) }
      : { mimeType: 'image/jpeg', body: Readable.from(content) };

    const res = await drive.files.create({
      resource: { name: fileName, parents: [parentId] },
      media,
      fields: 'id',
    });
    
    const fileId = res.data.id;
    
    // 외부에 링크로 이미지를 끼워넣을 수 있도록 anyone reader 권한 부여
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' }
    });

    // 권한 전파를 위해 약간의 대기 (구글 서버 반영 시간 벌기)
    // Slides API의 경우 권한 반영이 늦으면 이미지를 가져오지 못할 수 있음
    await new Promise(resolve => setTimeout(resolve, 1000));

    return { 
      fileId, 
      downloadUrl: `https://drive.google.com/uc?export=download&id=${fileId}` 
    };
  }

  /**
   * 구글 슬라이드(인도자용/회중용)를 생성하고 클립보드에 복사할 주소를 반환합니다.
   */
  public async generateGoogleSlides(
    title: string, 
    type: 'leader' | 'congregation', 
    items: any[], 
    onProgress?: (msg: string, percent: number) => void
  ): Promise<string> {
    try {
      const drive = google.drive({ version: 'v3', auth: this.oauth2Client });
      const slides = google.slides({ version: 'v1', auth: this.oauth2Client });

    onProgress?.('임시 보관소 생성 중...', 5);
    
    // 1. 임시 에셋 폴더 확보
    let assetsFolderId = await this.findFolder(drive, 'CEUM_Slides_Assets');
    if (!assetsFolderId) assetsFolderId = await this.createFolder(drive, 'CEUM_Slides_Assets');

    onProgress?.('새 프레젠테이션(슬라이드) 생성 중...', 10);

    // 2. 새로운 빈 슬라이드 문서 생성
    const presentationRes = await slides.presentations.create({
      requestBody: { title: `[CEUM BIBLE] ${title} (${type === 'leader' ? '인도자용' : '회중용'})` }
    });
    
    const presentationId = presentationRes.data.presentationId!;
    const defaultSlideId = presentationRes.data.slides?.[0]?.objectId;

    // 문서 자체를 링크 있는 누구나 볼 수 있게 공유 권한 오픈
    await drive.permissions.create({
      fileId: presentationId,
      requestBody: { role: 'reader', type: 'anyone' }
    });

    const requests: any[] = [];
    const uploadedImageIds: string[] = [];

    // 구글 슬라이드 페이지 크기 설정 (Portrait - 세로형 최적화)
    // A4 비율(1:1.414) 또는 모바일 비율에 맞춰 설정 (PT 단위)
    const PAGE_W = 540; // 가로를 줄이고
    const PAGE_H = 850; // 세로를 늘림 (모바일 화면 비율 고려)

    // 슬라이드 전체의 배경을 검은색으로 만들기 (선택적)
    // 여기서 안하고 텅 빈 슬라이드여도 상관없지만 고급감을 위해 추가.

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      onProgress?.(`[${i + 1}/${items.length}] 악보 이미지 분석 및 전송 중...`, 15 + ((i / items.length) * 70));

      if (!fs.existsSync(item.localFilePath)) continue;

      try {
        // A. Sharp를 이용한 하드 크롭 및 JPEG 변환 (Slides API는 webp 미지원 문제 방지)
        const metadata = await sharp(item.localFilePath).metadata();
        const w = metadata.width || 0;
        const h = metadata.height || 0;
        const crop = item.crop || { top: 0, bottom: 0, left: 0, right: 0 };
        
        const left = Math.floor(w * (crop.left / 100));
        const top = Math.floor(h * (crop.top / 100));
        const width = Math.max(1, Math.floor(w * (1 - (crop.left + crop.right) / 100)));
        const height = Math.max(1, Math.floor(h * (1 - (crop.top + crop.bottom) / 100)));

        const croppedBuffer = await sharp(item.localFilePath)
          .extract({ left, top, width, height })
          .jpeg({ quality: 90 })
          .toBuffer();

        // 3. 이미지 업로드 (퍼블릭 JPEG)
        const fileName = `slide_img_${i}_${Date.now()}.jpg`;
        const { fileId, downloadUrl } = await this.uploadTempPublicImage(drive, croppedBuffer, fileName, assetsFolderId);
        uploadedImageIds.push(fileId);

        // 4. 슬라이드 낱장(Page) 생성
        const slideId = `p_slide_${Date.now()}_${i}`;
        requests.push({
          createSlide: {
            objectId: slideId,
            slideLayoutReference: { predefinedLayout: 'BLANK' }
          }
        });

        // 5. 악보 배치 연산 (이미 크롭된 상태이므로 AR은 단순 계산)
        const AR = width / height;

      // 하단 멘트가 존재하고 인도자용인 경우, 하단 140 공간 할당
      const showMemo = type === 'leader' && item.memo;
      const memoH = 140; 
      const availableW = PAGE_W;
      const availableH = showMemo ? PAGE_H - memoH : PAGE_H;

      // 박스를 화면에 꽉 차게 피팅 (Fit to bounds)
      let boxW = availableW;
      let boxH = availableW / AR;
      if (boxH > availableH) {
        boxH = availableH;
        boxW = availableH * AR;
      }

      // 가운데 정렬 (메모가 있으면 위쪽으로 밀착)
      const translateX = (availableW - boxW) / 2;
      const translateY = 0; // 세로형에서는 위에서부터 채우는 것이 가독성이 좋음

      // 6. 이미지 배치 요청 (더 이상 cropProperties 사용 안함)
      const imageElementId = `img_${Date.now()}_${i}`;
      requests.push({
        createImage: {
          objectId: imageElementId,
          url: downloadUrl,
          elementProperties: {
            pageObjectId: slideId,
            size: {
              width: { magnitude: boxW, unit: 'PT' },
              height: { magnitude: boxH, unit: 'PT' }
            },
            transform: {
              scaleX: 1, scaleY: 1,
              translateX, translateY,
              unit: 'PT'
            }
          }
        }
      });

      // 8. 인도자용: 하단 멘트 자막(Shape) 추가
      if (showMemo) {
        const shapeId = `memo_${Date.now()}_${i}`;
        requests.push({
          createShape: {
            objectId: shapeId,
            shapeType: 'TEXT_BOX',
            elementProperties: {
              pageObjectId: slideId,
              size: {
                width: { magnitude: PAGE_W - 20, unit: 'PT' },
                height: { magnitude: memoH - 20, unit: 'PT' }
              },
              transform: {
                scaleX: 1, scaleY: 1,
                translateX: 10, translateY: PAGE_H - memoH + 5,
                unit: 'PT'
              }
            }
          }
        });
        
        // 텍스트 스타일링 추가 (가독성 향상)
        requests.push({
          updateTextStyle: {
            objectId: shapeId,
            style: {
              fontSize: { magnitude: 18, unit: 'PT' },
              bold: true,
              foregroundColor: { opaqueColor: { rgbColor: { red: 0.9, green: 0.7, blue: 0.2 } } } // 약간의 노란색/금색 계열
            },
            fields: 'fontSize,bold,foregroundColor',
            textRange: { type: 'ALL' }
          }
        });

        // 중앙 정렬
        requests.push({
          updateParagraphStyle: {
            objectId: shapeId,
            style: { alignment: 'CENTER' },
            fields: 'alignment',
            textRange: { type: 'ALL' }
          }
        });
        
        requests.push({
          insertText: {
            objectId: shapeId,
            text: item.memo,
            insertionIndex: 0
          }
        });
      }
    } catch (err) {
      console.error(`[Slides] Image Processing failed for ${item.filename}:`, err);
    }
  }

    onProgress?.('최종 슬라이드 구성 렌더링 중...', 90);

    // 9. 불필요한 기본 빈 슬라이드 1페이지 삭제
    if (defaultSlideId) {
      requests.push({ deleteObject: { objectId: defaultSlideId } });
    }

    // 10. 작성된 모든 Batch Request를 한 번에 G-Slide 서버로 발사
    if (requests.length > 0) {
      await slides.presentations.batchUpdate({
        presentationId,
        requestBody: { requests }
      });
    }

    onProgress?.('메모리 정리 중...', 95);

    // 11. 흔적 없애기: 생성에 성공했으므로 Drive에 널부러진 임시 사진들은 영구 삭제
    for (const fileId of uploadedImageIds) {
      try {
        await drive.files.delete({ fileId });
      } catch (err) {
        console.error("[Slides] Failed to delete temp image:", err);
      }
    }

    onProgress?.('생성 완료!', 100);
    return `https://docs.google.com/presentation/d/${presentationId}/view`;
    } catch (err) {
      return await this.handleAuthError(err);
    }
  }

  /**
   * 고해상도 모바일 최적화 PDF를 생성하고 구글 드라이브에 업로드합니다.
   */
  public async generateMobilePDF(
    title: string, 
    type: 'leader' | 'congregation', 
    items: any[], 
    onProgress?: (msg: string, percent: number) => void,
    footer?: string
  ): Promise<string> {
    try {
      const drive = google.drive({ version: 'v3', auth: this.oauth2Client });

      onProgress?.('PDF 엔진 초기화 중...', 10);

    // 1. PDF 에셋 폴더 확보
    let folderId = await this.findFolder(drive, 'CEUM_PDF_Library');
    if (!folderId) folderId = await this.createFolder(drive, 'CEUM_PDF_Library');

    onProgress?.('데이터 렌더링 준비 중...', 20);

    // 2. 렌더링을 위한 데이터 인코딩
    const pdfData = { title, items, footer };
    const encodedData = encodeURIComponent(JSON.stringify(pdfData));
    
    // 개발 서버 또는 로컬 서버 URL 결정
    const port = 8080; 
    const isDev = process.env['VITE_DEV_SERVER_URL'];
    const baseUrl = isDev ? process.env['VITE_DEV_SERVER_URL'] : `http://localhost:${port}/index.html`;
    const printUrl = `${baseUrl}?mode=print-pdf&data=${encodedData}`;

    // 3. 숨겨진 윈도우 생성하여 PDF 렌더링
    onProgress?.('프리미엄 레이아웃 렌더링 중...', 40);

    const printWin = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: path.join(app.getAppPath(), 'dist-electron', 'preload.mjs'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    try {
      await printWin.loadURL(printUrl);

      // 4. 렌더러로부터 완료 신호 대기 (모든 이미지 로드 완료 등)
      await new Promise<void>((resolve) => {
        ipcMain.once('pdf-rendering-complete', () => resolve());
        // 타임아웃 방지 (최대 30초)
        setTimeout(() => resolve(), 30000);
      });

      onProgress?.('고해상도 PDF 변환 중...', 70);

      // 5. PDF 캡처 (모바일 Portrait 비율: 4x7 inches)
      // Electron의 printToPDF 옵션 사용
      const pdfBuffer = await printWin.webContents.printToPDF({
        printBackground: true,
        pageSize: { width: 4, height: 7 }, // 인치 단위
        margins: { top: 0, bottom: 0, left: 0, right: 0 }
      });

      onProgress?.('구글 드라이브 업로드 중...', 85);

      // 6. PDF 업로드
      const now = new Date();
      const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      const typeStr = type === 'leader' ? '인도자' : '회중';
      const fileName = `[모바일]_${title}_${typeStr}_${dateStr}.pdf`;
      const res = await drive.files.create({
        resource: { 
          name: fileName, 
          parents: [folderId],
          mimeType: 'application/pdf'
        },
        media: { mimeType: 'application/pdf', body: Readable.from(pdfBuffer) },
        fields: 'id, webViewLink',
      });

      const fileId = res.data.id!;

      // 7. 공유 권한 설정
      await drive.permissions.create({
        fileId,
        requestBody: { role: 'reader', type: 'anyone' }
      });

      onProgress?.('모든 작업 완료!', 100);
      return res.data.webViewLink!;

    } finally {
      printWin.close();
    }
    } catch (err) {
      return await this.handleAuthError(err);
    }
  }
}
