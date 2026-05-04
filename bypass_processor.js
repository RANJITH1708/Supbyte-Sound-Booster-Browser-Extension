// bypass_processor.js
class BypassProcessor extends AudioWorkletProcessor {
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    for (let channel = 0; channel < input.length; channel++) {
      if (input[channel]) {
        output[channel].set(input[channel]);
      }
    }
    return true;
  }
}
registerProcessor('bypass-processor', BypassProcessor);