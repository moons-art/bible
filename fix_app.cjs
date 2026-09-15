const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf-8');

// 1. Replace state and toggleSermonSidebar
const oldState = `  const [isSermonSidebarOpen, setIsSermonSidebarOpen] = useState(false);
  const [clipboardSermonText, setClipboardSermonText] = useState<string | null>(null);

  const toggleSermonSidebar = () => {
    if (isSermonSidebarOpen) {
      if (window.confirm("작성 중인 내용을 임시 저장하고 닫으시겠습니까?")) {
        setIsSermonSidebarOpen(false);
      }
    } else {
      setIsSermonSidebarOpen(true);
    }
  };`;

const newState = `  const [isSermonSidebarOpen, setIsSermonSidebarOpen] = useState(false);
  const [clipboardSermonText, setClipboardSermonText] = useState<string | null>(null);
  const [sermonDockPosition, setSermonDockPosition] = useState<'right' | 'left' | 'bottom'>('right');
  const [isSermonCollapsed, setIsSermonCollapsed] = useState(false);
  const [sermonSidebarWidth, setSermonSidebarWidth] = useState(320);

  const toggleSermonSidebar = () => {
    if (isSermonSidebarOpen) {
      if (isSermonCollapsed || sermonDockPosition !== 'right') {
        setSermonDockPosition('right');
        setIsSermonCollapsed(false);
      } else {
        if (window.confirm("작성 중인 내용을 임시 저장하고 닫으시겠습니까?")) {
          setIsSermonSidebarOpen(false);
        }
      }
    } else {
      setSermonDockPosition('right');
      setIsSermonCollapsed(false);
      setIsSermonSidebarOpen(true);
    }
  };`;
content = content.replace(oldState, newState);

// 2. Replace button order
const oldButtons = `                  <button 
                    onClick={(e) => { e.stopPropagation(); toggleSermonSidebar(); }}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-50 border border-red-200 hover:bg-red-100 text-[11px] font-bold text-red-700 transition-colors shadow-sm"
                  >
                    <BookOpen className="w-3.5 h-3.5" /> 설교노트
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setShowAnnotations(!showAnnotations); }}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-[11px] font-bold text-slate-600 transition-colors shadow-sm"
                  >
                    {showAnnotations ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5 text-indigo-500" />}
                    주석 {showAnnotations ? '숨기기' : '보기'}
                  </button>`;

const newButtons = `                  <button 
                    onClick={(e) => { e.stopPropagation(); setShowAnnotations(!showAnnotations); }}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-[11px] font-bold text-slate-600 transition-colors shadow-sm"
                  >
                    {showAnnotations ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5 text-indigo-500" />}
                    주석 {showAnnotations ? '숨기기' : '보기'}
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); toggleSermonSidebar(); }}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-red-50 border border-red-200 hover:bg-red-100 text-[11px] font-bold text-red-700 transition-colors shadow-sm"
                  >
                    <BookOpen className="w-3.5 h-3.5" /> 설교노트
                  </button>`;
content = content.replace(oldButtons, newButtons);

// 3. Replace SermonSidebar component
const oldSidebar = `        {/* Sermon Sidebar */}
        <SermonSidebar 
          isOpen={isSermonSidebarOpen}
          onClose={() => setIsSermonSidebarOpen(false)}
          clipboardText={clipboardSermonText}
          onClipboardTextProcessed={() => setClipboardSermonText(null)}
        />`;

const newSidebar = `        {/* Spacer for Right-Docked Sermon Sidebar */}
        <AnimatePresence>
          {isSermonSidebarOpen && sermonDockPosition === 'right' && !isSermonCollapsed && (
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: sermonSidebarWidth }}
              exit={{ width: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="shrink-0 hidden md:block"
            />
          )}
        </AnimatePresence>

        {/* Sermon Sidebar */}
        <SermonSidebar 
          isOpen={isSermonSidebarOpen}
          dockPosition={sermonDockPosition}
          onDockPositionChange={setSermonDockPosition}
          isCollapsed={isSermonCollapsed}
          onCollapseChange={setIsSermonCollapsed}
          width={sermonSidebarWidth}
          onWidthChange={setSermonSidebarWidth}
          onClose={() => setIsSermonSidebarOpen(false)}
          clipboardText={clipboardSermonText}
          onClipboardTextProcessed={() => setClipboardSermonText(null)}
        />`;
content = content.replace(oldSidebar, newSidebar);

fs.writeFileSync('src/App.tsx', content, 'utf-8');
console.log('App.tsx updated successfully');
