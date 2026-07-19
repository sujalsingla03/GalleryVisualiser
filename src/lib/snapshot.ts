/** Capture the current WebGL canvas as a PNG download (local only). */
export function downloadCanvasPng(canvas: HTMLCanvasElement, filename = 'GallerySphere-snapshot.png'): void {
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
