const express = require("express");
const app = express();
const cors = require('cors');
const path = require('path');
const { subtitles, downloadUrl } = require('./subscene');
const manifest = require("./manifest.json");
const {CacheControl} = require('./config');
const languages = require('./languages.json');
const config = require('./config.js');
const sub2vtt = require('./modules/sub2vtt');
const currentIP = require('./modules/current-ip');
let { external_domains, filterDomains } = require('./domain-list');
const NodeCache = require('node-cache');
const RedirectCache = new NodeCache(); //sub list


if(config.env != 'external') {
	filterDomains().then(res => {
		external_domains = res;
		console.log('valid domains', external_domains);
	})
}

const DiskCache = require('node-persist');

DiskCache.init({
  dir: './cache/files',
  ttl: 7 * 24 * 60 * 60 * 1000, // 7 days,
  expiredInterval: 2 * 60 * 60 * 1000,
  forgiveParseErrors: false
})

// filesCache.set = filesCache.setItem;
// filesCache.get = filesCache.getItem;

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
	console.log("\nreqpath : ", req.originalUrl)
	console.log('----------------------------------')
    req.setTimeout(180 * 1000); // timeout time
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

if(config.env != 'local' && external_domains?.length) {
	let start_server = config.env == 'beamup' ? 1 : 0;
	app.get('/:configuration?/subtitles/:type/:id/:extra?.json', (req, res, next) => {
		const { type, id } = req.params;
		const redirectID = `${type}_${id}`;
		const redirect_server = RedirectCache.get(redirectID);
		if(redirect_server) {
			const redirect_url = redirect_server + req.originalUrl;
			console.log("Redirect 301 cached: " + redirect_url);
			return res.redirect(301, redirect_url);
		}
		
		if(start_server > external_domains.length) config.env == 'beamup' ? start_server = 1 : start_server = 0; //force redirect from beamup
		if(start_server) {
			const redirect_server = external_domains[start_server++ - 1];
			const redirect_url = redirect_server + req.originalUrl;
			console.log("Redirect 301: " + redirect_url);
			RedirectCache.set(redirectID, redirect_server);
			return res.redirect(301, redirect_url);
		}
		start_server++;
		next();
	})
}

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
			} else if(subs && !subs.length) {
				console.log("no subs");
				res.setHeader('Cache-Control', CacheControl.oneHour);
				return res.end(JSON.stringify({ subtitles: [] }));
			}
		} else console.log("no config");

		//default response
		res.setHeader('Cache-Control', CacheControl.off);
		return res.end(JSON.stringify({ subtitles: [] }));
	}catch(e){
		res.sendStatus(500);
		console.error(e);
	}
})

//############
//No limit download && dont need redirect bc req always return selfhost

// app.get('/sub.vtt', (req, res, next) => {
// 	if(start_server > external_domains.length) start_server = 0;
// 	if(start_server) {
// 		const redirect_url = external_domains[start_server++ - 1] + req.originalUrl;
// 		console.log("Redirect 301: " + redirect_url);
// 		return res.redirect(301, redirect_url);
// 	}
// 	start_server++;
// 	next();
// })

sharedRouter.get('/sub.vtt', async (req, res,next) => {
	try {

		let url,proxy,episode,title;
		
		if (req?.query?.proxy) proxy = JSON.parse(Buffer.from(req.query.proxy, 'base64').toString());
		if (req?.query?.from) url = req.query.from
		else throw 'error: no url';
		if (req?.query?.episode) episode = req.query.episode
		if(req?.query?.title) title = req.query.title
		proxy =  {responseType: "buffer", "User-Agent": 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/119.0'}

		let file = {};
		file.subtitle = await DiskCache.getItem(title);
		if(file.subtitle) {
			console.log(`file ${title} is loaded from storage cache!`);
		} else {
			url = await downloadUrl(url);

			console.log({url, proxy, episode})
			
			let sub = new sub2vtt(url , { proxy, episode });
			
			file = await sub.getSubtitle();
			
			if (!file?.data?.subtitle?.length) throw file?.data?.status

			const filename = file.name;
			file = file.data;

			let sub_head_long = 10;
			if(episode) sub_head_long = 5;
			const subtitle_header_info = [
				'WEBVTT\n',
				'0',
				`00:00:03.000 --> 00:00:${3+sub_head_long}.000`,
				`&gt;&gt;[REUP]Subscene by Dexter21767 v${manifest.version}&lt;&lt;`,
				`${title}`,
				`<u>${filename}</u>\n\n`
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

			DiskCache.setItem(title, file.subtitle);
		}

		res.setHeader('Cache-Control', CacheControl.oneDay);
		res.setHeader('Content-Type', 'text/vtt;charset=UTF-8');
		res.send(file.subtitle);
		res.end;
	} catch (e) {
		console.error(e);
		res.sendStatus(500);
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

sharedRouter.get('/current-ip', async (req, res) => {
	const ip_adr = await currentIP();
	if(ip_adr) res.end(ip_adr);
	else res.sendStatus(500);
})

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
