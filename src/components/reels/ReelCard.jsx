import { Link } from 'react-router-dom';
import { Eye, Play, Clock } from 'lucide-react';
import { reelPoster } from '../../lib/cloudinary';
import { formatNumber, formatDuration } from '../../utils/format';
import { useAuth } from '../../contexts/AuthContext';

/**
 * Vertical (9:16) reel card: auto-extracted poster frame, duration badge,
 * hover play affordance. Opens the reel player (popup) via onOpen, or links
 * to /reel/:slug when no handler is provided.
 */
export function ReelCard({ reel, onOpen }) {
  const { isAdmin } = useAuth();

  const card = (
    <figure className="group relative w-full overflow-hidden rounded-2xl bg-stone-100 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg dark:bg-stone-800">
      {/* 9:16 portrait frame */}
      <div className="relative w-full overflow-hidden" style={{ paddingTop: '177.78%' }}>
        <img
          src={reelPoster(reel, 480)}
          alt={reel.title || ''}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            e.currentTarget.src =
              'data:image/svg+xml,' +
              encodeURIComponent(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9 16"><rect width="9" height="16" fill="#292524"/></svg>',
              );
          }}
        />

        {/* Center play affordance */}
        <div className="absolute inset-0 z-10 grid place-items-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-black/45 backdrop-blur-sm transition-transform duration-300 group-hover:scale-110">
            <Play className="ml-0.5 h-5 w-5 fill-white text-white" aria-hidden />
          </span>
        </div>

        {/* Bottom gradient + meta */}
        <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-3 pt-10">
          <h3 className="text-sm font-medium leading-snug text-white line-clamp-2 drop-shadow-sm">
            {reel.title}
          </h3>
          <div className="mt-1.5 flex items-center gap-3 text-[11px] font-medium text-stone-200">
            <span className="inline-flex items-center gap-1">
              <Eye className="h-3.5 w-3.5" aria-hidden />
              {formatNumber(reel.view_count)}
            </span>
            {reel.duration > 0 && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                {formatDuration(reel.duration)}
              </span>
            )}
          </div>
        </div>

        {/* Top badges */}
        <div className="absolute left-2 top-2 z-10 flex items-center gap-1.5">
          {reel.is_featured && (
            <span className="rounded-full bg-amber-400/95 px-2 py-0.5 text-[10px] font-semibold text-amber-950">
              Featured
            </span>
          )}
          {isAdmin && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                reel.is_published ? 'bg-emerald-500/95 text-white' : 'bg-stone-500/95 text-white'
              }`}
            >
              {reel.is_published ? 'Published' : 'Draft'}
            </span>
          )}
        </div>
      </div>
    </figure>
  );

  if (onOpen) {
    return (
      <button type="button" onClick={() => onOpen(reel)} className="block w-full cursor-pointer text-left">
        {card}
      </button>
    );
  }
  return (
    <Link to={`/reel/${reel.slug}`} className="block w-full">
      {card}
    </Link>
  );
}
