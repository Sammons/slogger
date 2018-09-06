import * as bluebird from "bluebird";
import { expect } from "chai";
import * as fs from "fs";
import * as os from "os";
import * as sinon from "sinon";
import * as Logging from "../src/index";

describe("file logger", () => {
  const sandbox = sinon.createSandbox();
  afterEach(() => {
    sandbox.restore();
  });
  it("should write to file correctly", () => {
    const tmpdir = os.tmpdir();
    const loggerFactory = new Logging.StaticLogger().logToFile({
      level: "debug",
      path: `${tmpdir}/sample`,
      rotateAfterSizeMb: 1,
    });
    const refDate = new Date();
    const tzoffset = refDate.getTimezoneOffset() * 60000; // offset in milliseconds
    const localISOTime = new Date(refDate.getTime() - tzoffset)
      .toISOString()
      .slice(0, -1);

    const dateSegment =
      localISOTime.substr(0, 10) +
      "-" +
      `${refDate.getHours()}`.padStart(2, "0");
    const expectedFile = `${tmpdir}/sample.${dateSegment}`;
    if (fs.existsSync(expectedFile)) {
      fs.unlinkSync(expectedFile);
    }
    const logger = loggerFactory.make("logtester");
    logger.label("contextid", "abc");
    logger.info("hello there", {
      dude: ":)",
    });
    return bluebird.fromCallback((cb) => {
      setTimeout(() => {
        try {
          expect(fs.existsSync(expectedFile), `expect ${expectedFile}`).to.eq(
            true,
          );
          const logged = JSON.parse(fs
            .readFileSync(expectedFile)
            .toString("utf8")
            .split("\n")
            .slice(-2)
            .shift() as string);
          expect(logged.meta.timestamp).to.match(
            /\d\d\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d\d\dZ/,
          );
          expect({
            ...logged,
            meta: { ...logged.meta, timestamp: null },
          }).to.deep.eq({
            level: "info",
            message: "hello there",
            meta: {
              dude: ":)",
              labels: {
                contextid: "abc",
              },
              subject: "logtester",
              timestamp: null,
            },
          });
          return cb(null);
        } catch (err) {
          cb(err);
        } finally {
          sandbox.restore();
        }
      }, 10); // enough time to write
    });
  });
});
