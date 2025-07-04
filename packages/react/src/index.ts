import { useEffect, useRef, useState } from "react";
import {
  Conversation,
  Mode,
  SessionConfig,
  Callbacks,
  Options,
  Status,
  ClientToolsConfig,
} from "@apeyron-engineering/voice-client";

export type {
  Role,
  Mode,
  Status,
  SessionConfig,
  DisconnectionDetails,
  Language,
} from "@apeyron-engineering/voice-client";

export type HookOptions = Partial<
  SessionConfig & HookCallbacks & ClientToolsConfig
>;
export type ControlledState = {
  micMuted?: boolean;
  volume?: number;
};
export type HookCallbacks = Pick<
  Callbacks,
  | "onConnect"
  | "onDisconnect"
  | "onError"
  | "onMessage"
  | "onAudio"
  | "onDebug"
  | "onUnhandledClientToolCall"
>;

export function useConversation<T extends HookOptions & ControlledState>(
  props: T = {} as T
) {
  const { micMuted, volume, ...defaultOptions } = props;
  const conversationRef = useRef<Conversation | null>(null);
  const lockRef = useRef<Promise<Conversation> | null>(null);
  const [status, setStatus] = useState<Status>("disconnected");
  const [mode, setMode] = useState<Mode>("listening");


  useEffect(() => {
    if (volume !== undefined) {
      conversationRef?.current?.setVolume({ volume });
    }
  }, [volume]);

  useEffect(() => {
    return () => {
      conversationRef.current?.endSession();
    };
  }, []);

  return {
  

    startSession: (async (options?: HookOptions) => {
      if (conversationRef.current?.isOpen()) {
        return conversationRef.current.getId();
      }

      if (lockRef.current) {
        const conversation = await lockRef.current;
        return conversation.getId();
      }

      try {
        lockRef.current = Conversation.startSession({
          ...(defaultOptions ?? {}),
          ...(options ?? {}),
          onModeChange: ({ mode }) => {
            setMode(mode);
          },
          onStatusChange: ({ status }) => {
            setStatus(status);
          },
        } as Options);

        conversationRef.current = await lockRef.current;
        return conversationRef.current.getId();
      } finally {
        lockRef.current = null;
      }
    }) as T extends SessionConfig
      ? (options?: HookOptions) => Promise<string>
      : (options: SessionConfig & HookOptions) => Promise<string>,

    endSession: async () => {
      const conversation = conversationRef.current;
      conversationRef.current = null;
      await conversation?.endSession();
    },
    initializeAudioIOAndEmit: async () => {
      await conversationRef.current?.initializeAudioIOAndEmit();
    },
    disconnectAudioIO: async () => {
      await conversationRef.current?.disconnectAudioIO();
    },
    setVolume: ({ volume }: { volume: number }) => {
      conversationRef.current?.setVolume({ volume });
    },
    getOutputByteFrequencyData: () => {
      return conversationRef.current?.getOutputByteFrequencyData();
    },
    sendChatMessage: (message: string) => {
      conversationRef.current?.sendChatMessage(message);
    },
    sendFile: (file: File) => {
      conversationRef.current?.sendFile(file);
    },
    getOutputVolume: () => {
      return conversationRef.current?.getOutputVolume() ?? 0;
    },
    getId: () => {
      return conversationRef.current?.getId();
    },
    sendContextualUpdate: (text: string) => {
      conversationRef.current?.sendContextualUpdate(text);
    },
    status,
    micMuted,
    isSpeaking: mode === "speaking",
  };
}
