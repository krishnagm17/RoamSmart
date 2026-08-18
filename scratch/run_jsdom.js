const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const fs = require('fs');

const bundle = fs.readFileSync('scratch/bundle.js', 'utf-8');

const dom = new JSDOM(`<!doctype html>
<html lang="en">
  <body>
    <div id="root"></div>
  </body>
</html>`, {
  url: "https://roam-smart.vercel.app/",
  runScripts: "dangerously",
  resources: "usable"
});

dom.window.console.log = function() { console.log("LOG:", ...arguments); };
dom.window.console.error = function() { console.error("ERROR:", ...arguments); };
dom.window.console.warn = function() { console.warn("WARN:", ...arguments); };

dom.window.onerror = function(msg, source, lineno, colno, error) {
  console.error("GLOBAL ERROR:", msg, error);
};

try {
  dom.window.eval(bundle);
  console.log("Evaluation complete. HTML:", dom.window.document.body.innerHTML);
} catch (err) {
  console.error("EVAL ERROR:", err);
}
