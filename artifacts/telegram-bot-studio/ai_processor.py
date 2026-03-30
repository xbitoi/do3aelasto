import asyncio
import re
import os
from typing import List, Tuple


async def generate_duaa(gemini_key: str, video_duration: int, style: str = "تضرع وخشوع") -> str:
    import google.generativeai as genai

    genai.configure(api_key=gemini_key)
    model = genai.GenerativeModel("gemini-1.5-flash")

    style_map = {
        "تضرع وخشوع": "يعبّر عن التضرع والخشوع والانكسار بين يدي الله",
        "شكر وحمد": "يعبّر عن الشكر والحمد والثناء على الله",
        "استغفار": "يطلب المغفرة والعفو والرحمة من الله",
        "رجاء وأمل": "يعبّر عن الرجاء والأمل في رحمة الله وفضله",
        "توكل وثقة": "يعبّر عن التوكل على الله والثقة بعطائه"
    }

    style_desc = style_map.get(style, style_map["تضرع وخشوع"])

    prompt = f"""اكتب دعاءً إسلامياً قصيراً باللغة العربية الفصحى مع التشكيل الكامل.

المتطلبات الصارمة:
- عدد الكلمات: من 12 إلى 15 كلمة بالضبط
- يجب أن يكون {style_desc}
- اكتب التشكيل الكامل (فتحة، ضمة، كسرة، شدة، تنوين) على كل حرف
- استخدم كلمات قرآنية ومأثورة
- لا تضع علامات ترقيم إلا ما يلزم
- لا تضع أي شرح أو ترجمة، فقط الدعاء

مثال على المستوى المطلوب:
اللَّهُمَّ إِنَّا نَسْأَلُكَ رَحْمَتَكَ وَمَغْفِرَتَكَ يَا أَرْحَمَ الرَّاحِمِينَ

اكتب الدعاء الآن مباشرة:"""

    loop = asyncio.get_event_loop()

    def _generate():
        response = model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=0.8,
                max_output_tokens=200,
            )
        )
        return response.text.strip()

    duaa = await loop.run_in_executor(None, _generate)

    duaa = duaa.strip()
    for prefix in ["دعاء:", "الدعاء:", "الدعاء", "دعاء"]:
        if duaa.startswith(prefix):
            duaa = duaa[len(prefix):].strip()

    lines = duaa.split('\n')
    duaa = lines[0].strip() if lines else duaa

    return duaa


async def text_to_speech(text: str, output_path: str, slow: bool = False) -> List[Tuple[str, float, float]]:
    from gtts import gTTS
    import asyncio

    loop = asyncio.get_event_loop()

    def _tts():
        tts = gTTS(text=text, lang='ar', slow=slow)
        tts.save(output_path)

    await loop.run_in_executor(None, _tts)

    word_timings = estimate_word_timings(text, output_path)
    return word_timings


def estimate_word_timings(text: str, audio_path: str) -> List[Tuple[str, float, float]]:
    try:
        from pydub import AudioSegment
        audio = AudioSegment.from_file(audio_path)
        total_duration = len(audio) / 1000.0
    except Exception:
        total_duration = 5.0

    words = text.split()
    if not words:
        return []

    char_counts = [len(w) for w in words]
    total_chars = sum(char_counts)

    speed_factor = 1.0 if total_duration / max(len(words), 1) > 0.4 else 0.85

    timings = []
    current_time = 0.05

    for i, (word, char_count) in enumerate(zip(words, char_counts)):
        proportion = char_count / total_chars
        duration = total_duration * proportion * speed_factor

        duration = max(duration, 0.2)

        timings.append((word, current_time, current_time + duration))
        current_time += duration

        if i < len(words) - 1:
            current_time += 0.05

    return timings


def reshape_arabic(text: str) -> str:
    try:
        import arabic_reshaper
        from bidi.algorithm import get_display
        reshaped = arabic_reshaper.reshape(text)
        bidi_text = get_display(reshaped)
        return bidi_text
    except ImportError:
        return text
