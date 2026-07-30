'use strict';

const path = require('node:path');

const repositoryRoot = process.env.CAPMINT_ROOT || '/opt/capmint';
const logDirectory = process.env.CAPMINT_LOG_DIR || '/var/log/capmint';
const nodeBinary = process.env.CAPMINT_NODE_BINARY || '/usr/bin/node';
const logLevel = process.env.LOG_LEVEL || 'info';

const services = [
  { name: 'auth', port: 8081 },
  { name: 'cpq', port: 8082 },
  { name: 'mint', port: 8083 },
  { name: 'resolver', port: 8084 },
  { name: 'transparency', port: 8085 },
  { name: 'verification', port: 8086 },
  { name: 'integration', port: 8087 }
];

module.exports = {
  apps: services.map(({ name, port }) => ({
    name: `capmint-${name}`,
    cwd: repositoryRoot,
    script: path.join(
      repositoryRoot,
      'backend',
      `${name}-service`,
      'dist',
      'index.js'
    ),
    interpreter: nodeBinary,
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 5000,
    kill_timeout: 15000,
    merge_logs: true,
    time: false,
    out_file: path.join(logDirectory, `${name}.jsonl`),
    error_file: path.join(logDirectory, `${name}.error.log`),
    env_production: {
      NODE_ENV: 'production',
      LOG_LEVEL: logLevel,
      PORT: String(port)
    }
  }))
};
