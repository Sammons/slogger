import * as os from "os";
import * as path from "path";
import * as stream from "stream";
import * as winston from "winston";
import * as winstonDailyRotator from "winston-daily-rotate-file";
import * as Transport from "winston-transport";
import { Preprocessor } from "./meta-processor";

function captureMakeCallerLocation(nesting: number = 0) {
  const e = new Error();
  const stack = e.stack != null ? e.stack : "";
  const lines = stack.split("\n");
  const offset = nesting + 3;
  const fileMatch = (lines[offset] ? lines[offset] : "none").match(
    /\((\/.*?)\:/,
  );
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
  rotateAfterSizeMb: number;
  level: L;
}

type Levels = "debug" | "warn" | "info" | "error";
const levels: Levels[] = ["debug", "warn", "info", "error"];

export type Publisher = (level: string, chunk: Buffer) => Promise<void>;

export type ILogger<T extends any = void> = {
  [K in Levels]: (message: string, meta?: object | Error) => void
} & {
  label<K extends string, V>(key: K, value: V): ILogger<T & { [k in K]: V }>;
};

export interface LoggerFactory {
  logToTransport(transport: Transport): LoggerFactory;
  logSimpleToStdOut<L extends Levels = "debug">(level?: L): LoggerFactory;
  logJsonToStdOut<L extends Levels = "debug">(level?: L): LoggerFactory;
  logToFile<L extends Levels = "debug">(
    opts: LogToFileOptions<L>,
  ): LoggerFactory;
}
// for development
const formatForHuman = winston.format((info, opts) => {
  const { subject, pins, m, level, ...rest } = info;
  let { message } = info;
  for (const p of pins) {
    message = `${p.key}:[${JSON.stringify(p.value)}] ` + message;
  }
  if (level === "error") {
    m.system = captureSystemInfo();
  }
  message = `${subject}:[${new Date().toISOString()}] ${message}`;
  return { ...rest, message, level, meta: Preprocessor.preprocess(m) };
});
// for events,
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
  public logToTransport(transport: Transport) {
    this.winstonian.add(transport);
    return this;
  }
  public logSimpleToStdOut<L extends Levels = "debug">(
    level?: L,
  ): StaticLogger {
    const passThrough = new stream.PassThrough();
    passThrough.on("data", async (chunk) => {
      process.nextTick(() => process.stdout.write(chunk));
    });
    this.winstonian.add(
      new winston.transports.Stream({
        eol: os.EOL,
        format: winston.format.combine(
          formatForHuman(),
          winston.format.simple(),
        ),
        handleExceptions: false,
        level: level ? level : "debug",
        stream: passThrough,
      }),
    );
    return this;
  }
  public logJsonToStdOut<L extends Levels = "debug">(level?: L): StaticLogger {
    const passThrough = new stream.PassThrough();
    passThrough.on("data", async (chunk) => {
      process.nextTick(() => process.stdout.write(chunk));
    });
    this.winstonian.add(
      new winston.transports.Stream({
        eol: os.EOL,
        format: winston.format.combine(
          formatForMachine(),
          winston.format.json(),
        ),
        handleExceptions: false,
        level: level ? level : "debug",
        stream: passThrough,
      }),
    );
    return this;
  }
  public logToFile<L extends Levels>(opts: LogToFileOptions<L>): StaticLogger {
    const pieces = path.parse(opts.path);
    this.winstonian.add(
      new winstonDailyRotator({
        datePattern: "YYYY-MM-DD-HH",
        dirname: pieces.dir,
        eol: os.EOL,
        filename: pieces.base,
        format: winston.format.combine(
          formatForMachine(),
          winston.format.json(),
        ),
        level: opts.level,
        maxSize: `${opts.rotateAfterSizeMb}m`,
      }),
    );
    return this;
  }
  public nestedMake(nesting: number, subject?: string): ILogger {
    if (subject == null) {
      subject = captureMakeCallerLocation(nesting).replace(process.cwd(), ".");
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
  public make(subject?: string): ILogger {
    if (subject == null) {
      subject = captureMakeCallerLocation().replace(process.cwd(), ".");
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
