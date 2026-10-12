import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Spot } from '../data/spots';
import { getSpotDiscovery, type SpotPhoto } from '../data/spotDiscovery';

function PhotoCredit({ photo }: { photo: SpotPhoto }) {
  return (
    <p className="font-mono text-[10px] leading-5 text-gray-600">
      <a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Photo: {photo.photographer}</a>
      {' · '}
      <a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{photo.license}</a>
    </p>
  );
}

export default function SpotView({ spot }: { spot: Spot }) {
  const discovery = getSpotDiscovery(spot);
  const [failedPhotos, setFailedPhotos] = useState<ReadonlySet<string>>(() => new Set());
  const [photoIndex, setPhotoIndex] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previewRef = useRef<HTMLButtonElement>(null);
  const photos = discovery?.photos.filter((photo) => !failedPhotos.has(photo.id)).slice(0, 3) ?? [];
  const activePhoto = photoIndex === null ? undefined : photos[Math.min(photoIndex, photos.length - 1)];
  const open = Boolean(activePhoto);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const previewButton = previewRef.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previewButton?.focus({ preventScroll: true });
    };
  }, [open]);

  if (!discovery) return null;
  const preview = photos[0];
  const markFailed = (id: string) => setFailedPhotos((previous) => new Set([...previous, id]));

  return (
    <section aria-label={`View from ${spot.name}`} className="mt-4 border-t border-gray-100 pt-4">
      <h4 className="font-mono text-[11px] tracking-[1.5px] uppercase text-gray-700 mb-2">View</h4>
      {preview && (
        <>
          <button
            ref={previewRef}
            type="button"
            onClick={() => setPhotoIndex(0)}
            aria-label={`Enlarge view photo for ${spot.name}`}
            className="block w-full overflow-hidden rounded-lg bg-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
          >
            <img src={preview.src} alt={preview.alt} loading="lazy" decoding="async" className="w-full h-36 object-cover" onError={() => markFailed(preview.id)} />
          </button>
          <p className="mt-2 font-mono text-[10px] leading-5 text-gray-600">{preview.context}</p>
          <PhotoCredit photo={preview} />
        </>
      )}
      <p className="font-serif text-[14px] leading-5 text-gray-700 mt-2">{discovery.view}</p>
      <details className="mt-2 font-mono text-[10px] text-gray-600">
        <summary className="min-h-11 flex items-center cursor-pointer underline underline-offset-2">Sources</summary>
        <ul className="space-y-1 pb-2">
          {discovery.sources.map((source) => (
            <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center min-h-11 underline underline-offset-2">{source.platform}</a></li>
          ))}
          <li>Source review: {discovery.reviewedOn}. Not a field visit.</li>
        </ul>
      </details>
      {activePhoto && createPortal(
        <dialog
          ref={dialogRef}
          aria-label={`View photos for ${spot.name}`}
          onCancel={(event) => { event.preventDefault(); setPhotoIndex(null); }}
          onKeyDown={(event) => event.stopPropagation()}
          onClick={(event) => { if (event.target === event.currentTarget) setPhotoIndex(null); }}
          className="spot-view-dialog fixed inset-0 m-auto w-[calc(100vw_-_2rem)] max-w-3xl max-h-[90dvh] overflow-y-auto rounded-2xl border border-cream-dark bg-cream p-4 shadow-2xl backdrop:bg-black/60"
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="font-serif text-lg text-gray-800">{spot.name}</h2>
            <button type="button" autoFocus onClick={() => setPhotoIndex(null)} className="min-h-11 min-w-11 px-3 font-mono text-[12px] text-gray-700 rounded-full border border-cream-dark">Close</button>
          </div>
          <img src={activePhoto.src} alt={activePhoto.alt} className="w-full max-h-[55dvh] object-contain rounded-lg" onError={() => markFailed(activePhoto.id)} />
          <p className="mt-3 font-mono text-[11px] text-gray-600 leading-5">{activePhoto.context} · {activePhoto.dateLabel}</p>
          <p className="font-mono text-[11px] text-gray-600 leading-5">Reference view. Not a live image or forecast.</p>
          <PhotoCredit photo={activePhoto} />
          {photos.length > 1 && (
            <div className="flex items-center justify-between mt-3">
              <button type="button" disabled={photoIndex === 0} onClick={() => setPhotoIndex((index) => Math.max(0, (index ?? 0) - 1))} className="min-h-11 px-3 disabled:opacity-40">Previous photo</button>
              <span className="font-mono text-[11px]">{(photoIndex ?? 0) + 1} / {photos.length}</span>
              <button type="button" disabled={photoIndex === photos.length - 1} onClick={() => setPhotoIndex((index) => Math.min(photos.length - 1, (index ?? 0) + 1))} className="min-h-11 px-3 disabled:opacity-40">Next photo</button>
            </div>
          )}
        </dialog>, document.body,
      )}
    </section>
  );
}
