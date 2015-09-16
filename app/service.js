(function(){

var _ = require('underscore');
var sa = require('superagent');
var UUID = require('node-uuid');

var DBS = require("../srv/weixin");
var conf = require('../../conf/conf.json');
var Log = require("../../common/log");
var serviceConf = conf.WeixinService;
var WxFuns = require("./weixin-functions");
var moment = require("moment");

var faceWx2Ours = require('../faceWx2Ours');
var www_host = conf.Global.www_host;
var chat_host =  conf.Global.chat_host;
var stat_host = conf.Global.stat_host;
var weixinCrypto = require('./weixinCrypto');
var xmlDocument = require('xmldoc').XmlDocument;

this.include = function(app){

    //================weixin service========================
    //======================================================

    function decrypt(xml){
        var mi = new weixinCrypto(serviceConf.token, serviceConf.key, serviceConf.appid); 
        return mi.decrypt(xml);
    }
    function encrypt(xml){
        var mi = new weixinCrypto(serviceConf.token, serviceConf.key, serviceConf.appid); 
        return mi.encrypt(xml);
    }

    //接收服务Ticket,微信每10分钟推送一次
    app.post('/service/event/receive', function(req, res){
        Log.info('receiveTicket--->', moment().format('YYYY-MM-DD HH:mm:ss'));
        var tmp = new xmlDocument(req.rawBody);
        var params = {};
        for (var i=0;i<tmp.children.length;i++){
            params[tmp.children[i]['name']] = tmp.children[i]['val'];
        }

        var arr = [req.query.timestamp, req.query.nonce, serviceConf.token];
        arr.sort();
        var str = arr.join('');
        str = WxFuns.sha1(str);
        if (str==req.query.signature){
            var xml = decrypt(params.Encrypt);
            var tmp = new xmlDocument(xml.message);
            var p = {};
            for (var i=0;i<tmp.children.length;i++){
                p[tmp.children[i]['name']] = tmp.children[i]['val'];
            }
            Log.info('afterDecrypt--->', p);
            if (p.ComponentVerifyTicket){
                DBS.writeTicket(serviceConf.appid, p.ComponentVerifyTicket, function(err, ret){

                });
            }
        }
        return res.send('success');
    });
    
    app.get('/wx/get/preauth', function(req, res){
        WxFuns.getPreAuthCode(function(pre_auth_code){
            if (pre_auth_code){
                var url = 'https://mp.weixin.qq.com/cgi-bin/componentloginpage?component_appid='+serviceConf.appid+'&pre_auth_code='+pre_auth_code+'&redirect_uri='+encodeURIComponent(www_host + '/unit/newadmin#wxservice/callback/');
                res.send({success:true, pre_auth_code:pre_auth_code, url:url});
            } else {
                res.send({success:false});
            }
        })
    });

    app.post('/wx/get/auth/info', function(req, res){
        var auth_code = req.body.auth_code;
        var unitid = req.body.unitid;
        WxFuns.getAuthInfo(auth_code, function(appid, accessToken, refreshToken){
            if (appid){
                WxFuns.getAuthorizerInfoFromApi(unitid, appid, function(authorInfo){
                    if (authorInfo){
                        authorInfo.success = true;
                        res.send(authorInfo);
                    } else {
                        res.send({success:false});
                    }
                })
            } else {
                res.send({success:false});
            }
        });
    });

    app.get('/service/msg/receive/:unitid', function(req, res){
        var unitid = req.params.unitid;
        //need to check request if from weixin
        return res.send('');
    });

    //为了发布
    var forPublish = function(res, params){
        var unitid = '50e848d1447705745b000002';
        var fansopenid = params.FromUserName;
        var gzopenid = params.ToUserName;

        if (params.MsgType=='event'){
            var eventType = params.Event;
            var tmpxx = Math.floor(moment().valueOf()/1000);
            var tou = '<ToUserName><![CDATA[' + fansopenid + ']]></ToUserName>';
            var fru = '<FromUserName><![CDATA[' + gzopenid + ']]></FromUserName>';
            var ct  = '<CreateTime>' + tmpxx + '</CreateTime>';
            var mt  = '<MsgType><![CDATA[text]]></MsgType>';
            var con = '<Content><![CDATA[' + eventType + 'from_callback' + ']]></Content>';
            var xml = '<xml>'+tou+fru+ct+mt+con+'</xml>';
            var encryptXml = encrypt(xml);
            var timestamp = tmpxx;
            var nonce = WxFuns.randomString(6, '0123456789');
            var echostr = WxFuns.randomString(6);
            var arr = [timestamp, nonce, serviceConf.token, encryptXml];
            arr.sort();
            var str = arr.join('');
            var signature = WxFuns.sha1(str);
            var resXml0 = '<Encrypt><![CDATA[' + encryptXml + ']]></Encrypt>';
            var resXml1 = '<MsgSignature><![CDATA['+signature+']]></MsgSignature>';
            var resXml2 = '<TimeStamp>'+timestamp+'</TimeStamp>';
            var resXml3 = '<Nonce><![CDATA['+nonce+']]></Nonce>';
            var resXml = '<xml>' + resXml0 + resXml1 + resXml2 + resXml3 + '</xml>';
            Log.info('=====event', xml, resXml);
            return res.send(resXml);
        } else if (params.MsgType=='text'){
            if (params.Content.indexOf('QUERY_AUTH_CODE')>=0){
                res.send('');
                var tmp = params.Content.split(':');
                var authorization_code = tmp[1];
                Log.info('authorization_code--->', authorization_code);
                WxFuns.getAuthInfo(authorization_code, function(appid, accessToken, refreshToken){
                    if (appid){
                        WxFuns.getAuthorizerInfoFromApi(unitid, appid, function(authorInfo){
                            if (authorInfo){

                            } else {

                            }
                            var msg = { 
                                cookie: fansopenid,
                                type: 'us_normal',
                                content: authorization_code+'_from_api',
                                fromId: '10100',
                                fromName: 'Fiona',
                                toId: fansopenid,
                                toName: '四川成都刚子44811',
                                createdTime: 1421117336114,
                                status: 'arrived',
                                _id: '830409',
                                unitid: '50e848d1447705745b000002',
                                openid: 'gh_3c884a361561' 
                            };
                            WxFuns.sendMsgToWeixin(msg.unitid, msg.openid, msg.toId, accessToken, msg, function(data){});
                        })
                    } else {

                    }
                });
            } else if (params.Content=='TESTCOMPONENT_MSG_TYPE_TEXT'){
                var tmpxx = Math.floor(moment().valueOf()/1000);
                var tou = '<ToUserName><![CDATA[' + fansopenid + ']]></ToUserName>';
                var fru = '<FromUserName><![CDATA[' + gzopenid + ']]></FromUserName>';
                var ct  = '<CreateTime>' + tmpxx + '</CreateTime>';
                var mt  = '<MsgType><![CDATA[text]]></MsgType>';
                var con = '<Content><![CDATA[' + 'TESTCOMPONENT_MSG_TYPE_TEXT_callback' + ']]></Content>';
                var xml = '<xml>'+tou+fru+ct+mt+con+'</xml>';
                var encryptXml = encrypt(xml);
                var timestamp = tmpxx;
                var nonce = WxFuns.randomString(6, '0123456789');
                var echostr = WxFuns.randomString(6);
                var arr = [timestamp, nonce, serviceConf.token, encryptXml];
                arr.sort();
                var str = arr.join('');
                var signature = WxFuns.sha1(str);
                var resXml0 = '<Encrypt><![CDATA[' + encryptXml + ']]></Encrypt>';
                var resXml1 = '<MsgSignature><![CDATA['+signature+']]></MsgSignature>';
                var resXml2 = '<TimeStamp>'+timestamp+'</TimeStamp>';
                var resXml3 = '<Nonce><![CDATA['+nonce+']]></Nonce>';
                var resXml = '<xml>' + resXml0 + resXml1 + resXml2 + resXml3 + '</xml>';
                Log.info('=====TESTCOMPONENT_MSG_TYPE_TEXT', xml, resXml);
                return res.send(resXml);
            }
        }
    }

    app.post('/service/msg/receive/:appid', function(req, res){
        var reqTmp = moment().valueOf();
        Log.info('rawBody--->', req.rawBody);
        var tmp = new xmlDocument(req.rawBody);
        var rawParams = {};
        for (var i=0;i<tmp.children.length;i++){
            rawParams[tmp.children[i]['name']] = tmp.children[i]['val'];
        }
        Log.info('rawParams--->', rawParams);
        if (!rawParams.Encrypt){
            return res.send('');
        }
        tmp = decrypt(rawParams.Encrypt);
        var params = {};
        var msgTmp = tmp.message;
        var msgId = tmp.id;
        if (!(msgTmp && msgId)){
            return res.send('');
        }
        var xmltmp = new xmlDocument(msgTmp);
        for (var i=0;i<xmltmp.children.length;i++){
            params[xmltmp.children[i]['name']] = xmltmp.children[i]['val'];
        }
        Log.info('msg after decrypt--->', params);

        var fansopenid = params.FromUserName;
        var gzopenid = params.ToUserName;

        if (req.params.appid=='wx570bc396a51b8ff8'){
            return forPublish(res, params)
        }

        //search unit by unitid
        DBS.readWxAccount(gzopenid, function(err, weixin){
            if (!weixin){
                return res.send('');
            }
            var unitid = weixin.unitid;
            DBS.updateWxInfo(gzopenid, {lastReceiveTmp: moment().valueOf()}, function(err,ret){});
            DBS.readUnit(unitid, function(err, unit){
                if (err || !unit){
                    return res.send('');
                }
                if (params.MsgType=='event'){
                    if (params.Event=='LOCATION'){
                        var location = { 
                            openid: params.FromUserName,
                            createdTime: moment().valueOf(),
                            lat: params.Latitude,
                            lng: params.Longitude,
                            precision: params.Precision 
                        };
                        DBS.upsertLocation(fansopenid, location, function(err, ret){});
                        return res.send('');
                    } else if (params.Event=='subscribe'){
                        WxFuns.getWxToken(gzopenid, function(token){
                            if (token){
                                WxFuns.getSubscribers(gzopenid, token, function(number){
                                    if (number){
                                        DBS.updateWxInfo(gzopenid, {fansnum: number}, function(){});
                                    }
                                });
                            }
                        });
                        
                        DBS.readSubscribeReply(gzopenid, function(err, subreply){
                            if (err || !subreply){
                                return res.send('');
                            }
                            if (!(subreply.msgid && subreply.open=='true')){
                                return res.send('');
                            }
                            DBS.readReplyMsg(unitid, subreply.msgid, function(err, msg){
                                res.send('');
                                if (msg){
                                    WxFuns.getWxToken(gzopenid, function(token){
                                        if (token){
                                            WxFuns.immediateReply2(unitid, gzopenid, fansopenid, token, msg, function(irret){});
                                        }
                                    });
                                }
                            });

                        });
                    } else if (params.Event=='unsubscribe'){
                        WxFuns.getWxToken(gzopenid, function(token){
                            if (token){
                                WxFuns.getSubscribers(gzopenid, token, function(number){
                                    if (number){
                                        DBS.updateWxInfo(gzopenid, {fansnum: number}, function(){});
                                    }
                                });
                            }
                        });
                        return res.send('');
                    } else if (params.Event=='CLICK'){
                        res.send('');
                        DBS.readReplyMsg(unitid, params.EventKey, function(err, msg){
                            if (msg){
                                WxFuns.getWxToken(gzopenid, function(token){
                                    if (token){
                                        WxFuns.immediateReply2(unitid, gzopenid, fansopenid, token, msg, function(irret){});
                                    }
                                });
                            }
                        });
                    } else {
                        return res.send('');
                    }
                } else if (params.MsgType=='text') {
                    DBS.readKeywordsReply(gzopenid, function(err, kr){
                        if (err){
                            return res.send('');
                        }
                        if (kr && kr.open=='true'){

                        var autoReply = false;
                        var rules = kr.rules;
                        outerloop:
                        for (var i=0; i<rules.length; i++){
                            var rule = rules[i];
                            for (var j=0; j<rule.regs.length; j++){
                                var regStr = rule.regs[j].kw;
                                var mode = rule.regs[j].mode;
                                if (mode=='pm'){
                                    var re = new RegExp(regStr, "i");
                                    if (re.test(params.Content)){
                                        autoReply = true;
                                        DBS.readReplyMsg(unitid, rule.msgid, function(err, msg){
                                            var resTmp = moment().valueOf();
                                            Log.info('processTimeSpan--->', resTmp-reqTmp);
                                            res.send('');
                                            if (msg){
                                                Log.info('DBS.readReplyMsg--->', msg);
                                                WxFuns.getWxToken(gzopenid, function(token){
                                                    if (token){
                                                        WxFuns.immediateReply2(unitid, gzopenid, fansopenid, token, msg, function(irret){});
                                                    }
                                                });
                                            }
                                        });
                                        break outerloop;
                                    }
                                } else if (mode=='wm') {
                                    if (regStr==params.Content){
                                        autoReply = true;
                                        DBS.readReplyMsg(unitid, rule.msgid, function(err, msg){
                                            var resTmp = moment().valueOf();
                                            Log.info('processTimeSpan--->', resTmp-reqTmp);
                                            res.send('');
                                            if (msg){
                                                WxFuns.getWxToken(gzopenid, function(token){
                                                    if (token){
                                                        WxFuns.immediateReply2(unitid, gzopenid, fansopenid, token, msg, function(irret){});
                                                    }
                                                });
                                            }
                                        });
                                        break outerloop;
                                    }
                                }
                            }
                        }
                        if (!autoReply){
                            res.send('');
                            WxFuns.sendMsgToUserver(unitid, gzopenid, fansopenid, params, function(){});
                        }
                        
                        } else {
                            res.send('');
                            WxFuns.sendMsgToUserver(unitid, gzopenid, fansopenid, params, function(){});
                        }
                    });
                } else if (params.MsgType=='location'){
                    res.send('');
                    WxFuns.sendMsgToUserver(unitid, gzopenid, fansopenid, params, function(){});
                } else if (params.MsgType=='image'){
                    res.send('');
                    WxFuns.getWxToken(gzopenid, function(token){
                        WxFuns.downloadWxFile(gzopenid, 'image', params.MediaId, token, function(key){ 
                            params.PicUrl = 'https://dn-zmec.qbox.me/' + key;
                            params.path = 'https://dn-zmec.qbox.me/' + key;
                            WxFuns.sendMsgToUserver(unitid, gzopenid, fansopenid, params, function(){});
                        });
                    });
                    // WxFuns.sendMsgToUserver(unitid, gzopenid, fansopenid, params, function(){});
                } else if (params.MsgType=='voice'){
                    res.send('');
                    WxFuns.getWxToken(gzopenid, function(token){
                        WxFuns.downloadWxFile(gzopenid, 'voice', params.MediaId, token, function(){ 
                            params.path = 'https://dn-zmec.qbox.me/' + params.MediaId;
                            params.token = token;
                            WxFuns.sendMsgToUserver(unitid, gzopenid, fansopenid, params, function(){});
                        });
                    });
                } else {
                    var xml = '<xml><ToUserName><![CDATA[' + params.FromUserName + ']]></ToUserName><FromUserName><![CDATA[' + params.ToUserName + ']]></FromUserName><CreateTime>' + Math.floor((new Date()).valueOf()/1000) + '</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[你好，我们暂时只能接收文本和图片信息，给你带来的不便，我们深表歉意]]></Content></xml>';
                    res.send(xml);
                }
            });
        });
    });
    
};

}).call(this);
