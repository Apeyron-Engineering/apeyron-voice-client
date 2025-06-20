
const startAudioUrl = 'https://res.cloudinary.com/dnrxtasxn/video/upload/v1750415852/rt-ready_bn886o.wav';
const pauseAudioUrl = 'https://res.cloudinary.com/dnrxtasxn/video/upload/v1750415852/rt-pause_g2u8gt.wav';

function createAudio(url: string): HTMLAudioElement | null {
  if (typeof window === 'undefined') {
    return null;
  }
  return new Audio(url);
}

export const getStartAudio = () => createAudio(startAudioUrl);
export const getPauseAudio = () => createAudio(pauseAudioUrl);

export async function requestMicrophonePermission() {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      return true;
    } catch {
      console.error("Microphone permission denied");
      return false;
    }
}
  


