import React, { useState } from 'react';
import { ExternalLink, Globe, Play, Image as ImageIcon, Github, Send as TelegramIcon } from 'lucide-react';

interface LinkPreviewData {
  url: string;
  domain: string;
  title: string;
  description?: string;
  imageUrl?: string;
  isVideo?: boolean;
  type: 'youtube' | 'image' | 'github' | 'telegram' | 'generic';
}

// Helper to extract URLs from text
export function extractUrls(text: string): string[] {
  if (!text) return [];
  const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/gi;
  const matches = text.match(urlRegex);
  if (!matches) return [];
  return matches.map(u => {
    let clean = u.replace(/[),.;!]+$/, '');
    if (clean.startsWith('www.')) {
      clean = 'https://' + clean;
    }
    return clean;
  });
}

// Parse URL metadata
export function parseUrlInfo(rawUrl: string): LinkPreviewData {
  let url = rawUrl;
  if (url.startsWith('www.')) {
    url = 'https://' + url;
  }

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const pathname = parsed.pathname;

    // 1. YouTube
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
      let videoId = '';
      if (hostname.includes('youtu.be')) {
        videoId = pathname.slice(1).split('/')[0].split('?')[0];
      } else {
        videoId = parsed.searchParams.get('v') || '';
        if (!videoId && pathname.includes('/shorts/')) {
          videoId = pathname.split('/shorts/')[1]?.split('/')[0]?.split('?')[0] || '';
        }
      }

      return {
        url,
        domain: 'youtube.com',
        title: videoId ? 'YouTube Video' : 'YouTube',
        description: 'YouTube orqali videoni tomosha qiling',
        imageUrl: videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : undefined,
        isVideo: true,
        type: 'youtube'
      };
    }

    // 2. Direct Image URLs
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    if (imageExtensions.some(ext => pathname.toLowerCase().endsWith(ext))) {
      const filename = pathname.split('/').pop() || 'Rasm';
      return {
        url,
        domain: hostname,
        title: filename,
        description: 'Rasm havolasi',
        imageUrl: url,
        type: 'image'
      };
    }

    // 3. GitHub
    if (hostname === 'github.com') {
      const parts = pathname.split('/').filter(Boolean);
      let title = 'GitHub';
      let description = 'GitHub repository yoki profil';
      if (parts.length >= 2) {
        title = `${parts[0]} / ${parts[1]}`;
        description = 'GitHub repozitoriysi';
      } else if (parts.length === 1) {
        title = `@${parts[0]}`;
        description = 'GitHub dasturchi profili';
      }

      return {
        url,
        domain: 'github.com',
        title,
        description,
        type: 'github'
      };
    }

    // 4. Telegram
    if (hostname === 't.me' || hostname === 'telegram.me') {
      const target = pathname.slice(1).split('/')[0];
      return {
        url,
        domain: 't.me',
        title: target ? `@${target}` : 'Telegram',
        description: 'Telegram kanal, guruh yoki foydalanuvchi',
        type: 'telegram'
      };
    }

    // 5. Generic Website
    let displayTitle = hostname;
    if (pathname && pathname !== '/') {
      const slug = decodeURIComponent(pathname.replace(/\/$/, '').split('/').pop() || '')
        .replace(/[-_]/g, ' ');
      if (slug.length > 2) {
        displayTitle = slug.charAt(0).toUpperCase() + slug.slice(1);
      }
    }

    return {
      url,
      domain: hostname,
      title: displayTitle,
      description: url,
      type: 'generic'
    };
  } catch {
    return {
      url,
      domain: rawUrl,
      title: rawUrl,
      type: 'generic'
    };
  }
}

// Component to render text with clickable links
export const FormattedMessageText: React.FC<{ text: string; isMe?: boolean }> = ({ text, isMe }) => {
  if (!text) return null;

  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;
  const parts = text.split(urlRegex);

  return (
    <span className="whitespace-pre-wrap leading-relaxed break-all [overflow-wrap:anywhere] max-w-full inline-block">
      {parts.map((part, index) => {
        if (!part) return null;
        if (part.match(urlRegex)) {
          let href = part;
          if (href.startsWith('www.')) href = 'https://' + href;
          return (
            <a
              key={index}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className={`underline font-medium break-all [overflow-wrap:anywhere] max-w-full transition-colors inline-flex items-center gap-1 ${
                isMe
                  ? 'text-cyan-100 hover:text-white decoration-cyan-300/60 hover:decoration-white'
                  : 'text-cyan-400 hover:text-cyan-300 decoration-cyan-500/40 hover:decoration-cyan-300'
              }`}
            >
              <span className="break-all">{part}</span>
              <ExternalLink className="w-3 h-3 inline-block shrink-0 opacity-70" />
            </a>
          );
        }
        return <span key={index} className="break-words [overflow-wrap:anywhere]">{part}</span>;
      })}
    </span>
  );
};

// Rich Link Preview Card Component in CloudBot dark glassmorphism styling
export const RichLinkPreviewCard: React.FC<{ url: string; isMe?: boolean }> = ({ url, isMe }) => {
  const [imageError, setImageError] = useState(false);
  const info = parseUrlInfo(url);
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${info.domain}&sz=64`;

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        window.open(info.url, '_blank', 'noopener,noreferrer');
      }}
      className={`mt-2.5 w-full max-w-full rounded-xl overflow-hidden border transition-all cursor-pointer group shadow-lg ${
        isMe
          ? 'bg-[#0b141e]/90 border-cyan-400/30 hover:border-cyan-300/60 shadow-black/40'
          : 'bg-[#0d101d]/90 border-white/10 hover:border-cyan-500/40 shadow-black/50'
      }`}
    >
      {/* Visual Thumbnail (if YouTube or Image) */}
      {info.imageUrl && !imageError && (
        <div className="relative w-full h-36 sm:h-44 bg-black/80 overflow-hidden border-b border-white/10 flex items-center justify-center">
          <img
            src={info.imageUrl}
            alt={info.title}
            onError={() => setImageError(true)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          {info.isVideo && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/20 transition-colors">
              <div className="w-12 h-12 rounded-full bg-rose-600/90 text-white flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
                <Play className="w-5 h-5 fill-white ml-0.5" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Card Body */}
      <div className="p-3 min-w-0 max-w-full overflow-hidden">
        {/* Header with Favicon & Domain */}
        <div className="flex items-center justify-between gap-2 mb-1.5 min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-4 h-4 rounded-full overflow-hidden shrink-0 bg-white/10 flex items-center justify-center">
              {info.type === 'github' ? (
                <Github className="w-3.5 h-3.5 text-white" />
              ) : info.type === 'telegram' ? (
                <TelegramIcon className="w-3.5 h-3.5 text-cyan-400" />
              ) : (
                <img
                  src={faviconUrl}
                  alt={info.domain}
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                  className="w-full h-full object-cover"
                />
              )}
            </div>
            <span className="text-[11px] font-semibold tracking-wide text-cyan-400/90 uppercase font-mono truncate">
              {info.domain}
            </span>
          </div>

          <span className="text-[10px] text-zinc-400 group-hover:text-cyan-300 transition-colors flex items-center gap-1 shrink-0 font-medium">
            <span>Ochish</span>
            <ExternalLink className="w-3 h-3" />
          </span>
        </div>

        {/* Title */}
        <h4 className="text-xs sm:text-sm font-bold text-white group-hover:text-cyan-200 transition-colors line-clamp-1 mb-0.5 break-words">
          {info.title}
        </h4>

        {/* Description / Subtext */}
        {info.description && (
          <p className="text-[11px] text-zinc-400 line-clamp-2 leading-relaxed break-all [overflow-wrap:anywhere]">
            {info.description}
          </p>
        )}
      </div>
    </div>
  );
};
