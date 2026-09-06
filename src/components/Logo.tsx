import React from 'react';

interface LogoProps {
  size?: number;
  className?: string;
  variant?: 'teal' | 'gradient' | 'white';
}

/**
 * CloudBot Official Logo Icon
 * Vector line-art matching the friendly cloud robot with twin antenna bobbles,
 * expressive round optic eyes, and the signature curled cloud-shell contour.
 */
export const LogoIcon: React.FC<LogoProps> = ({ 
  size = 32, 
  className = '',
  variant = 'teal' 
}) => {
  return (
    <svg
      width={size}
      height={(size * 72) / 94}
      viewBox="0 0 94 72"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 transition-transform duration-300 hover:scale-105 select-none ${className}`}
      aria-label="CloudBot Logo"
    >
      <defs>
        {/* Vibrant Teal Brand Gradient */}
        <linearGradient id="cb-teal-grad" x1="10" y1="6" x2="84" y2="66" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2dd4bf" />
          <stop offset="50%" stopColor="#14b8a6" />
          <stop offset="100%" stopColor="#0891b2" />
        </linearGradient>

        {/* Radiant Ambient Filter */}
        <filter id="cb-ambient-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Group with Brand Styling */}
      <g filter="url(#cb-ambient-glow)">
        {/* 1. Left Antenna with Rounded Bobble Tip */}
        <line
          x1="61"
          y1="29"
          x2="63.5"
          y2="13"
          stroke="url(#cb-teal-grad)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <circle cx="64" cy="9.5" r="4.3" fill="url(#cb-teal-grad)" />

        {/* 2. Right Antenna with Rounded Bobble Tip */}
        <line
          x1="67"
          y1="33"
          x2="79"
          y2="19"
          stroke="url(#cb-teal-grad)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <circle cx="82" cy="16" r="4.3" fill="url(#cb-teal-grad)" />

        {/* 3. Main Cloud Head Contour (Enlarged and Clean) */}
        <path
          d="M 24 64 
             C 12 64, 8 51, 13 41 
             C 16 33, 25 31, 32 32 
             C 36 20, 52 18, 64 26 
             C 70 30, 75 37, 74 45 
             C 73 54, 71 64, 66 64 
             Z"
          stroke="url(#cb-teal-grad)"
          strokeWidth="5.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* 4. Bottom Line of Face Contour */}
        <path
          d="M 24 64 L 66 64"
          stroke="url(#cb-teal-grad)"
          strokeWidth="5.5"
          strokeLinecap="round"
        />

        {/* 5. Expressive Circular Eyes */}
        <circle cx="37" cy="48" r="4.6" fill="url(#cb-teal-grad)" />
        <circle cx="53" cy="48" r="4.6" fill="url(#cb-teal-grad)" />
      </g>
    </svg>
  );
};

export const LogoFull: React.FC<LogoProps & { showSub?: boolean; vertical?: boolean }> = ({ 
  size = 32, 
  showSub = false,
  vertical = false,
  className = ''
}) => {
  if (vertical) {
    return (
      <div className={`flex flex-col items-center text-center ${className}`}>
        <LogoIcon size={size * 1.3} />
        <div className="mt-2.5">
          <h1 className="text-2xl font-bold text-white tracking-tight leading-none font-sans flex items-center justify-center">
            Cloud<span className="text-teal-400 font-extrabold ml-0.5">Bot</span>
          </h1>
          {showSub && (
            <p className="text-[10px] text-teal-400/80 tracking-widest uppercase mt-1 font-mono font-medium">
              24/7 Cloud Hosting
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoIcon size={size} />
      <div className="flex flex-col">
        <h1 className="text-xl font-bold text-white tracking-tight leading-none font-sans flex items-center">
          Cloud<span className="text-teal-400 font-extrabold ml-0.5">Bot</span>
        </h1>
        {showSub && (
          <p className="text-[9.5px] text-teal-400/80 tracking-widest uppercase mt-1 font-mono font-medium">
            24/7 Cloud Hosting
          </p>
        )}
      </div>
    </div>
  );
};




