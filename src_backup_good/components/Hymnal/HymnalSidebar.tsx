import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useHymnal } from '../../stores/HymnalProvider';
import { 
  Music, 
  UploadCloud,
  FilePlus,
  FolderUp,
  Settings,
  HelpCircle
} from 'lucide-react';
import { hymnalApi } from '../../api/hymnalApi';

import { TooltipIcon } from '../TooltipIcon';

export const HymnalSidebar: React.FC = () => {
  const [uploadProgress, setUploadProgress] = useState<{ processed: number; total: number } | null>(null);
  const { 
    albums,
    setAlbums,
    songs,
    setSongs,
    activeAlbumId, 
    setActiveAlbumId,
    setEditingAlbum,
    setShowAlbumModal,
    isSyncing,
    setIsSyncing,
    fetchSongs
  } = useHymnal();

  // 대량 앨범 업로드 처리
  const handleAlbumUpload = async (isHymnal: boolean = false) => {
    try {
      const files = await hymnalApi.selectFolderForAlbum();
      if (!files || files.length === 0) return;
      
      const albumName = isHymnal ? '새찬송가' : prompt('업로드할 앨범 이름을 입력해주세요:', '새 앨범');
      if (!albumName) return;

      const albumId = isHymnal ? 'hymnal' : albumName;

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
      await hymnalApi.batchUploadImagesToGDrive(filesToUpload, albumName, (processed, total) => {
        setUploadProgress({ processed, total });
      });

      // 3. 앨범 목록 업데이트
      if (!albums.find(a => a.id === albumId)) {
        const newAlbums = [...albums, { id: albumId, name: albumName }];
        setAlbums(newAlbums);
        const { gdriveWebService } = await import('../../api/gdriveWebService');
        await gdriveWebService.uploadJsonFile('settings.json', { albums: newAlbums });
      }

      // 4. 노래 목록을 실시간 드라이브 파일 스캔을 통해 완전 리로드
      await fetchSongs();

      alert(`${filesToUpload.length}개의 신규 악보 업로드가 완료되었습니다! (중복된 ${files.length - filesToUpload.length}개 파일 건너뜀)`);
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
    try {
      const files = await hymnalApi.selectMultipleFiles();
      if (!files || files.length === 0) return;

      // 1. 이미 등록된 곡(기타파일앨범) 목록을 대조하여 중복 업로드 필터링
      const miscSongs = songs.filter(s => s.albumId === 'misc');
      const existingTitles = new Set(miscSongs.map(s => s.title));

      const filesToUpload = files.filter(file => {
        const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(file.name);
        if (!isImage) return false;
        const fileName = file.name.replace(/\.[^/.]+$/, "");
        return !existingTitles.has(fileName);
      });

      if (filesToUpload.length === 0) {
        alert('선택한 모든 파일이 이미 기타파일앨범에 등록되어 있어 업로드를 건너뜁니다.');
        return;
      }

      setIsSyncing(true);
      
      // 2. 신규 악보만 구글 드라이브에 업로드 (CEUM_ccm_data 폴더에 저장됨)
      await hymnalApi.uploadSingleImagesToGDrive(filesToUpload, (processed, total) => {
        // progress callback
      });

      // 3. 앨범 목록 연동 (기타파일앨범 카테고리 1회 활성화)
      if (!albums.find(a => a.id === 'misc')) {
        const newAlbums = [...albums, { id: 'misc', name: '기타파일앨범' }];
        setAlbums(newAlbums);
        const { gdriveWebService } = await import('../../api/gdriveWebService');
        await gdriveWebService.uploadJsonFile('settings.json', { albums: newAlbums });
      }

      // 4. 리스트 갱신 (실시간 구글 드라이브 스캔 로직 작동)
      await fetchSongs();

      alert(`${filesToUpload.length}개의 신규 파일 업로드가 완료되었습니다! (중복 ${files.length - filesToUpload.length}개 건너뜀)`);
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
        <div className="mb-4 px-2 space-y-1">
          <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">앨범 목록</h2>
          <p className="text-[10px] text-slate-400">*앱의 설정은 로그인한 모든 기기에서 연동됩니다</p>
        </div>
        
        <div className="space-y-1">
          <button 
            onClick={() => setActiveAlbumId('all')}
            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
              activeAlbumId === 'all' 
                ? 'bg-slate-800 text-white shadow-lg' 
                : 'hover:bg-slate-50 text-slate-600'
            }`}
          >
            <Music className="w-4 h-4" />
            <span className="text-sm font-bold flex-1 text-left">전체 곡 보기</span>
          </button>

          {albums.map((album) => (
            <div 
              key={album.id}
              onClick={() => setActiveAlbumId(album.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer ${
                activeAlbumId === album.id 
                  ? 'bg-red-500 text-white shadow-lg shadow-red-100' 
                  : 'hover:bg-slate-50 text-slate-600'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${activeAlbumId === album.id ? 'bg-white' : 'bg-red-400'}`} />
              <span className="text-sm font-bold flex-1 text-left truncate">{album.name}</span>
              {activeAlbumId === album.id && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingAlbum(album);
                    setShowAlbumModal(true);
                  }}
                  className="p-1 hover:bg-red-400 rounded-md text-white transition-all"
                >
                  <Settings className="w-3.5 h-3.5" />
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
            + 기존앨범에 악보 추가하기
            <TooltipIcon text="빈폴더에 악보를 넣고 [폴더 업로드]-[기존 앨범명 입력]" />
          </div>
          <div className="flex items-center text-[11px] font-bold text-slate-600">
            + 악보 삭제하기
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
              <span className="text-xs font-bold">{isSyncing ? '업로드 준비 중...' : '폴더 업로드'}</span>
              <TooltipIcon text="폴더를 업로드 하면 구글드라이브에 저용량으로 저장되고 앱이 악보를 자동으로 불러옵니다. [앨범 이름]을 입력하여 상단 [앨범 리스트]에 추가됩니다." />
            </div>
          </button>
          
          <button 
            onClick={() => handleAlbumUpload(true)}
            disabled={isSyncing}
            className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 transition-all flex flex-col items-center justify-center gap-1.5 group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <UploadCloud className="w-4 h-4 text-slate-500" />
            <div className="flex items-center text-center">
              <span className="text-[11px] font-bold leading-tight">찬송가 앨범 업로드<br/>(최초 1회만)</span>
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
              <span className="text-sm font-black text-slate-700 leading-tight">파일추가</span>
              <span className="text-[10px] text-slate-500 font-bold mt-0.5">(낱개악보)</span>
            </div>
            <TooltipIcon text="기기 내부 폴더를 열어 악보를 추가 하는 기능입니다. 앱의 [기타파일앨범]에 악보가 추가됩니다." position="top-right" />
          </button>
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
      </div>
    </div>
  );
};
