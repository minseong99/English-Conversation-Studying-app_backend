import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';

@Controller('api/speech')
export class SpeechController {
  /**
   * STT Endpoint
   * POST /api/speech/stt
   * 입력: JSON { "audio": "<base64-encoded-audio>" }
   * 처리: Hugging Face의 Wav2Vec2 모델로 음성을 텍스트로 변환
   * 출력: JSON { "text": "인식된 텍스트" }
   */
  @Post('stt')
  async speechToText(@Body() body: { audio: string }): Promise<any> {
    try {
      // base64로 인코딩된 오디오 데이터를 Buffer로 디코딩
      const audioBuffer = Buffer.from(body.audio, 'base64');

      // Hugging Face Inference API 호출: Wav2Vec2 모델
      const response = await axios.post(
        'https://api-inference.huggingface.co/models/facebook/wav2vec2-base-960h',
        audioBuffer,
        {
          headers: {
            Authorization: `Bearer ${process.env.HF_API_KEY}`,
            'Content-Type': 'application/octet-stream',
          },
        }
      );
      // 응답 데이터의 형식은 모델에 따라 다를 수 있음.
      // 예시: { text: "인식된 텍스트" } 형태라고 가정
      return { text: response.data.text || 'No transcription available' };
    } catch (error: any) {
      console.error('STT Error:', error);
      throw new HttpException('STT 처리 중 오류 발생', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * TTS Endpoint
   * POST /api/speech/tts
   * 입력: JSON { "text": "합성할 텍스트" }
   * 처리: Hugging Face의 Coqui TTS (예: tts_models/en/ljspeech/tacotron2-DDC) 모델로 텍스트를 음성으로 변환
   * 출력: JSON { "audio": "<base64-encoded-audio>" }
   */
  @Post('tts')
  async textToSpeech(@Body() body: { text: string }): Promise<any> {
    try {
      const response = await axios.post(
        'https://api-inference.huggingface.co/models/tts_models/en/ljspeech/tacotron2-DDC',
        { inputs: body.text },
        {
          headers: {
            Authorization: `Bearer ${process.env.HF_API_KEY}`,
            'Content-Type': 'application/json',
          },
          // TTS의 경우, 응답이 음성 파일(바이너리)일 수 있으므로 responseType 설정
          responseType: 'arraybuffer',
        }
      );
      // 응답 받은 바이너리 데이터를 base64 문자열로 인코딩하여 클라이언트에 전달
      const audioBase64 = Buffer.from(response.data, 'binary').toString('base64');
      return { audio: audioBase64 };
    } catch (error: any) {
      console.error('TTS Error:', error);
      throw new HttpException('TTS 처리 중 오류 발생', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}

