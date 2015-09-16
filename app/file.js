var fs = require('fs');
var path = require('path');
var API = require('../API');
var qiniu = require('qiniu');
var qiniuToken = 'ErHe-7QlmVKBIH_zTfwjmHdOjIFy3wGnA63CpN5q:nXl41xauVSx3zx0kcFSafcQQzms=:eyJzY29wZSI6Im1lY2hhdC1tZWRpYSIsImRlYWRsaW5lIjozMTUzMzUxMDI1LCJmc2l6ZUxpbWl0Ijo1MjQyODgwfQ==';

(function(){

    var mkdirs = function(dirpath, callback) {
        fs.exists(dirpath, function(exists) {
            if(exists) {
                return callback(dirpath);
            }
            mkdirs(path.dirname(dirpath), function(){
                fs.mkdir(dirpath, callback);
            });
        });
    }

    var downloadFromUrl = function(url, dest, callback) {
        var file = fs.createWriteStream(dest);
        https.get(url, function(response) {
            response.pipe(file);
            file.on('finish', function() {
                file.close(callback);
            });
        });
    }

    var downloadWxFile = function(gzopenid, type, mediaId, token, callback) {
        var dir = '/home/mechat/wxdownload/' + gzopenid +  '/' + type;
        var suffix = '';
        if (type=='image'){
            suffix = '.jpg';
        } else if (type=='voice') {
            suffix = '.amr';
        }
        var dest = dir + '/' + mediaId + suffix;
        mkdirs(dir, function(){
            var file = fs.createWriteStream(dest);
            var url = API.DOWNLOAD + '?access_token=' + token + '&media_id=' + mediaId;
            var request = http.get(url, function(ret) {
                if (ret.errcode){
                    console.log('download error---->', ret);
                    return callback(false);
                }
                ret.pipe(file);
                file.on('finish', function() {

                    if (type=='voice'){
                        //avconv -i infile.flv -ab 192k outfile.mp3​
                        var child = exec('ffmpeg -i '+dir+'/'+mediaId+'.amr -codec:a libmp3lame -qscale:a 9 '+dir+'/'+mediaId+'.mp3', function (error, stdout, stderr) {
                            if (error !== null) {
                                console.log('exec error: ' + error);
                                file.close(function(){});
                                return callback();
                            }
                            qiniu.io.putFile(qiniuToken, mediaId , dir +'/'+ mediaId + '.mp3', {}, function(err, ret) {
                                console.log("qiniu ret--->", ret);
                                file.close(function(){});
                                return callback();
                            });
                        });
                    }

                    if (type=='image'){
                        qiniu.io.putFile(qiniuToken, mediaId , dest, {}, function(err, ret) {
                            console.log('qiniu ret--->', err, ret);
                            file.close(function(){});
                            callback(ret.key);
                        });
                    }

                });
            }).on('error', function(err){
                fs.unlink(dest);
                console.log('download error---->');
            });
        });
    }

    var uploadFileToWx = function(type, path, token, callback) {
        var dest = '/home/mechat/workspace/weixinSwapSpace/' + moment().valueOf() + Math.floor(Math.random()*10000);
        if (type=='image'){
            dest = dest + '.png';
        } else if (type=='voice'){
            dest = dest + '.mp3'
        }
        if (!token || !path){
            return callback(null);
        }
        var reg = /(\.jpg|\.jpeg|\.png|\.gif)$/i;
        if (type=="image" && !reg.test(path)){
            path = path + '-wx.png';
        }
        downloadFromUrl(path, dest, function(dret){
            exec('curl -F media=@'+dest+' ' + API.UPLOAD + '?type=' + type + '&access_token="'+token, function (err, stdout){
                console.log('upload file to weixin--->', err, stdout);
                if (err){
                    return callback(null);
                }
                var obj = eval('('+stdout+')');
                fs.unlink(dest, function(err){
                    console.log('remove file--->', err);
                });
                callback(obj.media_id);
            });
        });
    }


    var _M = {
        mkdirs: mkdirs,
        downloadFromUrl: downloadFromUrl,
        downloadWxFile: downloadWxFile,
        uploadFileToWx: uploadFileToWx
    };
    module.exports = _M;

})();