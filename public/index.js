// required DOM elements
const buttonEl = document.getElementById("button"); // Record/Stop button
const messageEl = document.getElementById("message"); // Element to display transcription results
const titleEl = document.getElementById("real-time-title"); // Title element

// Initial state of application variables
messageEl.style.display = "none"; // Hide the message element initially
let isRecording = false; // Flag to track recording state
let microphone; // Microphone object
let audioChunks = []; // Array to store audio chunks

// Function to create and manage microphone input
function createMicrophone() {
  let stream; // Media stream from microphone
  let audioContext; // Audio context for processing audio
  let audioWorkletNode; // Audio worklet node for custom processing
  let source; // Audio source node
  let audioBufferQueue = new Int16Array(0); // Queue to store audio samples

  return {
    // Request permission to access microphone
    async requestPermission() {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    },
    // Start recording audio
    async startRecording(onAudioCallback) {
      if (!stream)
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContext = new AudioContext({
        sampleRate: 16000, // Set sample rate to 16 kHz
        latencyHint: "balanced", // Set latency hint
      });
      source = audioContext.createMediaStreamSource(stream); // Create audio source from stream

      await audioContext.audioWorklet.addModule("audio-processor.js"); // Add custom audio processor
      audioWorkletNode = new AudioWorkletNode(audioContext, "audio-processor"); // Create audio worklet node

      source.connect(audioWorkletNode); // Connect source to worklet node
      audioWorkletNode.connect(audioContext.destination); // Connect worklet node to audio context destination
      audioWorkletNode.port.onmessage = (event) => {
        const currentBuffer = new Int16Array(event.data.audio_data); // Get audio data from event
        audioBufferQueue = mergeBuffers(audioBufferQueue, currentBuffer); // Merge new data into buffer queue

        const bufferDuration =
          (audioBufferQueue.length / audioContext.sampleRate) * 1000; // Calculate buffer duration in ms

        // Wait until we have 1000ms (1 second) of audio data
        if (bufferDuration >= 1000) {
          const totalSamples = Math.floor(audioContext.sampleRate * 1); // 1 second

          const finalBuffer = new Uint8Array(
            audioBufferQueue.subarray(0, totalSamples).buffer
          );

          audioBufferQueue = audioBufferQueue.subarray(totalSamples); // Remove processed samples from queue
          if (onAudioCallback) onAudioCallback(finalBuffer); // Call the callback with the audio data
        }
      };
    },
    // Stop recording audio
    stopRecording() {
      stream?.getTracks().forEach((track) => track.stop()); // Stop all tracks
      audioContext?.close(); // Close the audio context
      audioBufferQueue = new Int16Array(0); // Reset buffer queue
    },
  };
}

// Function to merge two audio buffers
function mergeBuffers(lhs, rhs) {
  const mergedBuffer = new Int16Array(lhs.length + rhs.length);
  mergedBuffer.set(lhs, 0);
  mergedBuffer.set(rhs, lhs.length);
  return mergedBuffer;
}

// Helper function to convert buffer to WAV format
function createWavFile(int16Array, sampleRate) {
  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);

  // RIFF chunk descriptor
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + int16Array.length * 2, true); // file size - 8
  writeString(view, 8, "WAVE");

  // fmt sub-chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // size of the fmt chunk
  view.setUint16(20, 1, true); // audio format (1 = PCM)
  view.setUint16(22, 1, true); // number of channels (1 = mono)
  view.setUint32(24, sampleRate, true); // sample rate
  view.setUint32(28, sampleRate * 2, true); // byte rate (sample rate * block align)
  view.setUint16(32, 2, true); // block align (number of channels * bytes per sample)
  view.setUint16(34, 16, true); // bits per sample

  // data sub-chunk
  writeString(view, 36, "data");
  view.setUint32(40, int16Array.length * 2, true); // data chunk size

  const wavBuffer = new Uint8Array(44 + int16Array.length * 2);
  wavBuffer.set(new Uint8Array(wavHeader), 0);
  wavBuffer.set(new Uint8Array(int16Array.buffer), 44);

  return wavBuffer;
}

// Function to write string data to a DataView
function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// Helper function to send WAV file to server
async function sendWavFileToServer(wavBuffer, filename) {
  const blob = new Blob([wavBuffer], { type: "audio/wav" });
  const formData = new FormData();
  formData.append("file", blob, filename);

  try {
    const response = await fetch("/transcribe", {
      method: "POST",
      body: formData,
    });
    const result = await response.json();
    console.log(result.transcript);
    // Display the transcription result in the message element
    messageEl.style.display = "block";
    messageEl.innerText += result.transcript + "\n";
  } catch (error) {
    console.error("Error sending WAV file to server:", error);
  }
}

// Function to handle recording state and interactions
const run = async () => {
  if (isRecording) {
    if (microphone) {
      microphone.stopRecording();
      microphone = null;
    }
  } else {
    microphone = createMicrophone();
    await microphone.requestPermission();

    await microphone.startRecording((audioData) => {
      // Save audio chunks to the array
      audioChunks.push(audioData);

      // Convert audioData to WAV format and send to server
      const wavBuffer = createWavFile(new Int16Array(audioData.buffer), 16000);
      sendWavFileToServer(wavBuffer, `audio_chunk_${audioChunks.length}.wav`);
    });
  }

  isRecording = !isRecording;
  buttonEl.innerText = isRecording ? "Stop" : "Record";
  titleEl.innerText = isRecording
    ? "Click stop to end recording!"
    : "Click start to begin recording!";
};

buttonEl.addEventListener("click", () => run());
