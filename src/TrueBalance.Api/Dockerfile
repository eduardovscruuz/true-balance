FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

COPY TrueBalance.sln .
COPY src/TrueBalance.Api/TrueBalance.Api.csproj src/TrueBalance.Api/
COPY src/TrueBalance.Application/TrueBalance.Application.csproj src/TrueBalance.Application/
COPY src/TrueBalance.Domain/TrueBalance.Domain.csproj src/TrueBalance.Domain/
COPY src/TrueBalance.Infrastructure/TrueBalance.Infrastructure.csproj src/TrueBalance.Infrastructure/

RUN dotnet restore TrueBalance.sln

COPY src/ src/

RUN dotnet publish src/TrueBalance.Api/TrueBalance.Api.csproj -c Release -o /app/publish --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app

COPY --from=build /app/publish .

ENV ASPNETCORE_HTTP_PORTS=8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "TrueBalance.Api.dll"]
