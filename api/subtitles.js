const {CacheControl} = require('../configs/config');
const languages = require('../configs/languages.json');
const { subtitles, downloadUrl } = require('../subscene');
const NodeCache = require('node-cache');
const QueueCache = new NodeCache({ stdTTL: 5 });

export default async function handler(req, res) {
  try{
		res.setHeader('Access-Control-Allow-Origin', '*');
		res.setHeader('Content-Type', 'application/json');
		req.params = {
		configuration: req.url.split('/')[1],
		type: req.url.split('/')[3],
		id: decodeURIComponent(req.url.split('/')[4].split('.json')[0])
		}
		
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
			const subs = await subtitles(type, id, lang, extras)
			if(subs){
				res.setHeader('Cache-Control', CacheControl.fourHour);
				res.send(JSON.stringify({ subtitles: subs }));
			} else if(subs && !subs.length) {
				console.log("no subs");
				res.setHeader('Cache-Control', CacheControl.oneHour);
				res.send(JSON.stringify({ subtitles: [] }));
			}
			QueueCache.set(reqID, false);
		} else{
			console.log("no config");
			res.status(500).end();
		}
	}catch(e){
		res.status(500).end();
		console.error(e);
	}
}