FROM node:14

WORKDIR Code

COPY . .

RUN npm install

RUN npm install -g grunt-cli

RUN npm install grunt --save-dev

RUN npm install express --save

RUN npm install serve-static

RUN npm install mongoose

RUN npm install cors

RUN npm install request

EXPOSE 5000

WORKDIR JSLibrary/joint

RUN npm install

RUN grunt install

WORKDIR ../../../Code/src

CMD [ "node", "server.js" ]