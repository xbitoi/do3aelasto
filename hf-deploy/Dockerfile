FROM node:20-slim

RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json .
RUN npm install --production

COPY dist/ ./dist/

EXPOSE 7860

ENV PORT=7860
ENV NODE_ENV=production

CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
