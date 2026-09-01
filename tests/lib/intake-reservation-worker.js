'use strict';

const { reserveIntake, releaseIntake } = require('../../plugins/data-secure/server/gateway/batch-intake-reservation');

process.once('message', (message) => {
  if (message?.type !== 'acquire') return process.exit(2);
  try {
    const reservation = reserveIntake();
    process.send?.({ type: 'acquired' });
    if (message.hold === true) {
      process.once('message', (next) => {
        if (next?.type === 'release') releaseIntake(reservation.reservation_id);
        process.exit(0);
      });
    } else {
      if (message.abandon !== true) releaseIntake(reservation.reservation_id);
      process.exit(0);
    }
  } catch {
    process.send?.({ type: 'blocked' });
    process.exit(0);
  }
});
