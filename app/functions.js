
var http = require('http');
var https = require('https');

var _ = require('underscore');
var moment = require('moment');
var exec = require('child_process').exec;
var xmlDocument = require('xmldoc').XmlDocument;

var faceWx2Ours = require('../faceWx2Ours');
var conf = require('../../conf/conf.json');
var Log = require('../../common/log');
var serviceConf = conf.WeixinService;
var WXURLS = require('../wxAPIurls.json');
var DBS = require("../srv/weixin");

var sa = require('superagent');
var EmojiMqToWeixin = require('./emojiMqToWeixin');
var www_host = conf.Global.www_host;
var chat_host =  conf.Global.chat_host;
var stat_host = conf.Global.stat_host;


(function(){
    
    var sendMsgToUserver = function(unit, wxaccount, gzopenid, fansopenid, msg, callback){
        console.log('sendMsgToUserver---->', unit._id, gzopenid, fansopenid, msg, callback);
        DBS.upsertTodayCount(gzopenid, fansopenid, function(){});
        DBS.upsertTotalCount(gzopenid, fansopenid, function(){});
        if (msg.MsgType=='text'){
            if (msg.Content==''){
                console.log('sendMsgToUserver---->', 'custom emotions unsupported');
                return;
            }
            msg.Content = replaceFace(msg.Content);
        }
        if (msg.MsgType=='note'){
            console.log('sendMsgToUserver---->', 'api unauthorized return', gzopenid);
            return;
        }
        var data = {
            msg: msg,
            unitid: unit._id,
            openid: gzopenid,
            cookie: fansopenid,
            wxname: weixin.name,
            wxcookie: conf.Weixin.wxcookie,
            wxunit: conf.Weixin.wxunit,
            from: 'mc-weixin'
        }
        var url = chat_host + '/weixin/sendmsg';
        sa.post(url)
        .set('Content-Type', 'application/x-www-form-urlencoded; charset=UTF-8')
        .send(data)
        .end(function(err,ret){
            if (err){
                return callback(null);
            }
            if (!ret){
                return callback(null);
            }
            console.log('send to userver res--->', ret.body);
            if (ret.body.success){
                console.log('userver receive msg successed');
            } else {
                console.log('userver offline');
                var params = ret.body;
                DBS.readUnit(unitid, function(unit){
                    var content = "";
                    if (unit && unit.ctel){
                        content = '客服当前不在线，您可以拨打' + unit.ctel + '联系我们或点击<a href="http://mobilechat.im/leavemsg?unitid='+ unit._id +'">在线留言</a>；';
                    } else {
                        content = '客服当前不在线，您可以点击<a href="http://mobilechat.im/leavemsg?unitid='+ unitid +'">在线留言</a>；';
                    }
                    content += "你也可以直接微信留言，我们会尽快给您回复。";
                    getWxToken(gzopenid, function(token){
                        if (token){
                            var msgTmp = {
                                unitid: unitid,
                                openid: gzopenid,
                                toId: fansopenid,
                                type: 'us_normal',
                                content: content
                            };
                            sendMsgToWeixin(unitid, gzopenid, fansopenid, token, msgTmp, function(){});
                        }
                    });
                });
            }
        });
    }
    
    var sendMsgToPartner = function(gzopenid, fansopenid, msg, url, callback){
        console.log('sendMsgToPartner--->');
        DBS.upsertTodayCount(gzopenid, fansopenid, function(){});
        DBS.upsertTotalCount(gzopenid, fansopenid, function(){});
        var data = {
            "MsgType": "text",
            "Content": fixToWxFace(msg.content || ''),
            "ToUserName": fansopenid, //gzopenid,
            "FromUserName": gzopenid//fansopenid
        };
        var url = decodeURIComponent(url);
        sa.post(url)
        .set('Content-Type', 'application/json')
        .send(data)
        .end(function(err,ret){
            if (err){
                return callback(null);
            }
            console.log('sendMsgToPartner response--->',err, ret.body, ret.text);
        });
    }

    var immediateReplyService = function(gzopenid, fansopenid, msg, res, callback){
        if (!msg){
            return res.send('');
        }
        var timestamp = Math.floor(moment().valueOf()/1000);
        var nonce = WxFuns.randomString(6, '0123456789');
        var echostr = WxFuns.randomString(6);
        var arr = [timestamp, nonce, serviceConf.token];
        arr.sort();
        var str = arr.join('');
        var signature = WxFuns.sha1(str);

        var xml = '';
        if (msg.type=='text'){
            var tou = '<ToUserName><![CDATA[' + fansopenid + ']]></ToUserName>';
            var fru = '<FromUserName><![CDATA[' + gzopenid + ']]></FromUserName>';
            var ct  = '<CreateTime>' + Math.floor((new Date()).valueOf()/1000) + '</CreateTime>';
            var mt  = '<MsgType><![CDATA[text]]></MsgType>';
            var con = '<Content><![CDATA[' + msg.content + ']]></Content>';
            xml = '<xml>'+tou+fru+ct+mt+con+'</xml>';
            var resXml0 = '<encrypt><!--[CDATA[' + encrypt(xml) + ']]--></encrypt>';
            var resXml1 = '<msgsignature><!--[CDATA['+signature+']]--></msgsignature>';
            var resXml2 = '<timestamp>'+timestamp+'</timestamp>';
            var resXml3 = '<nonce><!--[CDATA['+nonce+']]--></nonce>';
            var resXml = '<xml>' + resXml0 + resXml1 + resXml2 + resXml3 + '</xml>';
            res.send(resXml);
        } else if (msg.type=='image') {
            var tou = '<ToUserName><![CDATA[' + fansopenid + ']]></ToUserName>';
            var fru = '<FromUserName><![CDATA[' + gzopenid + ']]></FromUserName>';
            var ct  = '<CreateTime>' + Math.floor((new Date()).valueOf()/1000) + '</CreateTime>';
            var mt  = '<MsgType><![CDATA[news]]></MsgType>';
            var at  = '<ArticleCount>1</ArticleCount>';
            var ats = '<Articles><item><PicUrl><![CDATA['+www_host+msg.path+']]></PicUrl><Url><![CDATA['+www_host+msg.path+']]></Url></item></Articles>';
            xml =  '<xml>'+tou+fru+ct+mt+at+ats+'</xml>';
            var resXml0 = '<encrypt><!--[CDATA[' + encrypt(xml) + ']]--></encrypt>';
            var resXml1 = '<msgsignature><!--[CDATA['+signature+']]--></msgsignature>';
            var resXml2 = '<timestamp>'+timestamp+'</timestamp>';
            var resXml3 = '<nonce><!--[CDATA['+nonce+']]--></nonce>';
            var resXml = '<xml>' + resXml0 + resXml1 + resXml2 + resXml3 + '</xml>';
            res.send(resXml);
        } else if (msg.type=='image-text') {
            DBS.readWxAccount(gzopenid, function(err, weixin){
                if (err || !weixin){
                    return res.send('');
                }
                DBS.readTuwen(weixin.unitid, msg.tuwenid, function(err, tuwen){
                    if (err || !tuwen){
                        return res.send('');
                    }
                    var tou = '<ToUserName><![CDATA[' + fansopenid + ']]></ToUserName>';
                    var fru = '<FromUserName><![CDATA[' + gzopenid + ']]></FromUserName>';
                    var ct  = '<CreateTime>' + Math.floor((new Date()).valueOf()/1000) + '</CreateTime>';
                    var mt  = '<MsgType><![CDATA[news]]></MsgType>';
                    var at  = '<ArticleCount>1</ArticleCount>';
                    var it  = '';
                    if (tuwen.Title){
                        it = it + '<Title><![CDATA['+tuwen.Title+']]></Title>';
                    }
                    if (tuwen.Description){
                        it = it + '<Description><![CDATA['+tuwen.Description+']]></Description>';
                    }
                    it = it + '<PicUrl><![CDATA['+www_host+tuwen.PicUrl+']]></PicUrl>';
                    if (tuwen.Url){
                        it = it + '<Url><![CDATA['+tuwen.Url+']]></Url>';
                    }
                    var ats = '<Articles><item>'+it+'</item></Articles>';
                    xml =  '<xml>'+tou+fru+ct+mt+at+ats+'</xml>';
                    var resXml0 = '<encrypt><!--[CDATA[' + encrypt(xml) + ']]--></encrypt>';
                    var resXml1 = '<msgsignature><!--[CDATA['+signature+']]--></msgsignature>';
                    var resXml2 = '<timestamp>'+timestamp+'</timestamp>';
                    var resXml3 = '<nonce><!--[CDATA['+nonce+']]--></nonce>';
                    var resXml = '<xml>' + resXml0 + resXml1 + resXml2 + resXml3 + '</xml>';
                    return res.send(resXml);
                });
            });
        }    
    }

    var immediateReply = function(gzopenid, fansopenid, msg, res, callback){
        if (!msg){
            return res.send('');
        }
        var xml = '';
        if (msg.type=='text'){
            var tou = '<ToUserName><![CDATA[' + fansopenid + ']]></ToUserName>';
            var fru = '<FromUserName><![CDATA[' + gzopenid + ']]></FromUserName>';
            var ct  = '<CreateTime>' + Math.floor((new Date()).valueOf()/1000) + '</CreateTime>';
            var mt  = '<MsgType><![CDATA[text]]></MsgType>';
            var con = '<Content><![CDATA[' + msg.content + ']]></Content>';
            xml = '<xml>'+tou+fru+ct+mt+con+'</xml>';
            res.send(xml);
        } else if (msg.type=='image') {
            var tou = '<ToUserName><![CDATA[' + fansopenid + ']]></ToUserName>';
            var fru = '<FromUserName><![CDATA[' + gzopenid + ']]></FromUserName>';
            var ct  = '<CreateTime>' + Math.floor((new Date()).valueOf()/1000) + '</CreateTime>';
            var mt  = '<MsgType><![CDATA[news]]></MsgType>';
            var at  = '<ArticleCount>1</ArticleCount>';
            var ats = '<Articles><item><PicUrl><![CDATA['+www_host+msg.path+']]></PicUrl><Url><![CDATA['+www_host+msg.path+']]></Url></item></Articles>';
            xml =  '<xml>'+tou+fru+ct+mt+at+ats+'</xml>';
            res.send(xml);
        } else if (msg.type=='image-text') {
            DBS.readWxAccount(gzopenid, function(err, weixin){
                if (err || !weixin){
                    return res.send('');
                }
                DBS.readTuwen(weixin.unitid, msg.tuwenid, function(err, tuwen){
                    if (err || !tuwen){
                        return res.send('');
                    }
                    var tou = '<ToUserName><![CDATA[' + fansopenid + ']]></ToUserName>';
                    var fru = '<FromUserName><![CDATA[' + gzopenid + ']]></FromUserName>';
                    var ct  = '<CreateTime>' + Math.floor((new Date()).valueOf()/1000) + '</CreateTime>';
                    var mt  = '<MsgType><![CDATA[news]]></MsgType>';
                    var at  = '<ArticleCount>1</ArticleCount>';
                    var it  = '';
                    if (tuwen.Title){
                        it = it + '<Title><![CDATA['+tuwen.Title+']]></Title>';
                    }
                    if (tuwen.Description){
                        it = it + '<Description><![CDATA['+tuwen.Description+']]></Description>';
                    }
                    it = it + '<PicUrl><![CDATA['+www_host+tuwen.PicUrl+']]></PicUrl>';
                    if (tuwen.Url){
                        it = it + '<Url><![CDATA['+tuwen.Url+']]></Url>';
                    }
                    var ats = '<Articles><item>'+it+'</item></Articles>';
                    xml =  '<xml>'+tou+fru+ct+mt+at+ats+'</xml>';
                    return res.send(xml);
                });
            });
        }    
    }

    var immediateReply2 = function(unitid, gzopenid, fansopenid, token, msg, callback){
        console.log('immediateReply2--->', msg);
        if (!(unitid && gzopenid && fansopenid && token && msg)){
            return callback(false);
        }
        var msgTmp = {
            unitid: unitid,
            openid: gzopenid,
            toId: fansopenid
        };
        if (msg.type=='text'){
            msgTmp.type = 'us_normal';
            msgTmp.content = msg.content || '';
            sendMsgToWeixin(unitid, gzopenid, fansopenid, token, msgTmp, callback)
        } else if (msg.type=='image') {
            msgTmp.type = 'us_image';
            var urlReg = /^http/;
            if (!urlReg.test(msg.path)){
                msgTmp.picUrl = www_host + msg.path;
            } else {
                msgTmp.picUrl = msg.path;
            }
            console.log('immediate2--->', msgTmp.picUrl);
            sendMsgToWeixin(unitid, gzopenid, fansopenid, token, msgTmp, callback)
        } else if (msg.type=='image-text') {
            DBS.readWxAccount(gzopenid, function(err, weixin){
                if (err || !weixin){
                    return callback(false);
                }
                DBS.readTuwen(weixin.unitid, msg.tuwenid, function(err, tuwen){
                    if (err || !tuwen){
                        return callback(false);
                    }
                    msgTmp.type = 'us_image_text';
                    msgTmp.Title = tuwen.Title;
                    msgTmp.Description = tuwen.Description;
                    msgTmp.Url = tuwen.Url;
                    msgTmp.PicUrl = www_host+tuwen.PicUrl;
                    sendMsgToWeixin(unitid, gzopenid, fansopenid, token, msgTmp, callback)
                });
            });
        }    
    }

    var getWxToken = function(gzopenid, callback){
        var now = moment().valueOf();
        DBS.readWxAccount(gzopenid, function(err, weixin){
            if (err || !weixin){
                return callback(null);
            }
            if (weixin.type=='wxservice'){

                return getAuthorizerAccessToken(weixin.appid, callback);

            } else {

                if (weixin.token && (weixin.tokenExpiration > now)){
                    return callback(weixin.token);
                }
                if (!(weixin.appid && weixin.appsecret)){
                    return callback(null);
                }
                var url = 'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid='+ weixin.appid + '&secret=' + weixin.appsecret;
                sa.get(url)
                .end(function(err, ret){
                    if (err){
                        return callback(null);
                    }
                    var data = eval('('+ ret.text +')');
                    if (!(data && data.access_token)){
                        return callback(null);
                    }
                    var expires_in = data.expires_in ? parseInt(data.expires_in):7200;
                    var token = data.access_token;
                    var tokenExpiration = now + (expires_in-200)*1000;
                    DBS.updateWxInfo(gzopenid, {token:token, tokenExpiration:tokenExpiration}, function(){});
                    return callback(token);
                });

            }
        });
    }

    var getSubscribers = function(gzopenid, token, callback){
        if (!gzopenid || !token){
            return callback(null);
        }
        var url = 'https://api.weixin.qq.com/cgi-bin/user/get?access_token='+token+'&next_openid=';
        sa.get(url)
        .end(function(err, ret){
            if (err){
                return callback(null);
            }
            var data = eval('('+ ret.text +')');
            if (data.total){
                callback(data.total);
            } else {
                callback(null);
            }
        });
    }

    var wxMsgSend = function(unitid, gzopenid, fansopenid, url, data, callback){
        sa.post(url)
        .set('Content-Type', 'application/json')
        .send(data)
        .end(function(err,ret){
            if (err){
                return;
            }
            if (!ret || !ret.body){
                return;
            }
            if (ret.body.errcode==48001){
                var notemsg = { 
                    MsgType: 'note',
                    Content: 'api unauthorized'
                }
                sendMsgToUserver(unitid, gzopenid, fansopenid, notemsg, function(){});
                DBS.updateWxInfo(gzopenid, {status: 'subscribe'}, function(){});
            } else if (ret.body.errcode==0){
                DBS.updateWxInfo(gzopenid, {status: 'service'}, function(){});
            }
        });
    }
    var sendMsgToWeixin = function(unitid, gzopenid, fansopenid, token, msg, callback){
        console.log('sendMsgToWeixin--->', msg);
        if (!(gzopenid && fansopenid && token && msg)){
            return callback({success:false, info:'params missing'})
        }
        var data = {};
        var url;  
        DBS.upsertTodayCount(gzopenid, fansopenid, function(){});
        DBS.upsertTotalCount(gzopenid, fansopenid, function(){});
        url = 'https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=' + encodeURIComponent(token);
        //表情处理
        //data.touser = fansopenid;
        if (msg.type=='us_image_text'){

            data = {
                "touser": fansopenid,
                "msgtype":"news",
                "news":{
                    "articles": [
                        {
                            "title": msg.Title,
                            "description": msg.Description,
                            "url": msg.Url,
                            "picurl": msg.PicUrl
                        }
                    ]
                }
            }
            wxMsgSend(unitid, gzopenid, fansopenid, url, data, callback);

        } else if (msg.type=='us_image'){

            uploadFileToWx("image", msg.picUrl, token, function(media_id){
                url = 'https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=' + encodeURIComponent(token);
                if (media_id){
                    data = {
                        "touser": fansopenid,
                        "msgtype": "image",
                        "image": { "media_id": media_id }
                    };
                    wxMsgSend(unitid, gzopenid, fansopenid, url, data, callback);
                }
            });

        } else if (msg.type=='us_voice'){

            var reg = /^http/;
            if (reg.test(msg.mediaId)){
                uploadFileToWx("voice", msg.mediaId, token, function(media_id){
                    url = 'https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=' + encodeURIComponent(token);
                    if (media_id){
                        data = {
                            "touser": fansopenid,
                            "msgtype": "voice",
                            "voice": { "media_id": media_id }
                        };
                        wxMsgSend(unitid, gzopenid, fansopenid, url, data, callback);
                    }
                });
            } else {
                data = {
                    "touser": fansopenid,
                    "msgtype": "voice",
                    "voice": { "media_id": msg.mediaId }
                };
                wxMsgSend(unitid, gzopenid, fansopenid, url, data, callback);
            }

        } else {

            if (msg.content){
                msg.content = EmojiMqToWeixin.replaceMeiqiaEmojiToWeixin(msg.content);
            }
            data = {
                "touser": fansopenid,
                "msgtype": "text",
                "text": { "content": fixToWxFace(msg.content || '') }
            };
            wxMsgSend(unitid, gzopenid, fansopenid, url, data, callback);

        }
    }

    // ============weixin service div==============
    // ============================================
    
    
    //获取服务access_token
    function getComponentAccessTokenFromAPI(callback){
        console.log('getComponentAccessTokenFromAPI--->');
        DBS.readTicket(serviceConf.appid, function(err, component_verify_ticket){
            if (!component_verify_ticket){
                return callback();
            }
            var data = {
                "component_appid": serviceConf.appid,
                "component_appsecret": serviceConf.appsecret,
                "component_verify_ticket": component_verify_ticket
            };
            var url = 'https://api.weixin.qq.com/cgi-bin/component/api_component_token';
            sa.post(url)
            .set('Content-Type', 'application/json')
            .send(data)
            .end(function(err,ret){
                if (err){
                    return callback();
                }
                console.log('get token from api--->', ret.body);
                if (ret && ret.body.component_access_token){
                    DBS.writeComponentAccessToken(serviceConf.appid, ret.body.component_access_token, ret.body.expires_in, function(){});
                    return callback(ret.body.component_access_token);
                } else {
                    return callback();
                }
            });
        });
    }    
    //获取服务access_token
    function getComponentAccessToken(callback){
        console.log('getComponentAccessToken--->');
        DBS.readComponentAccessToken(serviceConf.appid, function(err, access_token){
            if (!err && access_token){
                return callback(access_token);
            }
            return getComponentAccessTokenFromAPI(callback)
        });
    }

    //获取预授权码
    function getPreAuthCodeFromAPI(component_access_token, callback){
        console.log('getPreAuthCodeFromAPI--->', component_access_token);
        var url = 'https://api.weixin.qq.com/cgi-bin/component/api_create_preauthcode?component_access_token='+component_access_token;
        var data = {
            "component_appid": serviceConf.appid
        };
        sa.post(url)
        .set('Content-Type', 'application/json')
        .send(data)
        .end(function(err,ret){
            if (err){
                return callback();
            }
            if (ret && ret.body.pre_auth_code){
                DBS.writePreAuthCode(serviceConf.appid, ret.body.pre_auth_code, ret.body.expires_in, function(){});
                return callback(ret.body.pre_auth_code, ret.body.expires_in);
            } else {
                return callback();
            }
        });
    }
    //获取预授权码
    function getPreAuthCode(callback){
        console.log('getPreAuthCode--->');
        //同一个授权码只能使用一次，所以存下来的没用了
        //DBS.readPreAuthCode(serviceConf.appid, function(err, pre_auth_code){
        //    if (!err && pre_auth_code){
        //        return callback(pre_auth_code);
        //    }
            getComponentAccessToken(function(component_access_token){
                if (!component_access_token){
                    return callback()
                }
                return getPreAuthCodeFromAPI(component_access_token, callback);
            });
        //});
    }
    
    //(初次授权)使用授权码换取公众号的授权信息(仅为授权信息)
    function getAuthInfo(authorization_code, callback){
        console.log('getAuthInfo--->', authorization_code);
        getComponentAccessToken(function(component_access_token){
            if (!component_access_token){
                return callback();
            }
            var url = 'https://api.weixin.qq.com/cgi-bin/component/api_query_auth?component_access_token='+component_access_token;
            var data = {
                "component_appid": serviceConf.appid,
                "authorization_code": authorization_code
            };
            sa.post(url)
            .set('Content-Type', 'application/json')
            .send(data)
            .end(function(err,ret){
                if (err){
                    return callback();
                }
                console.log('firstGetAuthInfo---->', ret.body);
                if (ret && ret.body.authorization_info){
                    var auth_info = ret.body;
                    var appid = auth_info.authorization_info.authorizer_appid;
                    var accessToken = auth_info.authorization_info.authorizer_access_token;
                    var refreshToken = auth_info.authorization_info.authorizer_refresh_token;
                    var expiresIn = auth_info.authorization_info.expires_in;
                    DBS.writeAuthInfo(appid, accessToken, refreshToken, expiresIn, function(err, dbret){
                        if (err){
                            return callback()
                        }
                        return callback(appid, accessToken, refreshToken);
                    });
                } else {
                    return callback()
                }
            });
        });
    }
    //获取（刷新）授权公众号的authorizer_access_token
    function getAuthorizerAccessToken(authorizer_appid, callback){
        console.log('getAuthorizerAccessToken--->');
        DBS.readAuthInfo(authorizer_appid, function(err, authorizer_access_token, authorizer_refresh_token){
            if (!authorizer_refresh_token){
                return callback();
            }
            if (!authorizer_access_token){
                return getAuthorizerAccessTokenFromApi(authorizer_appid, authorizer_refresh_token, callback);
            }

            return callback(authorizer_access_token);
        });
    }
    //获取（刷新）授权公众号的令牌
    function getAuthorizerAccessTokenFromApi(authorizer_appid, authorizer_refresh_token, callback){
        console.log('getAuthorizerAccessTokenFromApi--->', authorizer_appid);
        getComponentAccessToken(function(component_access_token){
            if (!component_access_token){
                return callback();
            }
            if (!authorizer_refresh_token){
                return callback();
            }
            var url = 'https://api.weixin.qq.com/cgi-bin/component/api_authorizer_token?component_access_token='+component_access_token;
            var data = {
                "component_appid": serviceConf.appid,
                "authorizer_appid": authorizer_appid,
                "authorizer_refresh_token": authorizer_refresh_token
            };
            sa.post(url)
            .set('Content-Type', 'application/json')
            .send(data)
            .end(function(err,ret){
                if (err){
                    return callback();
                }
                if (ret && ret.body.authorizer_access_token){
                    var auth_info = ret.body;
                    var expires_in = ret.body.expires_in;
                    DBS.writeAuthInfo(authorizer_appid, auth_info.authorizer_access_token, auth_info.authorizer_refresh_token, expires_in, function(err){
                        return callback(auth_info.authorizer_access_token);
                    });
                } else {
                    return callback();
                }
            });
        });
    }
    //获取授权方信息
    function getAuthorizerInfo(unitid, authorizer_appid, callback){
        console.log('getAuthorizerInfo--->');
        DBS.readAuthInfo(authorizer_appid, function(err, authorizer_info){
            if (authorizer_info){
                return callback(authorizer_info);
            }
            return getAuthorizerInfoFromApi(authorizer_appid, callback);
        });
    }
    function getAuthorizerInfoFromApi(unitid, authorizer_appid, callback){
        console.log('getAuthorizerInfoFromApi--->', unitid, authorizer_appid);
        getComponentAccessToken(function(component_access_token){
            if (!component_access_token){
                return callback()
            }
            var url = 'https://api.weixin.qq.com/cgi-bin/component/api_get_authorizer_info?component_access_token='+component_access_token;
            var data = {
                "component_appid": serviceConf.appid,
                "authorizer_appid": authorizer_appid
            };
            sa.post(url)
            .set('Content-Type', 'application/json')
            .send(data)
            .end(function(err,ret){
                if (err){
                    return callback();
                }
                /*
                if (!(ret && ret.body.pre_auth_code)){
                    return callback()
                }
                */
                if (ret && ret.body.authorizer_info){
                    var authorizer_info = ret.body;
                    var openid = authorizer_info.authorizer_info.user_name;
                    var appid = authorizer_info.authorization_info.authorizer_appid;
                    authorizer_info.appid = appid;
                    authorizer_info.type = 'wxservice';
                    authorizer_info.name = authorizer_info.authorizer_info.nick_name;
                    authorizer_info.unitid = unitid;
                    authorizer_info.createdTime = moment().valueOf();
                    DBS.writeAuthorizerInfo(unitid, openid, authorizer_info, function(err){
                        return callback(authorizer_info);
                    });
                } else {
                    return callback();
                }
            });
        });
    }

    //获取授权方的选项设置信息
    function getAuthorizerOption(component_access_token, authorizer_appid, option_name_value){
        var url = 'https://api.weixin.qq.com/cgi-bin/component/api_get_authorizer_option?component_access_token='+component_access_token;
        var data = {
            "component_appid": serviceConf.appid,
            "authorizer_appid": authorizer_appid,
            "option_name": option_name_value
        };
        sa.post(url)
        .set('Content-Type', 'application/json')
        .send(data)
        .end(function(err,ret){
            if (err){
                return callback(null);
            }
            console.log('getAuthorizerOption---->', ret.body);
            if (ret && ret.body.authorizer_appid){
                // 返回结果
                // "authorizer_appid":"wx7bc5ba58cabd00f4",
                // "option_name":"voice_recognize",
                // "option_value":"1"
            }
        });
    }
    //设置授权方的选项信息
    function setAuthorizerOption(component_access_token, authorizer_appid, option_name_value, option_value_value){
        var url = 'https://api.weixin.qq.com/cgi-bin/component/api_set_authorizer_option?component_access_token='+component_access_token;
        var data = {
            "component_appid": serviceConf.appid,
            "authorizer_appid": authorizer_appid,
            "option_name": option_name_value,
            "option_value": option_value_value
        };
        sa.post(url)
        .set('Content-Type', 'application/json')
        .send(data)
        .end(function(err,ret){
            if (err){
                return callback(null);
            }
            console.log('setAuthorizerOption---->', ret.body);
            if (ret && ret.body.authorizer_appid){
                // 返回结果
                // "component_appid":"appid_value",
                // "authorizer_appid": " auth_appid_value ",
                // "option_name": "option_name_value",
                // "option_value":"option_value_value"
            }
        });
    }

    var _M = {
        getIP: getIP,
        sha1: sha1,
        randomString: randomString,
        fixToWxFace: fixToWxFace,
        replaceFace: replaceFace,
        mkdirs: mkdirs,
        downloadFromUrl: downloadFromUrl,
        downloadWxFile: downloadWxFile,
        uploadFileToWx: uploadFileToWx,
        sendMsgToUserver: sendMsgToUserver,
        sendMsgToPartner: sendMsgToPartner,
        immediateReply: immediateReply,
        immediateReply2: immediateReply2,
        immediateReplyService: immediateReplyService,
        getWxToken: getWxToken,
        getSubscribers: getSubscribers,
        
        getComponentAccessTokenFromAPI: getComponentAccessTokenFromAPI,
        getComponentAccessToken: getComponentAccessToken,
        
        getPreAuthCodeFromAPI: getPreAuthCodeFromAPI,
        getPreAuthCode: getPreAuthCode,
        getAuthInfo: getAuthInfo,
        
        getAuthorizerAccessToken: getAuthorizerAccessToken,
        getAuthorizerAccessTokenFromApi: getAuthorizerAccessTokenFromApi,
        
        getAuthorizerInfo: getAuthorizerInfo,
        getAuthorizerInfoFromApi: getAuthorizerInfoFromApi,

        getAuthorizerOption: getAuthorizerOption,
        setAuthorizerOption: setAuthorizerOption,

        sendMsgToWeixin: sendMsgToWeixin
    };
    module.exports = _M;

})();
