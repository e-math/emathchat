Emathchatserver
===============

What?
-----
A math enabled chat server and client.

How?
----
Emathchatserver is a node.js program that acts as a chat server. A client side
jQuery-plugin is included in `data/js/chat.js`.

Emathchatserver depends on following programs and libraries:
* [Node.js](http://nodejs.org/)
* [jQuery](http://jquery.com/) (both server and client, version 1.x) 
* [socket.io](http://socket.io/)
* [MathQuill](https://github.com/e-math/mathquill)

Who?
----
The tool was developed in EU-funded [E-Math -project](http://emath.eu) by
* Rolf Lindén

and the copyrights are owned by [Four Ferries oy](http://fourferries.fi).

The client side plugin is very loosely based on [TrophyIM](http://code.google.com/p/trophyim/) v.0.03.

License?
--------
The tool (`emathchatserver.js`, `chat.js` and `index.html`) is licensed under
[GNU AGPL](http://www.gnu.org/licenses/agpl-3.0.html).
The tool depends on some publicly available open source components with other licenses:
* [Node.js](http://nodejs.org) ([see the licenses](https://github.com/joyent/node/blob/master/LICENSE))
* [jQuery](http://jquery.com) (MIT-license)
* [socket.io](http://socket.io/) (MIT-license)
* [MathQuill](https://github.com/e-math/mathquill) (GNU LGPL)



Installation
------------

* Copy the files in some directory.
* Install required node.js-modules (jquery must be 1.x version, not 2.x)

```bash
npm install socket.io
npm install jquery@1.8.3
```

Usage
-----
Run the server in the default port (8080) with command:

```bash
nodejs emathchatserver.js
```

You can connect to the server with a www-bwrowser with address `http://yourservername:8080` or
you can use `data/js/chat.js` and connect from some other web page. See the example in `index.html`.

(In some systems and with some node.js versions the command might be `node` instead of `nodejs`.)

To run the server in a custom port, start the server with switch `-p <port>`. For example:

```bash
nodejs emathchatserver.js -p 12345
```

The debugging mode can be activated with switch `-d`:

```bash
nodejs emathchatserver.js -d
```

Authentication and SSL
----
To use authentication and ssl-encryption, change the settings in the beginning of `emathchatserver.js`.

By default the authentication is specific for E-Math coursemanagement.