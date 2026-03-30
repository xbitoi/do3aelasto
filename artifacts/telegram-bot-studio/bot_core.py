import asyncio
import os
import threading
import tempfile
import time
import logging
from pathlib import Path
from typing import Callable, Optional

logger = logging.getLogger(__name__)


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
            "• أرسل لي فيديو (≈10 ثواني)\n"
            "• سأولّد دعاءً بالتشكيل بالذكاء الاصطناعي\n"
            "• سأضع الدعاء على الفيديو مع الصوت\n"
            "• سأعيد إرساله إليك مع مزامنة الكلمات!\n\n"
            "🎬 *جرّب الآن - أرسل فيديو!*"
        )
        await update.message.reply_text(welcome_msg, parse_mode="Markdown")
        self.log(f"👤 مستخدم جديد: {update.effective_user.first_name}", "info")

    async def _handle_help(self, update, context):
        help_msg = (
            "📖 *مساعدة - بوت الدعاء الذكي*\n\n"
            "🎬 أرسل فيديو مدته ≈10 ثواني\n"
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
            "🎬 الرجاء إرسال فيديو (مدته ≈10 ثواني) لأقوم بمعالجته!\n\n"
            "💡 تأكد أن الفيديو واضح وبجودة جيدة."
        )

    async def _handle_video(self, update, context):
        message = update.message
        user = update.effective_user
        chat_id = update.effective_chat.id

        self.log(f"📥 استقبال فيديو من: {user.first_name}", "info")

        status_msg = await message.reply_text(
            "⏳ *جاري المعالجة...*\n\n"
            "🤖 توليد الدعاء بالذكاء الاصطناعي...",
            parse_mode="Markdown"
        )

        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                tmpdir = Path(tmpdir)

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

                video_path = tmpdir / "input_video.mp4"
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
                audio_path = tmpdir / "duaa_audio.mp3"
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

                from video_processor import process_video
                output_path = tmpdir / "output_video.mp4"
                await process_video(
                    input_video=str(video_path),
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

                if "processed_count" not in self.settings:
                    self.settings["processed_count"] = 0
                self.settings["processed_count"] = self.settings.get("processed_count", 0) + 1

                self.log(f"🎉 تم إرسال الفيديو بنجاح لـ {user.first_name}", "success")

        except Exception as e:
            error_msg = str(e)
            self.log(f"❌ خطأ في المعالجة: {error_msg}", "error")

            await status_msg.edit_text(
                f"❌ *حدث خطأ أثناء المعالجة*\n\n"
                f"التفاصيل: `{error_msg[:200]}`\n\n"
                "الرجاء المحاولة مرة أخرى.",
                parse_mode="Markdown"
            )
