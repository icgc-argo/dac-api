// Access the workerData by requiring it.
const { parentPort } = require('worker_threads');
const mjml = require('mjml');

// Main thread will pass the data you need
// through this event listener.
parentPort.on('message', (param) => {
  console.debug('in parse&compile mjml email');
  if (typeof param !== 'string') {
    throw new Error('param must be a string.');
  }
  const result = mjml(param);
  // return the result to main thread.
  parentPort.postMessage(result);
});