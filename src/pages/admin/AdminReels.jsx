import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Clapperboard, Pencil, Plus, Search, Star, Trash2 } from 'lucide-react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useDebounce } from '../../hooks/useDebounce';
import { listReels, deleteReel, setReelPublished, setReelFeatured } from '../../services/reelService';
import { reelThumb } from '../../lib/cloudinary';
import { formatDate, formatDuration, formatNumber } from '../../utils/format';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Field';
import { PublishedBadge, FeaturedBadge } from '../../components/ui/Badge';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState, ErrorState, Spinner } from '../../components/ui/Feedback';
import { Switch } from '../../components/ui/Switch';
import { useToast } from '../../contexts/ToastContext';

const PAGE_SIZE = 12;

export default function AdminReels() {
  useDocumentTitle('Manage reels', { description: 'Upload, publish and delete short videos.' });
  const toast = useToast();

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const debouncedQ = useDebounce(q, 400);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listReels({
        q: debouncedQ,
        status,
        sort: 'newest',
        page,
        pageSize: PAGE_SIZE,
        publishedOnly: false,
      });
      setRows(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err?.message || 'Failed to load reels.');
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, status, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, status]);

  async function togglePublished(reel) {
    try {
      await setReelPublished(reel.id, !reel.is_published);
      setRows((prev) => prev.map((r) => (r.id === reel.id ? { ...r, is_published: !reel.is_published } : r)));
      toast.success(reel.is_published ? 'Reel unpublished.' : 'Reel published.');
    } catch (err) {
      toast.error(err?.message || 'Could not update the reel.');
    }
  }

  async function toggleFeatured(reel) {
    try {
      await setReelFeatured(reel.id, !reel.is_featured);
      setRows((prev) => prev.map((r) => (r.id === reel.id ? { ...r, is_featured: !reel.is_featured } : r)));
    } catch (err) {
      toast.error(err?.message || 'Could not update the reel.');
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    const result = await deleteReel(confirmDelete.id);
    setDeleting(false);
    setConfirmDelete(null);
    if (result.ok) {
      toast.success('Reel deleted.');
    } else {
      toast.error(`Database record deleted, but the CDN video could not be removed: ${result.cloudinaryError || 'unknown error'}. You can retry from Cloudinary.`);
    }
    load();
  }

  const empty = useMemo(() => !loading && !error && rows.length === 0, [loading, error, rows]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Reels</h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            {total} reel{total === 1 ? '' : 's'} total
          </p>
        </div>
        <Link to="/admin/reels/upload">
          <Button>
            <Plus className="h-4 w-4" aria-hidden /> Upload reel
          </Button>
        </Link>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reels…" className="w-64 pl-9" />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40" aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
        </Select>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : loading ? (
        <div className="grid min-h-[30vh] place-items-center">
          <Spinner />
        </div>
      ) : empty ? (
        <EmptyState
          icon={Clapperboard}
          title={q || status ? 'No reels match' : 'No reels yet'}
          description={
            q || status ? 'Try a different search or filter.' : 'Upload your first short video to get started.'
          }
          action={
            !q && !status ? (
              <Link to="/admin/reels/upload">
                <Button>
                  <Plus className="h-4 w-4" aria-hidden /> Upload reel
                </Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-500 dark:border-stone-800 dark:bg-stone-950/50 dark:text-stone-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Reel</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Duration</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">Views</th>
                  <th className="hidden px-4 py-3 font-medium lg:table-cell">Created</th>
                  <th className="px-4 py-3 font-medium">Published</th>
                  <th className="px-4 py-3 font-medium">Featured</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                {rows.map((reel) => (
                  <tr key={reel.id} className="hover:bg-stone-50 dark:hover:bg-stone-800/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={reelThumb(reel, 90)}
                          alt=""
                          loading="lazy"
                          className="h-16 w-9 shrink-0 rounded-md bg-stone-200 object-cover dark:bg-stone-800"
                        />
                        <div className="min-w-0">
                          <p className="max-w-[240px] truncate font-medium">{reel.title}</p>
                          <div className="mt-1 flex items-center gap-1.5">
                            <PublishedBadge published={reel.is_published} />
                            {reel.is_featured && <FeaturedBadge featured />}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 text-stone-500 md:table-cell dark:text-stone-400">
                      {formatDuration(reel.duration) || '—'}
                    </td>
                    <td className="hidden px-4 py-3 text-stone-500 sm:table-cell dark:text-stone-400">
                      {formatNumber(reel.view_count)}
                    </td>
                    <td className="hidden px-4 py-3 text-stone-500 lg:table-cell dark:text-stone-400">
                      {formatDate(reel.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <Switch checked={reel.is_published} onChange={() => togglePublished(reel)} label={`Publish ${reel.title}`} />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => toggleFeatured(reel)}
                        aria-label={reel.is_featured ? `Unfeature ${reel.title}` : `Feature ${reel.title}`}
                        className="text-stone-400 hover:text-amber-500"
                      >
                        <Star className={`h-5 w-5 ${reel.is_featured ? 'fill-amber-400 text-amber-400' : ''}`} aria-hidden />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          to={`/admin/reels/${reel.id}/edit`}
                          aria-label={`Edit ${reel.title}`}
                          className="grid h-8 w-8 place-items-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                        </Link>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(reel)}
                          aria-label={`Delete ${reel.title}`}
                          className="grid h-8 w-8 place-items-center rounded-lg text-stone-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-stone-500 dark:text-stone-400">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="h-4 w-4" aria-hidden /> Prev
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next <ChevronRight className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete this reel?"
        description={
          confirmDelete
            ? `"${confirmDelete.title}" will be removed from the database and the video file deleted from Cloudinary. This cannot be undone.`
            : ''
        }
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  );
}
