const path = require("node:path");

const APP_DIR = path.resolve(__dirname, "..");

module.exports = {
  apps: [
    {
      name: "azwa-app",
      cwd: APP_DIR,
      script: ".output/server/index.mjs",
      instances: "max",
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        PORT: 8085,
        HOST: "127.0.0.1",
      },
      max_memory_restart: "1G",
      restart_delay: 3000,
      autorestart: true,
      watch: false,
      kill_timeout: 10000,
      listen_timeout: 10000,
      wait_ready: false,
    },
  ],
};
