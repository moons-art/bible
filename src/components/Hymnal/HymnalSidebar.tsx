import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useHymnal } from '../../stores/HymnalProvider';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Music, 
  UploadCloud,
  FilePlus,
  FolderUp,
  Settings,
  HelpCircle,
  FolderPlus,
  Trash2
} from 'lucide-react';
import { hymnalApi } from '../../api/hymnalApi';
import { logActivity } from '../../utils/logger';
import { TooltipIcon } from '../TooltipIcon';

export const HymnalSidebar: React.FC = () => {
  const [uploadProgress, setUploadProgress] = useState<{ processed: number; total: number } | null>(null);
  const [albumNameInput, setAlbumNameInput] = useState('');
  const { 
    albums,
    setAlbums,
    songs,
    setSongs,
    activeAlbumId, 
    setActiveAlbumId,
    editingAlbum,
    setEditingAlbum,
    showAlbumModal,
    setShowAlbumModal,
    isSyncing,
    setIsSyncing,
    fetchSongs,
    deleteAlbum,
    updateAlbum
  } = useHymnal();

  useEffect(() => {
    if (editingAlbum) {
      setAlbumNameInput(editingAlbum.name);
    }
  }, [editingAlbum]);

  const isAuthenticated = !!localStorage.getItem('gdrive_token');

  // 대량 앨범 업로드 처리
  const handleAlbumUpload = async (isHymnal: boolean = false, targetAlbum?: Album) => {
    if (!isAuthenticated) {
      alert('악보를 추가하려면 구글 계정으로 로그인해야 합니다. 왼쪽 사이드바 상단에서 로그인해 주세요.');
      return;
    }
    try {
      const files = await hymnalApi.selectFolderForAlbum();
      if (!files || files.length === 0) return;
      
      const albumName = targetAlbum ? targetAlbum.name : (isHymnal ? '새찬송가' : prompt('업로드할 앨범 이름을 입력해주세요:', '새 앨범'));
      if (!albumName) return;

      const albumId = targetAlbum ? targetAlbum.id : (isHymnal ? 'hymnal' : albumName);

      // 1. 이미 해당 앨범에 등록된 곡들의 파일명(타이틀) Set 생성
      const targetAlbumSongs = songs.filter(s => s.albumId === albumId);
      const existingTitles = new Set(targetAlbumSongs.map(s => s.title));

      // 2. 선택한 폴더 내 파일 중 이미 등록된 파일명을 가진 파일 제외 (중복 건너뛰기)
      const filesToUpload = files.filter(file => {
        const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(file.name);
        if (!isImage) return false;
        const fileName = file.name.replace(/\.[^/.]+$/, "");
        return !existingTitles.has(fileName);
      });

      if (filesToUpload.length === 0) {
        alert('선택한 폴더의 모든 악보가 이미 앨범에 등록되어 있어 업로드를 건너뜁니다.');
        return;
      }

      setIsSyncing(true);
      // 신규 추가된 파일들만 선별하여 구글 드라이브 업로드 수행 (데이터베이스 json 수정 안함)
      const newSongs = await hymnalApi.batchUploadImagesToGDrive(filesToUpload, albumName, (processed, total) => {
        setUploadProgress({ processed, total });
      });

      // 3. 앨범 목록 업데이트
      if (!albums.find(a => a.id === albumId)) {
        const newAlbums = [...albums, { id: albumId, name: albumName }];
        setAlbums(newAlbums);
        const { gdriveWebService } = await import('../../api/gdriveWebService');
        await gdriveWebService.uploadJsonFile('settings.json', { albums: newAlbums });
      }

      // 4. 즉각적인 UI 반영 (구글 드라이브 검색 색인 지연 우회)
      if (newSongs && newSongs.length > 0) {
        setSongs(prev => {
          const existingIds = new Set(prev.map(s => s.id));
          const uniqueNewSongs = newSongs.filter(s => !existingIds.has(s.id));
          return [...prev, ...uniqueNewSongs];
        });
      }

      alert(`${filesToUpload.length}개의 신규 악보 업로드가 완료되었습니다! (중복된 ${files.length - filesToUpload.length}개 파일 건너뜀)`);
      logActivity('앨범 추가', `새 앨범 업로드: ${filesToUpload.length}곡`);
      
      // 5. 노래 목록을 실시간 드라이브 파일 스캔을 통해 완전 리로드 (지연 실행)
      setTimeout(() => fetchSongs(), 3000);
    } catch (e: any) {
      console.error(e);
      alert(`업로드 중 오류가 발생했습니다: ${e?.message || e}`);
    } finally {
      setIsSyncing(false);
      setUploadProgress(null);
    }
  };

  // 낱개 파일 추가 처리
  const handleSingleFileUpload = async () => {
    if (!isAuthenticated) {
      alert('악보를 추가하려면 구글 계정으로 로그인해야 합니다. 왼쪽 사이드바 상단에서 로그인해 주세요.');
      return;
    }
    try {
      const files = await hymnalApi.selectMultipleFiles();
      if (!files || files.length === 0) return;

      // 1. 이미 등록된 곡(기타앨범) 목록을 대조하여 중복 업로드 필터링
      const miscSongs = songs.filter(s => s.albumId === 'misc');
      const existingTitles = new Set(miscSongs.map(s => s.title));

      const filesToUpload = files.filter(file => {
        const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(file.name);
        if (!isImage) return false;
        const fileName = file.name.replace(/\.[^/.]+$/, "");
        return !existingTitles.has(fileName);
      });

      if (filesToUpload.length === 0) {
        alert('선택한 모든 파일이 이미 기타앨범에 등록되어 있어 업로드를 건너뜁니다.');
        return;
      }

      setIsSyncing(true);
      
      // 2. 신규 악보만 구글 드라이브에 업로드 (CEUM_ccm_data 폴더에 저장됨)
      const newSongs = await hymnalApi.uploadSingleImagesToGDrive(filesToUpload, (processed, total) => {
        // progress callback
      });

      // 3. 앨범 목록 연동 (기타앨범 카테고리 1회 활성화)
      if (!albums.find(a => a.id === 'misc')) {
        const newAlbums = [...albums, { id: 'misc', name: '기타앨범' }];
        setAlbums(newAlbums);
        const { gdriveWebService } = await import('../../api/gdriveWebService');
        await gdriveWebService.uploadJsonFile('settings.json', { albums: newAlbums });
      }

      // 4. 즉각적인 UI 반영 (구글 드라이브 검색 색인 지연 시간 우회)
      if (newSongs && newSongs.length > 0) {
        setSongs(prev => {
          const existingIds = new Set(prev.map(s => s.id));
          const uniqueNewSongs = newSongs.filter(s => !existingIds.has(s.id));
          return [...prev, ...uniqueNewSongs];
        });
      }

      alert(`${filesToUpload.length}개의 신규 파일 업로드가 완료되었습니다! (중복 ${files.length - filesToUpload.length}개 건너뜀)`);
      logActivity('악보 추가', `기타앨범 낱개 악보 추가: ${filesToUpload.length}곡`);
      
      // 5. 완벽한 백그라운드 동기화는 약간의 지연 후 실행
      setTimeout(() => fetchSongs(), 3000);
    } catch (e: any) {
      console.error(e);
      alert(`업로드 중 오류가 발생했습니다: ${e?.message || e}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* 앨범 목록 섹션 */}
      <div>
        <div className="mb-2 px-2 space-y-1">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">앨범 목록</h2>
        </div>
        
        <div className="space-y-2">
          <button 
            onClick={() => setActiveAlbumId('all')}
            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
              activeAlbumId === 'all' 
                ? 'bg-slate-800 text-white shadow-lg border border-slate-800' 
                : 'bg-white border border-slate-200 shadow-sm hover:border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Music className="w-4 h-4 shrink-0" />
            <span className="text-sm font-bold flex-1 text-left truncate">전체곡 모음</span>
          </button>

          {albums.map((album) => (
            <div 
              key={album.id}
              onClick={() => setActiveAlbumId(album.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer ${
                activeAlbumId === album.id 
                  ? 'bg-red-500 text-white shadow-lg shadow-red-100 border border-red-500' 
                  : 'bg-white border border-slate-200 shadow-sm hover:border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className={`w-2 h-2 rounded-full shrink-0 ${activeAlbumId === album.id ? 'bg-white' : 'bg-red-400'}`} />
              <span className="text-sm font-bold flex-1 text-left truncate">{album.id === 'misc' ? '기타앨범' : album.name}</span>
              {activeAlbumId === album.id && album.id !== 'hymnal' && album.id !== 'misc' && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingAlbum(album);
                    setShowAlbumModal(true);
                  }}
                  className="p-1.5 hover:bg-red-400 rounded-lg text-white transition-all shrink-0"
                >
                  <Settings className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 업로드 도구 섹션 */}
      <div className="space-y-6">
        {/* 가이드 문구 */}
        <div className="space-y-1.5 p-3 bg-slate-50 border border-slate-100 rounded-xl">
          <div className="flex items-center text-[11px] font-bold text-slate-600">
            + 악보 삭제
            <TooltipIcon text="우측 악보 화면에서 상세편집 버튼을 눌러 개별 악보를 지울 수 있습니다." />
          </div>
        </div>

        {/* PC용 업로드 */}
        <div className="space-y-2">
          <h2 className="text-[11px] font-bold text-indigo-400 uppercase px-2 mb-2 flex items-center">
            PC용 (폴더 업로드)
          </h2>
          <button 
            onClick={() => handleAlbumUpload(false)}
            disabled={isSyncing}
            className="w-full p-4 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-700 hover:bg-indigo-100 hover:border-indigo-200 transition-all flex flex-col items-center gap-2 group shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FolderUp className="w-5 h-5 group-hover:-translate-y-1 transition-transform" />
            <div className="flex items-center">
              <span className="text-xs font-bold">{isSyncing ? '업로드 준비 중...' : '새앨범 추가'}</span>
              <TooltipIcon text="새로운 폴더를 통째로 업로드하여 새 앨범을 만듭니다. 앱이 폴더명(앨범명)을 물어보며, 악보를 자동으로 불러옵니다." />
            </div>
          </button>
          
          <button 
            onClick={() => handleAlbumUpload(true)}
            disabled={isSyncing}
            className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 transition-all flex flex-col items-center justify-center gap-1.5 group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <UploadCloud className="w-4 h-4 text-slate-500" />
            <div className="flex items-center text-center">
              <span className="text-[10px] font-bold leading-tight tracking-tighter whitespace-nowrap">찬송가 악보<br/>업로드 (최초 1회)</span>
              <TooltipIcon text="용량관계로 찬송가의 목록만 빌드되어 있으니, 사용자가 악보를 업로드 해주셔야 합니다" />
            </div>
          </button>
        </div>

        {/* PC/모바일용 업로드 */}
        <div className="space-y-2">
          <h2 className="text-[11px] font-bold text-emerald-500 uppercase px-2 mb-2">PC + 모바일용</h2>
          <button 
            onClick={handleSingleFileUpload}
            disabled={isSyncing}
            className="w-full p-4 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-200 transition-all flex flex-col items-center gap-2 group shadow-sm disabled:opacity-50 disabled:cursor-not-allowed relative"
          >
            <FilePlus className="w-5 h-5 group-hover:-translate-y-1 transition-transform" />
            <div className="flex flex-col items-center">
              <span className="text-xs font-black text-slate-700 leading-tight tracking-tight whitespace-nowrap">낱개악보 추가</span>
            </div>
            <TooltipIcon text="기기 내부 파일을 선택해 악보를 추가 하는 기능입니다. 앱의 [기타앨범]에 악보가 추가됩니다." position="top-right" />
          </button>
        </div>
      </div>

      {/* 진행률 표시기 */}
      {uploadProgress && (
        <div className="mt-4 p-4 bg-slate-800 text-white rounded-2xl shadow-xl border border-slate-700 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold">업로드 진행률</span>
            <span className="text-xs font-black text-indigo-400">{Math.round((uploadProgress.processed / uploadProgress.total) * 100)}%</span>
          </div>
          <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
            <div 
              className="h-full bg-indigo-500 transition-all duration-300"
              style={{ width: `${(uploadProgress.processed / uploadProgress.total) * 100}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-400 mt-2 text-center">
            {uploadProgress.processed} / {uploadProgress.total} 개 완료
          </p>
        </div>
      )}

      {/* 앨범 설정 모달 */}
      {createPortal(
        <AnimatePresence>
          {showAlbumModal && editingAlbum && (
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setShowAlbumModal(false)}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" 
              />
              <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 10 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 10 }}
                className="relative w-full max-w-sm bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-slate-100"
              >
                {/* Header */}
                <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
                  <h3 className="text-lg font-extrabold text-slate-800 tracking-tight">
                    앨범 설정
                  </h3>
                </div>
                
                <div className="p-6 space-y-6">
                  {/* 앨범 이름 수정 */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">앨범 이름 수정</label>
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        value={albumNameInput}
                        onChange={(e) => setAlbumNameInput(e.target.value)}
                        className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all min-w-0"
                      />
                      <button 
                        onClick={async () => {
                          if (!albumNameInput.trim()) return;
                          if (albumNameInput !== editingAlbum.name) {
                            const oldName = editingAlbum.name;
                            updateAlbum({ ...editingAlbum, name: albumNameInput });
                            const { gdriveWebService } = await import('../../api/gdriveWebService');
                            try {
                              await gdriveWebService.renameFolder(`CEUM_Album_${oldName}`, `CEUM_Album_${albumNameInput}`);
                            } catch(e) { console.log('Folder rename skipped or failed', e); }
                            alert('앨범 이름이 성공적으로 수정되었습니다.');
                            setShowAlbumModal(false);
                          }
                        }}
                        className="px-4 py-3 bg-slate-800 text-white rounded-xl text-sm font-bold hover:bg-slate-700 transition-all active:scale-95 whitespace-nowrap shadow-sm shrink-0"
                      >
                        저장
                      </button>
                    </div>
                  </div>

                  <div className="h-px bg-slate-100 w-full" />

                  {/* 메뉴 버튼들 */}
                  <div className="space-y-3">
                    <button 
                      onClick={() => {
                        alert('빈 폴더에 추가 하고 싶은 악보들을 넣고 업로드 버튼을 누르세요');
                        handleAlbumUpload(false, editingAlbum);
                        setShowAlbumModal(false);
                      }}
                      className="w-full flex items-center gap-3 p-4 bg-indigo-50/50 hover:bg-indigo-50 border border-indigo-100/50 hover:border-indigo-200 text-indigo-700 rounded-2xl transition-all group text-left shadow-sm"
                    >
                      <div className="w-10 h-10 shrink-0 rounded-xl bg-indigo-100 flex items-center justify-center group-hover:scale-105 group-active:scale-95 transition-transform">
                        <FolderPlus className="w-5 h-5 text-indigo-600" />
                      </div>
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-sm font-bold">기존 앨범에 악보 추가</span>
                        <span className="text-[11px] font-medium text-indigo-500 truncate mt-0.5">이 앨범에 새 악보들을 병합합니다</span>
                      </div>
                    </button>
                    
                    <button 
                      onClick={() => {
                        if (confirm('<주의!> 구글드라이브의 해당 폴더와 파일이 삭제 되어 복구되지 않습니다.\n정말로 삭제하시겠습니까?')) {
                          deleteAlbum(editingAlbum.id);
                          setShowAlbumModal(false);
                        }
                      }}
                      className="w-full flex items-center gap-3 p-4 bg-red-50/50 hover:bg-red-50 border border-red-100/50 hover:border-red-200 text-red-600 rounded-2xl transition-all group text-left shadow-sm"
                    >
                      <div className="w-10 h-10 shrink-0 rounded-xl bg-red-100 flex items-center justify-center group-hover:scale-105 group-active:scale-95 transition-transform">
                        <Trash2 className="w-5 h-5 text-red-600" />
                      </div>
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="text-sm font-bold">앨범 삭제하기</span>
                        <span className="text-[11px] font-medium text-red-400 truncate mt-0.5">이 앨범과 모든 악보를 삭제합니다</span>
                      </div>
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};
