import base64

# output.txt 파일에 synthesize.py의 출력 결과가 저장되어 있다고 가정합니다.
with open("output.txt", "r") as f:
    audio_base64 = f.read().strip()

# base64 문자열 디코딩
audio_bytes = base64.b64decode(audio_base64)

# WAV 파일로 저장
with open("output.wav", "wb") as f:
    f.write(audio_bytes)

print("output.wav 파일이 생성되었습니다.")
