FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dependencies
COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node","server.js"]
