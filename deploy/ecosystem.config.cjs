module.exports = {
  apps: [
    {
      name: "azwa-app",
      script: ".output/server/index.mjs",
      instances: "max",
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        PORT: 8085,
        HOST: "127.0.0.1",
      },
      env_file: ".env.local",
      max_memory_restart: "1G",
      restart_delay: 3000,
      autorestart: true,
      watch: false,
    },
  ],
};
