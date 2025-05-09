import { arrayBufferToBase64, base64ToArrayBuffer } from "./utils/audio";
import { Input, InputConfig } from "./utils/input";
import { Output } from "./utils/output";
import {
  Connection,
  DisconnectionDetails,
  OnDisconnectCallback,
  SessionConfig,
} from "./utils/connection";
import { ClientToolCallEvent, IncomingSocketEvent } from "./utils/events";
import { isAndroidDevice, isIosDevice } from "./utils/compatibility";

export type { InputConfig } from "./utils/input";
export type { IncomingSocketEvent } from "./utils/events";
export type {
  SessionConfig,
  DisconnectionDetails,
  Language,
} from "./utils/connection";
export type Role = "user" | "ai";
export type Mode = "speaking" | "listening";
export type Status =
  | "connecting"
  | "connected"
  | "audio_connected"
  | "disconnecting"
  | "disconnected";
export type Options = SessionConfig &
  Callbacks &
  ClientToolsConfig &
  InputConfig;
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
  onMessage: (props: { message: string; source: Role; type?: "final_message" | "token" | "text" | "user_transcript" | "agent_response" }) => void;
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
  // public static async startSession(
  //   options: SessionConfig &
  //     Partial<Callbacks> &
  //     Partial<ClientToolsConfig> &
  //     Partial<InputConfig>
  // ): Promise<Conversation> {
  //   const fullOptions: Options = {
  //     ...defaultClientTools,
  //     ...defaultCallbacks,
  //     ...options,
  //   };

  //   fullOptions.onStatusChange({ status: "connecting" });

  //   let input: Input | null = null;
  //   let connection: Connection | null = null;
  //   let output: Output | null = null;
  //   let preliminaryInputStream: MediaStream | null = null;

  //   let wakeLock: WakeLockSentinel | null = null;
  //   if (options.useWakeLock ?? true) {
  //     try {
  //       wakeLock = await navigator.wakeLock.request("screen");
  //     } catch (e) {
  //       // Wake Lock is not required for the conversation to work
  //     }
  //   }

  //   try {
  //     // some browsers won't allow calling getSupportedConstraints or enumerateDevices
  //     // before getting approval for microphone access
  //     preliminaryInputStream = await navigator.mediaDevices.getUserMedia({
  //       audio: true,
  //     });

  //     const delayConfig = options.connectionDelay ?? {
  //       default: 0,
  //       // Give the Android AudioManager enough time to switch to the correct audio mode
  //       android: 3_000,
  //     };
  //     let delay = delayConfig.default;
  //     if (isAndroidDevice()) {
  //       delay = delayConfig.android ?? delay;
  //     } else if (isIosDevice()) {
  //       delay = delayConfig.ios ?? delay;
  //     }

  //     if (delay > 0) {
  //       await new Promise((resolve) => setTimeout(resolve, delay));
  //     }

  //     connection = await Connection.create(options);
  //     [input, output] = await Promise.all([
  //       Input.create({
  //         ...connection.inputFormat,
  //         preferHeadphonesForIosDevices: options.preferHeadphonesForIosDevices,
  //       }),
  //       Output.create(connection.outputFormat),
  //     ]);

  //     preliminaryInputStream?.getTracks().forEach((track) => track.stop());
  //     preliminaryInputStream = null;

  //     return new Conversation(fullOptions, connection, input, output, wakeLock);
  //   } catch (error) {
  //     fullOptions.onStatusChange({ status: "disconnected" });
  //     preliminaryInputStream?.getTracks().forEach((track) => track.stop());
  //     connection?.close();
  //     await input?.close();
  //     await output?.close();
  //     try {
  //       await wakeLock?.release();
  //       wakeLock = null;
  //     } catch (e) { }
  //     throw error;
  //   }
  // }

  public static async startSession(
    options: SessionConfig &
      Partial<Callbacks> &
      Partial<ClientToolsConfig> &
      Partial<InputConfig>
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
      return new Conversation(fullOptions, connection, null, null, null);
    } catch (error) {
      fullOptions.onStatusChange({ status: "disconnected" });
      connection?.close();
      throw error;
    }
  }

  private lastInterruptTimestamp: number = 0;
  private mode: Mode = "listening";
  private status: Status = "connecting";
  private inputFrequencyData?: Uint8Array;
  private outputFrequencyData?: Uint8Array;
  private volume: number = 1;
  private currentEventId: number = 1;
  private canSendFeedback: boolean = false;
  private input: Input | null;
  private output: Output | null;

  private constructor(
    private readonly options: Options,
    private readonly connection: Connection,
    input: Input | null,
    output: Output | null,
    public wakeLock: WakeLockSentinel | null
  ) {
    this.input = input;
    this.output = output;
    this.options.onConnect({ conversationId: connection.conversationId });
    this.connection.onDisconnect(this.endSessionWithDetails);
    this.connection.onMessage(this.onMessage);
    if (this.input) this.input.worklet.port.onmessage = this.onInputWorkletMessage;
    if (this.output) this.output.worklet.port.onmessage = this.onOutputWorkletMessage;
    this.updateStatus("connected");
  }

  public endSession = () => this.endSessionWithDetails({ reason: "user" });

  private endSessionWithDetails = async (details: DisconnectionDetails) => {
    if (this.status !== "connected" && this.status !== "connecting") return;
    this.updateStatus("disconnecting");

    try {
      await this.wakeLock?.release();
      this.wakeLock = null;
    } catch (e) { }

    this.connection.close();
    await this.input?.close();
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

    console.log("parsedEvent", parsedEvent);

    switch (parsedEvent.type) {
      case "interruption": {
        if (parsedEvent.interruption_event) {
          this.lastInterruptTimestamp = parsedEvent.interruption_event.event_id;
        }
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
        // if (this.lastInterruptTimestamp <= parsedEvent.audio_event.event_id) {
        this.options.onAudio(parsedEvent.audio_event.audio_base_64);
        this.addAudioBase64Chunk(parsedEvent.audio_event.audio_base_64);
        this.currentEventId = parsedEvent.audio_event.event_id;
        this.updateMode("speaking");
        // }
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

  private onInputWorkletMessage = (event: MessageEvent): void => {
    const rawAudioPcmData = event.data[0];
    const maxVolume = event.data[1];

    // check if the sound was loud enough, so we don't send unnecessary chunks
    // then forward audio to websocket
    if (maxVolume > 0.001) {
      console.log("VOCE ALTA!!");

      if (this.status === "audio_connected") {
        this.connection.sendMessage({
          user_audio_chunk: arrayBufferToBase64(rawAudioPcmData.buffer),
          type: "user_audio_chunk",
        });
      }
    } else {
      console.log("VOCE BASSA!!");
    }
  };

  private onOutputWorkletMessage = ({ data }: MessageEvent): void => {
    console.log("OUTPUT WORKLET MSG", data);
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

  public setMicMuted = (isMuted: boolean) => {
    this.input?.setMuted(isMuted);
  };

  public sendChatMessage = (message: string) => {
    this.connection.sendMessage({
      type: "chat",
      text: message,
    });
  }
  public getInputByteFrequencyData = () => {
    if (!this.input) return undefined;
    this.inputFrequencyData ??= new Uint8Array(
      this.input.analyser.frequencyBinCount
    );
    this.input.analyser.getByteFrequencyData(this.inputFrequencyData);
    return this.inputFrequencyData;
  };

  public getOutputByteFrequencyData = () => {
    if (!this.output) return undefined;
    this.outputFrequencyData ??= new Uint8Array(
      this.output.analyser.frequencyBinCount
    );
    this.output.analyser.getByteFrequencyData(this.outputFrequencyData);
    return this.outputFrequencyData;
  };

  public getInputVolume = () => {
    const freq = this.getInputByteFrequencyData();
    return freq ? this.calculateVolume(freq) : 0;
  };

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

    this.connection.socket.emit("voice_conversation_client_data");


    this.connection.onFormats(async ({ inputFormat, outputFormat }) => {


      if (!this.input || !this.output) {
        [this.input, this.output] = await Promise.all([
          Input.create({ ...inputFormat, preferHeadphonesForIosDevices: this.options.preferHeadphonesForIosDevices }),
          Output.create(outputFormat),
        ]);

        this.input.worklet.port.onmessage = this.onInputWorkletMessage;
        this.output.worklet.port.onmessage = this.onOutputWorkletMessage;

      }
    });
    this.updateStatus("audio_connected");


  }

  public async disconnectAudioIO() {
    if (this.input) {
      this.input.worklet.port.onmessage = null;

      await this.input.close();
      this.input = null;
    }
    if (this.output) {
      this.output.worklet.port.onmessage = null;
      await this.output.close();
      this.output = null;
    }
    this.connection.socket.emit("interrupt");
    this.updateStatus("connected");
  }
}

