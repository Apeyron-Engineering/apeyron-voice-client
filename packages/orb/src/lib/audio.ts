import startAudioUrl from '../assets/audio/rt-ready.wav';
import pauseAudioUrl from '../assets/audio/rt-pause.wav';

export const startAudio = new Audio(startAudioUrl);
export const pauseAudio = new Audio(pauseAudioUrl);

export async function requestMicrophonePermission() {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      return true;
    } catch {
      console.error("Microphone permission denied");
      return false;
    }
  }
  


