# syntax=docker/dockerfile:1
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
# Optional build secret "ca": extra root CAs for TLS-inspecting proxies. Used by npm only, not kept in the image.
RUN --mount=type=secret,id=ca,required=false NODE_EXTRA_CA_CERTS=/run/secrets/ca npm ci --omit=dev
COPY rules.json rules.mjs invoice.mjs company.mjs server.mjs ./
USER 1000:1000
EXPOSE 8080
CMD ["node", "server.mjs"]
