const { StaticPool } = require('node-worker-threads-pool');
import { MJMLParseResults } from 'mjml-core';
const filePath = __dirname + '/worker.js';
// off load the work to compile the mjml email into html
// to a background thread to avoid blocking
const pool = new StaticPool({
  size: 1,
  task: filePath,
});

export const compileMjmlInPromise = async (mjml: string) => {
  // This will choose one idle worker in the pool
  // to execute your heavy task without blocking
  // the main thread!
  const res = await pool.exec(mjml);
  return res as MJMLParseResults;
};