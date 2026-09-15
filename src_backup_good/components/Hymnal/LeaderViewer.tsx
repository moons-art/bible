import React, { useState, useEffect, useCallback } from 'react';
import type { ContiItem } from '../../stores/HymnalProvider';
import { useHymnal } from '../../stores/HymnalProvider';
import { hymnalApi } from '../../api/hymnalApi';
import { X, ChevronLeft, ChevronRight, Library, StickyNote, Monitor, Users, FileText, Loader2, Share2, Check, Download, ChevronUp, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface LeaderViewerProps {
  onClose: () => void;
  onOpenLibrary?: () => void;
}

export const LeaderViewer: React.FC<LeaderViewerProps> = ({ onClose, onOpenLibrary }) => {
  const { contiItems, songs, contiTitle } = useHymnal();
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState({ msg: '', percent: 0 });
  const [genResultUrl, setGenResultUrl] = useState<string | null>(null); // 생성 결과 URL 저장
  const [genFileId, setGenFileId] = useState<string | null>(null); // 생성 결과 파일 ID 저장
  const [showMenuBar, setShowMenuBar] = useState(true); // 상단 메뉴 노출 여부 상태 추가
  
  // 공동체 명칭 상태: localStorage에서 읽어오고 없으면 기본값 사용
  const [communityName, setCommunityName] = useState(() => {
    return localStorage.getItem('ceum-community-name') || '세움CHURCH';
  });

  // 명칭 변경 시 localStorage에 즉시 저장
  useEffect(() => {
    localStorage.setItem('ceum-community-name', communityName);
  }, [communityName]);
  
  // 인도자용 뷰어에 표시할 항목 (화면에 배치된 항목들만)
  const visibleItems = contiItems.filter(item => item.isVisible);
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showMemo, setShowMemo] = useState(true);
  const [imageRatios, setImageRatios] = useState<Record<string, number>>({});
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});

  const handleNext = useCallback(() => {
    if (currentIndex < visibleItems.length - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  }, [currentIndex, visibleItems.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  }, [currentIndex]);

  // 키보드 방향키 조작 지원
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'm' || e.key === 'M') {
        setShowMemo(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev, onClose]);


  const handleGeneratePDF = async (type: 'leader' | 'congregation') => {
    if (isGenerating) return;
    setIsGenerating(true);
    setGenProgress({ msg: 'PDF 엔진 부팅 중...', percent: 0 });

    // 진행률 구독
    const unsubscribe = hymnalApi.onPDFProgress((data) => {
      setGenProgress(data);
    });

    try {
      const itemsToGenerate = visibleItems.map(item => {
        const song = songs.find(s => {
          if (!s || !s.id || !item.songId) return false;
          const sId = s.id.toString();
          const tId = item.songId.toString();
          return sId === tId || (s.fileId && s.fileId.toString() === tId) || tId.endsWith('-' + sId) || sId.endsWith('-' + tId);
        });
        return {
          id: item.id,
          songId: item.songId, // songId 매핑 추가
          filename: song?.filename || '',
          crop: item.crop,     // 크롭 영역 누락 복원
          page: item.page,     // 페이지 번호 복원
          isVisible: item.isVisible,
          // 회중용일 경우 멘트(비고)를 제거하여 생성
          memo: type === 'congregation' ? '' : item.memo,
          memoFontSize: item.memoFontSize || 12,
        };
      });

      const result = await hymnalApi.generatePDF({
        title: contiTitle || '새 찬양 콘티',
        type,
        items: itemsToGenerate,
        songs, // 현재 로드된 곡 목록 인입
        footer: communityName // 공동체 명칭 전달
      });

      if (result.success && result.url) {
        setIsGenerating(false); 
        // 사용자 요청 형식 반영: [콘티제목] 악보보기 링크
        const shareText = `[${contiTitle || '새 찬양 콘티'}] 악보보기 링크\n${result.url}`;
        hymnalApi.writeClipboard(shareText);
        setGenFileId(result.fileId || null);
        setGenResultUrl(result.url); // 결과 URL 세팅 (자동으로 완료 UI 노출)
      } else if (result.message === 'Need Auth') {
        setIsGenerating(false);
        const authUrl = await hymnalApi.getAuthUrl();
        hymnalApi.openExternal(authUrl);
        const code = await hymnalApi.waitForAuthCode();
        if (code) {
          await hymnalApi.confirmAuth(code);
          alert('인증 성공! 다시 한번 [PDF 생성]을 눌러주세요.');
        }
      } else {
        setIsGenerating(false);
        alert(`생성 실패: ${result.message}`);
      }
    } catch (err: any) {
      setIsGenerating(false);
      alert(`오류 발생: ${err.message}`);
    } finally {
      if (unsubscribe) unsubscribe();
    }
  };

  if (visibleItems.length === 0) {
    return (
      <div className="fixed inset-0 z-[10000] bg-slate-950 flex flex-col items-center justify-center text-white">
        <p className="text-xl font-bold mb-4">현재 콘티에 배치된 악보가 없습니다.</p>
        <button 
          onClick={onClose}
          className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-bold"
        >
          돌아가기
        </button>
      </div>
    );
  }

  const safeIndex = currentIndex >= visibleItems.length ? Math.max(0, visibleItems.length - 1) : currentIndex;
  const currentItem = visibleItems[safeIndex];
  const currentSong = songs.find(s => {
    if (!s || !s.id || !currentItem.songId) return false;
    const sId = s.id.toString();
    const tId = currentItem.songId.toString();
    return sId === tId || (s.fileId && s.fileId.toString() === tId) || tId.endsWith('-' + sId) || sId.endsWith('-' + tId);
  });
  const crop = currentItem.crop || { top: 0, bottom: 0, left: 0, right: 0 };
  const visibleWidthFactor = (100 - crop.left - crop.right) / 100;
  const visibleHeightFactor = (100 - crop.top - crop.bottom) / 100;
  
  const currentImageRatio = imageRatios[currentItem.id] || 1; // 가로/세로 비율 (디폴트 1)
  const finalAspectRatio = currentImageRatio * (visibleWidthFactor / visibleHeightFactor);

  // 리스트 내의 모든 이미지를 뷰어가 열릴 때 백그라운드에서 미리 캐싱/다운로드
  useEffect(() => {
    let isMounted = true;

    const loadImages = async () => {
      const { gdriveWebService } = await import('../../api/gdriveWebService');
      
      for (const item of visibleItems) {
        if (!isMounted) break;
        
        const song = songs.find(s => {
          if (!s || !s.id || !item.songId) return false;
          const sId = s.id.toString();
          const tId = item.songId.toString();
          return sId === tId || (s.fileId && s.fileId.toString() === tId) || tId.endsWith('-' + sId) || sId.endsWith('-' + tId);
        });
        
        if (!song) continue;
        
        const fileId = song.fileId || song.filePath || song.filename;
        if (fileId && fileId.length > 20 && !fileId.startsWith('/')) {
          setBlobUrls(prev => {
            if (prev[song.id]) return prev;
            
            gdriveWebService.downloadImageBlob(fileId).then(url => {
              if (isMounted && url) {
                setBlobUrls(current => ({ ...current, [song.id]: url }));
              }
            });
            
            return prev;
          });
        }
      }
    };

    loadImages();

    return () => {
      isMounted = false;
    };
  }, [visibleItems, songs]);

  return (
    <>
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }} 
        className="fixed inset-0 z-[10000] bg-zinc-950 flex flex-col overflow-hidden text-white"
      >
        {/* 뷰어 컨트롤 바 (오버레이) */}
        <AnimatePresence>
          {showMenuBar && (
            <motion.div
              initial={{ y: -100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -100, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute top-0 left-0 right-0 p-4 sm:p-5 flex flex-col gap-2.5 z-50 bg-gradient-to-b from-black/95 to-transparent pointer-events-none"
            >
              {/* 1층: 닫기 버튼 및 우측 조작 제어 버튼 라인 */}
              <div className="flex items-center justify-between w-full">
                <div className="pointer-events-auto">
                  <button 
                    onClick={onClose}
                    className="p-2 bg-black/40 hover:bg-black/60 rounded-full backdrop-blur-md transition-colors"
                  >
                    <X className="w-6 h-6 text-white" />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-3 pointer-events-auto flex-nowrap shrink-0">
                {onOpenLibrary && (
                  <button
                    onClick={onOpenLibrary}
                    className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600/80 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all backdrop-blur-md shadow-lg shrink-0"
                  >
                    <Library className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">저장소</span>
                  </button>
                )}

                {/* 모바일 PDF 생성 버튼 (인도자용 / 회중용 분리) */}
                <div className="flex items-center bg-black/40 backdrop-blur-md rounded-xl p-1.5 shadow-lg border border-white/10 group flex-nowrap shrink-0">
                  {/* 공동체 명칭 입력칸 - 세로 패드나 좁은 화면(md 이하)에서는 레이아웃 깨짐을 방지하고자 가림 */}
                  <div className="hidden md:flex items-center px-4 gap-3 border-r border-white/10">
                    <span className="text-[11px] font-black text-indigo-400 uppercase tracking-tight group-focus-within:text-white transition-colors whitespace-nowrap">공동체 명칭 수정 :</span>
                    <input 
                      type="text"
                      value={communityName}
                      onChange={(e) => setCommunityName(e.target.value)}
                      placeholder="공동체 명칭..."
                      className="bg-transparent border-none text-[12px] font-black text-white focus:outline-none w-24 placeholder:text-white/20"
                    />
                  </div>
                  
                  <button
                    onClick={() => handleGeneratePDF('leader')}
                    disabled={isGenerating}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-white/10 text-white/90 rounded-lg text-xs font-bold transition-all whitespace-nowrap shrink-0"
                    title="멘트가 포함된 인도자용 PDF 생성"
                  >
                    <FileText className="w-3.5 h-3.5 text-red-400" />
                    <span className="hidden sm:inline">PDF(인도자)</span>
                    <span className="inline sm:hidden">인도자</span>
                  </button>
                  <div className="w-[1px] bg-white/10 mx-1 self-stretch shrink-0" />
                  <button
                    onClick={() => handleGeneratePDF('congregation')}
                    disabled={isGenerating}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-white/10 text-white/90 rounded-lg text-xs font-bold transition-all whitespace-nowrap shrink-0"
                    title="악보만 있는 회중용 PDF 생성"
                  >
                    <Users className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="hidden sm:inline">PDF(회중)</span>
                    <span className="inline sm:hidden">회중</span>
                  </button>
                </div>

                <button
                  onClick={() => setShowMemo(!showMemo)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all backdrop-blur-md shadow-lg shrink-0
                    ${showMemo 
                      ? 'bg-amber-500 hover:bg-amber-400 text-white shadow-amber-500/20' 
                      : 'bg-white/10 hover:bg-white/20 text-white/50'
                    }`}
                >
                  <StickyNote className={`w-3.5 h-3.5 ${!showMemo ? 'opacity-50' : ''}`} />
                  <span className="hidden sm:inline">멘트 {showMemo ? 'ON' : 'OFF'}</span>
                  <span className="inline sm:hidden">{showMemo ? 'ON' : 'OFF'}</span>
                </button>

                {/* 메뉴 숨기기 버튼 */}
                <button
                  onClick={() => setShowMenuBar(false)}
                  className="p-2 bg-white/10 hover:bg-white/20 rounded-xl backdrop-blur-md transition-colors shrink-0"
                  title="메뉴바 숨기기"
                >
                  <ChevronUp className="w-5 h-5 text-white" />
                </button>
              </div>

              {/* 2층 (한칸 아래): 긴 곡 제목 및 페이지 표시 영역 */}
              <div className="flex flex-col pl-2 pointer-events-none self-start">
                <h2 className="text-sm sm:text-base md:text-lg font-black tracking-tight drop-shadow-md text-amber-300">
                  {currentSong?.title}
                </h2>
                <span className="text-[10px] sm:text-xs text-white/70 font-bold leading-none mt-1">
                  {currentIndex + 1} / {visibleItems.length}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 메뉴바가 숨겨졌을 때 노출될 귀여운 플로팅 보이기 버튼 */}
        {!showMenuBar && (
          <button
            onClick={() => setShowMenuBar(true)}
            className="fixed top-4 right-4 z-[10005] p-3 bg-black/60 hover:bg-black/80 text-white rounded-full backdrop-blur-md transition-all active:scale-95 shadow-lg border border-white/5 pointer-events-auto"
            title="메뉴바 보이기"
          >
            <ChevronDown className="w-5 h-5" />
          </button>
        )}

        {/* 이전/다음 버튼 (오버레이) */}
        <button 
          onClick={handlePrev}
          disabled={currentIndex === 0}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-4 z-50 bg-black/20 hover:bg-black/50 disabled:opacity-0 rounded-full backdrop-blur-sm transition-all"
        >
          <ChevronLeft className="w-10 h-10 text-white" />
        </button>

        <button 
          onClick={handleNext}
          disabled={currentIndex === visibleItems.length - 1}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-4 z-50 bg-black/20 hover:bg-black/50 disabled:opacity-0 rounded-full backdrop-blur-sm transition-all"
        >
          <ChevronRight className="w-10 h-10 text-white" />
        </button>

        {/* 메인 뷰어 영역 - overflow-y-auto 및 메뉴 접힘 유무에 따른 패딩 처리 */}
        <div 
          className={`flex-1 overflow-y-auto custom-scrollbar w-full flex flex-col items-center min-h-0 relative transition-all duration-300 ${
            showMenuBar ? 'pt-24 pb-8 px-4 sm:px-12' : 'pt-6 pb-6 px-4 sm:px-12'
          }`}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={currentItem.id}
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -10 }}
              transition={{ duration: 0.3 }}
              className="relative flex flex-col items-center justify-start w-full min-h-0"
            >
              {/* Aspect Ratio Box to contain the cropped image - 가로 기준 핏팅 및 세로 터치 스크롤 연동 */}
              <div 
                className="relative overflow-hidden bg-white rounded-2xl shadow-2xl ring-1 ring-white/10 flex items-center justify-center shrink-0"
                style={{ 
                  aspectRatio: `${finalAspectRatio}`,
                  width: '100%',
                  maxWidth: '650px', // 패드 세로 및 PC 가로보기 최적 가로 폭 가드
                  margin: 'auto'
                }}
              >
                {(!blobUrls[currentSong?.id || ''] && (currentSong?.fileId || currentSong?.filePath)?.length > 20 && !(currentSong?.fileId || currentSong?.filePath)?.startsWith('/')) ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900 text-white">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mb-4"></div>
                    <span className="text-sm font-bold opacity-70">구글 드라이브 원본을 불러오는 중...</span>
                  </div>
                ) : (
                  // 하얀 테두리 박스 안쪽에 사방 4% (sm:4% / 모바일 3%) 상당의 온전한 흰 종이 여백 영역 확보!
                  <div className="absolute inset-3 sm:inset-4 overflow-hidden">
                    <img 
                      src={blobUrls[currentSong?.id || ''] || hymnalApi.resolveImagePath(currentSong?.filePath || currentSong?.filename || '')} 
                      className="absolute block max-w-none top-0 left-0" 
                      onLoad={(e) => { 
                        const img = e.currentTarget;
                        const ratio = img.naturalWidth / img.naturalHeight;
                        setImageRatios(prev => ({
                          ...prev,
                          [currentItem.id]: ratio
                        })); 
                      }} 
                      style={{ 
                        width: `${100 / visibleWidthFactor}%`, 
                        left: `-${(crop.left / visibleWidthFactor)}%`, 
                        top: `-${(crop.top / visibleHeightFactor)}%` 
                      }} 
                      draggable={false} 
                    />
                  </div>
                )}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* 하단 멘트(Memo) 영역 */}
        <AnimatePresence>
          {showMemo && currentItem.memo && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="w-full flex-none border-t border-white/5 bg-black/40 backdrop-blur-md overflow-hidden"
            >
              <div className="w-full max-w-6xl mx-auto px-6 py-8 pb-10">
                <p 
                  className="text-amber-300 font-extrabold whitespace-pre-wrap text-center leading-relaxed"
                  style={{ fontSize: `${Math.max(20, (currentItem.memoFontSize || 12) * 1.5)}px` }}
                >
                  {currentItem.memo}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* 생성 진행 중 오버레이 */}
      <AnimatePresence>
        {isGenerating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[11000] bg-black/80 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center"
          >
            <div className="relative w-24 h-24 mb-6">
              <Loader2 className="w-full h-full text-indigo-500 animate-spin opacity-20" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Share2 className="w-10 h-10 text-indigo-400 animate-pulse" />
              </div>
            </div>
            
            <h3 className="text-xl font-black mb-2 tracking-tight">모바일 악보집 생성 중</h3>
            <p className="text-white/60 text-sm mb-6 leading-relaxed max-w-xs">
              {genProgress.msg || '잠시만 기다려 주세요...'}
            </p>
            
            {/* 프로그레스 바 */}
            <div className="w-64 h-2 bg-white/5 rounded-full overflow-hidden mb-2">
              <motion.div 
                className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                initial={{ width: 0 }}
                animate={{ width: `${genProgress.percent}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <span className="text-xs font-black text-indigo-400">
              {Math.round(genProgress.percent)}%
            </span>

            <p className="mt-8 text-xs text-white/30 italic">
              생성이 완료되면 주소가 클립보드에 자동으로 복사됩니다.
            </p>

            {/* 생성 취소/돌아가기 버튼 */}
            <button
              onClick={() => {
                setIsGenerating(false);
              }}
              className="mt-8 px-8 py-3 bg-white/10 hover:bg-red-600 hover:text-white text-white/70 rounded-xl text-xs font-bold transition-all border border-white/5 shadow-lg active:scale-95"
            >
              생성 취소하고 이전으로 돌아가기
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 생성 완료 오버레이 (alert 대신 사용) */}
      <AnimatePresence>
        {genResultUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[12000] bg-black/80 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-zinc-900 border border-white/10 rounded-[2.5rem] p-10 max-w-sm w-full shadow-2xl"
            >
              <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/20">
                <Check className="w-10 h-10 text-white" />
              </div>
              <h3 className="text-2xl font-black text-white mb-2">생성 완료!</h3>
              <p className="text-white/60 text-sm leading-relaxed mb-6">
                프리미엄 모바일 PDF가 구글 드라이브에 안전하게 저장되었습니다.<br/>
                <span className="text-emerald-400 font-bold">[{contiTitle || '콘티'}] 링크가 복사되었습니다.</span>
              </p>

              {/* 링크 주소 표시 영역 */}
              <div className="bg-black/40 border border-white/5 rounded-xl p-3 mb-8 group relative">
                <p className="text-[10px] text-white/30 uppercase tracking-widest font-black mb-1 text-left">Drive Link</p>
                <p className="text-[11px] text-emerald-400/80 font-mono break-all text-left line-clamp-2 leading-tight">
                  {genResultUrl}
                </p>
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/60 rounded-xl cursor-pointer"
                     onClick={() => {
                        const shareText = `[${contiTitle || '새 찬양 콘티'}] 악보보기 링크\n${genResultUrl}`;
                        hymnalApi.writeClipboard(shareText);
                        alert('안내문과 링크가 다시 복사되었습니다.');
                     }}>
                  <span className="text-[10px] text-white font-bold">다시 복사하기</span>
                </div>
              </div>

              {/* 로컬 직접 다운로드 지원 버튼 */}
              {genFileId && (
                <button
                  onClick={() => {
                    window.open(`https://drive.google.com/uc?export=download&id=${genFileId}`, '_blank');
                  }}
                  className="w-full mb-4 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-xs transition-all active:scale-95 shadow-lg flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  기기에 직접 다운로드
                </button>
              )}
              
              <button
                onClick={() => {
                  setGenResultUrl(null);
                  setIsGenerating(false);
                }}
                className="w-full py-4 bg-white text-black rounded-2xl font-black hover:bg-zinc-200 transition-all active:scale-95 shadow-xl"
              >
                이전 화면으로 돌아가기
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
