import asyncio
import math
import os
import random
import sys
import tempfile
from pathlib import Path
from typing import List, Tuple

TRANSITION_DURATION = 0.7

WORD_EFFECTS = [
    'fade_smooth',
    'zoom_pop',
    'bounce_spring',
    'slide_up',
    'slide_down',
    'swing_right',
    'glow_pulse',
    'reveal_rtl',
]


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


def _fade_alpha(t: float, duration: float, fi: float, fo_start: float) -> float:
    if fi > 0 and t < fi:
        return t / fi
    if fo_start < duration and t > fo_start:
        remaining = duration - fo_start
        return max(0.0, (duration - t) / remaining) if remaining > 0 else 1.0
    return 1.0


def _scale_rgba_arr(arr, scale: float):
    from PIL import Image
    import numpy as np
    h, w = arr.shape[:2]
    new_w = max(1, int(w * scale))
    new_h = max(1, int(h * scale))
    img = Image.fromarray(arr.clip(0, 255).astype('uint8'), 'RGBA')
    scaled = img.resize((new_w, new_h), Image.BILINEAR)
    result = np.zeros((h, w, 4), dtype=float)
    x_off = max(0, (w - new_w) // 2)
    y_off = max(0, (h - new_h) // 2)
    src_x = max(0, (new_w - w) // 2)
    src_y = max(0, (new_h - h) // 2)
    s_arr = np.array(scaled, dtype=float)
    copy_w = min(new_w - src_x, w - x_off)
    copy_h = min(new_h - src_y, h - y_off)
    if copy_w > 0 and copy_h > 0:
        result[y_off:y_off + copy_h, x_off:x_off + copy_w] = s_arr[src_y:src_y + copy_h, src_x:src_x + copy_w]
    return result


def _shift_rgba_arr(arr, dy: int = 0, dx: int = 0):
    import numpy as np
    result = np.zeros_like(arr, dtype=float)
    h, w = arr.shape[:2]
    if dy > 0 and dy < h:
        result[dy:, :] = arr[:h - dy, :]
    elif dy < 0 and -dy < h:
        result[:h + dy, :] = arr[-dy:, :]
    elif dx > 0 and dx < w:
        result[:, dx:] = arr[:, :w - dx]
    elif dx < 0 and -dx < w:
        result[:, :w + dx] = arr[:, -dx:]
    else:
        result = arr.astype(float)
    return result


def _apply_word_effect(static_arr, t: float, duration: float, effect: str):
    import numpy as np
    result = static_arr.astype(float)

    fi = min(0.25, duration * 0.3)
    fo_start = max(0.0, duration - min(0.25, duration * 0.3))

    if effect == 'fade_smooth_static':
        pass

    elif effect == 'fade_smooth':
        alpha = _fade_alpha(t, duration, fi, fo_start)
        result[:, :, 3] *= alpha

    elif effect == 'zoom_pop':
        if t < fi:
            progress = t / fi if fi > 0 else 1.0
            scale = 0.55 + 0.5 * progress
            alpha = progress
        elif t < fi + 0.1:
            overshoot = (t - fi) / 0.1
            scale = 1.05 - 0.05 * overshoot
            alpha = 1.0
        else:
            scale = 1.0
            alpha = _fade_alpha(t, duration, fi, fo_start)
        result[:, :, 3] *= alpha
        if abs(scale - 1.0) > 0.015:
            result = _scale_rgba_arr(result, scale)

    elif effect == 'bounce_spring':
        if t < fi + 0.15:
            progress = t / (fi + 0.15)
            spring = 1.0 - math.exp(-6 * progress) * math.cos(2 * math.pi * progress * 3.0)
            scale = max(0.3, min(1.15, 0.3 + 0.85 * spring))
            alpha = min(1.0, progress * 2.5)
        else:
            scale = 1.0
            alpha = _fade_alpha(t, duration, fi, fo_start)
        result[:, :, 3] *= alpha
        if abs(scale - 1.0) > 0.015:
            result = _scale_rgba_arr(result, scale)

    elif effect == 'slide_up':
        if t < fi:
            progress = t / fi if fi > 0 else 1.0
            eased = 1.0 - (1.0 - progress) ** 2
            dy = int(35 * (1.0 - eased))
            alpha = progress
        else:
            dy = 0
            alpha = _fade_alpha(t, duration, fi, fo_start)
        result[:, :, 3] *= alpha
        if dy != 0:
            result = _shift_rgba_arr(result, dy=dy)

    elif effect == 'slide_down':
        if t < fi:
            progress = t / fi if fi > 0 else 1.0
            eased = 1.0 - (1.0 - progress) ** 2
            dy = int(-35 * (1.0 - eased))
            alpha = progress
        else:
            dy = 0
            alpha = _fade_alpha(t, duration, fi, fo_start)
        result[:, :, 3] *= alpha
        if dy != 0:
            result = _shift_rgba_arr(result, dy=dy)

    elif effect == 'swing_right':
        if t < fi:
            progress = t / fi if fi > 0 else 1.0
            swing = math.sin(progress * math.pi * 0.5)
            dx = int(50 * (1.0 - swing))
            scale = 0.8 + 0.2 * progress
            alpha = progress
        else:
            dx = 0
            scale = 1.0
            alpha = _fade_alpha(t, duration, fi, fo_start)
        result[:, :, 3] *= alpha
        if dx != 0:
            result = _shift_rgba_arr(result, dx=-dx)
        if abs(scale - 1.0) > 0.015:
            result = _scale_rgba_arr(result, scale)

    elif effect == 'glow_pulse':
        alpha = _fade_alpha(t, duration, fi, fo_start)
        result[:, :, 3] *= alpha
        if t >= fi and t <= fo_start:
            pulse = 1.0 + 0.18 * math.sin(2 * math.pi * t * 2.2)
            bright_mask = static_arr[:, :, 3] > 60
            result[bright_mask, 0] = np.clip(result[bright_mask, 0] * pulse, 0, 255)
            result[bright_mask, 1] = np.clip(result[bright_mask, 1] * pulse, 0, 255)
            result[bright_mask, 2] = np.clip(result[bright_mask, 2] * pulse, 0, 255)

    elif effect == 'reveal_rtl':
        h_arr, w_arr = result.shape[:2]
        if t < fi:
            progress = t / fi if fi > 0 else 1.0
            eased = progress ** 0.6
            reveal_cols = int(w_arr * eased)
            mask = np.zeros((h_arr, w_arr), dtype=float)
            if reveal_cols > 0:
                start_col = max(0, w_arr - reveal_cols)
                mask[:, start_col:] = 1.0
                blend_w = min(20, reveal_cols)
                for bx in range(blend_w):
                    col_idx = start_col + bx
                    if col_idx < w_arr:
                        mask[:, col_idx] = bx / blend_w
            result[:, :, 3] *= mask
        else:
            alpha = _fade_alpha(t, duration, fi, fo_start)
            result[:, :, 3] *= alpha

    else:
        alpha = _fade_alpha(t, duration, fi, fo_start)
        result[:, :, 3] *= alpha

    return np.clip(result, 0, 255).astype('uint8')


def create_animated_word_clip(
    rgba_arr,
    effect: str,
    duration: float,
    y_pixel: int,
    fps: float = 24.0
):
    from moviepy.editor import VideoClip
    import numpy as np

    img_h, img_w = rgba_arr.shape[:2]

    _cache_t = [None]
    _cache_result = [None]

    def _get(t):
        if _cache_t[0] != t:
            _cache_t[0] = t
            _cache_result[0] = _apply_word_effect(rgba_arr, t, duration, effect)
        return _cache_result[0]

    def make_frame(t):
        return _get(t)[:, :, :3]

    def make_mask(t):
        return (_get(t)[:, :, 3] / 255.0)

    clip = VideoClip(make_frame, duration=duration)
    clip.size = (img_w, img_h)

    mask_clip = VideoClip(make_mask, duration=duration, ismask=True)
    mask_clip.size = (img_w, img_h)

    clip = clip.set_mask(mask_clip)
    clip = clip.set_fps(fps)
    clip = clip.set_position(("center", y_pixel - img_h // 2))
    return clip


def _render_word_pil(
    word,
    all_words,
    active_index,
    font_path,
    font_size,
    video_w,
    text_color,
    active_color,
    stroke_thickness,
    bg_color=None,
    bg_opacity=40,
    shadow_color=None,
):
    from PIL import Image, ImageDraw, ImageFont
    from ai_processor import reshape_arabic

    img_h = font_size * 3
    img_w = video_w

    img = Image.new("RGBA", (img_w, img_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    try:
        if font_path and os.path.exists(font_path):
            font = ImageFont.truetype(font_path, font_size)
        else:
            font = ImageFont.load_default()
    except Exception:
        font = ImageFont.load_default()

    full_text = " ".join([w for w, _, _ in all_words])
    reshaped_full = reshape_arabic(full_text)

    s_col = shadow_color if shadow_color is not None else (0, 0, 0)
    shadow_offset = max(4, stroke_thickness)
    draw.text(
        (img_w // 2 + shadow_offset + 1, img_h // 2 + shadow_offset + 1),
        reshaped_full, font=font, fill=(*s_col, 200), anchor="mm"
    )
    draw.text(
        (img_w // 2 + shadow_offset, img_h // 2 + shadow_offset),
        reshaped_full, font=font, fill=(*s_col, 255), anchor="mm"
    )

    if stroke_thickness > 0:
        for dx in range(-stroke_thickness, stroke_thickness + 1):
            for dy in range(-stroke_thickness, stroke_thickness + 1):
                if dx * dx + dy * dy <= stroke_thickness * stroke_thickness:
                    draw.text(
                        (img_w // 2 + dx, img_h // 2 + dy),
                        reshaped_full, font=font, fill=(0, 0, 0, 220), anchor="mm"
                    )

    draw.text(
        (img_w // 2, img_h // 2),
        reshaped_full, font=font, fill=(*text_color, 255), anchor="mm"
    )

    if active_index >= 0 and active_index < len(all_words):
        active_word = all_words[active_index][0]
        reshaped_active = reshape_arabic(active_word)

        words_list = full_text.split()
        words_before = words_list[:active_index] if active_index > 0 else []

        before_text = " ".join(words_before) + " " if words_before else ""

        try:
            before_w = draw.textlength(reshape_arabic(before_text), font=font) if before_text.strip() else 0
            active_w = draw.textlength(reshaped_active, font=font)
            full_w = draw.textlength(reshaped_full, font=font)
            start_x = (img_w - full_w) // 2

            active_bg = Image.new("RGBA", img.size, (0, 0, 0, 0))
            bg_draw = ImageDraw.Draw(active_bg)

            rect_x = start_x + before_w - 6
            rect_y = img_h // 2 - font_size // 2 - 6
            rect_x2 = rect_x + active_w + 12
            rect_y2 = img_h // 2 + font_size // 2 + 6

            fill_color = bg_color if bg_color is not None else active_color
            fill_alpha = max(5, min(255, int(bg_opacity / 100 * 255)))
            outline_alpha = min(255, int(fill_alpha * 1.8))
            glow_alpha = max(5, fill_alpha // 4)
            bg_draw.rounded_rectangle(
                [rect_x, rect_y, rect_x2, rect_y2],
                radius=8,
                fill=(*fill_color, fill_alpha),
                outline=(*fill_color, outline_alpha),
                width=2
            )

            inner_glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
            ig_draw = ImageDraw.Draw(inner_glow)
            ig_draw.rounded_rectangle(
                [rect_x + 2, rect_y + 2, rect_x2 - 2, rect_y2 - 2],
                radius=6,
                fill=(*fill_color, glow_alpha),
            )

            img = Image.alpha_composite(img, inner_glow)
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

    return img


def _make_crossfade(clip1, clip2, duration=TRANSITION_DURATION):
    import numpy as np
    from moviepy.editor import VideoClip

    w, h = clip1.size
    dur1 = clip1.duration

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


TRANSITION_MAP = {
    "crossfade":   lambda c1, c2: _make_crossfade(c1, c2),
    "slide_left":  lambda c1, c2: _make_slide_transition(c1, c2, 'left'),
    "slide_right": lambda c1, c2: _make_slide_transition(c1, c2, 'right'),
    "slide_up":    lambda c1, c2: _make_slide_transition(c1, c2, 'up'),
    "fade_black":  lambda c1, c2: _make_fade_black(c1, c2),
    "zoom":        lambda c1, c2: _make_zoom_transition(c1, c2),
    "wipe":        lambda c1, c2: _make_wipe_transition(c1, c2),
}


def _concatenate_with_transitions(clips, transition_effect: str = "random"):
    from moviepy.editor import concatenate_videoclips

    if len(clips) == 1:
        return clips[0]

    parts = [clips[0].subclip(0, max(0.1, clips[0].duration - TRANSITION_DURATION))]

    for i in range(1, len(clips)):
        c1 = clips[i - 1]
        c2 = clips[i]

        if c1.duration <= TRANSITION_DURATION or c2.duration <= TRANSITION_DURATION:
            parts.append(clips[i])
            continue

        if transition_effect == "random" or transition_effect not in TRANSITION_MAP:
            builder = random.choice(TRANSITION_BUILDERS)
        else:
            builder = TRANSITION_MAP[transition_effect]
        trans = builder(c1, c2)

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
    import numpy as np

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

    transition_effect = settings.get("transition_effect", "random")

    if len(resized_clips) > 1:
        video = _concatenate_with_transitions(resized_clips, transition_effect)
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
            from moviepy.editor import concatenate_audioclips
            loops = int(audio_duration / orig_quieter.duration) + 1
            orig_quieter = concatenate_audioclips([orig_quieter] * loops).subclip(0, audio_duration)
        final_audio = CompositeAudioClip([orig_quieter, tts_audio])
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

    font_path = get_font_path(font_name)
    video_w = int(video.w)
    video_h = int(video.h)
    y_pixel = int((y_position / 100) * video_h)

    word_effect_setting = settings.get("word_effect", "random")
    if word_effect_setting == "none":
        chosen_effect = "none"
    elif word_effect_setting == "random":
        chosen_effect = random.choice(WORD_EFFECTS)
    else:
        chosen_effect = word_effect_setting if word_effect_setting in WORD_EFFECTS else random.choice(WORD_EFFECTS)

    show_background = settings.get("show_background", True)
    bg_opacity_val = settings.get("bg_opacity", 40)
    bg_color_mode = settings.get("bg_color_mode", "fixed")
    RANDOM_COLORS = [
        (99, 102, 241), (59, 130, 246), (16, 185, 129), (245, 158, 11),
        (239, 68, 68), (139, 92, 246), (236, 72, 153), (6, 182, 212),
        (34, 197, 94), (249, 115, 22),
    ]
    if not show_background:
        bg_color_for_render = None
        bg_opacity_for_render = 0
    elif bg_color_mode == "random":
        bg_color_for_render = random.choice(RANDOM_COLORS)
        bg_opacity_for_render = bg_opacity_val
    else:
        raw_bg = settings.get("bg_color", "#3B82F6")
        bg_color_for_render = hex_to_rgb(raw_bg) if show_background else None
        bg_opacity_for_render = bg_opacity_val

    shadow_color_mode = settings.get("shadow_color_mode", "fixed")
    if shadow_color_mode == "random":
        shadow_color_for_render = random.choice(RANDOM_COLORS)
    else:
        raw_shadow = settings.get("shadow_color", "#000000")
        shadow_color_for_render = hex_to_rgb(raw_shadow)

    text_clips = []

    for i, (word, start_t, end_t) in enumerate(word_timings):
        if start_t >= video.duration:
            continue

        word_duration = min(end_t - start_t, video.duration - start_t)
        if word_duration <= 0:
            continue

        rgba_img = _render_word_pil(
            word=word,
            all_words=word_timings,
            active_index=i,
            font_path=font_path,
            font_size=font_size,
            video_w=video_w,
            text_color=text_color,
            active_color=active_color,
            stroke_thickness=stroke_thickness,
            bg_color=bg_color_for_render,
            bg_opacity=bg_opacity_for_render,
            shadow_color=shadow_color_for_render,
        )
        rgba_arr = np.array(rgba_img)

        if chosen_effect == "none":
            animated_clip = create_animated_word_clip(
                rgba_arr=rgba_arr,
                effect="fade_smooth_static",
                duration=word_duration,
                y_pixel=y_pixel,
                fps=target_fps,
            )
        else:
            animated_clip = create_animated_word_clip(
                rgba_arr=rgba_arr,
                effect=chosen_effect,
                duration=word_duration,
                y_pixel=y_pixel,
                fps=target_fps,
            )
        animated_clip = animated_clip.set_start(start_t)
        text_clips.append(animated_clip)

    if word_timings:
        base_rgba = _render_word_pil(
            word=None,
            all_words=word_timings,
            active_index=-1,
            font_path=font_path,
            font_size=font_size,
            video_w=video_w,
            text_color=tuple(int(c * 0.6) for c in text_color),
            active_color=active_color,
            stroke_thickness=stroke_thickness,
            bg_color=bg_color_for_render,
            bg_opacity=0,
            shadow_color=shadow_color_for_render,
        )
        base_arr = np.array(base_rgba)
        img_h_base = base_arr.shape[0]

        base_clip = ImageClip(base_arr, ismask=False)
        base_clip = base_clip.set_duration(video.duration)
        base_clip = base_clip.set_position(("center", y_pixel - img_h_base // 2))
        all_clips = [video_with_audio, base_clip] + text_clips
    else:
        all_clips = [video_with_audio]

    final_video = CompositeVideoClip(all_clips)
    final_duration = min(video.duration, audio_duration + 0.3)
    final_video = final_video.set_duration(final_duration)

    MAX_SIZE_BYTES = 47 * 1024 * 1024
    target_bitrate_kbps = int((MAX_SIZE_BYTES * 8) / max(1, final_duration) / 1024)
    target_bitrate_kbps = max(500, min(target_bitrate_kbps, 4000))
    audio_kbps = 128
    video_kbps = max(300, target_bitrate_kbps - audio_kbps)

    tmp_audio = str(Path(output_path).parent / "temp_audio.aac")

    final_video.write_videofile(
        output_path,
        codec="libx264",
        audio_codec="aac",
        fps=min(target_fps, 30),
        preset="fast",
        logger=None,
        temp_audiofile=tmp_audio,
        remove_temp=True,
        ffmpeg_params=[
            "-crf", "26",
            "-maxrate", f"{video_kbps}k",
            "-bufsize", f"{video_kbps * 2}k",
            "-b:a", f"{audio_kbps}k",
        ]
    )

    file_size = os.path.getsize(output_path)
    if file_size > MAX_SIZE_BYTES:
        import subprocess
        recompressed = output_path.replace(".mp4", "_small.mp4")
        duration_s = max(1, final_duration)
        target_total_kbps = int((MAX_SIZE_BYTES * 8) / duration_s / 1024)
        v_kbps = max(200, target_total_kbps - audio_kbps)
        subprocess.run([
            "ffmpeg", "-y", "-i", output_path,
            "-c:v", "libx264", "-preset", "fast",
            "-b:v", f"{v_kbps}k",
            "-c:a", "aac", "-b:a", f"{audio_kbps}k",
            recompressed
        ], capture_output=True)
        if os.path.exists(recompressed) and os.path.getsize(recompressed) > 0:
            os.replace(recompressed, output_path)

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
    line_height=1.4
):
    from moviepy.editor import ImageClip
    import numpy as np

    rgba_img = _render_word_pil(
        word=word,
        all_words=all_words,
        active_index=active_index,
        font_path=font_path,
        font_size=font_size,
        video_w=video_w,
        text_color=text_color,
        active_color=active_color,
        stroke_thickness=stroke_thickness,
    )
    img_arr = np.array(rgba_img)
    img_h = img_arr.shape[0]

    clip = ImageClip(img_arr, ismask=False)
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
