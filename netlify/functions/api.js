// Consume tsc output so Nest's decorator metadata survives bundling.
exports.handler = require("../../apps/api/dist/serverless.js").handler;
