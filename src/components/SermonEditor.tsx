import React from 'react';
import { Save, Share2, Printer, CheckCircle, FileText } from 'lucide-react';

export const SermonEditor: React.FC<{ route: string }> = ({ route }) => {
  const sermonId = route.split('/').pop();

  return (
    <div className="flex flex-col h-screen bg-slate-50 font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 rounded-xl">
            <FileText className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-800">설교문 작성기</h1>
            <p className="text-xs text-slate-500 font-medium">ID: {sermonId}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors font-bold text-sm">
            <Printer className="w-4 h-4" /> 인쇄
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors font-bold text-sm shadow-md">
            <Save className="w-4 h-4" /> 저장 (자동)
          </button>
        </div>
      </header>

      {/* Editor Body (Placeholder for now) */}
      <div className="flex-1 p-8 overflow-y-auto custom-scrollbar flex justify-center">
        <div className="w-full max-w-4xl bg-white shadow-xl border border-slate-200 rounded-lg p-12 min-h-full">
          <input 
            type="text" 
            placeholder="설교 제목을 입력하세요..." 
            className="w-full text-4xl font-black text-slate-900 border-none outline-none mb-8 placeholder:text-slate-300"
            defaultValue={sermonId?.startsWith('new') ? '' : '임시 설교 제목'}
          />
          <textarea 
            className="w-full h-[600px] text-lg leading-relaxed text-slate-700 border-none outline-none resize-none placeholder:text-slate-300"
            placeholder="본문 내용을 이곳에 작성하세요... (이 페이지는 뼈대 템플릿입니다)"
          />
        </div>
      </div>
    </div>
  );
};
