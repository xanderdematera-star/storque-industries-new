FROM node:20-alpine
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend/src ./src
COPY database ../database
EXPOSE 4000
CMD ["node","src/server.js"]
