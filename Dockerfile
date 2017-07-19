FROM node:8 AS builder
COPY . /app
RUN useradd -m app \
  && chown -R app:app /app
USER app
WORKDIR /app
RUN yarn --no-progress \
  && yarn build \
  && rm -rf node_modules \
  && yarn --production --no-progress \
  && yarn clean
RUN tar cfz build.tar.gz build node_modules

FROM node:8-slim
COPY . /app
COPY --from=builder /app/build.tar.gz /app
RUN useradd -m app \
  && chown -R app:app /app
USER app
WORKDIR /app
ENV NODE_ENV production
CMD tar xfz build.tar.gz && yarn start
