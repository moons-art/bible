import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, ShieldCheck, Users, Sparkles, RefreshCw, Search, 
  PlusCircle, BookOpen, Clock, Laptop, Smartphone, Check, AlertCircle, Award
} from 'lucide-react';
import { 
  ADMIN_EMAIL, 
  isAdminUser, 
  fetchAllUsers, 
  syncUserProfile,
  addCreditsToUser, 
  toggleUserAllowedVersion, 
  type UserProfile 
} from '../services/userService';
import { auth } from '../api/firebaseConfig';

interface AdminDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserEmail?: string | null;
}

export const AdminDashboardModal: React.FC<AdminDashboardModalProps> = ({
  isOpen,
  onClose,
  currentUserEmail,
}) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'created' | 'aiUsed'>('recent');
  const [actionLoadingUid, setActionLoadingUid] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const loadUsers = async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const data = await fetchAllUsers();
      setUsers(data);
      if (data.length === 0) {
        console.info('[AdminDashboard] Firestore 사용자 목록 비어있음. 새로 가입자가 없거나 syncUserProfile이 아직 실행되지 않았습니다.');
      }
    } catch (err: any) {
      console.error('[AdminDashboard] Failed to fetch users:', err);
      const code = err?.code || '';
      if (code === 'permission-denied') {
        setFetchError('파이어스토어 권한 거부(파이어베이스 콘솔에서 규칙 확인 필요)');
      } else {
        setFetchError('데이터를 가져오지 못했습니다. (' + (code || err?.message || '알 수 없는 오류') + ')');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      // 대시보드 열릴 때 현재 관리자 본인 프로필도 강제 동기화 후 목록 재조회
      const currentUser = auth.currentUser;
      if (currentUser) {
        syncUserProfile(currentUser)
          .then(() => {
            console.log('[AdminDashboard] 관리자 프로필 동기화 성공, uid:', currentUser.uid);
          })
          .catch(e =>
            console.warn('[AdminDashboard] 관리자 프로필 동기화 실패:', e?.code || e)
          )
          .finally(() => {
            // 서버 sync 완료 후 목록 갱신 (500ms 딜레이)
            setTimeout(() => loadUsers(), 500);
          });
      } else {
        loadUsers();
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 권한 검증: ymoonsik@gmail.com 계정만 접속 가능
  const isAuthorized = isAdminUser(currentUserEmail);

  // 보너스 충전 처리 (+50회 / +100회 / 임의 숫자)
  const handleAddCredits = async (user: UserProfile, count: number) => {
    if (!confirm(`${user.displayName || user.email} 회원에게 AI 연구 ${count}회를 보너스로 충전하시겠습니까?`)) {
      return;
    }

    setActionLoadingUid(user.uid);
    try {
      await addCreditsToUser(user.uid, count, '관리자 수동 지급');
      showToast(`${user.displayName || user.email} 회원에게 +${count}회 충전 완료!`);
      // 로컬 목록 즉각 갱신
      setUsers(prev => prev.map(u => {
        if (u.uid === user.uid) {
          return {
            ...u,
            aiCredits: {
              ...u.aiCredits,
              paidRemaining: (u.aiCredits?.paidRemaining || 0) + count
            }
          };
        }
        return u;
      }));
    } catch (err) {
      console.error('Failed to add credits:', err);
      alert('보너스 충전 중 오류가 발생했습니다.');
    } finally {
      setActionLoadingUid(null);
    }
  };

  // 원격 특별 번역본 권한 토글 (개역개정 등)
  const handleToggleVersion = async (user: UserProfile, versionId: string = 'built-in-krv') => {
    const isCurrentlyAllowed = (user.allowedVersions || []).includes(versionId);
    const actionText = isCurrentlyAllowed ? '회수' : '제공(활성화)';
    
    if (!confirm(`${user.displayName || user.email} 회원에게 개역개정 번역본을 ${actionText}하시겠습니까?`)) {
      return;
    }

    setActionLoadingUid(user.uid);
    try {
      await toggleUserAllowedVersion(user.uid, versionId, !isCurrentlyAllowed);
      showToast(`개역개정 번역본 ${actionText} 완료!`);
      // 로컬 상태 즉각 갱신
      setUsers(prev => prev.map(u => {
        if (u.uid === user.uid) {
          const prevAllowed = u.allowedVersions || [];
          const nextAllowed = isCurrentlyAllowed 
            ? prevAllowed.filter(id => id !== versionId)
            : [...prevAllowed, versionId];
          return { ...u, allowedVersions: nextAllowed };
        }
        return u;
      }));
    } catch (err) {
      console.error('Failed to toggle version:', err);
      alert('번역본 권한 변경 중 오류가 발생했습니다.');
    } finally {
      setActionLoadingUid(null);
    }
  };

  // 통계 계산
  const totalUsers = users.length;
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const todayActiveCount = users.filter(u => u.lastLoginAt >= todayMidnight.getTime()).length;
  const totalAiUsedCount = users.reduce((acc, u) => acc + (u.aiCredits?.totalUsed || 0), 0);
  const totalPaidRemaining = users.reduce((acc, u) => acc + (u.aiCredits?.paidRemaining || 0), 0);

  // 검색 및 정렬 필터링
  const filteredUsers = users
    .filter(u => {
      const q = searchQuery.toLowerCase();
      return (
        (u.email || '').toLowerCase().includes(q) ||
        (u.displayName || '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'recent') return (b.lastLoginAt || 0) - (a.lastLoginAt || 0);
      if (sortBy === 'created') return (b.createdAt || 0) - (a.createdAt || 0);
      if (sortBy === 'aiUsed') return (b.aiCredits?.totalUsed || 0) - (a.aiCredits?.totalUsed || 0);
      return 0;
    });

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5">
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-xs"
      />

      {/* Modal Window */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 15 }}
        className="relative w-full max-w-6xl bg-[#FAF9F5] rounded-3xl border border-[#E7E5DF] shadow-2xl overflow-hidden flex flex-col max-h-[92vh] z-10"
      >
        {/* Header */}
        <div className="p-5 border-b border-[#E7E5DF] bg-[#F7F5F0] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[#C46A40] text-white flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-5 h-5 stroke-[2px]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-serif text-lg font-bold text-[#2C2B29]">NATIONS BIBLE 통합 관리자 콘솔</h2>
                <span className="px-2 py-0.5 bg-[#FAF0EB] text-[#C46A40] border border-[#F1D3C6] rounded-md text-[10px] font-bold">
                  최고 관리자: {ADMIN_EMAIL}
                </span>
              </div>
              <p className="text-xs text-[#8C877D]">이용자 활동 추적, AI 보너스 충전(50/100회), 원격 특별 번역본 권한 관리</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={loadUsers} 
              disabled={isLoading}
              className="p-2 hover:bg-[#EAE4DA] rounded-xl transition-colors text-[#6E6A63] hover:text-[#2C2B29] cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
              title="새로고침"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>새로고침</span>
            </button>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-[#EAE4DA] rounded-xl transition-colors text-[#8C877D] hover:text-[#2C2B29] cursor-pointer"
            >
              <X className="w-5 h-5 stroke-[1.8px]" />
            </button>
          </div>
        </div>

        {/* Toast Alert */}
        {toastMsg && (
          <div className="absolute top-20 right-6 z-50 bg-[#2C2B29] text-white text-xs px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 animate-bounce">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>{toastMsg}</span>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 flex flex-col gap-5 custom-scrollbar">
          {!isAuthorized ? (
            <div className="p-12 text-center flex flex-col items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-3">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-[#2C2B29] mb-1">관리자 접근 권한이 없습니다</h3>
              <p className="text-xs text-[#8C877D]">
                이 대시보드는 최고 관리자 계정(<strong>{ADMIN_EMAIL}</strong>)으로 로그인했을 때만 이용할 수 있습니다.
              </p>
            </div>
          ) : (
            <>
              {/* 1. 실시간 종합 통계 KPI 카드 (4종) */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="p-4 bg-white rounded-2xl border border-[#E7E5DF] shadow-2xs flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-[#F5F3ED] text-[#6E6A63] flex items-center justify-center shrink-0 border border-[#E7E5DF]">
                    <Users className="w-5 h-5 stroke-[1.8px]" />
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-[#8C877D] uppercase">전체 가입자</span>
                    <p className="text-xl font-bold font-serif text-[#2C2B29]">{totalUsers.toLocaleString()}명</p>
                  </div>
                </div>

                <div className="p-4 bg-white rounded-2xl border border-[#E7E5DF] shadow-2xs flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-[#FAF0EB] text-[#C46A40] flex items-center justify-center shrink-0 border border-[#F1D3C6]">
                    <Clock className="w-5 h-5 stroke-[1.8px]" />
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-[#8C877D] uppercase">오늘 활동자</span>
                    <p className="text-xl font-bold font-serif text-[#C46A40]">{todayActiveCount.toLocaleString()}명</p>
                  </div>
                </div>

                <div className="p-4 bg-white rounded-2xl border border-[#E7E5DF] shadow-2xs flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 border border-amber-200">
                    <Sparkles className="w-5 h-5 stroke-[1.8px]" />
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-[#8C877D] uppercase">총 AI 연구 실행</span>
                    <p className="text-xl font-bold font-serif text-amber-800">{totalAiUsedCount.toLocaleString()}회</p>
                  </div>
                </div>

                <div className="p-4 bg-white rounded-2xl border border-[#E7E5DF] shadow-2xs flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-200">
                    <Award className="w-5 h-5 stroke-[1.8px]" />
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-[#8C877D] uppercase">유료 잔여 총합</span>
                    <p className="text-xl font-bold font-serif text-emerald-800">{totalPaidRemaining.toLocaleString()}회</p>
                  </div>
                </div>
              </div>

              {/* 2. 검색 및 필터 컨트롤 바 */}
              <div className="p-3.5 bg-white rounded-2xl border border-[#E7E5DF] shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative w-full sm:w-80">
                  <input
                    type="text"
                    placeholder="회원 이메일 또는 이름 검색..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#FAF9F5] border border-[#DDD8CE] focus:border-[#C46A40] focus:ring-2 focus:ring-[#C46A40]/10 rounded-xl pl-9 pr-3 py-2 text-xs text-[#2C2B29] outline-none transition-all placeholder:text-[#A39E94]"
                  />
                  <Search className="w-4 h-4 text-[#A39E94] absolute left-3 top-2.5 stroke-[1.6px]" />
                </div>

                <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
                  <span className="text-xs text-[#8C877D]">정렬:</span>
                  <button
                    onClick={() => setSortBy('recent')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${sortBy === 'recent' ? 'bg-[#FAF0EB] text-[#C46A40] border border-[#F1D3C6]' : 'text-[#6E6A63] hover:bg-[#F5F3ED]'}`}
                  >
                    최근 접속순
                  </button>
                  <button
                    onClick={() => setSortBy('aiUsed')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${sortBy === 'aiUsed' ? 'bg-[#FAF0EB] text-[#C46A40] border border-[#F1D3C6]' : 'text-[#6E6A63] hover:bg-[#F5F3ED]'}`}
                  >
                    AI 연구순
                  </button>
                  <button
                    onClick={() => setSortBy('created')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${sortBy === 'created' ? 'bg-[#FAF0EB] text-[#C46A40] border border-[#F1D3C6]' : 'text-[#6E6A63] hover:bg-[#F5F3ED]'}`}
                  >
                    가입순
                  </button>
                </div>
              </div>

              {/* 3. 이용자 종합 추적 테이블 */}
              <div className="bg-white rounded-2xl border border-[#E7E5DF] shadow-2xs overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#F7F5F0] border-b border-[#E7E5DF] text-[#6E6A63]">
                        <th className="py-3 px-4 font-bold">회원 정보</th>
                        <th className="py-3 px-4 font-bold">최근 접속 & 기기</th>
                        <th className="py-3 px-3 font-bold text-center">자료 통계</th>
                        <th className="py-3 px-4 font-bold text-center">AI 잔여 횟수 (무료/유료)</th>
                        <th className="py-3 px-4 font-bold text-center">보너스 충전 (50/100회)</th>
                        <th className="py-3 px-4 font-bold text-center">원격 특별 번역본</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFECE6]">
                      {filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center">
                            {fetchError ? (
                              <div className="flex flex-col items-center gap-2 text-red-500">
                                <AlertCircle className="w-8 h-8" />
                                <p className="font-bold text-sm">데이터 로드 실패</p>
                                <p className="text-xs text-[#8C877D]">{fetchError}</p>
                                <button onClick={loadUsers} className="mt-2 px-4 py-1.5 bg-[#C46A40] text-white text-xs rounded-lg cursor-pointer hover:bg-[#B55434]">다시 시도</button>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center gap-2 text-[#A39E94]">
                                <Users className="w-8 h-8 opacity-40" />
                                <p className="font-medium">{searchQuery ? '검색된 회원이 없습니다.' : '등록된 회원이 없습니다.'}</p>
                                {!searchQuery && <p className="text-[11px]">새로 가입 후 재로그인하면 자동으로 표시됩니다.</p>}
                              </div>
                            )}
                          </td>
                        </tr>
                      ) : (
                        filteredUsers.map((user) => {
                          const isAllowedKrv = (user.allowedVersions || []).includes('built-in-krv');
                          const isBusy = actionLoadingUid === user.uid;

                          return (
                            <tr key={user.uid} className="hover:bg-[#FAF9F5] transition-colors">
                              {/* 회원 정보 */}
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2.5">
                                  {user.photoURL ? (
                                    <img src={user.photoURL} alt="" className="w-7 h-7 rounded-full object-cover border border-[#E7E5DF]" />
                                  ) : (
                                    <div className="w-7 h-7 rounded-full bg-[#F5F3ED] text-[#6E6A63] font-bold text-xs flex items-center justify-center border border-[#E7E5DF]">
                                      {(user.displayName || user.email || 'U')[0].toUpperCase()}
                                    </div>
                                  )}
                                  <div>
                                    <div className="font-bold text-[#2C2B29] flex items-center gap-1.5">
                                      <span>{user.displayName || '이름 없음'}</span>
                                      {isAdminUser(user.email) && (
                                        <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 text-[9px] font-bold rounded">
                                          ADMIN
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[11px] text-[#8C877D] font-mono select-all">{user.email}</p>
                                  </div>
                                </div>
                              </td>

                              {/* 최근 접속 & 기기 */}
                              <td className="py-3 px-4">
                                <div className="text-[11px] text-[#2C2B29]">
                                  {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('ko-KR', {
                                    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                  }) : '-'}
                                </div>
                                <div className="text-[10px] text-[#8C877D] flex items-center gap-1 mt-0.5">
                                  <Laptop className="w-3 h-3 text-[#A39E94]" />
                                  <span>{user.deviceInfo || '기타 브라우저'}</span>
                                  <span className="text-[#DDD8CE]">|</span>
                                  <span>{user.loginCount || 1}회 접속</span>
                                </div>
                              </td>

                              {/* 자료 통계 */}
                              <td className="py-3 px-3 text-center">
                                <div className="inline-flex items-center gap-1.5 text-[11px] bg-[#FAF9F5] px-2.5 py-1 rounded-lg border border-[#E7E5DF]">
                                  <span title="주석 작성 수">주석 {user.noteCount || 0}</span>
                                  <span className="text-[#DDD8CE]">/</span>
                                  <span title="설교 작성 수">설교 {user.sermonCount || 0}</span>
                                </div>
                              </td>

                              {/* AI 잔여 횟수 */}
                              <td className="py-3 px-4 text-center">
                                <div className="flex flex-col items-center">
                                  <div className="font-bold text-xs text-[#2C2B29]">
                                    <span className="text-[#C46A40]">
                                      {(user.aiCredits?.freeRemaining || 0) + (user.aiCredits?.paidRemaining || 0)}회
                                    </span>
                                    <span className="text-[10px] text-[#8C877D] font-normal ml-1">
                                      (무료 {user.aiCredits?.freeRemaining || 0} / 유료 {user.aiCredits?.paidRemaining || 0})
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-[#8C877D]">
                                    누적 {user.aiCredits?.totalUsed || 0}회 연구됨
                                  </span>
                                </div>
                              </td>

                              {/* 보너스 충전 (50회/100회 단위) */}
                              <td className="py-3 px-4 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button
                                    onClick={() => handleAddCredits(user, 50)}
                                    disabled={isBusy}
                                    className="px-2.5 py-1 bg-white hover:bg-[#FAF0EB] active:bg-[#F5E2DA] border border-[#DDD8CE] hover:border-[#F1D3C6] text-[#C46A40] rounded-lg text-[11px] font-bold transition-all shadow-2xs cursor-pointer disabled:opacity-50"
                                    title="50회 충전"
                                  >
                                    +50회
                                  </button>
                                  <button
                                    onClick={() => handleAddCredits(user, 100)}
                                    disabled={isBusy}
                                    className="px-2.5 py-1 bg-[#FAF0EB] hover:bg-[#F5E2DA] active:bg-[#EDD1C4] border border-[#F1D3C6] text-[#C46A40] rounded-lg text-[11px] font-bold transition-all shadow-2xs cursor-pointer disabled:opacity-50"
                                    title="100회 충전"
                                  >
                                    +100회
                                  </button>
                                  <button
                                    onClick={() => {
                                      const custom = prompt('충전할 횟수를 숫자로 입력해주세요 (예: 200):', '50');
                                      if (custom) {
                                        const n = parseInt(custom, 10);
                                        if (!isNaN(n) && n > 0) handleAddCredits(user, n);
                                      }
                                    }}
                                    disabled={isBusy}
                                    className="p-1 hover:bg-[#F5F3ED] text-[#8C877D] hover:text-[#2C2B29] rounded-lg text-[10px] font-semibold transition-colors cursor-pointer"
                                    title="직접 숫자 입력 충전"
                                  >
                                    입력
                                  </button>
                                </div>
                              </td>

                              {/* 원격 특별 번역본 권한 부여 (개역개정 원격 배포) */}
                              <td className="py-3 px-4 text-center">
                                <button
                                  onClick={() => handleToggleVersion(user, 'built-in-krv')}
                                  disabled={isBusy}
                                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border shadow-2xs cursor-pointer flex items-center justify-center gap-1.5 mx-auto disabled:opacity-50 ${
                                    isAllowedKrv 
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100' 
                                      : 'bg-[#FAF9F5] text-[#8C877D] border-[#DDD8CE] hover:bg-[#F5F3ED]'
                                  }`}
                                  title="업로드가 힘든 목회자에게 원격으로 개역개정 활성화"
                                >
                                  <BookOpen className="w-3.5 h-3.5" />
                                  <span>{isAllowedKrv ? '개역개정 제공중' : '개역개정 미제공'}</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
};
