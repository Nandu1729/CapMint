const READINESS_TIMEOUT_MS = 1000;

function checkWithTimeout(check) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error('Dependency readiness check timed out.'));
    }, READINESS_TIMEOUT_MS);
  });

  return Promise.race([
    Promise.resolve().then(check),
    timeoutPromise
  ]).finally(() => {
    clearTimeout(timeout);
  });
}

async function runCheck(request, name, check) {
  try {
    await checkWithTimeout(check);
    return [name, 'ok'];
  } catch (error) {
    request.log.warn(
      { dependency: name, err: error },
      'Readiness dependency check failed'
    );
    return [name, 'fail'];
  }
}

export function registerReadiness(server, deps = {}) {
  server.get('/ready', async (request, reply) => {
    const pendingChecks = [];

    if (deps.pgPool) {
      pendingChecks.push(
        runCheck(request, 'db', () => deps.pgPool.query('SELECT 1'))
      );
    }
    if (deps.redisClient) {
      pendingChecks.push(
        runCheck(request, 'redis', () => deps.redisClient.ping())
      );
    }

    const checks = Object.fromEntries(await Promise.all(pendingChecks));
    const isReady = Object.values(checks).every(result => result === 'ok');
    const body = {
      status: isReady ? 'ready' : 'unready',
      checks
    };

    if (!isReady) {
      return reply.status(503).send(body);
    }
    return body;
  });
}
