// src/utils/imageProcessor.ts
import { gdriveWebService } from '../api/gdriveWebService';

/**
 * File을 읽어 브라우저 Canvas API를 이용해 WEBP로 압축 변환합니다.
 * @param file 원본 이미지 파일 (File 또는 Blob)
 * @param quality 압축 품질 (0~1)
 */
export const compressImageToWebP = async (file: File | Blob, quality = 0.85): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // 최대 해상도 제한 (너무 큰 이미지는 성능 및 용량 최적화를 위해 줄임)
        const MAX_WIDTH = 2500;
        const MAX_HEIGHT = 3500;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas context not available'));
        
        // 배경을 흰색으로 채우기 (투명 PNG 대비)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        
        // WEBP 포맷으로 변환 (기존 sharp 라이브러리 역할을 브라우저가 대신함)
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Canvas to Blob failed'));
          },
          'image/webp',
          quality
        );
      };
      img.onerror = (e) => reject(e);
    };
    reader.onerror = (e) => reject(e);
  });
};

/**
 * Blob을 구글 드라이브에 직접 업로드합니다.
 */
export const uploadImageToGDrive = async (blob: Blob, fileName: string, parentFolderId?: string): Promise<string> => {
  const metadata: any = {
    name: fileName,
    mimeType: 'image/webp',
  };
  
  try {
    // parentFolderId가 없으면 'CEUM_ccm_data' 폴더를 자동 생성/가져와서 기본 저장소로 사용
    const targetFolderId = parentFolderId || await gdriveWebService.getOrCreateFolder('CEUM_ccm_data');
    metadata.parents = [targetFolderId];
  } catch (e) {
    console.warn('Failed to get or create default folder, uploading to root drive', e);
  }

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);

  // gdriveWebService에서 직접 토큰 가져오기 (에러 방지)
  const token = gdriveWebService.getAccessToken();
  if (!token) throw new Error('Not authenticated. Please login to Google Drive first.');

  const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: form,
  });

  if (!response.ok) throw new Error('Image upload failed');
  const result = await response.json();
  const fileId = result.id;
  
  // 3. 누구나 볼 수 있도록 퍼블릭 읽기 권한 추가 (img 태그 렌더링용)
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'anyone',
      role: 'reader'
    }),
  });

  return fileId; // 업로드된 구글 드라이브 파일 ID 반환
};
