#!/usr/bin/env node
require('dotenv').config()
const app = require('./index.js')
const config = require('./config.js');

const logger = require('./modules/logger');
console = logger;
console.empty();
console.emptyError();

// create local server
const server = app.listen((config.port), function () {
    console.log(`Addon active on port ${config.port}`);
    console.log(`HTTP addon accessible at: ${config.local}/configure`);
});

