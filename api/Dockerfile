FROM node:18-alpine

# Install wget for health check
RUN apk add --no-cache wget

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install --production

COPY . .

EXPOSE 3000

CMD ["node", "src/server.js"]
