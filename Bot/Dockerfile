FROM node:20-alpine

# Install build dependencies and canvas dependencies
RUN apk add --no-cache \
  python3 \
  make \
  g++ \
  cairo-dev \
  jpeg-dev \
  pango-dev \
  giflib-dev \
  librsvg-dev \
  pixman-dev \
  pangomm-dev \
  libjpeg-turbo-dev \
  freetype-dev \
  pkgconfig

# Create app directory
WORKDIR /app

# Install app dependencies
COPY package*.json ./
# canvas has no musl prebuilt binary, so it compiles from source. Its
# FontParser sources miss `#include <cstdint>`, which the newer GCC on Alpine
# no longer pulls in transitively, so force-include it.
RUN CXXFLAGS="-include cstdint" npm install

# Clean up build dependencies to reduce image size
RUN apk del python3 make g++ pkgconfig

# Install globally typeorm
RUN npm install -g typeorm

# Bundle app source
COPY . .

# Build the app
RUN npm run build

# Purge unnecessary files
RUN npm prune --production

# Run the app
CMD ["npm", "run", "start-prod"]
