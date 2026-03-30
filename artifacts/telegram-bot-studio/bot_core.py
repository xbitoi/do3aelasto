import asyncio
import os
import threading
import tempfile
import time
import logging
import shutil
from pathlib import Path
from typing import Callable, Optional, Dict, List

logger = logging.getLogger(__name__)

VIDEO_COLLECT_TIMEOUT = 12


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

        self._video_queues: Dict[int, List[str]] = {}
        self._video_tmpdirs: Dict[int, str] = {}
        self._video_timers: Dict[int, asyncio.TimerHandle] = {}
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
            "📌 *كيف أعمل:*\n"
            "• أرسل لي فيديو واحد أو أكثر\n"
            "• يمكنك إرسال عدة فيديوهات تباعاً (12 ثانية للانتظار)\n"
            "• سيتم دمجها بتأثيرات انتقالية احترافية\n"
            "• سأولّد دعاءً بالتشكيل بالذكاء الاصطناعي\n"
            "• سأضع الدعاء على الفيديو مع الصوت والمزامنة!\n\n"
            "🎬 *جرّب الآن - أرسل فيديو أو عدة فيديوهات!*"
        )
        await update.message.reply_text(welcome_msg, parse_mode="Markdown")
        self.log(f"👤 مستخدم جديد: {update.effective_user.first_name}", "info")

    async def _handle_help(self, update, context):
        help_msg = (
            "📖 *مساعدة - بوت الدعاء الذكي*\n\n"
            "🎬 أرسل فيديو واحد أو عدة فيديوهات\n"
            "⏱ انتظر 12 ثانية بعد آخر فيديو للمعالجة\n"
            "✂️ تأثيرات انتقالية عشوائية بين المقاطع\n"
            "🤖 سيولد Gemini دعاءً بالتشكيل\n"
            "🔊 يُحوّل الدعاء لصوت عربي\n"
            "📝 يُراكَب النص على الفيديو\n"
            "💙 الكلمات تُضاء بالتزامن مع الصوت\n\n"
            "⚡ *أوامر:*\n"
            "/start - بدء التشغيل\n"
            "/help - المساعدة"
        )
        await update.message.reply_text(help_msg, parse_mode="Markdown")

    async def _handle_text(self, update, context):
        await update.message.reply_text(
            "🎬 الرجاء إرسال فيديو أو عدة فيديوهات لأقوم بمعالجتها!\n\n"
            "💡 يمكنك إرسال عدة فيديوهات وسيتم دمجها تلقائياً."
        )

    async def _handle_video(self, update, context):
        message = update.message
        user = update.effective_user
        chat_id = update.effective_chat.id
        user_id = user.id

        self.log(f"📥 استقبال فيديو من: {user.first_name}", "info")

        if user_id not in self._video_queues:
            self._video_queues[user_id] = []
            tmpdir = tempfile.mkdtemp()
            self._video_tmpdirs[user_id] = tmpdir
            self._video_counts[user_id] = 0

            status_msg = await message.reply_text(
                "📥 *استقبال الفيديوهات...*\n\n"
                f"🎬 فيديو 1 تم استلامه\n"
                f"⏱ انتظار {VIDEO_COLLECT_TIMEOUT} ثانية للمزيد أو المعالجة التلقائية...",
                parse_mode="Markdown"
            )
            self._status_msgs[user_id] = status_msg
        else:
            if user_id in self._video_timers:
                self._video_timers[user_id].cancel()

        tmpdir = self._video_tmpdirs[user_id]
        self._video_counts[user_id] += 1
        count = self._video_counts[user_id]

        if message.video:
            file_obj = await context.bot.get_file(message.video.file_id)
        else:
            file_obj = await context.bot.get_file(message.document.file_id)

        video_filename = f"video_{count:03d}.mp4"
        video_path = os.path.join(tmpdir, video_filename)
        await file_obj.download_to_drive(video_path)
        self._video_queues[user_id].append(video_path)

        self.log(f"✅ تم تحميل الفيديو {count} للمستخدم {user.first_name}", "success")

        if count > 1:
            status_msg = self._status_msgs.get(user_id)
            if status_msg:
                try:
                    await status_msg.edit_text(
                        f"📥 *استقبال الفيديوهات...*\n\n"
                        f"🎬 تم استلام {count} فيديوهات\n"
                        f"⏱ انتظار {VIDEO_COLLECT_TIMEOUT} ثانية للمزيد أو المعالجة التلقائية...\n"
                        f"✨ سيتم دمجها بتأثيرات انتقالية احترافية!",
                        parse_mode="Markdown"
                    )
                except Exception:
                    pass

        loop = asyncio.get_event_loop()
        timer = loop.call_later(
            VIDEO_COLLECT_TIMEOUT,
            lambda: asyncio.ensure_future(
                self._process_collected_videos(user_id, chat_id, user.first_name, context),
                loop=loop
            )
        )
        self._video_timers[user_id] = timer

    async def _process_collected_videos(self, user_id: int, chat_id: int, user_name: str, context):
        video_paths = self._video_queues.pop(user_id, [])
        tmpdir = self._video_tmpdirs.pop(user_id, None)
        self._video_counts.pop(user_id, None)
        self._video_timers.pop(user_id, None)
        status_msg = self._status_msgs.pop(user_id, None)

        if not video_paths:
            return

        count = len(video_paths)
        self.log(f"🎬 بدء معالجة {count} فيديو للمستخدم {user_name}", "info")

        try:
            if status_msg:
                clip_info = f"{count} مقاطع" if count > 1 else "مقطع واحد"
                transition_info = "\n🎞 تأثيرات انتقالية عشوائية بين المقاطع..." if count > 1 else ""
                await status_msg.edit_text(
                    f"⏳ *جاري المعالجة...*\n\n"
                    f"🎬 دمج {clip_info}...{transition_info}",
                    parse_mode="Markdown"
                )

            total_duration = 0
            try:
                from moviepy.editor import VideoFileClip
                for vp in video_paths:
                    c = VideoFileClip(vp)
                    total_duration += c.duration
                    c.close()
            except Exception:
                total_duration = count * 10

            if status_msg:
                await status_msg.edit_text(
                    "⏳ *جاري المعالجة...*\n\n"
                    "🤖 توليد الدعاء بـ Gemini AI...",
                    parse_mode="Markdown"
                )

            from ai_processor import generate_duaa
            duaa_text = await generate_duaa(
                self.gemini_key,
                total_duration,
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
                if count > 1:
                    await status_msg.edit_text(
                        "⏳ *جاري المعالجة...*\n\n"
                        f"🎞 دمج {count} مقاطع بتأثيرات انتقالية...\n"
                        "📝 تراكب النص والصوت...",
                        parse_mode="Markdown"
                    )
                else:
                    await status_msg.edit_text(
                        "⏳ *جاري المعالجة...*\n\n"
                        "🎬 تراكب النص والصوت على الفيديو...",
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
            self.log("✅ تم معالجة الفيديو", "success")

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

            if "processed_count" not in self.settings:
                self.settings["processed_count"] = 0
            self.settings["processed_count"] = self.settings.get("processed_count", 0) + 1

            self.log(f"🎉 تم إرسال الفيديو بنجاح لـ {user_name}", "success")

        except Exception as e:
            error_msg = str(e)
            self.log(f"❌ خطأ في المعالجة: {error_msg}", "error")

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
