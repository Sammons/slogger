import * as winston from "winston";
import "winston-daily-rotate-file";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

export interface LogSubscriber {
  level: LogLevel;
  handler: (...args) => any;
}

export interface LoggerFactoryOptions {
  customTransports?: any[];
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
const cwdName =
  process
    .cwd()
    .split(path.sep)
    .pop() || "root";
const cwd = process.mainModule
  ? process.mainModule.filename
      .split(path.sep)
      .slice(0, -1)
      .join(path.sep)
  : "./";

const staticDetails = {
  platform: os.platform(),
  arch: os.arch(),
  pid: process.pid
};

const defaultOptions: LoggerFactoryOptions = {
  customTransports: [],
  filename: path.resolve(cwd, "logging/" + cwdName + "@" + os.hostname()),
  prepend: true,
  datePattern: "yyyy-MM/yyyy-MM-dd-ddd-",
  localTime: false,
  maxDays: 1,
  createTree: true,
  zippedarchive: false,
  level: "debug"
};

export interface LoggerOptions {
  subject: string;
}

export type ILogger = {
  [K in LogLevel]: (message: string, meta?: object | Error) => void
} & {
  pinMeta(key: string, value: any);
};

const levels = ["debug", "info", "warn", "error"];

function captureMakeCallerLocation() {
  const e = new Error();
  const stack = e.stack || "";
  const lines = stack.split("\n");
  const fileMatch = (lines[3] || "none").match(/\((\/.*?)\:/);
  return fileMatch ? fileMatch[1] : "none";
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
  };
}

export class LoggerFactory {
  private _options: LoggerFactoryOptions;
  private _logger: winston.LoggerInstance;
  async finish() {
    return new Promise((resolve, reject) => {
      this._logger.info("Shutting down logger", error => {
        if (error) {
          return reject(error);
        }
        this._logger.close();
        return resolve(this);
      });
    });
  }
  initialize(options?: LoggerFactoryOptions) {
    this._options = Object.assign({}, defaultOptions || {}, options);
    if (!this._options.customTransports) {
      const transports = [
        new winston.transports.DailyRotateFile(this._options),
        new winston.transports.Console({
          colorize: true,
          json: false,
          level: this._options.level,
          prettyPrint: true,
          depth: 4
        })
      ];
      this._logger = new winston.Logger({
        transports
      });
      const dir = this._logger.transports.dailyRotateFile["dirname"];
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
      }
    } else {
      this._logger = new winston.Logger({
        transports: this._options.customTransports
      })
    }
    return this;
  }
  private _subscribers: LogSubscriber[] = [];
  private _subscriptions: {
    [K in LogLevel]: Array<
      (
        level: LogLevel,
        message: string,
        subject: string,
        meta: {} | Error
      ) => any | void
    >
  } = {
    debug: [],
    error: [],
    fatal: [],
    info: [],
    warn: []
  };

  subscribe(subscriber: LogSubscriber) {
    this._subscribers.push(subscriber);
    this._subscriptions[subscriber.level].push((...args) =>
      subscriber.handler(...args)
    );
  }
  saneSerializeError = (e: Error, observed: WeakSet<{}>) => {
    if (observed.has(e)) {
      return "Cycle [Error Object]";
    }
    observed.add(e);
    const keys = Object.keys(e);
    const clone = {};
    keys.forEach(
      k => (clone[k] = this.preprocessSpecificTypes(e[k], observed))
    );
    e.message && (clone["message"] = e.message);
    e.stack && (clone["stack"] = e.stack.split("\n"));
    e.name && (clone["name"] = e.name);
    return clone;
  };

  preprocessSpecificTypes = (
    meta: {} | Error | Buffer | RegExp,
    observed: WeakSet<{}>
  ) => {
    if (meta instanceof Error) {
      return this.saneSerializeError(meta, observed);
    }
    if (Buffer.isBuffer(meta)) {
      if (meta.byteLength > 1024) {
        return { b64: `Buffer Size Too Large ${meta.byteLength} bytes` };
      }
      return { buffer: meta.toString("base64") };
    }
    if (meta instanceof RegExp) {
      return meta.toString();
    }
    if (meta instanceof Date) {
      return meta.toISOString();
    }
    if (Array.isArray(meta)) {
      if (meta.length > 1) {
        return {
          ArraySample: {
            length: meta.length,
            first: this.preprocessSpecificTypes(meta[0], observed),
            last: this.preprocessSpecificTypes(meta[meta.length - 1], observed)
          }
        };
      } else {
        return meta.map(el => this.preprocessSpecificTypes(el, observed));
      }
    }
    if (typeof meta === "object") {
      return this.preprocess(meta, observed);
    }
    if (typeof meta === 'function') {
      return 'Function ' + (meta['name'] || 'Lambda');
    }
    return meta;
  };

  preprocess = (meta: {} | Error | Buffer | RegExp, observed?: WeakSet<{}>) => {
    observed = observed || new WeakSet();
    if (typeof meta === "object" && meta !== null) {
      if (observed.has(meta)) {
        return "Cycle [Object]";
      }
      observed.add(meta);
      const keys = Object.keys(meta);
      keys.length > 100 && (meta["__keys"] = keys);
      keys.forEach(k => {
        meta[k] = this.preprocessSpecificTypes(meta[k], observed);
      });
    }
    return meta;
  };

  log = (pins: {key: string, value: any}[], level: LogLevel, subject, message: string, meta: {} | Error) => {
    const processedMeta = this.preprocess(meta || {});
    const t = new Date();
    const m: any = {
      level,
      subject,
      meta: processedMeta,
      message,
      pins: {},
      time: t.toISOString(),
      local: t.toLocaleTimeString()
    };
    if (pins.length > 0) {
      for (let pin of pins) {
        m.pins[pin.key] = pin.value;
      }
    }
    if (level === "fatal" || level === "error") {
      m.system = captureSystemInfo();
    }
    this._logger.log(level, message, m);
    for (let s of this._subscriptions[level]) {
      s(level, message, subject, m);
    }
  };

  make(subject?: string): ILogger {
    subject = subject || captureMakeCallerLocation();
    const pins: {key: string, value: any}[] = [];
    return {
      debug: (msg: string, m?: {} | Error) =>
        this.log(pins, "debug", subject, msg, m),
      info: (msg: string, m?: {} | Error) => this.log(pins, "info", subject, msg, m),
      warn: (msg: string, m?: {} | Error) => this.log(pins, "warn", subject, msg, m),
      error: (msg: string, m?: {} | Error) =>
        this.log(pins, "error", subject, msg, m),
      fatal: (msg: string, m?: {} | Error) => this.log(pins, "fatal", subject, msg, m),
      pinMeta: (key: string, value: any) => {
        pins.push({ key, value })
      }
    };
  }
}

export default LoggerFactory;
