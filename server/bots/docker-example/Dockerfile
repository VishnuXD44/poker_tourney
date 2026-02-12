FROM node:20-alpine
WORKDIR /app
COPY bot.js .
ENV BOT_PORT=8765
EXPOSE 8765
CMD ["node", "bot.js"]
