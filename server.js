#!/usr/bin/env node
require('dotenv').config()
const config = require('./config.js');
if(process.env.NODE_ENV == 'external') var app = require('./external/index.js')
else {
    var app = require('./index.js')
    const logger = require('./modules/logger');
    console = logger;
    console.empty();
    console.emptyError();
}

// create local server
const server = app.listen((config.port), function () {
    console.log(`NODE_ENV = ${process.env.NODE_ENV}`);
    console.log(`Addon active on port ${config.port}`);
    console.log(`HTTP addon accessible at: ${config.local}/configure`);
});

