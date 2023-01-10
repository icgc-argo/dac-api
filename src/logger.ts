/*
 * Copyright (c) 2022 The Ontario Institute for Cancer Research. All rights reserved
 *
 * This program and the accompanying materials are made available under the terms of
 * the GNU Affero General Public License v3.0. You should have received a copy of the
 * GNU Affero General Public License along with this program.
 *  If not, see <http://www.gnu.org/licenses/>.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES
 * OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT
 * SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,
 * INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED
 * TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS;
 * OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER
 * IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN
 * ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

import { createLogger, LoggerOptions, transports, format } from 'winston';

import { getAppConfig } from './config';

const { combine, timestamp, colorize, printf } = format;

const config = getAppConfig();
const logLevel = config.logLevel;
const isProduction = String(process.env.NODE_ENV).toLowerCase() === 'production';

const fileTransport = new transports.File({ filename: 'debug.log', level: 'debug' });
const consoleTransport = new transports.Console({
  level: logLevel,
});
const options: LoggerOptions = {
  format: combine(
    colorize(),
    timestamp(),
    printf((info) => `${info.timestamp} ${info.level}: ${info.message}`),
  ),
  transports: isProduction ? [consoleTransport] : [consoleTransport, fileTransport],
};

const logger = createLogger(options);
logger.info(`Logging initialized at ${logLevel} level`);

export function buildMessage(...messages: string[]): string {
  return messages.filter((message) => !!message).join(' - ');
}

export default logger;
