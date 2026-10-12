// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const canvasContainer = document.getElementById('canvas-container');
const canvas = document.getElementById('editor-canvas');
const ctx = canvas.getContext('2d');

const chkAutodetect = document.getElementById('chk-autodetect');
const inputCols = document.getElementById('input-cols');
const inputRows = document.getElementById('input-rows');
const inputMarginLeft = document.getElementById('input-margin-left');
const inputMarginRight = document.getElementById('input-margin-right');
const inputMarginTop = document.getElementById('input-margin-top');
const inputMarginBottom = document.getElementById('input-margin-bottom');
const inputGapX = document.getElementById('input-gap-x');
const inputGapY = document.getElementById('input-gap-y');

const inputPrefix = document.getElementById('input-prefix');
const inputFormat = document.getElementById('input-format');
const inputQuality = document.getElementById('input-quality');
const btnSaveGallery = document.getElementById('btn-save-gallery');
const btnDownloadAll = document.getElementById('btn-download-all');
const resultsGrid = document.getElementById('results-grid');
const previewCount = document.getElementById('preview-count');
const mobileBadge = document.getElementById('mobile-badge');
const appContainer = document.querySelector('.app-container');

// State
let uploadedImage = null;
let currentSlices = [];
let activeHandle = null;
const handleVisualRadius = 8;
const handleTouchHitRadius = 24; // Generous tap target for mobile touchscreens

// Mobile Navigation
const navTabs = document.querySelectorAll('.nav-tab');
navTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    navTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    const targetTab = tab.getAttribute('data-tab');
    appContainer.classList.remove('show-sidebar', 'show-results');
    if (targetTab === 'sidebar') {
      appContainer.classList.add('show-sidebar');
    } else if (targetTab === 'results') {
      appContainer.classList.add('show-results');
    }
  });
});

// File Upload Handlers
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-active');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-active');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-active');
  if (e.dataTransfer.files.length > 0) {
    handleFile(e.dataTransfer.files[0]);
  }
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    handleFile(e.target.files[0]);
  }
});

function handleFile(file) {
  if (!file.type.startsWith('image/')) {
    alert('Please upload an image file.');
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    const img = new Image();
    img.onload = () => {
      uploadedImage = img;
      
      canvasContainer.classList.remove('empty');
      canvas.style.display = 'block';

      // Reset edge margins for newly loaded image
      inputMarginLeft.value = 0;
      inputMarginRight.value = 0;
      inputMarginTop.value = 0;
      inputMarginBottom.value = 0;
      inputGapX.value = 0;
      inputGapY.value = 0;

      // Auto-detect layout if enabled
      if (chkAutodetect && chkAutodetect.checked) {
        const detected = estimateGridLayout(img);
        if (detected.cols > 1 || detected.rows > 1) {
          inputCols.value = detected.cols;
          inputRows.value = detected.rows;
        }
      }

      updateGridAndSlices();
      if (btnSaveGallery) btnSaveGallery.removeAttribute('disabled');
      btnDownloadAll.removeAttribute('disabled');

      // On mobile, switch view back to canvas tab so user sees the image
      const canvasTab = document.querySelector('.nav-tab[data-tab="workspace"]');
      if (canvasTab && window.innerWidth <= 850) {
        canvasTab.click();
      }
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

// Client-Side Seam & Fractional Grid Estimator
function estimateGridLayout(img) {
  try {
    const tempCanvas = document.createElement('canvas');
    const maxDim = 512; // Downscale for fast mathematical analysis
    const scale = Math.min(maxDim / img.naturalWidth, maxDim / img.naturalHeight, 1.0);
    const w = Math.round(img.naturalWidth * scale);
    const h = Math.round(img.naturalHeight * scale);

    tempCanvas.width = w;
    tempCanvas.height = h;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(img, 0, 0, w, h);

    const imgData = tempCtx.getImageData(0, 0, w, h).data;

    // Convert to grayscale 2D representation
    const gray = new Float32Array(w * h);
    for (let i = 0; i < gray.length; i++) {
      const idx = i * 4;
      gray[i] = 0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2];
    }

    // Horizontal and vertical gradient profiles
    const colDiffs = new Float32Array(w - 1);
    for (let x = 1; x < w; x++) {
      let sum = 0;
      for (let y = 0; y < h; y++) {
        sum += Math.abs(gray[y * w + x] - gray[y * w + (x - 1)]);
      }
      colDiffs[x - 1] = sum / h;
    }

    const rowDiffs = new Float32Array(h - 1);
    for (let y = 1; y < h; y++) {
      let sum = 0;
      for (let x = 0; x < w; x++) {
        sum += Math.abs(gray[y * w + x] - gray[(y - 1) * w + x]);
      }
      rowDiffs[y - 1] = sum / w;
    }

    function findPeaks(diffs, minDistance) {
      let mean = 0;
      for (let i = 0; i < diffs.length; i++) mean += diffs[i];
      mean /= diffs.length;

      let variance = 0;
      for (let i = 0; i < diffs.length; i++) variance += Math.pow(diffs[i] - mean, 2);
      const std = Math.sqrt(variance / diffs.length);

      const threshold = mean + 0.9 * std;
      const peaks = [];

      for (let i = 1; i < diffs.length - 1; i++) {
        if (diffs[i] > threshold) {
          const left = Math.max(0, i - minDistance);
          const right = Math.min(diffs.length - 1, i + minDistance);
          let isMax = true;
          for (let j = left; j <= right; j++) {
            if (diffs[j] > diffs[i]) {
              isMax = false;
              break;
            }
          }
          if (isMax) peaks.push(i + 1);
        }
      }
      return peaks;
    }

    const colPeaks = findPeaks(colDiffs, Math.floor(w * 0.12));
    const rowPeaks = findPeaks(rowDiffs, Math.floor(h * 0.12));

    function matchDimension(peaks, totalLength) {
      let bestDim = 1;
      let bestErr = 9999;
      for (let dim = 2; dim <= 6; dim++) {
        let matched = 0;
        let errSum = 0;
        for (let part = 1; part < dim; part++) {
          const targetRatio = part / dim;
          let minErr = 1.0;
          for (let p of peaks) {
            const err = Math.abs((p / totalLength) - targetRatio);
            if (err < minErr) minErr = err;
          }
          if (minErr < 0.035) { // Error tolerance
            matched++;
            errSum += minErr;
          }
        }
        if (matched === dim - 1 && errSum < bestErr) {
          bestErr = errSum;
          bestDim = dim;
        }
      }
      return bestDim;
    }

    return {
      cols: matchDimension(colPeaks, w),
      rows: matchDimension(rowPeaks, h)
    };
  } catch (err) {
    console.warn('Auto-detect error:', err);
    return { cols: 1, rows: 1 };
  }
}

// Format settings toggles
inputFormat.addEventListener('change', () => {
  if (inputFormat.value === 'image/jpeg') {
    inputQuality.removeAttribute('disabled');
  } else {
    inputQuality.setAttribute('disabled', 'true');
  }
  updateGridAndSlices();
});

[
  inputCols, inputRows,
  inputMarginLeft, inputMarginRight, inputMarginTop, inputMarginBottom,
  inputGapX, inputGapY, inputPrefix, inputQuality
].forEach(input => {
  input.addEventListener('input', updateGridAndSlices);
});

if (chkAutodetect) {
  chkAutodetect.addEventListener('change', () => {
    if (chkAutodetect.checked && uploadedImage) {
      const detected = estimateGridLayout(uploadedImage);
      if (detected.cols > 1 || detected.rows > 1) {
        inputCols.value = detected.cols;
        inputRows.value = detected.rows;
        updateGridAndSlices();
      }
    }
  });
}

// Main Render & Slice Computation
function updateGridAndSlices() {
  if (!uploadedImage) return;

  const imgW = uploadedImage.naturalWidth;
  const imgH = uploadedImage.naturalHeight;

  canvas.width = imgW;
  canvas.height = imgH;

  // 1. Draw source image
  ctx.drawImage(uploadedImage, 0, 0);

  // 2. Read layout parameters
  const cols = Math.max(1, parseInt(inputCols.value) || 1);
  const rows = Math.max(1, parseInt(inputRows.value) || 1);

  const mLeft = Math.max(0, parseInt(inputMarginLeft.value) || 0);
  const mRight = Math.max(0, parseInt(inputMarginRight.value) || 0);
  const mTop = Math.max(0, parseInt(inputMarginTop.value) || 0);
  const mBottom = Math.max(0, parseInt(inputMarginBottom.value) || 0);

  const gapX = Math.max(0, parseInt(inputGapX.value) || 0);
  const gapY = Math.max(0, parseInt(inputGapY.value) || 0);

  const activeW = imgW - mLeft - mRight;
  const activeH = imgH - mTop - mBottom;

  const totalGapsW = gapX * (cols - 1);
  const totalGapsH = gapY * (rows - 1);

  const cellW = (activeW - totalGapsW) / cols;
  const cellH = (activeH - totalGapsH) / rows;

  currentSlices = [];
  resultsGrid.innerHTML = '';
  resultsGrid.classList.remove('empty');

  if (cellW > 0 && cellH > 0 && activeW > 0 && activeH > 0) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = mLeft + c * (cellW + gapX);
        const y = mTop + r * (cellH + gapY);

        if (x + cellW > imgW || y + cellH > imgH) continue;

        currentSlices.push({
          x: Math.round(x),
          y: Math.round(y),
          w: Math.round(cellW),
          h: Math.round(cellH),
          row: r + 1,
          col: c + 1,
          index: r * cols + c + 1
        });
      }
    }
  }

  // Update preview counters
  previewCount.textContent = `${currentSlices.length} images ready`;
  if (mobileBadge) mobileBadge.textContent = currentSlices.length;

  const lineWidth = Math.max(2, Math.floor(imgW / 450));

  // Render individual slice boxes
  currentSlices.forEach(slice => {
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(slice.x, slice.y, slice.w, slice.h);

    ctx.fillStyle = 'rgba(99, 102, 241, 0.08)';
    ctx.fillRect(slice.x, slice.y, slice.w, slice.h);

    // Number text overlay
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.max(14, Math.floor(slice.h / 7))}px sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText(`#${slice.index}`, slice.x + 8, slice.y + 8);

    // Create slice thumbnail preview
    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = slice.w;
    sliceCanvas.height = slice.h;
    const sliceCtx = sliceCanvas.getContext('2d');
    sliceCtx.drawImage(uploadedImage, slice.x, slice.y, slice.w, slice.h, 0, 0, slice.w, slice.h);

    const format = inputFormat.value;
    const quality = parseFloat(inputQuality.value) / 100;
    const dataUrl = sliceCanvas.toDataURL(format, quality);

    const filename = `${inputPrefix.value || 'headshot'}_r${slice.row}_c${slice.col}`;
    const fileExtension = format === 'image/jpeg' ? 'jpg' : 'png';

    const card = document.createElement('div');
    card.className = 'slice-card';

    const imgPreview = document.createElement('img');
    imgPreview.className = 'slice-preview-img';
    imgPreview.src = dataUrl;
    imgPreview.alt = filename;

    const label = document.createElement('span');
    label.className = 'slice-label';
    label.textContent = `${filename}.${fileExtension}`;

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'slice-download-btn';
    downloadBtn.textContent = 'Save';
    downloadBtn.addEventListener('click', () => {
      const fullFilename = `${filename}.${fileExtension}`;
      if (window.AndroidBridge && window.AndroidBridge.saveImageToGallery) {
        const rawBase64 = dataUrl.split(',')[1];
        const ok = window.AndroidBridge.saveImageToGallery(fullFilename, rawBase64, format);
        if (ok && window.AndroidBridge.showToast) {
          window.AndroidBridge.showToast(`Saved to Pictures/GridSplitter: ${fullFilename}`);
        }
      } else {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = fullFilename;
        a.click();
      }
    });

    card.appendChild(imgPreview);
    card.appendChild(label);
    card.appendChild(downloadBtn);
    resultsGrid.appendChild(card);

    slice.dataUrl = dataUrl;
    slice.filename = `${filename}.${fileExtension}`;
  });

  // Render draggable handles on outer active boundary
  drawBoundaryHandles(mLeft, mTop, imgW - mRight, imgH - mBottom);
}

function getBoundaryHandles(x1, y1, x2, y2) {
  return {
    nw: { x: x1, y: y1 },
    ne: { x: x2, y: y1 },
    sw: { x: x1, y: y2 },
    se: { x: x2, y: y2 },
    n:  { x: (x1 + x2) / 2, y: y1 },
    s:  { x: (x1 + x2) / 2, y: y2 },
    w:  { x: x1, y: (y1 + y2) / 2 },
    e:  { x: x2, y: (y1 + y2) / 2 }
  };
}

function drawBoundaryHandles(x1, y1, x2, y2) {
  const handles = getBoundaryHandles(x1, y1, x2, y2);
  const r = Math.max(handleVisualRadius, Math.floor(canvas.width / 160));

  for (const [key, pos] of Object.entries(handles)) {
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = Math.max(2, r / 3);
    ctx.strokeStyle = '#6366f1';
    ctx.stroke();
  }
}

// Coordinate mapping from mouse/touch event to canvas original pixel space
function getEventCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;

  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
}

// Drag & Touch Handle Listeners
function handlePointerDown(e) {
  if (!uploadedImage) return;

  const { x, y } = getEventCanvasCoords(e);
  const imgW = uploadedImage.naturalWidth;
  const imgH = uploadedImage.naturalHeight;

  const mLeft = parseInt(inputMarginLeft.value) || 0;
  const mRight = parseInt(inputMarginRight.value) || 0;
  const mTop = parseInt(inputMarginTop.value) || 0;
  const mBottom = parseInt(inputMarginBottom.value) || 0;

  const x1 = mLeft;
  const y1 = mTop;
  const x2 = imgW - mRight;
  const y2 = imgH - mBottom;

  const handles = getBoundaryHandles(x1, y1, x2, y2);
  const rect = canvas.getBoundingClientRect();
  const scaleFactor = canvas.width / rect.width;
  const hitRadius = handleTouchHitRadius * scaleFactor;

  activeHandle = null;
  for (const [key, pos] of Object.entries(handles)) {
    const dist = Math.hypot(x - pos.x, y - pos.y);
    if (dist <= hitRadius) {
      activeHandle = key;
      if (e.cancelable) e.preventDefault();
      break;
    }
  }
}

function handlePointerMove(e) {
  if (!uploadedImage || !activeHandle) return;
  if (e.cancelable) e.preventDefault();

  const { x, y } = getEventCanvasCoords(e);
  const imgW = uploadedImage.naturalWidth;
  const imgH = uploadedImage.naturalHeight;
  const minDim = 30;

  let mLeft = parseInt(inputMarginLeft.value) || 0;
  let mRight = parseInt(inputMarginRight.value) || 0;
  let mTop = parseInt(inputMarginTop.value) || 0;
  let mBottom = parseInt(inputMarginBottom.value) || 0;

  const clampedX = Math.max(0, Math.min(imgW, x));
  const clampedY = Math.max(0, Math.min(imgH, y));

  if (activeHandle.includes('w')) {
    const newLeft = Math.round(clampedX);
    if (imgW - mRight - newLeft >= minDim) inputMarginLeft.value = newLeft;
  }
  if (activeHandle.includes('e')) {
    const newRight = Math.round(imgW - clampedX);
    if (imgW - mLeft - newRight >= minDim) inputMarginRight.value = newRight;
  }
  if (activeHandle.includes('n')) {
    const newTop = Math.round(clampedY);
    if (imgH - mBottom - newTop >= minDim) inputMarginTop.value = newTop;
  }
  if (activeHandle.includes('s')) {
    const newBottom = Math.round(imgH - clampedY);
    if (imgH - mTop - newBottom >= minDim) inputMarginBottom.value = newBottom;
  }

  updateGridAndSlices();
}

function handlePointerUp() {
  activeHandle = null;
}

canvas.addEventListener('mousedown', handlePointerDown);
window.addEventListener('mousemove', handlePointerMove);
window.addEventListener('mouseup', handlePointerUp);

canvas.addEventListener('touchstart', handlePointerDown, { passive: false });
window.addEventListener('touchmove', handlePointerMove, { passive: false });
window.addEventListener('touchend', handlePointerUp);

// Save All to Phone Gallery implementation
if (btnSaveGallery) {
  btnSaveGallery.addEventListener('click', async () => {
    if (currentSlices.length === 0) return;

    btnSaveGallery.textContent = 'Saving to Gallery...';
    btnSaveGallery.disabled = true;

    try {
      if (window.AndroidBridge && window.AndroidBridge.saveImageToGallery) {
        let count = 0;
        for (const slice of currentSlices) {
          const rawBase64 = slice.dataUrl.split(',')[1];
          const ok = window.AndroidBridge.saveImageToGallery(slice.filename, rawBase64, inputFormat.value);
          if (ok) count++;
        }
        if (window.AndroidBridge.showToast) {
          window.AndroidBridge.showToast(`✓ Saved ${count} photos directly to Pictures/GridSplitter!`);
        }
      } else {
        // Desktop browser fallback: download individual images directly
        for (let i = 0; i < currentSlices.length; i++) {
          const slice = currentSlices[i];
          const a = document.createElement('a');
          a.href = slice.dataUrl;
          a.download = slice.filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          await new Promise(r => setTimeout(r, 150));
        }
      }
    } catch (err) {
      console.error('Error saving to gallery', err);
      alert('Failed to save images: ' + err.message);
    } finally {
      btnSaveGallery.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
        Save All to Phone Gallery
      `;
      btnSaveGallery.disabled = false;
    }
  });
}

// Download All ZIP implementation
btnDownloadAll.addEventListener('click', async () => {
  if (currentSlices.length === 0) return;

  btnDownloadAll.textContent = 'Packaging ZIP...';
  btnDownloadAll.disabled = true;

  try {
    const zip = new JSZip();
    
    currentSlices.forEach(slice => {
      const base64Data = slice.dataUrl.split(',')[1];
      zip.file(slice.filename, base64Data, { base64: true });
    });

    const zipFilename = `${inputPrefix.value || 'headshots'}_export.zip`;

    if (window.AndroidBridge && window.AndroidBridge.saveBase64File) {
      const zipBase64 = await zip.generateAsync({ type: 'base64' });
      window.AndroidBridge.saveBase64File(zipFilename, zipBase64, 'application/zip');
    } else {
      const content = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(content);
      a.download = zipFilename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 15000);
    }
  } catch (err) {
    console.error('Error generating zip file', err);
    alert('Failed to generate zip file.');
  } finally {
    btnDownloadAll.textContent = 'Download All (ZIP)';
    btnDownloadAll.disabled = false;
  }
});
