import { MicVAD } from "@ricky0123/vad-web";
import { SpeechProbabilities } from "@ricky0123/vad-web/dist/models";


export class Input {

  public static async create(): Promise<Input> {

    const micVAD = await MicVAD.new(
      {
        baseAssetPath: '/assets/',
        onnxWASMBasePath: '/assets/',
        model: 'v5'
      }
    );

    const input = new Input(micVAD);

    return input;
  }

  private readonly micVAD: MicVAD;

  public onSpeechChunk: (frame: Float32Array) => void = () => {};

  public onSpeechEnd: (audio: Float32Array) => void  = () => {};

  public onSpeechStart: () => void  = () => {};

  private constructor(micVAD: MicVAD) {
    this.micVAD = micVAD;

    this.micVAD.setOptions({
      onSpeechEnd: this.onSpeechEnd,
      onSpeechStart: this.onSpeechStart,
      onFrameProcessed: (probabilities: SpeechProbabilities, frame: Float32Array) => {
        if (probabilities.isSpeech > 0.72) {
          this.onSpeechChunk(frame);
        }
      }
    })
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

}
