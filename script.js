/* ============================================================
   TEXT TO PDF — script.js
   Uses Summernote and preserves editor HTML in PDF export
   ============================================================ */

const { jsPDF } = window.jspdf;

const EXPORT_RENDER_WIDTH = 1100;
const EXPORT_CANVAS_SCALE = 2.25;
const PDF_JPEG_QUALITY = 0.72;
const PDF_IMAGE_COMPRESSION = 'MEDIUM';
const FOOTER_TEXT_PX = 11;
const FOOTER_PADDING_PX = 5;
const MIN_ENGLISH_FONT_PX = 22;
const MIN_KHMER_FONT_PX = 20;

let pdfDataUri = null;
let previewImages = [];
const footerLabel = getFooterLabel();

const editorRoot = document.getElementById('editor');
const generateBtn = document.getElementById('generateBtn');
const downloadBtn = document.getElementById('downloadBtn');
const clearBtn = document.getElementById('clearBtn');
const statusMsg = document.getElementById('statusMsg');
const previewPanel = document.getElementById('previewPanel');
const previewContent = document.getElementById('previewContent');
const previewPageCount = document.getElementById('previewPageCount');
const charCount = document.getElementById('charCount');
const settingsToggle = document.getElementById('settingsToggle');
const settingsBody = document.getElementById('settingsBody');
const toggleArrow = document.getElementById('toggleArrow');
const exportRoot = document.getElementById('exportRoot');

const marginTop = document.getElementById('marginTop');
const marginBottom = document.getElementById('marginBottom');
const marginLeft = document.getElementById('marginLeft');
const marginRight = document.getElementById('marginRight');
const fontSizeInput = document.getElementById('fontSize');
const lineHeightInput = document.getElementById('lineHeight');

generateBtn.disabled = true;
clearBtn.disabled = true;
initEditor();
updateCharCount();

settingsToggle.addEventListener('click', () => {
  const open = settingsBody.classList.toggle('open');
  toggleArrow.classList.toggle('open', open);
});

clearBtn.addEventListener('click', () => {
  if (!isEditorReady()) return;
  $(editorRoot).summernote('code', '');
  updateCharCount();
  resetOutput();
  $(editorRoot).summernote('focus');
});

generateBtn.addEventListener('click', async () => {
  const text = getEditorText().trim();
  if (!text) {
    showStatus('Please enter some text first.', 'error');
    return;
  }

  setGenerating(true);
  showStatus('<span class="spinner-ring"></span> &nbsp;Generating PDF…', 'info');
  await sleep(60);

  try {
    pdfDataUri = await buildPDF();
    showStatus('✓ PDF generated successfully! Click Download PDF to save it.', 'success');
    downloadBtn.disabled = false;
    buildPreview();
  } catch (err) {
    console.error(err);
    showStatus('Error generating PDF: ' + err.message, 'error');
    downloadBtn.disabled = true;
  } finally {
    cleanupExportRoot();
    setGenerating(false);
  }
});

downloadBtn.addEventListener('click', () => {
  if (!pdfDataUri) return;
  const link = document.createElement('a');
  link.href = pdfDataUri;
  link.download = 'document.pdf';
  link.click();
});

async function buildPDF() {
  if (!window.html2canvas) {
    throw new Error('html2canvas failed to load.');
  }
  if (!isEditorReady()) {
    throw new Error('Summernote is not ready yet.');
  }

  const mTop = mmToUnit(parseFloat(marginTop.value) || 10);
  const mBottom = mmToUnit(parseFloat(marginBottom.value) || 10);
  const mLeft = mmToUnit(parseFloat(marginLeft.value) || 10);
  const mRight = mmToUnit(parseFloat(marginRight.value) || 10);
  const fontSize = parseFloat(fontSizeInput.value) || 13;
  const lineHeight = parseFloat(lineHeightInput.value) || 1.8;

  const pageW = 595.28;
  const pageH = 841.89;
  const contentW = pageW - mLeft - mRight;
  const contentH = pageH - mTop - mBottom;

  const doc = new jsPDF({
    unit: 'pt',
    format: 'a4',
    orientation: 'portrait',
    compress: true,
    putOnlyUsedFonts: true
  });

  const renderSheet = createRenderSheet({
    widthPx: EXPORT_RENDER_WIDTH,
    fontSize,
    lineHeight
  });

  exportRoot.appendChild(renderSheet.wrapper);
  await waitForFonts();

  const fullCanvas = await window.html2canvas(renderSheet.wrapper, {
    backgroundColor: '#ffffff',
    scale: EXPORT_CANVAS_SCALE,
    useCORS: true,
    logging: false
  });

  const pageHeightPx = Math.floor(EXPORT_RENDER_WIDTH * (contentH / contentW));
  const scaledPageHeightPx = Math.floor(pageHeightPx * EXPORT_CANVAS_SCALE);
  const pageCount = Math.max(1, Math.ceil(fullCanvas.height / scaledPageHeightPx));

  previewImages = [];

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    if (pageIndex > 0) doc.addPage();

    const sliceTop = pageIndex * scaledPageHeightPx;
    const sliceHeight = Math.min(scaledPageHeightPx, fullCanvas.height - sliceTop);
    const pageCanvas = document.createElement('canvas');
    const pageCtx = pageCanvas.getContext('2d');

    pageCanvas.width = fullCanvas.width;
    pageCanvas.height = scaledPageHeightPx;
    pageCtx.fillStyle = '#ffffff';
    pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    pageCtx.drawImage(
      fullCanvas,
      0,
      sliceTop,
      fullCanvas.width,
      sliceHeight,
      0,
      0,
      fullCanvas.width,
      sliceHeight
    );
    drawFooter(pageCtx, pageCanvas.width, pageCanvas.height, footerLabel);

    const imgData = pageCanvas.toDataURL('image/jpeg', PDF_JPEG_QUALITY);
    previewImages.push(imgData);
    doc.addImage(
      imgData,
      'JPEG',
      mLeft,
      mTop,
      contentW,
      contentH,
      undefined,
      PDF_IMAGE_COMPRESSION
    );
  }

  return doc.output('datauristring');
}

function createRenderSheet({ widthPx, fontSize, lineHeight }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'export-sheet';
  wrapper.style.width = `${widthPx}px`;
  const selectedFontPx = fontSize * 1.3333;
  wrapper.style.fontSize = `${Math.max(selectedFontPx, MIN_ENGLISH_FONT_PX)}px`;
  wrapper.style.lineHeight = String(lineHeight);

  const content = document.createElement('div');
  content.className = 'export-sheet-content summernote-content';
  content.innerHTML = $(editorRoot).summernote('code');
  enforceMinimumKhmerFont(content, selectedFontPx);

  wrapper.appendChild(content);
  return { wrapper, content };
}

function enforceMinimumKhmerFont(root, selectedFontSizePx) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];

  while (walker.nextNode()) {
    if (walker.currentNode.nodeValue && walker.currentNode.nodeValue.trim()) {
      textNodes.push(walker.currentNode);
    }
  }

  const khmerScale = Math.max(1, MIN_KHMER_FONT_PX / Math.max(selectedFontSizePx, MIN_ENGLISH_FONT_PX));

  textNodes.forEach((textNode) => {
    if (!containsKhmer(textNode.nodeValue)) return;

    const fragment = document.createDocumentFragment();
    const parts = textNode.nodeValue.split(/([\u1780-\u17FF\u19E0-\u19FF]+)/g);

    parts.forEach((part) => {
      if (!part) return;

      if (containsKhmer(part)) {
        const span = document.createElement('span');
        span.className = 'khmer-min-font';
        span.style.fontSize = `${khmerScale}em`;
        span.textContent = part;
        fragment.appendChild(span);
      } else {
        fragment.appendChild(document.createTextNode(part));
      }
    });

    textNode.parentNode.replaceChild(fragment, textNode);
  });
}

function containsKhmer(text) {
  return /[\u1780-\u17FF\u19E0-\u19FF]/.test(text);
}

function drawFooter(ctx, width, height, label) {
  const footerY = height - FOOTER_PADDING_PX;

  ctx.save();
  ctx.strokeStyle = '#d8d8d8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height - FOOTER_PADDING_PX - 14);
  ctx.lineTo(width, height - FOOTER_PADDING_PX - 14);
  ctx.stroke();

  ctx.fillStyle = '#666666';
  ctx.font = `${FOOTER_TEXT_PX}px 'Ubuntu', 'Battambang', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(label, width / 2, footerY);
  ctx.restore();
}

function getFooterLabel() {
  const { protocol, hostname, pathname } = window.location;

  if (protocol === 'file:') {
    const fileName = pathname.split('/').filter(Boolean).pop() || 'local-file';
    return `Generated by ${fileName}`;
  }

  if (hostname) {
    return `Generated by ${hostname}`;
  }

  return 'Generated by this page';
}

function buildPreview() {
  previewContent.innerHTML = '';

  const pageCount = previewImages.length;
  previewPageCount.textContent = pageCount + (pageCount === 1 ? ' page' : ' pages');

  previewImages.forEach((imgSrc, index) => {
    const page = document.createElement('div');
    page.className = 'preview-page';

    const image = document.createElement('img');
    image.className = 'preview-page-image';
    image.src = imgSrc;
    image.alt = `PDF preview page ${index + 1}`;
    page.appendChild(image);

    const num = document.createElement('div');
    num.className = 'preview-page-num';
    num.textContent = `${index + 1} / ${pageCount}`;
    page.appendChild(num);

    previewContent.appendChild(page);
  });

  previewPanel.style.display = 'block';
  previewPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function initEditor() {
  if (!window.jQuery || !$.fn.summernote) {
    showStatus('Summernote failed to load.', 'error');
    return;
  }

  $(editorRoot).summernote({
    placeholder: 'Type or paste your text here...\n\nវាយឬបិទភ្ជាប់អត្ថបទរបស់អ្នកនៅទីនេះ...',
    tabsize: 2,
    height: 320,
    minHeight: 320,
    toolbar: [
      ['history', ['undo', 'redo']],
      ['style', ['style']],
      ['font', ['bold', 'italic', 'underline', 'clear']],
      ['color', ['color']],
      ['para', ['ul', 'ol', 'paragraph']],
      ['insert', ['link']],
      ['view', ['codeview']]
    ],
    callbacks: {
      onInit() {
        generateBtn.disabled = false;
        clearBtn.disabled = false;
        updateCharCount();
      },
      onChange() {
        updateCharCount();
      }
    }
  });
}

function isEditorReady() {
  return window.jQuery && $(editorRoot).next('.note-editor').length > 0;
}

function getEditorText() {
  if (!isEditorReady()) return editorRoot.value || '';
  const temp = document.createElement('div');
  temp.innerHTML = $(editorRoot).summernote('code');
  return (temp.textContent || temp.innerText || '').replace(/\n$/, '');
}

function resetOutput() {
  hideStatus();
  previewPanel.style.display = 'none';
  downloadBtn.disabled = true;
  pdfDataUri = null;
  previewImages = [];
  previewContent.innerHTML = '';
  cleanupExportRoot();
}

function cleanupExportRoot() {
  exportRoot.innerHTML = '';
}

function updateCharCount() {
  charCount.textContent = getEditorText().length.toLocaleString();
}

function mmToUnit(mm) {
  return mm * 2.8346;
}

function waitForFonts() {
  if (document.fonts && document.fonts.ready) {
    return document.fonts.ready;
  }
  return Promise.resolve();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function showStatus(html, type) {
  statusMsg.innerHTML = html;
  statusMsg.className = 'status-msg ' + type;
  statusMsg.style.display = 'block';
}

function hideStatus() {
  statusMsg.style.display = 'none';
  statusMsg.innerHTML = '';
  statusMsg.className = 'status-msg';
}

function setGenerating(on) {
  generateBtn.disabled = on;
  if (on) {
    generateBtn.innerHTML = '<span class="spinner-ring"></span> &nbsp;Generating…';
  } else {
    generateBtn.innerHTML = '<span class="btn-icon">◎</span> Generate PDF';
  }
}
