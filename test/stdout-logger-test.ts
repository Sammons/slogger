import * as bluebird from "bluebird";
import { expect } from "chai";
import * as sinon from "sinon";
import * as Logging from "../src/index";

describe("stdout logger", () => {
  const sandbox = sinon.createSandbox();
  afterEach(() => {
    sandbox.restore();
  });
  it("should deduce topic correctly", () => {
    const file = "./test/stdout-logger-test.ts";
    const factory = new Logging.StaticLogger().logSimpleToStdOut();
    const writeSpy = sandbox.spy(process.stdout, "write");
    factory.make().info("hello there");
    return bluebird.fromCallback((cb) => {
      process.nextTick(() => {
        try {
          expect(writeSpy.callCount).to.eq(1);
          expect(writeSpy.getCall(0).args[0].toString()).to.match(
            new RegExp(
              /info: FILE:\[\d\d\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d\d\dZ\] hello there\n/.source.replace(
                "FILE",
                file,
              ),
            ),
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
  it("should write to stdout correctly", () => {
    const loggerFactory = new Logging.StaticLogger().logSimpleToStdOut();
    const logger = loggerFactory.make("logtester");
    const writeSpy = sandbox.spy(process.stdout, "write");
    logger.info("hello there");
    expect(writeSpy.called).to.eq(false); // should not be called yet
    return bluebird.fromCallback((cb) => {
      process.nextTick(() => {
        try {
          expect(writeSpy.callCount).to.eq(1);
          expect(writeSpy.getCall(0).args[0].toString()).to.match(
            /info: logtester:\[\d\d\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d\d\dZ\] hello there\n/,
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
