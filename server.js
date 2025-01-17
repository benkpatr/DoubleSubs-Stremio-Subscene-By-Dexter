#!/usr/bin/env node
require("dotenv").config();
const config = require("./configs/config.js");
require("./modules/subsceneRSS.js");

if (config.env == "external") var app = require("./external/index.js");
else {
  var { app } = require("./index.js");
  if (config.env == "beamup") {
    const logger = require("./modules/logger.js");
    console = logger;
    console.empty();
    console.emptyWarn();
    console.emptyError();
  }
}

// create local server
const server = app.listen(config.port, function () {
  console.log(`NODE_ENV = ${config.env}`);
  console.log(`Addon active on port ${config.port}`);
  console.log(`HTTP addon accessible at: ${config.local}/configure`);
  //console.log(process.env);
});
