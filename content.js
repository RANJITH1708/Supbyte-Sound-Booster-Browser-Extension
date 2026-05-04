// content.js
console.log(`[CONTENT_SCRIPT] Script injected and running at ${new Date().toLocaleTimeString()}`);

let hudContainer = null;
let hideTimer = null;
let observer;

const HUD_STYLES = `
    #supbyte-volume-hud {
        position: fixed; top: 20px; right: 20px;
        background-color: rgba(0, 0, 0, 0.75); color: white;
        padding: 10px 15px; border-radius: 12px;
        display: grid; grid-template-columns: auto 1fr auto;
        align-items: center; gap: 12px;
        z-index: 2147483647;
        font-family: system-ui, -apple-system, sans-serif;
        opacity: 0; transform: translateY(-10px);
        transition: opacity 0.3s ease, transform 0.3s ease;
        pointer-events: none;
    }
    #supbyte-volume-hud.visible { opacity: 1; transform: translateY(0); }
    #supbyte-hud-icon { font-size: 18px; }
    #supbyte-hud-bar-container { width: 120px; height: 6px; background-color: rgba(255, 255, 255, 0.2); border-radius: 3px; overflow: hidden; }
    #supbyte-hud-bar { height: 100%; background-color: #00aacc; border-radius: 3px; transition: width 0.2s ease-out; }
    #supbyte-hud-text { font-size: 14px; font-weight: 500; min-width: 40px; text-align: right; }
    #supbyte-hud-preset-name { grid-column: 1 / -1; text-align: center; font-size: 11px; opacity: 0.8; margin-top: -2px; font-weight: 400; display: none; }
`;

function getHudParent() {
    return document.fullscreenElement || document.body;
}

function handleFullscreenChange() {
    if (hudContainer) {
        const parent = getHudParent();
        if (hudContainer.parentElement !== parent) {
            parent.appendChild(hudContainer);
        }
    }
}

function ensureHudExists() {
    if (hudContainer && hudContainer.isConnected) return;
    
    hudContainer = document.createElement('div');
    hudContainer.id = 'supbyte-hud-container';
    const shadowRoot = hudContainer.attachShadow({ mode: 'open' });
    
    const styleSheet = document.createElement('style');
    styleSheet.textContent = HUD_STYLES;
    shadowRoot.appendChild(styleSheet);
    
    const hudElement = document.createElement('div');
    hudElement.id = 'supbyte-volume-hud';
    hudElement.innerHTML = `
        <div id="supbyte-hud-icon">🔊</div>
        <div id="supbyte-hud-bar-container"><div id="supbyte-hud-bar"></div></div>
        <div id="supbyte-hud-text"></div>
        <div id="supbyte-hud-preset-name"></div>
    `;
    shadowRoot.appendChild(hudElement);

    const parent = getHudParent();
    parent.appendChild(hudContainer);
}

function showVolumeHUD(volume, presetName) {
    if (!chrome.runtime?.id) return;

    ensureHudExists();
    
    const hudElement = hudContainer.shadowRoot.querySelector('#supbyte-volume-hud');
    const bar = hudContainer.shadowRoot.querySelector('#supbyte-hud-bar');
    const text = hudContainer.shadowRoot.querySelector('#supbyte-hud-text');
    const presetElem = hudContainer.shadowRoot.querySelector('#supbyte-hud-preset-name');
    
    chrome.storage.local.get('global_enable800Boost', ({ global_enable800Boost }) => {
        if (!chrome.runtime?.id) return;
        const maxVolume = global_enable800Boost !== false ? 800 : 600;
        const percentage = Math.max(0, Math.min(100, (volume / maxVolume) * 100));
        if (bar) bar.style.width = `${percentage}%`;
    });
    
    if (text) text.textContent = `${volume}%`;
    if (presetName && presetElem) {
        presetElem.textContent = presetName;
        presetElem.style.display = 'block';
    } else if (presetElem) {
        presetElem.style.display = 'none';
    }
    
    hudElement.classList.add('visible');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
        if (hudElement) hudElement.classList.remove('visible');
    }, 2500);
}

// Mute Detection and SPA Navigation Logic
let lastKnownMuteState = null;

function handleMediaVolumeChange(event) {
    if (!chrome.runtime?.id) return;

    const isMuted = event.target.muted;
    if (isMuted !== lastKnownMuteState) {
        lastKnownMuteState = isMuted;
        try {
            console.log(`[CONTENT_SCRIPT] Media 'volumechange' event detected. Muted: ${isMuted}. Sending message to background.`);
            if (isMuted) {
                chrome.runtime.sendMessage({ type: 'MEDIA_MUTED' });
            } else {
                chrome.runtime.sendMessage({ type: 'MEDIA_UNMUTED' });
            }
        } catch (error) {
            console.warn("[CONTENT_SCRIPT] Could not send message to a closed extension context.");
            event.target.removeEventListener('volumechange', handleMediaVolumeChange);
        }
    }
}

function attachListenerToMedia(element) {
    element.removeEventListener('volumechange', handleMediaVolumeChange);
    element.addEventListener('volumechange', handleMediaVolumeChange);
    lastKnownMuteState = element.muted;
}

function observeMediaElements() {
    console.log('[CONTENT_SCRIPT] Observing for new media elements.');
    if (observer) observer.disconnect();
    document.querySelectorAll('video, audio').forEach(attachListenerToMedia);

    observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    if (node.matches('video, audio')) {
                        attachListenerToMedia(node);
                    }
                    node.querySelectorAll('video, audio').forEach(attachListenerToMedia);
                }
            }
        }
    });

    if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
    }
}

function handleSpaNavigation() {
    if (!chrome.runtime?.id) return;
    
    setTimeout(() => {
        try {
            console.log('[CONTENT_SCRIPT] SPA navigation detected. Sending message to background to re-observe media.');
            chrome.runtime.sendMessage({ type: 'SPA_NAVIGATED' });
        } catch (e) {
             console.warn("[CONTENT_SCRIPT] Could not send SPA_NAVIGATED message to a closed extension context.");
        }
    }, 500);
}

// --- INITIALIZATION ---
if (chrome.runtime && chrome.runtime.onMessage) {
    console.log('[CONTENT_SCRIPT] Adding onMessage listener.');
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('[CONTENT_SCRIPT] Message received from background:', message);
        if (message.type === 'SHOW_VOLUME_HUD') {
            showVolumeHUD(message.volume, message.presetName);
        } else if (message.type === 'RE_OBSERVE_MEDIA') {
            observeMediaElements();
        }
    });
}

observeMediaElements();

window.addEventListener('yt-navigate-finish', handleSpaNavigation);
window.addEventListener('fullscreenchange', handleFullscreenChange);

window.addEventListener('beforeunload', () => {
    console.log('[CONTENT_SCRIPT] Page unloading. Disconnecting observer.');
    if(observer) observer.disconnect();
});