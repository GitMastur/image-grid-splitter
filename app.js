// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const canvasContainer = document.getElementById('canvas-container');
const canvas = document.getElementById('editor-canvas');
const ctx = canvas.getContext('2d');

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
const btnDownloadAll = document.getElementById('btn-download-all');
const resultsGrid = document.getElementById('results-grid');
const previewCount = document.getElementById('preview-count');

// State
let uploadedImage = null;
let currentSlices = [];

// Drag and drop events
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
      
      // Update UI state
      canvasContainer.classList.remove('empty');
      canvas.style.display = 'block';
      
      // Initialize inputs based on image size to prevent breaking constraints
      inputMarginLeft.max = Math.floor(img.naturalWidth / 2);
      inputMarginRight.max = Math.floor(img.naturalWidth / 2);
      inputMarginTop.max = Math.floor(img.naturalHeight / 2);
      inputMarginBottom.max = Math.floor(img.naturalHeight / 2);
      
      updateGridAndSlices();
      btnDownloadAll.removeAttribute('disabled');
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

// Format logic toggles
inputFormat.addEventListener('change', () => {
  if (inputFormat.value === 'image/jpeg') {
    inputQuality.removeAttribute('disabled');
  } else {
    inputQuality.setAttribute('disabled', 'true');
  }
  updateGridAndSlices();
});

// Settings events
[
  inputCols, inputRows,
  inputMarginLeft, inputMarginRight, inputMarginTop, inputMarginBottom,
  inputGapX, inputGapY, inputPrefix, inputQuality
].forEach(input => {
  input.addEventListener('input', updateGridAndSlices);
});

// Primary Render & Split Logic
function updateGridAndSlices() {
  if (!uploadedImage) return;

  const imgW = uploadedImage.naturalWidth;
  const imgH = uploadedImage.naturalHeight;

  // Set canvas size matching the source image exactly
  canvas.width = imgW;
  canvas.height = imgH;

  // 1. Draw source image
  ctx.drawImage(uploadedImage, 0, 0);

  // 2. Parse layout parameters
  const cols = Math.max(1, parseInt(inputCols.value) || 1);
  const rows = Math.max(1, parseInt(inputRows.value) || 1);

  const mLeft = Math.max(0, parseInt(inputMarginLeft.value) || 0);
  const mRight = Math.max(0, parseInt(inputMarginRight.value) || 0);
  const mTop = Math.max(0, parseInt(inputMarginTop.value) || 0);
  const mBottom = Math.max(0, parseInt(inputMarginBottom.value) || 0);

  const gapX = Math.max(0, parseInt(inputGapX.value) || 0);
  const gapY = Math.max(0, parseInt(inputGapY.value) || 0);

  // Calculate active layout area
  const activeW = imgW - mLeft - mRight;
  const activeH = imgH - mTop - mBottom;

  // Calculate widths of cells: (activeWidth - gaps) / cols
  const totalGapsW = gapX * (cols - 1);
  const totalGapsH = gapY * (rows - 1);

  const cellW = (activeW - totalGapsW) / cols;
  const cellH = (activeH - totalGapsH) / rows;

  currentSlices = [];
  resultsGrid.innerHTML = '';
  resultsGrid.classList.remove('empty');

  // Let's create cells list
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Calculate coordinates on original image
      const x = mLeft + c * (cellW + gapX);
      const y = mTop + r * (cellH + gapY);

      if (cellW <= 0 || cellH <= 0 || x + cellW > imgW || y + cellH > imgH) {
        continue;
      }

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

  // Update preview count label
  previewCount.textContent = `${currentSlices.length} images ready`;

  // Draw overlay on canvas and slice previews
  currentSlices.forEach(slice => {
    // Draw visual grid boundary box on canvas
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = Math.max(2, Math.floor(imgW / 500)); // Dynamic thickness based on image resolution
    ctx.strokeRect(slice.x, slice.y, slice.w, slice.h);

    // Semitransparent fill for better separation visibility
    ctx.fillStyle = 'rgba(99, 102, 241, 0.1)';
    ctx.fillRect(slice.x, slice.y, slice.w, slice.h);

    // Number text overlay
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.max(12, Math.floor(slice.h / 8))}px sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText(`#${slice.index}`, slice.x + 8, slice.y + 8);

    // Create sliced image using offscreen canvas
    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = slice.w;
    sliceCanvas.height = slice.h;
    const sliceCtx = sliceCanvas.getContext('2d');
    sliceCtx.drawImage(uploadedImage, slice.x, slice.y, slice.w, slice.h, 0, 0, slice.w, slice.h);

    const format = inputFormat.value;
    const quality = parseFloat(inputQuality.value) / 100;
    const dataUrl = sliceCanvas.toDataURL(format, quality);

    // Create Slice Card UI
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
    downloadBtn.textContent = 'Download';
    downloadBtn.addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${filename}.${fileExtension}`;
      a.click();
    });

    card.appendChild(imgPreview);
    card.appendChild(label);
    card.appendChild(downloadBtn);
    resultsGrid.appendChild(card);

    // Store data url inside slice state for ZIP building
    slice.dataUrl = dataUrl;
    slice.filename = `${filename}.${fileExtension}`;
  });
}

// Download Zip implementation
btnDownloadAll.addEventListener('click', async () => {
  if (currentSlices.length === 0) return;

  btnDownloadAll.textContent = 'Zipping...';
  btnDownloadAll.disabled = true;

  try {
    const zip = new JSZip();
    
    currentSlices.forEach(slice => {
      // Decode data URL to base64
      const base64Data = slice.dataUrl.split(',')[1];
      zip.file(slice.filename, base64Data, { base64: true });
    });

    const content = await zip.generateAsync({ type: 'blob' });
    const zipFilename = `${inputPrefix.value || 'headshots'}_export.zip`;

    const a = document.createElement('a');
    a.href = URL.createObjectURL(content);
    a.download = zipFilename;
    a.click();
    
    // Revoke object URL after download trigger
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (err) {
    console.error('Error generating zip file', err);
    alert('Failed to generate zip file.');
  } finally {
    btnDownloadAll.textContent = 'Download All (ZIP)';
    btnDownloadAll.disabled = false;
  }
});
