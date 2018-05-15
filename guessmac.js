(function () {
    "use strict";

    const { exec } = require('child_process');
    const os = require('os');
    const async = require('async');
    const _ = require('underscore');
    const util = require('util');

    const MAC_RE = /\blink\/[^\s]*\s((?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2})\b/;
    const DEFAULT_IFACE_NAME_RE = /\bdev\s+([^\s]+)\b/;

    function shell_escape(str) {
        return str.replace(/\\/g, '\\\\').replace(/'/g, '\\\'');
    }

    module.exports = function (callback) {
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
            },
            (default_iface, cb) => {
                let ifaces = os.networkInterfaces();
                if (default_iface !== null && !_.isUndefined(ifaces[default_iface])) {
                    let addresses = ifaces[default_iface];
                    for (let i = 0; i < addresses.length; i++) {
                        let address = addresses[i];
                        if (address.internal === false && _.isString(address.mac)) {
                            return cb(null, address.mac);
                        }
                    }
                }
                for (let iface_name in ifaces) {
                    let addresses = ifaces[iface_name];
                    for (let i = 0; i < addresses.length; i++) {
                        let address = addresses[i];
                        if (address.internal === false && _.isString(address.mac)) {
                            return cb(null, address.mac);
                        }
                    }
                }
                async.waterfall([
                    icb => {
                        var fallback_cmd = 'ip -o link show | grep -v link\\/loopback',
                            cmd = fallback_cmd;
                        if (default_iface !== null) {
                            cmd = util.format('(ip -o link show dev %s | grep -v link\\/loopback) || (%s)', default_iface, fallback_cmd);
                        }
                        cmd = util.format('sh -c \'%s\'', shell_escape(cmd));
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
    };
}());