/**
 * DotCraft - リアルタイム本格ピクセルアート（ドット絵）コンバーター & エディター
 * 
 * 高度なドット絵処理機能:
 * 1. 主線（輪郭線）の抽出と強調 (Sobel/Laplacianエッジ検出 & 黒/色トレス風)
 * 2. 組織的ディザリング (Bayer 4x4 行列) ON/OFF & 強度調整
 * 3. 背景透過の自動クリーンアップ (アルファ値50% 2値化)
 * 4. ドット単位での手動微調整 (ペン / スポイト / 消しゴム / Undo・Redo)
 * 5. Median Cut 減色 & レトロパレット (ゲームボーイ, ファミコン, PICO-8, モノクロ)
 * 6. 最近傍サンプリング & ぼやけない近傍法 (pixelated)
 */

(function () {
  'use strict';

  // --- 公式レトロゲーム・カラーパレット ---
  const PALETTES = {
    none: null,
    gameboy: [
      { r: 15,  g: 56,  b: 15,  hex: '#0f380f' },
      { r: 48,  g: 98,  b: 48,  hex: '#306230' },
      { r: 139, g: 172, b: 15,  hex: '#8bac0f' },
      { r: 155, g: 188, b: 15,  hex: '#9bbc0f' }
    ],
    nes: [
      { r: 0,   g: 0,   b: 0,   hex: '#000000' },
      { r: 255, g: 255, b: 255, hex: '#ffffff' },
      { r: 116, g: 116, b: 116, hex: '#747474' },
      { r: 0,   g: 0,   b: 168, hex: '#0000a8' },
      { r: 36,  g: 24,  b: 140, hex: '#24188c' },
      { r: 68,  g: 0,   b: 156, hex: '#44009c' },
      { r: 140, g: 0,   b: 116, hex: '#8c0074' },
      { r: 168, g: 0,   b: 32,  hex: '#a80020' },
      { r: 164, g: 0,   b: 0,   hex: '#a40000' },
      { r: 124, g: 8,   b: 0,   hex: '#7c0800' },
      { r: 64,  g: 44,  b: 0,   hex: '#402c00' },
      { r: 0,   g: 68,  b: 0,   hex: '#004400' },
      { r: 0,   g: 80,  b: 0,   hex: '#005000' },
      { r: 0,   g: 60,  b: 60,  hex: '#003c3c' },
      { r: 252, g: 152, b: 56,  hex: '#fc9838' },
      { r: 252, g: 116, b: 96,  hex: '#fc7460' },
      { r: 252, g: 160, b: 68,  hex: '#fca044' },
      { r: 248, g: 184, b: 0,   hex: '#f8b800' },
      { r: 184, g: 248, b: 24,  hex: '#b8f818' },
      { r: 88,  g: 216, b: 84,  hex: '#58d854' },
      { r: 60,  g: 188, b: 252, hex: '#3cbcbc' },
      { r: 0,   g: 120, b: 248, hex: '#0078f8' },
      { r: 216, g: 0,   b: 204, hex: '#d800cc' },
      { r: 228, g: 228, b: 228, hex: '#e4e4e4' },
      { r: 172, g: 172, b: 172, hex: '#acacac' }
    ],
    pico8: [
      { r: 0,   g: 0,   b: 0,   hex: '#000000' },
      { r: 29,  g: 43,  b: 83,  hex: '#1d2b53' },
      { r: 126, g: 37,  b: 83,  hex: '#7e2553' },
      { r: 0,   g: 135, b: 81,  hex: '#008751' },
      { r: 171, g: 82,  b: 54,  hex: '#ab5236' },
      { r: 95,  g: 87,  b: 79,  hex: '#5f574f' },
      { r: 194, g: 195, b: 199, hex: '#c2c3c7' },
      { r: 255, g: 241, b: 232, hex: '#fff1e8' },
      { r: 255, g: 0,   b: 77,  hex: '#ff004d' },
      { r: 255, g: 163, b: 0,   hex: '#ffa300' },
      { r: 255, g: 236, b: 39,  hex: '#ffec27' },
      { r: 0,   g: 228, b: 54,  hex: '#00e436' },
      { r: 41,  g: 173, b: 255, hex: '#29adff' },
      { r: 131, g: 118, b: 156, hex: '#83769c' },
      { r: 255, g: 119, b: 168, hex: '#ff77a8' },
      { r: 255, g: 204, b: 170, hex: '#ffccaa' }
    ],
    monochrome: [
      { r: 0,   g: 0,   b: 0,   hex: '#000000' },
      { r: 36,  g: 36,  b: 36,  hex: '#242424' },
      { r: 73,  g: 73,  b: 73,  hex: '#494949' },
      { r: 109, g: 109, b: 109, hex: '#6d6d6d' },
      { r: 146, g: 146, b: 146, hex: '#929292' },
      { r: 182, g: 182, b: 182, hex: '#b6b6b6' },
      { r: 219, g: 219, b: 219, hex: '#dbdbdb' },
      { r: 255, g: 255, b: 255, hex: '#ffffff' }
    ]
  };

  // Bayer 4x4 オーダードディザ行列
  const BAYER_4X4 = [
    [ 0,  8,  2, 10],
    [12,  4, 14,  6],
    [ 3, 11,  1,  9],
    [15,  7, 13,  5]
  ];

  // --- アプリケーション状態 ---
  const state = {
    currentImage: null,
    imageName: 'pixel-art',
    imageType: 'image/png',
    
    // 基本解像度
    targetSize: 64, // 32, 64, 128
    aspectMode: 'keep', // 'keep' or 'square'
    
    // パレット＆色数設定
    selectedPaletteKey: 'none',
    colorCount: 16, // デフォルト16色でクッキリ
    
    // 主線抽出（無効化）
    outlineStrength: 0,
    outlineColorMode: 'black',

    // ディザリング設定
    ditherEnabled: true,
    ditherType: 'bayer', // 'bayer' (組織的網点) or 'floyd'
    ditherStrength: 50, // 10 ~ 100%

    // 背景透過クリーンアップ (アルファ50% 2値化)
    alphaCleanup: true,

    // トーン強調
    autoToneBoost: true,
    contrast: 0,
    saturation: 100,
    brightness: 0,

    // 表示オプション
    showGrid: false,
    zoomLevel: 1.0,
    pixelWidth: 64,
    pixelHeight: 64,
    displayScale: 6,

    // パレット管理
    currentActivePalette: [],
    deletedColorKeys: new Set(),
    deletedHistory: [],

    // ドット手動微調整（エディタ状態）
    activeTool: 'pen', // 'pen', 'eyedropper', 'eraser'
    paintColor: { r: 0, g: 0, b: 0, a: 255, hex: '#000000' },
    isDrawing: false,
    manualEdits: new Map(), // key: "x,y", val: {r, g, b, a}
    undoStack: [], // 各手動操作の差分配列
    redoStack: [],

    // 内部Canvas
    lowResCanvas: document.createElement('canvas'),
  };

  // --- DOM要素 ---
  const elements = {
    dropZone: document.getElementById('dropZone'),
    fileInput: document.getElementById('fileInput'),
    browseBtn: document.getElementById('browseBtn'),
    sampleBtn: document.getElementById('sampleBtn'),
    
    // 解像度
    presetButtons: document.querySelectorAll('.preset-btn'),
    currentResolutionBadge: document.getElementById('currentResolutionBadge'),
    aspectButtons: document.querySelectorAll('.segment-btn[data-aspect]'),

    // パレットスタイル
    paletteButtons: document.querySelectorAll('.palette-btn'),

    // 色数
    colorPresetButtons: document.querySelectorAll('.color-preset-btn'),
    currentColorCountBadge: document.getElementById('currentColorCountBadge'),
    colorCountSlider: document.getElementById('colorCountSlider'),
    colorCountSliderVal: document.getElementById('colorCountSliderVal'),

    // ディザリング
    ditherEnableToggle: document.getElementById('ditherEnableToggle'),
    ditherControls: document.getElementById('ditherControls'),
    ditherTypeSelector: document.getElementById('ditherTypeSelector'),
    ditherStrengthSlider: document.getElementById('ditherStrengthSlider'),
    ditherStrengthVal: document.getElementById('ditherStrengthVal'),

    // 透過クリーンアップ＆トーン強調
    alphaCleanupToggle: document.getElementById('alphaCleanupToggle'),
    autoToneBoostToggle: document.getElementById('autoToneBoostToggle'),

    // パレットエディタ
    paletteEditorBox: document.getElementById('paletteEditorBox'),
    activeColorsCount: document.getElementById('activeColorsCount'),
    paletteSwatches: document.getElementById('paletteSwatches'),
    removeLeastColorBtn: document.getElementById('removeLeastColorBtn'),
    addOneColorBtn: document.getElementById('addOneColorBtn'),
    resetCustomPaletteBtn: document.getElementById('resetCustomPaletteBtn'),
    removedColorsHint: document.getElementById('removedColorsHint'),
    removedCountText: document.getElementById('removedCountText'),

    // グリッドトグル
    gridToggle: document.getElementById('gridToggle'),
    gridToggleBtn: document.getElementById('gridToggleBtn'),

    // 手動ドットエディタツール
    toolPenBtn: document.getElementById('toolPenBtn'),
    toolEyedropperBtn: document.getElementById('toolEyedropperBtn'),
    toolEraserBtn: document.getElementById('toolEraserBtn'),
    editorColorInput: document.getElementById('editorColorInput'),
    editorColorIndicator: document.getElementById('editorColorIndicator'),
    toolUndoBtn: document.getElementById('toolUndoBtn'),
    toolRedoBtn: document.getElementById('toolRedoBtn'),
    toolClearEditBtn: document.getElementById('toolClearEditBtn'),

    // スライダー
    toggleAdvancedBtn: document.getElementById('toggleAdvancedBtn'),
    advancedSettings: document.getElementById('advancedSettings'),
    contrastSlider: document.getElementById('contrastSlider'),
    contrastVal: document.getElementById('contrastVal'),
    saturationSlider: document.getElementById('saturationSlider'),
    saturationVal: document.getElementById('saturationVal'),
    brightnessSlider: document.getElementById('brightnessSlider'),
    brightnessVal: document.getElementById('brightnessVal'),

    // ダウンロード
    downloadOriginalScaleBtn: document.getElementById('downloadOriginalScaleBtn'),
    downloadUpscaledBtn: document.getElementById('downloadUpscaledBtn'),
    originalScaleText: document.getElementById('originalScaleText'),
    upscaledScaleText: document.getElementById('upscaledScaleText'),

    // ズーム
    zoomOutBtn: document.getElementById('zoomOutBtn'),
    zoomInBtn: document.getElementById('zoomInBtn'),
    zoomResetBtn: document.getElementById('zoomResetBtn'),
    zoomLevelDisplay: document.getElementById('zoomLevelDisplay'),

    // プレビュー
    originalViewport: document.getElementById('originalViewport'),
    pixelViewport: document.getElementById('pixelViewport'),
    originalContainer: document.getElementById('originalContainer'),
    pixelContainer: document.getElementById('pixelContainer'),
    originalImg: document.getElementById('originalImg'),
    pixelCanvas: document.getElementById('pixelCanvas'),
    originalPlaceholder: document.getElementById('originalPlaceholder'),
    pixelPlaceholder: document.getElementById('pixelPlaceholder'),

    // メタ情報
    originalDimensions: document.getElementById('originalDimensions'),
    pixelDimensions: document.getElementById('pixelDimensions'),
    metaFormat: document.getElementById('metaFormat'),
    metaPixelCount: document.getElementById('metaPixelCount'),
    metaTime: document.getElementById('metaTime'),
    processStatus: document.getElementById('processStatus'),

    toast: document.getElementById('toast'),
  };

  // --- 初期化 ---
  function init() {
    setupEventListeners();
    setupDropZone();
    setupManualCanvasEditor();
    loadDefaultSample();
  }

  // --- イベントリスナー設定 ---
  function setupEventListeners() {
    // ファイル選択
    elements.browseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      elements.fileInput.click();
    });
    elements.dropZone.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', handleFileSelect);
    window.addEventListener('paste', handlePaste);
    elements.sampleBtn.addEventListener('click', loadDefaultSample);

    // 解像度ボタン (32, 64, 128)
    elements.presetButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        elements.presetButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.targetSize = parseInt(btn.dataset.size, 10);
        elements.currentResolutionBadge.textContent = `${state.targetSize}px`;
        clearManualEdits();
        renderPixelArt();
      });
    });

    // アスペクト比
    elements.aspectButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        elements.aspectButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.aspectMode = btn.dataset.aspect;
        clearManualEdits();
        renderPixelArt();
      });
    });

    // パレット選択
    elements.paletteButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        elements.paletteButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.selectedPaletteKey = btn.dataset.palette;
        state.deletedColorKeys.clear();
        state.deletedHistory = [];
        renderPixelArt();
        showToast(`🎨 パレットを「${btn.querySelector('.palette-name').textContent}」に切り替えました`);
      });
    });

    // 色数ボタン (8, 16, 32, 64, 128, 0)
    elements.colorPresetButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        elements.colorPresetButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const count = parseInt(btn.dataset.colors, 10);
        state.colorCount = count;
        elements.currentColorCountBadge.textContent = count === 0 ? '無制限 (フルカラー)' : `${count}色`;
        elements.colorCountSlider.value = count === 0 ? 128 : count;
        elements.colorCountSliderVal.textContent = count === 0 ? '無制限' : `${count}色`;
        state.deletedColorKeys.clear();
        state.deletedHistory = [];
        renderPixelArt();
      });
    });

    // 色数スライダー (4〜128色)
    elements.colorCountSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      state.colorCount = val;
      elements.colorCountSliderVal.textContent = `${val}色`;
      elements.currentColorCountBadge.textContent = `${val}色`;
      elements.colorPresetButtons.forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.colors, 10) === val);
      });
      state.deletedColorKeys.clear();
      state.deletedHistory = [];
      scheduleRender();
    });

    // ディザリングON/OFF
    elements.ditherEnableToggle.addEventListener('change', (e) => {
      state.ditherEnabled = e.target.checked;
      elements.ditherControls.style.opacity = state.ditherEnabled ? '1' : '0.4';
      elements.ditherControls.style.pointerEvents = state.ditherEnabled ? 'auto' : 'none';
      renderPixelArt();
      showToast(state.ditherEnabled ? '✨ ディザリングON' : 'ディザリングOFF (ベタ塗り)');
    });

    // ディザリング種類 (Bayer vs Floyd)
    elements.ditherTypeSelector.querySelectorAll('.segment-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        elements.ditherTypeSelector.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.ditherType = btn.dataset.dithertype;
        renderPixelArt();
        showToast(state.ditherType === 'bayer' ? '▦ 組織的ディザリング (Bayer網点)' : '≈ 誤差拡散ディザリング (Floyd)');
      });
    });

    // ディザリング強度スライダー
    elements.ditherStrengthSlider.addEventListener('input', (e) => {
      state.ditherStrength = parseInt(e.target.value, 10);
      elements.ditherStrengthVal.textContent = `${state.ditherStrength}%`;
      scheduleRender();
    });

    // 背景透過クリーンアップトグル
    elements.alphaCleanupToggle.addEventListener('change', (e) => {
      state.alphaCleanup = e.target.checked;
      renderPixelArt();
      showToast(state.alphaCleanup ? '🧹 透過PNGのフチ・ゴミ除去 ON' : '透過クリーンアップ OFF');
    });

    // トーン強調
    elements.autoToneBoostToggle.addEventListener('change', (e) => {
      state.autoToneBoost = e.target.checked;
      renderPixelArt();
    });

    // グリッド線トグル
    const updateGridState = (enabled) => {
      state.showGrid = enabled;
      elements.gridToggle.checked = enabled;
      elements.gridToggleBtn.textContent = enabled ? '🔲 グリッド線: ON' : '🔲 グリッド線: OFF';
      elements.gridToggleBtn.classList.toggle('active', enabled);
      drawPreviewCanvas();
    };
    elements.gridToggle.addEventListener('change', (e) => updateGridState(e.target.checked));
    elements.gridToggleBtn.addEventListener('click', () => updateGridState(!state.showGrid));

    // パレット編集 (1色削除・復元・リセット)
    elements.removeLeastColorBtn.addEventListener('click', removeLeastUsedColor);
    elements.addOneColorBtn.addEventListener('click', restoreLastDeletedColorOrAdd);
    elements.resetCustomPaletteBtn.addEventListener('click', () => {
      state.deletedColorKeys.clear();
      state.deletedHistory = [];
      renderPixelArt();
      showToast('🔄 パレットの削除状態をリセットしました');
    });

    // トーン調整スライダー
    elements.toggleAdvancedBtn.addEventListener('click', () => {
      const isCollapsed = elements.advancedSettings.classList.toggle('collapsed');
      const arrow = elements.toggleAdvancedBtn.querySelector('.toggle-arrow');
      if (arrow) arrow.classList.toggle('open', !isCollapsed);
    });

    elements.contrastSlider.addEventListener('input', (e) => {
      state.contrast = parseInt(e.target.value, 10);
      elements.contrastVal.textContent = state.contrast > 0 ? `+${state.contrast}` : state.contrast;
      scheduleRender();
    });
    elements.saturationSlider.addEventListener('input', (e) => {
      state.saturation = parseInt(e.target.value, 10);
      elements.saturationVal.textContent = `${state.saturation}%`;
      scheduleRender();
    });
    elements.brightnessSlider.addEventListener('input', (e) => {
      state.brightness = parseInt(e.target.value, 10);
      elements.brightnessVal.textContent = state.brightness > 0 ? `+${state.brightness}` : state.brightness;
      scheduleRender();
    });

    // ズーム
    elements.zoomInBtn.addEventListener('click', () => updateZoom(state.zoomLevel * 1.25));
    elements.zoomOutBtn.addEventListener('click', () => updateZoom(state.zoomLevel * 0.8));
    elements.zoomResetBtn.addEventListener('click', resetZoom);

    // ダウンロード
    elements.downloadOriginalScaleBtn.addEventListener('click', downloadOriginalScale);
    elements.downloadUpscaledBtn.addEventListener('click', downloadUpscaled);
  }

  // --- 手動ドットエディタのツールバー設定 ---
  function setupManualCanvasEditor() {
    const canvas = elements.pixelCanvas;

    // ツール切り替えボタン
    elements.toolPenBtn.addEventListener('click', () => setActiveTool('pen'));
    elements.toolEyedropperBtn.addEventListener('click', () => setActiveTool('eyedropper'));
    elements.toolEraserBtn.addEventListener('click', () => setActiveTool('eraser'));

    // カラーピッカー
    elements.editorColorInput.addEventListener('input', (e) => {
      const hex = e.target.value;
      const rgb = hexToRgb(hex);
      state.paintColor = { r: rgb.r, g: rgb.g, b: rgb.b, a: 255, hex };
      elements.editorColorIndicator.style.backgroundColor = hex;
      setActiveTool('pen');
    });

    // Undo / Redo
    elements.toolUndoBtn.addEventListener('click', undoManualEdit);
    elements.toolRedoBtn.addEventListener('click', redoManualEdit);
    elements.toolClearEditBtn.addEventListener('click', () => {
      clearManualEdits();
      renderPixelArt();
      showToast('手動修正をリセットしました');
    });

    // Canvas上のマウス描画イベント
    canvas.addEventListener('mousedown', (e) => {
      if (!state.currentImage) return;
      state.isDrawing = true;
      handleCanvasClick(e, true);
    });

    window.addEventListener('mousemove', (e) => {
      if (!state.isDrawing) return;
      handleCanvasClick(e, false);
    });

    window.addEventListener('mouseup', () => {
      if (state.isDrawing) {
        state.isDrawing = false;
        commitCurrentStroke();
      }
    });
  }

  function setActiveTool(tool) {
    state.activeTool = tool;
    elements.toolPenBtn.classList.toggle('active', tool === 'pen');
    elements.toolEyedropperBtn.classList.toggle('active', tool === 'eyedropper');
    elements.toolEraserBtn.classList.toggle('active', tool === 'eraser');

    const canvas = elements.pixelCanvas;
    canvas.classList.remove('pen-mode', 'eyedropper-mode', 'eraser-mode');
    canvas.classList.add(`${tool}-mode`);

    const names = { pen: '✏️ ペン', eyedropper: '💧 スポイト', eraser: '🧹 消しゴム' };
    showToast(`ツール: ${names[tool]}`);
  }

  let currentStrokeDiffs = [];

  function handleCanvasClick(e, isStart) {
    const canvas = elements.pixelCanvas;
    const rect = canvas.getBoundingClientRect();

    // キャンバス外判定
    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
      if (isStart) return;
    }

    const scale = state.displayScale || 6;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const canvasX = (e.clientX - rect.left) * scaleX;
    const canvasY = (e.clientY - rect.top) * scaleY;

    const dotX = Math.floor(canvasX / scale);
    const dotY = Math.floor(canvasY / scale);

    if (dotX < 0 || dotX >= state.pixelWidth || dotY < 0 || dotY >= state.pixelHeight) {
      return;
    }

    const lowCtx = state.lowResCanvas.getContext('2d', { willReadFrequently: true });

    // スポイトツール
    if (state.activeTool === 'eyedropper') {
      const p = lowCtx.getImageData(dotX, dotY, 1, 1).data;
      if (p[3] === 0) {
        showToast('透明ピクセルです');
        return;
      }
      const hex = rgbToHex(p[0], p[1], p[2]);
      state.paintColor = { r: p[0], g: p[1], b: p[2], a: 255, hex };
      elements.editorColorInput.value = hex;
      elements.editorColorIndicator.style.backgroundColor = hex;
      setActiveTool('pen');
      showToast(`💧 色をスポイトしました: ${hex}`);
      return;
    }

    // ペン または 消しゴム
    const key = `${dotX},${dotY}`;
    let newColor;

    if (state.activeTool === 'pen') {
      newColor = { ...state.paintColor };
    } else if (state.activeTool === 'eraser') {
      newColor = { r: 0, g: 0, b: 0, a: 0, hex: 'transparent' };
    }

    // 前の色を取得
    const oldPixel = lowCtx.getImageData(dotX, dotY, 1, 1).data;
    const oldColor = { r: oldPixel[0], g: oldPixel[1], b: oldPixel[2], a: oldPixel[3] };

    // 既に同じ色ならスキップ
    if (oldColor.r === newColor.r && oldColor.g === newColor.g && oldColor.b === newColor.b && oldColor.a === newColor.a) {
      return;
    }

    // 差分を記録
    currentStrokeDiffs.push({ x: dotX, y: dotY, oldColor, newColor });
    state.manualEdits.set(key, newColor);

    // lowResCanvasへ直接1ドット反映
    const pixelImg = lowCtx.createImageData(1, 1);
    pixelImg.data[0] = newColor.r;
    pixelImg.data[1] = newColor.g;
    pixelImg.data[2] = newColor.b;
    pixelImg.data[3] = newColor.a;
    lowCtx.putImageData(pixelImg, dotX, dotY);

    // プレビュー再描画
    drawPreviewCanvas();
  }

  function commitCurrentStroke() {
    if (currentStrokeDiffs.length > 0) {
      state.undoStack.push([...currentStrokeDiffs]);
      state.redoStack = [];
      currentStrokeDiffs = [];
      updateUndoRedoUI();
    }
  }

  function undoManualEdit() {
    if (state.undoStack.length === 0) return;
    const stroke = state.undoStack.pop();
    state.redoStack.push(stroke);

    const lowCtx = state.lowResCanvas.getContext('2d', { willReadFrequently: true });
    stroke.forEach(item => {
      const key = `${item.x},${item.y}`;
      state.manualEdits.set(key, item.oldColor);

      const p = lowCtx.createImageData(1, 1);
      p.data[0] = item.oldColor.r;
      p.data[1] = item.oldColor.g;
      p.data[2] = item.oldColor.b;
      p.data[3] = item.oldColor.a;
      lowCtx.putImageData(p, item.x, item.y);
    });

    drawPreviewCanvas();
    updateUndoRedoUI();
    showToast('↩️ 1手元に戻しました');
  }

  function redoManualEdit() {
    if (state.redoStack.length === 0) return;
    const stroke = state.redoStack.pop();
    state.undoStack.push(stroke);

    const lowCtx = state.lowResCanvas.getContext('2d', { willReadFrequently: true });
    stroke.forEach(item => {
      const key = `${item.x},${item.y}`;
      state.manualEdits.set(key, item.newColor);

      const p = lowCtx.createImageData(1, 1);
      p.data[0] = item.newColor.r;
      p.data[1] = item.newColor.g;
      p.data[2] = item.newColor.b;
      p.data[3] = item.newColor.a;
      lowCtx.putImageData(p, item.x, item.y);
    });

    drawPreviewCanvas();
    updateUndoRedoUI();
    showToast('🔁 やり直しました');
  }

  function clearManualEdits() {
    state.manualEdits.clear();
    state.undoStack = [];
    state.redoStack = [];
    updateUndoRedoUI();
  }

  function updateUndoRedoUI() {
    elements.toolUndoBtn.disabled = (state.undoStack.length === 0);
    elements.toolRedoBtn.disabled = (state.redoStack.length === 0);
  }

  // --- ドラッグ＆ドロップ設定 ---
  function setupDropZone() {
    const zone = elements.dropZone;
    ['dragenter', 'dragover'].forEach(eventName => {
      zone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.add('dragover');
      });
    });
    ['dragleave', 'drop'].forEach(eventName => {
      zone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        zone.classList.remove('dragover');
      });
    });
    zone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (dt.files && dt.files.length > 0) handleImageFile(dt.files[0]);
    });
  }

  function handleFileSelect(e) {
    if (e.target.files && e.target.files.length > 0) handleImageFile(e.target.files[0]);
  }

  function handlePaste(e) {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        handleImageFile(item.getAsFile());
        showToast('クリップボードから画像を読み込みました');
        break;
      }
    }
  }

  function handleImageFile(file) {
    if (!file.type.startsWith('image/')) {
      showToast('⚠️ 画像ファイルを選択してください');
      return;
    }
    state.imageName = file.name.replace(/\.[^/.]+$/, "") || 'pixel-art';
    state.imageType = file.type;
    const reader = new FileReader();
    reader.onload = (e) => loadNewImage(e.target.result);
    reader.readAsDataURL(file);
  }

  function loadNewImage(src) {
    const img = new Image();
    img.onload = () => {
      state.currentImage = img;
      elements.originalImg.src = img.src;
      elements.originalImg.style.display = 'block';
      elements.originalPlaceholder.classList.add('hidden');
      elements.pixelPlaceholder.classList.add('hidden');

      elements.originalDimensions.textContent = `${img.naturalWidth} × ${img.naturalHeight} px`;
      elements.metaFormat.textContent = state.imageType.replace('image/', '').toUpperCase();

      state.deletedColorKeys.clear();
      state.deletedHistory = [];
      clearManualEdits();

      resetZoom();
      renderPixelArt();
      showToast('画像を読み込みました');
    };
    img.src = src;
  }

  let renderRequestId = null;
  function scheduleRender() {
    if (renderRequestId) cancelAnimationFrame(renderRequestId);
    renderRequestId = requestAnimationFrame(() => {
      renderPixelArt();
      renderRequestId = null;
    });
  }

  // ========================================================
  // コア処理: 本格ピクセルアート変換パイプライン
  // ========================================================
  function renderPixelArt() {
    if (!state.currentImage) return;

    const startTime = performance.now();
    elements.processStatus.textContent = '変換処理中...';

    const img = state.currentImage;
    const origW = img.naturalWidth;
    const origH = img.naturalHeight;

    // 1. ターゲットサイズの決定
    let targetW = state.targetSize;
    let targetH = state.targetSize;

    if (state.aspectMode === 'keep') {
      if (origW >= origH) {
        targetW = state.targetSize;
        targetH = Math.max(1, Math.round((origH / origW) * state.targetSize));
      } else {
        targetH = state.targetSize;
        targetW = Math.max(1, Math.round((origW / origH) * state.targetSize));
      }
    }

    state.pixelWidth = targetW;
    state.pixelHeight = targetH;

    // 2. 元画像から最近傍サンプリング
    const lowResCanvas = state.lowResCanvas;
    lowResCanvas.width = targetW;
    lowResCanvas.height = targetH;
    const lowCtx = lowResCanvas.getContext('2d', { willReadFrequently: true });

    const lowImageData = sampleNearestNeighbor(img, origW, origH, targetW, targetH);

    // 3. 背景透過の自動クリーンアップ (アルファ50% 2値化)
    if (state.alphaCleanup) {
      cleanupAlphaChannel(lowImageData);
    }

    // 4. トーン調整 & ドット絵最適化ブースト
    applyToneAdjustments(lowImageData);

    // 5. カラーパレットの構築 (レトロパレット or Median Cut減色)
    const effectivePalette = buildEffectivePalette(lowImageData);

    // 6. ディザリング & パレットへの最近傍色マッピング
    applyDitheringAndMapping(lowImageData, targetW, targetH, effectivePalette);

    // 7. 手動編集（ペン・消しゴム）の上書き反映
    applyManualEditsToImageData(lowImageData, targetW, targetH);

    lowCtx.putImageData(lowImageData, 0, 0);

    // 8. パレットスウォッチUIの更新
    updatePaletteSwatchesUI(effectivePalette);

    // 10. メタ情報更新
    const endTime = performance.now();
    const duration = Math.round(endTime - startTime);
    elements.pixelDimensions.textContent = `${targetW} × ${targetH} px`;
    elements.originalScaleText.textContent = `${targetW} × ${targetH} px`;
    
    const scaleFactor = Math.max(2, Math.floor(640 / Math.max(targetW, targetH)));
    elements.upscaledScaleText.textContent = `SNS・共有用 (${targetW * scaleFactor} × ${targetH * scaleFactor} px)`;

    elements.metaPixelCount.textContent = `${(targetW * targetH).toLocaleString()} ドット`;
    elements.metaTime.textContent = `${duration}ms (クライアント処理)`;
    elements.processStatus.textContent = 'リアルタイム処理完了';

    // 11. プレビューCanvasへの描画（近傍法拡大＋グリッド線）
    drawPreviewCanvas();
  }

  // --- (A) 最近傍ダウンサンプリング ---
  function sampleNearestNeighbor(img, origW, origH, targetW, targetH) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = origW;
    tempCanvas.height = origH;
    const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
    tempCtx.drawImage(img, 0, 0);
    const origData = tempCtx.getImageData(0, 0, origW, origH).data;

    const outImgData = tempCtx.createImageData(targetW, targetH);
    const outData = outImgData.data;

    const scaleX = origW / targetW;
    const scaleY = origH / targetH;

    for (let y = 0; y < targetH; y++) {
      const srcY = Math.min(origH - 1, Math.floor((y + 0.5) * scaleY));
      const rowOffset = y * targetW;
      const srcRowOffset = srcY * origW;

      for (let x = 0; x < targetW; x++) {
        const srcX = Math.min(origW - 1, Math.floor((x + 0.5) * scaleX));
        const srcIdx = (srcRowOffset + srcX) * 4;
        const outIdx = (rowOffset + x) * 4;

        outData[outIdx]     = origData[srcIdx];
        outData[outIdx + 1] = origData[srcIdx + 1];
        outData[outIdx + 2] = origData[srcIdx + 2];
        outData[outIdx + 3] = origData[srcIdx + 3];
      }
    }
    return outImgData;
  }

  // --- (B) 背景透過クリーンアップ (アルファ50% 2値化) ---
  function cleanupAlphaChannel(imgData) {
    const data = imgData.data;
    const len = data.length;
    for (let i = 0; i < len; i += 4) {
      const a = data[i + 3];
      if (a < 128) {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 0; // 完全透明
      } else {
        data[i + 3] = 255; // 完全不透明
      }
    }
  }

  // --- (C) トーン調整 & ドット絵最適化ブースト ---
  function applyToneAdjustments(imgData) {
    const data = imgData.data;
    const len = data.length;

    let contrast = state.contrast;
    let saturation = state.saturation / 100;
    const brightness = state.brightness;

    if (state.autoToneBoost) {
      contrast += 20;
      saturation *= 1.2;
    }

    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    const isMonochrome = (state.selectedPaletteKey === 'monochrome');

    for (let i = 0; i < len; i += 4) {
      if (data[i + 3] === 0) continue;

      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      if (brightness !== 0) {
        r += brightness;
        g += brightness;
        b += brightness;
      }
      if (contrast !== 0) {
        r = factor * (r - 128) + 128;
        g = factor * (g - 128) + 128;
        b = factor * (b - 128) + 128;
      }
      if (saturation !== 1.0) {
        const gray = 0.2989 * r + 0.5870 * g + 0.1140 * b;
        r = gray + (r - gray) * saturation;
        g = gray + (g - gray) * saturation;
        b = gray + (b - gray) * saturation;
      }
      if (isMonochrome) {
        const gray = Math.round(0.2989 * r + 0.5870 * g + 0.1140 * b);
        r = gray; g = gray; b = gray;
      }

      data[i]     = Math.min(255, Math.max(0, r));
      data[i + 1] = Math.min(255, Math.max(0, g));
      data[i + 2] = Math.min(255, Math.max(0, b));
    }
  }

  // --- (D) 主線（輪郭線）の抽出と強調 (Sobel エッジ検出) ---
  function detectAndEnhanceOutlines(imgData, width, height, strength, colorMode) {
    const data = imgData.data;
    const mask = new Uint8Array(width * height); // 1: 主線, 0: 通常
    const len = data.length;

    // 輝度バッファの作成
    const gray = new Float32Array(width * height);
    for (let i = 0; i < len; i += 4) {
      const idx = i / 4;
      if (data[i + 3] === 0) {
        gray[idx] = -1; // 透明
      } else {
        gray[idx] = 0.2989 * data[i] + 0.5870 * data[i + 1] + 0.1140 * data[i + 2];
      }
    }

    // 閾値設定 (弱: 60, 中: 40, 強: 25)
    const thresholdMap = [999, 55, 38, 24];
    const threshold = thresholdMap[strength];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (gray[idx] === -1) continue;

        // 周囲に透明ピクセルがある境界（外枠）は自動的に主線
        const isBoundary = (
          gray[(y - 1) * width + x] === -1 ||
          gray[(y + 1) * width + x] === -1 ||
          gray[y * width + (x - 1)] === -1 ||
          gray[y * width + (x + 1)] === -1
        );

        if (isBoundary && strength >= 2) {
          mask[idx] = 1;
          continue;
        }

        // Sobel カーネルによる内部輪郭（主線）検出
        const p00 = Math.max(0, gray[(y - 1) * width + (x - 1)]);
        const p01 = Math.max(0, gray[(y - 1) * width + x]);
        const p02 = Math.max(0, gray[(y - 1) * width + (x + 1)]);
        const p10 = Math.max(0, gray[y * width + (x - 1)]);
        const p12 = Math.max(0, gray[y * width + (x + 1)]);
        const p20 = Math.max(0, gray[(y + 1) * width + (x - 1)]);
        const p21 = Math.max(0, gray[(y + 1) * width + x]);
        const p22 = Math.max(0, gray[(y + 1) * width + (x + 1)]);

        const gx = (p02 + 2 * p12 + p22) - (p00 + 2 * p10 + p20);
        const gy = (p20 + 2 * p21 + p22) - (p00 + 2 * p01 + p02);
        const edge = Math.sqrt(gx * gx + gy * gy);

        if (edge >= threshold) {
          mask[idx] = 1;
        }
      }
    }

    // 主線ピクセルのカラー化（真っ黒 vs 色トレス風）
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (mask[idx] === 1) {
          const pIdx = idx * 4;
          if (data[pIdx + 3] === 0) continue;

          if (colorMode === 'black') {
            // 真っ黒
            data[pIdx]     = 0;
            data[pIdx + 1] = 0;
            data[pIdx + 2] = 0;
          } else {
            // 色トレス風（元の色を35%の明度に落とした濃い同系色）
            data[pIdx]     = Math.round(data[pIdx] * 0.35);
            data[pIdx + 1] = Math.round(data[pIdx + 1] * 0.35);
            data[pIdx + 2] = Math.round(data[pIdx + 2] * 0.35);
          }
        }
      }
    }

    return mask;
  }

  // --- (E) 有効パレットの構築 ---
  function buildEffectivePalette(imgData) {
    const palKey = state.selectedPaletteKey;
    let basePalette = [];

    if (palKey !== 'none' && PALETTES[palKey]) {
      // レトロパレット (ゲームボーイ, ファミコン, PICO-8, モノクロ)
      basePalette = PALETTES[palKey].map(c => ({
        r: c.r, g: c.g, b: c.b,
        hex: c.hex,
        key: `${c.r},${c.g},${c.b}`,
        count: 0
      }));
    } else if (state.colorCount > 0) {
      // 指定色数 (8, 16, 32, 64, 128) に正確に Median Cut 減色
      basePalette = extractPaletteMedianCut(imgData, state.colorCount);
    } else {
      // 制限なし (フルカラー): スウォッチ表示用に画像内のユニークカラーを抽出 (最大128色)
      basePalette = extractUniqueColors(imgData, 128);
    }

    let effective = basePalette.filter(c => !state.deletedColorKeys.has(c.key));
    if (effective.length < 2) {
      effective = basePalette.length >= 2 ? basePalette.slice(0, 2) : basePalette;
    }

    state.currentActivePalette = effective;
    return effective;
  }

  // --- (F) ディザリング & パレットマッピング ---
  function applyDitheringAndMapping(imgData, width, height, palette) {
    if (!palette || palette.length === 0) return;
    palette.forEach(c => c.count = 0);
    const data = imgData.data;

    // 重要: 「制限なし (colorCount === 0)」かつ「レトロパレットなし」かつ「手動色削除なし」の場合
    // -> 減色もディザリングも行わず、元画像の色（フルカラー）を100%そのまま維持する！
    const isFullColorNoLimit = (state.colorCount === 0 && state.selectedPaletteKey === 'none' && state.deletedColorKeys.size === 0);
    if (isFullColorNoLimit) {
      // ピクセル色を壊さずそのまま維持 (フルカラー最高色数)
      return;
    }

    // ディザリング無効 または フラット減色
    if (!state.ditherEnabled) {
      applyNearestColorMapping(data, palette);
      return;
    }

    if (state.ditherType === 'bayer') {
      // Bayer 4x4 組織的ディザリング (網点表現)
      applyBayerDitherWithStrength(data, width, height, palette, state.ditherStrength / 100);
    } else {
      // Floyd-Steinberg 誤差拡散法
      applyFloydSteinbergDither(data, width, height, palette);
    }
  }

  // --- Bayer 4x4 組織的ディザリング (強度調整対応) ---
  function applyBayerDitherWithStrength(data, width, height, palette, strength) {
    const maxAmplitude = strength * 52; // 最大バイアス振幅

    for (let y = 0; y < height; y++) {
      const bayerRow = BAYER_4X4[y % 4];
      for (let x = 0; x < width; x++) {
        const pIdx = (y * width + x) * 4;
        if (data[pIdx + 3] === 0) continue;

        const bayerNorm = (bayerRow[x % 4] / 15.0 - 0.5); // -0.5 ~ +0.5
        const bias = bayerNorm * maxAmplitude;

        const r = Math.min(255, Math.max(0, data[pIdx] + bias));
        const g = Math.min(255, Math.max(0, data[pIdx + 1] + bias));
        const b = Math.min(255, Math.max(0, data[pIdx + 2] + bias));

        const match = findNearestInPalette(r, g, b, palette);
        match.count++;

        data[pIdx]     = match.r;
        data[pIdx + 1] = match.g;
        data[pIdx + 2] = match.b;
      }
    }
  }

  // --- Floyd-Steinberg 誤差拡散ディザリング ---
  function applyFloydSteinbergDither(data, width, height, palette) {
    const len = data.length;
    const fData = new Float32Array(len);
    for (let i = 0; i < len; i++) fData[i] = data[i];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        if (data[idx + 3] === 0) continue;

        const oldR = Math.min(255, Math.max(0, fData[idx]));
        const oldG = Math.min(255, Math.max(0, fData[idx + 1]));
        const oldB = Math.min(255, Math.max(0, fData[idx + 2]));

        const match = findNearestInPalette(oldR, oldG, oldB, palette);
        match.count++;

        data[idx]     = match.r;
        data[idx + 1] = match.g;
        data[idx + 2] = match.b;

        const errR = oldR - match.r;
        const errG = oldG - match.g;
        const errB = oldB - match.b;

        const distribute = (targetX, targetY, weight) => {
          if (targetX < 0 || targetX >= width || targetY >= height) return;
          const tIdx = (targetY * width + targetX) * 4;
          fData[tIdx]     += errR * weight;
          fData[tIdx + 1] += errG * weight;
          fData[tIdx + 2] += errB * weight;
        };

        distribute(x + 1, y,     7 / 16);
        distribute(x - 1, y + 1, 3 / 16);
        distribute(x,     y + 1, 5 / 16);
        distribute(x + 1, y + 1, 1 / 16);
      }
    }
  }

  // --- ディザリングなし最近傍マッピング ---
  function applyNearestColorMapping(data, palette) {
    const len = data.length;
    const cache = new Map();

    for (let i = 0; i < len; i += 4) {
      if (data[i + 3] === 0) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const key = (r << 16) | (g << 8) | b;

      let match = cache.get(key);
      if (!match) {
        match = findNearestInPalette(r, g, b, palette);
        cache.set(key, match);
      }

      match.count++;
      data[i]     = match.r;
      data[i + 1] = match.g;
      data[i + 2] = match.b;
    }
  }

  // --- 手動編集ピクセルの上書き反映 ---
  function applyManualEditsToImageData(imgData, width, height) {
    const data = imgData.data;
    state.manualEdits.forEach((color, key) => {
      const [xStr, yStr] = key.split(',');
      const x = parseInt(xStr, 10);
      const y = parseInt(yStr, 10);
      if (x >= 0 && x < width && y >= 0 && y < height) {
        const idx = (y * width + x) * 4;
        data[idx]     = color.r;
        data[idx + 1] = color.g;
        data[idx + 2] = color.b;
        data[idx + 3] = color.a;
      }
    });
  }

  // --- Median Cut 減色アルゴリズム ---
  function extractPaletteMedianCut(imgData, targetCount) {
    const data = imgData.data;
    const len = data.length;
    const colorMap = new Map();

    for (let i = 0; i < len; i += 4) {
      if (data[i + 3] === 0) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const key = (r << 16) | (g << 8) | b;
      const entry = colorMap.get(key);
      if (entry) entry.count++;
      else colorMap.set(key, { r, g, b, count: 1 });
    }

    const uniquePixels = Array.from(colorMap.values());
    if (uniquePixels.length <= targetCount) {
      return uniquePixels.map(p => ({
        r: p.r, g: p.g, b: p.b,
        hex: rgbToHex(p.r, p.g, p.b),
        key: `${p.r},${p.g},${p.b}`,
        count: p.count
      }));
    }

    let boxes = [createVBox(uniquePixels)];
    while (boxes.length < targetCount) {
      let maxRange = -1;
      let targetIndex = -1;
      for (let i = 0; i < boxes.length; i++) {
        if (boxes[i].pixels.length > 1 && boxes[i].range > maxRange) {
          maxRange = boxes[i].range;
          targetIndex = i;
        }
      }
      if (targetIndex === -1 || maxRange <= 0) break;

      const boxToSplit = boxes.splice(targetIndex, 1)[0];
      const [b1, b2] = splitVBox(boxToSplit);
      boxes.push(b1);
      if (b2) boxes.push(b2);
    }

    return boxes.map(box => {
      let sumR = 0, sumG = 0, sumB = 0, total = 0;
      for (const p of box.pixels) {
        sumR += p.r * p.count;
        sumG += p.g * p.count;
        sumB += p.b * p.count;
        total += p.count;
      }
      const r = Math.round(sumR / total);
      const g = Math.round(sumG / total);
      const b = Math.round(sumB / total);
      return {
        r, g, b,
        hex: rgbToHex(r, g, b),
        key: `${r},${g},${b}`,
        count: total
      };
    });
  }

  function createVBox(pixels) {
    let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0;
    for (const p of pixels) {
      if (p.r < minR) minR = p.r;
      if (p.r > maxR) maxR = p.r;
      if (p.g < minG) minG = p.g;
      if (p.g > maxG) maxG = p.g;
      if (p.b < minB) minB = p.b;
      if (p.b > maxB) maxB = p.b;
    }
    const rangeR = maxR - minR;
    const rangeG = maxG - minG;
    const rangeB = maxB - minB;
    const maxRange = Math.max(rangeR, rangeG, rangeB);
    let channel = 'r';
    if (rangeG === maxRange) channel = 'g';
    else if (rangeB === maxRange) channel = 'b';
    return { pixels, range: maxRange, channel };
  }

  function splitVBox(vbox) {
    const ch = vbox.channel;
    vbox.pixels.sort((a, b) => a[ch] - b[ch]);
    let total = 0;
    for (const p of vbox.pixels) total += p.count;
    const half = total / 2;
    let accum = 0, splitIdx = 0;
    for (let i = 0; i < vbox.pixels.length; i++) {
      accum += vbox.pixels[i].count;
      if (accum >= half) {
        splitIdx = Math.max(1, i);
        break;
      }
    }
    return [
      createVBox(vbox.pixels.slice(0, splitIdx)),
      vbox.pixels.length > splitIdx ? createVBox(vbox.pixels.slice(splitIdx)) : null
    ];
  }

  function extractUniqueColors(imgData, maxCount) {
    const data = imgData.data;
    const len = data.length;
    const map = new Map();
    for (let i = 0; i < len; i += 4) {
      if (data[i + 3] === 0) continue;
      const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
      const entry = map.get(key);
      if (entry) entry.count++;
      else map.set(key, { r: data[i], g: data[i + 1], b: data[i + 2], hex: rgbToHex(data[i], data[i + 1], data[i + 2]), key, count: 1 });
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, maxCount);
  }

  // --- 知覚的重み付け色差 (Redmean) ---
  function findNearestInPalette(r, g, b, palette) {
    let minDistance = Infinity;
    let closest = palette[0];

    for (let i = 0; i < palette.length; i++) {
      const pr = palette[i].r;
      const pg = palette[i].g;
      const pb = palette[i].b;

      const rmean = (r + pr) / 2;
      const dr = r - pr;
      const dg = g - pg;
      const db = b - pb;
      const dist = (2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db;

      if (dist < minDistance) {
        minDistance = dist;
        closest = palette[i];
      }
    }
    return closest;
  }

  // --- パレットスウォッチUIの更新 ---
  function updatePaletteSwatchesUI(palette) {
    const container = elements.paletteSwatches;
    container.innerHTML = '';
    
    if (state.colorCount === 0 && state.selectedPaletteKey === 'none' && state.deletedColorKeys.size === 0) {
      elements.activeColorsCount.textContent = '無制限 (フルカラー)';
    } else {
      elements.activeColorsCount.textContent = `${palette.length} 色`;
    }

    const removedCount = state.deletedColorKeys.size;
    if (removedCount > 0) {
      elements.removedColorsHint.classList.remove('hidden');
      elements.removedCountText.textContent = `${removedCount}色の色を削除中`;
    } else {
      elements.removedColorsHint.classList.add('hidden');
    }

    palette.forEach(color => {
      const swatch = document.createElement('div');
      swatch.className = 'color-swatch';
      swatch.style.backgroundColor = color.hex;
      swatch.title = `色: ${color.hex} [使用: ${color.count || 0}ドット]\nクリック: ペンの色にセット & 削除`;

      // クリックでペンの描画色にもセット
      swatch.addEventListener('click', (e) => {
        state.paintColor = { r: color.r, g: color.g, b: color.b, a: 255, hex: color.hex };
        elements.editorColorInput.value = color.hex;
        elements.editorColorIndicator.style.backgroundColor = color.hex;
        setActiveTool('pen');
        
        // Ctrlキーまたは右クリックで削除、通常クリックでペンの色にセット（直感的）
        if (e.shiftKey || e.altKey) {
          deleteSpecificColor(color);
        } else {
          showToast(`🎨 描画色を ${color.hex} に設定しました (Shift+クリックで削除)`);
        }
      });

      container.appendChild(swatch);
    });
  }

  function deleteSpecificColor(color) {
    if (state.currentActivePalette.length <= 2) {
      showToast('⚠️ 最低2色は残す必要があります');
      return;
    }
    state.deletedColorKeys.add(color.key);
    state.deletedHistory.push(color.key);
    renderPixelArt();
    showToast(`🗑️ 色 (${color.hex}) を削除しました（残りの色へ再配分）`);
  }

  function removeLeastUsedColor() {
    if (state.currentActivePalette.length <= 2) {
      showToast('⚠️ 最低2色は残す必要があります');
      return;
    }
    let minColor = state.currentActivePalette[0];
    for (let i = 1; i < state.currentActivePalette.length; i++) {
      if (state.currentActivePalette[i].count < minColor.count) minColor = state.currentActivePalette[i];
    }
    deleteSpecificColor(minColor);
  }

  function restoreLastDeletedColorOrAdd() {
    if (state.deletedHistory.length > 0) {
      const lastKey = state.deletedHistory.pop();
      state.deletedColorKeys.delete(lastKey);
      renderPixelArt();
      showToast('↩️ 削除した色を1色復元しました');
    } else {
      if (state.colorCount > 0) {
        state.colorCount = Math.min(128, state.colorCount + 1);
        elements.currentColorCountBadge.textContent = `${state.colorCount}色`;
        elements.colorCountSlider.value = state.colorCount;
        elements.colorCountSliderVal.textContent = `${state.colorCount}色`;
        renderPixelArt();
        showToast(`➕ 色数を ${state.colorCount} 色に増やしました`);
      }
    }
  }

  // --- プレビューCanvasへの描画（近傍法拡大＋グリッド線） ---
  function drawPreviewCanvas() {
    const canvas = elements.pixelCanvas;
    const ctx = canvas.getContext('2d');
    const lowResCanvas = state.lowResCanvas;

    const pw = state.pixelWidth;
    const ph = state.pixelHeight;

    const baseDisplaySize = 340;
    const scale = Math.max(3, Math.floor(baseDisplaySize / Math.max(pw, ph)));
    state.displayScale = scale;

    const displayW = pw * scale;
    const displayH = ph * scale;

    canvas.width = displayW;
    canvas.height = displayH;

    // 近傍法によるくっきり拡大
    ctx.imageSmoothingEnabled = false;
    ctx.mozImageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    ctx.msImageSmoothingEnabled = false;

    // ドット絵を描画
    ctx.drawImage(lowResCanvas, 0, 0, pw, ph, 0, 0, displayW, displayH);

    // グリッド線（ドット枠線）の描画
    if (state.showGrid && scale >= 3) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;

      ctx.beginPath();
      for (let x = 0; x <= displayW; x += scale) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, displayH);
      }
      for (let y = 0; y <= displayH; y += scale) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(displayW, y + 0.5);
      }
      ctx.stroke();
    }

    applyZoomTransform();
  }

  // --- ズームコントロール ---
  function updateZoom(newZoom) {
    state.zoomLevel = Math.max(0.25, Math.min(4.0, newZoom));
    elements.zoomLevelDisplay.textContent = `${Math.round(state.zoomLevel * 100)}%`;
    applyZoomTransform();
  }

  function resetZoom() {
    state.zoomLevel = 1.0;
    elements.zoomLevelDisplay.textContent = '100%';
    applyZoomTransform();
  }

  function applyZoomTransform() {
    const transformStr = `scale(${state.zoomLevel})`;
    elements.originalContainer.style.transform = transformStr;
    elements.pixelContainer.style.transform = transformStr;
  }

  // --- ダウンロード機能 ---
  function downloadOriginalScale() {
    if (!state.currentImage) return;
    const lowResCanvas = state.lowResCanvas;
    const link = document.createElement('a');
    link.download = `${state.imageName}_pixel_${state.pixelWidth}x${state.pixelHeight}.png`;
    link.href = lowResCanvas.toDataURL('image/png');
    link.click();
    showToast(`✅ 原寸ドット絵 (${state.pixelWidth}×${state.pixelHeight}px) をダウンロードしました`);
  }

  function downloadUpscaled() {
    if (!state.currentImage) return;
    const pw = state.pixelWidth;
    const ph = state.pixelHeight;

    const scaleFactor = Math.max(4, Math.floor(800 / Math.max(pw, ph)));
    const upW = pw * scaleFactor;
    const upH = ph * scaleFactor;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = upW;
    exportCanvas.height = upH;
    const exportCtx = exportCanvas.getContext('2d');

    exportCtx.imageSmoothingEnabled = false;
    exportCtx.mozImageSmoothingEnabled = false;
    exportCtx.webkitImageSmoothingEnabled = false;
    exportCtx.msImageSmoothingEnabled = false;

    exportCtx.drawImage(state.lowResCanvas, 0, 0, pw, ph, 0, 0, upW, upH);

    const link = document.createElement('a');
    link.download = `${state.imageName}_pixel_art_HD_${upW}x${upH}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
    showToast(`✅ くっきり高解像度PNG (${upW}×${upH}px) をダウンロードしました`);
  }

  function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function hexToRgb(hex) {
    const bigint = parseInt(hex.slice(1), 16);
    return {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8) & 255,
      b: bigint & 255
    };
  }

  let toastTimer = null;
  function showToast(message) {
    const toast = elements.toast;
    toast.textContent = message;
    toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
  }

  // --- デフォルトのサンプル画像 ---
  function loadDefaultSample() {
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = 320;
    sampleCanvas.height = 320;
    const sCtx = sampleCanvas.getContext('2d');

    const skyGradient = sCtx.createLinearGradient(0, 0, 0, 220);
    skyGradient.addColorStop(0, '#ff5e62');
    skyGradient.addColorStop(0.5, '#ff9966');
    skyGradient.addColorStop(1, '#ffe066');
    sCtx.fillStyle = skyGradient;
    sCtx.fillRect(0, 0, 320, 320);

    // 太陽
    sCtx.fillStyle = '#fff4a3';
    sCtx.beginPath();
    sCtx.arc(160, 110, 48, 0, Math.PI * 2);
    sCtx.fill();

    // 山
    sCtx.fillStyle = '#6b3074';
    sCtx.beginPath();
    sCtx.moveTo(0, 220);
    sCtx.lineTo(90, 130);
    sCtx.lineTo(190, 230);
    sCtx.closePath();
    sCtx.fill();

    sCtx.fillStyle = '#4c2263';
    sCtx.beginPath();
    sCtx.moveTo(130, 230);
    sCtx.lineTo(240, 120);
    sCtx.lineTo(320, 200);
    sCtx.lineTo(320, 260);
    sCtx.lineTo(130, 260);
    sCtx.closePath();
    sCtx.fill();

    // 大地
    sCtx.fillStyle = '#1e1035';
    sCtx.beginPath();
    sCtx.ellipse(160, 280, 200, 70, 0, 0, Math.PI * 2);
    sCtx.fill();

    // 星
    sCtx.fillStyle = '#ffffff';
    [[50, 40], [270, 50], [90, 70], [230, 80], [160, 30]].forEach(([x, y]) => {
      sCtx.fillRect(x, y, 4, 4);
    });

    // 宇宙船（輪郭線付きキャラクターテスト用）
    sCtx.strokeStyle = '#1e1035';
    sCtx.lineWidth = 4;
    sCtx.fillStyle = '#00f2fe';
    sCtx.beginPath();
    sCtx.arc(160, 190, 20, 0, Math.PI * 2);
    sCtx.fill();
    sCtx.stroke();

    sCtx.fillStyle = '#ff0055';
    sCtx.fillRect(150, 204, 20, 14);
    sCtx.strokeRect(150, 204, 20, 14);

    state.imageName = 'sunset-sample';
    state.imageType = 'image/png';
    loadNewImage(sampleCanvas.toDataURL('image/png'));
  }

  window.addEventListener('DOMContentLoaded', init);
})();
