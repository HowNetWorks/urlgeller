if (process.env.NODE_ENV === "production") {
    require("@google/cloud-debug");
    require("@google/cloud-trace").start();
}

const url = require("url");
const path = require("path");
const moment = require("moment");
const express = require("express");
const exphbs = require("express-handlebars");
const emojiFlags = require("emoji-flags");
const taskQueue = require("./taskqueue");
const store = require("./store");

function fullUrl(req, path) {
    let baseUrl = process.env.BASE_URL;
    return url.resolve(baseUrl, url.resolve(req.baseUrl, path));
}

function mergeAndClean(...objs) {
    const result = {};
    objs.forEach(obj => {
        Object.keys(obj).forEach(key => {
            if (obj[key] !== undefined) {
                result[key] = obj[key];
            } else {
                delete result[key];
            }
        });
    });
    return result;
}

function extractInfo(req) {
    return mergeAndClean({
        ip: req.get("x-appengine-user-ip") || req.ip,
        country: req.get("x-appengine-country"),
        userAgent: req.get("user-agent")
    });
}

function formatTimestamp(ts) {
    return moment(ts).format();
}

const app = express();

// By default the express-handlebars package searches ./views for view templates
// and ./views/layouts for layouts.
app.engine("handlebars", exphbs({defaultLayout: "main"}));
app.set("view engine", "handlebars");

app.use("/assets", express.static(path.join(__dirname, "build")));

app.get("/", (req, res) => {
    res.render("index", {
        styles: ["/assets/common.css"],
        scripts: ["/assets/common.js"]
    });
});

app.get("/new", (req, res) => {
    store.create()
        .then(view => {
            res.redirect("/" + view);
        })
        .catch(err => {
            console.error(err);
            res.sendStatus(500);
        });
});

app.get("/:id", (req, res) => {
    const id = req.params.id;

    store.get(id)
        .then(item => {
            if (!item) {
                return res.sendStatus(404);
            }

            if (!item.isView) {
                return taskQueue.publish("main-topic", {
                    target: id,
                    timestamp: Date.now(),
                    info: extractInfo(req)
                }).then(() => {
                    res.send("This visit has been logged.");
                });
            }

            return store.list(item.other).then(entities => {
                const visits = entities.map(entity => {
                    return mergeAndClean(entity.info, {
                        timestamp: formatTimestamp(entity.timestamp),
                        country: emojiFlags.countryCode(entity.info.country || "-")
                    });
                });

                res.render("visits", {
                    styles: ["/assets/common.css", "/assets/visits.css"],
                    scripts: ["/assets/common.js", "/assets/visits.js"],
                    trapUrl: fullUrl(req, item.other),
                    visits: visits
                });
            });
        })
        .catch(err => {
            console.error(err);
            res.sendStatus(500);
        });
});

const server = app.listen(process.env.PORT || 8080, () => {
    const addr = server.address();
    console.log("Listening on port %s...", addr.port);
});