var env = process.env.NODE_ENV || "local";

var config = {
  env: env,
  BaseURL: "https://subscene.com",
  CineV3: "https://v3-cinemeta.strem.io/meta",
  APIURL: "https://api.themoviedb.org/3",
  kitsuURL: "https://kitsu.io/api/edge",
  CacheControl: {
    oneDay:
      "max-age=86400, s-maxage=86400, must-revalidate, stale-while-revalidate=900, stale-if-error=1800, public",
    halfDay:
      "max-age=43200, s-maxage=43200, must-revalidate, stale-while-revalidate=900, stale-if-error=1800, public",
    fourHour:
      "max-age=14400, s-maxage=14400, must-revalidate, stale-while-revalidate=900, stale-if-error=1800, public",
    oneHour:
      "max-age=3600, s-maxage=3600, must-revalidate, stale-while-revalidate=900, stale-if-error=1800, public",
    fifteenMins:
      "max-age=900, s-maxage=900, must-revalidate, stale-while-revalidate=300, stale-if-error=900, public",
    off: "no-cache, no-store, must-revalidate",
  },
  beamupURL:
    "https://19da2db155cf-doublesubs-stremio-subscene.baby-beamup.club",
  maxVersions: 5,
};

switch (env) {
  case "beamup":
    config.port = process.env.PORT || 63555;
    config.local = process.env.PRE_URL || config.beamupURL;
    break;

  case "local":
    config.port = 63555;
    config.local = "http://127.0.0.1:" + config.port;
    break;
  default:
    config.port = process.env.PORT || 63555;
    config.local = process.env.PRE_URL || "http://127.0.0.1:" + config.port;
    break;
}

module.exports = config;
