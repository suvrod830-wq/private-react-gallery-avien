import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Clapperboard, Search, Star, X } from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useDebounce } from '../hooks/useDebounce';
import { useReels } from '../hooks/useReels';
import { getReelBySlug } from '../services/reelService';
import { ReelCard } from '../components/reels/ReelCard';
import { ReelLightbox } from '../components/reels/ReelLightbox';
import { GallerySkeleton } from '../components/gallery/GallerySkeleton';
import { EmptyState, ErrorState, ConfigMissing, Spinner } from '../components/ui/Feedback';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Field';
import { SORT_OPTIONS } from '../utils/constants';

const REEL_SORTS = SORT_OPTIONS.filter((o) =>
  ['newest', 'oldest', 'most_viewed', 'recently_updated', 'title_asc', 'title_desc'].includes(o.value),
);

/**
 * Public reels feed — vertical cards, search, sort, infinite scroll.
 * Clicking a card opens the Instagram-style fullscreen player (ReelLightbox).
 *
 * Also renders on /reel/:slug so shared links open the feed with the player
 * popup already on that reel.
 */
export default function Reels() {
  const { slug: openSlug } = useParams();
  const navigate = useNavigate();

  useDocumentTitle('Reels', { description: 'Watch short videos from the collection.' });

  // Filters live in the URL so refresh/bookmark/share/back all work.
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const sort = params.get('sort') || 'newest';
  const featured = params.get('featured') || '';

  const debouncedQ = useDebounce(q, 400);
  const filters = useMemo(() => ({ q: debouncedQ, sort, featured }), [debouncedQ, sort, featured]);

  const { items, total, loading, loadingMore, error, hasMore, loadMore, retry, isNotConfigured } =
    useReels({ filters, pageSize: 18 });

  // Deep-linked reel that isn't part of the currently loaded pages.
  const [standalone, setStandalone] = useState(null);

  const openIndex = openSlug ? items.findIndex((r) => r.slug === openSlug) : -1;

  useEffect(() => {
    if (!openSlug) {
      setStandalone(null);
      return undefined;
    }
    if (items.some((r) => r.slug === openSlug)) {
      setStandalone(null);
      return undefined;
    }
    let active = true;
    getReelBySlug(openSlug)
      .then((reel) => active && setStandalone(reel))
      .catch(() => active && setStandalone(null));
    return () => {
      active = false;
    };
  }, [openSlug, items]);

  function setParam(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  // --- Lightbox wiring -------------------------------------------------------
  const lightboxReel =
    openIndex >= 0 ? items[openIndex] : openSlug && standalone?.slug === openSlug ? standalone : null;

  // Keep the feed's search/sort filters in the URL while the player is open.
  const search = params.toString() ? `?${params.toString()}` : '';

  function openReel(reel) {
    navigate(`/reel/${reel.slug}${search}`);
  }
  function closeReel() {
    navigate(`/reels${search}`);
  }
  function stepReel(delta) {
    if (openIndex >= 0 && items.length > 1) {
      const nextReel = items[(openIndex + delta + items.length) % items.length];
      navigate(`/reel/${nextReel.slug}${search}`, { replace: true });
    }
  }

  if (isNotConfigured) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <ConfigMissing message="Configure the backend and Cloudinary (see README.md) and the reels will load here." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Reels</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            {loading ? 'Loading short videos…' : `${total} reel${total === 1 ? '' : 's'}`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
            <Input
              value={q}
              onChange={(e) => setParam('q', e.target.value)}
              placeholder="Search reels…"
              className="w-52 pl-9"
              aria-label="Search reels"
            />
          </div>

          {/* Featured toggle */}
          <button
            type="button"
            onClick={() => setParam('featured', featured ? '' : 'true')}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              featured
                ? 'border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300'
            }`}
          >
            <Star className="h-4 w-4" aria-hidden /> Featured
          </button>

          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => setParam('sort', e.target.value)}
            aria-label="Sort reels"
            className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200"
          >
            {REEL_SORTS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          {(q || featured || sort !== 'newest') && (
            <button
              type="button"
              onClick={() => setParams(new URLSearchParams(), { replace: true })}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-sm text-stone-500 hover:text-stone-800 dark:hover:text-stone-200"
            >
              <X className="h-4 w-4" aria-hidden /> Clear
            </button>
          )}
        </div>
      </header>

      {error ? (
        <ErrorState message={error} onRetry={retry} />
      ) : loading ? (
        <GallerySkeleton count={8} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Clapperboard}
          title={q || featured ? 'No reels match' : 'No reels yet'}
          description={
            q || featured
              ? 'Try a different search or clear the filters.'
              : 'Short videos will appear here once they are uploaded and published.'
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((reel) => (
              <ReelCard key={reel.id} reel={reel} onOpen={openReel} />
            ))}
          </div>

          <div className="mt-8 flex justify-center">
            {hasMore && (
              <Button variant="outline" onClick={loadMore} loading={loadingMore}>
                Load more
              </Button>
            )}
            {loadingMore && !hasMore && <Spinner />}
          </div>
        </>
      )}

      {/* Instagram-style popup player */}
      {lightboxReel && (
        <ReelLightbox
          reel={lightboxReel}
          index={openIndex >= 0 ? openIndex : 0}
          total={openIndex >= 0 ? items.length : 1}
          onClose={closeReel}
          onPrev={() => stepReel(-1)}
          onNext={() => stepReel(1)}
        />
      )}
    </div>
  );
}
