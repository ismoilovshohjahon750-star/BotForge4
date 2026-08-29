import React from 'react';

interface LogoProps {
  size?: number;
  className?: string;
}

export const LogoIcon: React.FC<LogoProps> = ({ size = 32, className = '' }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 transition-transform duration-300 hover:scale-105 select-none ${className}`}
    >
      <defs>
        {/* Glow Filters */}
        <filter id="cb-glow-soft" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id="cb-glow-strong" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Outer Squircle Rim Gradient */}
        <linearGradient id="cb-rim-grad" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="40%" stopColor="#06b6d4" />
          <stop offset="75%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>

        {/* Squircle Glass Background */}
        <linearGradient id="cb-bg-grad" x1="50" y1="0" x2="50" y2="100" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0b172a" />
          <stop offset="50%" stopColor="#060c18" />
          <stop offset="100%" stopColor="#02050c" />
        </linearGradient>

        {/* Cloud Body Premium Radiant Gradient */}
        <linearGradient id="cb-cloud-grad" x1="15" y1="20" x2="85" y2="75" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="35%" stopColor="#00f2fe" />
          <stop offset="70%" stopColor="#0284c7" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>

        {/* Visor Glass Gradient */}
        <linearGradient id="cb-visor-grad" x1="50" y1="42" x2="50" y2="66" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#030712" />
          <stop offset="100%" stopColor="#091427" />
        </linearGradient>

        {/* Radial Ambient Core Light */}
        <radialGradient id="cb-core-glow" cx="50" cy="52" r="30" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00f2fe" stopOpacity="0.4" />
          <stop offset="50%" stopColor="#10b981" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#020617" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 1. Squircle Backplate with Micro-Border */}
      <rect
        x="3.5"
        y="3.5"
        width="93"
        height="93"
        rx="26"
        fill="url(#cb-bg-grad)"
        stroke="url(#cb-rim-grad)"
        strokeWidth="2.2"
      />

      {/* 2. Ambient Internal Holographic Illumination */}
      <circle cx="50" cy="52" r="32" fill="url(#cb-core-glow)" filter="url(#cb-glow-strong)" />

      {/* 3. Sleek Top Antenna & Signal Beacon */}
      <path d="M50 25 L50 14" stroke="url(#cb-cloud-grad)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="50" cy="12.5" r="4.5" fill="#00f2fe" filter="url(#cb-glow-soft)" />
      <circle cx="50" cy="12.5" r="2" fill="#ffffff" />
      
      {/* Top Radio Pulse Waves */}
      <path d="M40 8.5 A 14 14 0 0 1 60 8.5" stroke="#34d399" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
      <path d="M34 5.5 A 22 22 0 0 1 66 5.5" stroke="#00f2fe" strokeWidth="1.5" strokeLinecap="round" opacity="0.45" />

      {/* 4. Aerodynamic Futuristic Cloud Shape (Main Shell) */}
      <path
        d="M26 67 C16.5 67 11.5 57.5 15.5 48 C18.5 40 26 36.5 33.5 35.5 C37 24 49 19 61.5 22.5 C70.5 25 76.5 32.5 78.5 40.5 C87 41.5 91 49.5 89 58 C87.2 65.5 80.5 67 73.5 67 Z"
        fill="url(#cb-cloud-grad)"
        filter="url(#cb-glow-soft)"
      />

      {/* 5. Cyber Visor (Precision Cutout Curved Screen) */}
      <rect
        x="26"
        y="42"
        width="48"
        height="22"
        rx="8"
        fill="url(#cb-visor-grad)"
        stroke="#00f2fe"
        strokeWidth="1.6"
      />

      {/* 6. High-Luminance Cybernetic Optic Eyes */}
      {/* Left Eye */}
      <g filter="url(#cb-glow-soft)">
        <rect x="33.5" y="47.5" width="9.5" height="11" rx="3.5" fill="#00f2fe" />
        <rect x="35.5" y="49" width="4.5" height="5" rx="1.5" fill="#ffffff" />
      </g>

      {/* Right Eye */}
      <g filter="url(#cb-glow-soft)">
        <rect x="57" y="47.5" width="9.5" height="11" rx="3.5" fill="#00f2fe" />
        <rect x="59" y="49" width="4.5" height="5" rx="1.5" fill="#ffffff" />
      </g>

      {/* 7. Friendly Cyber Wave / Smile Indicator */}
      <path d="M46.5 59.5 Q50 62.5 53.5 59.5" stroke="#34d399" strokeWidth="2.2" strokeLinecap="round" />

      {/* 8. Cloud Server Uplink & Data Bus Nodes at Bottom */}
      <path d="M35 77 Q50 83 65 77" stroke="url(#cb-cloud-grad)" strokeWidth="2.2" strokeLinecap="round" opacity="0.85" />
      <g filter="url(#cb-glow-soft)">
        <circle cx="34" cy="85" r="2.5" fill="#10b981" />
        <circle cx="50" cy="87.5" r="3.5" fill="#00f2fe" />
        <circle cx="66" cy="85" r="2.5" fill="#6366f1" />
      </g>
      <circle cx="50" cy="87.5" r="1.5" fill="#ffffff" />
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
          <h1 className="text-2xl font-black text-white tracking-wider uppercase leading-none font-sans flex items-center justify-center gap-0.5">
            CLOUD<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-cyan-300 to-blue-400">BOT</span>
          </h1>
          {showSub && (
            <p className="text-[10px] text-cyan-400/80 tracking-widest uppercase mt-1 font-mono font-medium">
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
        <h1 className="text-xl font-black text-white tracking-wider uppercase leading-none font-sans flex items-center gap-0.5">
          CLOUD<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-cyan-300 to-blue-400">BOT</span>
        </h1>
        {showSub && (
          <p className="text-[9.5px] text-cyan-400/80 tracking-widest uppercase mt-1 font-mono font-medium">
            24/7 Cloud Hosting
          </p>
        )}
      </div>
    </div>
  );
};



