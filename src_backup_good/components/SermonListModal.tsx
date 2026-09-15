import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, FileEdit, Plus, Calendar, Search } from 'lucide-react';

interface Sermon {
  id: string;
  title: string;
  date: string;
}

export const SermonListModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [sermons] = useState<Sermon[]>([
    { id: 'sermon-1', title: '주일예배 - 사랑의 하나님 (임시 데이터)', date: '2026-08-01' },
    { id: 'sermon-2', title: '수요예배 - 믿음과 순종 (임시 데이터)', date: '2026-07-25' }
  ]);

  const [searchQuery, setSearchQuery] = useState('');
  
  const filteredSermons = sermons.filter(s => s.title.toLowerCase().includes(searchQuery.toLowerCase()));

  const openSermonEditor = (sermonId: string) => {
    if (window.ipcRenderer) {
      window.ipcRenderer.invoke('open-sermon-editor', sermonId);
    } else {
      window.open(window.location.origin + window.location.pathname + '#/sermon-editor/' + sermonId, '_blank');
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
            <FileEdit className="w-4 h-4 text-indigo-600" />
            내 설교문 목록
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-full transition-colors text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 border-b border-slate-100 bg-white">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="설교문 제목 검색..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 transition-all"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50/30">
          <button 
            onClick={() => openSermonEditor(`new-${Date.now()}`)}
            className="w-full flex items-center justify-center gap-2 p-3 border-2 border-dashed border-indigo-200 rounded-xl text-indigo-600 text-sm font-bold hover:bg-indigo-50 hover:border-indigo-400 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" /> 새 설교문 작성하기
          </button>
          
          {filteredSermons.map(s => (
            <div 
              key={s.id} 
              onClick={() => openSermonEditor(s.id)}
              className="flex items-center justify-between p-3 bg-white border border-slate-100 rounded-xl shadow-sm hover:shadow-md hover:border-indigo-100 transition-all cursor-pointer group"
            >
              <div>
                <h3 className="font-bold text-sm text-slate-800 group-hover:text-indigo-600 transition-colors">{s.title}</h3>
                <p className="text-xs text-slate-400 flex items-center gap-1 mt-1">
                  <Calendar className="w-3 h-3" /> {s.date}
                </p>
              </div>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <FileEdit className="w-4 h-4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};
