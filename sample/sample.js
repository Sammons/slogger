//@ts-check
"use strict";
var logging = require("../built/index.js");

let factory = new logging.LoggerFactory().initialize();

let logger = factory.make();
let e = new Error("off");
e["status"] = 203;
let s = {  };
s.me = s;
e["req"] = {
  b: new Buffer("XYZGEONTSUHENTUHOSNEUTHONTEHUSNOTEHUSNOTEHUSNOE"),
  e,
  s,
  reg: /123/gi,
  a: new Array(100),
  d: new Date(),
  moar: { e }
};
logger.debug("hi guys", e);

setInterval(() => {
  logger.debug("hi");
}, 1000);
