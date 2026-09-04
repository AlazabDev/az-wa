import dotenv from "dotenv";

dotenv.config();

const ENV_VARS = [
  "ACCESS_TOKEN",
  "APP_SECRET",
  "VERIFY_TOKEN",
  "REDIS_HOST",
  "REDIS_PORT",
] as const;

export interface AppConfig {
  appSecret?: string;
  accessToken?: string;
  verifyToken?: string;
  port: string | number;
  redisHost: string;
  redisPort: number;
  checkEnvVariables: () => void;
}

export const config: AppConfig = Object.freeze({
  appSecret: process.env["APP_SECRET"],
  accessToken: process.env["ACCESS_TOKEN"],
  verifyToken: process.env["VERIFY_TOKEN"],

  port: process.env["PORT"] || 8080,
  redisHost: process.env["REDIS_HOST"] || "localhost",
  redisPort: process.env["REDIS_PORT"] ? parseInt(process.env["REDIS_PORT"], 10) : 6379,

  checkEnvVariables: function (): void {
    ENV_VARS.forEach((key) => {
      if (!process.env[key]) {
        console.warn(`WARNING: Missing the environment variable ${key}`);
      }
    });
  },
});

export default config;
