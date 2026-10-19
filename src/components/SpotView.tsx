import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Spot } from '../data/spots';
import { getSpotDiscovery, type SpotPhoto } from '../data/spotDiscovery';
import { CameraIcon, CloseIcon } from './icons/SpotActionIcons';

function PhotoCredit({ photo }: { photo: SpotPhoto }) {
  return (
    <p className="font-mono text-[11px] leading-5 text-gray-600">
      <a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">Photo: {photo.photographer}</a>
      {' · '}
      <a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{photo.license}</a>
    </p>
  );
}

export default function SpotView({ spot }: { spot: Spot }) {
  const discovery = getSpotDiscovery(spot);
  const photos = discovery?.photos.slice(0, 3) ?? [];
  const [failedPhotos, setFailedPhotos] = useState<ReadonlySet<string>>(() => new Set());
  const [photoIndex, setPhotoIndex] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cameraRef = useRef<HTMLButtonElement>(null);
  const activeIndex = photoIndex === null ? 0 : Math.min(photoIndex, photos.length - 1);
  const activePhoto = photoIndex === null ? undefined : photos[activeIndex];
  const open = Boolean(activePhoto);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const cameraButton = cameraRef.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      cameraButton?.focus({ preventScroll: true });
    };
  }, [open]);

  if (!discovery || photos.length === 0) return null;
  const markFailed = (id: string) => setFailedPhotos((previous) => new Set([...previous, id]));

  return (
    <>
      <button
        ref={cameraRef}
        type="button"
        onClick={() => setPhotoIndex(0)}
        aria-label={`View photos for ${spot.name}`}
        title="View photos"
        className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-gray-600 hover:bg-cream-dark/50 active:bg-cream-dark/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
      >
        <CameraIcon />
      </button>
      {activePhoto && createPortal(
        <dialog
          ref={dialogRef}
          aria-label={`View photos for ${spot.name}`}
          onCancel={(event) => { event.preventDefault(); setPhotoIndex(null); }}
          onKeyDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            if (event.target !== event.currentTarget) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setPhotoIndex(null);
          }}
          className="spot-view-dialog fixed inset-0 m-auto h-fit w-[calc(100vw-2rem)] max-h-[calc(100dvh-4rem)] max-w-[860px] overflow-hidden rounded-2xl border border-gray-200 bg-white p-0 shadow-2xl backdrop:bg-black/45"
        >
          <div className="flex max-h-[calc(100dvh-4rem)] min-h-0 flex-col">
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-100 px-4 py-3 sm:px-5">
              <h2 className="font-sans text-lg font-semibold leading-6 text-gray-800">{spot.name}</h2>
              <button
                type="button"
                autoFocus
                aria-label="Close photos"
                onClick={() => setPhotoIndex(null)}
                className="h-11 w-11 shrink-0 rounded-full border border-cream-dark flex items-center justify-center text-gray-700 hover:bg-cream-dark/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
              >
                <CloseIcon />
              </button>
            </header>
            <div className="flex aspect-[16/10] max-h-[48dvh] min-h-0 shrink items-center justify-center bg-gray-50 p-3 sm:p-5">
              {failedPhotos.has(activePhoto.id) ? (
                <div className="text-center">
                  <p role="status" className="font-serif text-xl text-gray-700">Photo unavailable</p>
                  <button
                    type="button"
                    onClick={() => setFailedPhotos((previous) => { const next = new Set(previous); next.delete(activePhoto.id); return next; })}
                    className="min-h-11 mt-3 px-4 rounded-full border border-cream-dark font-mono text-[12px] text-gray-700"
                  >Retry photo</button>
                </div>
              ) : (
                <img src={activePhoto.src} alt={activePhoto.alt} className="h-full w-full object-contain" onError={() => markFailed(activePhoto.id)} />
              )}
            </div>
            <footer className="max-h-[32dvh] shrink-0 overflow-y-auto border-t border-gray-100 px-4 py-3 sm:px-5">
              <p className="font-sans text-sm leading-5 text-gray-800">{activePhoto.view ?? discovery.view}</p>
              <p className="mt-2 font-mono text-[11px] text-gray-600 leading-5">{activePhoto.context} · {activePhoto.dateLabel}</p>
              <p className="font-mono text-[11px] text-gray-600 leading-5">Reference view. Not a live image or forecast.</p>
              <PhotoCredit photo={activePhoto} />
              {photos.length > 1 && (
                <div className="flex items-center justify-between mt-3">
                  <button type="button" disabled={activeIndex === 0} onClick={() => setPhotoIndex(activeIndex - 1)} className="min-h-11 px-3 disabled:opacity-40">Previous photo</button>
                  <span className="font-mono text-[11px]">{activeIndex + 1} / {photos.length}</span>
                  <button type="button" disabled={activeIndex === photos.length - 1} onClick={() => setPhotoIndex(activeIndex + 1)} className="min-h-11 px-3 disabled:opacity-40">Next photo</button>
                </div>
              )}
              <details className="mt-1 font-mono text-[11px] text-gray-600">
                <summary className="min-h-11 flex items-center cursor-pointer underline underline-offset-2">Sources</summary>
                <ul className="space-y-1 pb-2">
                  {discovery.sources.map((source) => (
                    <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center min-h-11 underline underline-offset-2">{source.platform}</a></li>
                  ))}
                  <li>Source review: {discovery.reviewedOn}. Not a field visit.</li>
                </ul>
              </details>
            </footer>
          </div>
        </dialog>, document.body,
      )}
    </>
  );
}
