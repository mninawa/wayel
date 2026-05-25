# syntax=docker/dockerfile:1.7
#
# Multi-stage build that publishes any of the .NET host projects in this
# solution. Pick which one at build time, e.g.:
#   --build-arg PROJECT=src/Wayel.Api/Wayel.Api.csproj            (default)
#   --build-arg PROJECT=src/REMOVED/REMOVED.csproj
#   --build-arg PROJECT=src/Wayel.Bff.Customer/Wayel.Bff.Customer.csproj
#   --build-arg PROJECT=src/REMOVED/REMOVED.csproj
# The compose file below wires one service per host.

ARG PROJECT=src/Wayel.Api/Wayel.Api.csproj
ARG ASSEMBLY=Wayel.Api.dll

# ---- build stage ----
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG PROJECT
WORKDIR /src

# Restore first for layer caching. We copy every csproj so any host project resolves cleanly.
COPY Directory.Build.props Directory.Packages.props global.json ./
COPY src/Wayel.Domain/Wayel.Domain.csproj                       src/Wayel.Domain/
COPY src/Wayel.Application/Wayel.Application.csproj             src/Wayel.Application/
COPY src/Wayel.Infrastructure/Wayel.Infrastructure.csproj       src/Wayel.Infrastructure/
COPY src/Wayel.Api/Wayel.Api.csproj                             src/Wayel.Api/
COPY src/Wayel.Bff.Shared/Wayel.Bff.Shared.csproj               src/Wayel.Bff.Shared/
COPY src/Wayel.Bff.Customer/Wayel.Bff.Customer.csproj           src/Wayel.Bff.Customer/
RUN dotnet restore "$PROJECT"

COPY src/ src/
RUN dotnet publish "$PROJECT" -c Release -o /app/publish \
    /p:UseAppHost=false /p:DebugType=none /p:DebugSymbols=false

# ---- runtime stage ----
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
ARG ASSEMBLY
ENV APP_ASSEMBLY=$ASSEMBLY
WORKDIR /app
COPY --from=build /app/publish .

# Run as non-root. Ubuntu-based aspnet images ship useradd/groupadd but not
# Debian's adduser wrapper (exit 127 in recent mcr.microsoft.com/dotnet/aspnet:10.0).
# /app/data is pre-created so when docker mounts a named volume here the
# mountpoint inherits wayel ownership and the in-memory blob storage can write
# to it. (In production we run with S3, so this directory stays empty.)
RUN groupadd --gid 10001 wayel \
 && useradd --uid 10001 --gid wayel --shell /usr/sbin/nologin --no-create-home wayel \
 && mkdir -p /app/data \
 && chown -R wayel:wayel /app
USER wayel

ENV ASPNETCORE_URLS=http://0.0.0.0:8080 \
    DOTNET_RUNNING_IN_CONTAINER=true \
    DOTNET_EnableDiagnostics=0
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD bash -c 'exec 3<>/dev/tcp/127.0.0.1/8080' || exit 1

# Use shell form so $APP_ASSEMBLY is expanded at container start.
ENTRYPOINT exec dotnet "$APP_ASSEMBLY"
