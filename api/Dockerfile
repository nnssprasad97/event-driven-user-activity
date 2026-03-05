FROM node:18-alpine

# Install wget for health check
RUN apk add --no-cache wget

WORKDIR /usr/src/app

COPY package*.json ./

# Install ALL dependencies including devDependencies (jest, supertest) so
# 'docker-compose exec api npm test' works inside the container
RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "src/server.js"]
