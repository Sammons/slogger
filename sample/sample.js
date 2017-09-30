//@ts-check
'use strict';
var logging = require('../built/index.js');

let factory = new logging.LoggerFactory().initialize()

let logger = factory.make()

logger.debug('hi guys')

setInterval(() => {
  logger.debug('hi')
}, 1000)