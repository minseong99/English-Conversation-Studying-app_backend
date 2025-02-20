import sys
import base64
import io
import numpy as np
import wave
from TTS.api import TTS  # Coqui TTS 패키지 사용

def main():
    if len(sys.argv) < 2:
        print("Usage: synthesize.py '텍스트 입력' [speaker]", file=sys.stderr)
        sys.exit(1)
    # 전체 문장을 하나의 문자열로 합침
    if len(sys.argv) > 2:
        text = " ".join(sys.argv[1:-1])
        speaker = sys.argv[-1]
    else:
        text = sys.argv[1]
        speaker = None
    
    try:
        # TTS 모델 초기화 (tts_models/en/vctk/vits 사용)
        tts = TTS(model_name="tts_models/en/vctk/vits", progress_bar=False, gpu=False)
        
        # 화자 옵션이 주어지면 해당 옵션을 전달
        # 텍스트를 음성으로 합성 (wav: NumPy 배열, 일반적으로 float 값으로 반환됨)
        if speaker:
            wav = tts.tts(text, speaker=speaker)
        else:
            wav = tts.tts(text)# 예: [-1, 1] 범위의 float 배열
            
        sample_rate = 22050  # 모델에 따라 샘플링 레이트가 다를 수 있음

        # float 배열을 int16로 변환 (값을 [-32767, 32767] 범위로 스케일링)
        wav_int16 = (np.clip(np.array(wav), -1, 1) * 32767).astype(np.int16)
        
        # wave 모듈을 사용하여 메모리 내에 WAV 파일 작성
        buffer = io.BytesIO()
        with wave.open(buffer, 'wb') as wf:
            wf.setnchannels(1)           # 모노 채널
            wf.setsampwidth(2)           # 16비트 (2바이트)
            wf.setframerate(sample_rate) # 샘플링 레이트 설정
            wf.writeframes(wav_int16.tobytes())
        # 작성한 WAV 데이터를 base64로 인코딩
        audio_bytes = buffer.getvalue()
        audio_base64 = base64.b64encode(audio_bytes).decode("utf-8")
        
        # 파일 생성
        # with open("output.txt", "w") as f:
        #     f.write(audio_base64)
            
        print(audio_base64)
    except Exception as e:
        print("Error:", e, file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()

