var env = process.env.NODE_ENV ? 'beamup':'local';

var config = {
    BaseURL: "https://subscene.com",
    CineV3: "https://v3-cinemeta.strem.io/meta",
    APIURL: 'https://api.themoviedb.org/3',
    kitsuURL: 'https://kitsu.io/api/edge',
    CacheControl :{
        oneDay: 'max-age=86400, must-revalidate, stale-while-revalidate=1800, stale-if-error=1800, public',
        halfDay: 'max-age=43200, must-revalidate, stale-while-revalidate=1800, stale-if-error=1800, public',
        fourHour: 'max-age=14400, must-revalidate, stale-while-revalidate=1800, stale-if-error=1800, public',
        oneHour: 'max-age=3600, must-revalidate, stale-while-revalidate=1800, stale-if-error=1800, public',
        off: 'no-cache, no-store, must-revalidate'
    }
}

switch (env) {
    case 'beamup':
		config.port = process.env.PORT || 63555
        config.local = process.env.PRE_URL || "http://43433fff4541-subscene-by-dexter.baby-beamup.club";
        break;

    case 'local':
		config.port = 63555
        config.local = "http://127.0.0.1:" + config.port;
        break;
}

module.exports = config;