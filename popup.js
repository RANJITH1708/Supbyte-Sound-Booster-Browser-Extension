// popup.js

let container, mainContent, settingsContent, errorContainer, volumeSlider, volumeLevel, restoreVolumeBtn, presetButtons, speakerDropdown, monoToggle, audioHubContainer, messageContainer, themeToggleBtn, helpBtn, settingsToggleBtn, backToMainBtn, helpModal, closeModalBtn, saveSpeakerBtn, saveSiteProfileBtn, customizeEqBtn, volumeWarningLine, deviceSafetyMessage, scrollAdjustToggle, deviceSafetyToggle, analyzerToggle, refreshSpeakersBtn, advancedSliders = [];


let currentTab = null;
let settingsStorageKey = 'settings_global_default';
let userPresets = [];
let warningTimeout;
let deviceChangeTimeout;
let volumeUpdateTimer = null;

const ICONS = { themeLight: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`, themeDark: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>` };
const DEFAULT_SETTINGS = { volume: 100, preset: 'flat', equalizer: { algorithm: 'highpass', frequency: 0, q: 1, gain: 0 } };
const STOCK_PRESETS_VALUES = { 'normal': [0, 0, 0, 0, 0], 'bass_boost': [8, 4, -2, 1, 3], 'vocal_boost': [-2, 1, 5, 4, 1], 'treble_boost': [-3, -1, 2, 5, 6], 'movie_mode': [6, 3, 1, 4, 7], 'clarity': [-1, 2, 3, 2, -2] };
const STOCK_PRESETS_META = { 'normal': { name: 'Normal' }, 'bass_boost': { name: 'Bass Boost' }, 'vocal_boost': { name: 'Vocal Boost' }, 'treble_boost': { name: 'Treble Boost' }, 'movie_mode': { name: 'Movie Mode' }, 'clarity': { name: 'Clarity' } };
const EQUALIZER_PRESETS = { flat: { algorithm: 'highpass', frequency: 0, q: 1, gain: 0 }, voice: { algorithm: 'peaking', frequency: 1500, q: 1, gain: 12 }, bass: { algorithm: 'lowshelf', frequency: 350, q: 1, gain: 6 }, treble: { algorithm: 'highshelf', frequency: 4000, q: 1, gain: 8 } };

// --- Sound Booster Style Audio Analyzer ---
let analyzerContainer, canvasBefore, canvasAfter, beforeFreqEnd, afterFreqEnd, analyzerInterval = null;

function initAnalyzerElements() {
    analyzerContainer = document.getElementById('audio-analyzer-container');
    canvasBefore = document.getElementById('analyzer-before');
    canvasAfter = document.getElementById('analyzer-after');
    beforeFreqEnd = document.getElementById('before-freq-end');
    afterFreqEnd = document.getElementById('after-freq-end');
}

async function initAudioAnalyzer() {
    if (!analyzerContainer || !analyzerToggle || !analyzerToggle.checked) {
        if (analyzerContainer) {
            analyzerContainer.style.display = 'none';
            analyzerContainer.style.height = '0';
            analyzerContainer.style.overflow = 'hidden';
            analyzerContainer.style.margin = '0';
            analyzerContainer.style.padding = '0';
        }
        return;
    }

    analyzerContainer.style.display = 'block';

    // Initialize canvas contexts
    const ctxBefore = canvasBefore.getContext('2d');
    const ctxAfter = canvasAfter.getContext('2d');

    // Set canvas dimensions
    canvasBefore.width = 280;
    canvasBefore.height = 60;
    canvasAfter.width = 280;
    canvasAfter.height = 60;

    // Start analyzer loop
    startAnalyzerLoop(ctxBefore, ctxAfter);
}

function startAnalyzerLoop(ctxBefore, ctxAfter) {
    // Stop any existing loop
    if (analyzerInterval) {
        clearInterval(analyzerInterval);
    }

    analyzerInterval = setInterval(async () => {
        try {
            // Request "before" analyzer data
            const beforeData = await chrome.runtime.sendMessage({
                target: 'offscreen',
                type: 'GET_AUDIO_DATA',
                tabId: currentTab.id,
                analyserType: 'before'
            });

            // Request "after" analyzer data
            const afterData = await chrome.runtime.sendMessage({
                target: 'offscreen',
                type: 'GET_AUDIO_DATA',
                tabId: currentTab.id,
                analyserType: 'after'
            });

            // Update frequency labels if we have data
            if (beforeData && beforeData.sampleRate) {
                const maxFreq = Math.floor(beforeData.sampleRate / 2);
                beforeFreqEnd.textContent = maxFreq;
                afterFreqEnd.textContent = maxFreq;
            }

            // Draw analyzer visualizations
            if (beforeData && beforeData.dataArray) {
                drawFrequencyBars(ctxBefore, beforeData.dataArray, 'before');
            }

            if (afterData && afterData.dataArray) {
                drawFrequencyBars(ctxAfter, afterData.dataArray, 'after');
            }
        } catch (error) {
            // Silently fail if audio processing is not active
            console.log('Analyzer: No active audio processing for this tab');
        }
    }, 33); // ~30 FPS
}

function drawFrequencyBars(ctx, dataArray, type) {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Get theme-aware colors
    const isDark = document.body.classList.contains('dark-theme');
    const colors = {
        before: isDark ? '#00aacc' : '#007BFF',
        after: isDark ? '#00ff88' : '#28a745'
    };

    const barColor = colors[type];
    const barWidth = width / dataArray.length;

    // Draw frequency bars
    for (let i = 0; i < dataArray.length; i++) {
        const barHeight = (dataArray[i] / 255) * height;
        const x = i * barWidth;
        const y = height - barHeight;

        // Create gradient for better visual effect
        const gradient = ctx.createLinearGradient(x, y, x, height);
        gradient.addColorStop(0, barColor);
        gradient.addColorStop(1, barColor + '80'); // Add transparency

        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth - 1, barHeight);
    }
}

function stopAnalyzer() {
    if (analyzerInterval) {
        clearInterval(analyzerInterval);
        analyzerInterval = null;
    }
}

// --- MODIFICATION START ---
// New function to automatically save the last used volume for a site.
async function autoSaveVolumeForSite(volume) {
    if (!settingsStorageKey || settingsStorageKey === 'settings_global_default') {
        return; // Don't auto-save for global settings
    }
    try {
        const data = await chrome.storage.local.get(settingsStorageKey);
        const siteSettings = data[settingsStorageKey] || {};
        siteSettings.volume = volume;
        await chrome.storage.local.set({ [settingsStorageKey]: siteSettings });
        
        // After the first automatic save, the restore button should be enabled.
        if (restoreVolumeBtn.disabled) {
            restoreVolumeBtn.disabled = false;
            restoreVolumeBtn.style.opacity = '1';
            restoreVolumeBtn.style.cursor = 'pointer';
        }
    } catch (e) {
        console.error("Failed to auto-save volume:", e);
    }
}
// --- MODIFICATION END ---




function handleUnsavedProfileChange() { saveCurrentTabSessionSettings(); updateAudioLive(); saveSiteProfileBtn.classList.add('visible', 'pulse-animation'); }
async function handleSpeakerChange(deviceId) {
    const { global_deviceSafetyEnabled = true } = await chrome.storage.local.get('global_deviceSafetyEnabled');
    let volumeWasLowered = false;
    if (global_deviceSafetyEnabled) {
        clearTimeout(deviceChangeTimeout);
        const currentVolume = parseInt(volumeSlider.value, 10);
        if (currentVolume > 150) {
            volumeSlider.value = 120;
            volumeSlider.dispatchEvent(new Event('input'));
            volumeWasLowered = true;
            deviceSafetyMessage.textContent = chrome.i18n.getMessage('volume_reduced');
            deviceSafetyMessage.classList.add('visible');
            deviceChangeTimeout = setTimeout(() => {
                deviceSafetyMessage.classList.remove('visible');
            }, 4000);
        }
    }
    chrome.runtime.sendMessage({ type: 'SET_SPEAKER', tabId: currentTab.id, deviceId });
    saveSpeakerBtn.classList.add('visible', 'pulse-animation');

    // Show message about device switching
    if (messageContainer) {
        messageContainer.innerHTML = `<p class="user-message">${chrome.i18n.getMessage('device_saved')}</p>`;
        setTimeout(() => {
            messageContainer.innerHTML = `<p class="user-message">${chrome.i18n.getMessage('enjoy_message')}</p>`;
        }, 5000);
    }
}
function handlePresetChange(selectedValue) {
    const currentSettings = getSettingsFromUI(true);
    let newSettings = { ...currentSettings, preset: selectedValue };
    if (EQUALIZER_PRESETS[selectedValue]) {
        newSettings.equalizer = EQUALIZER_PRESETS[selectedValue];
    }
    applySettingsToUI(newSettings);
    handleUnsavedProfileChange();
}
function handleAdvancedChange() {
    updateSelectedPreset('custom', 'Custom');
    updateAdvancedUI(getSettingsFromUI(false));
    handleUnsavedProfileChange();
}
function setupEventListeners() {
    volumeSlider.addEventListener('input', () => {
        if (!volumeSlider || !volumeLevel || !currentTab) return;

        const value = parseInt(volumeSlider.value, 10);
        volumeLevel.textContent = value;
        updateSliderFill(volumeSlider);
        if (volumeLevel.parentElement) {
            volumeLevel.parentElement.classList.toggle('high-volume', value >= 600);
        }
        chrome.runtime.sendMessage({ type: 'UPDATE_BADGE', tabId: currentTab.id, volume: value });
        clearTimeout(warningTimeout);
        if (value > 550) {
            if (volumeWarningLine) {
                volumeWarningLine.textContent = chrome.i18n.getMessage('high_volume_warning');
                volumeWarningLine.classList.remove('hidden');
            }
            warningTimeout = setTimeout(() => {
                if (volumeWarningLine) volumeWarningLine.classList.add('hidden');
            }, 3000);
        } else {
            if (volumeWarningLine) volumeWarningLine.classList.add('hidden');
        }
        clearTimeout(volumeUpdateTimer);
        volumeUpdateTimer = setTimeout(() => {
            // --- MODIFICATION START ---
            // Auto-save the volume whenever the user changes it.
            autoSaveVolumeForSite(value);
            // --- MODIFICATION END ---
            saveCurrentTabSessionSettings();
            updateAudioLive();
        }, 100); // Increased delay slightly for performance
    });

    restoreVolumeBtn.addEventListener('click', async () => {
        // This logic now correctly restores the auto-saved volume for the site
        const data = await chrome.storage.local.get(settingsStorageKey);
        const siteSettings = data[settingsStorageKey];
        
        if (siteSettings && typeof siteSettings.volume === 'number') {
            volumeSlider.value = siteSettings.volume;
            volumeSlider.dispatchEvent(new Event('input'));
        }
    });

    saveSpeakerBtn.addEventListener('click', async () => {
        const deviceId = speakerDropdown.selected.dataset.value;
        const data = await chrome.storage.local.get(settingsStorageKey);
        const siteSettings = data[settingsStorageKey] || {};
        siteSettings.deviceId = deviceId;
        await chrome.storage.local.set({ [settingsStorageKey]: siteSettings });
        saveSpeakerBtn.classList.remove('visible', 'pulse-animation');
    });
    saveSiteProfileBtn.addEventListener('click', async () => {
        let settingsToSave = getSettingsFromUI(true);
        await chrome.storage.local.set({ [settingsStorageKey]: settingsToSave });
        saveSiteProfileBtn.classList.remove('visible', 'pulse-animation');
    });
    settingsToggleBtn.addEventListener('click', () => {
        mainContent.classList.toggle('is-hidden');
        settingsContent.classList.toggle('is-hidden');
        settingsToggleBtn.classList.remove('pulse-animation');
        if (customizeEqBtn) customizeEqBtn.classList.remove('pulse-animation');
        chrome.storage.local.set({ hasOpenedAdvancedView: true });
    });
    if (customizeEqBtn) customizeEqBtn.addEventListener('click', () => settingsToggleBtn.click());
    themeToggleBtn.addEventListener('click', toggleTheme);
    helpBtn.addEventListener('click', () => helpModal.classList.remove('hidden'));
    closeModalBtn.addEventListener('click', () => helpModal.classList.add('hidden'));
    helpModal.addEventListener('click', (e) => { if (e.target === helpModal) helpModal.classList.add('hidden'); });
    advancedSliders.forEach(el => el.addEventListener('input', handleAdvancedChange));
    presetButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            presetButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            handlePresetChange(btn.dataset.preset);
        });
    });
    scrollAdjustToggle.addEventListener('change', (e) => { toggleScrollListeners(e.target.checked); chrome.storage.local.set({ global_scrollAdjust: e.target.checked }); });
    deviceSafetyToggle.addEventListener('change', (e) => { chrome.storage.local.set({ global_deviceSafetyEnabled: e.target.checked }); });
    if (analyzerToggle) {
        analyzerToggle.addEventListener('change', (e) => {
            chrome.storage.local.set({ global_analyzerEnabled: e.target.checked });
            if (e.target.checked) {
                initAudioAnalyzer();
            } else {
                stopAnalyzer();
                if (analyzerContainer) {
                    analyzerContainer.style.display = 'none';
                    analyzerContainer.style.height = '0';
                    analyzerContainer.style.overflow = 'hidden';
                    analyzerContainer.style.margin = '0';
                    analyzerContainer.style.padding = '0';
                }
            }
        });
    }
    refreshSpeakersBtn.addEventListener('click', () => { speakerDropdown.options.innerHTML = ''; speakerDropdown.selected.innerHTML = `<span>${chrome.i18n.getMessage('loading')}</span>`; populateSpeakers(speakerDropdown.selected.dataset.value); });
}
async function init() {
    try {
        // Initialize DOM elements
        container = document.querySelector('.container');
        mainContent = document.querySelector('.content-main');
        settingsContent = document.querySelector('.content-settings');
        errorContainer = document.getElementById('error-container');
        volumeSlider = document.getElementById('volume-slider');
        volumeLevel = document.getElementById('volume-level');
        restoreVolumeBtn = document.getElementById('restore-volume-btn');
        presetButtons = document.querySelectorAll('.preset-btn');
        speakerDropdown = { container: document.getElementById('speaker-dropdown-container'), selected: document.getElementById('speaker-selected'), options: document.getElementById('speaker-options'), };
        audioHubContainer = document.getElementById('audio-hub-container');
        messageContainer = document.getElementById('message-container');
        themeToggleBtn = document.getElementById('theme-toggle-btn');
        helpBtn = document.getElementById('help-btn');
        settingsToggleBtn = document.getElementById('settings-toggle-btn');
        backToMainBtn = document.getElementById('back-to-main-btn');
        helpModal = document.getElementById('help-modal');
        closeModalBtn = helpModal ? helpModal.querySelector('.modal-close-btn') : null;
        saveSpeakerBtn = document.getElementById('save-speaker-btn');
        saveSiteProfileBtn = document.getElementById('save-site-profile-btn');
        customizeEqBtn = document.getElementById('customize-eq-btn');
        volumeWarningLine = document.getElementById('volume-warning-line');
        deviceSafetyMessage = document.getElementById('device-safety-message');
        scrollAdjustToggle = document.getElementById('scroll-adjust-toggle');
        deviceSafetyToggle = document.getElementById('device-safety-toggle');
        analyzerToggle = document.getElementById('analyzer-toggle');
        refreshSpeakersBtn = document.getElementById('refresh-speakers-btn');
        advancedSliders = [];

        // Initialize analyzer elements
        initAnalyzerElements();

        // Internationalization
         document.querySelectorAll('[data-i18n]').forEach(el => {
             const key = el.dataset.i18n;
             const message = chrome.i18n.getMessage(key);
             if (message) el.textContent = message;
         });
         document.querySelectorAll('[data-i18n-title]').forEach(el => {
             const key = el.dataset.i18nTitle;
             const message = chrome.i18n.getMessage(key);
             if (message) el.title = message;
         });

        await initTheme();
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        currentTab = tab;
        

        
        if (tab?.url?.startsWith('http') || tab?.url?.startsWith('file')) {
             settingsStorageKey = `settings_${new URL(tab.url).hostname}`;
        } else {
             settingsStorageKey = 'settings_global_default';
        }
        
        const { [`tab_settings_${tab.id}`]: sessionSettings } = await chrome.storage.session.get(`tab_settings_${tab.id}`);
        const { [settingsStorageKey]: siteSettings } = await chrome.storage.local.get(settingsStorageKey);

        // --- MODIFICATION START ---
        // The restore button is disabled unless there is a remembered volume to restore.
        if (!siteSettings || typeof siteSettings.volume !== 'number') {
            restoreVolumeBtn.disabled = true;
            restoreVolumeBtn.style.opacity = '0.5';
            restoreVolumeBtn.style.cursor = 'not-allowed';
        }
        // --- MODIFICATION END ---
        
        const response = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_SETTINGS', tabId: tab.id, url: tab.url });
        if (!response.success) throw new Error(response.error);
        const settingsToUse = response.settings;

        // This logic correctly syncs the UI with the background script's initial 100% volume setting.
        if (!sessionSettings) {
            settingsToUse.volume = 100;
        }

        const { user_presets, global_scrollAdjust, global_enable800Boost, global_deviceSafetyEnabled, global_analyzerEnabled } = await chrome.storage.local.get(['user_presets', 'global_scrollAdjust', 'global_enable800Boost', 'global_deviceSafetyEnabled', 'global_analyzerEnabled']);

        userPresets = user_presets || [];
        scrollAdjustToggle.checked = global_scrollAdjust === true;
        toggleScrollListeners(scrollAdjustToggle.checked);
        updateVolumeSliderMax(false); // Always 600%
        deviceSafetyToggle.checked = global_deviceSafetyEnabled !== false;
        analyzerToggle.checked = global_analyzerEnabled === true;

        // Initialize analyzer if enabled
        if (analyzerToggle.checked) {
            initAudioAnalyzer();
        }

        applySettingsToUI(settingsToUse);
        
        const isFirstActivation = !sessionSettings;

        if (isFirstActivation && (tab?.url?.startsWith('http') || tab?.url?.startsWith('file'))) {
            updateAudioLive(settingsToUse);
        }
        
        if (tab?.url?.startsWith('http') || tab?.url?.startsWith('file')) {
            await populateSpeakers(settingsToUse.deviceId);
            await renderFooterPanels();
        }

        setupEventListeners();
        setupCustomDropdowns();
    } catch (e) { console.error("Popup initialization FAILED:", e); showError(`Error: ${e.message}`); }
}
async function initTheme() { const { theme = 'dark' } = await chrome.storage.local.get('theme'); document.body.classList.toggle('dark-theme', theme === 'dark'); themeToggleBtn.innerHTML = theme === 'dark' ? ICONS.themeLight : ICONS.themeDark; }
async function toggleTheme() { const isDark = document.body.classList.toggle('dark-theme'); const newTheme = isDark ? 'dark' : 'light'; await chrome.storage.local.set({ theme: newTheme }); themeToggleBtn.innerHTML = isDark ? ICONS.themeLight : ICONS.themeDark; }
async function saveCurrentTabSessionSettings() { if (currentTab?.id) { let settingsToSave = getSettingsFromUI(true); await chrome.storage.session.set({ [`tab_settings_${currentTab.id}`]: settingsToSave }); } }
async function updateAudioLive(settingsObject = null) {
    if (currentTab?.url?.startsWith('http') || currentTab?.url?.startsWith('file')) {
        const settings = settingsObject || getSettingsFromUI(true);
        chrome.runtime.sendMessage({ type: 'UPDATE_LIVE_SETTINGS', tabId: currentTab.id, settings });
    }
}
async function renderFooterPanels() {
    try {
        audioHubContainer.innerHTML = `<div class="hub-header"><h2 class="hub-title">${chrome.i18n.getMessage('active_audio')}</h2><button id="refresh-hub-btn" class="icon-btn" data-i18n-title="refresh_tab_list" title="Refresh Tab List">🔄️</button></div><div class="tab-list"><div class="hub-empty-state">${chrome.i18n.getMessage('loading')}</div></div>`;
        document.getElementById('refresh-hub-btn').addEventListener('click', renderFooterPanels);
        const response = await chrome.runtime.sendMessage({ type: 'GET_AUDIBLE_TABS' });
        if (!response?.success) throw new Error(response?.error || "Failed to get audible tabs.");
        const { tabs } = response.data;
        const tabList = audioHubContainer.querySelector('.tab-list');
        tabList.innerHTML = '';
        if (tabs.length > 0) {
            tabs.forEach(tab => {
                const tabItem = document.createElement('div');
                tabItem.className = 'tab-item';
                if (tab.id === currentTab.id) tabItem.classList.add('current-tab-in-hub');
                tabItem.innerHTML = `<img src="${tab.favIconUrl || 'icon16.png'}" class="tab-favicon"><span class="tab-title">${tab.title}</span>`;
                tabItem.addEventListener('click', () => { if (tab.id !== currentTab.id) { chrome.tabs.update(tab.id, { active: true }); window.close(); } });
                tabList.appendChild(tabItem);
            });
        } else { tabList.innerHTML = `<div class="hub-empty-state">${chrome.i18n.getMessage('no_active_audio')}</div>`; }
        messageContainer.innerHTML = `<p class="user-message">${chrome.i18n.getMessage('enjoy_message')}</p>`;
    } catch (e) { console.error("Error rendering footer panels:", e); audioHubContainer.innerHTML = `<div class="hub-empty-state">${chrome.i18n.getMessage('load_error')}</div>`; }
}
function getSettingsFromUI(includeVolume) {
    const activeButton = document.querySelector('.preset-btn.active');
    const preset = activeButton ? activeButton.dataset.preset : 'flat';
    const settings = {
        preset: preset,
        equalizer: EQUALIZER_PRESETS[preset] || DEFAULT_SETTINGS.equalizer
    };
    if (includeVolume) settings.volume = parseInt(volumeSlider.value, 10);
    return settings;
}
function applySettingsToUI(settings) {
    if (!volumeSlider || !volumeLevel || !presetButtons) return;

    const fullSettings = {
        ...DEFAULT_SETTINGS,
        ...settings,
        equalizer: {
            ...DEFAULT_SETTINGS.equalizer,
            ...settings.equalizer
        }
    };
    const maxVol = parseInt(volumeSlider.max, 10);
    volumeSlider.value = Math.min(fullSettings.volume, maxVol);
    volumeLevel.textContent = volumeSlider.value;
    updateSliderFill(volumeSlider);
    if (volumeLevel.parentElement) {
        volumeLevel.parentElement.classList.toggle('high-volume', volumeSlider.value >= 600);
    }
    // Update preset buttons
    presetButtons.forEach(btn => {
        if (btn) btn.classList.toggle('active', btn.dataset.preset === fullSettings.preset);
    });
}
function updateVolumeSliderMax() { const newMax = 600; if (parseInt(volumeSlider.value, 10) > newMax) { volumeSlider.value = newMax; } volumeSlider.max = newMax; updateSliderFill(volumeSlider); }
function updateSliderFill(slider) { const percentage = ((slider.value - slider.min) / (slider.max - slider.min)) * 100; slider.style.setProperty('--fill-percent', `${percentage}%`); }
function toggleScrollListeners(enable) { const allSliders = [volumeSlider, ...advancedSliders]; allSliders.forEach(slider => { const handler = (e) => { e.preventDefault(); if (e.deltaY < 0) slider.stepUp(); else slider.stepDown(); slider.dispatchEvent(new Event('input', { bubbles: true })); }; slider.removeEventListener('wheel', slider.__wheelHandler); if (enable) { slider.__wheelHandler = handler; slider.addEventListener('wheel', handler, { passive: false }); } }); }
function updateSelectedPreset(value, text) {
    // No dropdown to update
}
function getDeviceIcon(label) { const lowerLabel = label.toLowerCase(); if (lowerLabel.includes('headphone') || lowerLabel.includes('earbud')) return '🎧'; if (lowerLabel.includes('hdmi') || lowerLabel.includes('displayport') || lowerLabel.includes('monitor')) return '🖥️'; if (lowerLabel.includes('speaker') || lowerLabel.includes('realtek')) return '🔊'; if (lowerLabel.includes('cabl') || lowerLabel.includes('line out')) return '🔌'; return '🎙️'; }

async function populateSpeakers(selectedId) {
    const options = speakerDropdown.options;
    try {
        await chrome.contentSettings.microphone.set({
            primaryPattern: `*://${chrome.runtime.id}/*`,
            setting: 'allow',
            scope: 'regular'
        });

        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
        options.innerHTML = '';
        if (audioOutputs.length === 0) { speakerDropdown.selected.innerHTML = `<span>${chrome.i18n.getMessage('no_devices')}</span>`; return; }

        let selectedDeviceExists = false;
        audioOutputs.forEach(device => {
            const li = document.createElement('li');
            li.dataset.value = device.deviceId;
            const icon = getDeviceIcon(device.label);
            li.innerHTML = `<span class="icon">${icon}</span><span>${device.label || `Speaker ${options.children.length + 1}`}</span>`;
            li.setAttribute('role', 'option');
            if (device.deviceId === selectedId) {
                li.classList.add('selected');
                speakerDropdown.selected.innerHTML = li.innerHTML;
                speakerDropdown.selected.dataset.value = device.deviceId;
                selectedDeviceExists = true;
            }
            options.appendChild(li);
        });
        
        if (!selectedDeviceExists) {
            let fallbackDevice = audioOutputs.find(d => d.deviceId === 'default') || audioOutputs[0];
            if (fallbackDevice) {
                const fallbackOption = options.querySelector(`li[data-value="${fallbackDevice.deviceId}"]`);
                if (fallbackOption) {
                    fallbackOption.classList.add('selected');
                    speakerDropdown.selected.innerHTML = fallbackOption.innerHTML;
                    speakerDropdown.selected.dataset.value = fallbackOption.dataset.value;
                }
            }
        }

    } catch (err) { options.innerHTML = ''; speakerDropdown.selected.innerHTML = `<span>${chrome.i18n.getMessage('permission_needed')}</span>`; }
}
function showError(message) { errorContainer.textContent = message; errorContainer.classList.remove('hidden'); container.classList.add('hidden'); }
function setupCustomDropdowns() {
    document.addEventListener('click', (e) => {
        if (speakerDropdown.container && !speakerDropdown.container.contains(e.target)) { closeDropdown(speakerDropdown, false); }
    });
    [speakerDropdown].forEach(dd => {
        dd.selected.addEventListener('click', (e) => { e.stopPropagation(); toggleDropdown(dd); });
        dd.options.addEventListener('click', (e) => { const li = e.target.closest('li[data-value]'); if (li) selectOption(dd, li); });
        dd.container.addEventListener('keydown', (e) => {
            const isOpen = dd.container.classList.contains('open');
            if (e.key === 'Escape') { e.preventDefault(); if (isOpen) closeDropdown(dd); return; }
            if (e.key === 'Tab' && isOpen) { closeDropdown(dd, false); return; }
            if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
                e.preventDefault();
                if (!isOpen) { toggleDropdown(dd, true); }
                else if (e.key === 'Enter' || e.key === ' ') { const highlighted = dd.options.querySelector('.highlight'); if (highlighted) selectOption(dd, highlighted); }
                else { navigateOptions(dd, e.key === 'ArrowDown' ? 'down' : 'up'); }
            }
        });
    });
}
function toggleDropdown(dd) {
    const isOpen = dd.container.classList.contains('open');
    [speakerDropdown].forEach(otherDd => { if (otherDd !== dd) closeDropdown(otherDd, false); });
    if (!isOpen) {
        container.style.overflow = 'visible';
        dd.container.classList.add('open');
        dd.selected.setAttribute('aria-expanded', 'true');
        const width = dd.container.offsetWidth;
        dd.options.style.minWidth = `${width}px`;
        const selectedOption = dd.options.querySelector('.selected') || dd.options.querySelector('li[data-value]');
        if (selectedOption) updateHighlight(dd, selectedOption);
    } else {
        closeDropdown(dd);
    }
}
function closeDropdown(dd, refocus = true) { if (dd.container.classList.contains('open')) { container.style.overflow = 'hidden'; dd.container.classList.remove('open'); dd.selected.setAttribute('aria-expanded', 'false'); if (refocus) dd.selected.focus(); } }
function selectOption(dd, li) {
    const oldValue = dd.selected.dataset.value;
    const newValue = li.dataset.value;
    if (oldValue !== newValue) {
        dd.selected.innerHTML = li.innerHTML;
        dd.selected.dataset.value = newValue;
        Array.from(dd.options.children).forEach(child => child.classList.remove('selected'));
        li.classList.add('selected');
        if (dd === speakerDropdown) handleSpeakerChange(newValue);
    }
    closeDropdown(dd);
}
function updateHighlight(dd, newHighlight) { dd.options.querySelectorAll('.highlight').forEach(el => el.classList.remove('highlight')); newHighlight.classList.add('highlight'); newHighlight.scrollIntoView({ block: 'nearest' }); }
function navigateOptions(dd, direction) {
    const options = Array.from(dd.options.querySelectorAll('li[data-value]'));
    if (options.length === 0) return;
    const current = dd.options.querySelector('.highlight');
    let currentIndex = options.indexOf(current);
    if (direction === 'down') { currentIndex = currentIndex < options.length - 1 ? currentIndex + 1 : 0; } else { currentIndex = currentIndex > 0 ? currentIndex - 1 : options.length - 1; }
    updateHighlight(dd, options[currentIndex]);
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SETTINGS_UPDATED') {
        if (currentTab && message.tabId === currentTab.id) {
            applySettingsToUI(message.newSettings);
        }
    } else if (message.type === 'BOOST_ACTIVATED') {
        // When audio boosting starts, initialize the analyzer
        setTimeout(() => {
            if (analyzerToggle && analyzerToggle.checked) {
                initAudioAnalyzer();
            }
        }, 500);
    }
});

document.addEventListener('DOMContentLoaded', init);
