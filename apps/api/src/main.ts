import "reflect-metadata";
import { readFileSync } from "node:fs";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { env } from "./env.js";

async function bootstrap() {
  const httpsOptions =
    env.apiTlsCert && env.apiTlsKey
      ? { cert: readFileSync(env.apiTlsCert), key: readFileSync(env.apiTlsKey) }
      : undefined;
  const app = await NestFactory.create(AppModule, { cors: false, httpsOptions });
  app.getHttpAdapter().getInstance().set("trust proxy", 1);
  app.enableCors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      if (!origin) return cb(null, true);
      if (env.corsOrigins.includes(origin) || origin.startsWith("chrome-extension://") || origin.startsWith("moz-extension://")) {
        return cb(null, true);
      }
      return cb(null, env.corsOrigins.includes("*"));
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Agent-Id", "X-Agent-Timestamp", "X-Agent-Signature"],
  });
  await app.listen(env.apiPort);
  console.log(`API ACG sur ${env.apiPublicUrl}${httpsOptions ? " (TLS)" : ""}`);
}

bootstrap();
