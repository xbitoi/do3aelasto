import streamlit as st


def inject_css():
    st.markdown("""
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');

        * {
            font-family: 'Cairo', sans-serif !important;
        }

        .stApp {
            background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%);
            color: #e2e8f0;
        }

        section[data-testid="stSidebar"] {
            background: rgba(15, 23, 42, 0.95) !important;
            border-right: 1px solid rgba(99, 102, 241, 0.3);
        }

        .stButton > button {
            background: linear-gradient(135deg, #6366f1, #8b5cf6) !important;
            color: white !important;
            border: none !important;
            border-radius: 12px !important;
            padding: 12px 24px !important;
            font-weight: 700 !important;
            font-size: 1rem !important;
            transition: all 0.3s ease !important;
            width: 100% !important;
        }

        .stButton > button:hover {
            transform: translateY(-2px) !important;
            box-shadow: 0 8px 25px rgba(99, 102, 241, 0.4) !important;
        }

        .stTextInput > div > div > input,
        .stTextArea > div > div > textarea {
            background: rgba(30, 41, 59, 0.8) !important;
            border: 1px solid rgba(99, 102, 241, 0.4) !important;
            border-radius: 10px !important;
            color: #e2e8f0 !important;
            direction: rtl !important;
        }

        .stSelectbox > div > div {
            background: rgba(30, 41, 59, 0.8) !important;
            border: 1px solid rgba(99, 102, 241, 0.4) !important;
            border-radius: 10px !important;
            color: #e2e8f0 !important;
        }

        .stSlider > div > div > div {
            direction: ltr !important;
        }

        label, .stMarkdown p {
            color: #cbd5e1 !important;
            direction: rtl !important;
            text-align: right !important;
        }

        .card {
            background: rgba(30, 41, 59, 0.6);
            border: 1px solid rgba(99, 102, 241, 0.3);
            border-radius: 16px;
            padding: 20px;
            margin-bottom: 16px;
            backdrop-filter: blur(10px);
            direction: rtl;
        }

        .card-title {
            font-size: 1.1rem;
            font-weight: 700;
            color: #a5b4fc;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .status-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.85rem;
            font-weight: 600;
        }

        .status-running {
            background: rgba(34, 197, 94, 0.15);
            border: 1px solid rgba(34, 197, 94, 0.4);
            color: #4ade80;
        }

        .status-stopped {
            background: rgba(239, 68, 68, 0.15);
            border: 1px solid rgba(239, 68, 68, 0.4);
            color: #f87171;
        }

        .status-processing {
            background: rgba(251, 191, 36, 0.15);
            border: 1px solid rgba(251, 191, 36, 0.4);
            color: #fbbf24;
        }

        .log-container {
            background: rgba(0, 0, 0, 0.4);
            border: 1px solid rgba(99, 102, 241, 0.2);
            border-radius: 12px;
            padding: 16px;
            height: 300px;
            overflow-y: auto;
            font-family: 'Cairo', monospace;
            direction: rtl;
        }

        .log-entry {
            padding: 4px 0;
            border-bottom: 1px solid rgba(255,255,255,0.05);
            font-size: 0.9rem;
            color: #94a3b8;
        }

        .log-entry.success { color: #4ade80; }
        .log-entry.error { color: #f87171; }
        .log-entry.info { color: #60a5fa; }
        .log-entry.warning { color: #fbbf24; }
        .log-entry.processing { color: #c084fc; }

        .preview-box {
            background: #000;
            border: 2px solid rgba(99, 102, 241, 0.4);
            border-radius: 16px;
            padding: 20px;
            text-align: center;
            min-height: 200px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #475569;
            font-size: 1rem;
        }

        .metric-card {
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.1));
            border: 1px solid rgba(99, 102, 241, 0.3);
            border-radius: 12px;
            padding: 16px;
            text-align: center;
        }

        .metric-value {
            font-size: 2rem;
            font-weight: 800;
            color: #a5b4fc;
        }

        .metric-label {
            font-size: 0.85rem;
            color: #64748b;
            margin-top: 4px;
        }

        div[data-testid="stHorizontalBlock"] {
            gap: 16px;
        }

        .stProgress > div > div > div {
            background: linear-gradient(135deg, #6366f1, #8b5cf6) !important;
        }

        .section-header {
            font-size: 1.2rem;
            font-weight: 800;
            color: #e2e8f0;
            direction: rtl;
            text-align: right;
            padding: 8px 0;
            border-bottom: 2px solid rgba(99, 102, 241, 0.4);
            margin-bottom: 16px;
        }

        .stExpander {
            border: 1px solid rgba(99, 102, 241, 0.3) !important;
            border-radius: 12px !important;
            background: rgba(30, 41, 59, 0.4) !important;
        }

        [data-testid="stColorPicker"] {
            direction: ltr;
        }
    </style>
    """, unsafe_allow_html=True)
