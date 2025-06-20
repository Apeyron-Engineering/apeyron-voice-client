import { base64ToArrayBuffer, float32ArrayToInt16Base64 } from "./utils/audio";
import { Input } from "./utils/input";
import { Output } from "./utils/output";
import {
  Connection,
  DisconnectionDetails,
  OnDisconnectCallback,
  SessionConfig,
} from "./utils/connection";
import { ClientToolCallEvent, IncomingSocketEvent, ImageData, NotificationData, ThoughtData, WebResultData } from "./utils/events";

export type { IncomingSocketEvent } from "./utils/events";
export type {
  SessionConfig,
  DisconnectionDetails,
  Language,
} from "./utils/connection";
export type Role = "user" | "ai";
export type Mode = "speaking" | "listening";
export type MessageType = "final_message" | "token" | "text" | "user_transcript" | "agent_response" | "image" | "notification" | "thought" | "web_results";
export type Status =
  | "connecting"
  | "connected"
  | "audio_connected"
  | "disconnecting"
  | "disconnected";
export type Options = SessionConfig &
  Callbacks &
  ClientToolsConfig;
export type ClientToolsConfig = {
  clientTools: Record<
    string,
    (
      parameters: any
    ) => Promise<string | number | void> | string | number | void
  >;
};
export type Callbacks = {
  onConnect: (props: { conversationId: string }) => void;
  // internal debug events, not to be used
  onDebug: (props: any) => void;
  onDisconnect: OnDisconnectCallback;
  onError: (message: string, context?: any) => void;
  onMessage: (props: { message: string | ImageData | NotificationData | ThoughtData | WebResultData; source: Role; type: MessageType }) => void;
  onAudio: (base64Audio: string) => void;
  onModeChange: (prop: { mode: Mode }) => void;
  onStatusChange: (prop: { status: Status }) => void;
  onUnhandledClientToolCall?: (
    params: ClientToolCallEvent["client_tool_call"]
  ) => void;
};

const defaultClientTools = { clientTools: {} };
const defaultCallbacks: Callbacks = {
  onConnect: () => { },
  onDebug: () => { },
  onDisconnect: () => { },
  onError: () => { },
  onMessage: () => { },
  onAudio: () => { },
  onModeChange: () => { },
  onStatusChange: () => { },
};

export class Conversation {

  public static async startSession(
    options: SessionConfig &
      Partial<Callbacks> &
      Partial<ClientToolsConfig>
  ): Promise<Conversation> {
    const fullOptions: Options = {
      ...defaultClientTools,
      ...defaultCallbacks,
      ...options,
    };

    fullOptions.onStatusChange({ status: "connecting" });

    let connection: Connection | null = null;

    try {
      connection = await Connection.create(options);
      const input = await Input.create();
      return new Conversation(fullOptions, connection, input, null);
    } catch (error) {
      fullOptions.onStatusChange({ status: "disconnected" });
      connection?.close();
      throw error;
    }
  }

  private mode: Mode = "listening";
  private status: Status = "connecting";
  private outputFrequencyData?: Uint8Array;
  private volume: number = 1;
  private input: Input;
  private output: Output | null;  //  Output Format Got at runtime from server

  private constructor(
    private readonly options: Options,
    private readonly connection: Connection,
    input: Input,
    output: Output | null,
  ) {
    this.input = input;
    this.output = output;
    this.options.onConnect({ conversationId: connection.conversationId });
    this.connection.onDisconnect(this.endSessionWithDetails);
    this.connection.onMessage(this.onMessage);
    if (this.output) this.output.worklet.port.onmessage = this.onOutputWorkletMessage;
    this.updateStatus("connected");

    this.input.setOnChunk(this.onInputWorkletMessage);
    this.input.setOnSpeechEnd(this.onSpeechEnd);


  }

  public endSession = () => this.endSessionWithDetails({ reason: "user" });

  private endSessionWithDetails = async (details: DisconnectionDetails) => {
    if (this.status !== "connected" && this.status !== "connecting") return;
    this.updateStatus("disconnecting");


    this.connection.close();
    this.input?.close();
    await this.output?.close();

    this.updateStatus("disconnected");
    this.options.onDisconnect(details);
  };

  private updateMode = (mode: Mode) => {
    if (mode !== this.mode) {
      this.mode = mode;
      this.options.onModeChange({ mode });
    }
  };

  private updateStatus = (status: Status) => {
    if (status !== this.status) {
      this.status = status;
      this.options.onStatusChange({ status });
    }
  };

  private onMessage = async (parsedEvent: IncomingSocketEvent) => {

    switch (parsedEvent.type) {
      case "interruption": {
        this.fadeOutAudio();
        return;
      }

      case "agent_response": {
        this.options.onMessage({
          source: "ai",
          type: "agent_response",
          message: parsedEvent.agent_response_event.agent_response,
        });
        return;
      }

      case "image": {
        this.options.onMessage({
          source: "ai",
          type: "image",
          message: parsedEvent.image_event,
        });
        return;
      }

      case "notification": {
        this.options.onMessage({
          source: "ai",
          type: "notification",
          message: parsedEvent.notification_event,
        });
        return;
      }

      case "thought": {
        this.options.onMessage({
          source: "ai",
          type: "thought",
          message: parsedEvent.thought_event,
        });
        return;
      }

      case "web_results": {
        this.options.onMessage({
          source: "ai",
          type: "web_results",
          message: parsedEvent.web_results_event,
        });
        return;
      }

      case "chat": {
        this.options.onMessage({
          source: "ai",
          type: "final_message",
          message: parsedEvent.chat_event.text,
        });
        return;
      }

      case "token": {
        this.options.onMessage({
          source: "ai",
          type: "token",
          message: parsedEvent.token_event.token,
        });
        return;
      }

      case "user_transcript": {
        this.options.onMessage({
          source: "user",
          type: "user_transcript",
          message: parsedEvent.user_transcription_event.user_transcript,
        });
        return;
      }

      case "internal_tentative_agent_response": {
        this.options.onDebug({
          type: "tentative_agent_response",
          response:
            parsedEvent.tentative_agent_response_internal_event
              .tentative_agent_response,
        });
        return;
      }

      case "client_tool_call": {
        if (
          this.options.clientTools.hasOwnProperty(
            parsedEvent.client_tool_call.tool_name
          )
        ) {
          try {
            const result =
              (await this.options.clientTools[
                parsedEvent.client_tool_call.tool_name
              ](parsedEvent.client_tool_call.parameters)) ??
              "Client tool execution successful."; // default client-tool call response

            // The API expects result to be a string, so we need to convert it if it's not already a string
            const formattedResult =
              typeof result === "object"
                ? JSON.stringify(result)
                : String(result);

            this.connection.sendMessage({
              type: "client_tool_result",
              tool_call_id: parsedEvent.client_tool_call.tool_call_id,
              result: formattedResult,
              is_error: false,
            });
          } catch (e) {
            this.onError(
              "Client tool execution failed with following error: " +
              (e as Error)?.message,
              {
                clientToolName: parsedEvent.client_tool_call.tool_name,
              }
            );
            this.connection.sendMessage({
              type: "client_tool_result",
              tool_call_id: parsedEvent.client_tool_call.tool_call_id,
              result: "Client tool execution failed: " + (e as Error)?.message,
              is_error: true,
            });
          }
        } else {
          if (this.options.onUnhandledClientToolCall) {
            this.options.onUnhandledClientToolCall(
              parsedEvent.client_tool_call
            );

            return;
          }

          this.onError(
            `Client tool with name ${parsedEvent.client_tool_call.tool_name} is not defined on client`,
            {
              clientToolName: parsedEvent.client_tool_call.tool_name,
            }
          );
          this.connection.sendMessage({
            type: "client_tool_result",
            tool_call_id: parsedEvent.client_tool_call.tool_call_id,
            result: `Client tool with name ${parsedEvent.client_tool_call.tool_name} is not defined on client`,
            is_error: true,
          });
        }

        return;
      }

      case "audio": {
        if (this.output) {
          this.options.onAudio(parsedEvent.audio_event.audio_base_64);
          this.addAudioBase64Chunk(parsedEvent.audio_event.audio_base_64);
          this.updateMode("speaking");
        }
        return;
      }

      case "ping": {
        this.connection.sendMessage({
          type: "pong",
          event_id: parsedEvent.ping_event.event_id,
        });
        // parsedEvent.ping_event.ping_ms can be used on client side, for example
        // to warn if ping is too high that experience might be degraded.
        return;
      }

      // unhandled events are expected to be internal events
      default: {
        this.options.onDebug(parsedEvent);
        return;
      }
    }
  };

  private onInputWorkletMessage = (frame: Float32Array): void => {

    if (this.status === "audio_connected") {
      this.connection.sendMessage({
        user_audio_chunk: float32ArrayToInt16Base64(frame),
        type: "user_audio_chunk",
      });
    }
  };

  private onSpeechEnd = () => {
    this.connection.sendMessage({
      type: "user_audio_commit",
    });
  }

  private onOutputWorkletMessage = ({ data }: MessageEvent): void => {
    if (data.type === "process") {
      this.updateMode(data.finished ? "listening" : "speaking");
    }
  };

  private addAudioBase64Chunk = (chunk: string) => {
    if (this.output) {
      this.output.gain.gain.value = this.volume;
      this.output.worklet.port.postMessage({ type: "clearInterrupted" });
      this.output.worklet.port.postMessage({
        type: "buffer",
        buffer: base64ToArrayBuffer(chunk),
      });
    }
  };

  private fadeOutAudio = () => {
    // mute agent
    this.updateMode("listening");
    this.output?.worklet.port.postMessage({ type: "interrupt" });
    this.output?.gain.gain.exponentialRampToValueAtTime(
      0.0001,
      this.output?.context.currentTime + 2
    );

    // reset volume back
    setTimeout(() => {
      if (this.output) {
        this.output.gain.gain.value = this.volume;
        this.output.worklet.port.postMessage({ type: "clearInterrupted" });
      }
    }, 2000); // Adjust the duration as needed
  };

  private onError = (message: string, context?: any) => {
    console.error(message, context);
    this.options.onError(message, context);
  };

  private calculateVolume = (frequencyData: Uint8Array) => {
    if (frequencyData.length === 0) {
      return 0;
    }

    // TODO: Currently this averages all frequencies, but we should probably
    // bias towards the frequencies that are more typical for human voice
    let volume = 0;
    for (let i = 0; i < frequencyData.length; i++) {
      volume += frequencyData[i] / 255;
    }
    volume /= frequencyData.length;

    return volume < 0 ? 0 : volume > 1 ? 1 : volume;
  };

  public getId = () => this.connection.conversationId;

  public isOpen = () => this.status === "connected";

  public setVolume = ({ volume }: { volume: number }) => {
    this.volume = volume;
  };


  public sendChatMessage = (message: string) => {
    this.connection.sendMessage({
      type: "chat",
      text: message,
    });
  }



  public sendFile = (file: File) => {
    this.connection.sendMessage({
      type: "file",
      file,
    });
  }


  // public getInputByteFrequencyData = () => {
  //   if (!this.input) return undefined;
  //   this.inputFrequencyData ??= new Uint8Array(
  //     this.input.analyser.frequencyBinCount
  //   );
  //   this.input.analyser.getByteFrequencyData(this.inputFrequencyData);
  //   return this.inputFrequencyData;
  // };

  public getOutputByteFrequencyData = () => {
    if (!this.output) return undefined;
    this.outputFrequencyData ??= new Uint8Array(
      this.output.analyser.frequencyBinCount
    );
    this.output.analyser.getByteFrequencyData(this.outputFrequencyData);
    return this.outputFrequencyData;
  };

  // public getInputVolume = () => {
  //   const freq = this.getInputByteFrequencyData();
  //   return freq ? this.calculateVolume(freq) : 0;
  // };

  public getOutputVolume = () => {
    const freq = this.getOutputByteFrequencyData();
    return freq ? this.calculateVolume(freq) : 0;
  };

  public sendContextualUpdate = (text: string) => {
    this.connection.sendMessage({
      type: "contextual_update",
      text,
    });
  };


  public async initializeAudioIOAndEmit() {
    try {
      this.connection.socket.emit("voice_conversation_client_data");

      await new Promise<void>((resolve, reject) => {
        this.connection.onFormats(async ({ inputFormat, outputFormat }) => {
          try {
            if (!this.output) {
              this.output = await Output.create(outputFormat);
              this.output.worklet.port.onmessage = this.onOutputWorkletMessage;
            }
            if (this.input) {
              this.input.start();
            } else {
              // Technically we don't need to create it because it's created in the constructor
              this.input = await Input.create();
            }
            this.updateStatus("audio_connected");
            resolve();
          } catch (err) {
            this.output?.close();
            this.updateStatus("disconnected");
            reject(err);
          }
        });
      });
    } catch (error) {
      await this.output?.close();
      this.updateStatus("disconnected");
      throw error;
    }
  }

  public async disconnectAudioIO() {
    try {
      if (this.input) {
        this.input.pause();
      }
      if (this.output) {
        this.output.worklet.port.onmessage = null;
        await this.output.close();
        this.output = null;
      }
      this.connection.socket.emit("interrupt");
      this.updateStatus("connected");
    } catch (error) {
      this.onError("Errore durante la disconnessione audio", error);
      this.updateStatus("connected");
    }
  }
}

