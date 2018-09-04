import * as os from "os";
import * as stream from "stream";
// import "source-map-support/register";
import * as winston from "winston";
import { Preprocessor } from "./meta-processor";

function captureMakeCallerLocation() {
  const e = new Error();
  const stack = e.stack != null ? e.stack : "";
  const lines = stack.split("\n");
  const fileMatch = (lines[3] ? lines[3] : "none").match(/\((\/.*?)\:/);
  return fileMatch ? fileMatch[1] : "none";
}

function captureSystemInfo() {
  return {
    freemem: os.freemem(),
    load: os.loadavg(),
    platform: os.platform(),
    totalmem: os.totalmem(),
    userInfo: os.userInfo(),
  };
}
export interface LogToFileOptions<L extends Levels> {
  path: string;
  maxSizeMb: number;
  level: L;
}

type Levels = "debug" | "warn" | "info" | "error";
const levels: Levels[] = ["debug", "warn", "info", "error"];

export type Publisher = (level: string) => Promise<void>;

export type ILogger<T extends any = void> = {
  [K in Levels]: (message: string, meta?: object | Error) => void
} & {
  label<K extends string, V>(key: K, value: V): ILogger<T & { [k in K]: V }>;
};

export interface LoggerFactory {
  logSimpleToStdOut<L extends Levels = "debug">(level?: L): LoggerFactory;
  logJsonToStdOut<L extends Levels = "debug">(level?: L): LoggerFactory;
  logToFile<L extends Levels = "debug">(
    opts: LogToFileOptions<L>,
  ): LoggerFactory;
  logToEventStream<L extends Levels = "debug">(
    level: L,
    publisher: Publisher,
  ): LoggerFactory;
}

const formatForHuman = winston.format((info, opts) => {
  const { subject, pins, m, level, ...rest } = info;
  let { message } = info;
  for (const p of pins) {
    message = `${p.key}:[${p.value}] ` + message;
  }
  if (level === "error") {
    m.system = captureSystemInfo();
  }
  message = `${subject}:[${new Date().toISOString()}] ${message}`;
  return { ...rest, message, level, meta: Preprocessor.preprocess(m) };
});

const formatForMachine = winston.format((info, opts) => {
  const { subject, pins, level, m, message, ...rest } = info;
  const labels = {} as any;
  const timestamp = new Date().toISOString();
  for (const p of pins) {
    labels[p.key] = p.value;
  }
  if (level === "error") {
    m.system = captureSystemInfo();
  }
  return {
    ...rest,
    level,
    message,
    meta: Preprocessor.preprocess({
      labels,
      subject,
      timestamp,
      ...Preprocessor.preprocess(m),
    }),
  };
});

export class StaticLogger implements LoggerFactory {
  public winstonian: winston.Logger;
  constructor() {
    this.winstonian = winston.createLogger({});
  }
  public logSimpleToStdOut<L extends Levels = "debug">(
    level?: L,
  ): StaticLogger {
    const passThrough = new stream.PassThrough();
    passThrough.on("data", async (chunk) => {
      process.nextTick(process.stdout.write, chunk);
    });
    this.winstonian.add(
      new winston.transports.Stream({
        eol: os.EOL,
        format: winston.format.combine(
          formatForHuman(),
          winston.format.simple(),
        ),
        level: level ? level : "debug",
        stream: passThrough,
      }),
    );
    return this;
  }
  public logJsonToStdOut<L extends Levels = "debug">(level?: L): StaticLogger {
    this.winstonian.add(
      new winston.transports.Console({
        eol: os.EOL,
        format: winston.format.combine(
          formatForMachine(),
          winston.format.json(),
        ),
        level: level ? level : "debug",
      }),
    );
    return this;
  }
  public logToFile<L extends Levels>(opts: LogToFileOptions<L>): LoggerFactory {
    return this;
  }
  public logToEventStream<L extends Levels>(
    level: L,
    publisher: Publisher,
  ): LoggerFactory {
    return this;
  }
  public make(subject?: string): ILogger {
    if (subject == null) {
      subject = captureMakeCallerLocation();
    }
    const pins: Array<{ key: string; value: any }> = [];
    const made = {
      debug: (msg: string, m?: {} | Error) => {
        this.winstonian.log("debug", msg, { m, subject, pins });
        return made;
      },
      error: (msg: string, m?: {} | Error) => {
        this.winstonian.log("error", msg, { m, subject, pins });
        return made;
      },
      info: (msg: string, m?: {} | Error) => {
        this.winstonian.log("info", msg, { m, subject, pins });
        return made;
      },
      label: <K extends string, V>(key: K, value: V) => {
        pins.push({ key, value });
        return made;
      },
      warn: (msg: string, m?: {} | Error) => {
        this.winstonian.log("warn", msg, { m, subject, pins });
        return made;
      },
    };
    return made;
  }
}
/**
 * Context logger allows the dev to take advantage of async hooks
 * to create a context which can store valuable metadata and correlate
 * errors to requests which would not otherwise be possible
 */
// export class ContextLogger implements LoggerFactory {
//   constructor() {}
// }
