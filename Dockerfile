FROM node:20-slim

# Instalar ffmpeg
RUN apt-get update && apt-get install -y ffmpeg

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Construir el frontend
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
