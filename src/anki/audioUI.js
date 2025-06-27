// src/ui/audioUI.js
import * as dom from './anki_dom.js';

let currentAudioUtterance = null;
let audioProgressInterval = null;

function updateAudioProgress() {
    // Note: SpeechSynthesisUtterance doesn't provide progress events.
    // This is a simulation and may not be accurate.
    if (!currentAudioUtterance || !currentAudioUtterance.startTime) return;
    const elapsed = (Date.now() - currentAudioUtterance.startTime) / 1000;
    const estimatedDuration = currentAudioUtterance.text.length / 10; // Rough estimate
    const progress = Math.min(100, (elapsed / estimatedDuration) * 100);
    dom.audioProgress.style.width = `${progress}%`;
}

export function playMultimedia(text) {
    if (!('speechSynthesis' in window)) {
        alert("抱歉，您的浏览器不支持语音合成。");
        return;
    }
    stopAudio(); // Stop any previous speech

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 1.0;
    
    utterance.onstart = () => {
        utterance.startTime = Date.now();
        audioProgressInterval = setInterval(updateAudioProgress, 100);
    };

    utterance.onend = () => {
        stopAudio();
    };

    currentAudioUtterance = utterance;
    dom.audioTitle.textContent = `正在播放: ${text.substring(0, 30)}${text.length > 30 ? '...' : ''}`;
    dom.audioControls.style.display = 'block';
    
    window.speechSynthesis.speak(utterance);
}

export function pauseAudio() {
    if (window.speechSynthesis.speaking) {
        window.speechSynthesis.pause();
        clearInterval(audioProgressInterval);
    }
}

export function resumeAudio() {
    if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        audioProgressInterval = setInterval(updateAudioProgress, 100);
    }
}

export function stopAudio() {
    window.speechSynthesis.cancel();
    if (audioProgressInterval) clearInterval(audioProgressInterval);
    dom.audioControls.style.display = 'none';
    dom.audioProgress.style.width = '0%';
    currentAudioUtterance = null;
}