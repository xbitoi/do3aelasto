import asyncio
import os
import threading
import tempfile
import time
import logging
import shutil
from pathlib import Path
from typing import Callable, Optional, Dict, List, Set

logger = logging.getLogger(__name__)

START_KEYWORDS = {"ابدا", "ابدأ", "abda", "ABDA", "ابدأ"}


class TelegramBotManager:
    def __init__(self, gemini_key: str, bot_token: str, settings: dict, log_callback: Optional[Callable] = None):
        self.gemini_key = gemini_key
        self.bot_token = bot_token
        self.settings = settings
        self.log_callback = log_callback
        self._thread = None
        self._loop = None
        self._app = None
        self._stop_event = threading.Event()

        self._multi_mode: Set[int] = set()
        self._video_queues: Dict[int, List[str]] = {}
        self._video_tmpdirs: Dict[int, str] = {}
        self._video_counts: Dict[int, int] = {}
        self._status_msgs: Dict[int, object] = {}

    def log(self, message: str, level: str = "info"):
        if self.log_callback:
            self.log_callback(message, level)
        print(f"[{level.upper()}] {message}")

    def start(self):
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run_bot, daemon=True)
        self._thread.start()
        time.sleep(1)

    def stop(self):
        self._stop_event.set()
        if self._loop and self._app:
            asyncio.run_coroutine_threadsafe(self._shutdown(), self._loop)
        if self._thread:
            self._thread.join(timeout=5)

    async def _shutdown(self):
        if self._app:
            try:
                await self._app.stop()
                await self._app.shutdown()
            except Exception:
                pass

    def _run_bot(self):
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        try:
            self._loop.run_until_complete(self._start_bot())
        except Exception as e:
            self.log(f"خطأ في البوت: {str(e)}", "error")
        finally:
            self._loop.close()

    async def _start_bot(self):
        from telegram import Update
        from telegram.ext import Application, MessageHandler, CommandHandler, filters

        self._app = Application.builder().token(self.bot_token).build()

        self._app.add_handler(CommandHandler("start", self._handle_start))
        self._app.add_handler(CommandHandler("help", self._handle_help))
        self._app.add_handler(MessageHandler(filters.VIDEO | filters.Document.VIDEO, self._handle_video))
        self._app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, self._handle_text))

        self.log("🚀 بدء تشغيل البوت...", "info")
        await self._app.initialize()
        await self._app.start()
        await self._app.updater.start_polling(drop_pending_updates=True)
        self.log("✅ البوت يعمل ويستقبل الرسائل", "success")

        while not self._stop_event.is_set():
            await asyncio.sleep(0.5)

        await self._app.updater.stop()
        await self._app.stop()
        await self._app.shutdown()
        self.log("🔴 تم إيقاف البوت", "warning")

    async def _handle_start(self, update, context):
        welcome_msg = (
            "🌟 *أهلاً وسهلاً!*\n\n"
            "أنا بوت الدعاء الذكي 🤲\n\n"
            "📌 *كيف أعمل:*\n\n"
            "▫️ *فيديو واحد:*\n"
            "   أرسل فيديو مباشرة ← يُعالج فوراً بدعاء\n\n"
            "▫️ *دمج عدة فيديوهات:*\n"
            "   ١. أرسل *ابدا* ← لتفعيل وضع الدمج\n"
            "   ٢. أرسل فيديوهاتك مرقمة\n"
            "   ٣. أرسل *ابدا* مرة أخرى ← لبدء الدمج\n"
            "   🎞 يُدمج الكل بتأثيرات انتقالية ودعاء مُولَّد\n\n"
            "🎬 *جرّب الآن!*"
        )
        await update.message.reply_text(welcome_msg, parse_mode="Markdown")
        self.log(f"👤 مستخدم جديد: {update.effective_user.first_name}", "info")

    async def _handle_help(self, update, context):
        help_msg = (
            "📖 *مساعدة - بوت الدعاء الذكي*\n\n"
            "*وضع الفيديو الواحد:*\n"
            "🎬 أرسل فيديو مباشرة ← معالجة فورية\n\n"
            "*وضع دمج الفيديوهات:*\n"
            "١. أرسل *ابدا* ← يبدأ جلسة الدمج\n"
            "٢. أرسل فيديوهاتك الواحد تلو الآخر\n"
            "٣. أرسل *ابدا* ثانية ← يدمج ويضيف الدعاء\n\n"
            "🤖 Gemini يولد الدعاء\n"
            "🔊 صوت عربي مُتزامن مع النص\n"
            "✨ تأثيرات انتقالية واحترافية\n\n"
            "⚡ *أوامر:*\n"
            "/start - بدء التشغيل\n"
            "/help - المساعدة"
        )
        await update.message.reply_text(help_msg, parse_mode="Markdown")

    async def _handle_text(self, update, context):
        message = update.message
        user = update.effective_user
        user_id = user.id
        chat_id = update.effective_chat.id
        text = (message.text or "").strip()

        if text in START_KEYWORDS:
            if user_id in self._multi_mode:
                videos = self._video_queues.get(user_id, [])
                if not videos:
                    await message.reply_text(
                        "⚠️ لم ترسل أي فيديوهات بعد!\n\n"
                        "أرسل فيديوهاتك أولاً ثم أرسل *ابدا* مرة أخرى.",
                        parse_mode="Markdown"
                    )
                    return

                self._multi_mode.discard(user_id)

                count = len(videos)
                status_msg = await message.reply_text(
                    f"⏳ *جاري المعالجة...*\n\n"
                    f"🎬 تم استلام {count} فيديو\n"
                    f"🔄 بدء الدمج...",
                    parse_mode="Markdown"
                )
                self._status_msgs[user_id] = status_msg

                asyncio.ensure_future(
                    self._process_collected_videos(user_id, chat_id, user.first_name, context)
                )
            else:
                self._multi_mode.add(user_id)
                self._video_queues[user_id] = []
                tmpdir = tempfile.mkdtemp()
                self._video_tmpdirs[user_id] = tmpdir
                self._video_counts[user_id] = 0

                await message.reply_text(
                    "🎬 *وضع دمج الفيديوهات مفعّل!*\n\n"
                    "أرسل فيديوهاتك الآن مرقمة واحداً تلو الآخر\n"
                    "ثم أرسل *ابدا* مرة أخرى لبدء الدمج.",
                    parse_mode="Markdown"
                )
                self.log(f"▶️ {user.first_name} بدأ جلسة دمج", "info")
        else:
            await message.reply_text(
                "🎬 أرسل فيديو مباشرة للمعالجة الفورية\n"
                "أو أرسل *ابدا* لبدء وضع دمج عدة فيديوهات.",
                parse_mode="Markdown"
            )

    async def _handle_video(self, update, context):
        message = update.message
        user = update.effective_user
        user_id = user.id
        chat_id = update.effective_chat.id

        if user_id in self._multi_mode:
            await self._collect_video(update, context)
        else:
            await self._process_single_video(update, context)

    async def _collect_video(self, update, context):
        message = update.message
        user = update.effective_user
        user_id = user.id

        tmpdir = self._video_tmpdirs.get(user_id)
        if not tmpdir:
            return

        self._video_counts[user_id] = self._video_counts.get(user_id, 0) + 1
        count = self._video_counts[user_id]

        if message.video:
            file_obj = await context.bot.get_file(message.video.file_id)
        else:
            file_obj = await context.bot.get_file(message.document.file_id)

        video_filename = f"video_{count:03d}.mp4"
        video_path = os.path.join(tmpdir, video_filename)
        await file_obj.download_to_drive(video_path)
        self._video_queues[user_id].append(video_path)

        self.log(f"📥 فيديو {count} للمستخدم {user.first_name}", "info")

        await message.reply_text(
            f"✅ *فيديو {count} تم استلامه*\n\n"
            "أرسل المزيد أو أرسل *ابدا* للبدء بالدمج.",
            parse_mode="Markdown"
        )

    async def _process_single_video(self, update, context):
        message = update.message
        user = update.effective_user
        chat_id = update.effective_chat.id

        self.log(f"📥 فيديو واحد من: {user.first_name}", "info")

        status_msg = await message.reply_text(
            "⏳ *جاري المعالجة...*\n\n"
            "🤖 توليد الدعاء بالذكاء الاصطناعي...",
            parse_mode="Markdown"
        )

        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                tmpdir_path = Path(tmpdir)

                await status_msg.edit_text(
                    "⏳ *جاري المعالجة...*\n\n"
                    "📥 تحميل الفيديو...",
                    parse_mode="Markdown"
                )

                if message.video:
                    file_obj = await context.bot.get_file(message.video.file_id)
                    duration = message.video.duration
                else:
                    file_obj = await context.bot.get_file(message.document.file_id)
                    duration = 10

                video_path = tmpdir_path / "input_video.mp4"
                await file_obj.download_to_drive(str(video_path))
                self.log(f"✅ تم تحميل الفيديو ({duration}s)", "success")

                await status_msg.edit_text(
                    "⏳ *جاري المعالجة...*\n\n"
                    "🤖 توليد الدعاء بـ Gemini AI...",
                    parse_mode="Markdown"
                )

                from ai_processor import generate_duaa
                duaa_text = await generate_duaa(
                    self.gemini_key,
                    duration,
                    self.settings.get("duaa_style", "تضرع وخشوع")
                )
                self.log(f"✅ الدعاء: {duaa_text[:40]}...", "success")

                await status_msg.edit_text(
                    "⏳ *جاري المعالجة...*\n\n"
                    "🔊 تحويل الدعاء لصوت...",
                    parse_mode="Markdown"
                )

                from ai_processor import text_to_speech
                audio_path = tmpdir_path / "duaa_audio.mp3"
                word_timings = await text_to_speech(
                    duaa_text,
                    str(audio_path),
                    slow=self.settings.get("tts_speed", False)
                )
                self.log("✅ تم توليد الصوت", "success")

                await status_msg.edit_text(
                    "⏳ *جاري المعالجة...*\n\n"
                    "🎬 تراكب النص والصوت على الفيديو...",
                    parse_mode="Markdown"
                )

                from video_processor import merge_and_process_videos
                output_path = tmpdir_path / "output_video.mp4"
                await merge_and_process_videos(
                    video_paths=[str(video_path)],
                    audio_path=str(audio_path),
                    duaa_text=duaa_text,
                    word_timings=word_timings,
                    output_path=str(output_path),
                    settings=self.settings
                )
                self.log("✅ تم معالجة الفيديو", "success")

                await status_msg.edit_text(
                    "⏳ *جاري المعالجة...*\n\n"
                    "📤 إرسال الفيديو النهائي...",
                    parse_mode="Markdown"
                )

                caption = (
                    f"🤲 *{duaa_text}*\n\n"
                    "━━━━━━━━━━━━━━━\n"
                    "🤖 _توليد بالذكاء الاصطناعي Gemini_"
                )

                with open(str(output_path), 'rb') as video_file:
                    await context.bot.send_video(
                        chat_id=chat_id,
                        video=video_file,
                        caption=caption,
                        parse_mode="Markdown"
                    )

                await status_msg.delete()
                self.settings["processed_count"] = self.settings.get("processed_count", 0) + 1
                self.log(f"🎉 تم إرسال الفيديو بنجاح لـ {user.first_name}", "success")

        except Exception as e:
            error_msg = str(e)
            self.log(f"❌ خطأ: {error_msg}", "error")
            try:
                await status_msg.edit_text(
                    f"❌ *حدث خطأ أثناء المعالجة*\n\n"
                    f"التفاصيل: `{error_msg[:200]}`\n\n"
                    "الرجاء المحاولة مرة أخرى.",
                    parse_mode="Markdown"
                )
            except Exception:
                pass

    async def _process_collected_videos(self, user_id: int, chat_id: int, user_name: str, context):
        video_paths = self._video_queues.pop(user_id, [])
        tmpdir = self._video_tmpdirs.pop(user_id, None)
        self._video_counts.pop(user_id, None)
        status_msg = self._status_msgs.pop(user_id, None)

        if not video_paths:
            return

        count = len(video_paths)
        self.log(f"🎬 معالجة {count} فيديو للمستخدم {user_name}", "info")

        try:
            last_video_path = video_paths[-1]
            last_duration = 10
            try:
                from moviepy.editor import VideoFileClip
                clip = VideoFileClip(last_video_path)
                last_duration = clip.duration
                clip.close()
            except Exception:
                pass

            if status_msg:
                await status_msg.edit_text(
                    "⏳ *جاري المعالجة...*\n\n"
                    "🤖 توليد الدعاء بـ Gemini AI...",
                    parse_mode="Markdown"
                )

            from ai_processor import generate_duaa
            duaa_text = await generate_duaa(
                self.gemini_key,
                last_duration,
                self.settings.get("duaa_style", "تضرع وخشوع")
            )
            self.log(f"✅ الدعاء: {duaa_text[:40]}...", "success")

            if status_msg:
                await status_msg.edit_text(
                    "⏳ *جاري المعالجة...*\n\n"
                    "🔊 تحويل الدعاء لصوت...",
                    parse_mode="Markdown"
                )

            from ai_processor import text_to_speech
            audio_path = os.path.join(tmpdir, "duaa_audio.mp3")
            word_timings = await text_to_speech(
                duaa_text,
                audio_path,
                slow=self.settings.get("tts_speed", False)
            )
            self.log("✅ تم توليد الصوت", "success")

            if status_msg:
                await status_msg.edit_text(
                    "⏳ *جاري المعالجة...*\n\n"
                    f"🎞 دمج {count} مقاطع بتأثيرات انتقالية...\n"
                    "📝 تراكب النص والصوت...",
                    parse_mode="Markdown"
                )

            from video_processor import merge_and_process_videos
            output_path = os.path.join(tmpdir, "output_video.mp4")
            await merge_and_process_videos(
                video_paths=video_paths,
                audio_path=audio_path,
                duaa_text=duaa_text,
                word_timings=word_timings,
                output_path=output_path,
                settings=self.settings
            )
            self.log("✅ تم معالجة الفيديوهات", "success")

            if status_msg:
                await status_msg.edit_text(
                    "⏳ *جاري المعالجة...*\n\n"
                    "📤 إرسال الفيديو النهائي...",
                    parse_mode="Markdown"
                )

            caption = (
                f"🤲 *{duaa_text}*\n\n"
                "━━━━━━━━━━━━━━━\n"
                "🤖 _توليد بالذكاء الاصطناعي Gemini_"
            )

            with open(output_path, 'rb') as video_file:
                await context.bot.send_video(
                    chat_id=chat_id,
                    video=video_file,
                    caption=caption,
                    parse_mode="Markdown"
                )

            if status_msg:
                await status_msg.delete()

            self.settings["processed_count"] = self.settings.get("processed_count", 0) + 1
            self.log(f"🎉 تم إرسال الفيديو المدموج لـ {user_name}", "success")

        except Exception as e:
            error_msg = str(e)
            self.log(f"❌ خطأ: {error_msg}", "error")
            try:
                if status_msg:
                    await status_msg.edit_text(
                        f"❌ *حدث خطأ أثناء المعالجة*\n\n"
                        f"التفاصيل: `{error_msg[:200]}`\n\n"
                        "الرجاء المحاولة مرة أخرى.",
                        parse_mode="Markdown"
                    )
                else:
                    await context.bot.send_message(
                        chat_id=chat_id,
                        text=f"❌ حدث خطأ: {error_msg[:200]}"
                    )
            except Exception:
                pass
        finally:
            if tmpdir and os.path.exists(tmpdir):
                shutil.rmtree(tmpdir, ignore_errors=True)
