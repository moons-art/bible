import React, { useState, useEffect, useRef } from 'react';
import type { BibleVersion } from '../types/bible';
import { searchService } from '../services/searchService';
import { BibleParser } from '../services/bibleParser';
import { BibleContext, type CopyMode } from './BibleContext';
import { bibleDB } from '../utils/indexedDB';
import { db, auth } from '../api/firebaseConfig';
import { doc, collection, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { fetchUserProfile } from '../api/gdriveWebService';
import { subscribeUserProfile } from '../services/userService';

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

  const [verseData, setVerseData] = useState<Record<string, { note?: string; crossRef?: string; sermon?: string }>>({});
  const [showAnnotations, setShowAnnotations] = useState<boolean>(true);
  const [googleUserId, setGoogleUserId] = useState<string | null>(null);

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

  // ── Firestore verseData 동기화 함수 ─────────────────────────────────────
  const subscribeToVerseData = (uid: string) => {
    if (unsubscribeVerseDataRef.current) {
      unsubscribeVerseDataRef.current();
    }
    const versesCol = collection(db, 'users', uid, 'verseData');
    const unsubscribe = onSnapshot(versesCol, (snapshot) => {
      const data: Record<string, { note?: string; crossRef?: string; sermon?: string }> = {};
      snapshot.forEach(docSnap => {
        data[docSnap.id] = docSnap.data() as any;
      });
      isRemoteSyncRef.current = true;
      setVerseData(data);
      // React 상태 반영 후 플래그 안전 해제
      setTimeout(() => {
        isRemoteSyncRef.current = false;
      }, 50);
    }, (error) => {
      console.warn('[BibleProvider] Firestore offline/sync error (정상 - 오프라인 캐시 사용 중):', error.code);
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
        subscribeToVerseData(user.uid);
        console.log('[BibleProvider] ✅ Firebase Auth 연결됨. 사용자 ID:', user.uid);

        // 관리자가 허용한 특별 번역본 실시간 감지 (UID 및 이메일 양방향 감시)
        if (unsubProfile) unsubProfile();
        unsubProfile = subscribeUserProfile(user.uid, (profile) => {
          if (profile) {
            checkAndHydrateAllowedVersions(profile.allowedVersions || []);
          }
        }, user.email);
      } else {
        setGoogleUserId(null);
        // 로그아웃 시 주석/설교 상태 완전히 초기화
        setVerseData({});
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

  // ── verseData 저장 함수 (Firestore + 로컬 state 동기화) ─────────────────
  const syncVerseData = (
    newData: Record<string, { note?: string; crossRef?: string; sermon?: string }> |
             ((prev: Record<string, { note?: string; crossRef?: string; sermon?: string }>) =>
               Record<string, { note?: string; crossRef?: string; sermon?: string }>)
  ) => {
    setVerseData(prev => {
      const next = typeof newData === 'function' ? newData(prev) : newData;

      // 원격 동기화 수신 중일 때는 Firestore 역전송 완전 차단
      if (isRemoteSyncRef.current) {
        return next;
      }

      // Firestore 동기화 (로그인된 사용자가 직접 수정한 경우에만)
      if (googleUserId) {
        Object.keys(next).forEach(key => {
          if (prev[key] === next[key]) return;
          if (JSON.stringify(prev[key]) !== JSON.stringify(next[key])) {
            const docRef = doc(db, 'users', googleUserId, 'verseData', key);
            const entry = next[key];
            if (!entry || (!entry.note && !entry.crossRef && !entry.sermon)) {
              deleteDoc(docRef).catch(console.error);
            } else {
              setDoc(docRef, entry).catch(console.error);
            }
          }
        });
        // 삭제된 키도 Firestore에서 제거
        Object.keys(prev).forEach(key => {
          if (!(key in next)) {
            const docRef = doc(db, 'users', googleUserId, 'verseData', key);
            deleteDoc(docRef).catch(console.error);
          }
        });
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
          // 1.5초 여유 마진 후 조용히 백그라운드 인덱싱 실행 (앱 기동 렉 방지)
          setTimeout(() => {
            searchService.indexVersion(v);
            indexedVersionIds.current.add(v.id);
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
      showAnnotations, setShowAnnotations
    }}>
      {children}
    </BibleContext.Provider>
  );
};
