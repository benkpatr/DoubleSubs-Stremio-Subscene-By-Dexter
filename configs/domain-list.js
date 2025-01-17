const axios = require('axios');

const external_domains = [
    "https://subscene.onrender.com", //#zbm5rljs us 61120
    "https://subscene-ip8j.onrender.com", //asia 61121
    "https://subscene-h090.onrender.com", //#ob0b034u us 61122
    "https://subscene-ljxx.onrender.com", //eu 61123
    //"https://subscene-rouge.vercel.app" //vercel serverless
]

async function filterDomains(){
    try  {
        const valid_domains = [];
        const ip_list = [];
        for (const domain of external_domains){
            const ip_adr = await axios.get(domain + '/current-ip').then(res => {
                if(res.status != 200) return;
                return res.data;
            }).catch(err => { console.error("failed get current ip: " + domain)});

            if(ip_adr) {
                if(!ip_list.find(ip => ip == ip_adr)) {
                    valid_domains.push(domain);
                    ip_list.push(ip_adr);
                }
            }
        };
        if(valid_domains.length) return valid_domains;
        else return external_domains;
    } catch(e) {
        console.error(e);
    }
}

module.exports = {
    external_domains: external_domains,
    filterDomains: filterDomains
};