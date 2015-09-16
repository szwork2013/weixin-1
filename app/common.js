var faceWx2Ours = require('../faceWx2Ours');
var weixinCrypto = require('./weixinCrypto');
var conf = require('../conf/conf.json');
var serviceConf = conf.WeixinService;

(function(){

    var randomString = function(len, charSet) {
        var charSet = charSet || 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        var randomString = '';
        for (var i = 0; i < len; i++) {
            var randomPoz = Math.floor(Math.random() * charSet.length);
            randomString += charSet.substring(randomPoz,randomPoz+1);
        }
        return randomString;
    }

    var fixToWxFace = function(content){
        if (content.indexOf('[可爱]')>=0){
            var reg = new RegExp('\\[可爱\\]', 'g');
            content = content.replace(reg,  '/:,@-D');
        }
        if (content.indexOf('[大兵]')>=0){
            var reg = new RegExp('\\[大兵\\]', 'g');
            content = content.replace(reg,  '/::,@');
        }
        if (content.indexOf('[折磨]')>=0){
            var reg = new RegExp('\\[折磨\\]', 'g');
            content = content.replace(reg,  '/::8');
        }
        if (content.indexOf('[示爱]')>=0){
            var reg = new RegExp('\\[示爱\\]', 'g');
            content = content.replace(reg,  '/:showlove');
        }
        if (content.indexOf('[挥手]')>=0){
            var reg = new RegExp('\\[挥手\\]', 'g');
            content = content.replace(reg,  '/:oY');
        }
        if (content.indexOf('[投降]')>=0){
            var reg = new RegExp('\\[投降\\]', 'g');
            content = content.replace(reg,  '/:oY');
        }
        if (content.indexOf('[街舞]')>=0){
            var reg = new RegExp('\\[街舞\\]', 'g');
            content = content.replace(reg,  '/:jump');
        }
        return content;
    }

    var replaceFace = function(content){
        if (!content){content='';}
        if (content.indexOf('/:')<0){return content;}
        for(var i=0; i<faceWx2Ours.length; i++){
            var reg = new RegExp(faceWx2Ours[i][0], 'g');
            content = content.replace(reg, '[' + faceWx2Ours[i][1] + ']');
            if (content.indexOf('/:')<0) break;
        }
        return content;
    }

    var decrypt = function(xml){
        var mi = new weixinCrypto(serviceConf.token, serviceConf.key, serviceConf.appid); 
        return mi.decrypt(xml);
    }
    var encrypt = function(xml){
        var mi = new weixinCrypto(serviceConf.token, serviceConf.key, serviceConf.appid); 
        return mi.encrypt(xml);
    }


    var _M = {
        randomString: randomString,
        fixToWxFace: fixToWxFace,
        replaceFace: replaceFace,
        decrypt: decrypt,
        encrypt: encrypt
    };
    module.exports = _M;

})();