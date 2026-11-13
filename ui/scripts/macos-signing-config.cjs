/* global Buffer */
"use strict";

const required = (environment, name) => {
  const value = environment[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`macOS production signing requires ${name}.`);
  }
  return value;
};
const matching = (environment, name, pattern) => {
  const value = required(environment, name);
  if (!pattern.test(value)) throw new Error(`Invalid ${name} format.`);
  return value;
};
const identity = (environment) => ({
  fingerprint: matching(environment, "GRAIDER_MAC_CERT_SHA1", /^[A-F0-9]{40}$/),
  team: matching(environment, "GRAIDER_APPLE_TEAM_ID", /^[A-Z0-9]{10}$/)
});
const decode = (environment, name) => {
  const value = matching(
    environment,
    name,
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/
  );
  const bytes = Buffer.from(value, "base64");
  if (bytes.length === 0 || bytes.toString("base64") !== value) {
    throw new Error(`Invalid ${name} base64.`);
  }
  return bytes;
};
const inputs = (environment) => ({
  ...identity(environment),
  certificate: decode(environment, "GRAIDER_MAC_CERT_P12_BASE64"),
  password: required(environment, "GRAIDER_MAC_CERT_PASSWORD"),
  apiKey: decode(environment, "GRAIDER_APPLE_API_KEY_P8_BASE64"),
  keyId: matching(environment, "GRAIDER_APPLE_API_KEY_ID", /^[A-Z0-9]{10}$/),
  issuer: matching(
    environment,
    "GRAIDER_APPLE_API_ISSUER",
    /^[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$/
  ),
  oauth: required(environment, "GRAIDER_GITHUB_OAUTH_CLIENT_SECRET")
});
const prepared = (environment) => {
  const result = identity(environment);
  for (const name of [
    "CSC_KEYCHAIN",
    "APPLE_API_KEY",
    "APPLE_API_KEY_ID",
    "APPLE_API_ISSUER",
    "GRAIDER_GITHUB_OAUTH_CLIENT_SECRET"
  ]) {
    required(environment, name);
  }
  return result;
};

module.exports = { inputs, prepared, identity };
