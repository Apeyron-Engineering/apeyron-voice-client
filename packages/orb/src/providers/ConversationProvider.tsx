import { createContext, useContext, useEffect, useCallback } from "react";
import { useConversation as useRawConversation } from "@apeyron-engineering/react-voice-client";
import { requestMicrophonePermission, startAudio, pauseAudio } from "../lib/audio";


interface ConversationContextValue {
  startAudioConversation: () => Promise<void>;
  stopAudioConversation: () => Promise<void>;
  conversation: ReturnType<typeof useRawConversation>;
}

const ConversationContext = createContext<ConversationContextValue | undefined>(undefined);

export function ConversationProvider({ children, authToken, apiUrl }: {children: React.ReactNode, authToken: string, apiUrl: string }) {


  const conversation = useRawConversation({
    apiUrl: apiUrl,
    authorization: authToken,
    connectionDelay: {
      default: 0,
      android: 1500,
      ios: 1500
    }
  });

  useEffect(() => {
    conversation.startSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startAudioConversation = useCallback(async () => {
    const hasPermission = await requestMicrophonePermission();
    if (!hasPermission) {
      alert("No permission");
      return;
    }
    startAudio.play();
    await conversation.initializeAudioIOAndEmit();
  }, [conversation]);

  const stopAudioConversation = useCallback(async () => {
    pauseAudio.play();
    await conversation.disconnectAudioIO();
  }, [conversation]);

  return (
    <ConversationContext.Provider value={{
      startAudioConversation,
      stopAudioConversation,
      conversation,
    }}>
      {children}
    </ConversationContext.Provider>
  );
}

export function useConversationContext() {
  const ctx = useContext(ConversationContext);
  if (!ctx) throw new Error("useConversationContext must be used within ConversationProvider");
  return ctx;
} 