const express = require('express');
const app = express();
const cors = require('cors');
const { sharedRouter } = require('../index.js')
const config = require('../configs/config.js');

app.use((req, res, next) => {
	console.log("\nreqpath : ", req.originalUrl)
	console.log('----------------------------------')
    req.setTimeout(60 * 1000, () => res.sendStatus(504)); // timeout time
    next();
});
		
app.set('trust proxy', true)

app.use(cors())

app.get('/', (req, res) => {
    res.redirect(301, config.beamupURL);
})
app.use(sharedRouter);

module.exports = app
