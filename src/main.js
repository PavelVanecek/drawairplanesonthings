import { InteractionManager } from './interaction.js';
import { exportImage } from './export.js';

document.addEventListener('DOMContentLoaded', () => {
  const manager = new InteractionManager();

  // File Input
  const fileInput = document.getElementById('fileInput');
  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      manager.loadImage(e.target.files[0]);
    }
  });

  // Paste
  window.addEventListener('paste', (e) => manager.handlePaste(e));

  // Drag & Drop
  const dropZone = document.getElementById('dropZone');
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });
  dropZone.addEventListener('drop', (e) => manager.handleDrop(e));

  // Export
  document.getElementById('exportBtn').addEventListener('click', async () => {
    if (manager.state.annotations.length > 0) {
      const btn = document.getElementById('exportBtn');
      const originalText = btn.textContent;
      btn.textContent = 'Exporting...';
      btn.disabled = true;

      await exportImage(
        manager.elements.image,
        manager.state.annotations
      );

      if (typeof gtag === 'function') {
        gtag('event', 'image_exported');
      }

      btn.textContent = originalText;
      btn.disabled = false;
    }
  });
});
