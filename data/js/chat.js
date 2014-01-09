/***
|Name|Chat|
|Version|4|
|Author|Rolf Lindén (rolind@utu.fi)|
|Type|plugin|
|Requires|MathQuill and modern jQuery.|
|Description|Adds realtime communications and message gateway through NodeJS and Socket.io.|
!!!!!Revisions
<<<
20130906.1500 ''Version 4''
* Added HTTPS encryption.

20130823.0921 ''Version 3''
* Added addressing system to both frontend and backend.
* Added client list to the client.
* Fixed the message gateway for external plugins. The specification definition should now be complete.
20130614.1027 ''Version 2''
* Completely rebuilt to use NodeJS and Websockets.
* Most of the gateway and chat functionality that was available in previous version (1.1.1) was implemented (Gateway not tested / usable yet).
<<<
!!!!!Code
***/
//{{{
    
/** About this code:
 * 
    This program is very loosely based on TrophyIM v.0.03
    released in 2008 by Michael Garvin. TrophyIM was published
    under the MIT licence.
    
    This code is not subject to MIT licence.
    
    Modified for E-Math project (see http://emath.eu)
    by Rolf Lindén 2013.
    
    Copyright: Four Ferries oy
      http://fourferries.fi
    License: GNU AGPL ( http://www.gnu.org/licenses/agpl-3.0.html )
*/

(function ($) {
    { /** EventQueue                        **/
        /** Function: ref
        * Reference function. Allows pointer structures in JavaScript.
        */
        var ref = function(obj) { return function() { return obj; }; }
        
        
        /** Constructor: EventQueue
        * 
        * Creates a new event queue for the given gateway.
        * 
        * @param gateway: jQuery plugin object that can handle 'checkeventqueue' calls.
        * @param fnName: jQuery plugin name for the gateway.
        */
        function EventQueue(gateway, fnName) {
            
            this.gateways = [
                {
                    'obj': gateway,
                    'fnName' : fnName
                }
            ];
            this.attached = new Array();
            this.queue = new Array();
            debug('new EventQueue():', this, gateway, fnName);
            $('html').bind('announce', this, this.handleAnnouncement);
        };
        
        /** Function: addGateway
        * Adds a new gateway for the events.
        * 
        * @param gateway: jQuery object defining the new gateway.
        */
        EventQueue.prototype.addGateway = function(gateway, fnName) {
            debug('EventQueue.addGateway():', gateway, fnName);
            this.gateways.push(
                {
                    'obj': gateway,
                    'fnName' : fnName
                }
            );
        };
        
        /** Function: detach
        * Detaches the given ID from the queue.
        * 
        * @param id: Identifier of the attachable object to be detached.
        */
        EventQueue.prototype.detach = function(id) {
            for (item in this.attached) {
                if (this.attached[item].senderID == id)
                    Array.splice(this.attached, item, 1);
            }
        };
        
        /** Function: handleAnnouncement
        * 
        * Handles the announcement of a new shareable item.
        * 
        * @param event: Announce event. Event should contain EventQueue
        * object as its data.
        * @param announced: Parameter object containing the object ID and it's type.
        */
        EventQueue.prototype.handleAnnouncement = function(event, announced) {
            debug('EventQueue.handleAnnouncement():', event, announced);
            if (!$('#' + announced.senderID).hasClass('reflection')) {
                var attachable = {
                    'id': announced.senderID,
                    'fnName': announced.fnName
                };
                attachable['events'] = $('#' + announced.senderID)[announced.fnName]('attachables');
                refObj = event.data;
                
                // Attach events only once per type.
                var alreadyConnected = false;
                for (var i = 0; i < refObj.attached.length; ++i)
                    if (refObj.attached[i].fnName == attachable.fnName) alreadyConnected = true;
                
                refObj.attached.push(attachable);
                
                if (!alreadyConnected)
                for (item in attachable.events) {
                    $('html').bind(attachable.events[item].eventType, refObj, refObj.push);
                }
                
                for (item in refObj.gateways)
                    refObj.gateways[item].obj[refObj.gateways[item].fnName]('checkattachable');
            }
        };
        
        /** Function: getAttachable
        * 
        * If an ID is given, returns that exact attachable item. If
        * searched item doesn't exist, returns null. If ID is
        * undefined, function lists all attachable objects.
        * 
        * @param id: ID of the attachable object.
        * 
        * @return Depending on the given id, either attachable item,
        *         list of attachable items or null.
        */
        EventQueue.prototype.getAttachable = function(id) {
            
            // No ID was defined, return a list.
            if (typeof(id) === 'undefined') return this.attached;
            
            // Find the given item.
            for (item in this.attached)
                if (this.attached[item].id == id) return this.attached[item];
            
            // No such item exists.
            return null;
        }
        
        /** Function: push
        * 
        * Adds an event and its parameters to the queue.
        * 
        * @param event : Event object to be added to the queue.
        * Event should contain EventQueue object as its data.
        * @param params: Parameters for the events. Should contain at least senderID.
        */
        EventQueue.prototype.push = function(event, params) {
            debug('EventQueue.push():', event, params);
            if (typeof(params.remoteCommand) === 'undefined' || (!params.remoteCommand)) {
                refObj = event.data;
                refObj.queue.push(
                    {
                        'type' : event.type,
                        'params' : params,
                        'timeStamp' : new Date()
                    }
                );
                
                for (item in refObj.gateways)
                    refObj.gateways[item].obj[refObj.gateways[item].fnName]('checkeventqueue');
            }
        };
        
        /** Function: getItem
        * 
        * Returns item at the given index.
        * 
        * @param index: index of the requested item.
        * @return Item at the given index.
        */
        EventQueue.prototype.getItem = function(index) { return this.queue[index]; }
        
        /** Function: getTotalEventCount
        * 
        * Returns the length of the event queue.
        */
        EventQueue.prototype.getTotalEventCount = function() { return this.queue.length; }
    }
    { /** Debug                             **/
        var showDebug = false;

        function debug() {
            if (showDebug) {
                var out = '';
                for (var i = 0; i < arguments.length; ++i) {
                    if ( typeof(arguments[i]) == 'string' ) out += arguments[i];
                    else {
                        try {
                            out += JSON.stringify(arguments[i]);
                        }
                        catch (TypeError) {
                            out += arguments[i];
                        }
                    }
                }
                console.log(out);
            }
        }
    }
    { /** Chat                              **/
        function Chat(params) {
            // Checks if editor's CSS information is already written to document's head.
            if ($('head style#mucchatstyle').length == 0) {
                { /** CSS & glyphs                      **/
                    var sCSS =
                    ".sharedItem{ background-color: #ccf !important; }\
                    .chatframe {\
                        width:100%;\
                        height: 600px;\
                        border: none;\
                    }\
                    .chatInfoBox {\
                        padding-left: 12px;\
                        padding-top: 8px;\
                        clear: both;\
                    }\
                    .privacyBtn {\
                        margin: 2px 0 0 17px !important;\
                        width: 176px;\
                    }\
                    .chat {\
                        background-color:#fff;\
                        padding: 28px 12px 22px 12px;\
                        background-color:#fff;\
                        /*margin: 0px;\*/\
                        /*margin-right: 240px;*/\
                        padding: 8px 12px 22px 12px;\
                        /*border-style: dashed;\
                        border-width: 1px;\
                        border-color: #ccc;*/\
                        resize: vertical;\
                    }\
                    .chatChoice {\
                        color: blue;\
                        text-decoration: underline;\
                        cursor: pointer;\
                    }\
                    div.chatmessage.private b {\
                        color: red;\
                    }\
                    .chatIcon {\
                        width: 15px;\
                        height: 15px;\
                        display: inline-block;\
                        background-image: url(data:image/png;base64,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\
YII=);\
                    }\
                    .emo-angel { background-position: 0px 0px; }\
                    .emo-angry { background-position: -15px -1px; }\
                    .emo-aww { background-position: -30px -1px; }\
                    .emo-blushing { background-position: -45px -1px; }\
                    .emo-confused { background-position: -60px -1px; }\
                    .emo-cool { background-position: -75px -1px; }\
                    .emo-creepy { background-position: -90px -1px; }\
                    .emo-crying { background-position: -105px -1px; }\
                    .emo-cthulhu { background-position: 0px -17px; height: 17px; }\
                    .emo-cute { background-position: -15px -18px; }\
                    .emo-cute-winkling { background-position: -30px -18px; }\
                    .emo-frowning { background-position: -60px -18px; }\
                    .emo-gasping { background-position: -75px -18px; }\
                    .emo-greedy { background-position: -90px -18px; }\
                    .emo-grinning { background-position: -105px -18px; }\
                    .emo-happy { background-position: 0px -34px; }\
                    .emo-happy-smiling { background-position: -15px -34px; }\
                    .emo-heart { background-position: -30px -36px; width: 11px; height: 13px; }\
                    .emo-irritated { background-position: -43px -34px; }\
                    .emo-irritated-2 { background-position: -58px -34px; }\
                    .emo-kissing { background-position: -73px -34px; }\
                    .emo-laughing { background-position: -88px -34px; }\
                    .emo-lips-sealed { background-position: -103px -34px; }\
                    .emo-madness { background-position: 0px -49px; }\
                    .emo-malicious { background-position: -15px -49px; }\
                    .emo-naww { background-position: -30px -49px; }\
                    .emo-pouting { background-position: -45px -49px; }\
                    .emo-shy { background-position: -60px -49px; }\
                    .emo-sick { background-position: -75px -49px; }\
                    .emo-smiling { background-position: -90px -49px; }\
                    .emo-speechless { background-position: -105px -49px; }\
                    .emo-spiteful { background-position: 0px -64px; }\
                    .emo-surprised { background-position: -30px -64px; }\
                    .emo-surprised-2 { background-position: -45px -64px; }\
                    .emo-terrified { background-position: -60px -64px; }\
                    .thumbs-down { background-position: -75px -64px; width: 11px; height: 14px; }\
                    .thumbs-up { background-position: -87px -64px; width: 11px; height: 14px; }\
                    .emo-tired { background-position: -99px -64px; }\
                    .emo-tongue-out-laughing { background-position: 0px -79px; }\
                    .emo-tongue-out { background-position: -15px -79px; }\
                    .emo-unsure { background-position: -75px -79px; }\
                    .emo-unsure-2 { background-position: -90px -79px; }\
                    .emo-winking { background-position: -105px -79px; }\
                    .emo-winking { background-position: 0px -94px; }\
                    .emo-winking-tongue-out { background-position: -15px -94px; }\
                    .geoItemCaption {\
                        width: 12em;\
                        height: 25px;\
                        margin: 1px;\
                        text-align: right;\
                        padding-right: 4px;\
                        padding-top: 4px;\
                        display: inline-block;\
                        background-color: #f8f8f8;\
                        color: #444;\
                        border: solid 1px gray;\
                        vertical-align: top;\
                        border-radius: 2px;\
                    }\
                    .chatBtn {\
                        margin: 2px;\
                        display: inline-block;\
                        padding: 6px 10px 8px 10px;\
                        vertical-align: text-top;\
                        display: inline-block;\
                        *display: inline;\
                        outline: none;\
                        cursor: pointer;\
                        text-align: center;\
                        text-decoration: none;\
                        text-shadow: 0 1px 1px rgba(0,0,0,.3);\
                        -webkit-border-radius: 2px;\
                        border-radius: 2px;\
                        -webkit-box-shadow: 0 1px 2px rgba(0,0,0,.2);\
                        box-shadow: 0 1px 2px rgba(0,0,0,.2);\
                        -webkit-user-select: none;\
                        -moz-user-select: none;\
                        -khtml-user-select: none;\
                        -ms-user-select: none;\
            //          color: #303030;\
                        border: solid 1px #b7b7b7;\
                        background: #fff;\
                        background: -webkit-gradient(linear, left top, left bottom, from(#fff), to(#ededed));\
                        background: -moz-linear-gradient(top,  #fff,  #ededed);\
                        filter:  progid:DXImageTransform.Microsoft.gradient(startColorstr='#ffffff', endColorstr='#ededed');\
                    }\
                    .chatBtn:hover {\
                        text-decoration: none;\
                        background: #ededed;\
                        background: -webkit-gradient(linear, left top, left bottom, from(#fff), to(#dcdcdc));\
                        background: -moz-linear-gradient(top,  #fff,  #dcdcdc);\
                        filter:  progid:DXImageTransform.Microsoft.gradient(startColorstr='#ffffff', endColorstr='#dcdcdc');\
                    }\
                    .chatBtn:active {\
                        position: relative;\
                        top: 1px;\
                        color: #999;\
                        background: -webkit-gradient(linear, left top, left bottom, from(#ededed), to(#fff));\
                        background: -moz-linear-gradient(top,  #ededed,  #fff);\
                        filter:  progid:DXImageTransform.Microsoft.gradient(startColorstr='#ededed', endColorstr='#ffffff');\
                    }\
                    /* green */\
                    .green {\
                        color: #e8f0de;\
                        border: solid 1px #538312;\
                        background: #64991e;\
                        background: -webkit-gradient(linear, left top, left bottom, from(#7db72f), to(#4e7d0e));\
                        background: -moz-linear-gradient(top, #7db72f, #4e7d0e);\
                        filter: progid:DXImageTransform.Microsoft.gradient(startColorstr='#7db72f', endColorstr='#4e7d0e');\
                    }\
                    .green:hover {\
                        background: #538018;\
                        background: -webkit-gradient(linear, left top, left bottom, from(#6b9d28), to(#436b0c));\
                        background: -moz-linear-gradient(top, #6b9d28, #436b0c);\
                        filter: progid:DXImageTransform.Microsoft.gradient(startColorstr='#6b9d28', endColorstr='#436b0c');\
                    }\
                    .green:active {\
                        color: #a9c08c;\
                        background: -webkit-gradient(linear, left top, left bottom, from(#4e7d0e), to(#7db72f));\
                        background: -moz-linear-gradient(top, #4e7d0e, #7db72f);\
                        filter: progid:DXImageTransform.Microsoft.gradient(startColorstr='#4e7d0e', endColorstr='#7db72f');\
                    }\
                    /* white */\
                    .white {\
                        color: #303030;\
                        border: solid 1px #b7b7b7;\
                        background: #fff;\
                        background: -webkit-gradient(linear, left top, left bottom, from(#fff), to(#ededed));\
                        background: -moz-linear-gradient(top,  #fff,  #ededed);\
                        filter:  progid:DXImageTransform.Microsoft.gradient(startColorstr='#ffffff', endColorstr='#ededed');\
                    }\
                    .white:hover {\
                        background: #ededed;\
                        background: -webkit-gradient(linear, left top, left bottom, from(#fff), to(#dcdcdc));\
                        background: -moz-linear-gradient(top,  #fff,  #dcdcdc);\
                        filter:  progid:DXImageTransform.Microsoft.gradient(startColorstr='#ffffff', endColorstr='#dcdcdc');\
                    }\
                    .white:active {\
                        color: #999;\
                        background: -webkit-gradient(linear, left top, left bottom, from(#ededed), to(#fff));\
                        background: -moz-linear-gradient(top,  #ededed,  #fff);\
                        filter:  progid:DXImageTransform.Microsoft.gradient(startColorstr='#ededed', endColorstr='#ffffff');\
                    }\
                    /* red */\
                    .red {\
                        color: #faddde;\
                        border: solid 1px #980c10;\
                        background: #d81b21;\
                        background: -webkit-gradient(linear, left top, left bottom, from(#ed1c24), to(#aa1317));\
                        background: -moz-linear-gradient(top,  #ed1c24,  #aa1317);\
                        filter:  progid:DXImageTransform.Microsoft.gradient(startColorstr='#ed1c24', endColorstr='#aa1317');\
                    }\
                    .red:hover {\
                        background: #b61318;\
                        background: -webkit-gradient(linear, left top, left bottom, from(#c9151b), to(#a11115));\
                        background: -moz-linear-gradient(top,  #c9151b,  #a11115);\
                        filter:  progid:DXImageTransform.Microsoft.gradient(startColorstr='#c9151b', endColorstr='#a11115');\
                    }\
                    .red:active {\
                        color: #de898c;\
                        background: -webkit-gradient(linear, left top, left bottom, from(#aa1317), to(#ed1c24));\
                        background: -moz-linear-gradient(top,  #aa1317,  #ed1c24);\
                        filter:  progid:DXImageTransform.Microsoft.gradient(startColorstr='#aa1317', endColorstr='#ed1c24');\
                    }\
                    /* gray */\
                    .gray {\
                        color: #202020;\
                        border: solid 1px #a7a7a7;\
                        background: #eee;\
                        background: -webkit-gradient(linear, left top, left bottom, from(#eee), to(#dcdcdc));\
                        background: -moz-linear-gradient(top,  #eee,  #dcdcdc);\
                        filter:  progid:DXImageTransform.Microsoft.gradient(startColorstr=#eeeeee, endColorstr=#dcdcdc);\
                    }\
                    .gray:hover {\
                        background: #ededed;\
                        background: -webkit-gradient(linear, left top, left bottom, from(#fff), to(#dcdcdc));\
                        background: -moz-linear-gradient(top,  #fff,  #dcdcdc);\
                        filter:  progid:DXImageTransform.Microsoft.gradient(startColorstr=#ffffff, endColorstr=#dcdcdc);\
                    }\
                    .gray:active {\
                        color: #999;\
                        background: -webkit-gradient(linear, left top, left bottom, from(#ededed), to(#fff));\
                        background: -moz-linear-gradient(top,  #ededed,  #fff);\
                        filter:  progid:DXImageTransform.Microsoft.gradient(startColorstr=#ededed, endColorstr=#ffffff);\
                    }\
                    .container1 {\
                        width: 100%;\
                        height: 40px;\
                    }\
                    .inputContainer {\
                        width: 100%;\
                    }\
                    .geoProperty {\
                        width: 200px;\
                        min-height: 25px;\
                        margin: 1px;\
                        text-align: left;\
                        padding-right: 4px;\
                        padding-left: 4px;\
                        padding-top: 4px;\
                        display: inline-block;\
                        background-color: #fff;\
                        border: solid 1px gray;\
                        vertical-align: top;\
                        border-radius: 2px;\
                    }\
                    .alignRight {\
                        float:right;\
                    }\
                    .alignLeft {\
                        float:left;\
                    }\
                    .NEWcorner { border-radius: 15px 15px 0px 0px; }\
                    .SEcorner { border-radius: 2px 2px 15px 2px; }\
                    .SWcorner { border-radius: 2px 2px 2px 15px; }\
                    .NEcorner { border-radius: 2px 15px 2px 2px; }\
                    .NWcorner { border-radius: 15px 2px 2px 2px; }\
                    .geoProperty .mathquill-rendered-math {\
                        width: 100%;\
                        height: 100%;\
                        border: none;\
                        margin-right: 10px;\
                    }\
                    .geoProperty .mathquill-editable.hasCursor, .geoProperty .mathquill-editable .hasCursor {\
                    -webkit-box-shadow: none;\
                    box-shadow: none;\
                    }\
                    .geoProperty input {\
                        width: 100%;\
                        height: 100%;\
                        border: none;\
                        margin-left: 0px;\
                        margin-top: -2px;\
                        outline: none;\
                        vertical-align: middle;\
                    }\
                    .geoProperty input[type='password'] {\
                        margin-top: -1px;\
                    }\
                    .geoProperty input[type='checkbox'] {\
                        width: 100%;\
                        height: 100%;\
                        border: none;\
                        margin-top: 4px;\
                        min-height: 15px;\
                        text-align: left;\
                        display: block;\
                    }\
                    .disconnectButton {\
                        color: #faddde;\
                        border: solid 1px #980c10;\
                        background: #d81b21;\
                        background: -webkit-gradient(linear, left top, left bottom, from(#ed1c24), to(#aa1317));\
                        background: -moz-linear-gradient(top,  #ed1c24,  #aa1317);\
                        filter:  progid:DXImageTransform.Microsoft.gradient(startColorstr='#ed1c24', endColorstr='#aa1317');\
                    }\
                    .disconnectButton:hover {\
                        background: #b61318;\
                        background: -webkit-gradient(linear, left top, left bottom, from(#c9151b), to(#a11115));\
                        background: -moz-linear-gradient(top,  #c9151b,  #a11115);\
                        filter:  progid:DXImageTransform.Microsoft.gradient(startColorstr='#c9151b', endColorstr='#a11115');\
                    }\
                    .disconnectButton:active {\
                        color: #de898c;\
                        background: -webkit-gradient(linear, left top, left bottom, from(#aa1317), to(#ed1c24));\
                        background: -moz-linear-gradient(top,  #aa1317,  #ed1c24);\
                        filter:  progid:DXImageTransform.Microsoft.gradient(startColorstr='#aa1317', endColorstr='#ed1c24');\
                    }\
                    .connectButton {\
                        color: #e8f0de;\
                        border: solid 1px #538312;\
                        background: #64991e;\
                        background: -webkit-gradient(linear, left top, left bottom, from(#7db72f), to(#4e7d0e));\
                        background: -moz-linear-gradient(top, #7db72f, #4e7d0e);\
                        filter: progid:DXImageTransform.Microsoft.gradient(startColorstr='#7db72f', endColorstr='#4e7d0e');\
                    }\
                    .connectButton:hover {\
                        background: #538018;\
                        background: -webkit-gradient(linear, left top, left bottom, from(#6b9d28), to(#436b0c));\
                        background: -moz-linear-gradient(top, #6b9d28, #436b0c);\
                        filter: progid:DXImageTransform.Microsoft.gradient(startColorstr='#6b9d28', endColorstr='#436b0c');\
                    }\
                    .connectButton:active {\
                        color: #a9c08c;\
                        background: -webkit-gradient(linear, left top, left bottom, from(#4e7d0e), to(#7db72f));\
                        background: -moz-linear-gradient(top, #4e7d0e, #7db72f);\
                        filter: progid:DXImageTransform.Microsoft.gradient(startColorstr='#4e7d0e', endColorstr='#7db72f');\
                    }\
                    div.chatlogin {\
                        margin-right:auto;\
                        width: 392px;\
                        background-color:#fff;\
                    }\
                    .client-list:empty {\
                        display: none;\
                    }\
                    .client-list {\
                        width: 150px;\
                        background-color:#fff;\
                        float: right;\
                        clear:right;\
                        margin-top: 0px;\
                        padding: 8px 12px 22px 12px;\
                        border-style: dashed;\
                        border-width: 1px;\
                        border-color: #ccc;\
                        resize: vertical;\
                        overflow-x: none;\
                        overflow-y: auto;\
                        list-style-type: none;\
                    }\
                    .attachableItems {\
                        width: 150px;\
                        background-color:#fff;\
                        float: right;\
                        clear:right;\
                        margin-top: 8px;\
                        padding: 28px 12px 22px 12px;\
                        border-style: dashed;\
                        border-width: 1px;\
                        border-color: #ccc;\
                        overflow-x: none;\
                        overflow-y: auto;\
                        list-style-type: none;\
                    }\
                    .attachableItems:empty {\
                        display:none;\
                    }\
                    .hidden { display: none; }\
                    .client-list li:nth-child(odd) {\
                        background-color:#f2f2f2;\
                        -webkit-transition: background-color 0.5s ease;\
                        -moz-transition: background-color 0.5s ease;\
                        -o-transition: background-color 0.5s ease;\
                        transition: background-color 0.5s ease;\
                    }\
                    .client-list li.selected {\
                        background-color:highlight !important;\
                        border-radius: 2px;\
                        color: highlightText !important;\
                        -webkit-transition: all 0.5s ease;\
                        -moz-transition: all 0.5s ease;\
                        -o-transition: all 0.5s ease;\
                        transition: all 0.5s ease;\
                    }\
                    .client-list li:nth-child(even) {\
                        background-color:#fafafa;\
                        -webkit-transition: background-color 0.5s ease;\
                        -moz-transition: background-color 0.5s ease;\
                        -o-transition: background-color 0.5s ease;\
                        transition: background-color 0.5s ease;\
                    }\
                    .attachableItem, .client-list li {\
                        margin: 2px;\
                        min-height: 26px;\
                        line-height: 26px;\
                        padding-left: 10px;\
                        text-overflow: ellipsis;\
                        -webkit-user-select: none;\
                        -moz-user-select: none;\
                        -khtml-user-select: none;\
                        -ms-user-select: none;\
                    }\
                    .client-list li[contenteditable] {\
                        background-color: #cec;\
                    }\
                    .attachableItem:nth-child(odd) { background-color:#f2f2f2; }\
                    .attachableItem:nth-child(even) { background-color:#fafafa; }\
                    div.chattab_av { /*Available*/\
                        border-radius: 15px 15px 0px 0px;\
                        color: #000000;\
                    }\
                    div.chattab_aw { /*Away*/\
                        border-radius: 15px 15px 0px 0px;\
                        color: #a00000;\
                    }\
                    div.chattab_off { /*Offline*/\
                        border-radius: 15px 15px 0px 0px;\
                        color: #808080;\
                        font-style: italic;\
                    }\
                    .client-list li.available { /*Available*/\
                        color: #000000;\
                    }\
                    .client-list li.away { /*Away*/\
                        color: #a00000;\
                    }\
                    .client-list li.offline { /*Offline*/\
                        color: #808080;\
                        font-style: italic;\
                    }\
                    div.chattabID {\
                        display: none;\
                    }\
                    div.chattabname {\
                        display: inline-block;\
                        line-height:16px;\
                        margin-bottom: 6px;\
                    }\
                    input.statusButton {\
                        width: 100%;\
                        margin: 0px;\
                    }\
                    input.sendButton {\
                        width: 100%;\
                        margin: 0px;\
                        display: none;\
                    }\
                    .chat:empty { display:none; }\
                    div.chattab {\
                        clear: none;\
                        float: left;\
                        cursor: pointer;\
                        padding: 6px 10px 0px 10px;\
                        vertical-align: text-top;\
                        display: inline-block;\
                        *display: inline;\
                        margin: 4px;\
                        outline: none;\
                        cursor: pointer;\
                        text-align: center;\
                        text-decoration: none;\
                        text-shadow: 0 1px 1px rgba(0,0,0,.3);\
                        -webkit-box-shadow: 0 1px 2px rgba(0,0,0,.2);\
                        box-shadow: 0 1px 2px rgba(0,0,0,.2);\
                        -webkit-border-radius: 15px 15px 0px 0px;\
                        border-radius: 2px;\
                    }\
                    div.chattab:first-child { margin-left: 0; }\
                    div.chattab:last-child { margin-right: 0; }\
                    div.chattab_f { /*Foreground*/\
                        color: #303030;\
                        border: solid 1px #b7b7b7;\
                        background: #fff;\
                        background: -webkit-gradient(linear, left top, left bottom, from(#fff), to(#ededed));\
                        background: -moz-linear-gradient(top,  #fff,  #ededed);\
                        filter:  progid:DXImageTransform.Microsoft.gradient(startColorstr='#ffffff', endColorstr='#ededed');\
                    }\
                    div.chattab_f:hover {\
                        background: #ededed;\
                        background: -webkit-gradient(linear, left top, left bottom, from(#fff), to(#dcdcdc));\
                        background: -moz-linear-gradient(top,  #fff,  #dcdcdc);\
                        filter:  progid:DXImageTransform.Microsoft.gradient(startColorstr='#ffffff', endColorstr='#dcdcdc');\
                    }\
                    div.chattab_f:active {\
                        color: #999;\
                        background: -webkit-gradient(linear, left top, left bottom, from(#ededed), to(#fff));\
                        background: -moz-linear-gradient(top,  #ededed,  #fff);\
                        filter:  progid:DXImageTransform.Microsoft.gradient(startColorstr='#ededed', endColorstr='#ffffff');\
                    }\
                    div.chattab_b { /* Background */\
                        color: #888;\
                        border: 1px white solid;\
                    }\
                    div.chattab_a { /* Alert (background/has new message) */\
                        border: 1px red solid;\
                    }\
                    .highlight{\
                        box-shadow: 0px 0px 60px #fff;\
                        -webkit-transition: all 0.5s ease;\
                        -moz-transition: all 0.5s ease;\
                        -o-transition: all 0.5s ease;\
                        transition: all 0.5s ease;\
                    }\
                    span.math {\
                        background-color: red;\
                        min-width: 10px;\
                        display: inline-block;\
                    }\
                    .inline {\
                        display: inline-block;\
                    }\
                    div.chatbox { /* Collection of chat messages */\
                        min-height: 100px;\
                        height: 600px;\
                        resize: vertical;\
                        width: calc(100% - 195px);\
                        background-color: #fff;\
                        float:left;\
                        overflow: auto;\
                        border: 1px #ccc solid;\
                        /*-webkit-box-shadow: inset 5px 5px 20px #eee;\
                        box-shadow:        inset 5px 5px 20px #eee;*/\
                    }\
                    div.chatinput {\
                        min-height: 20px;\
                        background-color: rgb(200, 200, 255)!important;\
                    }\
                    div.chatmessage:nth-child(odd) { background-color:rgba(242, 242, 242, 128); }\
                    div.chatmessage:nth-child(even) { background-color:rgba(250, 250, 250, 128); }\
                    div.chatmessage { /*Each individual chat message*/\
                        white-space: pre-wrap;\
                        padding:4px;\
                    }\
                    .chat .history { color: gray; }\
                    div.chatmessage:nth-child(odd) { background-color:rgba(242, 242, 242, 128); }\
                    div.chatmessage:nth-child(even) { background-color:rgba(250, 250, 250, 128); }";
                }
                
                $('head').append('<style id="mucchatstyle" type="text/css">' + sCSS + '</style>');
            }
            
            // Variables that are related to parsing LaTeX strings.
            this.startLatex = '$';//'[latex]';
            this.endLatex = '$';//'[/latex]';
            this.translations = {
                'and': 'and',
                'everyone': 'everyone'
            }
            this.latexRegExp = new RegExp(this.escapeRegExp(this.startLatex) + '(.*?)' + this.escapeRegExp(this.endLatex), 'ig');
            this.UI = "\
                <div class='chatbox'>\
                    <div class='inputContainer'>\
                        <div class='chatinput chatmessage' contenteditable=\"true\"></div>\
                        <input type='button' class='chatBtn sendButton' value='Send'/>\
                    </div>\
                </div>\
                <ul class='client-list" + (params.showClientList ? '' : ' hidden') + "'></ul>\
                <ul class='attachableItems'></ul>\
                <div><input type=\"button\" value=\"Private\" class=\"privacyBtn chatBtn\" /></div>";
                
            // Parameters as chat variables.
            this.params = params;
            for (var item in params)
                this[item] = params[item];
            
            this.courseID = this.courseID.toUpperCase(); // Make course id case-insensitive.
            this.username = this.username.toUpperCase(); // Make course id case-insensitive.
            
            this.place.empty().append(this.UI).addClass('chat').find('.privacyBtn').click(function() { $(this).toggleClass('red') });
            
            // Variables that are related to component sharing.
            // These are internal and should not be overridden by params.
            this.boxnum = $('.chat').length - 1;
            this.sysMsgCount = 0;
            this.currentEventIndex = 0;
            this.reflectionCount = 0;
            this.shared = new Array();
            
            // Initialize the event queue.
            if (typeof(document.eventQueue) == 'undefined')
                document.eventQueue = new EventQueue(this.place, 'chat');
            else
                document.eventQueue.addGateway(this.place, 'chat');
            
            // Socket.io connection.
            debug('Initializing connection...');
            if (typeof(io) == 'undefined') throw(new Error('Object "io" for Socket.IO is not defined. The device cannot load scripts from the server -- check the internet connection.'));
            this.socket = io.connect(params.URL, { 'force new connection': true}/*, secure: true, host: params.host, port: 50100}*/);
            this.addSocketHandlers();
            debug('Connection created and socket handlers declared.');
            
            // Key bindings and click handlers.
            this.place.find('input.sendButton').click( this.sendButtonClick );
            this.addKeyBinds();
        }
        
        Chat.prototype.sendButtonClick  = function() {
            // Fetch the message from the input box.
            var chatBox = this.place.find('.chatbox');
            
            // Create a hidden temp div and copy user's input into it.
            chatBox.find('.chatinput').after('<div class="tempdiv" style="display:none;"></div>');
            chatBox.find('.tempdiv').html( chatBox.find('.chatinput').html() );
            
            // Find the corresponding MathQuill Elements.
            var elements = chatBox.find('.chatinput span.mathquill-rendered-math');
            var tempElements = chatBox.find('.tempdiv span.mathquill-rendered-math');
            
            // Replace MathQuill elements with their escaped versions.
            for (var i = 0; i < elements.length; i++) {
                if (elements.eq(i).hasClass('mathquill-rendered-math')) {
                    var latexStr = elements.eq(i).mathquill('latex') || "";
                    tempElements.eq(i).replaceWith(this.startLatex + latexStr + this.endLatex);
                }
            }
            
            // Collect the message and remove the temp div.
            var messageStr = chatBox.find('.tempdiv').html();
            chatBox.find('.tempdiv').remove();
            
            this.sendMessage(
                this.getSelectedUsers(),
                messageStr,
                'chat',
                !this.place.find('input.privacyBtn').hasClass('red')
            );
            
            // Clear the input box.
            this.place.find('.chatinput').html('');
        }
        
        /** Function: closeShared
        * 
        * Function closes shared objects defined by parameter id.
        * Parameter id can be either undefined, string or an array
        * of strings. This causes the function to close either
        * all, one or given set of items among the shared items,
        * respectively.
        */
        Chat.prototype.closeShared = function(id) {
            
            // Determine the shared items to be closed.
            if (typeof(id) === 'undefined') var items = this.shared;
            else {
                // id needs to be an array of IDs.
                if (Array.isArray(id)) var idArr = id;
                else idArr = new Array(id);
                
                // Make the data indexable.
                var sharedIDs = new Array();
                for (var i in this.shared) sharedIDs[i] = this.shared[i].id;
                // Select shared objects matching the given IDs.
                var items = new Array();
                for (var i in idArr) {
                    var item = sharedIDs.indexOf(idArr[i]);
                    if (item >= 0) items.push(this.shared[item]);
                    /* else idArr[i] is not shared and should be handled. */
                }
            }
            
            // Process the selected variables.
            var attachableItems = this.place.find('.attachableItems');
            for (var item in items) {
                
                if (items[item].reflection) {
                    
                    // Destroy the reflection assuming the shared object is inside a dialog.
                    var sharedObj = $('#' + items[item].id).dialog('destroy').remove();
                } else {
                    attachableItems.find('li[relatedid="' + items[item].id + '"]').removeClass('sharedItem');
                }
            
                var index = sharedIDs.indexOf(items[item].id);
                this.shared.splice(index, 1);
            }

            return items;
        }
        
        /** Function: escapeRegExp
        * 
        * Returns the escaped version of the original string st.
        * it can be used inside a regular expression.
        * 
        * @param str The original string.
        * @return    The escaped string.
        **/
        Chat.prototype.escapeRegExp = function(str) {
            return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|\"\']/g, "\\$&");
        }
        
        /** Function fillAttachableItems
        * 
        * Fills the list of attachable items in the chat client UI,
        * and adds proper events (click, mouseenter, mouseleave) 
        * to it.
        */
        Chat.prototype.fillAttachableItems = function() {
            parent = this;
            debug('Chat.fillAttachableItems()');
            var attachableItems = this.place.find('.attachableItems').empty();
            for (item in this.attachable) {
                attachableItems
                    .append('<li id="attachable-' + this.boxnum + '-' + item + '" relatedid="' + this.attachable[item].id + '" class="attachableItem">' + this.attachable[item].id + ' (' + this.attachable[item].fnName + ')</li>');
                attachableItems
                    .find('#attachable-' + this.boxnum + '-' + item)
                        .click(
                            {
                                'itemID': this.attachable[item].id,
                                'senderID' : 'attachable-' + this.boxnum + '-' + item
                            },
                            function(e) { parent.shareItem(e); }
                        )
                        .mouseenter(this.attachable[item].id, function (event) { $('#' + event.data).addClass('highlight'); })
                        .mouseleave(this.attachable[item].id, function (event) { $('#' + event.data).removeClass('highlight'); });
            }
        }
        /** Function: htmlDecode
        *
        *  Converts HTML encoded string back to ASCII form.
        *  Only rudimentary symbols are converted.
        */
        Chat.prototype.htmlDecode = function(input) {
            var entities= {
                "&amp;": "&",
                "&lt;": "<",
                "&gt;": ">",
                "&apos;": "'",
                "&quot;": '"'
            };

            for (var prop in entities) {
                if (entities.hasOwnProperty(prop)) {
                    input = input.replace(new RegExp(prop, "g"), entities[prop]);
                }
            }
            return input;
        }
        
        Chat.prototype.getUserName = function() {
            return(this.username);
        }
        
        Chat.prototype.getNick = function(resource) {
            if ( resource.search(/^[0-9]{32}$/) >= 0 ) // Seems legit
                return( this.place.find('.client-list li[resourceid="' + resource + '"]').eq(0).text() );
            else return resource; // The given parameter is not a valid resource id. Pass the parameter through.
        }
        
        Chat.prototype.getNicks = function(addressObj) {
            
            var nameStr = '';
            var itemCounter = 0;
            for (var item in addressObj) {
                
                if ( (item != this.courseID) || (Object.keys(addressObj).length > 1) ) {
                    
                    nameStr += item
                    if (addressObj[item].length > 0) nameStr += ': ';
                }
                
                // Go through the users in the current room.
                for (var i = 0; i < addressObj[item].length; ++i) {
                    
                    nameStr += this.getNick(addressObj[item][i]);
                    if (i < addressObj[item].length - 2) nameStr += ', ';
                    else if (i == addressObj[item].length - 2) nameStr += ' ' + this.translations['and'] + ' ';
                }
                if  (addressObj[item].length == 0) nameStr += this.translations['everyone'];
                
                ++itemCounter;
                if ((Object.keys(addressObj).length > 1) && (itemCounter < Object.keys(addressObj).length)) nameStr += '; ';
            }
            
            return(nameStr);
        }
        
        Chat.prototype.sortList = function(list, clickf) {
        
            var items = list.find('li').get();
            items.sort(
                function(a,b) {
                    var keyA = $(a).text().toLowerCase();
                    var keyB = $(b).text().toLowerCase();

                    if (keyA < keyB) return -1;
                    if (keyA > keyB) return 1;
                    return 0;
                }
            );
            
            var ul = list.empty();
            $.each(
                items,
                function(i, li) {
                    ul.append(li);
                }
            );
            
            var items = ul.find('li');
            for (var i = 0; i < items.length; ++i) {
                items.eq(i).bind('click.chat', clickf);
            }
        }


        Chat.prototype.selectUser = function(item) {
            $(this).toggleClass('selected');
        }
        
        Chat.prototype.makeNameEditable  = function() {
            this.place.find('.client-list li[resourceid="' + this.resourceID + '"]').attr('contenteditable', true)
            .focus(
                this,
                function(e) {
                    var parent = e.data;
                    var self = parent.place.find('.client-list li[resourceid="' + parent.resourceID + '"]');
                    
                    self.attr('original', self.text());
                    self.text('');
                }
             )
            .blur(
                this,
                function(e) {
                    var parent = e.data;
                    var self = parent.place.find('.client-list li[resourceid="' + parent.resourceID + '"]');
                    
                    self.text(self.attr('original'));
                }
             )
            .keydown(
                this,
                function(e) {
                    if (e.keyCode == 13) {
                        var parent = e.data;
                        var self = parent.place.find('.client-list li[resourceid="' + parent.resourceID + '"]');
                        var candidate = (self.text()).trim();
                        self.text(candidate);
                        
                        var target = {}; target[parent.courseID] = new Array();
                        parent.sendMessage(target, '/nick ' + candidate, 'chat', false);
                        self.blur();
                    }
                }
            ).unbind('click.chat');
        }
        
        Chat.prototype.setClientList = function(list) {
            
            var clientList = this.place.find('.client-list');
            for (var i = 0; i < list.length; ++i) {
                clientList.append('<li username="' + list[i].username + '" resourceid="' + list[i].resourceID + '">' + list[i].nick + '</li>');
            }
            
            this.sortList(clientList, this.selectUser);
            this.makeNameEditable();
        }
        
        Chat.prototype.onMessage = function(data) {
            var from = data.from;
            var to = data.to;
            var type = data.type;

            if (typeof(data.message) !== 'undefined') {
                if (data.type == 'chat')  this.addMessage(data);
                else if (data.type == 'new-user') {
                    if ( (from[this.courseID].length == 1) && (from[this.courseID][0] == 'Server') ) {
                        debug('onMessage(): New user', data);
                        
                        var clientList = this.place.find('.client-list');
                        
                        // Add the new user, if the person doesn't exist.
                        if ( clientList.find('li[resourceid="' + data.message.resourceID + '"]').length == 0 ) {
                            clientList.append('<li username="' + data.message.username + '" resourceid="' + data.message.resourceID + '">' + data.message.nick + '</li>');
                            
                            clientList.find('li[resourceid="' + data.message.resourceID + '"]').bind(
                                'click.chat',
                                function() {
                                    $(this).toggleClass('selected');
                                }
                            );
                            this.sortList(clientList, this.selectUser);
                            this.makeNameEditable();
                        }
                        
                    }
                }
                else if (data.type == 'remove-user') {
                    if ( (from[this.courseID].length == 1) && (from[this.courseID][0] == 'Server') ) {
                        debug('onMessage(): Remove user', data);
                        
                        var clientList = this.place.find('.client-list');
                        clientList.find('li[resourceid="' + data.message.resourceID + '"]').remove();
                    }
                }
                else if (data.type == 'update-userinfo') {
                    if ( (from[this.courseID].length == 1) && (from[this.courseID][0] == 'Server') ) {
                        debug('onMessage(): Update user info', data);
                        
                        var clientList = this.place.find('.client-list');
                        clientList.find('li[resourceid="' + data.message.resourceID + '"]').text(data.message.nick);
                        
                        // TODO Handle status updates appropriately.
                        //jQuery('.client-list li[resourceid="' + data.message.resourceID + '"]').text(data.message.status);
                        
                        this.sortList(clientList, this.selectUser);
                        this.makeNameEditable();
                    }
                }
                else if (data.type == 'client-list') {
                    debug('onMessage(): Client list', data);
                    if ( (from[this.courseID].length == 1) && (from[this.courseID][0] == 'Server') ) {
                        this.setClientList(data.message);
                    }
                }
                else if (data.type == 'share') { // Share request
                    
                    var msgObj = data.message;
                    var parent = this;
                    
                    this.addMessage(
                        {
                            'message': '<i>' + this.getNicks(from) + ' wants to share a ' + msgObj.fnName + ' with you.</i>',
                            'type' : 'shareRequest',
                            'id' : msgObj.id,
                            'choices' : [
                                {
                                    'action' : function() {
                                        $('body')
                                            .append('<div id="reflection-' + parent.reflectionCount + '" class="reflection" remoteid="' + msgObj.id + '"/>')
                                            .find('#reflection-' + parent.reflectionCount)[msgObj.fnName]()
                                                .dialog(
                                                    {
                                                        width: 'auto',
                                                        title: 'Reflection from ' + parent.getNicks(from),
                                                        close: function(event, ui) {
                                                            parent.closeShared( $(this).attr('id') );
                                                            var response = {
                                                                'id' : msgObj.id,
                                                                'reflection' : false,
                                                                'responseid' : msgObj.msgid,
                                                                'response': false
                                                            }
                                                            parent.sendMessage(from, response, 'response');
                                                        }
                                                    }
                                                );
                                        
                                        // Allow message passing to begin.
                                        parent.shared.push(
                                            {
                                                'id': 'reflection-' + parent.reflectionCount,
                                                'reflection' : true,
                                                'remoteid' : msgObj.id, 
                                                'fnName' : msgObj.fnName,
                                                'sharedWith' : from,
                                                'startTime' : new Date()
                                            }
                                        );
                                        ++parent.reflectionCount;
                                        
                                        // Same code as in the sending part of the app.
                                        
                                        // Dialog close quits sharing.
                                        
                                        var response = {
                                            'id' : msgObj.id,
                                            'reflection' : false,
                                            'responseid' : msgObj.msgid,
                                            'response': true
                                        }
                                        parent.sendMessage(from, response, 'response');
                                    },
                                    'name' : "Accept"
                                },
                                {
                                    'action' : function() {
                                        var response = {
                                            'id' : msgObj.id,
                                            'reflection' : false,
                                            'responseid' : msgObj.msgid,
                                            'response': false
                                        }
                                        parent.sendMessage(from, response, 'response');
                                    },
                                    'name' : 'Decline'
                                }
                            ],
                            'from' : this.getUserAddress()
                        }
                    );
                    
                }
                else if (data.type == 'response') { // Sharing response.
                    debug('Chat.onMessage(), response:', this, data);
                    var msgObj = data.message;
                    var current = $('#' + msgObj.responseid);
                    
                    if (msgObj.response === true) {
                        current.append(' Accepted.');//.append('<p />').append('-- insert cancel link here --');
                        
                        // Allow message passing to begin.
                        this.shared.push(
                            {
                                'id': msgObj.id,
                                'responseid' : msgObj.responseid,
                                'reflection' : false,
                                'sharedWith' : from,
                                'startTime' : new Date()
                            }
                        );
                        this.handleEvents();
                        $('li[relatedid="' + msgObj.id + '"]').addClass('sharedItem');
                        // TODO Create a 'Cancel' button or a similar control to quit sharing.
                        
                    } else {
                        if (msgObj.reflection === true) {
                            for (var item in this.shared)
                                if (this.shared[item].remoteid === msgObj.id) {
                                    var objID = this.shared[item].id;
                                    break;
                                }
                        } else var objID = msgObj.id;
                        
                        var closed = this.closeShared(objID);
                        
                        if (!closed.reflection) $('#' + msgObj.responseid).remove();
                    }
                }
                else if (data.type == 'event') { // Sharing event.
                    var msgObj = data.message;
                    msgObj.params.remoteCommand = true;
                    
                    var i = 0;
                    var shareIndex = -1;
                    while ((i < this.shared.length) && (shareIndex < 0)) {
                        if (
                            (
                                msgObj.reflection &&
                                (this.shared[i].id == msgObj.params.senderID)
                            ) ||
                            (
                                (!msgObj.reflection) &&
                                (this.shared[i].remoteid == msgObj.params.senderID)
                            )
                        ) shareIndex = i;
                        
                        ++i;
                    }
                    
                    if (shareIndex >= 0) {
                        var sharedElement = this.shared[shareIndex];
                        var targetObj = null;
                        if (sharedElement.reflection) targetObj = $('div.reflection[remoteid="' + msgObj.params.senderID + '"]');
                        else targetObj = $('#' + msgObj.params.senderID);
                    
                        targetObj[msgObj.fnName](msgObj.action, msgObj.params);
                    }
                }
                else if (data.type == 'external') { // External system message.
                    var msgObj = data.message;
                    msgObj.from = from;
                    msgObj.to = to;
                    this.place.trigger('chat_external_message', [msgObj]);
                }
            }
        }
        
        Chat.prototype.getSelectedUsers = function() {
            var selected = this.place.find('.client-list li.selected');
            var target = new Object();
            
            target[this.courseID] = new Array();
            for (var i = 0; i < selected.length; ++i) target[this.courseID].push(selected.eq(i).attr('resourceid'));
            
            return (target);
        }
        
        /** Function: shareItem
        * 
        * Initiates sharing protocol aiming to share individual
        * plugin components of a client.
        * 
        * @param event: Event passed to the function by JavaScript.
        */
        Chat.prototype.shareItem = function(event) {
            debug('Chat.shareItem():', event, this);
            var selectedUsers = this.getSelectedUsers();
            var itemID = event.data.itemID;
            var senderID = event.data.senderID;
            var senderItem = this.place.find('#' + senderID);
            
            if (senderItem.hasClass('sharedItem')) { // Re-click quits sharing.
                var closed = this.closeShared(senderItem.attr('relatedid'));
                
                // Send close message.
                var response = {
                    'id' : itemID /* Item related to this message. */,
                    'responseid' : null /* No response expected */,
                    'reflection' : true,
                    'response': false /* Close connection */
                }
                senderItem.removeClass('sharedItem');
                this.place.find('#' + closed[0].responseid).remove();
                this.sendMessage(selectedUsers, response, 'response');
                
            } else { // First click starts sharing.
                
                var itemData = document.eventQueue.getAttachable(itemID);
                itemData.msgid = 'systemMessage-' + this.sysMsgCount;
                
                this.addMessage(
                    {
                        'message': '<i>Sent request to share ' + itemID + ' with ' + this.getNicks(selectedUsers) + '..</i>',
                        'type' : 'shareStatus',
                        'id' : itemID,
                        'choices' : [/* Should contain 'Cancel' option. */],
                        'from' : this.getUserAddress()
                    }
                );
                this.sendMessage(selectedUsers, itemData, 'share');
            }
        }
        
        /** Function: replaceURLs
        * 
        * Replaces the URLs from a string with a corresponding
        * link.
        * 
        * @param msg: The message to be processed.
        * @return String with URLs replaced with corresponding
        * links.
        */
        Chat.prototype.replaceURLs = function(msg) {
            var temp =  msg.replace(/((?:http|ftp|https):\/\/[\w\-_]+(?:\.[\w\-_]+)+(?:[\w\-\.,@?^=%&amp;:/~\+#]*[\w\-\@?^=%&amp;/~\+#])?)/g, '<a href="$1" target="_blank">$1</a>'); // HTTP, HTTPS, FTP.
            temp = temp.replace(/(spotify:track:[a-zA-Z0-9]{22})/g, '<a href="$1" class="spotifyLink">$1</a>'); // Spotify.
            return(temp);
        }
        
        /** Function: replaceSmileys
        * 
        * Replaces the smileys from a string with their icon / 
        * glyph / image counterparts.
        * 
        * @param msg: The message to be processed.
        * @return String with smileys replaced with corresponding tags.
        */
        Chat.prototype.replaceSmileys = function(msg) {
            
            /* rolind 18042013.1549:
            * 
            * It would be nice to use "<3" for the heart, but it
            * would mess with math notations such as "1<3", and
            * adding smileys after mathquill() would cause
            * unpleasant side effects.
            */
            
            msg = msg
                .replace(/:saint:|:angel:/g, '<span class="chatIcon emo-angel" />')
                .replace(/>\(/g, '<span class="chatIcon emo-angry" />')
                .replace(/\^\^/g, '<span class="chatIcon emo-aww" />')
                .replace(/:\./g, '<span class="chatIcon emo-blushing" />')
                .replace(/:s([^a-zA-Z0-9])|:s^|:\?/g, '<span class="chatIcon emo-confused" />$1')
                .replace(/B\)|8-\)/g, '<span class="chatIcon emo-cool" />')
                .replace(/:evilgrin:|:creepy:/g, '<span class="chatIcon emo-creepy" />')
                .replace(/:cry:/g, '<span class="chatIcon emo-crying" />')
                .replace(/=3([^a-zA-Z0-9])|=3$|:3([^a-zA-Z0-9])|:3$/g, '<span class="chatIcon emo-cute" />$1')
                .replace(/;3/g, '<span class="chatIcon emo-cute-winkling" />')
                .replace(/=\(|:\(|:sad:|:frown:/g, '<span class="chatIcon emo-frowning" />')
                .replace(/:o([^a-zA-Z0-9])|:o$/ig, '<span class="chatIcon emo-gasping" />$1')
                .replace(/\$\)/ig, '<span class="chatIcon emo-greedy" />')
                .replace(/:grin:|:virn:/g, '<span class="chatIcon emo-grinning" />')
                .replace(/\^\^/g, '<span class="chatIcon emo-happy-smiling" />')
                .replace(/:heart:/g, '<span class="chatIcon emo-heart" />')
                .replace(/x\./ig, '<span class="chatIcon emo-irritated" />')
                .replace(/x\|/ig, '<span class="chatIcon emo-irritated-2" />')
                .replace(/:\*/g, '<span class="chatIcon emo-kissing" />')
                .replace(/:D([^a-zA-Z0-9])|:D$|:laugh:|:naur:/ig, '<span class="chatIcon emo-laughing" />$1')
                .replace(/:x([^a-zA-Z0-9])|:x$/ig, '<span class="chatIcon emo-lips-sealed" />$1')
                .replace(/>:D/g, '<span class="chatIcon emo-malicious" />')
                .replace(/:C([^a-zA-Z0-9])|:C$/ig, '<span class="chatIcon emo-pouting" />$1')
                .replace(/\^\.\^/g, '<span class="chatIcon emo-shy" />')
                .replace(/x\\|x\//ig, '<span class="chatIcon emo-sick" />')
                .replace(/:\)|=\)|:happy:/g, '<span class="chatIcon emo-smiling" />')
                .replace(/\._\.|:\|/ig, '<span class="chatIcon emo-speechless" />')
                .replace(/O_o/g, '<span class="chatIcon emo-surprised" />')
                .replace(/o_O/g, '<span class="chatIcon emo-surprised-2" />')
                .replace(/>:\)/g, '<span class="chatIcon emo-spiteful" />')
                .replace(/=o/ig, '<span class="chatIcon emo-terrified" />')
                .replace(/:y:|:yes:|:agree:|:kyllä:|:good:|:k:/g, '<span class="chatIcon thumbs-up" />')
                .replace(/:n:|:no:|:disagree:|:bad:|:e:|:ei:/g, '<span class="chatIcon emo-thumbs-down" />')
                .replace(/\|\)|-\.-/g, '<span class="chatIcon emo-tired" />')
                .replace(/:p([^a-zA-Z0-9])|:p$/ig, '<span class="chatIcon emo-tongue-out" />$1')
                .replace(/xp([^a-zA-Z0-9])/ig, '<span class="chatIcon emo-tongue-out-laughing" />$1')
                .replace(/(?!:\/\/):\//g, '<span class="chatIcon emo-unsure" />') // Otherwise messes with URLs: "http://..".
                .replace(/(?!:\\\\):\\/g, '<span class="chatIcon emo-unsure-2" />')
                .replace(/;\)|:wink:/g, '<span class="chatIcon emo-winking" />')
                .replace(/;D/g, '<span class="chatIcon emo-winking-grinning" />')
                .replace(/;P/ig, '<span class="chatIcon emo-winking-tongue-out" />');
                            
            return(msg);
        },
        
        /** Function: handleAttachable
        * 
        * Updates the 'attachable' array inside the chat plugin.
        */
        Chat.prototype.handleAttachable = function() {
            if (this.showAttachable) {
                this.attachable = document.eventQueue.getAttachable();
                this.fillAttachableItems();
            }
        }
        
        /** Function: handleEvents
        * 
        * Called uppon new events. The function decides if the
        * events should be handled now or later, and passes the
        * events through the chat gateway if needed.
        */
        Chat.prototype.handleEvents = function() {
            
            if (this.shared.length > 0) {
                var eventCount = document.eventQueue.getTotalEventCount();
                for (var i = this.currentEventIndex; i < eventCount; ++i) {
                    var currentItem = document.eventQueue.getItem(i);
                    
                    var j = 0;
                    var shareIndex = -1;
                    while ((j < this.shared.length) && (shareIndex < 0)) {
                        if (this.shared[j].id == currentItem.params.senderID) shareIndex = j;
                        ++j;
                    }
                    
                    if (shareIndex >= 0) {
                        // Current event belongs to a shared object.
                        var sharedElement = this.shared[shareIndex];
                        if (currentItem.timeStamp > sharedElement.startTime) {
                            // Event has occured after the sharing started.
                            
                            var targetID = null;
                            if (sharedElement.reflection) targetID = sharedElement.remoteid;
                            else targetID = currentItem.params.senderID;
                            
                            var attachable = document.eventQueue.getAttachable(sharedElement.id);
                            
                            var j = 0;
                            var action = null;
                            while ((j < attachable.events.length) && (action === null)) {
                                if (attachable.events[j].eventType == currentItem.type) action = attachable.events[j].action;
                            }
                            
                            var msgData = currentItem;
                            delete msgData.type;
                            msgData.action = action;
                            msgData.params.senderID = targetID;
                            msgData.fnName = attachable.fnName;
                            msgData.reflection = sharedElement.reflection;
                            
                            // TODO Here should be decided, who gets this message.
                            
                            this.sendMessage(sharedElement.sharedWith, msgData, 'event');
                        }
                    }
                }
                this.currentEventIndex = eventCount;
            }
        }
        
        Chat.prototype.strFill = function(s, fill, len) {
            var temp = s;
            for (var i = 0; i < len - temp.length; i += fill.length)
                temp = fill + temp;
                
            return(temp);
        }
        
        Chat.prototype.getUserAddress = function() {
            var address = {};
            address[this.courseID] = [ this.resourceID ];
            return( address );
        }
        
        Chat.prototype.addMessage = function(data) {
            
            if (data.type === 'chat') {
                var msg = data.message;
                msg = this.htmlDecode(msg)
                    .replace(/<\s*br[/\s]*>/ig, "\n")   // Preserve <br> tags.
                    .replace(/(<([^>]+)>)/ig,"")        // Remove all other html tags.
                    .replace(/\n\n/ig, "\n")            // Remove excess newlines.
                    .replace(/\n/ig, "<br />");         // Restore <br> tags but none of their inner contents.
                    
                // Replace all Latex strings with MathQuill spans.
                msg = msg.replace(this.latexRegExp, '<span class="math">$1</span>');
                msg = this.replaceURLs(msg);
                
                msg = this.replaceSmileys(msg);
                
                var dateStr = this.strFill('' + data.timeStamp.getHours(), '0', 2) + '.' + this.strFill('' + data.timeStamp.getMinutes(), '0', 2);
                var targetStr = ((typeof(data.to) !== 'undefined') && (data.to[this.courseID].length > 0) ? ' &rarr; ' + this.getNicks(data.to) : '');
                var chatBox = this.place.find('.chatbox');
                
                chatBox
                    .find('div.inputContainer')
                        .before(
                            '<div class="chatmessage' +
                            (typeof(data.history) !== 'undefined' ? ' history' : '') +
                            (data.public === false ? ' private' : '') + '">' +
                            //'from="' + this.escapeRegExp(JSON.stringify(data.from)) + '">' +
                            '<b>(' + dateStr + ') ' + data.nick + targetStr + ':</b> ' + msg + '</div>'
                        );
                
                chatBox
                    .find('div.inputContainer')
                        .parents('.chatbox')
                    .find('div.chatmessage span.math')
                        .mathquill()
                        .removeClass('math');
                        
                // Scroll the chat box to the bottom.
                chatBox.animate({ scrollTop: chatBox[0].scrollHeight}, 500);
            }
            else {
                var msg = data;
                var chatBox = this.place.find('.chatbox');
                var msgID = this.sysMsgCount++;
                
                chatBox
                    .find('div.inputContainer')
                        .before('<div id="systemMessage-' + msgID + '" type="' + msg.type + '" class="systemMessage chatmessage"></div')
                var sysMsg = chatBox.find('#systemMessage-' + msgID).append(msg.message);
            
                if (msg.choices.length > 0) {
                    var choiceArr = this.place.find('.choiceBar');
                    var choiceBar = $('<div id="shareChoiceBar-' + choiceArr.length + '" class="choiceBar"></div>');
                    
                    for (item in msg.choices) {
                        choiceBar.append('<span id="shareChoice-' + choiceArr.length + '-' + item + '" class="chatChoice">' + msg.choices[item].name + '</span> ');
                        choiceBar.find('#shareChoice-' + choiceArr.length + '-' + item).click(
                            {
                                choiceBar: choiceBar,
                                msg : msg,
                                item : item
                            },
                            function(event) {
                                var choiceBar = event.data.choiceBar;
                                var msg = event.data.msg;
                                var item = event.data.item;
                                msg.choices[item].action();
                                choiceBar.parent().remove();
                            }
                        );
                    }
                    sysMsg.append('<p />').append(choiceBar);
                }
            }
        }
        
        Chat.prototype.sendMessage = function(to, data, type, public) {
            var msgObj = {
                from: this.getUserAddress(),
                to: to,
                type: type,
                timeStamp: new Date() + '',
                message: data,
                public: ( (typeof(public) === 'undefined') || (public != true) ? false : true)
            };
            debug('Sent (message): ', msgObj);
            this.socket.emit(
                'message',
                msgObj
            );
        }
        
        Chat.prototype.addSocketHandlers = function () {
            var parent = this;
            $(window).unload( function() { parent.disconnect(); } );
            this.socket.on(
                'authorize',
                function (data) {
                    parent.socket.emit(
                        'authorize-reply',
                        {
                            username: parent.username,
                            password: parent.password,
                            courseID: parent.courseID,
                            resourceID: parent.resourceID
                        }
                    );
                    debug('Sent credentials.');
                }
            );
            this.socket.on(
                'message',
                function(data) {
                    debug('Received: ', data);
                    data.timeStamp = new Date(data.timeStamp);
                    parent.onMessage(data);
                }
            );
            this.socket.on(
                'authorization-failed',
                function(data) {
                    debug('Authorization failed: ', data);
                }
            );
            this.socket.on(
                'authorization-success',
                function(data) {
                    debug('Authorization success');
                    parent.socket.emit('join', parent.courseID);
                }
            );
            this.socket.on(
                'disconnect',
                function(data) {
                    debug('Disconnected from the chat server.');
                }
            );
        }
        
        Chat.prototype.disconnect = function() {
            this.socket.disconnect();
        }
        
        Chat.prototype.addKeyBinds = function() {
            
            // Enter key press.
            this.place.find('.chatinput').keydown(
            this,
            function(e) {
                var parent = e.data;
                if (e.keyCode == 13 && !e.shiftKey) {
                    // prevent default behavior
                    e.preventDefault();
                    parent.sendButtonClick();
                } 
            });
            
            // Math mode edits.
            this.place.find('.chatinput').keyup(
                this,
                function(e) {
                    var parent = e.data;
                    var originalContent = parent.place.find('.chatinput').html();
                    var currentContent = originalContent;
                    
                    var caretPos = currentContent.search(parent.latexRegExp);
                    if (caretPos == -1) caretPos = currentContent.search(new RegExp(parent.escapeRegExp(parent.startLatex)));
                    
                    if (caretPos > -1) {
                        
                        var elements = parent.place.find(".chatinput span.mathquill-rendered-math");
                        var latexStr = new Array(elements.length);
                        
                        for (var i = 0; i < elements.length; i++) {
                            if (elements.eq(i).hasClass('mathquill-rendered-math')) {
                                latexStr[i] = elements.eq(i).mathquill('latex') || "";
                                elements.eq(i).replaceWith(parent.startLatex + latexStr[i] + parent.endLatex);
                            }
                        }
                        var currentContent = parent.place.find(".chatinput").html();
                        
                        currentContent = currentContent
                            .replace(parent.latexRegExp, '<span class="math">$1</span>')
                            .replace(new RegExp(parent.escapeRegExp(parent.startLatex)), '<span class="math"></span>')
                            .trim() + " "; 
                        if (currentContent !== originalContent) {
                            var elements = parent.place.find(".chatinput").html(currentContent).find('.math');
                            for (var i = 0; i < elements.length; i++) {
                                elements.eq(i).mathquill('editable');
                            }
                            elements.eq(elements.length - 1).click();
                            elements.removeClass('math');
                                    
                            var elements = parent.place.find(".chatinput span.mathquill-rendered-math");
                            for (var i = 0; i < elements.length; i++) {
                                if (elements.eq(i).hasClass('mathquill-rendered-math')) {
                                    var latexStrStored = elements.eq(i).mathquill('latex') || "";
                                }
                            }
                        }
                    }
                }
            );
        }
    }
    { /** jQuery Plugin interface           **/
        var methods = {
            'init' : function(params) {
                debug('Chat init:', params);
                var resourceID = '';
                for(var i = 0; i < 32; ++i) resourceID += Math.random() * 10 | 0;
                
                params = $.extend( {
                    'username'       : null,
                    'password'       : null,
                    'courseID'       : null,
                    'port'           : 80,
                    'hidden'         : false,
                    'showAttachable' : false,
                    'showClientList' : false,
                    'resourceID'     : resourceID
                }, params);
                
                return this.each( function() {
                    var chat = new Chat( $.extend({ 'place' : $(this) }, params) );
                    $(this).data('chat', chat);
                    $(this).data('params', params);
                    
                });
            },
            'send' : function(params) {
                params = $.extend( {
                    'to' : getSelectedUsers(),
                    'message' : '=^.^=',
                    'type' : 'chat'
                }, params);
                
                return this.each( function() {
                    $(this).data('chat').sendMessage(params);
                });
            },
            'checkeventqueue' : function(params) {
                return this.each( function() {
                    $(this).data('chat').handleEvents();
                });
            },
            'checkattachable' : function(params) {
                return this.each( function() {
                    $(this).data('chat').handleAttachable();
                });
            },
            'disconnect' : function(params) {
                var parent = $(this);
                return parent.each( function() {
                    $(this).data('chat').disconnect();
                });
            }
        }
        
        $.fn.chat = function( method ) {
             
            if ( methods[method] ) {
                return methods[method].apply( this, Array.prototype.slice.call( arguments, 1 ));
            } else if ( typeof(method) === 'object' || ! method ) {
                return methods.init.apply( this, arguments );
            } else {
                $.error( 'Method ' +  method + ' does not exist on jQuery.chat' );
                return false;
            }    
        }
    }
})(jQuery)
//}}}
//{{{

// TiddlyWiki macro

if (typeof config == 'undefined') {
    var config = new Object();
    config.macros = new Object();
}

config.macros.chat = {
    /******************************
    * Show chat
    ******************************/
    handler: function (place, macroName, params, wikifier, paramString, tiddler)
    {
        // Server connection settings. Change these to your server and port.
        var serverHost = 'http://localhost';
        var serverPort = '8080';
        
        var chatdiv = '{{chat{\n}}}';
        wikify(chatdiv, place, null, tiddler);
        
        if (jQuery('head script[src='+serverhost + ':' + serverPort+'"/socket.io/socket.io.js"]').length == 0) {
            var jPlace = jQuery(place);
            
            jPlace.append('Connecting to the chat server...');
            jQuery('head').append('<script type="text/javascript" src='+serverhost + ':' + serverPort+'"/socket.io/socket.io.js" charset="UTF-8"></script>');
            
            var timerID = setInterval(
                function() {
                    if (typeof(io) != 'undefined') {
                        clearInterval(timerID);
                        jPlace.empty().chat(
                            {
                                place : jPlace,
                                username : config.options.txtUserName,
                                password : config.options.txtUserKey,
                                courseID : Emathbook.options.pages[0].courseid,
                                URL : serverhost + ':' + serverPort,
                                showClientList : true,
                                showAttachable : false
                            }
                        );
                        
                        jPlace.before('<span class="red chatBtn" id="closeChat">' + EbookDictionary.localize('close') + '</span>');
                        jQuery('#closeChat').click(function() {
                            jPlace.chat('disconnect');
                            Emathbook.closePageTwo();
                        });
                        jPlace.before('<h1>Chat</h1>');
                        jPlace.after('<div class="chatInfoBox">Change nick: <code>/nick Name</code><br /><code>$</code> enters the math mode.<br />Links are created automatically when identified.</div>');
                        
                        var closeTimerID = setInterval(
                            function() {
                                
                                if (jPlace.css('display') == 'none') {
                                    clearInterval(closeTimerID);
                                    jPlace.chat('disconnect');
                                }
                            },
                            2000
                        );
                    }
                },
                100
            );
            
        }
    }
}

//}}}
