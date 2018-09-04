import { expect } from "chai";
import * as sinon from "sinon";
import { PassThrough } from "stream";
import * as Logging from "../src/index";

describe("stdout logger", () => {
  it("should write to stdout correctly", (done) => {
    const sandbox = sinon.createSandbox();
    const loggerFactory = new Logging.StaticLogger().logSimpleToStdOut();
    const logger = loggerFactory.make("logtester");
    const writeStub = sandbox.spy(process.stdout, "write");
    logger.info("hello there");
    done();
    // process.nextTick(() => {
    //   try {
    //     expect(writeStub.callCount).to.eq(1);
    //     expect(writeStub.getCall(0).args[0].toString()).to.eq("wat");
    //     done();
    //   } catch (err) {
    //     done(err);
    //   } finally {
    //     sandbox.restore();
    //   }
    // });
  });
});
