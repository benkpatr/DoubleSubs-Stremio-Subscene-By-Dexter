const express = require('express');
const app = express();
const cors = require('cors');
const { sharedRouter } = require('../index.js')
const config = require('../configs/config.js');
const { fileInfo, sql_file, loadSQL } = require('../modules/bettersqlite3.js');
const multer  = require('multer');
const upload = multer({ dest: process.cwd() + '/uploads/'});

app.get('/sql/upload', express.static('./upload.html'));

app.post('/sql/upload', upload.single('file'), (req, res) => {
    console.log('Loading SQL file:', req.file.originalname);
    loadSQL(req.file.path);
    res.send('Success!')
})

app.get('/sql/:action', (req, res) => {
    const action = req.params.action;
    switch(action) {
        case 'info': {
            const sqlInfo = fileInfo();
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify(sqlInfo));
        }; break;
        case 'download': {
            res.download(sql_file);
        }; break;
        case 'upload': res.sendFile(process.cwd() + '/external/upload.html'); break;
        default: {
            res.sendStatus(400);
        }
    }
})

app.use((req, res, next) => {
	console.log("\nreqpath : ", req.originalUrl)
	console.log('----------------------------------')
    req.setTimeout(60 * 1000, () => res.sendStatus(504)); // timeout time
    next();
});
		
app.set('trust proxy', true)

app.use(cors())

app.get('/', (req, res) => {
    res.redirect(301, config.beamupURL);
})
app.use(sharedRouter);

module.exports = app
