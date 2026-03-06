FROM node:24-alpine

RUN apk add --no-cache bash curl docker-cli

WORKDIR /app
COPY server.js .

USER node
EXPOSE 9095
CMD ["node", "server.js"]
