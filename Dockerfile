FROM node:16
ENV PORT 8080
ENV HTTPSPORT 8443
EXPOSE 8080
EXPOSE 8443
COPY package*.json ./
RUN npm install
COPY . .
ENV NODE_ENV production
RUN npm run build
CMD [ "npm", "start" ]