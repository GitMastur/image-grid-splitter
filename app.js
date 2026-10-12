// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const canvasContainer = document.getElementById('canvas-container');
const canvas = document.getElementById('editor-canvas');
const ctx = canvas.getContext('2d');

const chkAutodetect = document.getElementById('chk-autodetect');
const inputCols = document.getElementById('input-cols');
const inputRows = document.getElementById('input-rows');
const btnResetLines = document.getElementById('btn-reset-lines');
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
let customVLines = []; // Array of vertical line x-coordinates [x0, x1, ..., xCols]
let customHLines = []; // Array of horizontal line y-coordinates [y0, y1, ..., yRows]
let activeHandle = null; // 'v-i', 'h-j', 'corner-nw', 'corner-ne', 'corner-sw', 'corner-se'
const handleTouchHitRadius = 26; // Generous tap target for mobile touchscreens and desktop

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

      initGridLines(true);
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
          if (minErr < 0.035) {
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

// Grid line initialization
function initGridLines(forceReset = false) {
  if (!uploadedImage) return;

  const cols = Math.max(1, parseInt(inputCols.value) || 1);
  const rows = Math.max(1, parseInt(inputRows.value) || 1);
  const imgW = uploadedImage.naturalWidth;
  const imgH = uploadedImage.naturalHeight;

  const mLeft = Math.max(0, parseInt(inputMarginLeft.value) || 0);
  const mRight = Math.max(0, parseInt(inputMarginRight.value) || 0);
  const mTop = Math.max(0, parseInt(inputMarginTop.value) || 0);
  const mBottom = Math.max(0, parseInt(inputMarginBottom.value) || 0);

  // If force reset or column count changed, recalculate evenly
  if (forceReset || customVLines.length !== cols + 1) {
    customVLines = [];
    const activeW = Math.max(cols * 15, imgW - mLeft - mRight);
    for (let c = 0; c <= cols; c++) {
      customVLines.push(Math.round(mLeft + (c * activeW) / cols));
    }
  }

  // If force reset or row count changed, recalculate evenly
  if (forceReset || customHLines.length !== rows + 1) {
    customHLines = [];
    const activeH = Math.max(rows * 15, imgH - mTop - mBottom);
    for (let r = 0; r <= rows; r++) {
      customHLines.push(Math.round(mTop + (r * activeH) / rows));
    }
  }
}

function syncMarginsFromInputs() {
  if (!uploadedImage) return;
  const imgW = uploadedImage.naturalWidth;
  const imgH = uploadedImage.naturalHeight;
  const cols = Math.max(1, parseInt(inputCols.value) || 1);
  const rows = Math.max(1, parseInt(inputRows.value) || 1);

  const mLeft = Math.max(0, parseInt(inputMarginLeft.value) || 0);
  const mRight = Math.max(0, parseInt(inputMarginRight.value) || 0);
  const mTop = Math.max(0, parseInt(inputMarginTop.value) || 0);
  const mBottom = Math.max(0, parseInt(inputMarginBottom.value) || 0);

  if (customVLines.length !== cols + 1 || customHLines.length !== rows + 1 ||
      mLeft >= (customVLines[1] || imgW) || (imgW - mRight) <= (customVLines[cols - 1] || 0) ||
      mTop >= (customHLines[1] || imgH) || (imgH - mBottom) <= (customHLines[rows - 1] || 0)) {
    initGridLines(true);
  } else {
    customVLines[0] = mLeft;
    customVLines[cols] = imgW - mRight;
    customHLines[0] = mTop;
    customHLines[rows] = imgH - mBottom;
  }
}

// User Control Inputs Listeners
inputCols.addEventListener('input', () => {
  initGridLines(true);
  updateGridAndSlices();
});

inputRows.addEventListener('input', () => {
  initGridLines(true);
  updateGridAndSlices();
});

if (btnResetLines) {
  btnResetLines.addEventListener('click', () => {
    initGridLines(true);
    updateGridAndSlices();
    if (window.AndroidBridge && window.AndroidBridge.showToast) {
      window.AndroidBridge.showToast('Reset lines to equal spacing');
    }
  });
}

[inputMarginLeft, inputMarginRight, inputMarginTop, inputMarginBottom].forEach(inp => {
  inp.addEventListener('input', () => {
    syncMarginsFromInputs();
    updateGridAndSlices();
  });
});

[inputGapX, inputGapY, inputPrefix, inputQuality].forEach(inp => {
  inp.addEventListener('input', updateGridAndSlices);
});

if (chkAutodetect) {
  chkAutodetect.addEventListener('change', () => {
    if (chkAutodetect.checked && uploadedImage) {
      const detected = estimateGridLayout(uploadedImage);
      if (detected.cols > 1 || detected.rows > 1) {
        inputCols.value = detected.cols;
        inputRows.value = detected.rows;
        initGridLines(true);
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

  // Ensure grid lines match current row and col counts
  initGridLines(false);

  // 1. Draw source image
  ctx.drawImage(uploadedImage, 0, 0);

  const cols = customVLines.length - 1;
  const rows = customHLines.length - 1;

  const gapX = Math.max(0, parseInt(inputGapX.value) || 0);
  const gapY = Math.max(0, parseInt(inputGapY.value) || 0);
  const halfGapX = Math.floor(gapX / 2);
  const halfGapY = Math.floor(gapY / 2);

  currentSlices = [];
  resultsGrid.innerHTML = '';
  resultsGrid.classList.remove('empty');

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x1 = customVLines[c];
      const x2 = customVLines[c + 1];
      const y1 = customHLines[r];
      const y2 = customHLines[r + 1];

      const cellX = Math.min(x1 + halfGapX, x2);
      const cellY = Math.min(y1 + halfGapY, y2);
      const cellW = Math.max(1, (x2 - x1) - gapX);
      const cellH = Math.max(1, (y2 - y1) - gapY);

      if (cellX + cellW > imgW || cellY + cellH > imgH) continue;

      currentSlices.push({
        x: Math.round(cellX),
        y: Math.round(cellY),
        w: Math.round(cellW),
        h: Math.round(cellH),
        row: r + 1,
        col: c + 1,
        index: r * cols + c + 1
      });
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

  // Render draggable handles on lines and borders
  drawLineHandles();
}

function drawLineHandles() {
  if (customVLines.length === 0 || customHLines.length === 0) return;

  const cols = customVLines.length - 1;
  const rows = customHLines.length - 1;
  const x0 = customVLines[0];
  const xCols = customVLines[cols];
  const y0 = customHLines[0];
  const yRows = customHLines[rows];

  const rect = canvas.getBoundingClientRect();
  const scale = (rect.width > 0) ? (canvas.width / rect.width) : 1;
  const baseR = Math.max(8, Math.round(9 * scale));
  const pillW = Math.max(26, Math.round(30 * scale));
  const pillH = Math.max(16, Math.round(18 * scale));
  const pillRadius = Math.max(4, Math.round(6 * scale));
  const fontSize = Math.max(11, Math.round(13 * scale));

  function drawRoundedRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // 1. Draw vertical divider lines & pill handles
  for (let c = 1; c < cols; c++) {
    const vx = customVLines[c];
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(vx, y0);
    ctx.lineTo(vx, yRows);
    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth = Math.max(2, Math.round(2 * scale));
    ctx.setLineDash([6 * scale, 4 * scale]);
    ctx.stroke();
    ctx.restore();

    // Grip pill at vertical center
    const cy = (y0 + yRows) / 2;
    ctx.save();
    drawRoundedRect(vx - pillH / 2, cy - pillW / 2, pillH, pillW, pillRadius);
    ctx.fillStyle = '#4f46e5';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.5, Math.round(2 * scale));
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('↔', vx, cy);
    ctx.restore();
  }

  // 2. Draw horizontal divider lines & pill handles
  for (let r = 1; r < rows; r++) {
    const hy = customHLines[r];
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0, hy);
    ctx.lineTo(xCols, hy);
    ctx.strokeStyle = '#818cf8';
    ctx.lineWidth = Math.max(2, Math.round(2 * scale));
    ctx.setLineDash([6 * scale, 4 * scale]);
    ctx.stroke();
    ctx.restore();

    // Grip pill at horizontal center
    const cx = (x0 + xCols) / 2;
    ctx.save();
    drawRoundedRect(cx - pillW / 2, hy - pillH / 2, pillW, pillH, pillRadius);
    ctx.fillStyle = '#4f46e5';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.5, Math.round(2 * scale));
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('↕', cx, hy);
    ctx.restore();
  }

  // 3. Draw outer boundary rectangle
  ctx.save();
  ctx.strokeStyle = '#6366f1';
  ctx.lineWidth = Math.max(2, Math.round(2.5 * scale));
  ctx.strokeRect(x0, y0, xCols - x0, yRows - y0);
  ctx.restore();

  // 4. Draw outer boundary mid-point handles (w, e, n, s)
  const edgeHandles = [
    { x: x0, y: (y0 + yRows) / 2 },
    { x: xCols, y: (y0 + yRows) / 2 },
    { x: (x0 + xCols) / 2, y: y0 },
    { x: (x0 + xCols) / 2, y: yRows }
  ];
  for (const pos of edgeHandles) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, Math.round(baseR * 0.8), 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = Math.max(2, Math.round(2 * scale));
    ctx.stroke();
    ctx.restore();
  }

  // 5. Draw 4 corner handles (nw, ne, sw, se)
  const corners = [
    { x: x0, y: y0 },
    { x: xCols, y: y0 },
    { x: x0, y: yRows },
    { x: xCols, y: yRows }
  ];
  for (const pos of corners) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, baseR, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = Math.max(2, Math.round(2.5 * scale));
    ctx.stroke();
    ctx.restore();
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

function findHandleUnderPoint(x, y) {
  if (!uploadedImage || customVLines.length === 0 || customHLines.length === 0) return null;

  const cols = customVLines.length - 1;
  const rows = customHLines.length - 1;
  const rect = canvas.getBoundingClientRect();
  const scaleFactor = (rect.width > 0) ? (canvas.width / rect.width) : 1;
  const hitRadius = handleTouchHitRadius * scaleFactor;

  const x0 = customVLines[0];
  const xCols = customVLines[cols];
  const y0 = customHLines[0];
  const yRows = customHLines[rows];

  // 1. Check 4 corners
  if (Math.hypot(x - x0, y - y0) <= hitRadius) return 'corner-nw';
  if (Math.hypot(x - xCols, y - y0) <= hitRadius) return 'corner-ne';
  if (Math.hypot(x - x0, y - yRows) <= hitRadius) return 'corner-sw';
  if (Math.hypot(x - xCols, y - yRows) <= hitRadius) return 'corner-se';

  // 2. Check internal vertical line pills
  for (let c = 1; c < cols; c++) {
    const vx = customVLines[c];
    const vy = (y0 + yRows) / 2;
    if (Math.hypot(x - vx, y - vy) <= hitRadius * 1.5) {
      return `v-${c}`;
    }
  }

  // 3. Check internal horizontal line pills
  for (let r = 1; r < rows; r++) {
    const hx = (x0 + xCols) / 2;
    const hy = customHLines[r];
    if (Math.hypot(x - hx, y - hy) <= hitRadius * 1.5) {
      return `h-${r}`;
    }
  }

  // 4. Check entire vertical lines (internal and outer)
  let bestV = null;
  let bestVDist = Infinity;
  for (let c = 0; c <= cols; c++) {
    const vx = customVLines[c];
    if (y >= y0 - hitRadius && y <= yRows + hitRadius) {
      const dist = Math.abs(x - vx);
      if (dist <= hitRadius && dist < bestVDist) {
        bestVDist = dist;
        bestV = `v-${c}`;
      }
    }
  }

  // 5. Check entire horizontal lines (internal and outer)
  let bestH = null;
  let bestHDist = Infinity;
  for (let r = 0; r <= rows; r++) {
    const hy = customHLines[r];
    if (x >= x0 - hitRadius && x <= xCols + hitRadius) {
      const dist = Math.abs(y - hy);
      if (dist <= hitRadius && dist < bestHDist) {
        bestHDist = dist;
        bestH = `h-${r}`;
      }
    }
  }

  if (bestV && bestH) {
    return bestVDist < bestHDist ? bestV : bestH;
  }
  return bestV || bestH || null;
}

// Drag & Touch Handle Listeners
function handlePointerDown(e) {
  if (!uploadedImage) return;

  const { x, y } = getEventCanvasCoords(e);
  const handle = findHandleUnderPoint(x, y);

  if (handle) {
    activeHandle = handle;
    if (e.cancelable) e.preventDefault();
  }
}

function handlePointerMove(e) {
  if (!uploadedImage) return;

  const { x, y } = getEventCanvasCoords(e);

  // If not currently dragging, update hover cursor on canvas
  if (!activeHandle) {
    const handle = findHandleUnderPoint(x, y);
    if (!handle) {
      canvas.style.cursor = 'default';
    } else if (handle === 'corner-nw' || handle === 'corner-se') {
      canvas.style.cursor = 'nwse-resize';
    } else if (handle === 'corner-ne' || handle === 'corner-sw') {
      canvas.style.cursor = 'nesw-resize';
    } else if (handle.startsWith('v-')) {
      canvas.style.cursor = 'col-resize';
    } else if (handle.startsWith('h-')) {
      canvas.style.cursor = 'row-resize';
    }
    return;
  }

  if (e.cancelable) e.preventDefault();

  const imgW = uploadedImage.naturalWidth;
  const imgH = uploadedImage.naturalHeight;
  const cols = customVLines.length - 1;
  const rows = customHLines.length - 1;
  const minCellSize = 15;

  const clampedX = Math.max(0, Math.min(imgW, x));
  const clampedY = Math.max(0, Math.min(imgH, y));

  if (activeHandle.startsWith('v-')) {
    const c = parseInt(activeHandle.split('-')[1]);
    const minX = (c === 0) ? 0 : customVLines[c - 1] + minCellSize;
    const maxX = (c === cols) ? imgW : customVLines[c + 1] - minCellSize;
    customVLines[c] = Math.max(minX, Math.min(maxX, Math.round(clampedX)));

    if (c === 0) inputMarginLeft.value = customVLines[0];
    if (c === cols) inputMarginRight.value = imgW - customVLines[cols];
  } else if (activeHandle.startsWith('h-')) {
    const r = parseInt(activeHandle.split('-')[1]);
    const minY = (r === 0) ? 0 : customHLines[r - 1] + minCellSize;
    const maxY = (r === rows) ? imgH : customHLines[r + 1] - minCellSize;
    customHLines[r] = Math.max(minY, Math.min(maxY, Math.round(clampedY)));

    if (r === 0) inputMarginTop.value = customHLines[0];
    if (r === rows) inputMarginBottom.value = imgH - customHLines[rows];
  } else if (activeHandle === 'corner-nw') {
    customVLines[0] = Math.max(0, Math.min(customVLines[1] - minCellSize, Math.round(clampedX)));
    customHLines[0] = Math.max(0, Math.min(customHLines[1] - minCellSize, Math.round(clampedY)));
    inputMarginLeft.value = customVLines[0];
    inputMarginTop.value = customHLines[0];
  } else if (activeHandle === 'corner-ne') {
    customVLines[cols] = Math.max(customVLines[cols - 1] + minCellSize, Math.min(imgW, Math.round(clampedX)));
    customHLines[0] = Math.max(0, Math.min(customHLines[1] - minCellSize, Math.round(clampedY)));
    inputMarginRight.value = imgW - customVLines[cols];
    inputMarginTop.value = customHLines[0];
  } else if (activeHandle === 'corner-sw') {
    customVLines[0] = Math.max(0, Math.min(customVLines[1] - minCellSize, Math.round(clampedX)));
    customHLines[rows] = Math.max(customHLines[rows - 1] + minCellSize, Math.min(imgH, Math.round(clampedY)));
    inputMarginLeft.value = customVLines[0];
    inputMarginBottom.value = imgH - customHLines[rows];
  } else if (activeHandle === 'corner-se') {
    customVLines[cols] = Math.max(customVLines[cols - 1] + minCellSize, Math.min(imgW, Math.round(clampedX)));
    customHLines[rows] = Math.max(customHLines[rows - 1] + minCellSize, Math.min(imgH, Math.round(clampedY)));
    inputMarginRight.value = imgW - customVLines[cols];
    inputMarginBottom.value = imgH - customHLines[rows];
  }

  updateGridAndSlices();
}

function handlePointerUp() {
  activeHandle = null;
  canvas.style.cursor = 'default';
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
