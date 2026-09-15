import React, { useEffect, useState } from 'react';
import { hymnalApi } from '../../api/hymnalApi';

interface PdfItem {
  id: string;
  filename: string;
  memo?: string;
  memoFontSize?: number;
  imageUrl: string;
}

export const MobilePdfLayout: React.FC = () => {
  const [data, setData] = useState<{ title: string; items: PdfItem[]; footer?: string } | null>(null);
  const [imagesLoaded, setImagesLoaded] = useState(0);

  useEffect(() => {
    // URL 파라미터에서 콘티 데이터를 가져오거나 IPC로 요청
    const params = new URLSearchParams(window.location.search);
    const encodedData = params.get('data');
    
    if (encodedData) {
      try {
        const decoded = JSON.parse(decodeURIComponent(encodedData));
        setData(decoded);
      } catch (err) {
        console.error('Failed to parse PDF data', err);
      }
    }
  }, []);

  useEffect(() => {
    if (data && imagesLoaded === data.items.length) {
      // 모든 이미지가 로드되면 메인 프로세스에 알림
      // 포커스 제약이 없는 네이티브 방식으로 통신
      (window as any).ipcRenderer.send('pdf-rendering-complete');
    }
  }, [data, imagesLoaded]);

  if (!data) return <div className="p-10 text-white">Loading for PDF...</div>;

  const cleanTitle = (filename: string) => {
    return filename
      .replace(/^\[.*?\]_/, '') // [CCM]_ 접두어 제거
      .replace(/_\d+(-\d+)?$/, '') // _67-0 등 번호 패턴 제거
      .replace(/\.[^/.]+$/, '') // 확장자 제거
      .replace(/_/g, ' '); // 남은 언더바를 공백으로
  };

  return (
    <div className="bg-white min-h-screen text-slate-900 font-sans">
      <style>{`
        @page {
          margin: 0;
          size: 4in 7in; /* 모바일 프리미엄 세로 비율 */
        }
        @media print {
          body {
            -webkit-print-color-adjust: exact;
          }
          .page-break {
            page-break-after: always;
          }
        }
      `}</style>

      {data.items.map((item, index) => (
        <div key={index} className="page-break flex flex-col p-5 h-[7in] overflow-hidden relative">
          {/* Header Bar - 콘티 제목 & 번호 (좌측 정렬 합체) */}
          <div className="flex items-center gap-2 mb-3 border-b-2 border-slate-100 pb-1 flex-shrink-0">
            <span className="text-[18px] font-black text-slate-800 uppercase tracking-tighter truncate max-w-[85%]">
              {data.title}
            </span>
            <span className="text-sm font-black text-red-500 shrink-0">
               #{index + 1}
            </span>
          </div>

          {/* Song Title 제거됨 (사용자 요청) */}

          {/* Score Image */}
          <div className="flex-1 flex items-center justify-center overflow-hidden rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.05)] bg-white border border-slate-50 p-1">
            <img
              src={hymnalApi.resolveImagePath(item.filename)}
              alt={item.filename}
              className="max-w-full max-h-full object-contain"
              onLoad={() => setImagesLoaded(prev => prev + 1)}
            />
          </div>

          {/* Memo / Lyrics (Leader only) */}
          {item.memo && (
            <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 flex-shrink-0">
              <p 
                className="font-extrabold text-slate-800 text-center leading-relaxed whitespace-pre-wrap"
                style={{ fontSize: `${item.memoFontSize || 13}px` }}
              >
                {item.memo}
              </p>
            </div>
          )}

          {/* Footer */}
          <div className="mt-4 pt-2 flex justify-center items-center text-[7px] font-bold text-slate-300 uppercase tracking-widest border-t border-slate-50">
            <span>{data.footer || 'CEUM CCM MOBILE SERVICE 🕊️'}</span>
          </div>
        </div>
      ))}
    </div>
  );
};
