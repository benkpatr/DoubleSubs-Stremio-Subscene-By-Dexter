const {CacheControl} = require('../config');
const languages = require('../languages.json');
const { subtitles, downloadUrl } = require('../subscene');

export default async function handler(req, res) {
  try{
		res.setHeader('Content-Type', 'application/json');
		console.log(req.params);
		req.params = {
		configuration: req.url.split('/')[1],
		type: req.url.split('/')[3],
		id: decodeURIComponent(req.url.split('/')[4].split('.json')[0])
		}
		
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
		res.setHeader('Cache-Control', CacheControl.off);
		res.status(500);
		console.error(e);
	}
}