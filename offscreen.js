// offscreen.js - Sound Booster inspired audio chain

console.log(`[OFFSCREEN] Script loaded at ${new Date().toLocaleTimeString()}`);

// Shared AudioContext (like old Sound Booster)
let sharedAudioContext = null;

function getSharedAudioContext() {
    if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
        console.log(`[OFFSCREEN] Creating shared AudioContext.`);
        sharedAudioContext = new AudioContext();
    }
    return sharedAudioContext;
}

// Per-tab audio graphs
const audioGraphs = new Map();

// Sound Booster inspired configuration
const ANALYSER_CONFIG = {
    FFT_SIZE: 128,
    INTERVAL: 1000 / 30, // 30 FPS
    BEFORE_ENABLED: true,
    AFTER_ENABLED: true
};



// Sound Booster's efficient audio graph creation
async function createAudioGraph(tabId, streamId, settings, deviceId) {
    console.log(`[OFFSCREEN] CREATE_GRAPH called for tabId: ${tabId}. DeviceId: ${deviceId}`, { settings });
    if (audioGraphs.has(tabId)) {
        console.warn(`[OFFSCREEN] Graph for tabId: ${tabId} already exists. Removing old one.`);
        removeAudioGraph(tabId);
    }

    try {
        // Get shared AudioContext
        const context = getSharedAudioContext();
        if (context.state === 'suspended') {
            await context.resume();
        }
        console.log(`[OFFSCREEN] Using shared AudioContext for tabId: ${tabId}, state: ${context.state}`);

        // Capture media stream
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'tab',
                    chromeMediaSourceId: streamId
                }
            }
        });
        console.log(`[OFFSCREEN] Media stream captured for tabId: ${tabId}.`);

        // Create HTML audio element for device switching
        const player = document.createElement('audio');
        player.id = `player-${tabId}`;
        document.body.appendChild(player);
        if (deviceId && deviceId !== 'default') {
            await player.setSinkId(deviceId).catch(e => console.error("[OFFSCREEN] Failed to set initial sinkId", e));
        }

        // Create MediaStreamDestination for routing audio to player
        const destinationNode = context.createMediaStreamDestination();
        player.srcObject = destinationNode.stream;
        player.play().catch(e => console.error(`[OFFSCREEN] Audio playback failed for tab ${tabId}:`, e));

        // Create audio nodes
        const sourceNode = context.createMediaStreamSource(stream);

        // Dual analyser nodes for visual feedback
        const analyserBefore = context.createAnalyser();
        analyserBefore.fftSize = ANALYSER_CONFIG.FFT_SIZE;

        const gainNode = context.createGain();

        // Single, configurable BiquadFilter
        const biquadFilter = context.createBiquadFilter();
        biquadFilter.type = 'peaking';
        biquadFilter.frequency.value = 1000;
        biquadFilter.Q.value = 1;
        biquadFilter.gain.value = 0;

        const analyserAfter = context.createAnalyser();
        analyserAfter.fftSize = ANALYSER_CONFIG.FFT_SIZE;

        // Audio chain: Source -> Analyser Before -> Gain -> Filter -> Analyser After -> Destination
        sourceNode.connect(analyserBefore);
        analyserBefore.connect(gainNode);
        gainNode.connect(biquadFilter);
        biquadFilter.connect(analyserAfter);
        analyserAfter.connect(destinationNode);

        // Store graph nodes
        const graphNodes = {
            context,
            sourceNode,
            analyserBefore,
            gainNode,
            biquadFilter,
            analyserAfter,
            stream,
            streamId,
            deviceId,
            settings,
            tabId,
            player,
            destinationNode
        };

        audioGraphs.set(tabId, graphNodes);
        console.log(`[OFFSCREEN] Graph created for tabId: ${tabId}. Applying settings...`);

        // Apply initial settings
        applySettingsToGraph(tabId, settings);

        // Handle stream cleanup
        stream.getTracks()[0].onended = () => {
            console.log(`[OFFSCREEN] Stream 'onended' event for tabId: ${tabId}.`);
            chrome.runtime.sendMessage({ type: 'CAPTURE_ENDED', tabId });
        };

    } catch (error) {
        console.error(`[OFFSCREEN] FATAL ERROR during createAudioGraph for tabId: ${tabId}:`, error);
        chrome.runtime.sendMessage({ type: 'CAPTURE_FAILED', tabId, error: error.message });
    }
}

// Graph removal with player cleanup
async function removeAudioGraph(tabId) {
    console.log(`[OFFSCREEN] REMOVE_GRAPH called for tabId: ${tabId}.`);
    const graph = audioGraphs.get(tabId);
    if (graph) {
        // Fade out over 50ms
        const now = graph.context.currentTime;
        graph.gainNode.gain.setValueAtTime(graph.gainNode.gain.value, now);
        graph.gainNode.gain.linearRampToValueAtTime(0, now + 0.05);
        await new Promise(resolve => setTimeout(resolve, 50));

        // Disconnect all nodes properly
        try {
            graph.sourceNode.disconnect();
            graph.analyserBefore.disconnect();
            graph.gainNode.disconnect();
            graph.biquadFilter.disconnect();
            graph.analyserAfter.disconnect();
        } catch (e) {
            console.warn(`[OFFSCREEN] Error disconnecting nodes: ${e.message}`);
        }

        // Clean up stream
        try {
            graph.stream.getTracks().forEach(track => track.stop());
        } catch (e) {
            console.warn(`[OFFSCREEN] Error stopping stream: ${e.message}`);
        }

        // Clean up player
        try {
            if (graph.player) {
                graph.player.srcObject = null;
                graph.player.remove();
            }
        } catch (e) {
            console.warn(`[OFFSCREEN] Error cleaning up player: ${e.message}`);
        }

        // Remove from storage
        audioGraphs.delete(tabId);
        console.log(`[OFFSCREEN] Cleanup complete for tabId: ${tabId}.`);

        // Close shared AudioContext if no graphs remain
        if (audioGraphs.size === 0 && sharedAudioContext && sharedAudioContext.state !== 'closed') {
            console.log('[OFFSCREEN] Last graph removed. Closing shared AudioContext.');
            sharedAudioContext.close();
            sharedAudioContext = null;
        }
    } else {
        console.warn(`[OFFSCREEN] removeAudioGraph called for tabId ${tabId}, but no graph found.`);
    }
}

// Sound Booster inspired settings application
function applySettingsToGraph(tabId, settings) {
    const graph = audioGraphs.get(tabId);
    if (!graph || !settings) {
        console.error(`[OFFSCREEN] Cannot apply settings for tabId: ${tabId}. Missing graph or settings.`);
        return;
    }

    // Update stored settings
    graph.settings = { ...graph.settings, ...settings };

    const now = graph.context.currentTime;

    // Apply gain/volume (immediate setting for instant switching)
    const isMuted = settings.volume === 0;
    const gainValue = isMuted ? 0 : settings.volume / 100;
    if (isFinite(gainValue)) {
        graph.gainNode.gain.setValueAtTime(gainValue, now);
    }

    // Apply equalizer settings (immediate setting)
    if (settings.equalizer) {
        const { algorithm, frequency, q, gain } = settings.equalizer;
        if (algorithm) graph.biquadFilter.type = algorithm;
        if (isFinite(frequency)) graph.biquadFilter.frequency.setValueAtTime(frequency, now);
        if (isFinite(q)) graph.biquadFilter.Q.setValueAtTime(q, now);
        if (isFinite(gain)) graph.biquadFilter.gain.setValueAtTime(gain, now);
    }
}

// Sound Booster inspired message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.target !== 'offscreen') {
        return; 
    }
    
    console.log(`[OFFSCREEN] Message received: ${message.type} for tabId: ${message.tabId}`);
    
    const handler = async () => {
        switch (message.type) {
            case 'CREATE_GRAPH':
                await createAudioGraph(message.tabId, message.streamId, message.settings, message.deviceId);
                return { success: true };
                
            case 'REMOVE_GRAPH':
                await removeAudioGraph(message.tabId);
                return { success: true };
                
            case 'UPDATE_LIVE_SETTINGS':
                applySettingsToGraph(message.tabId, message.settings);
                return { success: true };
                
            case 'SET_SPEAKER':
                // Switch device using setSinkId
                const speakerGraph = audioGraphs.get(message.tabId);
                if (speakerGraph && speakerGraph.player && message.deviceId) {
                    try {
                        await speakerGraph.player.setSinkId(message.deviceId);
                        speakerGraph.deviceId = message.deviceId; // Update stored deviceId
                        console.log(`[OFFSCREEN] Successfully switched device for tabId: ${message.tabId} to ${message.deviceId}`);
                    } catch (error) {
                        console.error(`[OFFSCREEN] FAILED to set sinkId for tab ${message.tabId}. Error:`, error);
                    }
                }
                return { success: true };

            case 'GET_AUDIO_DATA':
                // Sound Booster style audio data retrieval
                const analyserGraph = audioGraphs.get(message.tabId);
                if (analyserGraph && message.analyserType === 'before') {
                    const dataArray = new Uint8Array(analyserGraph.analyserBefore.frequencyBinCount);
                    analyserGraph.analyserBefore.getByteFrequencyData(dataArray);
                    return {
                        dataArray: Array.from(dataArray),
                        bufferLength: analyserGraph.analyserBefore.frequencyBinCount,
                        sampleRate: analyserGraph.context.sampleRate
                    };
                } else if (analyserGraph && message.analyserType === 'after') {
                    const dataArray = new Uint8Array(analyserGraph.analyserAfter.frequencyBinCount);
                    analyserGraph.analyserAfter.getByteFrequencyData(dataArray);
                    return {
                        dataArray: Array.from(dataArray),
                        bufferLength: analyserGraph.analyserAfter.frequencyBinCount,
                        sampleRate: analyserGraph.context.sampleRate
                    };
                }
                return null;
                
            default:
                return { success: false, error: 'Unknown message type' };
        }
    };

    handler().then(response => {
        sendResponse(response);
    }).catch(err => {
        sendResponse({ success: false, error: err.message });
    });
    
    return true; // Keep message channel open for async response
});

// Setup keep-alive mechanism using AudioWorklet
async function setupKeepAlive() {
    const context = getSharedAudioContext();
    if (context.state === 'suspended') {
        await context.resume();
    }
    await context.audioWorklet.addModule('keep-alive-processor.js');
    const keepAliveNode = new AudioWorkletNode(context, 'keep-alive-processor');
    keepAliveNode.connect(context.destination);
}

// Initialize the offscreen document
async function initialize() {
    console.log('[OFFSCREEN] Initializing with shared AudioContext and HTML audio elements for device switching.');
    await setupKeepAlive();
    console.log('[OFFSCREEN] Initialization complete.');
}

initialize();
