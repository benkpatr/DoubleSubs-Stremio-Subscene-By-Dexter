//GOT 4.0 does support CommonJS

let gotScraping;

const gotConfig = {
    headerGeneratorOptions: {
      browsers: [
        {
          name: 'firefox',
          minVersion: 102
        }
      ],
      devices: [ 'desktop' ],
      operatingSystems: [ 'linux' ],
    }
}

async function get(url, config = gotConfig) {
    gotScraping ??= (await import('got-scraping')).gotScraping;
    return gotScraping.get(url, config);
}

async function getJSON(url, config = gotConfig) {
    gotScraping ??= (await import('got-scraping')).gotScraping;
    return gotScraping.get(url, config).json();
}

module.exports = { get, getJSON }