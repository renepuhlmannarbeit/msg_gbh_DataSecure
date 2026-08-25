'use strict';

function processAlive(pid, kill = process.kill) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    kill(pid, 0);
    return true;
  } catch (error) {
    // ESRCH is the only portable proof that the process does not exist.
    // EPERM/EACCES and unknown platform failures remain fail-closed as alive.
    return error?.code !== 'ESRCH';
  }
}

function processDefinitelyDead(pid, kill = process.kill) {
  return Number.isSafeInteger(pid) && pid > 0 && !processAlive(pid, kill);
}

module.exports = { processAlive, processDefinitelyDead };
