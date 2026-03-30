# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Artifacts

### `artifacts/telegram-studio` — استوديو بوت تيليغرام (React + Vite)

A professional Arabic RTL web dashboard for controlling a Telegram bot that processes videos with AI-generated Duaa overlay.

**Features:**
- Control panel to start/stop Telegram bot
- Gemini API key + Bot Token input
- Text overlay settings: font (BeIn/Boutros/Dima/Takeaway), size, position, stroke
- Color pickers: text color, active word color
- TTS (gTTS via Python) for Arabic speech
- Video processing: ffmpeg overlays Duaa text + audio onto received videos
- Word synchronization: blue highlight follows audio playback
- Real-time log panel via polling /api/bot/status
- Three pages: لوحة التحكم, إعدادات متقدمة, دليل الاستخدام

**Tech:**
- React + Vite at `/`
- Framer Motion animations
- Lucide React icons
- All UI in Arabic (RTL)

### `artifacts/api-server` — Express API Server

Backend with Telegram bot logic, Gemini AI, gTTS, ffmpeg processing.

**Key routes:**
- `POST /api/bot/start` — start bot with credentials
- `POST /api/bot/stop` — stop bot
- `GET /api/bot/status` — status, logs, stats
- `POST /api/bot/test` — test token
- `GET/PUT /api/settings` — read/update settings

**Bot flow:**
1. User sends video to bot
2. Gemini generates 12-15 word Duaa with full tashkeel
3. Python gTTS converts Duaa to Arabic audio
4. ffmpeg overlays text + audio onto video
5. Bot sends back the processed video

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── telegram-studio/    # React web dashboard
│   └── api-server/         # Express API + bot logic
├── lib/
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
```

## Running

- Frontend: `pnpm --filter @workspace/telegram-studio run dev`
- Backend: `pnpm --filter @workspace/api-server run dev`
- Codegen: `pnpm --filter @workspace/api-spec run codegen`
