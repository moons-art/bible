import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { BibleVersion } from '../types/bible';
import { searchService } from '../services/searchService';
import { BibleParser } from '../services/bibleParser';
import { BibleContext, type CopyMode } from './BibleContext';
import { bibleDB } from '../utils/indexedDB';
import { db, auth } from '../api/firebaseConfig';
import { doc, collection, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { fetchUserProfile } from '../api/gdriveWebService';
import { subscribeUserProfile, updateUserResourceCounts } from '../services/userService';
import { getPlanSettings, canUserSyncCloudNotes, type SubscriptionPlansSettings } from '../services/planConfigService';

export const BibleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const DEFAULT_KOR: BibleVersion = {
    id: 'built-in-kor-revised',
    name: '개역한글',
    verses: [],
    isBuiltIn: true,
    isSystem: true,
    metadata: { uploadedAt: Date.now(), fileType: 'txt' }
  };

  const DEFAULT_ENG: BibleVersion = {
    id: 'built-in-eng-kjv',
    name: 'KJV',
    verses: [],
    isBuiltIn: true,
    isSystem: true,
    metadata: { uploadedAt: Date.now(), fileType: 'txt' }
  };

  const [versions, setVersions] = useState<BibleVersion[]>([DEFAULT_KOR, DEFAULT_ENG]);
  const [selectedVersionIds, setSelectedVersionIds] = useState<string[]>(['built-in-kor-revised', 'built-in-eng-kjv']);
  const [lineHeight, setLineHeight] = useState<number>(1.6);
  const [copyMode, setCopyMode] = useState<CopyMode>('default');
  const [showVersionInCopy, setShowVersionInCopy] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('bible-copy-show-version');
      return saved !== null ? JSON.parse(saved) : true;
    } catch { return true; }
  });
  const [copyMultiOption, setCopyMultiOption] = useState<'kr' | 'en' | 'kr+en' | 'all'>(() => {
    try {
      const saved = localStorage.getItem('bible-copy-multi-option');
      return (saved as any) || 'kr+en';
    } catch { return 'kr+en'; }
  });
  const [mainKrVersionId, setMainKrVersionId] = useState<string>(() => {
    try {
      return localStorage.getItem('bible-copy-main-kr') || '';
    } catch { return ''; }
  });
  const [mainEnVersionId, setMainEnVersionId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('bible-copy-main-en') || '';
      return saved === 'built-in-eng-nrsv' ? 'built-in-eng-kjv' : saved;
    } catch { return ''; }
  });

  useEffect(() => {
    try { localStorage.setItem('bible-copy-show-version', JSON.stringify(showVersionInCopy)); } catch {}
  }, [showVersionInCopy]);

  useEffect(() => {
    try { localStorage.setItem('bible-copy-multi-option', copyMultiOption); } catch {}
  }, [copyMultiOption]);

  useEffect(() => {
    if (mainKrVersionId) {
      try { localStorage.setItem('bible-copy-main-kr', mainKrVersionId); } catch {}
    }
  }, [mainKrVersionId]);

  useEffect(() => {
    if (mainEnVersionId) {
      try { localStorage.setItem('bible-copy-main-en', mainEnVersionId); } catch {}
    }
  }, [mainEnVersionId]);

  // ✅ 구절 노트: 기본적으로 기기(localStorage)에 무제한 영구 보관
  const [verseData, setVerseData] = useState<Record<string, { note?: string; crossRef?: string; sermon?: string }>>(() => {
    try {
      const local = localStorage.getItem('bible-local-verse-data');
      if (local) return JSON.parse(local);
    } catch {}
    return {};
  });
  const [showAnnotations, setShowAnnotations] = useState<boolean>(true);
  const [googleUserId, setGoogleUserId] = useState<string | null>(null);

  // 클라우드 노트 동기화 권한 여부 Ref (기본값: false - 기기 저장 전용)
  const canSyncCloudNotesRef = useRef<boolean>(false);
  const planSettingsRef = useRef<SubscriptionPlansSettings | null>(null);

  // 최신 플랜 설정 로드 및 변경 이벤트 구독
  useEffect(() => {
    getPlanSettings().then(st => {
      planSettingsRef.current = st;
    }).catch(() => {});

    const handlePlanUpdate = (e: any) => {
      if (e.detail) {
        planSettingsRef.current = e.detail;
      }
    };
    window.addEventListener('plan-config-updated', handlePlanUpdate);
    return () => {
      window.removeEventListener('plan-config-updated', handlePlanUpdate);
    };
  }, []);

  // ✅ 로딩 완료 및 DB 덮어쓰기 방지를 위한 초기화 완료 플래그
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  // ✅ 인덱싱 중복 방지를 위한 Ref
  const indexedVersionIds = useRef<Set<string>>(new Set());
  // ✅ IndexedDB 중복 저장 방지를 위한 Ref
  const savedVersionIdsRef = useRef<Set<string>>(new Set());
  // Firestore 구독 해제 함수 Ref
  const unsubscribeVerseDataRef = useRef<(() => void) | null>(null);
  // 원격 데이터 수신 시 Firestore 역전송(Echo) 무한 루프 방지 플래그
  const isRemoteSyncRef = useRef<boolean>(false);

  // ── Firestore verseData 동기화 함수 (클라우드 권한 보유 시에만 실행) ────────────────
  const subscribeToVerseData = (uid: string) => {
    if (unsubscribeVerseDataRef.current) {
      unsubscribeVerseDataRef.current();
    }
    const versesCol = collection(db, 'users', uid, 'verseData');
    const unsubscribe = onSnapshot(versesCol, (snapshot) => {
      const serverData: Record<string, { note?: string; crossRef?: string; sermon?: string }> = {};
      snapshot.forEach(docSnap => {
        serverData[docSnap.id] = docSnap.data() as any;
      });
      isRemoteSyncRef.current = true;
      setVerseData(prev => {
        // 서버 데이터와 로컬 데이터를 병합하여 기기에 최신 캐시 보관
        const merged = { ...prev, ...serverData };
        try {
          localStorage.setItem('bible-local-verse-data', JSON.stringify(merged));
        } catch {}
        return merged;
      });
      // React 상태 반영 후 플래그 안전 해제
      setTimeout(() => {
        isRemoteSyncRef.current = false;
      }, 50);
    }, (error) => {
      console.warn('[BibleProvider] Firestore offline/sync error (정상 - 로컬 기기 보관 사용 중):', error.code);
    });
    unsubscribeVerseDataRef.current = unsubscribe;
  };

  // ── 관리자가 원격으로 허용한 번역본(개역개정, NIV 등) 자동 활성화 및 회수 ────────────
  const checkAndHydrateAllowedVersions = async (allowedVersions: string[]) => {
    const allowed = allowedVersions || [];

    // 1. 개역개정 (built-in-krv)
    if (allowed.includes('built-in-krv')) {
      setVersions(prev => {
        if (prev.some(v => v.id === 'built-in-krv' || v.name === '개역개정')) return prev;
        (async () => {
          try {
            // ✅ IndexedDB 캐시 먼저 확인하여 4.7MB 다운로드 및 재파싱 생략
            const cached = await bibleDB.getVersion('built-in-krv');
            let krvVersion: BibleVersion | null = null;
            if (cached && cached.verses && cached.verses.length > 0) {
              krvVersion = cached;
              savedVersionIdsRef.current.add('built-in-krv');
            } else {
              const res = await fetch('/data/krv.txt');
              if (res.ok) {
                const buf = await res.arrayBuffer();
                let text;
                try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
                catch { text = new TextDecoder('euc-kr').decode(buf); }
                const parsed = await BibleParser.parseTxt('개역개정', text);
                krvVersion = {
                  id: 'built-in-krv',
                  name: '개역개정',
                  verses: parsed.verses,
                  isSystem: false,
                  isBuiltIn: false
                };
                await bibleDB.saveVersion(krvVersion);
                savedVersionIdsRef.current.add('built-in-krv');
              }
            }

            if (krvVersion) {
              const finalKrv = krvVersion;
              setVersions(curr => {
                if (curr.some(v => v.id === 'built-in-krv')) return curr;
                const next = [...curr, finalKrv];
                // 저장된 순서에 맞게 위치 복원
                try {
                  const savedOrderStr = localStorage.getItem('bible-version-order');
                  if (savedOrderStr) {
                    const savedOrder: string[] = JSON.parse(savedOrderStr);
                    next.sort((a, b) => {
                      const ia = savedOrder.indexOf(a.id);
                      const ib = savedOrder.indexOf(b.id);
                      if (ia !== -1 && ib !== -1) return ia - ib;
                      if (ia !== -1) return -1;
                      if (ib !== -1) return 1;
                      return 0;
                    });
                  }
                } catch (e) {}
                return next;
              });
              // 이전에 선택됐던 경우 선택 상태 복원
              try {
                const savedSelectedStr = localStorage.getItem('bible-selected-versions');
                if (savedSelectedStr) {
                  const savedSelected: string[] = JSON.parse(savedSelectedStr);
                  if (Array.isArray(savedSelected) && savedSelected.includes('built-in-krv')) {
                    setSelectedVersionIds(sel => sel.includes('built-in-krv') ? sel : [...sel, 'built-in-krv']);
                  }
                }
              } catch (e) {}
              console.log('[BibleProvider] 관리자 권한으로 개역개정이 자동 활성화되었습니다.');
            }
          } catch (e) {
            console.error('[BibleProvider] 원격 개역개정 로드 실패:', e);
          }
        })();
        return prev;
      });
    } else {
      // 권한 회수 시 제거
      setVersions(prev => {
        if (prev.some(v => v.id === 'built-in-krv')) {
          bibleDB.deleteVersion('built-in-krv').catch(() => {});
          savedVersionIdsRef.current.delete('built-in-krv');
          setSelectedVersionIds(sel => sel.filter(id => id !== 'built-in-krv'));
          return prev.filter(v => v.id !== 'built-in-krv');
        }
        return prev;
      });
    }

    // 2. NIV (built-in-niv)
    if (allowed.includes('built-in-niv')) {
      setVersions(prev => {
        if (prev.some(v => v.id === 'built-in-niv' || v.name === 'NIV')) return prev;
        (async () => {
          try {
            // ✅ IndexedDB 캐시 먼저 확인하여 3.7MB 다운로드 및 재파싱 생략
            const cached = await bibleDB.getVersion('built-in-niv');
            let nivVersion: BibleVersion | null = null;
            if (cached && cached.verses && cached.verses.length > 0) {
              nivVersion = cached;
              savedVersionIdsRef.current.add('built-in-niv');
            } else {
              const res = await fetch('/data/NIV_UTF8_LF.txt');
              if (res.ok) {
                const text = await res.text();
                const parsed = await BibleParser.parseTxt('NIV', text);
                nivVersion = {
                  id: 'built-in-niv',
                  name: 'NIV',
                  verses: parsed.verses,
                  isSystem: false,
                  isBuiltIn: false
                };
                await bibleDB.saveVersion(nivVersion);
                savedVersionIdsRef.current.add('built-in-niv');
              }
            }

            if (nivVersion) {
              const finalNiv = nivVersion;
              setVersions(curr => curr.some(v => v.id === 'built-in-niv') ? curr : [...curr, finalNiv]);
              console.log('[BibleProvider] 관리자 권한으로 NIV가 자동 활성화되었습니다.');
            }
          } catch (e) {
            console.error('[BibleProvider] 원격 NIV 로드 실패:', e);
          }
        })();
        return prev;
      });
    } else {
      // 권한 회수 시 제거
      setVersions(prev => {
        if (prev.some(v => v.id === 'built-in-niv')) {
          bibleDB.deleteVersion('built-in-niv').catch(() => {});
          savedVersionIdsRef.current.delete('built-in-niv');
          setSelectedVersionIds(sel => sel.filter(id => id !== 'built-in-niv'));
          return prev.filter(v => v.id !== 'built-in-niv');
        }
        return prev;
      });
    }
  };

  // ── Firebase Auth & 구글 로그인 이벤트 감지 ──────────────────────────
  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        setGoogleUserId(user.uid);
        console.log('[BibleProvider] ✅ Firebase Auth 연결됨. 사용자 ID:', user.uid);

        // 관리자가 허용한 특별 번역본 및 클라우드 노트 동기화 권한 실시간 감지
        if (unsubProfile) unsubProfile();
        unsubProfile = subscribeUserProfile(user.uid, (profile) => {
          if (profile) {
            checkAndHydrateAllowedVersions(profile.allowedVersions || []);

            // 클라우드 노트 서버 동기화 권한 판별
            const canSync = canUserSyncCloudNotes(profile, planSettingsRef.current);
            canSyncCloudNotesRef.current = canSync;

            if (canSync) {
              subscribeToVerseData(user.uid);
            } else {
              // 동기화 권한이 없으면 서버 리스너 해제 (로컬 기기 무제한 보관 모드)
              if (unsubscribeVerseDataRef.current) {
                unsubscribeVerseDataRef.current();
                unsubscribeVerseDataRef.current = null;
              }
            }
          }
        }, user.email);
      } else {
        setGoogleUserId(null);
        canSyncCloudNotesRef.current = false;
        // 로그아웃 시 서버 구독만 안전 해제 (로컬 기기에 저장된 verseData는 영구 보존)
        if (unsubscribeVerseDataRef.current) {
          unsubscribeVerseDataRef.current();
          unsubscribeVerseDataRef.current = null;
        }
        if (unsubProfile) {
          unsubProfile();
          unsubProfile = null;
        }
        // 특수 번역본(개역개정, NIV) 목록에서 제거 및 기본 2개 번역본으로 리셋
        setVersions(prev => prev.filter(v => v.id !== 'built-in-krv' && v.id !== 'built-in-niv'));
      }
    });

    return () => {
      unsubAuth();
      if (unsubProfile) unsubProfile();
      if (unsubscribeVerseDataRef.current) {
        unsubscribeVerseDataRef.current();
      }
    };
  }, []);

  // 마지막으로 Firestore 서버에 커밋된 verseData 스냅샷 (더티 체킹용)
  const lastCommittedVerseDataRef = useRef<Record<string, { note?: string; crossRef?: string; sermon?: string }>>({});
  // 최신 대기 중인 verseData
  const pendingVerseDataRef = useRef<Record<string, { note?: string; crossRef?: string; sermon?: string }>>({});
  // 30초 스로틀 타이머 및 스케줄 시간
  const verseThrottleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextVerseSaveTimeRef = useRef<number>(0);
  const isVerseFlushingRef = useRef<boolean>(false);

  // ── Firestore 실제 플러시(Flush) 함수: 변경된 항목만 batch/개별 setDoc ──
  const flushVerseData = useCallback(async () => {
    if (!googleUserId || !canSyncCloudNotesRef.current || isVerseFlushingRef.current) return;
    if (verseThrottleTimerRef.current) {
      clearTimeout(verseThrottleTimerRef.current);
      verseThrottleTimerRef.current = null;
    }

    const current = pendingVerseDataRef.current;
    const committed = lastCommittedVerseDataRef.current;

    // 변경된 키 찾기 (엄격한 더티 체킹)
    const dirtyKeys: string[] = [];
    Object.keys(current).forEach(key => {
      if (JSON.stringify(committed[key]) !== JSON.stringify(current[key])) {
        dirtyKeys.push(key);
      }
    });
    // 삭제된 키
    const deletedKeys = Object.keys(committed).filter(key => !(key in current));

    if (dirtyKeys.length === 0 && deletedKeys.length === 0) {
      return;
    }

    isVerseFlushingRef.current = true;
    try {
      await Promise.all([
        ...dirtyKeys.map(key => {
          const docRef = doc(db, 'users', googleUserId, 'verseData', key);
          const entry = current[key];
          if (!entry || (!entry.note && !entry.crossRef && !entry.sermon)) {
            return deleteDoc(docRef);
          } else {
            return setDoc(docRef, entry, { merge: true });
          }
        }),
        ...deletedKeys.map(key => {
          const docRef = doc(db, 'users', googleUserId, 'verseData', key);
          return deleteDoc(docRef);
        })
      ]);

      // 커밋 기준 스냅샷 업데이트
      lastCommittedVerseDataRef.current = { ...current };

      // 유저 프로필 메인 문서에 구절노트, 관주, 구절주석 통계 동기화
      let noteCount = 0;
      let crossRefCount = 0;
      let commentaryCount = 0;
      for (const k of Object.keys(current)) {
        const item = current[k];
        if (item) {
          if (item.note && typeof item.note === 'string' && item.note.trim() !== '') noteCount++;
          if (item.crossRef && typeof item.crossRef === 'string' && item.crossRef.trim() !== '') crossRefCount++;
          if (item.sermon && typeof item.sermon === 'string' && item.sermon.trim() !== '') commentaryCount++;
        }
      }
      if (googleUserId) {
        updateUserResourceCounts(googleUserId, { noteCount, crossRefCount, commentaryCount });
      }
    } catch (err) {
      console.warn('[BibleProvider] verseData Firestore flush 실패 (로컬 기기 보관 유지):', err);
    } finally {
      isVerseFlushingRef.current = false;
    }
  }, [googleUserId]);

  // 생명주기 플러시: 창 닫기, 탭 전환, 모바일 홈 나가기 시 즉시 저장
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushVerseData();
      }
    };
    const handlePageHide = () => {
      flushVerseData();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('beforeunload', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      window.removeEventListener('beforeunload', handlePageHide);
      if (verseThrottleTimerRef.current) clearTimeout(verseThrottleTimerRef.current);
    };
  }, [flushVerseData]);

  // ── verseData 저장 함수 (로컬 즉시 반영 + 권한 있을 시 Firestore 1분 스로틀) ─────────────────
  const syncVerseData = (
    newData: Record<string, { note?: string; crossRef?: string; sermon?: string }> |
             ((prev: Record<string, { note?: string; crossRef?: string; sermon?: string }>) =>
               Record<string, { note?: string; crossRef?: string; sermon?: string }>)
  ) => {
    setVerseData(prev => {
      const next = typeof newData === 'function' ? newData(prev) : newData;

      // ✅ 1) 항상 기기(localStorage)에 즉시 무제한 보관!
      try {
        localStorage.setItem('bible-local-verse-data', JSON.stringify(next));
      } catch (e) {
        console.warn('[BibleProvider] verseData 로컬 기기 저장 경고:', e);
      }

      // 원격 동기화 수신 중일 때는 Firestore 역전송 완전 차단
      if (isRemoteSyncRef.current) {
        lastCommittedVerseDataRef.current = { ...next };
        pendingVerseDataRef.current = { ...next };
        return next;
      }

      pendingVerseDataRef.current = { ...next };

      // ✅ 2) 클라우드 동기화 권한이 있는 경우에만 Firestore 1분 스로틀 스케줄링
      if (googleUserId && canSyncCloudNotesRef.current) {
        const now = Date.now();
        if (now >= nextVerseSaveTimeRef.current) {
          nextVerseSaveTimeRef.current = now + 60000; // 1분(60초) 스로틀
          if (verseThrottleTimerRef.current) clearTimeout(verseThrottleTimerRef.current);
          verseThrottleTimerRef.current = setTimeout(() => {
            flushVerseData();
          }, 60000);
        }
      }

      return next;
    });
  };

  // 1. 초기 데이터 로드 및 Hydration
  useEffect(() => {
    const init = async () => {
      let loaded: BibleVersion[] = [];
      const saved = localStorage.getItem('bible-versions');
      const savedShowVersion = localStorage.getItem('bible-show-version-copy');
      const savedLineHeight = localStorage.getItem('bible-line-height');
      
      if (savedLineHeight) setLineHeight(parseFloat(savedLineHeight) || 1.6);
      if (savedShowVersion) setShowVersionInCopy(savedShowVersion === 'true');
      
      try {
        const idbVersions = await bibleDB.getAllVersions();
        if (idbVersions && idbVersions.length > 0) {
          // 중복 번역본 제거 (이름 기준 하나만 유지하고 나머지는 캐시 파기)
          const uniqueMap = new Map();
          for (const v of idbVersions) {
            if (!uniqueMap.has(v.name)) {
              uniqueMap.set(v.name, v);
            } else {
              bibleDB.deleteVersion(v.id).catch(console.error);
            }
          }
          loaded = Array.from(uniqueMap.values());
        } else if (saved) {
          loaded = JSON.parse(saved);
        }
      } catch (e) { console.error("DB Load failed", e); }

      // 0) 개역개정 초기 목록 제외 (로그인 후 관리자 원격 권한 확인 시 자동 활성화)
      loaded = loaded.filter(v => v.id !== 'built-in-krv');

      // 1) 개역한글 (저작권 만료 퍼블릭 도메인) 빌트인 보장
      let korEntry = loaded.find(v => v.name === '개역한글' || v.id === 'built-in-kor-revised');
      if (!korEntry) {
        korEntry = { ...DEFAULT_KOR };
        loaded.unshift(korEntry);
      } else {
        korEntry.isSystem = true;
        korEntry.isBuiltIn = true;
        korEntry.id = 'built-in-kor-revised';
        loaded = [korEntry, ...loaded.filter(v => v.id !== korEntry!.id)];
      }

      // 2) KJV (무료 표준 영어 성경 - 1611 저작권 만료) 빌트인 보장 및 구버전(NRSV) 자동 전환
      let engEntry = loaded.find(v => v.name === 'KJV' || v.id === 'built-in-eng-kjv');
      const oldNrsvEntry = loaded.find(v => v.name === 'NRSV' || v.name === 'NRSV (영어)' || v.id === 'built-in-eng-nrsv');

      if (oldNrsvEntry) {
        // 기존 IndexedDB 구버전 NRSV 삭제 처리
        bibleDB.deleteVersion(oldNrsvEntry.id).catch(() => {});
        loaded = loaded.filter(v => v.id !== oldNrsvEntry.id);
      }

      if (!engEntry) {
        engEntry = { ...DEFAULT_ENG };
        loaded.splice(1, 0, engEntry);
      } else {
        engEntry.name = 'KJV';
        engEntry.isSystem = true;
        engEntry.isBuiltIn = true;
        engEntry.id = 'built-in-eng-kjv';
        if (engEntry.verses && engEntry.verses.length > 0) {
          const hasExo = engEntry.verses.some(v => v.bookId === 'EXO');
          if (!hasExo) {
            console.log('[BibleProvider] 구버전 KJV 캐시 감지. 재파싱합니다.');
            engEntry.verses = [];
          }
        }
      }

      const hydratedVersions = await Promise.all(loaded.map(async (v) => {
        if (v.isBuiltIn && (!v.verses || v.verses.length === 0)) {
          try {
            let fileName: string | null = null;
            if (v.name === '개역한글') {
              fileName = 'korean_revised.txt';
            } else if (v.name === 'KJV' || v.id === 'built-in-eng-kjv') {
              fileName = 'kjv.txt';
            }

            if (fileName) {
              const response = await fetch(`/data/${fileName}`);
              if (response.ok) {
                const buffer = await response.arrayBuffer();
                let content;
                try {
                  content = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
                } catch {
                  content = new TextDecoder('euc-kr').decode(buffer);
                }
                const fullVersion = await BibleParser.parseTxt(v.name, content);
                // IndexedDB에 최신 파싱 데이터 저장
                await bibleDB.saveVersion({ ...v, verses: fullVersion.verses });
                return { ...v, verses: fullVersion.verses };
              }
            }
          } catch (e: any) { 
            console.error(`Hydration failed: ${v.name}`, e);
            alert(`기본 성경(${v.name}) 로드 중 오류가 발생했습니다: ${e?.message || e}`);
          }
          
          if (v.isBuiltIn && (!v.verses || v.verses.length === 0)) {
            alert(`기본 성경(${v.name})을 불러왔으나, 내용이 없습니다.`);
          }
        }
        return v;
      }));

      // 저장된 번역본 순서 적용
      const savedOrderStr = localStorage.getItem('bible-version-order');
      if (savedOrderStr) {
        try {
          const savedOrder: string[] = JSON.parse(savedOrderStr);
          hydratedVersions.sort((a, b) => {
            const indexA = savedOrder.indexOf(a.id);
            const indexB = savedOrder.indexOf(b.id);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return 0;
          });
        } catch (e) {
          console.error("Order parse failed", e);
        }
      }

      setVersions(hydratedVersions);
      // 저장값 있으면 그대로 복원, 없으면(최초 접속) 개역한글 1개만
      const savedSelectedStr = localStorage.getItem('bible-selected-versions');
      if (savedSelectedStr) {
        try {
          let parsed = JSON.parse(savedSelectedStr);
          if (Array.isArray(parsed) && parsed.length > 0) {
            // nrsv 구버전 ID를 kjv로 자동 치환
            parsed = parsed.map(id => id === 'built-in-eng-nrsv' ? 'built-in-eng-kjv' : id);
            const valid = parsed.filter(id => hydratedVersions.some(v => v.id === id));
            setSelectedVersionIds(valid.length > 0 ? valid : ['built-in-kor-revised']);
          } else {
            setSelectedVersionIds(['built-in-kor-revised']);
          }
        } catch (e) {
          setSelectedVersionIds(['built-in-kor-revised']);
        }
      } else {
        // 최초 접속: 개역한글 1개만
        setSelectedVersionIds(['built-in-kor-revised']);
      }
      hydratedVersions.forEach(v => savedVersionIdsRef.current.add(v.id));
      setIsInitialized(true); // ✅ 초기 1회성 비동기 로딩 완료 선언

      // ✅ 2. 구글 드라이브(appDataFolder) 백그라운드 동기화 로직
      const syncCloud = (currentVersions: BibleVersion[]) => {
        import('../api/gdriveWebService').then(({ gdriveWebService }) => {
          if (!gdriveWebService.getAccessToken()) return;
          
          gdriveWebService.listBibleFiles().then(async driveFiles => {
            if (!driveFiles || driveFiles.length === 0) return;
            
            let hasNew = false;
            let updatedVersions = [...currentVersions];
            
            for (const file of driveFiles) {
              const vName = file.name.replace('.txt', '');
              if (!updatedVersions.find(v => v.name === vName)) {
                try {
                  console.log(`[Bible Sync] Downloading ${file.name} from Cloud...`);
                  const content = await gdriveWebService.downloadBibleFile(file.id);
                  const fullVersion = await BibleParser.parseTxt(vName, content);
                  updatedVersions.push(fullVersion);
                  await bibleDB.saveVersion(fullVersion);
                  hasNew = true;
                } catch (e) {
                  console.error(`Failed to download/parse ${file.name}`, e);
                }
              }
            }
            
            if (hasNew) {
              setVersions([...updatedVersions]);
              console.log('[Bible Sync] ☁️ Cloud sync complete! New versions added.');
            }
          }).catch(e => {
            console.error('GDrive Bible sync list failed', e);
          });
        });
      };

      syncCloud(hydratedVersions);

      const handleAuth = () => {
        setVersions(latestVersions => {
          syncCloud(latestVersions);
          return latestVersions;
        });
      };
      window.addEventListener('gdrive_authenticated', handleAuth);
    };
    init();
  }, []);

  // ✅ [안정성 강화] 데이터 로딩 완료 및 화면 로드가 끝난 뒤 비동기 백그라운드 인덱싱
  useEffect(() => {
    if (!isInitialized) return;

    const validOnes = versions.filter(v => v.verses && v.verses.length > 0);
    if (validOnes.length > 0) {
      validOnes.forEach(v => {
        if (!indexedVersionIds.current.has(v.id) || !searchService.hasIndex(v.id)) {
          indexedVersionIds.current.add(v.id);
          // 1.5초 여유 마진 후 조용히 백그라운드 인덱싱 실행 (앱 기동 렉 방지)
          setTimeout(() => {
            searchService.indexVersion(v);
          }, 1500);
        }
      });
    }
  }, [versions, isInitialized]);

  // 2. IndexedDB 저장 (로딩 완료 플래그 적용하여 초기 덮어쓰기 방지 및 미변경 번역본 스킵)
  useEffect(() => {
    const saveToDB = async () => {
      if (!isInitialized) return; // 로딩 전 덮어쓰기 차단 가드
      try {
        for (const v of versions) {
          if (!savedVersionIdsRef.current.has(v.id)) {
            await bibleDB.saveVersion(v);
            savedVersionIdsRef.current.add(v.id);
          }
        }
        const miniState = versions.map(v => ({ id: v.id, name: v.name, isBuiltIn: v.isBuiltIn }));
        localStorage.setItem('bible-versions-meta', JSON.stringify(miniState));
      } catch (e) {
        console.error('Failed to save to IndexedDB', e);
      }
    };
    if (versions.length > 0) saveToDB();
  }, [versions, isInitialized]);

  const addVersion = (version: BibleVersion) => {
    setVersions(prev => {
      const oldVersion = prev.find(v => v.name === version.name);
      if (oldVersion) {
        bibleDB.deleteVersion(oldVersion.id).catch(console.error);
        indexedVersionIds.current.delete(oldVersion.id);
        savedVersionIdsRef.current.delete(oldVersion.id);
      }
      return [...prev.filter(v => v.name !== version.name), version];
    });
  };

  const removeVersion = async (id: string) => {
    const target = versions.find(v => v.id === id);
    if (target?.isSystem) return;

    // 구글 드라이브에서 파일 삭제
    if (target && target.name) {
      import('../api/gdriveWebService').then(async ({ gdriveWebService }) => {
        try {
          const files = await gdriveWebService.listBibleFiles();
          const targetFile = files.find((f: any) => f.name === `${target.name}.txt` || f.name === target.name);
          if (targetFile) {
            await gdriveWebService.deleteBibleFile(targetFile.id);
            console.log(`[Bible Sync] Deleted ${target.name} from Cloud.`);
          }
        } catch (e) {
          console.error('[Bible Sync] Failed to delete from Cloud:', e);
        }
      });
    }

    setVersions(prev => prev.filter(v => v.id !== id));
    setSelectedVersionIds(prev => prev.filter(vid => vid !== id));
    indexedVersionIds.current.delete(id);
    savedVersionIdsRef.current.delete(id);
    await bibleDB.deleteVersion(id);
  };

  const moveVersion = (id: string, direction: 'up' | 'down') => {
    setVersions(prev => {
      const index = prev.findIndex(v => v.id === id);
      if (index === -1) return prev;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(targetIndex, 0, item);
      try {
        localStorage.setItem('bible-version-order', JSON.stringify(next.map(v => v.id)));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  };

  const reorderVersions = (newVersions: BibleVersion[]) => {
    setVersions(newVersions);
    try {
      localStorage.setItem('bible-version-order', JSON.stringify(newVersions.map(v => v.id)));
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <BibleContext.Provider value={{ 
      versions, selectedVersionIds, copyMode, showVersionInCopy,
      addVersion, removeVersion, 
      renameVersion: (id, name) => setVersions(prev => prev.map(v => v.id === id ? { ...v, name } : v)),
      reorderVersions,
      moveVersion,
      clearAllVersions: async () => {
        const builtIns = versions.filter(v => v.isBuiltIn);
        setVersions(builtIns);
        setSelectedVersionIds(builtIns.map(v => v.id));
        indexedVersionIds.current.clear();
        savedVersionIdsRef.current.clear();
        
        // 구글 드라이브에서 모든 번역본 파일 삭제
        import('../api/gdriveWebService').then(async ({ gdriveWebService }) => {
          try {
            const files = await gdriveWebService.listBibleFiles();
            for (const f of files) {
              await gdriveWebService.deleteBibleFile(f.id).catch(console.error);
            }
          } catch (e) { console.error('Failed to clear cloud bibles', e); }
        });

        const all = await bibleDB.getAllVersions();
        for (const v of all) {
          if (!v.isBuiltIn) await bibleDB.deleteVersion(v.id);
        }
      },
      toggleVersion: (id) => setSelectedVersionIds(prev => {
        let next: string[];
        if (prev.includes(id)) {
          if (prev.length <= 1) return prev; // 최소 1개 번역본 활성화 유지
          next = prev.filter(vid => vid !== id);
        } else {
          next = prev.length >= 5 ? prev : [...prev, id];
        }
        try {
          localStorage.setItem('bible-selected-versions', JSON.stringify(next));
        } catch (e) {}
        return next;
      }),
      setCopyMode, setShowVersionInCopy,
      copyMultiOption, setCopyMultiOption,
      mainKrVersionId, setMainKrVersionId,
      mainEnVersionId, setMainEnVersionId,
      lineHeight, setLineHeight: (val) => setLineHeight(Math.max(1.3, val)),
      verseData, setVerseData: syncVerseData,
      flushVerseData,
      showAnnotations, setShowAnnotations
    }}>
      {children}
    </BibleContext.Provider>
  );
};
