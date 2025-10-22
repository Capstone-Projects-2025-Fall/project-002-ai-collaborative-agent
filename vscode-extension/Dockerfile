# vscode-extension/Dockerfile
# Build-only image that compiles the VSCode extension TypeScript and prepares artifacts
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run compile
