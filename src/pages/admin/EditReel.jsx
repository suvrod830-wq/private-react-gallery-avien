import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Save } from 'lucide-react';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { getReelById, updateReel } from '../../services/reelService';
import { uploadVideoToCloudinary, deleteCloudinaryAsset } from '../../services/cloudinaryService';
import { reelOriginal } from '../../lib/cloudinary';
import { formatBytes, formatDuration } from '../../utils/format';
import { ALLOWED_VIDEO_TYPES, ALLOWED_VIDEO_EXTENSIONS, MAX_VIDEO_UPLOAD_BYTES } from '../../utils/constants';
import { Field, Input, Textarea } from '../../components/ui/Field';
import { Button } from '../../components/ui/Button';
import { Switch } from '../../components/ui/Switch';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Spinner, ErrorState } from '../../components/ui/Feedback';
import { useToast } from '../../contexts/ToastContext';

export default function EditReel() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  useDocumentTitle('Edit reel', { description: 'Update reel details or replace the video.' });

  const fileRef = useRef(null);

  const [reel, setReel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [description, setDescription] = useState('');
  const [featured, setFeatured] = useState(false);
  const [published, setPublished] = useState(false);

  const [saving, setSaving] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [newAsset, setNewAsset] = useState(null);
  const [confirmReplace, setConfirmReplace] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getReelById(id)
      .then((data) => {
        if (!active) return;
        if (!data) {
          setError('Reel not found.');
          return;
        }
        setReel(data);
        setTitle(data.title || '');
        setCaption(data.caption || '');
        setDescription(data.description || '');
        setFeatured(Boolean(data.is_featured));
        setPublished(Boolean(data.is_published));
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  async function handleSave() {
    if (title.trim().length < 2) {
      toast.error('Title must be at least 2 characters.');
      return;
    }
    setSaving(true);
    try {
      await updateReel(id, {
        title: title.trim(),
        caption,
        description,
        is_featured: featured,
        is_published: published,
      });
      toast.success('Reel updated.');
      navigate('/admin/reels');
    } catch (err) {
      toast.error(err?.message || 'Failed to save the reel.');
    } finally {
      setSaving(false);
    }
  }

  async function pickReplacement(file) {
    if (!file) return;
    const ext = `.${file.name.split('.').pop()?.toLowerCase()}`;
    const typeOk = ALLOWED_VIDEO_TYPES.includes(file.type) || ALLOWED_VIDEO_EXTENSIONS.includes(ext);
    if (!typeOk) {
      toast.error('Unsupported video format. Use MP4, WebM or MOV.');
      return;
    }
    if (file.size > MAX_VIDEO_UPLOAD_BYTES) {
      toast.error(`Video is too large (${formatBytes(file.size)}). Maximum is ${formatBytes(MAX_VIDEO_UPLOAD_BYTES)}.`);
      return;
    }
    setReplacing(true);
    try {
      const asset = await uploadVideoToCloudinary(file, { folder: 'personal-gallery/reels' });
      setNewAsset(asset);
      setConfirmReplace(true);
    } catch (err) {
      toast.error(err?.message || 'Replacement upload failed. Please try again.');
    } finally {
      setReplacing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  /**
   * Replace flow: the new video is uploaded first; only after it is confirmed
   * do we point the DB row at it and destroy the old asset.
   */
  async function handleReplace() {
    if (!newAsset || !reel) return;
    setReplacing(true);
    try {
      const oldPublicId = reel.cloudinary_public_id;
      const updated = await updateReel(id, {
        cloudinary_public_id: newAsset.cloudinary_public_id,
        secure_url: newAsset.secure_url,
        duration: newAsset.duration ?? null,
        width: newAsset.width ?? null,
        height: newAsset.height ?? null,
        format: newAsset.format ?? null,
        file_size: newAsset.file_size ?? null,
      });
      if (oldPublicId && oldPublicId !== newAsset.cloudinary_public_id) {
        try {
          await deleteCloudinaryAsset(oldPublicId, { resourceType: 'video' });
        } catch {
          toast.error('New video saved, but the old CDN file could not be removed. You can clean it up later.');
        }
      }
      toast.success('Reel video replaced.');
      setConfirmReplace(false);
      setNewAsset(null);
      setReel(updated);
    } catch (err) {
      toast.error(err?.message || 'Failed to replace the video. The new file is still in Cloudinary; please retry.');
    } finally {
      setReplacing(false);
    }
  }

  if (loading) return <Spinner />;
  if (error) return <ErrorState message={error} />;
  if (!reel) return null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/admin/reels" className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900 dark:hover:text-white">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to reels
        </Link>
        <Link to={`/reel/${reel.slug}`} className="text-sm text-brand-600 hover:underline dark:text-brand-400">
          View public page
        </Link>
      </div>

      <header>
        <h1 className="font-display text-2xl font-semibold">Edit reel</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          {formatDuration(reel.duration) && `${formatDuration(reel.duration)} · `}
          {reel.view_count} views
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr]">
        {/* Current video */}
        <div className="space-y-3">
          <div className="overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: '9 / 16' }}>
            <video key={reel.cloudinary_public_id} src={reelOriginal(reel)} controls playsInline preload="metadata" className="h-full w-full object-contain" />
          </div>

          <input
            ref={fileRef}
            type="file"
            accept={ALLOWED_VIDEO_TYPES.join(',')}
            className="hidden"
            onChange={(e) => pickReplacement(e.target.files?.[0])}
          />
          <Button variant="outline" className="w-full" loading={replacing} onClick={() => fileRef.current?.click()}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Replace video
          </Button>
        </div>

        {/* Metadata form */}
        <div className="space-y-4">
          <Field label="Title" htmlFor="edit-title" required>
            <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>

          <Field label="Caption" htmlFor="edit-caption" hint="Short one-liner shown on the player page.">
            <Input id="edit-caption" value={caption} onChange={(e) => setCaption(e.target.value)} />
          </Field>

          <Field label="Description" htmlFor="edit-description">
            <Textarea id="edit-description" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>

          <div className="flex flex-wrap gap-8 rounded-xl border border-stone-200 p-4 dark:border-stone-800">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-stone-700 dark:text-stone-200">
              <Switch checked={featured} onChange={setFeatured} label="Featured" /> Featured
            </label>
            <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-stone-700 dark:text-stone-200">
              <Switch checked={published} onChange={setPublished} label="Published" /> Published
            </label>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleSave} loading={saving}>
              <Save className="h-4 w-4" aria-hidden /> Save changes
            </Button>
            <Button variant="outline" onClick={() => navigate('/admin/reels')} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmReplace}
        title="Replace the video?"
        description={
          newAsset
            ? `The current video will be deleted from Cloudinary and replaced with the new upload (${formatBytes(newAsset.file_size)}).`
            : ''
        }
        confirmLabel="Replace"
        loading={replacing}
        onConfirm={handleReplace}
        onClose={() => setConfirmReplace(false)}
      />
    </div>
  );
}
