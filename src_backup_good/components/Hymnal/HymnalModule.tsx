import React, { useState, useEffect } from 'react';
import type { HymnalSong } from '../../types/hymnal';
import { useHymnal } from '../../stores/HymnalProvider';
import { 
  Search, 
  List, 
  ImageIcon, 
  RefreshCw, 
  Settings, 
  X, 
  Edit2, 
  Trash2, 
  ZoomIn, 
  ZoomOut,
  Music,
  FolderOpen,
  Plus,
  Layout,
  Library,
  RotateCcw,
  PlayCircle as Youtube,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  HelpCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { SavedContisModal } from './SavedContisModal';
import { hymnalApi } from '../../api/hymnalApi';
import { TooltipIcon } from '../TooltipIcon';

const DriveImage = ({ fileId, alt, className }: { fileId: string, alt?: string, className?: string }) => {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let currentBlobUrl: string | null = null;
    
    if (!fileId) {
      setSrc(null);
      return;
    }
    
    // Check if it's already a full URL or local path
    if (fileId.startsWith('http') || fileId.startsWith('/')) {
      setSrc(fileId);
      return;
    }

    setSrc(null); // 곡이 바뀌면 이전 이미지를 즉시 지워서 로딩 상태 표시

    import('../../api/gdriveWebService').then(({ gdriveWebService }) => {
      gdriveWebService.downloadImageBlob(fileId).then(blobUrl => {
        if (active && blobUrl) {
          setSrc(blobUrl);
          currentBlobUrl = blobUrl;
        } else if (blobUrl) {
          // 컴포넌트 언마운트 후 다운로드 완료된 경우 즉시 해제 (메모리 누수 방지)
          URL.revokeObjectURL(blobUrl);
        }
      });
    });
    
    return () => { 
      active = false; 
    };
  }, [fileId]);

  if (!src) return <div className="w-full h-48 flex items-center justify-center bg-slate-100 text-slate-400">로딩 중...</div>;
  
  return <img src={src} alt={alt} className={className} draggable={false} />;
};

export const HymnalModule: React.FC = () => {
    const { 
      filteredSongs, 
      searchQuery, 
      setSearchQuery, 
      selectedSongId, 
      setSelectedSongId, 
      setSongs,
      fetchSongs,
      albums,
      activeAlbumId,
      setActiveAlbumId,
      showAlbumModal,
      setShowAlbumModal,
      showBuilder,
      setShowBuilder,
      editingAlbum,
      setEditingAlbum,
      processingProgress,
      processImages,
      updateAlbum,
      addAlbum,
      updateAlbumPath,
      deleteAlbum,
      contiItems,
      addToConti,
      setIsEditorOpen,
      isLibraryOpen,
      setIsLibraryOpen,
      savedContis,
      loadSavedConti,
      deleteSavedConti,
      clearConti
    } = useHymnal();
  
    // --- 글로벌 진행 바 추가 ---
    const GlobalProgress = () => {
      if (!processingProgress) return null;
      const percent = Math.round((processingProgress.processed / (processingProgress.total || 1)) * 100);
      
      return (
        <div className="fixed bottom-6 right-6 z-[200] w-72 bg-white rounded-2xl shadow-2xl border border-red-100 p-4 animate-in slide-in-from-bottom-5 duration-300">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-black text-slate-800 uppercase tracking-widest">데이터 처리 중...</span>
            <span className="text-sm font-black text-red-500">{percent}%</span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-50">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${percent}%` }}
              className="h-full bg-red-500 rounded-full"
            />
          </div>
          <p className="text-[9px] text-slate-400 font-bold mt-2 text-center">({processingProgress.processed} / {processingProgress.total} 완료)</p>
        </div>
      );
    };

  // --- 로컬 전용 UI 상태 ---
  const [albumInput, setAlbumInput] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedLyrics, setEditedLyrics] = useState('');
  const [editedNumber, setEditedNumber] = useState(0);
  const [editedCode, setEditedCode] = useState('');
  const [editedMeter, setEditedMeter] = useState('');
  const [editedCategory, setEditedCategory] = useState('');
  const [isDeleteOriginal, setIsDeleteOriginal] = useState(false);
  const [zoomScale, setZoomScale] = useState(0.6);
  const [editedVideos, setEditedVideos] = useState<{name: string, url: string}[]>([]);
  const [activeVideoIndex, setActiveVideoIndex] = useState(0);
  const [showYoutubePlayer, setShowYoutubePlayer] = useState(false);
  const [isListOpen, setIsListOpen] = useState(true);
  const [visibleCount, setVisibleCount] = useState(50);

  // 검색어나 앨범이 변경되면 리스트 표시 개수 초기화
  useEffect(() => {
    setVisibleCount(50);
  }, [searchQuery, activeAlbumId]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const bottom = e.currentTarget.scrollHeight - e.currentTarget.scrollTop <= e.currentTarget.clientHeight + 400;
    if (bottom && visibleCount < filteredSongs.length) {
      setVisibleCount(prev => prev + 50);
    }
  };

  // 유튜브 URL 추출 헬퍼
  const getYoutubeEmbedUrl = (url?: string) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? `https://www.youtube.com/embed/${match[2]}?enablejsapi=1&origin=${window.location.origin}` : null;
  };

  const addEditedVideo = () => {
    setEditedVideos([...editedVideos, { name: '', url: '' }]);
  };
  const removeEditedVideo = (index: number) => {
    setEditedVideos(editedVideos.filter((_, i) => i !== index));
  };
  const updateEditedVideo = (index: number, field: 'name' | 'url', value: string) => {
    const newVideos = [...editedVideos];
    newVideos[index] = { ...newVideos[index], [field]: value };
    setEditedVideos(newVideos);
  };

  const selectedSong = filteredSongs.find(s => s.id === selectedSongId) as HymnalSong | undefined;
  const activeAlbum = albums.find(a => a.id === activeAlbumId);

  const handleAddCurrentToConti = () => {
    if (selectedSongId) {
      addToConti(selectedSongId);
    }
  };

  // 초기 설정
  useEffect(() => {
    if (editingAlbum) {
      setAlbumInput(editingAlbum.name);
    } else {
      setAlbumInput('');
    }
  }, [editingAlbum, showAlbumModal]);

  // 유튜브 플레이어 상태에 따른 창 크기 자동 조절
  useEffect(() => {
    console.log('[HymnalModule] showYoutubePlayer changed:', showYoutubePlayer);
    if (showYoutubePlayer) {
      // 유튜브 열릴 때 가로 확장 (1200 -> 1800)
      console.log('[HymnalModule] Requesting window expand (1800x960)');
      hymnalApi.resizeWindow(1800, 960);
    } else {
      // 유튜브 닫힐 때 원래 크기로 복구
      console.log('[HymnalModule] Requesting window shrink (1200x800)');
      hymnalApi.resizeWindow(1200, 800);
    }
  }, [showYoutubePlayer]);

  // 곡 변경 시 줌 초기화 (60%를 기본값으로)
  useEffect(() => {
    setZoomScale(0.6);
    setIsEditing(false);
    setIsDeleteOriginal(false); // 삭제 옵션 초기화
    setShowYoutubePlayer(false); // 곡 변경 시 플레이어 닫기
    setActiveVideoIndex(0); // 첫 번째 영상으로 초기화
  }, [selectedSongId]);

  // --- 편집 모드 핸들러 ---
  const handleUpdateSong = async () => {
    if (!selectedSongId) return;
    
    if (!confirm('수정된 정보를 저장하시겠습니까?')) return;
    
    // 1. 낙관적 UI 업데이트 (즉시 화면에 반영)
    const updatedData = {
      title: editedTitle,
      lyrics: editedLyrics,
      number: editedNumber,
      code: editedCode,
      meter: editedMeter,
      category: editedCategory,
      youtubeVideos: editedVideos
    };

    setSongs(prev => prev.map(s => s.id === selectedSongId ? { ...s, ...updatedData } : s));
    setIsEditing(false);

    // 2. 백그라운드에서 조용히 API 수정 진행
    hymnalApi.updateSong({ id: selectedSongId, ...updatedData }).then(result => {
      if (!result.success) {
        console.error('[HymnalModule] 백그라운드 수정 실패:', result.error);
      }
    });
  };

  const startEditing = () => {
    if (selectedSong) {
      setEditedTitle(selectedSong.title);
      setEditedLyrics(selectedSong.lyrics);
      setEditedNumber(selectedSong.number);
      setEditedCode(selectedSong.code || '');
      setEditedMeter(selectedSong.meter || '');
      setEditedCategory(selectedSong.category || '');
      setEditedVideos(selectedSong.youtubeVideos || []);
      setIsEditing(true);
      setIsDeleteOriginal(false);
    }
  };

  const handleDeleteSong = async () => {
    if (!selectedSongId) return;
    
    const warningMsg = '정말로 이 악보를 삭제하시겠습니까? PC 원본 파일 및 구글 드라이브 파일도 함께 삭제됩니다.';
      
    if (!confirm(warningMsg)) return;

    // 1. 낙관적 UI 업데이트 (즉시 화면에서 제거)
    const targetFileId = selectedSong?.fileId;
    const targetSongId = selectedSongId;
    
    setSongs(prev => prev.filter(s => s.id !== targetSongId));
    setSelectedSongId(null);
    setIsEditing(false);

    // 2. 백그라운드에서 조용히 API 삭제 진행
    hymnalApi.deleteSong(targetSongId, true, targetFileId).then(result => {
      if (!result.success) {
        console.error('[HymnalModule] 백그라운드 삭제 실패:', result.error);
        // 필요하다면 실패 시 alert 띄우고 fetchSongs()로 롤백 가능
      }
    });
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-white">
      {/* 2단: 검색 및 곡 목록 (Middle Column) */}
      <AnimatePresence>
        {isListOpen && (
          <motion.div 
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "fit-content", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="border-r border-slate-100 flex flex-col bg-slate-50/30 shrink-0 overflow-hidden relative"
          >
            <div className="w-[22vw] min-w-[260px] max-w-[320px] flex flex-col h-full">
              <div className="p-6 pb-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                     <div className="w-8 h-8 rounded-lg bg-red-500 flex items-center justify-center shadow-lg shadow-red-200">
                       <Music className="w-4 h-4 text-white" />
                     </div>
                     <h2 className="text-xl font-black text-slate-800 tracking-tight truncate">
                       {activeAlbumId === 'all' ? '전체 찬양' : activeAlbum?.name}
                     </h2>
                  </div>
                </div>

                {/* New Conti Control Bar (Above Search) */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <button 
                    onClick={() => setIsLibraryOpen(true)}
                    className="relative flex flex-col items-center justify-center p-3 bg-white border border-slate-200 rounded-2xl hover:border-indigo-400 hover:bg-indigo-50 transition-all group shadow-sm"
                    title="저장된 콘티 저장소 열기"
                  >
                    <Library className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 mb-1" />
                    <span className="text-[10px] font-black text-slate-500 group-hover:text-indigo-600 uppercase tracking-tighter">저장소</span>
                    <TooltipIcon text="저장된 콘티를 불러옵니다." position="top-right" />
                  </button>
                  <button 
                    onClick={() => setIsEditorOpen(true)}
                    className="relative flex flex-col items-center justify-center p-3 bg-indigo-50 border border-indigo-100 rounded-2xl hover:bg-indigo-600 transition-all group shadow-sm"
                    title="콘티 편집기 열기"
                  >
                    <div className="relative">
                      <Layout className="w-5 h-5 text-indigo-600 group-hover:text-white mb-1" />
                      {contiItems.length > 0 && (
                        <span className="absolute -top-2 -right-2 w-4 h-4 bg-red-500 text-white text-[8px] flex items-center justify-center rounded-full border border-white font-black animate-pulse">
                          {contiItems.length}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-black text-indigo-600 group-hover:text-white uppercase tracking-tighter text-center leading-tight mt-1">콘티<br/>에디터</span>
                    <TooltipIcon text="악보 이미지 상단의 [+콘티담기] 버튼을 눌러 콘티에 추가합니다." position="top-right" />
                  </button>
                  <button 
                    onClick={clearConti}
                    className="flex flex-col items-center justify-center p-3 bg-white border border-slate-200 rounded-2xl hover:border-red-400 hover:bg-red-50 transition-all group shadow-sm"
                    title="현재 선택한 모든 곡 취약"
                  >
                    <RotateCcw className="w-5 h-5 text-slate-400 group-hover:text-red-500 mb-1" />
                    <span className="text-[10px] font-black text-slate-500 group-hover:text-red-500 uppercase tracking-tighter">선택취소</span>
                  </button>
                </div>
                
                
                <div className="relative group">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-red-500 transition-colors" />
                  <input 
                    type="text"
                    placeholder="제목, 가사, 번호 검색..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-black focus:outline-none focus:ring-4 focus:ring-red-500/10 focus:border-red-500 transition-all shadow-sm text-slate-900"
                  />
                </div>
              </div>

              <div 
                className="flex-1 overflow-y-auto custom-scrollbar px-3 pb-6"
                onScroll={handleScroll}
              >
                {filteredSongs.length > 0 ? (
                  <div className="space-y-1.5">
                    <div className="px-3 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">곡 리스트</p>
                        <TooltipIcon text="악보이미지를 처음 볼때와 캐쉬를 삭제한 후, 약간의 로딩시간이 있습니다. 다음부터는 속도가 빨라집니다." />
                      </div>
                      <span className="text-[10px] bg-white border border-slate-200 px-1.5 py-0.5 rounded-full text-slate-400 font-bold">{filteredSongs.length}</span>
                    </div>
                    {filteredSongs.slice(0, visibleCount).map((song) => (
                      <button
                        key={song.id}
                        onClick={() => setSelectedSongId(song.id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all group ${
                          selectedSongId === song.id 
                            ? 'bg-white text-red-600 shadow-xl ring-1 ring-red-100' 
                            : 'hover:bg-white hover:shadow-md text-slate-600'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs transition-colors shrink-0 ${
                          selectedSongId === song.id ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-red-50 group-hover:text-red-400'
                        }`}>
                          {song.number}
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold truncate leading-tight">{song.title}</p>
                            {song.category && (
                              <span className="text-[8px] px-1.5 py-0.5 bg-slate-50 text-slate-400 rounded-md font-black border border-slate-100 shrink-0">
                                {song.category}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">{song.lyrics}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="py-20 text-center">
                     <List className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                     <p className="text-sm text-slate-300 font-bold italic">검색 결과가 없습니다.</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3단: 악보 뷰어 영역 (Main Content) */}
      <div className="flex-1 flex flex-col relative bg-white overflow-hidden">
        {/* List Toggle Button */}
        <button 
          onClick={() => setIsListOpen(!isListOpen)}
          className="absolute left-0 top-1/2 -translate-y-1/2 w-6 h-20 bg-white border border-l-0 border-slate-200 rounded-r-xl shadow-md z-30 flex items-center justify-center text-slate-400 hover:text-red-500 transition-all hover:bg-slate-50 group"
          title={isListOpen ? "곡 목록 접기" : "곡 목록 펴기"}
        >
          {isListOpen ? <ChevronLeftIcon className="w-4 h-4" /> : <ChevronRightIcon className="w-4 h-4" />}
        </button>

        <AnimatePresence mode="wait">
          {!selectedSongId ? (
            <motion.div 
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center text-slate-300"
            >
              <div className="w-24 h-24 bg-slate-50 rounded-[2.5rem] border border-slate-100 shadow-2xl flex items-center justify-center mb-8">
                <ImageIcon className="w-10 h-10 text-slate-200" />
              </div>
              <h3 className="text-xl font-black text-slate-800 mb-2 tracking-tight">악보 뷰어</h3>
              <p className="text-sm font-bold text-slate-400">목록에서 곡을 선택하여 악보를 확인하세요.</p>
            </motion.div>
          ) : (
            <motion.div 
              key="content"
              className="h-full w-full flex flex-col"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
            >
              {/* Viewer Header */}
              <div className="p-8 pb-4 border-b border-slate-50 flex items-start justify-between bg-white z-10">
                <div className="flex-1">
                  {isEditing ? (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-4 w-full">
                      {/* 1행: 번호 + 제목 */}
                      <div className="flex gap-2">
                        <input 
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={editedNumber.toString()}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9]/g, '');
                            setEditedNumber(val ? parseInt(val, 10) : 0);
                          }}
                          className="w-20 h-11 px-3 py-3 bg-white border border-slate-300 rounded-2xl text-sm font-black focus:outline-none focus:ring-4 focus:ring-red-500/10 focus:border-red-500 text-slate-950 shadow-sm shrink-0 text-center"
                          placeholder="번호"
                        />
                        <input 
                          type="text"
                          value={editedTitle}
                          onChange={(e) => setEditedTitle(e.target.value)}
                          className="flex-1 h-11 px-4 py-3 bg-white border border-slate-300 rounded-2xl text-sm font-black focus:outline-none focus:ring-4 focus:ring-red-500/10 focus:border-red-500 text-slate-950 shadow-sm"
                          placeholder="곡 제목"
                        />
                      </div>
                      
                      {/* 2행: 분류 + 코드 + 박자 | 취소 + 저장 + 삭제옵션 (모두 고정높이 h-11) */}
                      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                        <input 
                          type="text"
                          value={editedCategory}
                          onChange={(e) => setEditedCategory(e.target.value)}
                          className="w-32 h-11 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-black text-slate-900 shadow-sm shrink-0"
                          placeholder="분류 (태그)"
                        />
                        <input 
                          type="text"
                          value={editedCode}
                          onChange={(e) => setEditedCode(e.target.value)}
                          className="w-20 h-11 px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-black text-slate-900 shadow-sm uppercase shrink-0 text-center"
                          placeholder="코드"
                        />
                        <input 
                          type="text"
                          value={editedMeter}
                          onChange={(e) => setEditedMeter(e.target.value)}
                          className="w-20 h-11 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-black text-slate-900 shadow-sm shrink-0 text-center"
                          placeholder="박자"
                        />
                        
                        <div className="flex items-center gap-2 ml-1">
                          <button 
                            onClick={() => setIsEditing(false)}
                            className="h-11 px-5 bg-slate-100 text-slate-500 rounded-xl text-xs font-black hover:bg-slate-200 transition-all shrink-0"
                          >
                            취소
                          </button>
                          <button 
                            onClick={handleUpdateSong}
                            className="h-11 px-6 bg-red-600 text-white rounded-xl text-xs font-black shadow-lg shadow-red-200 hover:bg-red-700 transition-all shrink-0"
                          >
                            저장 완료
                          </button>
                        </div>

                        <div className="flex-1 flex items-center justify-end gap-4 min-w-fit border-l border-slate-100 pl-4 ml-2">
                           <button 
                             onClick={handleDeleteSong}
                             className="h-11 px-4 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl transition-all flex items-center gap-2 font-black text-xs shrink-0"
                           >
                             <Trash2 className="w-4 h-4" />
                             <span>악보 삭제</span>
                           </button>
                        </div>
                      </div>

                      {/* 3행: 유튜브 영상 리스트 영역 (독립 배치) */}
                      <div className="bg-slate-50/50 p-3 rounded-2xl border border-dashed border-slate-200">
                        <div className="flex items-center justify-between mb-3 px-1">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <Youtube className="w-3.5 h-3.5" />
                            영상 리스트
                          </p>
                          <button 
                            onClick={addEditedVideo}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:border-red-300 hover:text-red-500 text-slate-500 rounded-lg text-[10px] font-black transition-all shadow-sm"
                          >
                            <Plus className="w-3 h-3" />
                            영상 추가
                          </button>
                        </div>
                        
                        <div className="flex flex-col gap-2">
                           {editedVideos.map((video, idx) => (
                             <div key={idx} className="flex gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                               <input 
                                 type="text"
                                 value={video.name}
                                 onChange={(e) => updateEditedVideo(idx, 'name', e.target.value)}
                                 className="w-32 h-10 px-3 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black text-slate-900 shadow-sm"
                                 placeholder="이름 (예: 라이브)"
                               />
                               <input 
                                 type="text"
                                 value={video.url}
                                 onChange={(e) => updateEditedVideo(idx, 'url', e.target.value)}
                                 className="flex-1 h-10 px-3 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black text-slate-900 shadow-sm"
                                 placeholder="유튜브 URL"
                               />
                               <button 
                                 onClick={() => removeEditedVideo(idx)}
                                 className="h-10 w-10 flex items-center justify-center hover:bg-red-50 text-red-300 hover:text-red-500 rounded-xl transition-colors shrink-0"
                               >
                                 <Trash2 className="w-4 h-4" />
                                </button>
                             </div>
                           ))}
                           {editedVideos.length === 0 && (
                             <p className="text-[10px] text-slate-300 text-center py-2 font-bold italic">연결된 영상이 없습니다.</p>
                           )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-6">
                        <h2 className="text-3xl font-black text-slate-900 tracking-tighter shrink-0">
                          {selectedSong?.number}. {selectedSong?.title}
                        </h2>
                        
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={handleAddCurrentToConti}
                            className="px-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-xl text-xs font-black transition-all flex items-center gap-2 border border-indigo-100 shadow-sm"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            콘티 담기
                          </button>
                          <button 
                            onClick={startEditing}
                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-black transition-all flex items-center gap-2"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            상세 편집
                          </button>
                          {selectedSong?.youtubeVideos && selectedSong.youtubeVideos.length > 0 && (
                            <button 
                              onClick={() => setShowYoutubePlayer(!showYoutubePlayer)}
                              className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 border shadow-sm ${
                                showYoutubePlayer 
                                  ? 'bg-red-600 text-white border-red-600 shadow-red-100' 
                                  : 'bg-white text-red-600 border-red-100 hover:bg-red-50'
                              }`}
                            >
                              <Youtube className="w-4 h-4" />
                              {showYoutubePlayer ? '영상 닫기' : `영상 보기 (${selectedSong.youtubeVideos.length})`}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex gap-1.5">
                          {selectedSong?.meter && <span className="px-2 py-0.5 bg-green-50 text-green-600 rounded-lg text-[10px] font-black border border-green-100">{selectedSong.meter}</span>}
                          {selectedSong?.code && <span className="px-2 py-0.5 bg-red-50 text-red-600 rounded-lg text-[10px] font-black border border-red-100">{selectedSong.code} KEY</span>}
                          {selectedSong?.category && <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black border border-blue-100">{selectedSong.category}</span>}
                        </div>
                        <p className="text-xs font-bold text-slate-400 flex items-center gap-1.5 pl-0.5">
                          <FolderOpen className="w-3 h-3" />
                          {albums.find(a => selectedSong?.id.startsWith(`${a.id}-`))?.name || '앨범 미지정'}
                          {selectedSong?.isManual && <span className="ml-2 text-red-500">[수동 수정됨]</span>}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Viewer Main Body */}
              <div className="flex-1 flex overflow-hidden bg-slate-50/50">
                <div className="flex-1 overflow-auto p-8 custom-scrollbar relative min-w-[600px]">
                  {isEditing && (
                  <div className="mb-8 max-w-4xl mx-auto">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 pl-1">가사 편집</p>
                    <textarea 
                      value={editedLyrics}
                      onChange={(e) => setEditedLyrics(e.target.value)}
                      className="w-full h-40 px-6 py-4 bg-white border border-slate-300 rounded-[2rem] text-sm leading-loose focus:outline-none focus:ring-4 focus:ring-red-500/10 text-slate-950 font-black shadow-md"
                      placeholder="가사를 입력해 주세요..."
                    />
                  </div>
                )}
                
                <div 
                  className="bg-white shadow-2xl rounded-2xl mx-auto overflow-hidden transform-gpu origin-top"
                  style={{ 
                    width: `${850 * zoomScale}px`,
                    height: 'fit-content',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.08)'
                  }}
                >
                    <DriveImage 
                      fileId={selectedSong?.fileId || selectedSong?.filePath || ''} 
                      alt={selectedSong?.title}
                      className="w-full h-auto block" 
                    />
                  </div>
                </div>

                {/* Youtube Player Side Panel */}
                <AnimatePresence>
                  {showYoutubePlayer && selectedSong?.youtubeVideos && selectedSong.youtubeVideos.length > 0 && (
                    <motion.div 
                      key="youtube-player"
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: "55vw", minWidth: "125px", opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      className="h-full bg-white border-l border-slate-100 flex flex-col shadow-2xl relative z-30 shrink"
                    >
                      <div className="w-full min-w-[125px] max-w-[900px] flex flex-col h-full overflow-hidden">
                        <div className="p-4 border-b border-slate-50 flex items-center justify-between bg-white shrink-0">
                          <div className="flex items-center gap-2">
                             <Youtube className="w-5 h-5 text-red-600" />
                             <span className="text-xs font-black text-slate-800">찬양 영상 라이브러리</span>
                          </div>
                          <button onClick={() => setShowYoutubePlayer(false)} className="p-1 hover:bg-slate-100 rounded-lg"><X className="w-4 h-4 text-slate-400" /></button>
                        </div>

                        {/* Video Playlist */}
                        <div className="p-3 bg-slate-50 flex flex-col gap-1.5 overflow-y-auto max-h-[30%] custom-scrollbar min-h-[100px] shrink-0">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 mb-1">영상 선택</p>
                          {selectedSong.youtubeVideos.map((video, idx) => (
                            <button 
                              key={idx}
                              onClick={() => setActiveVideoIndex(idx)}
                              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all border ${
                                activeVideoIndex === idx 
                                  ? 'bg-red-500 text-white border-red-400 shadow-md' 
                                  : 'bg-white text-slate-600 border-slate-100 hover:border-red-200'
                              }`}
                            >
                              <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                                activeVideoIndex === idx ? 'bg-white/20' : 'bg-slate-100 text-slate-400'
                              }`}>
                                <span className="text-[10px] font-black">{idx + 1}</span>
                              </div>
                              <span className="text-xs font-bold truncate flex-1 text-left">{video.name || `영상 ${idx + 1}`}</span>
                            </button>
                          ))}
                        </div>

                        {/* Player Container - No longer flex-1 to remove blue gaps */}
                        <div className="bg-slate-950 flex items-center justify-center overflow-hidden w-full aspect-video shrink-0">
                          {selectedSong.youtubeVideos[activeVideoIndex]?.url && getYoutubeEmbedUrl(selectedSong.youtubeVideos[activeVideoIndex].url) ? (
                            <iframe 
                              key={selectedSong.youtubeVideos[activeVideoIndex].url}
                              width="100%" 
                              height="100%" 
                              src={`${getYoutubeEmbedUrl(selectedSong.youtubeVideos[activeVideoIndex].url)}&autoplay=1`}
                              title="YouTube video player" 
                              frameBorder="0" 
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                              allowFullScreen
                              className="aspect-video"
                            ></iframe>
                          ) : (
                            <div className="text-center p-10">
                              <p className="text-sm font-bold text-slate-500">올바른 유튜브 링크가 아닙니다.</p>
                            </div>
                          )}
                        </div>
                        
                        <div className="p-4 bg-slate-50 border-t border-slate-100 flex-1">
                           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">현재 재생 중</p>
                           <p className="text-xs font-bold text-slate-700 truncate">{selectedSong.youtubeVideos[activeVideoIndex]?.name || selectedSong.title}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Floating Zoom Controls - Positioned relative to the score area */}
                <div 
                  className="absolute bottom-10 left-1/2 z-20 transition-all duration-300"
                  style={{ 
                    transform: `translateX(calc(-50% - ${
                      (showYoutubePlayer && selectedSong?.youtubeVideos?.length ? 27.5 : 0) // Youtube width in vw/2 logic
                      + (isListOpen ? 0 : 0) // Mid list logic
                    }vw${
                      (showYoutubePlayer && selectedSong?.youtubeVideos?.length ? ' - 0px' : '')
                    }))` 
                  }}
                >
                  <div className="flex items-center bg-white/90 text-slate-700 rounded-full shadow-xl p-1.5 gap-1 backdrop-blur-md border border-slate-200">
                    <button 
                      onClick={() => setZoomScale(Math.max(zoomScale - 0.2, 0.4))}
                      className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                    >
                      <ZoomOut className="w-4 h-4" />
                    </button>
                    <div className="px-3 min-w-[50px] text-center border-x border-slate-100">
                      <span className="text-xs font-black">{Math.round(zoomScale * 100)}%</span>
                    </div>
                    <button 
                      onClick={() => setZoomScale(Math.min(zoomScale + 0.2, 3))}
                      className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                    >
                      <ZoomIn className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => setZoomScale(0.6)}
                      className="ml-1 px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-full text-[10px] font-black transition-all active:scale-95"
                    >
                      &lt;기본&gt;
                    </button>
                  </div>
                </div>
              </div>

              {/* Old Floating Zoom Controls 위치 (삭제됨) */}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* --- Modals (Provider 상태 사용) --- */}
      
      {/* 앨범 설정 모달 */}
      <AnimatePresence>
        {showAlbumModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowAlbumModal(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-8 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-2xl font-black text-slate-800 tracking-tight">
                  {editingAlbum ? '앨범 설정 수정' : '새 데이터 앨범 추가'}
                </h3>
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block pl-1">앨범 이름</label>
                  <input 
                    type="text" 
                    value={albumInput}
                    onChange={(e) => setAlbumInput(e.target.value)}
                    className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl font-black text-slate-900 focus:outline-none focus:ring-4 focus:ring-red-500/10 focus:border-red-500 shadow-sm"
                    placeholder="예: CCM 베스트 2024"
                  />
                </div>


                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={async () => {
                      if (editingAlbum) {
                        const oldName = editingAlbum.name;
                        updateAlbum({ ...editingAlbum, name: albumInput });
                        // Google Drive 폴더 이름 변경 로직 호출 (옵션)
                        const { gdriveWebService } = await import('../../api/gdriveWebService');
                        try {
                          await gdriveWebService.renameFolder(`CEUM_Album_${oldName}`, `CEUM_Album_${albumInput}`);
                        } catch(e) { console.log('Folder rename skipped or failed', e); }
                      } else {
                        addAlbum(albumInput);
                      }
                      setShowAlbumModal(false);
                    }}
                    className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black shadow-xl shadow-red-200 hover:bg-red-700 transition-all active:scale-95"
                  >
                    {editingAlbum ? '설정 저장' : '앨범 생성'}
                  </button>
                  {editingAlbum && (
                    <button 
                      onClick={() => {
                        if (confirm('<주의!> 구글드라이브의 해당 폴더와 파일이 삭제 되어 복구되지 않습니다.\n정말로 삭제하시겠습니까?')) {
                          deleteAlbum(editingAlbum.id);
                          setShowAlbumModal(false);
                        }
                      }}
                      className="p-4 bg-slate-100 text-red-500 rounded-2xl hover:bg-red-50 transition-all"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 데이터 빌더 모달 */}
      <AnimatePresence>
        {showBuilder && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => !processingProgress && setShowBuilder(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
            />
            <motion.div 
              initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 50, opacity: 0 }}
              className="relative w-full max-w-lg bg-white rounded-[3rem] shadow-2xl p-10"
            >
              <div className="flex items-center justify-between mb-10">
                <div className="space-y-1">
                  <h3 className="text-3xl font-black text-slate-900 tracking-tighter">데이터 빌더 시스템</h3>
                  <p className="text-sm font-bold text-slate-400 italic">
                    이미지 파일을 분석하여 데이터를 자동 생성합니다.<br/>
                    <span className="text-red-400/80">(PC의 폴더의 악보 목록을 가져옵니다)</span>
                  </p>
                </div>
                {!processingProgress && (
                  <button onClick={() => setShowBuilder(false)} className="p-3 hover:bg-slate-100 rounded-full transition-colors">
                    <X className="w-6 h-6 text-slate-300" />
                  </button>
                )}
              </div>

              <div className="space-y-8">
                <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 block pl-1">분석 및 빌드 대상 앨범</label>
                  <div className="grid grid-cols-2 gap-3">
                    {albums.map(a => (
                      <button 
                        key={a.id}
                        onClick={() => setActiveAlbumId(a.id)}
                        className={`p-4 rounded-2xl text-xs font-black transition-all border ${
                          activeAlbumId === a.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-500 hover:border-red-200'
                        }`}
                      >
                        {a.name}
                      </button>
                    ))}
                    {/* 새 앨범 추가 버튼 */}
                    <button 
                      onClick={() => {
                        setEditingAlbum(null);
                        setAlbumInput('');
                        setShowAlbumModal(true);
                      }}
                      className="p-4 rounded-2xl text-xs font-black transition-all border border-dashed border-slate-300 text-slate-400 hover:border-red-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      앨범 추가
                    </button>
                  </div>
                </div>

                {activeAlbumId !== 'all' && activeAlbum && (
                  <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                    <div className="flex items-center gap-4 p-5 bg-red-50 rounded-2xl border border-red-100">
                      <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                        <FolderOpen className="w-6 h-6 text-red-500" />
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <p className="text-[10px] font-black text-red-400 uppercase">연결된 폴더</p>
                        <p className="text-xs font-black text-slate-800 truncate">{activeAlbum.path || '경로가 없습니다. 폴더 선택 버튼을 눌러주세요.'}</p>
                      </div>
                      <button 
                        onClick={() => updateAlbumPath(activeAlbumId)}
                        className="px-4 py-2 bg-white text-red-600 rounded-xl text-[10px] font-black border border-red-200 shadow-sm"
                      >
                         폴더 변경
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <button 
                        onClick={() => processImages(activeAlbumId, true)}
                        disabled={!activeAlbum.path || !!processingProgress}
                        className="py-6 bg-red-500 text-white rounded-[2rem] font-black shadow-xl shadow-red-100 hover:bg-red-600 transition-all active:scale-95 disabled:opacity-50 flex flex-col items-center gap-2"
                      >
                        <Plus className="w-6 h-6" />
                        <span>새곡 추가 빌드</span>
                      </button>
                      <button 
                        onClick={() => processImages(activeAlbumId, false)}
                        disabled={!activeAlbum.path || !!processingProgress}
                        className="py-6 bg-slate-100 text-slate-600 rounded-[2rem] font-black hover:bg-slate-200 transition-all active:scale-95 disabled:opacity-50 flex flex-col items-center gap-2"
                      >
                        <RefreshCw className="w-6 h-6" />
                        <span>전체 다시 빌드</span>
                      </button>
                    </div>
                  </div>
                )}

                {processingProgress && (
                  <div className="space-y-5 py-4 animate-in zoom-in-95 duration-300">
                    <div className="flex justify-between items-end">
                      <span className="text-sm font-black text-slate-900">데이터 처리 중...</span>
                      <span className="text-2xl font-black text-red-500">{Math.round((processingProgress.processed / processingProgress.total) * 100)}%</span>
                    </div>
                    <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden p-1 shadow-inner border border-slate-200">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${(processingProgress.processed / processingProgress.total) * 100}%` }}
                        className="h-full bg-gradient-to-r from-red-500 to-red-400 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.5)]"
                      />
                    </div>
                    <p className="text-xs text-slate-400 text-center font-bold">({processingProgress.processed} / {processingProgress.total} 곡 분석 완료)</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <GlobalProgress />

      <SavedContisModal 
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        savedContis={savedContis}
        onLoad={loadSavedConti}
        onDelete={deleteSavedConti}
      />
    </div>
  );
};
