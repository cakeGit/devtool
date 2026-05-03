const SHEET = {
  pageWidth: 210,
  pageHeight: 297,
  columns: 4,
  rows: 6,
  labelDiameter: 40,
  bleedAmount: 1.5,
  maxBleedAmount: 3,
  marginX: 16,
  marginY: 13.5,
  gap: 6,
  exportDpi: 300,
};

const MM_PER_INCH = 25.4;
const CELL_COUNT = SHEET.columns * SHEET.rows;
const STORAGE_KEY = "a4-24-round-sticker-project";

const editorCanvas = document.querySelector("#editor-canvas");
const editorContext = editorCanvas.getContext("2d");
const printCanvas = document.querySelector("#print-canvas");
const imageInput = document.querySelector("#image-input");
const projectInput = document.querySelector("#project-input");
const selectedLabel = document.querySelector("#selected-label");
const zoomSlider = document.querySelector("#zoom-slider");
const zoomLabel = document.querySelector("#zoom-label");
const bleedSlider = document.querySelector("#bleed-slider");
const bleedLabel = document.querySelector("#bleed-label");
const bleedModeSelect = document.querySelector("#bleed-mode-select");
const applyBleedModeButton = document.querySelector("#apply-bleed-mode-button");
const statusText = document.querySelector("#status");
const guidesToggle = document.querySelector("#guides-toggle");

const cells = Array.from({ length: CELL_COUNT }, () => emptyCell());
const imageCache = new Map();
const BLEED_MODES = new Set(["none", "edge", "mirror"]);

let selectedIndex = 0;
let copiedCell = null;
let dragging = false;
let dragStart = null;

function emptyCell() {
  return {
    src: "",
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    bleedMode: "none",
  };
}

function cloneCell(cell) {
  return {
    src: cell.src,
    offsetX: cell.offsetX,
    offsetY: cell.offsetY,
    scale: cell.scale,
    bleedMode: normaliseBleedMode(cell.bleedMode),
  };
}

function normaliseBleedMode(mode) {
  return BLEED_MODES.has(mode) ? mode : "none";
}

function clampBleedAmount(amount) {
  if (!Number.isFinite(amount)) {
    return SHEET.bleedAmount;
  }

  return Math.max(0, Math.min(SHEET.maxBleedAmount, Math.round(amount * 10) / 10));
}

function bleedDiameter() {
  return SHEET.labelDiameter + SHEET.bleedAmount * 2;
}

function cellCenter(index) {
  const column = index % SHEET.columns;
  const row = Math.floor(index / SHEET.columns);

  return {
    x: SHEET.marginX + SHEET.labelDiameter / 2 + column * (SHEET.labelDiameter + SHEET.gap),
    y: SHEET.marginY + SHEET.labelDiameter / 2 + row * (SHEET.labelDiameter + SHEET.gap),
  };
}

function findCellAt(point) {
  for (let index = 0; index < CELL_COUNT; index += 1) {
    const center = cellCenter(index);
    const distance = Math.hypot(point.x - center.x, point.y - center.y);

    if (distance <= bleedDiameter() / 2) {
      return index;
    }
  }

  return -1;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  if (!src) {
    return Promise.resolve(null);
  }

  if (imageCache.has(src)) {
    return Promise.resolve(imageCache.get(src));
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => {
      imageCache.set(src, image);
      resolve(image);
    });
    image.addEventListener("error", reject);
    image.src = src;
  });
}

function baseFillScale(image) {
  const diameter = bleedDiameter();

  return Math.max(diameter / image.naturalWidth, diameter / image.naturalHeight);
}

function fitScale(image) {
  return Math.min(SHEET.labelDiameter / image.naturalWidth, SHEET.labelDiameter / image.naturalHeight);
}

async function setCellImage(index, src) {
  const image = await loadImage(src);
  cells[index] = {
    src,
    offsetX: 0,
    offsetY: 0,
    scale: baseFillScale(image),
    bleedMode: "none",
  };

  selectCell(index);
  afterChange("Image added.");
}

function selectCell(index) {
  selectedIndex = Math.max(0, Math.min(CELL_COUNT - 1, index));
  selectedLabel.textContent = String(selectedIndex + 1);
  updateZoomUi();
  updateBleedModeUi();
  renderEditor();
}

function updateZoomUi() {
  const cell = cells[selectedIndex];

  if (!cell.src) {
    zoomSlider.value = "100";
    zoomLabel.textContent = "100%";
    zoomSlider.disabled = true;
    return;
  }

  const image = imageCache.get(cell.src);

  if (!image) {
    return;
  }

  const zoom = Math.round((cell.scale / baseFillScale(image)) * 100);
  zoomSlider.disabled = false;
  zoomSlider.value = String(Math.max(5, Math.min(800, zoom)));
  zoomLabel.textContent = `${zoom}%`;
}

function updateBleedAmountUi() {
  bleedSlider.value = String(SHEET.bleedAmount);
  bleedLabel.textContent = `${SHEET.bleedAmount.toFixed(1)} mm`;
}

function updateBleedModeUi() {
  const cell = cells[selectedIndex];
  bleedModeSelect.value = normaliseBleedMode(cell.bleedMode);
  bleedModeSelect.disabled = !cell.src;
  applyBleedModeButton.disabled = !cell.src;
}

function canvasPointFromEvent(event) {
  const rect = editorCanvas.getBoundingClientRect();

  return {
    x: ((event.clientX - rect.left) / rect.width) * SHEET.pageWidth,
    y: ((event.clientY - rect.top) / rect.height) * SHEET.pageHeight,
  };
}

function drawCircle(context, center, diameter) {
  context.beginPath();
  context.arc(center.x, center.y, diameter / 2, 0, Math.PI * 2);
}

function imageRectForCell(cell, image, center) {
  const width = image.naturalWidth * cell.scale;
  const height = image.naturalHeight * cell.scale;

  return {
    x: center.x + cell.offsetX - width / 2,
    y: center.y + cell.offsetY - height / 2,
    width,
    height,
  };
}

function bleedBounds(center) {
  const diameter = bleedDiameter();

  return {
    left: center.x - diameter / 2,
    top: center.y - diameter / 2,
    right: center.x + diameter / 2,
    bottom: center.y + diameter / 2,
  };
}

function drawImageSlice(context, image, sx, sy, sw, sh, dx, dy, dw, dh) {
  if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) {
    return;
  }

  context.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
}

function drawEdgeBleed(context, image, rect, bounds) {
  const imageRight = rect.x + rect.width;
  const imageBottom = rect.y + rect.height;
  const leftGap = rect.x - bounds.left;
  const rightGap = bounds.right - imageRight;
  const topGap = rect.y - bounds.top;
  const bottomGap = bounds.bottom - imageBottom;
  const lastX = image.naturalWidth - 1;
  const lastY = image.naturalHeight - 1;

  drawImageSlice(context, image, 0, 0, 1, image.naturalHeight, bounds.left, rect.y, leftGap, rect.height);
  drawImageSlice(context, image, lastX, 0, 1, image.naturalHeight, imageRight, rect.y, rightGap, rect.height);
  drawImageSlice(context, image, 0, 0, image.naturalWidth, 1, rect.x, bounds.top, rect.width, topGap);
  drawImageSlice(context, image, 0, lastY, image.naturalWidth, 1, rect.x, imageBottom, rect.width, bottomGap);

  drawImageSlice(context, image, 0, 0, 1, 1, bounds.left, bounds.top, leftGap, topGap);
  drawImageSlice(context, image, lastX, 0, 1, 1, imageRight, bounds.top, rightGap, topGap);
  drawImageSlice(context, image, 0, lastY, 1, 1, bounds.left, imageBottom, leftGap, bottomGap);
  drawImageSlice(context, image, lastX, lastY, 1, 1, imageRight, imageBottom, rightGap, bottomGap);
}

function drawMirrorTile(context, image, rect, tileX, tileY) {
  const flipX = Math.abs(tileX) % 2 === 1;
  const flipY = Math.abs(tileY) % 2 === 1;
  const x = rect.x + tileX * rect.width;
  const y = rect.y + tileY * rect.height;

  context.save();
  context.translate(x + (flipX ? rect.width : 0), y + (flipY ? rect.height : 0));
  context.scale(flipX ? -1 : 1, flipY ? -1 : 1);
  context.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight, 0, 0, rect.width, rect.height);
  context.restore();
}

function drawMirrorBleed(context, image, rect, bounds) {
  if (rect.width <= 0 || rect.height <= 0) {
    return;
  }

  const minTileX = Math.floor((bounds.left - rect.x) / rect.width);
  const maxTileX = Math.ceil((bounds.right - rect.x) / rect.width);
  const minTileY = Math.floor((bounds.top - rect.y) / rect.height);
  const maxTileY = Math.ceil((bounds.bottom - rect.y) / rect.height);

  for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
    for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
      if (tileX === 0 && tileY === 0) {
        continue;
      }

      drawMirrorTile(context, image, rect, tileX, tileY);
    }
  }
}

function drawBleedExtension(context, cell, image, rect, center) {
  const mode = normaliseBleedMode(cell.bleedMode);

  if (mode === "none") {
    return;
  }

  const bounds = bleedBounds(center);

  if (mode === "edge") {
    drawEdgeBleed(context, image, rect, bounds);
    return;
  }

  drawMirrorBleed(context, image, rect, bounds);
}

function drawSheet(context, options = {}) {
  const includeEditorGuides = options.editor === true;
  const includeCalibrationGuides = options.calibration === true;
  const diameter = bleedDiameter();

  context.save();
  context.clearRect(0, 0, SHEET.pageWidth, SHEET.pageHeight);
  context.fillStyle = "#fff";
  context.fillRect(0, 0, SHEET.pageWidth, SHEET.pageHeight);

  for (let index = 0; index < CELL_COUNT; index += 1) {
    const cell = cells[index];
    const center = cellCenter(index);

    if (cell.src) {
      const image = imageCache.get(cell.src);

      if (image) {
        context.save();
        drawCircle(context, center, diameter);
        context.clip();
        const rect = imageRectForCell(cell, image, center);
        drawBleedExtension(context, cell, image, rect, center);
        context.drawImage(
          image,
          rect.x,
          rect.y,
          rect.width,
          rect.height
        );
        context.restore();
      }
    }

    if (includeEditorGuides || includeCalibrationGuides) {
      context.save();
      context.lineWidth = includeEditorGuides ? 0.25 : 0.12;
      context.strokeStyle = includeEditorGuides ? "#888" : "#aaa";
      context.setLineDash([1.5, 1.5]);
      drawCircle(context, center, diameter);
      context.stroke();

      context.setLineDash([]);
      context.strokeStyle = includeEditorGuides ? "#111" : "#666";
      drawCircle(context, center, SHEET.labelDiameter);
      context.stroke();
      context.restore();
    }

    if (includeEditorGuides && index === selectedIndex) {
      context.save();
      context.lineWidth = 0.7;
      context.strokeStyle = "#06c";
      drawCircle(context, center, diameter + 2);
      context.stroke();
      context.restore();
    }
  }

  if (includeEditorGuides) {
    context.save();
    context.strokeStyle = "#bbb";
    context.lineWidth = 0.2;
    context.strokeRect(0, 0, SHEET.pageWidth, SHEET.pageHeight);
    context.restore();
  }

  context.restore();
}

function resizeEditorCanvas() {
  const rect = editorCanvas.getBoundingClientRect();
  const cssWidth = Math.max(320, Math.round(rect.width || 760));
  const cssHeight = Math.round(cssWidth * (SHEET.pageHeight / SHEET.pageWidth));
  const ratio = window.devicePixelRatio || 1;

  editorCanvas.width = Math.round(cssWidth * ratio);
  editorCanvas.height = Math.round(cssHeight * ratio);
  editorCanvas.style.height = `${cssHeight}px`;

  editorContext.setTransform(
    editorCanvas.width / SHEET.pageWidth,
    0,
    0,
    editorCanvas.height / SHEET.pageHeight,
    0,
    0
  );
  renderEditor();
}

function renderEditor() {
  drawSheet(editorContext, { editor: true });
}

function renderOutputCanvas(canvas, includeCalibrationGuides) {
  const width = Math.round((SHEET.pageWidth / MM_PER_INCH) * SHEET.exportDpi);
  const height = Math.round((SHEET.pageHeight / MM_PER_INCH) * SHEET.exportDpi);
  const context = canvas.getContext("2d");

  canvas.width = width;
  canvas.height = height;
  context.setTransform(width / SHEET.pageWidth, 0, 0, height / SHEET.pageHeight, 0, 0);
  drawSheet(context, { calibration: includeCalibrationGuides });
}

function projectData() {
  return {
    version: 2,
    sheet: {
      label: "A4 24 round sticker",
      pageWidth: SHEET.pageWidth,
      pageHeight: SHEET.pageHeight,
      labelDiameter: SHEET.labelDiameter,
      bleedAmount: SHEET.bleedAmount,
      bleedDiameter: bleedDiameter(),
      columns: SHEET.columns,
      rows: SHEET.rows,
    },
    cells: cells.map(cloneCell),
  };
}

async function loadProject(data) {
  if (!data || !Array.isArray(data.cells)) {
    throw new Error("Project file is not valid.");
  }

  const incomingSheet = data.sheet || {};
  const incomingBleedAmount = Number(incomingSheet.bleedAmount);
  const incomingBleedDiameter = Number(incomingSheet.bleedDiameter);

  if (Number.isFinite(incomingBleedAmount)) {
    SHEET.bleedAmount = clampBleedAmount(incomingBleedAmount);
  } else if (Number.isFinite(incomingBleedDiameter)) {
    SHEET.bleedAmount = clampBleedAmount((incomingBleedDiameter - SHEET.labelDiameter) / 2);
  }

  updateBleedAmountUi();

  for (let index = 0; index < CELL_COUNT; index += 1) {
    const incoming = data.cells[index] || emptyCell();
    cells[index] = {
      src: typeof incoming.src === "string" ? incoming.src : "",
      offsetX: Number.isFinite(incoming.offsetX) ? incoming.offsetX : 0,
      offsetY: Number.isFinite(incoming.offsetY) ? incoming.offsetY : 0,
      scale: Number.isFinite(incoming.scale) && incoming.scale > 0 ? incoming.scale : 1,
      bleedMode: normaliseBleedMode(incoming.bleedMode),
    };

    if (cells[index].src) {
      await loadImage(cells[index].src);
    }
  }

  selectCell(0);
  afterChange("Project loaded.");
}

function saveAutosave() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projectData()));
  } catch (error) {
    setStatus("Autosave skipped; the project is too large for browser storage.");
  }
}

async function restoreAutosave() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    return;
  }

  try {
    await loadProject(JSON.parse(saved));
    setStatus("Autosave restored.");
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
    setStatus("Autosave could not be restored.");
  }
}

function setStatus(message) {
  statusText.textContent = message;
}

function afterChange(message) {
  updateZoomUi();
  updateBleedModeUi();
  renderEditor();
  saveAutosave();

  if (message) {
    setStatus(message);
  }
}

function activeCellHasImage() {
  return Boolean(cells[selectedIndex].src);
}

async function handleImageFiles(files) {
  const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));

  for (let index = 0; index < imageFiles.length; index += 1) {
    const targetIndex = selectedIndex + index;

    if (targetIndex >= CELL_COUNT) {
      break;
    }

    const src = await fileToDataUrl(imageFiles[index]);
    const image = await loadImage(src);
    cells[targetIndex] = {
      src,
      offsetX: 0,
      offsetY: 0,
      scale: baseFillScale(image),
      bleedMode: "none",
    };
  }

  afterChange(`${imageFiles.length} image${imageFiles.length === 1 ? "" : "s"} added.`);
}

async function fitSelected() {
  const cell = cells[selectedIndex];

  if (!cell.src) {
    return;
  }

  const image = await loadImage(cell.src);
  cell.scale = fitScale(image);
  cell.offsetX = 0;
  cell.offsetY = 0;
  afterChange("Selected image fit inside the 40 mm circle.");
}

async function fillSelected() {
  const cell = cells[selectedIndex];

  if (!cell.src) {
    return;
  }

  const image = await loadImage(cell.src);
  cell.scale = baseFillScale(image);
  cell.offsetX = 0;
  cell.offsetY = 0;
  afterChange(`Selected image filled the ${bleedDiameter().toFixed(1)} mm bleed circle.`);
}

async function resetSelected() {
  await fillSelected();
}

function copySelected() {
  if (!activeCellHasImage()) {
    return;
  }

  copiedCell = cloneCell(cells[selectedIndex]);
  setStatus(`Copied sticker ${selectedIndex + 1}.`);
}

async function pasteCopied() {
  if (!copiedCell) {
    return;
  }

  cells[selectedIndex] = cloneCell(copiedCell);

  if (cells[selectedIndex].src) {
    await loadImage(cells[selectedIndex].src);
  }

  afterChange(`Pasted into sticker ${selectedIndex + 1}.`);
}

function clearSelected() {
  cells[selectedIndex] = emptyCell();
  afterChange(`Cleared sticker ${selectedIndex + 1}.`);
}

function clearAll() {
  for (let index = 0; index < CELL_COUNT; index += 1) {
    cells[index] = emptyCell();
  }

  afterChange("Cleared all stickers.");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function saveProject() {
  const blob = new Blob([JSON.stringify(projectData(), null, 2)], {
    type: "application/json",
  });
  downloadBlob(blob, "a4-24-round-sticker-project.json");
  setStatus("Project saved.");
}

async function importProject(file) {
  const text = await file.text();
  await loadProject(JSON.parse(text));
}

function exportPng() {
  renderOutputCanvas(printCanvas, guidesToggle.checked);
  printCanvas.toBlob((blob) => {
    if (!blob) {
      setStatus("PNG export failed.");
      return;
    }

    downloadBlob(blob, "a4-24-round-sticker-sheet.png");
    setStatus("PNG exported.");
  }, "image/png");
}

function printSheet() {
  renderOutputCanvas(printCanvas, guidesToggle.checked);
  window.print();
}

function updateSelectedScaleFromSlider() {
  const cell = cells[selectedIndex];

  if (!cell.src) {
    return;
  }

  const image = imageCache.get(cell.src);

  if (!image) {
    return;
  }

  cell.scale = baseFillScale(image) * (Number(zoomSlider.value) / 100);
  zoomLabel.textContent = `${zoomSlider.value}%`;
  afterChange("");
}

function updateBleedAmountFromSlider() {
  SHEET.bleedAmount = clampBleedAmount(Number(bleedSlider.value));
  updateBleedAmountUi();
  afterChange(`Bleed set to ${SHEET.bleedAmount.toFixed(1)} mm.`);
}

function updateSelectedBleedMode() {
  const cell = cells[selectedIndex];

  if (!cell.src) {
    return;
  }

  cell.bleedMode = normaliseBleedMode(bleedModeSelect.value);
  afterChange("Bleed mode updated.");
}

function applySelectedBleedModeToAll() {
  const cell = cells[selectedIndex];

  if (!cell.src) {
    return;
  }

  const mode = normaliseBleedMode(cell.bleedMode);
  let changedCount = 0;

  for (const targetCell of cells) {
    if (!targetCell.src) {
      continue;
    }

    targetCell.bleedMode = mode;
    changedCount += 1;
  }

  afterChange(`Applied bleed mode to ${changedCount} sticker${changedCount === 1 ? "" : "s"}.`);
}

editorCanvas.addEventListener("pointerdown", (event) => {
  const point = canvasPointFromEvent(event);
  const index = findCellAt(point);

  if (index === -1) {
    return;
  }

  selectCell(index);
  const cell = cells[selectedIndex];

  if (!cell.src) {
    return;
  }

  dragging = true;
  dragStart = {
    point,
    offsetX: cell.offsetX,
    offsetY: cell.offsetY,
  };
  editorCanvas.setPointerCapture(event.pointerId);
});

editorCanvas.addEventListener("pointermove", (event) => {
  if (!dragging || !dragStart) {
    return;
  }

  const point = canvasPointFromEvent(event);
  const cell = cells[selectedIndex];
  cell.offsetX = dragStart.offsetX + point.x - dragStart.point.x;
  cell.offsetY = dragStart.offsetY + point.y - dragStart.point.y;
  renderEditor();
});

editorCanvas.addEventListener("pointerup", (event) => {
  if (!dragging) {
    return;
  }

  dragging = false;
  dragStart = null;
  editorCanvas.releasePointerCapture(event.pointerId);
  afterChange("Image moved.");
});

editorCanvas.addEventListener("pointercancel", () => {
  dragging = false;
  dragStart = null;
});

editorCanvas.addEventListener("wheel", async (event) => {
  const point = canvasPointFromEvent(event);
  const index = findCellAt(point);

  if (index === -1 || index !== selectedIndex || !activeCellHasImage()) {
    return;
  }

  event.preventDefault();
  const direction = event.deltaY < 0 ? 1.06 : 0.94;
  const nextValue = Math.max(5, Math.min(800, Number(zoomSlider.value) * direction));
  zoomSlider.value = String(Math.round(nextValue));
  updateSelectedScaleFromSlider();
}, { passive: false });

imageInput.addEventListener("change", async () => {
  try {
    await handleImageFiles(imageInput.files);
  } catch (error) {
    setStatus("Image upload failed.");
  } finally {
    imageInput.value = "";
  }
});

projectInput.addEventListener("change", async () => {
  try {
    if (projectInput.files.length > 0) {
      await importProject(projectInput.files[0]);
    }
  } catch (error) {
    setStatus("Project load failed.");
  } finally {
    projectInput.value = "";
  }
});

zoomSlider.addEventListener("input", updateSelectedScaleFromSlider);
bleedSlider.addEventListener("input", updateBleedAmountFromSlider);
bleedModeSelect.addEventListener("change", updateSelectedBleedMode);
applyBleedModeButton.addEventListener("click", applySelectedBleedModeToAll);

document.querySelector("#fit-button").addEventListener("click", fitSelected);
document.querySelector("#fill-button").addEventListener("click", fillSelected);
document.querySelector("#reset-button").addEventListener("click", resetSelected);
document.querySelector("#copy-button").addEventListener("click", copySelected);
document.querySelector("#paste-button").addEventListener("click", pasteCopied);
document.querySelector("#clear-button").addEventListener("click", clearSelected);
document.querySelector("#clear-all-button").addEventListener("click", clearAll);
document.querySelector("#save-project-button").addEventListener("click", saveProject);
document.querySelector("#export-png-button").addEventListener("click", exportPng);
document.querySelector("#print-button").addEventListener("click", printSheet);

document.addEventListener("copy", (event) => {
  if (document.activeElement && ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
    return;
  }

  if (!activeCellHasImage()) {
    return;
  }

  copySelected();
  event.preventDefault();
});

document.addEventListener("paste", async (event) => {
  if (document.activeElement && ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
    return;
  }

  const imageItem = Array.from(event.clipboardData?.items || []).find((item) => item.type.startsWith("image/"));

  if (imageItem) {
    const file = imageItem.getAsFile();

    if (file) {
      await setCellImage(selectedIndex, await fileToDataUrl(file));
      event.preventDefault();
      return;
    }
  }

  if (copiedCell) {
    await pasteCopied();
    event.preventDefault();
  }
});

document.addEventListener("keydown", async (event) => {
  if (document.activeElement && ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
    return;
  }

  if (event.key === "Delete" || event.key === "Backspace") {
    clearSelected();
    event.preventDefault();
  }
});

window.addEventListener("resize", resizeEditorCanvas);

updateBleedAmountUi();
updateBleedModeUi();
resizeEditorCanvas();
restoreAutosave();
