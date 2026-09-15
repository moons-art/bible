import { jsPDF } from 'jspdf';
import { gdriveWebService } from '../api/gdriveWebService';
import { imageCache } from './imageCache';

// 이미지 로드 비동기 Helper (CORS 가드 적용 및 타임아웃 방지)
const loadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => reject(new Error('이미지 로드 시간 초과 (15초)')), 15000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = (e) => {
      clearTimeout(timer);
      reject(new Error('이미지 로딩 실패 (네트워크 또는 파일 데이터 오류)'));
    };
    img.src = url;
  });
};

// 멘트(한글) 자막 텍스트를 고해상도 Canvas 이미지로 렌더링하는 Helper
const renderMemoToCanvas = (text: string, width: number, height: number, fontSize: number): string => {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // 1. 자막 배경색 채우기 (다크 테마: zinc-900)
    ctx.fillStyle = '#18181b';
    ctx.fillRect(0, 0, width, height);

    // 2. 텍스트 정렬 및 스타일 설정 (금색/황토색 느낌: amber-400)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fbbf24'; 
    ctx.font = `bold ${fontSize}px sans-serif`;

    // 3. 줄바꿈(\n) 처리하여 그리기
    const lines = text.split('\n');
    const lineHeight = fontSize * 1.4;
    const totalHeight = lines.length * lineHeight;
    let startY = (height - totalHeight) / 2 + lineHeight / 2;

    lines.forEach((line) => {
      ctx.fillText(line.trim(), width / 2, startY);
      startY += lineHeight;
    });

    return canvas.toDataURL('image/jpeg', 0.9);
  } catch (err) {
    console.error('[pdfGenerator] renderMemoToCanvas error:', err);
    return '';
  }
};

// 한글 공동체 명칭(Footer)을 이미지로 렌더링하는 Helper (한글 깨짐 방지)
const renderFooterToCanvas = (text: string, width: number, height: number): string => {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // 배경색 채우기 (zinc-900 테마 배경과 일치시킴)
    ctx.fillStyle = '#18181b';
    ctx.fillRect(0, 0, width, height);

    // 텍스트 스타일 지정 (회색 서체)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#94a3b8'; // slate-400
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(text, width / 2, height / 2 + 1);

    return canvas.toDataURL('image/jpeg', 0.95);
  } catch (err) {
    console.error('[pdfGenerator] renderFooterToCanvas error:', err);
    return '';
  }
};

export const generateMobilePDF = async (
  title: string,
  type: 'leader' | 'congregation',
  items: any[],
  songs: any[],
  onProgress: (msg: string, percent: number) => void,
  footer?: string
): Promise<Blob> => {
  onProgress('PDF 엔진 초기화 중...', 10);
  
  // 4x7 인치 포맷 설정 (pt 단위: 1인치 = 72pt)
  // 4 * 72 = 288pt, 7 * 72 = 504pt
  const PAGE_W = 288;
  const PAGE_H = 504;
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: [PAGE_W, PAGE_H]
  });

  let renderedCount = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const progressPercent = Math.round(10 + (i / items.length) * 80);
    onProgress(`악보 렌더링 중 (${i + 1}/${items.length})`, progressPercent);

    const song = songs.find((s) => {
      if (!s || !s.id || !item.songId) return false;
      const sId = s.id.toString();
      const tId = item.songId.toString();
      return sId === tId || (s.fileId && s.fileId.toString() === tId) || tId.endsWith('-' + sId) || sId.endsWith('-' + tId);
    });
    if (!song) {
      console.warn(`[pdfGenerator] Song not found for itemId: ${item.id}`);
      continue;
    }

    const fileId = song.fileId || song.filePath || song.filename;
    console.log(`[pdfGenerator] Processing item ${i + 1}: ${song.title} (fileId: ${fileId})`);
    
    try {
      // 1. 기기 로컬 캐시(IndexedDB)에서 이미 동기화되어 저장되어 있는 악보 데이터 최우선 검색
      let blob: Blob | null = null;
      const cacheKeys = [song.fileId, song.filePath, song.filename, item.songId, fileId].filter(Boolean);
      for (const key of cacheKeys) {
        try {
          const cached = await imageCache.getImage(key);
          if (cached) {
            blob = cached;
            console.log(`[pdfGenerator] Cache HIT! Loaded score directly from device local DB: ${key}`);
            break;
          }
        } catch (cacheErr) {}
      }

      // 2. 로컬 캐시 미스 시 원본 에셋 경로 또는 구글 드라이브에서 긁어오기
      if (!blob) {
        const isLocalAsset = fileId.includes('/') || fileId.includes('.') || fileId.startsWith('http') || fileId.includes('\\');
        if (isLocalAsset) {
          try {
            console.log(`[pdfGenerator] Loading local asset directly: ${fileId}`);
            const res = await fetch(fileId);
            if (res.ok) {
              blob = await res.blob();
            }
          } catch (fetchErr) {
            console.error(`[pdfGenerator] Fetch error for local asset: ${fileId}`, fetchErr);
          }
        }
        
        if (!blob) {
          blob = await gdriveWebService.getFileBlob(fileId);
        }
      }
      
      if (!blob) {
        throw new Error(`악보 파일 데이터를 가져올 수 없습니다. (ID: ${fileId})`);
      }
      
      const imgUrl = URL.createObjectURL(blob);
      const img = await loadImage(imgUrl);
      URL.revokeObjectURL(imgUrl);

      // 2. 크롭 영역을 적용한 악보 이미지 Canvas 생성 (0 or NaN 가드 적용)
      const crop = item.crop || {};
      const cropLeft = typeof crop.left === 'number' ? crop.left : 0;
      const cropRight = typeof crop.right === 'number' ? crop.right : 0;
      const cropTop = typeof crop.top === 'number' ? crop.top : 0;
      const cropBottom = typeof crop.bottom === 'number' ? crop.bottom : 0;

      const w = img.naturalWidth || img.width || 800;
      const h = img.naturalHeight || img.height || 1100;

      // 크롭 영역 연산 가드 (좌표가 음수가 되거나 이미지 범위를 벗어나지 않게 조정)
      const cropX = Math.max(0, Math.min(w - 10, (w * cropLeft) / 100));
      const cropY = Math.max(0, Math.min(h - 10, (h * cropTop) / 100));
      const cropW = Math.max(10, Math.min(w, w * (1 - (cropLeft + cropRight) / 100)));
      const cropH = Math.max(10, Math.min(h, h * (1 - (cropTop + cropBottom) / 100)));

      console.log(`[pdfGenerator] [${song.title}] Canvas rendering size: x=${cropX}, y=${cropY}, w=${cropW}, h=${cropH} (Image origin: ${w}x${h})`);

      const scoreCanvas = document.createElement('canvas');
      scoreCanvas.width = cropW;
      scoreCanvas.height = cropH;
      const scoreCtx = scoreCanvas.getContext('2d');
      if (!scoreCtx) throw new Error('Canvas 2D Context를 생성할 수 없습니다.');
      
      scoreCtx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
      const scoreDataUrl = scoreCanvas.toDataURL('image/jpeg', 0.95);

      // 3. PDF에 새 페이지 추가
      if (renderedCount > 0) {
        pdf.addPage([PAGE_W, PAGE_H]);
      }

      // 페이지 전체 배경색 검은색(zinc-900)으로 채우기
      pdf.setFillColor(24, 24, 27);
      pdf.rect(0, 0, PAGE_W, PAGE_H, 'F');

      // 4. 모바일 화면 최적화 레이아웃 계산
      const showMemo = type === 'leader' && item.memo;
      const memoH = 90; // 하단 자막 영역 높이 (pt)
      const availableH = showMemo ? PAGE_H - memoH : PAGE_H;
      
      // AR 계산 오류 (NaN) 방지
      const AR = cropW / cropH || 0.7;

      let boxW = PAGE_W;
      let boxH = PAGE_W / AR;
      if (boxH > availableH) {
        boxH = availableH;
        boxW = availableH * AR;
      }

      // 좌표 계산 가드 (NaN 방지)
      const translateX = isNaN(boxW) ? 0 : Math.max(0, (PAGE_W - boxW) / 2);
      const translateY = 10; 
      const finalBoxW = isNaN(boxW) ? PAGE_W : boxW;
      const finalBoxH = isNaN(boxH) ? availableH : boxH;

      // 5. PDF에 크롭된 악보 이미지 삽입
      pdf.addImage(scoreDataUrl, 'JPEG', translateX, translateY, finalBoxW, finalBoxH);

      // 6. 인도자용: 하단 자막 렌더링 및 삽입
      if (showMemo) {
        const memoDataUrl = renderMemoToCanvas(item.memo, 576, 180, 28);
        if (memoDataUrl) {
          pdf.addImage(memoDataUrl, 'JPEG', 0, PAGE_H - memoH, PAGE_W, memoH);
        }
      }

      // 7. 페이지 최하단에 공동체 명칭(Footer) 추가 (한글 깨짐 우회 이미지화 기법)
      if (footer) {
        const footerDataUrl = renderFooterToCanvas(footer, 576, 32);
        if (footerDataUrl) {
          pdf.addImage(footerDataUrl, 'JPEG', 0, PAGE_H - 16, PAGE_W, 16);
        }
      }

      renderedCount++;
      console.log(`[pdfGenerator] [${song.title}] Rendered on page successfully.`);

    } catch (err: any) {
      console.error(`[pdfGenerator] Failed to render item index ${i} (${song.title}):`, err);
    }
  }

  if (renderedCount === 0) {
    // 렌더링 성공한 악보가 단 한 장도 없을 경우, 에러를 발생시키는 대신 
    // 안내 문구가 담긴 예비 페이지를 1장 생성하여 PDF 정상 생성 흐름을 안전하게 유지합니다.
    // (jsPDF 한글 자모 깨짐을 방지하고자 영문 텍스트 표기)
    pdf.setFillColor(24, 24, 27);
    pdf.rect(0, 0, PAGE_W, PAGE_H, 'F');
    pdf.setFontSize(11);
    pdf.setTextColor(148, 163, 184); // slate-400
    pdf.text('No sheet music images available.', PAGE_W / 2, PAGE_H / 2 - 10, { align: 'center' });
    pdf.setFontSize(9);
    pdf.setTextColor(100, 116, 139); // slate-500
    pdf.text('(Please check Google Drive upload status)', PAGE_W / 2, PAGE_H / 2 + 10, { align: 'center' });
    renderedCount++;
  }

  onProgress('PDF 생성 완료!', 95);
  return pdf.output('blob');
};
