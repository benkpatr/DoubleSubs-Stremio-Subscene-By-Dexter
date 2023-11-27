const express = require("express");
const app = express();
const cors = require('cors');
const path = require('path');
const { subtitles, downloadUrl } = require('./subscene');
const manifest = require("./manifest.json");
const {CacheControl} = require('./configs/config');
const languages = require('./configs/languages.json');
const config = require('./configs/config');
const sub2vtt = require('./modules/sub2vtt');
const currentIP = require('./modules/current-ip');
let { external_domains, filterDomains } = require('./configs/domain-list');
const aes = require('./modules/aes');
const NodeCache = require('node-cache');
const RSS = require('./modules/subsceneRSS');
const db = require('./modules/bettersqlite3');
const multer  = require('multer');
const upload = multer({ dest: process.cwd() + '/uploads/'});

const RedirectCache = new NodeCache();
const QueueCache = new NodeCache({ stdTTL: 5 });
const QueueSub = new NodeCache({ stdTTL: 10 });
const QueueIP = new NodeCache({ stdTTL: 5 });
let LimitDownload = new NodeCache({ stdTTL: 24*60*60, checkperiod: 24*60*60 });
setInterval(() => {
	LimitDownload.flushAll();
}, 24*60*60*1000);

const aesPass = process.env.AES_PWD;

// if(config.env != 'external' && config.env != 'local') {
// 	filterDomains().then(res => {
// 		external_domains = res;
// 		console.log('valid domains', external_domains);
// 	})
// }

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
	onAuthenticate: (req, username, password) => {
		// simple check for username and password
		const User = process.env.SWAGGER_USER?process.env.SWAGGER_USER:'stremio'
		const Pass = process.env.SWAGGER_PASS?process.env.SWAGGER_PASS:'stremioIsTheBest'
		return username === User && password === Pass
	}
}))

app.use((req, res, next) => {
	if(req.path.includes('/sql/')) return next();
	console.log("\nreqpath : ", req.originalUrl)
	console.log('----------------------------------')
    req.setTimeout(60 * 1000, () => res.sendStatus(504)); // timeout time
    next();
});

app.set('trust proxy', true)

app.use('/configure', express.static(path.join(__dirname, 'vue', 'dist')));
app.use('/assets', express.static(path.join(__dirname, 'vue', 'dist', 'assets')));

app.use(cors())

app.get('/', (_, res) => {
	res.redirect('/configure')
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
});

app.get('/:configuration?/manifest.json', (_, res) => {
	res.setHeader('Cache-Control', CacheControl.oneDay);
	res.setHeader('Content-Type', 'application/json');
	manifest.behaviorHints.configurationRequired = false;
	res.send(manifest);
});

sharedRouter.post('/sql/upload', upload.any(), (req, res) => {
	if(!req.files || req.files.length === 0) return res.sendStatus(400);
	const file = req.files[0];
	switch(file.fieldname) {
		case 'sql': {
			console.log('Loading SQL file:', file.originalname);
			db.loadSQL(file.path);
			res.send('Success!')
		} break;
		case 'rss': {
			console.log('Loading RSS file:', file.originalname);
			const rssDB = require('better-sqlite3')(file.path);
			const rss = rssDB.prepare(`SELECT * FROM rss`).all();
			console.log('Updating RSS...');
			RSS.updateSQL(rss, []);
			if(req.body.redirect == 'true') {
				const redirects = rssDB.prepare(`SELECT * FROM redirect`).all();
				console.log('Updating Redirects...');
				redirects.forEach(redirect => RedirectCache.set(redirect.id, redirect.dest));
			}
			rssDB.close();
			res.send('Success!');
		} break;
		default: res.sendStatus(400);
	}
})

sharedRouter.get('/sql/:action', (req, res) => {
    const action = req.params.action;
    switch(action) {
        case 'info': {
            const sqlInfo = db.fileInfo();
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify(sqlInfo));
        }; break;
        case 'download': {
			db.forceCheckPoint('RESTART');
            res.download(db.sql_file);
        }; break;
        case 'upload': res.sendFile(process.cwd() + '/htmls/upload.html'); break;
        default: {
            res.sendStatus(400);
        }
    }
})

sharedRouter.get('/RSS/:type', (req, res) => {
	res.setHeader('Content-Type', 'application/json');
	res.setHeader('Cache-Control', config.CacheControl.off);
	switch(req.params.type) {
		case 'film': res.send(JSON.stringify(RSS.getLastFetch().movie)); break;
		case 'series': res.send(JSON.stringify(RSS.getLastFetch().series)); break;
		default: res.send(JSON.stringify([]));
	}
})

//Limit 1 Request/IP
sharedRouter.use((req, res, next) => {
	const req_ip = req.ip;
	const requesting = QueueIP.get(req_ip) || 0;
	if(requesting >= 1) {
		console.warn(req_ip, `Too many request!`);
		return res.sendStatus(429);
	};
	QueueIP.set(req_ip, requesting+1);
	next();
});

if(config.env != 'local' && config.env != 'external' && external_domains?.length) {
	let start_server = config.env == 'beamup' ? 1 : 0;
	sharedRouter.get('/:configuration?/subtitles/:type/:id/:extra?.json', (req, res, next) => {
		const { type, id } = req.params;
		let redirectID = id;
		if(type == 'series') redirectID = id.split(':').slice(0, 2).join(':');
		console.log(redirectID);
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
			db.set(db.Tables.Redirect, ['id', 'dest'], [redirectID, redirect_server]);
			return res.redirect(301, redirect_url);
		}
		start_server++;
		next();
	})
}

sharedRouter.get('/:configuration?/subtitles/:type/:id/:extra?.json', async (req, res, next) => {
	try{
		//console.log(req.params);
		var { configuration, type, id } = req.params;
		
		const reqID = `${type}_${id}`;
		while(QueueCache.get(reqID)) {
			await new Promise(resolve => setTimeout(resolve, 1000)); //wait 5s (cache timing) if still getting
		}

		QueueCache.set(reqID, true); //requesting

		if (configuration && languages[configuration]) {
			let lang = configuration;
			let req_extras = req.params.extra?.split('&');
			let extras = {};
			if(req_extras){
				req_extras.forEach(extra => {
					extras[extra.split('=')[0]] = extra.split('=')[1];
				})
			}
			const subs = await subtitles(type, id, lang, extras);

			res.setHeader('Content-Type', 'application/json');
			if(subs?.length){
				subs.map(sub => sub.url+=`&s=${aes.encrypt(req.ip, aesPass)}`);
				res.setHeader('Cache-Control', CacheControl.fourHour);
				res.status(200).send(JSON.stringify({ subtitles: subs.slice(0,10) }));
			} else {
				console.log("no subs");
				res.setHeader('Cache-Control', CacheControl.fifteenMins);
				res.status(200).send(JSON.stringify({ subtitles: [] }));
			}

			next();
		} else {
			console.log("no config");
			res.sendStatus(400);
		};
		QueueCache.set(reqID, false); //allow new request if before request done
	}catch(e){
		console.error(e);
		res.sendStatus(500);
	}
})

//Block someone using multiple ip to fetch multi sub got from one ip
const blockMultiReqFromIP = (req, res, next) => {
	let secure;
	if(req.query.s) secure = req.query.s;
	if(!secure) return res.sendStatus(400);
	try {
		const sourceIP = aes.decrypt(secure, aesPass);
		if(sourceIP != req.ip) {
			const req_count = QueueIP.get(sourceIP) || 0;
			if(req_count >= 1) {
				console.warn(sourceIP, 'Fetching to multi sub got from one IP');
				return res.sendStatus(429);
			};
			QueueIP.set(sourceIP, req_count+1);
		}
		next();
	} catch(e) {
		res.sendStatus(400);
	}
}
//Limit downloads
const limitVTTDownload = (req, res, next) => {
	const download = LimitDownload.get(req.ip) || 0;
	if(download >= 30)  {
		const subtitle = [
			'WEBVTT\n',
			'1',
			'00:00:00.000 --> 02:00:00.000',
			'[REUP]Subscene by Dexter21767',
			'Limit download: 30/day'
		]

		res.setHeader('Cache-Control', CacheControl.off);
		res.setHeader('Content-Type', 'text/vtt;charset=UTF-8');
		res.send(subtitle.join('\n'));
	} else
		next();
}
//get subtitle
sharedRouter.get('/sub.vtt', blockMultiReqFromIP, limitVTTDownload, async (req, res, next) => {
	try {
		let url,proxy,episode,title, lang;
		
		//if (req?.query?.proxy) proxy = JSON.parse(Buffer.from(req.query.proxy, 'base64').toString());
		if (req.query.from) url = req.query.from
		else throw 'error: no url';
		if (req.query.episode) episode = req.query.episode
		if(req.query.title) title = req.query.title
		if(req.query.lang) lang = req.query.lang

		if(!lang || !title || !url) return res.redirect('/404');

		proxy =  {responseType: "buffer", "User-Agent": 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/119.0'}

		let fileID = lang + '_' + url.split('/').pop() + (episode ? '_' + episode : '');

		//Queue request to one file
		while(QueueSub.get(fileID)) {
			await new Promise(resolve => setTimeout(resolve, 1000)); //wait 5s (cache timing) if still getting
		}

		let file = {};
		file.subtitle = await DiskCache.getItem(fileID);
		if(file.subtitle) {
			console.log(`file ${title} is loaded from storage cache!`);
		} else {
			QueueSub.set(fileID, true); //file is loading

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
				`${title?.trim()}`,
				`<u>=&gt;${filename}</u>\n\n`
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

			DiskCache.setItem(fileID, file.subtitle);
			QueueSub.set(fileID, false); //file is load done
		}

		//Count download
		const downloaded = LimitDownload.get(req.ip) || 0;
		LimitDownload.set(req.ip, downloaded+1);

		res.setHeader('Cache-Control', CacheControl.oneDay);
		res.setHeader('Content-Type', 'text/vtt;charset=UTF-8');
		res.status(200).send(file.subtitle);
		next();
	} catch (e) {
		console.error(e);
		res.sendStatus(500);
		//next(e);
	}
})

sharedRouter.use(['/:configuration?/subtitles/:type/:id/:extra?.json', '/sub.vtt'], (req, res) => {
	if(res.statusCode == 200)
		QueueIP.del(req.ip);
});

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
	res.redirect(301, '/404');
})

//beamup logs
if(config.env == 'beamup') {
	app.get('/logs', (req, res) => {
		res.setHeader('Cache-Control', CacheControl.off);
		res.end(console.read());
	})

	app.get('/logs/error', (req, res) => {
		res.setHeader('Cache-Control', CacheControl.off);
		res.end(console.readError());
	})

	app.get('/logs/warn', (req, res) => {
		res.setHeader('Cache-Control', CacheControl.off);
		res.end(console.readWarn());
	})
}
app.use(sharedRouter);

module.exports = {
	app,
	sharedRouter
}
