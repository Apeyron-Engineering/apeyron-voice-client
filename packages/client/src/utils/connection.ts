import {
  InitiationClientDataEvent,
  ConfigEvent,
  OutgoingSocketEvent,
  IncomingSocketEvent,
  UserTranscriptionData,
  AgentResponseData,
  AgentAudioData,
  InterruptionData,
  InternalTentativeAgentResponseData,
  PingData,
  ClientToolCallData,
  ChatData,
  TokenData,
  NotificationData,
  ImageData,
  ThoughtData
} from "./events";
import { io, Socket } from "socket.io-client";

export type Language =
  | "en"
  | "ja"
  | "zh"
  | "de"
  | "hi"
  | "fr"
  | "ko"
  | "pt"
  | "pt-br"
  | "it"
  | "es"
  | "id"
  | "nl"
  | "tr"
  | "pl"
  | "sv"
  | "bg"
  | "ro"
  | "ar"
  | "cs"
  | "el"
  | "fi"
  | "ms"
  | "da"
  | "ta"
  | "uk"
  | "ru"
  | "hu"
  | "no"
  | "vi";

export type SessionConfig = {
  apiUrl: string;
  authorization?: string;
  overrides?: {
    agent?: {
      prompt?: {
        prompt?: string;
      };
      firstMessage?: string;
      language?: Language;
    };
    tts?: {
      voiceId?: string;
    };
  };
  customLlmExtraBody?: any;
  dynamicVariables?: Record<string, string | number | boolean>;
  useWakeLock?: boolean;
  connectionDelay?: {
    default: number;
    android?: number;
    ios?: number;
  };
};

export type FormatConfig = {
  format: "pcm" | "ulaw";
  sampleRate: number;
};

export type DisconnectionDetails =
  | {
    reason: "error";
    message: string;
    context: Event | any;
  }
  | {
    reason: "agent";
    context: CloseEvent | any;
  }
  | {
    reason: "user";
  };

export type OnDisconnectCallback = (details: DisconnectionDetails) => void;
export type OnMessageCallback = (event: IncomingSocketEvent) => void;
export type OnFormatsCallback = (formats: { inputFormat: FormatConfig, outputFormat: FormatConfig }) => void;
export class Connection {
  public static async create(config: SessionConfig): Promise<Connection> {
    const socket: Socket = io(config.apiUrl, {
      transports: ["websocket"], auth: {
        token: config.authorization
      }
    });

    return new Promise<Connection>((resolve, reject) => {
      socket.on("connect", () => {
        resolve(new Connection(socket, socket.id ?? ""));
      });

      socket.on("connect_error", (err: any) => {
        setTimeout(() => reject(err), 0);
      });

      socket.on("disconnect", (reason: string) => {
        reject(new Error(`Socket disconnected: ${reason}`));
      });


    }).catch((err) => {
      socket.disconnect();
      throw err;
    });
  }

  private queue: IncomingSocketEvent[] = [];
  private disconnectionDetails: DisconnectionDetails | null = null;
  private onDisconnectCallback: OnDisconnectCallback | null = null;
  private onMessageCallback: OnMessageCallback | null = null;
  private onFormatsCallback: ((formats: { inputFormat: FormatConfig, outputFormat: FormatConfig }) => void) | null = null;
  public inputFormat: FormatConfig | null = null;
  public outputFormat: FormatConfig | null = null;

  private constructor(
    public readonly socket: Socket,
    public readonly conversationId: string,
  ) {
    this.socket.on("error", (error: any) => {
      setTimeout(() => {
        this.disconnect({
          reason: "error",
          message:
            "La connessione è stata chiusa a causa di un errore di socket.",
          context: error,
        });
      }, 0);
    });

    this.socket.once("voice_conversation_metadata", (data: ConfigEvent) => {

      this.inputFormat = parseFormat(data.conversation_initiation_metadata_event.user_input_audio_format);
      this.outputFormat = parseFormat(data.conversation_initiation_metadata_event.agent_output_audio_format);
      this.onFormatsCallback?.({ inputFormat: this.inputFormat, outputFormat: this.outputFormat });
    })

    this.socket.on("disconnect", (reason: string) => {
      const event = {
        code: 1000,
        reason,
        wasClean: true,
      } as CloseEvent;
      if (reason === "io client disconnect") {
        this.disconnect({ reason: "user" });
      } else {
        this.disconnect({
          reason: "agent",
          context: event,
        });
      }
    });

    this.socket.on("message", (data: any) => {
      try {

        if (this.onMessageCallback) {
          this.onMessageCallback(data);
        } else {
          this.queue.push(data);
        }
      } catch (_) { }
    });

    this.socket.on("agent_response", (data: AgentResponseData) => this.handleIncoming({
      type: "agent_response",
      agent_response_event: data,
    }));

    this.socket.on("chat", (data: ChatData) => this.handleIncoming({
      type: "chat",
      chat_event: data,
    }));

    this.socket.on("token", (data: TokenData) => this.handleIncoming({
      type: "token",
      token_event: data,
    }));

    this.socket.on("user_transcript", (data: UserTranscriptionData) => this.handleIncoming({
      type: "user_transcript",
      user_transcription_event: data,
    }));

    this.socket.on("image", (data: ImageData) => this.handleIncoming({
      type: "image",
      image_event: data,
    }));

    this.socket.on("notification", (data: NotificationData) => this.handleIncoming({
      type: "notification",
      notification_event: data,
    }));

    this.socket.on("thought", (data: ThoughtData) => this.handleIncoming({
      type: "thought",
      thought_event: data,
    }));

    this.socket.on("audio", (data: AgentAudioData) => this.handleIncoming({
      type: "audio",
      audio_event: data
    }));

    this.socket.on("interruption", (data: InterruptionData) => this.handleIncoming({
      type: "interruption",
      interruption_event: data,
    }));

    this.socket.on("internal_tentative_agent_response", (data: InternalTentativeAgentResponseData) => this.handleIncoming({
      type: "internal_tentative_agent_response",
      tentative_agent_response_internal_event: data,
    }));

    this.socket.on("ping", (data: PingData) => this.handleIncoming({
      type: "ping",
      ping_event: data,
    }));

    this.socket.on("client_tool_call", (data: ClientToolCallData) => this.handleIncoming({
      type: "client_tool_call",
      client_tool_call: data,
    }));



  }

  private handleIncoming(event: IncomingSocketEvent) {
    if (this.onMessageCallback) {
      this.onMessageCallback(event);
    } else {
      this.queue.push(event);
    }
  }

  public close() {
    this.socket.disconnect();
  }

  public sendMessage(message: OutgoingSocketEvent) {
    const { type, ...data } = message
    this.socket.emit(type, data);
  }

  public onMessage(callback: OnMessageCallback) {
    this.onMessageCallback = callback;
    this.queue.forEach(callback);
    this.queue = [];
  }

  public onDisconnect(callback: OnDisconnectCallback) {
    this.onDisconnectCallback = callback;
    if (this.disconnectionDetails) {
      callback(this.disconnectionDetails);
    }
  }

  public onFormats(callback: OnFormatsCallback) {
    this.onFormatsCallback = callback;
    if (this.inputFormat && this.outputFormat) {
      callback({ inputFormat: this.inputFormat, outputFormat: this.outputFormat });
    }
  }

  private disconnect(details: DisconnectionDetails) {
    if (!this.disconnectionDetails) {
      this.disconnectionDetails = details;
      this.onDisconnectCallback?.(details);
    }
  }
}

function parseFormat(format: string): FormatConfig {
  const [formatPart, sampleRatePart] = format.split("_");
  if (formatPart !== "pcm" && formatPart !== "ulaw") {
    throw new Error(`Formato non valido: ${format}`);
  }

  const sampleRate = parseInt(sampleRatePart);
  if (isNaN(sampleRate)) {
    throw new Error(`Frequenza di campionamento non valida: ${sampleRatePart}`);
  }

  return {
    format: formatPart as FormatConfig["format"],
    sampleRate,
  };
}
