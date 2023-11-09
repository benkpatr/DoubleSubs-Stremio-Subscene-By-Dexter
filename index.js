const express = require("express");
const app = express();
const cors = require('cors');
const path = require('path');
const { subtitles, downloadUrl } = require('./subscene');
const manifest = require("./manifest.json");
const {CacheControl} = require('./config');
const languages = require('./languages.json');
const external_domains = require('./domain-list');

const swStats = require('swagger-stats')

const sharedRouter = express.Router();

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

app.use('/configure', express.static(path.join(__dirname, 'vue', 'dist')));
app.use('/assets', express.static(path.join(__dirname, 'vue', 'dist', 'assets')));

app.use(cors())


app.get('/', (_, res) => {
	res.redirect('/configure')
	res.end();
});

app.get('/:configuration?/configure', (req, res) => {
	res.setHeader('Cache-Control', CacheControl.oneDay);
	res.setHeader('content-type', 'text/html');
	res.sendFile(path.join(__dirname, 'vue', 'dist', 'index.html'));
});

app.get('/manifest.json', (_, res) => {
	res.setHeader('Cache-Control', CacheControl.oneDay);
	res.setHeader('Content-Type', 'application/json');
	manifest.behaviorHints.configurationRequired = true;
	res.send(manifest);
	res.end();
});

app.get('/:configuration?/manifest.json', (_, res) => {
	res.setHeader('Cache-Control', CacheControl.oneDay);
	res.setHeader('Content-Type', 'application/json');
	manifest.behaviorHints.configurationRequired = false;
	res.send(manifest);
	res.end();
});


let start_server = 0;
app.get('/:configuration?/subtitles/:type/:id/:extra?.json', (req, res, next) => {
	if(start_server > external_domains.length) start_server = 0;
	if(start_server) {
		const redirect_url = external_domains[start_server++ - 1] + req.originalUrl;
		console.log("Redirect 301: " + redirect_url);
		return res.redirect(301, redirect_url);
	}
	start_server++;
	next();
})

sharedRouter.get('/:configuration?/subtitles/:type/:id/:extra?.json', async(req, res) => {
	try{
		res.setHeader('Content-Type', 'application/json');
		console.log(req.params);
		var { configuration, type, id } = req.params;

		if (configuration && languages[configuration]) {
			let lang = configuration;
			let req_extras = req.params.extra?.split('&');
			let extras = {};
			if(req_extras){
				req_extras.forEach(extra => {
					extras[extra.split('=')[0]] = extra.split('=')[1];
				})
			}
			const subs = await subtitles(type, id, lang, extras)
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
		res.setHeader('Cache-Control', CacheControl.off);
		res.sendStatus(500);
		res.end('500');
	}
})

/*
app.get('/:subtitles/:name/:language/:id/:episode?\.:extension?', limiter, (req, res) => {
	console.log(req.params);
	let { subtitles, name, language, id, episode, extension } = req.params;
	try {
		let path = `/${subtitles}/${name}/${language}/${id}`
		res.setHeader('Cache-Control', 'max-age=86400, public');
		res.setHeader('responseEncoding', 'null');
		res.setHeader('Content-Type', 'arraybuffer/json');
		console.log(path);
		proxyStream(path, episode).then(response => {
			res.send(response);
		}).catch(err => { console.log(err) })
	} catch (err) {
		console.log(err)
		return res.send("Couldn't get the subtitle.")
	}
});
*/

app.get('/sub.vtt', (req, res, next) => {
	if(start_server > external_domains.length) start_server = 0;
	if(start_server) {
		const redirect_url = external_domains[start_server++ - 1] + req.originalUrl;
		console.log("Redirect 301: " + redirect_url);
		return res.redirect(301, redirect_url);
	}
	start_server++;
	next();
})

const sub2vtt = require('sub2vtt');
const { config } = require("dotenv");
sharedRouter.get('/sub.vtt', async (req, res,next) => {
	try {

		let url,proxy,episode,title;
		
		if (req?.query?.proxy) proxy = JSON.parse(Buffer.from(req.query.proxy, 'base64').toString());
		if (req?.query?.from) url = req.query.from
		else throw 'error: no url';
		if (req?.query?.episode) episode = req.query.episode
		if(req?.query?.title) title = req.query.title
		proxy =  {responseType: "buffer", "User-Agent": 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/119.0'}

		url = await downloadUrl(url);

		console.log({url, proxy, episode})
		
		let sub = new sub2vtt(url , { proxy, episode });
		
		let file = await sub.getSubtitle();
		
		if (!file?.subtitle?.length) throw file.status

		let sub_head_long = 20;
		if(episode) sub_head_long = 10;
		const subtitle_header_info = [
			'WEBVTT\n',
			'0',
			`00:00:05.000 --> 00:00:${5+sub_head_long}.000`,
			'[REUP]Subscene by Dexter21767',
			`${title ? title : ''}\n\n`
		];
		const lines = file.subtitle.split('\n');
		for(i = 0; i < lines.length; i++) {
			if(!lines[i]) continue;
			let startTimeSecond = lines[i].match(/\d\d:\d\d:\d\d/);
			if(startTimeSecond && startTimeSecond[0].split(':')[1]*60 + startTimeSecond[0].split(':')[2] >= (5+sub_head_long)) {
				file.subtitle = subtitle_header_info.join('\n') + lines.slice(i-1).join('\n');
				break;
			}
		}

		res.setHeader('Cache-Control', CacheControl.oneDay);
		res.setHeader('Content-Type', 'text/vtt;charset=UTF-8');
		res.send(file.subtitle);
		res.end;
	} catch (e) {
		console.error(e);
		res.setHeader('Cache-Control', CacheControl.off);
		res.sendStatus(500);
		res.end('500');
		//next(e);
	}
})

if(config.env == 'beamup') {
	app.get('/logs', (req, res) => {
		res.setHeader('Cache-Control', CacheControl.off);
		res.end(console.read());
	})

	app.get('/logs/error', (req, res) => {
		res.setHeader('Cache-Control', CacheControl.off);
		res.end(console.readError());
	})
}

sharedRouter.get('/404', (req, res) => {
	res.setHeader('Cache-Control', CacheControl.off);
	res.status(404);
	res.end("404 Not Found!");
})

sharedRouter.get('*', (req, res) => {
	return res.redirect(301, '/404');
})

app.use(sharedRouter);

module.exports = {
	app,
	sharedRouter
}
