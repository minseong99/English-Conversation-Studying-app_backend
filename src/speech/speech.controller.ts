import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import { Buffer } from 'buffer';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(require('child_process').execFile);

if (!global.Buffer) global.Buffer = Buffer;

@Controller('api/speech')
export class SpeechController {
  /**
   * STT Endpoint using Hugging Face's wav2vec2-large-xlsr-53-english model
   * POST /api/speech/stt
   * 입력: JSON { "audio": "<base64-encoded-audio>" }
   * 처리: 음성을 텍스트로 변환하여 반환
   */
  @Post('stt')
  async speechToText(@Body() body: { audio: string }): Promise<any> {
    if (!body.audio || body.audio.trim() === '') {
      throw new HttpException('No audio provided', HttpStatus.BAD_REQUEST);
    }
    
    // base64로 인코딩된 오디오 데이터를 Buffer로 디코딩
    const audioBuffer = Buffer.from(body.audio, 'base64');
    if (audioBuffer.length === 0) {
      throw new HttpException('Empty audio data', HttpStatus.BAD_REQUEST);
    }
    
    const url = 'https://api-inference.huggingface.co/models/jonatasgrosman/wav2vec2-large-xlsr-53-english';
    const headers = {
      Authorization: `Bearer ${process.env.HF_API_KEY}`,
      'Content-Type': 'application/octet-stream'
    };
  
    const maxAttempts = 5;
    let attempt = 0;
    let delay = 1000; // 초기 딜레이: 1초
  
    while (attempt < maxAttempts) {
      try {
        const response = await axios.post(url, audioBuffer, {
          headers,
          timeout: 15000,
        });
        // 성공 시 결과 반환
        return { text: response.data.text || '' };
      } catch (error: any) {
        // 만약 503 오류라면 재시도
        if (error.response && error.response.status === 503) {
          attempt++;
          console.error(`Attempt ${attempt} failed with 503. Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          delay *= 2; // 지수적으로 딜레이 증가
        } else {
          console.error('STT Error:', error);
          throw new HttpException('STT 처리 중 오류 발생', HttpStatus.INTERNAL_SERVER_ERROR);
        }
      }
    }
    
    // 최대 재시도 횟수 초과 시
    throw new HttpException('서비스 이용 가능 시간이 지연되었습니다. 나중에 다시 시도해주세요.', HttpStatus.SERVICE_UNAVAILABLE);
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
      const flaskUrl = `http://${process.env.FLASK_IP}:5000/api/tts`; // Flask TTS 서비스의 URL로 교체하세요.
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

