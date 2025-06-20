import Orb from './Orb'
import { cn } from '../lib/utils';
import type { OrbFrameProps } from '../types/orb';

const positionClasses: Record<string, string> = {
    'bottom-right': 'bottom-4 right-2 md:right-8 md:bottom-8',
    'bottom-left': 'bottom-4 left-2 md:left-8 md:bottom-8',
    'top-left': 'top-4 left-2 md:left-8 md:top-8',
    'top-right': 'top-4 right-2 md:right-8 md:top-8',
};

const OrbFrame = ({ position = 'bottom-right', className, orbSize = [95, 95], conversation, startAudioConversation, stopAudioConversation }: OrbFrameProps) => {
    return (
        <div
            className={cn(
                'absolute z-50 transition-all duration-300 ease-in-out',
                positionClasses[position],
                className
            )}
        >
            <Orb
                onClick={() => {
                    if (conversation.status === "audio_connected") {
                        stopAudioConversation();
                    } else {
                        startAudioConversation();
                    }
                }}
                orbSize={orbSize}
                hue={0.25}
                rotateOnSpeaking={true}
                isSpeaking={conversation.status === "audio_connected"}
                hoverIntensity={0.25}
            />
        </div>
    );
};

export default OrbFrame;