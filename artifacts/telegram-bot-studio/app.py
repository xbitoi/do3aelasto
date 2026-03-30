import streamlit as st
import os
import sys
import tempfile
import threading
import queue
import time
import json
from pathlib import Path


@st.cache_resource
def _init_fonts():
    try:
        from font_downloader import ensure_fonts
        ensure_fonts()
        return True
    except Exception as e:
        return False


_init_fonts()

st.set_page_config(
    page_title="استوديو بوت تيليغرام",
    page_icon="🎬",
    layout="wide",
    initial_sidebar_state="expanded"
)

from bot_core import TelegramBotManager
from ui_components import (render_sidebar, render_main_controls, render_status_panel,
                           add_log, start_bot, stop_bot, test_welcome)
from styles import inject_css

inject_css()

if "bot_manager" not in st.session_state:
    st.session_state.bot_manager = None
if "bot_running" not in st.session_state:
    st.session_state.bot_running = False
if "gemini_key" not in st.session_state:
    st.session_state.gemini_key = ""
if "bot_token" not in st.session_state:
    st.session_state.bot_token = ""
if "processing_log" not in st.session_state:
    st.session_state.processing_log = []
if "processed_count" not in st.session_state:
    st.session_state.processed_count = 0
if "settings" not in st.session_state:
    st.session_state.settings = {
        "font": "BeIn",
        "font_size": 60,
        "y_position": 80,
        "line_height": 1.4,
        "stroke_thickness": 3,
        "text_color": "#FFFFFF",
        "active_color": "#3B82F6",
        "tts_speed": False,
        "duaa_style": "تضرع وخشوع",
    }
if "active_tab" not in st.session_state:
    st.session_state.active_tab = "main"

st.markdown("""
<div style="text-align: center; padding: 20px 0 10px 0; direction: rtl;">
    <h1 style="font-size: 2.5rem; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
               -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: 800;">
        🎬 استوديو بوت تيليغرام الذكي
    </h1>
    <p style="color: #94a3b8; margin-top: 8px; font-size: 1.1rem;">
        🤖 Gemini AI &nbsp;|&nbsp; 🔊 تحويل نص لصوت &nbsp;|&nbsp; 🎬 تراكب فيديو احترافي &nbsp;|&nbsp; 💙 مزامنة كلمات
    </p>
</div>
""", unsafe_allow_html=True)

st.markdown("---")

tab1, tab2, tab3 = st.tabs(["🏠 لوحة التحكم", "⚙️ الإعدادات المتقدمة", "📖 دليل الاستخدام"])

with tab1:
    col_sidebar, col_main = st.columns([1, 2])
    with col_sidebar:
        render_sidebar()
    with col_main:
        render_main_controls()
    render_status_panel()

with tab2:
    render_advanced_settings()

with tab3:
    render_guide()


def render_advanced_settings():
    st.markdown('<div class="section-header">⚙️ إعدادات متقدمة</div>', unsafe_allow_html=True)

    col1, col2 = st.columns(2)

    with col1:
        st.markdown('<div class="card"><div class="card-title">🎬 إعدادات الفيديو</div>', unsafe_allow_html=True)

        video_quality = st.select_slider(
            "جودة الفيديو المُعالَج",
            options=["ultrafast", "superfast", "veryfast", "fast", "medium"],
            value="fast"
        )

        max_duration = st.slider("الحد الأقصى لمدة الفيديو (ثانية)", 5, 60, 15)

        bg_opacity = st.slider("شفافية خلفية النص (0=شفاف, 100=معتم)", 0, 100, 40)

        show_background = st.checkbox("إظهار خلفية للنص", value=True)

        st.markdown('</div>', unsafe_allow_html=True)

    with col2:
        st.markdown('<div class="card"><div class="card-title">🤖 إعدادات Gemini AI</div>', unsafe_allow_html=True)

        temperature = st.slider("إبداعية الدعاء (0=محافظ, 1=إبداعي)", 0.0, 1.0, 0.8, 0.1)

        word_count_min = st.number_input("الحد الأدنى للكلمات", 8, 20, 12)
        word_count_max = st.number_input("الحد الأقصى للكلمات", 12, 30, 15)

        always_tashkeel = st.checkbox("إلزامية التشكيل الكامل", value=True)

        st.markdown('</div>', unsafe_allow_html=True)

    st.markdown('<div class="card"><div class="card-title">🔔 إعدادات الإشعارات</div>', unsafe_allow_html=True)

    col3, col4 = st.columns(2)
    with col3:
        notify_start = st.checkbox("إشعار عند استقبال فيديو", value=True)
        notify_done = st.checkbox("إشعار عند اكتمال المعالجة", value=True)
    with col4:
        auto_delete_input = st.checkbox("حذف رسالة 'جاري المعالجة' تلقائياً", value=True)
        add_watermark = st.checkbox("إضافة علامة مائية", value=False)

    st.markdown('</div>', unsafe_allow_html=True)

    if st.button("💾 حفظ الإعدادات المتقدمة"):
        st.session_state.settings.update({
            "video_quality": video_quality,
            "max_duration": max_duration,
            "bg_opacity": bg_opacity,
            "show_background": show_background,
            "temperature": temperature,
            "word_count_min": word_count_min,
            "word_count_max": word_count_max,
            "always_tashkeel": always_tashkeel,
            "notify_start": notify_start,
            "notify_done": notify_done,
            "auto_delete_input": auto_delete_input,
            "add_watermark": add_watermark,
        })
        st.success("✅ تم حفظ الإعدادات بنجاح!")
        add_log("💾 تم حفظ الإعدادات المتقدمة", "success")


def render_guide():
    st.markdown("""
    <div class="card" style="direction: rtl;">
        <div class="card-title">📖 دليل الاستخدام خطوة بخطوة</div>
        <div style="color: #94a3b8; line-height: 2;">

        <h3 style="color: #a5b4fc;">الخطوة الأولى: إعداد مفاتيح API 🔑</h3>
        <ol style="margin-right: 20px;">
            <li>انتقل إلى <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color: #60a5fa;">Google AI Studio</a> واحصل على مفتاح Gemini</li>
            <li>افتح تيليغرام وابحث عن <b>@BotFather</b></li>
            <li>أرسل /newbot واتبع التعليمات للحصول على توكن البوت</li>
            <li>أدخل المفاتيح في القسم الأيسر من التطبيق</li>
        </ol>

        <h3 style="color: #a5b4fc;">الخطوة الثانية: تخصيص المظهر 🎨</h3>
        <ul style="margin-right: 20px;">
            <li>اختر نوع الخط المناسب من القائمة</li>
            <li>اضبط حجم الخط والموضع العمودي</li>
            <li>اختر ألوان النص والكلمة النشطة</li>
            <li>راجع المعاينة الفورية في لوحة التحكم</li>
        </ul>

        <h3 style="color: #a5b4fc;">الخطوة الثالثة: تشغيل البوت 🚀</h3>
        <ul style="margin-right: 20px;">
            <li>انقر على "🟢 تشغيل البوت"</li>
            <li>استخدم "🧪 اختبار الترحيب" للتحقق من الاتصال</li>
            <li>افتح البوت في تيليغرام وأرسل /start</li>
            <li>أرسل فيديو مدته ≈10 ثواني</li>
        </ul>

        <h3 style="color: #a5b4fc;">كيف يعمل البوت؟ 🤖</h3>
        <div style="background: rgba(0,0,0,0.3); border-radius: 8px; padding: 12px; margin: 8px 0;">
            <b>① استقبال الفيديو</b> → البوت يستقبل الفيديو من المستخدم<br>
            <b>② توليد الدعاء</b> → Gemini AI يولد دعاءً 12-15 كلمة بالتشكيل الكامل<br>
            <b>③ تحويل للصوت</b> → خدمة TTS تحول الدعاء لملف صوتي عربي<br>
            <b>④ معالجة الفيديو</b> → دمج الصوت + النص المتحرك على الفيديو<br>
            <b>⑤ مزامنة الكلمات</b> → كل كلمة تُضاء بالأزرق عند قراءتها<br>
            <b>⑥ الإرسال</b> → الفيديو النهائي يُرسل للمستخدم تلقائياً
        </div>

        <h3 style="color: #a5b4fc;">الخطوط المتاحة ✍️</h3>
        <ul style="margin-right: 20px;">
            <li><b>BeIn</b> - خط القاهرة الحديث (مناسب للإعلام)</li>
            <li><b>Boutros</b> - خط عربي كلاسيكي أنيق</li>
            <li><b>Dima</b> - خط شهرزاد للنصوص القرآنية</li>
            <li><b>Takeaway</b> - خط عصري للمحتوى الديناميكي</li>
        </ul>

        </div>
    </div>
    """, unsafe_allow_html=True)
