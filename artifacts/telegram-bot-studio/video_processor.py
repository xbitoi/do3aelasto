import asyncio
import os
import random
import sys
import tempfile
from pathlib import Path
from typing import List, Tuple


TRANSITION_DURATION = 0.7


async def merge_and_process_videos(
    video_paths: List[str],
    audio_path: str,
    duaa_text: str,
    word_timings: List[Tuple[str, float, float]],
    output_path: str,
    settings: dict
):
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None,
        _merge_and_process_sync,
        video_paths, audio_path, duaa_text, word_timings, output_path, settings
    )


async def process_video(
    input_video: str,
    audio_path: str,
    duaa_text: str,
    word_timings: List[Tuple[str, float, float]],
    output_path: str,
    settings: dict
):
    await merge_and_process_videos(
        [input_video], audio_path, duaa_text, word_timings, output_path, settings
    )


def _make_crossfade(clip1, clip2, duration=TRANSITION_DURATION):
    import numpy as np
    from moviepy.editor import VideoClip

    w, h = clip1.size
    dur1 = clip1.duration
    dur2 = clip2.duration

    def make_frame(t):
        progress = t / duration
        f1 = clip1.get_frame(dur1 - duration + t)
        f2 = clip2.get_frame(t)
        return (f1 * (1 - progress) + f2 * progress).astype('uint8')

    trans_clip = VideoClip(make_frame, duration=duration)
    trans_clip.size = (w, h)
    trans_clip = trans_clip.set_fps(clip1.fps)
    return trans_clip


def _make_slide_transition(clip1, clip2, direction='left', duration=TRANSITION_DURATION):
    import numpy as np
    from moviepy.editor import VideoClip

    w, h = clip1.size
    dur1 = clip1.duration

    def make_frame(t):
        progress = t / duration
        f1 = clip1.get_frame(dur1 - duration + t)
        f2 = clip2.get_frame(t)

        frame = np.zeros_like(f1)
        if direction == 'left':
            split = int(w * (1 - progress))
            if split > 0:
                frame[:, :split] = f1[:, w - split:]
            if split < w:
                frame[:, split:] = f2[:, :w - split]
        elif direction == 'right':
            split = int(w * progress)
            if split > 0:
                frame[:, :split] = f2[:, w - split:]
            if split < w:
                frame[:, split:] = f1[:, :w - split]
        elif direction == 'up':
            split = int(h * (1 - progress))
            if split > 0:
                frame[:split, :] = f1[h - split:, :]
            if split < h:
                frame[split:, :] = f2[:h - split, :]
        elif direction == 'down':
            split = int(h * progress)
            if split > 0:
                frame[:split, :] = f2[h - split:, :]
            if split < h:
                frame[split:, :] = f1[:h - split, :]
        return frame.astype('uint8')

    trans_clip = VideoClip(make_frame, duration=duration)
    trans_clip.size = (w, h)
    trans_clip = trans_clip.set_fps(clip1.fps)
    return trans_clip


def _make_fade_black(clip1, clip2, duration=TRANSITION_DURATION):
    import numpy as np
    from moviepy.editor import VideoClip

    w, h = clip1.size
    dur1 = clip1.duration
    half = duration / 2.0

    def make_frame(t):
        if t < half:
            progress = t / half
            f1 = clip1.get_frame(dur1 - duration + t)
            return (f1 * (1 - progress)).astype('uint8')
        else:
            progress = (t - half) / half
            f2 = clip2.get_frame(t - half)
            return (f2 * progress).astype('uint8')

    trans_clip = VideoClip(make_frame, duration=duration)
    trans_clip.size = (w, h)
    trans_clip = trans_clip.set_fps(clip1.fps)
    return trans_clip


def _make_zoom_transition(clip1, clip2, duration=TRANSITION_DURATION):
    import numpy as np
    from moviepy.editor import VideoClip
    from PIL import Image

    w, h = clip1.size
    dur1 = clip1.duration

    def make_frame(t):
        progress = t / duration
        f1 = clip1.get_frame(dur1 - duration + t)
        f2 = clip2.get_frame(t)

        scale = 1.0 + progress * 0.3
        new_w = int(w * scale)
        new_h = int(h * scale)
        x_off = (new_w - w) // 2
        y_off = (new_h - h) // 2

        img1 = Image.fromarray(f1.astype('uint8'))
        zoomed = img1.resize((new_w, new_h), Image.LANCZOS)
        zoomed_arr = np.array(zoomed)
        cropped = zoomed_arr[y_off:y_off + h, x_off:x_off + w]

        alpha = progress
        blended = (cropped * (1 - alpha) + f2 * alpha).astype('uint8')
        return blended

    trans_clip = VideoClip(make_frame, duration=duration)
    trans_clip.size = (w, h)
    trans_clip = trans_clip.set_fps(clip1.fps)
    return trans_clip


def _make_wipe_transition(clip1, clip2, duration=TRANSITION_DURATION):
    import numpy as np
    from moviepy.editor import VideoClip

    w, h = clip1.size
    dur1 = clip1.duration

    def make_frame(t):
        progress = t / duration
        f1 = clip1.get_frame(dur1 - duration + t)
        f2 = clip2.get_frame(t)

        frame = np.copy(f1)
        diagonal_pos = int((w + h) * progress)

        for row in range(h):
            col = diagonal_pos - row
            col = max(0, min(w, col))
            if col > 0:
                frame[row, :col] = f2[row, :col]
        return frame.astype('uint8')

    trans_clip = VideoClip(make_frame, duration=duration)
    trans_clip.size = (w, h)
    trans_clip = trans_clip.set_fps(clip1.fps)
    return trans_clip


TRANSITION_BUILDERS = [
    lambda c1, c2: _make_crossfade(c1, c2),
    lambda c1, c2: _make_slide_transition(c1, c2, 'left'),
    lambda c1, c2: _make_slide_transition(c1, c2, 'right'),
    lambda c1, c2: _make_slide_transition(c1, c2, 'up'),
    lambda c1, c2: _make_fade_black(c1, c2),
    lambda c1, c2: _make_zoom_transition(c1, c2),
    lambda c1, c2: _make_wipe_transition(c1, c2),
]


def _concatenate_with_transitions(clips):
    from moviepy.editor import concatenate_videoclips

    if len(clips) == 1:
        return clips[0]

    used_transitions = []
    parts = [clips[0].subclip(0, max(0.1, clips[0].duration - TRANSITION_DURATION))]

    for i in range(1, len(clips)):
        c1 = clips[i - 1]
        c2 = clips[i]

        if c1.duration <= TRANSITION_DURATION or c2.duration <= TRANSITION_DURATION:
            parts.append(clips[i])
            continue

        builder = random.choice(TRANSITION_BUILDERS)
        trans = builder(c1, c2)
        used_transitions.append(builder)

        if i < len(clips) - 1:
            tail = clips[i].subclip(TRANSITION_DURATION, max(TRANSITION_DURATION + 0.1, clips[i].duration - TRANSITION_DURATION))
        else:
            tail = clips[i].subclip(TRANSITION_DURATION)

        parts.append(trans)
        parts.append(tail)

    final = concatenate_videoclips(parts, method="compose")
    return final


def _merge_and_process_sync(
    video_paths: List[str],
    audio_path: str,
    duaa_text: str,
    word_timings: List[Tuple[str, float, float]],
    output_path: str,
    settings: dict
):
    from moviepy.editor import VideoFileClip, AudioFileClip, CompositeVideoClip, ImageClip, concatenate_videoclips
    from moviepy.video.fx.all import resize
    import numpy as np
    from PIL import Image, ImageDraw, ImageFont
    from ai_processor import reshape_arabic

    raw_clips = [VideoFileClip(p) for p in video_paths]

    target_w = raw_clips[0].w
    target_h = raw_clips[0].h
    target_fps = raw_clips[0].fps

    resized_clips = []
    for clip in raw_clips:
        if clip.w != target_w or clip.h != target_h:
            clip = clip.resize((target_w, target_h))
        if clip.fps != target_fps:
            clip = clip.set_fps(target_fps)
        resized_clips.append(clip)

    if len(resized_clips) > 1:
        video = _concatenate_with_transitions(resized_clips)
    else:
        video = resized_clips[0]

    tts_audio = AudioFileClip(audio_path)
    audio_duration = tts_audio.duration

    original_audio = raw_clips[0].audio if raw_clips[0].audio else None
    if len(raw_clips) > 1:
        from moviepy.audio.AudioClip import CompositeAudioClip, concatenate_audioclips
        audio_parts = [c.audio for c in raw_clips if c.audio and c.audio.duration > 0]
        if audio_parts:
            original_audio = concatenate_audioclips(audio_parts)

    if original_audio and original_audio.duration > 0:
        from moviepy.audio.AudioClip import CompositeAudioClip
        from moviepy.audio.fx.all import volumex
        orig_quieter = original_audio.fx(volumex, 0.3)
        if orig_quieter.duration > audio_duration:
            orig_quieter = orig_quieter.subclip(0, audio_duration)
        elif orig_quieter.duration < audio_duration:
            from moviepy.audio.AudioClip import AudioClip
            import numpy as np
            loops = int(audio_duration / orig_quieter.duration) + 1
            from moviepy.editor import concatenate_audioclips
            orig_quieter = concatenate_audioclips([orig_quieter] * loops).subclip(0, audio_duration)
        combined_audio = CompositeAudioClip([orig_quieter, tts_audio])
        final_audio = combined_audio
    else:
        final_audio = tts_audio

    if video.duration > audio_duration + 0.5:
        video = video.subclip(0, audio_duration + 0.3)

    video_with_audio = video.set_audio(final_audio)

    font_name = settings.get("font", "BeIn")
    font_size = settings.get("font_size", 60)
    y_position = settings.get("y_position", 80)
    stroke_thickness = settings.get("stroke_thickness", 3)
    text_color = hex_to_rgb(settings.get("text_color", "#FFFFFF"))
    active_color = hex_to_rgb(settings.get("active_color", "#3B82F6"))
    line_height = settings.get("line_height", 1.4)

    font_path = get_font_path(font_name)

    video_w = int(video.w)
    video_h = int(video.h)

    y_pixel = int((y_position / 100) * video_h)

    text_clips = []

    for i, (word, start_t, end_t) in enumerate(word_timings):
        if start_t >= video.duration:
            continue

        active_clip = create_text_frame_clip(
            word=word,
            all_words=word_timings,
            active_index=i,
            font_path=font_path,
            font_size=font_size,
            video_w=video_w,
            y_pixel=y_pixel,
            text_color=text_color,
            active_color=active_color,
            stroke_thickness=stroke_thickness,
            line_height=line_height
        )

        active_clip = active_clip.set_start(start_t).set_duration(min(end_t - start_t, video.duration - start_t))
        text_clips.append(active_clip)

    if word_timings:
        base_clip = create_text_frame_clip(
            word=None,
            all_words=word_timings,
            active_index=-1,
            font_path=font_path,
            font_size=font_size,
            video_w=video_w,
            y_pixel=y_pixel,
            text_color=text_color,
            active_color=active_color,
            stroke_thickness=stroke_thickness,
            line_height=line_height
        )
        base_clip = base_clip.set_duration(video.duration)
        all_clips = [video_with_audio, base_clip] + text_clips
    else:
        all_clips = [video_with_audio]

    final_video = CompositeVideoClip(all_clips)
    final_video = final_video.set_duration(min(video.duration, audio_duration + 0.3))

    final_video.write_videofile(
        output_path,
        codec="libx264",
        audio_codec="aac",
        fps=target_fps,
        preset="fast",
        logger=None,
        temp_audiofile=str(Path(output_path).parent / "temp_audio.aac"),
        remove_temp=True
    )

    for clip in raw_clips:
        clip.close()
    tts_audio.close()


def create_text_frame_clip(
    word,
    all_words,
    active_index,
    font_path,
    font_size,
    video_w,
    y_pixel,
    text_color,
    active_color,
    stroke_thickness,
    line_height
):
    from moviepy.editor import ImageClip
    from PIL import Image, ImageDraw, ImageFont
    from ai_processor import reshape_arabic

    padding = 40
    img_h = font_size * 3
    img_w = video_w

    img = Image.new("RGBA", (img_w, img_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    try:
        if font_path and os.path.exists(font_path):
            font = ImageFont.truetype(font_path, font_size)
            small_font = ImageFont.truetype(font_path, max(font_size - 10, 20))
        else:
            font = ImageFont.load_default()
            small_font = font
    except Exception:
        font = ImageFont.load_default()
        small_font = font

    full_text = " ".join([w for w, _, _ in all_words])
    reshaped_full = reshape_arabic(full_text)

    shadow_offset = max(2, stroke_thickness // 2)
    draw.text(
        (img_w // 2 + shadow_offset, img_h // 2 + shadow_offset),
        reshaped_full,
        font=font,
        fill=(0, 0, 0, 180),
        anchor="mm"
    )

    if stroke_thickness > 0:
        for dx in range(-stroke_thickness, stroke_thickness + 1):
            for dy in range(-stroke_thickness, stroke_thickness + 1):
                if dx * dx + dy * dy <= stroke_thickness * stroke_thickness:
                    draw.text(
                        (img_w // 2 + dx, img_h // 2 + dy),
                        reshaped_full,
                        font=font,
                        fill=(0, 0, 0, 220),
                        anchor="mm"
                    )

    draw.text(
        (img_w // 2, img_h // 2),
        reshaped_full,
        font=font,
        fill=(*text_color, 255),
        anchor="mm"
    )

    if active_index >= 0 and active_index < len(all_words):
        active_word = all_words[active_index][0]
        reshaped_active = reshape_arabic(active_word)

        words_list = full_text.split()
        words_before = words_list[:active_index] if active_index > 0 else []
        words_after = words_list[active_index + 1:] if active_index < len(words_list) - 1 else []

        before_text = " ".join(words_before) + " " if words_before else ""
        after_text = " " + " ".join(words_after) if words_after else ""

        try:
            before_w = draw.textlength(reshape_arabic(before_text), font=font) if before_text.strip() else 0
            active_w = draw.textlength(reshaped_active, font=font)

            full_w = draw.textlength(reshaped_full, font=font)
            start_x = (img_w - full_w) // 2

            active_bg = Image.new("RGBA", img.size, (0, 0, 0, 0))
            bg_draw = ImageDraw.Draw(active_bg)

            rect_x = start_x + before_w - 5
            rect_y = img_h // 2 - font_size // 2 - 5
            rect_x2 = rect_x + active_w + 10
            rect_y2 = img_h // 2 + font_size // 2 + 5

            bg_draw.rectangle(
                [rect_x, rect_y, rect_x2, rect_y2],
                fill=(*active_color, 60),
                outline=(*active_color, 150),
                width=2
            )

            img = Image.alpha_composite(img, active_bg)
            draw = ImageDraw.Draw(img)

            draw.text(
                (start_x + before_w + active_w // 2, img_h // 2),
                reshaped_active,
                font=font,
                fill=(*active_color, 255),
                anchor="mm"
            )
        except Exception:
            pass

    import numpy as np
    img_array = np.array(img)

    clip = ImageClip(img_array, ismask=False)
    clip = clip.set_position(("center", y_pixel - img_h // 2))

    return clip


def get_font_path(font_name: str) -> str:
    font_dir = Path(__file__).parent / "fonts"

    font_map = {
        "BeIn": "bein.ttf",
        "Boutros": "boutros.ttf",
        "Dima": "dima.ttf",
        "Takeaway": "takeaway.ttf",
    }

    font_file = font_map.get(font_name, "bein.ttf")
    font_path = font_dir / font_file

    if font_path.exists():
        return str(font_path)

    arabic_fallbacks = [
        "/usr/share/fonts/truetype/arabic/arabtype.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/nix/store/*/share/fonts/**/*.ttf",
    ]

    import glob
    for pattern in arabic_fallbacks:
        matches = glob.glob(pattern)
        if matches:
            return matches[0]

    return ""


def hex_to_rgb(hex_color: str) -> Tuple:
    hex_color = hex_color.lstrip('#')
    if len(hex_color) == 3:
        hex_color = ''.join([c * 2 for c in hex_color])
    r = int(hex_color[0:2], 16)
    g = int(hex_color[2:4], 16)
    b = int(hex_color[4:6], 16)
    return (r, g, b)


from typing import Tuple
