# Sử dụng một image Node.js làm base image
FROM node:18.18.2-bookworm-slim

RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app
# Thiết lập thư mục làm việc cho ứng dụng
WORKDIR /home/node/app

# Sao chép tệp package.json và package-lock.json vào thư mục làm việc
COPY package*.json ./

USER node

# Cài đặt các phụ thuộc của ứng dụng
RUN npm install

# Sao chép mã nguồn ứng dụng vào container
COPY --chown=node:node . .

# Expose cổng mà ứng dụng sẽ chạy trên
#EXPOSE 61120

ARG DOKKU_PROXY_PORT_MAP http:80:61120
ENV PORT 61120

# Khởi chạy ứng dụng khi container được khởi động
CMD ["npm", "start"]