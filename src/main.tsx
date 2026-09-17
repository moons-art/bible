import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.css'

// PWA 서비스 워커 등록 (Chrome, Edge 등에서 앱 설치 프롬프트 및 PWA 지원 활성화)
if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.log('SW registration error: ', err);
    });
  });
} else if ('serviceWorker' in navigator) {
  // 로컬 개발 환경에서도 PWA 설치 테스트가 가능하도록 등록
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

