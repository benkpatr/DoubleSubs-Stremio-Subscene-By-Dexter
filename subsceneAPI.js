const got = require("got-scraping").gotScraping
cheerio = require("cheerio")
config = require('./config')
baseUrl = config.BaseURL
unzip = require("adm-zip")
const { parse } = require("node-html-parser");

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

global.isSearching = {
  value: false,
  lastUpdate: new Date().getTime(),
  spaceTime: 7500
};
global.isGetting = {
  value: false,
  lastUpdate: new Date().getTime(),
  spaceTime: 3000
};

if(config.env == 'external') {
  global.isSearching.spaceTime = 5000;
  global.isGetting.spaceTime = 1000;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function untilSearching(){
  while(global.isSearching.value) {
    await delay(50);
  }
}

async function untilGetting(){
  while(global.isGetting.value) {
    await delay(50);
  }
}


async function search(query) {
  try {
    if (!query?.length) throw "Query Is Null"

    //##############################
    if(global.isSearching.value) await untilSearching();
    global.isSearching.value = true;

    let currenTime = new Date().getTime();
    if(( currenTime - global.isSearching.lastUpdate) <= global.isSearching.spaceTime) {
      await delay(global.isSearching.spaceTime - (currenTime - global.isSearching.lastUpdate));
    }

    let loopReq = 3;
    var res;
    while(loopReq) {
      let url = baseUrl + "/subtitles/searchbytitle?query=" + query.replace(/ /g, '+');
      console.log('searching:', url)
      res = await got.get(url, gotConfig);
      if(res?.body) break;
      await delay(500);
      loopReq--
    }

    //##############################
    global.isSearching.value = false;
    global.isSearching.lastUpdate = new Date().getTime();

    if (!res?.body) throw "No Response Found"
    if (res?.body?.includes("To many request")) throw ("Search: Too Many Request");
    let $ = cheerio.load(res.body)
    let results = []
    $(".search-result ul a").map((i, el)=> {
      if (el.attribs && el.attribs.href && el.children && el.children[0] && el.children[0].data) {
        var data = {
          path: el.attribs.href,
          title: el.children[0].data
        }
        results.push(data)
      }
    })
    results = filterItOut(results)
    return results || null
  } catch(e) {
    //##############################
    global.isSearching.value = false;
    global.isSearching.lastUpdate = new Date().getTime();
    console.error(e);
  }
}

function filterItOut(res) {
  let results = []
  for (let i in res) {
    if (!results.length || results.findIndex(x=>x.path == res[i].path)===-1) {
      results.push(res[i])
    }
  }
  return results
}

async function subtitle(url = String) {
  try {
    if (!url.length) throw "Path Not Specified"
    console.log(baseUrl + url)
    
    //##############################
    if(global.isGetting.value) await untilGetting();
    global.isGetting.value = true;

    let currenTime = new Date().getTime();
    if(( currenTime - global.isGetting.lastUpdate) <= global.isGetting.spaceTime) {
      await delay(global.isGetting.spaceTime - (currenTime - global.isGetting.lastUpdate));
    }

    let loopReq = 3;
    var res;
    while(loopReq) {
      res = await got.get(baseUrl+url, gotConfig)
      if(res?.body) break;
      await delay(500);
      loopReq--
    }

    //##############################
    global.isGetting.value = false;
    global.isGetting.lastUpdate = new Date().getTime(); 

    if (!res?.body) throw "No Response Found"
    if (res.body.includes("To many request")) throw "Get: Too Many Request"
    let results = []
    let body = parse(res.body)
    let imdb_id = res.body.split("href=\"https://www.imdb.com/title/")[1]?.split("\">Imdb</a>")[0];
    let year = body.querySelector("#content > div.subtitles.byFilm > div.box.clearfix > div.top.left > div > ul > li:nth-child(1)")?.innerHTML.match(/[0-9]+/gi)[0];// alternative if dont want to always repeat search with year
    let table = body.querySelectorAll('table tbody tr')
    for (let i = 0;i<table.length;i++){
      let row = table[i];
      if(row.childNodes.length>3){
        let e = row.querySelector("td a")
        let url = e.rawAttributes["href"]
        let lang = e.querySelectorAll("span")[0].rawText.replace(/\t|\n|\r/g, "")
        let title = e.querySelectorAll("span")[1].rawText.replace(/\t|\n|\r/g, "")
        let hi = row.querySelector("td.a41")?true:false;
        let comment = row.querySelector('td.a6 div').rawText.replace(/\t|\n|\r/g, "")
        let sdh = (comment.toLowerCase().includes("sdh") &&!(comment.toLowerCase().includes("no sdh")||comment.toLowerCase().includes("sdh removed")))?true:false
        results.push({
          path: url,
          title: title || "no title found",
          lang: lang || "notSp",
          hi: hi,
          sdh: sdh,
          imdb_id : imdb_id,
          year : year // bring it to front
        })
      }
    } 
    //results = sortByLang(results) // sort happen after this function
    //console.log("results",results["english"])
    return results || null
  } catch(e) {
    //##############################
    global.isGetting.value = false;
    global.isGetting.lastUpdate = new Date().getTime(); 
    console.error(e);
  }
}
  
  
function sortByLang(subs = Array) {
  try {
    let sorted = {}
    subs.map((e,
      i)=> {
      if (sorted[e.lang.toLowerCase()]) {
        sorted[e.lang.toLowerCase()].push(e)
      } else {
        sorted[e.lang.toLowerCase()] = [e]
      }
    })
    return sorted
  }catch(err) {
    return null
  }
}
  
async function downloadUrl(url = String) {
  let res = await got.get(url,{retry:{limit:5}})
  if (!res||!res.body)throw "No Data Found"
  let $ = cheerio.load(res.body),
  downUrl
  $("#downloadButton").map((i, e)=> {
    downUrl = e.attribs.href
  })
  if (!downUrl)throw "Unexpected Error"
  return baseUrl + downUrl;
}

module.exports.search = search
module.exports.getSubtitles = subtitle
module.exports.downloadUrl = downloadUrl
module.exports.sortByLang = sortByLang;