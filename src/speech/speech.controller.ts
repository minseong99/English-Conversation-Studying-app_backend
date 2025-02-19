import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import { Buffer } from 'buffer';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

if (!global.Buffer) global.Buffer = Buffer;

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
   * 처리: 내부 Python 스크립트(synthesize.py)를 호출하여 Coqui TTS(또는 ESPnet TTS)를 이용해 텍스트를 음성으로 변환
   * 출력: JSON { "audio": "<base64-encoded-audio>" }
   */
  @Post('tts')
  async textToSpeech(@Body() body: { text: string }): Promise<any> {
    try {
      // synthesize.py 스크립트를 호출하여 TTS 합성을 진행합니다.
      // 이 스크립트는 입력 텍스트를 받아 합성된 음성을 base64 문자열로 출력합니다.
      
      const pythonPath = "C:/Users/PC/Desktop/castone/English-Conversation-Studying-app_backend/English-Conversation-Studying-app_backend/python_env/Scripts/python.exe";
      const { stdout, stderr } = await execFileAsync(pythonPath, ['synthesize.py', body.text], { maxBuffer: 10 * 1024 * 1024 });
      if (stderr) {
        console.error('TTS Python stderr:', stderr);
        throw new Error(stderr);
      }
      // stdout에 base64 인코딩된 오디오 문자열이 출력되므로, 이를 반환합니다.
      return { audio: stdout.trim() };
    } catch (error) {
      console.error('TTS Error:', error);
      throw new HttpException('TTS 처리 중 오류 발생', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
  
}

