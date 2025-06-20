import startAudioUrl from 'https://res.cloudinary.com/dnrxtasxn/video/upload/v1750415852/rt-ready_bn886o.wav';
import pauseAudioUrl from 'https://res.cloudinary.com/dnrxtasxn/video/upload/v1750415852/rt-pause_g2u8gt.wav';

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
  


