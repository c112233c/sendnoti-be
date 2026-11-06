FROM node:24-alpine

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3333

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node . .

USER node

EXPOSE 3333

CMD ["node", "main.js"]
