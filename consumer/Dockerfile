FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./

# Install ALL dependencies including devDependencies (jest) so
# 'docker-compose exec consumer npm test' works inside the container
RUN npm install

COPY . .

CMD ["node", "src/worker.js"]
