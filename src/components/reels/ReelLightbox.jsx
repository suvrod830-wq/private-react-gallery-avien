import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Link2,
  Pencil,
  Star,
  X,
} from 'lucide-react';
import { reelOriginal, reelPoster } from '../../lib/cloudinary';
import { formatDate, formatDuration, formatNumber } from '../../utils/format';
import { recordReelView } from '../../services/reelService';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

/**
 * Instagram/Facebook-style fullscreen reel player.
 * - Autoplaying vertical video (opened from a click, so audio is allowed)
 * - Prev/next with arrows, keyboard (←/→/↑/↓) and touch swipe
 * - Esc or backdrop click closes; body scroll is locked while open
 * - Records one view per session per reel
 */
export function ReelLightbox({ reel, index, total, onClose, onPrev, onNext }) {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const touchRef = useRef(null);

  const hasMany = total > 1;

  // Count one view per session per reel (API-side dedupe keeps it honest).
  useEffect(() => {
    if (reel?.id) recordReelView(reel.id);
  }, [reel?.id]);

  const prev = useCallback(() => onPrev?.(), [onPrev]);
  const next = useCallback(() => onNext?.(), [onNext]);

  useEffect(() => {
    if (!reel) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (hasMany && (e.key === 'ArrowLeft' || e.key === 'ArrowUp')) {
        e.preventDefault();
        prev();
      }
      if (hasMany && (e.key === 'ArrowRight' || e.key === 'ArrowDown')) {
        e.preventDefault();
        next();
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [reel, hasMany, onClose, prev, next]);

  if (!reel) return null;

  const handleTouchStart = (e) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY };
  };
  const handleTouchEnd = (e) => {
    if (!touchRef.current || !hasMany) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchRef.current.x;
    const dy = t.clientY - touchRef.current.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) next();
      else prev();
    }
    touchRef.current = null;
  };

  async function copyLink() {
    const url = `${window.location.origin}/reel/${reel.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard.');
    } catch {
      toast.error('Could not copy link.');
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[95] flex flex-col bg-black/95 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={reel.title}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3">
        <p className="max-w-[55%] truncate text-sm font-medium text-white/80">
          {reel.title}
          {hasMany && (
            <span className="ml-2 text-xs text-white/40">
              {index + 1} / {total}
            </span>
          )}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={copyLink}
            aria-label="Copy reel link"
            className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <Link2 className="h-5 w-5" aria-hidden />
          </button>
          {isAdmin && (
            <Link
              to={`/admin/reels/${reel.id}/edit`}
              aria-label="Edit reel"
              className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white"
            >
              <Pencil className="h-5 w-5" aria-hidden />
            </Link>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close player"
            className="rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X className="h-6 w-6" aria-hidden />
          </button>
        </div>
      </div>

      {/* Player + meta */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center gap-6 px-2 pb-4 md:px-10">
        {hasMany && (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="Previous reel"
              className="absolute left-2 z-10 rounded-full bg-white/10 p-2.5 text-white backdrop-blur hover:bg-white/20 sm:left-4"
            >
              <ChevronLeft className="h-6 w-6" aria-hidden />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next reel"
              className="absolute right-2 z-10 rounded-full bg-white/10 p-2.5 text-white backdrop-blur hover:bg-white/20 sm:right-4"
            >
              <ChevronRight className="h-6 w-6" aria-hidden />
            </button>
          </>
        )}

        {/* Clicking the dark area outside the video closes the player */}
        <div className="absolute inset-0" onClick={onClose} aria-hidden />

        <div className="relative z-10 flex h-full max-h-full flex-col items-center justify-center gap-4 md:flex-row md:gap-8">
          {/* Vertical video */}
          <div
            className="relative max-h-[62vh] overflow-hidden rounded-2xl bg-black shadow-2xl md:max-h-[82vh]"
            style={{ aspectRatio: '9 / 16' }}
          >
            <video
              key={reel.id}
              src={reelOriginal(reel)}
              poster={reelPoster(reel, 720)}
              autoPlay
              loop
              controls
              playsInline
              preload="auto"
              className="h-full w-full object-contain"
            />
            {isAdmin && !reel.is_published && (
              <span className="absolute left-2 top-2 rounded-full bg-stone-500/90 px-2.5 py-1 text-xs font-semibold text-white">
                Draft
              </span>
            )}
          </div>

          {/* Meta panel — side on desktop, below on mobile */}
          <div className="w-full max-w-[420px] shrink-0 md:w-72">
            <div className="flex flex-wrap items-center gap-2">
              {reel.is_featured && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-1 text-xs font-semibold text-amber-300">
                  <Star className="h-3.5 w-3.5" aria-hidden /> Featured
                </span>
              )}
            </div>

            <h2 className="mt-2 font-display text-lg font-semibold leading-snug text-white">
              {reel.title}
            </h2>

            {reel.caption && (
              <p className="mt-2 text-sm leading-relaxed text-white/80">{reel.caption}</p>
            )}
            {reel.description && (
              <p className="mt-2 line-clamp-4 whitespace-pre-line text-sm leading-relaxed text-white/50">
                {reel.description}
              </p>
            )}

            <dl className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-white/50">
              <div className="flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5" aria-hidden />
                <dd>{formatNumber(reel.view_count)} views</dd>
              </div>
              {reel.duration > 0 && (
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  <dd>{formatDuration(reel.duration)}</dd>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" aria-hidden />
                <dd>{formatDate(reel.published_at || reel.created_at)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
