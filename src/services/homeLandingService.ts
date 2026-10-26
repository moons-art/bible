/**
 * Real-Time Firebase Sync & LocalStorage Caching Service for Nations Bible Landing Page
 * Connects to Nations Homepage Firebase (nations-ym) to fetch hero video,
 * copywriting, and feature cards with 0ms offline/refresh survival.
 * Synchronizes with Firestore 'site_images/bible' and 'site_intro/bible'.
 */
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, doc, onSnapshot } from 'firebase/firestore';
import { useState, useEffect } from 'react';

const homeFirebaseConfig = {
  apiKey: "AIzaSyDLmZfYdJAQu4x2OAYrdP29yOooLXTzHeo",
  authDomain: "nations-ym.firebaseapp.com",
  projectId: "nations-ym",
  storageBucket: "nations-ym.firebasestorage.app",
  messagingSenderId: "949990892606",
  appId: "1:949990892606:web:e225b84491c243c80b1d6f",
};

const HOME_APP_NAME = 'nations-home-app';
let homeAppInstance;
try {
  const existingApps = getApps();
  homeAppInstance = existingApps.find(a => a.name === HOME_APP_NAME) || initializeApp(homeFirebaseConfig, HOME_APP_NAME);
} catch (e) {
  homeAppInstance = initializeApp(homeFirebaseConfig, HOME_APP_NAME);
}

export const homeDb = getFirestore(homeAppInstance);

export interface CorePoint {
  title: string;
  desc: string;
  image?: string | null;
  altText?: string;
  gradientClass?: string;
}

export interface FaqItem {
  q: string;
  preview: string;
  a: string;
}

export interface LandingData {
  heroVideoUrl: string;
  heroTopText: string;
  heroPhrases: string[];
  questionHeading: string;
  questionText: string;
  mainHeadingLine1: string;
  mainHeadingLine2: string;
  subHeadingLine1: string;
  subHeadingLine2: string;
  diffTag: string;
  diffHeading: string;
  diffDesc: string;
  diffBadges: string[];
  loginCardBadge: string;
  loginCardSubtitle: string;
  corePoints: CorePoint[];
  faqs: FaqItem[];
}

/**
 * 네이션스 홈페이지(nations.home)의 Bible AI 페이지 실제 소스와 100% 일치하는 기본 데이터
 */
export const DEFAULT_BIBLE_LANDING_DATA: LandingData = {
  heroVideoUrl: '/hero-video-bible.mp4',
  heroTopText: '묵상과 성경연구에만 집중하세요',
  heroPhrases: [
    '설교준비 네이션스가 해결해 드릴게요',
    '교회를 돕는 모든 것 네이션스',
  ],
  questionHeading: '설교준비와 말씀 연구로 분주한 설교자의 고민',
  questionText:
    '설교 준비할 때 여러 역본과 원어 주석을 한 화면에서 바로 대조할 순 없을까? 묵상한 성경 구절과 설교 원고를 흩어지지 않게 하나로 정리할 순 없을까? 강단에서 태블릿으로 보기에 가장 편안하고 가벼운 성경 프로그램은 없을까? 복잡한 프로그램 없이 어디서나 1초 만에 켜질 순 없을까?',
  mainHeadingLine1: '말씀 연구의 깊이를 더하다',
  mainHeadingLine2: '네이션스 Bible AI',
  subHeadingLine1: '설교준비 어디서든 가능합니다.',
  subHeadingLine2: '나만의 주석책을 만들어요',
  diffTag: '단순한 설교준비 앱은 많습니다.',
  diffHeading:
    '매주 강단에 오르기 전 말씀을 연구하고 씨름하는 목회자의 심정으로, 다년간 설교준비의 노하우를 담아 앱을 만들었습니다.',
  diffDesc: '설교 준비의 모든 번잡함을 걷어내고 말씀의 본질에 집중할 수 있도록 돕습니다.',
  diffBadges: ['주석 클라우드 실시간 연동', '다중 역본 대조', '절별 주석 설교 라이브러리'],
  loginCardBadge: '무료로 이용하기',
  loginCardSubtitle: '지금 무료로 시작하기',
  corePoints: [
    {
      title: '가볍고 쉬운 나만의 설교 데스크',
      desc: '복잡하고 무거운 성경 소프트웨어 대신, 말씀 묵상과 설교 원고 작성에만 온전히 집중할 수 있는 설교 워크스페이스를 제공합니다. 태블릿과 노트북, 데스크탑 어디서나 1초 만에 즉시 접속가능합니다.',
      image: null,
      altText: '설교자를 위한 맞춤 설교데스크',
      gradientClass: 'bg-gradient-to-br from-[#EAE6F5] via-[#E4E8F7] to-[#D5DCF5]',
    },
    {
      title: '역본 동시 대조 & AI 원어 주석',
      desc: '여러 번역본을 멀티뷰로 대조하고, AI 원어 주석 으로 단어 하나하나에 담긴 원문 시제와 깊은 의미를 바로 확인하세요.',
      image: null,
      altText: '다중 역본 동시 대조 및 원어 사전',
      gradientClass: 'bg-gradient-to-br from-[#E3F5EC] via-[#E8F3EE] to-[#D6EBE0]',
    },
    {
      title: '흩어진 자료를 통합하여 나만의 주석책',
      desc: '오랜기간 설교를 하다보면, 모든 자료가 흩어집니다. 한번 참고한 자료를 다시 참고해야하는 번거로움 없이 성경구절마다 나만의 주석, 노트, 관주, 설교를 보관할수 있습니다. 수년 전의 은혜의 메시지도 성경 구절 검색 한 번으로 즉시 되살아납니다.',
      image: null,
      altText: '성경 본문 연동 설교 아카이빙',
      gradientClass: 'bg-gradient-to-br from-[#FFF3E6] via-[#FCEEE2] to-[#F7DFCD]',
    },
  ],
  faqs: [
    {
      q: '가입 및 이용은 무료인가요?',
      preview: '네 무료로 가입하여도 기본 기능을 충분히 이용하실 수 있습니다.',
      a: '유료기능은 크레딧을 구매하여 사용한 만큼 차감하는 구조입니다. 심혈을 기울여 만든 고급기능을 유료로 결제하여 차원이 다른 편리함을 경험해 보세요.',
    },
    {
      q: '기존에 사용하던 무거운 PC 성경 프로그램에 비해 어떤 실질적 장점이 있나요?',
      preview: '네이션스 성경은 무겁지 않으며 언제 어디서나 즉시 이어집니다.',
      a: '복잡하고 난해한 메뉴 대신 목회자가 가장 자주 쓰는 역본 대조와 절별 메모를 직관적으로 배치했습니다. 서재의 PC, 이동 중 스마트폰, 강단 위의 태블릿까지 실시간 클라우드로 완벽 동기화됩니다.',
    },
    {
      q: 'AI 원어 주석과 개인 주석기능은 어떻게 활용하나요?',
      preview: '네이션스 성경은 완벽한 나만의 주석을 추구합니다.',
      a: 'AI원어 주석을 통해 구절별, 단어별, 심층 주석을 제공받고, 사용자가 메모해둔 주석과 관주, 설교등이 모두 성경텍스트 안에 구절마다 담겨져 있습니다. 기존의 흩어져 있던 자료들을 찾느라 시간낭비 없이 나만의 주석이 완성됩니다.',
    },
  ],
};

const UPDATE_EVENT = 'nations-bible-landing-data-updated';

const memoryCache: Record<string, LandingData> = {
  bible: { ...DEFAULT_BIBLE_LANDING_DATA },
};

function loadFromLocalStorage(pageKey = 'bible') {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const raw = localStorage.getItem(`nations_landing_${pageKey}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      memoryCache[pageKey] = {
        ...DEFAULT_BIBLE_LANDING_DATA,
        ...parsed,
        corePoints: DEFAULT_BIBLE_LANDING_DATA.corePoints.map((cp, idx) => ({
          ...cp,
          ...(parsed.corePoints?.[idx] || {}),
        })),
      };
    }

    // 개별 이미지 캐시 확인 (홈페이지에서 'nations_img_bible_0' 형식으로 저장)
    for (let i = 0; i < 3; i++) {
      const imgKey = `nations_img_${pageKey}_${i}`;
      const imgVal = localStorage.getItem(imgKey);
      if (imgVal && memoryCache[pageKey].corePoints[i]) {
        if (!memoryCache[pageKey].corePoints[i].image) {
          memoryCache[pageKey].corePoints[i].image = imgVal;
        }
      }
    }
  } catch (err) {
    console.warn(`[homeLandingService] LocalStorage load error for ${pageKey}:`, err);
  }
}
loadFromLocalStorage('bible');

let listenersInitialized = false;
function initFirestoreLandingSync(pageKey = 'bible') {
  if (typeof window === 'undefined') return;

  try {
    // 1. 홈페이지의 'site_images/bible' 실시간 구독
    const imgDocRef = doc(homeDb, 'site_images', pageKey);
    onSnapshot(imgDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        let changed = false;
        if (data && Array.isArray(data.images)) {
          for (let i = 0; i < 3; i++) {
            const cloudImg = data.images[i] ?? null;
            if (memoryCache[pageKey].corePoints[i].image !== cloudImg) {
              memoryCache[pageKey].corePoints[i].image = cloudImg;
              changed = true;
              try {
                if (cloudImg) {
                  localStorage.setItem(`nations_img_${pageKey}_${i}`, cloudImg);
                } else {
                  localStorage.removeItem(`nations_img_${pageKey}_${i}`);
                }
              } catch (e) {}
            }
          }
        }
        if (changed) {
          saveToLocalStorage(pageKey);
          window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
        }
      }
    }, (err) => {
      console.warn('[homeLandingService] site_images snapshot error:', err);
    });

    // 2. 홈페이지의 'site_intro/bible' 실시간 구독 (홈페이지 어드민에서 문구 수정 시 즉시 반영)
    const introDocRef = doc(homeDb, 'site_intro', pageKey);
    onSnapshot(introDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data) {
          memoryCache[pageKey] = {
            ...memoryCache[pageKey],
            heroVideoUrl: data.heroVideoUrl || memoryCache[pageKey].heroVideoUrl,
            heroTopText: data.heroTopText || memoryCache[pageKey].heroTopText,
            heroPhrases: data.heroPhrases || memoryCache[pageKey].heroPhrases,
            questionHeading: data.questionHeading || memoryCache[pageKey].questionHeading,
            questionText: data.questionText || memoryCache[pageKey].questionText,
            mainHeadingLine1: data.mainHeadingLine1 || memoryCache[pageKey].mainHeadingLine1,
            mainHeadingLine2: data.mainHeadingLine2 || memoryCache[pageKey].mainHeadingLine2,
            subHeadingLine1: data.subHeadingLine1 || memoryCache[pageKey].subHeadingLine1,
            subHeadingLine2: data.subHeadingLine2 || memoryCache[pageKey].subHeadingLine2,
            corePoints: memoryCache[pageKey].corePoints.map((cp, idx) => ({
              ...cp,
              title: data.corePoints?.[idx]?.title || cp.title,
              desc: data.corePoints?.[idx]?.desc || cp.desc,
              image: data.corePoints?.[idx]?.image || cp.image,
            })),
          };
          saveToLocalStorage(pageKey);
          window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
        }
      }
    }, (err) => {
      console.warn('[homeLandingService] site_intro snapshot error:', err);
    });
  } catch (err) {
    console.warn('[homeLandingService] Firestore subscription failed:', err);
  }
}

function saveToLocalStorage(pageKey: string) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(`nations_landing_${pageKey}`, JSON.stringify(memoryCache[pageKey]));
  } catch (e) {}
}

if (typeof window !== 'undefined' && !listenersInitialized) {
  listenersInitialized = true;
  initFirestoreLandingSync('bible');
}

export function useHomeLandingData(pageKey = 'bible'): LandingData {
  const [data, setData] = useState<LandingData>(() => ({
    ...memoryCache[pageKey],
    corePoints: memoryCache[pageKey].corePoints.map(p => ({ ...p })),
  }));

  useEffect(() => {
    const handleUpdate = () => {
      setData({
        ...memoryCache[pageKey],
        corePoints: memoryCache[pageKey].corePoints.map(p => ({ ...p })),
      });
    };

    handleUpdate();
    window.addEventListener(UPDATE_EVENT, handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener(UPDATE_EVENT, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [pageKey]);

  return data;
}
