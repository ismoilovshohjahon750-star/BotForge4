import React from 'react';

export const NodeJsIcon: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l8.5 5v10L12 22l-8.5-5V7L12 2z" stroke="#68a063" fill="#68a063" fillOpacity="0.2" />
    <path d="M12 22V12" stroke="#68a063" />
    <path d="M12 12l8.5-5" stroke="#68a063" />
    <path d="M12 12L3.5 7" stroke="#68a063" />
  </svg>
);

export const PythonIcon: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M11.914 0C5.825 0 6.2 2.656 6.2 2.656l.006 2.75h5.813v.825H3.87s-3.87.44-3.87 5.856 3.375 5.65 3.375 5.65h2.012v-2.812c0-2.063 1.77-3.75 3.844-3.75h5.78v-.844s.282-4.5-5.093-4.5H5.85V3.813C5.85 1.5 8.1 0 11.914 0zM8.88 1.688a.938.938 0 1 1 0 1.875.938.938 0 0 1 0-1.875z" fill="#3776AB" />
    <path d="M12.086 24c6.089 0 5.714-2.656 5.714-2.656l-.006-2.75h-5.813v-.825h8.149s3.87-.44 3.87-5.856-3.375-5.65-3.375-5.65h-2.012v2.812c0 2.063-1.77 3.75-3.844 3.75h-5.78v.844s-.282 4.5 5.093 4.5h4.064v1.813c0 2.313-2.25 3.813-6.064 3.813zM15.12 22.312a.938.938 0 1 1 0-1.875.938.938 0 0 1 0 1.875z" fill="#FFD43B" />
  </svg>
);

export const GoIcon: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" stroke="#00ACD7" fill="#00ACD7" fillOpacity="0.2" />
    <path d="M8 12h4m0 0l-2-2m2 2l-2 2" stroke="#00ACD7" />
    <path d="M16 9v6" stroke="#00ACD7" />
  </svg>
);

export const RustIcon: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" stroke="#DEA584" fill="#DEA584" fillOpacity="0.2" />
    <path d="M12 7v10M7 12h10" stroke="#DEA584" />
  </svg>
);

export const RubyIcon: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 3l12 0l4 6l-10 12l-10-12z" stroke="#CC342D" fill="#CC342D" fillOpacity="0.2" />
    <path d="M2 9l20 0M12 21l-4-12l4-6l4 6l-4 12" stroke="#CC342D" />
  </svg>
);

export const PhpIcon: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="12" rx="10" ry="7" stroke="#777BB4" fill="#777BB4" fillOpacity="0.2" />
    <text x="12" y="15" textAnchor="middle" fill="#777BB4" fontSize="8" fontWeight="bold" fontFamily="monospace">PHP</text>
  </svg>
);

export const LanguageIcons: React.FC = () => {
  return (
    <div className="flex items-center justify-center gap-4 py-4">
      <NodeJsIcon />
      <PythonIcon />
      <GoIcon />
      <RustIcon />
      <RubyIcon />
      <PhpIcon />
    </div>
  );
};

export default LanguageIcons;
