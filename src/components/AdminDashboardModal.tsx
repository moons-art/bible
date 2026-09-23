import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, ShieldCheck, Users, Sparkles, RefreshCw, Search, 
  BookOpen, Clock, Laptop, Check, AlertCircle, Award, 
  Activity, Trash2, FileText, Database, Gift, Tag, UserPlus, CheckCircle2,
  KeyRound, Building2, MessageCircle, Calendar,
  CreditCard, Coins, Copy, ExternalLink, Smartphone
} from 'lucide-react';
import {
  getSitePolicy,
  saveSitePolicy,
  type SitePolicy,
  DEFAULT_SITE_POLICY
} from '../services/policyService';
import { sendPasswordResetEmail } from 'firebase/auth';
import { doc, deleteDoc } from 'firebase/firestore';
import { 
  ADMIN_EMAIL, 
  isAdminUser, 
  fetchAllUsers, 
  fetchActivityLogs,
  clearAllActivityLogs,
  syncUserProfile,
  addCreditsToUser, 
  addCloudCapacityToUser,
  toggleUserAllowedVersion, 
  type UserProfile,
  type ActivityLogEntry
} from '../services/userService';
import {
  getPromotionSettings,
  savePromotionSettings,
  getReferralSettings,
  saveReferralSettings,
  subscribeReferralRequests,
  approveReferralRequest,
  deleteReferralRequest,
  manualGrantReferralBonus,
  type PromotionSettings,
  type ReferralSettings,
  type ReferralRequest,
  DEFAULT_PROMOTION_SETTINGS,
  DEFAULT_REFERRAL_SETTINGS
} from '../services/promotionService';
import { auth, db } from '../api/firebaseConfig';

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
  const [activeTab, setActiveTab] = useState<'users' | 'promotions' | 'logs' | 'policies'>('users');
  
  // 서비스 정책, 약관 및 사업자 정보 상태
  const [policySettings, setPolicySettings] = useState<SitePolicy>(DEFAULT_SITE_POLICY);
  const [policySubTab, setPolicySubTab] = useState<'business' | 'terms' | 'privacy'>('business');
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);
  
  // 유저 목록 상태 및 20명 페이징 / 회원 상세 모달 상태
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'loginCount' | 'payment' | 'materials' | 'aiUsed' | 'created'>('recent');
  const [actionLoadingUid, setActionLoadingUid] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const USERS_PER_PAGE = 20;
  const [selectedUserForDetail, setSelectedUserForDetail] = useState<UserProfile | null>(null);

  // 활동 로그 상태
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [logActionFilter, setLogActionFilter] = useState<string>('all');
  const [isDeletingLogs, setIsDeletingLogs] = useState(false);

  // 프로모션 & 추천인 상태
  const [promoSettings, setPromoSettings] = useState<PromotionSettings>(DEFAULT_PROMOTION_SETTINGS);
  const [referralSettings, setReferralSettings] = useState<ReferralSettings>(DEFAULT_REFERRAL_SETTINGS);
  const [referralRequests, setReferralRequests] = useState<ReferralRequest[]>([]);
  const [isSavingPromo, setIsSavingPromo] = useState(false);
  const [isSavingReferral, setIsSavingReferral] = useState(false);
  const [customReferralInput, setCustomReferralInput] = useState<string>('');

  // 인앱 커스텀 확인 모달 상태 (브라우저 confirm/prompt 깜빡임 및 자동 닫힘 원천 해결)
  interface ConfirmModalConfig {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    theme?: 'danger' | 'primary' | 'warning';
    showInput?: boolean;
    inputPlaceholder?: string;
    onConfirm: (inputVal?: string) => Promise<void> | void;
  }
  const [confirmModal, setConfirmModal] = useState<ConfirmModalConfig | null>(null);
  const [confirmInputText, setConfirmInputText] = useState('');

  // 공통 토스트 알림
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3200);
  };

  // 1. 유저 목록 로드
  const loadUsers = async () => {
    setIsLoadingUsers(true);
    setFetchError(null);
    try {
      const data = await fetchAllUsers();
      setUsers(data);
    } catch (err: any) {
      console.error('[AdminDashboard] Failed to fetch users:', err);
      const code = err?.code || '';
      if (code === 'permission-denied') {
        setFetchError('파이어스토어 권한 거부(파이어베이스 콘솔 규칙 확인 필요)');
      } else {
        setFetchError('회원 데이터를 가져오지 못했습니다. (' + (code || err?.message || '알 수 없는 오류') + ')');
      }
    } finally {
      setIsLoadingUsers(false);
    }
  };

  // 2. 활동 로그 로드
  const loadLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const logData = await fetchActivityLogs(300);
      setLogs(logData);
    } catch (err: any) {
      console.error('[AdminDashboard] Failed to fetch activity logs:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  // 전체 데이터 갱신
  const refreshAll = () => {
    loadUsers();
    loadLogs();
    getPromotionSettings().then(setPromoSettings).catch(() => {});
    getReferralSettings().then(st => {
      setReferralSettings(st);
    }).catch(() => {});
    getSitePolicy().then(setPolicySettings).catch(() => {});
  };

  // 서비스 정책 및 사업자 정보 저장
  const handleSavePolicy = async () => {
    setIsSavingPolicy(true);
    try {
      await saveSitePolicy(policySettings);
      showToast('서비스 정책 및 사업자 정보가 성공적으로 저장되었습니다.');
    } catch (err) {
      console.error('Failed to save policy settings:', err);
      showToast('저장 중 오류가 발생했습니다.');
    } finally {
      setIsSavingPolicy(false);
    }
  };

  // 모달 진입 시 동기화 및 데이터 로드 + 실시간 추천 신청 목록 구독
  useEffect(() => {
    if (isOpen) {
      const currentUser = auth.currentUser;
      if (currentUser) {
        syncUserProfile(currentUser)
          .catch(e => console.warn('[AdminDashboard] 관리자 프로필 동기화 경고:', e?.code || e))
          .finally(() => {
            refreshAll();
          });
      } else {
        refreshAll();
      }

      const unsubRef = subscribeReferralRequests(setReferralRequests);
      return () => {
        unsubRef();
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 권한 검증: ymoonsik@gmail.com 계정만 접속 가능
  const isAuthorized = isAdminUser(currentUserEmail || auth.currentUser?.email);

  // ── [프로모션 & 추천인 관리 핸들러] ────────────────────────────
  // 1. 가입 프로모션 설정 저장
  const handleSavePromo = async () => {
    setIsSavingPromo(true);
    try {
      const cleanName = promoSettings.name.trim() || '특별혜택기간';
      const cleanDesc = promoSettings.description
        .replace(/^(?:특별혜택기간|프로모션)\s*:\s*/, '')
        .replace(/200\s*크[래레]딧\s*제공/, '200크레딧 제공')
        .replace('크래딧', '크레딧')
        .trim() || '200크레딧 제공';
      const settingsToSave = {
        ...promoSettings,
        name: cleanName,
        description: cleanDesc
      };
      setPromoSettings(settingsToSave);
      await savePromotionSettings(settingsToSave);
      showToast(`프로모션 설정 저장 완료! (${cleanName}, ${cleanDesc})`);
    } catch (err) {
      console.error('Failed to save promo settings:', err);
      showToast('프로모션 설정 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSavingPromo(false);
    }
  };

  // 2. 추천인 혜택 설정 저장
  const handleSaveReferral = async (credits: number) => {
    if (credits <= 0) {
      showToast('지급 횟수는 1회 이상이어야 합니다.');
      return;
    }
    setIsSavingReferral(true);
    try {
      await saveReferralSettings({ bonusCredits: credits });
      setReferralSettings({ bonusCredits: credits });
      showToast(`추천인 1인당 혜택이 ${credits}회로 변경되었습니다.`);
    } catch (err) {
      console.error('Failed to save referral settings:', err);
      showToast('추천인 설정 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSavingReferral(false);
    }
  };

  // 3. 추천 신청 승인 및 즉시 혜택 지급 (인앱 확인 모달)
  const handleApproveReferral = (req: ReferralRequest) => {
    setConfirmModal({
      isOpen: true,
      title: '친구 추천 보너스 승인',
      message: `${req.referrerEmail} 회원에게 친구(${req.friendEmail}) 추천 보너스 ${req.bonusCredits}회를 지급하시겠습니까?`,
      confirmText: `+${req.bonusCredits}회 지급 승인`,
      theme: 'primary',
      onConfirm: async () => {
        setActionLoadingUid(req.id);
        try {
          await approveReferralRequest(req);
          showToast(`${req.referrerEmail} 회원에게 추천 보너스 +${req.bonusCredits}회 충전 완료!`);
          setUsers(prev => prev.map(u => {
            if ((u.email || '').toLowerCase() === req.referrerEmail.toLowerCase() || u.uid === req.referrerUid) {
              return {
                ...u,
                aiCredits: {
                  ...u.aiCredits,
                  paidRemaining: (u.aiCredits?.paidRemaining || 0) + req.bonusCredits
                }
              };
            }
            return u;
          }));
        } catch (err) {
          console.error('Failed to approve referral:', err);
          showToast('추천 혜택 지급 중 오류가 발생했습니다.');
        } finally {
          setActionLoadingUid(null);
        }
      }
    });
  };

  // 4. 추천 신청 삭제 / 반려 (인앱 확인 모달)
  const handleDeleteReferral = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: '추천 신청 내역 삭제',
      message: '해당 추천 신청 내역을 목록에서 삭제하시겠습니까?',
      confirmText: '삭제',
      theme: 'danger',
      onConfirm: async () => {
        try {
          await deleteReferralRequest(id);
          showToast('추천 신청 내역이 삭제되었습니다.');
        } catch (err) {
          console.error('Failed to delete referral request:', err);
          showToast('삭제 중 오류가 발생했습니다.');
        }
      }
    });
  };

  // 5. 회원 계정 영구 삭제 핸들러 (인앱 확인 모달 + 이름/이메일 일치 확인)
  const handleDeleteUser = (user: UserProfile) => {
    const userName = user.displayName || user.email || '회원';
    setConfirmInputText('');
    setConfirmModal({
      isOpen: true,
      title: '회원 데이터 영구 삭제',
      message: `[주의] 정말 "${userName}" (${user.email || user.uid}) 회원의 데이터를 영구 삭제하시겠습니까?\n이 작업은 되돌릴 수 없으며, Firestore 데이터베이스에서 영구 제거됩니다.\n\n확정하시려면 회원의 이름 또는 이메일("${userName}")을 아래에 똑같이 입력해주세요.`,
      showInput: true,
      inputPlaceholder: `"${userName}" 입력`,
      confirmText: '영구 삭제',
      theme: 'danger',
      onConfirm: async (inputVal) => {
        const trimmed = (inputVal || '').trim();
        if (trimmed !== userName.trim() && trimmed !== (user.email || '').trim()) {
          showToast('입력값이 일치하지 않아 회원 삭제가 취소되었습니다.');
          return;
        }

        setActionLoadingUid(`delete_${user.uid}`);
        try {
          await deleteDoc(doc(db, 'users', user.uid));
          setUsers(prev => prev.filter(u => u.uid !== user.uid));
          showToast(`"${userName}" 회원의 데이터가 영구 삭제되었습니다.`);
        } catch (err: any) {
          console.error('Failed to delete user:', err);
          showToast('회원 삭제 중 오류가 발생했습니다: ' + (err?.message || '권한 오류'));
        } finally {
          setActionLoadingUid(null);
        }
      }
    });
  };

  // 6. 특정 회원의 비밀번호 초기화 메일 발송 (인앱 확인 모달)
  const handleResetPassword = (user: UserProfile) => {
    if (!user.email) {
      showToast('해당 회원은 이메일 주소가 등록되어 있지 않아 메일을 보낼 수 없습니다.');
      return;
    }
    const userName = user.displayName || user.email;
    setConfirmModal({
      isOpen: true,
      title: '비밀번호 재설정 링크 발송',
      message: `"${userName}" (${user.email}) 회원에게 비밀번호 재설정 공식 이메일을 발송하시겠습니까?\n\n회원이 수신한 이메일의 공식 안전 링크를 클릭하면 새 비밀번호를 직접 안전하게 입력하고 바로 로그인할 수 있습니다.`,
      confirmText: '재설정 메일 발송',
      theme: 'warning',
      onConfirm: async () => {
        setActionLoadingUid(`reset_${user.uid}`);
        try {
          await sendPasswordResetEmail(auth, user.email!);
          showToast(`비밀번호 재설정 이메일 발송 완료! (${user.email})`);
        } catch (err: any) {
          console.error('Failed to send password reset email:', err);
          const code = err?.code || '';
          if (code === 'auth/user-not-found') {
            showToast('Firebase 인증 시스템에 등록되지 않은 이메일이거나 구글 간편로그인 전용 계정입니다.');
          } else {
            showToast('비밀번호 재설정 메일 발송 실패: ' + (err?.message || code));
          }
        } finally {
          setActionLoadingUid(null);
        }
      }
    });
  };

  // 회원의 결제 내역에서 총 결제 금액 계산
  const calculateTotalPaymentAmount = (history?: RechargeHistoryItem[]) => {
    if (!history || history.length === 0) return 0;
    return history.reduce((sum, item) => {
      const anyItem = item as any;
      if (anyItem.price && typeof anyItem.price === 'number') return sum + anyItem.price;
      const plan = (item.planName || '').toLowerCase();
      if (plan.includes('관리자') || plan.includes('프로모션') || plan.includes('이벤트') || plan.includes('가입') || plan.includes('추천')) {
        return sum; // 무료 보너스/이벤트
      }
      if (item.amount === 100 || plan.includes('베이직')) return sum + 9900;
      if (item.amount === 300 || plan.includes('프로')) return sum + 24900;
      if (item.amount === 1000 || plan.includes('프리미엄')) return sum + 69000;
      if (plan.includes('300구절') || plan.includes('클라우드 300')) return sum + 3300;
      if (plan.includes('1000구절') || plan.includes('클라우드 1000')) return sum + 9900;
      if (plan.includes('무제한')) return sum + 29900;
      return sum;
    }, 0);
  };

  // 7. 보너스 충전 처리 (+10회 / +50회 / +100회 - 인앱 확인 모달)
  const handleAddCredits = (user: UserProfile, count: number) => {
    const userName = user.displayName || user.email || '회원';
    setConfirmModal({
      isOpen: true,
      title: 'AI 크레딧 보너스 충전',
      message: `"${userName}" 회원에게 AI 연구 크레딧 ${count}회를 보너스로 충전하시겠습니까?`,
      confirmText: `+${count}회 충전하기`,
      theme: 'primary',
      onConfirm: async () => {
        setActionLoadingUid(user.uid);
        try {
          await addCreditsToUser(user.uid, count, '관리자 수동 지급');
          showToast(`"${userName}" 회원에게 +${count}회 충전 완료!`);
          const newHistoryItem: RechargeHistoryItem = {
            id: `${Date.now()}_admin`,
            amount: count,
            planName: '관리자 수동 지급',
            date: Date.now(),
            expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
            remaining: count,
          };
          setUsers(prev => prev.map(u => {
            if (u.uid === user.uid) {
              return {
                ...u,
                aiCredits: {
                  ...u.aiCredits,
                  paidRemaining: (u.aiCredits?.paidRemaining || 0) + count
                },
                rechargeHistory: [...(u.rechargeHistory || []), newHistoryItem]
              };
            }
            return u;
          }));
          setSelectedUserForDetail(prev => {
            if (!prev || prev.uid !== user.uid) return prev;
            return {
              ...prev,
              aiCredits: {
                ...prev.aiCredits,
                paidRemaining: (prev.aiCredits?.paidRemaining || 0) + count
              },
              rechargeHistory: [...(prev.rechargeHistory || []), newHistoryItem]
            };
          });
        } catch (err) {
          console.error('Failed to add credits:', err);
          showToast('보너스 충전 중 오류가 발생했습니다.');
        } finally {
          setActionLoadingUid(null);
        }
      }
    });
  };

  // 8. 직접 입력 보너스 충전 (인앱 입력 모달)
  const handleCustomAddCredits = (user: UserProfile) => {
    const userName = user.displayName || user.email || '회원';
    setConfirmInputText('50');
    setConfirmModal({
      isOpen: true,
      title: 'AI 크레딧 직접 입력 충전',
      message: `"${userName}" 회원에게 충전할 크레딧 횟수를 입력해주세요:`,
      showInput: true,
      inputPlaceholder: '충전할 횟수 입력 (예: 200)',
      confirmText: '충전하기',
      theme: 'primary',
      onConfirm: async (inputVal) => {
        const n = parseInt(inputVal || '', 10);
        if (isNaN(n) || n <= 0) {
          showToast('올바른 숫자를 입력해주세요.');
          return;
        }

        setActionLoadingUid(user.uid);
        try {
          await addCreditsToUser(user.uid, n, '관리자 수동 직접 입력 충전');
          showToast(`"${userName}" 회원에게 +${n}회 충전 완료!`);
          const newHistoryItem: RechargeHistoryItem = {
            id: `${Date.now()}_admin_custom`,
            amount: n,
            planName: '관리자 수동 직접 충전',
            date: Date.now(),
            expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
            remaining: n,
          };
          setUsers(prev => prev.map(u => {
            if (u.uid === user.uid) {
              return {
                ...u,
                aiCredits: {
                  ...u.aiCredits,
                  paidRemaining: (u.aiCredits?.paidRemaining || 0) + n
                },
                rechargeHistory: [...(u.rechargeHistory || []), newHistoryItem]
              };
            }
            return u;
          }));
          setSelectedUserForDetail(prev => {
            if (!prev || prev.uid !== user.uid) return prev;
            return {
              ...prev,
              aiCredits: {
                ...prev.aiCredits,
                paidRemaining: (prev.aiCredits?.paidRemaining || 0) + n
              },
              rechargeHistory: [...(prev.rechargeHistory || []), newHistoryItem]
            };
          });
        } catch (err) {
          console.error('Failed to add credits:', err);
          showToast('충전 중 오류가 발생했습니다.');
        } finally {
          setActionLoadingUid(null);
        }
      }
    });
  };

  // 주석 클라우드 수동 지급 처리 (+300 / +1000 / 무제한 - 인앱 확인 모달)
  const handleAddCloudCapacity = (user: UserProfile, capacity: number) => {
    const userName = user.displayName || user.email || '회원';
    const capacityText = capacity >= 30000 ? '무제한(성경 전체)' : `+${capacity}구절`;
    setConfirmModal({
      isOpen: true,
      title: '주석 클라우드 용량 수동 지급',
      message: `"${userName}" 회원에게 주석 클라우드 영구 보관 용량 ${capacityText}을 수동으로 추가하시겠습니까?`,
      confirmText: `용량 추가 승인`,
      theme: 'primary',
      onConfirm: async () => {
        setActionLoadingUid(user.uid);
        try {
          await addCloudCapacityToUser(user.uid, capacity, 0, '관리자 수동 지급');
          showToast(`"${userName}" 회원에게 주석 클라우드 ${capacityText} 추가 완료!`);
          setUsers(prev => prev.map(u => {
            if (u.uid === user.uid) {
              return {
                ...u,
                cloudCommentaryLimit: (u.cloudCommentaryLimit || 0) + capacity
              };
            }
            return u;
          }));
          setSelectedUserForDetail(prev => {
            if (!prev || prev.uid !== user.uid) return prev;
            return {
              ...prev,
              cloudCommentaryLimit: (prev.cloudCommentaryLimit || 0) + capacity
            };
          });
        } catch (err) {
          console.error('Failed to add cloud capacity:', err);
          showToast('주석 클라우드 용량 추가 중 오류가 발생했습니다.');
        } finally {
          setActionLoadingUid(null);
        }
      }
    });
  };

  // 9. 원격 특별 번역본 권한 토글 (개역개정, NIV 등 - 인앱 확인 모달)
  const handleToggleVersion = (
    user: UserProfile, 
    versionId: 'built-in-krv' | 'built-in-niv',
    versionName: string
  ) => {
    const isCurrentlyAllowed = (user.allowedVersions || []).includes(versionId);
    const actionText = isCurrentlyAllowed ? '회수' : '제공(활성화)';
    const userName = user.displayName || user.email || '회원';

    setConfirmModal({
      isOpen: true,
      title: `${versionName} 번역본 권한 ${actionText}`,
      message: `"${userName}" 회원에게 ${versionName} 번역본을 ${actionText}하시겠습니까?`,
      confirmText: `${actionText}하기`,
      theme: isCurrentlyAllowed ? 'warning' : 'primary',
      onConfirm: async () => {
        setActionLoadingUid(`${user.uid}_${versionId}`);
        try {
          await toggleUserAllowedVersion(user.uid, versionId, !isCurrentlyAllowed);
          showToast(`${versionName} 번역본 ${actionText} 완료!`);
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
          setSelectedUserForDetail(prev => {
            if (!prev || prev.uid !== user.uid) return prev;
            const prevAllowed = prev.allowedVersions || [];
            const nextAllowed = isCurrentlyAllowed 
              ? prevAllowed.filter(id => id !== versionId)
              : [...prevAllowed, versionId];
            return { ...prev, allowedVersions: nextAllowed };
          });
        } catch (err) {
          console.error('Failed to toggle version:', err);
          showToast('번역본 권한 변경 중 오류가 발생했습니다.');
        } finally {
          setActionLoadingUid(null);
        }
      }
    });
  };

  // 로그 전체 삭제
  const handleClearAllLogs = async () => {
    if (logs.length === 0) return;
    setConfirmModal({
      isOpen: true,
      title: '모든 활동 로그 영구 삭제',
      message: `정말로 기록된 모든 활동 로그(${logs.length}건)를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`,
      confirmText: '전체 로그 삭제',
      theme: 'danger',
      onConfirm: async () => {
        setIsDeletingLogs(true);
        try {
          await clearAllActivityLogs(logs.map(l => l.id));
          setLogs([]);
          showToast('모든 활동 로그가 안전하게 삭제되었습니다.');
        } catch (err) {
          console.error('Failed to clear logs:', err);
          showToast('로그 삭제 중 오류가 발생했습니다.');
        } finally {
          setIsDeletingLogs(false);
        }
      }
    });
  };

  // 통계 계산
  const totalUsers = users.length;
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const todayActiveCount = users.filter(u => (u.lastLoginAt || 0) >= todayMidnight.getTime()).length;
  const totalAiUsedCount = users.reduce((acc, u) => acc + (u.aiCredits?.totalUsed || 0), 0);
  const totalPaidRemaining = users.reduce((acc, u) => acc + (u.aiCredits?.paidRemaining || 0), 0);
  const totalMaterialsCount = users.reduce((acc, u) => acc + (u.noteCount || 0) + (u.sermonCount || 0), 0);
  const totalLogsCount = logs.length;

  // 회원 검색 및 정렬 필터링
  const filteredUsers = users
    .filter(u => {
      const q = searchQuery.toLowerCase();
      return (
        (u.email || '').toLowerCase().includes(q) ||
        (u.displayName || '').toLowerCase().includes(q) ||
        (u.uid || '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'recent') return (b.lastLoginAt || 0) - (a.lastLoginAt || 0);
      if (sortBy === 'loginCount') {
        const diff = (b.loginCount || 1) - (a.loginCount || 1);
        if (diff !== 0) return diff;
        return (b.lastLoginAt || 0) - (a.lastLoginAt || 0);
      }
      if (sortBy === 'payment') {
        const payA = calculateTotalPaymentAmount(a.rechargeHistory);
        const payB = calculateTotalPaymentAmount(b.rechargeHistory);
        const diff = payB - payA;
        if (diff !== 0) return diff;
        return (b.rechargeHistory?.length || 0) - (a.rechargeHistory?.length || 0);
      }
      if (sortBy === 'created') return (b.createdAt || 0) - (a.createdAt || 0);
      if (sortBy === 'aiUsed') return (b.aiCredits?.totalUsed || 0) - (a.aiCredits?.totalUsed || 0);
      if (sortBy === 'materials') {
        const matA = (a.noteCount || 0) + (a.sermonCount || 0);
        const matB = (b.noteCount || 0) + (b.sermonCount || 0);
        return matB - matA;
      }
      return 0;
    });

  // 페이징 계산
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PER_PAGE));
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * USERS_PER_PAGE, currentPage * USERS_PER_PAGE);

  // 검색어/정렬 변경 시 1페이지로 리셋
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, sortBy]);

  // 활동 로그 검색 및 필터링
  const filteredLogs = logs.filter(l => {
    const q = logSearchQuery.toLowerCase();
    const matchesQuery = 
      (l.userEmail || '').toLowerCase().includes(q) ||
      (l.userName || '').toLowerCase().includes(q) ||
      (l.action || '').toLowerCase().includes(q) ||
      (l.details || '').toLowerCase().includes(q);

    if (!matchesQuery) return false;
    if (logActionFilter === 'all') return true;
    return (l.action || '').includes(logActionFilter);
  });

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-5">
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-xs"
      />

      {/* Modal Window */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.96, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 15 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-6xl bg-[#FAF9F5] rounded-3xl border border-[#E7E5DF] shadow-2xl overflow-hidden flex flex-col max-h-[94vh] z-10"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-[#E7E5DF] bg-[#F7F5F0] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#C46A40] text-white flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-5 h-5 stroke-[2.2px]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-serif text-lg font-bold text-[#2C2B29]">NATIONS BIBLE 통합 관리자 콘솔</h2>
                <span className="px-2 py-0.5 bg-[#FAF0EB] text-[#C46A40] border border-[#F1D3C6] rounded-md text-[10px] font-bold">
                  최고 관리자: {ADMIN_EMAIL}
                </span>
              </div>
              <p className="text-xs text-[#8C877D]">
                회원 프로필, 작성 자료, AI 크레딧 충전, 원격 번역본 권한 및 실시간 접속 로그 통합 관리
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={refreshAll} 
              disabled={isLoadingUsers || isLoadingLogs}
              className="px-3 py-2 bg-white border border-[#DDD8CE] hover:bg-[#EAE4DA] rounded-xl transition-all text-[#2C2B29] cursor-pointer flex items-center gap-1.5 text-xs font-semibold shadow-2xs"
              title="데이터 전체 새로고침"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingUsers || isLoadingLogs ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">새로고침</span>
            </button>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-[#EAE4DA] rounded-xl transition-colors text-[#8C877D] hover:text-[#2C2B29] cursor-pointer"
            >
              <X className="w-5 h-5 stroke-[2px]" />
            </button>
          </div>
        </div>

        {/* Toast Alert */}
        {toastMsg && (
          <div className="absolute top-20 right-6 z-50 bg-[#2C2B29] text-white text-xs px-4 py-2.5 rounded-xl shadow-xl flex items-center gap-2 animate-bounce">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>{toastMsg}</span>
          </div>
        )}

        {/* 대시보드 메인 탭 네비게이션 (헤더 아래 상단 고정 배치: 스크롤 시 겹침 및 가려짐 완벽 해결) */}
        {isAuthorized && (
          <div className="px-4 sm:px-6 py-2.5 bg-[#FAF9F5] border-b border-[#E7E5DF] flex items-center gap-2 overflow-x-auto custom-scrollbar shrink-0">
            <button
              onClick={() => setActiveTab('users')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                activeTab === 'users'
                  ? 'bg-[#C46A40] text-white shadow-xs'
                  : 'bg-white text-[#6E6A63] border border-[#DDD8CE] hover:bg-[#F5F3ED]'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>회원 관리 및 AI 크레딧 ({totalUsers}명)</span>
            </button>

            <button
              onClick={() => setActiveTab('promotions')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                activeTab === 'promotions'
                  ? 'bg-[#C46A40] text-white shadow-xs'
                  : 'bg-white text-[#6E6A63] border border-[#DDD8CE] hover:bg-[#F5F3ED]'
              }`}
            >
              <Gift className="w-4 h-4" />
              <span>프로모션 & 추천인 관리</span>
              {referralRequests.filter(r => r.status === 'pending').length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-red-500 text-white text-[10px] font-bold">
                  {referralRequests.filter(r => r.status === 'pending').length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('logs')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                activeTab === 'logs'
                  ? 'bg-[#C46A40] text-white shadow-xs'
                  : 'bg-white text-[#6E6A63] border border-[#DDD8CE] hover:bg-[#F5F3ED]'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>실시간 접속 및 활동 로그 ({totalLogsCount}건)</span>
            </button>

            <button
              onClick={() => setActiveTab('policies')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 ${
                activeTab === 'policies'
                  ? 'bg-[#C46A40] text-white shadow-xs'
                  : 'bg-white text-[#6E6A63] border border-[#DDD8CE] hover:bg-[#F5F3ED]'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>서비스 정책 & 약관 관리</span>
            </button>
          </div>
        )}

        {/* Body (본문 스크롤 영역) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-5 custom-scrollbar min-h-0">
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
              {/* 1. 실시간 종합 통계 KPI 카드 (5종) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                <div className="p-3.5 bg-white rounded-2xl border border-[#E7E5DF] shadow-2xs flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#F5F3ED] text-[#6E6A63] flex items-center justify-center shrink-0 border border-[#E7E5DF]">
                    <Users className="w-4 h-4 stroke-[2px]" />
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold text-[#8C877D] uppercase">전체 가입/활동자</span>
                    <p className="text-lg font-bold font-serif text-[#2C2B29]">{totalUsers.toLocaleString()}명</p>
                  </div>
                </div>

                <div className="p-3.5 bg-white rounded-2xl border border-[#E7E5DF] shadow-2xs flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#FAF0EB] text-[#C46A40] flex items-center justify-center shrink-0 border border-[#F1D3C6]">
                    <Clock className="w-4 h-4 stroke-[2px]" />
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold text-[#8C877D] uppercase">오늘 활동자</span>
                    <p className="text-lg font-bold font-serif text-[#C46A40]">{todayActiveCount.toLocaleString()}명</p>
                  </div>
                </div>

                <div className="p-3.5 bg-white rounded-2xl border border-[#E7E5DF] shadow-2xs flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0 border border-indigo-200">
                    <FileText className="w-4 h-4 stroke-[2px]" />
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold text-[#8C877D] uppercase">총 작성 자료</span>
                    <p className="text-lg font-bold font-serif text-indigo-900">{totalMaterialsCount.toLocaleString()}건</p>
                  </div>
                </div>

                <div className="p-3.5 bg-white rounded-2xl border border-[#E7E5DF] shadow-2xs flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 border border-amber-200">
                    <Sparkles className="w-4 h-4 stroke-[2px]" />
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold text-[#8C877D] uppercase">총 AI 연구 실행</span>
                    <p className="text-lg font-bold font-serif text-amber-800">{totalAiUsedCount.toLocaleString()}회</p>
                  </div>
                </div>

                <div className="p-3.5 bg-white rounded-2xl border border-[#E7E5DF] shadow-2xs flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center shrink-0 border border-purple-200">
                    <Activity className="w-4 h-4 stroke-[2px]" />
                  </div>
                  <div>
                    <span className="text-[10px] font-semibold text-[#8C877D] uppercase">누적 활동 로그</span>
                    <p className="text-lg font-bold font-serif text-purple-900">{totalLogsCount.toLocaleString()}건</p>
                  </div>
                </div>
              </div>

              {/* ── [탭 1] 회원 관리 화면 ────────────────────────────────────────── */}
              {activeTab === 'users' && (
                <div className="flex flex-col gap-4">
                  {/* 검색 및 정렬 컨트롤 바 */}
                  <div className="p-3.5 bg-white rounded-2xl border border-[#E7E5DF] shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="relative w-full sm:w-80">
                      <input
                        type="text"
                        placeholder="회원 이메일, 이름, 또는 UID 검색..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-[#FAF9F5] border border-[#DDD8CE] focus:border-[#C46A40] focus:ring-2 focus:ring-[#C46A40]/10 rounded-xl pl-9 pr-3 py-2 text-xs text-[#2C2B29] outline-none transition-all placeholder:text-[#A39E94]"
                      />
                      <Search className="w-4 h-4 text-[#A39E94] absolute left-3 top-2.5 stroke-[1.8px]" />
                    </div>

                    <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end flex-wrap">
                      <span className="text-xs text-[#8C877D]">정렬:</span>
                      <button
                        onClick={() => setSortBy('recent')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${sortBy === 'recent' ? 'bg-[#FAF0EB] text-[#C46A40] border border-[#F1D3C6]' : 'text-[#6E6A63] hover:bg-[#F5F3ED]'}`}
                      >
                        최근 접속순
                      </button>
                      <button
                        onClick={() => setSortBy('loginCount')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${sortBy === 'loginCount' ? 'bg-[#FAF0EB] text-[#C46A40] border border-[#F1D3C6]' : 'text-[#6E6A63] hover:bg-[#F5F3ED]'}`}
                      >
                        접속 많은순
                      </button>
                      <button
                        onClick={() => setSortBy('payment')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${sortBy === 'payment' ? 'bg-[#FAF0EB] text-[#C46A40] border border-[#F1D3C6]' : 'text-[#6E6A63] hover:bg-[#F5F3ED]'}`}
                      >
                        결제금액순
                      </button>
                      <button
                        onClick={() => setSortBy('materials')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${sortBy === 'materials' ? 'bg-[#FAF0EB] text-[#C46A40] border border-[#F1D3C6]' : 'text-[#6E6A63] hover:bg-[#F5F3ED]'}`}
                      >
                        자료 많은순
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

                  {/* 회원 목록 테이블 */}
                  <div className="bg-white rounded-2xl border border-[#E7E5DF] shadow-2xs overflow-hidden">
                    <div className="overflow-x-auto custom-scrollbar">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-[#F7F5F0] border-b border-[#E7E5DF] text-[#6E6A63]">
                            <th className="py-3 px-4 font-bold">이름</th>
                            <th className="py-3 px-4 font-bold">이메일</th>
                            <th className="py-3 px-3 font-bold text-center">기기수</th>
                            <th className="py-3 px-3 font-bold text-center">남은 크레딧</th>
                            <th className="py-3 px-3 font-bold text-center">총 결제수</th>
                            <th className="py-3 px-3 font-bold text-center">최근 결제일</th>
                            <th className="py-3 px-3 font-bold text-center">앱 접속수</th>
                            <th className="py-3 px-4 font-bold text-center">최근 접속일</th>
                            <th className="py-3 px-3 font-bold text-center">상세</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#EFECE6]">
                          {paginatedUsers.length === 0 ? (
                            <tr>
                              <td colSpan={9} className="py-12 text-center">
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
                                  </div>
                                )}
                              </td>
                            </tr>
                          ) : (
                            paginatedUsers.map((user) => {
                              const recHistory = user.rechargeHistory || [];
                              const latestRecharge = recHistory.length > 0 ? recHistory[recHistory.length - 1] : null;
                              const userDevices = (user.devices && user.devices.length > 0) 
                                ? user.devices 
                                : (user.deviceInfo ? [{ device: user.deviceInfo, lastLoginAt: user.lastLoginAt || Date.now(), loginCount: user.loginCount || 1 }] : []);
                              const totalRemainingCredits = (user.aiCredits?.freeRemaining || 0) + (user.aiCredits?.paidRemaining || 0);

                              return (
                                <tr 
                                  key={user.uid} 
                                  onClick={() => setSelectedUserForDetail(user)}
                                  className="hover:bg-[#FAF0EB]/40 transition-colors cursor-pointer group"
                                >
                                  {/* 1. 이름 */}
                                  <td className="py-3.5 px-4 font-bold text-[#2C2B29] whitespace-nowrap">
                                    <div className="flex items-center gap-2">
                                      <div className="w-6 h-6 rounded-full bg-[#EAE5DC] text-[#4A4741] font-bold text-[11px] flex items-center justify-center shrink-0">
                                        {(user.displayName || user.email || 'U')[0].toUpperCase()}
                                      </div>
                                      <span className="group-hover:text-[#C46A40] transition-colors">{user.displayName || '이름 없음'}</span>
                                      {isAdminUser(user.email) && (
                                        <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 text-[9px] font-bold rounded">ADMIN</span>
                                      )}
                                    </div>
                                  </td>

                                  {/* 2. 이메일 */}
                                  <td className="py-3.5 px-4 text-[#5A564F] font-mono text-xs select-all">
                                    {user.email || '이메일 없음'}
                                  </td>

                                  {/* 3. 기기수 */}
                                  <td className="py-3.5 px-3 text-center">
                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full font-bold text-[11px]">
                                      {userDevices.length}대
                                    </span>
                                  </td>

                                  {/* 4. 남은 크레딧 */}
                                  <td className="py-3.5 px-3 text-center font-bold text-[#C46A40]">
                                    {totalRemainingCredits}회
                                  </td>

                                  {/* 5. 총 결제수 */}
                                  <td className="py-3.5 px-3 text-center font-semibold text-[#2C2B29]">
                                    {recHistory.length}건
                                  </td>

                                  {/* 6. 최근 결제일 */}
                                  <td className="py-3.5 px-3 text-center text-[11px] text-[#78746D] whitespace-nowrap">
                                    {latestRecharge ? new Date(latestRecharge.date).toLocaleDateString('ko-KR') : '-'}
                                  </td>

                                  {/* 7. 앱 접속수 */}
                                  <td className="py-3.5 px-3 text-center font-medium text-[#5A564F]">
                                    {user.loginCount || 1}회
                                  </td>

                                  {/* 8. 최근 접속일 */}
                                  <td className="py-3.5 px-4 text-center text-[11px] text-[#78746D] whitespace-nowrap">
                                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('ko-KR', {
                                      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                    }) : '-'}
                                  </td>

                                  {/* 9. 관리 버튼 */}
                                  <td className="py-3.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      type="button"
                                      onClick={() => setSelectedUserForDetail(user)}
                                      className="px-2.5 py-1 bg-white hover:bg-[#FAF0EB] border border-[#DDD8CE] hover:border-[#F1D3C6] text-[#C46A40] rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer"
                                    >
                                      관리
                                    </button>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* 20명 단위 페이징 컨트롤러 */}
                    {totalPages > 1 && (
                      <div className="px-4 py-3 bg-[#FAF9F5] border-t border-[#E7E5DF] flex items-center justify-between text-xs text-[#6E6A63]">
                        <div>
                          총 <strong>{filteredUsers.length}</strong>명 중 {(currentPage - 1) * USERS_PER_PAGE + 1} - {Math.min(currentPage * USERS_PER_PAGE, filteredUsers.length)}명 표시
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="px-2.5 py-1 bg-white border border-[#DDD8CE] rounded-lg disabled:opacity-40 hover:bg-[#F3EFE9] transition-colors cursor-pointer"
                          >
                            이전
                          </button>
                          <span className="px-2 font-bold text-[#2C2B29]">
                            {currentPage} / {totalPages}
                          </span>
                          <button
                            type="button"
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                            className="px-2.5 py-1 bg-white border border-[#DDD8CE] rounded-lg disabled:opacity-40 hover:bg-[#F3EFE9] transition-colors cursor-pointer"
                          >
                            다음
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── [탭 2] 프로모션 & 추천인 관리 화면 ───────────────────────── */}
              {activeTab === 'promotions' && (
                <div className="flex flex-col gap-5">
                  {/* 상단 2열 설정 카드 그리드 */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* 카드 1: 신규 가입 프로모션 설정 */}
                    <div className="p-5 bg-white rounded-2xl border border-[#E7E5DF] shadow-2xs flex flex-col gap-4">
                      <div className="flex items-center justify-between border-b border-[#F0EBE1] pb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-[#FAF0EB] text-[#C46A40] flex items-center justify-center border border-[#F1D3C6]">
                            <Tag className="w-4 h-4" />
                          </div>
                          <div>
                            <h3 className="font-serif font-bold text-sm text-[#2C2B29]">신규 가입 프로모션</h3>
                            <p className="text-[11px] text-[#78746D]">가입 시 자동으로 AI 연구 횟수를 추가 지급합니다.</p>
                          </div>
                        </div>

                        {/* 프로모션 활성화 ON / OFF 직관적인 스위치 */}
                        <div className="flex items-center gap-1.5 p-1 bg-[#FAF9F5] border border-[#DDD8CE] rounded-xl">
                          <button
                            type="button"
                            onClick={async () => {
                              const updated = { ...promoSettings, enabled: true };
                              setPromoSettings(updated);
                              try {
                                await savePromotionSettings(updated);
                                showToast('🟢 프로모션이 활성화(ON) 되었습니다!');
                              } catch (e) {
                                console.error(e);
                              }
                            }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              promoSettings.enabled 
                                ? 'bg-emerald-600 text-white shadow-xs' 
                                : 'text-[#8C877D] hover:text-[#2C2B29] hover:bg-white'
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full ${promoSettings.enabled ? 'bg-white animate-pulse' : 'bg-gray-400'}`}></span>
                            <span>ON (활성화)</span>
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              const updated = { ...promoSettings, enabled: false };
                              setPromoSettings(updated);
                              try {
                                await savePromotionSettings(updated);
                                showToast('⚪ 프로모션이 비활성화(OFF) 되었습니다.');
                              } catch (e) {
                                console.error(e);
                              }
                            }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              !promoSettings.enabled 
                                ? 'bg-gray-700 text-white shadow-xs' 
                                : 'text-[#8C877D] hover:text-[#2C2B29] hover:bg-white'
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full ${!promoSettings.enabled ? 'bg-white' : 'bg-gray-400'}`}></span>
                            <span>OFF (비활성화)</span>
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3 text-xs">
                        <div>
                          <label className="block text-[11px] font-semibold text-[#5A564F] mb-1">프로모션 이름</label>
                          <input
                            type="text"
                            placeholder="예: 특별혜택기간"
                            value={promoSettings.name}
                            onChange={(e) => setPromoSettings(prev => ({ ...prev, name: e.target.value }))}
                            className="w-full px-3 py-2 bg-[#FAF9F5] border border-[#DDD8CE] rounded-xl text-xs text-[#2C2B29] outline-none focus:border-[#C46A40]"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-[#5A564F] mb-1">프로모션 설명</label>
                          <input
                            type="text"
                            placeholder="예: 200크레딧 제공"
                            value={promoSettings.description}
                            onChange={(e) => setPromoSettings(prev => ({ ...prev, description: e.target.value }))}
                            className="w-full px-3 py-2 bg-[#FAF9F5] border border-[#DDD8CE] rounded-xl text-xs text-[#2C2B29] outline-none focus:border-[#C46A40]"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-[#5A564F] mb-1">
                            가입 시 보너스 혜택 지급
                          </label>
                          <div className="grid grid-cols-5 gap-1.5">
                            {[10, 50, 100, 200].map(cnt => (
                              <button
                                key={cnt}
                                type="button"
                                onClick={() => setPromoSettings(prev => ({ ...prev, bonusCredits: cnt }))}
                                className={`py-2 px-1.5 rounded-xl font-bold text-xs transition-all border cursor-pointer text-center ${
                                  promoSettings.bonusCredits === cnt
                                    ? 'bg-[#FAF0EB] text-[#C46A40] border-[#F1D3C6] shadow-2xs ring-1 ring-[#C46A40]'
                                    : 'bg-[#FAF9F5] text-[#6E6A63] border-[#DDD8CE] hover:bg-white'
                                }`}
                              >
                                +{cnt}회
                              </button>
                            ))}
                            <div className="flex items-center">
                              <input
                                type="number"
                                placeholder="직접입력"
                                value={promoSettings.bonusCredits}
                                onChange={(e) => setPromoSettings(prev => ({ ...prev, bonusCredits: Math.max(0, parseInt(e.target.value) || 0) }))}
                                className="w-full px-1.5 py-2 bg-[#FAF9F5] border border-[#DDD8CE] rounded-xl text-xs text-center text-[#2C2B29] outline-none focus:border-[#C46A40]"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="p-3 bg-[#FAF0EB]/60 rounded-xl border border-[#F1D3C6] text-[11px] text-[#524F4A] flex items-center justify-between">
                          <span>신규 가입자 혜택 요약:</span>
                          <strong className="text-[#C46A40]">
                            {promoSettings.enabled && promoSettings.bonusCredits > 0
                              ? `가입 보너스 ${promoSettings.bonusCredits}회 즉시 지급 (소진 시 매월 10회 무료)`
                              : '기본 10회 제공 (프로모션 OFF)'}
                          </strong>
                        </div>

                        <button
                          type="button"
                          onClick={handleSavePromo}
                          disabled={isSavingPromo}
                          className="w-full py-2.5 bg-[#C46A40] hover:bg-[#B55434] text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                        >
                          {isSavingPromo ? '저장 중...' : `프로모션 설정 저장 (${promoSettings.enabled ? '현재: ON 활성화' : '현재: OFF 비활성화'})`}
                        </button>
                      </div>
                    </div>

                    {/* 카드 2: 추천인 혜택 설정 (50회, 100회, 직접 입력) */}
                    <div className="p-5 bg-white rounded-2xl border border-[#E7E5DF] shadow-2xs flex flex-col gap-4">
                      <div className="flex items-center justify-between border-b border-[#F0EBE1] pb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-200">
                            <Gift className="w-4 h-4" />
                          </div>
                          <div>
                            <h3 className="font-serif font-bold text-sm text-[#2C2B29]">추천인 혜택 설정</h3>
                            <p className="text-[11px] text-[#78746D]">친구 추천 가입 시 추천인에게 지급할 AI 크레딧 혜택</p>
                          </div>
                        </div>
                      </div>

                      {/* 1인당 혜택 설정 (50회 / 100회 / 임의 기입 칸) */}
                      <div className="space-y-3">
                        <label className="block text-[11px] font-semibold text-[#5A564F]">
                          추천 1인당 지급 혜택 (결제/혜택창에 자동 노출)
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {[50, 100].map(cnt => (
                            <button
                              key={cnt}
                              type="button"
                              onClick={() => handleSaveReferral(cnt)}
                              disabled={isSavingReferral}
                              className={`py-2 px-3 rounded-xl font-bold text-xs transition-all border cursor-pointer flex items-center justify-center gap-1.5 ${
                                referralSettings.bonusCredits === cnt
                                  ? 'bg-purple-50 text-purple-800 border-purple-300 shadow-2xs ring-1 ring-purple-500'
                                  : 'bg-[#FAF9F5] text-[#6E6A63] border-[#DDD8CE] hover:bg-white'
                              }`}
                            >
                              <Award className="w-3.5 h-3.5 text-purple-600" />
                              <span>{cnt}회 설정</span>
                            </button>
                          ))}

                          {/* 직접 입력 칸 */}
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              placeholder="직접 입력"
                              value={customReferralInput}
                              onChange={(e) => setCustomReferralInput(e.target.value)}
                              className="w-full px-2 py-1.5 bg-[#FAF9F5] border border-[#DDD8CE] rounded-xl text-xs text-center text-[#2C2B29] outline-none focus:border-purple-500"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const n = parseInt(customReferralInput, 10);
                                if (isNaN(n) || n <= 0) {
                                  alert('올바른 횟수를 입력해주세요.');
                                  return;
                                }
                                handleSaveReferral(n);
                                setCustomReferralInput('');
                              }}
                              disabled={isSavingReferral || !customReferralInput}
                              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shrink-0 cursor-pointer disabled:opacity-40 transition-all shadow-2xs"
                            >
                              저장
                            </button>
                          </div>
                        </div>

                        <div className="p-3 bg-purple-50/70 rounded-xl border border-purple-200 text-[11px] text-purple-900 flex items-center justify-between">
                          <span>현재 설정된 추천 보너스:</span>
                          <strong className="text-purple-700 font-bold">
                            친구 1명 추천 시 +{referralSettings.bonusCredits || 50}회 지급
                          </strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 하단: 친구 추천 신청 및 승인 관리 목록 (referral_requests) */}
                  <div className="p-5 bg-white rounded-2xl border border-[#E7E5DF] shadow-2xs flex flex-col gap-3">
                    <div className="flex items-center justify-between border-b border-[#F0EBE1] pb-3">
                      <div className="flex items-center gap-2">
                        <Gift className="w-4 h-4 text-[#C46A40]" />
                        <h3 className="font-serif font-bold text-sm text-[#2C2B29]">친구 추천 신청 및 보상 승인 목록</h3>
                        <span className="px-2 py-0.5 rounded-full bg-[#FAF0EB] text-[#C46A40] text-[10px] font-bold">
                          총 {referralRequests.length}건 (대기 {referralRequests.filter(r => r.status === 'pending').length}건)
                        </span>
                      </div>
                      <p className="text-[11px] text-[#8C877D] hidden sm:block">
                        이용자가 결제창에서 신청한 추천 내역입니다. 친구 가입 여부를 확인 후 승인하시면 즉시 혜택이 지급됩니다.
                      </p>
                    </div>

                    {referralRequests.length === 0 ? (
                      <div className="py-12 text-center text-[#8C877D] space-y-1">
                        <Gift className="w-8 h-8 mx-auto text-[#CCC8C0] stroke-[1.5]" />
                        <p className="text-xs">접수된 친구 추천 신청 내역이 없습니다.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-[#EAE6DE] rounded-xl custom-scrollbar">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-[#FAF9F5] border-b border-[#EAE6DE] text-[#8C877D] text-[11px]">
                              <th className="py-2.5 px-3">추천인 (신청자 이메일)</th>
                              <th className="py-2.5 px-3">친구 (가입 이메일)</th>
                              <th className="py-2.5 px-3">친구 가입 여부</th>
                              <th className="py-2.5 px-3">혜택 횟수</th>
                              <th className="py-2.5 px-3">신청 일시</th>
                              <th className="py-2.5 px-3">상태</th>
                              <th className="py-2.5 px-3 text-right">작업</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#F0EBE1]">
                            {referralRequests.map(req => {
                              const cleanFriendEmail = (req.friendEmail || '').toLowerCase().trim();
                              const isFriendSignedUp = Boolean(cleanFriendEmail && users.some(u => 
                                (u.email || '').toLowerCase().trim() === cleanFriendEmail
                              ));
                              const isPending = req.status === 'pending';
                              const isApproved = req.status === 'approved';

                              return (
                                <tr key={req.id} className="hover:bg-[#FAF9F5] transition-colors">
                                  <td className="py-2.5 px-3">
                                    <div className="font-bold text-[#2C2B29]">{req.referrerEmail}</div>
                                    {req.referrerName && req.referrerName !== req.referrerEmail.split('@')[0] && (
                                      <div className="text-[10px] text-[#8C877D]">{req.referrerName}</div>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 font-medium text-[#2C2B29]">
                                    <div className="font-bold text-[#2C2B29]">{req.friendEmail}</div>
                                    {req.friendName && req.friendName !== req.friendEmail.split('@')[0] && (
                                      <div className="text-[10px] text-[#8C877D]">{req.friendName}</div>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    {isFriendSignedUp ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                        <CheckCircle2 className="w-3 h-3" />
                                        <span>가입 확인됨 (회원)</span>
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                        <AlertCircle className="w-3 h-3" />
                                        <span>미가입 회원 (확인필요)</span>
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <span className="font-bold text-[#C46A40]">+{req.bonusCredits}회</span>
                                  </td>
                                  <td className="py-2.5 px-3 text-[11px] text-[#8C877D]">
                                    {new Date(req.createdAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                  </td>
                                  <td className="py-2.5 px-3">
                                    {isApproved ? (
                                      <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                                        지급 완료
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-bold text-[10px]">
                                        검토 대기
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      {isPending && (
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleApproveReferral(req); }}
                                          disabled={actionLoadingUid === req.id}
                                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold transition-all cursor-pointer shadow-2xs disabled:opacity-50"
                                        >
                                          {actionLoadingUid === req.id ? '지급 중...' : '승인 및 혜택 지급'}
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleDeleteReferral(req.id); }}
                                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                                        title="신청 내역 삭제"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── [탭 2] 실시간 활동 로그 화면 (activity_logs) ────────────────── */}
              {activeTab === 'logs' && (
                <div className="flex flex-col gap-4">
                  {/* 로그 검색 및 필터 & 관리 버튼 */}
                  <div className="p-3.5 bg-white rounded-2xl border border-[#E7E5DF] shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="relative w-full sm:w-80">
                      <input
                        type="text"
                        placeholder="이메일, 이름, 활동내역 검색..."
                        value={logSearchQuery}
                        onChange={(e) => setLogSearchQuery(e.target.value)}
                        className="w-full bg-[#FAF9F5] border border-[#DDD8CE] focus:border-[#C46A40] focus:ring-2 focus:ring-[#C46A40]/10 rounded-xl pl-9 pr-3 py-2 text-xs text-[#2C2B29] outline-none transition-all placeholder:text-[#A39E94]"
                      />
                      <Search className="w-4 h-4 text-[#A39E94] absolute left-3 top-2.5 stroke-[1.8px]" />
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setLogActionFilter('all')}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                            logActionFilter === 'all' ? 'bg-[#FAF0EB] text-[#C46A40] border border-[#F1D3C6]' : 'text-[#6E6A63] hover:bg-[#F5F3ED]'
                          }`}
                        >
                          전체
                        </button>
                        <button
                          onClick={() => setLogActionFilter('로그인')}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                            logActionFilter === '로그인' ? 'bg-[#FAF0EB] text-[#C46A40] border border-[#F1D3C6]' : 'text-[#6E6A63] hover:bg-[#F5F3ED]'
                          }`}
                        >
                          로그인
                        </button>
                      </div>

                      <div className="h-4 w-px bg-[#E7E5DF] mx-1" />

                      <button
                        onClick={handleClearAllLogs}
                        disabled={isDeletingLogs || logs.length === 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-200 text-red-600 rounded-xl text-xs font-medium hover:bg-red-50 transition-colors disabled:opacity-50 cursor-pointer shadow-2xs"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>전체 로그 삭제</span>
                      </button>
                    </div>
                  </div>

                  {/* 활동 로그 테이블 */}
                  <div className="bg-white rounded-2xl border border-[#E7E5DF] shadow-2xs overflow-hidden">
                    <div className="overflow-x-auto custom-scrollbar">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-[#F7F5F0] border-b border-[#E7E5DF] text-[#6E6A63]">
                            <th className="py-3 px-4 font-bold w-48">발생 시각</th>
                            <th className="py-3 px-4 font-bold w-60">계정 (이메일 / 이름)</th>
                            <th className="py-3 px-4 font-bold w-32">활동 내역</th>
                            <th className="py-3 px-4 font-bold">상세 내용</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#EFECE6]">
                          {filteredLogs.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="py-12 text-center text-[#A39E94]">
                                <Activity className="w-8 h-8 opacity-40 mx-auto mb-2" />
                                <p className="font-medium">기록된 활동 로그가 없습니다.</p>
                              </td>
                            </tr>
                          ) : (
                            filteredLogs.map((log) => {
                              const isLogin = log.action === '로그인';
                              const formattedTime = log.timestamp ? new Date(log.timestamp).toLocaleString('ko-KR', {
                                year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
                              }) : '-';

                              return (
                                <tr key={log.id} className="hover:bg-[#FAF9F5] transition-colors">
                                  <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                                    {formattedTime}
                                  </td>
                                  <td className="py-3 px-4">
                                    <div className="font-bold text-[#2C2B29]">{log.userName || '이름 없음'}</div>
                                    <div className="text-[11px] text-[#8C877D] font-mono select-all">{log.userEmail || '-'}</div>
                                  </td>
                                  <td className="py-3 px-4">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                                      isLogin 
                                        ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
                                        : 'bg-amber-50 text-amber-700 border-amber-200'
                                    }`}>
                                      {log.action}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-[#6E6A63]">
                                    {log.details ? (
                                      <span className="font-mono text-[11px] bg-[#FAF9F5] px-2 py-1 rounded border border-[#E7E5DF] inline-block max-w-lg truncate" title={log.details}>
                                        {log.details}
                                      </span>
                                    ) : (
                                      <span className="text-[#A39E94]">-</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* 4. 서비스 정책, 약관 & 푸터 사업자 정보 관리 탭 */}
              {activeTab === 'policies' && (
                <div className="space-y-5">
                  {/* 최상단 헤더 카드 (스크린샷과 100% 일치) */}
                  <div className="bg-white rounded-2xl border border-[#E7E5DF] p-5 sm:p-6 shadow-xs flex items-start gap-4">
                    <div className="w-11 h-11 rounded-2xl bg-[#1F2937] flex items-center justify-center text-amber-400 shrink-0 shadow-xs">
                      <FileText className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-serif font-bold text-base sm:text-lg text-[#2B2927]">
                          서비스 정책, 약관 & 푸터 사업자 정보 설정
                        </h3>
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 border border-blue-200 text-[11px] font-bold">
                          스토어 심사 & 법적 고지
                        </span>
                      </div>
                      <p className="text-xs text-[#8C877D] mt-1">
                        서비스 이용약관, 개인정보 처리방침, 하단 푸터에 표시될 사업자/고객센터 정보 및 카카오톡 채널을 수정합니다.
                      </p>
                    </div>
                  </div>

                  {/* 서브 탭 바 (스크린샷 일치) */}
                  <div className="flex items-center gap-2 border-b border-[#E7E5DF] pb-2 overflow-x-auto custom-scrollbar">
                    <button
                      onClick={() => setPolicySubTab('business')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                        policySubTab === 'business'
                          ? 'bg-[#1F2937] text-white shadow-xs'
                          : 'bg-white text-[#6E6A63] border border-[#DDD8CE] hover:bg-[#F5F3ED]'
                      }`}
                    >
                      <Building2 className="w-4 h-4" />
                      <span>사업자 & 푸터 기본 정보</span>
                    </button>

                    <button
                      onClick={() => setPolicySubTab('terms')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                        policySubTab === 'terms'
                          ? 'bg-blue-50 text-blue-700 border border-blue-300 shadow-xs font-bold'
                          : 'bg-white text-[#6E6A63] border border-[#DDD8CE] hover:bg-[#F5F3ED]'
                      }`}
                    >
                      <FileText className="w-4 h-4 text-blue-500" />
                      <span>서비스 이용약관 (무료앱 기준)</span>
                    </button>

                    <button
                      onClick={() => setPolicySubTab('privacy')}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                        policySubTab === 'privacy'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 shadow-xs font-bold'
                          : 'bg-white text-[#6E6A63] border border-[#DDD8CE] hover:bg-[#F5F3ED]'
                      }`}
                    >
                      <ShieldCheck className="w-4 h-4 text-emerald-500" />
                      <span>개인정보 처리방침</span>
                    </button>
                  </div>

                  {/* 서브 탭 1: 사업자 & 푸터 기본 정보 및 카카오톡 채널 */}
                  {policySubTab === 'business' && (
                    <div className="bg-white rounded-2xl border border-[#E7E5DF] p-5 sm:p-6 shadow-xs space-y-5">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* 서비스 / 상호명 */}
                        <div>
                          <label className="block text-xs font-semibold text-[#524E48] mb-1.5">
                            서비스 / 상호명
                          </label>
                          <input
                            type="text"
                            value={policySettings.businessName}
                            onChange={(e) => setPolicySettings({ ...policySettings, businessName: e.target.value })}
                            placeholder="네이션스 솔루션"
                            className="w-full px-3 py-2 bg-white border border-[#DDD8CE] rounded-xl text-xs text-[#2B2927] focus:outline-hidden focus:border-[#C46A40] transition-colors"
                          />
                        </div>

                        {/* 대표자명 (선택) */}
                        <div>
                          <label className="block text-xs font-semibold text-[#524E48] mb-1.5">
                            대표자명 (선택)
                          </label>
                          <input
                            type="text"
                            value={policySettings.representative}
                            onChange={(e) => setPolicySettings({ ...policySettings, representative: e.target.value })}
                            placeholder="예) 홍길동"
                            className="w-full px-3 py-2 bg-white border border-[#DDD8CE] rounded-xl text-xs text-[#2B2927] focus:outline-hidden focus:border-[#C46A40] transition-colors"
                          />
                        </div>

                        {/* 고객센터 / 문의 이메일 */}
                        <div>
                          <label className="block text-xs font-semibold text-[#524E48] mb-1.5">
                            고객센터 / 문의 이메일
                          </label>
                          <input
                            type="email"
                            value={policySettings.contactEmail}
                            onChange={(e) => setPolicySettings({ ...policySettings, contactEmail: e.target.value })}
                            placeholder="ymoonsik@gmail.com"
                            className="w-full px-3 py-2 bg-white border border-[#DDD8CE] rounded-xl text-xs text-[#2B2927] focus:outline-hidden focus:border-[#C46A40] transition-colors"
                          />
                        </div>

                        {/* 사업자등록번호 (선택) */}
                        <div>
                          <label className="block text-xs font-semibold text-[#524E48] mb-1.5">
                            사업자등록번호 (선택)
                          </label>
                          <input
                            type="text"
                            value={policySettings.businessNumber}
                            onChange={(e) => setPolicySettings({ ...policySettings, businessNumber: e.target.value })}
                            placeholder="000-00-00000"
                            className="w-full px-3 py-2 bg-white border border-[#DDD8CE] rounded-xl text-xs text-[#2B2927] focus:outline-hidden focus:border-[#C46A40] transition-colors"
                          />
                        </div>

                        {/* 통신판매업신고번호 (선택) */}
                        <div>
                          <label className="block text-xs font-semibold text-[#524E48] mb-1.5">
                            통신판매업신고번호 (선택)
                          </label>
                          <input
                            type="text"
                            value={policySettings.ecommerceNumber}
                            onChange={(e) => setPolicySettings({ ...policySettings, ecommerceNumber: e.target.value })}
                            placeholder="제2026-서울-0000호"
                            className="w-full px-3 py-2 bg-white border border-[#DDD8CE] rounded-xl text-xs text-[#2B2927] focus:outline-hidden focus:border-[#C46A40] transition-colors"
                          />
                        </div>

                        {/* 저작권 문구 (Copyright) */}
                        <div>
                          <label className="block text-xs font-semibold text-[#524E48] mb-1.5">
                            저작권 문구 (Copyright)
                          </label>
                          <input
                            type="text"
                            value={policySettings.copyright}
                            onChange={(e) => setPolicySettings({ ...policySettings, copyright: e.target.value })}
                            placeholder="Copyright © 2026 Nations. All rights reserved."
                            className="w-full px-3 py-2 bg-white border border-[#DDD8CE] rounded-xl text-xs text-[#2B2927] focus:outline-hidden focus:border-[#C46A40] transition-colors"
                          />
                        </div>
                      </div>

                      {/* 카카오톡 채널 연동 설정 (요청 사항) */}
                      <div className="pt-4 border-t border-[#F0EBE1] space-y-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-[#2B2927]">
                          <span className="w-5 h-5 rounded-md bg-[#FEE500] text-[#3C1E1E] flex items-center justify-center text-[10px] font-black">
                            💬
                          </span>
                          <span>카카오톡 채널 & 1:1 고객상담 연동 정보</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-xs font-semibold text-[#524E48] mb-1.5">
                              카카오톡 채널 이름
                            </label>
                            <input
                              type="text"
                              value={policySettings.kakaoChannelName}
                              onChange={(e) => setPolicySettings({ ...policySettings, kakaoChannelName: e.target.value })}
                              placeholder="네이션스 솔루션"
                              className="w-full px-3 py-2 bg-white border border-[#DDD8CE] rounded-xl text-xs text-[#2B2927] focus:outline-hidden focus:border-[#C46A40] transition-colors"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-[#524E48] mb-1.5">
                              카카오톡 채널 홈 URL
                            </label>
                            <input
                              type="text"
                              value={policySettings.kakaoChannelUrl}
                              onChange={(e) => setPolicySettings({ ...policySettings, kakaoChannelUrl: e.target.value })}
                              placeholder="http://pf.kakao.com/_cxjBxaX"
                              className="w-full px-3 py-2 bg-white border border-[#DDD8CE] rounded-xl text-xs text-[#2B2927] focus:outline-hidden focus:border-[#C46A40] transition-colors"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-[#524E48] mb-1.5">
                              카카오톡 1:1 채팅 URL
                            </label>
                            <input
                              type="text"
                              value={policySettings.kakaoChatUrl}
                              onChange={(e) => setPolicySettings({ ...policySettings, kakaoChatUrl: e.target.value })}
                              placeholder="http://pf.kakao.com/_cxjBxaX/chat"
                              className="w-full px-3 py-2 bg-white border border-[#DDD8CE] rounded-xl text-xs text-[#2B2927] focus:outline-hidden focus:border-[#C46A40] transition-colors"
                            />
                          </div>
                        </div>
                      </div>

                      {/* 저장 버튼 */}
                      <div className="pt-4 border-t border-[#F0EBE1] flex justify-end">
                        <button
                          type="button"
                          onClick={handleSavePolicy}
                          disabled={isSavingPolicy}
                          className="px-5 py-2.5 bg-[#1F2937] hover:bg-black text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs flex items-center gap-2 active:scale-95 disabled:opacity-50"
                        >
                          <FileText className="w-4 h-4" />
                          <span>{isSavingPolicy ? '저장 중...' : '서비스 정책 및 사업자 정보 저장'}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 서브 탭 2: 서비스 이용약관 (무료앱 기준) */}
                  {policySubTab === 'terms' && (
                    <div className="bg-white rounded-2xl border border-[#E7E5DF] p-5 sm:p-6 shadow-xs space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-[#2B2927] flex items-center gap-2">
                            <FileText className="w-4 h-4 text-blue-600" />
                            <span>서비스 이용약관 본문 수정</span>
                          </h4>
                          <p className="text-[11px] text-[#8C877D] mt-0.5">
                            사용자 앱 및 회원가입 화면에서 조회할 수 있는 표준 이용약관입니다.
                          </p>
                        </div>
                      </div>

                      <textarea
                        rows={16}
                        value={policySettings.termsOfService}
                        onChange={(e) => setPolicySettings({ ...policySettings, termsOfService: e.target.value })}
                        className="w-full p-4 bg-[#FAF9F5] border border-[#DDD8CE] rounded-xl text-xs font-mono text-[#2B2927] leading-relaxed focus:outline-hidden focus:border-[#C46A40] transition-colors custom-scrollbar"
                      />

                      <div className="pt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={handleSavePolicy}
                          disabled={isSavingPolicy}
                          className="px-5 py-2.5 bg-[#1F2937] hover:bg-black text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs flex items-center gap-2 active:scale-95 disabled:opacity-50"
                        >
                          <FileText className="w-4 h-4" />
                          <span>{isSavingPolicy ? '저장 중...' : '서비스 이용약관 저장'}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 서브 탭 3: 개인정보 처리방침 */}
                  {policySubTab === 'privacy' && (
                    <div className="bg-white rounded-2xl border border-[#E7E5DF] p-5 sm:p-6 shadow-xs space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-bold text-[#2B2927] flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-emerald-600" />
                            <span>개인정보 처리방침 본문 수정</span>
                          </h4>
                          <p className="text-[11px] text-[#8C877D] mt-0.5">
                            Google 로그인 시 개인정보 수집, 클라우드 동기화 및 보관 기준을 규정한 법적 고지문입니다.
                          </p>
                        </div>
                      </div>

                      <textarea
                        rows={16}
                        value={policySettings.privacyPolicy}
                        onChange={(e) => setPolicySettings({ ...policySettings, privacyPolicy: e.target.value })}
                        className="w-full p-4 bg-[#FAF9F5] border border-[#DDD8CE] rounded-xl text-xs font-mono text-[#2B2927] leading-relaxed focus:outline-hidden focus:border-[#C46A40] transition-colors custom-scrollbar"
                      />

                      <div className="pt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={handleSavePolicy}
                          disabled={isSavingPolicy}
                          className="px-5 py-2.5 bg-[#1F2937] hover:bg-black text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs flex items-center gap-2 active:scale-95 disabled:opacity-50"
                        >
                          <ShieldCheck className="w-4 h-4" />
                          <span>{isSavingPolicy ? '저장 중...' : '개인정보 처리방침 저장'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* 회원 상세 관리 모달 (Master-Detail 구조: 회원 행 클릭 시 1:1 온디맨드 팝업) */}
        {typeof document !== 'undefined' && createPortal(
          <AnimatePresence>
            {selectedUserForDetail && (
              <div
                className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    e.stopPropagation();
                    setSelectedUserForDetail(null);
                  }
                }}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 15 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 15 }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full max-w-4xl bg-[#FAF9F5] border border-[#E7E5DF] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-left"
                >
                  {/* 상세 모달 헤더 */}
                  <div className="p-5 sm:p-6 bg-white border-b border-[#E7E5DF] flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-12 h-12 rounded-2xl bg-[#FAF0EB] text-[#C46A40] border border-[#F1D3C6] font-bold text-lg flex items-center justify-center shrink-0">
                        {(selectedUserForDetail.displayName || selectedUserForDetail.email || 'U')[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base sm:text-lg font-bold text-[#2C2B29] truncate">
                            {selectedUserForDetail.displayName || '이름 없음'}
                          </h3>
                          {isAdminUser(selectedUserForDetail.email) && (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-md border border-amber-200">
                              최고관리자 (ADMIN)
                            </span>
                          )}
                          <span className="px-2 py-0.5 bg-[#FAF0EB] text-[#C46A40] text-[10px] font-semibold rounded-md border border-[#F1D3C6]">
                            UID: {selectedUserForDetail.uid.slice(0, 10)}...
                          </span>
                        </div>
                        <p className="text-xs text-[#78746D] font-mono mt-0.5 truncate select-all">
                          {selectedUserForDetail.email || '이메일 없음'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setSelectedUserForDetail(null)}
                        className="p-2 text-[#8C877D] hover:text-[#2C2B29] hover:bg-[#F3EFE9] rounded-xl transition-colors cursor-pointer"
                        title="닫기"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  {/* 상세 모달 본문 (스크롤) */}
                  <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 custom-scrollbar text-xs">
                    {/* 1. 결제 & 크레딧 종합 KPI 요약 카드 (4열) */}
                    <div>
                      <h4 className="text-xs font-bold text-[#6E6A63] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                        <CreditCard className="w-4 h-4 text-[#C46A40]" />
                        <span>결제 및 크레딧 종합 현황</span>
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="p-4 bg-white rounded-2xl border border-[#E7E5DF] shadow-2xs">
                          <span className="text-[10px] font-bold text-[#8C877D] uppercase">총 결제 누적 금액</span>
                          <p className="text-lg font-bold font-serif text-[#C46A40] mt-0.5">
                            {calculateTotalPaymentAmount(selectedUserForDetail.rechargeHistory).toLocaleString()}원
                          </p>
                          <span className="text-[10px] text-[#A39E94]">
                            총 {(selectedUserForDetail.rechargeHistory || []).length}건 결제/충전
                          </span>
                        </div>

                        <div className="p-4 bg-white rounded-2xl border border-[#E7E5DF] shadow-2xs">
                          <span className="text-[10px] font-bold text-[#8C877D] uppercase">남은 AI 크레딧</span>
                          <p className="text-lg font-bold font-serif text-[#2C2B29] mt-0.5">
                            {((selectedUserForDetail.aiCredits?.paidRemaining || 0) + (selectedUserForDetail.aiCredits?.freeRemaining || 0)).toLocaleString()}회
                          </p>
                          <span className="text-[10px] text-[#A39E94]">
                            유료 {selectedUserForDetail.aiCredits?.paidRemaining || 0} / 무료 {selectedUserForDetail.aiCredits?.freeRemaining || 0}
                          </span>
                        </div>

                        <div className="p-4 bg-white rounded-2xl border border-[#E7E5DF] shadow-2xs">
                          <span className="text-[10px] font-bold text-[#8C877D] uppercase">주석 클라우드 보관한도</span>
                          <p className="text-lg font-bold font-serif text-indigo-700 mt-0.5">
                            {(selectedUserForDetail.cloudCommentaryLimit || 0) >= 30000 
                              ? '무제한(전권)' 
                              : `${(selectedUserForDetail.cloudCommentaryLimit || 0).toLocaleString()}구절`}
                          </p>
                          <span className="text-[10px] text-[#A39E94]">
                            현재 보관: {selectedUserForDetail.usedCloudCommentaryCount || 0}구절
                          </span>
                        </div>

                        <div className="p-4 bg-white rounded-2xl border border-[#E7E5DF] shadow-2xs">
                          <span className="text-[10px] font-bold text-[#8C877D] uppercase">앱 접속 현황</span>
                          <p className="text-lg font-bold font-serif text-emerald-700 mt-0.5">
                            총 {selectedUserForDetail.loginCount || 1}회 접속
                          </p>
                          <span className="text-[10px] text-[#A39E94]">
                            최근: {selectedUserForDetail.lastLoginAt ? new Date(selectedUserForDetail.lastLoginAt).toLocaleDateString('ko-KR') : '-'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 2. 결제 & 충전 히스토리 내역 (전체 목록) */}
                    <div className="bg-white rounded-2xl border border-[#E7E5DF] p-4 sm:p-5 shadow-2xs">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-bold text-xs text-[#2C2B29] flex items-center gap-2">
                          <FileText className="w-4 h-4 text-[#C46A40]" />
                          <span>상세 결제 및 충전 히스토리 ({(selectedUserForDetail.rechargeHistory || []).length}건)</span>
                        </h4>
                        <span className="text-[11px] text-[#8C877D]">
                          총 결제 합계: <strong className="text-[#C46A40]">{calculateTotalPaymentAmount(selectedUserForDetail.rechargeHistory).toLocaleString()}원</strong>
                        </span>
                      </div>

                      {(!selectedUserForDetail.rechargeHistory || selectedUserForDetail.rechargeHistory.length === 0) ? (
                        <div className="py-8 text-center text-[#A39E94] bg-[#FAF9F5] rounded-xl border border-dashed border-[#DDD8CE]">
                          <p>결제 및 충전 이력이 존재하지 않습니다.</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto custom-scrollbar">
                          <table className="w-full text-left border-collapse text-[11px]">
                            <thead>
                              <tr className="bg-[#FAF9F5] border-b border-[#E7E5DF] text-[#6E6A63]">
                                <th className="py-2.5 px-3 font-bold">결제/충전 일시</th>
                                <th className="py-2.5 px-3 font-bold">플랜 / 지급 사유</th>
                                <th className="py-2.5 px-3 font-bold text-center">충전량</th>
                                <th className="py-2.5 px-3 font-bold text-center">결제금액</th>
                                <th className="py-2.5 px-3 font-bold text-center">유효기간</th>
                                <th className="py-2.5 px-3 font-bold text-center">잔여량</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#EFECE6]">
                              {selectedUserForDetail.rechargeHistory.map((item, idx) => {
                                const anyItem = item as any;
                                let itemPrice = anyItem.price;
                                if (!itemPrice) {
                                  const plan = (item.planName || '').toLowerCase();
                                  if (plan.includes('관리자') || plan.includes('프로모션') || plan.includes('이벤트') || plan.includes('가입') || plan.includes('추천')) {
                                    itemPrice = 0;
                                  } else if (item.amount === 100 || plan.includes('베이직')) {
                                    itemPrice = 9900;
                                  } else if (item.amount === 300 || plan.includes('프로')) {
                                    itemPrice = 24900;
                                  } else if (item.amount === 1000 || plan.includes('프리미엄')) {
                                    itemPrice = 69000;
                                  } else if (plan.includes('300구절') || plan.includes('클라우드 300')) {
                                    itemPrice = 3300;
                                  } else if (plan.includes('1000구절') || plan.includes('클라우드 1000')) {
                                    itemPrice = 9900;
                                  } else if (plan.includes('무제한')) {
                                    itemPrice = 29900;
                                  } else {
                                    itemPrice = 0;
                                  }
                                }

                                return (
                                  <tr key={item.id || idx} className="hover:bg-[#FAF0EB]/30 transition-colors">
                                    <td className="py-2 px-3 text-[#5A564F] whitespace-nowrap">
                                      {item.date ? new Date(item.date).toLocaleString('ko-KR', {
                                        year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                      }) : '-'}
                                    </td>
                                    <td className="py-2 px-3 font-medium text-[#2C2B29]">
                                      {item.planName || '충전 플랜'}
                                    </td>
                                    <td className="py-2 px-3 text-center font-bold text-[#C46A40]">
                                      +{item.amount}회
                                    </td>
                                    <td className="py-2 px-3 text-center font-semibold text-[#2C2B29]">
                                      {itemPrice > 0 ? `${itemPrice.toLocaleString()}원` : <span className="text-emerald-600 font-normal">무료 지급</span>}
                                    </td>
                                    <td className="py-2 px-3 text-center text-[#78746D] whitespace-nowrap">
                                      {item.expiresAt ? new Date(item.expiresAt).toLocaleDateString('ko-KR') : '365일'}
                                    </td>
                                    <td className="py-2 px-3 text-center font-mono text-[#5A564F]">
                                      {item.remaining !== undefined ? `${item.remaining}회` : '-'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* 3. 접속 기기 세션 현황 */}
                    <div className="bg-white rounded-2xl border border-[#E7E5DF] p-4 sm:p-5 shadow-2xs">
                      <h4 className="font-bold text-xs text-[#2C2B29] flex items-center gap-2 mb-3">
                        <Smartphone className="w-4 h-4 text-slate-700" />
                        <span>접속 기기 세션 현황 (다중 기기 관리)</span>
                      </h4>
                      {(() => {
                        const devices = (selectedUserForDetail.devices && selectedUserForDetail.devices.length > 0)
                          ? selectedUserForDetail.devices
                          : (selectedUserForDetail.deviceInfo ? [{ device: selectedUserForDetail.deviceInfo, lastLoginAt: selectedUserForDetail.lastLoginAt || Date.now(), loginCount: selectedUserForDetail.loginCount || 1 }] : []);

                        if (devices.length === 0) {
                          return <p className="text-xs text-[#8C877D]">기록된 접속 기기 정보가 없습니다.</p>;
                        }

                        return (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                            {devices.map((dev, idx) => (
                              <div key={idx} className="p-3 bg-[#FAF9F5] border border-[#DDD8CE] rounded-xl flex flex-col gap-1">
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-[#2C2B29] truncate">{dev.device}</span>
                                  <span className="px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded text-[10px] font-bold shrink-0">
                                    {dev.loginCount || 1}회
                                  </span>
                                </div>
                                <span className="text-[10px] text-[#78746D]">
                                  최근: {dev.lastLoginAt ? new Date(dev.lastLoginAt).toLocaleString('ko-KR', {
                                    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                  }) : '-'}
                                </span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>

                    {/* 4. 관리자 원격 권한 제어 & 지급 조치 도구 (하단) */}
                    <div className="bg-white rounded-2xl border border-[#E7E5DF] p-4 sm:p-5 shadow-2xs space-y-4">
                      <h4 className="font-bold text-xs text-[#2C2B29] flex items-center gap-2 border-b border-[#F0EBE1] pb-2.5">
                        <ShieldCheck className="w-4 h-4 text-[#C46A40]" />
                        <span>관리자 원격 권한 제어 및 즉시 지급</span>
                      </h4>

                      {/* 4-1. 특별 번역본 열람 권한 */}
                      <div className="space-y-2">
                        <label className="block text-[11px] font-bold text-[#5A564F]">
                          특별 번역본 열람 권한 제어
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* 개역개정 토글 카드 */}
                          {(() => {
                            const isAllowed = (selectedUserForDetail.allowedVersions || []).includes('built-in-krv');
                            return (
                              <div 
                                onClick={() => handleToggleVersion(selectedUserForDetail, 'built-in-krv', '개역개정')}
                                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                                  isAllowed ? 'bg-emerald-50/70 border-emerald-300' : 'bg-[#FAF9F5] border-[#DDD8CE] hover:bg-white'
                                }`}
                              >
                                <div>
                                  <span className="font-bold text-[#2C2B29] block">개역개정 (KRV)</span>
                                  <span className="text-[10px] text-[#78746D]">표준 한글 성경 번역본</span>
                                </div>
                                <div className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                                  isAllowed ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-700'
                                }`}>
                                  {isAllowed ? '✓ 허용됨' : '차단/미제공'}
                                </div>
                              </div>
                            );
                          })()}

                          {/* NIV 토글 카드 */}
                          {(() => {
                            const isAllowed = (selectedUserForDetail.allowedVersions || []).includes('built-in-niv');
                            return (
                              <div 
                                onClick={() => handleToggleVersion(selectedUserForDetail, 'built-in-niv', 'NIV 영어성경')}
                                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                                  isAllowed ? 'bg-blue-50/70 border-blue-300' : 'bg-[#FAF9F5] border-[#DDD8CE] hover:bg-white'
                                }`}
                              >
                                <div>
                                  <span className="font-bold text-[#2C2B29] block">NIV (New International)</span>
                                  <span className="text-[10px] text-[#78746D]">표준 영어 성경 번역본</span>
                                </div>
                                <div className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                                  isAllowed ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
                                }`}>
                                  {isAllowed ? '✓ 허용됨' : '차단/미제공'}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {/* 4-2. AI 연구 크레딧 즉시 지급 */}
                      <div className="space-y-2 pt-2 border-t border-[#F0EBE1]">
                        <label className="block text-[11px] font-bold text-[#5A564F]">
                          AI 연구 크레딧 즉시 지급
                        </label>
                        <div className="flex items-center gap-2 flex-wrap">
                          {[10, 50, 100].map(cnt => (
                            <button
                              key={cnt}
                              type="button"
                              onClick={() => handleAddCredits(selectedUserForDetail, cnt)}
                              className="px-3.5 py-2 bg-[#FAF0EB] hover:bg-[#F5E2D8] border border-[#F1D3C6] text-[#C46A40] font-bold rounded-xl transition-all cursor-pointer text-xs"
                            >
                              +{cnt}회 충전
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => handleCustomAddCredits(selectedUserForDetail)}
                            className="px-3.5 py-2 bg-white hover:bg-[#F3EFE9] border border-[#DDD8CE] text-[#5A564F] font-bold rounded-xl transition-all cursor-pointer text-xs"
                          >
                            직접 수량 입력
                          </button>
                        </div>
                      </div>

                      {/* 4-3. 주석 클라우드 보관 용량 수동 설정 */}
                      <div className="space-y-2 pt-2 border-t border-[#F0EBE1]">
                        <label className="block text-[11px] font-bold text-[#5A564F]">
                          주석 클라우드 영구 보관 용량 추가
                        </label>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleAddCloudCapacity(selectedUserForDetail, 300)}
                            className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 font-bold rounded-xl transition-all cursor-pointer text-xs"
                          >
                            +300구절 영구보관
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAddCloudCapacity(selectedUserForDetail, 1000)}
                            className="px-3.5 py-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 font-bold rounded-xl transition-all cursor-pointer text-xs"
                          >
                            +1,000구절 영구보관
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAddCloudCapacity(selectedUserForDetail, 31102)}
                            className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 font-bold rounded-xl transition-all cursor-pointer text-xs"
                          >
                            ⭐ 무제한(성경 31,102절 전체)
                          </button>
                        </div>
                      </div>

                      {/* 4-4. 계정 관리 액션 */}
                      <div className="flex items-center justify-between pt-3 border-t border-[#F0EBE1] flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleSendPasswordReset(selectedUserForDetail)}
                          className="px-3 py-1.5 bg-white border border-[#DDD8CE] hover:bg-[#F3EFE9] text-[#5A564F] rounded-lg font-semibold transition-all cursor-pointer text-xs flex items-center gap-1.5"
                        >
                          <KeyRound className="w-3.5 h-3.5 text-blue-600" />
                          <span>비밀번호 재설정 이메일 발송</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const u = selectedUserForDetail;
                            handleDeleteUser(u);
                            setSelectedUserForDetail(null);
                          }}
                          className="px-3 py-1.5 bg-red-50 border border-red-200 hover:bg-red-100 text-red-600 rounded-lg font-semibold transition-all cursor-pointer text-xs flex items-center gap-1.5"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>회원 데이터 영구 삭제</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 상세 모달 푸터 */}
                  <div className="p-4 bg-[#FAF9F5] border-t border-[#E7E5DF] flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => setSelectedUserForDetail(null)}
                      className="px-5 py-2 bg-[#2C2B29] hover:bg-black text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
                    >
                      확인 완료
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

        {/* 인앱 커스텀 확인 다이얼로그 (createPortal로 부모 transform 간섭 완전 차단 및 깜빡임 해결) */}
        {typeof document !== 'undefined' && createPortal(
          <AnimatePresence>
            {confirmModal && confirmModal.isOpen && (
              <div 
                className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    e.stopPropagation();
                    setConfirmModal(null);
                  }
                }}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.94, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94, y: 10 }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full max-w-md bg-[#FAF9F5] border border-[#E7E5DF] rounded-3xl shadow-2xl p-6 space-y-4 text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 border ${
                        confirmModal.theme === 'danger'
                          ? 'bg-red-50 text-red-600 border-red-200'
                          : confirmModal.theme === 'warning'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-[#FAF0EB] text-[#C46A40] border-[#F1D3C6]'
                      }`}>
                        <AlertCircle className="w-5 h-5" />
                      </div>
                      <h3 className="font-bold text-sm text-[#2C2B29]">{confirmModal.title}</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setConfirmModal(null)}
                      className="p-1.5 text-[#8C877D] hover:text-[#2C2B29] hover:bg-[#F3EFE9] rounded-xl transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-xs text-[#6E6A63] whitespace-pre-line leading-relaxed pl-1">
                    {confirmModal.message}
                  </p>

                  {confirmModal.showInput && (
                    <div className="pt-1">
                      <input
                        type="text"
                        autoFocus
                        placeholder={confirmModal.inputPlaceholder || '내용 입력'}
                        value={confirmInputText}
                        onChange={(e) => setConfirmInputText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            confirmModal.onConfirm(confirmInputText);
                            setConfirmModal(null);
                          }
                        }}
                        className="w-full px-3.5 py-2.5 bg-white border border-[#DDD8CE] rounded-xl text-xs text-[#2C2B29] outline-none focus:border-[#C46A40] focus:ring-2 focus:ring-[#C46A40]/10"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#EFECE6]">
                    <button
                      type="button"
                      onClick={() => setConfirmModal(null)}
                      className="px-4 py-2 bg-white border border-[#DDD8CE] hover:bg-[#F5F3ED] text-[#6E6A63] text-xs font-semibold rounded-xl transition-all cursor-pointer shadow-2xs"
                    >
                      {confirmModal.cancelText || '취소'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const val = confirmInputText;
                        confirmModal.onConfirm(val);
                        setConfirmModal(null);
                      }}
                      className={`px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer shadow-xs ${
                        confirmModal.theme === 'danger'
                          ? 'bg-red-600 hover:bg-red-700 text-white'
                          : confirmModal.theme === 'warning'
                          ? 'bg-amber-600 hover:bg-amber-700 text-white'
                          : 'bg-[#C46A40] hover:bg-[#B55434] text-white'
                      }`}
                    >
                      {confirmModal.confirmText || '확인'}
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
      </motion.div>
    </div>
  );
};
