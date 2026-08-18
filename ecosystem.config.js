module.exports = {
  apps: [
    {
      name: "dm-worker",
      script: "node_modules/.bin/ts-node",
      args: "--project tsconfig.json -r tsconfig-paths/register jobs/start-workers.ts",
      cwd: "/Users/macbookair/fireflies",
      env: {
        NODE_ENV: "production",
      },
      // Restart if it crashes, but not on intentional stop
      autorestart: true,
      watch: false,
      // Restart if memory exceeds 500MB
      max_memory_restart: "500M",
      // Log files
      out_file: "/Users/macbookair/fireflies/logs/worker-out.log",
      error_file: "/Users/macbookair/fireflies/logs/worker-error.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
