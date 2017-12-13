FROM library/node
WORKDIR /usr/app
COPY . .
RUN npm install express
EXPOSE 3000
ENTRYPOINT node app.js
