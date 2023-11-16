function dotsub2vtt(dotsubText){
    if(!dotsubText) throw `imput dotSubText empty`;

    //{118291}{118336}Stvarno? Ide na utakmicu?
    const reg_sub =  /{(\d+)}{(\d+)}(.*)$/i;
    const lines = dotsubText.split(/\r?\n/);
    
    const subs = [];
    for(i = 0, y = 1; i <= lines.length; i++) {
        if(reg_sub.test(lines[i])) {
            const r = reg_sub.exec(lines[i]);
            const start = r[1]; //milliseconds
            const end = r[2];   //milliseconds
            let text = r[3];

            const reg_newline = /\|+/g;
            text = text.replace(reg_newline, '\n');

            const start_text = timeText(start);
            const end_text = timeText(end);
            
            const sub = String(y) + '\n' + 
                start_text + ' --> ' + end_text + '\n' +
                text + '\n';
            subs.push(sub);
            y++;
        }
    }

    if(subs.length) {
        subs.unshift('WEBVTT\n')
        return subs.join('\n');
    } else throw `not found any sub in dotSubText`;
}

function timeText(milliseconds) {
    let hours, minutes, seconds;

    seconds = Math.floor(milliseconds/100);
    milliseconds %= 100;

    if(seconds >= 60)  {
        minutes = Math.floor(seconds/60);
        seconds %= 60;
    } 

    if(minutes >= 60) {
        hours = Math.floor(minutes/60);
        minutes %= 60;
    }
    
    const text = (hours ? String(hours).padStart(2, '0') : '00') + ':' +
        (minutes ? String(minutes).padStart(2, '0') : '00') + ':' +
        String(seconds).padStart(2, '0') + ':'  +
        String(milliseconds).padEnd(3, '0');

    return text;
}

module.exports = dotsub2vtt;