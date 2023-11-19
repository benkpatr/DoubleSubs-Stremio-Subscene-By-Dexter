const { convert } = require('subtitle-converter');
const unrar = require("node-unrar-js");
const AdmZip = require('adm-zip');
const axios = require('axios');
const smi2vtt = require('./converts/smi2vtt');
var detect = require('charset-detector');
const iconv = require('iconv-jschardet');
const ass2vtt = require('./converts/ass2vtt');
const dotsub2vtt = require('./converts/dotsub2vtt');
const { exactlyEpisodeRegex, estimateEpisodeRegex } = require('./episodeRegex');

const iso639 = require('./ISO639');

iconv.skipDecodeWarning(true)
iconv.disableCodecDataWarn(true)

global.isGetSub = false;

class sub2vtt {
    constructor(url, opts = {}) {
        let { proxy, episode, type } = opts;
        this.url = url;
        this.proxy = proxy || {};
        this.data = null;
        this.size = null;
        this.error = null;
        this.type = type || null;
        this.client = null;
        this.episode = episode || null;
        this.filename = null;
    }

    async GetData() {
        if(global.isGetSub) {
            await new Promise(r => setTimeout(r, 500));
        }
        global.isGetSub = true;
        let res = await this.request({
            method: 'get',
            url: this.url,
            responseType: 'arraybuffer',
            Accept: this.type,
        });
        global.isGetSub = false;

        if(res?.headers) this.DatafromHeaders(res.headers);

        if (res?.data) {
            this.type = this.type || res.headers["content-type"].split(';')[0];
            this.data = res.data;
            this.size = Number(res.headers["content-length"]);
        }
    }

    GiveData(data) {
        this.data = data;
    }
    DatafromHeaders(headers) {
        this.type = this.type || headers["content-type"].split(';')[0];
        this.size = Number(headers["content-length"]);
        this.filename = headers["content-disposition"].split('filename=')[1].trim();
    }

    async getSubtitle() {
        try {
            // checking the link

            let file, filename

            //skip headers, too many request...
            //if (!this.type) await this.CheckUrl()

            if (!this.type || !this.data) await this.GetData();
            if (!this.type || !this.data) throw "error getting sub"

            if (this.size?.length > 10000000) throw "file too big"
            //get the file
            if (this.supported.arc.includes(this.type)) {
                file = await this.extract()
                if (!file?.data) throw "error extracting archive"

                this.filename = file.name
                file = file.data
                
                file = await this.encodeSub(this.filename, file);
            }
            else {
                if(this.supported.subs.includes(this.type)) {
                    if(this.type == "application/x-subrip" || this.type == "text/vtt")
                        file = this.encodeUTF8(this.data);
                    if(this.type == 'application/sub') 
                        file = this.GetDotSub(this.data);
                    else if(this.type == 'application/octet-stream')
                        file = this.GetSubAss(this.data);
                    else
                        file = await this.GetSub();
                }
                else if(this.checkExtension(this.filename)) {
                    file = await this.encodeSub(this.filename, file);
                }
                else throw `Extension ${this.type}: ${this.filename} are not support!`;
                
            }

            return {
                name: this.filename,
                data: file
            }
        } catch (e) {
            console.error(e);
        }
    }

    async CheckUrl() {
        try {

            let res = await this.request(
                {
                    method: "head",
                    url: this.url,
                })

            if (!res || !res.status == "200" || !res.headers) throw "error getting headers"
            let headers = res.headers;
            if (!headers) throw "the url provided couldn't be reached";

            this.DatafromHeaders(headers);

            if (headers["transfer-encoding"] && headers["transfer-encoding"] == 'chunked') {
                console.log("the file is buffering")
            }
            if (this.type == 'arraybuffer/json') console.log("the file is an array buffer")
            if (this.supported.arc.includes(this.type)) {
                console.log("the requested file is an archive", this.type)
            } else if (this.supported.subs.includes(this.type)) {
                console.log("the requested file is a subtitle", this.type)
            } else console.log("unsupported file format", this.type)

        } catch (err) {
            console.error(err);
            return { res: "error", reason: err };
        }
    }

    async extract() {
        try {

            if (!this.data) throw "error requesting file"
            let res = this.data;
            const rar = this.supported.arcs.rar
            const zip = this.supported.arcs.zip
            if (rar.includes(this.type)) {
                return await this.unrar(res);
            } else if (zip.includes(this.type)) {
                return await this.unzip(res);
            }
            return
        } catch (err) {
            console.error(err);
            this.error = err;
        }

    }
    
    async encodeSub(filename, file) {
        if(filename.match(/\.smi$/i)) {
            file = this.GetSubSmi(file);
        }
        else if(filename.match(/\.sub$/i)) {
            file = this.GetDotSub(file);
        }
        else if(filename.match(/\.ssa$|\.ass$/i)) {
            try {
                file = this.GetSubAss(file);
            } catch (e) {
                file = await this.GetSub(file)
            }
        }
        else if(filename.match(/\.srt$|\.vtt$/i)) {
            file = {
                subtitle: this.encodeUTF8(file),
                status: 'found srt/vtt sub'
            }
        }
        else if(filename.match(/\.rar$|\.zip$/i)) {
            let extract;

            if(filename.match(/\.rar$/i)) {
                extract = await this.unrar(file);
            } else {
                extract = await this.unzip(file);
            }
            if (!extract?.data) throw "error extracting archive"

            let name = extract.name;
            this.filename += '\n=&gt;' + name;
            file = await this.encodeSub(name, extract.data);
        }
        else {
            file = await this.GetSub(file)
        }
        
        return file;
    }

    encodeUTF8(data) {
        let encoding = detect(data)[0].charsetName;
        if(encoding) {
            const encodeName = {
                "ISO-8859-8-I": "ISO-8859-8"
            }
            if(encodeName[encoding]) encoding = encodeName[encoding];
        } else {
            encoding = iconv.detect(data);
        }
        
        if(encoding != 'UTF-8'){
            console.log(encoding,'=> UTF-8');
            return iconv.decode(data, encoding).toString('UTF-8');
        }
        else 
            return data.toString();
    }

    GetDotSub(data) {
        try {
            data = this.encodeUTF8(data);
            const subtitle = dotsub2vtt(data);
            if(subtitle) {
                return {subtitle: subtitle, status: 'dotsub2vtt success'}
            } else {
                return { subtitle: null, status: 'dotsub2vtt empty content'}
            }
        }
        catch(e) {
            console.error(e)
        }
    }

    GetSubAss(data) {
        try {
            data = this.encodeUTF8(data);
            const subtitle = ass2vtt(data);
            if(subtitle) {
                return {subtitle: subtitle.toString(), status: 'ass2vtt success'}
            } else throw "ass2vtt failed!";
        }
        catch(e) {
            console.error(e)
        }
    }

    GetSubSmi(data) {
        try {
            data = this.encodeUTF8(data);
            const subtitle = smi2vtt.parse(data);
            if(subtitle) {
                return {subtitle: subtitle, status: 'smi2vtt success'}
            } else {
                return { subtitle: null, status: 'smi2vtt empty content'}
            }
        }
        catch(e) {
            console.error(e)
        }
    }

    async GetSub(data) {
        try {
            let res;

            if (data) {
                res = data
            }
            else if (this.data) res = this.data
            else {
                res = await this.request({
                    method: 'get',
                    url: this.url,
                    responseType: 'arraybuffer'
                });
                if (res?.data) res = res.data
                if (!res) throw "error requesting file"
            }
            var data = this.encodeUTF8(res);
            // some subtitles have whitespaces in the end/ beginning of line
            let fixdata = data
            fixdata = fixdata.split(/\r?\n/)
            fixdata = fixdata.map(row => row.trim())
            data = fixdata.join('\n');
            //-----------------------------------------
            const outputExtension = '.vtt'; // conversion is based on output file extension
            const options = {
                removeTextFormatting: true,
                startAtZeroHour: false,
                timecodeOverlapLimiter: false,
            };
            const { subtitle, status } = convert(data, outputExtension, options)
            console.log(status)
            if (subtitle) return { res: "success", subtitle: subtitle, status: status, res: data }
            if (status.success) return { res: "success", subtitle: subtitle, status: status, res: res }
            else return { res: "error", subtitle: null }
        } catch (err) {
            console.error(err);
            this.error = err;
            return { res: "error", subtitle: data }
        }
    }


    supported = {
        arc: ["application/zip", "application/x-zip-compressed", "application/x-rar", "application/x-rar-compressed", "application/vnd.rar"],
        subs: ["application/x-subrip", "text/vtt", "application/octet-stream", "application/sub"],
        arcs: {
            rar: ["application/x-rar", "application/x-rar-compressed", "application/vnd.rar"],
            zip: ["application/zip", "application/x-zip-compressed"]

        }
    }

    checkExtension(toFilter) { // return index of matched episodes
        return toFilter.match(/\.dfxp$|\.scc$|\.srt$|\.ttml$|\.ssa$|\.vtt$|\.ass$|\.srt$|\.smi$|\.sub$|\.rar$|\.zip$/i)
    }
    checkEpisode(toFilter) {
        return {
            exactly: () => {
                const exactlyRegex = exactlyEpisodeRegex(this.episode).include();
                return exactlyRegex.test(toFilter)
            },
            estimate: () => {
                const estimateRegex = estimateEpisodeRegex(this.episode).include();
                return estimateRegex.test(toFilter)
            }
        }
    }
    async unzip(zipdata) {
        try {
            var zip = new AdmZip(zipdata);
            var zipEntries = zip.getEntries();
            console.log("zip file count:", zipEntries.length)
            let files, file;
            files = zipEntries.filter(file => this.checkExtension(file.entryName));
            if(files.length) {
                if(this.episode) {
                    if(files.length >= 2) {
                        file = files.find(file => this.checkEpisode(file.entryName).exactly());
                        if(!file)
                            file = files.find(file => this.checkEpisode(file.entryName).estimate());
                    }
                }
            } else throw 'Unzip all files are not support!';

            if(!file) file = files[0];

            console.log("extract file:", file.entryName);

            return {
                name: file.entryName,
                data: file.getData()
            }
        } catch (err) {
            console.error(err);
        }
    }

    async unrar(rardata) {
        try {
            const extractor = await unrar.createExtractorFromData({ data: rardata });
            const list = extractor.getFileList();
            //const listArcHeader = list.arcHeader; // archive header
            const fileHeaders = [...list.fileHeaders]; // load the file headers
            console.log('Rar files count:', fileHeaders.length);

            let files_head, file_head;
            files_head = fileHeaders.filter(header => this.checkExtension(header.name));

            if(files_head.length) {
                if(this.episode) {
                    if(files_head.length >= 2) {
                        file_head = files_head.find(header => this.checkEpisode(header.name).exactly());
                        if(!file_head)
                            file_head  = files_head.find(header => this.checkEpisode(header.name).estimate());
                    }
                }
            } else throw 'Unrar all files are not support!';

            if(!file_head) file_head = files_head[0];
            console.log("extract file:", file_head.name);
            
            const extracted = extractor.extract({ files: [file_head.name] });;
            // extracted.arcHeader  : archive header
            const files = [...extracted.files]; //load the files
            // files[0].fileHeader; // file header
            // files[0].extraction; // Uint8Array content, createExtractorFromData only

            return {
                name: files[0].fileHeader.name,
                data: files[0].extraction
            }
        } catch (err) {
            console.error(err);
        }
    }

    async request(options) {
        if (!this.client) this.getClient()
        return await this.client(options)
            .catch(error => {
                if (error.response) {
                    console.error(error.response.status, error.response.statusText, error.config.url);
                } else if (error.cause) {
                    console.error(error.cause);
                } else {
                    console.error(error);
                }
            });

    }
    getClient() {
        let config = {
            maxContentLength: 10000000, //~10MB
            timeout: 15000,
            headers: {}
        }
        if (this.proxy) config.headers = this.proxy;
        config.headers["Accept-Encoding"] = "gzip,deflate,compress";
        this.client = axios.create(config);
    }
    static gerenateUrl(url = String, opts) {
        let { proxy, type } = opts;
        let proxyString, data;
        data = new URLSearchParams();
        data.append("from", url)
        if (proxy) {
            proxyString = Buffer.from(JSON.stringify(proxy)).toString('base64');
            data.append("proxy", proxyString)
        }
        if (type) data.append("type", type);
        return data.toString();
    }
    static ISO() {
        return iso639;
    }
};

module.exports = sub2vtt;
