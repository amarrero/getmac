(function () {
    "use strict";

    const { exec } = require('child_process');
    const os = require('os');
    const async = require('async');
    const _ = require('underscore');
    const util = require('util');

    const MAC_RE = /\blink\/[^\s]*\s((?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2})\b/;
    const DEFAULT_IFACE_NAME_RE = /\bdev\s+([^\s]+)\b/;

    function shellEscape(str) {
        return str.replace(/\\/g, '\\\\').replace(/'/g, '\\\'');
    }

    function guessDefaultRouteIface(callback) {
        async.waterfall([
            cb => {
                switch (process.platform) {
                    case "linux":
                        exec('ip route list | grep ^default || true', {
                            timeout: 5000
                        }, cb);
                        break;
                    default:
                        cb(null, "", null);
                        break;
                }
            },
            (stdout, _, cb) => {
                var lines = stdout.toString().split('\n');
                for (var i = 0; i < lines.length; i++) {
                    var match = DEFAULT_IFACE_NAME_RE.exec(lines[i]);
                    if (match !== null) {
                        return cb(null, match[1]);
                    }
                }
                return cb(null, null);
            }
        ], callback);
    }

    function guessWiredInterface(callback) {
        for (let ifaceName in os.networkInterfaces()) {
            if (ifaceName.startsWith("eth")) {
                return callback(null, ifaceName);
            }
        }
        callback(null, null);
    }

    function guessMac(guessDefaultFunc, callback) {
        async.waterfall([
            guessDefaultFunc,
            (defaultIface, cb) => {
                let ifaces = os.networkInterfaces();
                if (defaultIface !== null && !_.isUndefined(ifaces[defaultIface])) {
                    let addresses = ifaces[defaultIface];
                    for (let i = 0; i < addresses.length; i++) {
                        let address = addresses[i];
                        if (address.internal === false && _.isString(address.mac)) {
                            return cb(null, address.mac);
                        }
                    }
                }
                for (let ifaceName in ifaces) {
                    let addresses = ifaces[ifaceName];
                    for (let i = 0; i < addresses.length; i++) {
                        let address = addresses[i];
                        if (address.internal === false && _.isString(address.mac)) {
                            return cb(null, address.mac);
                        }
                    }
                }
                async.waterfall([
                    icb => {
                        var fallbackCmd = 'ip -o link show | grep -v link\\/loopback',
                            cmd = fallbackCmd;
                        if (defaultIface !== null) {
                            cmd = util.format('(ip -o link show dev %s | grep -v link\\/loopback) || (%s)', defaultIface, fallbackCmd);
                        }
                        cmd = util.format('sh -c \'%s\'', shellEscape(cmd));
                        icb(null, cmd, {
                            timeout: 5000
                        });
                    },
                    exec,
                    (stdout, _, icb) => {
                        let lines = stdout.toString().split('\n');
                        for (let i = 0; i < lines.length; i++) {
                            let match = MAC_RE.exec(lines[i]);
                            if (match !== null) {
                                return icb(null, match[1]);
                            }
                        }
                        icb(new Error("MAC address not found"));
                    }
                ], cb);
            }
        ], callback);
    }

    module.exports = async.apply(guessMac, guessWiredInterface);
}());