# Sử dụng một image alpine làm base image
FROM docker.io/alpine:3.17.5

#cài đặt nodejs và npm
RUN apk add --no-cache nodejs npm

#Tạo user mới
RUN adduser -D node

#Sử dụng user node
USER node

#Tạo thư mục node_modules, đảm bảo rằng mọi thứ hoạt động
RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app

# Thiết lập thư mục làm việc cho ứng dụng
WORKDIR /home/node/app

# Sao chép tệp package.json và package-lock.json vào thư mục làm việc
COPY package*.json ./

# Cài đặt các phụ thuộc của ứng dụng
RUN npm install --production

# Sao chép mã nguồn ứng dụng vào container
COPY --chown=node:node . .

# Expose cổng mà ứng dụng sẽ chạy trên
#EXPOSE 61120

#Thêm tham số
#ENV NODE_ENV=
#ENV API_KEY=

# Khởi chạy ứng dụng khi container được khởi động
CMD ["npm", "start"]