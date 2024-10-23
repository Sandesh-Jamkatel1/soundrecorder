let bgMusic = null;
let bgAudio = new Audio();
let recordedAudio = document.getElementById('recorded-audio');
let mixedAudio = document.getElementById('mixed-audio');
let bgVolume = document.getElementById('bg-volume');
let voiceVolume = document.getElementById('voice-volume');
let mediaRecorder, recordedChunks = [], audioBlob = null;

// Background Music Controls
document.getElementById('bg-music').addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (file) {
        bgMusic = URL.createObjectURL(file);
        bgAudio.src = bgMusic;
        document.getElementById('play-bg').disabled = false;
        document.getElementById('pause-bg').disabled = false;
        document.getElementById('stop-bg').disabled = false;
    }
});

document.getElementById('play-bg').addEventListener('click', function() {
    if (bgAudio.src) bgAudio.play();
});

document.getElementById('pause-bg').addEventListener('click', function() {
    bgAudio.pause();
});

document.getElementById('stop-bg').addEventListener('click', function() {
    bgAudio.pause();
    bgAudio.currentTime = 0;
});

bgVolume.addEventListener('input', function() {
    bgAudio.volume = this.value;
});

// Voice Recording Controls
navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    mediaRecorder = new MediaRecorder(stream);
    
    mediaRecorder.ondataavailable = function(event) {
        recordedChunks.push(event.data);
    };
    
    mediaRecorder.onstop = function() {
        audioBlob = new Blob(recordedChunks, { type: 'audio/wav' });
        recordedAudio.src = URL.createObjectURL(audioBlob);
        document.getElementById('mix-sound').disabled = false;
        document.getElementById('download-mix').disabled = true;
    };
});

document.getElementById('record-voice').addEventListener('click', function() {
    recordedChunks = [];
    mediaRecorder.start();
    document.getElementById('stop-recording').disabled = false;
});

document.getElementById('stop-recording').addEventListener('click', function() {
    mediaRecorder.stop();
    document.getElementById('stop-recording').disabled = true;
});

voiceVolume.addEventListener('input', function() {
    recordedAudio.volume = this.value;
});

// Mixing Sound
document.getElementById('mix-sound').addEventListener('click', function() {
    if (!bgAudio.src || !audioBlob) {
        alert('Please upload background music and record your voice first!');
        return;
    }

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // Fetch background music and recorded voice
    Promise.all([
        fetch(bgMusic).then(res => res.arrayBuffer()).then(buf => audioContext.decodeAudioData(buf)),
        audioBlob.arrayBuffer().then(buf => audioContext.decodeAudioData(buf))
    ]).then(([bgBuffer, voiceBuffer]) => {
        // Create a new buffer for the mixed output
        const mixDuration = Math.min(voiceBuffer.duration, bgBuffer.duration);
        const outputBuffer = audioContext.createBuffer(2, audioContext.sampleRate * mixDuration, audioContext.sampleRate);

        // Fill the buffer with the mix of background music and recorded voice
        for (let channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
            const outputData = outputBuffer.getChannelData(channel);
            const bgData = bgBuffer.getChannelData(channel);
            const voiceData = voiceBuffer.getChannelData(channel);

            for (let i = 0; i < outputData.length; i++) {
                outputData[i] = (bgData[i % bgData.length] * 0.4) + (voiceData[i] * 1);
            }
        }

        // Create an offline audio context to render the mixed buffer
        const mixOfflineContext = new OfflineAudioContext(2, outputBuffer.length, outputBuffer.sampleRate);
        const mixSource = mixOfflineContext.createBufferSource();
        mixSource.buffer = outputBuffer;
        mixSource.connect(mixOfflineContext.destination);
        mixSource.start();

        mixOfflineContext.startRendering().then(renderedBuffer => {
            // Convert the rendered buffer to a playable audio blob
            const wavBlob = bufferToWave(renderedBuffer);
            mixedAudio.src = URL.createObjectURL(wavBlob);
            document.getElementById('download-mix').disabled = false;

            // Play the mixed audio
            mixedAudio.play();
        });
    });
});

// Function to convert AudioBuffer to WAV format
function bufferToWave(buffer) {
    let length = buffer.length * buffer.numberOfChannels * 2 + 44;
    let wav = new ArrayBuffer(length);
    let view = new DataView(wav);

    // Write WAV header
    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + buffer.length * buffer.numberOfChannels * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, buffer.numberOfChannels, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * 4, true);
    view.setUint16(32, buffer.numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, buffer.length * buffer.numberOfChannels * 2, true);

    // Write PCM samples
    let offset = 44;
    for (let i = 0; i < buffer.length; i++) {
        for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            let sample = buffer.getChannelData(channel)[i];
            sample = Math.max(-1, Math.min(1, sample));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            offset += 2;
        }
    }

    return new Blob([view], { type: 'audio/wav' });
}

// Download Mixed Sound
document.getElementById('download-mix').addEventListener('click', function() {
    const link = document.createElement('a');
    link.href = mixedAudio.src;
    link.download = 'mixed_audio.wav';
    link.click();
});
