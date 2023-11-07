const express = require("express");
const app = express();
const cors = require('cors');
const path = require('path');
const { subtitles, downloadUrl } = require('../subscene');
const manifest = require("../manifest.json");
const {CacheControl} = require('../config');
const languages = require('../languages.json');

const swStats = require('swagger-stats')

app.use(swStats.getMiddleware({
	name: manifest.name,
	version: manifest.version,
	authentication: true,
	onAuthenticate: function (req, username, password) {
		// simple check for username and password
		const User = process.env.USER?process.env.USER:'stremio'
		const Pass = process.env.PASS?process.env.PASS:'stremioIsTheBest'
		return ((username === User
			&& (password === Pass)))
	}
}))

app.use((req, res, next) => {
	console.log("reqpath : ", req.path)
	console.log('----------------------------------')
    req.setTimeout(90 * 1000); // timeout time
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

app.get('/:configuration?/subtitles/:type/:id/:extra?.json', async(req, res) => {
	try{
		res.setHeader('Content-Type', 'application/json');
		console.log(req.params);
		var { configuration, type, id } = req.params;

		if (configuration && languages[configuration]) {
			let lang = configuration;
			const subs = await subtitles(type, id, lang)
			if(subs){
				res.setHeader('Cache-Control', CacheControl.fourHour);
				return res.end(JSON.stringify({ subtitles: subs }));
			} else console.log("no subs");

		} else console.log("no config");

		//default response
		res.setHeader('Cache-Control', CacheControl.oneHour);
		res.end(JSON.stringify({ subtitles: [] }));
	}catch(e){
		console.error(e);
	}
})

const sub2vtt = require('sub2vtt');
app.get('/sub.vtt', async (req, res,next) => {
	try {

		let url,proxy,episode;
		
		if (req?.query?.proxy) proxy = JSON.parse(Buffer.from(req.query.proxy, 'base64').toString());
		if (req?.query?.from) url = req.query.from
		else throw 'error: no url';
		if (req?.query?.episode) episode = req.query.episode

		proxy =  {responseType: "buffer", "User-Agent": 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/119.0'}

		url = await downloadUrl(url);

		console.log({url, proxy, episode})
		
		let sub = new sub2vtt(url , { proxy, episode });
		
		let file = await sub.getSubtitle();
		
		if (!file?.subtitle?.length) throw file.status

		res.setHeader('Cache-Control', CacheControl.oneDay);
		res.setHeader('Content-Type', 'text/vtt;charset=UTF-8');
		res.end(file.subtitle);
	} catch (e) {
		console.error(e);
		//next(e);
	}
})

app.get('/logs', (req, res) => {
	res.setHeader('Cache-Control', CacheControl.off);
	res.end(console.read());
})

app.get('/logs/error', (req, res) => {
	res.setHeader('Cache-Control', CacheControl.off);
	res.end(console.readError());
})

app.get('/404', (req, res) => {
	res.setHeader('Cache-Control', CacheControl.off);
	res.status(404);
	res.end("404 Not Found!");
})

app.get('*', (req, res) => {
	return res.redirect(301, '/404');
})
module.exports = app
