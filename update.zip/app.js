/**
 * AI Kod Bölücü V7PRO - Core Logic
 */

// State
let splitData = {
    'index.html': '',
    'style.css': '',
    'app.js': ''
};

let projectHistory = [];
try {
    projectHistory = JSON.parse(localStorage.getItem('split_history_v62pro') || '[]');
    if (!Array.isArray(projectHistory)) {
        projectHistory = [];
    }
} catch (e) {
    console.warn("localStorage split_history parsing error - fallback active:", e);
    projectHistory = [];
}

let currentTheme = 'light';
try {
    currentTheme = localStorage.getItem('app_theme') || 'light';
} catch (e) {
    console.warn("localStorage app_theme reading error - fallback active:", e);
}

// Elements - Pre-declarations (will be fully re-evaluated at DOMContentLoaded)
const ui = {
    input: null,
    splitBtn: null,
    clearInputBtn: null,
    tabBtns: null,
    codeArea: null,
    fileName: null,
    copyBtn: null,
    downloadBtn: null,
    
    // ZIP Dropdown & Modal Elements
    zipDropdownBtn: null,
    zipDropdownMenu: null,
    downloadZipDirect: null,
    downloadZipCustomName: null,
    zipModal: null,
    zipNameInput: null,
    confirmZipDownloadBtn: null,
    
    // Modals & Triggers
    historyBtn: null,
    settingsBtn: null,
    modalOverlay: null,
    historyModal: null,
    settingsModal: null,
    closeModalBtns: null,
    
    // Settings Items
    themeBtns: null,
    historyList: null,
    
    // Status Bar
    statusText: null,
    fileCountText: null,
    lastActionText: null,
    
    // Terminal Features
    terminalArea: null,
    resizer: null,
    terminalLoader: null,
    loaderStatusText: null,
    loaderSubText: null,
    
    // Upload Confirmation Modal Elements
    confirmUploadModal: null,
    cancelUploadBtn: null,
    confirmUploadBtn: null,
    closeConfirmBtn: null
};

// Start
let allowInputWrite = false;
let isParsingActive = false;

// Progress & High Refresh Rate Timing state variables (60Hz to 240Hz+ frame independence)
let progressAnimationId = null;
let lastProgressTime = 0;
let currentProgress = 0;
let targetProgress = 0;

function startProgressLoop() {
    currentProgress = 0;
    targetProgress = 0;
    lastProgressTime = performance.now();
    updateProgressUI();
    
    function tick(now) {
        if (!ui.terminalLoader || !ui.terminalLoader.classList.contains('active')) {
            return;
        }
        
        let deltaTime = (now - lastProgressTime) / 1000; // time elapsed in seconds
        if (isNaN(deltaTime) || deltaTime < 0) {
            deltaTime = 0;
        } else if (deltaTime > 0.1) {
            deltaTime = 0.1; // clamp slow frames or background pauses
        }
        lastProgressTime = now;
        
        // Linear interpolation towards targetProgress using a framerate-independent mathematical exponential decay
        const lerpSpeed = 4.5; 
        currentProgress += (targetProgress - currentProgress) * (1 - Math.exp(-lerpSpeed * deltaTime));
        
        if (Math.abs(targetProgress - currentProgress) < 0.1) {
            currentProgress = targetProgress;
        }
        
        updateProgressUI();
        
        if (currentProgress < 100 || targetProgress < 100) {
            progressAnimationId = requestAnimationFrame(tick);
        }
    }
    
    if (typeof cancelAnimationFrame === 'function' && progressAnimationId) {
        cancelAnimationFrame(progressAnimationId);
    }
    if (typeof requestAnimationFrame === 'function') {
        progressAnimationId = requestAnimationFrame(tick);
    }
}

function updateProgressUI() {
    const progressEl = document.getElementById('loaderProgressBar');
    const percentEl = document.getElementById('loaderPercentText');
    if (progressEl) {
        progressEl.style.width = `${Math.min(100, Math.max(0, currentProgress))}%`;
    }
    if (percentEl) {
        percentEl.textContent = `%${Math.min(100, Math.max(0, Math.round(currentProgress)))}`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Dynamic Query Selection of elements on DOMContentLoaded ensures absolute robustness
    ui.input = document.getElementById('codeInput');
    ui.splitBtn = document.getElementById('splitBtn');
    ui.clearInputBtn = document.getElementById('clearInputBtn');
    ui.tabBtns = document.querySelectorAll('.tab-btn');
    ui.codeArea = document.getElementById('codeDisplay');
    ui.fileName = document.getElementById('fileName');
    ui.copyBtn = document.getElementById('copyBtn');
    ui.downloadBtn = document.getElementById('downloadZipBtn');
    
    ui.zipDropdownBtn = document.getElementById('zipDropdownBtn');
    ui.zipDropdownMenu = document.getElementById('zipDropdownMenu');
    ui.downloadZipDirect = document.getElementById('downloadZipDirect');
    ui.downloadZipCustomName = document.getElementById('downloadZipCustomName');
    ui.zipModal = document.getElementById('zipModal');
    ui.zipNameInput = document.getElementById('zipNameInput');
    ui.confirmZipDownloadBtn = document.getElementById('confirmZipDownloadBtn');
    
    ui.historyBtn = document.getElementById('historyTrigger');
    ui.settingsBtn = document.getElementById('settingsTrigger');
    ui.modalOverlay = document.getElementById('modalOverlay');
    ui.historyModal = document.getElementById('historyModal');
    ui.settingsModal = document.getElementById('settingsModal');
    ui.closeModalBtns = document.querySelectorAll('.close-modal');
    
    ui.themeBtns = document.querySelectorAll('.theme-btn');
    ui.historyList = document.getElementById('historyList');
    
    ui.statusText = document.getElementById('statusText');
    ui.fileCountText = document.getElementById('fileCount');
    ui.lastActionText = document.getElementById('lastAction');
    
    ui.terminalArea = document.getElementById('terminalArea');
    ui.resizer = document.getElementById('resizer');
    ui.terminalLoader = document.getElementById('terminalLoader');
    ui.loaderStatusText = document.getElementById('loaderStatusText');
    ui.loaderSubText = document.getElementById('loaderSubText');
    
    ui.confirmUploadModal = document.getElementById('confirmUploadModal');
    ui.cancelUploadBtn = document.getElementById('cancelUploadBtn');
    ui.confirmUploadBtn = document.getElementById('confirmUploadBtn');
    ui.closeConfirmBtn = document.getElementById('closeConfirmBtn');

    // Lock the input element value to prevent any programmatic overwriting from outside/parser
    const inputEl = ui.input;
    if (inputEl) {
        try {
            const originalValueDescriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
            if (originalValueDescriptor) {
                Object.defineProperty(inputEl, 'value', {
                    get() {
                        return originalValueDescriptor.get.call(this);
                    },
                    set(newValue) {
                        if (allowInputWrite) {
                            originalValueDescriptor.set.call(this, newValue);
                        } else {
                            console.error("OVERWRITE BLOCKED: Parser or system tried to overwrite input value automatically!", newValue);
                            throw new Error("REWRITE BLOCKED: Kullanıcının input alanı otomatik değiştirilemez!");
                        }
                    }
                });
            }
        } catch (err) {
            console.error("Input locks initialization error:", err);
        }
    }

    applyTheme(currentTheme);
    initEvents();
    renderHistory();
    initResizer();
});

function initEvents() {
    // Split Action with safety existence check
    if (ui.splitBtn) {
        ui.splitBtn.addEventListener('click', performAiSplit);
    }

    if (ui.clearInputBtn) {
        ui.clearInputBtn.addEventListener('click', performClearInput);
    }

    // Input Event to Synchronize Input Cleanup with State and DOM
    if (ui.input) {
        ui.input.addEventListener('input', () => {
            const val = ui.input.value.trim();
            if (!val) {
                // State reset
                splitData = { 'index.html': '', 'style.css': '', 'app.js': '' };
                // Sync DOM UI with safe existence checks
                if (ui.codeArea) ui.codeArea.textContent = 'Bekleniyor...';
                if (ui.fileCountText) ui.fileCountText.textContent = '0 Dosya Üretildi';
                if (ui.lastActionText) ui.lastActionText.textContent = 'Son işlem: Temizlendi';
                if (ui.fileName) ui.fileName.textContent = 'index.html';
                
                // Hide Banner
                const banner = document.getElementById('validationStatusBanner');
                if (banner) banner.style.display = 'none';

                // Highlight first tab, de-highlight others
                if (ui.tabBtns) {
                    ui.tabBtns.forEach((btn, idx) => {
                        btn.classList.toggle('active', idx === 0);
                    });
                }
                
                updateStatus('Sistem Hazır / Temizlendi', 'blue');
            }
        });
    }

    // Tab Switching
    if (ui.tabBtns) {
        ui.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const fileKey = btn.dataset.file === 'html' ? 'index.html' : 
                              btn.dataset.file === 'css' ? 'style.css' : 'app.js';
                switchToTab(fileKey, btn);
            });
        });
    }

    // Copy Action with strict runtime checks
    if (ui.copyBtn) {
        ui.copyBtn.addEventListener('click', () => {
            if (!ui.codeArea) return;
            const text = ui.codeArea.textContent;
            if (text === 'Bekleniyor...' || !text) return;

            navigator.clipboard.writeText(text).then(() => {
                const originalIcon = ui.copyBtn.innerHTML;
                ui.copyBtn.innerHTML = '<i data-lucide="check"></i>';
                if (window.lucide) {
                    window.lucide.createIcons();
                }
                setTimeout(() => {
                    ui.copyBtn.innerHTML = originalIcon;
                    if (window.lucide) {
                        window.lucide.createIcons();
                    }
                }, 2000);
            });
        });
    }

    // ZIP Download Options
    if (ui.downloadBtn) {
        ui.downloadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            downloadAsZip();
        });
    }

    // Dropdown Toggle
    if (ui.zipDropdownBtn) {
        ui.zipDropdownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (ui.zipDropdownMenu) {
                ui.zipDropdownMenu.classList.toggle('active');
            }
        });
    }

    // Close dropdown on click outside
    document.addEventListener('click', () => {
        if (ui.zipDropdownMenu) {
            ui.zipDropdownMenu.classList.remove('active');
        }
    });

    // Direct ZIP Download from dropdown
    if (ui.downloadZipDirect) {
        ui.downloadZipDirect.addEventListener('click', (e) => {
            e.stopPropagation();
            if (ui.zipDropdownMenu) {
                ui.zipDropdownMenu.classList.remove('active');
            }
            downloadAsZip();
        });
    }

    // Custom Named ZIP Modal Open
    if (ui.downloadZipCustomName) {
        ui.downloadZipCustomName.addEventListener('click', (e) => {
            e.stopPropagation();
            if (ui.zipDropdownMenu) {
                ui.zipDropdownMenu.classList.remove('active');
            }
            openModal('zip');
        });
    }

    // Custom ZIP Confirm Download
    if (ui.confirmZipDownloadBtn) {
        ui.confirmZipDownloadBtn.addEventListener('click', () => {
            if (!ui.zipNameInput) return;
            const customName = ui.zipNameInput.value.trim();
            closeModal();
            downloadAsZip(customName);
        });
    }

    // Modal Controls
    if (ui.historyBtn) {
        ui.historyBtn.addEventListener('click', () => openModal('history'));
    }
    if (ui.settingsBtn) {
        ui.settingsBtn.addEventListener('click', () => openModal('settings'));
    }
    
    if (ui.closeModalBtns) {
        ui.closeModalBtns.forEach(btn => {
            btn.addEventListener('click', closeModal);
        });
    }

    if (ui.modalOverlay) {
        ui.modalOverlay.addEventListener('click', (e) => {
            if (e.target === ui.modalOverlay) closeModal();
        });
    }

    // Theme Switching
    if (ui.themeBtns) {
        ui.themeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const theme = btn.dataset.theme;
                applyTheme(theme);
            });
        });
    }

    // Single File Drag & Drop Event Listeners
    const dropZone = document.getElementById('dropZone');
    const fileUploadInput = document.getElementById('fileUploadInput');

    if (dropZone && fileUploadInput) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.remove('dragover');
            }, false);
        });

        dropZone.addEventListener('click', () => {
            fileUploadInput.click();
        });

        dropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files && files.length > 0) {
                const file = files[0];
                readAndProcessUploadedFile(file);
            }
        });

        fileUploadInput.addEventListener('change', (e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
                const file = files[0];
                readAndProcessUploadedFile(file);
                fileUploadInput.value = '';
            }
        });
    }

    // Initialize Safe Update Engine bindings
    if (typeof initUpdateEngine === 'function') {
        initUpdateEngine();
    }

    // Dev Mode toggle shortcut: Ctrl + Shift + Alt + D
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.altKey && e.key && e.key.toLowerCase() === 'd') {
            e.preventDefault();
            toggleDevMode();
        }
    });

    // Make sure we apply initial Dev Mode visibility
    updateDevModeVisibility();
}

function toggleDevMode() {
    const isDev = localStorage.getItem('dev_mode') === 'true';
    if (!isDev) {
        localStorage.setItem('dev_mode', 'true');
        updateDevModeVisibility();
        openModal('settings');
        showToast('Sistem Güncellemesi Açıldı (Dev Mode)', 'info');
    } else {
        localStorage.setItem('dev_mode', 'false');
        updateDevModeVisibility();
        showToast('Dev Mode Kapatıldı', 'info');
    }
}

function updateDevModeVisibility() {
    const isDev = localStorage.getItem('dev_mode') === 'true';
    const devSection = document.getElementById('settingsDevUpdateSection');
    const settingsModal = document.getElementById('settingsModal');
    
    if (devSection) {
        devSection.style.display = isDev ? 'flex' : 'none';
    }
    
    if (settingsModal) {
        if (isDev) {
            settingsModal.style.maxWidth = '640px';
            if (window.lucide) {
                window.lucide.createIcons();
            }
            if (typeof loadUpdateEngineHistory === 'function') {
                loadUpdateEngineHistory();
            }
        } else {
            settingsModal.style.maxWidth = '480px';
        }
    }
}

function openModal(type) {
    if (ui.modalOverlay) ui.modalOverlay.style.display = 'flex';
    if (ui.historyModal) ui.historyModal.style.display = type === 'history' ? 'flex' : 'none';
    
    let activeType = type;
    if (type === 'updateEngine') {
        activeType = 'settings';
        localStorage.setItem('dev_mode', 'true');
    }
    
    if (ui.settingsModal) {
        ui.settingsModal.style.display = activeType === 'settings' ? 'flex' : 'none';
        if (activeType === 'settings') {
            updateDevModeVisibility();
        }
    }
    if (ui.zipModal) ui.zipModal.style.display = activeType === 'zip' ? 'flex' : 'none';
    if (ui.confirmUploadModal) {
        ui.confirmUploadModal.style.display = activeType === 'confirmUpload' ? 'flex' : 'none';
    }
    const updateEngineModal = document.getElementById('updateEngineModal');
    if (updateEngineModal) {
        updateEngineModal.style.display = 'none';
    }
}

function closeModal() {
    if (ui.modalOverlay) ui.modalOverlay.style.display = 'none';
    if (ui.historyModal) ui.historyModal.style.display = 'none';
    if (ui.settingsModal) ui.settingsModal.style.display = 'none';
    if (ui.zipModal) ui.zipModal.style.display = 'none';
    if (ui.confirmUploadModal) ui.confirmUploadModal.style.display = 'none';
    const updateEngineModal = document.getElementById('updateEngineModal');
    if (updateEngineModal) updateEngineModal.style.display = 'none';
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app_theme', theme);
    currentTheme = theme;
    
    if (ui.themeBtns) {
        ui.themeBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === theme);
        });
    }
}

function initResizer() {
    let isResizing = false;
    let startY, startHeight;

    if (!ui.resizer || !ui.terminalArea) return;

    ui.resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        startY = e.clientY;
        startHeight = ui.terminalArea.offsetHeight;
        
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none'; 
        ui.resizer.classList.add('active');
        ui.terminalArea.classList.add('resizing');
        e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        
        const deltaY = e.clientY - startY;
        const newHeight = startHeight + deltaY;
        
        // Limits: Min 200px, Max 80% of window height
        const maxHeight = window.innerHeight * 0.8;
        
        if (newHeight >= 200 && newHeight <= maxHeight) {
            ui.terminalArea.style.height = `${newHeight}px`;
        }
    });

    window.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'auto';
            if (ui.resizer) ui.resizer.classList.remove('active');
            if (ui.terminalArea) ui.terminalArea.classList.remove('resizing');
        }
    });
}

/* Elegant, non-blocking toast notification helper without innerHTML injection risks */
function showToast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconName = 'info';
    if (type === 'error') iconName = 'alert-circle';
    else if (type === 'success') iconName = 'check-circle';
    else if (type === 'warning') iconName = 'alert-triangle';
    
    // Construct securely with createElement / textContent to prevent unsafe innerHTML injections
    const icon = document.createElement('i');
    icon.setAttribute('data-lucide', iconName);
    
    const span = document.createElement('span');
    span.textContent = message;
    
    toast.appendChild(icon);
    toast.appendChild(span);
    container.appendChild(toast);
    
    if (window.lucide) {
        window.lucide.createIcons();
    }
    
    // Auto remove toast with clean transitions
    setTimeout(() => {
        toast.style.animation = 'toastIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) reverse forwards';
        setTimeout(() => {
            toast.remove();
            if (container.children.length === 0) {
                container.remove();
            }
        }, 300);
    }, 4500);
}

function performClearInput() {
    if (!ui.input) {
        showToast("Temizlenecek girdi alanı bulunamadı!", "warning");
        return;
    }
    
    const val = ui.input.value || "";
    if (val.trim() === "") {
        showToast("Girdi alanı zaten boş.", "warning");
        return;
    }
    
    try {
        allowInputWrite = true;
        ui.input.value = "";
        allowInputWrite = false;
        
        // Dispatch input event to automatically trigger resetting all parsed states,
        // sync views, reset file counters, and restore "Bekleniyor..." placeholder.
        ui.input.dispatchEvent(new Event('input'));
        
        console.log("INPUT CLEARED");
        showToast("Girdi alanı başarıyla temizlendi!", "success");
    } catch (err) {
        console.error("Error clearing input:", err);
        allowInputWrite = false;
        showToast(`Temizleme sırasında hata oluştu: ${err.message}`, 'error');
    }
}

async function performAiSplit() {
    if (isParsingActive) return;
    if (!ui.input) return;
    const code = ui.input.value.trim();
    if (!code) {
        updateStatus('Hata: Kod girişi boş', 'error');
        showToast('Kod bulunamadı. Lütfen geçerli bir içerik girin!', 'warning');
        
        // Dynamic outline highlight feedback
        if (ui.input) {
            const originalBorderColor = ui.input.style.borderColor;
            const originalBoxShadow = ui.input.style.boxShadow;
            ui.input.style.borderColor = 'var(--error)';
            ui.input.style.boxShadow = '0 0 0 2px rgba(239, 68, 68, 0.2)';
            setTimeout(() => {
                ui.input.style.borderColor = originalBorderColor;
                ui.input.style.boxShadow = originalBoxShadow;
            }, 2500);
        }
        return;
    }

    isParsingActive = true;

    // Capture parsing start timestamps
    const startParseTime = performance.now();
    const startTimeString = new Date().toLocaleTimeString('tr-TR');

    // STATE RESET FIX: Full cleanup of previous parsed state & UI buffer
    splitData = { 'index.html': '', 'style.css': '', 'app.js': '' };
    if (ui.codeArea) ui.codeArea.textContent = 'İşleniyor...';
    if (ui.fileCountText) ui.fileCountText.textContent = '0 Dosya Üretildi';

    if (ui.splitBtn) {
        ui.splitBtn.disabled = true;
        ui.splitBtn.innerHTML = '<i data-lucide="loader-2" class="animate-spin"></i> İşleniyor...';
    }
    if (window.lucide) {
        window.lucide.createIcons();
    }
    updateStatus('Yapay Zeka Çalışıyor...', 'working');

    // Show Loader Overlay & Initialize Timing normalized animator
    if (ui.terminalLoader) {
        ui.terminalLoader.classList.add('active');
        startProgressLoop(); // InitializedeltaTime animation frames
        targetProgress = 10;
        ui.loaderStatusText.textContent = 'Bağlantı Kuruluyor...';
        ui.loaderSubText.textContent = 'Ayrıştırma modülleri ve ağ denetleniyor...';
    }

    try {
        // OFFLINE ENGINE DETECTION (100% Client priority)
        if (!navigator.onLine) {
            throw new Error("Çevrimdışı algılandı. Yerel dönüştürme motoruna bağlanılıyor...");
        }

        targetProgress = 25;
        if (ui.terminalLoader) {
            ui.loaderStatusText.textContent = 'Proje Ayrıştırılıyor...';
            ui.loaderSubText.textContent = 'Yapay zeka modelleri kod bloklarını analiz ediyor...';
        }

        targetProgress = 40;
        const response = await fetch('/api/split', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });

        if (!response.ok) {
            throw new Error(`HTTP Bağlantı Hatası: ${response.status}`);
        }

        targetProgress = 70;
        if (ui.terminalLoader) {
            ui.loaderStatusText.textContent = 'Veri Alındı, Çözümleniyor...';
            ui.loaderSubText.textContent = 'Ayrıştırılan yapılar kod dosyalarına dökülüyor...';
        }

        const data = await response.json();
        if (data.error) throw new Error(data.error);
        if (!data.result) throw new Error("Ayrıştırma sonucu tanımsız.");

        targetProgress = 90;
        // Update progress before starting parsing steps
        if (ui.terminalLoader) {
            ui.loaderStatusText.textContent = 'Dosyalar Oluşturuluyor...';
            ui.loaderSubText.textContent = 'HTML, CSS ve JavaScript modülleri optimize ediliyor...';
        }

        // NON-BLOCKING EXECUTION: Parse without blocking UI thread using async timeouts
        await parseAiResponseAsync(data.result);
        saveToHistory(code);
        
        targetProgress = 100;
        // Update Stats
        const count = Object.keys(splitData).filter(key => splitData[key] && splitData[key].trim() !== '').length;
        if (ui.fileCountText) ui.fileCountText.textContent = `${count} Dosya Üretildi`;
        
        const durationStr = formatExecutionDuration(performance.now() - startParseTime);
        if (ui.lastActionText) ui.lastActionText.textContent = `Son işlem: ${startTimeString} | Süre: ${durationStr}`;
        
        updateStatus('İşlem Başarılı', 'success');
        showToast('Kod ayrıştırma başarıyla tamamlandı!', 'success');

        // Default to HTML tab
        const htmlTab = Array.from(ui.tabBtns).find(b => b.dataset.file === 'html');
        switchToTab('index.html', htmlTab);

    } catch (err) {
        console.error("Ana işlem hatası, kurtarma motoru devreye girdi:", err);
        showToast('Çevrimiçi ayrıştırıcı hatası veya çevrimdışı durum. Kurtarma motoru çalıştırılıyor...', 'warning');
        
        targetProgress = 50;
        if (ui.terminalLoader) {
            ui.loaderStatusText.textContent = 'Yerel Kurtarma Modu Aktif...';
            ui.loaderSubText.textContent = 'Yedek akıllı yerel kod ayrıştırma motoru çalıştırılıyor...';
        }

        // Let's add a micro delay for user visual comfort
        await new Promise(resolve => setTimeout(resolve, 800));

        try {
            targetProgress = 75;
            // SELF-HEALING ENGINE ON EXCEPTION: Parse input code directly with smart local detection
            await parseAiResponseAsync(code);
            saveToHistory(code);

            targetProgress = 100;
            const count = Object.keys(splitData).filter(key => splitData[key] && splitData[key].trim() !== '').length;
            if (ui.fileCountText) ui.fileCountText.textContent = `${count} Dosya Üretildi`;
            
            const durationStr = formatExecutionDuration(performance.now() - startParseTime);
            if (ui.lastActionText) ui.lastActionText.textContent = `Son işlem (Kurtarıldı): ${startTimeString} | Süre: ${durationStr}`;
            
            updateStatus('AI Kod Bölücü V7PRO', 'success');
            showToast('Yerel analizör ile dosyalar başarıyla kurtarıldı!', 'success');

            const htmlTab = Array.from(ui.tabBtns).find(b => b.dataset.file === 'html');
            switchToTab('index.html', htmlTab);
        } catch (innerErr) {
            targetProgress = 100;
            console.error("Yerel kurtarma motoru da başarısız oldu:", innerErr);
            updateStatus('Hata: Ayrıştırılamadı', 'error');
            if (ui.codeArea) ui.codeArea.textContent = 'Girdiğiniz kod ayrıştırılırken beklenmeyen bir hata oluştu. Lütfen formatını kontrol edin.';
            showToast(`Ayrıştırma başarısız: ${innerErr.message || innerErr}`, 'error');
            
            const durationStr = formatExecutionDuration(performance.now() - startParseTime);
            if (ui.lastActionText) ui.lastActionText.textContent = `Son işlem (Hata): ${startTimeString} | Süre: ${durationStr}`;
        }
    } finally {
        // Complete the animation percentage immediately 
        currentProgress = 100;
        updateProgressUI();
        
        // Small delay to let users read Completed %100 before fading
        await new Promise(resolve => setTimeout(resolve, 400));

        // Safe closure of loading state
        if (ui.terminalLoader) {
            ui.terminalLoader.classList.remove('active');
        }
        if (ui.splitBtn) {
            ui.splitBtn.disabled = false;
            ui.splitBtn.innerHTML = '<i data-lucide="scissors"></i> Kodları Ayrıştır';
        }
        if (window.lucide) {
            window.lucide.createIcons();
        }
        isParsingActive = false;
    }
}

function checkInputValidity(raw) {
    try {
        if (!raw || raw.trim() === '') return false;
        const trimmed = raw.trim();
        
        // Fast operator validation check - dangling ending operators
        const lastChar = trimmed.slice(-1);
        if (['.', ',', '+', '-', '*', '/', '=', '&', '|'].includes(lastChar)) {
            return false;
        }
        
        if (trimmed.includes('<!--') && !trimmed.includes('-->')) {
            return false;
        }
        
        const openScripts = (trimmed.match(/<script([^>]*)>/gi) || []).length;
        const closeScripts = (trimmed.match(/<\/script>/gi) || []).length;
        if (openScripts > closeScripts) return false;

        const openStyles = (trimmed.match(/<style([^>]*)>/gi) || []).length;
        const closeStyles = (trimmed.match(/<\/style>/gi) || []).length;
        if (openStyles > closeStyles) return false;

        // Clean strings and comments to avoid counting characters inside them
        let clean = trimmed
            .replace(/\/\/[^\n]*/g, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/'(?:\\['\\]|[^'\\])*'/g, "''")
            .replace(/"(?:\\"|[^"\\])*"/g, '""')
            .replace(/`(?:\\`|[^`\\])*`/g, '``');

        // Optimized counting using RegExp - much faster than O(N) loop
        const openBraces = (clean.match(/{/g) || []).length;
        const closeBraces = (clean.match(/}/g) || []).length;
        const openParens = (clean.match(/\(/g) || []).length;
        const closeParens = (clean.match(/\)/g) || []).length;
        
        // Minor formatting or minor brace imbalance (difference of <= 1) is allowed and not flagged as warning/syntax issue
        if (Math.abs(openBraces - closeBraces) > 1) return false;
        if (openParens < closeParens || (closeParens - openParens) > 1) return false;

        const lastOpen = trimmed.lastIndexOf('<');
        const lastClose = trimmed.lastIndexOf('>');
        if (lastOpen > lastClose && trimmed.substring(lastOpen).includes('/') && !trimmed.substring(lastOpen).includes('>')) {
            return false;
        }

        return true;
    } catch (e) {
        console.error("Error in checkInputValidity:", e);
        return false;
    }
}

function updateStatus(text, type) {
    if (ui.statusText) ui.statusText.textContent = text;
    const dot = document.querySelector('.status-dot');
    if (dot) {
        dot.className = 'status-dot';
        if (type === 'success') dot.classList.add('green');
        else if (type === 'error') dot.classList.add('red');
        else if (type === 'working') dot.classList.add('working');
        else dot.classList.add('blue');
    }
}

function formatExecutionDuration(rawMs) {
    if (rawMs < 0) rawMs = 0;
    
    // Ignore micro fluctuations by rounding to nearest 10ms for stability
    const roundedMs = Math.round(rawMs / 10) * 10;
    
    if (roundedMs >= 1000) {
        // Return 1 decimal place format: e.g. "1.2s", "2.8s"
        return `${(roundedMs / 1000).toFixed(1)}s`;
    } else {
        // Return clear ms format: e.g. "842ms", "250ms"
        return `${Math.round(rawMs)}ms`;
    }
}

async function parseAiResponseAsync(aiText) {
    // State Reset
    splitData = { 'index.html': '', 'style.css': '', 'app.js': '' };

    let cleanedText = (aiText || "").trim();
    if (!cleanedText) {
        healMissingFiles(cleanedText);
        updateBannerAndStatus(false);
        return;
    }

    // Determine code validity status
    let hasSyntaxIssues = false;
    const originalVal = (ui.input ? ui.input.value : '') || cleanedText;

    if (cleanedText.includes('⚠️ DURUM: HATALI / EKSİK KOD ALGILANDI')) {
        hasSyntaxIssues = true;
    } else if (!checkInputValidity(originalVal)) {
        hasSyntaxIssues = true;
    }

    // Safe extraction: clean status lines and tail short notes to ensure file content is 100% exact copy of original code
    cleanedText = cleanedText
        .replace(/^(✔ DURUM: GEÇERLİ KOD|⚠️ DURUM: HATALI \/ EKSİK KOD ALGILANDI)\s*/gi, '')
        .replace(/\s*(Kod bölme işlemi tamamlandı|Kod bozuk olabilir, dikkatli kontrol edin)\s*$/gi, '')
        .trim();

    try {
        // NON-BLOCKING: break processing up
        await new Promise(resolve => setTimeout(resolve, 30));

        if (ui.terminalLoader) {
            if (ui.loaderStatusText) ui.loaderStatusText.textContent = 'Desen Taraması Başlatıldı...';
            if (ui.loaderSubText) ui.loaderSubText.textContent = 'Giriş kodundaki yapı etiketleri çözümleniyor...';
        }

        // MODE 1: Tagged Format (FILE:, // Dosya:, Markdown etc.)
        const fileHeaderRegex = /(?:^|\n)(?:<!--\s*|(?:\/\*|\/\/|#|###|\*\*)\s*)?(?:FILE:\s*|Dosya:\s*)?(index\.html|style\.css|app\.js)\b(?:\s*\*\/|\s*-->)?(?:\s*:)?/gi;

        let matches = [];
        let match;
        fileHeaderRegex.lastIndex = 0;
        
        // Chunk-based iteration to prevent UI freeze on large documents
        while ((match = fileHeaderRegex.exec(cleanedText)) !== null) {
            matches.push({
                index: match.index,
                length: match[0].length,
                fileName: match[1].toLowerCase().trim()
            });
            if (matches.length % 20 === 0) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }

        if (matches.length > 0) {
            if (ui.terminalLoader) {
                if (ui.loaderStatusText) ui.loaderStatusText.textContent = `${matches.length} Kod Parçası Ayrıştırılıyor...`;
                if (ui.loaderSubText) ui.loaderSubText.textContent = 'Çoklu modül katmanları çıkartılıyor...';
            }

            for (let i = 0; i < matches.length; i++) {
                const current = matches[i];
                const next = matches[i + 1];
                const startContent = current.index + current.length;
                const endContent = next ? next.index : cleanedText.length;
                
                let content = cleanedText.substring(startContent, endContent);
                // Pure markdown wrapper extraction to preserve actual file content exactly
                const mdMatch = content.match(/^\s*```[a-zA-Z0-9-]*\r?\n([\s\S]*?)\r?\n```\s*$/i);
                if (mdMatch) {
                    content = mdMatch[1];
                } else {
                    content = content.replace(/^\s*```[a-zA-Z0-9-]*\r?\n/i, '').replace(/\r?\n```\s*$/i, '');
                }
                
                if (current.fileName === 'index.html' || current.fileName.includes('html')) {
                    splitData['index.html'] = content;
                } else if (current.fileName === 'style.css' || current.fileName.includes('css')) {
                    splitData['style.css'] = content;
                } else if (current.fileName === 'app.js' || current.fileName.includes('js')) {
                    splitData['app.js'] = content;
                }

                if (i % 5 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 15));
                }
            }
            
            // Auto link style and script inside index.html if needed for Mode 1 as well
            if (splitData['index.html']) {
                const hasStyleData = splitData['style.css'] && splitData['style.css'].trim().length > 0;
                const hasJsData = splitData['app.js'] && splitData['app.js'].trim().length > 0;
                splitData['index.html'] = ensureFileLinks(splitData['index.html'], hasStyleData, hasJsData);
            }

            if (splitData['index.html'] || splitData['style.css'] || splitData['app.js']) {
                healMissingFiles(cleanedText);
                updateBannerAndStatus(hasSyntaxIssues);
                return;
            }
        }

        // MODE 2: Smart/Untagged Format Detection
        if (ui.terminalLoader) {
            if (ui.loaderStatusText) ui.loaderStatusText.textContent = 'İçerik Taraması Yapılıyor...';
            if (ui.loaderSubText) ui.loaderSubText.textContent = 'Satır içi HTML yapısı ve etiketler inceleniyor...';
        }
        await new Promise(resolve => setTimeout(resolve, 30));
        
        const hasHtmlTags = /<[a-z/][\s\S]*>/i.test(cleanedText);
        
        if (!hasHtmlTags) {
            const looksLikeCss = (cleanedText.includes('{') && cleanedText.includes('}') && (cleanedText.includes('margin') || cleanedText.includes('padding') || cleanedText.includes('color') || cleanedText.includes('background') || cleanedText.includes('display:')));
            const looksLikeJs = (cleanedText.includes('const ') || cleanedText.includes('let ') || cleanedText.includes('function') || cleanedText.includes('console.') || cleanedText.includes('document.') || cleanedText.includes('=>'));
            
            if (looksLikeCss && !looksLikeJs) {
                splitData['style.css'] = cleanedText;
            } else if (looksLikeJs) {
                splitData['app.js'] = cleanedText;
            } else {
                splitData['index.html'] = cleanedText;
            }
        } else {
            let cssContent = "";
            let stylesExtracted = 0;
            let htmlContent = cleanedText;

            // Extract style content and replace with empty (Strict Split - Do NOT auto-inject CSS links)
            htmlContent = htmlContent.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (match, p1) => {
                cssContent += p1; // Strict match - no trim or altering
                return '';
            });

            // yield style replacement to avoid blocking
            await new Promise(resolve => setTimeout(resolve, 10));

            let jsContent = "";
            
            // Extract inline scripts (ignoring external library loads using src) and replace with empty (Strict Split - Do NOT auto-inject script links)
            htmlContent = htmlContent.replace(/<script([^>]*)>([\s\S]*?)<\/script>/gi, (match, attrs, content) => {
                if (/src\s*=\s*/i.test(attrs)) {
                    // This is an external script tag, keep it as is
                    return match;
                }
                jsContent += content; // Strict match - no trim or altering
                return '';
            });

            // yield script replacement to avoid blocking
            await new Promise(resolve => setTimeout(resolve, 10));

            // STRICT SELF-CHECK: Validate characters strictly match input
            if (cssContent && !cleanedText.replace(/\r/g, '').includes(cssContent.replace(/\r/g, ''))) {
                throw new Error("Çıktı CSS doğrulaması başarısız. Karakter kaybı veya modifikasyon tespit edildi!");
            }
            if (jsContent && !cleanedText.replace(/\r/g, '').includes(jsContent.replace(/\r/g, ''))) {
                throw new Error("Çıktı JS doğrulaması başarısız. Karakter kaybı veya modifikasyon tespit edildi!");
            }

            // Ensure JavaScript and CSS links exist
            const hasStyleData = cssContent.trim().length > 0;
            const hasJsData = jsContent.trim().length > 0;
            htmlContent = ensureFileLinks(htmlContent, hasStyleData, hasJsData);

            splitData['index.html'] = htmlContent;
            splitData['style.css'] = cssContent;
            splitData['app.js'] = jsContent;
        }
    } catch (e) {
        console.error("Smart parsing exception, creating raw fallback:", e);
        splitData['raw.txt'] = cleanedText;
    }

    healMissingFiles(cleanedText);
    updateBannerAndStatus(hasSyntaxIssues);
}

function updateBannerAndStatus(hasSyntaxIssues) {
    const hasHtml = splitData['index.html'] && splitData['index.html'].trim().length > 0;
    const hasCss = splitData['style.css'] && splitData['style.css'].trim().length > 0;
    const hasJs = splitData['app.js'] && splitData['app.js'].trim().length > 0;
    
    let finalStatus = 'SUCCESS';
    // Stability flag computation
    let linking_status = 'stable';
    
    if (!hasHtml && !hasCss && !hasJs) {
        finalStatus = 'ERROR';
        linking_status = 'partial';
    } else if (hasSyntaxIssues) {
        finalStatus = 'WARNING';
        linking_status = 'partial';
    } else if (!hasCss || !hasJs) {
        // Safe Silent Fallback check: if any of CSS or JS was omitted/not generated, it split successfully but is partial.
        linking_status = 'partial';
    }
    
    // Set stability flag on state
    splitData.linking_status = linking_status;
    console.log(`[Stability Flag] Splitting finished. linking_status: ${linking_status}`);

    let bannerMsg = '✔ DURUM: GEÇERLİ KOD | Bağlantı: Kararlı';
    if (finalStatus === 'ERROR') {
        bannerMsg = '❌ DURUM: HATALI KOD VEYA BOŞ DEĞER | Bağlantı: Kısmi';
    } else if (finalStatus === 'WARNING') {
        bannerMsg = '⚠️ DURUM: KISMİ / UYARILI AYRIŞTIRMA | Bağlantı: Kısmi';
    } else if (linking_status === 'partial') {
        bannerMsg = '✔ DURUM: GEÇERLİ KOD | Bağlantı: Kısmi';
    }
    
    // Perform banner UI update
    const banner = document.getElementById('validationStatusBanner');
    if (banner) {
        banner.style.display = 'flex';
        banner.innerHTML = '';
        
        let bannerClass = 'validation-banner valid';
        let iconName = 'check-circle-2';
        
        if (finalStatus === 'WARNING' || (finalStatus === 'SUCCESS' && linking_status === 'partial')) {
            bannerClass = 'validation-banner warning';
            iconName = 'alert-triangle';
        } else if (finalStatus === 'ERROR') {
            bannerClass = 'validation-banner malformed';
            iconName = 'alert-circle';
        }
        
        banner.className = bannerClass;
        
        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', iconName);
        
        const span = document.createElement('span');
        span.textContent = bannerMsg;
        
        banner.appendChild(icon);
        banner.appendChild(span);
        
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }
}

function ensureFileLinks(html, hasCss, hasJs) {
    if (!html) return html;
    let cleanHtml = html;
    
    // 1. Safe Link Validator
    // Only reference truly generated files. Keep references only if files are actually created.
    if (!hasCss) {
        // Clean out any CSS link tag referring to style.css if it doesn't exist
        cleanHtml = cleanHtml.replace(/<link[^>]*href=["']style\.css["'][^>]*>/gi, '');
        cleanHtml = cleanHtml.replace(/<link[^>]*href=style\.css[^>]*>/gi, '');
    } else {
        const hasExistingLink = /href\s*=\s*["']style\.css["']/i.test(cleanHtml) || /href\s*=\s*style\.css/i.test(cleanHtml);
        if (!hasExistingLink) {
            if (cleanHtml.toLowerCase().includes('</head>')) {
                cleanHtml = cleanHtml.replace(/<\/head>/i, '    <link rel="stylesheet" href="style.css">\n</head>');
            } else if (cleanHtml.toLowerCase().includes('<head>')) {
                cleanHtml = cleanHtml.replace(/<head>/i, '<head>\n    <link rel="stylesheet" href="style.css">');
            } else {
                const htmlMatch = cleanHtml.match(/<html[^>]*>/i);
                if (htmlMatch) {
                    cleanHtml = cleanHtml.replace(htmlMatch[0], htmlMatch[0] + '\n<link rel="stylesheet" href="style.css">');
                } else {
                    cleanHtml = '<link rel="stylesheet" href="style.css">\n' + cleanHtml;
                }
            }
        }
    }
    
    if (!hasJs) {
        // Clean out any script referencing app.js if it doesn't exist
        cleanHtml = cleanHtml.replace(/<script[^>]*src=["']app\.js["'][^>]*>\s*<\/script>/gi, '');
        cleanHtml = cleanHtml.replace(/<script[^>]*src=["']app\.js["'][^>]*>/gi, '');
        cleanHtml = cleanHtml.replace(/<script[^>]*src=app\.js[^>]*>\s*<\/script>/gi, '');
        cleanHtml = cleanHtml.replace(/<script[^>]*src=app\.js[^>]*>/gi, '');
    } else {
        const hasExistingScript = /src\s*=\s*["']app\.js["']/i.test(cleanHtml) || /src\s*=\s*app\.js/i.test(cleanHtml);
        if (!hasExistingScript) {
            if (cleanHtml.toLowerCase().includes('</body>')) {
                cleanHtml = cleanHtml.replace(/<\/body>/i, '    <script src="app.js"></script>\n</body>');
            } else if (cleanHtml.toLowerCase().includes('</html>')) {
                cleanHtml = cleanHtml.replace(/<\/html>/i, '    <script src="app.js"></script>\n</html>');
            } else {
                cleanHtml = cleanHtml + '\n<script src="app.js"></script>';
            }
        }
    }
    
    return cleanHtml;
}

function healMissingFiles(rawText) {
    try {
        let hasAtLeastOne = false;
        
        const keys = Object.keys(splitData);
        keys.forEach(key => {
            if (splitData[key] && splitData[key].trim() !== '') {
                hasAtLeastOne = true;
            }
        });

        // SELF-HEALING ENGINE: Only if parsed results are totally empty, preserve raw input in index.html to avoid 100% loss
        if (!hasAtLeastOne && rawText && rawText.trim() !== '') {
            splitData['index.html'] = rawText.trim();
            splitData['raw.txt'] = rawText;
        }

        // STRICT MODE: Do not copy raw input to index.html if some files are already successfully split.
        if (!splitData['index.html']) {
            splitData['index.html'] = '';
        }

        if (!splitData['style.css']) {
            splitData['style.css'] = '';
        }

        if (!splitData['app.js']) {
            splitData['app.js'] = '';
        }
    } catch (err) {
        console.error("Error in healMissingFiles:", err);
        if (!splitData) {
            splitData = { 'index.html': rawText || '', 'style.css': '', 'app.js': '' };
        } else {
            splitData['index.html'] = splitData['index.html'] || '';
            splitData['style.css'] = splitData['style.css'] || '';
            splitData['app.js'] = splitData['app.js'] || '';
        }
    }
}

function escapeHtml(text) {
    if (!text) return "";
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function switchToTab(fileName, btn) {
    try {
        if (!btn && ui.tabBtns) {
            btn = Array.from(ui.tabBtns).find(b => {
                const key = b.dataset.file === 'html' ? 'index.html' : 
                           b.dataset.file === 'css' ? 'style.css' : 'app.js';
                return key === fileName;
            });
        }

        if (ui.tabBtns) {
            ui.tabBtns.forEach(b => b.classList.remove('active'));
        }
        if (btn) {
            btn.classList.add('active');
        }
        
        if (ui.fileName) {
            ui.fileName.textContent = fileName;
        }
        const content = splitData[fileName];
        if (ui.codeArea) {
            ui.codeArea.textContent = content || 'Bu dosya için içerik bulunamadı.';
        }
    } catch (e) {
        console.error("Error in switchToTab:", e);
    }
}

async function downloadAsZip(customName = "") {
    try {
        if (typeof JSZip === 'undefined') {
            throw new Error('JSZip kütüphanesi yüklenemedi. Lütfen internet bağlantınızı kontrol edip tekrar deneyin.');
        }

        // Guard against empty zip content: run self-healing engine on empty splitData assets
        let hasContents = Object.keys(splitData).some(key => splitData[key] && splitData[key].trim() !== '');
        if (!hasContents) {
            const currentInputValue = ui.input ? ui.input.value.trim() : "";
            if (currentInputValue !== "") {
                healMissingFiles(currentInputValue);
            } else {
                throw new Error('Dosya içeriği bulunamadı. Lütfen önce geçerli bir proje kodu ayrıştırın.');
            }
        }

        const activeFiles = Object.keys(splitData).filter(key => splitData[key] && splitData[key].trim() !== '');
        if (activeFiles.length === 0) {
            throw new Error('Ayrıştırılmış dosya kümesi boş. Lütfen önce bir proje kodu ayrıştırın.');
        }

        const zip = new JSZip();
        // Use custom name or safe default folders inside the ZIP
        let cleanFolderName = (customName || "").trim().replace(/[^a-zA-Z0-9-_]/g, '');
        if (!cleanFolderName) cleanFolderName = "ai-kod-projesi";
        const folder = zip.folder(cleanFolderName);
        
        activeFiles.forEach(key => {
            folder.file(key, splitData[key] || "");
        });

        const content = await zip.generateAsync({type:"blob"});
        const link = document.createElement("a");
        link.href = URL.createObjectURL(content);
        
        let downloadName = "";
        if (customName && customName.trim() !== '') {
            downloadName = `${customName.trim().replace(/[^a-zA-Z0-9-_]/g, '')}.zip`;
        } else {
            const date = new Date().toISOString().slice(0, 10);
            downloadName = `kod-projesi-${date}.zip`;
        }
        
        link.download = downloadName;
        link.click();
        
        // Success feedbacks
        updateStatus('ZIP İndirildi', 'success');
        showToast('Proje başarıyla paketlendi ve indirildi!', 'success');
    } catch (err) {
        console.error("ZIP indirme hatası:", err);
        updateStatus('Hata: ZIP oluşturulamadı', 'error');
        showToast(`İndirme Başarısız: ${err.message || 'Bilinmeyen bir hata oluştu'}`, 'error');
    }
}

function saveToHistory(code) {
    try {
        const item = {
            id: Date.now(),
            date: new Date().toLocaleString('tr-TR'),
            preview: (code || "").replace(/<[^>]*>/g, '').substring(0, 50).trim() || 'Kod Bloğu',
            code: code
        };
        projectHistory.unshift(item);
        if (projectHistory.length > 20) projectHistory.pop();
        localStorage.setItem('split_history_v62pro', JSON.stringify(projectHistory));
        renderHistory();
    } catch (e) {
        console.error("Failed to save split action to history:", e);
    }
}

function renderHistory() {
    if (!ui.historyList) return;
    ui.historyList.innerHTML = '';
    if (projectHistory.length === 0) {
        ui.historyList.innerHTML = '<p style="text-align:center; padding: 2rem; color: #94A3B8;">Henüz işlem yapılmadı.</p>';
        return;
    }

    projectHistory.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.25rem;">
                <h4 style="font-size: 0.9rem; font-weight: 700; color:var(--text-primary);">${escapeHtml(item.preview)}...</h4>
                <span style="font-size: 0.7rem; color: var(--text-muted);">${item.date}</span>
            </div>
            <p style="font-size: 0.75rem; color: var(--text-secondary);">ID: ${item.id}</p>
        `;
        div.onclick = () => {
            allowInputWrite = true;
            if (ui.input) {
                ui.input.value = item.code;
            }
            allowInputWrite = false;
            performAiSplit();
            closeModal();
        };
        ui.historyList.appendChild(div);
    });
}

// Single File Drag & Drop Integration Handlers
function readAndProcessUploadedFile(file) {
    if (!file) return;
    try {
        const filename = file.name;
        const allowedExtensions = ['.js', '.ts', '.json', '.txt', '.html', '.css', '.zip'];
        const extIndex = filename.lastIndexOf(".");
        const ext = extIndex !== -1 ? filename.slice(extIndex).toLowerCase() : "";
        
        if (ext === '.zip') {
            showToast('Güncelleme paketi (.zip) algılandı, Sistem Güncelleyici açılıyor...', 'info');
            openModal('updateEngine');
            if (typeof handleUpdateZipFile === 'function') {
                handleUpdateZipFile(file);
            }
            return;
        }
        
        if (!allowedExtensions.includes(ext) && ext !== '.zip') {
            showToast('Sadece .js, .ts, .json veya .txt dosyaları yüklenebilir.', 'warning');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                if (evt.target && evt.target.result !== undefined) {
                    handleFileUpload(filename, evt.target.result);
                }
            } catch (err) {
                console.error("Reader load callback error:", err);
                showToast('Yüklenen dosya içeriği çözümlenemedi.', 'error');
            }
        };
        reader.onerror = function() {
            showToast('Dosya okunurken bir hata oluştu.', 'error');
        };
        reader.readAsText(file);
    } catch (e) {
        console.error("Error in readAndProcessUploadedFile:", e);
        showToast('Dosya okunurken beklenmeyen hata oluştu.', 'error');
    }
}

async function handleFileUpload(filename, content, overwrite = false) {
    try {
        updateStatus('Dosya Yükleniyor...', 'working');
        const response = await fetch('/api/upload-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, content, overwrite })
        });
        
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `Bağlantı Hatası: ${response.status}`);
        }

        const data = await response.json();
        
        if (data.exists) {
            const confirmMsgEl = document.getElementById('confirmMessage');
            if (confirmMsgEl) {
                confirmMsgEl.textContent = `"${filename}" adında bir dosya sistemde zaten mevcut. Bu dosyanın üzerine yazıp içeriği güncellemek istiyor musunuz?`;
            }
            openModal('confirmUpload');
            
            const confirmBtn = document.getElementById('confirmUploadBtn');
            const cancelBtn = document.getElementById('cancelUploadBtn');
            const closeBtn = document.getElementById('closeConfirmBtn');
            
            const handleConfirm = async () => {
                closeModal();
                cleanupListeners();
                await handleFileUpload(filename, content, true);
            };
            
            const handleCancel = () => {
                closeModal();
                cleanupListeners();
                updateStatus('İşlem İptal Edildi', 'blue');
            };
            
            function cleanupListeners() {
                if (confirmBtn) confirmBtn.removeEventListener('click', handleConfirm);
                if (cancelBtn) cancelBtn.removeEventListener('click', handleCancel);
                if (closeBtn) closeBtn.removeEventListener('click', handleCancel);
            }
            
            if (confirmBtn) confirmBtn.addEventListener('click', handleConfirm);
            if (cancelBtn) cancelBtn.addEventListener('click', handleCancel);
            if (closeBtn) closeBtn.addEventListener('click', handleCancel);
            return;
        }

        if (data.success) {
            const actionText = data.action === 'created' ? 'oluşturuldu' : 'güncellendi';
            const actionTitle = data.action === 'created' ? 'Dosya Oluşturuldu' : 'Dosya Güncellendi';
            
            updateStatus(`Dosya ${data.action === 'created' ? 'Oluşturuldu' : 'Güncellendi'}`, 'success');
            showToast(`"${filename}" başarıyla ${actionText}!`, 'success');
            
            if (ui.lastActionText) {
                ui.lastActionText.textContent = `Yüklendi: ${filename} (${data.action === 'created' ? 'Yeni' : 'Üzerine Yazıldı'})`;
            }

            const lowerName = filename.toLowerCase();
            if (lowerName === 'index.html' || lowerName === 'style.css' || lowerName === 'app.js') {
                splitData[lowerName] = content;
                switchToTab(lowerName);
                
                const count = Object.keys(splitData).filter(key => splitData[key] && splitData[key].trim() !== '').length;
                if (ui.fileCountText) {
                    ui.fileCountText.textContent = `${count} Dosya Üretildi`;
                }
            }
        }
    } catch (err) {
        console.error('File upload error:', err);
        updateStatus('Yükleme Hatası', 'error');
        showToast(`Yükleme başarısız oldu: ${err.message || err}`, 'error');
    }
}

// ==========================================
// V7PRO SAFE UPDATE ENGINE CLIENT SIDE
// ==========================================

let currentStagedFiles = [];

function initUpdateEngine() {
    const trigger = document.getElementById('updateEngineTrigger');
    const closeBtn = document.getElementById('closeUpdateEngineBtn');
    const manualBackupBtn = document.getElementById('createManualBackupBtn');
    const instantRollbackBtn = document.getElementById('instantRollbackBtn');
    const zipDropZone = document.getElementById('updateZipDropZone');
    const zipUploadInput = document.getElementById('updateZipUploadInput');
    const applyBtn = document.getElementById('applyUpdatesBtn');

    if (trigger) {
        trigger.addEventListener('click', () => openModal('updateEngine'));
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }

    if (manualBackupBtn) {
        manualBackupBtn.addEventListener('click', createManualBackup);
    }

    if (instantRollbackBtn) {
        instantRollbackBtn.addEventListener('click', () => triggerRollback(null));
    }

    if (zipDropZone && zipUploadInput) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evName => {
            zipDropZone.addEventListener(evName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        ['dragenter', 'dragover'].forEach(evName => {
            zipDropZone.addEventListener(evName, () => {
                zipDropZone.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(evName => {
            zipDropZone.addEventListener(evName, () => {
                zipDropZone.classList.remove('dragover');
            }, false);
        });

        zipDropZone.addEventListener('click', () => {
            zipUploadInput.click();
        });

        zipDropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files && files.length > 0) {
                handleUpdateZipFile(files[0]);
            }
        });

        zipUploadInput.addEventListener('change', (e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
                handleUpdateZipFile(files[0]);
                zipUploadInput.value = '';
            }
        });
    }

    if (applyBtn) {
        applyBtn.addEventListener('click', applySelectedUpdates);
    }

    console.log("v1.0.1 test update loaded");
    addUpdateLog('Safe Update Engine V7PRO v1.0.1 has been fully loaded. [Update test active]', 'info');
}

async function handleUpdateZipFile(file) {
    if (!file) return;
    
    // 4. KULLANICIYA NET YÖNLENDİRME (User guidance logs)
    addUpdateLog("============== ZIP GÜNCELLEME REHBERİ ==============");
    addUpdateLog("Bu güncelleme için seçmeniz gereken dosyalar: index.html, app.js, style.css, metadata.json, src/ (modüller)");
    addUpdateLog("Seçmemeniz gereken dosyalar: node_modules/, dist/, .git/, package-lock.json, vite cache, build klasörleri, geçici dosyalar (.DS_Store vb.)");
    addUpdateLog("======================================================");
    
    addUpdateLog(`Paket yükleniyor: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
    
    try {
        const arrayBuffer = await file.arrayBuffer();
        if (typeof JSZip === 'undefined') {
            throw new Error("JSZip kitaplığı bulunamadı. Lütfen internet bağlantınızı kontrol edin.");
        }
        const zip = await JSZip.loadAsync(arrayBuffer);
        
        const stagedFiles = [];
        const entries = [];
        
        zip.forEach((relativePath, zipEntry) => {
            if (!zipEntry.dir) {
                entries.push({ relativePath, zipEntry });
            }
        });

        // 3. AKILLI DOSYA FİLTRELEME: Strip single common top-level directory if present inside the zip files
        let commonPrefix = "";
        const filePaths = entries.map(e => e.relativePath);
        if (filePaths.length > 0) {
            const firstPath = filePaths[0];
            const firstParts = firstPath.split('/');
            if (firstParts.length > 1) {
                const testPrefix = firstParts[0] + '/';
                const hasRoot = filePaths.every(p => p.startsWith(testPrefix));
                if (hasRoot) {
                    commonPrefix = testPrefix;
                }
            }
        }
        
        const allowedExtensions = ['.html', '.css', '.js', '.json', '.svg', '.png', '.jpg'];
        
        for (let i = 0; i < entries.length; i++) {
            const { relativePath, zipEntry } = entries[i];
            
            // Normalize path separator and strip common directory
            const cleanRelativePath = relativePath.replace(/\\/g, '/');
            const logicalPath = commonPrefix ? cleanRelativePath.substring(commonPrefix.length) : cleanRelativePath;
            const pathParts = logicalPath.split('/');
            const baseName = pathParts.pop();
            
            // 2. ASLA EKLENMEMESİ GEREKEN DOSYALAR (Forbidden Check)
            const isForbidden = pathParts.some(part => {
                const lpart = part.toLowerCase();
                return (
                    lpart === 'node_modules' ||
                    lpart === 'dist' ||
                    lpart === '.git' ||
                    lpart === 'build' ||
                    lpart === 'out' ||
                    lpart === '.vite' ||
                    lpart === '.cache' ||
                    lpart === '__macosx' ||
                    lpart.startsWith('.') ||
                    lpart === 'package-lock.json'
                );
            }) || baseName.startsWith('.') || baseName === 'package-lock.json' || baseName.toLowerCase() === 'thumbs.db';
            
            if (isForbidden) {
                addUpdateLog(`Yoksayılan dosya (Gereksiz / Yasaklı): ${relativePath}`, 'warning');
                continue;
            }
            
            // 1. GÜNCELLEME DOSYA LİSTESİ OLUŞTUR (Allowed Check)
            const ext = '.' + baseName.split('.').pop().toLowerCase();
            const lowerLogical = logicalPath.toLowerCase();
            const isRootFile = ['index.html', 'app.js', 'style.css', 'metadata.json'].includes(lowerLogical);
            const isSrcFile = lowerLogical.startsWith('src/') && allowedExtensions.includes(ext);
            
            if (!isRootFile && !isSrcFile) {
                addUpdateLog(`Yoksayılan dosya (Paket dışı / Yapılandırma): ${relativePath}`, 'warning');
                continue;
            }
            
            // 5. ASENKRON ÇALIŞMA: Yield execution back to UI thread to prevent screen freezing
            if (i % 5 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            
            try {
                const content = await zipEntry.async("string");
                stagedFiles.push({
                    filename: logicalPath, // Write logical path without top-level prefix folder
                    content: content,
                    size: content.length
                });
            } catch (entryErr) {
                console.error(`Error reading entry metadata ${relativePath}:`, entryErr);
                addUpdateLog(`Hata: ${relativePath} okunamadı, atlanıyor.`, 'warning');
            }
        }
        
        // 5. STABİLİTE ODAKLI: Warn if critical files are missing
        const hasHtml = stagedFiles.some(f => f.filename.toLowerCase() === 'index.html');
        const hasJs = stagedFiles.some(f => f.filename.toLowerCase() === 'app.js');
        const hasCss = stagedFiles.some(f => f.filename.toLowerCase() === 'style.css');
        
        if (stagedFiles.length === 0) {
            addUpdateLog("HATA: Güncelleme paketinde yüklenebilecek hiçbir geçerli dosya bulunamadı!", "error");
            showToast("Geçerli dosya bulunamadı.", "error");
            return;
        }

        if (!hasHtml) {
            addUpdateLog("UYARI: Kritik dosya 'index.html' güncelleme paketinde bulunamadı!", "warning");
        }
        if (!hasJs) {
            addUpdateLog("UYARI: Kritik dosya 'app.js' güncelleme paketinde bulunamadı!", "warning");
        }
        if (!hasCss) {
            addUpdateLog("UYARI: Kritik dosya 'style.css' güncelleme paketinde bulunamadı!", "warning");
        }
        
        addUpdateLog(`Güncelleme paketi başarıyla çözüldü! Geçerli dosya sayısı: ${stagedFiles.length}`, 'info');
        
        // Render to view
        renderStagedFiles(stagedFiles);
    } catch (err) {
        console.error("ZIP processing error:", err);
        addUpdateLog(`HATA: Güncelleme paketi çözümlenemedi! ${err.message}`, 'error');
        showToast("ZIP güncelleme paketi çözülemedi.", "error");
    }
}

function renderStagedFiles(files) {
    currentStagedFiles = files;
    const listEl = document.getElementById('stagedFilesList');
    const containerEl = document.getElementById('changesPreviewContainer');
    const countEl = document.getElementById('stagedFilesCount');
    const warningEl = document.getElementById('systemWarningBadge');
    const protectEl = document.getElementById('systemProtectionSection');
    const applyBtn = document.getElementById('applyUpdatesBtn');
    
    if (!listEl || !containerEl) return;
    
    listEl.innerHTML = '';
    countEl.textContent = files.length;
    containerEl.style.display = 'block';
    
    let hasSystemFiles = false;
    const systemFiles = ['app.js', 'server.ts', 'index.html', 'package.json', 'tsconfig.json', 'vite.config.ts'];
    
    files.forEach((file, index) => {
        const baseName = file.filename.split('/').pop().toLowerCase();
        const isSystem = systemFiles.includes(baseName);
        if (isSystem) hasSystemFiles = true;
        
        const fileDiv = document.createElement('div');
        fileDiv.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 0.5rem 0.75rem; border-radius: 4px; background: var(--bg-app); border: 1px solid var(--border-soft); font-size: 0.78rem;";
        
        const badgeStyle = isSystem 
            ? "background: rgba(239, 68, 68, 0.1); color: var(--error); border: 1px solid rgba(239, 68, 68, 0.15);" 
            : "background: rgba(16, 185, 129, 0.1); color: #10B981; border: 1px solid rgba(16, 185, 129, 0.15);";
        const badgeText = isSystem ? "SİSTEM DOSYASI" : "PROJE DOSYASI";
        
        fileDiv.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.5rem; max-width: 65%;">
                <input type="checkbox" class="update-file-checkbox" data-index="${index}" ${isSystem ? 'disabled' : 'checked'} style="cursor: pointer;" />
                <span style="font-family: 'JetBrains Mono', monospace; font-weight: 600; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${file.filename}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 0.5rem;">
                <span style="font-size: 0.7rem; color: var(--text-muted); font-family: 'JetBrains Mono';">${(file.size / 1024).toFixed(1)} KB</span>
                <span style="font-size: 0.65rem; font-weight: 700; padding: 2px 6px; border-radius: 4px; ${badgeStyle}">${badgeText}</span>
            </div>
        `;
        listEl.appendChild(fileDiv);
    });
    
    if (hasSystemFiles) {
        warningEl.style.display = 'inline-block';
        protectEl.style.display = 'flex';
        const allowToggle = document.getElementById('allowSystemUpdateToggle');
        if (allowToggle) allowToggle.checked = false;
    } else {
        warningEl.style.display = 'none';
        protectEl.style.display = 'none';
    }
    
    const checkboxes = listEl.querySelectorAll('.update-file-checkbox');
    const allowToggle = document.getElementById('allowSystemUpdateToggle');
    
    const reevaluate = () => {
        let anyChecked = false;
        const systemOverridingAllowed = allowToggle ? allowToggle.checked : false;
        
        checkboxes.forEach(cb => {
            const idx = parseInt(cb.dataset.index);
            const file = files[idx];
            const baseName = file.filename.split('/').pop().toLowerCase();
            if (systemFiles.includes(baseName)) {
                cb.disabled = !systemOverridingAllowed;
                if (!systemOverridingAllowed) {
                    cb.checked = false;
                }
            }
            if (cb.checked) {
                anyChecked = true;
            }
        });
        
        applyBtn.disabled = !anyChecked;
    };
    
    checkboxes.forEach(cb => cb.addEventListener('change', reevaluate));
    if (allowToggle) allowToggle.addEventListener('change', reevaluate);
    
    reevaluate();
}

async function applySelectedUpdates() {
    const listEl = document.getElementById('stagedFilesList');
    if (!listEl) return;
    const checkboxes = listEl.querySelectorAll('.update-file-checkbox');
    const allowToggle = document.getElementById('allowSystemUpdateToggle');
    const applyBtn = document.getElementById('applyUpdatesBtn');
    
    const selectedFiles = [];
    checkboxes.forEach(cb => {
        if (cb.checked) {
            const idx = parseInt(cb.dataset.index);
            selectedFiles.push(currentStagedFiles[idx]);
        }
    });
    
    if (selectedFiles.length === 0) {
        showToast("Lütfen güncellenecek en az bir dosya seçin.", "warning");
        return;
    }
    
    // Strict client-side pre-flight verification
    const allowedExtensions = ['.html', '.css', '.js', '.json', '.svg', '.png', '.jpg'];
    let selectionError = false;
    
    for (const f of selectedFiles) {
        const cleanPath = f.filename.replace(/\\/g, '/');
        const parts = cleanPath.split('/');
        const baseName = parts.pop();
        
        const isForbidden = parts.some(part => {
            const lpart = part.toLowerCase();
            return (
                lpart === 'node_modules' ||
                lpart === 'dist' ||
                lpart === '.git' ||
                lpart === 'build' ||
                lpart === 'out' ||
                lpart === '.vite' ||
                lpart === '.cache' ||
                lpart === '__macosx' ||
                lpart.startsWith('.') ||
                lpart === 'package-lock.json'
            );
        }) || baseName.startsWith('.') || baseName === 'package-lock.json';

        if (isForbidden) {
            selectionError = true;
            addUpdateLog(`HATA: Filtreleme aşılmış yasaklı dosya tespiti: ${f.filename}`, 'error');
            break;
        }

        const ext = '.' + baseName.split('.').pop().toLowerCase();
        const lowerLogical = cleanPath.toLowerCase();
        const isRootFile = ['index.html', 'app.js', 'style.css', 'metadata.json'].includes(lowerLogical);
        const isSrcFile = lowerLogical.startsWith('src/') && allowedExtensions.includes(ext);

        if (!isRootFile && !isSrcFile) {
            selectionError = true;
            addUpdateLog(`HATA: Seçilen dosya izin verilen güncelleme listesinde değil: ${f.filename}`, 'error');
            break;
        }
    }

    if (selectionError) {
        showToast("HATA: Güvenli olmayan veya izin verilmeyen dosya seçimi nedeniyle güncelleme engellendi!", "error");
        return;
    }
    
    const confirmMsg = `${selectedFiles.length} dosyayı sisteme uygulamak istiyor musunuz? Geriye dönüş için otomatik sistem yedeği alınacaktır.`;
    if (!window.confirm(confirmMsg)) return;

    applyBtn.disabled = true;
    
    const progressWrapper = document.getElementById('updateProgressWrapper');
    const progressBar = document.getElementById('updateProgressBar');
    const progressPercent = document.getElementById('updateProgressPercent');
    const progressStatus = document.getElementById('updateProgressStatusText');
    
    progressWrapper.style.display = 'flex';
    progressBar.style.width = '0%';
    progressPercent.textContent = '0%';
    
    const steps = [
        { progress: 20, status: "Bütünlük doğrulanıyor..." },
        { progress: 40, status: "Otomatik sistem yedeği alınıyor..." },
        { progress: 75, status: "Dosyalar üzerine yazılıyor..." },
        { progress: 100, status: "Sistem başarıyla güncellendi!" }
    ];
    
    const runProgressStep = (index) => {
        return new Promise(resolve => {
            setTimeout(() => {
                progressBar.style.width = `${steps[index].progress}%`;
                progressPercent.textContent = `${steps[index].progress}%`;
                progressStatus.textContent = steps[index].status;
                addUpdateLog(steps[index].status, 'info');
                resolve();
            }, 500);
        });
    };
    
    try {
        await runProgressStep(0);
        await runProgressStep(1);
        
        const forceSystemUpdate = allowToggle ? allowToggle.checked : false;
        
        const payload = {
            files: selectedFiles.map(f => ({ filename: f.filename, content: f.content })),
            forceSystemUpdate: forceSystemUpdate
        };
        
        const response = await fetch('/api/update-apply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `Güncelleme Hatası: ${response.status}`);
        }
        
        await runProgressStep(2);
        await runProgressStep(3);
        
        showToast("Sistem güncellemesi başarıyla uygulandı!", "success");
        addUpdateLog(`Sistem başarıyla güncellendi! Değişen dosyalar: ${selectedFiles.map(f => f.filename).join(', ')}`, 'info');
        
        // Refresh local files split representation if applicable
        selectedFiles.forEach(file => {
            const lowerName = file.filename.toLowerCase();
            if (lowerName === 'index.html' || lowerName === 'style.css' || lowerName === 'app.js') {
                splitData[lowerName] = file.content;
            }
        });
        
        loadUpdateEngineHistory();
        
        setTimeout(() => {
            const containerEl = document.getElementById('changesPreviewContainer');
            if (containerEl) containerEl.style.display = 'none';
            progressWrapper.style.display = 'none';
            
            // If any critical system file was updated, perform a soft refresh to run new code cleanly!
            const systemFiles = ['app.js', 'server.ts', 'index.html', 'package.json', 'style.css'];
            const containsSystemFile = selectedFiles.some(f => systemFiles.includes(f.filename.toLowerCase()));
            if (containsSystemFile) {
                showToast("Sistem dosyaları değişti, sayfa yeniden yükleniyor...", "info");
                setTimeout(() => window.location.reload(), 1200);
            }
        }, 1200);
        
    } catch (err) {
        console.error("Apply update error:", err);
        showToast(`Sistem güncellenemedi: ${err.message}`, "error");
        addUpdateLog(`HATA: Güncelleme durduruldu! ${err.message}`, 'error');
        
        progressBar.style.background = 'var(--error)';
        progressStatus.textContent = "Hata! Değişiklikler geri alınıyor...";
        applyBtn.disabled = false;
        
        setTimeout(() => {
            if (progressWrapper) progressWrapper.style.display = 'none';
            if (progressBar) progressBar.style.background = '';
        }, 4000);
    }
}

async function triggerRollback(backupId = null) {
    const confirmMsg = backupId 
        ? `Sistemi '${backupId}' nolu yedekleme noktasına geri yüklemek istiyor musunuz? Mevcut tüm dosyalar değişecektir.`
        : `Sistemi son kararlı duruma geri yüklemek istiyor musunuz?`;
        
    if (!window.confirm(confirmMsg)) return;
    
    addUpdateLog(`[ROLLBACK] Geri yükleme tetiklendi: ${backupId || 'Son Başarılı Yedek'}`, 'info');
    
    try {
        const response = await fetch('/api/update-rollback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ backupId })
        });
        
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `Rollback Hatası: ${response.status}`);
        }
        
        const rData = await response.json();
        showToast(rData.message || "Geri yükleme başarıyla uygulandı!", "success");
        addUpdateLog(`BAŞARILI: Geri yükleme tamamlandı.`, 'info');
        
        loadUpdateEngineHistory();
        
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    } catch (err) {
        console.error("Rollback error:", err);
        showToast(`Geri yükleme başarısız oldu: ${err.message}`, "error");
        addUpdateLog(`ROLLBACK HATASI: ${err.message}`, 'error');
    }
}

async function createManualBackup() {
    const description = prompt("Sistem yedeği için açıklama girin:", "Manuel Güvenli Yedek Noktası");
    if (description === null) return;
    
    addUpdateLog('Güvenlik yedeği oluşturuluyor...', 'info');
    try {
        const response = await fetch('/api/update-backup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description })
        });
        
        if (!response.ok) throw new Error("Yedekleme hatası");
        const data = await response.json();
        
        showToast(`"${data.backupId}" adıyla yeni bir yedekleme noktası oluşturuldu.`, "success");
        addUpdateLog(`Manuel yedekleme başarılı: ${data.backupId}`, 'info');
        loadUpdateEngineHistory();
    } catch (err) {
        console.error("Manual backup error:", err);
        showToast(`Yedekleme başarısız oldu: ${err.message}`, "error");
        addUpdateLog(`HATA: Manuel yedekleme başarısız!`, 'error');
    }
}

async function loadUpdateEngineHistory() {
    const listEl = document.getElementById('backupNodesList');
    if (!listEl) return;
    
    try {
        const response = await fetch('/api/update-history');
        if (!response.ok) throw new Error("Tarihçe sunucudan alınamadı.");
        
        const data = await response.json();
        listEl.innerHTML = '';
        
        if (!data.backups || data.backups.length === 0) {
            listEl.innerHTML = `
                <div style="text-align: center; padding: 1.5rem; font-size: 0.8rem; color: var(--text-muted); background: var(--bg-app); border: 1px dashed var(--border); border-radius: var(--radius-sm); width: 100%;">
                    Henüz kayıtlı bir sistem yedeği bulunmuyor.
                </div>
            `;
        } else {
            data.backups.forEach(backup => {
                const dateStr = new Date(backup.timestamp).toLocaleString('tr-TR');
                const backupDiv = document.createElement('div');
                backupDiv.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 0.65rem 0.85rem; border-radius: var(--radius-sm); background: var(--bg-card); border: 1px solid var(--border-soft); font-size: 0.78rem; gap: 0.5rem; width: 100%;";
                
                backupDiv.innerHTML = `
                    <div style="display: flex; flex-direction: column; gap: 2px; max-width: 70%; text-align: left;">
                        <span style="font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 0.35rem;">
                            <i data-lucide="shield" style="width: 13px; height: 13px; color: var(--accent);"></i>
                            ${escapeHtml(backup.description || 'Güvenli Yedek Noktası')}
                        </span>
                        <span style="font-size: 0.7rem; color: var(--text-muted); font-family: 'JetBrains Mono';">${backup.id} — ${dateStr}</span>
                    </div>
                    <button class="restore-backup-btn btn-success" data-id="${backup.id}" style="font-size: 0.72rem; padding: 0.35rem 0.65rem; border-radius: 4px; height: auto; font-weight: 600; cursor: pointer;">
                        <i data-lucide="rotate-ccw" style="width: 12px; height: 12px;"></i> Geri Yükle
                    </button>
                `;
                listEl.appendChild(backupDiv);
            });
            
            listEl.querySelectorAll('.restore-backup-btn').forEach(btn => {
                btn.addEventListener('click', () => triggerRollback(btn.dataset.id));
            });
            
            if (window.lucide) {
                window.lucide.createIcons();
            }
        }
        
        const termEl = document.getElementById('updateLogsTerminal');
        if (termEl && data.logs && data.logs.length > 0) {
            let logHTML = '';
            data.logs.slice(0, 15).forEach(log => {
                const dateObj = new Date(log.timestamp);
                const clockStr = dateObj.toLocaleTimeString('tr-TR');
                const badge = log.action === 'ROLLBACK_APPLIED' ? '[ROLLBACK]' : '[GÜNCELLEME]';
                logHTML += `[${clockStr}] ${badge} ${log.description}\n`;
            });
            termEl.innerHTML = logHTML;
        }
    } catch (err) {
        console.error("History loading failure", err);
        listEl.innerHTML = `
            <div style="text-align: center; padding: 1.5rem; font-size: 0.8rem; color: var(--error); background: rgba(239, 68, 68, 0.03); border: 1px dashed rgba(239, 68, 68, 0.15); border-radius: var(--radius-sm); width: 100%;">
                Yedek listesi okunamadı.
            </div>
        `;
    }
}

function addUpdateLog(message, type = 'info') {
    const termEl = document.getElementById('updateLogsTerminal');
    if (!termEl) return;
    const timeStr = new Date().toLocaleTimeString('tr-TR');
    const prefix = type === 'error' ? ' [HATA]' : ' [INFO]';
    termEl.innerHTML = `[${timeStr}]${prefix} ${message}\n` + termEl.innerHTML;
}

