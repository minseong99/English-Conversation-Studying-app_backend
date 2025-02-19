# synthesize.py
import sys
import base64
import io
from TTS.api import TTS  # Coqui TTS 패키지 사용

def main():
    if len(sys.argv) < 2:
        print("Usage: synthesize.py '텍스트 입력'")
        sys.exit(1)
    text = sys.argv[1]

    try:
        # TTS 모델 초기화 (모델 이름은 필요에 따라 변경)
        tts = TTS(model_name="tts_models/en/ljspeech/tacotron2-DDC", progress_bar=False, gpu=False)
        # 텍스트를 음성으로 합성 (wav 데이터 반환)
        wav = tts.tts(text)
        # 메모리 내에서 WAV 데이터를 저장
        buffer = io.BytesIO()
        tts.save_wav(wav, buffer)
        buffer.seek(0)
        # base64 인코딩
        audio_base64 = base64.b64encode(buffer.read()).decode("utf-8")
        print(audio_base64)
    except Exception as e:
        print("Error:", e, file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
