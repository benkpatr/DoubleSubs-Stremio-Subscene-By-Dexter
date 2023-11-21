const currentIP = require('../modules/current-ip');
export default async function handler(req, res) {
    const ip_adr = await currentIP();
	if(ip_adr) res.end(ip_adr);
	else res.status(500);
}