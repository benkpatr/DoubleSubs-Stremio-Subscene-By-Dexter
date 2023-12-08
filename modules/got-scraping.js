let gotConfig = {
    headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/120.0"
    },
    retry: {
        limit: 2,
        calculateDelay: ({attemptCount, retryOptions, error}) => {
            if(attemptCount >= retryOptions.limit) return 0;
            if(error.statusCode == 429) return 1000; //too many request
            else if([400,403,500,502,503,504,521,522,524].includes(error.statusCode)) return 0;
            //default
            return 500;
        }
    }
}

let gotScraping;

const import_got = async () => (await import('got-scraping')).gotScraping.extend(gotConfig);

import_got().then(got => gotScraping = got);

const got = () => gotScraping;

module.exports = got;


