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
   * TTS Endpoint using Flask TTS Service
   * POST /api/speech/tts
   * 입력: JSON { "text": "합성할 텍스트", "speaker": "화자ID (선택)" }
   * 처리: Flask TTS 서비스를 호출하여 TTS 모델을 이용해 텍스트를 해당 화자로 음성 합성
   * 출력: JSON { "audio": "<base64-encoded-audio>" }
   */
  @Post('tts')
  async textToSpeech(@Body() body: { text: string, speaker?: string }): Promise<any> {
    try {
      const FlaskIp = '127.0.0.1';
      const flaskUrl = `http://${FlaskIp}:5000/api/tts`; // Flask TTS 서비스의 URL로 교체하세요.
      const response = await axios.post(
        flaskUrl,
        {
          text: body.text,
          speaker: body.speaker, // 선택적 화자 옵션
        },
        { headers: { 'Content-Type': 'application/json' } }
      );
      return response.data; // { audio: "base64string" }
    } catch (error: any) {
      console.error('TTS Error:', error);
      throw new HttpException('TTS 처리 중 오류 발생', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
  
}

