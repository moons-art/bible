import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lock, Activity, RefreshCw, Trash2 } from 'lucide-react';
import { collection, query, orderBy, limit, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../api/firebaseConfig';

interface AdminModalProps {
  onClose: () => void;
}

interface LogEntry {
  id: string;
  userEmail: string;
  userName: string;
  action: string;
  details: string;
  timestamp: string;
}

export const AdminModal: React.FC<AdminModalProps> = ({ onClose }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleClearLogs = async () => {
    if (logs.length === 0) return;
    if (!confirm('정말로 모든 활동 기록을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) return;
    
    setIsDeleting(true);
    try {
      const deletePromises = logs.map(log => deleteDoc(doc(db, 'activity_logs', log.id)));
      await Promise.all(deletePromises);
      setLogs([]);
    } catch (error) {
      console.error("Error clearing logs:", error);
      alert('기록 삭제 중 오류가 발생했습니다.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === '8395') {
      setIsAuthenticated(true);
      fetchLogs();
    } else {
      setError(true);
      setPassword('');
    }
  };

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const logsRef = collection(db, 'activity_logs');
      const q = query(logsRef, orderBy('timestamp', 'desc'), limit(100));
      const querySnapshot = await getDocs(q);
      
      const fetchedLogs: LogEntry[] = [];
      querySnapshot.forEach((doc) => {
        fetchedLogs.push({ id: doc.id, ...doc.data() } as LogEntry);
      });
      setLogs(fetchedLogs);
    } catch (error) {
      console.error("Error fetching logs:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
      >
        <div className="flex justify-between items-center p-6 border-b border-slate-100">
          <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800">
            <Lock className="w-5 h-5 text-indigo-600" />
            관리자 모드
          </h2>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 bg-slate-50">
          {!isAuthenticated ? (
            <div className="h-full flex items-center justify-center">
              <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 max-w-sm w-full">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Lock className="w-8 h-8" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800">관리자 인증</h3>
                  <p className="text-sm text-slate-500 mt-1">접근 코드를 입력해주세요</p>
                </div>
                
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(false);
                  }}
                  placeholder="비밀번호"
                  className={`w-full p-3 border rounded-xl mb-4 text-center tracking-widest text-lg focus:outline-none focus:ring-2 ${error ? 'border-red-300 focus:ring-red-200 bg-red-50' : 'border-slate-200 focus:ring-indigo-100'}`}
                  autoFocus
                />
                {error && <p className="text-red-500 text-xs text-center mb-4">비밀번호가 일치하지 않습니다.</p>}
                
                <button 
                  type="submit"
                  className="w-full py-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-medium transition-colors"
                >
                  접속하기
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold flex items-center gap-2 text-slate-700">
                  <Activity className="w-5 h-5 text-indigo-500" />
                  최근 접속 및 활동 기록
                </h3>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleClearLogs}
                    disabled={isDeleting || logs.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    전체 삭제
                  </button>
                  <button 
                    onClick={fetchLogs}
                    disabled={isLoading || isDeleting}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    새로고침
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <tr>
                      <th className="px-6 py-4 font-medium">시간</th>
                      <th className="px-6 py-4 font-medium">계정 (이메일)</th>
                      <th className="px-6 py-4 font-medium">활동 내역</th>
                      <th className="px-6 py-4 font-medium">상세</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {logs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                          기록된 활동이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      logs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-slate-500">
                            {new Date(log.timestamp).toLocaleString('ko-KR')}
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-medium text-slate-700">{log.userName}</div>
                            <div className="text-xs text-slate-400">{log.userEmail}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                              {log.action}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-500 max-w-xs truncate" title={log.details}>
                            {log.details || '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
