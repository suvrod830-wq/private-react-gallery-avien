import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Clapperboard, UploadCloud, X } from 'lucide-react';
import { reelSchema } from '../../schemas/reelSchemas';
import { uploadVideoToCloudinary } from '../../services/cloudinaryService';
import { createReel } from '../../services/reelService';
import { ALLOWED_VIDEO_TYPES, ALLOWED_VIDEO_EXTENSIONS, MAX_VIDEO_UPLOAD_BYTES } from '../../utils/constants';
import { useToast } from '../../contexts/ToastContext';
import { Field, Input, Textarea } from '../ui/Field';
import { Button } from '../ui/Button';
import { Switch } from '../ui/Switch';
import { formatBytes } from '../../utils/format';

/**
 * Single-reel upload: pick a video → fill metadata → upload to Cloudinary
 * (signed, resource_type=video) → save metadata to PostgreSQL.
 */
export function ReelUploadForm() {
  const navigate = useNavigate();
  const toast = useToast();
  const inputRef = useRef(null);

  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState('');
  const [featured, setFeatured] = useState(false);
  const [published, setPublished] = useState(false);

  const { register, handleSubmit, setValue, getValues, formState } = useForm({
    resolver: zodResolver(reelSchema),
    defaultValues: { title: '', caption: '', description: '', is_featured: false, is_published: false },
  });

  // Revoke object URLs on unmount / replacement.
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  function validateAndSet(candidate) {
    if (!candidate) return;
    const ext = `.${candidate.name.split('.').pop()?.toLowerCase()}`;
    const typeOk = ALLOWED_VIDEO_TYPES.includes(candidate.type) || ALLOWED_VIDEO_EXTENSIONS.includes(ext);
    if (!typeOk) {
      toast.error('Unsupported video format. Use MP4, WebM or MOV.');
      return;
    }
    if (candidate.size > MAX_VIDEO_UPLOAD_BYTES) {
      toast.error(`Video is too large (${formatBytes(candidate.size)}). Maximum is ${formatBytes(MAX_VIDEO_UPLOAD_BYTES)}.`);
      return;
    }
    setFile(candidate);
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(candidate);
    });
    // Pre-fill the title from the filename if still empty.
    if (!getValues('title')) {
      const base = candidate.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
      setValue('title', base, { shouldValidate: false });
    }
  }

  async function onSubmit(values) {
    if (!file) {
      toast.error('Choose a video file first.');
      return;
    }
    setUploading(true);
    try {
      setStatus('Uploading video to Cloudinary…');
      const asset = await uploadVideoToCloudinary(file, { folder: 'personal-gallery/reels' });

      setStatus('Saving reel metadata…');
      await createReel({
        ...asset,
        title: values.title.trim(),
        caption: values.caption || '',
        description: values.description || '',
        is_featured: featured,
        is_published: published,
      });

      toast.success('Reel uploaded!');
      navigate('/admin/reels');
    } catch (err) {
      setStatus('');
      toast.error(err?.message || 'Reel upload failed.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
      {/* Video picker / preview */}
      <div>
        {!file ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              validateAndSet(e.dataTransfer.files?.[0]);
            }}
            className={`grid aspect-[9/16] w-full place-items-center rounded-2xl border-2 border-dashed transition-colors ${
              dragOver
                ? 'border-brand-500 bg-brand-50 dark:bg-brand-950/30'
                : 'border-stone-300 bg-stone-50 hover:border-stone-400 dark:border-stone-700 dark:bg-stone-900'
            }`}
          >
            <span className="px-6 text-center">
              <Clapperboard className="mx-auto h-10 w-10 text-stone-400" aria-hidden />
              <span className="mt-3 block text-sm font-medium text-stone-600 dark:text-stone-300">
                Drop a video here, or click to browse
              </span>
              <span className="mt-1 block text-xs text-stone-400">
                MP4, WebM or MOV · up to {formatBytes(MAX_VIDEO_UPLOAD_BYTES)} · vertical (9:16) works best
              </span>
            </span>
          </button>
        ) : (
          <div className="relative">
            <video
              src={previewUrl}
              controls
              playsInline
              preload="metadata"
              className="aspect-[9/16] w-full rounded-2xl bg-black object-contain"
            />
            <button
              type="button"
              onClick={() => {
                setFile(null);
                setPreviewUrl((old) => { if (old) URL.revokeObjectURL(old); return ''; });
                if (inputRef.current) inputRef.current.value = '';
              }}
              disabled={uploading}
              aria-label="Remove selected video"
              className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
            <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
              {file.name} · {formatBytes(file.size)}
            </p>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_VIDEO_TYPES.join(',')}
          className="hidden"
          onChange={(e) => validateAndSet(e.target.files?.[0])}
        />
      </div>

      {/* Metadata */}
      <div className="space-y-4">
        <Field label="Title" htmlFor="reel-title" required error={formState.errors.title?.message}>
          <Input id="reel-title" placeholder="Sunset timelapse" {...register('title')} />
        </Field>

        <Field label="Caption" htmlFor="reel-caption" hint="Short one-liner shown on the player page." error={formState.errors.caption?.message}>
          <Input id="reel-caption" placeholder="Golden hour over the river 🌇" {...register('caption')} />
        </Field>

        <Field label="Description" htmlFor="reel-description" error={formState.errors.description?.message}>
          <Textarea id="reel-description" rows={4} placeholder="Optional longer description…" {...register('description')} />
        </Field>

        <div className="flex flex-wrap gap-8 rounded-xl border border-stone-200 p-4 dark:border-stone-800">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-stone-700 dark:text-stone-200">
            <Switch checked={featured} onChange={(v) => { setFeatured(v); setValue('is_featured', v); }} label="Featured" />
            Featured
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-stone-700 dark:text-stone-200">
            <Switch checked={published} onChange={(v) => { setPublished(v); setValue('is_published', v); }} label="Published" />
            Published
          </label>
        </div>

        {status && <p className="text-sm text-stone-500 dark:text-stone-400">{status}</p>}

        <div className="flex items-center gap-3">
          <Button type="submit" loading={uploading} disabled={!file} size="lg">
            <UploadCloud className="h-4 w-4" aria-hidden /> Upload reel
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate('/admin/reels')} disabled={uploading}>
            Cancel
          </Button>
        </div>
      </div>
    </form>
  );
}
