import React, { useRef, useState, useEffect, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import { useHymnal } from '../../stores/HymnalProvider';
import type { ContiItem } from '../../stores/HymnalProvider';
import { hymnalApi } from '../../api/hymnalApi';
import { 
  Plus, Minus, Trash2, Maximize2, Type, Move, ZoomIn, Scissors, Save, X, RotateCcw, Image as ImageIcon, 
  StickyNote, LayoutTemplate, Printer, Share2, Search, Library, FileUp,
  ChevronLeft, ChevronRight, GripVertical, Download, ImagePlus, Calendar, Hash, Layout, CheckCircle2, Check, DoorOpen, HelpCircle
} from 'lucide-react';
import { compressImageToWebP, uploadImageToGDrive } from '../../utils/imageProcessor';
import { gdriveWebService } from '../../api/gdriveWebService';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { SavedContisModal } from './SavedContisModal';
import { LeaderViewer } from './LeaderViewer';

const MARGIN_PX = 55; // 안전 여백

import { TooltipIcon } from '../TooltipIcon';

// --- Optimized Local Slider Component ---
const SmoothSlider = memo(({ 
  value, 
  onChange, 
  min, 
  max, 
  step = 1,
  label,
  accentColor = "accent-indigo-500",
  unit = ""
}: {
  value: number;
  onChange: (val: number) => void;
  min: number;
  max: number;
  step?: number;
  label?: string;
  accentColor?: string;
  unit?: string;
}) => {
  const [localVal, setLocalVal] = useState(value);
  useEffect(() => { setLocalVal(value); }, [value]);

  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">{label}</span>}
      <input 
        type="range" min={min} max={max} step={step} 
        value={localVal} 
        onMouseDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          const v = Number(e.target.value);
          setLocalVal(v);
          // 실시간 반영을 위해 Store 업데이트를 호출하되, 
          // DraggableContiItem이 memo되어 있어 부하가 적음
          onChange(v);
        }} 
        className={`w-14 sm:w-16 ${accentColor} h-1 cursor-pointer`} 
      />
      <span className={`text-[10px] font-black font-mono w-6 text-center ${accentColor.replace('accent-', 'text-').replace('-500', '-300')}`}>
        {localVal}{unit}
      </span>
    </div>
  );
});

// --- Memoized Individual Item Component ---
const DraggableContiItem = React.memo(({ 
  item, 
  song, 
  isSelected, 
  canvasWidth, 
  canvasHeight, 
  isPreviewMode, 
  showContiNumbers,
  index,
  canvasRef,
  onSelect,
  onUpdate,
  onRemove,
  onCropEdit
}: any) => {
  const [isDragging, setIsDragging] = useState(false);
  const [imageRatio, setImageRatio] = useState(1.414); // A4 ratio default
  const [localMemo, setLocalMemo] = useState(item.memo || '');
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  // 로컬 상태와 동기화
  useEffect(() => { setLocalMemo(item.memo || ''); }, [item.memo]);

  // 구글 드라이브 이미지의 경우 안전하게 Blob으로 직접 다운로드하여 렌더링
  useEffect(() => {
    let isMounted = true;
    let currentUrl: string | null = null;
    const fileId = song?.fileId || song?.filePath || song?.filename;
    
    // 구글 드라이브 ID는 보통 20자 이상. 로컬 경로나 번호가 아닐 때만 시도
    if (fileId && fileId.length > 20 && !fileId.startsWith('/')) {
      import('../../api/gdriveWebService').then(({ gdriveWebService }) => {
        gdriveWebService.downloadImageBlob(fileId).then(url => {
          if (isMounted && url) {
            currentUrl = url;
            setBlobUrl(url);
          } else if (url) {
            URL.revokeObjectURL(url);
          }
        });
      });
    }
    return () => {
      isMounted = false;
      // 언마운트 시 메모리 해제
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [song?.fileId, song?.filePath, song?.filename]);

  const crop = item.crop || { top: 0, bottom: 0, left: 0, right: 0 };
  const visibleWidthFactor = (100 - crop.left - crop.right) / 100;
  const visibleHeightFactor = (100 - crop.top - crop.bottom) / 100;

  return (
    <motion.div
      drag={!isPreviewMode} dragMomentum={false} dragElastic={0} dragConstraints={canvasRef}
      initial={false}
      onDragStart={() => onSelect(item.id)}
      onDragEnd={(e) => {
         const canvas = canvasRef.current; if (!canvas) return;
         const rect = canvas.getBoundingClientRect();
         const el = (e.target as HTMLElement).closest('.conti-item-container');
         if (!el) return;
         const elRect = el.getBoundingClientRect();
         let xPercent = Number((((elRect.left - rect.left) / rect.width) * 100).toFixed(2));
         let yPercent = Number((((elRect.top - rect.top) / rect.height) * 100).toFixed(2));
         onUpdate(item.id, { x: xPercent, y: yPercent });
      }}
      className={`absolute cursor-grab active:cursor-grabbing conti-item-container ${isSelected ? 'z-[100]' : 'z-10'}`}
      animate={{
        x: (item.x * canvasWidth) / 100,
        y: (item.y * canvasHeight) / 100,
      }}
      transition={{ type: "tween", ease: "linear", duration: 0 }}
      style={{
        left: 0, top: 0,
        width: `${item.width}%`,
      }}
      onClick={(e) => { e.stopPropagation(); onSelect(item.id); }}
    >
       {isSelected && !isPreviewMode && (
         <div 
           className="absolute -top-11 left-0 flex items-center gap-2.5 bg-slate-900/95 backdrop-blur-md text-white px-2.5 py-1.5 rounded-xl shadow-2xl z-[110] no-print border border-white/10 animate-in fade-in slide-in-from-bottom-1 duration-200"
           onMouseDown={(e) => e.stopPropagation()}
           onClick={(e) => e.stopPropagation()}
         >
            <button onClick={() => onCropEdit(item.id)} className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 transition-all rounded-lg shadow-lg shadow-indigo-500/20 group whitespace-nowrap">
              <Scissors className="w-3 h-3 text-white/90 group-hover:scale-110 transition-transform" />
              <span className="text-[10px] font-black tracking-tight">자르기</span>
            </button>
            
            <div className="w-px h-3 bg-white/20 mx-0.5" />
            
            <div className="flex items-center gap-3">
              <button 
                onClick={() => onUpdate(item.id, { isMemoOpen: !item.isMemoOpen })} 
                className={`flex items-center gap-1.5 px-2.5 py-1 transition-all rounded-lg border border-white/5 ${item.isMemoOpen ? 'bg-amber-500 text-white shadow-amber-500/20' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}
              >
                <StickyNote className="w-3 h-3" />
                <span className="text-[10px] font-black tracking-tight">메모</span>
              </button>

              {item.isMemoOpen && (
                <SmoothSlider 
                  label="Font" 
                  min={10} max={60} 
                  value={item.memoFontSize || 12} 
                  onChange={(v) => onUpdate(item.id, { memoFontSize: v })}
                  accentColor="accent-amber-400"
                />
              )}
            </div>

            <div className="w-px h-3 bg-white/20 mx-0.5" />
            
            <div className="flex items-center gap-2">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">크기</span>
                <div className="flex items-center gap-1 bg-white/5 p-0.5 rounded-lg border border-white/5">
                   <button onMouseDown={(e) => e.stopPropagation()} onClick={() => onUpdate(item.id, { width: Math.round(Math.max(10, item.width - 2)) })} className="p-1 hover:bg-white/10 rounded-md text-slate-400 hover:text-white transition-all">
                     <Minus className="w-3 h-3" />
                   </button>
                   <span className="text-[9px] font-black font-mono text-indigo-300 w-7 text-center">{Math.round(item.width)}%</span>
                   <button onMouseDown={(e) => e.stopPropagation()} onClick={() => onUpdate(item.id, { width: Math.round(Math.min(100, item.width + 2)) })} className="p-1 hover:bg-white/10 rounded-md text-slate-400 hover:text-white transition-all">
                     <Plus className="w-3 h-3" />
                   </button>
                </div>
            </div>
            
            <div className="w-px h-3 bg-white/20 mx-0.5" />
            
            <button onClick={() => onRemove(item.id)} className="p-1 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
         </div>
       )}

       <div className="relative w-full overflow-hidden rounded-sm ring-1 ring-slate-200 bg-white" style={{ aspectRatio: `${imageRatio * (visibleWidthFactor / visibleHeightFactor)}` }}>
          <img 
            src={blobUrl || hymnalApi.resolveImagePath(song?.filePath || song?.filename || '')} 
            className="absolute block max-w-none" 
            onLoad={(e) => { setImageRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight); }} 
            style={{ width: `${100 / visibleWidthFactor}%`, left: `-${(crop.left / visibleWidthFactor)}%`, top: `-${(crop.top / visibleHeightFactor)}%` }} 
            draggable={false} 
          />
       </div>

       {showContiNumbers && (
         <div className={`absolute -top-3 -left-3 w-7 h-7 bg-slate-900 border-2 border-white text-white rounded-full items-center justify-center text-[11px] font-black shadow-xl z-[105] ${!isPreviewMode ? 'flex' : 'hidden print:flex'} print:shadow-none print:bg-black`}>
            {index + 1}
         </div>
       )}

       {isSelected && !isPreviewMode && <div className="absolute -inset-1 border-2 border-indigo-500 rounded-lg pointer-events-none z-[101]" />}
       
       {item.isMemoOpen && (
          <div className="mt-2.5 no-print relative group/memo" onMouseDown={(e) => e.stopPropagation()}>
            <textarea 
              value={localMemo} 
              onChange={(e) => setLocalMemo(e.target.value)} 
              onBlur={() => onUpdate(item.id, { memo: localMemo })}
              placeholder="찬양 멘트..." 
              className="w-full bg-white/95 border-2 border-slate-100 rounded-xl p-2.5 font-bold text-slate-700 shadow-lg focus:border-indigo-200 focus:outline-none transition-all resize-none custom-scrollbar" 
              style={{ fontSize: `${item.memoFontSize || 12}px`, height: 'auto', minHeight: '50px' }} 
            />
          </div>
       )}
       <div className="hidden print:block text-center mt-2.5 font-black text-black leading-tight" style={{ fontSize: `${item.memoFontSize || 12}px` }}>{item.memo}</div>
    </motion.div>
  );
});

// --- Pro Crop Overlay Component ---
const CropEditor: React.FC<{
  item: ContiItem;
  song: any;
  onSave: (crop: NonNullable<ContiItem['crop']>, width: number) => void;
  onCancel: () => void;
}> = ({ item, song, onSave, onCancel }) => {
  const [crop, setCrop] = useState(item.crop || { top: 0, bottom: 0, left: 0, right: 0 });
  const [zoom, setZoom] = useState(item.width);
  const containerRef = useRef<HTMLDivElement>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fileId = song?.fileId || song?.filePath || song?.filename;
    
    if (fileId && fileId.length > 20 && !fileId.startsWith('/')) {
      import('../../api/gdriveWebService').then(({ gdriveWebService }) => {
        gdriveWebService.downloadImageBlob(fileId).then(url => {
          if (isMounted && url) {
            setBlobUrl(url);
          }
        });
      });
    }
    
    return () => {
      isMounted = false;
    };
  }, [song?.fileId, song?.filePath, song?.filename]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY * -0.05;
    setZoom(prev => Math.max(1, Math.min(100, prev + delta)));
  };

  const handleReset = () => {
    setCrop({ top: 0, bottom: 0, left: 0, right: 0 });
    setZoom(25);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[10000] bg-slate-950/90 backdrop-blur-md flex flex-col items-center justify-center no-print"
      onWheel={handleWheel}
    >
        <div className="absolute top-8 left-1/2 -translate-x-1/2 text-center">
            <h3 className="text-white text-lg font-black tracking-tight">{song?.title} - 자르기 편집</h3>
            <p className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">상자 모서리를 잡아당겨 자르기 • 마우스 휠로 확대</p>
        </div>

        <div ref={containerRef} className="relative w-[80vw] h-[70vh] flex items-center justify-center overflow-hidden">
            <div className="relative transition-transform duration-200 ease-out" style={{ width: `${zoom}%` }}>
               {(!blobUrl && (song?.fileId || song?.filePath)?.length > 20 && !(song?.fileId || song?.filePath)?.startsWith('/')) ? (
                 <div className="w-full h-64 flex flex-col items-center justify-center bg-white/5 rounded-xl border border-white/10 text-white">
                   <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-2"></div>
                   <span className="text-sm font-bold opacity-70">구글 드라이브 원본을 불러오는 중...</span>
                 </div>
               ) : (
                 <img src={blobUrl || hymnalApi.resolveImagePath(song?.filePath || song?.filename || '')} className="w-full h-auto block select-none pointer-events-none" alt="preview" />
               )}
               
               {/* Dimmed Area */}
               <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-0 left-0 right-0 bg-black/60" style={{ height: `${crop.top}%` }} />
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60" style={{ height: `${crop.bottom}%` }} />
                  <div className="absolute top-[var(--top)] bottom-[var(--bottom)] left-0 bg-black/60" 
                    style={{ '--top': `${crop.top}%`, '--bottom': `${crop.bottom}%`, width: `${crop.left}%` } as any} />
                  <div className="absolute top-[var(--top)] bottom-[var(--bottom)] right-0 bg-black/60" 
                    style={{ '--top': `${crop.top}%`, '--bottom': `${crop.bottom}%`, width: `${crop.right}%` } as any} />
               </div>

               {/* Resizable Crop Box */}
               <div className="absolute border-2 border-indigo-400 shadow-2xl cursor-move touch-none" style={{ top: `${crop.top}%`, left: `${crop.left}%`, right: `${crop.right}%`, bottom: `${crop.bottom}%` }}
                 onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    const rect = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect();
                    const startX = e.clientX; const startY = e.clientY; const startCrop = { ...crop };
                    const move = (me: PointerEvent) => {
                       const dx = ((me.clientX - startX) / rect.width) * 100;
                       const dy = ((me.clientY - startY) / rect.height) * 100;
                       const nLeft = Math.max(0, Math.min(100 - (100-startCrop.right-startCrop.left), startCrop.left + dx));
                       const nTop = Math.max(0, Math.min(100 - (100-startCrop.bottom-startCrop.top), startCrop.top + dy));
                       setCrop({ top: nTop, bottom: startCrop.bottom - (nTop-startCrop.top), left: nLeft, right: startCrop.right - (nLeft-startCrop.left) });
                    };
                    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
                    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
                 }}
               >
                  {/* Handles */}
                  {[
                    { style: 'top-[-6px] left-[-6px] cursor-nw-resize', type: 'tl' },
                    { style: 'top-[-6px] right-[-6px] cursor-ne-resize', type: 'tr' },
                    { style: 'bottom-[-6px] left-[-6px] cursor-sw-resize', type: 'bl' },
                    { style: 'bottom-[-6px] right-[-6px] cursor-se-resize', type: 'br' },
                    { style: 'top-[-6px] left-1/2 -translate-x-1/2 cursor-n-resize h-3 w-10 bg-indigo-400', type: 'n' },
                    { style: 'bottom-[-6px] left-1/2 -translate-x-1/2 cursor-s-resize h-3 w-10 bg-indigo-400', type: 's' },
                  ].map(h => (
                    <div key={h.type} className={`absolute z-[10] border-2 border-white bg-indigo-500 rounded-full shadow-lg ${h.style} ${!h.style.includes('h-') ? 'w-6 h-6' : 'h-4 w-12'} touch-none`}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        e.currentTarget.setPointerCapture(e.pointerId);
                        const rect = (e.currentTarget as HTMLElement).parentElement!.parentElement!.getBoundingClientRect();
                        const sX = e.clientX; const sY = e.clientY; const sC = { ...crop };
                        const move = (me: PointerEvent) => {
                          const dx = ((me.clientX - sX) / rect.width) * 100;
                          const dy = ((me.clientY - sY) / rect.height) * 100;
                          setCrop(prev => {
                            const n = { ...prev };
                            if (h.type.includes('n')) n.top = Math.max(0, Math.min(100 - prev.bottom - 2, sC.top + dy));
                            if (h.type.includes('s')) n.bottom = Math.max(0, Math.min(100 - prev.top - 2, sC.bottom - dy));
                            if (h.type.includes('l')) n.left = Math.max(0, Math.min(100 - prev.right - 2, sC.left + dx));
                            if (h.type.includes('r')) n.right = Math.max(0, Math.min(100 - prev.left - 2, sC.right - dx));
                            return n;
                          });
                        };
                        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
                        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
                      }}
                    />
                  ))}
               </div>
            </div>
        </div>

        <div className="absolute bottom-12 flex items-center gap-8 bg-white/10 backdrop-blur-3xl px-10 py-5 rounded-[2.5rem] border border-white/20 shadow-2xl">
           <button onClick={handleReset} className="text-slate-300 text-xs font-black uppercase hover:text-white transition-colors">초기화</button>
           <div className="w-px h-6 bg-white/10" />
           <div className="flex items-center gap-6">
              <Search className="w-4 h-4 text-indigo-400" />
              <input type="range" min="1" max="100" step="0.1" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-48 accent-indigo-500 cursor-pointer" />
              <span className="text-white font-mono text-sm">{zoom.toFixed(1)}%</span>
           </div>
           <div className="flex items-center gap-3">
              <button onClick={onCancel} className="px-6 py-2.5 rounded-2xl text-xs font-black text-slate-400 hover:text-white">취소</button>
              <button onClick={() => onSave(crop, zoom)} className="px-10 py-3 rounded-2xl text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl flex items-center gap-2">
                <Check className="w-4 h-4" /> 적용하기
              </button>
           </div>
        </div>
    </motion.div>
  );
};

// --- Sub-component for individual page content ---
const PageContent: React.FC<{ 
  pNum: number, 
  canvasWidth: number, 
  canvasHeight: number,
  activeItemId: string | null,
  setActiveItemId: (id: string | null) => void,
  setCropEditingId: (id: string | null) => void,
  isPreviewMode: boolean
}> = ({ pNum, canvasWidth, canvasHeight, activeItemId, setActiveItemId, setCropEditingId, isPreviewMode }) => {
  const { 
    contiItems, contiTitle, contiTitleFontSize, songs, 
    updateContiItem, removeFromConti, showContiNumbers
  } = useHymnal();
  
  const canvasRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={canvasRef} onMouseDown={() => setActiveItemId(null)} className={`bg-white relative page-break-after overflow-hidden ${isPreviewMode ? '' : 'shadow-2xl'}`} style={{ width: `${canvasWidth}px`, height: `${canvasHeight}px` }}>
      {!isPreviewMode && <div className="absolute pointer-events-none no-print border border-slate-200 border-dashed" style={{ left: MARGIN_PX, top: MARGIN_PX, right: MARGIN_PX, bottom: MARGIN_PX }} />}
      
      <div className="absolute left-0 right-0 z-20 text-center flex flex-col items-center gap-2 group/title no-print pointer-events-none" style={{ top: '30px' }}>
        <div 
          className="w-full font-black text-slate-900 bg-transparent text-center py-4 border-none focus:outline-none transition-all" 
          style={{ fontSize: `${contiTitleFontSize}px` }}
        >
          {contiTitle || "무제목 콘티"}
        </div>
      </div>

      <div className="hidden print:block absolute left-0 right-0 text-center font-black text-black" style={{ top: '30px', fontSize: `${contiTitleFontSize}px` }}>
        {contiTitle && contiTitle.trim() !== '' ? contiTitle : ''}
      </div>

      <AnimatePresence>
        {contiItems.filter(item => item.isVisible && item.page === pNum).map((item, index) => (
          <DraggableContiItem 
            key={item.id}
            item={item}
            song={songs.find(s => {
              if (!s || !s.id || !item.songId) return false;
              const sId = s.id.toString();
              const tId = item.songId.toString();
              return sId === tId || (s.fileId && s.fileId.toString() === tId) || tId.endsWith('-' + sId) || sId.endsWith('-' + tId);
            })}
            isSelected={activeItemId === item.id}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            isPreviewMode={isPreviewMode}
            showContiNumbers={showContiNumbers}
            index={contiItems.findIndex(i => i.id === item.id)}
            canvasRef={canvasRef}
            onSelect={setActiveItemId}
            onUpdate={updateContiItem}
            onRemove={removeFromConti}
            onCropEdit={setCropEditingId}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};

export const ContiEditor: React.FC = () => {
  const { 
    setIsEditorOpen, contiItems, contiTitle, setContiTitle, paperSize, setPaperSize,
    orientation, setOrientation, updateContiItem, removeFromConti, toggleContiItemVisibility,
    clearConti, songs, contiTitleFontSize, setContiTitleFontSize,
    reorderContiItems, showContiNumbers, setShowContiNumbers,
    isLibraryOpen, setIsLibraryOpen,
    savedContis, saveCurrentConti, loadSavedConti, deleteSavedConti,
    setSongs, setContiItems
  } = useHymnal();

  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [cropEditingId, setCropEditingId] = useState<string | null>(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isLeaderViewerOpen, setIsLeaderViewerOpen] = useState(false);

  const [localTitle, setLocalTitle] = useState(contiTitle);
  useEffect(() => { setLocalTitle(contiTitle); }, [contiTitle]);

  const isLandscape = orientation === 'landscape';
  const canvasWidth = isLandscape ? (paperSize === 'A4' ? 1123 : 1587) : (paperSize === 'A4' ? 794 : 1123);
  const canvasHeight = isLandscape ? (paperSize === 'A4' ? 794 : 1123) : (paperSize === 'A4' ? 1123 : 1587);
  const editingItem = contiItems.find(i => i.id === cropEditingId);
  const editingSong = editingItem ? songs.find(s => {
    if (!s || !s.id || !editingItem.songId) return false;
    const sId = s.id.toString();
    const tId = editingItem.songId.toString();
    return sId === tId || (s.fileId && s.fileId.toString() === tId) || tId.endsWith('-' + sId) || sId.endsWith('-' + tId);
  }) : null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={`fixed inset-0 z-[9999] flex flex-col overflow-hidden select-none transition-colors duration-500 ${isPreviewMode ? 'bg-slate-50' : 'bg-slate-950'}`}>
        <AnimatePresence>
          {cropEditingId && editingItem && editingSong && (
            <CropEditor key="crop-editor" item={editingItem} song={editingSong} onCancel={() => setCropEditingId(null)} onSave={(newCrop, newWidth) => { updateContiItem(cropEditingId, { crop: newCrop, width: newWidth }); setCropEditingId(null); }} />
          )}
          <SavedContisModal 
            key="saved-contis-modal"
            isOpen={isLibraryOpen} 
            onClose={() => setIsLibraryOpen(false)} 
            savedContis={savedContis} 
            onLoad={loadSavedConti} 
            onDelete={deleteSavedConti} 
          />
          {isLeaderViewerOpen && (
            <LeaderViewer 
              key="leader-viewer" 
              onClose={() => setIsLeaderViewerOpen(false)} 
              onOpenLibrary={() => setIsLibraryOpen(true)}
            />
          )}
        </AnimatePresence>

        {/* 미리보기 종료 버튼 (플로팅) */}
        <AnimatePresence>
          {isPreviewMode && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="fixed top-8 left-1/2 -translate-x-1/2 z-[10000] no-print"
            >
              <button
                onClick={() => setIsPreviewMode(false)}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full font-black shadow-2xl flex items-center gap-2 transition-all active:scale-95"
              >
                미리보기 닫기
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className={`bg-white border-b border-slate-200 z-50 no-print transition-all duration-300 shadow-sm ${isPreviewMode ? '-translate-y-full absolute w-full' : 'relative'}`}>
          {/* 1층: h-16 고정을 풀고 반응형 flex-wrap 및 패딩 조절 */}
          <div className="py-1.5 px-3 sm:px-4 flex flex-wrap items-center justify-between gap-4 border-b border-slate-100/50">
            <div className="flex items-center gap-3 sm:gap-5">
              <button onClick={() => setIsEditorOpen(false)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 transition-colors"><ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" /></button>
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100"><Layout className="w-4 h-4 sm:w-5 sm:h-5 text-white" /></div>
                <div><h1 className="text-xs sm:text-sm font-black text-slate-900 leading-none">콘티 에디터</h1></div>
              </div>
            </div>

            {/* 조작 영역: flex-wrap 적용 */}
            <div className="flex items-center flex-wrap gap-2 sm:gap-3">
              <div className="flex items-center gap-2 sm:gap-3 bg-slate-50 px-3 py-1.5 sm:px-4 sm:py-2 rounded-xl border border-slate-100 group transition-all focus-within:ring-2 focus-within:ring-indigo-500/10 focus-within:border-indigo-500/50">
                <input 
                  type="text" value={localTitle} 
                  onChange={(e) => setLocalTitle(e.target.value)}
                  onBlur={() => setContiTitle(localTitle)}
                  onKeyDown={(e) => e.key === 'Enter' && setContiTitle(localTitle)}
                  placeholder="콘티 제목 입력..." className="bg-transparent font-bold text-xs sm:text-sm text-slate-900 focus:outline-none w-32 sm:w-48"
                />
                <div className="w-px h-4 bg-slate-200 hidden sm:block" />
                <div className="hidden sm:block">
                  <SmoothSlider 
                    label="T-Size"
                    min={20} max={100}
                    value={contiTitleFontSize}
                    onChange={setContiTitleFontSize}
                  />
                </div>
              </div>

              <div className="w-px h-6 bg-slate-200 mx-1 hidden sm:block" />

              <div className="flex items-center">
                <button onClick={() => setIsLibraryOpen(true)} className="px-3 py-1.5 sm:px-4 sm:py-2 bg-white hover:bg-slate-50 rounded-lg text-[10px] sm:text-xs font-black text-slate-600 flex items-center gap-1.5 sm:gap-2 transition-all border border-slate-200 shadow-sm active:scale-95">
                  <Library className="w-3.5 h-3.5 text-slate-400" /> 저장소
                </button>
                <TooltipIcon text="저장된 콘티를 불러옵니다" />
              </div>

              <button onClick={() => saveCurrentConti()} className="px-3 py-1.5 sm:px-4 sm:py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-[10px] sm:text-xs font-black text-white flex items-center gap-1.5 sm:gap-2 transition-all shadow-lg shadow-indigo-100 active:scale-95">
                <Save className="w-3.5 h-3.5" /> 저장하기
              </button>
            </div>
          </div>

          {/* 2층: h-14 고정을 풀고 flex-wrap 및 패딩 조절 */}
          <div className="py-1 px-3 sm:px-4 flex flex-wrap items-center justify-between gap-3 bg-slate-50/30">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <div className="flex items-center">
                <button onClick={() => setShowContiNumbers(!showContiNumbers)} className={`px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg text-[10px] sm:text-[11px] font-black flex items-center gap-1.5 transition-all border ${showContiNumbers ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-500 border-slate-200'}`}>
                  <Hash className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> 순번 {showContiNumbers ? 'ON' : 'OFF'}
                </button>
                <TooltipIcon text="악보 번호보기를 끄고 켭니다" />
              </div>
              <div className="w-px h-4 bg-slate-200 mx-0.5 hidden sm:block" />
              <div className="flex bg-white p-0.5 sm:p-1 rounded-lg border border-slate-200 shrink-0">
                <button onClick={() => setOrientation('portrait')} className={`px-2 py-1 sm:px-3 sm:py-1.5 rounded-md text-[9px] sm:text-[10px] font-black transition-all ${!isLandscape ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>세로</button>
                <button onClick={() => setOrientation('landscape')} className={`px-2 py-1 sm:px-3 sm:py-1.5 rounded-md text-[9px] sm:text-[10px] font-black transition-all ${isLandscape ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>가로</button>
              </div>
              <div className="flex bg-white p-0.5 sm:p-1 rounded-lg border border-slate-200 shrink-0">
                <button onClick={() => setPaperSize('A4')} className={`px-2 py-1 sm:px-3 sm:py-1.5 rounded-md text-[9px] sm:text-[10px] font-black transition-all ${paperSize === 'A4' ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>A4</button>
                <button onClick={() => setPaperSize('A3')} className={`px-2 py-1 sm:px-3 sm:py-1.5 rounded-md text-[9px] sm:text-[10px] font-black transition-all ${paperSize === 'A3' ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>A3</button>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <div className="flex items-center">
                <button onClick={() => setIsLeaderViewerOpen(true)} className="px-3 py-1.5 sm:px-4 sm:py-2 bg-amber-500 hover:bg-amber-600 rounded-lg text-[10px] sm:text-[11px] font-black text-white shadow-lg flex items-center gap-1.5 transition-all active:scale-95"><Layout className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> 뷰어</button>
                <TooltipIcon text="인도자용 악보 뷰어와 회중용 PDF 링크를 생성합니다." />
              </div>
              <button onClick={() => setIsPreviewMode(true)} className="px-3 py-1.5 sm:px-4 sm:py-2 bg-slate-800 hover:bg-slate-900 rounded-lg text-[10px] sm:text-[11px] font-black text-white shadow-lg flex items-center gap-1.5 transition-all active:scale-95"><Search className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> 미리보기</button>
              <button onClick={clearConti} className="px-3 py-1.5 sm:px-4 sm:py-2 bg-white text-slate-400 hover:text-red-500 rounded-lg border border-slate-200 transition-all flex items-center gap-1.5 text-[10px] sm:text-[11px] font-black"><RotateCcw className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> 비우기</button>
              <div className="w-px h-6 bg-slate-200 mx-0.5 hidden sm:block" />
              <button onClick={() => window.print()} className="px-4 py-1.5 sm:px-5 sm:py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] sm:text-[11px] font-black shadow-lg transition-all active:scale-95">인쇄</button>
              <button onClick={() => { if (contiItems.length > 0 && !confirm('변경사항이 저장되지 않을 수 있습니다.')) return; setIsEditorOpen(false); }} className="px-3 py-1.5 sm:px-4 sm:py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] sm:text-[11px] font-black flex items-center gap-1.5 border border-slate-200 transition-all"><DoorOpen className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> 취소</button>
            </div>
          </div>
        </div>

        <div className={`bg-white border-b border-slate-100 flex items-center gap-2 overflow-x-auto custom-scrollbar no-print transition-all duration-300 ${isPreviewMode ? 'opacity-0 h-0 p-0 pointer-events-none' : 'opacity-100 h-auto'}`}>
          <div className="flex items-center px-3 py-2 border-r border-slate-100 shrink-0">
             <TooltipIcon text="좌측 [악보이름]을 선택하면 아래 페이지에 악보가 보입니다. [악보이름]을 좌우로 이동하여 악보번호를 바꿉니다." />
          </div>
          <Reorder.Group axis="x" values={contiItems} onReorder={reorderContiItems} className="px-2 pt-2 pb-5 flex items-center gap-2 flex-1">
           {contiItems.filter(item => !item.isVisible || item.page === 1).map((item, idx) => {
                const song = songs.find(s => {
                  if (!s || !s.id || !item.songId) return false;
                  const sId = s.id.toString();
                  const tId = item.songId.toString();
                  return sId === tId || (s.fileId && s.fileId.toString() === tId) || tId.endsWith('-' + sId) || sId.endsWith('-' + tId);
                });
                const isAssignedToThisPage = item.isVisible && item.page === 1;
                return (
                  <Reorder.Item key={item.id} value={item} layout transition={{ type: "spring", stiffness: 700, damping: 40, mass: 0.8 }} className={`flex items-center gap-1 pl-1.5 pr-2.5 py-1.5 rounded-xl border shrink-0 select-none ${isAssignedToThisPage ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : (item.isVisible ? 'opacity-30 border-slate-200 pointer-events-none' : 'bg-slate-50 border-slate-100 text-slate-500')}`}>
                     <div className="p-0.5 cursor-grab active:cursor-grabbing text-slate-400/50 hover:text-white transition-colors group touch-none"><GripVertical className="w-4 h-4 group-active:scale-110" /></div>
                     <button onClick={() => toggleContiItemVisibility(item.id)} className="flex items-center gap-1.5">
                       <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black ${isAssignedToThisPage ? 'bg-white/20 text-white' : 'bg-white text-slate-300'}`}>{idx + 1}</span>
                       <span className="text-[13px] font-bold truncate max-w-[110px]">{song?.title}</span>
                       {isAssignedToThisPage && <CheckCircle2 className="w-3.5 h-3.5 fill-white text-indigo-600" />}
                     </button>
                  </Reorder.Item>
                );
           })}
          </Reorder.Group>
        </div>

        <div className={`flex-1 overflow-auto p-24 flex flex-col items-center custom-scrollbar transition-all print:p-0 print:m-0 print:overflow-visible print:bg-white ${isPreviewMode ? 'bg-slate-50' : 'bg-slate-100'}`}>
            <div className="relative flex flex-col items-center gap-20 print:gap-0 print:static">
               <div className="flex flex-col items-center transition-opacity duration-300 relative z-10 print:visible print:relative print:pointer-events-auto print:z-10 print:h-auto print:block">
                 <PageContent 
                   pNum={1} 
                   canvasWidth={canvasWidth} 
                   canvasHeight={canvasHeight} 
                   activeItemId={activeItemId} 
                   setActiveItemId={setActiveItemId}
                   setCropEditingId={setCropEditingId}
                   isPreviewMode={isPreviewMode}
                 />
               </div>
            </div>
        </div>
        <style>{`.custom-scrollbar::-webkit-scrollbar { height: 24px; width: 24px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 12px; border: 4px solid white; } @media print { * { box-shadow: none !important; -webkit-print-color-adjust: exact; } body { margin: 0; padding: 0 !important; background-color: white !important; } .no-print { display: none !important; } .page-break-after { page-break-after: always; display: block !important; margin: 0 auto !important; position: static !important; } @page { size: ${paperSize} ${orientation}; margin: 0; } .bg-slate-950, .bg-slate-100 { background: white !important; } }`}</style>
    </motion.div>
  );
};
