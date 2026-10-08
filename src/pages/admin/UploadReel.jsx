import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ReelUploadForm } from '../../components/forms/ReelUploadForm';
import { isCloudinaryConfigured } from '../../lib/env';
import { ConfigMissing } from '../../components/ui/Feedback';

export default function UploadReel() {
  useDocumentTitle('Upload reel', { description: 'Upload a new short video.' });

  if (!isCloudinaryConfigured) {
    return (
      <div className="mx-auto max-w-4xl py-10">
        <ConfigMissing message="Uploads need a Cloudinary cloud configured. Add VITE_CLOUDINARY_CLOUD_NAME (frontend) plus CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET (server-side) to your .env, then restart the API server." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">Upload reel</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          The video goes to Cloudinary (signed upload); metadata is saved to the PostgreSQL database.
        </p>
      </header>

      <ReelUploadForm />
    </div>
  );
}
