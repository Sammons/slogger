import * as bluebird from "bluebird";
import { expect } from "chai";
import * as sinon from "sinon";
import * as Logging from "../src/index";

describe("stdout json logger", () => {
  const sandbox = sinon.createSandbox();
  afterEach(() => {
    sandbox.restore();
  });
  it("should write json to stdout correctly", () => {
    const loggerFactory = new Logging.StaticLogger().logJsonToStdOut();
    const logger = loggerFactory.make("logtester");
    logger.label("contextid", "abc");
    const writeSpy = sandbox.spy(process.stdout, "write");
    logger.info("hello there", { dude: ":)" });
    expect(writeSpy.called).to.eq(false); // should not be called yet
    return bluebird.fromCallback((cb) => {
      process.nextTick(() => {
        try {
          expect(writeSpy.callCount).to.eq(1);
          const log = JSON.parse(writeSpy.getCall(0).args[0].toString());
          expect(log.meta.timestamp).to.match(
            /\d\d\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d\d\dZ/,
          );
          expect({ ...log, meta: { ...log.meta, timestamp: null } }).to.deep.eq(
            {
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
            },
          );
          return cb(null);
        } catch (err) {
          cb(err);
        } finally {
          sandbox.restore();
        }
      });
    });
  });
});
