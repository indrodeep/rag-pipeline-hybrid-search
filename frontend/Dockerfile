# Frontend image: Vite dev server on port 5173.
FROM node:20-slim

WORKDIR /app

# Install dependencies first so this layer is cached across source changes.
COPY package.json package-lock.json ./
RUN npm install

COPY . .

EXPOSE 5173

# --host 0.0.0.0 so the dev server is reachable from the host browser.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
