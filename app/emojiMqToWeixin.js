var mqToWeixin = {
    smile: '/::)',
    smiley: '/::)',
    laughing: '/::)',
    blush: '/::$',
    heart_eyes: '/::B',
    smirk: '/:X-)',
    flushed: '/::|',
    kissing_heart: '/::*',
    grin: '/:B-)',
    wink: '/::P',
    stuck_out_tongue_winking_eye: '/::P',
    stuck_out_tongue: '/::P',
    sleeping: '/:|-)',
    worried: '/::(',
    expressionless: '/:dig',
    sweat_smile: '/::D',
    cold_sweat: '/::-|',
    joy: '/::D',
    sob: "/::~",
    angry: '/::@',
    mask: '/::X',
    scream: '/::8',
    sunglasses: '/:8-)',
    heart: '/:heart',
    broken_heart: '/:break',
    star: '/:sun',
    anger: '/:xx',
    exclamation: '/:@@',
    question: '/:?',
    zzz: '/:|-)',
    thumbsup: '/:strong',
    thumbsdown: '/:weak',
    ok_hand: '/:ok',
    punch: '/:@@',
    v: '/:v',
    clap: '/:handclap',
    muscle: '/:@@',
    pray: '/:@)',
    skull: '/:!!!',
    trollface: '/:X-)'
};
(function(){
    var replaceMeiqiaEmojiToWeixin = function(str){
        if (!str){
            str='';
        }
        var emojiRegex = /\[([^\[\]]*)\]/g;
        if (!emojiRegex.test(str)){
            return str;
        }
        var ret = str.match(emojiRegex);
        if (!(ret && ret.length>0)){
            return str;
        }
        for (i=0;i<ret.length;i++){
            var mpEmojiCode = ret[i].slice(1,-1);
            if (mqToWeixin[mpEmojiCode]){
                str = str.replace(ret[i], mqToWeixin[mpEmojiCode]);
            }
        }
        return str;
    }

    var _M = {
        replaceMeiqiaEmojiToWeixin: replaceMeiqiaEmojiToWeixin
    };
    module.exports = _M;
})();