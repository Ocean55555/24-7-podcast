module.exports = {
  apps: [
    {
      name: 'podcast',
      script: 'dist/index.js',
      cwd: __dirname,
      env: { NODE_ENV: 'production' },
      autorestart: true,
      max_restarts: 20,
      restart_delay: 5000,
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-error.log',
    },
  ],
};
