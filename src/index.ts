  import * as winston from "winston";
import "winston-daily-rotate-file";
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogSubscriber {
  level: LogLevel;
  handler: (...args) => any
}

export interface LoggerFactoryOptions {
  filename?: string;
  prepend?: boolean;
  // https?://github.com/winstonjs/winston-daily-rotate-file
  level?: LogLevel;
  datePattern?: string;
  localTime?: boolean;
  maxDays?: number;
  createTree?: boolean;
  zippedarchive?: boolean;
}
const cwdName = process.cwd().split(path.sep).pop() || 'root';
const cwd = 
process.mainModule ?
process.mainModule.filename.split(path.sep).slice(0, -1).join(path.sep) :
'./';


const staticDetails = {
  platform: os.platform(),
  arch: os.arch(),
  pid: process.pid
}

const defaultOptions: LoggerFactoryOptions = {
  filename: path.resolve(cwd, 'logging/' + cwdName + '@' + os.hostname()),
  prepend: true,
  datePattern: "yyyy-MM/yyyy-MM-dd-ddd-",
  localTime: false,
  maxDays: 1,
  createTree: true,
  zippedarchive: false,
  level: 'debug'
};


export interface LoggerOptions {
  subject: string;
}

export type ILogger = {
  [K in LogLevel]: (message: string, meta?: object | Error) => void
};

const levels = ['debug', 'info', 'warn', 'error'];

function captureMakeCallerLocation() {
  const e = new Error()
  const stack = e.stack || '';
  const lines = stack.split('\n')
  const fileMatch = (lines[3] || 'none').match(/\((\/.*?)\:/)
  return fileMatch ? fileMatch[1] : 'none';
}

function captureSystemInfo() {
  return {
    platform: os.platform(),
    type: os.type(),
    totalmem: os.totalmem(),
    freemem: os.freemem(),
    endianness: os.endianness,
    arch: os.arch(),
    cpus: os.cpus(),
    networks: os.networkInterfaces(),
    load: os.loadavg(),
    userInfo: os.userInfo(),
    tmpdir: os.tmpdir(),
    homedir: os.homedir()
  }
}

export class LoggerFactory {
  private _options: LoggerFactoryOptions;
  private _logger: winston.LoggerInstance;
  async finish() {
    return new Promise((resolve, reject) => {
      this._logger.info('Shutting down logger', (error) => {
        if (error) {
          return reject(error)
        }
        this._logger.close()
        return resolve(this)
      })
    })
  }
  initialize(options?: LoggerFactoryOptions) {
    this._options = Object.assign({}, defaultOptions || {}, options);
    const transports = [
      new winston.transports.DailyRotateFile(this._options),
      new winston.transports.Console({
        colorize: true,
        json: false,
        level: this._options.level,
        prettyPrint: true,
        depth: 3
      })
    ];
    this._logger = new winston.Logger({
      transports
    });
    const dir = this._logger.transports.dailyRotateFile['dirname'];
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir)
    }
    return this
  }
  private _subscribers: LogSubscriber[] = [];
  private _subscriptions: {
    [K in LogLevel]: Array<(level: LogLevel, message: string, subject: string, meta: {} | Error) => any|void>
  } = {
    debug: [],
    error: [],
    fatal: [],
    info: [],
    warn: []
  };

  subscribe(subscriber: LogSubscriber) {
    this._subscribers.push(subscriber);
    this._subscriptions[subscriber.level].push((...args) => subscriber.handler(...args));
  }

  log = (level: LogLevel, subject, message: string, meta: {} | Error) => {
    const t = new Date();
    const m: any = {
      level,
      subject,
      meta: meta || {},
      message,
      time: t.toISOString(),
      local: t.toLocaleTimeString()
    }
    if (level === 'fatal' || level === 'error') {
      m.system = captureSystemInfo();
    }
    this._logger.log(level, message, m);
    for (let s of this._subscriptions[level]) { s(level, message, subject, m); }
  }

  make(subject?: string): ILogger {
    subject = subject || captureMakeCallerLocation();
    return {
      debug: (msg: string, m?: {} | Error) => this.log('debug', subject, msg, m),
      info:(msg: string, m?: {} | Error) =>  this.log('info', subject, msg, m),
      warn:(msg: string, m?: {} | Error) =>  this.log('warn', subject, msg, m),
      error: (msg: string, m?: {} | Error) => this.log('error', subject, msg, m),
      fatal: (msg: string, m?: {} | Error) => this.log('fatal', subject, msg, m)
    }
  }
}

export default LoggerFactory;