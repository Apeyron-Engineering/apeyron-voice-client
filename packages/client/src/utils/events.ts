import { Language } from "./connection";

export type UserTranscriptionData = {
  user_transcript: string;
}

export type UserTranscriptionEvent = {
  type: "user_transcript";
  user_transcription_event: UserTranscriptionData;
};


export type AgentResponseData = {
  agent_response: string;
}

export type ChatData = {
  text: string;
}

export type ChatEvent = {
  type: "chat";
  chat_event: ChatData;
};

export type TokenData = {
  token: string;
}

export type TokenEvent = {
  type: "token";
  token_event: TokenData;
};
export type AgentResponseEvent = {
  type: "agent_response";
  agent_response_event: AgentResponseData;
};


export type AgentAudioData = {
  audio_base_64: string;
  event_id: number;
}

export type AgentAudioEvent = {
  type: "audio";
  audio_event: AgentAudioData;
};


export type InterruptionData = {
  event_id: number;
}

export type InterruptionEvent = {
  type: "interruption";
  interruption_event: InterruptionData
};


export type InternalTentativeAgentResponseData = {
  tentative_agent_response: string;
}

export type InternalTentativeAgentResponseEvent = {
  type: "internal_tentative_agent_response";
  tentative_agent_response_internal_event: InternalTentativeAgentResponseData
};

export type ConfigData = {
  conversation_id: string;
  agent_output_audio_format: string;
  user_input_audio_format?: string;
}


export type ConfigEvent = {
  type: "conversation_initiation_metadata";
  conversation_initiation_metadata_event: ConfigData
};


export type PingData = {
  event_id: number;
  ping_ms?: number;
}

export type PingEvent = {
  type: "ping";
  ping_event: PingData
};

export type ClientToolCallData = {
  tool_name: string;
  tool_call_id: string;
  parameters: any;
  expects_response: boolean;
}

export type ClientToolCallEvent = {
  type: "client_tool_call";
  client_tool_call: ClientToolCallData
};

// TODO correction missing
export type IncomingSocketEvent =
  | UserTranscriptionEvent
  | AgentResponseEvent
  | AgentAudioEvent
  | InterruptionEvent
  | InternalTentativeAgentResponseEvent
  | ConfigEvent
  | PingEvent
  | ClientToolCallEvent
  | ChatEvent
  | TokenEvent;


export type PongEvent = {
  type: "pong";
  event_id: number;
};
export type UserAudioEvent = {
  type: "user_audio";
  user_audio_chunk: string;
};
export type ClientToolResultEvent = {
  type: "client_tool_result";
  tool_call_id: string;
  result: any;
  is_error: boolean;
};
export type ChatMessageEvent = {
  type: "chat";
  text: string;
};
export type InitiationClientDataEvent = {
  type: "conversation_initiation_client_data";
  conversation_config_override?: {
    agent?: {
      prompt?: {
        prompt?: string;
      };
      first_message?: string;
      language?: Language;
    };
    tts?: {
      voice_id?: string;
    };
  };
  custom_llm_extra_body?: any;
  dynamic_variables?: Record<string, string | number | boolean>;
};
export type ContextualUpdateEvent = {
  type: "contextual_update";
  text: string;
};

export type UserAudioChunkEvent = {
  type: "user_audio_chunk";
  user_audio_chunk: string; // base64 encoded audio data
};

export type OutgoingSocketEvent =
  | PongEvent
  | UserAudioEvent
  | InitiationClientDataEvent
  | ClientToolResultEvent
  | ContextualUpdateEvent
  | UserAudioChunkEvent
  | ChatMessageEvent;
