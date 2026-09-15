// src/api/gdriveWebService.ts
import { imageCache } from '../utils/imageCache';

const GAPI_CLIENT_ID = '786503545807-v0340nhgjnd3rg3i3k03i9r7jrpdnr0h.apps.googleusercontent.com';

// ✅ 로컬 개발 전용 구글 계정 우회 플래그 (배포 시 false로 변경)
export const IS_LOCAL_DEV = false;

// 구글 API 초기화 상태
let isGapiLoaded = false;
let isGsiLoaded = false;
let tokenClient: any = null;
// OAuth 토큰 캐시 및 로컬 스토리지 자동 세션 복원
let accessToken: string | null = (() => {
  try {
    const cachedToken = localStorage.getItem('gdrive_token');
    const cachedExpiresAt = localStorage.getItem('gdrive_token_expires_at');
    if (cachedToken && cachedExpiresAt) {
      const expiresAt = parseInt(cachedExpiresAt, 10);
      if (expiresAt > Date.now()) {
        console.log('[gdriveWebService] Found valid cached token. Restoring session.');
        return cachedToken;
      }
    }
  } catch (e) {}
  return null;
})();

// gapi.client에 토큰을 주입하는 헬퍼 (gapi 로드 후 호출해야 함)
const applyTokenToGapiClient = (token: string) => {
  try {
    if (window.gapi && window.gapi.client) {
      window.gapi.client.setToken({ access_token: token });
      console.log('[gdriveWebService] gapi.client token applied.');
    }
  } catch (e) {
    console.warn('[gdriveWebService] Failed to apply token to gapi.client:', e);
  }
};

// 토큰 401/403 유효성 상실 시 자가 치유(Self-Healing) 핸들러
const handleAuthExpired = () => {
  console.warn('[gdriveWebService] Auth token expired or invalid (401/403). Clearing cache.');
  accessToken = null;
  try {
    localStorage.removeItem('gdrive_token');
    localStorage.removeItem('gdrive_token_expires_at');
  } catch (e) {}
  
  // 사용자 제스처 없는 강제 팝업 요청을 제거하여 브라우저 팝업 차단(Popup Blocker)을 완벽 차단합니다.
  // 대신 사용자가 수동 로그인 버튼을 누르게 유도하여 웹 표준 보안을 확보합니다.
};

// 401 에러 인터셉트 기능이 내장된 콤팩트 fetch (403은 Rate Limit일 수 있으므로 로그아웃 시키지 않음)
const gdriveFetch = async (url: string, options: RequestInit = {}, retries = 2): Promise<Response> => {
  let response = await fetch(url, options);
  
  // 403 Rate Limit 발생 시 지수 백오프 재시도 (최대 2회)
  if (response.status === 403 && retries > 0) {
    console.warn(`[gdriveWebService] 403 Rate Limit hit for ${url}. Retrying...`);
    await new Promise(resolve => setTimeout(resolve, (3 - retries) * 1000));
    return gdriveFetch(url, options, retries - 1);
  }

  if (response.status === 401) {
    handleAuthExpired();
    throw new Error('Unauthorized or expired token');
  }
  return response;
};

export interface GoogleUserProfile {
  id: string;
  name: string;
  email: string;
  picture: string;
}

export const fetchUserProfile = async (token: string): Promise<GoogleUserProfile | null> => {
  try {
    const res = await fetch(`https://www.googleapis.com/oauth2/v1/userinfo?access_token=${token}`);
    if (!res.ok) throw new Error('Network error');
    const data = await res.json();
    if (!data.id && !data.sub) return null;
    const profile = {
      id: data.id || data.sub,
      name: data.name || '',
      email: data.email || '',
      picture: data.picture || ''
    };
    localStorage.setItem('offline_user_profile', JSON.stringify(profile));
    return profile;
  } catch {
    const cached = localStorage.getItem('offline_user_profile');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {}
    }
    return null;
  }
};


export const initGoogleApi = (onInit: () => void) => {
  if (IS_LOCAL_DEV) {
    console.log('[gdriveWebService] 🛠️ Local dev mode: Bypassing Google API init & Auth');
    isGapiLoaded = true;
    isGsiLoaded = true;
    accessToken = 'mock_local_token_123';
    setTimeout(() => {
      window.dispatchEvent(new Event('gdrive_authenticated'));
      onInit();
    }, 300);
    return;
  }

  let hasError = false;

  const handleError = (error: any) => {
    console.error('[Google API Init Error]', error);
    if (!hasError) {
      hasError = true;
      const offlineProfile = localStorage.getItem('offline_user_profile');
      if (offlineProfile) {
        console.log('[gdriveWebService] Offline mode detected, using cached profile.');
        accessToken = 'offline_token'; // 오프라인 식별용 더미 토큰
        setTimeout(() => { window.dispatchEvent(new Event('gdrive_authenticated')); }, 300);
      } else {
        // 에러 메시지 노출 후 로딩 해제
        alert('구글 API 초기화 중 오류가 발생했습니다. 구글 드라이브 동기화 기능이 제한될 수 있습니다. \n에러: ' + (error?.message || error || '알 수 없음'));
      }
      onInit(); // 무한 로딩 상태를 풀기 위해 콜백 강제 실행
    }
  };

  // 세션 복원 및 백그라운드 갱신 자동화 (무중단 영구 세션화)
  const restoreOrRefreshSession = () => {
    try {
      const cachedToken = localStorage.getItem('gdrive_token');
      const cachedExpiresAt = localStorage.getItem('gdrive_token_expires_at');
      
      if (cachedToken && cachedExpiresAt) {
        const expiresAt = parseInt(cachedExpiresAt, 10);
        if (expiresAt > Date.now()) {
          // 1. 토큰이 유효한 경우 즉시 복원 및 gapi.client에 주입
          accessToken = cachedToken;
          applyTokenToGapiClient(cachedToken); // ✅ 핵심: gapi.client에 토큰 주입
          console.log('[gdriveWebService] Restored valid cached token and applied to gapi.client.');
          setTimeout(() => { window.dispatchEvent(new Event('gdrive_authenticated')); }, 300);
          return;
        } else {
          // 만료된 토큰 갱신 시도 (Silent Refresh)
          console.log('[gdriveWebService] Cached token expired. Attempting silent refresh...');
          if (tokenClient) {
            try {
              tokenClient.requestAccessToken({ prompt: 'none' });
              return; // 콜백에서 완료됨
            } catch (e) {
              console.warn('[gdriveWebService] Silent refresh failed', e);
            }
          }
          // 실패 시 삭제
          localStorage.removeItem('gdrive_token');
          localStorage.removeItem('gdrive_token_expires_at');
          accessToken = null;
          console.log('[gdriveWebService] Cached token cleared.');
        }
      }
      
      // 2. 캐시된 토큰이 없거나 만료된 경우 조용히 대기
      console.log('[gdriveWebService] No valid cached token. Awaiting user click to authenticate.');
    } catch (e) {
      console.error('[gdriveWebService] Silent refresh error:', e);
    }
  };

  // 1. Google API (gapi) 로드
  const gapiScript = document.createElement('script');
  gapiScript.src = 'https://apis.google.com/js/api.js';
  gapiScript.async = true;
  gapiScript.defer = true;
  gapiScript.onerror = () => handleError('Google API 스크립트 로드 실패 (네트워크 또는 보안 설정 차단)');
  gapiScript.onload = () => {
    try {
      window.gapi.load('client', () => {
        // 백그라운드에서 초기화 진행 (UI 블로킹 방지)
        window.gapi.client.init({
          discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
        }).then(() => {
          // drive v3 클라이언트를 명시적 강제 로드
          return window.gapi.client.load('drive', 'v3');
        }).catch(err => {
          console.warn('[gdriveWebService] Background gapi init warning:', err);
        });

        // 즉시 로드 완료 처리하여 로그인 버튼을 빨리 활성화함
        isGapiLoaded = true;
        if (isGsiLoaded && !hasError) {
          restoreOrRefreshSession(); // ✅ 토큰을 gapi.client에 먼저 주입
          onInit();                  // ✅ 그 다음 Provider 초기화
        }
      });
    } catch (loadErr) {
      handleError(loadErr);
    }
  };
  document.body.appendChild(gapiScript);

  // 2. Google Identity Services (GSI) 로드
  const gsiScript = document.createElement('script');
  gsiScript.src = 'https://accounts.google.com/gsi/client';
  gsiScript.async = true;
  gsiScript.defer = true;
  gsiScript.onerror = () => handleError('Google GSI 스크립트 로드 실패 (네트워크 또는 보안 설정 차단)');
  gsiScript.onload = () => {
    try {
      tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GAPI_CLIENT_ID,
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
        callback: (response: any) => {
          if (response.error !== undefined) {
            console.error('GSI auth error:', response);
            return;
          }
          accessToken = response.access_token;
          applyTokenToGapiClient(response.access_token); // ✅ 핵심: 신규 토큰도 gapi.client에 즉시 주입

          // 로컬 스토리지에 토큰 및 만료 절대시간(1시간) 저장
          try {
            const expiresAt = Date.now() + (response.expires_in * 1000);
            localStorage.setItem('gdrive_token', response.access_token);
            localStorage.setItem('gdrive_token_expires_at', expiresAt.toString());
          } catch (e) {}

          console.log('[gdriveWebService] Successfully authenticated with Google Drive.');
          window.dispatchEvent(new Event('gdrive_authenticated'));
        },
      });
      isGsiLoaded = true;
      if (isGapiLoaded && !hasError) {
        restoreOrRefreshSession(); // ✅ 토큰을 gapi.client에 먼저 주입
        onInit();                  // ✅ 그 다음 Provider 초기화
      }
    } catch (gsiErr) {
      handleError(gsiErr);
    }
  };
  document.body.appendChild(gsiScript);
};

export const gdriveWebService = {
  // 토큰 반환
  getAccessToken: () => accessToken,

  // 로그인 요청
  login: () => {
    if (IS_LOCAL_DEV) {
      console.log('[gdriveWebService] 🛠️ Local dev mode: Bypassing login popup');
      accessToken = 'mock_local_token_123';
      setTimeout(() => { window.dispatchEvent(new Event('gdrive_authenticated')); }, 100);
      return Promise.resolve(true);
    }

    return new Promise((resolve, reject) => {
      if (!tokenClient) {
        resolve(false);
        return;
      }
      
      // 이미 복원된 유효 토큰 세션이 있다면 구글 팝업 생략하고 성공 처리
      if (accessToken) {
        resolve(true);
        return;
      }
      
      tokenClient.callback = (response: any) => {
        if (response.error !== undefined) {
          console.error('[gdriveWebService] GSI auth error callback:', response.error);
          alert('구글 인증 실패: ' + response.error);
          resolve(false);
          return;
        }
        
        accessToken = response.access_token;
        applyTokenToGapiClient(response.access_token); // ✅ login() 콜백에서도 gapi.client 주입
        try {
          const expiresAt = Date.now() + (response.expires_in * 1000);
          localStorage.setItem('gdrive_token', response.access_token);
          localStorage.setItem('gdrive_token_expires_at', expiresAt.toString());
        } catch (e) {}
        
        console.log('[gdriveWebService] Successfully authenticated with Google Drive via callback');
        window.dispatchEvent(new Event('gdrive_authenticated'));
        resolve(true);
      };
      
      try {
        tokenClient.requestAccessToken();
      } catch (err) {
        reject(err);
      }
    });
  },

  // 파일 다운로드 (JSON)
  downloadJsonFile: async (fileName: string) => {
    const cacheKey = `gdrive_json_cache_${fileName}`;
    if (!accessToken || accessToken === 'offline_token') {
      const cached = localStorage.getItem(cacheKey);
      if (cached) return JSON.parse(cached);
      throw new Error('Not authenticated and no cache');
    }
    
    try {
      // 1. 파일 검색 (fetch 기반)
      const q = encodeURIComponent(`name='${fileName}' and trashed=false`);
      const searchRes = await gdriveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name)`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!searchRes.ok) throw new Error(`Drive API ${searchRes.status}: file search failed`);
      const searchData = await searchRes.json();
      const files = searchData.files;
      
      if (!files || files.length === 0) {
        return null; // 파일 없음
      }
      
      // 2. 파일 내용 가져오기
      const fileId = files[0].id;
      const response = await gdriveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        }
      });
      
      if (!response.ok) throw new Error('Failed to download file');
      const data = await response.json();
      localStorage.setItem(cacheKey, JSON.stringify(data));
      return data;
    } catch (err) {
      console.warn(`[gdriveWebService] Failed to download JSON ${fileName}, falling back to cache`, err);
      const cached = localStorage.getItem(cacheKey);
      if (cached) return JSON.parse(cached);
      throw err;
    }
  },

  // JSON 업로드 (multipart/related)
  uploadJsonFile: async (fileName: string, data: any) => {
    const cacheKey = `gdrive_json_cache_${fileName}`;
    localStorage.setItem(cacheKey, JSON.stringify(data)); // 선제적 캐시 갱신
    if (!accessToken || accessToken === 'offline_token') {
      console.warn(`[gdriveWebService] Offline mode, saved ${fileName} locally. Will sync later.`);
      return; // 오프라인 모드에서는 캐시만 업데이트하고 반환
    }

    const q = encodeURIComponent(`name='${fileName}' and trashed=false`);
    const searchRes = await gdriveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name)`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const searchData = searchRes.ok ? await searchRes.json() : { files: [] };
    const files = searchData.files;

    let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    let method = 'POST';

    if (files && files.length > 0) {
      url = `https://www.googleapis.com/upload/drive/v3/files/${files[0].id}?uploadType=multipart`;
      method = 'PATCH';
    }

    const metadata = { name: fileName, mimeType: 'application/json' };
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const close_delim = `\r\n--${boundary}--`;

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      JSON.stringify(data) +
      close_delim;

    const uploadRes = await gdriveFetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartRequestBody
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error('Upload failed:', errText);
      throw new Error(`Upload failed: ${errText}`);
    }
    return uploadRes.json();
  },

  // -----------------------------------------
  // Folder & General Sync Methods
  // -----------------------------------------
  
  // 이름으로 폴더를 조회하여 ID 반환 (없으면 null 반환)
  getFolderId: async (folderName: string): Promise<string | null> => {
    if (!accessToken) return null;
    try {
      const q = encodeURIComponent(`name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
      const res = await gdriveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name)`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!res.ok) return null;
      const data = await res.json();
      const files = data.files;
      if (files && files.length > 0) {
        return files[0].id;
      }
      return null;
    } catch (err) {
      console.error(`[gdriveWebService] getFolderId failed for ${folderName}`, err);
      return null;
    }
  },

  // 이름으로 폴더를 찾고, 없으면 생성 후 ID 반환
  getOrCreateFolder: async (folderName: string): Promise<string> => {
    if (!accessToken) throw new Error('Not authenticated');
    
    // 1. 폴더 존재 여부 확인 (fetch 기반)
    const q = encodeURIComponent(`name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const searchRes = await gdriveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name)`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const files = searchData.files;
      if (files && files.length > 0) {
        return files[0].id;
      }
    }
    
    // 2. 없으면 새로 생성
    const metadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    };
    
    const createRes = await gdriveFetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(metadata)
    });
    
    if (!createRes.ok) throw new Error(`Failed to create folder ${folderName}`);
    const createdFolder = await createRes.json();
    return createdFolder.id;
  },

  // -----------------------------------------
  // Bible Sync Methods (Visible Folder)
  // -----------------------------------------
  listBibleFiles: async () => {
    if (!accessToken) throw new Error('Not authenticated');
    const folderId = await gdriveWebService.getOrCreateFolder('CEUM_Bible_Data');
    
    const q = encodeURIComponent(`'${folderId}' in parents and mimeType='text/plain' and trashed=false`);
    const res = await gdriveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name)`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.files || [];
  },

  downloadBibleFile: async (fileId: string) => {
    if (!accessToken) throw new Error('Not authenticated');
    const response = await gdriveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!response.ok) throw new Error('Failed to download bible');
    return await response.text();
  },

  deleteBibleFile: async (fileId: string) => {
    if (!accessToken) throw new Error('Not authenticated');
    const response = await gdriveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!response.ok) throw new Error('Failed to delete bible file');
  },

  uploadBibleFile: async (fileName: string, textData: string) => {
    if (!accessToken) throw new Error('Not authenticated');
    const folderId = await gdriveWebService.getOrCreateFolder('CEUM_Bible_Data');

    const q = encodeURIComponent(`name='${fileName}' and '${folderId}' in parents and trashed=false`);
    const searchRes = await gdriveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name)`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const searchData = searchRes.ok ? await searchRes.json() : { files: [] };
    const files = searchData.files;

    let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    let method = 'POST';
    const metadata: any = { name: fileName, mimeType: 'text/plain' };

    if (files && files.length > 0) {
      url = `https://www.googleapis.com/upload/drive/v3/files/${files[0].id}?uploadType=multipart`;
      method = 'PATCH';
    } else {
      metadata.parents = [folderId];
    }

    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const close_delim = `\r\n--${boundary}--`;

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: text/plain; charset=UTF-8\r\n\r\n' +
      textData +
      close_delim;

    const uploadRes = await gdriveFetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipartRequestBody
    });

    if (!uploadRes.ok) throw new Error('Bible upload failed');
    return uploadRes.json();
  },

  // 이미지 파일 (미디어) Blob 다운로드 및 캐싱 연동
  getFileBlob: async (fileId: string): Promise<Blob | null> => {
    if (!fileId) return null;
    
    // 1. 로컬 캐시 조회
    const cachedBlob = await imageCache.getImage(fileId);
    if (cachedBlob && cachedBlob.size > 0) {
      console.log(`[Cache Hit] Loaded score from local database: ${fileId} (${cachedBlob.size} bytes)`);
      return cachedBlob;
    } else if (cachedBlob && cachedBlob.size === 0) {
      console.warn(`[Cache Corrupted] Cached blob is empty (0 bytes). Invalidating cache for: ${fileId}`);
    }
    
    // 2. 캐시 미스 시 구글 드라이브 다운로드
    if (!accessToken) return null;
    try {
      console.log(`[Cache Miss] Downloading score from Google Drive: ${fileId}`);
      const response = await gdriveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!response.ok) return null;
      
      // 스트림 소모(Consumption) 버그를 완벽히 막기 위해 일단 ArrayBuffer로 완전히 메모리에 적재합니다.
      const buffer = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const safeBlob = new Blob([buffer], { type: contentType });
      
      // 3. 로컬 캐시 저장 (백그라운드에서 비동기로 실행하여 로딩 속도 단축)
      imageCache.saveImage(fileId, safeBlob).catch(e => console.error(e));
      
      return safeBlob;
    } catch (e) {
      console.error('Failed to get file blob from drive', e);
      return null;
    }
  },

  // 이미지 파일 (미디어) Blob URL 반환 (사파리 흰화면 버그를 완전히 방지하기 위해 Data URL로 변환)
  downloadImageBlob: async (fileId: string): Promise<string | null> => {
    const blob = await gdriveWebService.getFileBlob(fileId);
    if (blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
    return null;
  },

  // 특정 폴더 내의 이미지 파일 목록 실시간 조회 및 이름순 정렬
  listFolderFiles: async (folderName: string): Promise<any[]> => {
    const cacheKey = `gdrive_folder_cache_${folderName}`;
    if (!accessToken || accessToken === 'offline_token') {
      const cached = localStorage.getItem(cacheKey);
      return cached ? JSON.parse(cached) : [];
    }
    try {
      const folderId = await gdriveWebService.getOrCreateFolder(folderName);
      
      const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and (mimeType='image/webp' or mimeType='image/jpeg' or mimeType='image/png')`);
      const res = await gdriveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name,createdTime)&pageSize=1000`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!res.ok) throw new Error('Fetch failed');
      const data = await res.json();
      const files = data.files || [];
      // 한국어 자모음 및 숫자(자연 정렬) 기준 오름차순 정렬
      const sortedFiles = files.sort((a: any, b: any) => a.name.localeCompare(b.name, 'ko', { numeric: true }));
      localStorage.setItem(cacheKey, JSON.stringify(sortedFiles));
      return sortedFiles;
    } catch (err) {
      console.warn(`[gdriveWebService] listFolderFiles for folder '${folderName}' failed, using cache`, err);
      const cached = localStorage.getItem(cacheKey);
      return cached ? JSON.parse(cached) : [];
    }
  },

  // 하위 호환성 유지용 listCcmFiles 메소드
  listCcmFiles: async (): Promise<any[]> => {
    return gdriveWebService.listFolderFiles('CEUM_ccm_data');
  },

  renameFolder: async (oldName: string, newName: string) => {
    if (!accessToken) throw new Error('Not authenticated');
    try {
      const q = encodeURIComponent(`name='${oldName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
      const searchRes = await gdriveFetch(`https://www.googleapis.com/drive/v3/files?q=${q}&spaces=drive&fields=files(id,name)`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (!searchRes.ok) return false;
      const searchData = await searchRes.json();
      const folders = searchData.files;

      if (folders && folders.length > 0) {
        const folderId = folders[0].id;
        const updateRes = await gdriveFetch(`https://www.googleapis.com/drive/v3/files/${folderId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name: newName })
        });
        return updateRes.ok;
      }
    } catch (err) {
      console.error('Rename folder failed', err);
    }
    return false;
  },

  // PDF 파일 업로드 및 공유 링크 생성
  uploadPdfFile: async (fileName: string, pdfBlob: Blob): Promise<{ id: string; webViewLink: string }> => {
    if (!accessToken) throw new Error('Not authenticated');
    
    // CEUM_PDF_Library 폴더가 없을 경우 자동 생성 및 ID 조회
    const folderId = await gdriveWebService.getOrCreateFolder('CEUM_PDF_Library');

    const metadata = {
      name: fileName,
      parents: [folderId],
      mimeType: 'application/pdf'
    };

    const boundary = '-------314159265358979323846';
    
    // RFC 규격 및 구글 업로드 API 스펙에 맞추어 multipart 바디 조립 (각 파트 개행 준수)
    const part1Str = 
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: application/pdf\r\n\r\n`;
      
    const part2Str = `\r\n--${boundary}--`;

    // Blob 데이터를 ArrayBuffer로 읽기
    const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(pdfBlob);
    });

    const uInt8Array = new Uint8Array(arrayBuffer);
    const encoder = new TextEncoder();
    const part1 = encoder.encode(part1Str);
    const part2 = encoder.encode(part2Str);

    // 전체 바디 합치기
    const body = new Uint8Array(part1.length + uInt8Array.length + part2.length);
    body.set(part1, 0);
    body.set(uInt8Array, part1.length);
    body.set(part2, part1.length + uInt8Array.length);

    const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    const uploadRes = await gdriveFetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`PDF Upload failed: ${errText}`);
    }

    const createdFile = await uploadRes.json();
    const fileId = createdFile.id;

    // 공유 권한 부여 (anyone reader)
    await gdriveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone'
      })
    });

    // 파일 정보 조회로 webViewLink 가져오기
    const fileInfoRes = await gdriveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=webViewLink`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const fileInfo = await fileInfoRes.json();

    return {
      id: fileId,
      webViewLink: fileInfo.webViewLink
    };
  }
};
