// Structured logger — all output captured by Vercel's log drain
function createLogger(context = 'pipeline') {
  const entries = [];

  function log(level, msg, data) {
    const entry = {
      ts:  new Date().toISOString(),
      lvl: level,
      ctx: context,
      msg,
      ...(data !== undefined ? { data } : {}),
    };
    entries.push(entry);
    console.log(JSON.stringify(entry));
  }

  return {
    info:    (msg, data) => log('INFO',  msg, data),
    warn:    (msg, data) => log('WARN',  msg, data),
    error:   (msg, data) => log('ERROR', msg, data),
    entries,
  };
}

module.exports = { createLogger };
