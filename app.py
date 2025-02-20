# app.py
from flask import Flask, request, jsonify
import base64
import io
import numpy as np
import wave
from TTS.api import TTS
import logging

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

# TTS 모델 프리로딩 (한 번만 로드)
try:
    tts_model = TTS(model_name="tts_models/en/vctk/vits", progress_bar=False, gpu=False)
    # 모델 문서에 따라 샘플링 레이트 조정 (예시로 22050Hz 사용)
    sample_rate = 22050
    logging.info("TTS 모델 로드 성공")
except Exception as e:
    logging.error(f"TTS 모델 로드 오류: {e}")
    raise e

@app.route('/api/tts', methods=['POST'])
def synthesize():
    data = request.get_json()
    if not data or 'text' not in data:
        return jsonify({"error": "Missing 'text' parameter"}), 400
    text = data['text']
    # 선택적 speaker 파라미터 (없으면 기본 화자 사용)
    speaker = data.get('speaker', None)
    
    try:
        if speaker:
            wav = tts_model.tts(text, speaker=speaker)
        else:
            wav = tts_model.tts(text)
        
        # 모델이 반환하는 음성 데이터가 float 배열이라고 가정하고, [-1,1] 범위를 int16으로 스케일링
        wav = np.array(wav)
        wav_int16 = (np.clip(wav, -1, 1) * 32767).astype(np.int16)
        
        # in-memory WAV 파일 생성 (모노, 16비트)
        buffer = io.BytesIO()
        with wave.open(buffer, 'wb') as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)
            wf.writeframes(wav_int16.tobytes())
        audio_bytes = buffer.getvalue()
        audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")
        
        return jsonify({"audio": audio_base64})
    except Exception as e:
        logging.error(f"TTS 합성 오류: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host="0.0.0.0", port=5000)