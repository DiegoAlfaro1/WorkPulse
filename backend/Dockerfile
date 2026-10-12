FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Cache mount keeps compiled packages (the SQLite driver is slow to build) across rebuilds, e.g. under compose watch.
RUN --mount=type=cache,target=/root/.cache/go-build     go test ./... && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /server . && mkdir /data

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /server /server
# Owned by nonroot so the named volume mounted here is writable.
COPY --from=build --chown=65532:65532 /data /data
ENV GIN_MODE=release DB_PATH=/data/workpulse.db
EXPOSE 8080
ENTRYPOINT ["/server"]
