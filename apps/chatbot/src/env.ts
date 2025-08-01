import { LogLevel } from "@twurple/chat";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const transformCommaSeparatedStringToArray = (value: string) =>
  value ? value.split(",").map((v) => v.trim()) : [];

const namesSchema = z
  .string()
  .transform(transformCommaSeparatedStringToArray)
  .transform((names) => names.map((name) => name.toLowerCase()));

const urlWithTrailingSlashSchema = z
  .url()
  .refine((url) => url.match(/https?:\/\/.*\//));

export const env = createEnv({
  server: {
    // General
    NODE_ENV: z
      .literal(["development", "test", "production"])
      .default("production"),

    // Chatbot
    BOT_USER_ID: z.string().default("858050963"),
    BOT_CHANNEL_NAMES: namesSchema.default(
      ["AlveusGG"].map((name) => name.toLowerCase()),
    ),
    BOT_LOGLEVEL: z
      .string()
      .trim()
      .toUpperCase()
      .default("ERROR" satisfies keyof typeof LogLevel)
      .transform((level) => LogLevel[level as keyof typeof LogLevel])
      .refine((level) => level !== undefined),

    // Users
    MODERATOR_USER_NAMES: namesSchema.default(
      [
        // Channels
        "alveussantuary",
        "AlveusGG",
        // Staff
        "Maya",
        "SpaceVoyage",
        "geologyrocks01",
        "theconnorobrien",
        "kayla_alveus",
        // Admins
        "pjeweb",
        "MattIPv4",
      ].map((name) => name.toLowerCase()),
    ),

    // Website API
    API_BASE_URL: urlWithTrailingSlashSchema.default(
      "http://localhost:3000/api/",
    ),
    API_SECRET: z.string(),

    // Database
    DATABASE_URL: z.url(),

    // Twitch OAuth
    TWITCH_CLIENT_ID: z.string(),
    TWITCH_CLIENT_SECRET: z.string(),
  },
  runtimeEnv: process.env, // Assuming we run in Node.js otherwise you would pass a record of environment variables
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
