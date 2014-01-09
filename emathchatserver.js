/*********************************************************
 * emathchatserver.js
 * Created by: E-Math -project ( http://emath.eu )
 * Rolf Lindén
 * 2013
 * v.1.0
 * Copyright: Four Ferries oy
 *   http://fourferries.fi
 * License: GNU AGPL ( http://www.gnu.org/licenses/agpl-3.0.html )
 ********************************************************/

// Default parameters.
// Listen to this port by default
var port = 8080;
// Debugging off by default
var showDebug = false;
// Use this url for user authentication. If empty (of false), don't authenticate.
var authenticationUrl = '';
// Change these to use ssl (https).
var usessl = false;
// var certfile = '/etc/pki/tls/certs/your.own.crt';
// var keyfile = '/etc/pki/tls/private/your.own.key';

function debug() {
    if (showDebug) {
        var out = '';
        for (var i = 0; i < arguments.length; ++i) {
            if ( typeof(arguments[i]) == 'string' ) out += ' ' + arguments[i];
            else out += ' ' + arguments[i];
        }
        console.log(out);
    }
}

{// Handle command-line arguments.
    if (process.argv.length >= 3) {
        
        var i = 2;
        while (i < process.argv.length) {
            if (process.argv[i].search(/-?-p(|ort)/) >= 0) {
                var temp = parseInt(process.argv[i + 1]);
                if (!isNaN(temp)) {
                    port = temp;
                    ++i;
                }
                else console.error('Invalid port: "' + process.argv[i + 1] + '"');
            }
            else if (process.argv[i].search(/-?-d(|ebug)/) >= 0) {
                showDebug = true;
            }
            ++i;
        }
    }
}

process.on('uncaughtException', function (err) {
    console.error('SERIOUS PROBLEM: Caught exception: ' + err + '\n' + err.stack);
});

var fs = require('fs')
  , path = require('path')
  , $ = require('jquery');
if (usessl){
      var options = {
            cert: fs.readFileSync(certfile),
            key: fs.readFileSync(keyfile)
        }
      , app = require('https').createServer(options, handler);
} else {
    var app = require('http').createServer(handler);
}
var io = require('socket.io').listen(app, { log: showDebug, secure: true });

// Connection
debug('Starting on port ' + port + '...');
app.listen(port);
io.sockets.on('connection', onConnect);
debug('Started!');
mainMenu();

// Initialize internal variables.
var userArr = new Object()
  , userArchiveArr = new Object()
  , RIDasSID = new Object()
  , roomArr = new Object()
  , showHistoryLength = 10
  , versionData = {
        major: 3,
        minor: 1
    }
  , reservedWords = [
        'break','case','catch','continue','debugger','default','delete','do',
        'else','finally','for','function','if','in','instanceof','new','return',
        'switch','this','throw','try','typeof','var','void','while','with',
        'class','enum','export','extends','import','super','implements',
        'interface','let','package','private','protected','public','static',
        'yield','constructor','prototype', 'Server'
    ];

// File handler.
function handler(request, response) {
    
    debug('request starting...');
    
    var filePath = __dirname + request.url;
    if (request.url === '/') filePath = __dirname + '/index.html';
    
    debug('Requested file: "' + filePath + '"');
    
    var extname = path.extname(filePath).toLowerCase();
    var contentType = 'text/html';
    switch (extname) {
        case '.js':
            contentType = 'text/javascript';
            break;
        case '.css':
            contentType = 'text/css';
            break;
    }
    
    fs.exists(filePath, function(exists) {
    
        if (exists) {
            fs.readFile(filePath, function(error, content) {
                if (error) {
                    response.writeHead(500);
                    response.end();
                }
                else {
                    response.writeHead(200, { 'Content-Type': contentType });
                    response.end(content, 'utf-8');
                }
            });
        }
        else {
            response.writeHead(404);
            response.end();
        }
    });
}

function writeToFile(fileName, s) {
    fs.writeFile(fileName, s, 'utf8', function(err) {
        if(error) {
            console.log(error);
        } else {
            console.log('The file ' + fileName + ' was saved.');
        }
    }); 
}

function readFromFile(fileName, callback) {
    fs.readFile(fileName, 'utf8', callback);
}

function onConnect(socket) {
    debug('onConnect()');
    
    // TODO Collect quatitative data  on connecting entities
    // (i.e. IPs and connection counts) to detect anomalities in data to prevent attacks.
    
    socket.on('authorize-reply', function(data) { onAuthorizeReply(data, socket); });
    socket.on('disconnect', function(data) { onDisconnect(data, socket) });
    socket.emit('authorize', null);
    debug('Sent authorize request to the client...');
}

function onDisconnect(data, socket) {
    debug('Disconnect notification...', socket.id, data)
    if (typeof(userArr[socket.id]) !== 'undefined') {
        debug('Disconnect notification from ' + userArr[socket.id].username + ' (' + socket.id + ').')
        
        // Remove user from all of the rooms.
        var rooms = userArr[socket.id].rooms;
        for (var item in rooms) roomArr[rooms[item]].leave(socket.id);
        
        // Delete the user.
        userArr[socket.id].logouts.push(new Date());
        archiveUser(userArr[socket.id]);
        delete userArr[socket.id];
    }
}

function archiveUser(user) {
    if (
        (typeof(user) !== 'undefined') &&
        (typeof(user.username) !== 'undefined')   
    ) {
        userArchiveArr[user.username] = user;
        delete userArchiveArr[user.username].socket;
        delete userArchiveArr[user.username].resourceID;
        userArchiveArr[user.username].rooms = new Array();
        return true;
    } else return false;
}

function onMessage(data, socket) {
    if (typeof(data.message) === 'string')
        data.message = data.message
            .replace(/<\s*br[/\s]*>/ig, "\n")   // Preserve <br> tags.
            .replace(/(<([^>]+)>)/ig,"")        // Remove all other html tags.
            .replace(/\n\n/ig, "\n")            // One, please.
            .replace(/\n/ig, "<br />");         // Restore <br> tags but none of their possible attributes.
    
    // TODO Confirm sender to match 'from' attribute in the message data.
    
    for (var item in data.to) {
        if (typeof(roomArr[item]) !== 'undefined')
            roomArr[item].onMessage(data, socket);
    }
}

function onJoin(roomName, socket) {
    debug('onJoin(): ', roomName);
    if ( typeof(roomArr[roomName]) === 'undefined' ) { // Room doesn't exist.

        // Create it.
        roomArr[roomName] = new Room( { name: roomName });
    }
    
    roomArr[roomName].join(socket.id);
}

function onVersion(data, socket) {
    socket.emit('version-response', versionData);
}

function onAuthorizeReply(data, socket) {
    if (!authenticationUrl) {
        debug('onAuthorizeReply(): ', JSON.stringify(data));
        onAuthorizeResult('OK', null, null, data, socket);
        return true;
    } else {
        debug('onAuthorizeReply(): ', JSON.stringify(data));
        $.post(
            authenticationUrl,
            {
                'type': '12',
                'username': data.username,
                'userkey': data.password,
                'courseid': data.courseID
            },
            function (dataObj, textStatus, jqXHR) { onAuthorizeResult(dataObj, textStatus, jqXHR, data, socket); }
        );
        return true;
    }
}

function onAuthorizeResult(dataObj, textStatus, jqXHR, data, socket) {
    debug('onAuthorizeResult()');
    if (dataObj === 'OK') { // Seems legit..
        debug('Got OK, adding messaging handling connections...');

        // Remove what we don't want to store.
        delete data.password;
        
        debug('Session ID for ' + data.username + ': ' + socket.id);
        
        // Add the user to the list.
        userArr[socket.id] = new User(data, socket);
        
        if (typeof(RIDasSID[userArr[socket.id].resourceID]) === 'undefined') {
            RIDasSID[userArr[socket.id].resourceID] = socket.id;
        
            // Authorized us the ability send messages and join rooms.
            socket.on('message', function(data2) { onMessage(data2, socket) });
            socket.on('join', function(data2) { onJoin(data2, socket) });
            socket.on('version', function(data2) { onVersion(data2, socket) });
        
            // Pass on the happy news.
            socket.emit('authorization-success', null);
        } else { // Authorization failed. Notify and disconnect.
            debug('Authorization failed due to RID collision (very unlikely), disconnecting...');
            socket.emit('authorization-failed', {cause: "Resource ID collision. Try to reconnect, maybe try lottery, too."});
            socket.disconnect();
        }
    } else { // Authorization failed. Notify and disconnect.
        debug('Authorization failed, disconnecting...');
        socket.emit('authorization-failed', dataObj);
        socket.disconnect();
    }
}

// Find a nick corresponding to the resource ID in 'element'
function RIDasNick(element, index, array) {
    return ( userArr[RIDasSID[element]].nick );
}

{ // Classes
    { // Room class
        function Room(params) {
            this.type = 'Room';
            this.name = params.name;
            this.msgArr = new Array();
            this.users = new Array();
            debug('Room ' + this.name + ' created.');
        }
        
        Room.prototype.getNick = function(resource) {
            if ( resource.search(/^[0-9]{32}$/) >= 0 ) {// Seems legit
                return( RIDasNick(resource) );
            } else return(resource); // The given parameter is not a valid resource id. Pass the parameter through.
        }
        
        Room.prototype.toString = function() {
            return(
                "[Object Room]\n\
                \tname: " + this.name + "\n\
                \tmsgArr: " + this.msgArr + "\n\
                \tusers: " + this.users + "\n"
            );
        }
        
        Room.prototype.join = function(sessionID) {
            
            // Add the user to the room.
            this.users.push(sessionID);
            
            { // Update the user list.
                var from = {}; from[this.name] = ['Server'];
                var userData = userArr[sessionID].publicCopy();
                for (var item in this.users) {
                    
                    var to = {}; to[this.name] = [userArr[this.users[item]].resourceID];
                    
                    if (this.users[item] != sessionID) {
                        userArr[this.users[item]].socket.emit(
                            'message',
                            {
                                type: 'new-user',
                                from: from,
                                to: to,
                                nick: 'Server',
                                timeStamp: new Date(),
                                message: userData
                            }
                        );
                    }
                    else {
                        userArr[ sessionID ].socket.emit(
                            'message',
                            {
                                type: 'client-list',
                                from: from,
                                to: to,
                                nick: 'Server',
                                timeStamp: new Date(),
                                message: this.getClientList()
                            }
                        );
                    }
                }
                
                debug('Room ' + this.name + ': ' + userArr[sessionID].username + ' (session: ' + sessionID + '; resource: ' + userArr[sessionID].resourceID + ') joined.');
            }
            { // Send recent message history to the new user.
                // Fill the message history from the room's message history.
                var i = this.msgArr.length - 1;
                var historyIndices = new Array();
                while ( (i >= 0) && (historyIndices.length < showHistoryLength) ) {
                    if (
                        (this.msgArr[i].to[this.name].length == 0) || // The message is for everyone in the room.
                        (
                            (this.msgArr[i].type === 'chat') && // or the message is a public chat message.
                            (
                                (typeof(this.msgArr[i].public) !== 'undefined') &&
                                (this.msgArr[i].public != false)
                            )
                        )
                    ) historyIndices.push(i);
                    --i;
                }
                
                for (var i = historyIndices.length - 1; i >= 0; --i) {
                    var current = $.extend(true, {},this.msgArr[historyIndices[i]]);
                    current.history = true;
                    userArr[sessionID].socket.emit('message', current);
                }
            }
        }
        
        Room.prototype.getClientList = function() {
            var list = new Array();
            for (var item in this.users) list.push( userArr[ this.users[item] ].publicCopy() );
            return(list);
        }
        
        Room.prototype.leave = function(sessionID) {
            debug('Room "' + this.name + '": ' + userArr[sessionID].nick + ' (' + sessionID + ') is leaving...');
            
            var from = {}; from[this.name] = ['Server'];
            
            for (var item in this.users) {
                var to = {}; to[this.name] = [userArr[this.users[item]].resourceID];
                userArr[this.users[item]].socket.emit(
                    'message',
                    {
                        type: 'chat',
                        from: from,
                        to: to,
                        nick: 'Server',
                        timeStamp: new Date(),
                        message: userArr[sessionID].nick + ' left the room.'
                    }
                );
            }
            
            // Remove the user from the user list.
            this.users.splice(this.users.indexOf(sessionID), 1);
            
            var userData = userArr[sessionID].publicCopy();
            var from = {}; from[this.name] = ['Server'];
            for (var item in this.users) {
                var to = {}; to[this.name] = [userArr[this.users[item]].resourceID];
                userArr[this.users[item]].socket.emit(
                    'message',
                    {
                        type: 'remove-user',
                        from: from,
                        to: to,
                        nick: 'Server',
                        timeStamp: new Date(),
                        message: userData
                    }
                );
            }
        }
        
        Room.prototype.isAvailable = function(candidate) {
            
            if (candidate.trim() == '') return(false); // Can't be empty or look like empty.
            if (candidate.search(/^( |_|[a-zåäöüëéèñ!]|[A-ZÅÄÖÜËÉÈÑ]|[Ѐ-ӿ]|[\u0391-\u03a1]|[\u03a4-\u03d6]|[0-9])+$/) < 0) return(false); // Can only contain alpha-numeric, greek and cyrillic letters, spaces and underscores, with few local additions.
            if (candidate.search(/^[0-9]{32}$/) >= 0) return(false); // May not be a valid resource ID.
            if (reservedWords.indexOf(candidate) >= 0) return(false); // Cannot contain reserved words from Javascript or this server, just in case.
            
            // Cannot be in use by others.
            for (var item in this.users) {
                
                if (userArr[this.users[item]].username == candidate) return(false);
                if (userArr[this.users[item]].nick == candidate) return(false);
            }
            
            // Otherwise were cool with it.
            return(true);
        }
        
        Room.prototype.onMessage = function(data, socket) {
            // TODO Limit the amount of senders and targets to reasonable boundaries.
            
            if ((typeof(data.message) == 'string') && (data.message.substr(0, 1) === '/')) { // The user sent a control command.
                var from = {}; from[this.name] = ['Server'];
                var to = {}; to[this.name] = [userArr[socket.id].resourceID];
                if (data.message.substr(0, 6) === '/nick ') {
                    var candidate = data.message.substr(6).trim();
                    if ( this.isAvailable(candidate) ) {
                        userArr[socket.id].nick = candidate;
                        
                        var userData = userArr[socket.id].publicCopy();
                        var from = {}; from[this.name] = ['Server'];
                        for (var item in this.users) {
                            
                            userArr[this.users[item]].socket.emit(
                                'message',
                                {
                                    type: 'update-userinfo',
                                    from: from,
                                    to: to,
                                    nick: 'Server',
                                    timeStamp: new Date(),
                                    message: userData
                                }
                            );
                        }
                        
                        socket.emit(
                            'message',
                            {
                                type: 'chat',
                                from: from,
                                to: to,
                                nick: 'Server',
                                timeStamp: new Date(),
                                message: '<i>Your name is now "' + userArr[socket.id].nick + '"</i>'
                            }
                        );
                        //archiveUser(userArr[socket.id]);
                    } else {
                        
                        socket.emit(
                            'message',
                            {
                                type: 'chat',
                                from: from,
                                to: to,
                                nick: 'Server',
                                timeStamp: new Date(),
                                message: '<i>Denied.</i>'
                            }
                        );
                    }
                }
                else if (data.message.substr(0, 8) === '/status ') {
                    userArr[socket.id].status = data.message.substr(8);
                    
                    var userData = userArr[sessionID].publicCopy();
                    var from = {}; from[this.name] = ['Server'];
                    for (var item in this.users) {
                        
                        var to = {}; to[this.name] = [userArr[this.users[item]].resourceID];
                        userArr[this.users[item]].socket.emit(
                            'message',
                            {
                                type: 'update-userinfo',
                                from: from,
                                to: to,
                                nick: 'Server',
                                timeStamp: new Date(),
                                message: userData
                            }
                        );
                    }
                    
                    socket.emit(
                        'message',
                        {
                            type: 'chat',
                            from: from,
                            to: to,
                            nick: 'Server',
                            timeStamp: new Date(),
                            message: '<i>Your status is now "' + userArr[socket.id].status + '"</i>'
                        }
                    );
                }
            }
            else { // Regular chat message.
                data.nick = userArr[socket.id].nick;
                if ((typeof(data.type) !== 'undefined') && (data.type == 'chat')) {
                    
                    // Store non-command chat messages to the history.
                    var msgCopy = $.extend(true, [], data);
                    this.msgArr.push(msgCopy);
                    
                    // This loop should be very shallow, usually only one member on both object and array levels.
                    for (var room in this.msgArr[this.msgArr.length - 1].from)
                        this.msgArr[this.msgArr.length - 1].from[room] = this.msgArr[this.msgArr.length - 1].from[room].map(RIDasNick);
                    
                    // This loop should by average be dependant only on the amount of users in the room, but in the worst case this can be porportional to the amount of users that have visited the server.
                    for (var room in this.msgArr[this.msgArr.length - 1].to)
                        this.msgArr[this.msgArr.length - 1].to[room] = this.msgArr[this.msgArr.length - 1].to[room].map(RIDasNick);
                }
                
                // If the list is empty, select all users in the room, otherwise select the users with corresponding resource IDs.
                var room = this;
                var target = ( data.public || data.to[this.name].length == 0 ? this.users : this.users.filter(function (element, index, array) { return (data.to[room.name].indexOf(userArr[element].resourceID) >= 0) }) );
                
                // Send the message to the targets.
                for (var item in target)
                    userArr[target[item]].socket.emit('message', data);
                
                if (
                    (data.type === 'chat') &&
                    (target.indexOf(socket.id) === -1)
                )
                    socket.emit('message', data); // I hear what I say.
            }
        }
    }
    { // User class
        function User(params, socket) {
            if (typeof(userArchiveArr[params.username]) !== 'undefined') {
                debug('Found archived user ' + params.username + '.');
                
                for (var item in userArchiveArr[params.username])
                    this[item] = userArchiveArr[params.username][item];
            } else {
                debug('Didn\'t find archived user ' + params.username + '.');
                this.username = params.username;
                this.nick = params.username;
                this.status = '';
                this.logins = new Array();
                this.logouts = new Array();
            }
            this.type = 'User';
            this.logins.push(new Date());
            this.resourceID = params.resourceID; // Resource ID is session-based.
            this.socket = socket;
            this.courseID = params.courseID;
            this.rooms = new Array();
            this.rooms.push(params.courseID);
        }
        
        User.prototype.publicCopy = function() {
            var copy = new Object();
            copy.username = new String(this.username);
            copy.nick = new String(this.nick);
            copy.resourceID = new String(this.resourceID);
            copy.status = new String(this.status);
            return(copy);
        }
        
        User.prototype.toString = function() {
            return(
                "[Object User]\n\
                \tusername: " + this.username + "\n\
                \tnick: " + this.nick + "\n\
                \tresourceID: " + this.resourceID + "\n\
                \tstatus: " + this.status + "\n\
                \tlogins: " + this.logins + "\n\
                \tlogouts: " + this.logouts + "\n\
                \tsocket: " + this.socket + "\n\
                \tcourseID: " + this.courseID + "\n\
                \trooms: " + this.rooms + "\n"
            );
        }
    }
    { // Menu system
        function mainMenu() {
            ask(
            '\nMain menu:\n' +
            '  1: List existing rooms.\n' +
            '  2: List connected users.\n' +
            '  3: Command console.\n' +
            '  q: Quit server.\n' +
            '> ',
            /[123q]/i,
            function(input) {
                if (input == '1') listRooms();
                else if (input == '2') listOnlineUsers();
                else if (input == '3') {
                    console.log('Command console. Type \'q\' to quit.');
                    runCommand();
                }
                else if (input == 'q') process.exit(0);
            });
        }

        function listRooms() {
            var itemCount = 0;
            for (var item in roomArr) {
                ++itemCount;
                console.log(itemCount + ': ' + roomArr[item].name + '\n');
            }
            if (itemCount == 0) console.log('No rooms exist.');
            mainMenu();
        }
        
        function listOnlineUsers() {
            var itemCount = 0;
            for (var item in userArr) {
                ++itemCount;
                console.log(itemCount + ': ' + userArr[item].username + '(resourceID: ' + userArr[item].resourceID + ')\n');
            }
            if (itemCount == 0) console.log('No online users exist.');
            mainMenu();
        }
        
        function runCommand() {
            ask(
            '> ',
            /.+/,
            function(input) {
                if (input.toLowerCase() === 'q') mainMenu();
                else {
                    try {
                        eval('console.log(JSON.stringify(' + input + '))');
                    }
                    catch(error) {
                        console.error(error.stack);
                    }
                    runCommand();
                }
            });
        }
        
        function ask(question, format, callback) {
            var stdin = process.stdin, stdout = process.stdout;
            
            stdin.resume();
            stdout.write(question);
            
            stdin.once(
                'data',
                function(data) {
                    data = data.toString().trim();
                    
                    if (format.test(data)) {
                        callback(data);
                    }
                    else {
                        stdout.write("It should match: " + format + "\n");
                        ask(question, format, callback);
                    }
                }
            );
        }
    }
}
