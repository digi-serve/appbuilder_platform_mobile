const fs = require("fs");
const path = require("path");
const entry = {};

// Parse workers
const workerDir = path.join(__dirname, "workers");
fs.readdirSync(workerDir).forEach(e => {
   entry[`${path.parse(e).name}-worker`] = path.join(workerDir, e);
})

module.exports = {
   entry,
};