const tmdb = require('./tmdb');
// const cinemeta = require('./cinemeta');
const kitsu = require('./kitsu');
const subscene = require('./subsceneAPI');
const config = require('./config');
require('dotenv').config();
const languages = require('./languages.json');
const count = 10;
const NodeCache = require("node-cache");
const sub2vtt = require('sub2vtt');

const Cache = new NodeCache({ stdTTL: (0.5 * 60 * 60), checkperiod: (1 * 60 * 60) });
const MetaCache = new NodeCache({ stdTTL: (0.5 * 60 * 60), checkperiod: (1 * 60 * 60) });
const KitsuCache = new NodeCache({ stdTTL: (0.5 * 60 * 60), checkperiod: (1 * 60 * 60) });
const filesCache =  new NodeCache({ stdTTL: (0.5 * 60 * 60), checkperiod: (1 * 60 * 60) });
const subsceneCache = new NodeCache({ stdTTL: (0.5 * 60 * 60), checkperiod: (1 * 60 * 60) });
const searchCache = new NodeCache({ stdTTL: (0.5 * 60 * 60), checkperiod: (1 * 60 * 60) });

async function subtitles(type, id, lang, extras) {
    if (id.match(/tt[0-9]/)){
		  return await (TMDB(type, id, lang, extras)) 
	}	if (id.match(/kitsu:[0-9]/)){
        return await (Kitsu(type, id, lang)) 
		console.log(type, id, lang)
	}
}
async function Kitsu(type, id, lang) {
    console.log(type, id, lang);
    let metaid = id.split(':')[1];
    let meta = KitsuCache.get(metaid);
    if (!meta) {
        meta = await kitsu(metaid);
        if (meta) {
            KitsuCache.set(metaid, meta);
        }
    }
    if(meta){
        //console.log(meta)
        const episode = id.split(':')[2];
        const searchID = `kitisu_${metaid}_${id.split(':')[1]}`;
        let search = searchCache.get(searchID);
        let slug = `${meta.title["en_jp"]} (${meta.title["en"]}) (${meta.year})`;
        var moviePath = '';
        console.log('slug',slug)
        console.log('title',meta.title["en_jp"])
        if (!search) {
            search = await subscene.search(`${encodeURIComponent(meta.title["en_jp"])}`);
            if (search) {
                searchCache.set(searchID, search);
            }
        }
        for(let i = 0; i<search.length;i++){
            if(search[i].title.includes(meta.title["en_jp"])){
                moviePath = search[i].path
                break
            }
        }
        //let moviePath = search[0].path;
        console.log(moviePath)
        return getsubtitles(moviePath, meta.slug.replace('-','_'), lang, episode)
    }
}

async function TMDB(type, id, lang, extras) {
    //console.log(type, id, lang);
    let metaid = id.split(':')[0];
    let meta = MetaCache.get(metaid);
    if (!meta) {
        meta = await tmdb(type, metaid);
        if (meta) {
            MetaCache.set(metaid, meta);
        }
    }
    if(meta){
    console.log("meta",meta)
    if (type == "movie") {
      let moviePath = `/subtitles/${meta.slug}`;
      //console.log(moviePath);

      return getsubtitles(moviePath, id , lang, null, meta.year, extras)
    }
    else if (type == "series") {
      let season = parseInt(id.split(':')[1]);
      season = ordinalInWord(season);
      const episode = id.split(':')[2];
      const searchID = `${metaid}_${id.split(':')[1]}`;
      let search = searchCache.get(searchID);
      if (!search) {
        search = await subscene.search(`${meta.title} ${season} season`);
        if (search) {
          searchCache.set(searchID, search);
        }
      }
      let moviePath = search[0].path;
      return getsubtitles(moviePath, id.split(":")[0] + '_season_' + id.split(":")[1], lang, episode)
      /*
      var moviePath = '/subtitles/' + meta.slug + '-' + season + '-season';
      let subtitles = await subscene.getSubtitles(moviePath).catch(error => { console.error(error) })
      console.log('subtitles', Object.keys(subtitles).length)
      if (!Object.keys(subtitles).length) {
          moviePath = '/subtitles/' + meta.slug;
      }
      if(meta.slug=='the-100'){
          moviePath = `/subtitles/the-100-the-hundred-${season}-season`;
      }
      console.log(moviePath);
      return await sleep(2000).then(() => { return getsubtitles(moviePath, id.split(":")[0] + '_season_' + id.split(":")[1], lang, episode) })
      function sleep(ms) {
          return new Promise((resolve) => {
              setTimeout(resolve, ms);
          });
      }*/
    }
  }
}


async function getsubtitles(moviePath, id, lang, episode, year, extras) {
  let breakTitle = moviePath.match(/[a-z]+/gi)
  //console.log("breakTitle : " , breakTitle)
  console.log(moviePath, id, lang, year, episode)
  const cachID = `${id}_${lang}`;
  let cached = Cache.get(cachID);
  if (cached) {
    console.log('cached main', cachID, cached);
    return cached
  } else {
    let subs = [];
    var subtitles = subsceneCache.get(moviePath);
    if (!subtitles) {
      let season = id.split('_season_')[1];
      let subs1 = [];
      if(!season) {
        subs1 = await subscene.getSubtitles(moviePath).catch(error => { console.error(error) }) // moviepath without year
        console.log("movie no year scraping :", subs1.length);
      }
      else{
        if(season > 1) {
          subs1 = await subscene.getSubtitles(moviePath + '-season-' + season).catch(error => { console.error(error) }) // moviepath without year
          console.log("series with season scraped: ", subs1.length);
        }
      }
      if(subs1?.length) {
        subtitles = subscene.sortByLang(subs1);
        subsceneCache.set(moviePath, subtitles);

        if(subs1[0].imdb_id != id.split('_')[0]) { // if the id is not match, find by year
          if (subs1[0].year !== year && !episode) { // if a movie and year isnt matched with the one in imdb
            subtitles = subsceneCache.get(`${moviePath}-${year}`);
            if(!subtitles) {
              await new Promise((r) => setTimeout(r, 2000)); // prevent too many request, still finding the other way
              const subs2 = await subscene.getSubtitles(`${moviePath}-${year}`).catch(error => { console.error(error) }) // moviepath with year
              console.log("movie with year scraping :", subs2.length);
              if(subs2?.length) {
                subtitles = subscene.sortByLang(subs2);
                subsceneCache.set(`${moviePath}-${year}`, subtitles);
              }
            }
          }
        }
      }
      if(!subtitles) {
        console.log("No suitable movies were found!");
        return [];
      }
    }

    //console.log('subtitles', Object.keys(subtitles).length)
    //console.log('subtitles', moviePath)
    if (subtitles[lang]) {
      subtitles = subtitles[lang];
      console.log('subtitles matched lang : ',subtitles.length)
      let sub = [];
      let episodeText;
      if (episode) {
        episodeText = (episode.length == 1) ? ('0' + episode) : episode;
        episodeText = 'E' + episodeText
        console.log('episode', episodeText)

        episodeText1 = (episode.length == 1) ? ('S\\d?\\d.*EP?0' + episode) : ('S\\d?\\d.*E' + episode);
        episodeText1 += '|- (EP)?0?' + episode + '$';
        const reg = new RegExp(episodeText1, 'gi');
        
        subtitles.forEach(element => {
          if(reg.test(element.title.toLowerCase().trim())) {
            console.log(element.title);
            sub.push(element);
          }

          // if (element.title.match(/S\d?\d.*E\d?\d|- (EP)?\d?\d/gi)) {
          //   var reg = new RegExp(episodeText.toLowerCase(), 'gi');
            
          //   if (reg.test(element.title.toLowerCase())) {
          //       console.log(element.title);
          //       sub.push(element);
          //   }
          // } else {
          //   // console.log(element.title);
          //   // sub.push(element)
          // }
        })
        
        //sub = filtered(subtitles, 'title', episodeText)
        //episodeText = episode.length == 1 ? '0' + episode : episode;
        //sub = sub.concat(filtered(subtitles, 'title', episodeText))
        sub = [...new Set(sub)];
        subtitles = sub;
      }
      console.log("filtered subs ", subtitles.length)

      //------------------
      // sort movie by extra filename
      if(extras?.filename && !episode) {
        const qualitys = [ "480p", "720p", "1080p", "1440p", "2160p" ];
        const sources = [ /(web)(-dl|rip)?/, /blu-?ray/, /a?hdtv/, /dvd(rip)?/];
        const vcodexs = [ /(h.?|x)264/, /(h.?|x)265/];

        let quality = qualitys.findIndex(quality => extras['filename'].toLowerCase().match(quality));
        let source = sources.findIndex(source => extras['filename'].toLowerCase().match(source));
        let vcodex = vcodexs.findIndex(vcodec => extras['filename'].toLowerCase().match(vcodec));

        console.log(qualitys[quality], sources[source], vcodexs[vcodex]);

        subtitles = sortByKey(subtitles, qualitys[quality], sources[source], vcodexs[vcodex]);

        function sortByKey(subs, ...strs) {

          if(!strs[0]) { //check if the input filter has first value is empty
            if(strs.length != 1) {
              return sortByKey(subs, strs.slice(1));
            }
            else {
              return subs;
            }
          }

          let inList = [];
          let notList = [];

          subs.forEach(sub => {
            if(sub.title.toLowerCase().match(strs[0])) {
              inList.push(sub);
            }
            else {
              notList.push(sub);
            }
          });

          if(strs.length != 1) {
            for(i = 1; i < strs.length; i++)  {
              inList = sortByKey(inList, strs[i]);
              notList = sortByKey(notList, strs[i]);
            }
          }
          
          return inList.concat(notList);
        }
      }
      //-----------------

      for (let i = 0; i < (subtitles.length); i++) {
        let value = subtitles[i];
        let simpleTitle = subtitles[i].title;
        breakTitle.forEach(el => {
        var regEx = new RegExp(el, "ig");
          simpleTitle = simpleTitle.replace(regEx,"")
        })
        simpleTitle = simpleTitle.replace(/\W/gi,"") // kasih gambaran di stremio
        if (value) {
            let path = config.BaseURL + value.path;
            if (episode) {
              url = config.local+"/sub.vtt?"+"episode="+episodeText+"&"+sub2vtt.gerenateUrl(path, {});
            } else {
              url = config.local+"/sub.vtt?"+sub2vtt.gerenateUrl(path, {});
            }
            
            subs.push({
                lang: languages[lang].iso || languages[lang].id,
                //id: "subscn_"+episode?`${cachID}_ep${episode}_${i}`:`${cachID}_${i}`,
                title:subtitles[i].title,
                id: "s."+`${i}`+"."+ simpleTitle,
                url: url
            });
        }
    }
    let cached = Cache.set(cachID, subs);
    console.log("cached", cached)
    return subs;
}else{
    return
}
}
}

async function downloadUrl(path, episode) {
let cachID = episode ? path + '_' + episode : path;
let cached = filesCache.get(cachID);
if (cached) {
console.log('File already cached', cachID);
return cached
} else {
return subscene.downloadUrl(path).then(url => {
    let cached = filesCache.set(cachID, url);
    console.log("Caching File", cached)
    return url;
}).catch(error => { console.log(error) });
}
}


function filtered(list, key, value) {
var filtered = [], i = list.length;
var reg = new RegExp(value.toLowerCase(), 'gi');
while (i--) {
if (reg.test(list[i][key].toLowerCase())) {
    filtered.push(list[i]);
}
}
return filtered;
};

function ordinalInWord(cardinal) {
const ordinals = ["zeroth", "First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth", "Eleventh", "Twelfth", "Thirteenth", "Fourteenth", "Fifteenth", "Sixteenth", "Seventeenth", "Eighteenth", "Nineteenth", "Twentieth"]

var tens = {
20: 'twenty',
30: 'thirty',
40: 'forty',
50: 'Fifty',
60: 'Sixty',
70: 'Seventy',
80: 'Eighty',
90: 'Ninety'

};
var ordinalTens = {
30: 'thirtieth',
40: 'fortieth',
50: 'fiftieth',
60: 'Sixtieth',
70: 'Seventieth',
80: 'Eightieth',
90: 'Ninetieth'
};

if (cardinal <= 20) {
return ordinals[cardinal];
}

if (cardinal % 10 === 0) {
return ordinalTens[cardinal];
}

return tens[cardinal - (cardinal % 10)] + ordinals[cardinal % 10];
}


module.exports = { subtitles, downloadUrl };
