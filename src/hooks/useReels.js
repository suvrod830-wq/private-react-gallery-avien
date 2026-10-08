import { useCallback, useEffect, useRef, useState } from 'react';
import { listReels } from '../services/reelService';
import { DEFAULT_PAGE_SIZE } from '../utils/constants';

/**
 * Reels data hook: database-side filtering + pagination with infinite
 * scroll. Re-runs whenever `filters` changes. Mirrors useImages.
 */
export function useReels({ filters = {}, pageSize = DEFAULT_PAGE_SIZE, publishedOnly = true }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [isNotConfigured, setIsNotConfigured] = useState(false);

  const pageRef = useRef(1);
  const hasMoreRef = useRef(false);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  const filterKey = JSON.stringify({ filters, publishedOnly, pageSize });

  const loadPage = useCallback(
    async (page, mode) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      if (mode === 'reset') setLoading(true);
      else setLoadingMore(true);

      try {
        const result = await listReels({
          q: filters.q || '',
          featured: filters.featured || '',
          status: filters.status || '',
          sort: filters.sort || 'newest',
          page,
          pageSize,
          publishedOnly,
        });

        if (!mountedRef.current) return;

        setItems((prev) => (page === 1 ? result.items : [...prev, ...result.items]));
        setTotal(result.total);
        hasMoreRef.current = result.items.length > 0 && page * pageSize < result.total;
        pageRef.current = page;
        setError(null);
        setIsNotConfigured(false);
      } catch (err) {
        if (!mountedRef.current) return;
        if (err?.isNotConfigured) {
          setIsNotConfigured(true);
        } else {
          setError(err?.message || 'Something went wrong. Please try again.');
        }
      } finally {
        inFlightRef.current = false;
        if (mountedRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filterKey],
  );

  useEffect(() => {
    mountedRef.current = true;
    setItems([]);
    hasMoreRef.current = false;
    pageRef.current = 1;
    inFlightRef.current = false;
    loadPage(1, 'reset');

    return () => {
      mountedRef.current = false;
      inFlightRef.current = true;
    };
  }, [filterKey, loadPage]);

  const loadMore = useCallback(() => {
    if (inFlightRef.current || !hasMoreRef.current) return;
    loadPage(pageRef.current + 1, 'more');
  }, [loadPage]);

  const retry = useCallback(() => {
    loadPage(pageRef.current || 1, 'reset');
  }, [loadPage]);

  return {
    items,
    total,
    loading,
    loadingMore,
    error,
    hasMore: hasMoreRef.current,
    loadMore,
    retry,
    isNotConfigured,
  };
}
