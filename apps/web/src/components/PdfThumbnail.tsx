import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/cn';

/**
 * The first page of a PDF, drawn in the browser.
 *
 * pdf.js is loaded the first time one of these appears, so the library is not in the main
 * bundle, and the rendering happens here rather than on the server, which keeps Jobify free of
 * a native image dependency. The file is fetched with the session cookie, like any other
 * request, so a preview is only ever drawn for a file the viewer is allowed to read.
 */
export function PdfThumbnail({
  url,
  className,
  width = 96,
}: {
  url: string;
  className?: string;
  width?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let task: { destroy: () => void } | undefined;

    const draw = async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();

        const loading = pdfjs.getDocument({ url, withCredentials: true });
        task = loading;
        const document = await loading.promise;
        const page = await document.getPage(1);
        const target = canvas.current;
        if (cancelled || !target) return;

        const unscaled = page.getViewport({ scale: 1 });
        // Drawn at the screen's pixel density so it stays sharp, then sized down in CSS.
        const ratio = window.devicePixelRatio || 1;
        const viewport = page.getViewport({ scale: ((width * ratio) / unscaled.width) * 1 });
        target.width = Math.floor(viewport.width);
        target.height = Math.floor(viewport.height);
        target.style.height = `${Math.floor(viewport.height / ratio)}px`;

        const context = target.getContext('2d');
        if (!context) return;
        await page.render({ canvas: target, canvasContext: context, viewport }).promise;
        // The document is released with the loading task when this is cleaned up.
      } catch {
        // A damaged file, a PDF with a password, or pdf.js failing to load: show the fallback.
        if (!cancelled) setFailed(true);
      }
    };

    void draw();
    return () => {
      cancelled = true;
      task?.destroy();
    };
  }, [url, width]);

  if (failed) return null;
  return (
    <canvas
      ref={canvas}
      aria-hidden
      style={{ width }}
      className={cn('rounded border border-zinc-200 bg-white dark:border-zinc-700', className)}
    />
  );
}
