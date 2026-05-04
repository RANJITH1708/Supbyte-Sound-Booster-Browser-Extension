// background.js

const EQUALIZER_PRESETS = { flat: { algorithm: 'highpass', frequency: 0, q: 1, gain: 0 }, voice: { algorithm: 'peaking', frequency: 1500, q: 1, gain: 12 }, bass: { algorithm: 'lowshelf', frequency: 350, q: 1, gain: 6 }, treble: { algorithm: 'highshelf', frequency: 4000, q: 1, gain: 8 } };
const FACTORY_DEFAULT_SETTINGS = { volume: 100, preset: 'flat', mono: false, equalizer: EQUALIZER_PRESETS.flat };
const fullscreenFrames = new Map();
const CLEANUP_ALARM_NAME = 'resilience_cleanup_alarm';

async function isTabIdValid(tabId) {
    try {
        await chrome.tabs.get(tabId);
        return true;
    } catch (error) {
        return false;
    }
}

// Storage Management
async function getBoostedTabs() { const data = await chrome.storage.session.get('boostedTabs'); return new Map(data.boostedTabs || []); }
async function setBoostedTabs(map) { return chrome.storage.session.set({ boostedTabs: Array.from(map.entries()) }); }
async function addBoostedTab(tabId, url) { const boostedTabs = await getBoostedTabs(); boostedTabs.set(tabId, url); await setBoostedTabs(boostedTabs); }
async function removeBoostedTab(tabId) { const boostedTabs = await getBoostedTabs(); boostedTabs.delete(tabId); await setBoostedTabs(boostedTabs); }

async function getActiveSettingsForTab(tabId, url, isFirstActivation = false) {
    const sessionKey = `tab_settings_${tabId}`;
    let siteKey = 'settings_global_default';

    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        try {
            const hostname = new URL(url).hostname;
            siteKey = `settings_${hostname}`;
        } catch (e) {
            console.warn(`[background.js] Could not parse URL: ${url}. Using global default settings.`);
            siteKey = 'settings_global_default';
        }
    }

    const data = await Promise.all([ chrome.storage.session.get(sessionKey), chrome.storage.local.get([siteKey, 'settings_global_default', 'user_presets']) ]);
    const sessionSettings = data[0][sessionKey];
    const localData = data[1];
    const siteSettings = localData[siteKey];
    const globalSettings = localData['settings_global_default'];
    let baseSettings = sessionSettings || siteSettings || globalSettings;
    let activeSettings = {
        ...FACTORY_DEFAULT_SETTINGS,
        ...baseSettings,
        equalizer: {
            ...FACTORY_DEFAULT_SETTINGS.equalizer,
            ...baseSettings?.equalizer
        }
    };
    if (siteSettings && siteSettings.deviceId) { activeSettings.deviceId = siteSettings.deviceId; }
    if (isFirstActivation) { activeSettings.volume = 100; }
    if (EQUALIZER_PRESETS[activeSettings.preset]) { activeSettings.equalizer = EQUALIZER_PRESETS[activeSettings.preset]; }
    else if (activeSettings.preset?.startsWith('user_')) {
        const userPresets = localData.user_presets || [];
        const index = parseInt(activeSettings.preset.replace('user_', ''), 10);
        if (userPresets[index]) {
            const presetSettings = userPresets[index].settings;
            const volumeToKeep = presetSettings.volume !== undefined ? presetSettings.volume : activeSettings.volume;
            activeSettings = { ...FACTORY_DEFAULT_SETTINGS, ...presetSettings, volume: volumeToKeep, preset: activeSettings.preset, equalizer: {...FACTORY_DEFAULT_SETTINGS.equalizer, ...presetSettings?.equalizer} };
        }
    }
    return activeSettings;
}

// Offscreen Document Management
let creatingOffscreenDoc;
async function hasOffscreenDocument() { if ('getContexts' in chrome.runtime) { const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] }); return contexts.length > 0; } else { const clients = await self.clients.matchAll(); return clients.some(c => c.url.endsWith('offscreen.html')); } }
async function setupOffscreenDocument() { if (await hasOffscreenDocument()) return; if (creatingOffscreenDoc) { await creatingOffscreenDoc; } else { creatingOffscreenDoc = chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['USER_MEDIA'], justification: 'Required for audio processing.' }); await creatingOffscreenDoc; creatingOffscreenDoc = null; } }

async function forwardMessageToOffscreen(message) {
    await setupOffscreenDocument();
    return chrome.runtime.sendMessage({ ...message, target: 'offscreen' });
}

// Content Script Injection
async function injectContentScripts(tabId) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tabId, allFrames: true },
            files: ['content.js'],
        });
    } catch (error) {
        console.warn(`Could not inject content script into tab ${tabId}. This is normal for restricted pages. Error: ${error.message}`);
    }
}

// Core Logic
async function startBoostingTab(tabId) {
    if (!await isTabIdValid(tabId)) return;
    try {
        const tab = await chrome.tabs.get(tabId);

        if (!tab.url || !/^(https?|file):/.test(tab.url)) {
            return;
        }

        if (tab.mutedInfo.muted) { await chrome.tabs.update(tabId, { muted: false }); }
        const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
        const settings = await getActiveSettingsForTab(tabId, tab.url, true);
        
        // **FIX**: Save the initial settings (with volume at 100) to the session to sync UI and audio state.
        await chrome.storage.session.set({ [`tab_settings_${tabId}`]: settings });

        await addBoostedTab(tabId, tab.url);
        await forwardMessageToOffscreen({ type: 'CREATE_GRAPH', tabId, streamId, settings, deviceId: settings.deviceId });
        updateBadge(tabId, settings.volume);
        await injectContentScripts(tabId);

        await chrome.storage.session.set({ [`first_activation_${tabId}`]: true });

    } catch (error) {
        console.error(`[background.js] Failed to start boosting tab ${tabId}:`, error.message);
        await removeBoostedTab(tabId);
        updateBadge(tabId, '');
        try { chrome.runtime.sendMessage({ type: 'CAPTURE_FAILED', tabId, error: error.message }); } catch(e) {}
    }
}

async function updateLiveSettings(tabId, newSettings) {
    if (!await isTabIdValid(tabId)) return;
    const isBoosted = (await getBoostedTabs()).has(tabId);
    if (!isBoosted) {
        await startBoostingTab(tabId);
        try {
            chrome.runtime.sendMessage({ type: 'BOOST_ACTIVATED', tabId: tabId });
        } catch (e) { /* The popup might not be open, which is fine */ }
    }
    else { await forwardMessageToOffscreen({ type: 'UPDATE_LIVE_SETTINGS', tabId, settings: newSettings }); updateBadge(tabId, newSettings.volume); }
}

function updateBadge(tabId, volume) { const text = volume === 0 ? "MUTE" : (typeof volume === 'number' ? `${Math.round(volume)}` : ''); chrome.action.setBadgeText({ tabId, text: text.slice(0, 4) }); chrome.action.setBadgeBackgroundColor({ tabId, color: volume === 0 ? '#ff5252' : '#00aacc' }); }

// Event Listeners
chrome.tabs.onRemoved.addListener(async (tabId) => {
    fullscreenFrames.delete(tabId);
    if ((await getBoostedTabs()).has(tabId)) {
        await removeBoostedTab(tabId);
        if (await hasOffscreenDocument()) {
            try { forwardMessageToOffscreen({ type: 'REMOVE_GRAPH', tabId }); } catch (error) { /* Ignored */ }
        }
    }
    await chrome.storage.session.remove(`tab_settings_${tabId}`);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    const boostedTabs = await getBoostedTabs();

    if (changeInfo.url && boostedTabs.has(tabId) && !/^(https?|file):/.test(changeInfo.url)) {
        await removeBoostedTab(tabId);
        updateBadge(tabId, '');
        if (await hasOffscreenDocument()) {
            try {
                await forwardMessageToOffscreen({ type: 'REMOVE_GRAPH', tabId });
            } catch (e) { /* Ignored */ }
        }
        await chrome.storage.session.remove(`tab_settings_${tabId}`);
        return;
    }

    if (changeInfo.audible === true) {
        const isAlreadyBoosted = boostedTabs.has(tabId);
        const { [`tab_settings_${tabId}`]: sessionSettings } = await chrome.storage.session.get(`tab_settings_${tabId}`);
        if (sessionSettings && !isAlreadyBoosted) {
            const settings = await getActiveSettingsForTab(tabId, tab.url, false);
            await updateLiveSettings(tabId, settings);
        }
    }

    if (changeInfo.url && boostedTabs.has(tabId) && tab.status === 'complete') {
        const oldUrlString = boostedTabs.get(tabId);
        const newUrlString = changeInfo.url;
        if (oldUrlString && newUrlString && oldUrlString.startsWith('http') && newUrlString.startsWith('http')) {
             const oldUrl = new URL(oldUrlString);
             const newUrl = new URL(newUrlString);
             if (oldUrl.origin !== newUrl.origin) {
                 fullscreenFrames.delete(tabId);
                 try { forwardMessageToOffscreen({ type: 'REMOVE_GRAPH', tabId }); } catch (e) { /* Ignored */ }
                 startBoostingTab(tabId);
                 return;
             }
        }
    }
    if (changeInfo.mutedInfo && boostedTabs.has(tabId)) {
        handleMuteChange(tabId, changeInfo.mutedInfo.muted);
    }
});

async function handleMuteChange(tabId, isMuted) {
    if (!await isTabIdValid(tabId)) return;
    const settingsKey = `tab_settings_${tabId}`;
    const data = await chrome.storage.session.get(settingsKey);
    let settings = data[settingsKey];
    if (!settings) return;
    let settingsModified = false;
    if (isMuted) {
        if (settings.volume > 0) {
            settings.previousVolumeBeforeMute = settings.volume;
            settings.volume = 0;
            settingsModified = true;
        }
    } else {
        if (typeof settings.previousVolumeBeforeMute === 'number') {
            settings.volume = settings.previousVolumeBeforeMute;
            delete settings.previousVolumeBeforeMute;
            settingsModified = true;
        }
    }
    if (settingsModified) {
        await chrome.storage.session.set({ [settingsKey]: settings });
        await updateLiveSettings(tabId, settings);
        try { chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED', tabId: tabId, newSettings: settings }); } catch(e) {}
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (['IM_IN_FULLSCREEN', 'IM_NOT_IN_FULLSCREEN', 'MEDIA_MUTED', 'MEDIA_UNMUTED', 'SPA_NAVIGATED'].includes(message.type)) {
        const tabId = message.tabId || sender.tab?.id;
        if (message.type === 'IM_IN_FULLSCREEN' && tabId && sender.frameId) fullscreenFrames.set(tabId, sender.frameId);
        if (message.type === 'IM_NOT_IN_FULLSCREEN' && tabId && fullscreenFrames.get(tabId) === sender.frameId) fullscreenFrames.delete(tabId);
        if (message.type === 'MEDIA_MUTED' && sender.tab?.id) handleMuteChange(sender.tab.id, true);
        if (message.type === 'MEDIA_UNMUTED' && sender.tab?.id) handleMuteChange(sender.tab.id, false);
        if (message.type === 'SPA_NAVIGATED' && sender.tab?.id) {
             chrome.tabs.sendMessage(sender.tab.id, { type: 'RE_OBSERVE_MEDIA' });
        }
    } else {
        (async () => {
            try {
                const tabId = message.tabId || sender.tab?.id;

                if (message.type === 'GET_AUDIBLE_TABS') {
                    const tabs = await chrome.tabs.query({ audible: true });
                    const boostedTabs = await getBoostedTabs();
                    const tabsWithBoostState = tabs.map(t => ({...t, isBoosted: boostedTabs.has(t.id)}));
                    sendResponse({ success: true, data: { tabs: tabsWithBoostState }});
                    return;
                }

                if (message.type === 'GET_ACTIVE_SETTINGS') {
                     if (!tabId || !await isTabIdValid(tabId)) { sendResponse({ success: false, error: 'Invalid tab ID' }); return; }
                     const settings = await getActiveSettingsForTab(tabId, message.url);
                     sendResponse({ success: true, settings });
                     return;
                }
                
                if (!tabId || !await isTabIdValid(tabId)) {
                    sendResponse({ success: false, error: 'Tab not found or invalid.' });
                    return;
                }
                
                switch (message.type) {
                    case 'UPDATE_LIVE_SETTINGS':
                        await updateLiveSettings(tabId, message.settings);
                        sendResponse({ success: true });
                        break;
                    case 'UPDATE_BADGE':
                        updateBadge(tabId, message.volume);
                        sendResponse({ success: true });
                        break;
                    case 'CAPTURE_FAILED':
                        await removeBoostedTab(tabId);
                        updateBadge(tabId, '');
                        sendResponse({ success: true });
                        break;
                    case 'CAPTURE_ENDED':
                        await removeBoostedTab(tabId);
                        updateBadge(tabId, '');
                        if (await hasOffscreenDocument()) {
                            await forwardMessageToOffscreen({ type: 'REMOVE_GRAPH', tabId });
                        }
                        sendResponse({ success: true });
                        break;
                    case 'SET_SPEAKER':
                        if (await hasOffscreenDocument()) {
                            await forwardMessageToOffscreen({ type: 'SET_SPEAKER', tabId: tabId, deviceId: message.deviceId });
                        }
                        sendResponse({ success: true });
                        break;
                    default:
                        sendResponse({ success: false, error: `Unknown message type: ${message.type}` });
                        break;
                }
            } catch (error) {
                console.error("Error in onMessage listener:", error);
                try { sendResponse({ success: false, error: error.message }); } catch (e) { /* Ignore */ }
            }
        })();
        return true;
    }
});

chrome.commands.onCommand.addListener(async (command) => {
    try {
        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!currentTab || !currentTab.id || !currentTab.url || !/^(https?|file):/.test(currentTab.url)) {
            return;
        }

        if (!await isTabIdValid(currentTab.id)) return;
        let volumeChange = 0;
        if (command === 'increase-volume') volumeChange = 10;
        else if (command === 'decrease-volume') volumeChange = -10;
        else return;

        const boostedTabs = await getBoostedTabs();
        if (!boostedTabs.has(currentTab.id)) {
            await startBoostingTab(currentTab.id);
            try {
                chrome.runtime.sendMessage({ type: 'BOOST_ACTIVATED', tabId: currentTab.id });
            } catch(e) { /* The popup might not be open, which is fine */ }
        }

        const settings = await getActiveSettingsForTab(currentTab.id, currentTab.url);
        const { global_enable800Boost = true } = await chrome.storage.local.get('global_enable800Boost');
        const maxVolume = global_enable800Boost ? 800 : 600;
        let newVolume = settings.volume + volumeChange;
        newVolume = Math.max(0, Math.min(newVolume, maxVolume));

        if (newVolume !== settings.volume) {
            settings.volume = newVolume;
            await chrome.storage.session.set({ [`tab_settings_${currentTab.id}`]: settings });
            await updateLiveSettings(currentTab.id, settings);
            const frameId = fullscreenFrames.get(currentTab.id);
            const options = frameId ? { frameId: frameId } : {};
            try {
                await chrome.tabs.sendMessage(currentTab.id, { type: 'SHOW_VOLUME_HUD', volume: newVolume }, options);
            } catch (err) {
                if (!err.message.includes("Could not establish connection")) console.error("Error sending SHOW_VOLUME_HUD message:", err);
            }
            try {
                chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED', tabId: currentTab.id, newSettings: settings });
            } catch(e) {}
        }
    } catch (error) {
        console.error(`Error in onCommand: ${error.message}`);
    }
});

chrome.runtime.onStartup.addListener(() => {
    chrome.storage.session.clear();
    chrome.alarms.create(CLEANUP_ALARM_NAME, {
        delayInMinutes: 1,
        periodInMinutes: 5
    });
});

chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create(CLEANUP_ALARM_NAME, {
        delayInMinutes: 1,
        periodInMinutes: 5
    });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === CLEANUP_ALARM_NAME) {
        const boostedTabs = await getBoostedTabs();
        if (boostedTabs.size === 0) {
            return;
        }

        const allTabIds = (await chrome.tabs.query({})).map(t => t.id);
        let cleanedCount = 0;

        for (const tabId of boostedTabs.keys()) {
            if (!allTabIds.includes(tabId)) {
                console.warn(`[background.js] Cleanup: Found orphaned tabId ${tabId}. Removing.`);
                await removeBoostedTab(tabId);
                if (await hasOffscreenDocument()) {
                    await forwardMessageToOffscreen({ type: 'REMOVE_GRAPH', tabId });
                }
                await chrome.storage.session.remove(`tab_settings_${tabId}`);
                cleanedCount++;
            }
        }
    }
});