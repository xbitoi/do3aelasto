import streamlit as st
import time
from bot_core import TelegramBotManager


def render_sidebar():
    st.markdown('<div class="section-header">⚙️ إعدادات البوت</div>', unsafe_allow_html=True)

    with st.expander("🔑 مفاتيح API", expanded=True):
        gemini_key = st.text_input(
            "🤖 مفتاح Gemini AI",
            value=st.session_state.gemini_key,
            type="password",
            placeholder="AIza...",
            help="أدخل مفتاح Gemini API الخاص بك من Google AI Studio"
        )
        if gemini_key != st.session_state.gemini_key:
            st.session_state.gemini_key = gemini_key

        bot_token = st.text_input(
            "🤖 توكن بوت تيليغرام",
            value=st.session_state.bot_token,
            type="password",
            placeholder="123456789:AAF...",
            help="احصل عليه من @BotFather في تيليغرام"
        )
        if bot_token != st.session_state.bot_token:
            st.session_state.bot_token = bot_token

    col1, col2 = st.columns(2)
    with col1:
        if st.button("🟢 تشغيل البوت", disabled=st.session_state.bot_running):
            start_bot()
    with col2:
        if st.button("🔴 إيقاف البوت", disabled=not st.session_state.bot_running):
            stop_bot()

    if st.button("🧪 اختبار الترحيب"):
        test_welcome()

    st.markdown("---")
    st.markdown('<div class="section-header">🎨 إعدادات النص</div>', unsafe_allow_html=True)

    with st.expander("🖋️ الخط والحجم", expanded=True):
        fonts = ["BeIn", "Boutros", "Dima", "Takeaway"]
        font_idx = fonts.index(st.session_state.settings["font"]) if st.session_state.settings["font"] in fonts else 0
        font = st.selectbox("نوع الخط", fonts, index=font_idx)
        st.session_state.settings["font"] = font

        font_size = st.slider("حجم الخط", 20, 150, st.session_state.settings["font_size"], 5)
        st.session_state.settings["font_size"] = font_size

        y_pos = st.slider("الموضع العمودي (%)", 10, 95, st.session_state.settings["y_position"], 5,
                          help="النسبة المئوية من أعلى الفيديو")
        st.session_state.settings["y_position"] = y_pos

    with st.expander("📐 التباعد والحدود"):
        line_height = st.slider("ارتفاع السطر", 1.0, 3.0, st.session_state.settings["line_height"], 0.1)
        st.session_state.settings["line_height"] = line_height

        stroke = st.slider("سُمك الحدود (px)", 0, 10, st.session_state.settings["stroke_thickness"], 1)
        st.session_state.settings["stroke_thickness"] = stroke

    with st.expander("🎨 الألوان"):
        col_a, col_b = st.columns(2)
        with col_a:
            text_color = st.color_picker("لون النص", st.session_state.settings["text_color"])
            st.session_state.settings["text_color"] = text_color
        with col_b:
            active_color = st.color_picker("لون الكلمة النشطة", st.session_state.settings["active_color"])
            st.session_state.settings["active_color"] = active_color

    with st.expander("🎙️ إعدادات الصوت"):
        slow_tts = st.checkbox("صوت بطيء (للوضوح)", st.session_state.settings.get("tts_speed", False))
        st.session_state.settings["tts_speed"] = slow_tts

        duaa_style = st.selectbox(
            "أسلوب الدعاء",
            ["تضرع وخشوع", "شكر وحمد", "استغفار", "رجاء وأمل", "توكل وثقة"],
            index=0
        )
        st.session_state.settings["duaa_style"] = duaa_style

    with st.expander("✨ تأثيرات الظهور والانتقال", expanded=True):
        st.markdown('<div style="color:#a5b4fc; font-size:0.82rem; margin-bottom:6px;">🔤 تأثير ظهور الكلمات</div>', unsafe_allow_html=True)

        word_effect_labels = {
            "عشوائي 🎲": "random",
            "تلاشي ناعم": "fade_smooth",
            "تكبير بوب": "zoom_pop",
            "ارتداد نابضي": "bounce_spring",
            "صعود من الأسفل": "slide_up",
            "نزول من الأعلى": "slide_down",
            "دخول انسيابي": "swing_right",
            "وميض متنفس": "glow_pulse",
            "كشف من اليمين": "reveal_rtl",
        }
        word_effect_names = list(word_effect_labels.keys())
        current_word = st.session_state.settings.get("word_effect", "random")
        word_reverse = {v: k for k, v in word_effect_labels.items()}
        word_idx = word_effect_names.index(word_reverse.get(current_word, "عشوائي 🎲"))

        selected_word = st.selectbox(
            "تأثير الكلمات",
            word_effect_names,
            index=word_idx,
            label_visibility="collapsed"
        )
        st.session_state.settings["word_effect"] = word_effect_labels[selected_word]

        st.markdown('<div style="color:#a5b4fc; font-size:0.82rem; margin-top:10px; margin-bottom:6px;">🎞 تأثير الانتقال بين الفيديوهات</div>', unsafe_allow_html=True)

        transition_labels = {
            "عشوائي 🎲": "random",
            "تلاشي متقاطع (Crossfade)": "crossfade",
            "انزلاق لليسار": "slide_left",
            "انزلاق لليمين": "slide_right",
            "انزلاق للأعلى": "slide_up",
            "تلاشي للأسود": "fade_black",
            "تكبير وتلاشي": "zoom",
            "مسح قطري": "wipe",
        }
        transition_names = list(transition_labels.keys())
        current_trans = st.session_state.settings.get("transition_effect", "random")
        trans_reverse = {v: k for k, v in transition_labels.items()}
        trans_idx = transition_names.index(trans_reverse.get(current_trans, "عشوائي 🎲"))

        selected_trans = st.selectbox(
            "تأثير الانتقال",
            transition_names,
            index=trans_idx,
            label_visibility="collapsed"
        )
        st.session_state.settings["transition_effect"] = transition_labels[selected_trans]

        st.caption("💡 اختر 'عشوائي' لتغيير التأثير تلقائياً في كل فيديو")


def render_main_controls():
    status = "🟢 يعمل" if st.session_state.bot_running else "🔴 متوقف"
    status_class = "status-running" if st.session_state.bot_running else "status-stopped"

    st.markdown(f"""
    <div class="card">
        <div class="card-title">📊 حالة البوت</div>
        <div style="display: flex; gap: 24px; flex-wrap: wrap;">
            <div class="metric-card" style="flex: 1;">
                <div class="metric-value">{status}</div>
                <div class="metric-label">الحالة</div>
            </div>
            <div class="metric-card" style="flex: 1;">
                <div class="metric-value" id="processed-count">{st.session_state.get('processed_count', 0)}</div>
                <div class="metric-label">فيديو مُعالَج</div>
            </div>
            <div class="metric-card" style="flex: 1;">
                <div class="metric-value">{len(st.session_state.processing_log)}</div>
                <div class="metric-label">عملية مُنجَزة</div>
            </div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    st.markdown('<div class="section-header">🎬 معاينة الإعدادات</div>', unsafe_allow_html=True)

    preview_col, info_col = st.columns([1, 1])

    with preview_col:
        render_text_preview()

    with info_col:
        st.markdown("""
        <div class="card">
            <div class="card-title">📋 سير العمل</div>
            <div style="color: #94a3b8; font-size: 0.9rem; line-height: 1.8;">
                <div>① يستقبل البوت فيديو (≈10 ثواني)</div>
                <div>② Gemini يولد دعاء 12-15 كلمة بتشكيل</div>
                <div>③ تحويل الدعاء لصوت عربي (TTS)</div>
                <div>④ تراكب النص والصوت على الفيديو</div>
                <div>⑤ مزامنة تمييز الكلمات مع الصوت</div>
                <div>⑥ إرسال الفيديو النهائي للمستخدم</div>
            </div>
        </div>
        """, unsafe_allow_html=True)

        s = st.session_state.settings
        st.markdown(f"""
        <div class="card">
            <div class="card-title">⚙️ الإعدادات الحالية</div>
            <div style="color: #94a3b8; font-size: 0.85rem; line-height: 1.8;">
                <div>🖋️ الخط: <span style="color: #a5b4fc;">{s['font']}</span></div>
                <div>📏 الحجم: <span style="color: #a5b4fc;">{s['font_size']}px</span></div>
                <div>📍 الموضع: <span style="color: #a5b4fc;">{s['y_position']}%</span></div>
                <div>📐 الحدود: <span style="color: #a5b4fc;">{s['stroke_thickness']}px</span></div>
                <div>🎙️ الأسلوب: <span style="color: #a5b4fc;">{s['duaa_style']}</span></div>
            </div>
        </div>
        """, unsafe_allow_html=True)


def render_text_preview():
    import html
    s = st.session_state.settings
    sample_text = "اللَّهُمَّ إِنَّا نَسْأَلُكَ رَحْمَتَكَ"
    text_color = s['text_color']
    active_color = s['active_color']
    font_size_preview = min(s['font_size'], 32)

    st.markdown(f"""
    <div class="preview-box" style="min-height: 180px; flex-direction: column; gap: 12px;">
        <div style="color: #475569; font-size: 0.8rem; margin-bottom: 8px;">معاينة النص</div>
        <div style="direction: rtl; text-align: center; font-size: {font_size_preview}px;
                    -webkit-text-stroke: {s['stroke_thickness']}px rgba(0,0,0,0.8);
                    color: {text_color}; line-height: {s['line_height']}; font-weight: 700;
                    text-shadow: 2px 2px 8px rgba(0,0,0,0.9);">
            {html.escape(sample_text[:10])}
            <span style="color: {active_color}; background: rgba(0,0,0,0.3); 
                         border-radius: 4px; padding: 0 4px;">إِنَّا</span>
            {html.escape(sample_text[16:])}
        </div>
        <div style="color: #475569; font-size: 0.75rem; margin-top: 8px;">
            (الكلمة الزرقاء = الكلمة الحالية في الصوت)
        </div>
    </div>
    """, unsafe_allow_html=True)


def render_status_panel():
    st.markdown("---")
    st.markdown('<div class="section-header">📜 سجل العمليات</div>', unsafe_allow_html=True)

    log_html = ""
    for entry in reversed(st.session_state.processing_log[-50:]):
        level = entry.get("level", "info")
        msg = entry.get("message", "")
        ts = entry.get("time", "")
        log_html += f'<div class="log-entry {level}"><span style="color: #475569;">[{ts}]</span> {msg}</div>'

    if not log_html:
        log_html = '<div class="log-entry info">في انتظار بدء البوت... 🚀</div>'

    st.markdown(f'<div class="log-container">{log_html}</div>', unsafe_allow_html=True)

    col1, col2 = st.columns([1, 5])
    with col1:
        if st.button("🗑️ مسح السجل"):
            st.session_state.processing_log = []
            st.rerun()


def add_log(message: str, level: str = "info"):
    from datetime import datetime
    entry = {
        "message": message,
        "level": level,
        "time": datetime.now().strftime("%H:%M:%S")
    }
    st.session_state.processing_log.append(entry)


def start_bot():
    if not st.session_state.gemini_key:
        st.error("❌ الرجاء إدخال مفتاح Gemini API")
        return
    if not st.session_state.bot_token:
        st.error("❌ الرجاء إدخال توكن بوت تيليغرام")
        return

    try:
        manager = TelegramBotManager(
            gemini_key=st.session_state.gemini_key,
            bot_token=st.session_state.bot_token,
            settings=st.session_state.settings,
            log_callback=add_log
        )
        manager.start()
        st.session_state.bot_manager = manager
        st.session_state.bot_running = True
        add_log("✅ تم تشغيل البوت بنجاح", "success")
        st.success("✅ البوت يعمل الآن! أرسل فيديو لاختباره")
        st.rerun()
    except Exception as e:
        st.error(f"❌ خطأ في تشغيل البوت: {str(e)}")
        add_log(f"خطأ في التشغيل: {str(e)}", "error")


def stop_bot():
    if st.session_state.bot_manager:
        try:
            st.session_state.bot_manager.stop()
        except Exception:
            pass
    st.session_state.bot_manager = None
    st.session_state.bot_running = False
    add_log("🔴 تم إيقاف البوت", "warning")
    st.warning("تم إيقاف البوت")
    st.rerun()


def test_welcome():
    if not st.session_state.bot_token:
        st.error("❌ الرجاء إدخال توكن بوت تيليغرام أولاً")
        return

    with st.spinner("جاري اختبار الاتصال..."):
        try:
            import requests
            url = f"https://api.telegram.org/bot{st.session_state.bot_token}/getMe"
            resp = requests.get(url, timeout=10)
            data = resp.json()

            if data.get("ok"):
                bot_name = data["result"].get("first_name", "البوت")
                bot_username = data["result"].get("username", "")
                st.success(f"✅ الاتصال ناجح! البوت: {bot_name} (@{bot_username})")
                add_log(f"✅ اختبار ناجح - البوت: {bot_name} (@{bot_username})", "success")
            else:
                error = data.get("description", "خطأ غير معروف")
                st.error(f"❌ خطأ: {error}")
                add_log(f"فشل الاختبار: {error}", "error")
        except Exception as e:
            st.error(f"❌ فشل الاتصال: {str(e)}")
            add_log(f"فشل الاتصال بتيليغرام: {str(e)}", "error")
