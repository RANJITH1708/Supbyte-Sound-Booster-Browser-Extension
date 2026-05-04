// keep-alive-processor.js
class KeepAliveProcessor extends AudioWorkletProcessor {
    process(inputs, outputs, parameters) {
        // This processor does nothing but return true to keep the audio context alive.
        return true;
    }
}

registerProcessor('keep-alive-processor', KeepAliveProcessor);