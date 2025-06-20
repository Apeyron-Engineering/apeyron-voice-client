import { MicVAD } from "@ricky0123/vad-web";
import { SpeechProbabilities } from "@ricky0123/vad-web/dist/models";



export class Input {

  private static onChunk: (chunk: Float32Array) => void;
  private static onSpeechEnd: () => void;

  public static async create(): Promise<Input> {

    const micVAD = await MicVAD.new(
      {
        onSpeechEnd: () => {
          Input.onSpeechEnd();
        },
        onFrameProcessed: (probabilities: SpeechProbabilities, frame: Float32Array) => {
          if (probabilities.isSpeech > 0.7) {
            Input.onChunk(frame);
          }
        }
      }

    )



    try {
      return new Input(micVAD);
    } catch (error) {
      throw error;
    }
  }

  private readonly micVAD: MicVAD;

  private constructor(
    micVAD: MicVAD
  ) {
    this.micVAD = micVAD;
  }

  public close() {
    this.micVAD.destroy();
  }

  public start() {
    this.micVAD.start();
  }

  public pause() {
    this.micVAD.pause();
  }

  public setOnChunk(callback: (chunk: Float32Array) => void) {
    Input.onChunk = callback;
  }

  public setOnSpeechEnd(callback: () => void) {
    Input.onSpeechEnd = callback;
  }
}