import React, { useEffect } from 'react';

declare global {
  interface Window {
    adsbygoogle?: any[];
  }
}

interface AdSenseBannerProps {
  client?: string;
  slot?: string;
  format?: 'auto' | 'fluid' | 'rectangle' | 'horizontal' | 'vertical';
  responsive?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const AdSenseBanner: React.FC<AdSenseBannerProps> = ({
  client = (import.meta.env.VITE_ADSENSE_CLIENT_ID as string) || 'ca-pub-XXXXXXXXXXXXXXXX',
  slot = (import.meta.env.VITE_ADSENSE_SLOT_ID as string) || '',
  format = 'auto',
  responsive = true,
  className = '',
  style = { display: 'block' },
}) => {
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && client && client !== 'ca-pub-XXXXXXXXXXXXXXXX') {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      }
    } catch {
      // Ignore adsbygoogle errors when ad blockers or offline
    }
  }, [client, slot]);

  const isConfigured = client && client !== 'ca-pub-XXXXXXXXXXXXXXXX' && !client.includes('XXXX');

  return (
    <div className={`adsense-wrapper overflow-hidden my-4 text-center ${className}`}>
      {isConfigured ? (
        <ins
          className="adsbygoogle"
          style={style}
          data-ad-client={client}
          {...(slot ? { 'data-ad-slot': slot } : {})}
          data-ad-format={format}
          data-full-width-responsive={responsive ? 'true' : 'false'}
        />
      ) : (
        <div className="w-full py-3 px-4 rounded-xl border border-dashed border-white/10 bg-white/[0.02] text-zinc-500 text-xs flex items-center justify-center gap-2 select-none">
          <span className="w-2 h-2 rounded-full bg-amber-500/70 animate-pulse" />
          <span>Google AdSense maydoni (ID kiritilganda reklamalar avtomatik namoyish etiladi)</span>
        </div>
      )}
    </div>
  );
};

export default AdSenseBanner;
