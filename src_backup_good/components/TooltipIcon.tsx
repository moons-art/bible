import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';
import { useHymnal } from '../stores/HymnalProvider';

export const TooltipIcon = ({ text, position = 'inline' }: { text: string; position?: 'inline' | 'bottom-right' | 'top-right' }) => {
  const { showAllTooltips } = useHymnal();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, []);

  const updatePosition = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const isTooRight = rect.right + 280 > window.innerWidth;
      setCoords({ 
        top: rect.top + rect.height / 2, 
        left: isTooRight ? rect.left - 290 : rect.right + 12 
      });
    }
  };

  if (!showAllTooltips) return null;

  const wrapperClass = position === 'bottom-right' 
    ? "absolute bottom-1.5 right-1.5 flex items-center justify-center z-10" 
    : position === 'top-right'
    ? "absolute top-1.5 right-1.5 flex items-center justify-center z-10"
    : "relative inline-flex items-center ml-1";

  const iconClass = position === 'bottom-right' || position === 'top-right'
    ? `w-4 h-4 transition-colors cursor-help bg-white rounded-full shadow-sm ${isOpen ? 'text-indigo-600' : 'text-slate-300 hover:text-red-500'}`
    : `w-4 h-4 transition-colors cursor-help ${isOpen ? 'text-indigo-600' : 'text-slate-400 hover:text-red-500'}`;

  return (
    <div 
      ref={containerRef}
      className={wrapperClass} 
      onClick={e => {
        e.preventDefault();
        e.stopPropagation();
        if (!isOpen) updatePosition();
        setIsOpen(!isOpen);
      }}
      onMouseEnter={() => {
        updatePosition();
        setIsOpen(true);
      }}
      onMouseLeave={() => setIsOpen(false)}
    >
      <HelpCircle className={iconClass} />
      {isOpen && createPortal(
        <div 
          className="fixed w-[280px] p-4 bg-slate-800 text-white text-[12px] font-bold leading-relaxed rounded-xl shadow-2xl text-left whitespace-pre-wrap z-[99999]"
          style={{ top: coords.top, left: coords.left, transform: 'translateY(-50%)' }}
        >
          {text}
        </div>,
        document.body
      )}
    </div>
  );
};
