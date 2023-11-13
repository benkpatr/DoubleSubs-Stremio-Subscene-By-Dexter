const express = require('express');
const app = express();
const cors = require('cors');
const { sharedRouter } = require('../index.js')
const config = require('../config.js');

app.use((req, res, next) => {
	console.log("reqpath : ", req.originalUrl)
	console.log('----------------------------------')
    req.setTimeout(60 * 1000); // timeout time
	//long timeout, still give time to cache subs, next play will load from cache
    req.socket.removeAllListeners('timeout'); 
    req.socket.once('timeout', () => {
        req.timedout = true;
		//res.setHeader('Cache-Control', CacheControl.off);
        res.status(504).end();
    });
	if (!req.timedout) next()
});

app.set('trust proxy', true)

app.use(cors())

app.get('/', (req, res) => {
    res.redirect(301, config.beamupURL);
})
app.use('/', sharedRouter);

module.exports = app
