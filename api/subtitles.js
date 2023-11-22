const {CacheControl} = require('../configs/config');
const languages = require('../configs/languages.json');
const { subtitles, downloadUrl } = require('../subscene');
const aes = require('../modules/aes');

const aesPass = process.env.AES_PWD;

export default async function handler(req, res) {
  try{
		let _req = req.url.split('/');
		req.params = {
			configuration: _req[1],
			type: _req[3],
			id: decodeURIComponent(_req[4].split('.json')[0]),
			extra: _req.length == 6 ? decodeURIComponent(_req[5].split('.json')[0]) : null
		}
		
		var { configuration, type, id } = req.params;

		if (configuration && languages[configuration]) {
			res.setHeader('Access-Control-Allow-Origin', '*');
			res.setHeader('Content-Type', 'application/json');
			let lang = configuration;
			let req_extras = req.params.extra?.split('&');
			let extras = {};
			if(req_extras){
				req_extras.forEach(extra => {
					extras[extra.split('=')[0]] = extra.split('=')[1];
				})
			}
			const subs = await subtitles(type, id, lang, extras)
			if(subs?.length){
				res.setHeader('Cache-Control', CacheControl.fourHour);
				subs.map(sub => sub.url+=`&s=${aes.encrypt(req.headers['x-forwarded-for'], aesPass)}`);
				res.send(JSON.stringify({ subtitles: subs.slice(0,10) }));
			} else {
				console.log("no subs");
				res.setHeader('Cache-Control', CacheControl.oneHour);
				res.send(JSON.stringify({ subtitles: [] }));
			}
		} else{
			console.log("no config");
			res.status(500).end();
		}
	}catch(e){
		res.status(500).end();
		console.error(e);
	}
}