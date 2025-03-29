import json
import nltk
from nltk.corpus import wordnet as wn
from nltk.corpus import words
import random
import re

# NLTK 필요한 데이터 다운로드
nltk.download('wordnet')
nltk.download('words')
nltk.download('omw-1.4')
nltk.download('brown')  # 일반적인 영어 단어 확인용

# 일반적으로 사용되는 영어 단어 목록을 가져오기 위해 Brown 코퍼스 사용
from nltk.corpus import brown
common_words = set(word.lower() for word in brown.words() if word.isalpha())

def get_definition(word):
    """단어의 정의를 WordNet에서 가져옵니다."""
    synsets = wn.synsets(word)
    if synsets:
        # 첫 번째 의미의 정의를 가져옵니다
        return synsets[0].definition()
    return None  # 정의가 없으면 None 반환

def is_english_origin(word):
    """단어가 영어 기원인지 확인합니다. (간단한 휴리스틱 사용)"""
    # 영어에서 흔하지 않은 문자 조합이 있으면 외래어로 간주
    non_english_patterns = [
        r'aa', r'uu', r'ii', r'jj', r'kk', r'zz', 
        r'qu[^aeiou]', r'[^aeiou]v[^aeiou]', r'[^aeiou]z[^aeiou]',
        r'[^aeiou]{4,}',  # 4개 이상의 연속된 자음
    ]
    
    for pattern in non_english_patterns:
        if re.search(pattern, word):
            return False
    
    # Brown 코퍼스에 있는 단어는 일반적인 영어 단어로 간주
    if word in common_words:
        return True
    
    # 매우 긴 단어는 대개 전문용어이거나 합성어
    if len(word) > 12:
        return False
    
    return True

def determine_level(word, definition):
    """단어의 난이도를 결정합니다."""
    # 단어 길이와 의미 복잡성을 고려한 난이도 결정
    if len(word) <= 5 and len(definition.split()) <= 7:
        return "basic"
    elif len(word) <= 8 and len(definition.split()) <= 15:
        return "intermediate"
    else:
        return "advanced"

def is_technical_term(word, definition):
    """단어가 전문용어인지 확인합니다."""
    # 간단한 휴리스틱: 정의에 특정 전문 분야 관련 단어가 있으면 전문용어로 간주
    technical_indicators = [
        'scientific', 'medical', 'chemistry', 'biology', 'physics',
        'mathematics', 'geological', 'astronomical', 'linguistic',
        'technical', 'chemical', 'botanical', 'anatomical', 'molecular',
        'pertaining to', 'related to the', 'in mathematics', 'in biology'
    ]
    
    if definition:
        definition_lower = definition.lower()
        for indicator in technical_indicators:
            if indicator in definition_lower:
                return True
    
    # 특정 접두사나 접미사가 있는 단어는 종종 전문용어
    technical_prefixes = ['poly', 'hydro', 'bio', 'geo', 'neuro', 'psycho', 'thermo']
    technical_suffixes = ['ology', 'ization', 'ification', 'aceous', 'ectomy']
    
    for prefix in technical_prefixes:
        if word.startswith(prefix):
            return True
    
    for suffix in technical_suffixes:
        if word.endswith(suffix):
            return True
    
    return False

def create_word_json(output_file="english_words.json", num_words=2000):
    """지정된 수의 일반적인 영어 단어로 JSON 파일을 생성합니다."""
    # 영어 단어 목록 가져오기
    english_words = list(set(words.words()))
    
    # 필터링된 단어 목록
    filtered_words = []
    
    # 진행 상황 트래킹용 변수
    processed = 0
    total_words = len(english_words)
    
    for word in english_words:
        processed += 1
        if processed % 5000 == 0:  # 진행 상황 업데이트
            print(f"{processed}/{total_words} 단어 처리 중...")
        
        # 기본 필터링: 알파벳만, 소문자, 최소 3자 이상
        if not (word.isalpha() and len(word) >= 3):
            continue
        
        word = word.lower()
        
        # 정의 가져오기
        definition = get_definition(word)
        
        # 정의가 없는 단어 제외
        if not definition:
            continue
        
        # 전문용어 제외
        if is_technical_term(word, definition):
            continue
        
        # 외래어 제외
        if not is_english_origin(word):
            continue
        
        # 모든 조건을 통과한 단어 추가
        filtered_words.append((word, definition))
        
        # 충분한 단어를 찾았으면 중단
        if len(filtered_words) >= num_words * 1.2:  # 여유있게 20% 더 수집
            break
    
    # 무작위로 선택
    if len(filtered_words) > num_words:
        selected_words = random.sample(filtered_words, num_words)
    else:
        selected_words = filtered_words
    
    # 알파벳 순으로 정렬
    selected_words.sort(key=lambda x: x[0])
    
    # 단어 사전 생성
    word_list = []
    for word, definition in selected_words:
        word_info = {
            "word": word,
            "definition": definition,
            "level": determine_level(word, definition)
        }
        word_list.append(word_info)
    
    # JSON 객체 생성
    word_json = {"words": word_list}
    
    # JSON 파일로 저장
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(word_json, f, indent=2)
    
    print(f"{len(word_list)} 단어가 {output_file}에 저장되었습니다.")
    return word_json

# 실행: 2000개 이상의 단어로 JSON 파일 생성
if __name__ == "__main__":
    create_word_json(num_words=2500)  # 여유있게 2500개 생성