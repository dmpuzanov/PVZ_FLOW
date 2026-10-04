export function printDocument(section: string, from?: string, to?: string) {
  const previousTitle = document.title;
  const datePart = from && to ? `${from}_${to}` : new Date().toISOString().slice(0, 10);
  const orientation = localStorage.getItem('pvz_print_orientation') === 'landscape' ? 'landscape' : 'portrait';
  document.title = `PVZ_FLOW_${section}_${datePart}`;
  document.body.dataset.printOrientation = orientation;

  let style = document.getElementById('pvz-dynamic-page-size') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'pvz-dynamic-page-size';
    document.head.appendChild(style);
  }
  // Chromium applies the last explicit @page rule when opening its print dialog.
  style.textContent = `@media print { @page { size: A4 ${orientation} !important; margin: 8mm !important; } }`;

  window.setTimeout(() => {
    window.print();
    window.setTimeout(() => { document.title = previousTitle; }, 1000);
  }, 50);
}
