import { useConversation } from "@apeyron-engineering/react-voice-client";

export interface OrbProps {
    hue?: number;
    hoverIntensity?: number;
    rotateOnSpeaking?: boolean;
    isSpeaking?: boolean;
    orbSize?: [number, number];
    onClick?: () => void;
    onResize?: (size: [number, number]) => void;
}

export interface OrbFrameProps {
    position?: 'bottom-right' | 'bottom-left' | 'top-left' | 'top-right';
    className?: string;
    orbSize?: [number, number];
    conversation: ReturnType<typeof useConversation>;
    startAudioConversation: () => void;
    stopAudioConversation: () => void;
}